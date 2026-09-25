window.MUSEUM_CLOUD={
 url:"https://huvbrphblapbobklttup.supabase.co",
 key:"sb_publishable_NCmeCgGk_eyVUOZjBSxHcg_5bP3DfsM",
 async select(table,query=""){const r=await fetch(this.url+"/rest/v1/"+table+(query?"?"+query:""),{headers:{apikey:this.key}});if(!r.ok)throw new Error("read");return r.json()},
 async insert(table,row){const r=await fetch(this.url+"/rest/v1/"+table,{method:"POST",headers:{apikey:this.key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(row)});if(!r.ok)throw new Error("write");return true}
};

document.addEventListener("DOMContentLoaded",async()=>{
 const C=window.MUSEUM_CLOUD;if(!C)return;
 const q=(s,r=document)=>r.querySelector(s), esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 let all=[];
 try{all=await C.select("museum_content","select=slug,content_type,title,subtitle,summary,category,tags,year_start,year_end,city,source_title,source_url,media_url,thumbnail_url,verification_status,confidence&published=eq.true&order=title.asc&limit=500")}catch{}
 const typeName={place:"Место",photo:"Фото",person:"Личность",book:"Книга",source:"Источник",article:"Статья",recipe:"Кухня",juhuri_word:"Джуури",juhuri_phrase:"Джуури",object:"Предмет",audio:"Аудио",video:"Видео"};
 const card=x=>`<article class="collection-card cloud-card" data-type="${esc(x.content_type)}" data-category="${esc(x.category||"")}">${x.thumbnail_url?`<img class="cloud-thumb" src="${esc(x.thumbnail_url)}" alt="" loading="lazy">`:""}<span class="pill">${esc(typeName[x.content_type]||x.content_type)} · ${esc(x.verification_status)}</span><h2>${esc(x.title)}</h2>${x.subtitle?`<p><strong>${esc(x.subtitle)}</strong></p>`:""}<p>${esc(x.summary||"")}</p><small>${esc([x.city,x.category,x.source_title].filter(Boolean).join(" · "))}</small>${x.source_url?`<a class="text-link block-link" target="_blank" rel="noopener" href="${esc(x.source_url)}">Источник ↗</a>`:""}</article>`;
 const renderCatalog=()=>{
   const grid=q("#cloud-catalog");if(!grid)return;
   const term=(q("#catalog-search")?.value||"").trim().toLowerCase(), type=q("#catalog-type")?.value||"";
   const rows=all.filter(x=>(!type||x.content_type===type)&&(!term||(x.title+" "+(x.subtitle||"")+" "+(x.summary||"")+" "+(x.category||"")+" "+(x.city||"")).toLowerCase().includes(term)));
   grid.innerHTML=rows.map(card).join("")||'<p class="muted">Ничего не найдено.</p>';
   const st=q("#catalog-stats");if(st)st.textContent=`${rows.length} карточек показано · ${all.length} опубликовано в облачном каталоге`;
 };
 q("#catalog-search")?.addEventListener("input",renderCatalog);q("#catalog-type")?.addEventListener("change",renderCatalog);renderCatalog();
 const search=q("#global-search"), cloudSearch=q("#cloud-search-results"), searchType=q("#search-type");
 if(search&&cloudSearch){const run=()=>{const term=search.value.trim().toLowerCase(),t=searchType?.value||"";const map={book:["book","source"],dish:["recipe"],word:["juhuri_word","juhuri_phrase"],place:["place"],person:["person"],organization:["article"],tradition:["article"],poetry:["article"],history:["article"]};const types=map[t]||null;const rows=term?all.filter(x=>(!types||types.includes(x.content_type))&&(x.title+" "+(x.subtitle||"")+" "+(x.summary||"")+" "+(x.category||"")+" "+(x.city||"")).toLowerCase().includes(term)).slice(0,100):[];cloudSearch.innerHTML=rows.length?'<h2 class="cloud-search-title">Облачный музейный каталог</h2>'+rows.map(x=>`<div class="search-hit"><strong>${esc(x.title)}</strong><span>${esc((x.summary||"").slice(0,180))}</span>${x.source_url?`<a class="text-link" target="_blank" rel="noopener" href="${esc(x.source_url)}">Источник ↗</a>`:""}</div>`).join(""):""};search.addEventListener("input",run);searchType?.addEventListener("change",run)}
 const path=location.pathname.endsWith("/")?location.pathname:location.pathname+"/";
 const matchers={
  "/people/":x=>x.content_type==="person",
  "/library/":x=>["book","source"].includes(x.content_type),
  "/red-sloboda/":x=>x.content_type==="place",
  "/juuri/":x=>["juhuri_word","juhuri_phrase"].includes(x.content_type),
  "/kitchen/":x=>x.content_type==="recipe",
  "/photos/":x=>x.content_type==="photo",
  "/archive/":x=>["photo","book","source"].includes(x.content_type),
  "/organizations/":x=>x.category==="организации",
  "/poetry/":x=>x.category==="литература",
  "/calendar/":x=>x.category==="календарь",
  "/traditions/":x=>x.category==="традиции",
  "/history/":x=>x.category==="хронология"||((x.tags||[]).includes?.("история"))
 };
 const fn=matchers[path];if(fn&&all.length){const rows=all.filter(fn).slice(0,60);if(rows.length){const sec=document.createElement("section");sec.className="section paper cloud-collection";sec.innerHTML=`<div class="section-head" style="border-color:var(--line)"><div><span class="label teal">Облачный каталог</span><h2>Проверенные карточки раздела</h2></div><a class="text-link" href="/catalog/">Весь каталог ↗</a></div><div class="collections-grid">${rows.map(card).join("")}</div>`;q("main")?.appendChild(sec)}}
});