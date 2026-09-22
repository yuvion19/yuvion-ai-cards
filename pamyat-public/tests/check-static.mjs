import fs from "node:fs";

const server=fs.readFileSync(new URL("../server.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

const requiredServer=[
  'app.get("/m"',
  'app.get("/m/add"',
  'app.post("/m/add"',
  'app.get("/m/catalog"',
  'app.get("/m/map"',
  'app.get("/m/person/:key"',
  'app.get("/m/route"',
  'app.get("/m/family"',
  'app.get("/m/identify"',
  'app.get("/m/offline"',
  'app.get("/api/selftest"',
  'app.get("/api/cemetery/offline"'
];
for(const s of requiredServer){
  if(!server.includes(s)) throw new Error("Missing server route: "+s);
}

const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).filter(s=>s.trim());
for(const [i,src] of inline.entries()){
  try{ new Function(src); }
  catch(e){ throw new Error("Inline script "+i+" syntax error: "+e.message); }
}

if(/api\.qrserver\.com/.test(html)) throw new Error("External QR provider still present");
if(!html.includes("/vendor/leaflet/leaflet.js")) throw new Error("Leaflet is not served locally");

console.log("Static checks passed:", {routes:requiredServer.length,inlineScripts:inline.length});
