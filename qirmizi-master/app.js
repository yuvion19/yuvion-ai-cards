(()=>{"use strict";

const CURRENT_YEAR=2026;
const BOUNDS=[[48.493,41.36],[48.529,41.3875]];
const CENTER=[48.5106,41.3736];
const STORE_KEY="qirmizi-master-store-v2";\nconst LEGACY_STORE_KEY="qirmizi-master-store-v1";
const $=id=>document.getElementById(id);
const state={data:null,selected:null,filter:"all",year:CURRENT_YEAR,is3d:true,walk:false,pressed:new Set(),drag:false,lastX:0,lastY:0,lastFrame:performance.now(),raf:0,route:[],tourTimer:null,lang:"ru",screenMode:false};

const I18N={
ru:{brand:"Цифровая Красная Слобода",all:"Вся Слобода",gps:"Я здесь",museum:"Музей",walk:"Прогулка",catalog:"КАТАЛОГ",search:"Адрес, название, QQ-ID",allFilter:"Все",heritage:"Исторические",materials:"С материалами",needsWork:"Нужно дополнить",passport:"ЦИФРОВОЙ ПАСПОРТ",today:"Сегодня",history:"История",media:"Медиа",sources:"Источники",edit:"Редактор",save:"Сохранить",geometryIssue:"Проблема контура",share:"Ссылка",audioGuide:"Аудиогид",routeHere:"В маршрут",museumTitle:"Красная Слобода во времени",museumLead:"Интерактивная карта, архитектурный архив и виртуальная прогулка. Исторические сведения показываются только вместе с источниками или отметкой о степени достоверности.",startTour:"Начать экскурсию",openMap:"Открыть карту",screenMode:"Режим экрана",walkMode:"Прогулка по улицам",exit:"Выйти",details:"Подробнее"},
az:{brand:"Rəqəmsal Qırmızı Qəsəbə",all:"Bütün qəsəbə",gps:"Mən buradayam",museum:"Muzey",walk:"Gəzinti",catalog:"KATALOQ",search:"Ünvan, ad, QQ-ID",allFilter:"Hamısı",heritage:"Tarixi",materials:"Materiallı",needsWork:"Tamamlamaq lazımdır",passport:"RƏQƏMSAL PASPORT",today:"Bu gün",history:"Tarix",media:"Media",sources:"Mənbələr",edit:"Redaktor",save:"Yadda saxla",geometryIssue:"Kontur problemi",share:"Keçid",audioGuide:"Audiobələdçi",routeHere:"Marşruta əlavə et",museumTitle:"Qırmızı Qəsəbə zaman içində",museumLead:"İnteraktiv xəritə, memarlıq arxivi və virtual gəzinti.",startTour:"Ekskursiyaya başla",openMap:"Xəritəni aç",screenMode:"Ekran rejimi",walkMode:"Küçələrdə gəzinti",exit:"Çıx",details:"Ətraflı"},
en:{brand:"Digital Red Village",all:"Whole village",gps:"I am here",museum:"Museum",walk:"Walk",catalog:"CATALOG",search:"Address, name, QQ-ID",allFilter:"All",heritage:"Heritage",materials:"With materials",needsWork:"Needs work",passport:"DIGITAL PASSPORT",today:"Today",history:"History",media:"Media",sources:"Sources",edit:"Editor",save:"Save",geometryIssue:"Geometry issue",share:"Link",audioGuide:"Audio guide",routeHere:"Add to route",museumTitle:"Red Village through time",museumLead:"Interactive map, architectural archive and virtual walk. Historical claims are shown with sources or confidence labels.",startTour:"Start tour",openMap:"Open map",screenMode:"Screen mode",walkMode:"Street walk",exit:"Exit",details:"Details"},
he:{brand:"הכפר האדום הדיגיטלי",all:"כל היישוב",gps:"אני כאן",museum:"מוזיאון",walk:"סיור",catalog:"קטלוג",search:"כתובת, שם, QQ-ID",allFilter:"הכל",heritage:"היסטורי",materials:"עם חומרים",needsWork:"דורש השלמה",passport:"דרכון דיגיטלי",today:"היום",history:"היסטוריה",media:"מדיה",sources:"מקורות",edit:"עורך",save:"שמור",geometryIssue:"בעיית מתאר",share:"קישור",audioGuide:"מדריך קולי",routeHere:"הוסף למסלול",museumTitle:"הכפר האדום לאורך הזמן",museumLead:"מפה אינטראקטיבית, ארכיון אדריכלי וסיור וירטואלי.",startTour:"התחל סיור",openMap:"פתח מפה",screenMode:"מצב תצוגה",walkMode:"סיור ברחובות",exit:"יציאה",details:"פרטים"}
};
I18N.juh=I18N.ru;

function defaultStore(){return{version:2,records:{},streets:{},materials:{},routes:[],contributions:[],roles:[],stories:[],juhuriItems:[],audit:[],settings:{lang:"ru"},updatedAt:new Date().toISOString()}}
function loadStore(){try{const cur=JSON.parse(localStorage.getItem(STORE_KEY)||"null"),legacy=JSON.parse(localStorage.getItem(LEGACY_STORE_KEY)||"null");return Object.assign(defaultStore(),cur||legacy||{})}catch{return defaultStore()}}
let store=loadStore();
function persist(){store.updatedAt=new Date().toISOString();store.audit=[...(store.audit||[]),{id:"AUD-"+crypto.randomUUID(),at:store.updatedAt,action:"main-edit",target:state.selected?.properties?.qqId||"project"}].slice(-5000);localStorage.setItem(STORE_KEY,JSON.stringify(store));refreshAll()}
function t(k){return(I18N[state.lang]||I18N.ru)[k]||I18N.ru[k]||k}
function toast(msg,ms=2400){const el=$("toast");el.textContent=msg;el.classList.remove("hidden");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.add("hidden"),ms)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(u){try{const x=new URL(u,location.href);return["http:","https:","data:"].includes(x.protocol)?x.href:""}catch{return""}}
function download(name,text,type="application/json"){const a=document.createElement("a"),b=new Blob([text],{type});a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function houseRecord(id){return store.records[id]||null}
function buildingById(id){return state.data?.buildings?.features.find(f=>f.properties.qqId===id)||null}
function centerOf(f){const ring=f?.geometry?.coordinates?.[0]||[];if(!ring.length)return CENTER;const pts=ring.length>1?ring.slice(0,-1):ring;const s=pts.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]);return[s[0]/pts.length,s[1]/pts.length]}
function heritage(f){const p=f.properties||{},r=houseRecord(p.qqId);return!!(p.historic||p.tourism||p.religion||p.amenity==="place_of_worship"||r?.heritage)}
function label(f){const p=f.properties||{},r=houseRecord(p.qqId);return r?.title||p.nameRu||p.name||[p.street,p.houseNumber].filter(Boolean).join(" ")||p.qqId}
function completeness(f){const r=houseRecord(f.properties.qqId);if(!r)return 0;let n=0;if(r.description)n+=15;if(r.year)n+=10;if(r.sources?.length)n+=20;if(r.media?.some(x=>x.type==="photo"))n+=20;if(r.media?.some(x=>x.type==="video"))n+=5;if(r.panoramaUrl)n+=10;if(r.modelUrl)n+=10;if(r.audioUrl)n+=5;if(r.verification==="verified")n+=5;return Math.min(100,n)}
function issues(f){const p=f.properties||{},r=houseRecord(p.qqId),a=[];if(!p.street&&!p.houseNumber)a.push("Нет адреса в OSM");if(p.heightEstimated)a.push("Высота оценочная");if(!r?.media?.some(m=>m.type==="photo"))a.push("Нужна фотография");if(r&&!r.sources?.length)a.push("Нужен источник");if(!r?.year)a.push("Не установлен период");if(r?.issues?.length)a.push(...r.issues.map(x=>x.text));return a}
function sourceTypeLabel(v){return{official:"официальный документ",archive:"архив",publication:"публикация",photo:"фотография",video:"видео",oral:"устное свидетельство",unverified:"не подтверждено"}[v]||v||"источник"}

function enrichedBuildings(){return{type:"FeatureCollection",features:(state.data?.buildings?.features||[]).map(f=>({...f,properties:{...f.properties,progress:completeness(f),userStatus:houseRecord(f.properties.qqId)?.status||"existing",heritageFlag:heritage(f)?1:0}}))}}

const map=new maplibregl.Map({
  container:"map",center:CENTER,zoom:15.2,pitch:55,bearing:-18,maxPitch:85,
  style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"background",type:"background",paint:{"background-color":"#0d1115"}},{id:"osm",type:"raster",source:"osm",paint:{"raster-opacity":.88}}]}
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");

