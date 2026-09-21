import express from "express";
import OpenAI, { toFile } from "openai";
import archiver from "archiver";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  etag: true
}));

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_CARD_BATCHES_PER_WINDOW = 5;
const MAX_REGENERATIONS_PER_WINDOW = 12;

const requestsByIp = new Map();
const cardRequestsByIp = new Map();
const regenRequestsByIp = new Map();
const sessions = new Map();

let imagesEnabled = true;

const stats = {
  startedAt: new Date().toISOString(),
  analyses: 0,
  analysisErrors: 0,
  fastMode: 0,
  fullMode: 0,
  cardBatches: 0,
  singleRegenerations: 0,
  imagesGenerated: 0,
  imageErrors: 0,
  creditsExhausted: 0,
  rateLimitErrors: 0,
  textInputTokens: 0,
  textOutputTokens: 0,
  estimatedTextUsd: 0,
  estimatedImageOutputUsd: 0,
  recentErrors: []
};

const TEXT_INPUT_USD_PER_M = Number(process.env.TEXT_INPUT_USD_PER_M || 0.20);
const TEXT_OUTPUT_USD_PER_M = Number(process.env.TEXT_OUTPUT_USD_PER_M || 1.20);
const IMAGE_OUTPUT_ESTIMATE_USD = Number(process.env.IMAGE_OUTPUT_ESTIMATE_USD || 0.041);

function limitMap(map, ip, max) {
  const now = Date.now();
  const current = map.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    map.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > max;
}

function rollbackLimit(map, ip) {
  const current = map.get(ip);
  if (current) current.count = Math.max(0, current.count - 1);
}

function recordError(type, error) {
  const entry = {
    at: new Date().toISOString(),
    type,
    status: error?.status ?? null,
    code: error?.code ?? null,
    message: String(error?.message || error || "Unknown error").slice(0, 240)
  };
  stats.recentErrors.unshift(entry);
  stats.recentErrors = stats.recentErrors.slice(0, 20);
  if (error?.code === "credit_balance_exhausted") stats.creditsExhausted += 1;
  if (error?.status === 429) stats.rateLimitErrors += 1;
}

function recordTextUsage(response) {
  const usage = response?.usage || {};
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  stats.textInputTokens += input;
  stats.textOutputTokens += output;
  stats.estimatedTextUsd += (input / 1_000_000) * TEXT_INPUT_USD_PER_M;
  stats.estimatedTextUsd += (output / 1_000_000) * TEXT_OUTPUT_USD_PER_M;
}

function sessionId(req) {
  const raw = String(req.get("x-yuvion-session") || "").trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(raw) ? raw : null;
}

function trackSession(req, action) {
  const id = sessionId(req);
  if (!id) return;
  const current = sessions.get(id) || {
    analyses: 0,
    batches: 0,
    regenerations: 0,
    lastSeen: null
  };
  if (action === "analysis") current.analyses += 1;
  if (action === "batch") current.batches += 1;
  if (action === "regen") current.regenerations += 1;
  current.lastSeen = new Date().toISOString();
  sessions.set(id, current);
  if (sessions.size > 500) {
    const oldest = [...sessions.entries()]
      .sort((a, b) => String(a[1].lastSeen).localeCompare(String(b[1].lastSeen)))
      .slice(0, 100);
    for (const [key] of oldest) sessions.delete(key);
  }
}

function maskSession(id) {
  return id.length > 10 ? id.slice(0, 4) + "…" + id.slice(-4) : id;
}

function decodedImageSize(base64) {
  const cleaned = String(base64 || "").replace(/\s/g, "");
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compact(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function wrapWords(value, maxChars = 28, maxLines = 3) {
  const words = compact(value, 500).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length <= maxChars || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const original = words.join(" ");
  if (lines.join(" ").length < original.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:!?]?$/, "") + "…";
  }
  return lines;
}

function textLines(lines, { x, y, size, lineHeight, weight = 600, fill = "#1D1B1C", anchor = "start" }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map(escapeXml).map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`).join("")}</text>`;
}

