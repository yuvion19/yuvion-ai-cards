"""Minimal UVMALL ticket workflow.

Uses SQLite on a configurable volume. /tmp on Render Free is EPHEMERAL.
Do not claim durable storage unless UVMALL_DB_PATH points to a persistent disk.
Only store tickets after explicit user request/consent.
"""
import os
import secrets
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
        db.execute("""CREATE TABLE IF NOT EXISTS metrics(
            day TEXT NOT NULL,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(day,name)
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS ai_limits(
            customer_id INTEGER PRIMARY KEY,
            window_started INTEGER NOT NULL,
            requests INTEGER NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS languages(
             customer_id INTEGER PRIMARY KEY,
             lang TEXT NOT NULL DEFAULT 'ru'
         )""")
        db.execute("""CREATE TABLE IF NOT EXISTS feedback(
             customer_id INTEGER NOT NULL,
             message_id INTEGER NOT NULL,
             positive INTEGER NOT NULL,
             created_at INTEGER NOT NULL,
             PRIMARY KEY(customer_id,message_id)
         )""")
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
        for attempt in range(6):
            # Random 12-digit ticket IDs prevent cross-user ID reuse if
            # Render replaces an ephemeral SQLite database on redeploy.
            ticket_id=secrets.randbelow(900_000_000_000)+100_000_000_000
            db.execute("""INSERT OR IGNORE INTO tickets
               (id,request_key,kind,customer_id,business_id,summary,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
               (ticket_id,key,kind,cid,str(business_id or "")[:180],
                summary,"new",now,now))
            row=db.execute("SELECT * FROM tickets WHERE request_key=?",(key,)).fetchone()
            if row:return _record(row)
    raise RuntimeError("Could not allocate a unique ticket ID")

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
    # A path named /var/data is not proof a persistent disk is mounted.
    mounted=DB_PATH.startswith("/var/data/") and os.path.ismount("/var/data")
    return {"path_kind":"persistent" if mounted else "ephemeral",
            "storage_warning":None if mounted else
            "Render Free filesystem is ephemeral; tickets may be lost on restart."}

EVENTS = {"search", "search_empty", "catalog_unavailable", "help_opened", "helpful_yes", "helpful_no",
          "ai_answer", "ai_fallback", "ticket_created", "rfq_sent"}

def metric(event):
    """Aggregate anonymous events by UTC day; never retain personal search terms."""
    if event not in EVENTS:
        raise ValueError("Invalid metric")
    day=time.strftime("%Y-%m-%d",time.gmtime())
    with LOCK, _connect() as db:
        db.execute("""INSERT INTO metrics(day,name,count) VALUES(?,?,1)
          ON CONFLICT(day,name) DO UPDATE SET count=count+1""",(day,event))

def metrics(days=7):
    since=time.strftime("%Y-%m-%d",time.gmtime(time.time()-int(days)*86400))
    with LOCK, _connect() as db:
        rows=db.execute("""SELECT name,SUM(count) AS total FROM metrics
                          WHERE day>=? GROUP BY name""",(since,)).fetchall()
    values={x["name"]:int(x["total"]) for x in rows}
    return {k:values.get(k,0) for k in sorted(EVENTS)}

def prune_history(retention_days=90):
    """Only remove resolved/closed tickets after retention; leave active work open."""
    before=int(time.time())-max(30,int(retention_days))*86400
    cutoff=time.strftime("%Y-%m-%d",time.gmtime(time.time()-180*86400))
    with LOCK, _connect() as db:
        count=db.execute("""DELETE FROM tickets
                  WHERE status IN ('resolved','closed') AND updated_at<?""",
                  (before,)).rowcount
        db.execute("DELETE FROM metrics WHERE day<?",(cutoff,))
    return count

def allow_ai(customer_id,limit=25,period=3600):
    """Atomically enforce at most limit accepted AI calls per Telegram ID per window."""
    cid=int(customer_id)
    if cid<=0:return False
    now=int(time.time())
    limit=max(1,min(int(limit),100))
    with LOCK, _connect() as db:
        db.execute("BEGIN IMMEDIATE")
        record=db.execute("SELECT window_started,requests FROM ai_limits WHERE customer_id=?",
                          (cid,)).fetchone()
        if record is None or now-record["window_started"]>=period:
            db.execute("""INSERT INTO ai_limits(customer_id,window_started,requests)
                   VALUES(?,?,1) ON CONFLICT(customer_id) DO UPDATE SET
                   window_started=excluded.window_started,requests=1""",(cid,now))
            return True
        if record["requests"]>=limit:
            return False
        db.execute("UPDATE ai_limits SET requests=requests+1 WHERE customer_id=?",(cid,))
        return True

def set_language(customer_id,lang):
    if lang not in ("ru","en","tg","uz","zh","fa","hi"):
        raise ValueError("Unsupported language")
    with LOCK, _connect() as db:
        db.execute("""INSERT INTO languages(customer_id,lang) VALUES(?,?)
             ON CONFLICT(customer_id) DO UPDATE SET lang=excluded.lang""",
             (int(customer_id),lang))

def get_language(customer_id):
    with LOCK, _connect() as db:
        row=db.execute("SELECT lang FROM languages WHERE customer_id=?",
                       (int(customer_id),)).fetchone()
    return row["lang"] if row else "ru"

def record_feedback(customer_id,message_id,positive):
    if positive not in (True,False):raise ValueError("Invalid feedback")
    if int(customer_id)<=0 or int(message_id)<=0:raise ValueError("Invalid identity")
    with LOCK, _connect() as db:
        count=db.execute("""INSERT OR IGNORE INTO feedback
           (customer_id,message_id,positive,created_at) VALUES(?,?,?,?)""",
           (int(customer_id),int(message_id),int(positive),int(time.time()))).rowcount
    if count:
        metric("helpful_yes" if positive else "helpful_no")
    return bool(count)