function ensureSources(){
  if(!state.data||!map.isStyleLoaded())return;
  const b=enrichedBuildings();
  if(map.getSource("roads"))map.getSource("roads").setData(state.data.roads);else{
    map.addSource("roads",{type:"geojson",data:state.data.roads});
    map.addLayer({id:"roads-line",type:"line",source:"roads",paint:{"line-color":"#6e7780","line-width":["interpolate",["linear"],["zoom"],14,.8,19,3],"line-opacity":.75}});
  }
  if(map.getSource("buildings"))map.getSource("buildings").setData(b);else{
    map.addSource("buildings",{type:"geojson",data:b});
    map.addLayer({id:"buildings2d",type:"fill",source:"buildings",layout:{visibility:"none"},paint:{"fill-color":["case",["==",["get","userStatus"],"lost"],"#6e5e59",["==",["get","heritageFlag"],1],"#b65340","#75564e"],"fill-opacity":["case",["==",["get","userStatus"],"lost"],.25,.75],"fill-outline-color":"#d7c6bc"}});
    map.addLayer({id:"buildings3d",type:"fill-extrusion",source:"buildings",paint:{"fill-extrusion-color":["case",["==",["get","userStatus"],"lost"],"#6e5e59",["==",["get","heritageFlag"],1],"#b65340","#75564e"],"fill-extrusion-height":["get","height"],"fill-extrusion-opacity":["case",["==",["get","userStatus"],"lost"],.25,.86],"fill-extrusion-vertical-gradient":true}});
    map.addLayer({id:"selected",type:"fill-extrusion",source:"buildings",filter:["==",["get","qqId"],""],paint:{"fill-extrusion-color":"#ef7c62","fill-extrusion-height":["+",["get","height"],.6],"fill-extrusion-opacity":.98}});
    ["buildings2d","buildings3d"].forEach(l=>map.on("click",l,e=>{const id=e.features?.[0]?.properties?.qqId;if(id)selectHouse(String(id))}));
  }
  const dirFeatures=[];for(const m of Object.values(store.materials||{})){if(!m.gps||!Number.isFinite(m.gps.lon)||!Number.isFinite(m.gps.lat))continue;dirFeatures.push({type:"Feature",properties:{id:m.id,houseId:m.houseId||"",kind:m.kind||"photo"},geometry:{type:"Point",coordinates:[m.gps.lon,m.gps.lat]}});if(Number.isFinite(m.direction)){const rad=m.direction*Math.PI/180,len=18,lat2=m.gps.lat+(Math.cos(rad)*len)/110540,lon2=m.gps.lon+(Math.sin(rad)*len)/(111320*Math.cos(m.gps.lat*Math.PI/180));dirFeatures.push({type:"Feature",properties:{id:m.id,houseId:m.houseId||"",kind:"direction"},geometry:{type:"LineString",coordinates:[[m.gps.lon,m.gps.lat],[lon2,lat2]]}})}}const mediaGeo={type:"FeatureCollection",features:dirFeatures};if(map.getSource("mediaGeo"))map.getSource("mediaGeo").setData(mediaGeo);else{map.addSource("mediaGeo",{type:"geojson",data:mediaGeo});map.addLayer({id:"media-direction",type:"line",source:"mediaGeo",filter:["==",["geometry-type"],"LineString"],paint:{"line-color":"#e8b16e","line-width":2,"line-opacity":.8}});map.addLayer({id:"media-point",type:"circle",source:"mediaGeo",filter:["==",["geometry-type"],"Point"],paint:{"circle-radius":4,"circle-color":"#e8b16e","circle-stroke-width":1,"circle-stroke-color":"#151a20"}})}
  if(state.data.places?.features?.length){
    if(map.getSource("places"))map.getSource("places").setData(state.data.places);else{
      map.addSource("places",{type:"geojson",data:state.data.places});
      map.addLayer({id:"places-dot",type:"circle",source:"places",paint:{"circle-radius":4,"circle-color":"#d1a268","circle-stroke-color":"#161a1f","circle-stroke-width":1}});
    }
  }
  updateBuildingPaint();
}

