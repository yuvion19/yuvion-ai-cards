import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import webpush from "web-push";
import multer from "multer";
import QRCode from "qrcode";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const identifyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 900000 }, fileFilter: (_req,file,cb)=>cb(null,/^image\//.test(file.mimetype)) });

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
    "default-src 'self'; img-src 'self' data: https://api.qrserver.com https://*.tile.openstreetmap.org; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
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
    p.startsWith("/qr/cemetery/") ||
    p==="/m/catalog" ||
    p==="/m/map" ||
    p.startsWith("/m/person/") ||
    p==="/m/route" ||
    p==="/m/identify" ||
    p.startsWith("/m/identify/") ||
    p==="/m/offline";
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
function isMobileUA(req) {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(String(req.headers["user-agent"] || ""));
}
function mobileShell(title, body, opts = {}) {
  const extraHead = opts.extraHead || "";
  const scripts = opts.scripts || "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#4c3e2d"><title>${htmlEsc(title)} — Память Джуури</title>${extraHead}<style>
  :root{--bg:#f5f1e8;--paper:#fffdf8;--ink:#27231e;--muted:#746d63;--line:#ded6c8;--accent:#5b4934;--soft:#eee6d9}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{position:sticky;top:0;z-index:9;background:#f5f1e8ee;border-bottom:1px solid var(--line);padding:10px 12px}.top{max-width:760px;margin:auto;display:flex;align-items:center;gap:8px}.brand{font-weight:800;flex:1}.wrap{max-width:760px;margin:auto;padding:14px 12px 60px}.nav{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0 16px}.btn,a.btn,button.btn{display:block;text-align:center;text-decoration:none;border:0;border-radius:12px;padding:12px;background:var(--accent);color:white;font-weight:750}.btn.secondary,a.btn.secondary{background:var(--soft);color:var(--ink)}.card{background:var(--paper);border:1px solid var(--line);border-radius:15px;padding:14px;margin:10px 0}.field{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:white;font:inherit}label{display:block;font-weight:700;margin:12px 0 5px}.muted{color:var(--muted);font-size:14px}.ok{background:#e4efe5;border-radius:12px;padding:12px}.err{background:#f5e2e2;border-radius:12px;padding:12px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{display:inline-block;background:var(--soft);border-radius:999px;padding:4px 7px;font-size:12px}.pager{display:flex;justify-content:space-between;gap:8px;margin:14px 0}.pager a{flex:1}.check{display:flex;gap:8px;align-items:flex-start;margin:8px 0}.check input{margin-top:4px}h1{font-size:28px;line-height:1.1;margin:6px 0 12px}#mobileMap{height:68vh;min-height:440px;border:1px solid var(--line);border-radius:14px;background:#ddd}
  </style></head><body><header><div class="top"><div class="brand">Память Джуури</div><a class="btn secondary" href="/m">Меню</a></div></header><main class="wrap">${body}</main>${scripts}</body></html>`;
}

app.get("/m", (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.send(mobileShell("Главная", `
    <h1>Мобильная версия</h1>
    <p class="muted">Простая версия без большого интерфейса. Критические функции работают отдельными страницами.</p>
    <div class="nav">
      <a class="btn" href="/m/add">+ Добавить событие</a>
      <a class="btn" href="/m/calendar">Календарь</a>
      <a class="btn" href="/m/family">Родословная</a>
      <a class="btn" href="/api/selftest">Проверка системы</a>
    </div>
    <a class="btn secondary" href="/pamyat-juhuro?desktop=1">Открыть полную версию</a>
  `));
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

app.get("/m/calendar", async (_req,res) => {
  try {
    const rows=await sb("rpc/memorial_public_upcoming",{method:"POST",body:{p_days:60,p_limit:200}});
    const cards=(rows||[]).map(e=>`<div class="card"><span class="tag">${htmlEsc(e.event_type)}</span><h3>${htmlEsc(e.full_name)}</h3><div>${htmlEsc(e.event_date||"")}</div><div class="muted">${htmlEsc([e.city,e.place].filter(Boolean).join(" · "))}</div></div>`).join("");
    res.send(mobileShell("Календарь",`<h1>Ближайшие памятные даты</h1>${cards||'<div class="card">Ближайших событий нет.</div>'}`));
  } catch(e) {
    res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось загрузить календарь.</div>'));
  }
});

app.get("/m/add", async (_req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.send(mobileShell("Добавить событие", `
    <h1>Добавить событие</h1>
    <form method="post" action="/m/add">
      <label>ФИО *</label><input class="field" name="full_name" required>
      <label>Дата смерти *</label><input class="field" type="date" name="death_date" required>
      <div class="check"><input type="checkbox" name="publish_day7" value="1" checked><span>7 дней</span></div>
      <div class="check"><input type="checkbox" name="publish_day40" value="1" checked><span>40 дней</span></div>
      <div class="check"><input type="checkbox" name="publish_year1" value="1" checked><span>1 год</span></div>
      <div class="check"><input type="checkbox" name="publish_annual" value="1" checked><span>Годовщина</span></div>
      <div class="check"><input type="checkbox" name="publish_yahrzeit" value="1" checked><span>Йорцайт</span></div>
      <label>Город</label><input class="field" name="city">
      <label>Место</label><input class="field" name="place">
      <label>Комментарий</label><textarea class="field" name="note" rows="4"></textarea>
      <label>Ваше имя</label><input class="field" name="submitter_name">
      <label>Контакт модератору (не публикуется)</label><input class="field" name="submitter_contact">
      <div class="check"><input type="checkbox" name="relation_confirmed" value="1" required><span>У меня есть право или согласие семьи на публикацию.</span></div>
      <button class="btn" style="width:100%;margin-top:12px">Отправить на модерацию</button>
    </form>
  `));
});

app.post("/m/add", rateLimit("mobile-events",5,15*60*1000), async (req,res) => {
  try {
    const b=req.body||{};
    const fullName=clean(b.full_name,180), deathDate=clean(b.death_date,10);
    if(!fullName||!validDate(deathDate)||!b.relation_confirmed) {
      return res.status(400).send(mobileShell("Ошибка",'<div class="err">Заполните ФИО, дату смерти и согласие семьи.</div><p><a class="btn" href="/m/add">Вернуться</a></p>'));
    }
    const yahrzeit=nextYahrzeit(deathDate);
    const base={
      full_name:fullName,death_date:deathDate,event_time:null,city:clean(b.city,120)||null,place:clean(b.place,180)||null,
      cemetery_link:null,cemetery_record_key:null,note:clean(b.note,1500)||null,visibility:"public",status:"pending",relation_confirmed:true,
      publish_day7:Boolean(b.publish_day7),publish_day40:Boolean(b.publish_day40),publish_year1:Boolean(b.publish_year1),
      publish_annual:Boolean(b.publish_annual),hebrew_death_label:hebrewLabel(deathDate),yahrzeit_date:yahrzeit,
      derived:{...derivedDates(deathDate),yahrzeit},submitter_name:clean(b.submitter_name,120)||null,submitter_contact:clean(b.submitter_contact,180)||null
    };
    const planned=[];
    if(base.publish_day7)planned.push(["7 дней",addDays(deathDate,7)]);
    if(base.publish_day40)planned.push(["40 дней",addDays(deathDate,40)]);
    if(base.publish_year1)planned.push(["1 год",addYear(deathDate)]);
    if(base.publish_annual)planned.push(["Годовщина",addYear(deathDate)]);
    if(b.publish_yahrzeit&&yahrzeit)planned.push(["Йорцайт",yahrzeit]);
    if(!planned.length)planned.push(["Памятная дата",deathDate]);
    const rows=planned.map(([event_type,event_date])=>({id:id(),...base,event_type,event_date}));
    await sb("memorial_events",{method:"POST",body:rows,prefer:"return=minimal"});
    res.status(201).send(mobileShell("Отправлено",`<div class="ok"><b>Готово.</b><br>На модерацию отправлено событий: ${rows.length}. До одобрения они не видны публично.</div><div class="nav"><a class="btn" href="/m">Главная</a><a class="btn secondary" href="/m/add">Добавить ещё</a></div>`));
  } catch(e) {
    console.error("mobile add",e.data||e);
    res.status(500).send(mobileShell("Ошибка",'<div class="err">Не удалось сохранить событие. Попробуйте ещё раз.</div><p><a class="btn" href="/m/add">Вернуться</a></p>'));
  }
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
    res.status(ok?200:503).json({ok,db,mobile_routes:["/m","/m/add","/m/calendar","/m/family"],release:"memory-hub-no-cemetery"});
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
    const e=await sb("rpc/memorial_public_event_detail",{method:"POST",body:{p_event_id:req.params.id}});
    if(!e)return res.status(404).send("Not found");
    const base=(PUBLIC_BASE_URL||"").replace(/\/$/,"");
    const svg=await QRCode.toString(base+"/pamyat-juhuro#event="+encodeURIComponent(req.params.id),{type:"svg",margin:1,width:360});
    res.type("image/svg+xml").setHeader("Cache-Control","public,max-age=86400").send(svg);
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
app.post("/api/admin/duplicates/merge", requireAdmin, async (req,res)=>{
  try{
    const data=await sb("rpc/memorial_admin_merge_events",{method:"POST",body:{
      p_token:ADMIN_TOKEN,p_keep_id:req.body?.keep_id,p_duplicate_id:req.body?.duplicate_id
    }});
    res.json(data);
  }catch(e){res.status(400).json({error:"merge_failed",detail:e.data||e.message})}
});
app.get("/api/admin/duplicates", requireAdmin, async (_req,res)=>{
  try{const data=await sb("rpc/memorial_duplicate_queue",{method:"POST",body:{p_token:ADMIN_TOKEN,p_limit:150}});res.json(data||[])}
  catch(e){res.status(500).json({error:"duplicates_failed"})}
});
app.post("/api/admin/frontend-release/:value", requireAdmin, async (req,res)=>{
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

function isAdmin(req) {
  return Boolean(ADMIN_TOKEN) && req.headers["x-admin-token"] === ADMIN_TOKEN;
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "admin_required" });
  next();
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
function nextYahrzeit(deathDate, fromDate = new Date()) {
  const target = hebrewParts(deathDate);
  if (!target) return null;
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));
  for (let i = 0; i <= 450; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const p = hebrewParts(iso);
    if (p && p.day === target.day && p.month === target.month) return iso;
  }
  return null;
}

function escIcs(v) {
  return String(v ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function toIcsDate(v) { return String(v || "").replaceAll("-", ""); }
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

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
      email_configured: Boolean(RESEND_API_KEY)
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

app.get("/api/events/:eventId", async (req, res) => {
  try {
    const data = await sb("rpc/memorial_public_event_detail", {
      method: "POST",
      body: { p_event_id: req.params.eventId }
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
    const e = await sb("rpc/memorial_public_event_detail", {
      method: "POST",
      body: { p_event_id: req.params.eventId }
    });
    if (!e || !e.event_date) return res.status(404).send("Not found");
    const d = toIcsDate(e.event_date);
    const end = toIcsDate(addDays(e.event_date, 1));
    const ics = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Pamyat//Memorial Calendar//RU","CALSCALE:GREGORIAN",
      "BEGIN:VEVENT","UID:" + e.id + "@pamyat",
      "DTSTART;VALUE=DATE:" + d,"DTEND;VALUE=DATE:" + end,
      "SUMMARY:" + escIcs(e.event_type + " — " + e.full_name),
      "LOCATION:" + escIcs(e.place || e.city || ""),
      "DESCRIPTION:" + escIcs(e.note || ""),
      "URL:" + escIcs((APP_PUBLIC_URL || "") + "/#event=" + e.id),
      "END:VEVENT","END:VCALENDAR"
    ].join("\r\n");
    res.type("text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pamyat-' + e.id + '.ics"');
    res.send(ics);
  } catch {
    res.status(500).send("Failed");
  }
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
    const fullName = clean(b.full_name, 180);
    const deathDate = clean(b.death_date, 10);
    const eventType = clean(b.event_type || "Памятная дата", 80);
    const eventDate = clean(b.event_date, 10);
    if (!fullName) return res.status(400).json({ error: "full_name_required" });
    if (!b.relation_confirmed) return res.status(400).json({ error: "consent_required" });
    if (deathDate && !validDate(deathDate)) return res.status(400).json({ error: "invalid_death_date" });
    if (eventDate && !validDate(eventDate)) return res.status(400).json({ error: "invalid_event_date" });

    const dup = await sb("rpc/memorial_duplicate_candidates", {
      method: "POST",
      body: { p_full_name: fullName, p_death_date: validDate(deathDate) ? deathDate : null }
    });
    if (Array.isArray(dup) && dup.length && !b.confirm_duplicate) {
      return res.status(409).json({ error: "possible_duplicate", matches: dup.slice(0, 5) });
    }

    const computedYahrzeit = validDate(deathDate) ? nextYahrzeit(deathDate) : null;
    const manualYahrzeit = validDate(clean(b.manual_yahrzeit_date, 10)) ? clean(b.manual_yahrzeit_date, 10) : null;
    const yahrzeit = manualYahrzeit || computedYahrzeit;

    const base = {
      full_name: fullName,
      death_date: validDate(deathDate) ? deathDate : null,
      event_time: clean(b.event_time, 20) || null,
      city: clean(b.city, 120) || null,
      place: clean(b.place, 180) || null,
      cemetery_link: clean(b.cemetery_link, 800) || null,
      cemetery_record_key: clean(b.cemetery_record_key, 100) || null,
      note: clean(b.note, 1500) || null,
      visibility: ["public","link","invited"].includes(b.visibility) ? b.visibility : "public",
      status: "pending",
      relation_confirmed: true,
      publish_day7: b.publish_day7 !== false,
      publish_day40: b.publish_day40 !== false,
      publish_year1: b.publish_year1 !== false,
      publish_annual: b.publish_annual !== false,
      hebrew_death_label: validDate(deathDate) ? hebrewLabel(deathDate) : null,
      yahrzeit_date: yahrzeit,
      derived: { ...derivedDates(deathDate), yahrzeit },
      submitter_name: clean(b.submitter_name, 120) || null,
      submitter_contact: clean(b.submitter_contact, 180) || null
    };

    const planned = [];
    if (validDate(deathDate)) {
      if (base.publish_day7) planned.push(["7 дней", addDays(deathDate, 7)]);
      if (base.publish_day40) planned.push(["40 дней", addDays(deathDate, 40)]);
      if (base.publish_year1) planned.push(["1 год", addYear(deathDate)]);
      if (base.publish_annual) planned.push(["Годовщина", addYear(deathDate)]);
      if (b.publish_yahrzeit !== false && yahrzeit) planned.push(["Йорцайт", yahrzeit]);
    }
    if (eventType && validDate(eventDate)) planned.push([eventType, eventDate]);
    if (!planned.length) return res.status(400).json({ error: "no_dates" });

    const unique = new Map();
    for (const [type, date] of planned) unique.set(type + "|" + date, [type, date]);
    const rows = [...unique.values()].map(([type, date]) => ({ id: id(), ...base, event_type: type, event_date: date }));
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
  const when = item.reminder_days === 0 ? "сегодня" : item.reminder_days === 1 ? "завтра" : "через " + item.reminder_days + " дн.";
  return { title: item.event_type + " — " + when, body: item.full_name + " · " + item.event_date + (item.place ? " · " + item.place : "") };
}
async function sendEmail(item, text) {
  if (!RESEND_API_KEY || !item.email_enabled || !item.email) return null;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [item.email], subject: text.title, html: "<p>" + text.body.replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])) + "</p><p><a href='" + APP_PUBLIC_URL + "'>Открыть календарь</a></p>" })
  });
  if (!r.ok) throw new Error("email_" + r.status);
  return "sent";
}
async function telegramSend(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  const r = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error("telegram_" + r.status);
  return "sent";
}
let notificationCycleRunning = false;
async function runNotificationCycle() {
  if (notificationCycleRunning || !ADMIN_TOKEN) return;
  notificationCycleRunning = true;
  try {
    const due = await sb("rpc/memorial_due_notifications", { method: "POST", body: { p_token: ADMIN_TOKEN, p_now: new Date().toISOString() } });
    for (const item of due || []) {
      const text = notificationText(item);
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        try {
          await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
            JSON.stringify({ title: text.title, body: text.body, url: APP_PUBLIC_URL + "/#event=" + item.event_id, event_id: item.event_id }),
            { TTL: 86400 });
          await logDelivery(item, "push", "sent");
        } catch (e) { console.error("push send", e.statusCode || e.message); }
      }
      if (item.email_enabled && item.email) {
        try { const r = await sendEmail(item,text); if (r) await logDelivery(item,"email",r); } catch (e) { console.error(e.message); }
      }
      if (item.telegram_enabled && item.telegram_chat_id) {
        try { const r = await telegramSend(item.telegram_chat_id, text.title + "\n" + text.body + "\n" + APP_PUBLIC_URL); if (r) await logDelivery(item,"telegram",r); } catch (e) { console.error(e.message); }
      }
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

app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
  try {
    const data = await sb("rpc/memorial_admin_extended_queue", { method: "POST", body: { p_token: ADMIN_TOKEN } });
    const base = data.base || {};
    res.json({ ...base, family_people: data.family_people || [], family_relations: data.family_relations || [], corrections: data.corrections || [] });
  } catch (e) {
    console.error("admin queue", e.data || e);
    res.status(500).json({ error: "admin_failed" });
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
app.post("/api/admin/history/:historyId/rollback", requireAdmin, async (req,res) => {
  try {
    const data = await sb("rpc/memorial_admin_rollback",{method:"POST",body:{p_token:ADMIN_TOKEN,p_history_id:Number(req.params.historyId)}});
    res.json({ok:Boolean(data)});
  } catch { res.status(400).json({error:"rollback_failed"}); }
});
app.post("/api/admin/snapshot", requireAdmin, async (_req,res) => {
  try {
    const data = await sb("rpc/memorial_create_daily_snapshot",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:new Date().toISOString().slice(0,10)}});
    res.json({ok:Boolean(data)});
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

async function createDailySnapshot() {
  if (!ADMIN_TOKEN) return;
  try {
    await sb("rpc/memorial_create_daily_snapshot",{method:"POST",body:{p_token:ADMIN_TOKEN,p_date:new Date().toISOString().slice(0,10)}});
  } catch (e) { console.error("snapshot", e.data || e); }
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
  setTimeout(() => configureTelegramWebhook(), 20000);
  setInterval(() => runNotificationCycle(), 30 * 60 * 1000).unref();
  setInterval(() => createDailySnapshot(), 6 * 60 * 60 * 1000).unref();
  // Cemetery catalog refresh disabled.
});
