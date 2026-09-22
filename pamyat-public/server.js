import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import webpush from "web-push";
import multer from "multer";
import QRCode from "qrcode";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ADMIN_LOGIN_USER = process.env.ADMIN_LOGIN_USER || "";
const ADMIN_LOGIN_SALT = process.env.ADMIN_LOGIN_SALT || "";
const ADMIN_LOGIN_PASSWORD_HASH = process.env.ADMIN_LOGIN_PASSWORD_HASH || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || ((PUBLIC_BASE_URL || "").replace(/\/$/,"") + "/pamyat-juhuro");
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@pamyat.community";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "Память <onboarding@resend.dev>";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "";
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "";
const WHATSAPP_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || "ru";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";
const BACKUP_WEBHOOK_URL = process.env.BACKUP_WEBHOOK_URL || "";
const BACKUP_WEBHOOK_TOKEN = process.env.BACKUP_WEBHOOK_TOKEN || "";
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const identifyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 900000 }, fileFilter: (_req,file,cb)=>cb(null,/^image\//.test(file.mimetype)) });
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1500000 },
  fileFilter: (_req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(file.mimetype))
});
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5000000 },
  fileFilter: (_req,file,cb)=>cb(
    null,
    /csv|text\/plain|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i.test(file.mimetype||"")
      || /\.(csv|xlsx|xls)$/i.test(file.originalname||"")
  )
});

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
    "connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use((req,res,next)=>{
  const p=req.path;
  const cemeteryPublic =
    p.startsWith("/api/cemetery/") ||
    p.startsWith("/api/admin/cemetery/") ||
    p.startsWith("/api/admin/identification") ||
    p.startsWith("/api/family/") ||
    p.startsWith("/api/admin/family/person/") ||
    p.startsWith("/api/admin/family/relation/") ||
    p.startsWith("/qr/cemetery/") ||
    p==="/m/catalog" ||
    p==="/m/map" ||
    p.startsWith("/m/person/") ||
    p==="/m/route" ||
    p==="/m/identify" ||
    p.startsWith("/m/identify/") ||
    p==="/m/offline" ||
    p==="/m/family";
  if(cemeteryPublic) {
    if (p.startsWith("/api/") || p.startsWith("/qr/")) return res.status(404).json({error:"not_found"});
    return res.redirect(302,"/m");
  }
  next();
});
app.use("/vendor/leaflet", express.static(path.join(__dirname, "node_modules", "leaflet", "dist"), { immutable: true, maxAge: "365d" }));

function htmlEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function spamTrap(body){
  const b=body||{};
  return Boolean(clean(b.website,200)||clean(b.company_website,200)||clean(b.fax_number,100));
}
async function verifyTurnstileToken(token){
  if(!TURNSTILE_SECRET_KEY)return true;
  if(!token)return false;
  try{
    const form=new URLSearchParams({secret:TURNSTILE_SECRET_KEY,response:String(token)});
    const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form.toString()
    });
    const d=await r.json();return Boolean(d.success);
  }catch{return false}
}

function safeSourceLink(v){
  const raw=String(v||"").trim();if(!raw)return null;
  try{
    const u=new URL(raw);
    if(u.protocol!=="https:")return null;
    const allowed=new Set(["matzevalog.github.io","jewishgen.org","www.jewishgen.org","findagrave.com","www.findagrave.com"]);
    return allowed.has(u.hostname.toLowerCase())?u.toString():null;
  }catch{return null}
}

function isMobileUA(req) {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(String(req.headers["user-agent"] || ""));
}
const MOBILE_I18N={
  en:{
    "Память Джуури":"Juhuri Memory","Меню":"Menu","Главная":"Home","Мобильная версия":"Mobile version",
    "+ Добавить событие":"+ Add event","Срочное похоронное объявление":"Urgent funeral notice","Поиск по памяти":"Memory search",
    "Стена памяти":"Memory wall","Календарь":"Calendar","Сегодня вспоминаем":"Remembering today","Напоминания":"Reminders",
    "Модерация":"Moderation","Открыть полную версию":"Open full version","Найти":"Search","Открыть памятную страницу":"Open memorial page",
    "Почтить память":"Remember","Добавить в календарь":"Add to calendar","Поделиться":"Share","Печатная карточка":"Printable card",
    "Зажечь свечу":"Light a candle","Нер нешама — свеча памяти":"Ner Neshama — memorial candle",
    "Подтверждено семьёй ✓":"Family verified ✓","Добрые слова":"Kind words","Сообщить об ошибке":"Report an error",
    "Ваше имя":"Your name","Дата":"Date","Место":"Place","Город":"City","Комментарий":"Comment",
    "Войти":"Sign in","Выйти":"Sign out","Показать пароль":"Show password","Поиск":"Search","Архив":"Archive","Режим памяти":"Memorial mode","Выйти из режима памяти":"Exit memorial mode"
  },
  he:{
    "Память Джуури":"זיכרון ג׳והורי","Меню":"תפריט","Главная":"ראשי","Мобильная версия":"גרסה לנייד",
    "+ Добавить событие":"+ הוספת אירוע","Срочное похоронное объявление":"הודעת לוויה דחופה","Поиск по памяти":"חיפוש בזיכרון",
    "Стена памяти":"קיר זיכרון","Календарь":"לוח שנה","Сегодня вспоминаем":"זוכרים היום","Напоминания":"תזכורות",
    "Модерация":"ניהול","Открыть полную версию":"פתיחת הגרסה המלאה","Найти":"חיפוש","Открыть памятную страницу":"פתיחת דף הזיכרון",
    "Почтить память":"לכבד את הזיכרון","Добавить в календарь":"הוספה ליומן","Поделиться":"שיתוף","Печатная карточка":"כרטיס להדפסה",
    "Зажечь свечу":"הדלקת נר","Нер нешама — свеча памяти":"נר נשמה","Подтверждено семьёй ✓":"אומת על ידי המשפחה ✓",
    "Добрые слова":"מילות זיכרון","Сообщить об ошибке":"דיווח על טעות","Ваше имя":"השם שלך","Дата":"תאריך","Место":"מקום",
    "Город":"עיר","Комментарий":"הערה","Войти":"כניסה","Выйти":"יציאה","Показать пароль":"הצגת סיסמה","Поиск":"חיפוש","Архив":"ארכיון","Режим памяти":"מצב זיכרון","Выйти из режима памяти":"יציאה ממצב זיכרון"
  },
  az:{
    "Память Джуури":"Cuhuri Yaddaşı","Меню":"Menyu","Главная":"Ana səhifə","Мобильная версия":"Mobil versiya",
    "+ Добавить событие":"+ Hadisə əlavə et","Срочное похоронное объявление":"Təcili dəfn elanı","Поиск по памяти":"Xatirələr üzrə axtarış",
    "Стена памяти":"Xatirə divarı","Календарь":"Təqvim","Сегодня вспоминаем":"Bu gün xatırlayırıq","Напоминания":"Xatırlatmalar",
    "Модерация":"Moderasiya","Открыть полную версию":"Tam versiyanı aç","Найти":"Axtar","Открыть памятную страницу":"Xatirə səhifəsini aç",
    "Почтить память":"Xatirəsini yad et","Добавить в календарь":"Təqvimə əlavə et","Поделиться":"Paylaş","Печатная карточка":"Çap kartı",
    "Зажечь свечу":"Şam yandır","Нер нешама — свеча памяти":"Ner Neşama — xatirə şamı","Подтверждено семьёй ✓":"Ailə tərəfindən təsdiqlənib ✓",
    "Добрые слова":"Xatirə sözləri","Сообщить об ошибке":"Səhv barədə bildir","Ваше имя":"Adınız","Дата":"Tarix","Место":"Yer",
    "Город":"Şəhər","Комментарий":"Şərh","Войти":"Daxil ol","Выйти":"Çıx","Показать пароль":"Şifrəni göstər","Поиск":"Axtarış","Архив":"Arxiv","Режим памяти":"Xatirə rejimi","Выйти из режима памяти":"Xatirə rejimindən çıx"
  },
  juuri:{
    "Память Джуури":"Ёр Джуури",
    "Меню":"Меню",
    "Главная":"Главная",
    "Мобильная версия":"Мобильная версия",
    "Календарь":"Луьвэхь",
    "Сегодня":"Имуруз",
    "Сегодня вспоминаем":"Имуруз — ёр",
    "Память":"Ёр",
    "Помнить":"Э ёр гуьрде",
    "Молитва":"Тефило",
    "Молитвы и тексты памяти":"Тефило — тексты ёр",
    "Семья":"Кифлет / мишпохьо",
    "Подтверждено семьёй ✓":"Кифлет ✓",
    "Свеча":"ШэгIм / чирогъ",
    "Нер нешама — свеча памяти":"Нер нешама — шэгIм ёр",
    "Календарь памяти":"Луьвэхь ёр",
    "Поиск":"Поиск",
    "Архив":"Архив",
    "Режим памяти":"Режим ёр",
    "Выйти из режима памяти":"Выйти из режима ёр"

  }
};

Object.assign(MOBILE_I18N.en,{
  "Простая версия без большого интерфейса. Критические функции работают отдельными страницами.":"A simple mobile version with the key functions on separate pages.",
  "ФИО или вариант имени":"Full name or name variant","Все типы":"All types","Только подтверждённые семьёй":"Family-verified only",
  "Ничего не найдено.":"Nothing found.","Дата смерти":"Date of death","Еврейская дата":"Hebrew date","Йорцайт":"Yahrzeit",
  "Режим памяти":"Memorial mode","Выйти из режима памяти":"Exit memorial mode","Молитвы и тексты памяти":"Prayers and memorial texts",
  "QR-код памятной страницы":"Memorial page QR code","Я родственник":"I am a relative","Кем приходитесь":"Relationship",
  "Контакт модератору":"Contact for moderator","Подтверждение / комментарий":"Evidence / comment","Отправить подтверждение":"Submit verification",
  "Сейчас указано":"Current value","Предлагаемое исправление":"Proposed correction","Отправить исправление":"Submit correction",
  "Отправить на модерацию":"Send for moderation","Зажжено свечей":"Candles lit","Пока нет опубликованных сообщений.":"No published messages yet.",
  "За 30 дней":"30 days before","За 14 дней":"14 days before","За 7 дней":"7 days before","За 3 дня":"3 days before","За 1 день":"1 day before",
  "В день события":"On the event day","Время по умолчанию":"Default time","Сохранить и включить":"Save and enable",
  "Отключить все каналы на этом устройстве":"Disable all channels on this device","Архив памяти":"Memory archive",
  "Год":"Year","Месяц":"Month","Все города":"All cities","Все события":"All events","Открыть":"Open",
  "Публичные подтверждённые памятные даты на сегодня.":"Public approved memorial dates for today.",
  "Памятная дата":"Memorial date","Срочное объявление":"Urgent notice","Фото":"Photo","Источник":"Source",
  "Добавить событие":"Add event","Отправить":"Submit","ФИО":"Full name","Тип события":"Event type",
  "Дата события":"Event date","Описание":"Description","Ваш контакт":"Your contact"
});
Object.assign(MOBILE_I18N.he,{
  "Простая версия без большого интерфейса. Критические функции работают отдельными страницами.":"גרסה ניידת פשוטה עם הפונקציות המרכזיות בעמודים נפרדים.",
  "ФИО или вариант имени":"שם מלא או גרסה של השם","Все типы":"כל הסוגים","Только подтверждённые семьёй":"רק רשומות שאומתו על ידי המשפחה",
  "Ничего не найдено.":"לא נמצאו תוצאות.","Дата смерти":"תאריך פטירה","Еврейская дата":"תאריך עברי","Йорцайт":"יארצייט",
  "Режим памяти":"מצב זיכרון","Выйти из режима памяти":"יציאה ממצב זיכרון","Молитвы и тексты памяти":"תפילות וטקסטים לזיכרון",
  "QR-код памятной страницы":"קוד QR של דף הזיכרון","Я родственник":"אני בן/בת משפחה","Кем приходитесь":"קרבה משפחתית",
  "Контакт модератору":"פרטי קשר למנהל","Подтверждение / комментарий":"אימות / הערה","Отправить подтверждение":"שליחת אימות",
  "Сейчас указано":"הערך הנוכחי","Предлагаемое исправление":"התיקון המוצע","Отправить исправление":"שליחת תיקון",
  "Отправить на модерацию":"שליחה לבדיקה","Зажжено свечей":"נרות הודלקו","Пока нет опубликованных сообщений.":"אין עדיין הודעות שפורסמו.",
  "За 30 дней":"30 יום לפני","За 14 дней":"14 יום לפני","За 7 дней":"7 ימים לפני","За 3 дня":"3 ימים לפני","За 1 день":"יום אחד לפני",
  "В день события":"ביום האירוע","Время по умолчанию":"שעת ברירת מחדל","Сохранить и включить":"שמירה והפעלה",
  "Отключить все каналы на этом устройстве":"כיבוי כל הערוצים במכשיר זה","Архив памяти":"ארכיון זיכרון",
  "Год":"שנה","Месяц":"חודש","Все города":"כל הערים","Все события":"כל האירועים","Открыть":"פתיחה",
  "Публичные подтверждённые памятные даты на сегодня.":"תאריכי זיכרון ציבוריים שאושרו להיום.",
  "Памятная дата":"תאריך זיכרון","Срочное объявление":"הודעה דחופה","Фото":"תמונה","Источник":"מקור",
  "Добавить событие":"הוספת אירוע","Отправить":"שליחה","ФИО":"שם מלא","Тип события":"סוג אירוע",
  "Дата события":"תאריך האירוע","Описание":"תיאור","Ваш контакт":"פרטי הקשר שלך"
});
Object.assign(MOBILE_I18N.az,{
  "Простая версия без большого интерфейса. Критические функции работают отдельными страницами.":"Əsas funksiyaların ayrı səhifələrdə olduğu sadə mobil versiya.",
  "ФИО или вариант имени":"Tam ad və ya ad variantı","Все типы":"Bütün növlər","Только подтверждённые семьёй":"Yalnız ailə tərəfindən təsdiqlənənlər",
  "Ничего не найдено.":"Heç nə tapılmadı.","Дата смерти":"Vəfat tarixi","Еврейская дата":"Yəhudi tarixi","Йорцайт":"Yortsayt",
  "Режим памяти":"Xatirə rejimi","Выйти из режима памяти":"Xatirə rejimindən çıx","Молитвы и тексты памяти":"Dualar və xatirə mətnləri",
  "QR-код памятной страницы":"Xatirə səhifəsinin QR-kodu","Я родственник":"Mən qohumam","Кем приходитесь":"Qohumluq əlaqəsi",
  "Контакт модератору":"Moderator üçün əlaqə","Подтверждение / комментарий":"Təsdiq / şərh","Отправить подтверждение":"Təsdiqi göndər",
  "Сейчас указано":"Hazırkı məlumat","Предлагаемое исправление":"Təklif olunan düzəliş","Отправить исправление":"Düzəlişi göndər",
  "Отправить на модерацию":"Moderasiya üçün göndər","Зажжено свечей":"Yandırılmış şamlar","Пока нет опубликованных сообщений.":"Hələ dərc olunmuş mesaj yoxdur.",
  "За 30 дней":"30 gün əvvəl","За 14 дней":"14 gün əvvəl","За 7 дней":"7 gün əvvəl","За 3 дня":"3 gün əvvəl","За 1 день":"1 gün əvvəl",
  "В день события":"Hadisə günü","Время по умолчанию":"Standart vaxt","Сохранить и включить":"Yadda saxla və aktiv et",
  "Отключить все каналы на этом устройстве":"Bu cihazda bütün kanalları söndür","Архив памяти":"Xatirə arxivi",
  "Год":"İl","Месяц":"Ay","Все города":"Bütün şəhərlər","Все события":"Bütün hadisələr","Открыть":"Aç",
  "Публичные подтверждённые памятные даты на сегодня.":"Bu gün üçün təsdiqlənmiş açıq xatirə tarixləri.",
  "Памятная дата":"Xatirə tarixi","Срочное объявление":"Təcili elan","Фото":"Foto","Источник":"Mənbə",
  "Добавить событие":"Hadisə əlavə et","Отправить":"Göndər","ФИО":"Tam ad","Тип события":"Hadisə növü",
  "Дата события":"Hadisə tarixi","Описание":"Təsvir","Ваш контакт":"Əlaqə məlumatınız"
});
// Juuri remains beta: untranslated strings deliberately fall back to Russian until reviewed by a fluent speaker.