function updateBuildingPaint(){
  if(!map.getLayer("buildings3d"))return;
  const progressColor=["interpolate",["linear"],["get","progress"],0,"#505861",25,"#805f55",50,"#aa684f",75,"#c99058",100,"#d5bd72"];
  const normalColor=["case",["==",["get","userStatus"],"lost"],"#6e5e59",["==",["get","heritageFlag"],1],"#b65340","#75564e"];
  const color=state.progressLayer?progressColor:normalColor;
  map.setPaintProperty("buildings3d","fill-extrusion-color",color);
  map.setPaintProperty("buildings2d","fill-color",color);
  const filter=state.showLost===false?["!=" ,["get","userStatus"],"lost"]:null;
  map.setFilter("buildings3d",filter);
  map.setFilter("buildings2d",filter);
}

function set3d(v){state.is3d=v;$("modeBtn").textContent=v?"3D":"2D";if(map.getLayer("buildings3d")){map.setLayoutProperty("buildings3d","visibility",v?"visible":"none");map.setLayoutProperty("buildings2d","visibility",v?"none":"visible");map.setLayoutProperty("selected","visibility",v?"visible":"none")}map.easeTo({pitch:v?55:0,bearing:v?-18:0,duration:350})}

async function loadData(){
  $("status").textContent="Загрузка локального архива…";
  try{
    const r=await fetch("./data.json",{cache:"no-store"});if(!r.ok)throw new Error(String(r.status));
    state.data=await r.json();$("count").textContent=state.data.buildings.features.length;$("status").textContent=`${state.data.buildings.features.length} зданий · ${state.data.roads.features.length} дорог · локальный снимок OSM`;
    ensureSources();renderList();updateMuseumStats();
    const id=new URL(location.href).searchParams.get("house");if(id)selectHouse(id,false);
  }catch(e){$("status").textContent="Не удалось загрузить локальный data.json";toast("Ошибка локального архива")}
}

function renderList(){
  if(!state.data)return;
  const q=$("search").value.trim().toLowerCase();
  const rows=state.data.buildings.features.filter(f=>{
    const r=houseRecord(f.properties.qqId);
    const match=[f.properties.qqId,f.properties.osmId,f.properties.name,f.properties.nameRu,f.properties.street,f.properties.houseNumber,r?.title,r?.description].join(" ").toLowerCase().includes(q);
    if(!match)return false;
    if(state.filter==="heritage"&&!heritage(f))return false;
    if(state.filter==="materials"&&!r)return false;
    if(state.filter==="tasks"&&issues(f).length<2)return false;
    return true;
  }).slice(0,500);
  $("houseList").innerHTML=rows.map(f=>`<button data-id="${esc(f.properties.qqId)}" class="${state.selected?.properties?.qqId===f.properties.qqId?"active":""}"><b>${esc(label(f))}</b><small>${esc(f.properties.qqId)} · ${completeness(f)}% · ${issues(f).length} задач</small></button>`).join("");
  $("houseList").querySelectorAll("button").forEach(b=>b.onclick=()=>selectHouse(b.dataset.id));
}

function selectHouse(id,fly=true){
  const f=buildingById(id);if(!f)return;
  state.selected=f;renderPassport();$("passport").classList.remove("hidden");renderList();
  if(map.getLayer("selected"))map.setFilter("selected",["==",["get","qqId"],id]);
  if(fly)map.flyTo({center:centerOf(f),zoom:18.3,pitch:state.is3d?64:0,duration:550});
  const u=new URL(location.href);u.searchParams.set("house",id);history.replaceState({}, "", u);
}

function renderPassport(){
  const f=state.selected;if(!f)return;const p=f.properties,r=houseRecord(p.qqId),score=completeness(f);
  $("houseTitle").textContent=label(f);$("houseId").textContent=p.qqId;$("qualityBadge").textContent=`${score}%`;$("verifyBadge").textContent=r?.verification==="verified"?"проверено":r?"есть материалы":"OSM";
  const rows=[["Адрес",[p.street,p.houseNumber].filter(Boolean).join(", ")||"нет данных"],["Тип",p.building||"—"],["Этажность",p.levels||"—"],["Высота",`${p.heightEstimated?"≈ ":""}${Number(p.height||0).toFixed(1)} м`],["Период",r?.year||"—"],["Статус",r?.status||"existing"],["Описание",r?.description||"нет данных"]];
  $("today").innerHTML=rows.map(([k,v])=>`<div class="kv"><small>${esc(k)}</small><div>${esc(v)}</div></div>`).join("")+(issues(f).length?issues(f).map(x=>`<div class="warning">⚠ ${esc(x)}</div>`).join(""):"");
  renderHistory();renderMedia();renderSources();fillEditor();
}

function renderHistory(){
  const f=state.selected,r=houseRecord(f.properties.qqId),events=[];
  if(r?.year&&Number(r.year)<=state.year)events.push({year:r.year,title:r.title||label(f),text:r.description||""});
  for(const m of r?.media||[])if(m.year&&Number(m.year)<=state.year)events.push({year:m.year,title:m.label||m.type,text:m.source||""});
  events.sort((a,b)=>a.year-b.year);
  $("history").innerHTML=events.length?events.map(e=>`<div class="timelineItem"><b>${esc(e.year)} · ${esc(e.title)}</b><small>${esc(e.text)}</small></div>`).join(""):'<div class="sourceItem">Для выбранного года подтверждённых материалов пока нет.</div>';
}

