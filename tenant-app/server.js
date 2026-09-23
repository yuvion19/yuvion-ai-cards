import express from "express";
import sharp from "sharp";
import JSZip from "jszip";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "36mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "15m" }));

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const GIGA_OAUTH = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGA_API = "https://api.giga.chat";
let tokenCache = { token: "", expiresAt: 0 };
let modelCache = { models: [], expiresAt: 0 };

const esc = (s="") => String(s).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;" }[ch]));
const compact = (s="", n=400) => String(s || "").replace(/\s+/g, " ").trim().slice(0,n);
const bytesOfB64 = (s="") => Math.floor(String(s).length * 3 / 4);
const configured = () => Boolean(String(process.env.GIGACHAT_AUTH_KEY || "").trim());

async function accessToken() {
  if (!configured()) throw new Error("GIGACHAT_AUTH_KEY_NOT_CONFIGURED");
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;
  const scope = String(process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS").trim();
  const r = await fetch(GIGA_OAUTH, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + String(process.env.GIGACHAT_AUTH_KEY).trim(),
      "RqUID": crypto.randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: new URLSearchParams({ scope }).toString()
  });
  const raw = await r.text();
  if (!r.ok) throw new Error("GIGACHAT_OAUTH_" + r.status + ":" + raw.slice(0,200));
  const data = JSON.parse(raw);
  let expiresAt = Number(data.expires_at || 0);
  if (expiresAt && expiresAt < 1e12) expiresAt *= 1000;
  tokenCache = { token: String(data.access_token), expiresAt: expiresAt || Date.now() + 29*60*1000 };
  return tokenCache.token;
}

async function giga(pathname, options={}, retry=true) {
  const token = await accessToken();
  const r = await fetch(GIGA_API + pathname, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + token, Accept: "application/json" }
  });
  if (r.status === 401 && retry) {
    tokenCache = { token:"", expiresAt:0 };
    return giga(pathname, options, false);
  }
  return r;
}

async function models() {
  if (modelCache.models.length && Date.now() < modelCache.expiresAt) return modelCache.models;
  const r = await giga("/v1/models");
  const raw = await r.text();
  if (!r.ok) throw new Error("GIGACHAT_MODELS_" + r.status);
  const data = JSON.parse(raw);
  const list = (data.data || []).map(x => String(x.id || "")).filter(Boolean);
  modelCache = { models:list, expiresAt:Date.now()+10*60*1000 };
  return list;
}

async function chooseModel() {
  const list = await models();
  const preferred = [
    String(process.env.GIGACHAT_MODEL_TEXT || "").trim(),
    "GigaChat-3-Ultra","GigaChat-2-Max","GigaChat-2-Pro","GigaChat-2","GigaChat"
  ].filter(Boolean);
  return preferred.find(x => list.includes(x)) || list[0];
}

async function complete(messages, opts={}) {
  const model = opts.model || await chooseModel();
  const r = await giga("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(opts.temperature ?? 0.15),
      max_tokens: Number(opts.maxTokens || 2200),
      stream: false,
      update_interval: 0
    })
  });
  const raw = await r.text();
  if (!r.ok) throw new Error("GIGACHAT_COMPLETION_" + r.status + ":" + raw.slice(0,250));
  const data = JSON.parse(raw);
  return { model, content: String(data?.choices?.[0]?.message?.content || "") };
}

async function uploadToGiga(buffer, mimeType, index) {
  let prepared = buffer;
  let type = mimeType;
  let ext = mimeType === "image/png" ? "png" : "jpg";
  if (!["image/jpeg","image/png"].includes(mimeType)) {
    prepared = await sharp(buffer).rotate().jpeg({quality:90}).toBuffer();
    type = "image/jpeg"; ext = "jpg";
  }
  const form = new FormData();
  form.append("file", new Blob([prepared], {type}), "yuvion-" + Date.now() + "-" + index + "." + ext);
  form.append("purpose", "general");
  const r = await giga("/v1/files", { method:"POST", body:form });
  const raw = await r.text();
  if (!r.ok) throw new Error("GIGACHAT_UPLOAD_" + r.status + ":" + raw.slice(0,200));
  const data = JSON.parse(raw);
  if (!data.id) throw new Error("GIGACHAT_UPLOAD_NO_ID");
  return String(data.id);
}

async function deleteGigaFile(id) {
  if (!id) return;
  try { await giga("/v1/files/" + encodeURIComponent(id) + "/delete", { method:"POST" }); } catch {}
}

function parseJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(raw.slice(a,b+1));
  throw new Error("AI_JSON_PARSE");
}

function normalizeCard(raw={}) {
  const characteristics = Array.isArray(raw.characteristics) ? raw.characteristics : [];
  const benefits = Array.isArray(raw.benefits) ? raw.benefits : [];
  return {
    title: compact(raw.title || raw.seoTitle || "Товар", 120),
    category: compact(raw.category || "Товар", 80),
    shortDescription: compact(raw.shortDescription || "", 500),
    description: compact(raw.description || raw.fullDescription || raw.shortDescription || "", 1500),
    characteristics: characteristics.slice(0,10).map(x => ({
      name: compact(x?.name || "",70),
      value: compact(x?.value || "",120)
    })).filter(x=>x.name && x.value),
    benefits: benefits.slice(0,6).map(x=>compact(x,100)).filter(Boolean),
    usage: Array.isArray(raw.usage) ? raw.usage.slice(0,4).map(x=>compact(x,100)).filter(Boolean) : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0,24).map(x=>compact(x,60)).filter(Boolean) : []
  };
}

