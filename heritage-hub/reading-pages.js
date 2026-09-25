(() => {
  const H=window.H,E=H.esc;
  const sourceById=id=>H.knowledgeSources?.find(s=>s.id===id);

  const sourceFootnote=r=>{
    const ids=r.sourceIds?.length?r.sourceIds:(r.source?[r.source]:[]);
    if(!ids.length) return '<div class="reader-origin">'+E(r.author||'Авторский материал проекта')+'</div>';
    const rows=ids.map(id=>sourceById(id)).filter(Boolean);
    return '<details class="reader-source"><summary>Источники и проверка · '+rows.length+'</summary>'+
      rows.map(s=>'<div class="reader-source-row"><p>'+E(s.title)+'</p><a href="'+E(s.url)+'" target="_blank" rel="noopener">Открыть источник ↗</a></div>').join('')+
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
    const items=H.readingForRoute?H.readingForRoute(route,100):(H.reading||[]).slice(0,100);
    if(!items.length) return '';
    return '<section class="reading-shelf section-block">'+
      '<div class="section-title"><div><div class="kicker">ЧИТАТЬ ПРЯМО ЗДЕСЬ</div><h2>Статьи, истории и тексты</h2><p>Без перехода на другие сайты — откройте материал и читайте внутри раздела.</p></div><a class="text-link" href="#/reading">Открыть всю читальню →</a></div>'+
      '<div class="reading-filter-row">'+[...new Set(items.map(x=>x.type))].map(t=>'<button data-read-type="'+E(t)+'">'+E(t)+'</button>').join('')+'<button class="active" data-read-type="__all">Все '+items.length+'</button></div>'+
      '<div class="reader-grid">'+items.map((r,i)=>'<div class="reader-wrap" data-reader-type="'+E(r.type)+'" '+(i<12?'':'hidden')+'>'+H.readingCard(r,i===0)+'</div>').join('')+'</div>'+
      '<div class="reader-actions"><button class="btn secondary" data-read-all>Показать все '+items.length+'</button></div>'+
      '</section>';
  };

  H.nav.splice(Math.max(1,H.nav.findIndex(x=>x[0]==='literature'))+1,0,['reading','Читальня','☷']);
  H.knowledgeRouteMap.reading=['Литературные деятели','Произведения','Фольклор','Библиография','Писатели и поэты','Рассказы и сказки'];

  H.pages.reading=()=>{
    const all=H.allReading?H.allReading():H.reading;
    const types=[...new Set(all.map(r=>r.type))];
    return H.head('READING ROOM','Читальня','Большая внутренняя библиотека проекта: исторические очерки, справочные статьи, рассказы, стихи, поэмы, загадки, фольклор и практические тексты — читаются прямо на сайте.')+
      '<section class="reading-stats"><div><strong>'+all.length+'</strong><span>текстов внутри сайта</span></div><div><strong>'+types.length+'</strong><span>типов материалов</span></div><div><strong>'+H.reading.length+'</strong><span>авторских и кураторских текстов</span></div></section>'+
      '<div class="reader-notice"><strong>Правило публикации.</strong> Современные защищённые произведения не копируются целиком без разрешения. Вместо внешней ссылки читатель получает содержательную статью или пересказ внутри сайта, а источник остаётся в сноске для проверки.</div>'+
      '<div class="reader-library-toolbar"><input id="readerSearch" class="field big" placeholder="Поиск по текстам: Красная Слобода, джуури, семья, Тора…"><select id="readerType" class="field"><option value="">Все типы</option>'+types.map(t=>'<option>'+E(t)+'</option>').join('')+'</select></div>'+
      '<div id="readerLibraryCount" class="result-count"></div>'+
      '<section class="reader-list" id="readerList"></section>'+
      '<div class="reader-load"><button class="btn secondary" id="readerMore">Показать ещё</button></div>';
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