function renderMedia(){
  const r=houseRecord(state.selected.properties.qqId),media=r?.media||[],photos=media.filter(x=>x.type==="photo"&&safeUrl(x.url)&&(!x.year||Number(x.year)<=state.year));
  let html='<div class="mediaGrid">'+photos.map(m=>`<div class="mediaCard"><img src="${esc(safeUrl(m.url))}" alt=""><div><b>${esc(m.label||"Фото")}</b><small>${esc(m.year||"")}</small></div></div>`).join("")+"</div>";
  const videos=media.filter(x=>x.type==="video");
  if(videos.length)html+=videos.map(m=>`<div class="sourceItem"><b>Видео</b><small><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noreferrer">${esc(m.label||m.url)}</a></small></div>`).join("");
  if(r?.panoramaUrl)html+=`<div class="sourceItem"><b>360°</b><small><a href="${esc(safeUrl(r.panoramaUrl))}" target="_blank" rel="noreferrer">Открыть панораму</a></small></div>`;
  if(r?.modelUrl)html+=`<div class="sourceItem"><b>3D GLB/GLTF</b><small><a href="${esc(safeUrl(r.modelUrl))}" target="_blank" rel="noreferrer">Открыть модель</a></small></div>`;
  if(photos.length>=2){const sorted=[...photos].filter(x=>x.year).sort((a,b)=>a.year-b.year);if(sorted.length>=2)html+=`<div class="sourceItem"><b>Раньше / сейчас</b><small>${esc(sorted[0].year)} ↔ ${esc(sorted.at(-1).year)}</small></div><div class="mediaGrid"><div class="mediaCard"><img src="${esc(safeUrl(sorted[0].url))}"><div>${esc(sorted[0].year)}</div></div><div class="mediaCard"><img src="${esc(safeUrl(sorted.at(-1).url))}"><div>${esc(sorted.at(-1).year)}</div></div></div>`}
  $("media").innerHTML=html||'<div class="sourceItem">Медиа пока не добавлены.</div>';
}

function renderSources(){
  const r=houseRecord(state.selected.properties.qqId),sources=r?.sources||[];
  $("sources").innerHTML=sources.length?sources.map(s=>`<div class="sourceItem"><b>${esc(sourceTypeLabel(s.type))}: ${esc(s.label||"Источник")}</b><small>${esc(s.url||"")} · ${esc(s.note||"")}</small></div>`).join(""):'<div class="sourceItem">Источники пока не добавлены.</div>';
  if(r?.versions?.length)$("sources").innerHTML+=`<h3>Версии</h3>`+r.versions.slice().reverse().slice(0,20).map(v=>`<div class="sourceItem"><b>${esc(new Date(v.at).toLocaleString())}</b><small>${esc(v.summary)}</small></div>`).join("");
}

function fillEditor(){
  if(!state.selected)return;const r=houseRecord(state.selected.properties.qqId)||{};
  $("editTitle").value=r.title||"";$("editDescription").value=r.description||"";$("editYear").value=r.year||"";$("editStatus").value=r.status||"existing";$("editVerification").value=r.verification||"open";$("editSource").value="";$("editSourceLabel").value="";$("editPhoto").value="";$("editPhotoYear").value="";$("editPanorama").value=r.panoramaUrl||"";$("editModel").value=r.modelUrl||"";$("editAudio").value=r.audioUrl||"";
}

function saveRecord(){
  if(!state.selected)return;const id=state.selected.properties.qqId,prev=houseRecord(id)||{media:[],sources:[],versions:[],issues:[]};
  const next={...prev,title:$("editTitle").value.trim(),description:$("editDescription").value.trim(),year:Number($("editYear").value)||null,status:$("editStatus").value,verification:$("editVerification").value,panoramaUrl:safeUrl($("editPanorama").value),modelUrl:safeUrl($("editModel").value),audioUrl:safeUrl($("editAudio").value),updatedAt:new Date().toISOString()};
  const src=safeUrl($("editSource").value),srcLabel=$("editSourceLabel").value.trim();
  if(src||srcLabel)next.sources=[...(next.sources||[]),{type:"publication",url:src,label:srcLabel||src,note:"",at:new Date().toISOString()}];
  const photo=safeUrl($("editPhoto").value);if(photo)next.media=[...(next.media||[]),{type:"photo",url:photo,year:Number($("editPhotoYear").value)||null,label:srcLabel||"Фото",source:src||"",at:new Date().toISOString()}];
  next.versions=[...(next.versions||[]),{at:new Date().toISOString(),summary:"Обновлён паспорт объекта"}];
  store.records[id]=next;persist();renderPassport();toast("Паспорт сохранён локально");
}

function markIssue(){if(!state.selected)return;const id=state.selected.properties.qqId,r=houseRecord(id)||{media:[],sources:[],versions:[],issues:[]};r.issues=[...(r.issues||[]),{text:"Требуется проверка геометрии здания",at:new Date().toISOString()}];r.versions=[...(r.versions||[]),{at:new Date().toISOString(),summary:"Добавлена задача проверки геометрии"}];store.records[id]=r;persist();renderPassport();toast("Задача добавлена")}

function refreshAll(){renderList();ensureSources();if(state.selected)renderPassport();updateMuseumStats()}

function updateMuseumStats(){
  if(!state.data)return;const fs=state.data.buildings.features,total=fs.length,edited=fs.filter(f=>houseRecord(f.properties.qqId)).length,photos=fs.filter(f=>houseRecord(f.properties.qqId)?.media?.some(m=>m.type==="photo")).length,complete=fs.filter(f=>completeness(f)>=70).length;
  $("museumStats").innerHTML=[[total,"зданий"],[edited,"с паспортами"],[photos,"с фото"],[complete,"70%+"]].map(([v,k])=>`<div><b>${v}</b><small>${k}</small></div>`).join("");
}