function bulletGroups(items, { x, y, maxChars = 25, maxItems = 5, size = 30, lineHeight = 40, gap = 24, accent = "#F03E4A", text = "#33282A" }) {
  let cursorY = y;
  let out = "";
  for (const item of items.filter(Boolean).slice(0, maxItems)) {
    const lines = wrapWords(item, maxChars, 2);
    out += `<circle cx="${x}" cy="${cursorY - 9}" r="8" fill="${accent}"/>`;
    out += textLines(lines, { x: x + 28, y: cursorY, size, lineHeight, weight: 650, fill: text });
    cursorY += lines.length * lineHeight + gap;
  }
  return out;
}

const productCardSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "seoTitle",
    "category",
    "shortDescription",
    "fullDescription",
    "characteristics",
    "keywords",
    "benefits",
    "usage",
    "needsClarification",
    "confidence",
    "photoQuality"
  ],
  properties: {
    seoTitle: { type: "string" },
    category: { type: "string" },
    shortDescription: { type: "string" },
    fullDescription: { type: "string" },
    characteristics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value"],
        properties: {
          name: { type: "string" },
          value: { type: "string" }
        }
      }
    },
    keywords: { type: "array", items: { type: "string" } },
    benefits: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" }
    },
    usage: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    needsClarification: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["Высокая", "Средняя", "Низкая"] },
    photoQuality: {
      type: "object",
      additionalProperties: false,
      required: ["score", "issues"],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        issues: { type: "array", items: { type: "string" } }
      }
    }
  }
};

const instructions = `
Ты создаешь карточки товаров для каталога Yuvion по ОДНОЙ фотографии товара.

Главное правило: НЕ ВЫДУМЫВАЙ данные.
Нельзя утверждать размеры, вес, материал, состав, мощность, емкость, бренд, модель, страну производства, комплектность, сертификацию, цветовой код, возрастное назначение и любые другие параметры, если они не читаются на фотографии или не определяются визуально с высокой уверенностью.

Если параметр нельзя достоверно определить по фото, не добавляй его в characteristics. Вместо этого добавь понятный пункт в needsClarification.
benefits должны содержать только фактически подтвержденные или безопасно описательные преимущества, вытекающие из видимого товара.
usage должны содержать только очевидные сценарии применения, которые напрямую следуют из типа товара.
Если сам тип товара неясен, выбери максимально общую категорию и укажи низкую уверенность.
Оцени качество исходного фото в photoQuality: score 0-100 и issues с проблемами вроде обрезанного товара, нескольких товаров в кадре, размытия, бликов, слишком темного фона, нечитаемой маркировки.
Не упоминай Ozon, Wildberries или другие маркетплейсы.
Пиши на русском языке, в деловом e-commerce стиле.
SEO-заголовок должен быть естественным, без спама, капслока и неподтвержденных брендов.
Полное описание должно продавать через видимые свойства и сценарии использования, но не придумывать технические факты.\nЕсли пользователь передал подтвержденные данные о товаре (название, бренд, артикул, размеры, материал, цена), используй их как достоверные факты. Не пытайся опровергать, угадывать заново или переносить их в needsClarification.
`;

const styleProfiles = {
  minimal: {
    name: "Минимализм",
    accent: "#F03E4A",
    accent2: "#D62F3B",
    text: "#1D1B1C",
    panel: "#FFFFFF",
    scene: "Минималистичная предметная съемка, белый или очень светлый нейтральный фон, мягкая тень, много воздуха, современный каталог."
  },
  premium: {
    name: "Премиум",
    accent: "#B22E46",
    accent2: "#7E1E31",
    text: "#24191C",
    panel: "#FFF9F9",
    scene: "Премиальная студийная предметная съемка, мягкий бордово-розовый градиент, аккуратная подставка, дорогой свет, без лишних объектов."
  },
  bright: {
    name: "Яркий",
    accent: "#F03E4A",
    accent2: "#FF7043",
    text: "#222222",
    panel: "#FFFFFF",
    scene: "Яркая современная e-commerce съемка, светлый фон с энергичными красно-коралловыми геометрическими акцентами, товар остается главным."
  },
  tech: {
    name: "Техника",
    accent: "#D9283A",
    accent2: "#30343B",
    text: "#15171A",
    panel: "#F9FAFB",
    scene: "Современная технологичная предметная съемка, холодный светло-серый фон, четкий контурный свет, лаконичная геометрия."
  },
  home: {
    name: "Дом и интерьер",
    accent: "#C54A55",
    accent2: "#87675D",
    text: "#2E2523",
    panel: "#FFFDFB",
    scene: "Светлая уютная предметная съемка в нейтральных теплых оттенках, натуральная поверхность, мягкий дневной свет, без людей."
  }
};