function mobileShell(title, body, opts = {}) {
  const extraHead = opts.extraHead || "";
  const scripts = opts.scripts || "";
  const i18nJson=JSON.stringify(MOBILE_I18N).replace(/</g,"\\u003c");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#4c3e2d"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Память"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon.svg"><title>${htmlEsc(title)} — Память Джуури</title>${extraHead}<style>
  :root{--bg:#f5f1e8;--paper:#fffdf8;--ink:#27231e;--muted:#746d63;--line:#ded6c8;--accent:#5b4934;--soft:#eee6d9}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{position:sticky;top:0;z-index:9;background:#f5f1e8ee;border-bottom:1px solid var(--line);padding:10px 12px}.top{max-width:760px;margin:auto;display:flex;align-items:center;gap:8px}.brand{font-weight:800;flex:1}.wrap{max-width:760px;margin:auto;padding:14px 12px 60px}.nav{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0 16px}.btn,a.btn,button.btn{display:block;text-align:center;text-decoration:none;border:0;border-radius:12px;padding:12px;background:var(--accent);color:white;font-weight:750}.btn.secondary,a.btn.secondary{background:var(--soft);color:var(--ink)}.card{background:var(--paper);border:1px solid var(--line);border-radius:15px;padding:14px;margin:10px 0}.field{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:white;font:inherit}label{display:block;font-weight:700;margin:12px 0 5px}.muted{color:var(--muted);font-size:14px}.ok{background:#e4efe5;border-radius:12px;padding:12px}.err{background:#f5e2e2;border-radius:12px;padding:12px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{display:inline-block;background:var(--soft);border-radius:999px;padding:4px 7px;font-size:12px}.pager{display:flex;justify-content:space-between;gap:8px;margin:14px 0}.pager a{flex:1}.check{display:flex;gap:8px;align-items:flex-start;margin:8px 0}.check input{margin-top:4px}h1{font-size:28px;line-height:1.1;margin:6px 0 12px}#mobileMap{height:68vh;min-height:440px;border:1px solid var(--line);border-radius:14px;background:#ddd}.ner-wrap{text-align:center;padding:18px}.ner{position:relative;width:78px;height:124px;margin:34px auto 10px;border-radius:10px 10px 14px 14px;background:linear-gradient(#fffdf4,#ece7dc);border:1px solid #d7cdbd;box-shadow:0 10px 30px rgba(0,0,0,.12)}.ner:before{content:"✡";position:absolute;left:0;right:0;top:46px;font-size:26px;color:#4a5f8c}.flame{position:absolute;left:27px;top:-34px;width:24px;height:38px;border-radius:55% 45% 55% 45%;transform:rotate(8deg);background:radial-gradient(circle at 50% 70%,#fff7b2 0 20%,#f0a64a 45%,#c45b31 75%);box-shadow:0 0 20px rgba(240,166,74,.7);animation:flicker 1.4s infinite alternate}.flame.off{opacity:.2;filter:grayscale(1)}@keyframes flicker{from{transform:rotate(5deg) scale(.96)}to{transform:rotate(12deg) scale(1.04)}}.skip{position:absolute;left:-9999px}.skip:focus{left:8px;top:8px;z-index:999;background:#fff;padding:10px;border-radius:8px}.btn:focus,.field:focus,input:focus,select:focus,textarea:focus{outline:3px solid #8b6d45;outline-offset:2px}.prayer-line{border-top:1px solid var(--line);padding:12px 0}.prayer-line:first-of-type{border-top:0}.he-prayer{font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.9;text-align:right}.prayer-tr{margin-top:5px;font-size:16px;font-weight:650;line-height:1.55}.prayer-card details{padding:6px 0}.prayer-card summary{cursor:pointer;padding:8px 0}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}body[data-font="large"]{font-size:19px}body[data-font="xlarge"]{font-size:22px}body[data-contrast="high"]{--bg:#fff;--paper:#fff;--ink:#000;--muted:#222;--line:#000;--accent:#000;--soft:#fff}body[data-contrast="high"] .btn.secondary,body[data-contrast="high"] a.btn.secondary{border:2px solid #000}body[data-contrast="high"] .card{border-width:2px}body.memory-mode{background:#17130f;color:#f8f2e7}body.memory-mode header{display:none}body.memory-mode .wrap{max-width:900px;padding-top:32px}body.memory-mode .memory-hide{display:none!important}body.memory-mode .memory-hero{background:#211b15;border-color:#4d4033;color:#f8f2e7}body.memory-mode .memory-hero .muted{color:#cbbdac}body.memory-mode .memory-exit{display:block!important;position:fixed;right:16px;top:16px;z-index:30}
  </style></head><body><a class="skip" href="#main">К содержанию</a><header><div class="top"><div class="brand">Память Джуури</div><select id="uiLang" class="field" style="width:auto;padding:8px" aria-label="Язык"><option value="ru">RU</option><option value="juuri">JUURI β</option><option value="he">HE</option><option value="en">EN</option><option value="az">AZ</option></select><button id="fontDown" class="btn secondary" style="padding:8px" aria-label="Уменьшить шрифт">A−</button><button id="fontUp" class="btn secondary" style="padding:8px" aria-label="Увеличить шрифт">A+</button><button id="contrastToggle" class="btn secondary" style="padding:8px" aria-label="Высокая контрастность">◐</button><a class="btn secondary" href="/m/inbox" style="padding:8px" aria-label="Центр уведомлений">🔔</a><a class="btn secondary" href="/m">Меню</a></div></header><main id="main" class="wrap">${body}</main><script>
  (()=>{
    const dictionaries=${i18nJson};
    const params=new URLSearchParams(location.search);
    const saved=localStorage.getItem("pamyatLang");
    const lang=params.get("lang")||saved||"ru";
    const select=document.getElementById("uiLang");if(select)select.value=["ru","juuri","he","en","az"].includes(lang)?lang:"ru";
    const applyLanguage=l=>{
      localStorage.setItem("pamyatLang",l);
      document.documentElement.lang=l==="juuri"?"jdt":l;
      document.documentElement.dir=l==="he"?"rtl":"ltr";
      const d=dictionaries[l]||{};
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const n of nodes){const raw=n.nodeValue,trim=raw.trim();if(trim&&d[trim])n.nodeValue=raw.replace(trim,d[trim])}
      document.querySelectorAll("[placeholder]").forEach(el=>{const p=el.getAttribute("placeholder");if(d[p])el.setAttribute("placeholder",d[p])});
    };
    applyLanguage(lang);
    if(select)select.onchange=()=>{const u=new URL(location.href);u.searchParams.set("lang",select.value);localStorage.setItem("pamyatLang",select.value);location.href=u.toString()};
    const levels=["","large","xlarge"];let fi=Number(localStorage.getItem("pamyatFont")||0);document.body.dataset.font=levels[fi]||"";
    document.getElementById("fontUp").onclick=()=>{fi=Math.min(2,fi+1);localStorage.setItem("pamyatFont",fi);document.body.dataset.font=levels[fi]};
    document.getElementById("fontDown").onclick=()=>{fi=Math.max(0,fi-1);localStorage.setItem("pamyatFont",fi);document.body.dataset.font=levels[fi]};
    const contrast=localStorage.getItem("pamyatContrast")==="high";if(contrast)document.body.dataset.contrast="high";
    document.getElementById("contrastToggle").onclick=()=>{const high=document.body.dataset.contrast!=="high";document.body.dataset.contrast=high?"high":"";localStorage.setItem("pamyatContrast",high?"high":"")};
  })();
  </script>${scripts}</body></html>`;
}

app.get("/m", (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.send(mobileShell("Главная", `
    <h1>Мобильная версия</h1>
    <p class="muted">Простая версия без большого интерфейса. Критические функции работают отдельными страницами.</p>
    <div class="nav">
      <a class="btn" href="/m/add">+ Добавить событие</a>
      <a class="btn" href="/m/add?funeral=1">Срочное похоронное объявление</a>
      <a class="btn" href="/m/search">Поиск по памяти</a>
      <a class="btn" href="/m/wall">Стена памяти</a>
      <a class="btn" href="/m/calendar">Календарь</a>
      <a class="btn" href="/m/archive">Архив</a>
      <a class="btn" href="/m/today">Сегодня вспоминаем</a>
      <a class="btn" href="/m/feed">Лента памяти</a>
      <a class="btn" href="/m/book">Книга памяти</a>
      <a class="btn" href="/m/inbox">Центр уведомлений</a>
      <a class="btn" href="/m/reminders">Напоминания</a>
      <a class="btn" href="/api/selftest">Проверка системы</a>
      <a class="btn secondary" href="/m/admin">Модерация</a>
    </div>
    <button class="btn secondary" id="installApp" style="width:100%;display:none;margin-bottom:8px">Установить приложение</button>
    <a class="btn secondary" href="/pamyat-juhuro?desktop=1">Открыть полную версию</a>
  `,{scripts:`<script>
    let installPrompt=null;const btn=document.getElementById("installApp");
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;btn.style.display="block"});
    btn.onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;btn.style.display="none"};
  </script>`}));
});

app.get("/m/feed", async (_req,res)=>{
  try{
    const d=await sb("rpc/memorial_memory_feed",{method:"POST",body:{p_limit:40}});
    const cards=rows=>(rows||[]).map(e=>'<div class="card"><span class="tag">'+htmlEsc(e.event_type||"Памятная дата")+'</span><h3>'+htmlEsc(e.full_name||"")+'</h3><div>'+htmlEsc(e.event_date||"")+'</div><div class="muted">'+htmlEsc([e.city,e.place].filter(Boolean).join(" · "))+'</div><div class="muted">Свечей памяти: '+Number(e.candles||0)+'</div><p><a class="btn secondary" href="/m/memorial/'+encodeURIComponent(e.id)+'">Открыть</a></p></div>').join("");
    res.send(mobileShell("Лента памяти",'<h1>Лента памяти</h1><p class="muted">Спокойная лента без лайков и рейтингов.</p><h2>Сегодня вспоминаем</h2>'+(cards(d?.today)||'<div class="card muted">На сегодня записей нет.</div>')+'<h2>Ближайшие 30 дней</h2>'+(cards(d?.upcoming)||'<div class="card muted">Ближайших дат нет.</div>')+'<h2>Недавно добавлено</h2>'+(cards(d?.recent)||'<div class="card muted">Пока нет записей.</div>')));
  }catch(e){res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить ленту памяти.</div>'))}
});

app.get("/m/book", async (_req,res)=>{
  try{
    const rows=await sb("rpc/memorial_memory_book",{method:"POST",body:{p_limit:200}});
    const cards=(rows||[]).map(x=>'<div class="card"><b>'+htmlEsc(x.author||"Гость")+'</b><div>'+htmlEsc(x.body||"")+'</div><div class="muted">В память о '+htmlEsc(x.full_name||"")+' · '+htmlEsc(String(x.created_at||"").slice(0,10))+'</div><p><a class="btn secondary" href="/m/memorial/'+encodeURIComponent(x.event_id)+'">Открыть памятную страницу</a></p></div>').join("");
    res.send(mobileShell("Книга памяти",'<h1>Книга памяти</h1><p class="muted">Одобренные добрые слова и воспоминания. Без лайков и рейтингов.</p>'+(cards||'<div class="card muted">Пока нет опубликованных воспоминаний.</div>')));
  }catch(e){res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить книгу памяти.</div>'))}
});

app.get("/m/inbox", (_req,res)=>{
  res.setHeader("Cache-Control","no-store");
  res.send(mobileShell("Центр уведомлений",`
    <h1>Центр уведомлений</h1>
    <p class="muted">Здесь сохраняются важные напоминания даже если внешний канал не доставил сообщение.</p>
    <button id="markAllInbox" class="btn secondary" style="width:100%;margin-bottom:10px">Отметить всё прочитанным</button>
    <div id="inboxList"><div class="card muted">Загрузка…</div></div>
  `,{scripts:`<script>
  (()=>{
    const key="pamyat_device_token",box=document.getElementById("inboxList");
    const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[m]));
    function token(){let t=localStorage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(t||"")){t=crypto.randomUUID();localStorage.setItem(key,t)}return t}
    async function load(){
      const r=await fetch("/api/inbox?device_token="+encodeURIComponent(token()),{cache:"no-store"}),d=await r.json();
      if(!r.ok){box.innerHTML='<div class="err">Не удалось загрузить уведомления.</div>';return}
      const items=d.items||[];
      box.innerHTML=(d.unread?'<div class="card"><b>Непрочитанных: '+Number(d.unread)+'</b></div>':'')+(items.map(x=>'<div class="card" style="'+(x.read_at?'opacity:.72':'border-width:2px')+'"><span class="tag">'+esc(x.kind||"")+'</span><h3>'+esc(x.title||"")+'</h3><div>'+esc(x.body||"")+'</div><div class="muted">'+esc(new Date(x.created_at).toLocaleString("ru-RU"))+'</div><div class="row" style="margin-top:8px">'+(x.url?'<a class="btn secondary" href="'+esc(x.url)+'">Открыть</a>':'')+(!x.read_at?'<button class="btn secondary" data-read="'+esc(x.id)+'">Прочитано</button>':'')+'</div></div>').join("")||'<div class="card muted">Уведомлений пока нет.</div>');
      box.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{await fetch("/api/inbox/read",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_token:token(),id:b.dataset.read})});load()});
    }
    document.getElementById("markAllInbox").onclick=async()=>{await fetch("/api/inbox/read",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_token:token()})});load()};
    load();
  })();
  </script>`}));
});

app.get("/m/catalog", async (req,res) => {
  try {
    res.setHeader("Cache-Control","no-store");
    const q=clean(req.query.q,180);
    const page=Math.max(1,Number(req.query.page||1));
    const limit=50;
    let rows;
    if(q) {
      rows=await sb("rpc/memorial_cemetery_search",{method:"POST",body:{p_query:q,p_limit:100}});
    } else {
      const params=new URLSearchParams();
      params.set("select","record_key,external_id,name_ru,name_he,death_gr,death_he,latitude,longitude,source_url,quality_status");
      params.set("cemetery_code","eq.QBA");
      params.set("order","external_id.asc,person_index.asc");
      params.set("limit",String(limit));
      params.set("offset",String((page-1)*limit));
      rows=await sb("cemetery_records?"+params.toString());
    }
    const list=(rows||[]).map(x=>`<label class="card" style="display:block"><div class="row"><input type="checkbox" name="key" value="${htmlEsc(x.record_key)}"><span class="tag">${htmlEsc(x.external_id)}</span>${x.death_gr?`<span class="tag">${htmlEsc(x.death_gr)}</span>`:""}${x.quality_status?`<span class="tag">${qualityLabel(x.quality_status)}</span>`:""}</div><h3>${htmlEsc(x.name_ru||"Без имени")}</h3>${x.name_he?`<div dir="rtl">${htmlEsc(x.name_he)}</div>`:""}<div class="row" style="margin-top:10px"><a class="btn secondary" href="/m/person/${encodeURIComponent(x.record_key)}">Карточка</a><a class="btn secondary" href="${htmlEsc(x.source_url)}" target="_blank" rel="noopener">Источник</a>${x.latitude&&x.longitude?`<a class="btn secondary" href="/m/map?lat=${encodeURIComponent(x.latitude)}&lon=${encodeURIComponent(x.longitude)}&name=${encodeURIComponent(x.name_ru||x.external_id)}">На карте</a>`:""}</div></label>`).join("");
    const pager=q?"":`<div class="pager">${page>1?`<a class="btn secondary" href="/m/catalog?page=${page-1}">← Назад</a>`:"<span></span>"}<a class="btn secondary" href="/m/catalog?page=${page+1}">Далее →</a></div>`;
    res.send(mobileShell("Каталог кладбища", `
      <h1>Каталог кладбища</h1>
      <form method="get" action="/m/catalog"><label>Поиск по имени, QBA или ивриту</label><input class="field" name="q" value="${htmlEsc(q)}"><button class="btn" style="width:100%;margin-top:8px">Найти</button></form>
      ${q?`<p class="muted">Результаты поиска: ${rows.length}</p>`:`<p class="muted">Страница ${page}, по 50 записей</p>`}
      <form method="get" action="/m/route">
      ${list||'<div class="card">Ничего не найдено.</div>'}
      ${rows.length?'<button class="btn" style="width:100%;margin:10px 0">Маршрут по выбранным могилам</button>':""}
      </form>${pager}
    `));
  } catch(e) {
    console.error("mobile catalog",e.data||e);
    res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить каталог.</div>'));
  }
});

app.get("/m/map", (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  const lat=Number(_req.query.lat||41.3697), lon=Number(_req.query.lon||48.5063), name=clean(_req.query.name,120);
  const extraHead='<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"><script src="/vendor/leaflet/leaflet.js"></script>';
  const scripts=`<script>
  (async()=>{try{
    const map=L.map("mobileMap").setView([${Number.isFinite(lat)?lat:41.3697},${Number.isFinite(lon)?lon:48.5063}],${name?19:16});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:"© OpenStreetMap"}).addTo(map);
    const r=await fetch("/api/cemetery/map?limit=2200",{cache:"no-store"}); if(!r.ok)throw new Error("HTTP "+r.status);
    const rows=await r.json(), markers=[];
    for(const x of rows){const a=Number(x.latitude),b=Number(x.longitude);if(!Number.isFinite(a)||!Number.isFinite(b))continue;const m=L.circleMarker([a,b],{radius:4,weight:1,fillOpacity:.8}).addTo(map);m.bindPopup("<b>"+String(x.name_ru||x.external_id).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+"</b><br>"+x.external_id);markers.push(m)}
    document.getElementById("mapStatus").textContent="Загружено точек: "+markers.length;
    ${name?`L.popup().setLatLng([${lat},${lon}]).setContent("<b>${htmlEsc(name)}</b>").openOn(map);`:`if(markers.length)map.fitBounds(L.featureGroup(markers).getBounds().pad(.05),{maxZoom:18});`}
    setTimeout(()=>map.invalidateSize(),200);
  }catch(e){document.getElementById("mapStatus").innerHTML="Карта не загрузилась. <a href='/m/catalog'>Открыть каталог</a>";console.error(e)}})();
  </script>`;
  res.send(mobileShell("Карта кладбища",`<h1>Карта кладбища Кубы</h1><p id="mapStatus" class="muted">Загрузка точек…</p><div id="mobileMap"></div><p><a class="btn secondary" href="/m/catalog">Открыть каталог</a></p>`,{extraHead,scripts}));
});


app.get("/m/search", async (req,res) => {
  try{
    const q=clean(req.query.q,180),city=clean(req.query.city,120),type=clean(req.query.type,80);
    const family=String(req.query.family||"")==="1";
    let rows=[];
    if(q||city||type||family){
      rows=await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:q,p_city:city,p_type:type,p_limit:300}});
      if(family)rows=(rows||[]).filter(x=>x.family_verified);
    }
    const grouped=[],seen=new Set();
    for(const e of rows||[]){
      const key=String(e.full_name||"").toLowerCase()+"|"+String(e.death_date||"");
      if(seen.has(key))continue;
      seen.add(key);grouped.push(e);
    }
    const types=["","Похороны","7 дней","40 дней","1 год","Годовщина","Йорцайт","Памятная дата"];
    const cards=grouped.map(e=>`<div class="card">
      <div class="row"><span class="tag">${htmlEsc(e.event_type||"Памятная дата")}</span>${e.family_verified?'<span class="tag">Подтверждено семьёй ✓</span>':""}</div>
      <h3>${htmlEsc(e.full_name||"Без имени")}</h3>
      <div>${htmlEsc(e.event_date||"")}</div>
      <div class="muted">${htmlEsc([e.city,e.place].filter(Boolean).join(" · "))}</div>
      <p><a class="btn secondary" href="/m/memorial/${encodeURIComponent(e.id)}">Открыть памятную страницу</a></p>
    </div>`).join("");
    res.send(mobileShell("Поиск",`
      <h1>Поиск по памяти</h1>
      <form method="get" action="/m/search" class="card">
        <label>ФИО или вариант имени</label>
        <input class="field" name="q" value="${htmlEsc(q)}" placeholder="Например: Юсуф, Йосеф, Yusuf, Yosef">
        <label>Город</label><input class="field" name="city" value="${htmlEsc(city)}">
        <label>Тип события</label><select class="field" name="type">${types.map(x=>'<option value="'+htmlEsc(x)+'" '+(x===type?'selected':'')+'>'+(x||"Все типы")+'</option>').join("")}</select>
        <label class="check"><input type="checkbox" name="family" value="1" ${family?"checked":""}><span>Только подтверждённые семьёй</span></label>
        <button class="btn" style="width:100%;margin-top:10px">Найти</button>
      </form>
      ${(q||city||type||family)?('<p class="muted">Найдено: '+grouped.length+'</p>'+ (cards||'<div class="card">Ничего не найдено.</div>')):'<div class="card muted">Поиск поддерживает варианты имён, алиасы и неточные совпадения.</div>'}
    `));
  }catch(e){console.error("mobile search",e.data||e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось выполнить поиск.</div>'))}
});

app.get("/m/wall", async (_req,res) => {
  try{
    const rows=await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:"",p_city:"",p_type:"",p_limit:300}});
    const people=new Map();
    for(const e of rows||[]){
      const key=String(e.full_name||"").toLowerCase()+"|"+String(e.death_date||"");
      if(!people.has(key))people.set(key,{...e,dates:[]});
      people.get(key).dates.push({type:e.event_type,date:e.event_date});
    }
    const list=[...people.values()].slice(0,120);
    const ids=list.map(x=>x.id).filter(Boolean);
    let counts={};
    if(ids.length){
      const params=new URLSearchParams();
      params.set("select","event_id,count");
      params.set("event_id","in.("+ids.join(",")+")");
      const rows2=await sb("memorial_candles?"+params.toString()).catch(()=>[]);
      counts=Object.fromEntries((rows2||[]).map(x=>[x.event_id,x.count]));
    }
    const cards=list.map(e=>`<div class="card" style="text-align:center">
      <img src="/api/events/${encodeURIComponent(e.id)}/photo" alt="Фото ${htmlEsc(e.full_name||"")}" style="width:112px;height:112px;object-fit:cover;border-radius:50%;margin:0 auto 8px;display:block" onerror="this.style.display='none'">
      <div style="font-size:30px">✡</div>
      <h3 style="margin:6px 0">${htmlEsc(e.full_name||"Без имени")}</h3>
      ${e.death_date?'<div class="muted">Дата смерти: '+htmlEsc(e.death_date)+'</div>':""}
      ${e.family_verified?'<span class="tag">Подтверждено семьёй ✓</span>':""}
      <div class="muted" style="margin-top:6px">Свечей: ${Number(counts[e.id]||0)}</div>
      <p><a class="btn secondary" href="/m/memorial/${encodeURIComponent(e.id)}">Почтить память</a></p>
    </div>`).join("");
    res.send(mobileShell("Стена памяти",`
      <h1>Стена памяти</h1>
      <p class="muted">Публичные записи сообщества. Один человек показывается один раз, даже если у него несколько памятных дат.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">${cards||'<div class="card">Публичных записей пока нет.</div>'}</div>
    `));
  }catch(e){console.error("memory wall",e.data||e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить стену памяти.</div>'))}
});

app.get("/m/archive", async (req,res) => {
  try{
    const year=clean(req.query.year,4),month=clean(req.query.month,2),type=clean(req.query.type,80),city=clean(req.query.city,120);
    const family=String(req.query.family||"")==="1";
    let rows=await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:"",p_city:city,p_type:type,p_limit:500}});
    const years=[...new Set((rows||[]).map(x=>String(x.event_date||"").slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
    rows=(rows||[]).filter(e=>{
      const d=String(e.event_date||"");
      if(year&&d.slice(0,4)!==year)return false;
      if(month&&d.slice(5,7)!==month.padStart(2,"0"))return false;
      if(family&&!e.family_verified)return false;
      return true;
    }).sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||"")));
    const cards=rows.map(e=>`<div class="card"><div class="row"><span class="tag">${htmlEsc(e.event_type||"")}</span>${e.family_verified?'<span class="tag">Подтверждено семьёй ✓</span>':""}</div><h3>${htmlEsc(e.full_name)}</h3><div>${htmlEsc(e.event_date||"")}</div><div class="muted">${htmlEsc([e.city,e.place].filter(Boolean).join(" · "))}</div><p><a class="btn secondary" href="/m/memorial/${encodeURIComponent(e.id)}">Открыть памятную страницу</a></p></div>`).join("");
    const types=["","Похороны","7 дней","40 дней","1 год","Годовщина","Йорцайт","Памятная дата"];
    res.send(mobileShell("Архив",`
      <h1>Архив</h1>
      <form class="card" method="get" action="/m/archive">
        <label>Год</label><select class="field" name="year"><option value="">Все годы</option>${years.map(y=>'<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>').join("")}</select>
        <label>Месяц</label><select class="field" name="month"><option value="">Все месяцы</option>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m=>'<option value="'+m+'" '+(m===month.padStart(2,"0")?'selected':'')+'>'+m+'</option>').join("")}</select>
        <label>Тип</label><select class="field" name="type">${types.map(x=>'<option value="'+htmlEsc(x)+'" '+(x===type?'selected':'')+'>'+(x||"Все типы")+'</option>').join("")}</select>
        <label>Город</label><input class="field" name="city" value="${htmlEsc(city)}">
        <label class="check"><input type="checkbox" name="family" value="1" ${family?"checked":""}><span>Только подтверждённые семьёй</span></label>
        <button class="btn" style="width:100%;margin-top:10px">Показать</button>
      </form>
      <p class="muted">Записей: ${rows.length}</p>
      ${cards||'<div class="card">В архиве нет записей по выбранным фильтрам.</div>'}
    `));
  }catch(e){console.error("archive",e.data||e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить архив.</div>'))}
});

app.get("/m/calendar", async (_req,res) => {
  try {
    const rows=await sb("rpc/memorial_public_upcoming",{method:"POST",body:{p_days:60,p_limit:200}});
    const cards=(rows||[]).map(e=>`<div class="card">${e.urgent?'<span class="tag" style="background:#f5e2e2">Срочно</span>':""}<span class="tag">${htmlEsc(e.event_type)}</span><h3>${htmlEsc(e.full_name)}</h3><div>${htmlEsc(e.event_date||"")}</div><div class="muted">${htmlEsc([e.city,e.place].filter(Boolean).join(" · "))}</div><p><a class="btn secondary" href="/m/memorial/${encodeURIComponent(e.id)}">Открыть</a></p></div>`).join("");
    res.send(mobileShell("Календарь",`<h1>Ближайшие памятные даты</h1>${cards||'<div class="card">Ближайших событий нет.</div>'}`));
  } catch(e) {
    res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить календарь.</div>'));
  }
});




app.get("/m/today", async (_req,res) => {
  try{
    const rows=await sb("rpc/memorial_public_upcoming",{method:"POST",body:{p_days:0,p_limit:200}});
    const cards=(rows||[]).map(e=>`<div class="card">${e.urgent?'<span class="tag" style="background:#f5e2e2">Срочно</span>':""}<span class="tag">${htmlEsc(e.event_type)}</span><h3>${htmlEsc(e.full_name)}</h3><div class="muted">${htmlEsc([e.city,e.place].filter(Boolean).join(" · "))}</div><p><a class="btn" href="/m/memorial/${encodeURIComponent(e.id)}">Почтить память</a></p></div>`).join("");
    res.send(mobileShell("Сегодня вспоминаем",`<h1>Сегодня вспоминаем</h1><p class="muted">Публичные подтверждённые памятные даты на сегодня.</p>${cards||'<div class="card">На сегодня публичных памятных дат нет.</div>'}`));
  }catch(e){res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить даты.</div>'))}
});

app.get("/m/memorial/:id", async (req,res) => {
  try{
    const rawKey=clean(req.query.key,80);
    const accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const e=await sb("rpc/memorial_event_detail_access",{method:"POST",body:{p_event_id:req.params.id,p_share_token:accessKey}});
    if(!e)return res.status(404).send(mobileShell("Не найдено",'<div class="err">Памятная запись не найдена или ссылка недействительна.</div>'));
    const accessSuffix=accessKey?"?key="+encodeURIComponent(accessKey):"";
    const next=addDays(e.event_date,1), gStart=String(e.event_date||"").replaceAll("-",""), gEnd=String(next||"").replaceAll("-","");
    const eventTz=validIanaTimezone(e.event_timezone),hasTime=Boolean(calendarLocal(e.event_date,e.event_time)),endLocal=hasTime?addLocalMinutes(e.event_date,e.event_time,60):null;
    const googleParams={action:"TEMPLATE",text:(e.event_type||"Памятная дата")+" — "+e.full_name,dates:hasTime?(calendarLocal(e.event_date,e.event_time)+"/"+calendarLocal(endLocal.date,endLocal.time)):(gStart+"/"+gEnd),details:e.note||"",location:[e.place,e.city].filter(Boolean).join(", ")};
    if(hasTime)googleParams.ctz=eventTz;
    const google="https://calendar.google.com/calendar/render?"+new URLSearchParams(googleParams).toString();
    const outlook="https://outlook.live.com/calendar/0/deeplink/compose?"+new URLSearchParams({path:"/calendar/action/compose",rru:"addevent",subject:(e.event_type||"Памятная дата")+" — "+e.full_name,startdt:hasTime?(e.event_date+"T"+e.event_time+":00"):e.event_date,enddt:hasTime?(endLocal.date+"T"+endLocal.time+":00"):next,allday:hasTime?"false":"true",body:e.note||"",location:[e.place,e.city].filter(Boolean).join(", ")}).toString();
    const comments=(e.comments||[]).map(x=>'<div class="card"><b>'+htmlEsc(x.author||"Гость")+'</b><div>'+htmlEsc(x.body||"")+'</div><div class="muted">'+htmlEsc(String(x.created_at||"").slice(0,10))+'</div></div>').join("");
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,"");
    const canonical=base+"/m/memorial/"+encodeURIComponent(e.id)+accessSuffix;
    const ogImage=base+"/api/events/"+encodeURIComponent(e.id)+"/share-card.svg"+accessSuffix;
    const ogDescription=[e.event_type,e.event_date,e.city,e.place].filter(Boolean).join(" · ");
    const extraHead=(e.visibility!=="public"?'<meta name="robots" content="noindex,nofollow">':"")+'<link rel="canonical" href="'+htmlEsc(canonical)+'">'+
      '<meta name="description" content="'+htmlEsc(ogDescription)+'">'+
      '<meta property="og:type" content="article"><meta property="og:title" content="'+htmlEsc(e.full_name+" — Память")+'">'+
      '<meta property="og:description" content="'+htmlEsc(ogDescription)+'"><meta property="og:url" content="'+htmlEsc(canonical)+'">'+
      '<meta property="og:image" content="'+htmlEsc(ogImage)+'"><meta name="twitter:card" content="summary_large_image">';
    res.send(mobileShell(e.full_name,`
      <button class="btn secondary memory-hide" id="memoryMode" style="width:100%;margin-bottom:12px">Режим памяти</button>
      <button class="btn secondary memory-exit" id="memoryExit" style="display:none">Выйти из режима памяти</button>
      <section class="memory-hero card">
      ${e.urgent?'<div class="err"><b>Срочное объявление</b></div>':""}
      <div class="row"><span class="tag">${htmlEsc(e.event_type||"Памятная дата")}</span>${e.family_verified?'<span class="tag">Подтверждено семьёй ✓</span>':""}</div>
      <h1>${htmlEsc(e.full_name)}</h1>
      ${e.has_photo?'<div style="text-align:center;margin:14px 0"><img src="/api/events/'+encodeURIComponent(e.id)+'/photo'+accessSuffix+'" alt="Фото '+htmlEsc(e.full_name)+'" style="width:min(100%,360px);max-height:440px;object-fit:cover;border-radius:16px"></div>':""}
      <div>
        <div><b>Дата:</b> ${htmlEsc(e.event_date||"—")}${e.event_time?" · "+htmlEsc(e.event_time):""}${e.event_time&&e.event_timezone?' · '+htmlEsc(e.event_timezone):""}</div>
        ${e.event_time?'<div id="localEventTime" class="muted" style="margin-top:4px"></div>':""}
        <div><b>Место:</b> ${htmlEsc([e.city,e.place].filter(Boolean).join(" · ")||"—")}</div>
        ${(e.city||e.place)?'<p><a class="btn secondary" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([e.place,e.city].filter(Boolean).join(", "))+'">Маршрут к месту</a></p>':""}
        ${e.public_contact?'<div><b>Контакт семьи:</b> <a href="tel:'+htmlEsc(String(e.public_contact).replace(/[^+\\d]/g,""))+'">'+htmlEsc(e.public_contact)+'</a></div>':""}
        ${e.updated_at?'<div class="muted" style="margin-top:6px">Последнее обновление: '+htmlEsc(new Date(e.updated_at).toLocaleString("ru-RU"))+'</div>':""}
        ${e.hebrew_death_label?'<div><b>Еврейская дата:</b> '+htmlEsc(e.hebrew_death_label)+(e.hebrew_after_sunset?' · после захода солнца':'')+'</div>':""}
        ${e.yahrzeit_date?'<div><b>Йорцайт:</b> '+htmlEsc(e.yahrzeit_date)+'</div>':""}
        ${e.note?'<p>'+htmlEsc(e.note)+'</p>':""}
      </div>
      </section>

      <div class="card ner-wrap">
        <div class="ner"><div id="nerFlame" class="flame"></div></div>
        <div dir="rtl" style="font-size:20px;font-weight:800">נר נשמה</div>
        <div><b>Нер нешама — свеча памяти</b></div>
        <p class="muted">Зажгите виртуальную еврейскую свечу памяти. Без рейтингов и соревнования.</p>
        <button class="btn" id="lightNer" style="width:100%">Зажечь свечу</button>
        <div class="muted" style="margin-top:8px">Зажжено свечей: <span id="nerCount">${Number(e.candles||0)}</span></div>
      </div>

      <div class="card prayer-card">
        <h3 style="margin-top:0">Молитвы и тексты памяти</h3>
        <p class="muted">Для каждой строки есть ручная кириллическая транскрипция. Произношение и порядок чтения могут немного отличаться по нусаху и традиции общины; транскрипция помогает читать текст, но не заменяет живую общинную традицию.</p>
        <label>Традиция / нусах</label>
        <select id="prayerTradition" class="field">
          <option value="all">Все доступные тексты</option>
          <option value="sephardic">Сефардская / восточная традиция</option>
          <option value="mountain">Горско-еврейская община — базовый проверяемый набор</option>
        </select>
        <p class="muted" id="prayerTraditionNote">Тексты, специфичные для общины, публикуются только после редакционной проверки; общие молитвы остаются доступными всегда.</p>

        <details open data-traditions="all sephardic mountain">
          <summary><b>Кадиш ятом — קדיש יתום</b></summary>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">יִתְגַּדַּל וְיִתְקַדַּשׁ שְׁמֵהּ רַבָּא.</div><div class="prayer-tr">Йитгада́ль ве-йиткада́ш шме́ раба́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בְּעָלְמָא דִּי בְרָא כִרְעוּתֵהּ.</div><div class="prayer-tr">Бе-альма́ ди вра́ хиръуте́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">וְיַמְלִיךְ מַלְכוּתֵהּ וְיַצְמַח פֻּרְקָנֵהּ וִיקָרֵב מְשִׁיחֵהּ.</div><div class="prayer-tr">Ве-ямли́х мальхуте́, ве-яцма́х пуркане́, ви-каре́в мешихе́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בְּחַיֵּיכוֹן וּבְיוֹמֵיכוֹן וּבְחַיֵּי דְּכָל בֵּית יִשְׂרָאֵל.</div><div class="prayer-tr">Бе-хайехо́н ув-йомехо́н, ув-хайе́ де-холь бейт Исраэ́ль.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בַּעֲגָלָא וּבִזְמַן קָרִיב, וְאִמְרוּ אָמֵן.</div><div class="prayer-tr">Ба-агала́ ув-зман кари́в, ве-имру́: аме́н.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">יְהֵא שְׁמֵהּ רַבָּא מְבָרַךְ לְעָלַם וּלְעָלְמֵי עָלְמַיָּא.</div><div class="prayer-tr">Йехе́ шме́ раба́ мевара́х ле-ала́м у-ле-альме́ альмая́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">יִתְבָּרַךְ וְיִשְׁתַּבַּח וְיִתְפָּאַר וְיִתְרוֹמַם וְיִתְנַשֵּׂא.</div><div class="prayer-tr">Йитбара́х ве-йиштабах, ве-йитпаа́р, ве-йитрома́м, ве-йитнасе́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">וְיִתְהַדָּר וְיִתְעַלֶּה וְיִתְהַלָּל שְׁמֵהּ דְּקֻדְשָׁא בְּרִיךְ הוּא.</div><div class="prayer-tr">Ве-йитхада́р, ве-йитале́, ве-йитхала́ль шме́ де-кудша́, брих ху.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">לְעֵלָּא מִן כָּל בִּרְכָתָא וְשִׁירָתָא תֻּשְׁבְּחָתָא וְנֶחֱמָתָא דַּאֲמִירָן בְּעָלְמָא, וְאִמְרוּ אָמֵן.</div><div class="prayer-tr">Ле-эла́ мин коль бирхата́ ве-ширата́, тушбехата́ ве-нехемата́, да-амира́н бе-альма́; ве-имру́: аме́н.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">יְהֵא שְׁלָמָא רַבָּא מִן שְׁמַיָּא, חַיִּים וְשָׂבָע וִישׁוּעָה וְנֶחָמָה.</div><div class="prayer-tr">Йехе́ шлама́ раба́ мин шмая́, хаим ве-сава́, вишуа́ ве-нехама́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">עֹשֶׂה שָׁלוֹם בִּמְרוֹמָיו, הוּא בְרַחֲמָיו יַעֲשֶׂה שָׁלוֹם עָלֵינוּ וְעַל כָּל יִשְׂרָאֵל, וְאִמְרוּ אָמֵן.</div><div class="prayer-tr">Осе́ шало́м бимрома́в, ху ве-рахама́в яасе́ шало́м але́йну ве-аль коль Исраэ́ль; ве-имру́: аме́н.</div></div>
          <p class="muted">Кадиш традиционно читают в присутствии миньяна; формулировки могут различаться между нусахами.</p>
        </details>

        <details style="margin-top:12px" data-traditions="all sephardic mountain">
          <summary><b>Хашкава — הַשְׁכָּבָה</b></summary>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">מְנוּחָה נְכוֹנָה בִּישִׁיבָה עֶלְיוֹנָה, תַּחַת כַּנְפֵי הַשְּׁכִינָה.</div><div class="prayer-tr">Менуха́ нехона́ би-йешива́ эльйона́, та́хат канфе́ ха-Шхина́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בְּמַעֲלַת קְדוֹשִׁים וּטְהוֹרִים כְּזֹהַר הָרָקִיעַ מַזְהִירִים.</div><div class="prayer-tr">Бе-маала́т кдоши́м у-тхори́м, ке-зо́хар ха-раки́а мазхири́м.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">אֶת נִשְׁמַת הַנִּפְטָר / הַנִּפְטֶרֶת.</div><div class="prayer-tr">Эт нишма́т ха-нифта́р / ха-нифте́рет.</div></div>
          <p class="muted">Здесь обычно называют еврейское имя усопшего и имя родителя. Точный текст хашкавы зависит от общины.</p>
        </details>

        <details style="margin-top:12px" data-traditions="all">
          <summary><b>Эль мале рахамим — אֵל מָלֵא רַחֲמִים</b></summary>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">אֵל מָלֵא רַחֲמִים, שׁוֹכֵן בַּמְּרוֹמִים.</div><div class="prayer-tr">Эль мале́ рахами́м, шохе́н ба-мероми́м.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">הַמְצֵא מְנוּחָה נְכוֹנָה תַּחַת כַּנְפֵי הַשְּׁכִינָה.</div><div class="prayer-tr">Хамце́ менуха́ нехона́ та́хат канфе́ ха-Шхина́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בְּמַעֲלוֹת קְדוֹשִׁים וּטְהוֹרִים כְּזֹהַר הָרָקִיעַ מַזְהִירִים.</div><div class="prayer-tr">Бе-маало́т кдоши́м у-тхори́м, ке-зо́хар ха-раки́а мазхири́м.</div></div>
          <p class="muted">Этот текст распространён в ряде общин; в сефардской и восточной традиции используются и другие формы поминальной молитвы.</p>
        </details>

        <details style="margin-top:12px" data-traditions="all sephardic mountain">
          <summary><b>Псалом 23 — תהילים כ״ג</b></summary>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">יְהוָה רֹעִי לֹא אֶחְסָר.</div><div class="prayer-tr">Адона́й ро-и́, ло эхса́р.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">בִּנְאוֹת דֶּשֶׁא יַרְבִּיצֵנִי, עַל מֵי מְנֻחוֹת יְנַהֲלֵנִי.</div><div class="prayer-tr">Бинъо́т де́ше ярбице́ни, аль ме́й менухо́т йенахале́ни.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">נַפְשִׁי יְשׁוֹבֵב, יַנְחֵנִי בְמַעְגְּלֵי צֶדֶק לְמַעַן שְׁמוֹ.</div><div class="prayer-tr">Нафши́ йешове́в, янхе́ни бе-магле́й це́дек лема́ан шмо́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">גַּם כִּי אֵלֵךְ בְּגֵיא צַלְמָוֶת, לֹא אִירָא רָע כִּי אַתָּה עִמָּדִי.</div><div class="prayer-tr">Гам ки эле́х бе-ге́й цальма́вет, ло ира́ ра, ки ата́ имади́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">שִׁבְטְךָ וּמִשְׁעַנְתֶּךָ הֵמָּה יְנַחֲמֻנִי.</div><div class="prayer-tr">Шивтеха́ у-мишантеха́, хе́ма йенахаму́ни.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">תַּעֲרֹךְ לְפָנַי שֻׁלְחָן נֶגֶד צֹרְרָי; דִּשַּׁנְתָּ בַשֶּׁמֶן רֹאשִׁי, כּוֹסִי רְוָיָה.</div><div class="prayer-tr">Тааро́х лефана́й шульха́н не́гед цорера́й; диша́нта ва-ше́мен роши́, коси́ ревая́.</div></div>
          <div class="prayer-line"><div class="he-prayer" dir="rtl" lang="he">אַךְ טוֹב וָחֶסֶד יִרְדְּפוּנִי כָּל יְמֵי חַיָּי, וְשַׁבְתִּי בְּבֵית יְהוָה לְאֹרֶךְ יָמִים.</div><div class="prayer-tr">Ах тов ва-хе́сед йирдефу́ни коль йеме́й хая́й; ве-шавти́ бе-вейт Адона́й ле-о́рех ями́м.</div></div>
        </details>

        <details style="margin-top:12px">
          <summary><b>Как читать транскрипцию</b></summary>
          <p><b>х</b> — как в русском «х»; <b>ц</b> — «ц»; <b>ш</b> — «ш»; <b>й</b> — краткое «й». Ударение отмечено знаком: <b>а́</b>.</p>
          <p class="muted">Транскрипция внесена вручную, строка к строке: сверху оригинал на иврите/арамейском, ниже — чтение кириллицей.</p>
        </details>
      </div>

      <div class="card memory-hide">
        <b>Добавить в календарь</b>
        <div class="nav">
          <a class="btn secondary" href="/api/events/${encodeURIComponent(e.id)}.ics${accessSuffix}">Apple / ICS</a>
          <a class="btn secondary" target="_blank" rel="noopener" href="${htmlEsc(google)}">Google Calendar</a>
          <a class="btn secondary" target="_blank" rel="noopener" href="${htmlEsc(outlook)}">Outlook</a>
          <button class="btn secondary" id="shareMemorial">Поделиться ссылкой</button>
          <button class="btn secondary" id="shareCardPng">PNG 4:5</button>
          <button class="btn secondary" id="shareSquarePng">PNG 1:1</button>
          <button class="btn secondary" id="shareWidePng">PNG 16:9</button>
          <a class="btn secondary" target="_blank" rel="noopener" href="/api/events/${encodeURIComponent(e.id)}/share-card.svg${accessSuffix}">Открыть SVG</a>
          <a class="btn secondary" href="/m/memorial/${encodeURIComponent(e.id)}/print${accessSuffix}">Печатная карточка</a>
        </div>
      </div>

      <div class="card memory-hide">
        <h3 style="margin-top:0">Следить за памятными датами</h3>
        <p class="muted">Подписка относится только к этому человеку и его будущим памятным датам.</p>
        <button id="followPerson" class="btn secondary" style="width:100%">Следить за памятными датами</button>
        <div id="followStatus" class="muted" style="margin-top:8px"></div>
      </div>

      <div class="card memory-hide">
        <h3 style="margin-top:0">История обновлений</h3>
        <div id="publicChangeHistory" class="muted">Загрузка…</div>
      </div>

      <div class="card memory-hide">
        <h3 style="margin-top:0">Подтверждение присутствия</h3>
        <p class="muted">Можно ответить без регистрации. Имя указывать необязательно.</p>
        <input id="rsvpName" class="field" placeholder="Ваше имя (необязательно)">
        <div class="nav" style="margin-bottom:8px">
          <button class="btn" data-rsvp="yes">Буду</button>
          <button class="btn secondary" data-rsvp="no">Не смогу</button>
          <button class="btn secondary" data-rsvp="follow">Сообщите изменения</button>
        </div>
        <div id="rsvpSummary" class="muted">Загрузка…</div>
      </div>

      <div class="card memory-hide" style="text-align:center">
        <b>QR-код памятной страницы</b><br>
        <img src="/qr/event/${encodeURIComponent(e.id)}.svg${accessSuffix}" alt="QR" style="width:210px;max-width:100%;margin-top:10px">
      </div>

      <div class="card memory-hide">
        <h3>Я родственник</h3>
        <p class="muted">После проверки модератором запись может получить отметку «Подтверждено семьёй».</p>
        <input id="claimName" class="field" placeholder="Ваше имя">
        <input id="claimRelation" class="field" placeholder="Кем приходитесь" style="margin-top:8px">
        <input id="claimContact" class="field" placeholder="Контакт модератору" style="margin-top:8px">
        <textarea id="claimEvidence" class="field" rows="3" placeholder="Подтверждение / комментарий" style="margin-top:8px"></textarea>
        <button class="btn secondary" id="sendClaim" style="width:100%;margin-top:8px">Отправить подтверждение</button>
      </div>

      <div class="card memory-hide">
        <h3>Сообщить об ошибке</h3>
        <select id="corrField" class="field"><option value="full_name">ФИО</option><option value="event_date">Дата</option><option value="place">Место</option><option value="note">Описание</option></select>
        <input id="corrCurrent" class="field" placeholder="Сейчас указано" style="margin-top:8px">
        <input id="corrProposed" class="field" placeholder="Предлагаемое исправление" style="margin-top:8px">
        <input id="corrName" class="field" placeholder="Ваше имя" style="margin-top:8px">
        <input id="corrContact" class="field" placeholder="Контакт модератору" style="margin-top:8px">
        <button class="btn secondary" id="sendCorrection" style="width:100%;margin-top:8px">Отправить исправление</button>
      </div>
      <h3 class="memory-hide">Добрые слова</h3>
      <div class="memory-hide">${comments||'<div class="card muted">Пока нет опубликованных сообщений.</div>'}</div>
      <div class="card memory-hide">
        <input id="commentAuthor" class="field" placeholder="Ваше имя">
        <textarea id="commentBody" class="field" rows="3" placeholder="Доброе слово" style="margin-top:8px"></textarea>
        <button class="btn secondary" id="sendComment" style="width:100%;margin-top:8px">Отправить на модерацию</button>
      </div>
      <div id="memorialStatus"></div>
    `,{extraHead,scripts:`<script>
      const status=document.getElementById("memorialStatus");
      const say=(m,ok=true)=>status.innerHTML='<div class="'+(ok?"ok":"err")+'">'+m+'</div>';
      document.getElementById("memoryMode").onclick=()=>{document.body.classList.add("memory-mode");window.scrollTo({top:0,behavior:"smooth"})};
      document.getElementById("memoryExit").onclick=()=>document.body.classList.remove("memory-mode");
      document.getElementById("lightNer").onclick=async()=>{
        const r=await fetch("/api/events/${req.params.id}/candle",{method:"POST"}),d=await r.json();
        if(r.ok){document.getElementById("nerCount").textContent=d.count;document.getElementById("nerFlame").classList.remove("off");say("Свеча памяти зажжена.")}else say("Не удалось зажечь свечу.",false)
      };
      function zonedToUtc(date,time,tz){
        try{
          const parts=String(time||"").split(":"); if(parts.length<2)return null;
          const guess=Date.parse(date+"T"+parts[0]+":"+parts[1]+":00Z");
          const f=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
          const p=Object.fromEntries(f.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
          const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
          return new Date(guess-(shown-guess));
        }catch{return null}
      }
      const localEl=document.getElementById("localEventTime");
      if(localEl){
        const dt=zonedToUtc(${JSON.stringify(e.event_date||"")},${JSON.stringify(e.event_time||"")},${JSON.stringify(e.event_timezone||"Europe/Moscow")});
        if(dt){
          const localTz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";
          localEl.textContent="В вашем часовом поясе ("+localTz+"): "+new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:"short"}).format(dt);
        }
      }
      const prayerTradition=document.getElementById("prayerTradition");
      function applyTradition(){
        const v=prayerTradition.value;
        document.querySelectorAll(".prayer-card details[data-traditions]").forEach(d=>{const tags=(d.dataset.traditions||"all").split(" ");d.style.display=(v==="all"||tags.includes(v))?"block":"none"});
      }
      prayerTradition.onchange=applyTradition;applyTradition();
      if("speechSynthesis" in window){
        document.querySelectorAll(".he-prayer").forEach(line=>{
          const b=document.createElement("button");b.type="button";b.className="btn secondary";b.style.cssText="padding:6px 9px;margin-top:6px;width:auto";b.textContent="Прослушать";
          b.onclick=()=>{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(line.textContent);u.lang="he-IL";u.rate=.82;speechSynthesis.speak(u)};
          line.insertAdjacentElement("afterend",b);
        });
      }
      const rsvpTokenKey="pamyat_device_token";
      function ensureRsvpToken(){let t=localStorage.getItem(rsvpTokenKey);if(!/^[0-9a-f-]{36}$/i.test(t||"")){t=crypto.randomUUID();localStorage.setItem(rsvpTokenKey,t)}return t}
      let following=false;
      async function loadFollow(){
        try{
          const t=ensureRsvpToken(),r=await fetch("/api/events/${req.params.id}/follow?device_token="+encodeURIComponent(t),{cache:"no-store"}),d=await r.json();
          following=Boolean(d.active);document.getElementById("followPerson").textContent=following?"Не следить":"Следить за памятными датами";
          document.getElementById("followStatus").textContent=following?"Подписка включена. Каналы и время задаются в разделе «Напоминания».":"";
        }catch{}
      }
      document.getElementById("followPerson").onclick=async()=>{
        const r=await fetch("/api/events/${req.params.id}/follow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_token:ensureRsvpToken(),active:!following,key:${JSON.stringify(accessKey||"")}})});
        if(r.ok){following=!following;await loadFollow();say(following?"Подписка включена.":"Подписка отключена.")}else say("Не удалось изменить подписку.",false)
      };
      async function loadPublicHistory(){
        try{
          const r=await fetch("/api/events/${req.params.id}/history",{cache:"no-store"}),rows=await r.json(),box=document.getElementById("publicChangeHistory");
          box.innerHTML=(rows||[]).slice(0,8).map(x=>'<div style="margin:5px 0"><b>'+new Date(x.created_at).toLocaleString("ru-RU")+'</b> · изменено: '+(x.changed_fields||[]).join(", ")+'</div>').join("")||"Публичных изменений пока нет.";
        }catch{document.getElementById("publicChangeHistory").textContent="История временно недоступна."}
      }
      loadFollow();loadPublicHistory();
      async function loadRsvp(){
        try{
          const r=await fetch("/api/events/${req.params.id}/rsvp${accessSuffix}",{cache:"no-store"}),d=await r.json();
          if(r.ok)document.getElementById("rsvpSummary").textContent="Будут: "+Number(d.yes||0)+" · Не смогут: "+Number(d.no||0)+" · Ждут изменений: "+Number(d.follow||0);
        }catch{}
      }
      document.querySelectorAll("[data-rsvp]").forEach(b=>b.onclick=async()=>{
        try{
          const body={device_token:ensureRsvpToken(),response:b.dataset.rsvp,display_name:document.getElementById("rsvpName").value,key:${JSON.stringify(accessKey||"")}};
          const r=await fetch("/api/events/${req.params.id}/rsvp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
          if(!r.ok)throw new Error("rsvp_failed");say("Ответ сохранён.");await loadRsvp();
        }catch{say("Не удалось сохранить ответ.",false)}
      });
      loadRsvp();
      document.getElementById("shareMemorial").onclick=async()=>{try{if(navigator.share)await navigator.share({title:${JSON.stringify(e.full_name)},url:location.href});else{await navigator.clipboard.writeText(location.href);say("Ссылка скопирована.")}}catch{}};
      async function shareSvgFormat(format,width,height,name){
        try{
          const join=${JSON.stringify(accessSuffix?accessSuffix+"&":"?")};
          const img=new Image();img.src="/api/events/${encodeURIComponent(e.id)}/share-card.svg"+join+"format="+encodeURIComponent(format);
          await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});
          const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;canvas.getContext("2d").drawImage(img,0,0,width,height);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png",0.95));if(!blob)throw new Error("png_failed");
          const file=new File([blob],name,{type:"image/png"});
          if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({title:${JSON.stringify(e.full_name)},files:[file]});
          else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
        }catch{say("Не удалось подготовить PNG-карточку.",false)}
      }
      document.getElementById("shareSquarePng").onclick=()=>shareSvgFormat("square",1080,1080,"pamyat-square-"+${JSON.stringify(e.id)}+".png");
      document.getElementById("shareWidePng").onclick=()=>shareSvgFormat("wide",1600,900,"pamyat-wide-"+${JSON.stringify(e.id)}+".png");
      document.getElementById("shareCardPng").onclick=async()=>{
        try{
          const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext("2d");
          ctx.fillStyle="#f5f1e8";ctx.fillRect(0,0,1080,1350);ctx.fillStyle="#fffdf8";ctx.strokeStyle="#cfc2ad";ctx.lineWidth=3;
          ctx.beginPath();ctx.roundRect(54,54,972,1242,38);ctx.fill();ctx.stroke();
          ctx.textAlign="center";ctx.fillStyle="#4c3e2d";ctx.font="58px serif";ctx.fillText("✡",540,165);
          ctx.font="42px serif";ctx.fillText("נר נשמה",540,235);
          ctx.strokeStyle="#cfc2ad";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(270,285);ctx.lineTo(810,285);ctx.stroke();
          function wrap(text,maxWidth,font){
            ctx.font=font;const words=String(text||"").split(/\s+/),lines=[];let line="";
            for(const w of words){const test=(line+" "+w).trim();if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w}else line=test}
            if(line)lines.push(line);return lines.slice(0,4);
          }
          ctx.fillStyle="#211d18";ctx.font="bold 64px sans-serif";
          const nameLines=wrap(${JSON.stringify(e.full_name)},850,"bold 64px sans-serif");
          nameLines.forEach((line,i)=>ctx.fillText(line,540,430+i*76));
          ctx.fillStyle="#5b4934";ctx.font="38px sans-serif";ctx.fillText(${JSON.stringify(e.event_type||"Памятная дата")},540,770);
          ctx.fillStyle="#27231e";ctx.font="36px sans-serif";ctx.fillText(${JSON.stringify((e.event_date||"")+(e.event_time?" · "+e.event_time:""))},540,830);
          ctx.fillStyle="#746d63";ctx.font="28px sans-serif";ctx.fillText(${JSON.stringify([e.place,e.city].filter(Boolean).join(" · "))},540,885);
          ${e.hebrew_death_label?'ctx.font="27px sans-serif";ctx.fillText('+JSON.stringify(e.hebrew_death_label)+',540,935);':""}
          const qr=new Image();qr.src="/qr/event/${encodeURIComponent(e.id)}.svg${accessSuffix}";
          await new Promise((resolve,reject)=>{qr.onload=resolve;qr.onerror=reject});ctx.drawImage(qr,410,1015,260,260);
          ctx.font="24px sans-serif";ctx.fillStyle="#5b4934";ctx.fillText("Память Джуури",540,1315);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png",0.95));if(!blob)throw new Error("png_failed");
          const file=new File([blob],"pamyat-"+${JSON.stringify(e.id)}+".png",{type:"image/png"});
          if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({title:${JSON.stringify(e.full_name)},files:[file]});
          else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
        }catch{say("Не удалось подготовить PNG-карточку.",false)}
      };
      document.getElementById("sendClaim").onclick=async()=>{
        const body={claimant_name:document.getElementById("claimName").value,relation_type:document.getElementById("claimRelation").value,contact:document.getElementById("claimContact").value,evidence_note:document.getElementById("claimEvidence").value};
        const r=await fetch("/api/events/${req.params.id}/relative-claim",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        say(r.ok?"Отправлено на проверку.":"Не удалось отправить.",r.ok)
      };
      document.getElementById("sendCorrection").onclick=async()=>{
        const body={event_id:"${req.params.id}",field_name:document.getElementById("corrField").value,current_value:document.getElementById("corrCurrent").value,proposed_value:document.getElementById("corrProposed").value,requester_name:document.getElementById("corrName").value,requester_contact:document.getElementById("corrContact").value};
        const r=await fetch("/api/corrections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        say(r.ok?"Исправление отправлено на модерацию.":"Не удалось отправить исправление.",r.ok)
      };
      document.getElementById("sendComment").onclick=async()=>{
        const body={author:document.getElementById("commentAuthor").value,body:document.getElementById("commentBody").value};
        const r=await fetch("/api/events/${req.params.id}/comments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        say(r.ok?"Сообщение отправлено на модерацию.":"Не удалось отправить.",r.ok)
      };
    </script>`}));
  }catch(e){console.error("memorial page",e.data||e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось открыть памятную страницу.</div>'))}
});


app.get("/m/memorial/:id/print", async (req,res) => {
  try{
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const e=await sb("rpc/memorial_event_detail_access",{method:"POST",body:{p_event_id:req.params.id,p_share_token:accessKey}});
    if(!e)return res.status(404).send("Not found");
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,""),accessSuffix=accessKey?"?key="+encodeURIComponent(accessKey):"";
    const qr=base+"/qr/event/"+encodeURIComponent(e.id)+".svg"+accessSuffix;
    res.setHeader("Cache-Control","no-store");
    res.send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${htmlEsc(e.full_name)} — карточка памяти</title>
      <style>
      @page{size:A5 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;color:#211d18;background:#f3efe7}.sheet{width:148mm;min-height:210mm;margin:15px auto;background:#fffdf8;border:1px solid #d9cfbf;padding:16mm;text-align:center;box-shadow:0 10px 30px #0002}.star{font-size:34px}.he{font-size:24px;direction:rtl}.name{font-size:28px;margin:12px 0 8px}.date{font-size:18px;margin:7px}.note{margin:18px auto;max-width:90%;font-size:16px;line-height:1.5}.qr{width:42mm;height:42mm;margin:16px}.actions{margin:15px;text-align:center}.actions button{font:inherit;padding:10px 18px}.line{width:58%;height:1px;background:#cfc2ad;margin:16px auto}.candle{font-size:38px}@media print{body{background:white}.sheet{margin:0;box-shadow:none;border:0}.actions{display:none}}
      </style></head><body>
      <div class="actions"><button onclick="print()">Печать / сохранить PDF</button></div>
      <article class="sheet">
        <div class="star">✡</div>
        <div class="he">נר נשמה</div>
        <div class="line"></div>
        <div class="name">${htmlEsc(e.full_name)}</div>
        ${e.death_date?'<div class="date">Дата смерти: '+htmlEsc(e.death_date)+'</div>':""}
        ${e.hebrew_death_label?'<div class="date">Еврейская дата: '+htmlEsc(e.hebrew_death_label)+'</div>':""}
        <div class="date">${htmlEsc(e.event_type||"Памятная дата")} · ${htmlEsc(e.event_date||"")}</div>
        ${e.place||e.city?'<div class="date">'+htmlEsc([e.city,e.place].filter(Boolean).join(" · "))+'</div>':""}
        <div class="candle">🕯</div>
        ${e.note?'<div class="note">'+htmlEsc(e.note)+'</div>':""}
        <img class="qr" src="${htmlEsc(qr)}" alt="QR">
        <div>Открыть памятную страницу</div>
      </article></body></html>`);
  }catch(e){console.error("print memorial",e.data||e);res.status(500).send("Failed")}
});