function openTool(name){
  $("toolPanel").classList.remove("hidden");
  const body=$("toolBody"),title=$("toolTitle"),kick=$("toolKicker");kick.textContent="ИНСТРУМЕНТ";
  if(name==="timeline"){
    title.textContent="Историческая шкала";
    body.innerHTML=`<div class="sourceItem"><b>Год карты: ${state.year}</b><small>Материалы позднее выбранного года скрываются в паспортах.</small></div><label>Год<input id="toolYear" type="range" min="1850" max="${CURRENT_YEAR}" value="${state.year}"></label><div class="row wrap"><button id="year1900">1900</button><button id="year1950">1950</button><button id="year2000">2000</button><button id="yearNow">Сегодня</button></div>`;
    $("toolYear").oninput=e=>setYear(Number(e.target.value));$("year1900").onclick=()=>setYear(1900);$("year1950").onclick=()=>setYear(1950);$("year2000").onclick=()=>setYear(2000);$("yearNow").onclick=()=>setYear(CURRENT_YEAR);
  }else if(name==="routes"){
    title.textContent="Маршруты и экскурсии";
    body.innerHTML=`<div class="row wrap"><button id="heritageRoute">Исторические объекты</button><button id="clearRoute">Очистить</button><button id="playRoute" class="primary">▶ Экскурсия</button></div><div id="routeItems"></div>`;renderRouteItems();$("heritageRoute").onclick=makeHeritageRoute;$("clearRoute").onclick=clearRoute;$("playRoute").onclick=startTour;
  }else if(name==="quality"){
    title.textContent="Качество и задачи";renderQualityTool(body);
  }else if(name==="archive"){
    title.textContent="Архив, импорт и резерв";
    body.innerHTML=`<div class="toolGrid"><button id="exportBackup">Полный JSON</button><button id="exportGeo">GeoJSON</button><button id="exportCsv">CSV реестра</button><button id="exportReport">HTML-отчёт</button></div><hr><label>Импорт JSON/CSV/ZIP/фото<input id="importFiles" type="file" multiple accept=".json,.geojson,.csv,.zip,image/*"></label><button id="runImport" class="primary">Импортировать</button><div id="importResult" class="muted"></div><hr><textarea id="contributionText" rows="3" placeholder="Предложить исторический материал"></textarea><input id="contributionUrl" placeholder="Ссылка на источник"><button id="saveContribution">Сохранить предложение</button>`;
    $("exportBackup").onclick=exportBackup;$("exportGeo").onclick=exportGeo;$("exportCsv").onclick=exportCsv;$("exportReport").onclick=exportReport;$("runImport").onclick=runImport;$("saveContribution").onclick=saveContribution;
  }else if(name==="sections"){
    title.textContent="Разделы проекта";
    body.innerHTML='<div class="toolGrid"><a class="sectionLink" href="./research.html">Исследовательский архив</a><a class="sectionLink" href="./field.html">Полевая съёмка</a><a class="sectionLink" href="./streetview.html">360° Street View</a><a class="sectionLink" href="./ar.html">AR на месте</a><a class="sectionLink" href="./vr.html">VR / WebXR</a><a class="sectionLink" href="./image-tools.html">Фотоинструменты</a><a class="sectionLink" href="./translate.html">Переводы</a><a class="sectionLink" href="./juhuri.html">Архив джуури</a><a class="sectionLink" href="./learn.html">Образование</a><a class="sectionLink" href="./admin.html">Админ-панель</a><a class="sectionLink" href="./status.html">Статус</a><a class="sectionLink" href="./api.html">Open API</a></div>';
  }else if(name==="layers"){
    title.textContent="Слои карты";
    body.innerHTML=`<label><input id="baseToggle" type="checkbox" checked> Базовая OSM-карта</label><br><label><input id="roadToggle" type="checkbox" checked> Дороги</label><br><label><input id="placeToggle" type="checkbox" checked> Точки интереса</label><br><label><input id="lostToggle" type="checkbox" ${state.showLost===false?"":"checked"}> Утраченные здания</label><br><label><input id="progressToggle" type="checkbox" ${state.progressLayer?"checked":""}> Цвет по прогрессу</label><hr><label>XYZ слой дрона / ортофото<input id="customTiles" placeholder="https://…/{z}/{x}/{y}.png"></label><button id="addCustomTiles">Добавить слой</button><button id="removeCustomTiles">Убрать слой</button><div class="sourceItem"><b>Офлайн-векторный режим</b><small>Даже без тайлов OSM локальные дороги и контуры зданий остаются доступны. Поддержка PMTiles предусмотрена как следующий формат базовой карты.</small></div>`;
    $("baseToggle").onchange=e=>map.setLayoutProperty("osm","visibility",e.target.checked?"visible":"none");$("roadToggle").onchange=e=>map.setLayoutProperty("roads-line","visibility",e.target.checked?"visible":"none");$("placeToggle").onchange=e=>map.getLayer("places-dot")&&map.setLayoutProperty("places-dot","visibility",e.target.checked?"visible":"none");$("lostToggle").onchange=e=>{state.showLost=e.target.checked;updateBuildingPaint()};$("progressToggle").onchange=e=>{state.progressLayer=e.target.checked;updateBuildingPaint()};$("addCustomTiles").onclick=()=>{const u=$("customTiles").value.trim();if(!u)return;if(map.getLayer("custom-raster"))map.removeLayer("custom-raster");if(map.getSource("custom-raster"))map.removeSource("custom-raster");map.addSource("custom-raster",{type:"raster",tiles:[u],tileSize:256});map.addLayer({id:"custom-raster",type:"raster",source:"custom-raster",paint:{"raster-opacity":.72}},"roads-line");toast("Пользовательский слой добавлен")};$("removeCustomTiles").onclick=()=>{if(map.getLayer("custom-raster"))map.removeLayer("custom-raster");if(map.getSource("custom-raster"))map.removeSource("custom-raster")};
  }
}

function renderQualityTool(body){
  const fs=state.data?.buildings?.features||[],total=fs.length,edited=fs.filter(f=>houseRecord(f.properties.qqId)).length,photo=fs.filter(f=>houseRecord(f.properties.qqId)?.media?.some(m=>m.type==="photo")).length,complete=fs.filter(f=>completeness(f)>=70).length,tasks=fs.flatMap(f=>issues(f).map(x=>({id:f.properties.qqId,label:label(f),text:x})));
  body.innerHTML=`<div class="toolGrid">${[[total,"объектов"],[edited,"паспортов"],[photo,"с фото"],[complete,"70%+"]].map(([v,k])=>`<div class="metric"><b>${v}</b><small>${k}</small></div>`).join("")}</div><div class="progress"><span style="width:${total?Math.round(complete/total*100):0}%"></span></div><h3>Задачи (${tasks.length})</h3>${tasks.slice(0,100).map(x=>`<button class="taskItem" data-id="${esc(x.id)}"><b>${esc(x.label)}</b><small>${esc(x.text)}</small></button>`).join("")}`;
  body.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>selectHouse(b.dataset.id));
}

function setYear(y){state.year=Math.max(1850,Math.min(CURRENT_YEAR,y));$("yearSlider").value=state.year;$("yearLabel").textContent=state.year;if($("toolYear"))$("toolYear").value=state.year;if(state.selected)renderPassport()}

