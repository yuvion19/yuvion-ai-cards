"""Optional media search through Telegram files and the GigaChat multimodal API.

Media is transferred only after explicit user consent.
No media or credentials are stored on disk; downloaded bytes stay in RAM.
"""
import json
import logging
import uuid
from urllib.request import urlopen, Request
from urllib.parse import quote

log=logging.getLogger("uvmall.media")
MAX_MEDIA=9_000_000

def download_telegram_media(token, file_data):
    file_id=str((file_data or {}).get("file_id",""))
    if not file_id or len(file_id)>256:
        raise ValueError("Telegram file id missing")
    info=_telegram_post(token,"getFile",{"file_id":file_id})
    if not info.get("ok"):raise ValueError("Telegram cannot read media")
    details=info.get("result") or {}
    size=details.get("file_size") or 0
    if size and (int(size)>MAX_MEDIA):raise ValueError("File too large")
    path=str(details.get("file_path") or "")
    if not path or path.startswith("/") or ".." in path or "\\" in path:raise ValueError("Bad media path")
    req=Request("https://api.telegram.org/file/bot"+token+"/"+quote(path,safe="/"),
                headers={"User-Agent":"UVMALL-AI/3.0"})
    with urlopen(req,timeout=16) as r:
        content=r.read(MAX_MEDIA+1)
    if not content or len(content)>MAX_MEDIA:
        raise ValueError("Media file too large or empty")
    return content

def _telegram_post(token,method,body):
    payload=json.dumps(body).encode()
    req=Request("https://api.telegram.org/bot"+token+"/"+method,data=payload,
                headers={"Content-Type":"application/json"},method="POST")
    with urlopen(req,timeout=18) as r:return json.loads(r.read())

def upload_gigachat(data, mime, filename,access_token,ssl_context):
    if not data or len(data)>MAX_MEDIA:raise ValueError("Invalid media")
    if mime not in ("image/jpeg","audio/x-ogg","audio/opus","audio/mpeg"):
        raise ValueError("Unsupported media")
    boundary="----UVMAI"+uuid.uuid4().hex
    pre=(
        "--"+boundary+"\r\n"
        'Content-Disposition: form-data; name="purpose"\r\n\r\n'
        "general\r\n"
        "--"+boundary+"\r\n"
        'Content-Disposition: form-data; name="file"; filename="'+filename+'"\r\n'
        "Content-Type: "+mime+"\r\n\r\n").encode()
    raw=pre+data+("\r\n--"+boundary+"--\r\n").encode()
    req=Request("https://api.giga.chat/v1/files",data=raw,
        headers={"Authorization":"Bearer "+access_token,
                 "Content-Type":"multipart/form-data; boundary="+boundary},
        method="POST")
    with urlopen(req,timeout=25,context=ssl_context) as r:
        response=json.loads(r.read())
    file_id=response.get("id") or ""
    if not file_id:raise ValueError("GigaChat upload rejected")
    return file_id

def describe_media(telegram_token, media, media_type, get_ai_access, ssl_context,
                   model="GigaChat-2-Pro"):
    if media_type not in ("photo","voice"):raise ValueError("Unknown media kind")
    raw=download_telegram_media(telegram_token,media)
    if media_type=="photo":
        if not raw.startswith(b"\xff\xd8\xff"):raise ValueError("Telegram photo is not JPEG")
        mime,filename="image/jpeg","image.jpg"
        question=("Опиши только товар на фотографии: вид предмета, материал, цвет, "
                  "назначение. Верни краткую строку поисковых слов по-русски, "
                  "без выдуманных брендов, цен и характеристик. "
                  "Если на фото не товар — напиши «не товар».")
    else:
        mime,filename="audio/x-ogg","voice.ogg"
        question=("Распознай голосовой запрос покупателя на русском языке. "
                  "Верни только дословную расшифровку речи, без пояснений. "
                  "Если ничего не слышно — напиши «неразборчиво».")
    token=get_ai_access()
    file_id=upload_gigachat(raw,mime,filename,token,ssl_context())
    body={
        "model":model,"messages":[{"role":"user","content":question,"attachments":[file_id]}],
        "temperature":0.1,"stream":False,"max_tokens":200,
    }
    request=Request("https://api.giga.chat/v1/chat/completions",
        data=json.dumps(body,ensure_ascii=False).encode(),
        headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        method="POST")
    with urlopen(request,timeout=30,context=ssl_context()) as r:
        answer=json.loads(r.read())
    response=answer.get("choices",[{}])[0].get("message",{}).get("content","")
    if not isinstance(response,str):response=str(response)
    return response.strip()[:500]
