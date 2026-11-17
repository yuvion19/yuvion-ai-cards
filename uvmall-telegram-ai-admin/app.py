#!/usr/bin/env python3
"""UVMALL Telegram support bot webhook service. Standard library only."""
from __future__ import annotations
import json
import logging
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("uvmall")
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
MANAGER_ID = int(os.environ.get("ADMIN_CHAT_ID", "0") or "0")
OWNER_ID = int(os.environ.get("OWNER_USER_ID", "0") or "0")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
PUBLIC_URL = (os.environ.get("WEBHOOK_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
AI_KEY = os.environ.get("OPENAI_API_KEY", "")
POLICY_URL = os.environ.get("PRIVACY_POLICY_URL", "")
PORT = int(os.environ.get("PORT", "10000"))
API = "https://api.telegram.org/bot" + TOKEN + "/"
LOCK = threading.RLock()
PENDING = {}
PAUSED = set()
SEEN = {}
MAX_BODY = 1048576
SITE = "https://uvmall.ru/"
SELLER = "https://seller.uvmall.ru/"
CONTACT = "https://t.me/UVMALL19"

WELCOME = ("Здравствуйте! Я автоматический помощник UVMALL.\n"
    "Помогу с вопросами по каталогу, заказам и подключению арендаторов.\n\n"
    "Выберите тему:\n1 — Стать продавцом\n2 — Разместить товары\n"
    "3 — Найти товар или поставщика\n4 — Заказы и техническая помощь\n"
    "5 — Связь с менеджером\n\n"
    "Напишите «меню», чтобы увидеть темы снова, или «стоп», чтобы отключить автоответы.")
PROMPT = ("Ты автоматический помощник UVMALL. Отвечай по-русски кратко и по делу, максимум 650 символов. "
    "Факты: uvmall.ru — каталог оптовых и розничных товаров поставщиков. "
    "Личный кабинет продавца seller.uvmall.ru. Контакт менеджера t.me/UVMALL19. "
    "Не придумывай цены, наличие, комиссии, сроки доставки, статусы заказов и контакты продавцов. "
    "Ты не имеешь доступа к базе UVMALL. Никогда не проси пароль, код, паспорт или карту. "
    "Если не знаешь ответа, направь к менеджеру. Не представляйся человеком.")

def post_json(url, data, headers=None, timeout=15):
    body = json.dumps(data, ensure_ascii=False).encode()
    req = Request(url, body, {"Content-Type": "application/json", **(headers or {})}, method="POST")
    with urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())

def tg(method, **kwargs):
    if not TOKEN: raise RuntimeError("Telegram bot token not configured")
    data = post_json(API + method, kwargs, timeout=20)
    if not data.get("ok"): raise RuntimeError("Telegram API failed: " + method)
    return data.get("result")

def send(chat, text, business_id=""):
    payload = {"chat_id": chat, "text": text[:3900], "link_preview_options": {"is_disabled": True}}
    if business_id: payload["business_connection_id"] = business_id
    return tg("sendMessage", **payload)

def reply_manager(message):
    if MANAGER_ID:
        try: send(MANAGER_ID, message)
        except Exception: log.exception("Manager delivery failed")

def answer_ai(text):
    if not AI_KEY: return None
    try:
        res = post_json("https://api.openai.com/v1/responses", {
            "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
            "input": [{"role": "system", "content": PROMPT},
                      {"role": "user", "content": text[:1200]}],
            "store": False, "max_output_tokens": 240
        }, {"Authorization": "Bearer " + AI_KEY}, timeout=18)
        return " ".join(c.get("text", "") for x in res.get("output", [])
            for c in x.get("content", []) if c.get("type") == "output_text").strip()[:650] or None
    except Exception:
        log.warning("AI response failed; fallback to menu")
        return None

def process_message(message, business=False):
    chat_obj = message.get("chat") or {}
    if chat_obj.get("type") != "private": return
    sender = message.get("from") or {}
    if sender.get("is_bot"): return
    cid = int(chat_obj["id"])
    bid = message.get("business_connection_id", "") if business else ""
    # Do not read unrelated personal accounts: business automation requires verified owner ID.
    if business and (not OWNER_ID or not bid): return
    if business:
        # Telegram validates the Business connection. Block another account's connection.
        try:
            connection = tg("getBusinessConnection", business_connection_id=bid)
            if int((connection.get("user") or {}).get("id", 0)) != OWNER_ID: return
            if not connection.get("is_enabled"): return
            rights = connection.get("rights") or {}
            if not rights.get("can_reply"): return
        except Exception:
            log.warning("Business connection could not be verified")
            return
        if sender.get("id") == OWNER_ID: return
    text = (message.get("text") or "").strip()
    key = (bid or "direct") + ":" + str(cid)
    clean = re.sub(r"\\s+", " ", text.lower()).strip(" .!?")
    if not business and clean in {"/myid", "/id"}:
        send(cid, "Ваш Telegram chat ID: " + str(cid) + "\nДобавьте его в ADMIN_CHAT_ID и OWNER_USER_ID в секретах сервера.")
        return
    if not business and MANAGER_ID and cid == MANAGER_ID and clean == "/help":
        send(cid, "Администратор UVMALL. Заявки клиентов приходят в этот чат.")
        return
    if clean in {"стоп", "/stop", "отключить бота"}:
        with LOCK:
            PAUSED.add(key)
            PENDING.pop(key, None)
        send(cid, "Автоматические ответы отключены. Для возврата напишите «возобновить».", bid)
        return
    if clean in {"возобновить", "/start", "меню"}:
        with LOCK:
            PAUSED.discard(key)
            PENDING.pop(key, None)
        send(cid, WELCOME, bid)
        return
    with LOCK:
        if key in PAUSED: return
        state = PENDING.get(key, "")
    if state == "consent":
        if clean not in {"да", "согласен", "согласна"}:
            with LOCK: PENDING.pop(key, None)
            send(cid, "Заявка не сохранена. Для связи с менеджером: " + CONTACT, bid)
            return
        with LOCK: PENDING[key] = "name"
        send(cid, "Напишите название магазина или ваше имя без персональных документов.", bid)
        return
    if state == "name":
        with LOCK: PENDING[key] = "pavilion:" + text[:100]
        send(cid, "Напишите номер павильона / линию ТК «Южные Ворота» или «не знаю».", bid)
        return
    if state.startswith("pavilion:"):
        with LOCK: PENDING.pop(key, None)
        if not MANAGER_ID:
            send(cid, "Для завершения заявки свяжитесь с менеджером: " + CONTACT, bid)
        else:
            name = state.split(":", 1)[1]
            reply_manager("UVMALL — новая заявка продавца\nМагазин/имя: " + name
                + "\nПавильон: " + text[:100]
                + "\nTelegram ID клиента: " + str(cid)
                + ("\n@" + sender["username"] if sender.get("username") else "")
                + "\nОтветить можно через основной Telegram @UVMALL19.")
            send(cid, "Спасибо. Заявка направлена менеджеру UVMALL.", bid)
        return
    if clean in {"", "привет", "здравствуйте", "помощь"}:
        send(cid, WELCOME, bid)
    elif clean == "1" or "стать продавцом" in clean or "арендатор" in clean:
        send(cid, "Подключение продавцов UVMALL. Кабинет: " + SELLER
            + "\nЧтобы оставить заявку, напишите «заявка». Условия участия уточняет менеджер.", bid)
    elif clean == "2" or "добавить товар" in clean or "разместить товар" in clean:
        send(cid, "Загрузите фотографии, названия, цены и характеристики в кабинете: " + SELLER
            + "\nЕсли требуется помощь с Excel, напишите «менеджер».", bid)
    elif clean == "3" or "найти товар" in clean or "поставщик" in clean or "каталог" in clean:
        send(cid, "Каталог UVMALL: " + SITE
            + "\nДля подтверждения оптовой цены и наличия обратитесь к продавцу. Могу передать вопрос менеджеру.", bid)
    elif clean == "4" or "заказ" in clean or "ошибка" in clean:
        send(cid, "У меня нет доступа к статусам заказов или наличию. Напишите «менеджер»."
            + "\nНе присылайте пароли, коды и данные карт.", bid)
    elif clean == "5" or "менеджер" in clean or "оператор" in clean:
        reply_manager("UVMALL — клиент просит менеджера. Telegram ID: " + str(cid)
            + (" @" + sender["username"] if sender.get("username") else "")
            + "\nВопрос: " + text[:300])
        with LOCK: PAUSED.add(key)
        send(cid, "Переключаю на менеджера. Для прямой связи: " + CONTACT
            + "\nАвтоматические ответы в этом диалоге приостановлены.", bid)
    elif clean == "заявка" or "подключиться" in clean:
        if not POLICY_URL.startswith("https://"):
            send(cid, "Заявки пока принимаются напрямую менеджером: " + CONTACT, bid)
        else:
            with LOCK: PENDING[key] = "consent"
            send(cid, "Чтобы отправить заявку, мне потребуются имя/название магазина, номер павильона "
                "и Telegram ID для обратной связи. Согласны на обработку этих данных? "
                "Напишите «да» или «нет». Политика: " + POLICY_URL, bid)
    else:
        send(cid, answer_ai(text) or "Я могу помочь с подключением продавцов и каталогом. "
            "Напишите «меню» или «менеджер». Сайт: " + SITE, bid)

def handle_update(update):
    now = time.time()
    uid = update.get("update_id")
    with LOCK:
        for k, t in list(SEEN.items()):
            if now - t > 3600: SEEN.pop(k, None)
        if uid in SEEN: return
        if uid is not None: SEEN[uid] = now
    if "business_message" in update:
        process_message(update["business_message"], True)
    elif "message" in update:
        process_message(update["message"], False)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/health"):
            body = json.dumps({
                "name": "UVMALL Telegram AI Admin", "status": "online",
                "telegram_configured": bool(TOKEN),
                "manager_configured": bool(MANAGER_ID),
                "owner_configured": bool(OWNER_ID),
                "ai_enabled": bool(AI_KEY)
            }, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else: self.send_error(404)

    def do_POST(self):
        if self.path != "/api/telegram":
            self.send_error(404); return
        if not WEBHOOK_SECRET or self.headers.get("X-Telegram-Bot-Api-Secret-Token") != WEBHOOK_SECRET:
            self.send_error(403); return
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0 or size > MAX_BODY:
            self.send_error(413); return
        try:
            update = json.loads(self.rfile.read(size).decode())
            handle_update(update)
            self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
        except Exception:
            log.exception("Webhook processing failed")
            self.send_error(500)

    def log_message(self, fmt, *args):
        log.info(fmt, *args)

def register_webhook():
    if not TOKEN:
        log.warning("Bot token missing: web service ready, Telegram inactive")
        return
    if not WEBHOOK_SECRET or not PUBLIC_URL.startswith("https://"):
        log.warning("Missing webhook URL or secret: not registering")
        return
    try:
        me = tg("getMe")
        if me.get("username", "").lower() != "uv_mallbot":
            log.error("Wrong Telegram bot token; expected @uv_mallbot")
            return
        tg("setWebhook", url=PUBLIC_URL + "/api/telegram",
           secret_token=WEBHOOK_SECRET,
           allowed_updates=["message", "business_message", "business_connection"],
           drop_pending_updates=False)
        log.info("Webhook registered for @uv_mallbot")
    except Exception:
        log.exception("Webhook registration failed; retry after restart")

if __name__ == "__main__":
    threading.Thread(target=register_webhook, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log.info("UVMALL HTTP webhook service listening on %s", PORT)
    server.serve_forever()