function nearestPointOnRoad(pos,maxMeters=30){
  let best=null,bestD=Infinity;const latScale=111320,lonScale=111320*Math.cos(pos[1]*Math.PI/180);
  for(const f of state.data?.roads?.features||[]){const c=f.geometry.coordinates;for(let i=0;i<c.length-1;i++){const a=c[i],b=c[i+1];const ax=(a[0]-pos[0])*lonScale,ay=(a[1]-pos[1])*latScale,bx=(b[0]-pos[0])*lonScale,by=(b[1]-pos[1])*latScale,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;let tt=len?-(ax*dx+ay*dy)/len:0;tt=Math.max(0,Math.min(1,tt));const x=ax+tt*dx,y=ay+tt*dy,d=Math.hypot(x,y);if(d<bestD){bestD=d;best=[pos[0]+x/lonScale,pos[1]+y/latScale]}}}
  return bestD<=maxMeters?best:null;
}

function startWalk(){
  state.walk=true;$("walkHud").classList.remove("hidden");$("catalog").classList.add("hidden");$("passport").classList.add("hidden");set3d(true);map.dragPan.disable();map.touchZoomRotate.disable();const snap=nearestPointOnRoad([map.getCenter().lng,map.getCenter().lat],100);if(snap)map.jumpTo({center:snap});map.easeTo({zoom:20.2,pitch:80,duration:450});state.lastFrame=performance.now();walkTick(state.lastFrame);
}
function stopWalk(){state.walk=false;$("walkHud").classList.add("hidden");$("catalog").classList.remove("hidden");state.pressed.clear();cancelAnimationFrame(state.raf);map.dragPan.enable();map.touchZoomRotate.enable();map.easeTo({pitch:55,zoom:17.5,duration:350})}
function walkTick(now){
  if(!state.walk)return;const dt=Math.min((now-state.lastFrame)/1000,.05);state.lastFrame=now;
  const f=(state.pressed.has("KeyW")||state.pressed.has("ArrowUp")||state.pressed.has("forward")?1:0)-(state.pressed.has("KeyS")||state.pressed.has("ArrowDown")||state.pressed.has("back")?1:0);
  const r=(state.pressed.has("KeyD")||state.pressed.has("ArrowRight")||state.pressed.has("right")?1:0)-(state.pressed.has("KeyA")||state.pressed.has("ArrowLeft")||state.pressed.has("left")?1:0);
  if(f||r){const c=map.getCenter(),br=map.getBearing()*Math.PI/180,s=(state.pressed.has("ShiftLeft")||state.pressed.has("ShiftRight"))?6.2:2.6,d=s*dt,e=(Math.sin(br)*f+Math.cos(br)*r)*d,n=(Math.cos(br)*f-Math.sin(br)*r)*d,lat=c.lat+n/110540,lon=c.lng+e/(111320*Math.cos(c.lat*Math.PI/180)),desired=[Math.max(BOUNDS[0][0],Math.min(BOUNDS[1][0],lon)),Math.max(BOUNDS[0][1],Math.min(BOUNDS[1][1],lat))],snap=nearestPointOnRoad(desired,18);map.jumpTo({center:snap||desired})}
  updateFront();state.raf=requestAnimationFrame(walkTick);
}
function updateFront(){if(!map.getLayer("buildings3d"))return;const cv=map.getCanvas(),fs=map.queryRenderedFeatures([cv.clientWidth/2,cv.clientHeight/2],{layers:[state.is3d?"buildings3d":"buildings2d"]}),id=fs?.[0]?.properties?.qqId;if(id){const f=buildingById(String(id));$("frontCard").querySelector("b").textContent=f?label(f):id;$("frontCard").querySelector("small").textContent=id;$("frontCard").dataset.id=id;$("frontCard").classList.remove("hidden")}else $("frontCard").classList.add("hidden")}

function makeHeritageRoute(){const candidates=(state.data?.buildings?.features||[]).filter(heritage);if(!candidates.length)return toast("Нет объектов с историческими тегами");const start=[map.getCenter().lng,map.getCenter().lat],left=[...candidates],ordered=[];let pos=start;while(left.length&&ordered.length<20){let bi=0,bd=Infinity;left.forEach((f,i)=>{const c=centerOf(f),d=(c[0]-pos[0])**2+(c[1]-pos[1])**2;if(d<bd){bd=d;bi=i}});const f=left.splice(bi,1)[0];ordered.push(f.properties.qqId);pos=centerOf(f)}state.route=ordered;drawRoute();renderRouteItems();toast(`Маршрут: ${ordered.length} точек`)}
function drawRoute(){if(map.getLayer("route-line"))map.removeLayer("route-line");if(map.getSource("route"))map.removeSource("route");if(state.route.length<2)return;const coords=state.route.map(id=>centerOf(buildingById(id)));map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:coords},properties:{}}});map.addLayer({id:"route-line",type:"line",source:"route",paint:{"line-color":"#e9a66f","line-width":4,"line-dasharray":[2,1]}})}
function clearRoute(){state.route=[];if(map.getLayer("route-line"))map.removeLayer("route-line");if(map.getSource("route"))map.removeSource("route");renderRouteItems();stopTour()}
function renderRouteItems(){const el=$("routeItems");if(!el)return;el.innerHTML=state.route.length?state.route.map((id,i)=>`<button class="routeItem" data-route-id="${id}"><b>${i+1}. ${esc(label(buildingById(id)))}</b><small>${esc(id)}</small></button>`).join(""):'<div class="sourceItem">Маршрут пока пуст.</div>';el.querySelectorAll("[data-route-id]").forEach(b=>b.onclick=()=>selectHouse(b.dataset.routeId))}
function startTour(){if(!state.route.length)makeHeritageRoute();if(!state.route.length)return;stopTour();let i=0;const step=()=>{const id=state.route[i%state.route.length];selectHouse(id);speakCurrent(false);i++};step();state.tourTimer=setInterval(step,6500);toast("Автоэкскурсия запущена")}
function stopTour(){if(state.tourTimer){clearInterval(state.tourTimer);state.tourTimer=null}}

