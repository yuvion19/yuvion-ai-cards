import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";\nconst SUPABASE_RPC_SECRET = process.env.SUPABASE_RPC_SECRET || "";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const clean = (v, n = 1000) => String(v ?? "").trim().slice(0, n);
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const id = () => crypto.randomUUID();

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addYear(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
function derivedDates(dateStr) {
  if (!validDate(dateStr)) return {};
  return { day7: addDays(dateStr, 7), day40: addDays(dateStr, 40), year1: addYear(dateStr), annual: dateStr.slice(5) };
}
function isAdmin(req) {
  return Boolean(ADMIN_TOKEN) && req.headers["x-admin-token"] === ADMIN_TOKEN;
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "admin_required" });
  next();
}
async function sb(pathname, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("supabase_not_configured");
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    authorization: "Bearer " + SUPABASE_ANON_KEY,
    "content-type": "application/json"
  };
  if (prefer) headers.prefer = prefer;
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const txt = await r.text();
  let data = null;
  if (txt) {
    try { data = JSON.parse(txt); } catch { data = txt; }
  }
  if (!r.ok) {
    const err = new Error("supabase_error");
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}
function enc(v) { return encodeURIComponent(v); }

app.get("/health", async (_req, res) => {
  try {
    const data = await sb("memorial_events?select=id&limit=1");
    res.json({ ok: true, database: "supabase", reachable: Array.isArray(data) });
  } catch (e) {
    res.status(503).json({ ok: false, database: "supabase", error: e.message });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("order", "event_date.asc.nullslast,created_at.desc");
    params.set("limit", "300");
    const q = clean(req.query.q, 180);
    const city = clean(req.query.city, 120);
    const type = clean(req.query.type, 80);
    if (q) params.set("full_name", "ilike.*" + q.replace(/[,*]/g, "") + "*");
    if (city) params.set("city", "ilike.*" + city.replace(/[,*]/g, "") + "*");
    if (type) params.set("event_type", "eq." + type);

    const events = await sb("memorial_events?" + params.toString());
    if (!events.length) return res.json([]);

    const ids = events.map(x => x.id);
    const candleParams = new URLSearchParams();
    candleParams.set("select", "event_id,count");
    candleParams.set("event_id", "in.(" + ids.join(",") + ")");
    const candles = await sb("memorial_candles?" + candleParams.toString());
    const counts = Object.fromEntries(candles.map(x => [x.event_id, x.count]));
    res.json(events.map(x => ({ ...x, candles: counts[x.id] || 0 })));
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "load_failed" });
  }
});

app.get("/api/events/:eventId", async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const rows = await sb("memorial_events?select=*&id=eq." + enc(eventId) + "&limit=1");
    if (!rows[0]) return res.status(404).json({ error: "not_found" });

    const [comments, candles] = await Promise.all([
      sb("memorial_comments?select=id,author,body,created_at&event_id=eq." + enc(eventId) + "&order=created_at.desc"),
      sb("memorial_candles?select=count&event_id=eq." + enc(eventId) + "&limit=1")
    ]);
    res.json({ ...rows[0], candles: candles[0]?.count || 0, comments });
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "load_failed" });
  }
});