app.get("/api/health", async (_req,res) => {
  const out = { ok:true, service:"Yuvion Tenant AI", gigaChatConfigured:configured(), format:"900x1200" };
  if (configured()) {
    try { out.model = await chooseModel(); out.gigaChat = "connected"; }
    catch { out.gigaChat = "error"; }
  } else out.gigaChat = "not_configured";
  res.json(out);
});

app.post("/api/analyze", async (req,res) => {
  const ids = [];
  try {
    const { image, mimeType, additionalImages=[], extraData={} } = req.body || {};
    if (typeof image !== "string" || !ALLOWED.has(String(mimeType))) return res.status(400).json({error:"Добавьте фотографию JPG, PNG или WebP."});
    if (bytesOfB64(image) > MAX_IMAGE_BYTES) return res.status(413).json({error:"Фото должно быть меньше 10 МБ."});
    const sources = [{image,mimeType}, ...additionalImages.slice(0,4)];
    for (const s of sources) {
      if (!s || typeof s.image !== "string" || !ALLOWED.has(String(s.mimeType))) continue;
      if (bytesOfB64(s.image) > MAX_IMAGE_BYTES) continue;
      ids.push(await uploadToGiga(Buffer.from(s.image,"base64"), s.mimeType, ids.length));
    }

    const facts = {
      name: compact(extraData.name || "",120),
      brand: compact(extraData.brand || "",80),
      article: compact(extraData.article || "",80),
      barcode: compact(extraData.barcode || "",80),
      material: compact(extraData.material || "",100),
      size: compact(extraData.size || "",100),
      comment: compact(extraData.comment || "",300)
    };

    const prompt = [
      "Проанализируй фотографии одного товара для карточки маркетплейса Yuvion.",
      "Верни ТОЛЬКО JSON без markdown.",
      "Ничего не выдумывай. Точные размеры, материал, бренд, модель, состав и комплектацию указывай только если они видны на фото или переданы продавцом.",
      "Структура: {title, category, shortDescription, description, characteristics:[{name,value}], benefits:[строка], usage:[строка], keywords:[строка], slidePlan:[{title,bullets:[строка]}]}.",
      "Нужно ровно 4 объекта slidePlan: 1) обложка и 3 преимущества; 2) преимущества/характеристики; 3) сценарий использования; 4) детали/комплектация.",
      "Пиши по-русски, конкретно, без рекламных обещаний, которые нельзя подтвердить.",
      "Данные продавца: " + JSON.stringify(facts)
    ].join(" ");

    const messages = ids.map((id,i) => ({
      role:"user",
      content: i===0 ? prompt : "Дополнительный ракурс того же товара. Используй только видимые факты.",
      attachments:[id]
    }));
    const result = await complete(messages, { maxTokens:2400, temperature:0.1 });
    const parsed = normalizeCard(parseJson(result.content));
    parsed.model = result.model;
    return res.json(parsed);
  } catch (e) {
    console.error(e);
    return res.status(500).json({error:"Не удалось проанализировать товар. Попробуйте другое фото."});
  } finally {
    await Promise.allSettled(ids.map(deleteGigaFile));
  }
});

function palette(style) {
  const p = {
    marketplace:["#eef6ff","#dbeafe","#2563eb","#0f172a"],
    premium:["#f6f0e7","#e7dccb","#111827","#7c5c35"],
    child:["#fff4dc","#dff7ff","#ff7a59","#1d4ed8"],
    minimal:["#f8fafc","#e2e8f0","#0f172a","#475569"],
    strict:["#f5f7fa","#dbe1e8","#111827","#334155"]
  };
  return p[style] || p.marketplace;
}