function speakCurrent(showToast=true){
  if(!state.selected)return;const r=houseRecord(state.selected.properties.qqId);
  if(r?.audioUrl){new Audio(safeUrl(r.audioUrl)).play().catch(()=>{});return}
  const text=[label(state.selected),r?.description||"",r?.year?`Период: ${r.year}.`:""].filter(Boolean).join(". ");
  if(!text)return;if("speechSynthesis"in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=state.lang==="az"?"az-AZ":state.lang==="en"?"en-US":state.lang==="he"?"he-IL":"ru-RU";speechSynthesis.speak(u);if(showToast)toast("Аудиогид использует голос устройства")}else toast("На устройстве нет Speech Synthesis")
}

function locateUser(){
  if(!navigator.geolocation)return toast("Геолокация не поддерживается");
  navigator.geolocation.getCurrentPosition(pos=>{const c=[pos.coords.longitude,pos.coords.latitude];map.flyTo({center:c,zoom:18,duration:600});if(!map.getSource("user")){map.addSource("user",{type:"geojson",data:{type:"Point",coordinates:c}});map.addLayer({id:"user-dot",type:"circle",source:"user",paint:{"circle-radius":8,"circle-color":"#5aa4ff","circle-stroke-color":"#fff","circle-stroke-width":2}})}else map.getSource("user").setData({type:"Point",coordinates:c});toast("Положение показано только после разрешения браузеру")},()=>toast("Доступ к геопозиции не предоставлен"),{enableHighAccuracy:true,timeout:8000});
}

function exportBackup(){download("qirmizi-project-backup.json",JSON.stringify({meta:{exportedAt:new Date().toISOString(),year:state.year},store,data:state.data},null,2))}
function exportGeo(){download("qirmizi-buildings.geojson",JSON.stringify(enrichedBuildings(),null,2),"application/geo+json")}
function exportCsv(){const rows=[["qqId","osmId","title","street","houseNumber","year","status","progress","issues"]];for(const f of state.data.buildings.features){const r=houseRecord(f.properties.qqId);rows.push([f.properties.qqId,f.properties.osmId,r?.title||"",f.properties.street||"",f.properties.houseNumber||"",r?.year||"",r?.status||"existing",completeness(f),issues(f).join("; ")])}download("qirmizi-register.csv",rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n"),"text/csv")}
function exportReport(){const fs=state.data.buildings.features,total=fs.length,edited=fs.filter(f=>houseRecord(f.properties.qqId)).length,photos=fs.filter(f=>houseRecord(f.properties.qqId)?.media?.some(m=>m.type==="photo")).length,complete=fs.filter(f=>completeness(f)>=70).length,taskCount=fs.reduce((n,f)=>n+issues(f).length,0);const html=`<!doctype html><meta charset="utf-8"><title>Отчёт Красной Слободы</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}</style><h1>Цифровая Красная Слобода — отчёт</h1><p>Сформирован: ${new Date().toLocaleString()}</p><table><tr><th>Зданий</th><td>${total}</td></tr><tr><th>Паспортов</th><td>${edited}</td></tr><tr><th>С фотографиями</th><td>${photos}</td></tr><tr><th>Оцифровано 70%+</th><td>${complete}</td></tr><tr><th>Задач качества</th><td>${taskCount}</td></tr></table><h2>Объекты, требующие работы</h2><ol>${fs.filter(f=>issues(f).length>=2).slice(0,100).map(f=>`<li><b>${esc(label(f))}</b> — ${esc(issues(f).join("; "))}</li>`).join("")}</ol>`;download("qirmizi-report.html",html,"text/html")}

async function runImport(){
  const files=[...$("importFiles").files];let n=0,miss=0;
  for(const file of files){
    try{
      if(/\.json$|\.geojson$/i.test(file.name)){const obj=JSON.parse(await file.text());if(obj.store?.records){Object.assign(store.records,obj.store.records);n+=Object.keys(obj.store.records).length}else if(obj.records){Object.assign(store.records,obj.records);n+=Object.keys(obj.records).length}else if(Array.isArray(obj)){for(const r of obj){const id=r.qqId||r.qq_id;if(id){store.records[id]={...(store.records[id]||{}),...r};n++}}}}
      else if(/\.csv$/i.test(file.name)){const lines=(await file.text()).split(/\r?\n/).filter(Boolean),head=parseCsvLine(lines.shift());for(const line of lines){const vals=parseCsvLine(line),row=Object.fromEntries(head.map((h,i)=>[h,vals[i]||""])),id=row.qqId||row.qq_id;if(!id){miss++;continue}store.records[id]={...(store.records[id]||{}),title:row.title||row.name||"",description:row.description||"",year:Number(row.year)||null,status:row.status||"existing",verification:row.verification||"materials",media:store.records[id]?.media||[],sources:store.records[id]?.sources||[],versions:[...(store.records[id]?.versions||[]),{at:new Date().toISOString(),summary:"Импорт CSV"}],issues:store.records[id]?.issues||[]};n++}}
      else if(/\.zip$/i.test(file.name)&&window.fflate){const bytes=new Uint8Array(await file.arrayBuffer()),unz=fflate.unzipSync(bytes);for(const [name,bytes2] of Object.entries(unz)){if(!/\.(jpg|jpeg|png|webp)$/i.test(name))continue;const id=(name.match(/QQ-OSM-(\d+)/i)||[])[0];if(!id||!buildingById(id)){miss++;continue}if(bytes2.length>900000){miss++;continue}const ext=name.split(".").pop().toLowerCase(),mime=ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg",url="data:"+mime+";base64,"+uint8ToBase64(bytes2),r=houseRecord(id)||{media:[],sources:[],versions:[],issues:[]};r.media=[...(r.media||[]),{type:"photo",url,label:name,year:null,source:"ZIP import"}];r.versions=[...(r.versions||[]),{at:new Date().toISOString(),summary:"Импорт фото из ZIP"}];store.records[id]=r;n++}}
      else if(file.type.startsWith("image/")){const id=(file.name.match(/QQ-OSM-(\d+)/i)||[])[0]||state.selected?.properties?.qqId;if(!id||file.size>900000){miss++;continue}const url=await fileDataUrl(file),r=houseRecord(id)||{media:[],sources:[],versions:[],issues:[]};r.media=[...(r.media||[]),{type:"photo",url,label:file.name,year:null,source:"batch import"}];r.versions=[...(r.versions||[]),{at:new Date().toISOString(),summary:"Импорт локального фото"}];store.records[id]=r;n++}
    }catch(e){console.error(e);miss++}
  }
  persist();$("importResult").textContent=`Импортировано: ${n}. Не сопоставлено/слишком крупно: ${miss}.`;
}
function parseCsvLine(line){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===","&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out}
function fileDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file)})}
function uint8ToBase64(u8){let s="";const chunk=0x8000;for(let i=0;i<u8.length;i+=chunk)s+=String.fromCharCode(...u8.subarray(i,i+chunk));return btoa(s)}
function saveContribution(){const text=$("contributionText").value.trim(),url=safeUrl($("contributionUrl").value);if(!text&&!url)return;store.contributions.push({houseId:state.selected?.properties?.qqId||null,text,url,createdAt:new Date().toISOString(),status:"pending"});persist();$("contributionText").value="";$("contributionUrl").value="";toast("Предложение сохранено в резервной базе")}

