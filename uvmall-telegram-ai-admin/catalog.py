"""Read-only catalogue search for UVMALL AI.

Never invent products or prices. Items originate from the configured HTTPS feed,
or a separately authenticated import; nothing is seeded into production.
"""
import csv
import io
import json
import logging
import os
import re
import threading
import time
import unicodedata
from difflib import SequenceMatcher
from urllib.parse import urlparse
from urllib.request import Request, urlopen

log = logging.getLogger("uvmall.catalog")
FEED_URL = os.environ.get("CATALOG_FEED_URL", "").strip()
FEED_TOKEN = os.environ.get("CATALOG_FEED_TOKEN", "").strip()
REFRESH_SEC = max(120, int(os.environ.get("CATALOG_REFRESH_SEC", "900")))
MAX_BYTES = 15_000_000
MAX_ITEMS = 30000
LOCK = threading.RLock()
PRODUCTS = {}
STATUS = {"source": "not_connected", "last_sync": None, "error": None,
          "count": 0, "last_attempt": None}

KEYS = {
    "id": ["id", "product_id", "sku", "артикул", "код_товара"],
    "title": ["title", "name", "product_name", "название", "наименование", "товар"],
    "description": ["description", "описание"],
    "category": ["category", "category_name", "категория"],
    "seller": ["seller", "seller_name", "vendor", "продавец", "поставщик", "магазин"],
    "brand": ["brand", "бренд", "марка"],
    "price": ["price", "retail_price", "price_retail", "цена", "розничная цена"],
    "wholesale_price": ["wholesale_price", "bulk_price", "оптовая цена", "опт"],
    "min_qty": ["min_qty", "min_order", "minimum_order", "мин_заказ", "мин партия"],
    "quantity": ["quantity", "stock", "available_qty", "остаток", "количество", "наличие"],
    "pavilion": ["pavilion", "booth", "shop_number", "павильон", "номер павильона"],
    "url": ["url", "product_url", "link", "ссылка", "ссылка на товар"],
    "image_url": ["image_url", "image", "photo", "photo_url", "фото", "ссылка на фото"],
}
SYNONYMS = {
    "чайник": ["электрочайник", "электрический чайник"],
    "полотенце": ["полотенца", "махровое"],
    "постельное": ["постельное белье", "комплект белья", "кпб"],
    "кастрюля": ["посуда", "кастрюли"],
    "игрушка": ["игрушки"],
}
SAFE_DOMAINS = ("uvmall.ru", "www.uvmall.ru")

def norm(text):
    text = unicodedata.normalize("NFKC", str(text or "")).lower().replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^a-zа-я0-9]+", " ", text)).strip()

def as_number(value):
    if isinstance(value, bool) or value is None: return None
    if isinstance(value, (float, int)):
        n = float(value)
        return round(n, 2) if 0 <= n < 1e10 else None
    s = str(value).replace("\u00a0", "").replace(" ", "").replace("₽", "")
    s = s.replace(",", ".")
    s = re.sub(r"[^\d.\-]", "", s)
    if s.count(".") > 1 or not s: return None
    try:
        n = float(s)
        return round(n, 2) if 0 <= n < 1e10 else None
    except ValueError: return None

def as_int(v):
    n = as_number(v)
    return int(n) if n is not None and n <= 100000000 else None

def https_url(s, allow_external=False):
    if not s: return ""
    value = str(s).strip()
    if value.startswith("/"): value = "https://uvmall.ru" + value
    try:
        u = urlparse(value)
        if u.scheme != "https" or not u.hostname: return ""
        host = u.hostname.lower()
        if not allow_external and host not in SAFE_DOMAINS: return ""
        if u.username or u.password: return ""
        return value[:1800]
    except ValueError:
        return ""

def val(row, field):
    d = {str(k).strip().lower(): v for k, v in row.items()}
    for k in KEYS[field]:
        if d.get(k) is not None and str(d.get(k)).strip():
            return d[k]
    return ""

def normalize(row, ordinal):
    if not isinstance(row, dict): return None
    title = str(val(row, "title") or "").strip()[:220]
    if len(title) < 3: return None
    pid = str(val(row, "id") or "").strip()[:120]
    if not pid: pid = "import-" + str(ordinal)
    url = https_url(val(row, "url"))
    if not url: return None  # Never show fabricated/unclickable product cards.
    image = https_url(val(row, "image_url"), True)
    price = as_number(val(row, "price"))
    wholesale = as_number(val(row, "wholesale_price"))
    return {
        "id": pid, "title": title, "url": url, "image_url": image,
        "description": str(val(row, "description") or "")[:700],
        "category": str(val(row, "category") or "")[:100],
        "seller": str(val(row, "seller") or "")[:140],
        "brand": str(val(row, "brand") or "")[:80],
        "price": price, "wholesale_price": wholesale,
        "min_qty": as_int(val(row, "min_qty")),
        "quantity": as_int(val(row, "quantity")),
        "pavilion": str(val(row, "pavilion") or "")[:100],
    }

def decode_feed(raw, url=""):
    if len(raw) > MAX_BYTES: raise ValueError("feed too large")
    content = raw.decode("utf-8-sig")
    if url.lower().split("?")[0].endswith(".csv"):
        return list(csv.DictReader(io.StringIO(content)))
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return list(csv.DictReader(io.StringIO(content)))
    if isinstance(data, dict):
        for k in ("products", "items", "results", "data"):
            if isinstance(data.get(k), list): return data[k]
        raise ValueError("missing products array")
    if isinstance(data, list): return data
    raise ValueError("unexpected catalogue structure")

