(() => {
  const H=window.H,E=H.esc,B=H.badge;
  const source=id=>H.knowledgeSources.find(s=>s.id===id);

  H.nav.splice(Math.max(1,H.nav.findIndex(x=>x[0]==='library')),0,['knowledge','Энциклопедия','▦']);

  H.knowledgeSourceHtml=(ids=[])=>{
    if(!ids.length)return '<span class="knowledge-authored">Авторский материал проекта</span>';
    return '<div class="knowledge-sources">'+ids.map(id=>{
      const s=source(id);if(!s)return '';
      return '<a href="'+E(s.url)+'" target="_blank" rel="noopener">'+E(s.title)+' ↗</a>';
    }).join('')+'</div>';
  };

  H.knowledgeCard=k=>'<article class="knowledge-card" data-cat="'+E(k.cat)+'" data-search="'+E(H.norm(k.title+' '+k.summary+' '+k.cat))+'">'+
    '<div class="knowledge-top"><span class="type">'+E(k.cat)+'</span>'+(k.authored?'<span class="badge soft">Авторский материал</span>':'<span class="badge ok">С источником</span>')+'</div>'+
    '<h3>'+E(k.title)+'</h3>'+
    (k.years?'<div class="knowledge-years">'+E(k.years)+'</div>':'')+
    '<p>'+E(k.summary)+'</p>'+
    H.knowledgeSourceHtml(k.sourceIds)+
    '</article>';

  H.pages.knowledge=()=>{
    const cats=[...new Set(H.knowledge.map(k=>k.cat))].sort((a,b)=>a.localeCompare(b,'ru'));
    const sourced=H.knowledge.filter(k=>k.sourceIds?.length).length;
    const authored=H.knowledge.filter(k=>k.authored).length;
    return H.head('KNOWLEDGE BASE','Энциклопедия наследия','Большая внутренняя база: книги, люди, поэзия, меценаты, здания, музыка, фамилии, фольклор, Тора, календарь, праздники, фотоархивы и материалы о сохранении памяти.')+
      '<section class="stats-row knowledge-stats">'+H.stat('материалов',H.knowledge.length)+H.stat('со ссылками на источники',sourced)+H.stat('авторских материалов',authored,'явно помечены')+H.stat('тематических разделов',cats.length)+'</section>'+
      '<div class="knowledge-toolbar"><input id="knowledgeSearch" class="field big" placeholder="Поиск: поэт, Тора, Песах, фамилия, музей…"><select id="knowledgeCat" class="field"><option value="">Все темы</option>'+cats.map(c=>'<option>'+E(c)+'</option>').join('')+'</select></div>'+
      '<div class="knowledge-cats">'+cats.map(c=>'<button data-kcat="'+E(c)+'">'+E(c)+' <small>'+H.knowledge.filter(k=>k.cat===c).length+'</small></button>').join('')+'</div>'+
      '<div id="knowledgeCount" class="result-count"></div>'+
      '<section class="knowledge-grid" id="knowledgeGrid">'+H.knowledge.map(H.knowledgeCard).join('')+'</section>';
  };

  H.knowledgeSection=route=>{
    if(route==='knowledge')return '';
    const cats=H.knowledgeRouteMap[route]||['Самобытность','Пожелания проекта','Книги'];
    let items=[];
    for(const cat of cats){
      const take=H.knowledge.filter(k=>k.cat===cat&&!items.some(x=>x.id===k.id)).slice(0,2);
      items.push(...take);
    }
    items=items.slice(0,8);
    if(!items.length)return '';
    const wish=H.knowledge.find(k=>k.cat==='Пожелания проекта'&&cats.includes('Пожелания проекта'));
    return '<section class="knowledge-shelf section-block"><div class="section-title"><div><div class="kicker">ЗНАНИЯ И ПАМЯТЬ</div><h2>Полезно в этом разделе</h2></div><a class="text-link" href="#/knowledge">Вся энциклопедия →</a></div>'+
      (wish?'<blockquote class="memory-callout"><span>Пожелание проекта</span>'+E(wish.summary)+'</blockquote>':'')+
      '<div class="knowledge-mini-grid">'+items.map(H.knowledgeCard).join('')+'</div></section>';
  };

  const oldRecords=H.records;
  H.records=()=>[...oldRecords(),...H.knowledge.map(k=>({...k,kind:'knowledge',status:k.authored?'hypothesis':'documented'}))];
  const oldRecordRoute=H.recordRoute;
  H.recordRoute=x=>x.kind==='knowledge'?'knowledge':oldRecordRoute(x);

  const oldShell=H.shell;
  H.shell=html=>oldShell(html+H.knowledgeSection(H.route()));
})();