function applyLanguage(lang){
  state.lang=I18N[lang]?lang:"ru";store.settings.lang=state.lang;localStorage.setItem(STORE_KEY,JSON.stringify(store));document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==="he"?"rtl":"ltr";
  document.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
  if(state.lang==="juh")toast("Интерфейс Juhuri подключён как языковой слой; исторические переводы требуют проверенной терминологии.");
}

function museumOpen(){updateMuseumStats();$("museum").classList.remove("hidden")}
function close(id){$(id)?.classList.add("hidden")}
function shareSelected(){if(!state.selected)return;const u=new URL(location.href);u.searchParams.set("house",state.selected.properties.qqId);navigator.clipboard?.writeText(u.href).then(()=>toast("Ссылка скопирована")).catch(()=>toast(u.href))}
function showQr(){if(!state.selected)return;const u=new URL(location.href);u.searchParams.set("house",state.selected.properties.qqId);$("toolPanel").classList.remove("hidden");$("toolKicker").textContent="QR-КОД";$("toolTitle").textContent=label(state.selected);$("toolBody").innerHTML='<div class="sourceItem"><b>'+esc(state.selected.properties.qqId)+'</b><small>QR ведёт на постоянную ссылку паспорта.</small></div><div style="display:grid;place-items:center;padding:12px"><img width="220" height="220" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(u.href)+'"></div><input value="'+esc(u.href)+'" readonly>'}
function addSelectedToRoute(){if(!state.selected)return;const id=state.selected.properties.qqId;if(!state.route.includes(id))state.route.push(id);drawRoute();toast("Добавлено в маршрут")}

function wire(){
  $("search").oninput=renderList;$("filters").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;$("filters").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));renderList()});
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>close(b.dataset.close));
  $("tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{$("tabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));["today","history","media","sources","edit"].forEach(id=>$(id).classList.toggle("hidden",id!==b.dataset.tab))});
  $("fitBtn").onclick=()=>map.fitBounds(BOUNDS,{padding:50,duration:500});$("modeBtn").onclick=()=>set3d(!state.is3d);$("gpsBtn").onclick=locateUser;$("museumBtn").onclick=museumOpen;$("walkBtn").onclick=startWalk;$("exitWalk").onclick=stopWalk;$("frontOpen").onclick=()=>{const id=$("frontCard").dataset.id;if(id){stopWalk();selectHouse(id)}};
  $("yearSlider").oninput=e=>setYear(Number(e.target.value));$("yearReset").onclick=()=>setYear(CURRENT_YEAR);
  $("saveBtn").onclick=saveRecord;$("issueBtn").onclick=markIssue;$("shareBtn").onclick=shareSelected;$("qrBtn").onclick=showQr;$("speakBtn").onclick=()=>speakCurrent();$("routeHereBtn").onclick=addSelectedToRoute;$("exportHouseBtn").onclick=()=>state.selected&&download(state.selected.properties.qqId+".json",JSON.stringify({feature:state.selected,record:houseRecord(state.selected.properties.qqId)},null,2));
  $("tools").querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>openTool(b.dataset.tool));
  $("museumMapBtn").onclick=()=>close("museum");$("museumTourBtn").onclick=()=>{close("museum");makeHeritageRoute();startTour()};$("screenModeBtn").onclick=()=>{state.screenMode=!state.screenMode;document.body.classList.toggle("screenMode",state.screenMode);close("museum")};
  $("brandBtn").onclick=museumOpen;$("lang").onchange=e=>applyLanguage(e.target.value);
  window.addEventListener("keydown",e=>{if(!state.walk)return;if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight"].includes(e.code)){e.preventDefault();state.pressed.add(e.code)}if(e.code==="Escape")stopWalk()});
  window.addEventListener("keyup",e=>state.pressed.delete(e.code));
  const cv=map.getCanvas();cv.addEventListener("pointerdown",e=>{if(state.walk){state.drag=true;state.lastX=e.clientX;state.lastY=e.clientY;cv.setPointerCapture?.(e.pointerId)}});cv.addEventListener("pointermove",e=>{if(state.walk&&state.drag){const dx=e.clientX-state.lastX,dy=e.clientY-state.lastY;state.lastX=e.clientX;state.lastY=e.clientY;map.jumpTo({bearing:map.getBearing()+dx*.22,pitch:Math.max(58,Math.min(85,map.getPitch()-dy*.16))})}});cv.addEventListener("pointerup",()=>state.drag=false);cv.addEventListener("pointercancel",()=>state.drag=false);
  document.querySelectorAll(".pad button").forEach(b=>{const d=b.dataset.dir;b.addEventListener("pointerdown",e=>{e.preventDefault();state.pressed.add(d)});["pointerup","pointercancel","pointerleave"].forEach(ev=>b.addEventListener(ev,()=>state.pressed.delete(d)))});
}

function init(){
  state.lang=store.settings?.lang||"ru";$("lang").value=state.lang;applyLanguage(state.lang);wire();setYear(CURRENT_YEAR);
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
  map.on("load",loadData);map.on("error",e=>{if(String(e?.error?.message||"").includes("tile"))$("status").textContent="Офлайн-векторный режим · тайлы OSM недоступны"});
  museumOpen();
}
init();
})();