function normalizeExtraData(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    name: compact(data.name || "", 140),
    brand: compact(data.brand || "", 100),
    sku: compact(data.sku || "", 100),
    size: compact(data.size || "", 120),
    material: compact(data.material || "", 160),
    price: compact(data.price || "", 80)
  };
}

function confirmedDataText(raw) {
  const data = normalizeExtraData(raw);
  const rows = [];
  if (data.name) rows.push("Название товара: " + data.name);
  if (data.brand) rows.push("Бренд: " + data.brand);
  if (data.sku) rows.push("Артикул: " + data.sku);
  if (data.size) rows.push("Размеры: " + data.size);
  if (data.material) rows.push("Материал: " + data.material);
  if (data.price) rows.push("Цена: " + data.price);
  if (!rows.length) return "Дополнительные подтвержденные данные продавца не предоставлены.";
  return [
    "ПОДТВЕРЖДЕННЫЕ ДАННЫЕ ОТ ПРОДАВЦА:",
    ...rows,
    "",
    "Эти значения считай достоверными и используй точно как передано.",
    "Не пытайся переопределять их по фотографии и не переноси их в needsClarification.",
    "Если визуально что-то кажется иным, для текстовой карточки приоритет имеют данные продавца."
  ].join("\\n");
}

function mergeConfirmedData(cardRaw, extraRaw) {
  const card = normalizeCard(cardRaw);
  const extra = normalizeExtraData(extraRaw);
  const confirmed = [
    ["Бренд", extra.brand],
    ["Артикул", extra.sku],
    ["Размеры", extra.size],
    ["Материал", extra.material],
    ["Цена", extra.price]
  ].filter((pair) => pair[1]);

  const byName = new Map(card.characteristics.map((item) => [item.name.toLocaleLowerCase("ru"), item]));
  for (const pair of confirmed) {
    const name = pair[0];
    const value = pair[1];
    byName.set(name.toLocaleLowerCase("ru"), { name, value });
  }
  card.characteristics = [...byName.values()].slice(0, 12);

  if (extra.name) {
    const titleLower = card.seoTitle.toLocaleLowerCase("ru");
    if (!titleLower.includes(extra.name.toLocaleLowerCase("ru"))) {
      card.seoTitle = compact(extra.name + (extra.brand ? " " + extra.brand : "") + (card.seoTitle ? " — " + card.seoTitle : ""), 180);
    }
  } else if (extra.brand && !card.seoTitle.toLocaleLowerCase("ru").includes(extra.brand.toLocaleLowerCase("ru"))) {
    card.seoTitle = compact(extra.brand + " " + card.seoTitle, 180);
  }

  const blocked = [];
  if (extra.brand) blocked.push("бренд");
  if (extra.sku) blocked.push("артикул", "модель");
  if (extra.size) blocked.push("размер", "габарит");
  if (extra.material) blocked.push("материал", "состав");
  if (extra.price) blocked.push("цен");
  card.needsClarification = card.needsClarification.filter((item) => {
    const lower = item.toLocaleLowerCase("ru");
    return !blocked.some((word) => lower.includes(word));
  });

  return { ...card, confirmedData: extra };
}

