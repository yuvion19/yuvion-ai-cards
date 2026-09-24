(()=>{"use strict";
const STORE_KEY="qirmizi-master-store-v2";
const LEGACY_KEY="qirmizi-master-store-v1";
const DB_NAME="qirmizi-media-v1";

function defaults(){return{version:2,records:{},streets:{},materials:{},routes:[],contributions:[],settings:{lang:"ru"},audit:[],updatedAt:new Date().toISOString()}}
function load(){
  let obj=null;
  try{obj=JSON.parse(localStorage.getItem(STORE_KEY)||"null")}catch{}
  if(!obj){try{obj=JSON.parse(localStorage.getItem(LEGACY_KEY)||"null")}catch{}}
  const s=Object.assign(defaults(),obj||{});
  s.records=s.records||{};s.streets=s.streets||{};s.materials=s.materials||{};s.routes=s.routes||[];s.contributions=s.contributions||[];s.audit=s.audit||[];
  return s;
}
function save(s,action="update",target="project"){
  s.updatedAt=new Date().toISOString();
  s.audit=[...(s.audit||[]),{id:"AUD-"+crypto.randomUUID(),at:s.updatedAt,action,target}].slice(-5000);
  localStorage.setItem(STORE_KEY,JSON.stringify(s));
  return s;
}
function materialId(){return "MAT-"+crypto.randomUUID()}
function sha256(file){return file.arrayBuffer().then(buf=>crypto.subtle.digest("SHA-256",buf)).then(hash=>[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join(""))}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files",{keyPath:"id"});if(!db.objectStoreNames.contains("queue"))db.createObjectStore("queue",{keyPath:"id"})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbPut(storeName,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error)})}
async function dbGet(storeName,id){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(storeName).objectStore(storeName).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
async function dbAll(storeName){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(storeName).objectStore(storeName).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
async function dbDelete(storeName,id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(u){try{const x=new URL(u,location.href);return["http:","https:","data:","blob:"].includes(x.protocol)?x.href:""}catch{return""}}
function download(name,text,type="application/json"){const a=document.createElement("a"),b=new Blob([text],{type});a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
function center(f){const ring=f?.geometry?.coordinates?.[0]||[];if(!ring.length)return[48.5106,41.3736];const p=ring.length>1?ring.slice(0,-1):ring,s=p.reduce((a,x)=>[a[0]+x[0],a[1]+x[1]],[0,0]);return[s[0]/p.length,s[1]/p.length]}
function dist(a,b){const R=6371000,p1=a[1]*Math.PI/180,p2=b[1]*Math.PI/180,dp=(b[1]-a[1])*Math.PI/180,dl=(b[0]-a[0])*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function label(f,s){const p=f?.properties||{},r=s.records?.[p.qqId];return r?.title||p.nameRu||p.name||[p.street,p.houseNumber].filter(Boolean).join(" ")||p.qqId||"Объект"}
function issues(f,s){const p=f.properties||{},r=s.records?.[p.qqId],a=[];if(!p.street&&!p.houseNumber)a.push("Нет адреса OSM");if(p.heightEstimated)a.push("Высота оценочная");if(!r?.media?.some(m=>m.type==="photo"))a.push("Нужна фотография");if(!r?.year)a.push("Не установлен период");if(r&&!r.sources?.length)a.push("Нужен источник");if(r?.issues?.length)a.push(...r.issues.map(x=>x.text||"Проверить запись"));return a}
function completeness(f,s){const r=s.records?.[f.properties.qqId];if(!r)return 0;let n=0;if(r.description)n+=15;if(r.year)n+=10;if(r.sources?.length)n+=20;if(r.media?.some(m=>m.type==="photo"))n+=20;if(r.media?.some(m=>m.type==="video"))n+=5;if(r.panoramaUrl)n+=10;if(r.modelUrl)n+=10;if(r.audioUrl)n+=5;if(r.verification==="verified")n+=5;return Math.min(100,n)}
function buildStreetIndex(data,s){const streets={};for(const f of data?.buildings?.features||[]){const name=f.properties.street||"Без улицы";(streets[name]??=[]).push(f.properties.qqId)}for(const [name,ids] of Object.entries(streets)){s.streets[name]={...(s.streets[name]||{}),name,houseIds:ids,updatedAt:new Date().toISOString()}}return s}
function kml(data,s){const pm=(x)=>Number(x).toFixed(7);const placemarks=(data?.buildings?.features||[]).map(f=>{const c=center(f),r=s.records?.[f.properties.qqId];return `<Placemark><name>${esc(label(f,s))}</name><description><![CDATA[${esc(r?.description||"")}]]></description><ExtendedData><Data name="qqId"><value>${esc(f.properties.qqId)}</value></Data><Data name="progress"><value>${completeness(f,s)}</value></Data></ExtendedData><Point><coordinates>${pm(c[0])},${pm(c[1])},0</coordinates></Point></Placemark>`}).join("");return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Qirmizi Qesebe</name>${placemarks}</Document></kml>`}
function iiifManifest(house,data,s){const f=(data?.buildings?.features||[]).find(x=>x.properties.qqId===house),r=s.records?.[house];if(!f)return null;const imgs=(r?.media||[]).filter(m=>m.type==="photo"&&/^https?:/.test(m.url||""));return{"@context":"http://iiif.io/api/presentation/3/context.json",id:location.origin+location.pathname.replace(/[^/]+$/,"")+"iiif/"+encodeURIComponent(house)+".json",type:"Manifest",label:{ru:[label(f,s)]},metadata:[{label:{ru:["QQ-ID"]},value:{none:[house]}},{label:{ru:["Источник"]},value:{ru:[(r?.sources||[]).map(x=>x.label||x.url).filter(Boolean).join("; ")||"Не указан"]}}],items:imgs.map((m,i)=>({id:`urn:qq:${house}:canvas:${i+1}`,type:"Canvas",height:1000,width:1500,items:[{id:`urn:qq:${house}:page:${i+1}`,type:"AnnotationPage",items:[{id:`urn:qq:${house}:annotation:${i+1}`,type:"Annotation",motivation:"painting",body:{id:m.url,type:"Image",format:"image/jpeg"},target:`urn:qq:${house}:canvas:${i+1}`}]}]}))}
window.QQCore={STORE_KEY,DB_NAME,load,save,materialId,sha256,dbPut,dbGet,dbAll,dbDelete,esc,safeUrl,download,center,dist,label,issues,completeness,buildStreetIndex,kml,iiifManifest};
})();