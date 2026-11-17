"""Shared Telegram catalogue and RFQ security rules for UVMALL AI."""
import hashlib
import hmac
import json
import re
import time
from urllib.parse import parse_qsl
from urllib.parse import quote

def verify_init_data(init_data, bot_token, max_age=3600):
    """Validate Telegram WebApp HMAC; never trust client-supplied Telegram IDs."""
    if not bot_token or not isinstance(init_data,str) or len(init_data)>10000:
        return None
    pairs=parse_qsl(init_data,keep_blank_values=True,strict_parsing=True)
    fields=dict(pairs)
    if len(fields)!=len(pairs): return None
    provided=fields.pop("hash",None)
    fields.pop("signature",None)
    if not provided or len(provided)!=64: return None
    try: when=int(fields.get("auth_date","0"))
    except (ValueError,TypeError): return None
    now=time.time()
    if when<now-max_age or when>now+60: return None
    check="\n".join(k+"="+fields[k] for k in sorted(fields))
    secret=hmac.new(b"WebAppData",bot_token.encode(),hashlib.sha256).digest()
    expected=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,provided.lower()): return None
    try:
        user=json.loads(fields.get("user","{}"))
        user_id=int(user.get("id",0))
    except (ValueError,TypeError,json.JSONDecodeError,AttributeError): return None
    if user_id<=0: return None
    return {"id":user_id,"username":str(user.get("username") or "")[:60],
            "first_name":str(user.get("first_name") or "")[:80]}

def allowed_text(value, limit=500):
    s=re.sub(r"[\x00-\x1f\x7f]", " ", str(value or "")).strip()
    return s[:limit]

def looks_secret(text):
    return bool(re.search(r"(парол|паспорт|cvv|cvc|sms.?код|код из смс|bearer\s|api.?key|токен|sk-proj-)",str(text).lower()))

def rfq_from_body(body, token):
    """Return verified, consented lead or raise ValueError."""
    if not isinstance(body,dict) or body.get("consent") is not True:
        raise ValueError("Для отправки требуется согласие.")
    user=verify_init_data(body.get("initData",""),token)
    if not user: raise ValueError("Откройте каталог из Telegram, чтобы отправить заявку.")
    item=allowed_text(body.get("item"),600)
    notes=allowed_text(body.get("notes"),700)
    if len(item)<4: raise ValueError("Укажите товары для закупки.")
    if looks_secret(item) or looks_secret(notes):
        raise ValueError("Не передавайте пароли, коды или платёжные данные.")
    def optional_number(n):
        if n in ("",None): return None
        try:
            v=float(n)
            if not 0<=v<=1_000_000_000: raise ValueError()
            return v
        except (ValueError,TypeError): raise ValueError("Проверьте количество и бюджет.")
    qty=optional_number(body.get("quantity"))
    budget=optional_number(body.get("budget"))
    if qty is not None and (qty<1 or qty!=int(qty)):
        raise ValueError("Количество должно быть целым положительным числом.")
    return {"user":user,"item":item,"quantity":int(qty) if qty is not None else None,
            "budget":budget,"notes":notes}

def rfq_message(lead):
    user=lead["user"]
    msg=[
        "UVMALL AI — новая оптовая заявка",
        "Пользователь Telegram ID: "+str(user["id"]),
        "Telegram: "+("@"+user["username"] if user["username"] else "без username"),
        "Товар: "+lead["item"],
        "Количество: "+(str(lead["quantity"])+" шт." if lead["quantity"] else "не указано"),
        "Бюджет: "+(str(lead["budget"])+" ₽" if lead["budget"] is not None else "не указан"),
        "Условия: "+(lead["notes"] or "не указаны"),
        "Источник: Telegram Mini App UVMALL. Пользователь подтвердил передачу заявки менеджеру."
    ]
    return "\n".join(msg)[:3800]

def price_str(value):
    if value is None: return "по запросу"
    try:
        f=float(value)
        return f"{f:,.0f}".replace(","," ")+" ₽" if f.is_integer() else f"{f:,.2f}".replace(","," ").replace(".",",")+" ₽"
    except (ValueError,TypeError): return "по запросу"

def product_summary(p):
    lines=[p["title"]]
    if p.get("price") is not None: lines.append("Цена: "+price_str(p["price"]))
    else: lines.append("Цена: уточняется у продавца")
    if p.get("wholesale_price") is not None:
        x="Опт: "+price_str(p["wholesale_price"])
        if p.get("min_qty"): x+=" от "+str(p["min_qty"])+" шт."
        lines.append(x)
    if p.get("seller"): lines.append("Продавец: "+p["seller"])
    if p.get("pavilion"): lines.append("Павильон: "+p["pavilion"])
    if p.get("quantity") is not None: lines.append("В каталоге указано количество: "+str(p["quantity"]))
    lines.append("Товар: "+p["url"])
    return "\n".join(lines)[:1000]

def inline_items(items):
    results=[]
    for p in items[:15]:
        rid=hashlib.sha256(p["url"].encode()).hexdigest()[:28]
        results.append({
            "type":"article","id":rid,"title":p["title"][:180],
            "description":("Цена: "+price_str(p.get("price"))+" · "+(p.get("seller") or "UVMALL"))[:250],
            "input_message_content":{"message_text":product_summary(p),"disable_web_page_preview":False},
            "reply_markup":{"inline_keyboard":[[{"text":"Открыть товар","url":p["url"]}]]},
            **({"thumbnail_url":p["image_url"]} if p.get("image_url") else {})
        })
    return results