function normalizeCard(raw) {
  const card = raw && typeof raw === "object" ? raw : {};
  return {
    seoTitle: compact(card.seoTitle || card.category || "Товар", 180),
    category: compact(card.category || "Товар", 80),
    shortDescription: compact(card.shortDescription || "", 500),
    fullDescription: compact(card.fullDescription || "", 2000),
    characteristics: Array.isArray(card.characteristics)
      ? card.characteristics
          .filter((x) => x && x.name && x.value)
          .slice(0, 12)
          .map((x) => ({ name: compact(x.name, 60), value: compact(x.value, 100) }))
      : [],
    keywords: Array.isArray(card.keywords) ? card.keywords.filter(Boolean).slice(0, 30).map((x) => compact(x, 60)) : [],
    benefits: Array.isArray(card.benefits) ? card.benefits.filter(Boolean).slice(0, 5).map((x) => compact(x, 80)) : [],
    usage: Array.isArray(card.usage) ? card.usage.filter(Boolean).slice(0, 4).map((x) => compact(x, 100)) : [],
    needsClarification: Array.isArray(card.needsClarification) ? card.needsClarification.filter(Boolean).slice(0, 20).map((x) => compact(x, 120)) : [],
    confidence: ["Высокая", "Средняя", "Низкая"].includes(card.confidence) ? card.confidence : "Средняя",
    photoQuality: card.photoQuality && typeof card.photoQuality === "object"
      ? {
          score: Math.max(0, Math.min(100, Number(card.photoQuality.score) || 0)),
          issues: Array.isArray(card.photoQuality.issues) ? card.photoQuality.issues.filter(Boolean).slice(0, 10).map((x) => compact(x, 120)) : []
        }
      : { score: 0, issues: [] }
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "yuvion-ai-cards",
    version: "4.1.0",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    imagesEnabled
  });
});

app.post("/api/analyze", async (req, res) => {
  const ip = req.ip || "unknown";
  try {
    if (limitMap(requestsByIp, ip, MAX_REQUESTS_PER_WINDOW)) {
      stats.rateLimitErrors += 1;
      return res.status(429).json({ error: "Слишком много запросов. Попробуйте немного позже." });
    }

    const { image, mimeType, mode = "full", extraData = {} } = req.body ?? {};
    if (typeof image !== "string" || typeof mimeType !== "string") {
      return res.status(400).json({ error: "Изображение не передано." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    }
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI пока не настроен." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Проанализируй фотографию и подготовь структурированную карточку товара для каталога Yuvion.\n\n" + confirmedDataText(extraData) },
          { type: "input_image", image_url: `data:${mimeType};base64,${image}`, detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "yuvion_product_card",
          strict: true,
          schema: productCardSchema
        }
      },
      max_output_tokens: 2600
    });

    recordTextUsage(response);
    const raw = response.output_text;
    if (!raw) return res.status(502).json({ error: "AI не вернул результат." });

    let parsed;
    try {
      parsed = mergeConfirmedData(JSON.parse(raw), extraData);
    } catch {
      return res.status(502).json({ error: "Не удалось разобрать ответ AI." });
    }

    stats.analyses += 1;
    if (mode === "fast") stats.fastMode += 1;
    else stats.fullMode += 1;
    trackSession(req, "analysis");

    return res.json(parsed);
  } catch (error) {
    stats.analysisErrors += 1;
    recordError("analysis", error);
    console.error("AI analyze error:", { message: error?.message, status: error?.status, code: error?.code });
    if (error?.code === "credit_balance_exhausted") return res.status(402).json({ error: "На балансе OpenAI API закончились кредиты." });
    if (error?.status === 401) return res.status(503).json({ error: "AI-ключ недействителен." });
    if (error?.status === 429) return res.status(429).json({ error: "Достигнут лимит OpenAI API. Попробуйте немного позже." });
    return res.status(500).json({ error: "Не удалось создать карточку. Попробуйте ещё раз." });
  }
});