app.get("/m/reminders", (_req,res) => {
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.send(mobileShell("Напоминания", `
    <h1>Напоминания</h1>
    <p class="muted">Выберите сроки и каналы. Push можно включить прямо на телефоне; Email, Telegram, WhatsApp и SMS работают после подключения соответствующего провайдера.</p>

    <div class="card">
      <h3 style="margin-top:0">Когда напоминать</h3>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="30"><span>За 30 дней</span></label><input class="field remTimeByDay" data-day="30" type="time" value="09:00" style="width:130px"></div>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="14"><span>За 14 дней</span></label><input class="field remTimeByDay" data-day="14" type="time" value="09:00" style="width:130px"></div>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="7" checked><span>За 7 дней</span></label><input class="field remTimeByDay" data-day="7" type="time" value="10:00" style="width:130px"></div>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="3"><span>За 3 дня</span></label><input class="field remTimeByDay" data-day="3" type="time" value="10:00" style="width:130px"></div>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="1" checked><span>За 1 день</span></label><input class="field remTimeByDay" data-day="1" type="time" value="19:00" style="width:130px"></div>
      <div class="row"><label class="check" style="flex:1"><input type="checkbox" class="remDay" value="0" checked><span>В день события</span></label><input class="field remTimeByDay" data-day="0" type="time" value="08:30" style="width:130px"></div>
      <label>Время по умолчанию</label>
      <input id="remTime" class="field" type="time" value="09:00">
      <p class="muted">У каждого срока можно задать своё время. Оно применяется в часовом поясе устройства.</p>
      <div class="check"><input id="urgentAlerts" type="checkbox"><span><b>Срочные похоронные объявления</b><br><span class="muted">Получать однократное уведомление сразу после одобрения срочного объявления.</span></span></div>
      <div class="check"><input id="generalNotifications" type="checkbox" checked><span><b>Общие уведомления</b><br><span class="muted">Если выключить, останутся только подписки на конкретных людей.</span></span></div>
      <h4 style="margin-bottom:6px">Тихие часы</h4>
      <div class="row"><input id="quietStart" class="field" type="time" style="flex:1" aria-label="Начало тихих часов"><span>—</span><input id="quietEnd" class="field" type="time" style="flex:1" aria-label="Конец тихих часов"></div>
      <p class="muted">Оставьте пустым, чтобы не ограничивать время. Интервал применяется в часовом поясе устройства.</p>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Какие объявления получать</h3>
      <p class="muted">Можно получать всё или только выбранные группы. Администратор может создавать дополнительные группы.</p>
      <div id="interestGroups"><div class="muted">Загрузка групп…</div></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Куда присылать</h3>

      <div class="check"><input id="chPush" type="checkbox" checked><span><b>Push на телефон</b><br><span class="muted" id="stPush">проверка…</span></span></div>

      <div class="check"><input id="chEmail" type="checkbox"><span><b>Email</b><br><span class="muted" id="stEmail">проверка…</span></span></div>
      <input id="remEmail" class="field" type="email" autocomplete="email" placeholder="name@example.com">
      <button class="btn secondary testChannel" data-channel="email" style="width:100%;margin-top:6px">Тест Email</button>

      <div class="check"><input id="chTelegram" type="checkbox"><span><b>Telegram</b><br><span class="muted" id="stTelegram">проверка…</span></span></div>
      <input id="remTelegram" class="field" inputmode="numeric" placeholder="Telegram chat ID">
      <button class="btn secondary testChannel" data-channel="telegram" style="width:100%;margin-top:6px">Тест Telegram</button>

      <div class="check"><input id="chWhatsapp" type="checkbox"><span><b>WhatsApp</b><br><span class="muted" id="stWhatsapp">проверка…</span></span></div>
      <input id="remWhatsapp" class="field" type="tel" autocomplete="tel" placeholder="+79991234567">
      <button class="btn secondary testChannel" data-channel="whatsapp" style="width:100%;margin-top:6px">Тест WhatsApp</button>

      <div class="check"><input id="chSms" type="checkbox"><span><b>SMS</b><br><span class="muted" id="stSms">проверка…</span></span></div>
      <input id="remSms" class="field" type="tel" autocomplete="tel" placeholder="+79991234567">
      <button class="btn secondary testChannel" data-channel="sms" style="width:100%;margin-top:6px">Тест SMS</button>
      <button class="btn secondary testChannel" data-channel="push" style="width:100%;margin-top:10px">Тест Push</button>

      <button id="saveReminders" class="btn" style="width:100%;margin-top:14px">Сохранить и включить</button>
      <button id="disableReminders" class="btn secondary" style="width:100%;margin-top:8px">Отключить все каналы на этом устройстве</button>
      <div id="remStatus" style="margin-top:10px"></div>
    </div>

    <div class="card" id="iosPushHelp" style="display:none">
      <b>Push на iPhone</b>
      <ol style="padding-left:20px;margin-bottom:0">
        <li>Откройте эту страницу именно в Safari.</li>
        <li>Нажмите «Поделиться» → «На экран Домой».</li>
        <li>Откройте «Память» с новой иконки на экране.</li>
        <li>Вернитесь в «Напоминания» и включите Push.</li>
      </ol>
      <p class="muted" style="margin-bottom:0">Во встроенном браузере ChatGPT Push может быть недоступен. Остальные каналы можно использовать без Push.</p>
    </div>

    <div class="card" id="deviceDeliveryCard" style="display:none">
      <b>Последние успешные отправки</b>
      <div id="deviceDelivery" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <b>Статус каналов</b>
      <p class="muted" style="margin-bottom:0">Если канал отмечен как «нужна настройка», предпочтение можно сохранить заранее, но сообщения начнут отправляться только после подключения провайдера.</p>
    </div>
  `, {scripts:`<script>
  (()=>{
    const status=document.getElementById("remStatus");
    const tokenKey="pamyat_device_token";
    const cfgKey="pamyat_reminder_config";
    let provider={push:false,email:false,telegram:false,whatsapp:false,sms:false};

    const say=(msg,ok=true)=>status.innerHTML='<div class="'+(ok?"ok":"err")+'">'+msg+'</div>';
    const b64ToUint=s=>{
      const pad="=".repeat((4-s.length%4)%4),base=(s+pad).replace(/-/g,"+").replace(/_/g,"/");
      const raw=atob(base);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
    };
    const state=(id,ok)=>document.getElementById(id).textContent=ok?"подключено":"нужна настройка провайдера";
    function browserPushCapable(){
      return ("Notification" in window)&&("PushManager" in window)&&("serviceWorker" in navigator);
    }
    function isIOS(){
      return /iPhone|iPad|iPod/i.test(navigator.userAgent||"") || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
    }
    function isStandalone(){
      return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone===true;
    }
    async function loadInterestGroups(){
      try{
        const groups=await fetch("/api/notification-groups",{cache:"no-store"}).then(r=>r.json());
        const box=document.getElementById("interestGroups");
        box.innerHTML=(groups||[]).map(g=>'<label class="check"><input type="checkbox" class="interestGroup" value="'+String(g.slug).replace(/"/g,"&quot;")+'" '+(g.slug==="all"?"checked":"")+'><span><b>'+String(g.name||g.slug).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))+'</b>'+(g.description?'<br><span class="muted">'+String(g.description).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))+'</span>':"")+'</span></label>').join("")||'<div class="muted">Группы не настроены.</div>';
        box.querySelectorAll(".interestGroup").forEach(i=>i.onchange=()=>{
          if(i.value==="all"&&i.checked)box.querySelectorAll('.interestGroup:not([value="all"])').forEach(x=>x.checked=false);
          if(i.value!=="all"&&i.checked){const a=box.querySelector('.interestGroup[value="all"]');if(a)a.checked=false}
          if(!box.querySelector(".interestGroup:checked")){const a=box.querySelector('.interestGroup[value="all"]');if(a)a.checked=true}
        });
      }catch{document.getElementById("interestGroups").innerHTML='<div class="muted">Не удалось загрузить группы.</div>'}
    }
    async function loadDeviceStatus(){
      const t=localStorage.getItem(tokenKey); if(!t)return;
      try{
        const r=await fetch("/api/reminders/device-status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_token:t})});
        if(!r.ok)return;
        const d=await r.json(); if(!d)return;
        const last=d.last_delivery||{},names={push:"Push",email:"Email",telegram:"Telegram",whatsapp:"WhatsApp",sms:"SMS"};
        const rows=Object.keys(names).map(k=>names[k]+": "+(last[k]?new Date(last[k]).toLocaleString("ru-RU"):"ещё не отправлялось"));
        const sched=Object.entries(d.reminder_times||{}).sort((a,b)=>Number(b[0])-Number(a[0])).map(([day,time])=>(day==="0"?"в день события":"за "+day+" дн.")+" — "+time).join("<br>");
        const groups=(d.interest_groups||["all"]).join(", "),quiet=(d.quiet_start&&d.quiet_end)?(d.quiet_start+"–"+d.quiet_end):"выключены";
        document.getElementById("deviceDelivery").innerHTML=rows.join("<br>")+"<br><b>Расписание:</b><br>"+(sched||("по умолчанию — "+(d.reminder_time||"09:00")))+"<br><b>Группы:</b> "+groups+"<br><b>Общие уведомления:</b> "+(d.general_notifications_enabled===false?"выключены":"включены")+"<br><b>Тихие часы:</b> "+quiet+"<br>Срочные похоронные объявления: "+(d.urgent_alerts?"включены":"выключены");
        document.getElementById("deviceDeliveryCard").style.display="block";
      }catch{}
    }
    async function loadStatus(){
      try{
        provider=await fetch("/api/reminders/status",{cache:"no-store"}).then(r=>r.json());
        const ch=document.getElementById("chPush");
        const localCap=browserPushCapable();
        if(!localCap){
          ch.checked=false;
          ch.disabled=true;
          document.getElementById("stPush").textContent=isIOS()
            ?"недоступно здесь — добавьте сайт на экран «Домой» через Safari"
            :"не поддерживается этим браузером";
          if(isIOS())document.getElementById("iosPushHelp").style.display="block";
        }else if(isIOS() && !isStandalone()){
          ch.checked=false;
          document.getElementById("stPush").textContent="на iPhone включается после добавления сайта на экран «Домой»";
          document.getElementById("iosPushHelp").style.display="block";
        }else{
          state("stPush",provider.push);
        }
        state("stEmail",provider.email); state("stTelegram",provider.telegram);
        state("stWhatsapp",provider.whatsapp); state("stSms",provider.sms);
      }catch{
        ["stEmail","stTelegram","stWhatsapp","stSms"].forEach(x=>document.getElementById(x).textContent="статус недоступен");
      }
    }
    async function getPushSubscription(){
      if(!document.getElementById("chPush").checked)return null;
      if(!provider.push)throw new Error("Push на сервере пока не настроен");
      if(!browserPushCapable())throw new Error("Push недоступен в этом браузере. На iPhone откройте Safari и добавьте сайт на экран «Домой».");
      if(isIOS() && !isStandalone())throw new Error("На iPhone Push включается из версии сайта, добавленной на экран «Домой».");
      const perm=await Notification.requestPermission();
      if(perm!=="granted")throw new Error("Разрешение на Push не выдано");
      const reg=await navigator.serviceWorker.register("/sw.js").then(()=>navigator.serviceWorker.ready);
      const k=await fetch("/api/push/public-key",{cache:"no-store"}).then(r=>r.json());
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint(k.key)});
      return sub.toJSON();
    }
    function normPhone(v){
      let s=String(v||"").trim().replace(/[^\\d+]/g,"");
      if(s.startsWith("00"))s="+"+s.slice(2);
      if(/^8\\d{10}$/.test(s))s="+7"+s.slice(1);
      else if(/^7\\d{10}$/.test(s))s="+"+s;
      else if(/^\\d{10}$/.test(s))s="+7"+s;
      else if(/^\\d{8,15}$/.test(s))s="+"+s;
      return s;
    }
    function read(){
      const days=[...document.querySelectorAll(".remDay:checked")].map(x=>Number(x.value));
      return {
        days,
        push:document.getElementById("chPush").checked,
        email:document.getElementById("chEmail").checked,
        telegram:document.getElementById("chTelegram").checked,
        whatsapp:document.getElementById("chWhatsapp").checked,
        sms:document.getElementById("chSms").checked,
        email_value:document.getElementById("remEmail").value.trim(),
        telegram_value:document.getElementById("remTelegram").value.trim(),
        whatsapp_value:normPhone(document.getElementById("remWhatsapp").value),
        sms_value:normPhone(document.getElementById("remSms").value),
        reminder_time:document.getElementById("remTime").value||"09:00",
        reminder_times:Object.fromEntries([...document.querySelectorAll(".remTimeByDay")].map(i=>[i.dataset.day,i.value||"09:00"])),
        urgent_alerts:document.getElementById("urgentAlerts").checked,
        general_notifications_enabled:document.getElementById("generalNotifications").checked,
        quiet_start:document.getElementById("quietStart").value||null,
        quiet_end:document.getElementById("quietEnd").value||null,
        interest_groups:[...document.querySelectorAll(".interestGroup:checked")].map(i=>i.value)
      };
    }
    function restore(){
      try{
        const x=JSON.parse(localStorage.getItem(cfgKey)||"null"); if(!x)return;
        if(Array.isArray(x.days))document.querySelectorAll(".remDay").forEach(i=>i.checked=x.days.includes(Number(i.value)));
        const pushBox=document.getElementById("chPush");
        if(!pushBox.disabled)pushBox.checked=Boolean(x.push);
        document.getElementById("chEmail").checked=Boolean(x.email);
        document.getElementById("chTelegram").checked=Boolean(x.telegram);
        document.getElementById("chWhatsapp").checked=Boolean(x.whatsapp);
        document.getElementById("chSms").checked=Boolean(x.sms);
        document.getElementById("remEmail").value=x.email_value||"";
        document.getElementById("remTelegram").value=x.telegram_value||"";
        document.getElementById("remWhatsapp").value=x.whatsapp_value||"";
        document.getElementById("remSms").value=x.sms_value||"";
        document.getElementById("remTime").value=x.reminder_time||"09:00";
        if(x.reminder_times)document.querySelectorAll(".remTimeByDay").forEach(i=>{if(x.reminder_times[i.dataset.day])i.value=x.reminder_times[i.dataset.day]});
        document.getElementById("urgentAlerts").checked=Boolean(x.urgent_alerts);
        document.getElementById("generalNotifications").checked=x.general_notifications_enabled!==false;
        document.getElementById("quietStart").value=x.quiet_start||"";
        document.getElementById("quietEnd").value=x.quiet_end||"";
        if(Array.isArray(x.interest_groups)&&x.interest_groups.length)document.querySelectorAll(".interestGroup").forEach(i=>i.checked=x.interest_groups.includes(i.value));
      }catch{}
    }
    async function save(){
      try{
        const x=read();
        if(!x.days.length)throw new Error("Выберите хотя бы один срок");
        if(!x.push&&!x.email&&!x.telegram&&!x.whatsapp&&!x.sms)throw new Error("Выберите хотя бы один канал");
        const subscription=await getPushSubscription();
        document.getElementById("remWhatsapp").value=x.whatsapp_value||"";
        document.getElementById("remSms").value=x.sms_value||"";
        const body={
          device_token:localStorage.getItem(tokenKey)||null,
          subscription,
          timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",
          locale:navigator.language||"ru",
          reminder_days:x.days,
          reminder_time:x.reminder_time,
          reminder_times:x.reminder_times,
          urgent_alerts:x.urgent_alerts,
          general_notifications_enabled:x.general_notifications_enabled,
          quiet_start:x.quiet_start,quiet_end:x.quiet_end,
          interest_groups:x.interest_groups.length?x.interest_groups:["all"],
          push_enabled:x.push,
          email:x.email_value||null,email_enabled:x.email,
          telegram_chat_id:x.telegram_value||null,telegram_enabled:x.telegram,
          whatsapp_phone:x.whatsapp_value||null,whatsapp_enabled:x.whatsapp,
          sms_phone:x.sms_value||null,sms_enabled:x.sms
        };
        const r=await fetch("/api/reminders/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        const data=await r.json();
        if(!r.ok)throw new Error(data.error||("HTTP "+r.status));
        if(data.device_token)localStorage.setItem(tokenKey,data.device_token);
        localStorage.setItem(cfgKey,JSON.stringify(x));
        const waiting=(data.waiting_for_provider||[]);
        say("Настройки сохранены."+ (waiting.length?" Ожидают подключения: "+waiting.join(", ")+".":""));await loadDeviceStatus();
      }catch(e){say(e.message||"Не удалось сохранить",false)}
    }
    async function testChannel(channel){
      try{
        const x=read();
        let subscription=null;
        if(channel==="push")subscription=await getPushSubscription();
        const body={
          subscription,
          email:x.email_value||null,
          telegram_chat_id:x.telegram_value||null,
          whatsapp_phone:x.whatsapp_value||null,
          sms_phone:x.sms_value||null
        };
        const r=await fetch("/api/reminders/test/"+encodeURIComponent(channel),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        const d=await r.json();
        if(!r.ok)throw new Error(d.error||("HTTP "+r.status));
        say("Тест "+channel+" отправлен.");
      }catch(e){say("Тест не отправлен: "+(e.message||e),false)}
    }
    async function disable(){
      try{
        const t=localStorage.getItem(tokenKey);
        if(t)await fetch("/api/push/unsubscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_token:t})});
        if("serviceWorker" in navigator){
          const reg=await navigator.serviceWorker.ready.catch(()=>null);
          const sub=reg?await reg.pushManager.getSubscription():null;
          if(sub)await sub.unsubscribe();
        }
        localStorage.removeItem(tokenKey);
        say("Все напоминания на этом устройстве отключены.");
      }catch(e){say(e.message||"Не удалось отключить",false)}
    }
    document.getElementById("saveReminders").onclick=save;
    document.querySelectorAll(".testChannel").forEach(btn=>btn.onclick=()=>testChannel(btn.dataset.channel));
    document.getElementById("disableReminders").onclick=disable;
    (async()=>{
      await loadInterestGroups();
      await loadStatus();
      restore();
      const pushBox=document.getElementById("chPush");
      if(pushBox.disabled)pushBox.checked=false;
      if(localStorage.getItem(tokenKey)){say("На этом устройстве уже есть сохранённая подписка.");await loadDeviceStatus();}
    })();
  })();
  </script>`}));
});


app.get("/m/add", async (req,res) => {
  res.setHeader("Cache-Control","no-store");
  const funeral=String(req.query.funeral||"")==="1";
  const humanWidget=TURNSTILE_SITE_KEY?'<div class="cf-turnstile" data-sitekey="'+htmlEsc(TURNSTILE_SITE_KEY)+'" style="margin-top:12px"></div>':"";
  const extraHead=TURNSTILE_SITE_KEY?'<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>':"";
  res.send(mobileShell(funeral?"Похоронное объявление":"Добавить событие", `
    ${funeral?'<div class="err"><b>Срочное похоронное объявление</b><br><span class="muted">После отправки запись всё равно проходит модерацию перед публичной публикацией.</span></div>':""}
    <h1>${funeral?"Похоронное объявление":"Добавить событие"}</h1>
    <form method="post" action="/m/add">
      <label>ФИО *</label><input class="field" name="full_name" required>
      <label>Дата смерти *</label><input class="field" type="date" name="death_date" required>

      <div class="card">
        <b>Памятные даты</b>
        <div class="check"><input type="checkbox" name="publish_day7" value="1" checked><span>7 дней</span></div>
        <div class="check"><input type="checkbox" name="publish_day40" value="1" checked><span>40 дней</span></div>
        <div class="check"><input type="checkbox" name="publish_year1" value="1" checked><span>1 год</span></div>
        <div class="check"><input type="checkbox" name="publish_annual" value="1" checked><span>Годовщина</span></div>
        <div class="check"><input type="checkbox" name="publish_yahrzeit" value="1" checked><span>Йорцайт</span></div>
      </div>

      <div class="card">
        <b>Еврейская дата и йорцайт</b>
        <div class="check"><input type="checkbox" name="hebrew_after_sunset" value="1"><span>Смерть произошла после захода солнца — считать со следующего еврейского дня</span></div>
        <label>Правило для Адара / семейной традиции</label>
        <select class="field" name="yahrzeit_rule">
          <option value="standard">Стандартное вычисление</option>
          <option value="adar_i">Адар I</option>
          <option value="adar_ii">Адар II</option>
          <option value="family_custom">Семейная традиция</option>
          <option value="manual">Только ручная дата</option>
        </select>
        <label>Ручная дата ближайшего йорцайта</label>
        <input class="field" type="date" name="manual_yahrzeit_date">
        <p class="muted">Ручная дата имеет приоритет. Это важно для случаев Адара, Хешвана/Кислева и семейных традиций.</p>
      </div>

      <div class="card">
        <b>Срочное похоронное объявление</b>
        <div class="check"><input type="checkbox" name="urgent_funeral" value="1" ${funeral?"checked":""}><span>Добавить отдельное срочное событие «Похороны»</span></div>
        <label>Дата похорон</label><input class="field" type="date" name="funeral_date">
        <label>Время</label><input class="field" type="time" name="event_time">
      </div>

      <label>Город</label><input class="field" name="city">
      <label>Место</label><input class="field" name="place">
      <label>Комментарий</label><textarea class="field" name="note" rows="4"></textarea>
      <label>Ваше имя</label><input class="field" name="submitter_name">
      <label>Контакт модератору (не публикуется)</label><input class="field" name="submitter_contact">
      <div class="check"><input type="checkbox" name="relation_confirmed" value="1" required><span>У меня есть право или согласие семьи на публикацию.</span></div>
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      ${humanWidget}
      <button class="btn" style="width:100%;margin-top:12px">Отправить на модерацию</button>
    </form>
  `,{extraHead}));
});

app.post("/m/add", rateLimit("mobile-events",5,15*60*1000), async (req,res) => {
  try {
    const b=req.body||{};
    if(spamTrap(b))return res.status(201).send(mobileShell("Отправлено",'<div class="ok">Заявка принята.</div>'));
    if(TURNSTILE_SECRET_KEY && !(await verifyTurnstileToken(b["cf-turnstile-response"])))return res.status(400).send(mobileShell("Ошибка",'<div class="err">Проверка защиты от спама не пройдена.</div>'));
    const fullName=clean(b.full_name,180), deathDate=clean(b.death_date,10);
    if(!fullName||!validDate(deathDate)||!b.relation_confirmed) {
      return res.status(400).send(mobileShell("Ошибка",'<div class="err">Заполните ФИО, дату смерти и согласие семьи.</div><p><a class="btn" href="/m/add">Вернуться</a></p>'));
    }
    const afterSunset=Boolean(b.hebrew_after_sunset);
    const hebrewSourceDate=afterSunset?addDays(deathDate,1):deathDate;
    const manualYahrzeit=validDate(clean(b.manual_yahrzeit_date,10))?clean(b.manual_yahrzeit_date,10):null;
    const rule=["standard","adar_i","adar_ii","family_custom","manual"].includes(b.yahrzeit_rule)?b.yahrzeit_rule:"standard";
    const computedYahrzeit=nextYahrzeit(hebrewSourceDate,new Date(),rule);
    const yahrzeit=manualYahrzeit||(rule==="manual"?null:computedYahrzeit);
    const base={
      full_name:fullName,death_date:deathDate,event_time:clean(b.event_time,20)||null,city:clean(b.city,120)||null,place:clean(b.place,180)||null,
      cemetery_link:null,cemetery_record_key:null,note:clean(b.note,1500)||null,visibility:"public",status:"pending",relation_confirmed:true,
      publish_day7:Boolean(b.publish_day7),publish_day40:Boolean(b.publish_day40),publish_year1:Boolean(b.publish_year1),
      publish_annual:Boolean(b.publish_annual),hebrew_death_label:hebrewLabel(hebrewSourceDate),yahrzeit_date:yahrzeit,
      hebrew_after_sunset:afterSunset,yahrzeit_rule:manualYahrzeit?"manual":rule,urgent:false,
      derived:{...derivedDates(deathDate),yahrzeit,hebrew_source_date:hebrewSourceDate},
      submitter_name:clean(b.submitter_name,120)||null,submitter_contact:clean(b.submitter_contact,180)||null
    };
    const planned=[];
    if(base.publish_day7)planned.push({event_type:"7 дней",event_date:addDays(deathDate,7),urgent:false});
    if(base.publish_day40)planned.push({event_type:"40 дней",event_date:addDays(deathDate,40),urgent:false});
    if(base.publish_year1)planned.push({event_type:"1 год",event_date:addYear(deathDate),urgent:false});
    if(base.publish_annual)planned.push({event_type:"Годовщина",event_date:addYear(deathDate),urgent:false});
    if(b.publish_yahrzeit&&yahrzeit)planned.push({event_type:"Йорцайт",event_date:yahrzeit,urgent:false});
    if(b.urgent_funeral){
      const fd=validDate(clean(b.funeral_date,10))?clean(b.funeral_date,10):deathDate;
      planned.unshift({event_type:"Похороны",event_date:fd,urgent:true});
    }
    if(!planned.length)planned.push({event_type:"Памятная дата",event_date:deathDate,urgent:false});
    const rows=planned.map(x=>({id:id(),...base,...x}));
    await sb("memorial_events",{method:"POST",body:rows,prefer:"return=minimal"});
    res.status(201).send(mobileShell("Отправлено",`<div class="ok"><b>Готово.</b><br>На модерацию отправлено событий: ${rows.length}. До одобрения они не видны публично.</div><div class="nav"><a class="btn" href="/m">Главная</a><a class="btn secondary" href="/m/add">Добавить ещё</a></div>`));
  } catch(e) {
    console.error("mobile add",e.data||e);
    res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось сохранить событие. Попробуйте ещё раз.</div><p><a class="btn" href="/m/add">Вернуться</a></p>'));
  }
});

app.get("/m/admin/auth/callback", (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.send(mobileShell("Вход администратора", `
    <h1>Вход администратора</h1>
    <div class="card"><div id="authState" class="muted">Проверяем ссылку входа…</div></div>
  `, {scripts:`<script>
  (async()=>{
    const box=document.getElementById("authState");
    try{
      const loginToken=new URLSearchParams(location.search).get("token");
      const hash=new URLSearchParams(location.hash.replace(/^#/,""));
      const accessToken=hash.get("access_token");
      if(!loginToken&&!accessToken)throw new Error("В ссылке нет действующей авторизации.");
      const payload=loginToken?{login_token:loginToken}:{access_token:accessToken};
      const r=await fetch("/api/admin/auth/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Не удалось войти");
      box.innerHTML='<div class="ok">Вход выполнен. Перенаправление…</div>';
      history.replaceState(null,"",location.pathname);
      setTimeout(()=>location.replace("/m/admin"),500);
    }catch(e){box.innerHTML='<div class="err">'+String(e.message||e)+'</div><p><a class="btn" href="/m/admin">Вернуться</a></p>'}
  })();
  </script>`}));
});


