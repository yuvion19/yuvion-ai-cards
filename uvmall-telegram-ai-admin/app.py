#!/usr/bin/env python3
"""UVMALL Telegram support bot webhook service. Standard library only."""
from __future__ import annotations
import json
import hashlib
import hmac
import ssl
import uuid
import logging
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.parse import urlencode, parse_qs, urlsplit
from pathlib import Path
from urllib.error import HTTPError, URLError
import helpdesk as hd
import catalog as cat
import commerce as cm
import multimodal as mm
import tickets as tk
import uptime as up
import privacy as pv
import seller_tools as st
import locales as loc

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("uvmall")
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
MANAGER_ID = int(os.environ.get("ADMIN_CHAT_ID", "0") or "0")
MANAGER_STATUS = {"reachable": False, "checked": False}
OWNER_ID = int(os.environ.get("OWNER_USER_ID", "0") or "0")
OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "UVMALL19").lstrip("@").lower()
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
PUBLIC_URL = (os.environ.get("WEBHOOK_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
# GigaChat authorization key is kept only in Render secrets, never in source or logs.
GIGACHAT_AUTH_KEY = os.environ.get("GIGACHAT_AUTH_KEY", "").strip()
GIGACHAT_SCOPE = os.environ.get("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
GIGACHAT_MODEL = os.environ.get("GIGACHAT_MODEL", "GigaChat-2")
GIGACHAT_PROBE = os.environ.get("GIGACHAT_PROBE", "1") == "1"
AI_KEY = GIGACHAT_AUTH_KEY
GIGACHAT_ACCESS = {"value": "", "until": 0, "scope": "", "status": "not_configured" if not GIGACHAT_AUTH_KEY else "pending"}
GIGACHAT_TLS_CONTEXT = None
GIGACHAT_TLS_LOCK = threading.RLock()
# Pinned public root certificate fingerprint (SHA-256 of DER).
RUSSIAN_ROOT_FINGERPRINT = "d26d2d0231b7c39f92cc738512ba54103519e4405d68b5bd703e9788ca8ecf31"
RUSSIAN_ROOT_URL = "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt"
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
APP_URL = SITE  # Telegram application opens the public marketplace
RFQ_DRAFT = {}
RFQ_RATE = {}
MEDIA_PENDING = {}
MEDIA_RATE = {}

WELCOME = ("Здравствуйте! Вас приветствует UVMALL AI — виртуальный помощник маркетплейса.\n"
    "Помогу с вопросами по каталогу, заказам и подключению арендаторов.\n\n"
    "Выберите тему:\n1 — Стать продавцом\n2 — Разместить товары\n"
    "3 — Найти товар или поставщика\n4 — Заказы и техническая помощь\n"
    "5 — Связь с менеджером\n\n"
    "Подробные инструкции — /help. Можно задавать вопросы своими словами.\n"
    "Напишите «меню» для возврата или «стоп» для отключения автоответов.")
PROMPT = ("Ты UVMALL AI — виртуальный помощник маркетплейса UVMALL, использующий GigaChat API. Отвечай на указанном языке кратко и по делу, максимум 650 символов. "
    "Факты: uvmall.ru — каталог оптовых и розничных товаров поставщиков. "
    "Личный кабинет продавца seller.uvmall.ru. Контакт менеджера t.me/UVMALL19. "
    "Не придумывай цены, наличие, комиссии, сроки доставки, статусы заказов и контакты продавцов. "
    "Ты не имеешь доступа к базе UVMALL. Никогда не проси пароль, код, паспорт или карту. "
    "Если не знаешь ответа, направь к менеджеру. Не представляйся человеком.")

def post_json(url, data, headers=None, timeout=15, ssl_context=None):
    body = json.dumps(data, ensure_ascii=False).encode()
    req = Request(url, body, {"Content-Type": "application/json", **(headers or {})}, method="POST")
    with urlopen(req, timeout=timeout, context=ssl_context) as res:
        return json.loads(res.read().decode())

def tg(method, **kwargs):
    if not TOKEN: raise RuntimeError("Telegram bot token not configured")
    data = post_json(API + method, kwargs, timeout=20)
    if not data.get("ok"): raise RuntimeError("Telegram API failed: " + method)
    return data.get("result")

def send(chat, text, business_id="", reply_markup=None):
    payload = {"chat_id": chat, "text": text[:3900], "link_preview_options": {"is_disabled": True}}
    if business_id: payload["business_connection_id"] = business_id
    # Telegram Business messages also accept textual help commands; buttons
    # are limited to direct bot chats so callback authorization stays simple.
    if reply_markup and not business_id: payload["reply_markup"] = reply_markup
    return tg("sendMessage", **payload)

def reply_manager(message):
    """Confirm successful manager delivery before promising a handoff."""
    if not MANAGER_ID: return False
    try:
        send(MANAGER_ID, message)
        return True
    except Exception:
        log.exception("Manager delivery failed")
        return False

def gigachat_ssl_context():
    """Keep normal CA verification, adding a pinned Russian root only for GigaChat."""
    global GIGACHAT_TLS_CONTEXT
    with GIGACHAT_TLS_LOCK:
        if GIGACHAT_TLS_CONTEXT is not None:
            return GIGACHAT_TLS_CONTEXT
        ctx = ssl.create_default_context()
        try:
            # The public CA certificate contains no secrets. If its own server has
            # an untrusted national chain, accept ONLY a byte-for-byte pinned root.
            try:
                with urlopen(RUSSIAN_ROOT_URL, timeout=9, context=ssl.create_default_context()) as r:
                    pem = r.read(16000)
            except (ssl.SSLError, URLError):
                with urlopen(RUSSIAN_ROOT_URL, timeout=9, context=ssl._create_unverified_context()) as r:
                    pem = r.read(16000)
            if b"-----BEGIN CERTIFICATE-----" in pem:
                pem_text = pem.decode("ascii").strip()
                der = ssl.PEM_cert_to_DER_cert(pem_text)
            else:
                der = pem
                pem_text = ssl.DER_cert_to_PEM_cert(der)
            if hashlib.sha256(der).hexdigest().lower() != RUSSIAN_ROOT_FINGERPRINT:
                raise ValueError("national CA fingerprint mismatch")
            ctx.load_verify_locations(cadata=pem_text)
        except Exception as ex:
            log.warning("GigaChat national CA could not be installed (%s); keeping standard TLS verification", type(ex).__name__)
        GIGACHAT_TLS_CONTEXT = ctx
        return ctx

def gigachat_token():
    if not GIGACHAT_AUTH_KEY:
        raise RuntimeError("GigaChat key not configured")
    with GIGACHAT_TLS_LOCK:
        if GIGACHAT_ACCESS["value"] and time.time() < GIGACHAT_ACCESS["until"]:
            return GIGACHAT_ACCESS["value"]
        scopes = [GIGACHAT_ACCESS["scope"]] if GIGACHAT_ACCESS["scope"] else [GIGACHAT_SCOPE]
        scopes += [v for v in ("GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP") if v not in scopes]
        for scope in scopes:
            req = Request(
                "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
                data=urlencode({"scope": scope}).encode("utf-8"),
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "Authorization": "Basic " + GIGACHAT_AUTH_KEY,
                    "RqUID": str(uuid.uuid4()),
                },
                method="POST",
            )
            try:
                with urlopen(req, timeout=16, context=gigachat_ssl_context()) as r:
                    data = json.loads(r.read(30000))
                token = str(data["access_token"])
                exp = float(data.get("expires_at") or (time.time() + 1800))
                if exp > 100000000000: exp /= 1000
                GIGACHAT_ACCESS.update({
                    "value": token, "scope": scope,
                    "until": min(exp - 90, time.time() + 1500),
                    "status": "oauth_verified",
                })
                log.info("GigaChat OAuth successful; access token cached (no key logged)")
                return token
            except HTTPError as err:
                log.warning("GigaChat OAuth HTTP %d for configured scope", err.code)
                if err.code not in (400, 401, 403): break
            except Exception as err:
                log.warning("GigaChat OAuth connection issue: %s", type(err).__name__)
                break
        GIGACHAT_ACCESS["status"] = "oauth_failed"
        raise RuntimeError("GigaChat OAuth unavailable")

def gigachat_completion(message,lang="ru"):
    token = gigachat_token()
    response = post_json(
        "https://api.giga.chat/v1/chat/completions",
        {"model": GIGACHAT_MODEL,
         "messages": [
             {"role": "system", "content": PROMPT+" Язык ответа: "+loc.ai_language(lang)+"."},
             {"role": "user", "content": message[:1200]}
         ],
         "temperature": 0.2, "max_tokens": 230, "stream": False},
        {"Authorization": "Bearer " + token},
        timeout=23,
        ssl_context=gigachat_ssl_context(),
    )
    text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(text, str):
        text = str(text)
    if text.strip(): GIGACHAT_ACCESS["status"] = "chat_verified"
    return text.strip()[:650]

def answer_ai(text,customer_id=None):
    if not GIGACHAT_AUTH_KEY:
        return None
    sanitized=pv.prepare_for_ai(text)
    if sanitized is None:
        return "Не отправляйте пароли, коды, данные карт и документы. " + \
               "Для помощи обратитесь к менеджеру: " + CONTACT
    if not sanitized:return None
    if customer_id is not None and not tk.allow_ai(customer_id):
        return "Вы достигли лимита вопросов UVMALL AI (25 в час). " + \
               "Попробуйте /help или свяжитесь с менеджером: " + CONTACT
    try:
        result=gigachat_completion(sanitized,tk.get_language(customer_id) if customer_id else "ru")
        if result:tk.metric("ai_answer")
        else:tk.metric("ai_fallback")
        return result
    except HTTPError as err:
        GIGACHAT_ACCESS["status"] = "chat_http_error"
        log.warning("GigaChat inference failed: HTTP %s", err.code)
    except Exception as err:
        log.warning("GigaChat inference unavailable: %s", type(err).__name__)
    tk.metric("ai_fallback")
    return None

def probe_gigachat():
    if not GIGACHAT_AUTH_KEY or not GIGACHAT_PROBE: return
    try:
        result = gigachat_completion("Ответь одним словом: готов.")
        log.info("GigaChat startup check: %s", "chat_verified" if result else "empty_reply")
    except HTTPError as err:
        GIGACHAT_ACCESS["status"] = "chat_http_error"
        log.warning("GigaChat startup check: HTTP %s", err.code)
    except Exception as err:
        log.warning("GigaChat startup check unavailable: %s", type(err).__name__)

def feedback_markup():
    return {"inline_keyboard":[[
        {"text":"Помогло","callback_data":"f|yes"},
        {"text":"Не помогло","callback_data":"f|no"}
    ],[
        {"text":"Другой вопрос","callback_data":"h|ask"},
        {"text":"Язык","callback_data":"l|menu"}
    ]]}

def show_help(cid, bid="", section=None, topic=None):
    tk.metric("help_opened")
    if section and topic:
        return send(cid, hd.page_text(section, topic), bid,
                    hd.page_markup(section) if not bid else None)
    if section:
        return send(cid, hd.section_text(section), bid,
                    hd.section_markup(section) if not bid else None)
    return send(cid, hd.help_text_for_business() if bid else hd.INTRO, bid,
                hd.root_markup() if not bid else None)

def ask_help_question(cid, key, bid=""):
    with LOCK: PENDING[key] = "help_question"
    send(cid, "Напишите ваш вопрос по UVMALL одним сообщением. "
              "UVMALL AI подскажет, что можно сделать. Не передавайте пароли, коды, "
              "данные карт и документы. Для выхода напишите «меню».", bid)

def handoff_manager(cid, sender, key, bid="", topic="", request_id=None):
    # Explicit manager handoff authorizes a minimal ticket entry.
    dedupe = "support:" + str(cid) + ":" + str(request_id if request_id is not None else int(time.time() // 600))
    ticket = tk.create("support", cid, topic[:450] or "Запрошена помощь менеджера", dedupe, bid)
    ticket_id = ticket["id"]
    if ticket["notified"]:
        delivered = True
    else:
        delivered = reply_manager(
            "UVMALL AI — обращение №" + str(ticket_id) +
            "\nTelegram ID: " + str(cid)
            + ("\n@" + sender.get("username", "") if sender.get("username") else "")
            + ("\nТема: " + topic[:350] if topic else "")
            + "\nОтветить: /reply " + str(ticket_id) + " текст"
            + "\nПанель: /panel")
        if delivered: tk.notify(ticket_id)
    if delivered:
        if not ticket["notified"]: tk.metric("ticket_created")
        with LOCK:
            PAUSED.add(key)
            PENDING.pop(key, None)
        send(cid, "Обращение №" + str(ticket_id) + " передано менеджеру UVMALL. "
                  "Автоответы временно приостановлены. Прямой контакт: " + CONTACT
                  + "\nДля включения помощника напишите «возобновить».", bid)
    else:
        send(cid, "Не удалось автоматически передать обращение. "
                  "Напишите менеджеру: " + CONTACT, bid)

def manager_panel_markup():
    if not PUBLIC_URL.startswith("https://"):return None
    return {"inline_keyboard":[[{
        "text":"Открыть панель UVMALL AI",
        "web_app":{"url":PUBLIC_URL+"/operator"}}]]}

def process_manager_command(cid, text):
    """Only called after cid == MANAGER_ID in a private direct bot chat."""
    parts=text.strip().split(maxsplit=2)
    if not parts:return False
    cmd=parts[0].split("@")[0].lower()
    if cmd in ("/help","/admin"):
        send(cid,"Панель менеджера UVMALL AI:\n"
            "/panel — панель заявок\n"
            "/tickets — последние обращения\n"
            "/stats — статистика\n"
            "/reply ID текст — ответить клиенту\n"
            "/close ID — закрыть обращение\n"
            "/reopen ID — вернуть в работу\n"
            "/site — сайт маркетплейса")
        return True
    if cmd=="/panel":
        send(cid,"Панель менеджера UVMALL AI. Доступ подтверждается "
                 "подписью Telegram. Запускать из этого сообщения.",
             reply_markup=manager_panel_markup())
        return True
    if cmd=="/stats":
        stats=tk.statistics()
        usage=tk.metrics()
        send(cid,"UVMALL AI — статистика обращений\n"+
             "\n".join(k+": "+str(v) for k,v in stats.items())+
             "\nПоиски (7 дней): "+str(usage["search"])+
             "\nНичего не найдено: "+str(usage["search_empty"])+
             "\nКаталог не подключён: "+str(usage["catalog_unavailable"])+
             "\nВнимание: текущая база Render может очищаться при перезапуске.")
        return True
    if cmd=="/tickets":
        rows=tk.list_tickets(limit=15)
        if not rows:send(cid,"Новых заявок пока нет.");return True
        send(cid,"Последние обращения:\n"+"\n".join(
            "#"+str(t["id"])+" ["+t["status"]+"] "+t["kind"]+
            " — "+t["summary"][:65] for t in rows))
        return True
    if cmd in ("/reply","/close","/reopen","/resolve"):
        if len(parts)<2 or not parts[1].isdigit():
            send(cid,"Формат: "+cmd+" ID"+(" текст" if cmd=="/reply" else ""))
            return True
        ticket=tk.get(int(parts[1]))
        if not ticket:send(cid,"Обращение не найдено.");return True
        if cmd=="/reply":
            body=parts[2].strip() if len(parts)>2 else ""
            if not body or len(body)>3500 or cm.looks_secret(body):
                send(cid,"Напишите ответ длиной до 3500 символов. "
                         "Не пересылайте пароли, ключи и коды.")
                return True
            if deliver_ticket_reply(ticket,body):
                tk.mark_replied(ticket["id"])
                send(cid,"Ответ по обращению №"+str(ticket["id"])+" отправлен.")
            else:
                send(cid,"Ответ не доставлен — Telegram не разрешил отправку. "
                         "Попробуйте связаться с клиентом через @UVMALL19.")
            return True
        status={"/close":"closed","/reopen":"in_progress",
                "/resolve":"resolved"}.get(cmd)
        updated=tk.transition(ticket["id"],status)
        send(cid,"Обращение №"+str(updated["id"])+" → "+updated["status"])
        return True
    return False

def deliver_ticket_reply(ticket,text):
    try:
        send(ticket["customer_id"],"Менеджер UVMALL по заявке №"+
             str(ticket["id"])+":\n"+text, ticket["business_id"])
        return True
    except Exception as e:
        log.warning("Operator reply not delivered: %s",type(e).__name__)
        return False

def handle_callback_query(query):
    # Inline help buttons belong to private chats with @uv_mallbot.
    qid = query.get("id")
    if qid:
        try: tg("answerCallbackQuery", callback_query_id=qid)
        except Exception: log.warning("Could not acknowledge Telegram callback")
    message = query.get("message") or {}
    chat = message.get("chat") or {}
    sender = query.get("from") or {}
    if chat.get("type") != "private" or message.get("business_connection_id"): return
    cid = int(chat.get("id") or 0)
    if cid == 0 or int(sender.get("id") or 0) != cid: return
    data = str(query.get("data") or "")
    if data=="x|template":
        send(cid,"Скачайте шаблон товаров UVMALL: "+PUBLIC_URL+
            "/tools/seller-template.csv\n"
            "Отправьте заполненный .xlsx или .csv сюда документом — UVMALL AI "
            "проверит структуру, не публикуя товары.")
        return
    if data=="u|check":
        send(cid,"Проверяю основной сайт и кабинет продавцов из сети UVMALL AI…")
        threading.Thread(target=check_site_for_customer,args=(cid,""),daemon=True).start()
        return
    if data=="l|menu":
        send(cid,loc.PICK_TEXT,reply_markup=loc.markup())
        return
    if data.startswith("l|"):
        lang=data.split("|",1)[1]
        if lang in loc.LANGS:
            tk.set_language(cid,lang)
            send(cid,loc.instructions(lang),reply_markup=hd.root_markup())
        return
    if data.startswith("f|"):
        rating=data.split("|",1)[1]
        if rating in ("yes","no"):
            mid=int(message.get("message_id") or 0)
            if mid:
                added=tk.record_feedback(cid,mid,rating=="yes")
                if added:
                    send(cid,"Спасибо за оценку! Можете задать другой вопрос через /ask.",
                         reply_markup=hd.root_markup())
        return
    if data=="s|start":
        with LOCK:PENDING["direct:"+str(cid)]="catalog:query"
        send(cid,"Что ищете на UVMALL? Напишите название товара, бренд, "
                 "цену и нужное количество.\n"
                 "Например: «электрочайник до 2000 ₽ оптом от 10 шт».",
             reply_markup=catalog_markup(False))
        return
    if data=="s|app":
        send(cid,"Официальный сайт маркетплейса UVMALL: " + SITE,
             reply_markup=catalog_markup(False))
        return
    if data=="r|start":
        start_rfq(cid,"direct:"+str(cid))
        return
    if not data.startswith("h|"): return
    parts = data.split("|")
    key = "direct:" + str(cid)
    action = parts[1] if len(parts) > 1 else "root"
    if action == "start":
        with LOCK:
            PENDING.pop(key, None)
            PAUSED.discard(key)
        send(cid, WELCOME, reply_markup=hd.root_markup())
    elif action == "root":
        with LOCK: PENDING.pop(key, None)
        show_help(cid)
    elif action == "ask":
        ask_help_question(cid, key)
    elif action == "manager":
        handoff_manager(cid, sender, key)
    elif action in hd.SECTIONS:
        if len(parts) == 3 and parts[2] in hd.SECTIONS[action]["topics"]:
            with LOCK: PENDING[key] = "help_topic|" + action + "|" + parts[2]
            show_help(cid, section=action, topic=parts[2])
        else:
            with LOCK: PENDING[key] = "help_list|" + action
            show_help(cid, section=action)

def catalog_markup(include_search=True):
    buttons = []
    if APP_URL:
        buttons.append([{"text": "Открыть сайт UVMALL", "url": SITE}])
    if include_search:
        buttons.append([{"text": "Найти товар", "callback_data":"s|start"},
                        {"text":"Оптовая заявка", "callback_data":"r|start"}])
    buttons.append([{"text":"Связаться с менеджером", "url":CONTACT}])
    return {"inline_keyboard":buttons}

def catalogue_search(cid, query, bid=""):
    tk.metric("search")
    if not cat.status()["count"]:
        tk.metric("catalog_unavailable")
        send(cid,
             "Поиск UVMALL AI готов, но реальные товары ещё не синхронизированы с каталогом сайта.\n"
             "Пока можно открыть uvmall.ru или отправить оптовую заявку менеджеру. "
             "Я не буду показывать вымышленные товары и цены.",
             bid, catalog_markup() if not bid else None)
        return
    params = cat.parse_natural(query)
    found=cat.search(params["query"] or query, max_price=params["max_price"],
                     qty=params["qty"], limit=5)
    if not found["total"]:
        tk.metric("search_empty")
        send(cid, "По запросу «" + query[:120] + "» совпадений не найдено.\n"
             "Попробуйте другое название, уберите ценовое ограничение или уточните "
             "запрос в каталоге.", bid,
             catalog_markup() if not bid else None)
        return
    send(cid, "UVMALL AI: найдено " + str(found["total"])
         + " совпадений. Показываю первые " + str(len(found["products"]))
         + ". Цены и наличие уточняются у продавца.", bid)
    for p in found["products"]:
        summary=cm.product_summary(p)
        markup={"inline_keyboard":[[{"text":"Открыть товар", "url":p["url"]}],
             [{"text":"Оптовая заявка", "callback_data":"r|start"}]]}
        if p.get("image_url"):
            try:
                payload={"chat_id":cid, "photo":p["image_url"],"caption":summary[:1000]}
                if bid: payload["business_connection_id"]=bid
                if not bid: payload["reply_markup"]=markup
                tg("sendPhoto",**payload)
                continue
            except Exception:
                log.warning("Catalogue product image unavailable: sent text fallback")
        send(cid,summary,bid,markup if not bid else None)
    if found["total"]>len(found["products"]):
        send(cid,"Остальные результаты доступны в каталоге Mini App.",
             bid,catalog_markup(False) if not bid else None)

def start_rfq(cid, key, bid=""):
    with LOCK:
        RFQ_DRAFT[key]={}
        PENDING[key]="rfq:item"
    send(cid, "Оптовая заявка UVMALL AI.\n"
         "Какие товары вы ищете? Опишите название, характеристики и количество.\n"
         "Для отмены напишите «меню». Не отправляйте пароли и платёжные данные.",bid)

def process_rfq(cid, key, state, text, sender, bid="", request_id=None):
    raw=cm.allowed_text(text,700)
    if cm.looks_secret(raw):
        send(cid,"Не отправляйте пароли, коды или платёжные данные. "
                 "Укажите только информацию о товарах.",bid)
        return
    with LOCK: draft=RFQ_DRAFT.setdefault(key,{})
    if state=="rfq:item":
        if len(raw)<4:
            send(cid,"Опишите товары подробнее.",bid);return
        draft["item"]=raw
        with LOCK:PENDING[key]="rfq:budget"
        send(cid,"Укажите примерный бюджет в рублях или напишите «не знаю». "
                 "Количество товара можно указать здесь же.",bid)
    elif state=="rfq:budget":
        draft["conditions"]=raw[:300]
        with LOCK:PENDING[key]="rfq:consent"
        send(cid,"Для передачи заявки менеджеру UVMALL мы отправим текст запроса "
                 "и ваш Telegram ID для ответа. Согласны?\n"
                 "Напишите «да» для отправки или «нет» для отмены.",bid)
    elif state=="rfq:consent":
        with LOCK:
            PENDING.pop(key,None)
            RFQ_DRAFT.pop(key,None)
        if raw.lower() not in ("да","согласен","согласна"):
            send(cid,"Заявка не отправлена. Для связи с менеджером: "+CONTACT,bid)
            return
        # Construct as a single outbound message after explicit agreement.
        lead="UVMALL AI — оптовая заявка\nTelegram ID: "+str(cid)
        if sender.get("username"): lead+="\n@"+str(sender["username"])[:60]
        lead+="\nТовары: "+draft.get("item","")[:650]
        lead+="\nБюджет/условия: "+draft.get("conditions","")[:300]
        lead+="\nКлиент согласился передать запрос менеджеру."
        ticket=tk.create("wholesale",cid,
            draft.get("item","")[:500]+" | "+draft.get("conditions","")[:280],
            "wholesale:"+str(cid)+":"+str(request_id if request_id is not None else int(time.time()//600)),bid)
        if ticket["notified"] or reply_manager(
            "Заявка №"+str(ticket["id"])+"\n"+lead+
            "\nОтветить: /reply "+str(ticket["id"])+" текст"):
            tk.notify(ticket["id"])
            if not ticket["notified"]: tk.metric("rfq_sent")
            send(cid,"Оптовая заявка №"+str(ticket["id"])+" передана менеджеру UVMALL. "
                 "При необходимости он ответит в Telegram. "+CONTACT,bid)
        else:
            send(cid,"Передать заявку автоматически не удалось. "
                 "Напишите менеджеру: "+CONTACT,bid)

def check_site_for_customer(cid,bid=""):
    # Run a bounded network check outside the Telegram webhook processing thread.
    try:
        main=up.check_one("marketplace")
        seller=up.check_one("seller")
        send(cid,"Проверка сайтов UVMALL из сети нашего сервера:\n"+
                 "uvmall.ru: "+up.public_text(main)+"\n"+
                 "seller.uvmall.ru: "+up.public_text(seller)+"\n"+
                 "При проблеме с доступом можно написать менеджеру: "+CONTACT,bid)
    except Exception as err:
        log.warning("Website status check failed: %s",type(err).__name__)
        send(cid,"Не удалось проверить доступность сайтов. "
                 "Свяжитесь с менеджером: "+CONTACT,bid)

def process_inline_query(q):
    qid=q.get("id")
    if not qid:return
    text=cm.allowed_text(q.get("query",""),180)
    if not text:return
    found=cat.search(text,limit=12) if cat.status()["count"] else {"products":[]}
    payload={"inline_query_id":qid,"results":cm.inline_items(found["products"]),
             "cache_time":30,"is_personal":False}
    try:tg("answerInlineQuery",**payload)
    except Exception:log.exception("Inline catalogue query failed")

def process_media_after_consent(cid,key,media,bid=""):
    """Background worker runs only after user explicitly accepts media forwarding."""
    try:
        phrase=mm.describe_media(
            TOKEN, media["data"], media["type"], gigachat_token,gigachat_ssl_context,
            model=os.environ.get("GIGACHAT_MEDIA_MODEL","GigaChat-2-Pro"))
        if not phrase or phrase.lower() in ("не товар","неразборчиво"):
            send(cid,"UVMALL AI не удалось уверенно распознать запрос. "
                     "Напишите, пожалуйста, что вы ищете, текстом.",bid)
            return
        label="Предположительно на фото: " if media["type"]=="photo" else "Распознал запрос: "
        send(cid,label+phrase+"\nПроверяю каталог UVMALL…",bid)
        catalogue_search(cid,phrase,bid)
    except Exception as err:
        log.warning("UVMALL AI media recognition unavailable: %s",type(err).__name__)
        send(cid,"Распознавание изображения или голоса сейчас недоступно. "
                 "Напишите название товара текстом — помогу с поиском.",bid)

def _seller_sheet_worker(cid,document,bid=""):
    filename=str(document.get("file_name") or "")[:140]
    try:
        binary=mm.download_telegram_media(TOKEN,document)
        result=st.audit(binary,filename)
        send(cid,st.report(result)+"\n\n"
             "Шаблон: "+PUBLIC_URL+"/tools/seller-template.csv",bid)
    except Exception as err:
        log.warning("Seller file inspection failed: %s",type(err).__name__)
        send(cid,"Не удалось проверить таблицу. Поддерживаются .xlsx и .csv "
             "размером до 8,5 МБ, до 2500 строк. Файл не изменён. "
             "Можно скачать шаблон: "+PUBLIC_URL+"/tools/seller-template.csv",bid)

def process_message(message, business=False):
    chat_obj = message.get("chat") or {}
    if chat_obj.get("type") != "private": return
    sender = message.get("from") or {}
    if sender.get("is_bot"): return
    cid = int(chat_obj["id"])
    bid = message.get("business_connection_id", "") if business else ""
    # Never process a personal-account message without a Telegram-provided business connection.
    if business and not bid: return
    if business:
        # Telegram validates the Business connection. Block another account's connection.
        try:
            connection = tg("getBusinessConnection", business_connection_id=bid)
            account = connection.get("user") or {}
            owner_id = int(account.get("id", 0))
            owner_username = str(account.get("username") or "").lower()
            # Optional stable owner ID takes precedence; otherwise require exact public account username.
            if OWNER_ID:
                if owner_id != OWNER_ID: return
            elif not OWNER_USERNAME or owner_username != OWNER_USERNAME:
                return
            if not connection.get("is_enabled"): return
            rights = connection.get("rights") or {}
            if not rights.get("can_reply"): return
        except Exception:
            log.warning("Business connection could not be verified")
            return
        if int(sender.get("id", 0)) == owner_id: return
    text = (message.get("text") or "").strip()
    key = (bid or "direct") + ":" + str(cid)
    if message.get("document"):
        document=message["document"]
        with LOCK:
            if key in PAUSED:return
        filename=str(document.get("file_name") or "").lower()
        if bid:
            send(cid,"Для безопасной проверки таблицы отправьте файл "
                     "напрямую в @uv_mallbot.",bid)
            return
        if not filename.endswith((".csv",".xlsx")) or int(document.get("file_size") or 0)>st.MAX_FILE:
            send(cid,"Отправьте файл .xlsx или .csv размером до 8,5 МБ. "
                     "Другая документация не обрабатывается. "
                     "Шаблон: "+PUBLIC_URL+"/tools/seller-template.csv")
            return
        send(cid,"Проверяю структуру таблицы без отправки её содержимого в ИИ. "
                 "Файл не сохраняю и не публикую товары.")
        threading.Thread(target=_seller_sheet_worker,
                         args=(cid,document),daemon=True).start()
        return
    if message.get("photo") or message.get("voice") or message.get("audio"):
        with LOCK:
            if key in PAUSED: return
        if bid:
            send(cid,"Поиск по фотографии и голосу доступен в отдельном "
                     "@uv_mallbot. В обычном чате можете описать товар текстом.",bid)
            return
        photos=message.get("photo") or []
        media=photos[-1] if photos else (message.get("voice") or message.get("audio"))
        media_type="photo" if photos else "voice"
        if not media or int(media.get("file_size") or 0)>mm.MAX_MEDIA:
            send(cid,"Файл слишком большой или отсутствует. "
                     "Попробуйте изображение/сообщение меньшего размера.",bid);return
        with LOCK:
            MEDIA_PENDING[key]={"type":media_type,"data":media,"time":time.time()}
            PENDING[key]="media:consent"
        send(cid,"Могу распознать "+("товар на фото" if photos else "голосовой запрос")
            +" через UVMALL AI. Для этого файл будет передан провайдеру "
             "GigaChat API, без сохранения на сервере UVMALL AI. "
             "Не присылайте документы и секретные данные.\n"
             "Согласны? Ответьте «да» или «нет».",bid)
        return
    clean = re.sub(r"\s+", " ", text.lower()).strip(" .!?")
    if not business and clean in {"/myid", "/id"}:
        send(cid, "Ваш Telegram chat ID: " + str(cid) + "\nДобавьте его в ADMIN_CHAT_ID и OWNER_USER_ID в секретах сервера.")
        return
    if not business and MANAGER_ID and cid == MANAGER_ID:
        if process_manager_command(cid, text): return
    if clean in {"стоп", "/stop", "отключить бота"}:
        with LOCK:
            PAUSED.add(key)
            PENDING.pop(key, None)
            RFQ_DRAFT.pop(key,None)
            MEDIA_PENDING.pop(key,None)
        send(cid, "Автоматические ответы отключены. Для возврата напишите «возобновить».", bid)
        return
    if clean in {"возобновить", "/start", "меню"}:
        with LOCK:
            PAUSED.discard(key)
            PENDING.pop(key, None)
            RFQ_DRAFT.pop(key,None)
            MEDIA_PENDING.pop(key,None)
        send(cid, WELCOME, bid, hd.root_markup() if not bid else None)
        return
    with LOCK:
        if key in PAUSED: return
        state = PENDING.get(key, "")
    if state=="media:consent":
        with LOCK:
            record=MEDIA_PENDING.pop(key,None)
            PENDING.pop(key,None)
        if clean not in ("да","согласен","согласна"):
            send(cid,"Фото/голос не отправлены на распознавание. "
                     "Можете написать запрос текстом или открыть /search.",bid)
            return
        if not record or time.time()-record["time"]>600:
            send(cid,"Срок подтверждения истёк. Отправьте файл повторно.",bid)
            return
        with LOCK:
            times=[t for t in MEDIA_RATE.get(cid,[]) if time.time()-t<3600]
            if len(times)>=3:
                send(cid,"Для распознавания можно отправить не более "
                         "трёх файлов в час. Используйте текстовый поиск.",bid)
                return
            times.append(time.time())
            MEDIA_RATE[cid]=times
        send(cid,"Принято. UVMALL AI распознаёт запрос; результат придёт "
                 "в этот чат, когда обработка завершится.",bid)
        threading.Thread(target=process_media_after_consent,
                         args=(cid,key,record,bid),daemon=True).start()
        return
    if clean in {"/language","/lang","язык","сменить язык"}:
        send(cid,loc.PICK_TEXT,bid,loc.markup() if not bid else None)
        return
    if clean.startswith("/lang "):
        language=clean.split(" ",1)[1].strip()
        if language in loc.LANGS:
            tk.set_language(cid,language)
            send(cid,loc.instructions(language),bid,hd.root_markup() if not bid else None)
        else:
            send(cid,loc.PICK_TEXT,bid,loc.markup() if not bid else None)
        return
    if clean in {"/template","шаблон","шаблон excel"}:
        send(cid,"Шаблон таблицы продавца для Excel (CSV UTF-8): "
            +PUBLIC_URL+"/tools/seller-template.csv"
            +"\nЭто подготовительный формат, не подтверждённый для автоматического импорта в кабинет."
            +"\nМожете прислать заполненный .xlsx/.csv прямо сюда — проверю ошибки.",bid)
        return
    if clean in {"/checkfile","проверить excel","проверить файл"}:
        send(cid,"Пришлите таблицу .xlsx или .csv документом (до 8,5 МБ). "
            "Проверю названия, категории, цены, фото и дубли артикулов; "
            "ничего не изменю и не загружу в кабинет. "
            "Шаблон: "+PUBLIC_URL+"/tools/seller-template.csv",bid)
        return
    if clean in {"/status", "статус сайта", "сайт работает"}:
        send(cid,"Проверяю доступность сайта UVMALL из сети сервера бота…",bid)
        threading.Thread(target=check_site_for_customer,args=(cid,bid),daemon=True).start()
        return
    if clean in {"/catalog","/site","сайт", "каталог", "магазин"}:
        send(cid,"Официальный сайт UVMALL: " + SITE + "\nЕсли сайт не загружается, обратитесь к менеджеру: " + CONTACT,bid,
             catalog_markup() if not bid else None)
        return
    if clean in {"/search","поиск","найти товар","искать"} or clean.startswith("/search "):
        term=text.partition(" ")[2].strip() if clean.startswith("/search ") else ""
        if term:
            catalogue_search(cid,term,bid)
        else:
            with LOCK:PENDING[key]="catalog:query"
            send(cid,"Напишите, что нужно найти: название, бренд, цену, "
                     "количество или категорию. Например: «чайник до 2000 ₽».",bid,
                 catalog_markup(False) if not bid else None)
        return
    if clean in {"/wholesale","оптовая заявка","закупка","запросить опт","опт"}:
        start_rfq(cid,key,bid)
        return
    if state=="catalog:query":
        catalogue_search(cid,text,bid)
        return
    if state.startswith("rfq:"):
        process_rfq(cid,key,state,text,sender,bid,request_id=message.get("message_id"))
        return
    if clean in {"/help", "/faq", "помощь", "раздел помощь", "справка", "помоги"}:
        with LOCK: PENDING.pop(key, None)
        show_help(cid, bid)
        return
    if clean in {"/seller", "арендатор", "для арендаторов", "для продавцов"}:
        with LOCK: PENDING[key] = "help_list|seller"
        show_help(cid, bid, section="seller")
        return
    if clean in {"/buyer", "покупатель", "для покупателей"}:
        with LOCK: PENDING[key] = "help_list|buyer"
        show_help(cid, bid, section="buyer")
        return
    if clean in {"/tech", "техпомощь", "техническая помощь"}:
        with LOCK: PENDING[key] = "help_list|tech"
        show_help(cid, bid, section="tech")
        return
    if clean in {"/ask", "спросить ии", "спросить gigachat", "спросить гигачат",
                 "задать вопрос", "вопрос ии"}:
        ask_help_question(cid, key, bid)
        return
    if clean in {"/manager", "менеджер", "оператор", "5"}:
        handoff_manager(cid, sender, key, bid, request_id=message.get("message_id"))
        return
    if state.startswith("help_list|") and clean.isdigit():
        section = state.split("|", 1)[1]
        topic = hd.topic_by_number(section, clean)
        if topic is None:
            send(cid, "Нет такого пункта. Выберите номер из меню или напишите /help.", bid)
        else:
            with LOCK: PENDING[key] = "help_topic|" + section + "|" + topic
            show_help(cid, bid, section, topic)
        return
    if state == "help_question" or state.startswith("help_topic|"):
        context = ""
        if state.startswith("help_topic|"):
            components = state.split("|")
            if len(components) == 3:
                item = hd.SECTIONS.get(components[1], {}).get("topics", {}).get(components[2])
                if item: context = "Раздел справки: " + item[0] + ". "
        response = answer_ai(context + text,cid)
        send(cid, (response or "Не удалось подготовить ответ прямо сейчас. "
             "Посмотрите раздел /help или обратитесь к менеджеру: " + CONTACT)
             + "\n\nМожно задать следующий вопрос или вернуться в /help.", bid,
             feedback_markup() if response and not bid else None)
        return
    if state == "consent":
        if clean not in {"да", "согласен", "согласна"}:
            with LOCK: PENDING.pop(key, None)
            send(cid, "Заявка не сохранена. Для связи с менеджером: " + CONTACT, bid)
            return
        with LOCK: PENDING[key] = "name"
        send(cid, "Напишите название магазина или ваше имя без персональных документов.", bid)
        return
    if state == "name":
        if pv.sensitive(text):
            send(cid,"Не отправляйте пароли, коды или данные карт. "
                 "Напишите только имя или название магазина.",bid)
            return
        with LOCK: PENDING[key] = "pavilion:" + text[:100]
        send(cid, "Напишите номер павильона / линию ТК «Южные Ворота» или «не знаю».", bid)
        return
    if state.startswith("pavilion:"):
        if pv.sensitive(text):
            send(cid,"Не отправляйте в анкете пароли, документы и платёжные данные. "
                 "Укажите только номер павильона либо «не знаю».",bid)
            return
        with LOCK: PENDING.pop(key, None)
        name = state.split(":", 1)[1]
        ticket=tk.create("seller",cid,
            "Магазин/имя: "+name[:100]+" | Павильон: "+text[:100],
            "seller:"+str(cid)+":"+str(message.get("message_id") or int(time.time()//600)),bid)
        delivered = bool(ticket["notified"]) or reply_manager(
            "UVMALL AI — заявка продавца №"+str(ticket["id"])+
            "\nМагазин/имя: "+name[:100]+
            "\nПавильон: "+text[:100]+
            "\nTelegram ID клиента: "+str(cid)+
            ("\n@"+sender["username"] if sender.get("username") else "")+
            "\nОтветить: /reply "+str(ticket["id"])+" текст"+
            "\nПанель: /panel")
        if delivered:
            tk.notify(ticket["id"])
            send(cid,"Заявка продавца №"+str(ticket["id"])+
                 " передана менеджеру UVMALL. Ответ поступит через Telegram при возможности.",bid)
        else:
            send(cid,"Автоматически переслать заявку не удалось. "
                     "Свяжитесь с менеджером напрямую: "+CONTACT,bid)
        return
    suggested_topic = hd.topic_by_words(clean)
    if suggested_topic:
        section, topic = suggested_topic
        with LOCK: PENDING[key] = "help_topic|" + section + "|" + topic
        show_help(cid, bid, section, topic)
        return
    if clean in {"", "привет", "здравствуйте"}:
        send(cid, WELCOME, bid, hd.root_markup() if not bid else None)
    elif clean == "1" or "стать продавцом" in clean or "арендатор" in clean:
        send(cid, "Подключение продавцов UVMALL. Кабинет: " + SELLER
            + "\nЧтобы оставить заявку, напишите «заявка». Условия участия уточняет менеджер.", bid)
    elif clean == "2" or "добавить товар" in clean or "разместить товар" in clean:
        send(cid, "Загрузите фотографии, названия, цены и характеристики в кабинете: " + SELLER
            + "\nЕсли требуется помощь с Excel, напишите «менеджер».", bid)
    elif clean == "3" or "найти товар" in clean or "поставщик" in clean:
        with LOCK:PENDING[key]="catalog:query"
        send(cid,"Что ищете в каталоге UVMALL? Напишите название товара, "
                 "бренд, нужное количество и бюджет.",bid,
             catalog_markup(False) if not bid else None)
    elif clean == "4" or "заказ" in clean or "ошибка" in clean:
        send(cid, "У меня нет доступа к статусам заказов или наличию. Напишите «менеджер»."
            + "\nНе присылайте пароли, коды и данные карт.", bid)
    elif "связаться с менеджером" in clean or "позвать менеджера" in clean:
        handoff_manager(cid, sender, key, bid, text, request_id=message.get("message_id"))
    elif clean == "заявка" or "подключиться" in clean:
        if not POLICY_URL.startswith("https://"):
            send(cid, "Заявки пока принимаются напрямую менеджером: " + CONTACT, bid)
        else:
            with LOCK: PENDING[key] = "consent"
            send(cid, "Чтобы отправить заявку, мне потребуются имя/название магазина, номер павильона "
                "и Telegram ID для обратной связи. Согласны на обработку этих данных? "
                "Напишите «да» или «нет». Политика: " + POLICY_URL, bid)
    elif clean.startswith(("ищу ","найди ","покажи товары ","подбери ","найти ")):
        catalogue_search(cid,text,bid)
    else:
        response=answer_ai(text,cid)
        send(cid, response or "Я могу помочь с подключением продавцов и каталогом. "
            "Напишите «меню» или «менеджер». Сайт: " + SITE, bid,
             feedback_markup() if response and not bid else None)

def handle_update(update):
    now = time.time()
    uid = update.get("update_id")
    with LOCK:
        for k, t in list(SEEN.items()):
            if now - t > 3600: SEEN.pop(k, None)
        if uid in SEEN: return
        if uid is not None: SEEN[uid] = now
    if "inline_query" in update:
        process_inline_query(update["inline_query"])
    elif "callback_query" in update:
        handle_callback_query(update["callback_query"])
    elif "business_message" in update:
        process_message(update["business_message"], True)
    elif "message" in update:
        process_message(update["message"], False)

class Handler(BaseHTTPRequestHandler):
    def json_response(self, code, data):
        content=json.dumps(data,ensure_ascii=False,separators=(",",":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Length",str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_HEAD(self):
        p=urlsplit(self.path).path
        self.send_response(200 if p in ("/","/health","/app","/operator","/tools/seller-template.csv") else 404)
        self.send_header("Content-Length","0")
        self.end_headers()

    def do_GET(self):
        parsed=urlsplit(self.path)
        path=parsed.path.rstrip("/") or "/"
        params=parse_qs(parsed.query,keep_blank_values=True)
        val=lambda key,default="":(params.get(key) or [default])[0]
        if path=="/tools/seller-template.csv":
            body=st.template_bytes()
            self.send_response(200)
            self.send_header("Content-Type","text/csv; charset=utf-8")
            self.send_header("Content-Disposition",'attachment; filename="UVMALL_Seller_Template.csv"')
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Cache-Control","public, max-age=3600")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path=="/operator":
            # Static shell only: all ticket data is guarded by Telegram HMAC.
            body=Path(__file__).with_name("operator.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type","text/html; charset=utf-8")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Cache-Control","no-store")
            self.send_header("Referrer-Policy","no-referrer")
            self.send_header("Content-Security-Policy",
                "default-src 'self' https://telegram.org; script-src 'self' 'unsafe-inline' https://telegram.org; "
                "style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; "
                "base-uri 'self'; object-src 'none'; frame-ancestors https://web.telegram.org")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path=="/app":
            # Old links now redirect to the official marketplace.
            self.send_response(302)
            self.send_header("Location", SITE)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path=="/api/catalog/categories":
            self.json_response(200,{"categories":cat.all_categories(),
                                    "connected":bool(cat.status()["count"])})
            return
        if path=="/api/catalog/status":
            self.json_response(200,cat.status())
            return
        if path=="/api/catalog/search":
            try:
                result=cat.search(query=val("q")[:180],category=val("category")[:100],
                                  min_price=val("min_price")[:18],
                                  max_price=val("max_price")[:18],
                                  qty=val("qty")[:18],sort=val("sort")[:20],
                                  limit=val("limit","18"),offset=val("offset","0"))
                self.json_response(200,result)
            except (ValueError,TypeError):
                self.json_response(400,{"error":"invalid_filters"})
            return
        if path in ("/","/health"):
            catalogue=cat.status()
            self.json_response(200,{
                "name":"UVMALL AI","status":"online",
                "telegram_configured":bool(TOKEN),
                "manager_configured":bool(MANAGER_ID),
                "manager_chat_reachable":MANAGER_STATUS["reachable"],
                "ai_provider":"UVMALL AI",
                "ai_enabled":bool(GIGACHAT_AUTH_KEY),
                "uvmall_ai_status":GIGACHAT_ACCESS["status"],
                "help_enabled":True,"help_topics":sum(len(x["topics"]) for x in hd.SECTIONS.values()),
                "catalog_enabled":bool(catalogue["count"]),
                "catalog_items":catalogue["count"],
                "catalog_feed_configured":catalogue["configured"],
                "app_destination": SITE,
                "miniapp_enabled": False,
                "inline_handler_enabled":True,
                "operator_panel_enabled":True,
                "tickets_storage":tk.storage_status()["path_kind"]})
            return
        self.json_response(404,{"error":"not_found"})

    def do_POST(self):
        path=urlsplit(self.path).path
        if path=="/api/telegram":
            if not WEBHOOK_SECRET or self.headers.get("X-Telegram-Bot-Api-Secret-Token")!=WEBHOOK_SECRET:
                self.json_response(403,{"error":"forbidden"});return
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<=0 or length>MAX_BODY:
                    self.json_response(413,{"error":"body_size"});return
                update=json.loads(self.rfile.read(length))
                handle_update(update)
                self.json_response(200,{"ok":True})
            except Exception:
                log.exception("Telegram webhook failed")
                self.json_response(500,{"ok":False})
            return
        if path in ("/api/operator/list","/api/operator/action"):
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<=0 or length>9000:
                    self.json_response(413,{"ok":False,"message":"Неверный размер запроса."});return
                payload=json.loads(self.rfile.read(length))
                identity=cm.verify_init_data(payload.get("initData",""),TOKEN)
                if not MANAGER_ID or not identity or identity["id"]!=MANAGER_ID:
                    self.json_response(403,{"ok":False,"message":"Доступ только менеджеру UVMALL."});return
                if path=="/api/operator/list":
                    wanted=str(payload.get("status") or "all")
                    self.json_response(200,{"ok":True,"tickets":tk.list_tickets(wanted,limit=60),
                        "statistics":tk.statistics(),"metrics":tk.metrics(),"storage":tk.storage_status()})
                    return
                ticket_id=int(payload.get("ticket_id") or 0)
                ticket=tk.get(ticket_id)
                if ticket is None:
                    self.json_response(404,{"ok":False,"message":"Обращение не найдено."});return
                action=str(payload.get("action") or "")
                if action=="reply":
                    body=str(payload.get("text") or "").strip()
                    if not body or len(body)>3500 or cm.looks_secret(body):
                        self.json_response(400,{"ok":False,"message":"Неверный текст ответа."});return
                    if not deliver_ticket_reply(ticket,body):
                        self.json_response(503,{"ok":False,
                            "message":"Telegram не разрешил доставить ответ. Свяжитесь через @UVMALL19."});return
                    updated=tk.mark_replied(ticket_id)
                elif action in ("new","in_progress","resolved","closed"):
                    updated=tk.transition(ticket_id,action)
                else:
                    self.json_response(400,{"ok":False,"message":"Неизвестная операция."});return
                self.json_response(200,{"ok":True,"ticket":updated})
            except (ValueError,TypeError):
                self.json_response(400,{"ok":False,"message":"Некорректные параметры."})
            except Exception:
                log.exception("Operator API error")
                self.json_response(500,{"ok":False,"message":"Ошибка панели оператора."})
            return
        if path=="/api/admin/catalog/refresh":
            secret=os.environ.get("CATALOG_ADMIN_TOKEN","")
            auth=self.headers.get("Authorization","")
            if not secret or not hmac.compare_digest(auth,"Bearer "+secret):
                self.json_response(403,{"error":"forbidden"});return
            worked=cat.refresh()
            self.json_response(200 if worked else 503,{"ok":worked,"catalog":cat.status()})
            return
        if path=="/api/admin/catalog/import":
            secret=os.environ.get("CATALOG_ADMIN_TOKEN","")
            auth=self.headers.get("Authorization","")
            if not secret or not hmac.compare_digest(auth,"Bearer "+secret):
                self.json_response(403,{"error":"forbidden"});return
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<=0 or length>cat.MAX_BYTES:
                    self.json_response(413,{"error":"body_size"});return
                rows=cat.decode_feed(self.rfile.read(length))
                count=cat.install(rows,"manual_ephemeral")
                self.json_response(200,{"ok":True,"count":count,
                   "warning":"Manual import is not persistent. Set CATALOG_FEED_URL for durable sync."})
            except Exception as ex:
                self.json_response(400,{"error":type(ex).__name__})
            return
        if path=="/api/rfq":
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<10 or length>12000:
                    self.json_response(413,{"ok":False,"message":"Недопустимый размер заявки."});return
                body=json.loads(self.rfile.read(length))
                lead=cm.rfq_from_body(body,TOKEN)
                now=time.time();uid=lead["user"]["id"]
                with LOCK:
                    timestamps=[v for v in RFQ_RATE.get(uid,[]) if now-v<3600]
                    if len(timestamps)>=3:
                        self.json_response(429,{"ok":False,"message":"Лимит заявок: 3 в час. "
                                                  "Обратитесь напрямую к @UVMALL19."})
                        return
                    timestamps.append(now)
                    RFQ_RATE[uid]=timestamps
                fingerprint=hashlib.sha256(
                    (str(uid)+json.dumps(
                        [lead["item"],lead["quantity"],lead["budget"],lead["notes"]],
                        ensure_ascii=False,sort_keys=True)).encode("utf-8")).hexdigest()[:32]
                # Deduplicate exact same form submitted again in the same 10-minute period.
                dedupe="web_rfq:"+str(uid)+":"+fingerprint+":"+str(int(now//600))
                ticket=tk.create("wholesale",uid,
                   cm.rfq_message(lead)[:800],dedupe)
                if ticket["notified"] or reply_manager(
                    "Оптовая заявка №"+str(ticket["id"])+"\n"+cm.rfq_message(lead)+
                    "\nОтветить: /reply "+str(ticket["id"])+" текст"):
                    tk.notify(ticket["id"])
                    if not ticket["notified"]: tk.metric("rfq_sent")
                    self.json_response(200,{"ok":True,"ticket_id":ticket["id"]})
                else:
                    self.json_response(503,{"ok":False,"message":"Менеджер недоступен. "
                                              "Напишите @UVMALL19 напрямую."})
            except ValueError as ex:
                self.json_response(400,{"ok":False,"message":str(ex)[:300]})
            except Exception:
                log.exception("RFQ submission failed")
                self.json_response(500,{"ok":False,"message":"Ошибка отправки. "
                                          "Свяжитесь с @UVMALL19."})
            return
        self.json_response(404,{"error":"not_found"})

    def log_message(self, fmt,*args):
        log.info(fmt,*args)

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
           allowed_updates=["message", "callback_query", "inline_query", "business_message", "business_connection"],
           drop_pending_updates=False)
        # Profile settings are independent: a Telegram 429 on the name must
        # not prevent updating the help descriptions and command menu.
        operations = [
            ("setMyName", {"name": "UVMALL AI — Помощник"}),
            ("setMyShortDescription", {"short_description": "UVMALL AI — умная помощь покупателям и арендаторам UVMALL."}),
            ("setMyDescription", {"description": "UVMALL AI — виртуальный помощник маркетплейса UVMALL. Вопросы о товарах, продавцах, регистрации, размещении и поддержке. Сайт: https://uvmall.ru/ Менеджер: @UVMALL19."}),
            ("setMyCommands", {"commands": [
                {"command": "start", "description": "Начать и открыть меню"},
                {"command": "help", "description": "Помощь: темы и инструкции"},
                {"command": "lang", "description": "Выбрать язык ответов"},
                {"command": "search", "description": "Найти товар в каталоге"},
                {"command": "catalog", "description": "Ссылка на официальный сайт"},
                {"command": "site", "description": "Перейти на uvmall.ru"},
                {"command": "template", "description": "Шаблон Excel товаров"},
                {"command": "checkfile", "description": "Проверить таблицу товаров"},
                {"command": "status", "description": "Проверить доступность сайта"},
                {"command": "wholesale", "description": "Оставить оптовую заявку"},
                {"command": "seller", "description": "Помощь арендаторам"},
                {"command": "buyer", "description": "Помощь покупателям"},
                {"command": "tech", "description": "Техническая поддержка"},
                {"command": "ask", "description": "Задать вопрос UVMALL AI"},
                {"command": "manager", "description": "Связаться с менеджером"},
                {"command": "myid", "description": "Узнать свой Telegram ID"},
                {"command": "stop", "description": "Отключить автоответы"}
            ]}),
            ("setChatMenuButton", {"menu_button": (
                {"type":"commands"})}),
        ]
        for method, args in operations:
            try:
                if method == "setMyName":
                    # Avoid unnecessary rename requests, which Telegram rate limits.
                    current = tg("getMyName") or {}
                    if current.get("name") == args["name"]:
                        log.info("Telegram bot name already UVMALL AI")
                        continue
                tg(method, **args)
                log.info("Telegram bot profile updated: %s", method)
            except HTTPError as err:
                log.warning("Telegram bot profile %s deferred: HTTP %d", method, err.code)
            except Exception as err:
                log.warning("Telegram bot profile %s unavailable: %s", method, type(err).__name__)
        if MANAGER_ID:
            try:
                chat = tg("getChat", chat_id=MANAGER_ID)
                MANAGER_STATUS["reachable"] = int(chat.get("id") or 0) == MANAGER_ID
                MANAGER_STATUS["checked"] = True
                log.info("Manager chat check: %s", "reachable" if MANAGER_STATUS["reachable"] else "not_reachable")
            except Exception as err:
                MANAGER_STATUS["checked"] = True
                MANAGER_STATUS["reachable"] = False
                log.warning("Manager chat not yet accessible to bot: %s", type(err).__name__)
        log.info("Webhook registered for @uv_mallbot")
    except Exception:
        log.exception("Webhook registration failed; retry after restart")

def validate_help_center():
    # Local, network-free checks before starting the production listener.
    assert catalog_markup(False)["inline_keyboard"][0][0]["url"] == SITE, "Website button must be a normal URL"
    import io
    import unittest
    import test_helpdesk, test_catalog, test_commerce, test_multimodal, test_tickets, test_uptime, test_privacy, test_seller_tools, test_locales
    suite = unittest.TestSuite()
    for mod in (test_helpdesk,test_catalog,test_commerce,test_multimodal,test_tickets,test_uptime,test_privacy,test_seller_tools,test_locales):
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(mod))
    results = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(suite)
    if not results.wasSuccessful():
        raise RuntimeError("UVMALL Help Center self-tests failed")
    log.info("UVMALL AI ready: %s tests passed, %s help topics",
             results.testsRun, sum(len(v["topics"]) for v in hd.SECTIONS.values()))

if __name__ == "__main__":
    validate_help_center()
    tk.initialize()
    removed=tk.prune_history()
    log.info("UVMALL operator ticket database ready: %s, old resolved tickets cleaned: %s",tk.storage_status()["path_kind"],removed)
    if cat.FEED_URL:
        threading.Thread(target=cat.background_refresh, daemon=True).start()
    else:
        log.warning("UVMALL product feed not configured: catalogue search will show no products")
    threading.Thread(target=register_webhook, daemon=True).start()
    threading.Thread(target=probe_gigachat, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log.info("UVMALL HTTP webhook service listening on %s", PORT)
    server.serve_forever()
