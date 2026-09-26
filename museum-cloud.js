window.MUSEUM_CLOUD={
 url:"https://huvbrphblapbobklttup.supabase.co",
 key:"sb_publishable_NCmeCgGk_eyVUOZjBSxHcg_5bP3DfsM",
 headers(){return {apikey:this.key,Authorization:"Bearer "+this.key}},
 async select(table,query=""){const r=await fetch(this.url+"/rest/v1/"+table+(query?"?"+query:""),{headers:this.headers()});if(!r.ok)throw new Error("read "+r.status);return r.json()},
 async insert(table,row){const r=await fetch(this.url+"/rest/v1/"+table,{method:"POST",headers:{...this.headers(),"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(row)});if(!r.ok)throw new Error("write "+r.status);return true}
};

window.initMuseumCloud=async function(){
 if(window.__nitiCloudInitV4)return;
 window.__nitiCloudInitV4=true;
 const C=window.MUSEUM_CLOUD,q=(s,r=document)=>r.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 let all=Array.isArray(window.NITI_CATALOG)?window.NITI_CATALOG:[];
 try{
   const live=await C.select("museum_content","select=slug,content_type,title,subtitle,summary,category,tags,year_start,year_end,city,source_title,source_url,media_url,thumbnail_url,verification_status,confidence&published=eq.true&order=title.asc&limit=1000");
   if(Array.isArray(live)&&live.length) all=live;
 }catch(e){console.warn("Using static museum catalog fallback",e)}
 window.NITI_ACTIVE_CATALOG=all;

 const typeName={place:"Место",photo:"Фото",person:"Личность",book:"Книга",source:"Источник",article:"Статья",recipe:"Кухня",juhuri_word:"Джуури",juhuri_phrase:"Джуури",proverb:"Мудрость",object:"Предмет",audio:"Аудио",video:"Видео"};
 const card=x=>`<article class="collection-card cloud-card">${x.thumbnail_url?`<img class="cloud-thumb" src="${esc(x.thumbnail_url)}" alt="" loading="lazy">`:""}<span class="pill">${esc(typeName[x.content_type]||x.content_type)} · ${esc(x.verification_status||"")}</span><h2>${esc(x.title)}</h2>${x.subtitle?`<p><strong>${esc(x.subtitle)}</strong></p>`:""}<p>${esc(x.summary||"")}</p><small>${esc([x.city,x.category,x.source_title].filter(Boolean).join(" · "))}</small>${x.source_url?`<a class="text-link block-link" target="_blank" rel="noopener" href="${esc(x.source_url)}">Источник ↗</a>`:""}</article>`;

 const counts={all:all.length,books:all.filter(x=>x.content_type==="book").length,people:all.filter(x=>x.content_type==="person").length,sources:all.filter(x=>x.content_type==="source").length};
 Object.entries(counts).forEach(([k,v])=>document.querySelectorAll('[data-cloud-stat="'+k+'"]').forEach(e=>e.textContent=v));

 const featured=q("#cloud-featured");
 if(featured){
   const f=all.filter(x=>["person","place","book","photo","article"].includes(x.content_type)).slice(0,12);
   featured.innerHTML=f.map(card).join("")||'<p class="muted">Каталог пока не загружен.</p>';
 }

 const grid=q("#cloud-catalog");
 const renderCatalog=()=>{
   if(!grid)return;
   const term=(q("#catalog-search")?.value||"").trim().toLowerCase(),type=q("#catalog-type")?.value||"";
   const hit=all.filter(x=>(!type||x.content_type===type)&&(!term||(x.title+" "+(x.subtitle||"")+" "+(x.summary||"")+" "+(x.category||"")+" "+(x.city||"")).toLowerCase().includes(term)));
   grid.innerHTML=hit.map(card).join("")||'<p class="muted">Ничего не найдено.</p>';
   const st=q("#catalog-stats");if(st)st.textContent=hit.length+" карточек показано · "+all.length+" опубликовано";
 };
 q("#catalog-search")?.addEventListener("input",renderCatalog);
 q("#catalog-type")?.addEventListener("change",renderCatalog);
 renderCatalog();

 const search=q("#global-search"),cloudSearch=q("#cloud-search-results"),searchType=q("#search-type");
 if(search){
   if(!cloudSearch){const e=document.createElement("div");e.id="cloud-search-results";q("#search-results")?.after(e);}
   const out=q("#cloud-search-results");
   const run=()=>{
     const term=search.value.trim().toLowerCase(),t=searchType?.value||"";
     const map={book:["book","source"],dish:["recipe"],word:["juhuri_word","juhuri_phrase"],place:["place"],person:["person"],organization:["article"],tradition:["article"],poetry:["article"],history:["article"]},types=map[t]||null;
     const hit=term?all.filter(x=>(!types||types.includes(x.content_type))&&(x.title+" "+(x.subtitle||"")+" "+(x.summary||"")+" "+(x.category||"")+" "+(x.city||"")).toLowerCase().includes(term)).slice(0,100):[];
     if(out)out.innerHTML=hit.length?'<h2 class="cloud-search-title">Облачный музейный каталог</h2>'+hit.map(x=>`<div class="search-hit"><strong>${esc(x.title)}</strong><span>${esc((x.summary||"").slice(0,220))}</span>${x.source_url?`<a class="text-link" target="_blank" rel="noopener" href="${esc(x.source_url)}">Источник ↗</a>`:""}</div>`).join(""):"";
   };
   search.addEventListener("input",run);searchType?.addEventListener("change",run);
 }

 const path=location.pathname.endsWith("/")?location.pathname:location.pathname+"/";
 const matchers={
  "/people/":x=>x.content_type==="person",
  "/library/":x=>["book","source"].includes(x.content_type),
  "/red-sloboda/":x=>x.content_type==="place",
  "/juuri/":x=>["juhuri_word","juhuri_phrase"].includes(x.content_type)||((x.tags||[]).includes("джуури")),
  "/kitchen/":x=>x.content_type==="recipe",
  "/photos/":x=>x.content_type==="photo",
  "/archive/":x=>["photo","book","source","audio","video"].includes(x.content_type),
  "/organizations/":x=>x.category==="организации"||x.category==="современная жизнь",
  "/poetry/":x=>x.category==="литература"||((x.tags||[]).includes("поэзия")),
  "/calendar/":x=>x.category==="календарь",
  "/traditions/":x=>x.category==="традиции"||((x.tags||[]).includes("традиции")),
  "/wisdom/":x=>x.content_type==="proverb",
  "/history/":x=>["история","исследования","периодика"].includes(x.category)
 };
 const fn=matchers[path];
 if(fn&&all.length&&!q(".cloud-collection")){
   const hit=all.filter(fn).slice(0,120);
   if(hit.length){
     const sec=document.createElement("section");sec.className="section paper cloud-collection";
     sec.innerHTML=`<div class="section-head" style="border-color:var(--line)"><div><span class="label teal">Музейная база</span><h2>Материалы раздела</h2></div><a class="text-link" href="/catalog/">Весь каталог ↗</a></div><div class="collections-grid">${hit.map(card).join("")}</div>`;
     q("main")?.appendChild(sec);
   }
 }

 try{
   const events=await C.select("museum_events","select=title,summary,starts_at,city,venue,source_url&published=eq.true&order=starts_at.asc&limit=12");
   const el=q("#cloud-events");if(el)el.innerHTML=events.length?events.map(x=>`<article class="calendar-row"><time>${x.starts_at?new Date(x.starts_at).toLocaleDateString("ru-RU"):"Дата уточняется"}</time><div><strong>${esc(x.title)}</strong><span>${esc([x.city,x.venue].filter(Boolean).join(" · "))}</span><p>${esc(x.summary||"")}</p></div></article>`).join(""):'<p class="muted">Проверенных будущих мероприятий пока нет.</p>';
 }catch{}
 try{
   const news=await C.select("project_news","select=title,summary,published_at,url&published=eq.true&order=published_at.desc&limit=8");
   const el=q("#project-news");if(el)el.innerHTML=news.map(x=>`<article class="news-item"><time>${new Date(x.published_at).toLocaleDateString("ru-RU")}</time><h3>${esc(x.title)}</h3><p>${esc(x.summary||"")}</p>${x.url?`<a class="text-link" href="${esc(x.url)}">Подробнее ↗</a>`:""}</article>`).join("");
 }catch{}

 q("#correction-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("museum_corrections",{target_url:location.pathname,issue_text:f.get("issue"),proposed_text:f.get("proposal")||null,source_url:f.get("source")||null,contact_note:f.get("contact")||null});e.currentTarget.reset();alert("Исправление отправлено на проверку.")}catch{alert("Не удалось отправить.")}});
 q("#newsletter-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("newsletter_subscriptions",{email:f.get("email"),locale:"ru"});e.currentTarget.reset();alert("Подписка сохранена.")}catch{alert("Адрес уже подписан или временно недоступен.")}});
 q("#cloud-contribute-form")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await C.insert("community_submissions",{kind:f.get("type"),title:f.get("title"),description:f.get("description")||null,source_note:f.get("source")||null,contact_note:f.get("contact")||null,rights_confirmed:!!f.get("rights")});e.currentTarget.reset();alert("Материал отправлен на модерацию.")}catch{alert("Не удалось отправить материал.")}});
 q("#museum-assistant-form")?.addEventListener("submit",e=>{e.preventDefault();const term=String(new FormData(e.currentTarget).get("q")||"").trim().toLowerCase(),out=q("#assistant-output");const hit=all.filter(x=>(x.title+" "+(x.summary||"")).toLowerCase().includes(term.split(" ")[0])).slice(0,5);out.innerHTML=hit.length?hit.map(x=>`<article class="search-hit"><strong>${esc(x.title)}</strong><span>${esc(x.summary||"")}</span>${x.source_url?`<a class="text-link" target="_blank" rel="noopener" href="${esc(x.source_url)}">Источник ↗</a>`:""}</article>`).join(""):'<p class="muted">В архиве проекта пока нет подтверждённых данных для ответа.</p>'});
 q("#kids-toggle")?.addEventListener("click",e=>{document.body.classList.toggle("kids-mode");e.currentTarget.textContent=document.body.classList.contains("kids-mode")?"Обычный режим":"Детский режим"});
 qa("[data-read-mode]").forEach(b=>b.addEventListener("click",()=>{document.body.classList.toggle("compact-reading",b.dataset.readMode==="short");qa("[data-read-mode]").forEach(x=>x.classList.toggle("active",x===b))}));
};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>window.initMuseumCloud(),{once:true});else window.initMuseumCloud();