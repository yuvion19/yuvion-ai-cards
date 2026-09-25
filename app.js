document.addEventListener("DOMContentLoaded",()=>{
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const D=window.NITI_DATA||{};
  const safe=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const nav=q(".nav"), menu=q(".menu-btn");
  const navItems=[
    ["/","Вход"],["/portal/","Залы"],["/history/","Хронология"],["/red-sloboda/","Красная Слобода"],
    ["/people/","Люди"],["/culture/","Культура"],["/traditions/","Традиции"],["/juuri/","Джуури"],
    ["/poetry/","Поэзия"],["/wisdom/","Мудрость"],["/library/","Библиотека"],["/organizations/","Фонды"],
    ["/calendar/","Календарь"],["/archive/","Архив"],["/cemetery/","Память"],["/search/","Поиск"]
  ];
  if(nav){const path=location.pathname.endsWith("/")?location.pathname:location.pathname+"/";nav.innerHTML=navItems.map(([u,t])=>`<a href="${u}" class="${path===u?"active":""}">${t}</a>`).join("");}
  menu?.addEventListener("click",()=>{nav?.classList.toggle("open");document.body.classList.toggle("menu-open")});
  const render=(sel,items,fn)=>{const el=q(sel);if(el)el.innerHTML=items.map(fn).join("")};

  render("#books-grid",D.books||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x[0])}</h2><p>${safe(x[1])} · ${safe(x[2])}</p><a class="text-link" target="_blank" rel="noopener" href="${x[3]}">Открыть источник ↗</a></article>`);
  render("#dishes-grid",D.dishes||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x[0])}</h2><p class="juhuri">${safe(x[1])}</p><p>${safe(x[3])}</p><span class="pill">${safe(x[2])}</span></article>`);
  render("#dictionary-grid",D.dictionary||[],x=>`<article class="collection-card"><h2>${safe(x.lemma)}</h2><p><strong>${safe(x.ru)}</strong></p><p>${safe(x.dialect)} · ${safe(x.source)}</p></article>`);
  render("#places-grid",D.places||[],x=>`<article class="collection-card"><span class="pill">${safe(x.kind)}</span><h2>${safe(x.name)}</h2><p class="juhuri">${safe(x.az)}</p><p>${safe(x.note)}</p><small>${safe(x.years)} · ${safe(x.status)}</small></article>`);
  render("#activities-grid",D.activities||[],(x,i)=>`<article data-activity="${i}" class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x[0])}</h2><p>${safe(x[1])}</p><button class="mini-btn mark-done">Отметить пройденным</button></article>`);
  render("#people-grid",D.people||[],(x,i)=>`<article class="person-card"><span class="index">${String(i+1).padStart(2,"0")}</span><div><span class="pill">${safe(x.role)}</span><h2>${safe(x.name)}</h2><p class="museum-years">${safe(x.years)} · ${safe(x.place)}</p><p>${safe(x.note)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.source}">Источник ↗</a></div></article>`);
  render("#organizations-grid",D.organizations||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><span class="pill">${safe(x.kind)}</span><h2>${safe(x.name)}</h2><p class="museum-years">с ${safe(x.since)}</p><p>${safe(x.note)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.source}">Открыть ↗</a></article>`);
  render("#poetry-grid",D.poetry||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x.author)}</h2><p><strong>${safe(x.work)}</strong></p><p>${safe(x.themes)}</p><span class="pill">${safe(x.lang)}</span><a class="text-link block-link" target="_blank" rel="noopener" href="${x.source}">Произведения и источник ↗</a></article>`);
  render("#wisdom-grid",D.wisdom||[],x=>`<article class="wisdom-card"><span class="quote-mark">״</span><h2>${safe(x.title)}</h2><p>${safe(x.text)}</p><small>${String(x.source).startsWith("http")?`<a target="_blank" rel="noopener" href="${x.source}">Источник ↗</a>`:safe(x.source)}</small></article>`);
  render("#traditions-grid",D.traditions||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><span class="pill">${safe(x.group)}</span><h2>${safe(x.name)}</h2><p>${safe(x.note)}</p></article>`);
  render("#milestones-grid",D.milestones||[],x=>`<article class="timeline-object"><time>${safe(x.date)}</time><div><h2>${safe(x.title)}</h2><p>${safe(x.note)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.source}">Источник ↗</a></div></article>`);
  render("#holidays-grid",D.holidays||[],x=>`<article class="holiday-card"><span class="hebrew">${safe(x.he)}</span><h2>${safe(x.name)}</h2><p>${safe(x.note)}</p></article>`);

  const tabs=qa("[data-tab]"); if(tabs.length){const data=[["Истоки","Народ между горами и морем","Древние общины Восточного Кавказа формируют особый язык и культурный уклад."],["Слобода","Город синагог","Красная Слобода становится духовным, ремесленным и торговым центром общины."],["Перемены","Память вопреки времени","Семьи сохраняют традиции, язык и ремёсла в XX веке."],["Диаспора","Дом, который несут с собой","Разъехавшись по миру, люди продолжают связывать новые поколения с Красной Слободой."]];let active=1;const rerender=()=>{tabs.forEach((b,i)=>b.classList.toggle("active",i===active));q("#exhibit-room")&&(q("#exhibit-room").textContent="ЗАЛ "+String(active+1).padStart(2,"0"));q("#exhibit-title")&&(q("#exhibit-title").textContent=data[active][0]);q("#exhibit-subtitle")&&(q("#exhibit-subtitle").textContent=data[active][1]);q("#exhibit-text")&&(q("#exhibit-text").textContent=data[active][2])};tabs.forEach((b,i)=>b.addEventListener("click",()=>{active=i;rerender()}));q("#prev")?.addEventListener("click",()=>{active=(active+3)%4;rerender()});q("#next")?.addEventListener("click",()=>{active=(active+1)%4;rerender()});rerender()}

  const STORE="niti-pamyati-user-data-v1";
  const load=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'{"memories":[],"family":[],"favorites":[],"progress":[],"notes":[]}')}catch{return {memories:[],family:[],favorites:[],progress:[],notes:[]}}};
  const save=x=>localStorage.setItem(STORE,JSON.stringify(x));
  const refreshStore=()=>{const x=load(),stats=q("#store-stats");if(stats)stats.innerHTML=`<strong>${x.memories.length}</strong> записей памяти · <strong>${x.family.length}</strong> персон · <strong>${x.progress.length}</strong> пройденных разделов`;const list=q("#memory-list");if(list)list.innerHTML=x.memories.length?x.memories.map((m,i)=>`<article><h3>${safe(m.title)}</h3><p>${safe(m.text)}</p><small>${safe(m.date)}</small><button data-del-memory="${i}" class="link-button">Удалить</button></article>`).join(""):'<p class="muted">Личных записей пока нет.</p>'};
  q("#memory-form")?.addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget),x=load();x.memories.unshift({title:fd.get("title"),text:fd.get("text"),date:new Date().toLocaleDateString("ru-RU")});save(x);e.currentTarget.reset();refreshStore()});
  document.addEventListener("click",e=>{const b=e.target.closest("[data-del-memory]");if(b){const x=load();x.memories.splice(Number(b.dataset.delMemory),1);save(x);refreshStore()}const done=e.target.closest(".mark-done");if(done){const card=done.closest("[data-activity]"),id=Number(card.dataset.activity),x=load();if(!x.progress.includes(id))x.progress.push(id);save(x);done.textContent="Пройдено ✓";done.disabled=true;refreshStore()}});
  q("#export-data")?.addEventListener("click",()=>{const blob=new Blob([JSON.stringify(load(),null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="niti-pamyati-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)});
  q("#import-data")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{save(JSON.parse(await f.text()));refreshStore();alert("Резервная копия импортирована")}catch{alert("Не удалось прочитать JSON")}});
  q("#clear-data")?.addEventListener("click",()=>{if(confirm("Удалить локальные пользовательские данные этого браузера?")){localStorage.removeItem(STORE);refreshStore()}});
  refreshStore();

  const search=q("#global-search"),results=q("#search-results");
  if(search&&results){const rows=[
    ...(D.books||[]).map(x=>({t:x[0],d:x[1]+" · "+x[2],u:"/library/"})),
    ...(D.dishes||[]).map(x=>({t:x[0],d:x[1]+" · "+x[2],u:"/kitchen/"})),
    ...(D.dictionary||[]).map(x=>({t:x.lemma,d:x.ru,u:"/juuri/"})),
    ...(D.places||[]).map(x=>({t:x.name,d:x.note,u:"/red-sloboda/"})),
    ...(D.people||[]).map(x=>({t:x.name,d:x.role+" · "+x.note,u:"/people/"})),
    ...(D.organizations||[]).map(x=>({t:x.name,d:x.note,u:"/organizations/"})),
    ...(D.traditions||[]).map(x=>({t:x.name,d:x.note,u:"/traditions/"})),
    ...(D.poetry||[]).map(x=>({t:x.author,d:x.work+" · "+x.themes,u:"/poetry/"})),
    ...(D.milestones||[]).map(x=>({t:x.title,d:x.date+" · "+x.note,u:"/history/"}))
  ];const run=()=>{const term=search.value.trim().toLowerCase();const hits=term?rows.filter(x=>(x.t+" "+x.d).toLowerCase().includes(term)).slice(0,80):[];results.innerHTML=hits.map(x=>`<a class="search-hit" href="${x.u}"><strong>${safe(x.t)}</strong><span>${safe(x.d)}</span></a>`).join("")||(term?'<p class="muted">Ничего не найдено.</p>':'')};search.addEventListener("input",run);run()}

  const familyForm=q("#family-form");
  const refreshFamily=()=>{const x=load(),el=q("#family-list");if(el)el.innerHTML=x.family.length?x.family.map((p,i)=>`<article><h3>${safe(p.name)}</h3><p>${safe(p.years)}</p><p>${safe(p.relation)}</p><button class="link-button" data-del-family="${i}">Удалить</button></article>`).join(""):'<p class="muted">Записей пока нет.</p>'};
  familyForm?.addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget),x=load();x.family.unshift({name:fd.get("name"),years:fd.get("years"),relation:fd.get("relation")});save(x);e.currentTarget.reset();refreshFamily();refreshStore()});
  document.addEventListener("click",e=>{const b=e.target.closest("[data-del-family]");if(b){const x=load();x.family.splice(Number(b.dataset.delFamily),1);save(x);refreshFamily();refreshStore()}const w=e.target.closest("[data-del-wish]");if(w){const x=load();x.notes.splice(Number(w.dataset.delWish),1);save(x);refreshWishes();refreshStore()}});
  refreshFamily();

  q("#candle-form")?.addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget),x=load();x.memories.unshift({title:"Свеча памяти: "+fd.get("name"),text:fd.get("text")||"Светлая память",date:new Date().toLocaleDateString("ru-RU"),kind:"candle"});save(x);e.currentTarget.reset();refreshStore();alert("Памятная запись сохранена")});
  const wishForm=q("#wish-form");
  const refreshWishes=()=>{const x=load(),el=q("#wish-list");if(el)el.innerHTML=x.notes.length?x.notes.map((n,i)=>`<article><h3>${safe(n.name||"Без подписи")}</h3><p>${safe(n.text)}</p><button class="link-button" data-del-wish="${i}">Удалить</button></article>`).join(""):'<p class="muted">Пожеланий пока нет.</p>'};
  wishForm?.addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget),x=load();x.notes.unshift({name:fd.get("name"),text:fd.get("text")});save(x);e.currentTarget.reset();refreshWishes();refreshStore()});refreshWishes();

  const hd=q("#hebrew-date");if(hd){try{hd.textContent=new Intl.DateTimeFormat("ru-RU-u-ca-hebrew",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date())}catch{hd.textContent="Еврейский календарь не поддерживается этим браузером"}}
  q("#shabbat-btn")?.addEventListener("click",()=>{const out=q("#shabbat-output");if(!navigator.geolocation){out.textContent="Геолокация не поддерживается";return}out.textContent="Определяю местоположение…";navigator.geolocation.getCurrentPosition(async pos=>{try{const {latitude,longitude}=pos.coords,u="https://www.hebcal.com/shabbat?cfg=json&geo=pos&latitude="+encodeURIComponent(latitude)+"&longitude="+encodeURIComponent(longitude)+"&M=on",res=await fetch(u),json=await res.json(),items=(json.items||[]).filter(i=>/candles|havdalah/i.test(i.category||""));out.innerHTML=items.length?items.map(i=>`<p><strong>${safe(i.title)}</strong><br>${safe(i.date)}</p>`).join(""):"Нет данных"}catch{out.textContent="Не удалось получить время Шаббата."}},()=>{out.textContent="Доступ к местоположению не предоставлен"})});
  const upcoming=q("#upcoming-holidays");if(upcoming){(async()=>{try{const y=new Date().getFullYear(),res=await fetch("https://www.hebcal.com/hebcal?cfg=json&v=1&year="+y+"&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&c=off"),json=await res.json(),today=new Date();const items=(json.items||[]).filter(i=>new Date(i.date)>=today).slice(0,12);upcoming.innerHTML=items.map(i=>`<article class="calendar-row"><time>${new Date(i.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</time><div><strong>${safe(i.title)}</strong><span>${safe(i.hebrew||"")}</span></div></article>`).join("")}catch{upcoming.innerHTML='<p class="muted">Не удалось загрузить ближайшие даты.</p>'}})()}
});