async function productPanel(sourceBuffer, width, height) {
  return sharp(sourceBuffer).rotate().resize(width,height,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer();
}

function lineWrap(text, max=25) {
  const words = compact(text,180).split(" ");
  const lines=[]; let cur="";
  for (const w of words) {
    if ((cur+" "+w).trim().length > max && cur) { lines.push(cur); cur=w; }
    else cur=(cur+" "+w).trim();
  }
  if(cur) lines.push(cur);
  return lines.slice(0,3);
}

function tspans(lines,x,y,dy=58) {
  return lines.map((l,i)=>'<text x="'+x+'" y="'+(y+i*dy)+'" font-family="DejaVu Sans,Arial,sans-serif" font-size="46" font-weight="800" fill="#0f172a">'+esc(l)+'</text>').join("");
}

function bulletText(items,x,y,color="#0f172a") {
  return items.slice(0,5).map((t,i)=>{
    const yy=y+i*72;
    return '<circle cx="'+x+'" cy="'+(yy-13)+'" r="12" fill="#2563eb"/><text x="'+(x+30)+'" y="'+yy+'" font-family="DejaVu Sans,Arial,sans-serif" font-size="30" font-weight="600" fill="'+color+'">'+esc(compact(t,48))+'</text>';
  }).join("");
}

async function renderCard(source, card, index, style) {
  const [bg1,bg2,accent,dark] = palette(style);
  const titleLines = lineWrap(index===0 ? card.title : ["Преимущества","Характеристики","Для кого и для чего"][index-1] || card.title, 23);
  let prodW=650, prodH=600, left=125, top=420;
  if(index===1){ prodW=430; prodH=620; left=430; top=380; }
  if(index===2){ prodW=600; prodH=500; left=150; top=300; }
  if(index===3){ prodW=560; prodH=540; left=170; top=360; }
  const product = await productPanel(source, prodW, prodH);

  let body = "";
  if(index===0){
    body += tspans(titleLines,70,110,56);
    const b=(card.benefits.length?card.benefits:["Удобно использовать","Аккуратный дизайн","Подходит для маркетплейса"]).slice(0,3);
    body += b.map((t,i)=>'<rect x="'+(70+i*260)+'" y="270" width="235" height="78" rx="28" fill="#ffffff" opacity=".93"/><text x="'+(92+i*260)+'" y="319" font-family="DejaVu Sans,Arial,sans-serif" font-size="23" font-weight="700" fill="'+dark+'">'+esc(compact(t,24))+'</text>').join("");
  } else if(index===1){
    body += tspans(titleLines,60,105,56);
    body += bulletText(card.benefits.length?card.benefits:card.characteristics.map(x=>x.name+": "+x.value),70,300,dark);
  } else if(index===2){
    body += tspans(titleLines,60,105,56);
    const items = card.characteristics.slice(0,5);
    body += items.map((x,i)=>{
      const x0=60+(i%2)*400, y0=825+Math.floor(i/2)*110;
      return '<rect x="'+x0+'" y="'+y0+'" width="350" height="86" rx="24" fill="#ffffff" opacity=".94"/><text x="'+(x0+22)+'" y="'+(y0+34)+'" font-family="DejaVu Sans,Arial,sans-serif" font-size="20" font-weight="700" fill="'+dark+'">'+esc(compact(x.name,26))+'</text><text x="'+(x0+22)+'" y="'+(y0+65)+'" font-family="DejaVu Sans,Arial,sans-serif" font-size="19" fill="#475569">'+esc(compact(x.value,30))+'</text>';
    }).join("");
  } else {
    body += tspans(titleLines,60,105,56);
    body += bulletText((card.usage.length?card.usage:card.benefits).slice(0,4),70,905,dark);
  }

  const svg = Buffer.from('<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="'+bg1+'"/><stop offset="100%" stop-color="'+bg2+'"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-opacity=".18"/></filter></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="790" cy="120" r="160" fill="'+accent+'" opacity=".12"/><circle cx="110" cy="1080" r="220" fill="'+accent+'" opacity=".10"/><rect x="38" y="32" width="824" height="1136" rx="44" fill="#ffffff" opacity=".12"/>'+body+'<text x="70" y="1152" font-family="DejaVu Sans,Arial,sans-serif" font-size="19" fill="#64748b">Yuvion AI • 900×1200</text></svg>');

  return sharp({create:{width:900,height:1200,channels:4,background:{r:255,g:255,b:255,alpha:1}}})
    .composite([{input:svg},{input:product,left,top}])
    .png()
    .toBuffer();
}

app.post("/api/generate-cards", async (req,res) => {
  try {
    const { image, mimeType, card:rawCard, style="marketplace" } = req.body || {};
    if (typeof image !== "string" || !ALLOWED.has(String(mimeType)) || !rawCard) return res.status(400).json({error:"Не хватает фото или данных товара."});
    const source = Buffer.from(image,"base64");
    const card = normalizeCard(rawCard);
    const cards = [];
    for(let i=0;i<4;i++){
      const b = await renderCard(source,card,i,style);
      cards.push({index:i,filename:["01_cover.png","02_benefits.png","03_specs.png","04_usage.png"][i],base64:b.toString("base64")});
    }
    res.json({cards,format:"900x1200",count:4});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Не удалось создать карточки."});
  }
});

app.post("/api/package", async (req,res) => {
  try {
    const { cards=[] } = req.body || {};
    if (!Array.isArray(cards) || cards.length !== 4) return res.status(400).json({error:"Нужны 4 карточки."});
    const zip = new JSZip();
    cards.forEach((c,i)=>zip.file(c.filename || ("0"+(i+1)+".png"), Buffer.from(c.base64,"base64")));
    const out = await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
    res.json({zipBase64:out.toString("base64"),zipName:"yuvion-ozon-cards.zip"});
  } catch {
    res.status(500).json({error:"Не удалось собрать ZIP."});
  }
});

app.get("*splat", (_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port,"0.0.0.0",()=>console.log("Yuvion Tenant AI listening on",port));