app.get("/m/admin", (_req,res) => {
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.send(mobileShell("Модерация", `
    <h1>Модерация</h1>
    <p class="muted">Очередь заявок, статистика и контроль доставки уведомлений.</p>

    <div class="card" id="adminLoginCard">
      <h3 style="margin-top:0">Вход в админку</h3>
      <p class="muted">Основной вход теперь работает без писем и одноразовых ссылок.</p>
      <label>Логин</label>
      <input id="mAdminUser" class="field" autocomplete="username" placeholder="Email администратора">
      <label>Пароль</label>
      <input id="mAdminPassword" class="field" type="password" autocomplete="current-password" placeholder="Пароль">
      <div class="check" style="margin-top:8px"><input id="mAdminShowPassword" type="checkbox"><span>Показать пароль</span></div>
      <button class="btn" id="mAdminPasswordLogin" style="width:100%;margin-top:10px">Войти</button>
      <details style="margin-top:12px">
        <summary>Резервные способы входа</summary>
        <label>Email</label>
        <input id="mAdminEmail" class="field" type="email" autocomplete="email" placeholder="name@example.com">
        <button class="btn secondary" id="mAdminMagic" style="width:100%;margin-top:8px">Прислать ссылку входа</button>
        <label>Админ-токен</label>
        <input id="mAdminToken" class="field" type="password" autocomplete="off" placeholder="Токен">
        <button class="btn secondary" id="mAdminLogin" style="width:100%;margin-top:8px">Войти по токену</button>
        <button class="btn secondary" id="mAdminBindEmail" style="width:100%;margin-top:8px">Разрешить email выше</button>
      </details>
      <div id="mAdminLoginStatus" style="margin-top:8px"></div>
    </div>

    <div id="mAdminApp" style="display:none">
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div><b>Панель администратора</b><div id="adminWho" class="muted"></div></div>
          <button class="btn secondary" id="mAdminLogout" style="padding:8px 11px">Выйти</button>
        </div>
        <div id="adminStats" class="row" style="margin-top:10px"></div>
        <div class="row" style="margin-top:10px">
          <button class="btn secondary" id="revokeAllSessions">Выйти на всех устройствах</button>
          <button class="btn secondary" id="backupTest">Проверить внешний backup</button>
        </div>
        <details style="margin-top:12px" open>
          <summary><b>Активные входы</b></summary>
          <div id="adminSessions" class="muted" style="margin-top:8px">Загрузка…</div>
        </details>
      </div>

      <div class="card" id="adminDataTools">
        <h3 style="margin-top:0">Данные</h3>
        <div class="row">
          <button class="btn secondary" data-export="/api/admin/export.json" data-name="pamyat-export.json">JSON</button>
          <button class="btn secondary" data-export="/api/admin/export.csv" data-name="pamyat-events.csv">CSV</button>
          <button class="btn secondary" data-export="/api/admin/export.xls" data-name="pamyat-events.xls">Excel</button>
        </div>
        <label>Импорт CSV / Excel</label>
        <input id="adminImportFile" class="field" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        <button class="btn secondary" id="adminImportPreview" style="width:100%;margin-top:8px">Проверить файл</button>
        <div id="adminImportResult" class="muted" style="margin-top:8px"></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Состояние системы</h3>
        <div id="adminSystemStatus" class="muted">Загрузка…</div>
        <div class="row" style="margin-top:10px">
          <button class="btn secondary" id="refreshSystemStatus">Обновить диагностику</button>
          <button class="btn secondary" id="retryFailedNotifications">Повторить только ошибки доставки</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Черновик / отложенная публикация</h3>
        <p class="muted">Без даты публикации создаётся черновик. Если указать дату и время — запись опубликуется автоматически.</p>
        <label>ФИО *</label><input id="draftFullName" class="field">
        <label>Дата смерти</label><input id="draftDeathDate" class="field" type="date">
        <label>Тип события</label><input id="draftEventType" class="field" value="Памятная дата">
        <label>Дата события</label><input id="draftEventDate" class="field" type="date">
        <label>Время</label><input id="draftEventTime" class="field" type="time">
        <label>Опубликовать автоматически</label><input id="draftPublishAt" class="field" type="datetime-local">
        <label>Приватность</label><select id="draftVisibility" class="field"><option value="public">Публично</option><option value="link">Только по ссылке</option><option value="invited">Только приглашённым</option></select>
        <label>Город</label><input id="draftCity" class="field">
        <label>Место</label><input id="draftPlace" class="field">
        <label>Комментарий</label><textarea id="draftNote" class="field" rows="3"></textarea>
        <button class="btn" id="createDraft" style="width:100%;margin-top:10px">Сохранить</button>
        <div id="draftStatus" class="muted" style="margin-top:8px"></div>
      </div>

      <div class="card" id="snapshotCard" style="display:none">
        <h3 style="margin-top:0">Снимки и восстановление</h3>
        <p class="muted">Восстановление возвращает поля существующих записей к выбранной дате и скрывает записи, созданные позже. Перед восстановлением создайте свежий снимок.</p>
        <button class="btn secondary" id="createSnapshot">Создать снимок сейчас</button>
        <div id="snapshotList" style="margin-top:10px"></div>
      </div>

      <div class="card" id="ownerUsersCard" style="display:none">
        <h3 style="margin-top:0">Администраторы и роли</h3>
        <p class="muted">Владелец управляет ролями и паролями. Модератор работает только с очередью контента.</p>
        <div id="adminUsersList"></div>
        <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
        <label>Email</label><input id="newAdminEmail" class="field" type="email">
        <label>Имя</label><input id="newAdminName" class="field">
        <label>Роль</label><select id="newAdminRole" class="field"><option value="moderator">Модератор</option><option value="admin">Админ</option><option value="owner">Владелец</option></select>
        <label>Пароль (не менее 12 символов)</label><input id="newAdminPassword" class="field" type="password">
        <button class="btn" id="saveAdminUser" style="width:100%;margin-top:8px">Сохранить пользователя</button>
      </div>

      <div class="card" id="trashCard">
        <h3 style="margin-top:0">Корзина</h3>
        <p class="muted">Удалённые люди скрываются из публичной части и могут быть восстановлены.</p>
        <div id="adminTrashList"></div>
      </div>

      <div class="card">
        <div class="row">
          <span class="tag" id="cntAll">Все: —</span>
          <span class="tag" id="cntPending">На проверке: —</span>
          <span class="tag" id="cntApproved">Одобрено: —</span>
          <span class="tag" id="cntRejected">Отклонено: —</span>
          <span class="tag" id="cntDraft">Черновики: —</span>
          <span class="tag" id="cntScheduled">Запланировано: —</span>
        </div>
        <label>Поиск</label>
        <input id="mAdminSearch" class="field" placeholder="ФИО, город, место, тип события">
        <label>Статус</label>
        <select id="mAdminStatus" class="field">
          <option value="all">Все</option>
          <option value="pending" selected>На проверке</option>
          <option value="approved">Одобрено</option>
          <option value="rejected">Отклонено</option>
          <option value="hidden">Скрыто</option>
          <option value="draft">Черновики</option>
          <option value="scheduled">Запланировано</option>
        </select>
        <button class="btn secondary" id="mAdminReload" style="width:100%;margin-top:10px">Обновить</button>
      </div>

      <div id="groupWrap">
        <h2 style="font-size:20px;margin:20px 0 8px">Связанные события</h2>
        <p class="muted">7 дней, 40 дней, год, годовщина и йорцайт одного человека можно одобрить одной кнопкой.</p>
        <div id="mAdminGroups"></div>
      </div>

      <h2 style="font-size:20px;margin:20px 0 8px">Заявки</h2>
      <div id="mAdminList"></div>
      <div id="mAdminDetail"></div>

      <h2 style="font-size:20px;margin:22px 0 8px">Дополнительная модерация</h2>
      <div id="mAdminExtras"></div>
      <h2 style="font-size:20px;margin:22px 0 8px">Доставка уведомлений</h2>
      <div id="mAdminDelivery"></div>

      <h2 style="font-size:20px;margin:22px 0 8px">Группы получателей</h2>
      <div class="card">
        <p class="muted">Системные группы уже созданы. Ниже можно добавить свою группу для адресных уведомлений.</p>
        <label>Код группы</label><input id="notifyGroupSlug" class="field" placeholder="naprimer-family-baku">
        <label>Название</label><input id="notifyGroupName" class="field" placeholder="Семья в Баку">
        <label>Описание</label><input id="notifyGroupDescription" class="field" placeholder="Кому предназначена группа">
        <button id="saveNotifyGroup" class="btn" style="width:100%;margin-top:8px">Добавить / обновить группу</button>
      </div>
      <div id="adminNotifyGroups"></div>
    </div>
  `, { scripts: `<script>
  (()=>{
    const qs=s=>document.querySelector(s);
    const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[m]));
    const fmt=v=>v?new Date(v).toLocaleString("ru-RU"):"—";
    const statusText={pending:"На проверке",approved:"Одобрено",rejected:"Отклонено",hidden:"Скрыто",draft:"Черновик",scheduled:"Запланировано"};
    const tokenKey="pamyat_admin_session_token";
    let timer=null,lastRows=[],me=null,importRows=[],notificationGroups=[];

    function token(){return sessionStorage.getItem(tokenKey)||""}
    async function api(url,opts={}){
      const headers=Object.assign({},opts.headers||{});
      if(token())headers["x-admin-token"]=token();
      const r=await fetch(url,Object.assign({},opts,{headers,cache:"no-store"}));
      let data=null;try{data=await r.json()}catch{}
      if(r.status===401)throw new Error("admin_required");
      if(!r.ok)throw new Error((data&&data.error)||("HTTP "+r.status));
      return data;
    }
    function isTest(e){return /тест|test/i.test([e.full_name,e.note,e.place,e.city].filter(Boolean).join(" "))}
    function badge(e){
      return '<span class="tag">'+esc(statusText[e.status]||e.status||"—")+'</span>'+
        (e.urgent?'<span class="tag" style="background:#f5e2e2">Срочно</span>':"")+
        (isTest(e)?'<span class="tag" style="background:#f6ecd5">Тест</span>':"")+
        (e.family_verified?'<span class="tag">Семья ✓</span>':"");
    }
    function buttons(e){
      let out='<div class="row" style="margin-top:10px">';
      out+='<button class="btn secondary" style="padding:8px 10px" data-detail="'+esc(e.id)+'">Детали</button>';
      if(e.status!=="approved")out+='<button class="btn" style="padding:8px 10px" data-action="approve" data-id="'+esc(e.id)+'">Одобрить</button>';
      if(e.status!=="rejected")out+='<button class="btn secondary" style="padding:8px 10px;background:#f5e2e2" data-action="reject" data-id="'+esc(e.id)+'">Отклонить</button>';
      if(e.status==="approved"&&e.visibility==="public")out+='<a class="btn secondary" style="padding:8px 10px" target="_blank" rel="noopener" href="/m/memorial/'+encodeURIComponent(e.id)+'">Публичная страница</a>';
      return out+'</div>';
    }
    function card(e){
      return '<div class="card">'+badge(e)+'<h3 style="margin:8px 0 4px">'+esc(e.full_name||"Без имени")+'</h3>'+
        '<div><b>'+esc(e.event_type||"Событие")+'</b> · '+esc(e.event_date||"без даты")+'</div>'+
        '<div class="muted">'+esc([e.city,e.place].filter(Boolean).join(" · "))+'</div>'+
        '<div class="muted">Создано: '+esc(fmt(e.created_at))+'</div>'+buttons(e)+'</div>';
    }
    function bind(container){
      container.querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>detail(b.dataset.detail));
      container.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>action(b.dataset.id,b.dataset.action));
      container.querySelectorAll("[data-group-action]").forEach(b=>b.onclick=()=>groupAction(b.dataset.ids.split(","),b.dataset.groupAction));
    }
    function renderGroups(rows){
      const pending=rows.filter(x=>x.status==="pending");
      const map=new Map();
      for(const e of pending){
        const k=[String(e.full_name||"").toLowerCase(),e.death_date||"",e.submitter_contact||""].join("|");
        if(!map.has(k))map.set(k,[]);map.get(k).push(e);
      }
      const groups=[...map.values()].filter(g=>g.length>1);
      qs("#groupWrap").style.display=groups.length?"block":"none";
      qs("#mAdminGroups").innerHTML=groups.map(g=>{
        const ids=g.map(x=>x.id).join(",");
        return '<div class="card"><b>'+esc(g[0].full_name)+'</b><div class="muted">'+esc(g.map(x=>x.event_type+" · "+x.event_date).join(" / "))+'</div>'+
          '<div class="row" style="margin-top:10px"><button class="btn" data-group-action="approve" data-ids="'+esc(ids)+'">Одобрить все ('+g.length+')</button>'+
          '<button class="btn secondary" data-group-action="reject" data-ids="'+esc(ids)+'">Отклонить все</button></div></div>';
      }).join("");
      bind(qs("#mAdminGroups"));
    }
    function render(data){
      const rows=data.rows||[],counts=data.counts||{}; lastRows=rows;
      qs("#cntAll").textContent="Все: "+(counts.all??0);
      qs("#cntPending").textContent="На проверке: "+(counts.pending??0);
      qs("#cntApproved").textContent="Одобрено: "+(counts.approved??0);
      qs("#cntRejected").textContent="Отклонено: "+(counts.rejected??0);
      qs("#cntDraft").textContent="Черновики: "+(counts.draft??0);
      qs("#cntScheduled").textContent="Запланировано: "+(counts.scheduled??0);
      qs("#mAdminList").innerHTML=rows.length?rows.map(card).join(""):'<div class="card muted">Ничего не найдено.</div>';
      bind(qs("#mAdminList"));renderGroups(rows);
    }
    async function loadStats(){
      const [s,h]=await Promise.all([api("/api/admin/stats"),fetch("/health",{cache:"no-store"}).then(r=>r.json()).catch(()=>({}))]);
      qs("#adminStats").innerHTML=
        '<span class="tag">Событий: '+s.events_total+'</span><span class="tag">Pending: '+s.pending+'</span>'+
        '<span class="tag">Подписки: '+s.active_subscriptions+'</span><span class="tag">Свечи: '+s.candles+'</span>'+
        '<span class="tag">Доставки 24ч: '+s.deliveries_24h+'</span><span class="tag">Ошибки 24ч: '+s.failed_attempts_24h+'</span>'+
        '<span class="tag">Off-site backup: '+(h.offsite_backup_configured?"подключён":"нужен внешний storage")+'</span>';
    }
    async function extraAction(kind,id,act){
      await api("/api/admin/moderation/"+encodeURIComponent(kind)+"/"+encodeURIComponent(id)+"/"+encodeURIComponent(act),{method:"POST"});
      await loadExtras();await loadStats();
    }
    async function loadExtras(){
      const [q,privacy]=await Promise.all([
        api("/api/admin/queue"),
        api("/api/admin/privacy-requests").catch(()=>[])
      ]);
      const comments=q.comments||[],claims=q.claims||[],reports=q.reports||[],corr=q.corrections||[];
      const blocks=[];
      for(const x of comments)blocks.push('<div class="card"><b>Комментарий</b><div>'+esc(x.body||"")+'</div><div class="row" style="margin-top:8px"><button class="btn" data-extra-kind="comment" data-extra-id="'+x.id+'" data-extra-act="approve">Одобрить</button><button class="btn secondary" data-extra-kind="comment" data-extra-id="'+x.id+'" data-extra-act="reject">Отклонить</button></div></div>');
      for(const x of claims)blocks.push('<div class="card"><b>Подтверждение родственника</b><div>'+esc(x.claimant_name||"")+' · '+esc(x.relation_type||"")+'</div><div class="muted">'+esc(x.contact||"")+'</div><div class="row" style="margin-top:8px"><button class="btn" data-extra-kind="claim" data-extra-id="'+x.id+'" data-extra-act="approve">Подтвердить семью</button><button class="btn secondary" data-extra-kind="claim" data-extra-id="'+x.id+'" data-extra-act="reject">Отклонить</button></div></div>');
      for(const x of reports)blocks.push('<div class="card"><b>Жалоба / ошибка</b><div>'+esc(x.reason||"")+'</div><div class="muted">'+esc(x.details||"")+'</div><div class="row" style="margin-top:8px"><button class="btn secondary" data-extra-kind="report" data-extra-id="'+x.id+'" data-extra-act="close">Закрыть</button></div></div>');
      for(const x of corr)blocks.push('<div class="card"><b>Исправление данных</b><div>'+esc(x.field_name||"")+'</div><div><s>'+esc(x.current_value||"")+'</s> → '+esc(x.proposed_value||"")+'</div><div class="row" style="margin-top:8px"><button class="btn" data-extra-kind="correction" data-extra-id="'+x.id+'" data-extra-act="approve">Принять</button><button class="btn secondary" data-extra-kind="correction" data-extra-id="'+x.id+'" data-extra-act="reject">Отклонить</button></div></div>');
      for(const x of privacy||[])blocks.push('<div class="card"><b>Запрос на удаление персональных данных</b><div>'+esc(x.full_name||"")+'</div><div class="muted">'+esc(x.requester_name||"")+' · '+esc(x.requester_contact||"")+'</div><div>'+esc(x.details||"")+'</div><div class="row" style="margin-top:8px"><button class="btn" data-privacy-id="'+esc(x.id)+'" data-privacy-act="approve">Удалить контакты</button><button class="btn secondary" data-privacy-id="'+esc(x.id)+'" data-privacy-act="reject">Отклонить</button></div></div>');
      qs("#mAdminExtras").innerHTML=blocks.join("")||'<div class="card muted">Нет заявок на дополнительную модерацию.</div>';
      qs("#mAdminExtras").querySelectorAll("[data-extra-kind]").forEach(b=>b.onclick=()=>extraAction(b.dataset.extraKind,b.dataset.extraId,b.dataset.extraAct).catch(e=>alert(e.message)));
      qs("#mAdminExtras").querySelectorAll("[data-privacy-id]").forEach(b=>b.onclick=async()=>{
        if(b.dataset.privacyAct==="approve"&&!confirm("Удалить контактные персональные данные по этому запросу?"))return;
        await api("/api/admin/privacy-requests/"+encodeURIComponent(b.dataset.privacyId)+"/"+b.dataset.privacyAct,{method:"POST"});
        await loadExtras();await loadStats();
      });
    }
    async function loadDelivery(){
      const d=await api("/api/admin/notifications?limit=40"),s=d.summary||{},by=s.by_channel||{};
      const rows=(d.attempts||[]).slice(0,40);
      const totals='<div class="card"><b>Итог доставки</b><div class="row" style="margin-top:8px">'+
        '<span class="tag">Попытки: '+Number(s.attempts||0)+'</span><span class="tag">Успешно: '+Number(s.success||0)+'</span><span class="tag">Ошибки: '+Number(s.failed||0)+'</span><span class="tag">Доставлено: '+Number(s.deliveries||0)+'</span></div>'+
        '<div class="muted" style="margin-top:8px">'+Object.entries(by).map(([k,v])=>esc(k.toUpperCase())+': '+Number(v.success||0)+' / '+Number(v.attempts||0)).join(' · ')+'</div></div>';
      qs("#mAdminDelivery").innerHTML=totals+(rows.length?rows.map(x=>'<div class="card"><b>'+esc(x.channel.toUpperCase())+' · '+esc(x.full_name)+'</b>'+
        '<div>'+esc(x.event_type||"")+' · '+esc(x.event_date||"")+'</div><div class="muted">'+esc(fmt(x.attempted_at))+' · '+(x.success?"успешно":"ошибка")+
        (x.detail?' · '+esc(x.detail):"")+'</div></div>').join(""):'<div class="card muted">Попыток доставки пока нет.</div>');
    }

    async function loadAdminGroups(){
      notificationGroups=await api("/api/admin/notification-groups");
      const wrap=qs("#adminNotifyGroups");
      wrap.innerHTML=notificationGroups.map(g=>'<div class="card"><b>'+esc(g.name)+'</b> <span class="tag">'+esc(g.slug)+'</span>'+
        '<div class="muted">'+esc(g.description||"")+' · '+(g.active?"активна":"отключена")+(g.system?" · системная":"")+'</div>'+
        (!g.system?'<button class="btn secondary" data-group-toggle="'+esc(g.slug)+'" data-group-name="'+esc(g.name)+'" data-group-description="'+esc(g.description||"")+'" data-active="'+(g.active?"1":"0")+'" style="margin-top:8px">'+(g.active?"Отключить":"Включить")+'</button>':"")+
        '</div>').join("")||'<div class="muted">Групп пока нет.</div>';
      wrap.querySelectorAll("[data-group-toggle]").forEach(b=>b.onclick=async()=>{
        await api("/api/admin/notification-groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          slug:b.dataset.groupToggle,name:b.dataset.groupName,description:b.dataset.groupDescription,active:b.dataset.active!=="1"
        })});await loadAdminGroups();
      });
    }
    async function saveNotifyGroup(){
      const slug=qs("#notifyGroupSlug").value.trim().toLowerCase(),name=qs("#notifyGroupName").value.trim(),description=qs("#notifyGroupDescription").value.trim();
      await api("/api/admin/notification-groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,name,description,active:true})});
      qs("#notifyGroupSlug").value="";qs("#notifyGroupName").value="";qs("#notifyGroupDescription").value="";await loadAdminGroups();
    }
    async function downloadAdmin(url,name){
      const headers={};if(token())headers["x-admin-token"]=token();
      const r=await fetch(url,{headers,cache:"no-store"});
      if(!r.ok)throw new Error("download_failed");
      const blob=await r.blob(),a=document.createElement("a");
      a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }
    async function loadSessions(){
      const rows=await api("/api/admin/auth/sessions");
      qs("#adminSessions").innerHTML=rows.length?rows.map(s=>
        '<div class="card"><b>'+esc(s.device_label||"Устройство")+'</b>'+
        '<div class="muted">Вход: '+esc(fmt(s.created_at))+'<br>Последняя активность: '+esc(fmt(s.last_seen_at))+'<br>Сессия до: '+esc(fmt(s.expires_at))+'</div>'+
        (s.revoked?'<span class="tag">Завершена</span>':'<button class="btn secondary" data-revoke-session="'+esc(s.session_id)+'" style="margin-top:8px">Завершить эту сессию</button>')+
        '</div>'
      ).join(""):'<div class="muted">Активных серверных сессий пока нет.</div>';
      qs("#adminSessions").querySelectorAll("[data-revoke-session]").forEach(b=>b.onclick=async()=>{
        const r=await api("/api/admin/auth/sessions/"+encodeURIComponent(b.dataset.revokeSession)+"/revoke",{method:"POST"});
        if(r.current){sessionStorage.removeItem(tokenKey);location.reload();return}
        await loadSessions();
      });
    }

    async function loadUsers(){
      if(me?.role!=="owner")return;
      const rows=await api("/api/admin/users");
      qs("#adminUsersList").innerHTML=rows.map(x=>
        '<div class="card"><b>'+esc(x.display_name||x.email)+'</b><div class="muted">'+esc(x.email)+' · '+esc(x.role)+' · '+(x.active?"активен":"отключён")+'</div>'+
        '<div class="row" style="margin-top:8px"><button class="btn secondary" data-user-edit="'+esc(x.email)+'" data-role="'+esc(x.role)+'" data-name="'+esc(x.display_name||"")+'" data-active="'+(x.active?"1":"0")+'">Изменить</button>'+
        '<button class="btn secondary" data-user-toggle="'+esc(x.email)+'" data-role="'+esc(x.role)+'" data-name="'+esc(x.display_name||"")+'" data-active="'+(x.active?"1":"0")+'" style="'+(x.active?'background:#f5e2e2':'')+'">'+(x.active?"Отключить":"Включить")+'</button></div></div>'
      ).join("")||'<div class="muted">Нет пользователей.</div>';
      qs("#adminUsersList").querySelectorAll("[data-user-edit]").forEach(b=>b.onclick=()=>{
        qs("#newAdminEmail").value=b.dataset.userEdit;
        qs("#newAdminRole").value=b.dataset.role;
        qs("#newAdminName").value=b.dataset.name||"";
        qs("#newAdminPassword").value="";
        qs("#newAdminEmail").scrollIntoView({behavior:"smooth"});
      });
      qs("#adminUsersList").querySelectorAll("[data-user-toggle]").forEach(b=>b.onclick=async()=>{
        const active=b.dataset.active!=="1";
        if(!confirm((active?"Включить ":"Отключить ")+b.dataset.userToggle+"?"))return;
        try{
          await api("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
            email:b.dataset.userToggle,role:b.dataset.role,display_name:b.dataset.name||"",active
          })});
          await loadUsers();
        }catch(e){alert(e.message)}
      });
    }
    async function saveAdminUser(){
      const email=qs("#newAdminEmail").value.trim(),role=qs("#newAdminRole").value,display_name=qs("#newAdminName").value.trim(),password=qs("#newAdminPassword").value;
      await api("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,role,display_name,active:true})});
      if(password)await api("/api/admin/users/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
      qs("#newAdminPassword").value="";await loadUsers();
    }
    async function loadTrash(){
      if(me?.role==="moderator"){qs("#trashCard").style.display="none";return}
      qs("#trashCard").style.display="block";
      const rows=await api("/api/admin/trash");
      qs("#adminTrashList").innerHTML=rows.length?rows.map(x=>
        '<div class="card"><b>'+esc(x.full_name||"Удалено")+'</b><div class="muted">'+esc(x.death_date||"")+' · событий: '+Number(x.events||0)+' · '+esc(fmt(x.trashed_at))+'</div>'+
        (!x.purge_marker?'<button class="btn secondary" data-restore-trash="'+esc(x.id)+'" style="margin-top:8px">Восстановить</button>':'<span class="tag">Удалено окончательно</span>')+'</div>'
      ).join(""):'<div class="muted">Корзина пуста.</div>';
      qs("#adminTrashList").querySelectorAll("[data-restore-trash]").forEach(b=>b.onclick=async()=>{
        await api("/api/admin/events/"+encodeURIComponent(b.dataset.restoreTrash)+"/restore",{method:"POST"});await loadTrash();await load();
      });
    }
    async function previewImport(){
      const file=qs("#adminImportFile").files[0];if(!file)return alert("Выберите CSV.");
      const fd=new FormData();fd.append("file",file);
      const d=await api("/api/admin/import/preview",{method:"POST",body:fd});
      importRows=d.rows||[];
      qs("#adminImportResult").innerHTML='Строк: '+d.total+' · корректных: '+d.valid+
        '<br><button class="btn" id="adminImportCommit" style="width:100%;margin-top:8px">Импортировать корректные строки</button>';
      qs("#adminImportCommit").onclick=async()=>{
        if(!confirm("Импортировать данные на модерацию?"))return;
        const r=await api("/api/admin/import/commit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:importRows,allow_duplicates:false})});
        qs("#adminImportResult").textContent='Создано: '+r.created+' · дубли пропущены: '+r.skipped_duplicates+' · ошибок: '+r.invalid;
        await load();
      };
    }

    async function loadSystemStatus(){
      try{
        const d=await api("/api/admin/system-status"),p=d.providers||{},warnings=d.warnings||[];
        const chips=[
          ["База",d.ok],["Push",p.push],["Email",p.email],["Telegram",p.telegram],["WhatsApp",p.whatsapp],["SMS",p.sms],
          ["Внешний backup",d.offsite_backup]
        ].map(([k,v])=>'<span class="tag" style="'+(v?'':'background:#f5e2e2')+'">'+esc(k)+': '+(v?'OK':'внимание')+'</span>').join("");
        qs("#adminSystemStatus").innerHTML='<div class="row">'+chips+'</div>'+
          '<div class="muted" style="margin-top:8px">Ошибок доставки: '+Number(d.failed_notifications||0)+' · Uptime: '+Number(d.uptime_seconds||0)+' сек.'+
          (d.last_snapshot?' · Последний снимок: '+esc(d.last_snapshot.snapshot_date):'')+'</div>'+
          (warnings.length?'<div class="err" style="margin-top:8px">'+warnings.map(esc).join("<br>")+'</div>':'<div class="ok" style="margin-top:8px">Критических предупреждений нет.</div>');
      }catch(e){qs("#adminSystemStatus").innerHTML='<div class="err">Диагностика недоступна: '+esc(e.message)+'</div>'}
    }
    async function loadSnapshots(){
      if(me?.role!=="owner")return;
      const rows=await api("/api/admin/snapshots");
      qs("#snapshotList").innerHTML=(rows||[]).map(x=>'<div class="card"><b>'+esc(x.snapshot_date)+'</b><div class="muted">'+esc(fmt(x.created_at))+' · событий: '+Number(x.events||0)+'</div><button class="btn secondary" data-restore-snapshot="'+esc(x.snapshot_date)+'" style="margin-top:8px">Восстановить к этой дате</button></div>').join("")||'<div class="muted">Снимков пока нет.</div>';
      qs("#snapshotList").querySelectorAll("[data-restore-snapshot]").forEach(b=>b.onclick=async()=>{
        if(!confirm("Восстановить данные к снимку "+b.dataset.restoreSnapshot+"? Новые записи после этой даты будут скрыты."))return;
        const phrase=prompt("Для подтверждения введите RESTORE");if(phrase!=="RESTORE")return;
        await api("/api/admin/snapshots/"+encodeURIComponent(b.dataset.restoreSnapshot)+"/restore",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"RESTORE"})});
        alert("Восстановление выполнено.");await load();await loadSnapshots();
      });
    }
    async function createDraft(){
      const body={
        full_name:qs("#draftFullName").value.trim(),death_date:qs("#draftDeathDate").value,
        event_type:qs("#draftEventType").value.trim(),event_date:qs("#draftEventDate").value,event_time:qs("#draftEventTime").value,
        publish_at:qs("#draftPublishAt").value?new Date(qs("#draftPublishAt").value).toISOString():null,
        visibility:qs("#draftVisibility").value,city:qs("#draftCity").value.trim(),place:qs("#draftPlace").value.trim(),note:qs("#draftNote").value.trim()
      };
      if(!body.full_name)throw new Error("Укажите ФИО");
      const dup=await fetch("/api/duplicates?"+new URLSearchParams({full_name:body.full_name,death_date:body.death_date||"",city:body.city||""}),{cache:"no-store"}).then(r=>r.json()).catch(()=>[]);
      if(dup.length&&!confirm("Найдены похожие записи: "+dup.slice(0,3).map(x=>x.full_name+" ("+(x.death_date||"без даты")+")").join(", ")+". Всё равно создать черновик?"))return;
      const d=await api("/api/admin/drafts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      qs("#draftStatus").innerHTML='<div class="ok">'+(d.status==="scheduled"?"Публикация запланирована.":"Черновик сохранён.")+'</div>';
      qs("#draftFullName").value="";qs("#draftNote").value="";await load();
    }
    async function load(){
      const q=qs("#mAdminSearch").value.trim(),status=qs("#mAdminStatus").value;
      const data=await api("/api/admin/events/list?"+new URLSearchParams({status,q,limit:"300"}));
      render(data); await Promise.all([loadStats(),loadDelivery(),loadExtras(),loadAdminGroups(),loadSystemStatus()]);
    }
    async function showApp(){
      me=await api("/api/admin/auth/status");
      qs("#adminLoginCard").style.display="none";
      qs("#mAdminApp").style.display="block";
      qs("#adminWho").textContent=(me.display_name||me.email||"")+" · "+(me.role||"");
      const owner=me.role==="owner";
      qs("#ownerUsersCard").style.display=owner?"block":"none";
      qs("#snapshotCard").style.display=owner?"block":"none";
      qs("#backupTest").style.display=owner?"inline-block":"none";
      if(owner)await Promise.all([loadUsers(),loadSnapshots()]);
      await Promise.all([loadTrash(),loadSessions()]);
      await load();
    }
    async function passwordLogin(){
      const user=qs("#mAdminUser").value.trim(),password=qs("#mAdminPassword").value;
      qs("#mAdminLoginStatus").innerHTML='<div class="muted">Проверка…</div>';
      try{
        const r=await fetch("/api/admin/auth/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({user,password})});
        const d=await r.json();
        if(!r.ok)throw new Error(d.error||"Неверный логин или пароль");
        qs("#mAdminPassword").value="";
        qs("#mAdminLoginStatus").innerHTML="";
        await showApp();
      }catch(e){qs("#mAdminLoginStatus").innerHTML='<div class="err">Неверный логин или пароль.</div>'}
    }
    async function tokenLogin(){
      const v=qs("#mAdminToken").value.trim();if(v)sessionStorage.setItem(tokenKey,v);
      try{await api("/api/admin/auth/status");qs("#mAdminToken").value="";await showApp()}
      catch(e){sessionStorage.removeItem(tokenKey);qs("#mAdminLoginStatus").innerHTML='<div class="err">Неверный токен.</div>'}
    }
    async function magic(){
      const email=qs("#mAdminEmail").value.trim();
      if(!email)return;
      const r=await fetch("/api/admin/auth/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
      const d=await r.json();
      qs("#mAdminLoginStatus").innerHTML=r.ok?'<div class="ok">'+esc(d.message||"Ссылка отправлена.")+'</div>':'<div class="err">'+esc(d.error||"Ошибка")+'</div>';
    }
    async function bindEmail(){
      const email=qs("#mAdminEmail").value.trim(),v=qs("#mAdminToken").value.trim();
      if(!email||!v){qs("#mAdminLoginStatus").innerHTML='<div class="err">Введите email и токен.</div>';return}
      sessionStorage.setItem(tokenKey,v);
      try{
        await api("/api/admin/setup-email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,role:"admin"})});
        qs("#mAdminLoginStatus").innerHTML='<div class="ok">Email разрешён. Теперь можно входить по ссылке.</div>';
      }catch(e){qs("#mAdminLoginStatus").innerHTML='<div class="err">'+esc(e.message)+'</div>'}
    }
    async function action(id,act){
      if(act==="reject"&&!confirm("Отклонить эту заявку?"))return;
      await api("/api/admin/events/"+encodeURIComponent(id)+"/"+act,{method:"POST"});await load();
    }
    async function groupAction(ids,act){
      if(act==="reject"&&!confirm("Отклонить все связанные события?"))return;
      await api("/api/admin/events/group/"+act,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids})});await load();
    }
    async function detail(id){
      if(!notificationGroups.length)await loadAdminGroups();
      const [d,rsvp]=await Promise.all([
        api("/api/admin/events/"+encodeURIComponent(id)+"/details"),
        api("/api/admin/events/"+encodeURIComponent(id)+"/rsvp").catch(()=>({yes:0,no:0,follow:0,responses:[]}))
      ]),e=d.event||{};
      const history=(d.history||[]).map(h=>'<div class="card"><b>'+esc(h.operation||"изменение")+'</b><div class="muted">'+esc(fmt(h.created_at))+'</div></div>').join("");
      const hidden=Boolean(e.trashed_at);
      const privateSuffix=e.visibility==="public"?"":(e.share_token?"?key="+encodeURIComponent(e.share_token):"");
      const viewUrl="/m/memorial/"+encodeURIComponent(id)+privateSuffix;
      const audience=Array.isArray(e.audience_groups)&&e.audience_groups.length?e.audience_groups:["all"];
      const groupChecks=notificationGroups.filter(g=>g.active).map(g=>'<label class="check"><input class="editAudienceGroup" type="checkbox" value="'+esc(g.slug)+'" '+(audience.includes(g.slug)?"checked":"")+'><span>'+esc(g.name)+'</span></label>').join("");
      qs("#mAdminDetail").innerHTML=
        '<div class="card" style="border-width:2px">'+badge(e)+
        '<h2>'+esc(e.full_name||"Без имени")+'</h2>'+
        '<img id="detailPhotoPreview" src="/api/events/'+encodeURIComponent(id)+'/photo'+privateSuffix+(privateSuffix?'&':'?')+'v='+Date.now()+'" alt="Фото" style="width:160px;max-height:200px;object-fit:cover;border-radius:14px;display:block;margin:10px 0" onerror="this.style.display=\'none\'">'+
        '<label>Фото человека</label><input id="detailPhoto" class="field" type="file" accept="image/jpeg,image/png,image/webp">'+
        '<div class="row" style="margin-top:8px"><button class="btn secondary" id="uploadDetailPhoto">Загрузить фото</button><button class="btn secondary" id="removeDetailPhoto">Удалить фото</button></div>'+
        '<h3>Редактирование</h3>'+
        '<label>ФИО</label><input id="editFullName" class="field" value="'+esc(e.full_name||"")+'">'+
        '<label>Дата смерти</label><input id="editDeathDate" class="field" type="date" value="'+esc(e.death_date||"")+'">'+
        '<label>Тип события</label><input id="editEventType" class="field" value="'+esc(e.event_type||"")+'">'+
        '<label>Дата события</label><input id="editEventDate" class="field" type="date" value="'+esc(e.event_date||"")+'">'+
        '<label>Время</label><input id="editEventTime" class="field" type="time" value="'+esc(e.event_time||"")+'">'+
        '<label>Часовой пояс события</label><input id="editEventTimezone" class="field" value="'+esc(e.event_timezone||"Europe/Moscow")+'" placeholder="Europe/Moscow">'+
        '<label>Приватность</label><select id="editVisibility" class="field"><option value="public" '+(e.visibility==="public"?"selected":"")+'>Публично</option><option value="link" '+(e.visibility==="link"?"selected":"")+'>Только по ссылке</option><option value="invited" '+(e.visibility==="invited"?"selected":"")+'>Только приглашённым</option></select>'+
        '<label>Группы получателей</label><div class="card" style="padding:10px">'+groupChecks+'</div>'+
        '<label>Город</label><input id="editCity" class="field" value="'+esc(e.city||"")+'">'+
        '<label>Место</label><input id="editPlace" class="field" value="'+esc(e.place||"")+'">'+
        '<label>Комментарий</label><textarea id="editNote" class="field" rows="4">'+esc(e.note||"")+'</textarea>'+
        '<label>Контакт семьи для публичной страницы</label><input id="editPublicContact" class="field" value="'+esc(e.public_contact||"")+'" placeholder="+79991234567">'+
        '<div class="check"><input id="editPublicContactAllowed" type="checkbox" '+(e.public_contact_allowed?"checked":"")+'><span>Семья разрешила показывать этот контакт публично</span></div>'+
        '<label>Еврейская дата</label><input id="editHebrewDate" class="field" value="'+esc(e.hebrew_death_label||"")+'">'+
        '<label>Ближайший йорцайт</label><input id="editYahrzeit" class="field" type="date" value="'+esc(e.yahrzeit_date||"")+'">'+
        '<div class="check"><input id="editFamilyVerified" type="checkbox" '+(e.family_verified?"checked":"")+'><span>Подтверждено семьёй</span></div>'+
        '<div class="check"><input id="editSourceVerified" type="checkbox" '+(e.source_verified?"checked":"")+'><span>Подтверждено источником</span></div>'+
        '<div class="check"><input id="editUrgent" type="checkbox" '+(e.urgent?"checked":"")+'><span>Срочное событие</span></div>'+
        '<div class="card" style="margin-top:10px"><b>Ссылка на страницу</b><div class="muted">'+(e.visibility==="public"?"Публичная страница":e.visibility==="link"?"Доступ только по уникальной ссылке":"Доступ по приглашению / уникальной ссылке")+'</div>'+
          '<div class="row" style="margin-top:8px"><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(viewUrl)+'">Открыть</a><button class="btn secondary" id="copyPrivateLink">Копировать ссылку</button></div></div>'+
        '<div class="card"><b>Подтверждения присутствия</b><div class="row" style="margin-top:8px"><span class="tag">Будут: '+Number(rsvp.yes||0)+'</span><span class="tag">Не смогут: '+Number(rsvp.no||0)+'</span><span class="tag">Ждут изменений: '+Number(rsvp.follow||0)+'</span></div></div>'+
        '<button class="btn" id="saveEventEdit" style="width:100%;margin-top:10px">Сохранить изменения</button>'+
        '<div class="card" style="margin-top:12px"><h3 style="margin-top:0">Рассылка</h3><p class="muted">Сначала просмотрите сообщение и количество адресатов. Для изменения времени/места по умолчанию выбираются только те, кто уже получал это событие.</p>'+
          '<div class="row"><button class="btn secondary" id="previewUpdateBroadcast">Превью изменений</button><button class="btn secondary" id="previewReminderBroadcast">Превью напоминания</button><button class="btn secondary" id="testAdminBroadcast">Тест себе на email</button></div>'+
          '<div id="broadcastPreview" class="muted" style="margin-top:10px">Превью ещё не построено.</div>'+
          '<div class="row" style="margin-top:8px"><button class="btn" id="sendUpdateBroadcast">Отправить изменения</button><button class="btn secondary" id="sendReminderBroadcast">Отправить напоминание</button></div></div>'+
        buttons(e)+
        '<h3>Дубликаты</h3><p class="muted">Укажите ID дублирующего события. Свечи, комментарии и подтверждения будут перенесены в эту запись.</p>'+
        '<input id="mergeDuplicateId" class="field" placeholder="UUID дубликата"><button class="btn secondary" id="mergeDuplicate" style="width:100%;margin-top:8px">Объединить дубликат</button>'+
        '<button class="btn secondary" id="redactPersonalData" style="width:100%;margin-top:8px">Удалить контактные персональные данные</button>'+
        (hidden?
          '<button class="btn" id="restorePerson" style="width:100%;margin-top:12px">Восстановить из корзины</button>'+
          (me?.role==="owner"?'<button class="btn secondary" id="purgePerson" style="width:100%;margin-top:8px;background:#f5e2e2">Удалить окончательно</button>':"")
          :
          '<button class="btn secondary" id="trashPerson" style="width:100%;margin-top:12px;background:#f5e2e2">Переместить человека в корзину</button>'
        )+
        '</div><h3>История</h3>'+(history||'<div class="muted">Изменений пока нет.</div>');

      bind(qs("#mAdminDetail"));

      qs("#saveEventEdit").onclick=async()=>{
        const groups=[...document.querySelectorAll(".editAudienceGroup:checked")].map(x=>x.value);
        const body={
          full_name:qs("#editFullName").value,death_date:qs("#editDeathDate").value,event_type:qs("#editEventType").value,
          event_date:qs("#editEventDate").value,event_time:qs("#editEventTime").value,event_timezone:qs("#editEventTimezone").value,
          visibility:qs("#editVisibility").value,audience_groups:groups.length?groups:["all"],city:qs("#editCity").value,place:qs("#editPlace").value,
          note:qs("#editNote").value,public_contact:qs("#editPublicContact").value,public_contact_allowed:qs("#editPublicContactAllowed").checked,
          hebrew_death_label:qs("#editHebrewDate").value,yahrzeit_date:qs("#editYahrzeit").value,
          yahrzeit_rule:e.yahrzeit_rule||"standard",family_verified:qs("#editFamilyVerified").checked,
          source_verified:qs("#editSourceVerified").checked,urgent:qs("#editUrgent").checked
        };
        const saved=await api("/api/admin/events/"+encodeURIComponent(id)+"/edit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
        if(saved.important_changed)alert("Время или место события изменилось. Проверьте превью рассылки и при необходимости отправьте обновление тем, кто уже получил объявление.");
        await load();await detail(id);
      };

      qs("#copyPrivateLink").onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+viewUrl);alert("Ссылка скопирована.")}catch{}};
      const selectedAudience=()=>[...document.querySelectorAll(".editAudienceGroup:checked")].map(x=>x.value);
      async function previewBroadcast(mode){
        const groups=selectedAudience(),only=mode==="update"?"1":"0";
        const d=await api("/api/admin/events/"+encodeURIComponent(id)+"/broadcast-preview?"+new URLSearchParams({mode,groups:groups.join(","),only_previous:only}));
        const ch=d.channels||{},m=d.message||{};
        qs("#broadcastPreview").innerHTML='<b>'+esc(m.title||"")+'</b><br>'+esc(m.body||"")+'<br><br><b>Получателей:</b> '+Number(d.total_subscribers||0)+
          '<br>Push '+Number(ch.push||0)+' · Email '+Number(ch.email||0)+' · Telegram '+Number(ch.telegram||0)+' · WhatsApp '+Number(ch.whatsapp||0)+' · SMS '+Number(ch.sms||0);
        return d;
      }
      qs("#previewUpdateBroadcast").onclick=()=>previewBroadcast("update").catch(x=>alert(x.message));
      qs("#previewReminderBroadcast").onclick=()=>previewBroadcast("announcement").catch(x=>alert(x.message));
      async function sendBroadcast(mode){
        const p=await previewBroadcast(mode);
        if(!confirm("Отправить это сообщение? Подписчиков: "+Number(p.total_subscribers||0)))return;
        const groups=selectedAudience();
        const r=await api("/api/admin/events/"+encodeURIComponent(id)+"/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          mode,groups,only_previous:mode==="update"
        })});
        alert("Рассылка завершена. Отправлено по каналам: "+Number(r.sent||0)+", ошибок: "+Number(r.failed||0)+".");
        await loadDelivery();
      }
      qs("#sendUpdateBroadcast").onclick=()=>sendBroadcast("update").catch(x=>alert(x.message));
      qs("#sendReminderBroadcast").onclick=()=>sendBroadcast("announcement").catch(x=>alert(x.message));
      qs("#testAdminBroadcast").onclick=async()=>{
        try{
          const r=await api("/api/admin/events/"+encodeURIComponent(id)+"/test-broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"announcement"})});
          alert("Тест отправлен на "+(r.to||"email администратора")+".");
        }catch(e){alert("Тест не отправлен: "+e.message)}
      };

      qs("#uploadDetailPhoto").onclick=async()=>{
        const file=qs("#detailPhoto").files[0];if(!file)return alert("Выберите фото.");
        const fd=new FormData();fd.append("photo",file);
        await api("/api/admin/events/"+encodeURIComponent(id)+"/photo",{method:"POST",body:fd});
        const img=qs("#detailPhotoPreview");img.src="/api/events/"+encodeURIComponent(id)+"/photo"+privateSuffix+(privateSuffix?"&":"?")+"v="+Date.now();img.style.display="block";
      };
      qs("#removeDetailPhoto").onclick=async()=>{
        if(!confirm("Удалить фото?"))return;
        await api("/api/admin/events/"+encodeURIComponent(id)+"/photo",{method:"DELETE"});
        qs("#detailPhotoPreview").style.display="none";
      };
      qs("#redactPersonalData").onclick=async()=>{
        if(!confirm("Удалить контактные персональные данные подателя и заявителей, сохранив историческую запись?"))return;
        await api("/api/admin/events/"+encodeURIComponent(id)+"/redact-personal",{method:"POST"});
        alert("Контактные персональные данные удалены.");await detail(id);
      };
      qs("#mergeDuplicate").onclick=async()=>{
        const duplicate_id=qs("#mergeDuplicateId").value.trim();
        if(!duplicate_id)return;
        if(!confirm("Объединить дубликат с этой записью?"))return;
        await api("/api/admin/events/"+encodeURIComponent(id)+"/merge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({duplicate_id})});
        await load();await detail(id);
      };

      if(qs("#trashPerson"))qs("#trashPerson").onclick=async()=>{
        if(!confirm("Переместить человека и все его памятные даты в корзину?"))return;
        const r=await api("/api/admin/events/"+encodeURIComponent(id)+"/trash",{method:"POST"});
        alert("В корзину перемещено событий: "+(r.trashed_events??0));
        qs("#mAdminDetail").innerHTML="";await loadTrash();await load();
      };
      if(qs("#restorePerson"))qs("#restorePerson").onclick=async()=>{
        const r=await api("/api/admin/events/"+encodeURIComponent(id)+"/restore",{method:"POST"});
        alert("Восстановлено событий: "+(r.restored_events??0));
        qs("#mAdminDetail").innerHTML="";await loadTrash();await load();
      };
      if(qs("#purgePerson"))qs("#purgePerson").onclick=async()=>{
        if(!confirm("Окончательно удалить персональные данные этого человека? Это действие необратимо."))return;
        const phrase=prompt('Для подтверждения введите PURGE');
        if(phrase!=="PURGE")return;
        await api("/api/admin/events/"+encodeURIComponent(id)+"/purge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"PURGE"})});
        qs("#mAdminDetail").innerHTML="";await loadTrash();await load();
      };
      qs("#mAdminDetail").scrollIntoView({behavior:"smooth"});
    }

    qs("#backupTest").onclick=async()=>{try{const r=await api("/api/admin/backup/test",{method:"POST"});alert(r.ok?"Внешняя резервная копия отправлена.":"Внешний backup ещё не настроен.")}catch(e){alert("Backup: "+e.message)}};
    qs("#refreshSystemStatus").onclick=()=>loadSystemStatus();
    qs("#retryFailedNotifications").onclick=async()=>{
      if(!confirm("Повторить только последние неудачные отправки? Успешные получатели повторно сообщение не получат."))return;
      const r=await api("/api/admin/notifications/retry-failed",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({limit:100})});
      alert("Повтор: отправлено "+Number(r.sent||0)+", ошибок "+Number(r.failed||0)+".");await loadDelivery();await loadSystemStatus();
    };
    qs("#createDraft").onclick=()=>createDraft().catch(e=>{qs("#draftStatus").innerHTML='<div class="err">'+esc(e.message)+'</div>'});
    qs("#createSnapshot").onclick=async()=>{const r=await api("/api/admin/snapshots",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({})});alert("Снимок создан: "+(r.snapshot_date||"сегодня"));await loadSnapshots()};
    qs("#mAdminPasswordLogin").onclick=passwordLogin;
    qs("#mAdminShowPassword").onchange=e=>{qs("#mAdminPassword").type=e.target.checked?"text":"password"};
    qs("#mAdminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")passwordLogin()});
    qs("#mAdminUser").addEventListener("keydown",e=>{if(e.key==="Enter")passwordLogin()});
    qs("#mAdminMagic").onclick=magic;qs("#mAdminLogin").onclick=tokenLogin;qs("#mAdminBindEmail").onclick=bindEmail;
    qs("#mAdminReload").onclick=()=>load().catch(e=>alert(e.message));
    qs("#saveNotifyGroup").onclick=()=>saveNotifyGroup().catch(e=>alert(e.message));
    qs("#saveAdminUser").onclick=()=>saveAdminUser().catch(e=>alert(e.message));
    qs("#adminImportPreview").onclick=()=>previewImport().catch(e=>alert(e.message));
    document.querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>downloadAdmin(b.dataset.export,b.dataset.name).catch(e=>alert(e.message)));
    qs("#revokeAllSessions").onclick=async()=>{
      if(!confirm("Завершить все ваши админ-сессии на всех устройствах?"))return;
      await api("/api/admin/auth/revoke-all",{method:"POST"});sessionStorage.removeItem(tokenKey);location.reload();
    };
    qs("#mAdminStatus").onchange=()=>load().catch(()=>{});
    qs("#mAdminSearch").oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load().catch(()=>{}),300)};
    qs("#mAdminLogout").onclick=async()=>{sessionStorage.removeItem(tokenKey);await fetch("/api/admin/auth/logout",{method:"POST"});location.reload()};
    (async()=>{try{await api("/api/admin/auth/status");await showApp()}catch{}})();
  })();
  </script>` }));
});

