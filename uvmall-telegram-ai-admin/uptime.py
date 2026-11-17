"""Public UVMALL availability checks. Results represent this server's route only."""
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

LOCK=threading.RLock()
CACHE={}
URLS={"marketplace":"https://uvmall.ru/","seller":"https://seller.uvmall.ru/"}
TTL=180

def interpret(code):
    if code is None:return "unknown"
    if 200<=int(code)<400:return "reachable"
    if 500<=int(code)<600:return "server_error"
    if int(code) in (401,403,429):return "access_restricted"
    return "http_error"

def check_one(name,force=False):
    if name not in URLS:raise ValueError("Invalid target")
    now=time.time()
    with LOCK:
        entry=CACHE.get(name)
        if not force and entry and now-entry["checked_at"]<TTL:
            return dict(entry)
    url=URLS[name];code=None;reason=None
    req=Request(url,method="HEAD",headers={"User-Agent":"UVMALL-AI-Health/1.0"})
    try:
        with urlopen(req,timeout=7) as res:code=res.status
    except HTTPError as e:
        code=e.code
    except Exception as e:
        reason=type(e).__name__
    record={"target":name,"http_status":code,"result":interpret(code),
            "error":reason,"checked_at":int(time.time())}
    with LOCK:CACHE[name]=record
    return record

def public_text(result):
    code=result["http_status"]
    if result["result"]=="reachable":
        status="сайт отвечает на проверку"
    elif code:
        status="сайт вернул HTTP "+str(code)+" из сети сервера бота"
    else:
        status="не удалось проверить доступность из сети сервера бота"
    return status+". Доступность для других пользователей может отличаться."
