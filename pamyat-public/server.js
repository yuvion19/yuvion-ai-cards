import express from "express";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-before-production";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false } })
  : null;

const memory = {
  events: [],
  comments: [],
  reports: [],
  claims: [],
  candles: new Map()
};

const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const clean = (v, n = 500) => String(v ?? "").trim().slice(0, n);
const norm = (v) => clean(v, 200).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

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
  return req.headers["x-admin-token"] === ADMIN_TOKEN;
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "admin_required" });
  next();
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memorial_events (
      id UUID PRIMARY KEY,
      full_name TEXT NOT NULL,
      death_date DATE,
      event_type TEXT NOT NULL,
      event_date DATE,
      event_time TEXT,
      city TEXT,
      place TEXT,
      cemetery_link TEXT,
      note TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'pending',
      relation_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      family_verified BOOLEAN NOT NULL DEFAULT FALSE,
      publish_day7 BOOLEAN NOT NULL DEFAULT TRUE,
      publish_day40 BOOLEAN NOT NULL DEFAULT TRUE,
      publish_year1 BOOLEAN NOT NULL DEFAULT TRUE,
      publish_annual BOOLEAN NOT NULL DEFAULT TRUE,
      derived JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitter_name TEXT,
      submitter_contact TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS memorial_events_status_idx ON memorial_events(status);
    CREATE INDEX IF NOT EXISTS memorial_events_event_date_idx ON memorial_events(event_date);
    CREATE TABLE IF NOT EXISTS memorial_comments (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL,
      author TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS memorial_reports (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS memorial_claims (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL,
      claimant_name TEXT,
      contact TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS memorial_candles (
      event_id UUID PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM memorial_events");
  if (rows[0].c === 0) {
    const demo = [
      {
        full_name: "Давид Бен-Эли (демо)",
        death_date: "2025-10-01",
        event_type: "40 дней",
        event_date: "2025-11-10",
        city: "Демо-город",
        place: "Демо-кладбище",
        note: "Демонстрационная запись. Все данные вымышлены."
      },
      {
        full_name: "Эстер Миронова (демо)",
        death_date: "2025-09-15",
        event_type: "Годовщина",
        event_date: "2026-09-15",
        city: "Демо-город",
        place: "Демо-место",
        note: "Демонстрационная запись. Все данные вымышлены."
      }
    ];
    for (const e of demo) {
      await pool.query(
        `INSERT INTO memorial_events
        (id,full_name,death_date,event_type,event_date,city,place,note,status,derived)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9)`,
        [id(), e.full_name, e.death_date, e.event_type, e.event_date, e.city, e.place, e.note, derivedDates(e.death_date)]
      );
    }
  }
}

async function dbQuery(text, params = []) {
  return pool ? pool.query(text, params) : null;
}

app.get("/health", (_req, res) => res.json({ ok: true, database: pool ? "postgres" : "memory" }));

app.get("/api/events", async (req, res) => {
  const q = norm(req.query.q || "");
  const type = clean(req.query.type || "", 80);
  const city = clean(req.query.city || "", 120);

  if (pool) {
    const clauses = ["status='approved'", "visibility='public'"];
    const params = [];
    if (q) { params.push(`%${q}%`); clauses.push(`LOWER(full_name) LIKE $${params.length}`); }
    if (type) { params.push(type); clauses.push(`event_type = $${params.length}`); }
    if (city) { params.push(`%${city.toLowerCase()}%`); clauses.push(`LOWER(city) LIKE $${params.length}`); }
    const { rows } = await dbQuery(
      `SELECT e.*, COALESCE(c.count,0) AS candles
       FROM memorial_events e
       LEFT JOIN memorial_candles c ON c.event_id=e.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY event_date NULLS LAST, created_at DESC LIMIT 300`, params
    );
    return res.json(rows);
  }

  let rows = memory.events.filter(e => e.status === "approved" && e.visibility === "public");
  if (q) rows = rows.filter(e => norm(e.full_name).includes(q));
  if (type) rows = rows.filter(e => e.event_type === type);
  if (city) rows = rows.filter(e => norm(e.city).includes(norm(city)));
  rows = rows.map(e => ({ ...e, candles: memory.candles.get(e.id) || 0 }));
  res.json(rows);
});

app.get("/api/events/:eventId", async (req, res) => {
  const eventId = req.params.eventId;
  if (pool) {
    const { rows } = await dbQuery(
      `SELECT e.*, COALESCE(c.count,0) AS candles
       FROM memorial_events e LEFT JOIN memorial_candles c ON c.event_id=e.id
       WHERE e.id=$1 AND (e.status='approved' OR $2::boolean)`, [eventId, isAdmin(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const comments = await dbQuery("SELECT id,author,body,created_at FROM memorial_comments WHERE event_id=$1 AND status='approved' ORDER BY created_at DESC", [eventId]);
    return res.json({ ...rows[0], comments: comments.rows });
  }
  const e = memory.events.find(x => x.id === eventId && (x.status === "approved" || isAdmin(req)));
  if (!e) return res.status(404).json({ error: "not_found" });
  res.json({ ...e, candles: memory.candles.get(e.id) || 0, comments: memory.comments.filter(c => c.event_id === e.id && c.status === "approved") });
});

app.post("/api/events/check-duplicate", async (req, res) => {
  const fullName = norm(req.body.full_name);
  const deathDate = clean(req.body.death_date, 10);
  if (!fullName) return res.json([]);
  if (pool) {
    const { rows } = await dbQuery(
      `SELECT id,full_name,death_date,event_type,event_date,city
       FROM memorial_events
       WHERE LOWER(full_name)=$1 AND ($2::date IS NULL OR death_date=$2::date)
       AND status IN ('approved','pending') LIMIT 10`,
      [fullName, validDate(deathDate) ? deathDate : null]
    );
    return res.json(rows);
  }
  return res.json(memory.events.filter(e => norm(e.full_name) === fullName && (!validDate(deathDate) || e.death_date === deathDate)).slice(0,10));
});

app.post("/api/events", async (req, res) => {
  const body = req.body || {};
  const fullName = clean(body.full_name, 180);
  const deathDate = clean(body.death_date, 10);
  const eventType = clean(body.event_type || "Памятная дата", 80);
  const eventDate = clean(body.event_date || "", 10);
  if (!fullName) return res.status(400).json({ error: "full_name_required" });
  if (deathDate && !validDate(deathDate)) return res.status(400).json({ error: "invalid_death_date" });
  if (eventDate && !validDate(eventDate)) return res.status(400).json({ error: "invalid_event_date" });
  if (!body.relation_confirmed) return res.status(400).json({ error: "consent_required" });

  const dupName = norm(fullName);
  if (!body.confirm_duplicate) {
    if (pool) {
      const { rows } = await dbQuery(
        `SELECT id,full_name,death_date,event_type,event_date FROM memorial_events
         WHERE LOWER(full_name)=$1 AND ($2::date IS NULL OR death_date=$2::date)
         AND status IN ('approved','pending') LIMIT 5`,
        [dupName, validDate(deathDate) ? deathDate : null]
      );
      if (rows.length) return res.status(409).json({ error: "possible_duplicate", matches: rows });
    } else {
      const matches = memory.events.filter(e => norm(e.full_name) === dupName && (!validDate(deathDate) || e.death_date === deathDate)).slice(0,5);
      if (matches.length) return res.status(409).json({ error: "possible_duplicate", matches });
    }
  }

  const event = {
    id: id(),
    full_name: fullName,
    death_date: validDate(deathDate) ? deathDate : null,
    event_type: eventType,
    event_date: validDate(eventDate) ? eventDate : null,
    event_time: clean(body.event_time, 20) || null,
    city: clean(body.city, 120) || null,
    place: clean(body.place, 180) || null,
    cemetery_link: clean(body.cemetery_link, 800) || null,
    note: clean(body.note, 1500) || null,
    visibility: ["public","link","invited"].includes(body.visibility) ? body.visibility : "public",
    status: "pending",
    relation_confirmed: true,
    publish_day7: body.publish_day7 !== false,
    publish_day40: body.publish_day40 !== false,
    publish_year1: body.publish_year1 !== false,
    publish_annual: body.publish_annual !== false,
    derived: derivedDates(deathDate),
    submitter_name: clean(body.submitter_name, 120) || null,
    submitter_contact: clean(body.submitter_contact, 180) || null,
    created_at: nowIso()
  };

  if (pool) {
    await dbQuery(
      `INSERT INTO memorial_events
      (id,full_name,death_date,event_type,event_date,event_time,city,place,cemetery_link,note,visibility,status,relation_confirmed,publish_day7,publish_day40,publish_year1,publish_annual,derived,submitter_name,submitter_contact)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',TRUE,$12,$13,$14,$15,$16,$17,$18)`,
      [event.id,event.full_name,event.death_date,event.event_type,event.event_date,event.event_time,event.city,event.place,event.cemetery_link,event.note,event.visibility,event.publish_day7,event.publish_day40,event.publish_year1,event.publish_annual,event.derived,event.submitter_name,event.submitter_contact]
    );
  } else {
    memory.events.push(event);
  }
  res.status(201).json({ ok: true, id: event.id, status: "pending", derived: event.derived });
});

app.post("/api/events/:eventId/candle", async (req, res) => {
  const eventId = req.params.eventId;
  if (pool) {
    const { rows } = await dbQuery(
      `INSERT INTO memorial_candles(event_id,count) VALUES($1,1)
       ON CONFLICT(event_id) DO UPDATE SET count=memorial_candles.count+1, updated_at=NOW()
       RETURNING count`, [eventId]
    );
    return res.json({ count: rows[0].count });
  }
  const count = (memory.candles.get(eventId) || 0) + 1;
  memory.candles.set(eventId, count);
  res.json({ count });
});

app.post("/api/events/:eventId/comments", async (req, res) => {
  const body = clean(req.body.body, 1000);
  if (!body) return res.status(400).json({ error: "body_required" });
  const item = { id:id(), event_id:req.params.eventId, author:clean(req.body.author,100) || "Гость", body, status:"pending", created_at:nowIso() };
  if (pool) await dbQuery("INSERT INTO memorial_comments(id,event_id,author,body,status) VALUES($1,$2,$3,$4,'pending')", [item.id,item.event_id,item.author,item.body]);
  else memory.comments.push(item);
  res.status(201).json({ ok:true, status:"pending" });
});

app.post("/api/events/:eventId/report", async (req, res) => {
  const reason = clean(req.body.reason, 120);
  if (!reason) return res.status(400).json({ error:"reason_required" });
  const item = { id:id(), event_id:req.params.eventId, reason, details:clean(req.body.details,1000), status:"open", created_at:nowIso() };
  if (pool) await dbQuery("INSERT INTO memorial_reports(id,event_id,reason,details,status) VALUES($1,$2,$3,$4,'open')", [item.id,item.event_id,item.reason,item.details]);
  else memory.reports.push(item);
  res.status(201).json({ ok:true });
});

app.post("/api/events/:eventId/relative-claim", async (req, res) => {
  const item = { id:id(), event_id:req.params.eventId, claimant_name:clean(req.body.claimant_name,120), contact:clean(req.body.contact,180), note:clean(req.body.note,700), status:"pending", created_at:nowIso() };
  if (!item.claimant_name) return res.status(400).json({ error:"claimant_name_required" });
  if (pool) await dbQuery("INSERT INTO memorial_claims(id,event_id,claimant_name,contact,note,status) VALUES($1,$2,$3,$4,$5,'pending')", [item.id,item.event_id,item.claimant_name,item.contact,item.note]);
  else memory.claims.push(item);
  res.status(201).json({ ok:true, status:"pending" });
});

app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
  if (pool) {
    const [events,comments,reports,claims] = await Promise.all([
      dbQuery("SELECT * FROM memorial_events WHERE status='pending' ORDER BY created_at ASC"),
      dbQuery("SELECT * FROM memorial_comments WHERE status='pending' ORDER BY created_at ASC"),
      dbQuery("SELECT * FROM memorial_reports WHERE status='open' ORDER BY created_at ASC"),
      dbQuery("SELECT * FROM memorial_claims WHERE status='pending' ORDER BY created_at ASC")
    ]);
    return res.json({ events:events.rows, comments:comments.rows, reports:reports.rows, claims:claims.rows });
  }
  res.json({
    events: memory.events.filter(x=>x.status==="pending"),
    comments: memory.comments.filter(x=>x.status==="pending"),
    reports: memory.reports.filter(x=>x.status==="open"),
    claims: memory.claims.filter(x=>x.status==="pending")
  });
});

app.post("/api/admin/events/:eventId/:action", requireAdmin, async (req, res) => {
  const action = req.params.action;
  const allowed = { approve:"approved", reject:"rejected", hide:"hidden" };
  if (!allowed[action]) return res.status(400).json({ error:"bad_action" });
  if (pool) await dbQuery("UPDATE memorial_events SET status=$1, updated_at=NOW() WHERE id=$2", [allowed[action],req.params.eventId]);
  else {
    const e = memory.events.find(x=>x.id===req.params.eventId);
    if (e) e.status = allowed[action];
  }
  res.json({ ok:true, status:allowed[action] });
});

app.post("/api/admin/comments/:commentId/approve", requireAdmin, async (req,res)=>{
  if (pool) await dbQuery("UPDATE memorial_comments SET status='approved' WHERE id=$1",[req.params.commentId]);
  else {
    const c=memory.comments.find(x=>x.id===req.params.commentId); if(c) c.status="approved";
  }
  res.json({ok:true});
});

app.post("/api/admin/claims/:claimId/approve", requireAdmin, async (req,res)=>{
  if (pool) {
    const { rows } = await dbQuery("UPDATE memorial_claims SET status='approved' WHERE id=$1 RETURNING event_id",[req.params.claimId]);
    if(rows[0]) await dbQuery("UPDATE memorial_events SET family_verified=TRUE WHERE id=$1",[rows[0].event_id]);
  } else {
    const c=memory.claims.find(x=>x.id===req.params.claimId);
    if(c){ c.status="approved"; const e=memory.events.find(x=>x.id===c.event_id); if(e) e.family_verified=true; }
  }
  res.json({ok:true});
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb()
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Memorial app listening on ${PORT}`)))
  .catch(err => { console.error(err); process.exit(1); });