const cardScenes = [
  "Товар полностью виден и находится в верхних двух третях кадра. В нижней трети оставь спокойное чистое пространство под будущий заголовок.",
  "Товар преимущественно справа. Слева оставь большое чистое пространство под будущий список преимуществ.",
  "Товар расположен в верхней половине. Нижняя половина спокойная и свободная под будущие характеристики.",
  "Товар полностью виден, композиция естественная. Нижняя часть кадра остается свободной под будущие сценарии использования."
];

async function generateScene(client, sourceBuffer, mimeType, scenePrompt, index, styleKey) {
  const style = styleProfiles[styleKey] || styleProfiles.minimal;
  const prompt =
    "Создай профессиональное товарное изображение по загруженному референсу. " +
    "КРИТИЧЕСКИ ВАЖНО: это должен остаться ТОТ ЖЕ товар. Сохрани форму, пропорции, цвет, упаковку, видимые детали, логотипы и существующие надписи настолько точно, насколько возможно. " +
    "Не меняй дизайн товара, не придумывай бренд, текст, технические характеристики, дополнительные детали, комплектность или аксессуары. " +
    "Не добавляй текстовые плашки, цены, водяные знаки, логотипы маркетплейсов или новые надписи на товар. " +
    "Товар не обрезать. Оставляй заметный безопасный отступ от краев. " +
    style.scene + " " + scenePrompt;

  const candidateModels = [
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    "gpt-image-1"
  ].filter((value, idx, arr) => arr.indexOf(value) === idx);

  let lastError;
  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const sourceFile = await toFile(
          sourceBuffer,
          "product-" + index + "." + extensionForMime(mimeType),
          { type: mimeType }
        );
        const result = await client.images.edit({
          model,
          image: sourceFile,
          prompt,
          size: "1024x1536",
          quality: "medium",
          output_format: "png",
          moderation: "auto"
        });
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error("Image API returned no image data");
        return Buffer.from(b64, "base64");
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        if (error?.status === 429 && error?.code !== "credit_balance_exhausted" && attempt === 0) {
          await sleep(3500);
          continue;
        }
        if ((error?.status === 404 || error?.status === 400) && /model|not found|does not exist/i.test(message)) break;
        throw error;
      }
    }
  }
  throw lastError;
}