function qualityLabel(v){
  return ({family_verified:"Подтверждено семьёй",source_verified:"Подтверждено источником",family_and_source:"Семья + источник",needs_review:"Требует проверки"})[v]||"Требует проверки";
}
function haversine(a,b){
  const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function greedyRoute(points){
  if(points.length<2)return points;
  const left=points.slice(1),out=[points[0]];
  while(left.length){const last=out[out.length-1];let bi=0,bd=Infinity;for(let i=0;i<left.length;i++){const d=haversine(last,left[i]);if(d<bd){bd=d;bi=i}}out.push(left.splice(bi,1)[0])}
  return out;
}

app.get("/api/selftest", async (_req,res)=>{
  try{
    const db=await sb("rpc/memorial_selftest",{method:"POST",body:{}});
    const ok=Boolean(db?.ok);
    res.status(ok?200:503).json({ok,db,mobile_routes:["/m","/m/search","/m/wall","/m/today","/m/add","/m/calendar","/m/reminders","/m/admin"],release:"memory-calendar"});
  }catch(e){res.status(503).json({ok:false,error:"selftest_failed",detail:e.data||e.message})}
});

app.get("/api/cemetery/offline", async (_req,res)=>{
  try{
    const rows=await sb("cemetery_records?select=record_key,external_id,name_ru,name_he,death_gr,death_he,latitude,longitude,source_url,quality_status&cemetery_code=eq.QBA&order=external_id.asc,person_index.asc&limit=2000");
    res.setHeader("Cache-Control","public,max-age=3600");
    res.json({generated_at:new Date().toISOString(),records:rows});
  }catch(e){res.status(500).json({error:"offline_export_failed"})}
});

app.get("/api/cemetery/person/:key", async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_person_card",{method:"POST",body:{p_record_key:req.params.key}});
    if(!data?.record)return res.status(404).json({error:"not_found"});
    res.json(data);
  }catch(e){res.status(500).json({error:"person_failed"})}
});

app.get("/qr/cemetery/:key.svg", async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_person_card",{method:"POST",body:{p_record_key:req.params.key}});
    if(!data?.record)return res.status(404).send("Not found");
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,"");
    const svg=await QRCode.toString(base+"/m/person/"+encodeURIComponent(req.params.key),{type:"svg",margin:1,width:360});
    res.type("image/svg+xml").setHeader("Cache-Control","public,max-age=86400").send(svg);
  }catch(e){res.status(500).send("QR failed")}
});

app.get("/qr/event/:id.svg", async (req,res)=>{
  try{
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const e=await sb("rpc/memorial_event_detail_access",{method:"POST",body:{p_event_id:req.params.id,p_share_token:accessKey}});
    if(!e)return res.status(404).send("Not found");
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,""),suffix=accessKey?"?key="+encodeURIComponent(accessKey):"";
    const svg=await QRCode.toString(base+"/m/memorial/"+encodeURIComponent(req.params.id)+suffix,{type:"svg",margin:1,width:360});
    res.type("image/svg+xml").setHeader("Cache-Control",e.visibility==="public"?"public,max-age=86400":"private,no-store").send(svg);
  }catch(e){res.status(500).send("QR failed")}
});

app.get("/m/person/:key", async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_person_card",{method:"POST",body:{p_record_key:req.params.key}});
    const x=data?.record;if(!x)return res.status(404).send(mobileShell("Не найдено",'<div class="err">Запись не найдена.</div>'));
    const rel=(data.related||[]).map(p=>'<li>'+htmlEsc(p.name)+(p.cemetery_record_key?' · <a href="/m/person/'+encodeURIComponent(p.cemetery_record_key)+'">захоронение</a>':'')+'</li>').join("");
    const ev=(data.events||[]).map(e=>'<div class="card"><span class="tag">'+htmlEsc(e.event_type)+'</span><b>'+htmlEsc(e.full_name)+'</b><div>'+htmlEsc(e.event_date||"")+'</div></div>').join("");
    res.send(mobileShell(x.name_ru||x.external_id,`
      <div class="row"><span class="tag">${htmlEsc(x.external_id)}</span><span class="tag">${qualityLabel(x.quality_status)}</span></div>
      <h1>${htmlEsc(x.name_ru||"Без имени")}</h1>
      ${x.name_he?'<div dir="rtl" style="font-size:22px">'+htmlEsc(x.name_he)+'</div>':""}
      <p><b>Дата:</b> ${htmlEsc(x.death_gr||x.death_he||"—")}</p>
      <div class="nav">
        <a class="btn" href="/m/add?record_key=${encodeURIComponent(x.record_key)}">Создать памятные даты</a>
        ${x.latitude&&x.longitude?'<a class="btn" href="/m/map?lat='+encodeURIComponent(x.latitude)+'&lon='+encodeURIComponent(x.longitude)+'&name='+encodeURIComponent(x.name_ru||x.external_id)+'">Показать на карте</a>':""}
        <a class="btn secondary" href="${htmlEsc(x.source_url)}" target="_blank" rel="noopener">Исходная карточка</a>
        <a class="btn secondary" href="/qr/cemetery/${encodeURIComponent(x.record_key)}.svg" target="_blank">QR-код</a>
      </div>
      <div class="card"><h3>Подтверждённые родственники</h3>${rel?'<ul>'+rel+'</ul>':'<p class="muted">Связей пока нет.</p>'}</div>
      <div class="card"><h3>Добавить родственника</h3>
        <form method="post" action="/m/person/${encodeURIComponent(x.record_key)}/relation">
          <label>Имя родственника</label><input class="field" name="relative_name" required>
          <label>Дата смерти родственника</label><input class="field" type="date" name="relative_death">
          <label>Кем приходится</label><select class="field" name="relation_type"><option value="parent">родитель</option><option value="child">ребёнок</option><option value="spouse">супруг/супруга</option><option value="sibling">брат/сестра</option><option value="grandparent">дедушка/бабушка</option><option value="grandchild">внук/внучка</option><option value="other">другое</option></select>
          <label>Ваше имя</label><input class="field" name="submitted_by">
          <label>Контакт модератору</label><input class="field" name="contact">
          <button class="btn" style="width:100%;margin-top:10px">Отправить связь на проверку</button>
        </form>
      </div>
      ${ev?'<h3>Памятные даты</h3>'+ev:""}
    `));
  }catch(e){console.error(e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось открыть карточку.</div>'))}
});

app.post("/m/person/:key/relation", rateLimit("mobile-family",8,3600000), async (req,res)=>{
  try{
    const card=await sb("rpc/memorial_person_card",{method:"POST",body:{p_record_key:req.params.key}});
    const x=card?.record;if(!x)return res.status(404).send(mobileShell("Ошибка",'<div class="err">Запись не найдена.</div>'));
    await sb("rpc/memorial_submit_relation_from_cemetery",{method:"POST",body:{
      p_record_key:req.params.key,p_relative_name:clean(req.body.relative_name,180),p_relative_death:validDate(req.body.relative_death)?req.body.relative_death:null,
      p_relation_type:clean(req.body.relation_type,40),p_submitted_by:clean(req.body.submitted_by,120)||null,
      p_contact:clean(req.body.contact,180)||null,p_evidence:"Добавлено из карточки QBA "+x.external_id
    }});
    res.send(mobileShell("Отправлено",'<div class="ok">Родственная связь отправлена на модерацию.</div><p><a class="btn" href="/m/person/'+encodeURIComponent(req.params.key)+'">Вернуться</a></p>'));
  }catch(e){res.status(400).send(mobileShell("Ошибка",'<div class="err">Не удалось отправить связь.</div>'))}
});

app.get("/m/route", async (req,res)=>{
  try{
    const keys=(Array.isArray(req.query.key)?req.query.key:[req.query.key]).filter(Boolean).slice(0,20);
    if(!keys.length)return res.send(mobileShell("Маршрут",'<div class="err">Выберите минимум одну запись в каталоге.</div><p><a class="btn" href="/m/catalog">Каталог</a></p>'));
    const cards=await Promise.all(keys.map(k=>sb("rpc/memorial_person_card",{method:"POST",body:{p_record_key:k}})));
    const points=cards.map(d=>d?.record).filter(x=>x&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))).map(x=>({...x,latitude:Number(x.latitude),longitude:Number(x.longitude)}));
    const route=greedyRoute(points);
    const extraHead='<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"><script src="/vendor/leaflet/leaflet.js"></script>';
    const payload=JSON.stringify(route.map(x=>({key:x.record_key,id:x.external_id,name:x.name_ru,lat:x.latitude,lon:x.longitude}))).replace(/</g,"\\u003c");
    const scripts=`<script>(()=>{const pts=${payload};const map=L.map("mobileMap");L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:"© OpenStreetMap"}).addTo(map);const ll=[];pts.forEach((p,i)=>{const m=L.marker([p.lat,p.lon]).addTo(map).bindPopup("<b>"+(i+1)+". "+p.name+"</b><br>"+p.id);ll.push([p.lat,p.lon])});if(ll.length>1)L.polyline(ll,{weight:4}).addTo(map);if(ll.length)map.fitBounds(ll,{padding:[25,25],maxZoom:19});setTimeout(()=>map.invalidateSize(),150)})();</script>`;
    const list=route.map((x,i)=>'<div class="card"><b>'+(i+1)+'. '+htmlEsc(x.name_ru||x.external_id)+'</b><div class="muted">'+htmlEsc(x.external_id)+'</div></div>').join("");
    res.send(mobileShell("Семейный маршрут",'<h1>Маршрут по кладбищу</h1><p class="muted">Порядок рассчитан по ближайшим координатам. Это последовательность посещения, а не дорожная навигация.</p>'+list+'<div id="mobileMap"></div>',{extraHead,scripts}));
  }catch(e){console.error(e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось построить маршрут.</div>'))}
});

app.get("/m/family", async (req,res)=>{
  try{
    const q=clean(req.query.q,180);
    const g=await sb("rpc/memorial_family_graph",{method:"POST",body:{p_query:q,p_limit:160}});
    const nodes=g?.nodes||[],edges=g?.edges||[];
    const by=Object.fromEntries(nodes.map(n=>[n.id,n]));
    const rows=edges.map(e=>'<div class="card"><b>'+htmlEsc(by[e.a]?.name||"")+'</b> — '+htmlEsc(e.type)+' — <b>'+htmlEsc(by[e.b]?.name||"")+'</b></div>').join("");
    res.send(mobileShell("Родословная",`<h1>Родословная</h1><form><label>Найти человека</label><input class="field" name="q" value="${htmlEsc(q)}"><button class="btn" style="width:100%;margin-top:8px">Найти</button></form><p class="muted">Показываются подтверждённые связи до трёх уровней родства.</p>${rows||'<div class="card">Подтверждённых связей пока нет.</div>'}`));
  }catch(e){res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить родословную.</div>'))}
});

app.get("/m/identify", async (_req,res)=>{
  let cases=[];try{cases=await sb("rpc/memorial_public_identification_cases",{method:"POST",body:{}})}catch{}
  const open=(cases||[]).map(x=>`<div class="card">${x.image_data?'<img src="'+x.image_data+'" alt="" style="width:100%;max-height:330px;object-fit:contain;border-radius:10px">':""}<h3>${htmlEsc(x.approximate_name||"Имя неизвестно")}</h3><div class="muted">${htmlEsc(x.approximate_year||"")} ${htmlEsc(x.sector_note||"")}</div><p>${htmlEsc(x.details||"")}</p><details><summary>Предложить сведения</summary><form method="post" action="/m/identify/${x.id}/suggest"><label>Предполагаемое имя</label><input class="field" name="suggested_name"><label>Год / дата</label><input class="field" name="suggested_year"><label>Что вы знаете *</label><textarea class="field" name="details" rows="4" required></textarea><label>Ваше имя</label><input class="field" name="contributor_name"><label>Контакт модератору</label><input class="field" name="contributor_contact"><button class="btn" style="width:100%;margin-top:10px">Отправить сведения</button></form></details></div>`).join("");
  res.send(mobileShell("Опознать могилу",`<h1>Нужна помощь с идентификацией</h1><p class="muted">Для плохо читаемой или неизвестной могилы. Новая заявка сначала проходит модерацию.</p><form method="post" action="/m/identify" enctype="multipart/form-data"><label>Фото (до 900 КБ)</label><input class="field" type="file" accept="image/*" name="photo"><label>Предполагаемое имя</label><input class="field" name="approximate_name"><label>Примерный год</label><input class="field" name="approximate_year"><label>QBA / участок, если известен</label><input class="field" name="sector_note"><label>Что удалось прочитать / дополнительная информация</label><textarea class="field" name="details" rows="5"></textarea><label>Ваше имя</label><input class="field" name="requester_name"><label>Контакт модератору</label><input class="field" name="requester_contact"><button class="btn" style="width:100%;margin-top:12px">Отправить на проверку</button></form>${open?'<h2 style="margin-top:28px">Открытые случаи</h2>'+open:""}`));
});

app.post("/m/identify", identifyUpload.single("photo"), rateLimit("identify",5,3600000), async (req,res)=>{
  try{
    const image=req.file?("data:"+req.file.mimetype+";base64,"+req.file.buffer.toString("base64")):null;
    await sb("identification_requests",{method:"POST",prefer:"return=minimal",body:{
      id:id(),cemetery_code:"QBA",approximate_record_key:null,approximate_name:clean(req.body.approximate_name,180)||null,
      approximate_year:clean(req.body.approximate_year,40)||null,sector_note:clean(req.body.sector_note,300)||null,
      image_data:image,image_mime:req.file?.mimetype||null,requester_name:clean(req.body.requester_name,120)||null,
      requester_contact:clean(req.body.requester_contact,180)||null,details:clean(req.body.details,1500)||null,status:"pending"
    }});
    res.send(mobileShell("Отправлено",'<div class="ok">Заявка на идентификацию отправлена модератору.</div><p><a class="btn" href="/m">Главная</a></p>'));
  }catch(e){console.error("identify",e.data||e);res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось отправить заявку.</div>'))}
});

app.post("/m/identify/:id/suggest", rateLimit("identify-suggest",8,3600000), async (req,res)=>{
  try{
    await sb("identification_suggestions",{method:"POST",prefer:"return=minimal",body:{
      id:id(),request_id:req.params.id,suggested_name:clean(req.body.suggested_name,180)||null,
      suggested_year:clean(req.body.suggested_year,80)||null,details:clean(req.body.details,1500),
      contributor_name:clean(req.body.contributor_name,120)||null,contributor_contact:clean(req.body.contributor_contact,180)||null,status:"pending"
    }});
    res.send(mobileShell("Отправлено",'<div class="ok">Сведения отправлены на модерацию.</div><p><a class="btn" href="/m/identify">Вернуться</a></p>'));
  }catch(e){res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось отправить сведения.</div>'))}
});

app.get("/m/offline", (_req,res)=>{
  const scripts=`<script>
  const status=document.getElementById("offlineStatus"),q=document.getElementById("offlineQ"),results=document.getElementById("offlineResults"),map=document.getElementById("offlineMap");
  let data=[];function escx(s){return String(s||"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}
  function loadLocal(){try{data=JSON.parse(localStorage.getItem("pamyatQBAOffline")||"[]")}catch{data=[]}status.textContent=data.length?"Сохранено записей: "+data.length:"Каталог ещё не сохранён";render()}
  function render(){const term=q.value.trim().toLowerCase();const rows=(term?data.filter(x=>(x.name_ru+" "+x.name_he+" "+x.external_id).toLowerCase().includes(term)):data).slice(0,60);results.innerHTML=rows.map(x=>"<div class='card'><b>"+escx(x.name_ru||x.external_id)+"</b><div>"+escx(x.external_id)+" · "+escx(x.death_gr||"")+"</div></div>").join("")||"<div class='card'>Нет данных.</div>";draw(rows.length?rows:data)}
  function draw(rows){const pts=rows.filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))).slice(0,1200);if(!pts.length){map.innerHTML="";return}const lats=pts.map(x=>+x.latitude),lons=pts.map(x=>+x.longitude),minA=Math.min(...lats),maxA=Math.max(...lats),minO=Math.min(...lons),maxO=Math.max(...lons);map.innerHTML='<svg viewBox="0 0 600 420" style="width:100%;background:#eee;border-radius:12px">'+pts.map(x=>{const cx=20+560*((+x.longitude-minO)/(maxO-minO||1)),cy=400-380*((+x.latitude-minA)/(maxA-minA||1));return '<circle cx="'+cx+'" cy="'+cy+'" r="2.2" fill="#5b4934"><title>'+escx(x.name_ru||x.external_id)+'</title></circle>'}).join("")+'</svg><p class="muted">Офлайн-схема по координатам. Без интернет-картографического фона.</p>'}
  async function saveOffline(){status.textContent="Загрузка…";const r=await fetch("/api/cemetery/offline",{cache:"no-store"});const j=await r.json();data=j.records||[];localStorage.setItem("pamyatQBAOffline",JSON.stringify(data));status.textContent="Сохранено записей: "+data.length;render()}
  document.getElementById("saveOffline").onclick=saveOffline;q.oninput=render;loadLocal();
  </script>`;
  res.send(mobileShell("Офлайн-каталог",`<h1>Офлайн-каталог и карта</h1><p class="muted">Один раз сохраните каталог при наличии интернета. После этого поиск и координатная схема работают без сети.</p><button id="saveOffline" class="btn" style="width:100%">Сохранить / обновить 1238 записей</button><p id="offlineStatus" class="muted"></p><input id="offlineQ" class="field" placeholder="Поиск офлайн"><div id="offlineMap" style="margin-top:10px"></div><div id="offlineResults"></div>`,{scripts}));
});


app.get("/api/admin/identification-suggestions", requireAdmin, async (_req,res)=>{
  try{const data=await sb("rpc/memorial_admin_identification_suggestions",{method:"POST",body:{p_token:ADMIN_TOKEN}});res.json(data||[])}
  catch(e){res.status(500).json({error:"identification_suggestions_failed"})}
});
app.post("/api/admin/identification-suggestions/:id/:action", requireAdmin, async (req,res)=>{
  try{const ok=await sb("rpc/memorial_admin_identification_suggestion_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_id:req.params.id,p_action:req.params.action}});res.json({ok:Boolean(ok)})}
  catch(e){res.status(400).json({error:"identification_suggestion_action_failed"})}
});
app.get("/api/admin/identification", requireAdmin, async (_req,res)=>{
  try{const data=await sb("rpc/memorial_admin_identification_queue",{method:"POST",body:{p_token:ADMIN_TOKEN}});res.json(data||[])}
  catch(e){res.status(500).json({error:"identification_queue_failed"})}
});
app.get("/api/admin/identification/:id", requireAdmin, async (req,res)=>{
  try{const data=await sb("rpc/memorial_admin_identification_detail",{method:"POST",body:{p_token:ADMIN_TOKEN,p_id:req.params.id}});if(!data)return res.status(404).json({error:"not_found"});res.json(data)}
  catch(e){res.status(500).json({error:"identification_detail_failed"})}
});
app.post("/api/admin/identification/:id/:action", requireAdmin, async (req,res)=>{
  try{const ok=await sb("rpc/memorial_admin_identification_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_id:req.params.id,p_action:req.params.action,p_record_key:clean(req.body?.record_key,100)||null}});res.json({ok:Boolean(ok)})}
  catch(e){res.status(400).json({error:"identification_action_failed"})}
});
app.post("/api/admin/duplicates/merge", requireAdminRole, async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_admin_merge_events",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_keep_id:req.body?.keep_id,p_duplicate_id:req.body?.duplicate_id
    }});
    res.json(data);
  }catch(e){res.status(400).json({error:"merge_failed",detail:e.data||e.message})}
});
app.get("/api/admin/duplicates", requireAdminRole, async (_req,res)=>{
  try{const data=await sb("rpc/memorial_duplicate_queue",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:150}});res.json(data||[])}
  catch(e){res.status(500).json({error:"duplicates_failed"})}
});
app.post("/api/admin/frontend-release/:value", requireOwner, async (req,res)=>{
  try{const ok=await sb("rpc/memorial_admin_set_frontend_release",{method:"POST",body:{p_token:ADMIN_TOKEN,p_value:req.params.value}});res.json({ok:Boolean(ok),active:req.params.value})}
  catch(e){res.status(400).json({error:"release_switch_failed"})}
});

app.get("/", (_req, res) => res.redirect(302, "/pamyat-juhuro"));
app.get("/pamyat-juhuro", async (req, res) => {
  if (isMobileUA(req) && req.query.desktop !== "1") return res.redirect(302, "/m");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  let file="index.html";
  try{const cfg=await sb("rpc/memorial_public_site_config",{method:"POST",body:{}});if(cfg?.active_frontend==="stable")file="index-stable.html"}catch{}
  res.sendFile(path.join(__dirname, "public", file));
});
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (/index\.html$|sw\.js$|manifest\.webmanifest$/.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

const clean = (v, n = 1000) => String(v ?? "").trim().slice(0, n);
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const id = () => crypto.randomUUID();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const rateBuckets = new Map();
function rateLimit(scope, limit, windowMs) {
  return (req, res, next) => {
    const key = scope + ":" + req.ip;
    const t = Date.now();
    const current = rateBuckets.get(key);
    if (!current || current.reset <= t) {
      rateBuckets.set(key, { count: 1, reset: t + windowMs });
      return next();
    }
    if (current.count >= limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.reset - t) / 1000))));
      return res.status(429).json({ error: "rate_limited" });
    }
    current.count += 1;
    next();
  };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of rateBuckets) if (v.reset <= t) rateBuckets.delete(k);
}, 30 * 60 * 1000).unref();

function parseCookies(req) {
  const out={};
  for(const part of String(req.headers.cookie||"").split(";")){
    const i=part.indexOf("="); if(i<1)continue;
    out[decodeURIComponent(part.slice(0,i).trim())]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function adminSessionSign(email,role="admin",sessionVersion=1,sessionId=null,ttlMs=8*60*60*1000){
  const payload=Buffer.from(JSON.stringify({
    email:String(email||"").toLowerCase(),
    role,
    session_version:Number(sessionVersion||1),
    session_id:sessionId||null,
    exp:Date.now()+ttlMs
  })).toString("base64url");
  const sig=crypto.createHmac("sha256",ADMIN_TOKEN).update(payload).digest("base64url");
  return payload+"."+sig;
}
function adminSessionVerify(raw){
  if(!ADMIN_TOKEN||!raw||!raw.includes("."))return null;
  const [payload,sig]=raw.split(".");
  const expected=crypto.createHmac("sha256",ADMIN_TOKEN).update(payload).digest("base64url");
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  try{
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(!data.email||!data.exp||!data.session_version||Date.now()>Number(data.exp))return null;
    return data;
  }catch{return null}
}
async function isAdmin(req) {
  if(Boolean(ADMIN_TOKEN) && req.headers["x-admin-token"] === ADMIN_TOKEN){
    req.adminIdentity={email:"token-admin",role:"owner",display_name:"Системный владелец",legacy:true}; return true;
  }
  const s=adminSessionVerify(parseCookies(req).pamyat_admin_session);
  if(!s)return false;
  try{
    const allowed=s.session_id
      ? await sb("rpc/memorial_admin_session_touch",{
          method:"POST",
          body:{p_token:ADMIN_TOKEN,p_session_id:s.session_id,p_email:s.email,p_session_version:Number(s.session_version)}
        })
      : await sb("rpc/memorial_admin_session_allowed",{
          method:"POST",
          body:{p_token:ADMIN_TOKEN,p_email:s.email,p_session_version:Number(s.session_version)}
        });
    if(!allowed?.allowed)return false;
    req.adminIdentity={
      email:allowed.email,
      role:allowed.role||s.role||"moderator",
      display_name:allowed.display_name||null,
      session_version:allowed.session_version,
      session_id:s.session_id||null
    };
    return true;
  }catch{return false}
}
async function requireAdmin(req,res,next){
  if(!(await isAdmin(req)))return res.status(401).json({error:"admin_required"});
  next();
}
function requireRoles(...roles){
  return async (req,res,next)=>{
    if(!(await isAdmin(req)))return res.status(401).json({error:"admin_required"});
    if(!roles.includes(req.adminIdentity?.role))return res.status(403).json({error:"role_required"});
    next();
  };
}
function requireOwner(req,res,next){ return requireRoles("owner")(req,res,next); }
function requireAdminRole(req,res,next){ return requireRoles("owner","admin")(req,res,next); }

function adminDeviceLabel(req){
  const ua=String(req.headers["user-agent"]||"");
  if(/iPhone/i.test(ua))return "iPhone";
  if(/iPad/i.test(ua))return "iPad";
  if(/Android/i.test(ua))return "Android";
  if(/Macintosh|Mac OS X/i.test(ua))return "Mac";
  if(/Windows/i.test(ua))return "Windows";
  if(/Linux/i.test(ua))return "Linux";
  return "Устройство";
}
async function createAdminSession(req,identity,provider){
  const sessionId=crypto.randomUUID();
  const ttlMs=8*60*60*1000;
  const expiresAt=new Date(Date.now()+ttlMs).toISOString();
  await sb("rpc/memorial_admin_session_create",{method:"POST",body:{
    p_token:ADMIN_TOKEN,p_session_id:sessionId,p_email:identity.email,p_role:identity.role||"moderator",
    p_device_label:adminDeviceLabel(req),p_user_agent:clean(req.headers["user-agent"],500),p_expires_at:expiresAt
  }});
  const cookie=adminSessionSign(identity.email,identity.role||"moderator",identity.session_version||1,sessionId,ttlMs);
  return {cookie,sessionId,expiresAt,provider};
}

function securePasswordCompare(password,salt,expectedHash){
  if(!salt||!expectedHash)return false;
  try{
    const got=crypto.scryptSync(String(password||""),String(salt),64).toString("hex");
    const expected=String(expectedHash).trim().toLowerCase();
    if(got.length!==expected.length)return false;
    return crypto.timingSafeEqual(Buffer.from(got,"hex"),Buffer.from(expected,"hex"));
  }catch{return false}
}
async function adminPasswordIdentity(user,password){
  const email=String(user||"").trim().toLowerCase();
  if(!email||!password)return null;

  if(ADMIN_LOGIN_USER && email===ADMIN_LOGIN_USER.trim().toLowerCase() &&
     securePasswordCompare(password,ADMIN_LOGIN_SALT,ADMIN_LOGIN_PASSWORD_HASH)){
    const allowed=await sb("rpc/memorial_admin_email_allowed",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email}});
    return allowed?.allowed?allowed:null;
  }

  const record=await sb("rpc/memorial_admin_password_record",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email}});
  if(!record?.found||!record.active||!securePasswordCompare(password,record.password_salt,record.password_hash))return null;
  return {
    allowed:true,email:record.email,role:record.role,session_version:record.session_version,
    display_name:record.display_name||null
  };
}

async function sb(pathname, { method = "GET", body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("supabase_not_configured");
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    authorization: "Bearer " + SUPABASE_ANON_KEY,
    "content-type": "application/json"
  };
  if (prefer) headers.prefer = prefer;
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const txt = await r.text();
  let data = null;
  if (txt) {
    try { data = JSON.parse(txt); } catch { data = txt; }
  }
  if (!r.ok) {
    const err = new Error("supabase_error");
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

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
function hebrewParts(dateStr) {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const f = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const parts = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
    return { day: parts.day, month: parts.month, year: parts.year };
  } catch { return null; }
}
function hebrewLabel(dateStr) {
  try {
    return new Intl.DateTimeFormat("ru-RU-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(dateStr + "T12:00:00Z"));
  } catch { return ""; }
}
function nextYahrzeit(deathDate, fromDate = new Date(), rule = "standard") {
  const target = hebrewParts(deathDate);
  if (!target) return null;
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));
  const targetMonth=String(target.month||"");
  const targetDay=Number(target.day);
  const isAdar=/^Adar/.test(targetMonth);
  let fallback=null;
  for (let i = 0; i <= 450; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const p = hebrewParts(iso);
    if(!p)continue;
    const pm=String(p.month||""),pd=Number(p.day);
    let monthMatch=pm===targetMonth;
    if(isAdar){
      if(rule==="adar_i")monthMatch=(pm==="Adar I"||pm==="Adar");
      else if(rule==="adar_ii")monthMatch=(pm==="Adar II"||pm==="Adar");
      else if(targetMonth==="Adar I"||targetMonth==="Adar II")monthMatch=(pm===targetMonth||pm==="Adar");
    }
    if(monthMatch && pd===targetDay)return iso;
    // In variable-length Cheshvan/Kislev, keep a conservative fallback to day 29;
    // manual date remains available and takes priority for family/halachic custom.
    if(!fallback && (targetMonth==="Cheshvan"||targetMonth==="Kislev") && targetDay===30 && pm===targetMonth && pd===29)fallback=iso;
  }
  return fallback;
}

