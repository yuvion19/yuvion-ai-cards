"""Customer PII safeguards and bounded AI request admission.

No storage or output of raw secrets. Valid card PANs are detected using Luhn.
"""
import re

EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)(?:(?:\+7|8)[\s()\-]*\d[\d\s()\-]{8,14})(?!\w)")
TELEGRAM_TOKEN = re.compile(r"(?<![\w])\d{8,10}:[A-Za-z0-9_-]{30,}(?![\w])")
API_KEY = re.compile(r"(?<![\w])(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})(?![\w])")
SENSITIVE_TERMS = re.compile(
    r"(?i)(парол[ьяеию]?|password|паспорт|снилс|cvv|cvc|код\s+из\s+смс|sms[\s-]*код|"
    r"секретн\w*\s+ключ|api[\s_-]*key|access[\s_-]*token|bearer\s+|"
    r"токен(?:\s+доступа)?|secret[\s_-]*key)")
CARD_CANDIDATE = re.compile(r"(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)")

def luhn(digits):
    """The mathematical checksum does not imply a real, active payment card."""
    if not 13<=len(digits)<=19 or not digits.isdigit():
        return False
    total=0
    for i, ch in enumerate(reversed(digits)):
        n=int(ch)
        if i%2:
            n=n*2
            if n>9:n-=9
        total+=n
    return total%10==0

def contains_payment_card(text):
    return any(luhn(re.sub(r"\D","",x.group()))
               for x in CARD_CANDIDATE.finditer(str(text or "")))

def sensitive(text):
    raw=str(text or "")
    return bool(SENSITIVE_TERMS.search(raw) or TELEGRAM_TOKEN.search(raw)
                or API_KEY.search(raw) or contains_payment_card(raw))

def prepare_for_ai(text,maxlen=1200):
    raw=str(text or "")
    if sensitive(raw):
        return None
    masked=EMAIL.sub("[email скрыт]",raw)
    masked=PHONE.sub("[телефон скрыт]",masked)
    masked=re.sub(r"(?i)(telegram\s*id|телеграм\s*id|chat\s*id)\s*[:№]?\s*\d{6,14}",
                  "[telegram id скрыт]",masked)
    return masked[:maxlen].strip()