def install(rows, source):
    if not isinstance(rows, list): raise ValueError("array required")
    if len(rows) > MAX_ITEMS: raise ValueError("too many products")
    parsed = {}
    for i, raw in enumerate(rows):
        p = normalize(raw, i)
        if p: parsed[p["id"]] = p
    if rows and not parsed: raise ValueError("no valid public product URLs from uvmall.ru")
    with LOCK:
        PRODUCTS.clear()
        PRODUCTS.update(parsed)
        STATUS.update({"source": source, "last_sync": int(time.time()),
                       "last_attempt": int(time.time()), "error": None,
                       "count": len(PRODUCTS)})
    return len(parsed)

def refresh():
    if not FEED_URL:
        return False
    with LOCK: STATUS["last_attempt"] = int(time.time())
    if not https_url(FEED_URL, True): 
        with LOCK: STATUS["error"] = "invalid_https_source"
        return False
    try:
        headers = {"User-Agent": "UVMALL-AI-Catalog-Connector/2.0",
                   "Accept": "application/json,text/csv"}
        if FEED_TOKEN: headers["Authorization"] = "Bearer " + FEED_TOKEN
        request = Request(FEED_URL, headers=headers)
        with urlopen(request, timeout=20) as response:
            raw = response.read(MAX_BYTES + 1)
        count = install(decode_feed(raw, FEED_URL), "feed")
        log.info("Catalog synced: %s actual product records", count)
        return True
    except Exception as ex:
        with LOCK: STATUS["error"] = type(ex).__name__
        log.warning("Catalog feed unavailable: %s", type(ex).__name__)
        return False

def background_refresh():
    if not FEED_URL: return
    while True:
        refresh()
        time.sleep(REFRESH_SEC)

def status():
    with LOCK: return dict(STATUS, configured=bool(FEED_URL), refresh_seconds=REFRESH_SEC)

def get(product_id):
    with LOCK: 
        p = PRODUCTS.get(str(product_id))
        return dict(p) if p else None

def all_categories():
    with LOCK: values = set(p["category"] for p in PRODUCTS.values() if p["category"])
    return sorted(values, key=lambda s: s.lower())[:150]

def matches(p, query):
    words = norm(query).split()
    if not words: return 0
    title = norm(p["title"])
    target = " ".join([title, norm(p["category"]), norm(p["brand"]),
                       norm(p["seller"]), norm(p["pavilion"]), norm(p["description"])])
    score = 0
    for word in words:
        variants = [word] + [norm(x) for canon, alts in SYNONYMS.items()
                             if word in norm(canon).split() or word in norm(" ".join(alts)).split()
                             for x in [canon] + alts]
        exact = any(word in text for v in variants for text in [title] if v and v in text)
        if exact: score += 7
        elif any(v in target for v in variants if v): score += 3
        elif any(SequenceMatcher(None, word, tok).ratio() >= .83
                 for tok in title.split() if len(word) > 3): score += 2
        else: score -= 2
    return score

def search(query="", category="", min_price=None, max_price=None, qty=None,
           sort="relevance", limit=10, offset=0):
    minp, maxp = as_number(min_price), as_number(max_price)
    qty = as_int(qty)
    limit = max(1, min(int(limit or 10), 40))
    offset = max(0, min(int(offset or 0), 10000))
    with LOCK: products = list(PRODUCTS.values())
    found = []
    for p in products:
        if category and norm(category) != norm(p["category"]): continue
        price = p["price"]
        if qty and p["wholesale_price"] is not None and (p["min_qty"] or 0) <= qty:
            price = p["wholesale_price"]
        if minp is not None and (price is None or price < minp): continue
        if maxp is not None and (price is None or price > maxp): continue
        score = matches(p, query)
        if query and score <= 0: continue
        item = dict(p)
        item["display_price"] = price
        item["score"] = score
        found.append(item)
    if sort == "price_asc":
        found.sort(key=lambda p: (p["display_price"] is None, p["display_price"] or 0))
    elif sort == "price_desc":
        found.sort(key=lambda p: (p["display_price"] is None, -(p["display_price"] or 0)))
    else:
        found.sort(key=lambda p: (-p["score"], p["display_price"] is None, norm(p["title"])))
    total = len(found)
    return {"products": found[offset:offset+limit], "total": total,
            "connected": bool(status()["count"]), "query": str(query or "")[:120]}

def parse_natural(text):
    q = str(text or "")
    mx = re.search(r"(?:до|не более|max)\s*([\d\s]{2,10})\s*(?:руб|₽|р\b)", q.lower())
    qty = re.search(r"(?:от|оптом от|партия|количество)\s*(\d{1,7})\s*(?:штук|шт|единиц)?",q.lower())
    clean = re.sub(r"(?:до|не более|max)\s*[\d\s]{2,10}\s*(?:руб|₽|р\b)", " ", q, flags=re.I)
    clean = re.sub(r"(?:оптом\s*)?от\s*\d+\s*(?:штук|шт|единиц)", " ",clean,flags=re.I)
    return {"query": clean.strip(" ,."), "max_price": mx.group(1) if mx else None,
            "qty": qty.group(1) if qty else None}