function escIcs(v) {
  return String(v ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function toIcsDate(v) { return String(v || "").replaceAll("-", ""); }
function validIanaTimezone(v){
  const tz=String(v||"").trim()||"Europe/Moscow";
  try{new Intl.DateTimeFormat("en",{timeZone:tz}).format(new Date());return tz}catch{return "Europe/Moscow"}
}
function calendarLocal(date,time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||""))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time||"")))return null;
  return toIcsDate(date)+"T"+String(time).replace(":","")+"00";
}
function addLocalMinutes(date,time,mins=60){
  if(!calendarLocal(date,time))return null;
  const [y,m,d]=date.split("-").map(Number),[hh,mm]=time.split(":").map(Number);
  const x=new Date(Date.UTC(y,m-1,d,hh,mm)+mins*60000);
  const pad=v=>String(v).padStart(2,"0");
  return {date:x.getUTCFullYear()+"-"+pad(x.getUTCMonth()+1)+"-"+pad(x.getUTCDate()),time:pad(x.getUTCHours())+":"+pad(x.getUTCMinutes())};
}
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
function xmlEscape(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[m]));
}

app.get("/robots.txt", (_req,res) => {
  const base=(PUBLIC_BASE_URL||"").replace(/\/$/,"");
  res.type("text/plain; charset=utf-8").send([
    "User-agent: *","Allow: /m","Disallow: /m/admin","Disallow: /api/admin/","Disallow: /api/",
    "Sitemap: "+base+"/sitemap.xml"
  ].join("\n"));
});

app.get("/sitemap.xml", async (_req,res) => {
  try{
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,"");
    const rows=await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:"",p_city:"",p_type:"",p_limit:500}});
    const staticPaths=["/m","/m/today","/m/calendar","/m/archive","/m/search","/m/wall"];
    const urls=staticPaths.map(p=>({loc:base+p,priority:p==="/m"?"1.0":"0.7"}));
    for(const e of rows||[])urls.push({loc:base+"/m/memorial/"+encodeURIComponent(e.id),lastmod:String(e.created_at||"").slice(0,10),priority:"0.6"});
    const xml='<?xml version="1.0" encoding="UTF-8"?>'+
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
      urls.map(x=>'<url><loc>'+xmlEscape(x.loc)+'</loc>'+(x.lastmod?'<lastmod>'+xmlEscape(x.lastmod)+'</lastmod>':'')+'<priority>'+x.priority+'</priority></url>').join("")+
      '</urlset>';
    res.type("application/xml; charset=utf-8").send(xml);
  }catch(e){console.error("sitemap",e.data||e);res.status(500).send("Failed")}
});

app.get("/health", async (_req, res) => {
  try {
    const events = await sb("rpc/memorial_event_search", {
      method: "POST",
      body: { p_query: "", p_city: "", p_type: "", p_limit: 1 }
    });
    const cfg = await sb("rpc/memorial_public_site_config", { method: "POST", body: {} }).catch(() => ({}));
    res.json({
      ok: true,
      database: "supabase",
      events_reachable: Array.isArray(events),
      cemetery_catalog_enabled: false,
      active_frontend: cfg?.active_frontend || "current",
      push_configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      telegram_configured: Boolean(TELEGRAM_BOT_TOKEN),
      email_configured: Boolean(RESEND_API_KEY),
      whatsapp_configured: reminderProviderStatus().whatsapp,
      sms_configured: reminderProviderStatus().sms,
      offsite_backup_configured: Boolean(BACKUP_WEBHOOK_URL && BACKUP_WEBHOOK_TOKEN)
    });
  } catch (e) {
    res.status(503).json({ ok: false, database: "supabase", error: e.message });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const q = clean(req.query.q, 180);
    const city = clean(req.query.city, 120);
    const type = clean(req.query.type, 80);
    const events = await sb("rpc/memorial_event_search", {
      method: "POST",
      body: { p_query: q, p_city: city, p_type: type, p_limit: 300 }
    });
    if (!events.length) return res.json([]);
    const ids = events.map(x => x.id);
    const params = new URLSearchParams();
    params.set("select", "event_id,count");
    params.set("event_id", "in.(" + ids.join(",") + ")");
    const candles = await sb("memorial_candles?" + params.toString());
    const counts = Object.fromEntries(candles.map(x => [x.event_id, x.count]));
    res.json(events.map(x => ({ ...x, candles: counts[x.id] || 0 })));
  } catch (e) {
    console.error("events", e.data || e);
    res.status(500).json({ error: "load_failed" });
  }
});

app.get("/api/events/:eventId/photo", async (req,res) => {
  try{
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const p=await sb("rpc/memorial_event_photo_access",{method:"POST",body:{p_event_id:req.params.eventId,p_share_token:accessKey}});
    if(!p?.base64)return res.status(404).end();
    const buf=Buffer.from(p.base64,"base64");
    res.setHeader("Cache-Control",accessKey?"private,no-store":"public,max-age=300");
    res.type(p.mime||"image/jpeg").send(buf);
  }catch(e){res.status(404).end()}
});

app.get("/api/events/:eventId", async (req, res) => {
  try {
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const data = await sb("rpc/memorial_event_detail_access", {
      method: "POST",
      body: { p_event_id: req.params.eventId, p_share_token: accessKey }
    });
    if (!data) return res.status(404).json({ error: "not_found" });
    res.json(data);
  } catch (e) {
    console.error("detail", e.data || e);
    res.status(500).json({ error: "load_failed" });
  }
});

app.get("/api/events/:eventId.ics", async (req, res) => {
  try {
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const e = await sb("rpc/memorial_event_detail_access", {
      method: "POST",
      body: { p_event_id: req.params.eventId, p_share_token: accessKey }
    });
    if (!e || !e.event_date) return res.status(404).send("Not found");
    const d = toIcsDate(e.event_date),end = toIcsDate(addDays(e.event_date, 1));
    const tz=validIanaTimezone(e.event_timezone),hasTime=Boolean(calendarLocal(e.event_date,e.event_time)),endLocal=hasTime?addLocalMinutes(e.event_date,e.event_time,60):null;
    const suffix=accessKey?"?key="+encodeURIComponent(accessKey):"";
    const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Pamyat//Memorial Calendar//RU","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:" + e.id + "@pamyat"];
    if(hasTime){
      lines.push("DTSTART;TZID="+tz+":" + calendarLocal(e.event_date,e.event_time),"DTEND;TZID="+tz+":" + calendarLocal(endLocal.date,endLocal.time));
    }else{
      lines.push("DTSTART;VALUE=DATE:" + d,"DTEND;VALUE=DATE:" + end);
    }
    lines.push(
      "SUMMARY:" + escIcs(e.event_type + " — " + e.full_name),
      "LOCATION:" + escIcs([e.place,e.city].filter(Boolean).join(", ")),
      "DESCRIPTION:" + escIcs(e.note || ""),
      "URL:" + escIcs((APP_PUBLIC_URL || "").replace(/\/$/,"") + "/m/memorial/" + e.id + suffix),
      "END:VEVENT","END:VCALENDAR"
    );
    const ics=lines.join("\r\n");
    res.type("text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pamyat-' + e.id + '.ics"');
    res.send(ics);
  } catch {
    res.status(500).send("Failed");
  }
});

app.get("/api/events/:eventId/follow", rateLimit("follow-read",60,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.query.device_token,80);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    res.setHeader("Cache-Control","no-store");
    res.json(await sb("rpc/memorial_person_follow_status",{method:"POST",body:{p_event_id:req.params.eventId,p_device_token:t}}));
  }catch(e){res.status(500).json({error:"follow_failed"})}
});
app.post("/api/events/:eventId/follow", rateLimit("follow-write",20,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.body?.device_token,80),key=clean(req.body?.key,80);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    const d=await sb("rpc/memorial_person_follow_set",{method:"POST",body:{
      p_event_id:req.params.eventId,p_device_token:t,p_active:req.body?.active!==false,
      p_share_token:/^[0-9a-f-]{36}$/i.test(key)?key:null
    }});
    res.json(d);
  }catch(e){res.status(400).json({error:"follow_failed"})}
});
app.get("/api/events/:eventId/history", rateLimit("history-read",60,60*60*1000), async (req,res)=>{
  try{res.json(await sb("rpc/memorial_public_change_history",{method:"POST",body:{p_event_id:req.params.eventId}})||[])}
  catch(e){res.status(500).json({error:"history_failed"})}
});
app.get("/api/duplicates", rateLimit("duplicate-check",30,60*60*1000), async (req,res)=>{
  try{
    const name=clean(req.query.full_name,180),date=clean(req.query.death_date,10),city=clean(req.query.city,120);
    if(!name)return res.json([]);
    const rows=await sb("rpc/memorial_duplicate_candidates",{method:"POST",body:{p_full_name:name,p_death_date:validDate(date)?date:null,p_city:city||null,p_limit:8}});
    res.json(rows||[]);
  }catch(e){res.status(500).json({error:"duplicate_check_failed"})}
});

app.get("/api/inbox", rateLimit("inbox-read",120,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.query.device_token,80);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    res.setHeader("Cache-Control","no-store");
    res.json(await sb("rpc/memorial_inbox_list",{method:"POST",body:{p_device_token:t,p_limit:120}}));
  }catch(e){res.status(500).json({error:"inbox_failed"})}
});
app.post("/api/inbox/read", rateLimit("inbox-write",120,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.body?.device_token,80),idv=clean(req.body?.id,80);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    const n=await sb("rpc/memorial_inbox_mark_read",{method:"POST",body:{p_device_token:t,p_id:/^[0-9a-f-]{36}$/i.test(idv)?idv:null}});
    res.json({ok:true,updated:Number(n||0)});
  }catch(e){res.status(500).json({error:"inbox_update_failed"})}
});

app.get("/api/events/:eventId/rsvp", rateLimit("rsvp-read",60,60*60*1000), async (req,res)=>{
  try{
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const d=await sb("rpc/memorial_rsvp_summary",{method:"POST",body:{p_event_id:req.params.eventId,p_share_token:accessKey}});
    if(!d)return res.status(404).json({error:"not_found"});
    res.setHeader("Cache-Control","no-store");res.json(d);
  }catch(e){res.status(500).json({error:"rsvp_failed"})}
});
app.post("/api/events/:eventId/privacy-request", rateLimit("privacy-request",5,24*60*60*1000), async (req,res)=>{
  try{
    const contact=clean(req.body?.requester_contact,180),name=clean(req.body?.requester_name,120),details=clean(req.body?.details,1000);
    if(!contact)return res.status(400).json({error:"contact_required"});
    const id=await sb("rpc/memorial_privacy_request_create",{method:"POST",body:{
      p_event_id:req.params.eventId,p_requester_name:name||null,p_requester_contact:contact,p_details:details||null
    }});
    res.status(201).json({ok:true,id});
  }catch(e){res.status(400).json({error:"privacy_request_failed"})}
});

app.post("/api/events/:eventId/rsvp", rateLimit("rsvp-write",20,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.body?.device_token,80),response=clean(req.body?.response,20),key=clean(req.body?.key,80);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    const d=await sb("rpc/memorial_rsvp_set",{method:"POST",body:{
      p_event_id:req.params.eventId,p_device_token:t,p_response:response,p_display_name:clean(req.body?.display_name,120)||null,
      p_share_token:/^[0-9a-f-]{36}$/i.test(key)?key:null
    }});
    res.json(d);
  }catch(e){res.status(400).json({error:"rsvp_failed"})}
});

app.get("/api/events/:eventId/share-card.svg", rateLimit("share-card",60,60*60*1000), async (req,res)=>{
  try{
    const rawKey=clean(req.query.key,80),accessKey=/^[0-9a-f-]{36}$/i.test(rawKey)?rawKey:null;
    const e=await sb("rpc/memorial_event_detail_access",{method:"POST",body:{p_event_id:req.params.eventId,p_share_token:accessKey}});
    if(!e)return res.status(404).send("Not found");
    const format=["portrait","square","wide"].includes(String(req.query.format||""))?String(req.query.format):"portrait";
    const dims=format==="square"?{w:1080,h:1080}:format==="wide"?{w:1600,h:900}:{w:1080,h:1350};
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,""),suffix=accessKey?"?key="+encodeURIComponent(accessKey):"";
    const url=base+"/m/memorial/"+encodeURIComponent(e.id)+suffix;
    const qrSize=format==="wide"?220:format==="square"?220:260;
    const qr=await QRCode.toDataURL(url,{margin:1,width:qrSize,errorCorrectionLevel:"M"});
    const wrap=(v,max)=>{const words=String(v||"").split(/\s+/),out=[];let line="";for(const w of words){const next=(line+" "+w).trim();if(next.length>max&&line){out.push(line);line=w}else line=next}if(line)out.push(line);return out.slice(0,4)};
    const cx=dims.w/2,margin=Math.round(Math.min(dims.w,dims.h)*.05),innerW=dims.w-margin*2,innerH=dims.h-margin*2;
    const nameMax=format==="wide"?42:27,nameFont=format==="wide"?58:format==="square"?56:64;
    const nameLines=wrap(e.full_name,nameMax);
    const nameStart=format==="wide"?300:format==="square"?335:430;
    const nameStep=format==="wide"?66:format==="square"?66:76;
    const nameSvg=nameLines.map((x,i)=>'<text x="'+cx+'" y="'+(nameStart+i*nameStep)+'" text-anchor="middle" font-size="'+nameFont+'" font-weight="700" fill="#211d18">'+htmlEsc(x)+'</text>').join("");
    const place=htmlEsc([e.place,e.city].filter(Boolean).join(" · ")),note=htmlEsc(String(e.note||"").slice(0,format==="wide"?120:180));
    const eventY=format==="wide"?580:format==="square"?650:770;
    const dateY=eventY+58,placeY=dateY+52,heY=placeY+46,noteY=heY+50;
    const qrX=format==="wide"?dims.w-qrSize-110:(dims.w-qrSize)/2;
    const qrY=format==="wide"?dims.h-qrSize-80:format==="square"?dims.h-qrSize-65:1035;
    const svg=[
      '<svg xmlns="http://www.w3.org/2000/svg" width="'+dims.w+'" height="'+dims.h+'" viewBox="0 0 '+dims.w+' '+dims.h+'">',
      '<rect width="'+dims.w+'" height="'+dims.h+'" fill="#f5f1e8"/><rect x="'+margin+'" y="'+margin+'" width="'+innerW+'" height="'+innerH+'" rx="38" fill="#fffdf8" stroke="#cfc2ad" stroke-width="3"/>',
      '<text x="'+cx+'" y="'+(margin+105)+'" text-anchor="middle" font-size="58" fill="#4c3e2d">✡</text><text x="'+cx+'" y="'+(margin+170)+'" text-anchor="middle" font-size="42" font-family="serif" fill="#4c3e2d">נר נשמה</text>',
      '<line x1="'+(cx-Math.min(300,dims.w*.25))+'" y1="'+(margin+218)+'" x2="'+(cx+Math.min(300,dims.w*.25))+'" y2="'+(margin+218)+'" stroke="#cfc2ad" stroke-width="2"/>',
      nameSvg,
      '<text x="'+cx+'" y="'+eventY+'" text-anchor="middle" font-size="38" fill="#5b4934">'+htmlEsc(e.event_type||"Памятная дата")+'</text>',
      '<text x="'+cx+'" y="'+dateY+'" text-anchor="middle" font-size="36" fill="#27231e">'+htmlEsc(e.event_date||"")+(e.event_time?" · "+htmlEsc(e.event_time):"")+'</text>',
      '<text x="'+cx+'" y="'+placeY+'" text-anchor="middle" font-size="28" fill="#746d63">'+place+'</text>',
      e.hebrew_death_label?'<text x="'+cx+'" y="'+heY+'" text-anchor="middle" font-size="27" fill="#746d63">'+htmlEsc(e.hebrew_death_label)+'</text>':"",
      note?'<text x="'+cx+'" y="'+noteY+'" text-anchor="middle" font-size="24" fill="#746d63">'+note+'</text>':"",
      '<image href="'+qr+'" x="'+qrX+'" y="'+qrY+'" width="'+qrSize+'" height="'+qrSize+'"/>',
      '<text x="'+(format==="wide"?110:cx)+'" y="'+(dims.h-28)+'" text-anchor="'+(format==="wide"?"start":"middle")+'" font-size="24" fill="#5b4934">Память Джуури</text></svg>'
    ].join("");
    res.type("image/svg+xml").setHeader("Content-Disposition",'inline; filename="pamyat-'+format+'-'+e.id+'.svg"');
    res.setHeader("Cache-Control",e.visibility==="public"?"public,max-age=300":"private,no-store");res.send(svg);
  }catch(e){console.error("share card",e.data||e);res.status(500).send("Failed")}
});
app.get("/api/notifications", async (req, res) => {
  try {
    const days = Math.max(0, Math.min(Number(req.query.days || 30), 366));
    const rows = await sb("rpc/memorial_public_upcoming", {
      method: "POST",
      body: { p_days: days, p_limit: 300 }
    });
    res.json(rows || []);
  } catch (e) {
    console.error("notifications", e.data || e);
    res.status(500).json({ error: "notifications_failed" });
  }
});

app.get("/api/calendar.ics", async (_req, res) => {
  try {
    const rows = await sb("rpc/memorial_public_upcoming", {
      method: "POST",
      body: { p_days: 366, p_limit: 500 }
    });
    const out = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Pamyat//Community Calendar//RU","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
    for (const e of rows || []) {
      if (!e.event_date) continue;
      out.push(
        "BEGIN:VEVENT",
        "UID:" + e.id + "@pamyat",
        "DTSTART;VALUE=DATE:" + toIcsDate(e.event_date),
        "DTEND;VALUE=DATE:" + toIcsDate(addDays(e.event_date, 1)),
        "SUMMARY:" + escIcs(e.event_type + " — " + e.full_name),
        "LOCATION:" + escIcs(e.place || e.city || ""),
        "URL:" + escIcs((APP_PUBLIC_URL || "") + "/#event=" + e.id),
        "END:VEVENT"
      );
    }
    out.push("END:VCALENDAR");
    res.type("text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition",'inline; filename="pamyat-calendar.ics"');
    res.send(out.join("\r\n"));
  } catch (e) {
    console.error("calendar feed", e.data || e);
    res.status(500).send("Failed");
  }
});

app.get("/api/feed.xml", async (_req, res) => {
  try {
    const rows = await sb("rpc/memorial_public_upcoming", {
      method: "POST",
      body: { p_days: 60, p_limit: 300 }
    });
    const xmlEsc = v => String(v ?? "").replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
    const base = (APP_PUBLIC_URL || "").replace(/\/$/,"");
    const items = (rows || []).map(e => {
      const link = base + "/#event=" + e.id;
      return "<item>" +
        "<title>" + xmlEsc(e.event_date + " · " + e.event_type + " · " + e.full_name) + "</title>" +
        "<link>" + xmlEsc(link) + "</link>" +
        "<guid isPermaLink=\"false\">" + xmlEsc(e.id) + "</guid>" +
        "<description>" + xmlEsc([e.city,e.place].filter(Boolean).join(" · ")) + "</description>" +
        "</item>";
    }).join("");
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<rss version="2.0"><channel><title>Память — ближайшие даты</title>' +
      '<link>' + xmlEsc(base) + '</link><description>Публичные памятные даты общины</description>' +
      items + '</channel></rss>';
    res.type("application/rss+xml; charset=utf-8").send(xml);
  } catch (e) {
    console.error("rss", e.data || e);
    res.status(500).send("Failed");
  }
});

app.post("/api/events/check-duplicate", async (req, res) => {
  try {
    const fullName = clean(req.body?.full_name, 180);
    const deathDate = clean(req.body?.death_date, 10);
    if (!fullName) return res.json([]);
    const data = await sb("rpc/memorial_duplicate_candidates", {
      method: "POST",
      body: { p_full_name: fullName, p_death_date: validDate(deathDate) ? deathDate : null }
    });
    res.json(data || []);
  } catch {
    res.json([]);
  }
});


app.post("/api/events", rateLimit("events", 5, 15 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    if(spamTrap(b))return res.status(201).json({ok:true,status:"pending"});
    const fullName = clean(b.full_name, 180);
    const deathDate = clean(b.death_date, 10);
    const eventType = clean(b.event_type || "Памятная дата", 80);
    const eventDate = clean(b.event_date, 10);
    if (!fullName) return res.status(400).json({ error: "full_name_required" });
    if (!b.relation_confirmed) return res.status(400).json({ error: "consent_required" });
    if (deathDate && !validDate(deathDate)) return res.status(400).json({ error: "invalid_death_date" });
    if (eventDate && !validDate(eventDate)) return res.status(400).json({ error: "invalid_event_date" });

    const dup = await sb("rpc/memorial_duplicate_candidates", {
      method: "POST", body: { p_full_name: fullName, p_death_date: validDate(deathDate) ? deathDate : null }
    });
    if (Array.isArray(dup) && dup.length && !b.confirm_duplicate) {
      return res.status(409).json({ error: "possible_duplicate", matches: dup.slice(0, 5) });
    }

    const afterSunset=Boolean(b.hebrew_after_sunset);
    const hebrewSourceDate=validDate(deathDate)?(afterSunset?addDays(deathDate,1):deathDate):null;
    const manualYahrzeit = validDate(clean(b.manual_yahrzeit_date, 10)) ? clean(b.manual_yahrzeit_date, 10) : null;
    const rule=["standard","adar_i","adar_ii","family_custom","manual"].includes(b.yahrzeit_rule)?b.yahrzeit_rule:"standard";
    const computedYahrzeit = hebrewSourceDate ? nextYahrzeit(hebrewSourceDate,new Date(),rule) : null;
    const yahrzeit = manualYahrzeit || (rule==="manual"?null:computedYahrzeit);

    const base = {
      full_name: fullName,
      death_date: validDate(deathDate) ? deathDate : null,
      event_time: clean(b.event_time, 20) || null,
      city: clean(b.city, 120) || null,
      place: clean(b.place, 180) || null,
      cemetery_link: safeSourceLink(clean(b.cemetery_link, 800)),
      cemetery_record_key: clean(b.cemetery_record_key, 100) || null,
      note: clean(b.note, 1500) || null,
      visibility: "public",
      status: "pending",
      relation_confirmed: true,
      publish_day7: b.publish_day7 !== false,
      publish_day40: b.publish_day40 !== false,
      publish_year1: b.publish_year1 !== false,
      publish_annual: b.publish_annual !== false,
      hebrew_death_label: hebrewSourceDate ? hebrewLabel(hebrewSourceDate) : null,
      yahrzeit_date: yahrzeit,
      hebrew_after_sunset:afterSunset,
      yahrzeit_rule:manualYahrzeit?"manual":rule,
      urgent:false,
      derived: { ...derivedDates(deathDate), yahrzeit, hebrew_source_date:hebrewSourceDate },
      submitter_name: clean(b.submitter_name, 120) || null,
      submitter_contact: clean(b.submitter_contact, 180) || null
    };

    const planned = [];
    if (validDate(deathDate)) {
      if (base.publish_day7) planned.push({event_type:"7 дней",event_date:addDays(deathDate, 7),urgent:false});
      if (base.publish_day40) planned.push({event_type:"40 дней",event_date:addDays(deathDate, 40),urgent:false});
      if (base.publish_year1) planned.push({event_type:"1 год",event_date:addYear(deathDate),urgent:false});
      if (base.publish_annual) planned.push({event_type:"Годовщина",event_date:addYear(deathDate),urgent:false});
      if (b.publish_yahrzeit !== false && yahrzeit) planned.push({event_type:"Йорцайт",event_date:yahrzeit,urgent:false});
    }
    if (eventType && validDate(eventDate)) planned.push({event_type:eventType,event_date:eventDate,urgent:Boolean(b.urgent)});
    if (Boolean(b.urgent_funeral) && validDate(deathDate)) {
      const fd=validDate(clean(b.funeral_date,10))?clean(b.funeral_date,10):deathDate;
      planned.unshift({event_type:"Похороны",event_date:fd,urgent:true});
    }
    if (!planned.length) return res.status(400).json({ error: "no_dates" });

    const unique = new Map();
    for (const x of planned) unique.set(x.event_type + "|" + x.event_date, x);
    const rows = [...unique.values()].map(x => ({ id: id(), ...base, ...x }));
    await sb("memorial_events", { method: "POST", body: rows, prefer: "return=minimal" });
    res.status(201).json({
      ok: true, ids: rows.map(x => x.id), created: rows.length, status: "pending",
      derived: base.derived, hebrew_death_label: base.hebrew_death_label
    });
  } catch (e) {
    console.error("submit", e.data || e);
    res.status(500).json({ error: "submit_failed" });
  }
});

app.post("/api/events/:eventId/candle", rateLimit("candles", 30, 60 * 60 * 1000), async (req, res) => {
  try {
    const count = await sb("rpc/memorial_light_candle", { method: "POST", body: { p_event_id: req.params.eventId } });
    res.json({ count });
  } catch {
    res.status(400).json({ error: "candle_failed" });
  }
});

app.post("/api/events/:eventId/comments", rateLimit("comments", 10, 15 * 60 * 1000), async (req, res) => {
  try {
    if(spamTrap(req.body))return res.status(201).json({ok:true,status:"pending"});
    const body = clean(req.body?.body, 1000);
    if (!body) return res.status(400).json({ error: "body_required" });
    await sb("memorial_comments", {
      method: "POST",
      body: { id: id(), event_id: req.params.eventId, author: clean(req.body?.author, 100) || "Гость", body, status: "pending" },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true, status: "pending" });
  } catch {
    res.status(500).json({ error: "comment_failed" });
  }
});

app.post("/api/events/:eventId/report", rateLimit("reports", 10, 15 * 60 * 1000), async (req, res) => {
  try {
    const reason = clean(req.body?.reason, 120);
    if (!reason) return res.status(400).json({ error: "reason_required" });
    await sb("memorial_reports", {
      method: "POST",
      body: { id: id(), event_id: req.params.eventId, reason, details: clean(req.body?.details, 1000), status: "open" },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "report_failed" });
  }
});

app.post("/api/events/:eventId/relative-claim", rateLimit("claims", 5, 60 * 60 * 1000), async (req, res) => {
  try {
    if(spamTrap(req.body))return res.status(201).json({ok:true,status:"pending"});
    const claimantName = clean(req.body?.claimant_name, 120);
    if (!claimantName) return res.status(400).json({ error: "claimant_name_required" });
    await sb("memorial_claims", {
      method: "POST",
      body: {
        id: id(), event_id: req.params.eventId, claimant_name: claimantName,
        contact: clean(req.body?.contact, 180), note: clean(req.body?.note, 700),
        relation_type: clean(req.body?.relation_type, 80) || null,
        evidence_note: clean(req.body?.evidence_note, 1000) || null,
        status: "pending"
      },
      prefer: "return=minimal"
    });
    res.status(201).json({ ok: true, status: "pending" });
  } catch {
    res.status(500).json({ error: "claim_failed" });
  }
});

app.post("/api/corrections", rateLimit("corrections", 10, 60 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    if(spamTrap(b))return res.status(201).json({ok:true,status:"pending"});
    const result = await sb("rpc/memorial_submit_correction", {
      method: "POST",
      body: {
        p_event_id: b.event_id || null,
        p_cemetery_record_key: clean(b.cemetery_record_key, 100) || null,
        p_field_name: clean(b.field_name, 100),
        p_current_value: clean(b.current_value, 1000) || null,
        p_proposed_value: clean(b.proposed_value, 1000),
        p_requester_name: clean(b.requester_name, 120) || null,
        p_requester_contact: clean(b.requester_contact, 180) || null,
        p_relation: clean(b.relation_to_person, 120) || null,
        p_family_claim: Boolean(b.family_claim),
        p_evidence: clean(b.evidence_note, 1000) || null
      }
    });
    res.status(201).json({ ok: true, id: result, status: "pending" });
  } catch (e) {
    console.error("correction", e.data || e);
    res.status(400).json({ error: "correction_failed" });
  }
});

function splitMulti(v) {
  const s = String(v ?? "").trim();
  return s ? s.split("+").map(x => x.trim()) : [""];
}
function parseDMY(v) {
  const s = String(v ?? "").replaceAll("*","").trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (day < 1 || month < 1 || month > 12 || year < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return String(year).padStart(4,"0") + "-" + String(month).padStart(2,"0") + "-" + String(day).padStart(2,"0");
}
function roman(n) {
  const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || "I";
}
function fromRoman(s) {
  const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let n=0,prev=0;
  for (const ch of String(s||"").toUpperCase().split("").reverse()) { const x=v[ch]||0; if(x<prev)n-=x;else{n+=x;prev=x} }
  return n || 1;
}
function qmdField(text, key) {
  const re = new RegExp("^" + key + ":\\s*\\|\\s*\\n\\s{4}([^\\n]+)", "m");
  return (text.match(re)?.[1] || "").trim();
}
function parseCoords(v) {
  const m = String(v ?? "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return [null, null];
  const a = Number(m[1]), b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [null, null];
}

let cemeterySyncPromise = null;
async function syncCemeteryCatalog(force = false) {
  if (cemeterySyncPromise) return cemeterySyncPromise;
  cemeterySyncPromise = (async () => {
    if (!force) {
      const indexed = await sb("cemetery_records?select=record_key&limit=1000");
      if (indexed.length >= 1000) return { skipped: true, reason: "already_indexed" };
    }
    const url = "https://raw.githubusercontent.com/matzevalog/matzevalog/main/data/data.csv";
    const r = await fetch(url, { headers: { "user-agent": "pamyat-community-hub/1.0" } });
    if (!r.ok) throw new Error("catalog_download_failed_" + r.status);
    const csv = await r.text();
    const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true });
    const records = [];
    for (const row of rows) {
      const number = clean(row.Number, 80);
      if (!number.startsWith("QBA")) continue;
      const ru = splitMulti(row.Name_RU), he = splitMulti(row.Name_HE), sex = splitMulti(row.Sex);
      const bg = splitMulti(row.BDate_GR), bh = splitMulti(row.BDate_HE), dg = splitMulti(row.DDate_GR), dh = splitMulti(row.DDate_HE);
      const count = Math.max(ru.length, he.length, sex.length, dg.length, 1);
      const [lat, lon] = parseCoords(row.Coordinates);
      for (let i = 0; i < count; i++) {
        records.push({
          record_key: number + ":" + (i + 1),
          cemetery_code: "QBA",
          external_id: number,
          person_index: i + 1,
          name_ru: ru[i] || ru[0] || "",
          name_he: he[i] || he[0] || "",
          sex: sex[i] || sex[0] || "",
          birth_gr: bg[i] || bg[0] || "",
          birth_he: bh[i] || bh[0] || "",
          death_gr: dg[i] || dg[0] || "",
          death_he: dh[i] || dh[0] || "",
          death_date: parseDMY(dg[i] || dg[0]),
          latitude: lat,
          longitude: lon,
          tomb_type: clean(row.Tomb_type, 200),
          material: [clean(row.Material_code,100), clean(row.Material_RU,300)].filter(Boolean).join(" · "),
          source_code: clean(row.Source_Code, 200),
          source_url: "https://matzevalog.github.io/matzevalog/tombstones/" + number + "-" + roman(i + 1) + ".html",
          license: clean(row.license, 300) || "См. исходную карточку"
        });
      }
    }
    const knownKeys = new Set(records.map(x => x.record_key));
    try {
      const tr = await fetch("https://api.github.com/repos/matzevalog/matzevalog/git/trees/main?recursive=1", {
        headers: { "user-agent": "pamyat-community-hub/1.0", "accept": "application/vnd.github+json" }
      });
      if (tr.ok) {
        const tree = await tr.json();
        const paths = (tree.tree || []).map(x => x.path).filter(p => /^tombstones\/QBA[^/]+-[IVXLCDM]+\.qmd$/i.test(p));
        for (const p of paths) {
          const m = p.match(/^tombstones\/(QBA[^-]+)-([IVXLCDM]+)\.qmd$/i);
          if (!m) continue;
          const key = m[1] + ":" + fromRoman(m[2]);
          if (knownKeys.has(key)) continue;
          try {
            const rr = await fetch("https://raw.githubusercontent.com/matzevalog/matzevalog/main/" + p, { headers: { "user-agent": "pamyat-community-hub/1.0" } });
            if (!rr.ok) continue;
            const txt = await rr.text();
            const coordText = txt.match(/\*\*Координаты\*\*\s*\|\[([^\]]+)\]/)?.[1] || "";
            const [lat, lon] = parseCoords(coordText);
            records.push({
              record_key:key,cemetery_code:"QBA",external_id:m[1],person_index:fromRoman(m[2]),
              name_ru:qmdField(txt,"name-ru"),name_he:qmdField(txt,"name-he"),sex:(txt.match(/^sex:\s*(.+)$/m)?.[1]||"").trim(),
              birth_gr:"",birth_he:"",death_gr:(txt.match(/^year-gr:\s*(.+)$/m)?.[1]||"").trim(),
              death_he:(txt.match(/^year-he:\s*(.+)$/m)?.[1]||"").trim(),death_date:null,
              latitude:lat,longitude:lon,tomb_type:"",material:"",source_code:"",
              source_url:"https://matzevalog.github.io/matzevalog/" + p.replace(/^tombstones\//,"tombstones/").replace(/\.qmd$/i,".html"),
              license:"См. исходную карточку"
            });
            knownKeys.add(key);
          } catch (e) { console.error("qmd supplement", p, e.message); }
        }
      }
    } catch (e) { console.error("catalog tree supplement", e.message); }

    let written = 0, skipped = 0;
    async function upsertBatch(batch) {
      try {
        const n = await sb("rpc/memorial_admin_upsert_cemetery", {
          method: "POST", body: { p_token: ADMIN_TOKEN, p_records: batch }
        });
        return Number(n || batch.length);
      } catch (e) {
        if (batch.length <= 1) {
          skipped += 1;
          console.error("catalog record skipped", batch[0]?.record_key, e.data || e.message);
          return 0;
        }
        const mid = Math.floor(batch.length / 2);
        return (await upsertBatch(batch.slice(0, mid))) + (await upsertBatch(batch.slice(mid)));
      }
    }
    for (let i = 0; i < records.length; i += 100) {
      written += await upsertBatch(records.slice(i, i + 100));
      await sleep(25);
    }
    console.log("catalog sync complete", { records: records.length, written, skipped });
    return { ok: true, monuments: rows.filter(x => String(x.Number || "").startsWith("QBA")).length, records: records.length, written, skipped };
  })().finally(() => { cemeterySyncPromise = null; });
  return cemeterySyncPromise;
}

app.get("/api/cemetery/search", async (req, res) => {
  try {
    const q = clean(req.query.q, 180);
    const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));
    const rows = await sb("rpc/memorial_cemetery_search", { method: "POST", body: { p_query: q, p_limit: limit } });
    res.json(rows);
  } catch (e) {
    console.error("cemetery search", e.data || e);
    res.status(500).json({ error: "cemetery_search_failed" });
  }
});
app.get("/api/cemetery/catalog", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(20, Math.min(Number(req.query.limit || 100), 200));
    const offset = (page - 1) * limit;
    const params = new URLSearchParams();
    params.set("select", "record_key,external_id,name_ru,name_he,death_gr,death_he,death_date,latitude,longitude,tomb_type,source_url");
    params.set("cemetery_code", "eq.QBA");
    params.set("order", "external_id.asc,person_index.asc");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const rows = await sb("cemetery_records?" + params.toString());
    res.json({ page, limit, has_more: rows.length === limit, rows });
  } catch (e) {
    console.error("cemetery catalog", e.data || e);
    res.status(500).json({ error: "catalog_failed" });
  }
});

