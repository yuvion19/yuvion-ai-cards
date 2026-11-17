"""Minimal UVMALL ticket workflow.

Uses SQLite on a configurable volume. /tmp on Render Free is EPHEMERAL.
Do not claim durable storage unless UVMALL_DB_PATH points to a persistent disk.
Only store tickets after explicit user request/consent.
"""
import os
import sqlite3
import threading
import time

DB_PATH = os.environ.get("UVMALL_DB_PATH", "/tmp/uvmall-ai-tickets.sqlite3")
LOCK = threading.RLock()
ALLOWED = {"new", "in_progress", "resolved", "closed"}
KINDS = {"support", "wholesale", "seller"}

def _connect():
    db = sqlite3.connect(DB_PATH, timeout=12)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=12000")
    return db

def initialize():
    with LOCK, _connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS tickets(
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           request_key TEXT NOT NULL UNIQUE,
           kind TEXT NOT NULL CHECK(kind IN ('support','wholesale','seller')),
           customer_id INTEGER NOT NULL,
           business_id TEXT NOT NULL DEFAULT '',
           summary TEXT NOT NULL DEFAULT '',
           status TEXT NOT NULL DEFAULT 'new'
             CHECK(status IN ('new','in_progress','resolved','closed')),
           notified INTEGER NOT NULL DEFAULT 0,
           replies INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL)""")
        db.execute("CREATE INDEX IF NOT EXISTS ticket_status_created ON tickets(status,created_at)")
        db.execute("CREATE INDEX IF NOT EXISTS ticket_customer_created ON tickets(customer_id,created_at)")
    return True

def _record(row):
    return dict(row) if row is not None else None

def create(kind, customer_id, summary, request_key, business_id=""):
    if kind not in KINDS: raise ValueError("Unknown ticket kind")
    cid = int(customer_id)
    if cid <= 0: raise ValueError("Invalid customer ID")
    key = str(request_key or "").strip()[:160]
    if not key: raise ValueError("Missing dedupe key")
    summary = str(summary or "").strip()[:850]
    now = int(time.time())
    with LOCK, _connect() as db:
        db.execute("""INSERT OR IGNORE INTO tickets
           (request_key,kind,customer_id,business_id,summary,status,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?)""",
           (key,kind,cid,str(business_id or "")[:180],summary,"new",now,now))
        row=db.execute("SELECT * FROM tickets WHERE request_key=?",(key,)).fetchone()
        return _record(row)

def get(ticket_id):
    with LOCK, _connect() as db:
        return _record(db.execute("SELECT * FROM tickets WHERE id=?",(int(ticket_id),)).fetchone())

def notify(ticket_id):
    with LOCK, _connect() as db:
        db.execute("UPDATE tickets SET notified=1,updated_at=? WHERE id=?",
                   (int(time.time()),int(ticket_id)))

def transition(ticket_id,status):
    if status not in ALLOWED: raise ValueError("Invalid ticket status")
    with LOCK, _connect() as db:
        existing=db.execute("SELECT id FROM tickets WHERE id=?",(int(ticket_id),)).fetchone()
        if existing is None:return None
        db.execute("UPDATE tickets SET status=?,updated_at=? WHERE id=?",
                   (status,int(time.time()),int(ticket_id)))
    return get(ticket_id)

def mark_replied(ticket_id):
    with LOCK, _connect() as db:
        now=int(time.time())
        db.execute("""UPDATE tickets SET replies=replies+1,status='in_progress',
                      updated_at=? WHERE id=?""",(now,int(ticket_id)))
    return get(ticket_id)

def list_tickets(status="all",limit=40,offset=0):
    if status not in ALLOWED|{"all"}: raise ValueError("Invalid status")
    limit=max(1,min(int(limit),100))
    offset=max(0,min(int(offset),100000))
    with LOCK, _connect() as db:
        if status=="all":
            rows=db.execute("SELECT * FROM tickets ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                            (limit,offset)).fetchall()
        else:
            rows=db.execute("SELECT * FROM tickets WHERE status=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                            (status,limit,offset)).fetchall()
        return [_record(x) for x in rows]

def statistics():
    with LOCK, _connect() as db:
        totals={row["status"]:row["n"] for row in db.execute(
            "SELECT status,COUNT(*) AS n FROM tickets GROUP BY status")}
        totals["total"]=sum(totals.values())
        totals["replies"]=int(db.execute(
            "SELECT COALESCE(SUM(replies),0) FROM tickets").fetchone()[0])
    return {k:totals.get(k,0) for k in ("new","in_progress","resolved","closed","total","replies")}

def storage_status():
    return {"path_kind":"persistent" if DB_PATH.startswith("/var/data/") else "ephemeral",
            "storage_warning":None if DB_PATH.startswith("/var/data/") else
            "Render Free filesystem is ephemeral; tickets may be lost on restart."}
