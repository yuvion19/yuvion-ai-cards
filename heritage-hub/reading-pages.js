(() => {
  const H=window.H,E=H.esc;
  const sourceById=id=>H.knowledgeSources?.find(s=>s.id===id);

  const sourceFootnote=r=>{
    if(!r.source) return '<div class="reader-origin">'+E(r.author||'Авторский материал проекта')+'</div>';
    const s=sourceById(r.source);
    return '<details class="reader-source"><summary>Источник и проверка</summary>'+
      (s?'<p>'+E(s.title)+'</p><a href="'+E(s.url)+'" target="_blank" rel="noopener">Открыть источник ↗</a>':'<p>'+E(r.source)+'</p>')+
      '</details>';
  };

  H.readingCard=(r,open=false)=>'<article class="reader-card '+(open?'open':'')+'" data-reading-id="'+E(r.id)+'">'+
    '<div class="reader-meta"><span>'+E(r.type)+'</span><span>'+E(r.author|| (r.traditional?'Традиционный фольклор':'Нити Памяти'))+'</span></div>'+
    '<h3>'+E(r.title)+'</h3>'+
    '<div class="reader-body">'+r.body.split('\n\n').map(p=>'<p>'+E(p).replace(/\n/g,'<br>')+'</p>').join('')+'</div>'+
    '<div class="reader-tags">'+(r.tags||[]).map(t=>'<span>'+E(t)+'</span>').join('')+'</div>'+
    sourceFootnote(r)+
    '</article>';

  H.readingSection=route=>{
    if(route==='reading') return '';
    const ids=H.readingRouteMap?.[route]||[];
    const items=ids.map(id=>H.reading.find(r=>r.id===id)).filter(Boolean);
    if(!items.length) return '';
    return '<section class="reading-shelf section-block">'+
      '<div class="section-title"><div><div class="kicker">ЧИТАТЬ ПРЯМО ЗДЕСЬ</div><h2>Статьи, истории и тексты</h2><p>Без перехода на другие сайты — откройте материал и читайте внутри раздела.</p></div><a class="text-link" href="#/reading">Открыть всю читальню →</a></div>'+
      '<div class="reading-filter-row">'+[...new Set(items.map(x=>x.type))].map((t,i)=>'<button class="'+(i===0?'active':'')+'" data-read-type="'+E(t)+'">'+E(t)+'</button>').join('')+'<button data-read-type="__all">Все '+items.length+'</button></div>'+
      '<div class="reader-grid">'+items.map((r,i)=>'<div class="reader-wrap" data-reader-type="'+E(r.type)+'" '+(i<4?'':'hidden')+'>'+H.readingCard(r,i===0)+'</div>').join('')+'</div>'+
      '<div class="reader-actions"><button class="btn secondary" data-read-all>Показать все '+items.length+'</button></div>'+
      '</section>';
  };

  H.nav.splice(Math.max(1,H.nav.findIndex(x=>x[0]==='literature'))+1,0,['reading','Читальня','☷']);

  H.pages.reading=()=>{
    const types=[...new Set(H.reading.map(r=>r.type))];
    return H.head('READING ROOM','Читальня','Полнотекстовые материалы внутри проекта: редакционные статьи, исторические очерки, авторские рассказы, стихи, поэмы, загадки и короткие фольклорные формы.')+
      '<div class="reader-notice"><strong>Правило публикации.</strong> Современные защищённые произведения не копируются целиком без разрешения. Здесь размещаются авторские тексты проекта, редакционные исторические очерки, законно допустимые краткие цитаты и короткие фольклорные формы.</div>'+
      '<div class="reading-filter-row reading-main-filter">'+types.map(t=>'<button data-reader-main="'+E(t)+'">'+E(t)+' <small>'+H.reading.filter(r=>r.type===t).length+'</small></button>').join('')+'<button class="active" data-reader-main="__all">Все <small>'+H.reading.length+'</small></button></div>'+
      '<section class="reader-list" id="readerList">'+H.reading.map(r=>'<div data-reader-main-type="'+E(r.type)+'">'+H.readingCard(r)+'</div>').join('')+'</section>';
  };

  const oldSourceHtml=H.knowledgeSourceHtml;
  H.knowledgeSourceHtml=(ids=[])=>{
    if(!ids.length) return '<span class="knowledge-authored">Авторский материал проекта</span>';
    const links=ids.map(id=>{
      const s=H.knowledgeSources.find(x=>x.id===id);
      return s?'<a href="'+E(s.url)+'" target="_blank" rel="noopener">'+E(s.title)+' ↗</a>':'';
    }).join('');
    return '<details class="source-footnotes"><summary>Источники и проверка</summary><div>'+links+'</div></details>';
  };

  const oldShell=H.shell;
  H.shell=html=>oldShell(html+H.readingSection(H.route()));
})();