import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 10000);

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const PUBLIC_DIR = path.join(__dirname, "public", "neurohub-zero");
app.use(express.static(PUBLIC_DIR, {
  maxAge: "10m",
  etag: true,
  setHeaders(res, filePath) {
    if (path.basename(filePath) === "index.html") {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

const ipLimits = new Map();
let daily = { day: "", count: 0 };
let tokenCache = { token: "", expiresAt: 0 };

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}
function limited(ip, max = 30) {
  const now = Date.now();
  const current = ipLimits.get(ip);
  if (!current || now - current.startedAt > 60 * 60 * 1000) {
    ipLimits.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > max;
}
async function getToken() {
  const key = String(process.env.NEUROHUB_GIGACHAT_AUTH_KEY || "").trim();
  if (!key) throw Object.assign(new Error("GigaChat is not configured"), { code: "not_configured" });
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;

  const response = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: crypto.randomUUID(),
      Authorization: "Basic " + key
    },
    body: new URLSearchParams({ scope: "GIGACHAT_API_PERS" }).toString()
  });
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error("GigaChat OAuth failed"), { status: response.status, code: "oauth_failed" });
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (!data?.access_token) throw Object.assign(new Error("Missing GigaChat access token"), { code: "token_missing" });

  let expiresAt = Number(data.expires_at || 0);
  if (expiresAt && expiresAt < 1000000000000) expiresAt *= 1000;
  tokenCache = { token: String(data.access_token), expiresAt: expiresAt || Date.now() + 29 * 60 * 1000 };
  return tokenCache.token;
}
async function gigaFetch(pathname, options = {}, retry = true) {
  const token = await getToken();
  const response = await fetch("https://api.giga.chat" + pathname, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
      Authorization: "Bearer " + token
    }
  });
  if (response.status === 401 && retry) {
    tokenCache = { token: "", expiresAt: 0 };
    return gigaFetch(pathname, options, false);
  }
  return response;
}
async function freeUltraAvailable() {
  const response = await gigaFetch("/v1/models", { method: "GET" });
  const raw = await response.text();
  if (!response.ok) return false;
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  const models = (Array.isArray(data?.data) ? data.data : []).map(x => String(x?.id || ""));
  return models.includes("GigaChat-3-Ultra");
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "neurohub-zero", strictFree: true });
});

app.get("/api/neurohub/russian-ai/status", async (req, res) => {
  const configured = Boolean(String(process.env.NEUROHUB_GIGACHAT_AUTH_KEY || "").trim());
  if (!configured) return res.json({ configured: false, freeGuard: true, model: "GigaChat-3-Ultra", available: false });
  try {
    const available = await freeUltraAvailable();
    res.json({ configured: true, freeGuard: true, model: "GigaChat-3-Ultra", available });
  } catch (error) {
    res.json({ configured: true, freeGuard: true, model: "GigaChat-3-Ultra", available: false, error: error?.code || "unavailable" });
  }
});

app.post("/api/neurohub/gigachat", async (req, res) => {
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  if (limited(ip, 30)) {
    return res.status(429).json({ error: "Слишком много запросов. Используйте локальный ruGPT и повторите позже.", code: "free_rate_limit" });
  }

  const day = dayKey();
  if (daily.day !== day) daily = { day, count: 0 };
  if (daily.count >= 700) {
    return res.status(429).json({ error: "Дневной Free Guard достигнут. Используйте локальные модели.", code: "free_daily_guard" });
  }

  const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = incoming
    .filter(x => x && ["system", "user", "assistant"].includes(x.role))
    .slice(-14)
    .map(x => ({ role: x.role, content: String(x.content || "").slice(0, 12000) }));
  if (!messages.length || !messages.some(x => x.role === "user")) {
    return res.status(400).json({ error: "Сообщение пользователя не передано.", code: "invalid_messages" });
  }
  if (messages.reduce((n, x) => n + x.content.length, 0) > 24000) {
    return res.status(413).json({ error: "Контекст слишком большой для облачного бесплатного режима.", code: "context_too_large" });
  }

  try {
    if (!(await freeUltraAvailable())) {
      return res.status(403).json({ error: "GigaChat-3-Ultra Freemium сейчас недоступен. Платный fallback отключён.", code: "free_model_unavailable", freeGuard: true });
    }

    const response = await gigaFetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "GigaChat-3-Ultra",
        messages,
        temperature: 0.55,
        max_tokens: 700,
        stream: false
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      return res.status(response.status >= 400 && response.status < 600 ? response.status : 502).json({
        error: response.status === 429 ? "Бесплатный лимит GigaChat временно недоступен." : "GigaChat временно недоступен.",
        code: "gigachat_request_failed",
        freeGuard: true
      });
    }
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const answer = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!answer) return res.status(502).json({ error: "GigaChat вернул пустой ответ.", code: "empty_answer" });
    daily.count += 1;
    res.json({ answer, model: "GigaChat-3-Ultra", freeGuard: true, cloud: true });
  } catch (error) {
    res.status(502).json({ error: "GigaChat недоступен. Локальные модели продолжают работать.", code: error?.code || "gigachat_unavailable" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(port, "0.0.0.0", async () => {
  console.log(`NeuroHub Zero listening on port ${port}`);
  try {
    const available = await freeUltraAvailable();
    console.log("NeuroHub GigaChat Free Guard:", { model: "GigaChat-3-Ultra", available });
  } catch (error) {
    console.warn("NeuroHub GigaChat Free Guard check failed:", { code: error?.code || "unknown", status: error?.status || null });
  }
});
