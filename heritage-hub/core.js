(() => {
  const H = window.H = {};
  H.D = window.HERITAGE_DATA;
  H.$ = (s,r=document)=>r.querySelector(s);
  H.$$ = (s,r=document)=>[...r.querySelectorAll(s)];
  H.esc = (v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  H.norm = (v='')=>String(v).toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
  H.source = id=>H.D.sources.find(s=>s.id===id);
  H.statusLabel = s=>H.D.confidence[s]||s||'Не указан';
  H.badge = s=>'<span class="badge '+(['documented','witnesses'].includes(s)?'ok':s==='demo'?'demo':s==='unverified'?'warn':'soft')+'">'+H.esc(H.statusLabel(s))+'</span>';
  H.route = ()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'home';
  H.nav = [
    ['home','Главная','⌂'],['red-village','Красная Слобода','◈'],['archive','Архив','▤'],
    ['families','Семьи и люди','⌘'],['cemetery','Кладбище','✦'],['juhuri','Джуури','א'],
    ['learn','Учить джуури','◫'],['culture','Культура','✧'],['library','Библиотека','▥'],
    ['cuisine','Кухня','◌'],['voices','Голоса народа','◉'],['ask','Спроси архив','⌕'],
    ['research','Исследования','◇'],['methodology','Методология','✓'],['contribute','Передать материал','＋'],['about','О проекте','i']
  ];
  H.sourcesHtml = (ids=[])=>{
    if(!ids.length)return '<p class="muted small">Источники пока не прикреплены.</p>';
    return '<div class="source-list">'+ids.map(id=>{const s=H.source(id);if(!s)return '';const m=[s.year,s.place,s.accessed&&('доступ '+s.accessed)].filter(Boolean).join(' · ');return '<div class="source-row"><div><strong>'+H.esc(s.title)+'</strong>'+(m?'<div class="small muted">'+H.esc(m)+'</div>':'')+'</div>'+(s.url?'<a class="mini-link" href="'+H.esc(s.url)+'" target="_blank" rel="noopener">источник ↗</a>':'')+'</div>';}).join('')+'</div>';
  };
  H.records=()=>{
    const d=H.D;
    return [
      ...d.places,...d.families,...d.people,...d.archive,...d.burials,
      ...d.juhuri.map(x=>({...x,title:x.lemma,summary:(x.ru||[]).join(', ')})),
      ...d.books.map(x=>({...x,kind:'book',summary:x.note,status:'documented'})),
      ...d.dishes.map(x=>({...x,kind:'dish',summary:x.note,status:'unverified'})),
      ...d.legacySections.map(x=>({...x,kind:'section',summary:x.body}))
    ];
  };
  H.recordText=x=>H.norm([x.title,x.alt,x.type,x.address,x.summary,x.history,x.period,x.place,x.years,x.subtype,x.lemma,(x.ru||[]).join(' '),(x.spellings||[]).join(' '),(x.geography||[]).join(' ')].filter(Boolean).join(' '));
  H.search=q=>{
    const nq=H.norm(q);if(nq.length<2)return[];const ts=nq.split(' ').filter(t=>t.length>1);
    return H.records().map(x=>{const txt=H.recordText(x);let score=0;ts.forEach(t=>{if(txt.includes(t))score+=2;if(H.norm(x.title||'').includes(t))score+=4});return{x,score}}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,30);
  };
  H.recordRoute=x=>x.kind==='word'?'juhuri':x.kind==='dish'?'cuisine':x.kind==='book'?'library':(x.kind==='family'||x.kind==='person')?'families':x.kind==='burial'?'cemetery':x.kind==='archive'?'archive':x.kind==='place'?'red-village':x.kind==='section'?'culture':'home';
  H.head=(k,t,d,a='')=>'<section class="page-head"><div><div class="kicker">'+H.esc(k)+'</div><h1>'+H.esc(t)+'</h1><p>'+H.esc(d)+'</p></div>'+(a?'<div class="page-actions">'+a+'</div>':'')+'</section>';
  H.stat=(l,v,n='')=>'<div class="stat"><strong>'+H.esc(v)+'</strong><span>'+H.esc(l)+'</span>'+(n?'<small>'+H.esc(n)+'</small>':'')+'</div>';
  H.shell=html=>{
    const cur=H.route();
    return '<div class="site"><aside class="sidebar" id="sidebar"><div class="brand-wrap"><a class="brand" href="#/home"><span class="brand-mark">נ</span><span><strong>Нити Памяти</strong><small>Mountain Jewish Heritage Network</small></span></a><button class="close-nav" id="closeNav">×</button></div><nav class="side-nav">'+H.nav.map(([id,l,i])=>'<a class="'+(cur===id?'active':'')+'" href="#/'+id+'"><span>'+i+'</span><b>'+l+'</b></a>').join('')+'</nav><div class="side-foot"><div class="integrity"><span class="integrity-dot"></span><span>Без платных API<br><small>данные с уровнями достоверности</small></span></div><button class="theme-btn" id="themeBtn">◐ Тема</button></div></aside><div class="overlay" id="overlay"></div><section class="main-shell"><header class="topbar"><button class="menu-btn" id="menuBtn">☰</button><div class="global-search"><span>⌕</span><input id="globalSearch" placeholder="Поиск по людям, домам, архиву, джуури…"><div class="search-pop" id="searchPop"></div></div><div class="top-actions"><a class="quiet-link" href="#/methodology">Достоверность</a><a class="primary-small" href="#/contribute">＋ Добавить</a></div></header><main id="content" class="content">'+html+'</main><footer class="footer"><span>Нити Памяти · '+new Date().getFullYear()+'</span><span>Создатель проекта — '+H.esc(H.D.project.creator)+'</span></footer></section></div>';
  };
  H.download=(name,blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  H.json=(name,data)=>H.download(name,new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  H.csv=(name,rows)=>{const c=['kind','id','title','status','summary'];const s=[c.join(','),...rows.map(r=>c.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(','))].join('\n');H.download(name,new Blob([s],{type:'text/csv;charset=utf-8'}))};
  H.getLocal=()=>{try{return JSON.parse(localStorage.getItem('heritage-contribs')||'[]')}catch{return[]}};
  H.saveLocal=x=>{const a=H.getLocal();a.push({...x,id:String(Date.now())+'-'+Math.random().toString(36).slice(2),createdAt:new Date().toISOString()});localStorage.setItem('heritage-contribs',JSON.stringify(a))};
})();