app.post("/api/events/check-duplicate", async (req, res) => {
  try {
    const fullName = clean(req.body?.full_name, 180);
    const deathDate = clean(req.body?.death_date, 10);
    if (!fullName) return res.json([]);
    const data = await sb("rpc/memorial_duplicate_candidates", {
      method: "POST",
      body: { p_full_name: fullName, p_death_date: validDate(deathDate) ? deathDate : null }
    });
    res.json(data || []);
  } catch (e) {
    console.error(e.data || e);
    res.json([]);
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const b = req.body || {};
    const fullName = clean(b.full_name, 180);
    const deathDate = clean(b.death_date, 10);
    const eventType = clean(b.event_type || "Памятная дата", 80);
    const eventDate = clean(b.event_date, 10);

    if (!fullName) return res.status(400).json({ error: "full_name_required" });
    if (!b.relation_confirmed) return res.status(400).json({ error: "consent_required" });
    if (deathDate && !validDate(deathDate)) return res.status(400).json({ error: "invalid_death_date" });
    if (eventDate && !validDate(eventDate)) return res.status(400).json({ error: "invalid_event_date" });

    const dup = await sb("rpc/memorial_duplicate_candidates", {
      method: "POST",
      body: { p_full_name: fullName, p_death_date: validDate(deathDate) ? deathDate : null }
    });
    if (Array.isArray(dup) && dup.length && !b.confirm_duplicate) {
      return res.status(409).json({ error: "possible_duplicate", matches: dup.slice(0, 5) });
    }

    const base = {
      full_name: fullName,
      death_date: validDate(deathDate) ? deathDate : null,
      event_time: clean(b.event_time, 20) || null,
      city: clean(b.city, 120) || null,
      place: clean(b.place, 180) || null,
      cemetery_link: clean(b.cemetery_link, 800) || null,
      note: clean(b.note, 1500) || null,
      visibility: ["public","link","invited"].includes(b.visibility) ? b.visibility : "public",
      status: "pending",
      relation_confirmed: true,
      publish_day7: b.publish_day7 !== false,
      publish_day40: b.publish_day40 !== false,
      publish_year1: b.publish_year1 !== false,
      publish_annual: b.publish_annual !== false,
      derived: derivedDates(deathDate),
      submitter_name: clean(b.submitter_name, 120) || null,
      submitter_contact: clean(b.submitter_contact, 180) || null
    };

    const planned = [];
    if (validDate(deathDate)) {
      if (base.publish_day7) planned.push(["7 дней", addDays(deathDate, 7)]);
      if (base.publish_day40) planned.push(["40 дней", addDays(deathDate, 40)]);
      if (base.publish_year1) planned.push(["1 год", addYear(deathDate)]);
      if (base.publish_annual) planned.push(["Годовщина", addYear(deathDate)]);
    }
    if (eventType && validDate(eventDate)) planned.push([eventType, eventDate]);
    if (!planned.length) return res.status(400).json({ error: "no_dates" });

    const rows = planned.map(([type, date]) => ({ id: id(), ...base, event_type: type, event_date: date }));
    const created = await sb("memorial_events", { method: "POST", body: rows, prefer: "return=representation" });
    res.status(201).json({ ok: true, ids: created.map(x => x.id), created: created.length, status: "pending", derived: base.derived });
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "submit_failed" });
  }
});

app.post("/api/events/:eventId/candle", async (req, res) => {
  try {
    const count = await sb("rpc/memorial_light_candle", { method: "POST", body: { p_event_id: req.params.eventId } });
    res.json({ count });
  } catch (e) {
    console.error(e.data || e);
    res.status(400).json({ error: "candle_failed" });
  }
});

app.post("/api/events/:eventId/comments", async (req, res) => {
  try {
    const body = clean(req.body?.body, 1000);
    if (!body) return res.status(400).json({ error: "body_required" });
    await sb("memorial_comments", {
      method: "POST",
      body: { id: id(), event_id: req.params.eventId, author: clean(req.body?.author, 100) || "Гость", body, status: "pending" },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true, status: "pending" });
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "comment_failed" });
  }
});

app.post("/api/events/:eventId/report", async (req, res) => {
  try {
    const reason = clean(req.body?.reason, 120);
    if (!reason) return res.status(400).json({ error: "reason_required" });
    await sb("memorial_reports", {
      method: "POST",
      body: { id: id(), event_id: req.params.eventId, reason, details: clean(req.body?.details, 1000), status: "open" },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "report_failed" });
  }
});

app.post("/api/events/:eventId/relative-claim", async (req, res) => {
  try {
    const claimantName = clean(req.body?.claimant_name, 120);
    if (!claimantName) return res.status(400).json({ error: "claimant_name_required" });
    await sb("memorial_claims", {
      method: "POST",
      body: { id: id(), event_id: req.params.eventId, claimant_name: claimantName, contact: clean(req.body?.contact, 180), note: clean(req.body?.note, 700), status: "pending" },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true, status: "pending" });
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "claim_failed" });
  }
});

app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_queue", { method: "POST", body: { p_token: SUPABASE_RPC_SECRET } });
    res.json(data);
  } catch (e) {
    console.error(e.data || e);
    res.status(500).json({ error: "admin_failed" });
  }
});

app.post("/api/admin/events/:eventId/:action", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_event_action", {
      method: "POST",
      body: { p_token: SUPABASE_RPC_SECRET, p_event_id: req.params.eventId, p_action: req.params.action }
    });
    res.json(data);
  } catch (e) {
    console.error(e.data || e);
    res.status(400).json({ error: "admin_failed" });
  }
});

app.post("/api/admin/comments/:commentId/approve", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_comment_approve", {
      method: "POST",
      body: { p_token: SUPABASE_RPC_SECRET, p_comment_id: req.params.commentId }
    });
    res.json(data);
  } catch (e) {
    console.error(e.data || e);
    res.status(400).json({ error: "admin_failed" });
  }
});

app.post("/api/admin/claims/:claimId/approve", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_claim_approve", {
      method: "POST",
      body: { p_token: SUPABASE_RPC_SECRET, p_claim_id: req.params.claimId }
    });
    res.json(data);
  } catch (e) {
    console.error(e.data || e);
    res.status(400).json({ error: "admin_failed" });
  }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log("Memorial app listening on " + PORT + " with Supabase persistence");
});
