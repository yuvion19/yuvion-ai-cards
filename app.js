document.addEventListener("DOMContentLoaded",()=>{
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const D=window.NITI_DATA||{};
  const safe=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const nav=q(".nav"), menu=q(".menu-btn");
  const navItems=[
    ["/","Главная"],["/history/","История"],["/red-sloboda/","Красная Слобода"],
    ["/juuri/","Джуури"],["/culture/","Культура"],["/archive/","Архив"],["/cemetery/","Память"]
  ];
  if(nav){
    const path=location.pathname.endsWith("/")?location.pathname:location.pathname+"/";
    nav.innerHTML=navItems.map(([u,t])=>`<a href="${u}" class="${path===u?"active":""}">${t}</a>`).join("")
      + '<a href="/search/" class="nav-search">⌕ Поиск</a>';
  }
  menu?.addEventListener("click",()=>{nav?.classList.toggle("open");document.body.classList.toggle("menu-open")});
  const render=(sel,items,fn)=>{const el=q(sel);if(el)el.innerHTML=items.map(fn).join("")};

  render("#juhuri-facts",D.juhuriFacts||[],x=>`<article class="collection-card"><span class="pill">${safe(x.source)}</span><h2>${safe(x.title)}</h2><p>${safe(x.text)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.url}">Источник ↗</a></article>`);
  render("#literature-facts",D.literatureFacts||[],x=>`<article class="collection-card"><span class="pill">${safe(x.source)}</span><h2>${safe(x.title)}</h2><p>${safe(x.text)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.url}">Источник ↗</a></article>`);
  render("#red-village-facts",D.redVillageFacts||[],x=>`<article class="collection-card"><span class="pill">${safe(x.source)}</span><h2>${safe(x.title)}</h2><p>${safe(x.text)}</p><a class="text-link" target="_blank" rel="noopener" href="${x.url}">Источник ↗</a></article>`);
  render("#archive-collections",D.archiveCollections||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x.title)}</h2><p>${safe(x.note)}</p></article>`);
  render("#culture-exhibits",D.cultureExhibits||[],(x,i)=>`<article class="collection-card"><span class="index">${String(i+1).padStart(2,"0")}</span><h2>${safe(x.title)}</h2><p>${safe(x.note)}</p></article>`);
  render("#juhuri-lessons",D.juhuriLessons||[],x=>`<article class="collection-card"><span class="index">Урок ${safe(x.n)}</span><h2>${safe(x.title)}</h2><p>${safe(x.note)}</p><button class="mini-btn mark-lesson" data-lesson="${safe(x.n)}">Отметить изученным</button></article>`);
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
  document.addEventListener("click",e=>{const b=e.target.closest("[data-del-memory]");if(b){const x=load();x.memories.splice(Number(b.dataset.delMemory),1);save(x);refreshStore()}const done=e.target.closest(".mark-done");if(done){const card=done.closest("[data-activity]"),id=Number(card.dataset.activity),x=load();if(!x.progress.includes(id))x.progress.push(id);save(x);done.textContent="Пройдено ✓";done.disabled=true;refreshStore()}const lesson=e.target.closest(".mark-lesson");if(lesson){const id="lesson:"+lesson.dataset.lesson,x=load();if(!x.progress.includes(id))x.progress.push(id);save(x);lesson.textContent="Изучено ✓";lesson.disabled=true;refreshStore()}});
  q("#export-data")?.addEventListener("click",()=>{const blob=new Blob([JSON.stringify(load(),null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="niti-pamyati-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)});
  q("#import-data")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{save(JSON.parse(await f.text()));refreshStore();alert("Резервная копия импортирована")}catch{alert("Не удалось прочитать JSON")}});
  q("#clear-data")?.addEventListener("click",()=>{if(confirm("Удалить локальные пользовательские данные этого браузера?")){localStorage.removeItem(STORE);refreshStore()}});
  refreshStore();

  const search=q("#global-search"),results=q("#search-results"),typeFilter=q("#search-type");
  if(search&&results){const rows=[
    ...(D.books||[]).map(x=>({t:x[0],d:x[1]+" · "+x[2],u:"/library/",type:"book"})),
    ...(D.dishes||[]).map(x=>({t:x[0],d:x[1]+" · "+x[2],u:"/kitchen/",type:"dish"})),
    ...(D.dictionary||[]).map(x=>({t:x.lemma,d:x.ru,u:"/juuri/",type:"word"})),
    ...(D.places||[]).map(x=>({t:x.name,d:x.note,u:"/red-sloboda/",type:"place"})),
    ...(D.people||[]).map(x=>({t:x.name,d:x.role+" · "+x.note,u:"/people/",type:"person"})),
    ...(D.organizations||[]).map(x=>({t:x.name,d:x.note,u:"/organizations/",type:"organization"})),
    ...(D.traditions||[]).map(x=>({t:x.name,d:x.note,u:"/traditions/",type:"tradition"})),
    ...(D.poetry||[]).map(x=>({t:x.author,d:x.work+" · "+x.themes,u:"/poetry/",type:"poetry"})),
    ...(D.milestones||[]).map(x=>({t:x.title,d:x.date+" · "+x.note,u:"/history/",type:"history"}))
  ];
  const run=()=>{const term=search.value.trim().toLowerCase(),type=typeFilter?.value||"";const hits=rows.filter(x=>(!type||x.type===type)&&(!term||(x.t+" "+x.d).toLowerCase().includes(term))).slice(0,100);results.innerHTML=hits.map(x=>`<a class="search-hit" href="${x.u}"><strong>${safe(x.t)}</strong><span>${safe(x.d)}</span><small>${safe(x.type)}</small></a>`).join("")||(term||type?'<p class="muted">Ничего не найдено.</p>':'')};
  search.addEventListener("input",run);typeFilter?.addEventListener("change",run);run()}

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
  const autoFavorite=q(".content-hero"); if(autoFavorite&&!q("[data-favorite]",autoFavorite)){const b=document.createElement("button");b.className="mini-btn";b.dataset.favorite="1";b.textContent="★ Сохранить";const wrap=document.createElement("div");wrap.className="section-tools";wrap.appendChild(b);autoFavorite.appendChild(wrap)}
  const autoFavoriteReady=true;
  // Museum 2.0: theme, language preference, daily learning, favorites/history, PWA.
  const uiPrefsKey="niti-pamyati-ui-v2";
  const prefs=(()=>{try{return JSON.parse(localStorage.getItem(uiPrefsKey)||"{}")}catch{return {}}})();
  const savePrefs=()=>localStorage.setItem(uiPrefsKey,JSON.stringify(prefs));
  if(prefs.theme==="dark") document.documentElement.dataset.theme="dark";
  const controls=document.createElement("div"); controls.className="museum-controls";
  controls.innerHTML='<button id="theme-toggle" aria-label="Сменить тему">◐</button><select id="lang-select" aria-label="Язык интерфейса"><option value="ru">RU</option><option value="en">EN</option><option value="he">HE</option><option value="az">AZ</option><option value="jud">JUH</option></select>';
  q(".site-header")?.appendChild(controls);
  q("#lang-select")&&(q("#lang-select").value=prefs.lang||"ru");
  q("#theme-toggle")?.addEventListener("click",()=>{prefs.theme=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=prefs.theme==="dark"?"dark":"";savePrefs()});
  q("#lang-select")?.addEventListener("change",e=>{prefs.lang=e.target.value;savePrefs();document.documentElement.lang=e.target.value==="jud"?"ru":e.target.value;document.documentElement.dir=e.target.value==="he"?"rtl":"ltr";alert("Выбор языка сохранён. Полный перевод разделов будет подключаться по мере верификации текстов.")});

  const dict=D.dictionary||[];
  const dayIndex=dict.length?Math.floor(Date.now()/86400000)%dict.length:0, word=dict[dayIndex];
  if(word&&q("#word-of-day")) q("#word-of-day").innerHTML=`<span class="label teal">Слово дня</span><h2>${safe(word.lemma)}</h2><p><strong>${safe(word.ru)}</strong></p><small>${safe(word.dialect)} · ${safe(word.source)}</small><button class="mini-btn" id="learn-word">Добавить в изученные</button>`;
  q("#learn-word")?.addEventListener("click",()=>{const x=load();const key="word:"+word.lemma;if(!x.progress.includes(key))x.progress.push(key);save(x);q("#learn-word").textContent="Изучено ✓";refreshStore()});

  const historyKey="niti-pamyati-history-v1";
  const viewed=(()=>{try{return JSON.parse(localStorage.getItem(historyKey)||"[]")}catch{return []}})();
  const current={url:location.pathname,title:document.title.split(" — ")[0],at:Date.now()};
  const nextViewed=[current,...viewed.filter(x=>x.url!==current.url)].slice(0,20);
  localStorage.setItem(historyKey,JSON.stringify(nextViewed));
  const recent=q("#recently-viewed"); if(recent) recent.innerHTML=nextViewed.slice(1,5).map(x=>`<a href="${x.url}">${safe(x.title)}</a>`).join("")||'<span class="muted">История просмотров появится после перехода по разделам.</span>';

  document.addEventListener("click",e=>{
    const fav=e.target.closest("[data-favorite]");
    if(fav){const x=load(),item={url:location.pathname,title:document.title.split(" — ")[0]};const i=x.favorites.findIndex(v=>v.url===item.url);if(i>=0)x.favorites.splice(i,1);else x.favorites.push(item);save(x);fav.textContent=i>=0?"★ Сохранить":"★ Сохранено";refreshStore()}
  });
  qa("[data-favorite]").forEach(btn=>{const x=load();if(x.favorites.some(v=>v.url===location.pathname))btn.textContent="★ Сохранено"});

  q("#install-pwa")?.addEventListener("click",()=>alert("На iPhone: Поделиться → На экран «Домой». На Android/Chrome используйте пункт «Установить приложение»."));
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});

  q("#kiosk-toggle")?.addEventListener("click",()=>{document.body.classList.toggle("kiosk-mode"); if(document.body.requestFullscreen&&!document.fullscreenElement)document.body.requestFullscreen().catch(()=>{}); else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})});

  const submitForm=q("#contribute-form");
  submitForm?.addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const key="niti-pamyati-contributions-v1";let arr=[];try{arr=JSON.parse(localStorage.getItem(key)||"[]")}catch{}arr.unshift({type:fd.get("type"),title:fd.get("title"),description:fd.get("description"),source:fd.get("source"),date:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(arr));e.currentTarget.reset();alert("Материал сохранён локально как черновик. Публикация возможна только после проверки.")});

  qa("[data-history-mode]").forEach(btn=>btn.addEventListener("click",()=>{
    const mode=btn.dataset.historyMode;
    qa("[data-history-mode]").forEach(b=>b.classList.toggle("active",b===btn));
    qa("[data-detail='full']").forEach(el=>el.hidden=mode!=="full");
  }));
  const correctionForm=q("#correction-form");
  correctionForm?.addEventListener("submit",e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget),key="niti-pamyati-corrections-v1";
    let arr=[]; try{arr=JSON.parse(localStorage.getItem(key)||"[]")}catch{}
    arr.unshift({problem:fd.get("problem"),proposal:fd.get("proposal"),source:fd.get("source"),page:fd.get("page")||location.pathname,date:new Date().toISOString(),status:"draft"});
    localStorage.setItem(key,JSON.stringify(arr)); e.currentTarget.reset(); alert("Исправление сохранено как черновик для проверки.");
  });
  const pageField=q("#correction-form [name='page']"); if(pageField&&!pageField.value) pageField.value=document.referrer||location.pathname;

});
import("/museum-v3.js").catch(function(e){console.warn("Museum v3 unavailable",e);});


document.addEventListener("DOMContentLoaded",()=>{
 const C=window.MUSEUM_CLOUD,q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 (async()=>{if(!C)return;
  try{const a=await C.select("museum_content","select=slug,content_type,title,summary,category,city,source_url&published=eq.true&featured=eq.true&order=updated_at.desc&limit=8"),e=q("#cloud-featured");if(e)e.innerHTML=a.map(x=>`<article class="collection-card"><span class="pill">${esc(x.content_type)}</span><h2>${esc(x.title)}</h2><p>${esc(x.summary)}</p><small>${esc(x.city||x.category||"")}</small></article>`).join("")}catch{}
  try{const a=await C.select("museum_events","select=title,summary,starts_at,city,venue,source_url&published=eq.true&order=starts_at.asc&limit=8"),e=q("#cloud-events");if(e)e.innerHTML=a.length?a.map(x=>`<article class="calendar-row"><time>${x.starts_at?new Date(x.starts_at).toLocaleDateString("ru-RU"):"Дата уточняется"}</time><div><strong>${esc(x.title)}</strong><span>${esc([x.city,x.venue].filter(Boolean).join(" · "))}</span><p>${esc(x.summary||"")}</p></div></article>`).join(""):'<p class="muted">Проверенных будущих мероприятий пока нет.</p>'}catch{}
  try{const a=await C.select("project_news","select=title,summary,published_at,url&published=eq.true&order=published_at.desc&limit=6"),e=q("#project-news");if(e)e.innerHTML=a.map(x=>`<article class="news-item"><time>${new Date(x.published_at).toLocaleDateString("ru-RU")}</time><h3>${esc(x.title)}</h3><p>${esc(x.summary||"")}</p>${x.url?`<a class="text-link" href="${x.url}">Подробнее ↗</a>`:""}</article>`).join("")}catch{}
 })();
 q("#correction-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("museum_corrections",{target_url:location.pathname,issue_text:f.get("issue"),proposed_text:f.get("proposal")||null,source_url:f.get("source")||null,contact_note:f.get("contact")||null});e.currentTarget.reset();alert("Исправление отправлено на проверку.")}catch{alert("Не удалось отправить.")}});
 q("#newsletter-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("newsletter_subscriptions",{email:f.get("email"),locale:"ru"});e.currentTarget.reset();alert("Подписка сохранена.")}catch{alert("Адрес уже подписан или временно недоступен.")}});
 q("#cloud-contribute-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("community_submissions",{kind:f.get("type"),title:f.get("title"),description:f.get("description")||null,source_note:f.get("source")||null,contact_note:f.get("contact")||null,rights_confirmed:!!f.get("rights")});e.currentTarget.reset();alert("Материал отправлен в очередь модерации.")}catch{alert("Не удалось отправить материал.")}});
 q("#kids-toggle")?.addEventListener("click",e=>{document.body.classList.toggle("kids-mode");e.currentTarget.textContent=document.body.classList.contains("kids-mode")?"Обычный режим":"Детский режим"});
 qa("[data-read-mode]").forEach(b=>b.addEventListener("click",()=>{document.body.classList.toggle("compact-reading",b.dataset.readMode==="short");qa("[data-read-mode]").forEach(x=>x.classList.toggle("active",x===b))}));
 qa("[data-lesson]").forEach(b=>b.addEventListener("click",()=>{const k="niti-lessons-v1",a=JSON.parse(localStorage.getItem(k)||"[]"),id=b.dataset.lesson;if(!a.includes(id))a.push(id);localStorage.setItem(k,JSON.stringify(a));b.textContent="Пройдено ✓";b.disabled=true}));
 if(q("#museum-assistant-form"))q("#museum-assistant-form").addEventListener("submit",async e=>{e.preventDefault();const term=String(new FormData(e.currentTarget).get("q")||"").trim().toLowerCase(),out=q("#assistant-output");out.textContent="Ищу в базе музея…";try{const rows=await C.select("museum_content","select=title,summary,source_title,source_url,content_type&published=eq.true&limit=100"),hits=rows.filter(x=>(x.title+" "+(x.summary||"")).toLowerCase().includes(term.split(" ")[0])).slice(0,5);out.innerHTML=hits.length?hits.map(x=>`<article class="search-hit"><strong>${esc(x.title)}</strong><span>${esc(x.summary||"")}</span>${x.source_url?`<a class="text-link" href="${x.source_url}" target="_blank" rel="noopener">Источник ↗</a>`:""}</article>`).join(""):'<p class="muted">В архиве проекта пока нет подтверждённых данных для ответа.</p>'}catch{out.textContent="База музея временно недоступна."}});
});