app.get("/api/cemetery/map", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1500), 2500));
    const rows = await sb("cemetery_records?select=record_key,external_id,name_ru,name_he,death_gr,latitude,longitude,source_url&cemetery_code=eq.QBA&latitude=not.is.null&longitude=not.is.null&limit=" + limit);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "map_failed" });
  }
});
app.post("/api/admin/cemetery/sync", requireAdmin, async (_req, res) => {
  try { res.json(await syncCemeteryCatalog(true)); }
  catch (e) { console.error(e); res.status(500).json({ error: "sync_failed", detail: e.message }); }
});

app.get("/api/family/graph", async (req, res) => {
  try {
    const data = await sb("rpc/memorial_family_graph", {
      method: "POST", body: { p_query: clean(req.query.q, 180), p_limit: 80 }
    });
    res.json(data);
  } catch { res.status(500).json({ error: "family_failed" }); }
});
app.post("/api/family/relations", rateLimit("family", 8, 60 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    if (!clean(b.person_name,180) || !clean(b.relative_name,180)) return res.status(400).json({ error: "names_required" });
    const rid = await sb("rpc/memorial_submit_family_relation", {
      method: "POST",
      body: {
        p_person_name: clean(b.person_name,180), p_person_death: validDate(b.person_death) ? b.person_death : null,
        p_relative_name: clean(b.relative_name,180), p_relative_death: validDate(b.relative_death) ? b.relative_death : null,
        p_relation_type: clean(b.relation_type,40), p_cemetery_record_key: clean(b.cemetery_record_key,100) || null,
        p_submitted_by: clean(b.submitted_by,120) || null, p_contact: clean(b.contact,180) || null,
        p_evidence: clean(b.evidence_note,1000) || null
      }
    });
    res.status(201).json({ ok: true, id: rid, status: "pending" });
  } catch (e) {
    console.error("family submit", e.data || e);
    res.status(400).json({ error: "family_submit_failed" });
  }
});

app.get("/api/push/public-key", (_req, res) => res.json({ key: VAPID_PUBLIC_KEY || null, configured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) }));

function validReminderEmail(v){ return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v||"")); }
function normalizePhone(v){
  let s=String(v||"").trim();
  if(!s)return "";
  s=s.replace(/[^\\d+]/g,"");
  if(s.startsWith("00"))s="+"+s.slice(2);
  if(/^8\\d{10}$/.test(s))s="+7"+s.slice(1);
  else if(/^7\\d{10}$/.test(s))s="+"+s;
  else if(/^\\d{10}$/.test(s))s="+7"+s;
  else if(/^\\d{8,15}$/.test(s))s="+"+s;
  return s;
}
function validE164(v){ return /^\\+[1-9]\\d{7,14}$/.test(normalizePhone(v)); }
function validTelegramChat(v){ return /^-?\\d{3,30}$/.test(String(v||"")); }
function reminderProviderStatus(){
  return {
    push:Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    email:Boolean(RESEND_API_KEY && RESEND_FROM),
    telegram:Boolean(TELEGRAM_BOT_TOKEN),
    whatsapp:Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_GRAPH_VERSION && WHATSAPP_TEMPLATE_NAME),
    sms:Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER)
  };
}

app.get("/api/notification-groups", async (_req,res)=>{
  try{
    const groups=await sb("rpc/memorial_notification_groups",{method:"POST",body:{}});
    res.setHeader("Cache-Control","public,max-age=60");res.json(groups||[]);
  }catch(e){res.status(500).json({error:"groups_failed"})}
});

app.get("/api/reminders/status", (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.json(reminderProviderStatus());
});

app.post("/api/reminders/subscribe", rateLimit("reminder-subscribe",12,60*60*1000), async (req,res) => {
  try{
    const b=req.body||{}, s=b.subscription||{};
    const days=Array.isArray(b.reminder_days)?b.reminder_days.map(Number).filter(n=>[0,1,3,7,14,30].includes(n)):[7,1,0];
    if(!days.length)return res.status(400).json({error:"reminder_days_required"});

    const pushEnabled=Boolean(b.push_enabled);
    const emailEnabled=Boolean(b.email_enabled);
    const telegramEnabled=Boolean(b.telegram_enabled);
    const whatsappEnabled=Boolean(b.whatsapp_enabled);
    const smsEnabled=Boolean(b.sms_enabled);
    if(!pushEnabled&&!emailEnabled&&!telegramEnabled&&!whatsappEnabled&&!smsEnabled)return res.status(400).json({error:"channel_required"});

    const email=clean(b.email,180);
    const telegramChat=clean(b.telegram_chat_id,100);
    const whatsappPhone=normalizePhone(clean(b.whatsapp_phone,40));
    const smsPhone=normalizePhone(clean(b.sms_phone,40));
    if(pushEnabled && (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth))return res.status(400).json({error:"push_permission_required"});
    if(emailEnabled && !validReminderEmail(email))return res.status(400).json({error:"valid_email_required"});
    if(telegramEnabled && !validTelegramChat(telegramChat))return res.status(400).json({error:"telegram_chat_id_required"});
    if(whatsappEnabled && !validE164(whatsappPhone))return res.status(400).json({error:"whatsapp_phone_e164_required"});
    if(smsEnabled && !validE164(smsPhone))return res.status(400).json({error:"sms_phone_e164_required"});

    const dt=clean(b.device_token,100);
    const groups=(Array.isArray(b.interest_groups)?b.interest_groups:[]).map(x=>clean(x,64).toLowerCase()).filter(x=>/^[a-z0-9][a-z0-9-]{0,63}$/.test(x)).slice(0,30);
    const token=await sb("rpc/memorial_reminder_subscribe_v3",{
      method:"POST",
      body:{
        p_device_token:/^[0-9a-f-]{36}$/i.test(dt)?dt:null,
        p_endpoint:pushEnabled?s.endpoint:null,
        p_p256dh:pushEnabled?s.keys.p256dh:null,
        p_auth:pushEnabled?s.keys.auth:null,
        p_timezone:clean(b.timezone,100)||"UTC",
        p_locale:clean(b.locale,20)||"ru",
        p_reminder_days:days,
        p_reminder_time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.reminder_time||""))?b.reminder_time:"09:00",
        p_reminder_times:Object.fromEntries(Object.entries(b.reminder_times||{}).filter(([k,v])=>["0","1","3","7","14","30"].includes(k)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)))),
        p_push_enabled:pushEnabled,
        p_email:email||null,p_email_enabled:emailEnabled,
        p_telegram_chat_id:telegramChat||null,p_telegram_enabled:telegramEnabled,
        p_whatsapp_phone:whatsappPhone||null,p_whatsapp_enabled:whatsappEnabled,
        p_sms_phone:smsPhone||null,p_sms_enabled:smsEnabled,
        p_interest_groups:groups.length?groups:["all"],
        p_quiet_start:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.quiet_start||""))?b.quiet_start:null,
        p_quiet_end:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.quiet_end||""))?b.quiet_end:null,
        p_general_notifications_enabled:b.general_notifications_enabled!==false
      }
    });
    await sb("rpc/memorial_reminder_set_urgent",{method:"POST",body:{p_device_token:token,p_enabled:Boolean(b.urgent_alerts)}});
    const p=reminderProviderStatus(),waiting=[];
    if(pushEnabled&&!p.push)waiting.push("Push");
    if(emailEnabled&&!p.email)waiting.push("Email");
    if(telegramEnabled&&!p.telegram)waiting.push("Telegram");
    if(whatsappEnabled&&!p.whatsapp)waiting.push("WhatsApp");
    if(smsEnabled&&!p.sms)waiting.push("SMS");
    res.status(201).json({ok:true,device_token:token,waiting_for_provider:waiting});
  }catch(e){
    console.error("reminder subscribe",e.data||e);
    res.status(500).json({error:"subscribe_failed"});
  }
});

app.post("/api/reminders/device-status", rateLimit("reminder-status",30,60*60*1000), async (req,res)=>{
  try{
    const t=clean(req.body?.device_token,100);
    if(!/^[0-9a-f-]{36}$/i.test(t))return res.status(400).json({error:"device_token_required"});
    const data=await sb("rpc/memorial_reminder_device_status",{method:"POST",body:{p_device_token:t}});
    if(!data)return res.status(404).json({error:"not_found"});
    res.setHeader("Cache-Control","no-store");
    res.json(data);
  }catch(e){res.status(500).json({error:"status_failed"})}
});

app.post("/api/reminders/test/:channel", rateLimit("reminder-test",10,15*60*1000), async (req,res) => {
  try{
    const ch=clean(req.params.channel,20);
    const text={title:"Память — тест напоминания",body:"Тестовый канал работает. Это сообщение можно удалить."};
    if(ch==="push"){
      const s=req.body?.subscription||{};
      if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)return res.status(503).json({error:"push_not_configured"});
      if(!s.endpoint||!s.keys?.p256dh||!s.keys?.auth)return res.status(400).json({error:"push_permission_required"});
      await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}},
        JSON.stringify({title:text.title,body:text.body,url:APP_PUBLIC_URL}),{TTL:3600});
    } else if(ch==="email"){
      const email=clean(req.body?.email,180);if(!validReminderEmail(email))return res.status(400).json({error:"valid_email_required"});
      await sendEmailAddress(email,text);
    } else if(ch==="telegram"){
      const chat=clean(req.body?.telegram_chat_id,100);if(!validTelegramChat(chat))return res.status(400).json({error:"telegram_chat_id_required"});
      await telegramSend(chat,text.title+"\n"+text.body);
    } else if(ch==="whatsapp"){
      const phone=normalizePhone(clean(req.body?.whatsapp_phone,40));if(!validE164(phone))return res.status(400).json({error:"whatsapp_phone_e164_required"});
      await whatsappSend(phone,text);
    } else if(ch==="sms"){
      const phone=normalizePhone(clean(req.body?.sms_phone,40));if(!validE164(phone))return res.status(400).json({error:"sms_phone_e164_required"});
      await smsSend(phone,text);
    } else return res.status(400).json({error:"bad_channel"});
    res.json({ok:true,channel:ch});
  }catch(e){
    const msg=e.message||"test_failed";
    const notConfigured=/_not_configured$/.test(msg);
    res.status(notConfigured?503:502).json({error:msg});
  }
});

app.post("/api/push/subscribe", rateLimit("push-subscribe", 10, 60 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {}, s = b.subscription || {};
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return res.status(400).json({ error: "bad_subscription" });
    const token = await sb("rpc/memorial_push_subscribe", {
      method: "POST",
      body: {
        p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth,
        p_timezone: clean(b.timezone,100) || "UTC", p_locale: clean(b.locale,20) || "ru",
        p_reminder_days: Array.isArray(b.reminder_days) ? b.reminder_days.map(Number).filter(n => [0,1,3,7,14,30].includes(n)) : [7,1,0],
        p_email: clean(b.email,180) || null, p_email_enabled: Boolean(b.email_enabled),
        p_telegram_chat_id: clean(b.telegram_chat_id,100) || null, p_telegram_enabled: Boolean(b.telegram_enabled)
      }
    });
    res.status(201).json({ ok: true, device_token: token });
  } catch (e) {
    console.error("push subscribe", e.data || e);
    res.status(500).json({ error: "subscribe_failed" });
  }
});
app.post("/api/push/unsubscribe", async (req, res) => {
  try {
    const token = clean(req.body?.device_token,100);
    if (!token) return res.status(400).json({ error: "token_required" });
    const ok = await sb("rpc/memorial_push_unsubscribe", { method: "POST", body: { p_device_token: token } });
    res.json({ ok });
  } catch { res.status(500).json({ error: "unsubscribe_failed" }); }
});

async function logDelivery(item, channel, result) {
  const tz = item.timezone || "UTC";
  let deliveryDate;
  try { deliveryDate = new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
  catch { deliveryDate = new Date().toISOString().slice(0,10); }
  await sb("rpc/memorial_log_notification", {
    method: "POST",
    body: {
      p_token: ADMIN_TOKEN, p_subscription_id: item.subscription_id, p_event_id: item.event_id,
      p_channel: channel, p_reminder_days: item.reminder_days, p_delivery_date: deliveryDate, p_result: clean(result,500)
    }
  });
}
function notificationText(item) {
  const lang=String(item.locale||"ru").toLowerCase().split(/[-_]/)[0];
  const dict={
    ru:{urgent:"срочное объявление",today:"сегодня",tomorrow:"завтра",days:n=>"через "+n+" дн.",open:"Открыть памятную страницу",
      types:{"Памятная дата":"Памятная дата","Похороны":"Похороны","Йорцайт":"Йорцайт","Годовщина":"Годовщина"}},
    en:{urgent:"urgent notice",today:"today",tomorrow:"tomorrow",days:n=>"in "+n+" days",open:"Open memorial page",
      types:{"Памятная дата":"Memorial date","Похороны":"Funeral","Йорцайт":"Yahrzeit","Годовщина":"Anniversary"}},
    he:{urgent:"הודעה דחופה",today:"היום",tomorrow:"מחר",days:n=>"בעוד "+n+" ימים",open:"פתיחת דף הזיכרון",
      types:{"Памятная дата":"יום זיכרון","Похороны":"לוויה","Йорцайт":"יארצייט","Годовщина":"יום שנה"}},
    az:{urgent:"təcili elan",today:"bu gün",tomorrow:"sabah",days:n=>n+" gün sonra",open:"Xatirə səhifəsini aç",
      types:{"Памятная дата":"Xatirə tarixi","Похороны":"Dəfn","Йорцайт":"Yortsayt","Годовщина":"İldönümü"}}
  };
  const d=dict[lang]||dict.ru;
  const when=item.reminder_days===-1?d.urgent:item.reminder_days===0?d.today:item.reminder_days===1?d.tomorrow:d.days(item.reminder_days);
  const eventType=d.types[item.event_type]||item.event_type||d.types["Памятная дата"];
  const privateKey=/^[0-9a-f-]{36}$/i.test(String(item.share_token||""))?String(item.share_token):"";
  const url=(APP_PUBLIC_URL||PUBLIC_BASE_URL||"").replace(/\/$/,"")+"/m/memorial/"+encodeURIComponent(item.event_id)+(privateKey?"?key="+encodeURIComponent(privateKey):"");
  return { title: eventType + " — " + when, body: item.full_name + " · " + item.event_date + (item.place ? " · " + item.place : ""), url, openLabel:d.open };
}
async function sendEmailAddress(address, text) {
  if (!RESEND_API_KEY || !RESEND_FROM) throw new Error("email_not_configured");
  const safeBody=String(text.body||"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
  const openUrl=String(text.url||APP_PUBLIC_URL||"").replace(/"/g,"%22");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [address], subject: text.title, html: "<p>" + safeBody + "</p><p><a href='" + openUrl + "'>" + String(text.openLabel||"Открыть памятную страницу").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])) + "</a></p>" })
  });
  if (!r.ok) throw new Error("email_" + r.status);
  return "sent";
}
async function sendEmail(item, text) {
  if (!item.email_enabled || !item.email) return null;
  return sendEmailAddress(item.email,text);
}
async function telegramSend(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("telegram_not_configured");
  if (!chatId) throw new Error("telegram_chat_required");
  const r = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error("telegram_" + r.status);
  return "sent";
}

async function whatsappSend(phone,text){
  if(!reminderProviderStatus().whatsapp)throw new Error("whatsapp_not_configured");
  if(!phone)throw new Error("whatsapp_phone_required");
  const to=String(phone).replace(/^\\+/,"");
  const r=await fetch("https://graph.facebook.com/"+encodeURIComponent(WHATSAPP_GRAPH_VERSION)+"/"+encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)+"/messages",{
    method:"POST",
    headers:{authorization:"Bearer "+WHATSAPP_ACCESS_TOKEN,"content-type":"application/json"},
    body:JSON.stringify({
      messaging_product:"whatsapp",
      to,
      type:"template",
      template:{
        name:WHATSAPP_TEMPLATE_NAME,
        language:{code:WHATSAPP_TEMPLATE_LANG},
        components:[{type:"body",parameters:[
          {type:"text",text:text.title},
          {type:"text",text:text.body},
          {type:"text",text:text.url||APP_PUBLIC_URL}
        ]}]
      }
    })
  });
  if(!r.ok)throw new Error("whatsapp_"+r.status);
  return "sent";
}
async function smsSend(phone,text){
  if(!reminderProviderStatus().sms)throw new Error("sms_not_configured");
  if(!phone)throw new Error("sms_phone_required");
  const form=new URLSearchParams({To:phone,From:TWILIO_FROM_NUMBER,Body:text.title+"\\n"+text.body+"\\n"+(text.url||APP_PUBLIC_URL)});
  const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(TWILIO_ACCOUNT_SID)+"/Messages.json",{
    method:"POST",
    headers:{authorization:"Basic "+Buffer.from(TWILIO_ACCOUNT_SID+":"+TWILIO_AUTH_TOKEN).toString("base64"),"content-type":"application/x-www-form-urlencoded"},
    body:form.toString()
  });
  if(!r.ok)throw new Error("sms_"+r.status);
  return "sent";
}

async function logAttempt(item,channel,success,detail){
  try{
    await sb("rpc/memorial_log_notification_attempt",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_subscription_id:item.subscription_id,p_event_id:item.event_id,
      p_channel:channel,p_reminder_days:item.reminder_days,p_success:Boolean(success),p_detail:clean(detail,500)
    }});
  }catch(e){console.error("attempt log",e.data||e.message)}
}

let notificationCycleRunning = false;
function notificationLocalDate(item){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:item.timezone||"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
  catch{return new Date().toISOString().slice(0,10)}
}
function inQuietHours(item){
  if(!item.quiet_start||!item.quiet_end)return false;
  try{
    const p=new Intl.DateTimeFormat("en-GB",{timeZone:item.timezone||"UTC",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    const cur=p.slice(0,5),a=String(item.quiet_start).slice(0,5),b=String(item.quiet_end).slice(0,5);
    if(a===b)return false;
    return a<b?(cur>=a&&cur<b):(cur>=a||cur<b);
  }catch{return false}
}
async function ensureInboxItem(item,text){
  if(!/^[0-9a-f-]{36}$/i.test(String(item.device_token||"")))return;
  const key=[item.event_id,item.reminder_days,notificationLocalDate(item),item.notification_revision||0].join(":");
  try{
    await sb("rpc/memorial_inbox_upsert_admin",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_device_token:item.device_token,p_event_id:item.event_id,
      p_kind:item.reminder_days===-1?"urgent":item.follow_only?"person-follow":"reminder",
      p_title:text.title,p_body:text.body,p_url:text.url,p_dedupe_key:key
    }});
  }catch(e){console.error("inbox upsert",e.data||e.message)}
}
async function runNotificationCycle() {
  if (notificationCycleRunning || !ADMIN_TOKEN) return;
  notificationCycleRunning = true;
  try {
    const nowIso=new Date().toISOString();
    const [regular,urgent,follow]=await Promise.all([
      sb("rpc/memorial_due_notifications",{method:"POST",body:{p_token:ADMIN_TOKEN,p_now:nowIso}}),
      sb("rpc/memorial_due_urgent_notifications",{method:"POST",body:{p_token:ADMIN_TOKEN,p_now:nowIso}}),
      sb("rpc/memorial_due_follow_notifications",{method:"POST",body:{p_token:ADMIN_TOKEN,p_now:nowIso}})
    ]);
    const map=new Map();
    for(const item of [...(regular||[]),...(urgent||[]),...(follow||[])]){
      const k=[item.subscription_id,item.event_id,item.reminder_days].join(":");
      if(!map.has(k))map.set(k,item);
      else map.set(k,{...map.get(k),...item,follow_only:Boolean(map.get(k).follow_only||item.follow_only)});
    }
    for (const item of map.values()) {
      const text = notificationText(item);
      await ensureInboxItem(item,text);
      if(inQuietHours(item))continue;
      const run=async(channel,fn)=>{
        try{
          const r=await fn();
          if(r){await logAttempt(item,channel,true,r);await logDelivery(item,channel,r)}
        }catch(e){
          await logAttempt(item,channel,false,e.message||String(e));
          console.error(channel+" send",e.statusCode||e.message);
        }
      };
      if (item.push_enabled && !item.push_sent && item.endpoint) await run("push",async()=>{
        if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error("push_not_configured");
        await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
          JSON.stringify({ title: text.title, body: text.body, url: text.url, event_id: item.event_id }),
          { TTL: 86400 }); return "sent";
      });
      if (item.email_enabled && !item.email_sent && item.email) await run("email",()=>sendEmail(item,text));
      if (item.telegram_enabled && !item.telegram_sent && item.telegram_chat_id) await run("telegram",()=>telegramSend(item.telegram_chat_id,text.title+"\n"+text.body+"\n"+text.url));
      if (item.whatsapp_enabled && !item.whatsapp_sent && item.whatsapp_phone) await run("whatsapp",()=>whatsappSend(item.whatsapp_phone,text));
      if (item.sms_enabled && !item.sms_sent && item.sms_phone) await run("sms",()=>smsSend(item.sms_phone,text));
    }
  } catch (e) { console.error("notification cycle", e.data || e); }
  finally { notificationCycleRunning = false; }
}
app.get("/api/telegram/status", (_req,res) => res.json({ configured: Boolean(TELEGRAM_BOT_TOKEN), webhook_ready: Boolean(TELEGRAM_WEBHOOK_SECRET) }));
app.post("/api/telegram/webhook/:secret", async (req,res) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || req.params.secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(404).end();
  res.json({ ok: true });
  try {
    const msg = req.body?.message;
    if (!msg?.chat?.id || !msg.text) return;
    const chatId = String(msg.chat.id), text = String(msg.text).trim();
    if (text.startsWith("/start")) {
      await telegramSend(chatId, "Календарь «Память».\nВаш Telegram chat ID: " + chatId + "\nКоманды: /today, /week, /find Имя");
    } else if (text.startsWith("/today") || text.startsWith("/week")) {
      const days = text.startsWith("/today") ? 0 : 7;
      const rows = await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:"",p_city:"",p_type:"",p_limit:300}});
      const today = new Date(); today.setHours(0,0,0,0);
      const filtered = rows.filter(e => {
        if (!e.event_date) return false;
        const d = new Date(e.event_date + "T00:00:00");
        const diff = Math.round((d-today)/86400000);
        return diff >= 0 && diff <= days;
      }).slice(0,20);
      await telegramSend(chatId, filtered.length ? filtered.map(e => e.event_date + " · " + e.event_type + " · " + e.full_name).join("\n") : "В выбранном периоде событий нет.");
    } else if (text.startsWith("/find")) {
      const q = text.replace(/^\/find\s*/,"").trim();
      const rows = await sb("rpc/memorial_event_search",{method:"POST",body:{p_query:q,p_city:"",p_type:"",p_limit:20}});
      await telegramSend(chatId, rows.length ? rows.map(e => (e.event_date||"—") + " · " + e.full_name + " · " + e.event_type).join("\n") : "Ничего не найдено.");
    } else {
      await telegramSend(chatId, "Используйте /today, /week или /find Имя");
    }
  } catch (e) { console.error("telegram webhook", e); }
});



app.get("/api/admin/auth/status", async (req,res) => {
  const ok=await isAdmin(req);
  res.setHeader("Cache-Control","no-store");
  res.status(ok?200:401).json(ok?{
    ok:true,
    email:req.adminIdentity?.email||null,
    role:req.adminIdentity?.role||"moderator",
    display_name:req.adminIdentity?.display_name||null
  }:{ok:false});
});

app.post("/api/admin/setup-email", requireOwner, rateLimit("admin-setup-email",8,60*60*1000), async (req,res) => {
  try{
    const email=clean(req.body?.email,180).toLowerCase();
    const role=clean(req.body?.role,20)==="moderator"?"moderator":"admin";
    if(!validReminderEmail(email))return res.status(400).json({error:"valid_email_required"});
    await sb("rpc/memorial_admin_add_user",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email,p_role:role}});
    res.json({ok:true,email,role});
  }catch(e){console.error("admin setup email",e.data||e);res.status(500).json({error:"setup_failed"})}
});

app.post("/api/admin/auth/password", rateLimit("admin-password-login",8,15*60*1000), async (req,res) => {
  try{
    const user=clean(req.body?.user,180).toLowerCase();
    const password=String(req.body?.password||"");
    const identity=await adminPasswordIdentity(user,password);
    if(!identity?.allowed)return res.status(401).json({error:"invalid_login"});
    const sess=await createAdminSession(req,identity,"password");
    res.setHeader("Set-Cookie","pamyat_admin_session="+encodeURIComponent(sess.cookie)+"; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax");
    res.json({ok:true,email:identity.email,role:identity.role||"moderator",display_name:identity.display_name||null,provider:"password",session_id:sess.sessionId});
  }catch(e){
    console.error("admin password login",e.data||e);
    res.status(500).json({error:"login_failed"});
  }
});

app.post("/api/admin/auth/request", rateLimit("admin-auth-request",6,15*60*1000), async (req,res) => {
  const generic={ok:true,message:"Ссылка входа отправлена на разрешённый email. Проверьте также папку «Спам»."};
  try{
    const email=clean(req.body?.email,180).toLowerCase();
    if(!validReminderEmail(email))return res.json(generic);
    const allowed=await sb("rpc/memorial_admin_email_allowed",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email}});
    if(!allowed?.allowed)return res.json(generic);

    const redirect=(PUBLIC_BASE_URL||"").replace(/\/$/,"")+"/m/admin/auth/callback";

    // Primary path: Supabase Auth's email delivery, so admin login does not depend on a verified Resend domain.
    try{
      const otp=await fetch(SUPABASE_URL+"/auth/v1/otp?redirect_to="+encodeURIComponent(redirect),{
        method:"POST",
        headers:{apikey:SUPABASE_ANON_KEY,"content-type":"application/json"},
        body:JSON.stringify({email,create_user:true})
      });
      if(otp.ok)return res.json({...generic,provider:"supabase"});
      console.error("admin supabase otp",otp.status,await otp.text());
    }catch(e){console.error("admin supabase otp",e.message)}

    // Fallback: custom one-time link through Resend when a verified sender is configured.
    if(!RESEND_API_KEY||!RESEND_FROM)return res.status(503).json({error:"email_login_unavailable"});
    const raw=crypto.randomBytes(32).toString("base64url");
    const hash=crypto.createHash("sha256").update(raw).digest("hex");
    const expires=new Date(Date.now()+15*60*1000).toISOString();
    await sb("rpc/memorial_admin_login_token_create",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email,p_hash:hash,p_expires_at:expires}});
    const link=redirect+"?token="+encodeURIComponent(raw);
    await sendEmailAddress(email,{title:"Вход в админ-панель «Память»",body:"Ссылка действует 15 минут: "+link});
    res.json({...generic,provider:"resend"});
  }catch(e){console.error("admin auth request",e.data||e);res.status(500).json({error:"auth_request_failed"})}
});

app.post("/api/admin/auth/session", rateLimit("admin-auth-session",12,15*60*1000), async (req,res) => {
  try{
    const access=clean(req.body?.access_token,5000);
    if(access){
      const ur=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:SUPABASE_ANON_KEY,authorization:"Bearer "+access}});
      if(!ur.ok)return res.status(401).json({error:"invalid_login"});
      const user=await ur.json();
      const email=String(user.email||"").toLowerCase();
      const allowed=await sb("rpc/memorial_admin_email_allowed",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email}});
      if(!allowed?.allowed)return res.status(403).json({error:"admin_not_allowed"});
      const sess=await createAdminSession(req,{...allowed,email},"supabase");
      res.setHeader("Set-Cookie","pamyat_admin_session="+encodeURIComponent(sess.cookie)+"; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax");
      return res.json({ok:true,email,role:allowed.role||"admin",provider:"supabase",session_id:sess.sessionId});
    }

    const raw=clean(req.body?.login_token,500);
    if(!raw)return res.status(400).json({error:"login_token_required"});
    const hash=crypto.createHash("sha256").update(raw).digest("hex");
    const data=await sb("rpc/memorial_admin_login_token_consume",{method:"POST",body:{p_token:ADMIN_TOKEN,p_hash:hash}});
    if(!data?.ok)return res.status(401).json({error:"invalid_or_expired_login"});
    const allowedNow=await sb("rpc/memorial_admin_email_allowed",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:data.email}});
    const sess=await createAdminSession(req,{...allowedNow,email:data.email,role:data.role||allowedNow.role||"admin"},"resend");
    res.setHeader("Set-Cookie","pamyat_admin_session="+encodeURIComponent(sess.cookie)+"; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax");
    res.json({ok:true,email:data.email,role:data.role||allowedNow.role||"admin",provider:"resend",session_id:sess.sessionId});
  }catch(e){console.error("admin session",e.data||e);res.status(500).json({error:"session_failed"})}
});

app.post("/api/admin/auth/logout", async (req,res) => {
  try{
    const s=adminSessionVerify(parseCookies(req).pamyat_admin_session);
    if(s?.session_id&&s?.email)await sb("rpc/memorial_admin_session_revoke",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:s.email,p_session_id:s.session_id}});
  }catch{}
  res.setHeader("Set-Cookie","pamyat_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  res.json({ok:true});
});


app.post("/api/admin/moderation/:kind/:id/:action", requireAdmin, async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_admin_moderation_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_kind:clean(req.params.kind,30),p_id:req.params.id,p_action:clean(req.params.action,30)}});
    res.json(data);
  }catch(e){console.error("moderation action",e.data||e);res.status(400).json({error:"moderation_failed"})}
});


app.get("/api/admin/auth/sessions", requireAdmin, async (req,res) => {
  try{
    if(req.adminIdentity?.legacy)return res.json([]);
    const rows=await sb("rpc/memorial_admin_sessions_list",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:req.adminIdentity.email}});
    res.json(rows||[]);
  }catch(e){console.error("sessions list",e.data||e);res.status(500).json({error:"sessions_failed"})}
});

app.post("/api/admin/auth/sessions/:sessionId/revoke", requireAdmin, async (req,res) => {
  try{
    const sid=clean(req.params.sessionId,50);
    if(!/^[0-9a-f-]{36}$/i.test(sid))return res.status(400).json({error:"bad_session"});
    await sb("rpc/memorial_admin_session_revoke",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:req.adminIdentity.email,p_session_id:sid}});
    if(req.adminIdentity?.session_id===sid)res.setHeader("Set-Cookie","pamyat_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    res.json({ok:true,current:req.adminIdentity?.session_id===sid});
  }catch(e){console.error("session revoke",e.data||e);res.status(500).json({error:"session_revoke_failed"})}
});

app.get("/api/admin/users", requireOwner, async (_req,res) => {
  try{
    const data=await sb("rpc/memorial_admin_users_list",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    res.json(data||[]);
  }catch(e){console.error("admin users",e.data||e);res.status(500).json({error:"users_failed"})}
});

app.post("/api/admin/users", requireOwner, async (req,res) => {
  try{
    const email=clean(req.body?.email,180).toLowerCase();
    const role=clean(req.body?.role,20);
    const displayName=clean(req.body?.display_name,120)||null;
    if(!validReminderEmail(email))return res.status(400).json({error:"valid_email_required"});
    if(!["owner","admin","moderator"].includes(role))return res.status(400).json({error:"bad_role"});
    const data=await sb("rpc/memorial_admin_set_user",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_email:email,p_role:role,p_active:req.body?.active!==false,p_display_name:displayName
    }});
    res.json(data);
  }catch(e){console.error("admin set user",e.data||e);res.status(500).json({error:"user_update_failed"})}
});

app.post("/api/admin/users/password", requireOwner, rateLimit("admin-user-password",12,60*60*1000), async (req,res) => {
  try{
    const email=clean(req.body?.email,180).toLowerCase();
    const password=String(req.body?.password||"");
    if(!validReminderEmail(email))return res.status(400).json({error:"valid_email_required"});
    if(password.length<12||password.length>200)return res.status(400).json({error:"password_min_12"});
    const salt=crypto.randomBytes(16).toString("hex");
    const hash=crypto.scryptSync(password,salt,64).toString("hex");
    const ok=await sb("rpc/memorial_admin_set_password",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email,p_salt:salt,p_hash:hash}});
    if(!ok)return res.status(404).json({error:"admin_not_found"});
    res.json({ok:true});
  }catch(e){console.error("admin set password",e.data||e);res.status(500).json({error:"password_update_failed"})}
});

app.post("/api/admin/auth/revoke-all", requireAdmin, async (req,res) => {
  try{
    const email=req.adminIdentity?.email;
    if(!email||email==="token-admin")return res.status(400).json({error:"session_not_revocable"});
    await sb("rpc/memorial_admin_revoke_sessions",{method:"POST",body:{p_token:ADMIN_TOKEN,p_email:email}});
    res.setHeader("Set-Cookie","pamyat_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    res.json({ok:true});
  }catch(e){console.error("revoke all",e.data||e);res.status(500).json({error:"revoke_failed"})}
});

app.get("/api/admin/trash", requireAdminRole, async (_req,res) => {
  try{res.json(await sb("rpc/memorial_admin_trash_list",{method:"POST",body:{p_token:ADMIN_TOKEN}}))}
  catch(e){console.error("trash list",e.data||e);res.status(500).json({error:"trash_failed"})}
});

app.post("/api/admin/events/:eventId/edit", requireAdminRole, async (req,res) => {
  try{
    const p=req.body||{};
    const patch={
      full_name:clean(p.full_name,180),
      death_date:clean(p.death_date,10),
      event_type:clean(p.event_type,80),
      event_date:clean(p.event_date,10),
      event_time:clean(p.event_time,20),
      event_timezone:clean(p.event_timezone,100)||"Europe/Moscow",
      visibility:["public","link","invited"].includes(p.visibility)?p.visibility:"public",
      audience_groups:(Array.isArray(p.audience_groups)?p.audience_groups:[]).map(x=>clean(x,64).toLowerCase()).filter(x=>/^[a-z0-9][a-z0-9-]{0,63}$/.test(x)).slice(0,30),
      city:clean(p.city,120),
      place:clean(p.place,180),
      note:clean(p.note,1500),
      hebrew_death_label:clean(p.hebrew_death_label,120),
      yahrzeit_date:clean(p.yahrzeit_date,10),
      yahrzeit_rule:["standard","adar_i","adar_ii","family_custom","manual"].includes(p.yahrzeit_rule)?p.yahrzeit_rule:"standard",
      family_verified:Boolean(p.family_verified),
      source_verified:Boolean(p.source_verified),
      urgent:Boolean(p.urgent),
      public_contact:clean(p.public_contact,180),
      public_contact_allowed:Boolean(p.public_contact_allowed)
    };
    if(patch.death_date&&!validDate(patch.death_date))return res.status(400).json({error:"bad_death_date"});
    if(patch.event_date&&!validDate(patch.event_date))return res.status(400).json({error:"bad_event_date"});
    if(patch.yahrzeit_date&&!validDate(patch.yahrzeit_date))return res.status(400).json({error:"bad_yahrzeit_date"});
    const data=await sb("rpc/memorial_admin_update_event",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId,p_patch:patch}});
    res.json(data);
  }catch(e){console.error("event edit",e.data||e);res.status(500).json({error:"edit_failed"})}
});

app.post("/api/admin/events/:eventId/trash", requireAdminRole, async (req,res) => {
  try{res.json(await sb("rpc/memorial_admin_trash_person",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}))}
  catch(e){console.error("trash person",e.data||e);res.status(500).json({error:"trash_failed"})}
});

app.post("/api/admin/events/:eventId/restore", requireAdminRole, async (req,res) => {
  try{res.json(await sb("rpc/memorial_admin_restore_person",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}))}
  catch(e){console.error("restore person",e.data||e);res.status(500).json({error:"restore_failed"})}
});

app.post("/api/admin/events/:eventId/purge", requireOwner, async (req,res) => {
  try{
    if(String(req.body?.confirm||"")!=="PURGE")return res.status(400).json({error:"confirm_purge_required"});
    res.json(await sb("rpc/memorial_admin_purge_person",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}));
  }catch(e){console.error("purge person",e.data||e);res.status(500).json({error:"purge_failed"})}
});

app.post("/api/admin/events/:eventId/merge", requireAdminRole, async (req,res) => {
  try{
    const duplicateId=clean(req.body?.duplicate_id,50);
    if(!/^[0-9a-f-]{36}$/i.test(duplicateId))return res.status(400).json({error:"duplicate_id_required"});
    res.json(await sb("rpc/memorial_admin_merge_events",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_keep_id:req.params.eventId,p_duplicate_id:duplicateId
    }}));
  }catch(e){console.error("merge events",e.data||e);res.status(400).json({error:"merge_failed"})}
});