function overlayForCard(index, cardRaw, styleKey) {
  const card = normalizeCard(cardRaw);
  const style = styleProfiles[styleKey] || styleProfiles.minimal;
  const title = compact(card.seoTitle || card.category || "Товар", 120);
  const category = compact(card.category || "Товар", 50);
  const characteristics = card.characteristics || [];

  if (index === 0) {
    const titleLines = wrapWords(title, 26, 3);
    const quick = characteristics.slice(0, 3).map((item) => `${compact(item.name, 22)}: ${compact(item.value, 34)}`);
    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="46" y="48" rx="22" ry="22" width="192" height="54" fill="${style.accent}"/>
        <text x="142" y="84" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">YUVION</text>
        <rect x="38" y="805" rx="34" ry="34" width="824" height="350" fill="${style.panel}" fill-opacity="0.96"/>
        <text x="78" y="860" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="${style.accent2}">${escapeXml(category.toUpperCase())}</text>
        ${textLines(titleLines, { x: 78, y: 920, size: 46, lineHeight: 56, weight: 800, fill: style.text })}
        ${quick.length ? bulletGroups(quick, { x: 88, y: 1080, maxChars: 36, maxItems: 3, size: 22, lineHeight: 28, gap: 8, accent: style.accent, text: style.text }) : ""}
      </svg>`;
  }

  if (index === 1) {
    const benefits = card.benefits.length ? card.benefits : characteristics.slice(0, 4).map((x) => `${x.name}: ${x.value}`);
    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="30" y="70" rx="34" ry="34" width="500" height="1050" fill="${style.panel}" fill-opacity="0.95"/>
        <text x="74" y="145" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="800" fill="${style.accent}">YUVION</text>
        <text x="74" y="220" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="850" fill="${style.text}">Преимущества</text>
        ${bulletGroups(benefits, { x: 86, y: 320, maxChars: 24, maxItems: 5, size: 31, lineHeight: 42, gap: 30, accent: style.accent, text: style.text })}
      </svg>`;
  }

  if (index === 2) {
    const specs = characteristics.slice(0, 5);
    let y = 830;
    let rows = "";
    if (specs.length) {
      for (const item of specs) {
        rows += `
          <text x="78" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" font-weight="700" fill="${style.accent2}">${escapeXml(compact(item.name, 30))}</text>
          <text x="78" y="${y + 34}" font-family="DejaVu Sans, Arial, sans-serif" font-size="29" font-weight="750" fill="${style.text}">${escapeXml(compact(item.value, 43))}</text>
        `;
        y += 68;
      }
    } else {
      rows = textLines(["Подробные характеристики", "уточняйте у продавца"], { x: 78, y: 850, size: 34, lineHeight: 46, weight: 700, fill: style.text });
    }
    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="38" y="650" rx="34" ry="34" width="824" height="510" fill="${style.panel}" fill-opacity="0.96"/>
        <text x="78" y="720" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="${style.accent}">YUVION</text>
        <text x="78" y="775" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="850" fill="${style.text}">Характеристики</text>
        ${rows}
      </svg>`;
  }

  const usage = card.usage.length ? card.usage : [card.shortDescription || category];
  const desc = wrapWords(card.shortDescription || card.fullDescription || category, 42, 3);
  return `
    <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="1200" fill="none"/>
      <rect x="38" y="690" rx="34" ry="34" width="824" height="470" fill="${style.panel}" fill-opacity="0.96"/>
      <text x="78" y="750" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="${style.accent}">YUVION</text>
      <text x="78" y="805" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="850" fill="${style.text}">Для чего подойдет</text>
      ${bulletGroups(usage, { x: 88, y: 880, maxChars: 42, maxItems: 3, size: 28, lineHeight: 36, gap: 16, accent: style.accent, text: style.text })}
      ${textLines(desc, { x: 78, y: 1080, size: 20, lineHeight: 28, weight: 500, fill: "#776B6E" })}
    </svg>`;
}

async function composeCard(sceneBuffer, overlaySvg) {
  const base = await sharp(sceneBuffer)
    .resize(900, 1200, {
      fit: "contain",
      background: { r: 252, g: 248, b: 248, alpha: 1 }
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return sharp(base)
    .composite([{ input: Buffer.from(overlaySvg) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function descriptionText(cardRaw) {
  const card = normalizeCard(cardRaw);
  return [
    "SEO-заголовок:",
    card.seoTitle,
    "",
    "Категория:",
    card.category,
    "",
    "Краткое описание:",
    card.shortDescription,
    "",
    "Полное описание:",
    card.fullDescription,
    "",
    "Характеристики:",
    ...card.characteristics.map((x) => `${x.name}: ${x.value}`),
    "",
    "Преимущества:",
    ...card.benefits.map((x) => "- " + x),
    "",
    "Применение:",
    ...card.usage.map((x) => "- " + x),
    "",
    "Ключевые слова:",
    card.keywords.join(", "),
    "",
    "Нужно уточнить:",
    ...(card.needsClarification.length ? card.needsClarification.map((x) => "- " + x) : ["Дополнительных уточнений нет."])
  ].join("\n");
}

function zipBuffers(entries) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const entry of entries) archive.append(entry.buffer, { name: entry.name });
    archive.finalize();
  });
}

function imageErrorResponse(req, res, error, map, type) {
  stats.imageErrors += 1;
  recordError(type, error);
  const ip = req.ip || "unknown";

  if (error?.code === "credit_balance_exhausted") {
    rollbackLimit(map, ip);
    return res.status(402).json({ error: "На балансе OpenAI API закончились кредиты. Пополните API-баланс и повторите генерацию." });
  }
  if (error?.code === "moderation_blocked") {
    rollbackLimit(map, ip);
    return res.status(400).json({ error: "Генерация остановлена проверкой безопасности. Попробуйте другую фотографию." });
  }
  if (error?.status === 401) {
    rollbackLimit(map, ip);
    return res.status(503).json({ error: "AI-ключ недействителен." });
  }
  if (error?.status === 429) {
    rollbackLimit(map, ip);
    return res.status(429).json({ error: "Достигнут лимит запросов OpenAI API. Попробуйте немного позже." });
  }
  if (error?.code === "organization_verification_required" || error?.code === "verification_required") {
    rollbackLimit(map, ip);
    return res.status(503).json({ error: "Для генерации изображений требуется подтверждение организации OpenAI API." });
  }
  return res.status(500).json({ error: "Не удалось создать изображение. Попробуйте ещё раз." });
}

app.post("/api/generate-cards", async (req, res) => {
  const ip = req.ip || "unknown";
  try {
    if (!imagesEnabled) return res.status(503).json({ error: "Генерация изображений временно отключена администратором." });
    if (limitMap(cardRequestsByIp, ip, MAX_CARD_BATCHES_PER_WINDOW)) {
      stats.rateLimitErrors += 1;
      return res.status(429).json({ error: "Лимит: не более 5 комплектов карточек в час с одного подключения." });
    }

    const { image, mimeType, card, style = "minimal" } = req.body ?? {};
    if (typeof image !== "string" || typeof mimeType !== "string" || !card || typeof card !== "object") {
      return res.status(400).json({ error: "Не хватает исходного фото или данных товара." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI для изображений пока не настроен." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sourceBuffer = Buffer.from(image, "base64");
    const normalized = normalizeCard(card);
    const styleKey = styleProfiles[style] ? style : "minimal";

    const scenes = [];
    for (let start = 0; start < 4; start += 2) {
      const pair = await Promise.all(
        cardScenes.slice(start, start + 2).map((prompt, localIndex) =>
          generateScene(client, sourceBuffer, mimeType, prompt, start + localIndex + 1, styleKey)
        )
      );
      scenes.push(...pair);
    }

    const fileNames = ["01_cover.png", "02_benefits.png", "03_specs.png", "04_usage.png"];
    const titles = ["Обложка", "Преимущества", "Характеристики", "Применение"];
    const cards = [];

    for (let index = 0; index < 4; index += 1) {
      const overlay = overlayForCard(index, normalized, styleKey);
      const buffer = await composeCard(scenes[index], overlay);
      cards.push({ filename: fileNames[index], title: titles[index], base64: buffer.toString("base64") });
    }

    stats.cardBatches += 1;
    stats.imagesGenerated += 4;
    stats.estimatedImageOutputUsd += 4 * IMAGE_OUTPUT_ESTIMATE_USD;
    trackSession(req, "batch");

    return res.json({
      cards,
      format: "900x1200",
      style: styleKey,
      description: descriptionText(normalized)
    });
  } catch (error) {
    console.error("Card generation error:", { message: error?.message, status: error?.status, code: error?.code });
    return imageErrorResponse(req, res, error, cardRequestsByIp, "batch");
  }
});

app.post("/api/regenerate-card", async (req, res) => {
  const ip = req.ip || "unknown";
  try {
    if (!imagesEnabled) return res.status(503).json({ error: "Генерация изображений временно отключена администратором." });
    if (limitMap(regenRequestsByIp, ip, MAX_REGENERATIONS_PER_WINDOW)) {
      stats.rateLimitErrors += 1;
      return res.status(429).json({ error: "Слишком много повторных генераций. Попробуйте позже." });
    }

    const { image, mimeType, card, style = "minimal", index } = req.body ?? {};
    const cardIndex = Number(index);
    if (![0, 1, 2, 3].includes(cardIndex)) return res.status(400).json({ error: "Некорректный номер карточки." });
    if (typeof image !== "string" || typeof mimeType !== "string" || !card || typeof card !== "object") {
      return res.status(400).json({ error: "Не хватает исходного фото или данных товара." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const normalized = normalizeCard(card);
    const styleKey = styleProfiles[style] ? style : "minimal";
    const sourceBuffer = Buffer.from(image, "base64");
    const scene = await generateScene(client, sourceBuffer, mimeType, cardScenes[cardIndex], cardIndex + 1, styleKey);
    const buffer = await composeCard(scene, overlayForCard(cardIndex, normalized, styleKey));
    const names = ["01_cover.png", "02_benefits.png", "03_specs.png", "04_usage.png"];
    const titles = ["Обложка", "Преимущества", "Характеристики", "Применение"];

    stats.singleRegenerations += 1;
    stats.imagesGenerated += 1;
    stats.estimatedImageOutputUsd += IMAGE_OUTPUT_ESTIMATE_USD;
    trackSession(req, "regen");

    return res.json({
      card: {
        filename: names[cardIndex],
        title: titles[cardIndex],
        base64: buffer.toString("base64")
      }
    });
  } catch (error) {
    console.error("Single card generation error:", { message: error?.message, status: error?.status, code: error?.code });
    return imageErrorResponse(req, res, error, regenRequestsByIp, "regenerate");
  }
});

app.post("/api/package", async (req, res) => {
  try {
    const { cards, card, includeDescription = false } = req.body ?? {};
    if (!Array.isArray(cards) || cards.length !== 4) {
      return res.status(400).json({ error: "Для ZIP нужны четыре готовые карточки." });
    }

    const entries = [];
    for (let i = 0; i < 4; i += 1) {
      const item = cards[i];
      if (!item || typeof item.base64 !== "string") return res.status(400).json({ error: "Одна из карточек повреждена." });
      entries.push({
        name: item.filename || ["01_cover.png", "02_benefits.png", "03_specs.png", "04_usage.png"][i],
        buffer: Buffer.from(item.base64, "base64")
      });
    }

    if (includeDescription) {
      entries.push({
        name: "description.txt",
        buffer: Buffer.from(descriptionText(card || {}), "utf8")
      });
    }

    const zip = await zipBuffers(entries);
    return res.json({
      zipBase64: zip.toString("base64"),
      zipName: includeDescription ? "yuvion-full-product-kit.zip" : "yuvion-product-cards.zip"
    });
  } catch (error) {
    recordError("package", error);
    return res.status(500).json({ error: "Не удалось собрать ZIP." });
  }
});

function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return res.status(503).json({ error: "Админ-панель не настроена." });
  const supplied = String(req.get("x-admin-password") || "");
  if (supplied !== configured) return res.status(401).json({ error: "Неверный пароль." });
  next();
}

app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const topSessions = [...sessions.entries()]
    .map(([id, value]) => ({
      session: maskSession(id),
      analyses: value.analyses,
      batches: value.batches,
      regenerations: value.regenerations,
      lastSeen: value.lastSeen,
      total: value.analyses + value.batches + value.regenerations
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  res.json({
    ...stats,
    imagesEnabled,
    estimatedTotalUsd: stats.estimatedTextUsd + stats.estimatedImageOutputUsd,
    costNote: "Оценка: текст по настроенным токен-тарифам; изображения — только приблизительная стоимость output одного medium 1024x1536, без полного учета входных image/text tokens.",
    topSessions
  });
});

app.post("/api/admin/images", requireAdmin, (req, res) => {
  imagesEnabled = Boolean(req.body?.enabled);
  res.json({ ok: true, imagesEnabled });
});

app.post("/api/admin/reset-stats", requireAdmin, (_req, res) => {
  const startedAt = new Date().toISOString();
  Object.assign(stats, {
    startedAt,
    analyses: 0,
    analysisErrors: 0,
    fastMode: 0,
    fullMode: 0,
    cardBatches: 0,
    singleRegenerations: 0,
    imagesGenerated: 0,
    imageErrors: 0,
    creditsExhausted: 0,
    rateLimitErrors: 0,
    textInputTokens: 0,
    textOutputTokens: 0,
    estimatedTextUsd: 0,
    estimatedImageOutputUsd: 0,
    recentErrors: []
  });
  sessions.clear();
  res.json({ ok: true });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Yuvion AI Cards v4.1 listening on port ${port}`);
});