app.post("/api/admin/events/:eventId/photo", requireAdminRole, photoUpload.single("photo"), async (req,res) => {
  try{
    if(!req.file)return res.status(400).json({error:"photo_required"});
    const b64=req.file.buffer.toString("base64");
    await sb("rpc/memorial_admin_set_photo",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_event_id:req.params.eventId,p_mime:req.file.mimetype,p_base64:b64
    }});
    res.json({ok:true});
  }catch(e){console.error("photo upload",e.data||e);res.status(500).json({error:"photo_failed"})}
});

app.delete("/api/admin/events/:eventId/photo", requireAdminRole, async (req,res) => {
  try{
    await sb("rpc/memorial_admin_remove_photo",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}});
    res.json({ok:true});
  }catch(e){console.error("photo remove",e.data||e);res.status(500).json({error:"photo_remove_failed"})}
});

app.get("/api/admin/export.json", requireAdminRole, async (_req,res) => {
  try{
    const data=await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    res.setHeader("Content-Disposition",'attachment; filename="pamyat-export.json"');
    res.type("application/json; charset=utf-8").send(JSON.stringify(data,null,2));
  }catch(e){res.status(500).json({error:"export_failed"})}
});

app.get("/api/admin/export.csv", requireAdminRole, async (_req,res) => {
  try{
    const data=await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    const cols=["id","full_name","death_date","event_type","event_date","event_time","city","place","status","visibility","family_verified","source_verified","urgent","hebrew_death_label","yahrzeit_date","note"];
    const safe=v=>{
      let s=String(v??"");
      if(/^[=+\-@]/.test(s))s="'"+s;
      return csvCell(s);
    };
    const lines=[cols.join(",")].concat((data.events||[]).map(e=>cols.map(k=>safe(e[k])).join(",")));
    res.setHeader("Content-Disposition",'attachment; filename="pamyat-events.csv"');
    res.type("text/csv; charset=utf-8").send("\uFEFF"+lines.join("\n"));
  }catch(e){res.status(500).json({error:"export_failed"})}
});

app.get("/api/admin/export.xls", requireAdminRole, async (_req,res) => {
  try{
    const data=await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    const cols=["full_name","death_date","event_type","event_date","city","place","status","family_verified","hebrew_death_label","yahrzeit_date","note"];
    const xe=v=>String(v??"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const rows=(data.events||[]).map(e=>"<Row>"+cols.map(k=>"<Cell><Data ss:Type=\"String\">"+xe(e[k])+"</Data></Cell>").join("")+"</Row>").join("");
    const head="<Row>"+cols.map(k=>"<Cell><Data ss:Type=\"String\">"+xe(k)+"</Data></Cell>").join("")+"</Row>";
    const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Events"><Table>'+head+rows+'</Table></Worksheet></Workbook>';
    res.setHeader("Content-Disposition",'attachment; filename="pamyat-events.xls"');
    res.type("application/vnd.ms-excel; charset=utf-8").send(xml);
  }catch(e){res.status(500).json({error:"export_failed"})}
});

app.post("/api/admin/import/preview", requireAdminRole, csvUpload.single("file"), async (req,res) => {
  try{
    if(!req.file)return res.status(400).json({error:"file_required"});
    const name=String(req.file.originalname||"").toLowerCase();
    let rows=[];
    if(/\.(xlsx|xls)$/.test(name) || /spreadsheetml|vnd\.ms-excel/i.test(req.file.mimetype||"")){
      const wb=XLSX.read(req.file.buffer,{type:"buffer",cellDates:false,raw:false});
      const first=wb.SheetNames[0];
      if(!first)return res.status(400).json({error:"workbook_empty"});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[first],{defval:"",raw:false}).slice(0,500);
    }else{
      const raw=req.file.buffer.toString("utf8").replace(/^\uFEFF/,"");
      rows=parse(raw,{columns:true,skip_empty_lines:true,trim:true,bom:true,relax_column_count:true}).slice(0,500);
    }
    const normalized=rows.map((r,i)=>{
      const x={
        row:i+2,
        full_name:clean(r.full_name||r.name||r["ФИО"],180),
        death_date:clean(r.death_date||r["Дата смерти"],10),
        event_type:clean(r.event_type||r["Тип события"],80)||"Памятная дата",
        event_date:clean(r.event_date||r["Дата события"],10),
        city:clean(r.city||r["Город"],120),
        place:clean(r.place||r["Место"],180),
        note:clean(r.note||r["Комментарий"],1500)
      };
      const errors=[];
      if(!x.full_name)errors.push("full_name");
      if(x.death_date&&!validDate(x.death_date))errors.push("death_date");
      if(x.event_date&&!validDate(x.event_date))errors.push("event_date");
      if(!x.event_date&&validDate(x.death_date))x.event_date=x.death_date;
      return {...x,errors};
    });
    res.json({ok:true,total:normalized.length,valid:normalized.filter(x=>!x.errors.length).length,rows:normalized});
  }catch(e){console.error("import preview",e);res.status(400).json({error:"csv_invalid"})}
});

app.post("/api/admin/import/commit", requireAdminRole, async (req,res) => {
  try{
    const rows=Array.isArray(req.body?.rows)?req.body.rows.slice(0,500):[];
    let created=0,skipped=0,invalid=0;
    const inserts=[];
    for(const raw of rows){
      const fullName=clean(raw.full_name,180);
      const deathDate=clean(raw.death_date,10);
      const eventDate=clean(raw.event_date,10);
      if(!fullName||!validDate(eventDate)||(deathDate&&!validDate(deathDate))){invalid++;continue}
      const dup=await sb("rpc/memorial_duplicate_candidates",{method:"POST",body:{p_full_name:fullName,p_death_date:deathDate||null}});
      if(Array.isArray(dup)&&dup.length&&!req.body?.allow_duplicates){skipped++;continue}
      const heb=deathDate?hebrewLabel(deathDate):null;
      inserts.push({
        id:id(),full_name:fullName,death_date:deathDate||null,
        event_type:clean(raw.event_type,80)||"Памятная дата",
        event_date:eventDate,event_time:null,city:clean(raw.city,120)||null,place:clean(raw.place,180)||null,
        cemetery_link:null,note:clean(raw.note,1500)||null,visibility:"public",status:"pending",
        relation_confirmed:true,family_verified:false,publish_day7:false,publish_day40:false,publish_year1:false,publish_annual:false,
        derived:{imported:true},submitter_name:"Админ-импорт",submitter_contact:null,
        hebrew_death_label:heb,yahrzeit_date:deathDate?nextYahrzeit(deathDate,new Date(),"standard"):null,
        cemetery_record_key:null,source_verified:false,quality_status:"needs_review",urgent:false,hebrew_after_sunset:false,yahrzeit_rule:"standard"
      });
    }
    if(inserts.length){
      await sb("memorial_events",{method:"POST",body:inserts,prefer:"return=minimal"});
      created=inserts.length;
    }
    res.json({ok:true,created,skipped_duplicates:skipped,invalid});
  }catch(e){console.error("import commit",e.data||e);res.status(500).json({error:"import_failed"})}
});

app.get("/api/admin/stats", requireAdmin, async (_req,res) => {
  try{res.json(await sb("rpc/memorial_admin_stats",{method:"POST",body:{p_token:ADMIN_TOKEN}}))}
  catch(e){console.error("admin stats",e.data||e);res.status(500).json({error:"stats_failed"})}
});

function adminBroadcastText(e,mode){
  const privateKey=/^[0-9a-f-]{36}$/i.test(String(e.share_token||""))?String(e.share_token):"";
  const url=(APP_PUBLIC_URL||PUBLIC_BASE_URL||"").replace(/\/$/,"")+"/m/memorial/"+encodeURIComponent(e.id)+(e.visibility==="public"?"":privateKey?"?key="+encodeURIComponent(privateKey):"");
  const when=[e.event_date,e.event_time].filter(Boolean).join(" ");
  const where=[e.place,e.city].filter(Boolean).join(" · ");
  const current=[e.full_name,when,where].filter(Boolean).join(" · ");
  if(mode==="correction")return {title:"Исправление уведомления — "+(e.event_type||"Памятная дата"),body:"Предыдущее сообщение было отправлено ошибочно. Актуальная информация: "+current,url};
  if(mode==="update")return {title:"Изменение события — "+(e.event_type||"Памятная дата"),body:current,url};
  return {title:"Напоминание — "+(e.event_type||"Памятная дата"),body:current,url};
}
async function deliverAdminBroadcast(target,e,text,marker){
  const item={...target,event_id:e.id,reminder_days:marker,timezone:target.timezone||"UTC",notification_revision:e.notification_revision||0};
  await ensureInboxItem(item,text);
  let sent=0,failed=0;
  const run=async(channel,fn)=>{
    try{const result=await fn();if(result){sent++;await logAttempt(item,channel,true,result);await logDelivery(item,channel,result)}}
    catch(err){failed++;await logAttempt(item,channel,false,err.message||String(err))}
  };
  if(target.push_enabled&&target.endpoint)await run("push",async()=>{
    if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error("push_not_configured");
    await webpush.sendNotification({endpoint:target.endpoint,keys:{p256dh:target.p256dh,auth:target.auth}},JSON.stringify({title:text.title,body:text.body,url:text.url,event_id:e.id}),{TTL:86400});return "sent";
  });
  if(target.email_enabled&&target.email)await run("email",()=>sendEmailAddress(target.email,text));
  if(target.telegram_enabled&&target.telegram_chat_id)await run("telegram",()=>telegramSend(target.telegram_chat_id,text.title+"\n"+text.body+"\n"+text.url));
  if(target.whatsapp_enabled&&target.whatsapp_phone)await run("whatsapp",()=>whatsappSend(target.whatsapp_phone,text));
  if(target.sms_enabled&&target.sms_phone)await run("sms",()=>smsSend(target.sms_phone,text));
  return {sent,failed};
}

app.get("/api/admin/system-status", requireAdmin, async (_req,res)=>{
  try{
    const [db,failed,snapshots,events]=await Promise.all([
      sb("rpc/memorial_selftest",{method:"POST",body:{}}).catch(e=>({ok:false,error:e.message})),
      sb("rpc/memorial_admin_failed_targets",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:300}}).catch(()=>[]),
      sb("rpc/memorial_admin_snapshots_list",{method:"POST",body:{p_token:ADMIN_TOKEN}}).catch(()=>[]),
      sb("rpc/memorial_admin_events_list",{method:"POST",body:{p_token:ADMIN_TOKEN,p_status:"all",p_query:"",p_limit:1}}).catch(()=>({counts:{}}))
    ]);
    const p=reminderProviderStatus(),warnings=[];
    if(!db?.ok)warnings.push("База данных не прошла самопроверку");
    if(!p.push)warnings.push("Push не настроен");
    if(!p.email)warnings.push("Email не настроен");
    if(!p.telegram)warnings.push("Telegram не настроен");
    if(!p.whatsapp)warnings.push("WhatsApp не настроен");
    if(!p.sms)warnings.push("SMS не настроен");
    if((failed||[]).length)warnings.push("Есть неудачные отправки: "+failed.length);
    if(!(snapshots||[]).length)warnings.push("Нет внутренних снимков базы");
    res.json({
      ok:Boolean(db?.ok),database:db,providers:p,
      offsite_backup:Boolean(BACKUP_WEBHOOK_URL&&BACKUP_WEBHOOK_TOKEN),
      failed_notifications:(failed||[]).length,
      last_snapshot:(snapshots||[])[0]||null,
      event_counts:events?.counts||{},
      uptime_seconds:Math.round(process.uptime()),warnings
    });
  }catch(e){res.status(500).json({error:"system_status_failed"})}
});

app.post("/api/admin/drafts", requireAdminRole, async (req,res)=>{
  try{
    const b=req.body||{},name=clean(b.full_name,180);
    if(!name)return res.status(400).json({error:"full_name_required"});
    let publishAt=null;
    if(b.publish_at){
      const d=new Date(String(b.publish_at));if(!Number.isFinite(d.getTime()))return res.status(400).json({error:"bad_publish_at"});
      publishAt=d.toISOString();
    }
    const data=await sb("rpc/memorial_admin_create_draft",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_full_name:name,p_death_date:validDate(b.death_date)?b.death_date:null,
      p_event_type:clean(b.event_type,80)||"Памятная дата",p_event_date:validDate(b.event_date)?b.event_date:null,
      p_event_time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.event_time||""))?b.event_time:null,
      p_city:clean(b.city,120)||null,p_place:clean(b.place,180)||null,p_note:clean(b.note,1500)||null,
      p_visibility:["public","link","invited"].includes(b.visibility)?b.visibility:"public",p_publish_at:publishAt
    }});
    res.status(201).json(data);
  }catch(e){console.error("draft create",e.data||e);res.status(500).json({error:"draft_create_failed"})}
});

app.get("/api/admin/snapshots", requireAdmin, async (_req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_snapshots_list",{method:"POST",body:{p_token:ADMIN_TOKEN}})||[])}
  catch(e){res.status(500).json({error:"snapshots_failed"})}
});
app.post("/api/admin/snapshots", requireOwner, async (req,res)=>{
  try{
    const date=validDate(req.body?.date)?req.body.date:new Date().toISOString().slice(0,10);
    res.json(await sb("rpc/memorial_admin_snapshot_create",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:date}}));
  }catch(e){res.status(500).json({error:"snapshot_create_failed"})}
});
app.post("/api/admin/snapshots/:date/restore", requireOwner, async (req,res)=>{
  try{
    if(req.body?.confirm!=="RESTORE")return res.status(400).json({error:"confirm_restore_required"});
    res.json(await sb("rpc/memorial_admin_snapshot_restore",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:req.params.date,p_confirm:"RESTORE"}}));
  }catch(e){console.error("snapshot restore",e.data||e);res.status(500).json({error:"snapshot_restore_failed"})}
});

app.get("/api/admin/privacy-requests", requireAdmin, async (_req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_privacy_requests",{method:"POST",body:{p_token:ADMIN_TOKEN}})||[])}
  catch(e){res.status(500).json({error:"privacy_requests_failed"})}
});
app.post("/api/admin/privacy-requests/:id/:action", requireAdminRole, async (req,res)=>{
  try{
    const act=["approve","reject"].includes(req.params.action)?req.params.action:null;
    if(!act)return res.status(400).json({error:"bad_action"});
    res.json(await sb("rpc/memorial_admin_privacy_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_request_id:req.params.id,p_action:act}}));
  }catch(e){res.status(500).json({error:"privacy_action_failed"})}
});
app.post("/api/admin/events/:eventId/redact-personal", requireAdminRole, async (req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_redact_personal_data",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}))}
  catch(e){res.status(500).json({error:"redact_failed"})}
});

app.get("/api/admin/notification-groups", requireAdmin, async (_req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_groups_list",{method:"POST",body:{p_token:ADMIN_TOKEN}}))}
  catch(e){res.status(500).json({error:"groups_failed"})}
});
app.post("/api/admin/notification-groups", requireAdminRole, async (req,res)=>{
  try{
    const slug=clean(req.body?.slug,64).toLowerCase(),name=clean(req.body?.name,120);
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)||!name)return res.status(400).json({error:"bad_group"});
    res.json(await sb("rpc/memorial_admin_group_upsert",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_slug:slug,p_name:name,p_description:clean(req.body?.description,500)||null,p_active:req.body?.active!==false
    }}));
  }catch(e){res.status(500).json({error:"group_update_failed"})}
});

app.get("/api/admin/events/:eventId/rsvp", requireAdmin, async (req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_rsvp_summary",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}))}
  catch(e){res.status(500).json({error:"rsvp_failed"})}
});
app.get("/api/admin/events/:eventId/broadcast-preview", requireAdmin, async (req,res)=>{
  try{
    const groups=String(req.query.groups||"").split(",").map(x=>clean(x,64).toLowerCase()).filter(x=>/^[a-z0-9][a-z0-9-]{0,63}$/.test(x)).slice(0,30);
    const rawMode=String(req.query.mode||"update");
    const mode=["announcement","update","correction"].includes(rawMode)?rawMode:"update";
    const onlyPrevious=String(req.query.only_previous??(mode==="announcement"?"0":"1"))!=="0";
    const d=await sb("rpc/memorial_admin_broadcast_preview",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_event_id:req.params.eventId,p_groups:groups.length?groups:null,p_only_previously_reached:onlyPrevious
    }});
    const e=d?.event||{};res.json({...d,mode,only_previous:onlyPrevious,message:adminBroadcastText(e,mode)});
  }catch(e){res.status(500).json({error:"broadcast_preview_failed"})}
});
app.post("/api/admin/events/:eventId/broadcast", requireAdminRole, async (req,res)=>{
  try{
    const rawMode=clean(req.body?.mode,20);
    const mode=["announcement","update","correction"].includes(rawMode)?rawMode:"update";
    const groups=(Array.isArray(req.body?.groups)?req.body.groups:[]).map(x=>clean(x,64).toLowerCase()).filter(x=>/^[a-z0-9][a-z0-9-]{0,63}$/.test(x)).slice(0,30);
    const onlyPrevious=req.body?.only_previous===undefined?(mode!=="announcement"):Boolean(req.body.only_previous);
    const d=await sb("rpc/memorial_admin_broadcast_targets",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_event_id:req.params.eventId,p_groups:groups.length?groups:null,p_only_previously_reached:onlyPrevious
    }});
    const e=d?.event||{},targets=d?.targets||[],text=adminBroadcastText(e,mode);
    const confirmCount=Number(req.body?.confirm_count);
    if(!Number.isFinite(confirmCount)||confirmCount!==targets.length)return res.status(409).json({error:"confirm_count_mismatch",expected:targets.length});
    const rev=Math.max(0,Number(e.notification_revision||0)),marker=(mode==="update"?-1000:mode==="correction"?-3000:-2000)-rev;
    let sent=0,failed=0;
    for(const target of targets){const x=await deliverAdminBroadcast(target,e,text,marker);sent+=x.sent;failed+=x.failed}
    res.json({ok:true,subscriptions:targets.length,sent,failed,groups:d?.groups||groups,mode,only_previous:onlyPrevious});
  }catch(e){console.error("admin broadcast",e.data||e);res.status(500).json({error:"broadcast_failed"})}
});

app.post("/api/admin/events/:eventId/test-broadcast", requireAdminRole, async (req,res)=>{
  try{
    const email=clean(req.adminIdentity?.email,180).toLowerCase();
    if(!validReminderEmail(email))return res.status(400).json({error:"admin_email_required"});
    const d=await sb("rpc/memorial_admin_event_detail",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}});
    const e=d?.event;if(!e)return res.status(404).json({error:"not_found"});
    const mode=req.body?.mode==="update"?"update":"announcement",text=adminBroadcastText(e,mode);
    text.title="[ТЕСТ] "+text.title;
    await sendEmailAddress(email,text);
    res.json({ok:true,channel:"email",to:email});
  }catch(e){console.error("test broadcast",e.data||e);res.status(500).json({error:"test_broadcast_failed"})}
});

app.get("/api/admin/notifications/failed", requireAdmin, async (req,res)=>{
  try{
    const limit=Math.max(1,Math.min(Number(req.query.limit||100),300));
    res.json(await sb("rpc/memorial_admin_failed_targets",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:limit}})||[]);
  }catch(e){res.status(500).json({error:"failed_targets_failed"})}
});
app.post("/api/admin/notifications/retry-failed", requireAdminRole, async (req,res)=>{
  try{
    const limit=Math.max(1,Math.min(Number(req.body?.limit||100),300));
    const rows=await sb("rpc/memorial_admin_failed_targets",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:limit}})||[];
    let sent=0,failed=0;
    for(const t of rows){
      const item={...t,timezone:t.timezone||"UTC"};
      const text=notificationText(item);
      const run=async(fn)=>{
        try{const result=await fn();if(result){sent++;await logAttempt(item,t.channel,true,"retry:"+result);await logDelivery(item,t.channel,result)}}
        catch(err){failed++;await logAttempt(item,t.channel,false,"retry:"+String(err.message||err))}
      };
      if(t.channel==="push"&&t.endpoint)await run(async()=>{
        if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error("push_not_configured");
        await webpush.sendNotification({endpoint:t.endpoint,keys:{p256dh:t.p256dh,auth:t.auth}},JSON.stringify({title:text.title,body:text.body,url:text.url,event_id:t.event_id}),{TTL:86400});return"sent";
      });
      else if(t.channel==="email"&&t.email)await run(()=>sendEmailAddress(t.email,text));
      else if(t.channel==="telegram"&&t.telegram_chat_id)await run(()=>telegramSend(t.telegram_chat_id,text.title+"\n"+text.body+"\n"+text.url));
      else if(t.channel==="whatsapp"&&t.whatsapp_phone)await run(()=>whatsappSend(t.whatsapp_phone,text));
      else if(t.channel==="sms"&&t.sms_phone)await run(()=>smsSend(t.sms_phone,text));
      else failed++;
    }
    res.json({ok:true,targets:rows.length,sent,failed});
  }catch(e){console.error("retry failed",e.data||e);res.status(500).json({error:"retry_failed"})}
});

app.post("/api/admin/events/draft", requireAdminRole, async (req,res)=>{
  try{
    const p=req.body||{},fullName=clean(p.full_name,180),deathDate=clean(p.death_date,10),eventDate=clean(p.event_date,10);
    if(!fullName)return res.status(400).json({error:"full_name_required"});
    if(deathDate&&!validDate(deathDate))return res.status(400).json({error:"bad_death_date"});
    if(eventDate&&!validDate(eventDate))return res.status(400).json({error:"bad_event_date"});
    let publishAt=null;
    if(p.publish_at){const dt=new Date(p.publish_at);if(Number.isNaN(dt.getTime()))return res.status(400).json({error:"bad_publish_at"});publishAt=dt.toISOString()}
    const data=await sb("rpc/memorial_admin_create_draft",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_full_name:fullName,p_death_date:deathDate||null,p_event_type:clean(p.event_type,80)||"Памятная дата",
      p_event_date:eventDate||null,p_event_time:clean(p.event_time,20)||null,p_city:clean(p.city,120)||null,p_place:clean(p.place,180)||null,
      p_note:clean(p.note,1500)||null,p_visibility:["public","link","invited"].includes(p.visibility)?p.visibility:"public",p_publish_at:publishAt
    }});
    res.status(201).json(data);
  }catch(e){console.error("admin draft",e.data||e);res.status(500).json({error:"draft_failed"})}
});

app.post("/api/admin/events/:eventId/redact-personal", requireAdminRole, async (req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_redact_personal_data",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}}))}
  catch(e){console.error("redact personal",e.data||e);res.status(500).json({error:"redact_failed"})}
});

app.get("/api/admin/system-status", requireAdmin, async (_req,res)=>{
  try{
    const [events,log,snapshots]=await Promise.all([
      sb("rpc/memorial_event_search",{method:"POST",body:{p_query:"",p_city:"",p_type:"",p_limit:1}}),
      sb("rpc/memorial_admin_notification_log",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:20}}),
      sb("rpc/memorial_admin_snapshots_list",{method:"POST",body:{p_token:ADMIN_TOKEN}})
    ]);
    const attempts=log?.attempts||[],deliveries=log?.deliveries||[];
    res.json({
      ok:true,database:Array.isArray(events)?"ok":"error",
      providers:reminderProviderStatus(),
      offsite_backup:Boolean(BACKUP_WEBHOOK_URL&&BACKUP_WEBHOOK_TOKEN),
      last_delivery:deliveries[0]||null,
      last_failure:attempts.find(x=>x.success===false)||null,
      latest_snapshot:(snapshots||[])[0]||null
    });
  }catch(e){res.status(503).json({ok:false,database:"error",error:"system_status_failed"})}
});

app.post("/api/admin/test-notification", requireAdminRole, rateLimit("admin-test-notification",20,60*60*1000), async (req,res)=>{
  try{
    const channel=clean(req.body?.channel,20),destination=clean(req.body?.destination,180);
    const text={title:"Память — тест администратора",body:"Тестовое сообщение перед общей рассылкой.",url:(APP_PUBLIC_URL||PUBLIC_BASE_URL||"").replace(/\/$/,"")+"/m"};
    if(channel==="email"){
      const address=destination||req.adminIdentity?.email||"";
      if(!validReminderEmail(address))return res.status(400).json({error:"valid_email_required"});
      await sendEmailAddress(address,text);
    }else if(channel==="telegram"){
      if(!validTelegramChat(destination))return res.status(400).json({error:"telegram_chat_id_required"});
      await telegramSend(destination,text.title+"\n"+text.body+"\n"+text.url);
    }else if(channel==="whatsapp"){
      const phone=normalizePhone(destination);if(!validE164(phone))return res.status(400).json({error:"whatsapp_phone_e164_required"});
      await whatsappSend(phone,text);
    }else if(channel==="sms"){
      const phone=normalizePhone(destination);if(!validE164(phone))return res.status(400).json({error:"sms_phone_e164_required"});
      await smsSend(phone,text);
    }else return res.status(400).json({error:"unsupported_test_channel"});
    res.json({ok:true,channel});
  }catch(e){res.status(502).json({error:e.message||"test_failed"})}
});

app.post("/api/admin/notifications/retry-failed", requireAdminRole, async (_req,res)=>{
  try{
    const rows=await sb("rpc/memorial_admin_failed_targets",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:120}});
    let sent=0,failed=0;
    for(const t of rows||[]){
      const text={
        title:"Повторная отправка — "+(t.event_type||"Памятная дата"),
        body:[t.full_name,t.event_date,t.event_time,t.place,t.city].filter(Boolean).join(" · "),
        url:(APP_PUBLIC_URL||PUBLIC_BASE_URL||"").replace(/\/$/,"")+"/m/memorial/"+encodeURIComponent(t.event_id)+(t.share_token?"?key="+encodeURIComponent(t.share_token):"")
      };
      const item={...t,reminder_days:Number(t.reminder_days||0)};
      try{
        if(t.channel==="push"){
          if(!t.endpoint||!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error("push_not_configured");
          await webpush.sendNotification({endpoint:t.endpoint,keys:{p256dh:t.p256dh,auth:t.auth}},JSON.stringify({title:text.title,body:text.body,url:text.url,event_id:t.event_id}),{TTL:86400});
        }else if(t.channel==="email")await sendEmailAddress(t.email,text);
        else if(t.channel==="telegram")await telegramSend(t.telegram_chat_id,text.title+"\n"+text.body+"\n"+text.url);
        else if(t.channel==="whatsapp")await whatsappSend(t.whatsapp_phone,text);
        else if(t.channel==="sms")await smsSend(t.sms_phone,text);
        else throw new Error("bad_channel");
        await logAttempt(item,t.channel,true,"retry_sent");await logDelivery(item,t.channel,"retry_sent");sent++;
      }catch(e){await logAttempt(item,t.channel,false,"retry: "+(e.message||String(e)));failed++}
    }
    res.json({ok:true,targets:(rows||[]).length,sent,failed});
  }catch(e){console.error("retry failed",e.data||e);res.status(500).json({error:"retry_failed"})}
});

app.get("/api/admin/snapshots", requireAdmin, async (_req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_snapshots_list",{method:"POST",body:{p_token:ADMIN_TOKEN}})||[])}
  catch(e){res.status(500).json({error:"snapshots_failed"})}
});
app.post("/api/admin/snapshots", requireOwner, async (_req,res)=>{
  try{res.json(await sb("rpc/memorial_admin_snapshot_create",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:new Date().toISOString().slice(0,10)}}))}
  catch(e){res.status(500).json({error:"snapshot_failed"})}
});
app.post("/api/admin/snapshots/:date/restore", requireOwner, async (req,res)=>{
  try{
    const date=clean(req.params.date,10);if(!validDate(date))return res.status(400).json({error:"bad_date"});
    res.json(await sb("rpc/memorial_admin_snapshot_restore",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:date,p_confirm:String(req.body?.confirm||"")}}));
  }catch(e){res.status(400).json({error:"snapshot_restore_failed"})}
});

app.get("/api/admin/notifications", requireAdmin, async (req,res) => {
  try{
    const limit=Math.max(1,Math.min(Number(req.query.limit||100),500));
    res.json(await sb("rpc/memorial_admin_notification_log",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:limit}}));
  }catch(e){console.error("admin notification log",e.data||e);res.status(500).json({error:"notification_log_failed"})}
});

app.post("/api/admin/events/group/:action", requireAdmin, async (req,res) => {
  try{
    const ids=(Array.isArray(req.body?.ids)?req.body.ids:[]).filter(x=>/^[0-9a-f-]{36}$/i.test(String(x))).slice(0,50);
    if(!ids.length)return res.status(400).json({error:"ids_required"});
    const action=clean(req.params.action,20);
    const data=await sb("rpc/memorial_admin_group_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_ids:ids,p_action:action}});
    res.json(data);
  }catch(e){console.error("admin group action",e.data||e);res.status(400).json({error:"group_action_failed"})}
});

app.get("/api/admin/events/list", requireAdmin, async (req,res) => {
  try {
    const data=await sb("rpc/memorial_admin_events_list",{
      method:"POST",
      body:{
        p_token:ADMIN_TOKEN,
        p_status:clean(req.query.status,20)||"all",
        p_query:clean(req.query.q,180),
        p_limit:Math.max(1,Math.min(Number(req.query.limit||200),500))
      }
    });
    res.json(data||{rows:[],counts:{all:0,pending:0,approved:0,rejected:0,hidden:0}});
  } catch(e) {
    console.error("admin event list",e.data||e);
    res.status(500).json({error:"admin_list_failed"});
  }
});

app.get("/api/admin/events/:eventId/details", requireAdmin, async (req,res) => {
  try {
    const data=await sb("rpc/memorial_admin_event_detail",{
      method:"POST",
      body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}
    });
    if(!data)return res.status(404).json({error:"not_found"});
    res.json(data);
  } catch(e) {
    console.error("admin event detail",e.data||e);
    res.status(500).json({error:"admin_detail_failed"});
  }
});

app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_extended_queue", { method: "POST", body: { p_token: ADMIN_TOKEN } });
    const base = data.base || {};
    res.json({ ...base, corrections: data.corrections || [] });
  } catch (e) {
    console.error("admin queue", e.data || e);
    res.status(500).json({ error: "admin_failed" });
  }
});
app.post("/api/admin/events/:eventId/delete-person", requireAdminRole, async (req,res) => {
  try{
    const data=await sb("rpc/memorial_admin_trash_person",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}});
    res.json(data);
  }catch(e){
    console.error("admin trash person",e.data||e);
    res.status(400).json({error:"trash_person_failed"});
  }
});

app.post("/api/admin/events/:eventId/:action", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_event_action", { method: "POST", body: { p_token: ADMIN_TOKEN, p_event_id: req.params.eventId, p_action: req.params.action } });
    res.json(data);
  } catch { res.status(400).json({ error: "admin_failed" }); }
});
app.post("/api/admin/comments/:commentId/approve", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_comment_approve", { method: "POST", body: { p_token: ADMIN_TOKEN, p_comment_id: req.params.commentId } });
    res.json(data);
  } catch { res.status(400).json({ error: "admin_failed" }); }
});
app.post("/api/admin/claims/:claimId/approve", requireAdmin, async (req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_claim_approve", { method: "POST", body: { p_token: ADMIN_TOKEN, p_claim_id: req.params.claimId } });
    res.json(data);
  } catch { res.status(400).json({ error: "admin_failed" }); }
});
app.post("/api/admin/family/:kind/:id/:action", requireAdmin, async (req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_family_action",{method:"POST",body:{p_token:ADMIN_TOKEN,p_kind:req.params.kind,p_id:req.params.id,p_action:req.params.action}});
    res.json({ok:Boolean(data)});
  } catch { res.status(400).json({error:"admin_failed"}); }
});
app.get("/api/admin/events/:eventId/history", requireAdmin, async (req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_history",{method:"POST",body:{p_token:ADMIN_TOKEN,p_event_id:req.params.eventId}});
    res.json(data);
  } catch { res.status(400).json({error:"history_failed"}); }
});
app.post("/api/admin/history/:historyId/rollback", requireAdminRole, async (req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_rollback",{method:"POST",body:{p_token:ADMIN_TOKEN,p_history_id:Number(req.params.historyId)}});
    res.json({ok:Boolean(data)});
  } catch { res.status(400).json({error:"rollback_failed"}); }
});
app.post("/api/admin/backup/test", requireOwner, async (_req,res)=>{
  try{const r=await sendOffsiteBackup();res.status(r.ok?200:503).json(r)}
  catch(e){res.status(502).json({ok:false,error:e.message||"backup_failed"})}
});

app.post("/api/admin/snapshot", requireAdminRole, async (_req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_snapshot_create",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:new Date().toISOString().slice(0,10)}});
    res.json(data);
  } catch { res.status(500).json({error:"snapshot_failed"}); }
});
app.get("/api/admin/export.json", requireAdmin, async (_req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    res.setHeader("Content-Disposition",'attachment; filename="pamyat-export.json"');
    res.type("application/json").send(JSON.stringify(data,null,2));
  } catch { res.status(500).json({error:"export_failed"}); }
});
app.get("/api/admin/export.csv", requireAdmin, async (_req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
    const rows = data.events || [];
    const cols = ["id","full_name","death_date","event_type","event_date","city","place","status","family_verified","hebrew_death_label","yahrzeit_date","cemetery_record_key","created_at"];
    const csv = [cols.join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n");
    res.setHeader("Content-Disposition",'attachment; filename="pamyat-events.csv"');
    res.type("text/csv; charset=utf-8").send("\ufeff" + csv);
  } catch { res.status(500).send("export_failed"); }
});

async function sendOffsiteBackup(){
  if(!BACKUP_WEBHOOK_URL||!BACKUP_WEBHOOK_TOKEN||!ADMIN_TOKEN)return {ok:false,configured:false};
  let u;try{u=new URL(BACKUP_WEBHOOK_URL)}catch{return {ok:false,error:"bad_backup_url"}}
  if(u.protocol!=="https:")return {ok:false,error:"backup_https_required"};
  const data=await sb("rpc/memorial_admin_export",{method:"POST",body:{p_token:ADMIN_TOKEN}});
  const r=await fetch(u.toString(),{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+BACKUP_WEBHOOK_TOKEN,"x-pamyat-backup-date":new Date().toISOString().slice(0,10)},
    body:JSON.stringify(data)
  });
  if(!r.ok)throw new Error("backup_http_"+r.status);
  return {ok:true,configured:true,exported_at:data?.exported_at||new Date().toISOString()};
}

async function createDailySnapshot() {
  if (!ADMIN_TOKEN) return;
  try {
    await sb("rpc/memorial_admin_snapshot_create",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:new Date().toISOString().slice(0,10)}});
  } catch (e) { console.error("snapshot", e.data || e); }
}
let maintenanceRunning=false;
async function runMaintenanceCycle(){
  if(maintenanceRunning||!ADMIN_TOKEN)return;maintenanceRunning=true;
  try{
    const now=new Date(),year=now.getUTCFullYear();
    const [published,annual]=await Promise.all([
      sb("rpc/memorial_admin_publish_due",{method:"POST",body:{p_token:ADMIN_TOKEN,p_now:now.toISOString()}}),
      sb("rpc/memorial_admin_ensure_annual",{method:"POST",body:{p_token:ADMIN_TOKEN,p_year:year}})
    ]);
    if(Number(published||0)||Number(annual||0))console.log("maintenance",JSON.stringify({published,annual}));
  }catch(e){console.error("maintenance",e.data||e)}
  finally{maintenanceRunning=false}
}
async function configureTelegramWebhook() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !PUBLIC_BASE_URL) return;
  try {
    const u = PUBLIC_BASE_URL.replace(/\/$/,"") + "/api/telegram/webhook/" + encodeURIComponent(TELEGRAM_WEBHOOK_SECRET);
    await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook", {
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:u,drop_pending_updates:false})
    });
  } catch (e) { console.error("telegram webhook setup", e); }
}

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log("Pamyat community hub listening on " + PORT);
  // Cemetery catalog module disabled by product decision.
  setTimeout(() => runNotificationCycle(), 10000);
  setTimeout(() => createDailySnapshot(), 15000);
  setTimeout(() => runMaintenanceCycle(), 18000);
  setTimeout(() => sendOffsiteBackup().catch(e=>console.error("offsite backup",e.message)), 30000);
  setTimeout(() => configureTelegramWebhook(), 20000);
  setInterval(() => runNotificationCycle(), 30 * 60 * 1000).unref();
  setInterval(() => runMaintenanceCycle(), 30 * 60 * 1000).unref();
  setInterval(() => createDailySnapshot(), 6 * 60 * 60 * 1000).unref();
  setInterval(() => sendOffsiteBackup().catch(e=>console.error("offsite backup",e.message)), 24 * 60 * 60 * 1000).unref();
  // Cemetery catalog refresh disabled.
});
