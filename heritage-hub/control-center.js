(() => {
  const H=window.H,D=H.D,E=H.esc,$=H.$,$$=H.$$;

  H.primaryNavIds=['home','explore','archive','families','juhuri','reading','memory','control'];
  if(!H.nav.some(x=>x[0]==='explore')) H.nav.splice(1,0,['explore','Исследовать','◎']);
  if(!H.nav.some(x=>x[0]==='control')) H.nav.push(['control','Управление','⚙']);

  H.sectionMeta.explore={label:'Исследовать',group:'Обзор',related:['archive','families','juhuri','reading']};
  H.sectionMeta.control={label:'Панель управления',group:'Управление',related:['explore','archive','research','contribute']};
  H.knowledgeRouteMap.explore=['Самобытность','География общин','Литературные деятели','Фольклор','Память предков','Тора и иудаизм','Исследовательские темы'];
  H.knowledgeRouteMap.control=['Архивная практика','Исследовательские темы','Историография','Генеалогическая практика','Практика фотоархива'];

  const hubs=[
    {id:'places',icon:'◈',title:'История и места',desc:'Красная Слобода, дома, общины, кладбище и историческая география.',routes:['red-village','houses','communities','cemetery']},
    {id:'family',icon:'⌘',title:'Семья и память',desc:'Люди, фамилии, родословные, голоса и семейные истории.',routes:['families','family-tree','surnames','memory','voices']},
    {id:'language',icon:'א',title:'Джуури и литература',desc:'Язык, обучение, голоса, литература, книги и читальня.',routes:['juhuri','learn','juhuri-voices','literature','reading','library']},
    {id:'culture',icon:'✧',title:'Культура и традиции',desc:'Фольклор, музыка, кухня, календарь, праздники и культурные материалы.',routes:['culture','cuisine','calendar','sound-map']},
    {id:'archive',icon:'▤',title:'Архив и исследования',desc:'Фото, документы, загадки архива, методология, поиск и исследовательская работа.',routes:['archive','photo-id','mysteries','research','methodology','ask','knowledge']},
    {id:'project',icon:'＋',title:'Участие и проект',desc:'Передать материал, новые направления, история проекта и инструменты управления.',routes:['contribute','initiatives','about','control']}
  ];

  const memoryRoutes=[
    {title:'Путь народа',icon:'↝',desc:'Истоки → Кавказ → Красная Слобода и Дербент → миграции → современная диаспора.',links:['communities','red-village','research']},
    {title:'Живой архив',icon:'◉',desc:'Фото, документы, голоса и неизвестные материалы, которым ещё нужно вернуть имена и контекст.',links:['archive','photo-id','mysteries']},
    {title:'Языковой центр',icon:'א',desc:'Джуури: словарь, живая речь, литература, письменность и обучение.',links:['juhuri','juhuri-voices','literature']},
    {title:'Чемодан памяти',icon:'▣',desc:'Собрать семейный минимум: фотографии, документы, голоса, рецепты, письма и историю одного дома.',links:['contribute','memory','families']},
    {title:'Кулинарный двор',icon:'◌',desc:'Блюда как семейная память: кто готовил, когда, где и какие слова джуури сопровождали рецепт.',links:['cuisine','voices','memory']},
    {title:'Личная полка',icon:'★',desc:'Сохранённые статьи, книги и материалы, к которым хочется вернуться.',links:['favorites','reading','library']}
  ];

  const navLink=id=>{
    const n=H.nav.find(x=>x[0]===id);
    return n?'<a href="#/'+id+'"><span>'+n[2]+'</span><b>'+E(n[1])+'</b><i>→</i></a>':'';
  };

  H.pages.explore=()=>{
    return H.head('NAVIGATION HUB','Исследовать','Все разделы собраны в понятные направления. В основном меню остаются только самые нужные точки входа.')+
      '<section class="legacy-ideas"><div class="section-title"><div><div class="kicker">ЛОГИКА «НИТИ ПАМЯТИ»</div><h2>Шесть сценариев исследования</h2><p>Полезные идеи старого проекта перенесены внутрь единого сайта — без новых пунктов в боковом меню.</p></div></div><div class="legacy-route-grid">'+memoryRoutes.map(r=>'<article><div class="legacy-icon">'+r.icon+'</div><h3>'+E(r.title)+'</h3><p>'+E(r.desc)+'</p><div>'+r.links.map(navLink).join('')+'</div></article>').join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ВСЕ НАПРАВЛЕНИЯ</div><h2>Выберите, что исследовать</h2></div></div><div class="hub-grid">'+hubs.map(h=>'<article class="hub-card"><div class="hub-icon">'+h.icon+'</div><div><div class="kicker">'+E(h.id.toUpperCase())+'</div><h2>'+E(h.title)+'</h2><p>'+E(h.desc)+'</p></div><div class="hub-links">'+h.routes.map(navLink).join('')+'</div></article>').join('')+'</div></section>'+
      '<section class="section-block path-of-people"><div class="section-title"><div><div class="kicker">ПУТЬ НАРОДА</div><h2>Читать историю как путь</h2></div></div><div class="people-path"><a href="#/communities"><b>01</b><span>Историческая география</span></a><i>→</i><a href="#/red-village"><b>02</b><span>Красная Слобода</span></a><i>→</i><a href="#/juhuri"><b>03</b><span>Язык и культура</span></a><i>→</i><a href="#/literature"><b>04</b><span>Литература и пресса</span></a><i>→</i><a href="#/memory"><b>05</b><span>Семейная память</span></a><i>→</i><a href="#/communities"><b>06</b><span>Диаспора сегодня</span></a></div></section>';
  };

  H.registryRecords=()=>{
    const base=H.records().map(x=>({...x,_origin:'core'}));
    const knowledge=(H.knowledge||[]).map(x=>({...x,kind:'knowledge',_origin:'knowledge'}));
    const reading=(H.reading||[]).map(x=>({...x,kind:'reading',summary:x.body?.slice(0,220)||'',status:(x.source||x.sourceIds?.length)?'documented':'hypothesis',_origin:'reading'}));
    const local=(H.getLocal?H.getLocal():[]).map(x=>({...x,kind:x.kind||'submission',title:x.title||x.name||'Материал без названия',summary:x.summary||x.note||'',status:x.status||'unverified',_origin:'local'}));
    const overlays=H.getFeature?H.getFeature('admin-records')||[]:[];
    const out=[],seen=new Set();
    for(const x of [...base,...knowledge,...reading,...local,...overlays]){
      const key=(x.kind||'record')+':'+(x.id||x.title);
      if(seen.has(key)) continue;
      seen.add(key); out.push(x);
    }
    return out;
  };

  H.graphData=()=>{
    const nodes=[],edges=[];
    const add=(id,label,type,status='unverified')=>{if(!nodes.some(n=>n.id===id))nodes.push({id,label,type,status})};
    D.families.forEach(f=>add(f.id,f.title,'family',f.status));
    D.people.forEach(p=>{
      add(p.id,p.title,'person',p.status);
      if(p.familyId){
        add(p.familyId,D.families.find(f=>f.id===p.familyId)?.title||p.familyId,'family');
        edges.push({from:p.id,to:p.familyId,type:'belongs_to'});
      }
    });
    D.places.forEach(p=>add(p.id,p.title,'place',p.status));
    D.archive.forEach(a=>{
      add(a.id,a.title,'archive',a.status);
      const place=D.places.find(p=>{
        const ap=H.norm(a.place||''),pt=H.norm(p.title||'');
        return ap&&pt&&(ap.includes(pt)||pt.includes(ap));
      });
      if(place) edges.push({from:a.id,to:place.id,type:'located_at'});
    });
    D.burials.forEach(b=>{
      add(b.id,b.title,'burial',b.status);
      if(D.places.some(p=>p.id==='cemetery-area')) edges.push({from:b.id,to:'cemetery-area',type:'buried_at'});
    });
    D.juhuri.forEach(w=>add('word:'+w.id,w.lemma,'word',w.status));
    return {nodes,edges};
  };

  H.adminIssues=()=>{
    const issues=[];
    H.registryRecords().forEach(r=>{
      if(r.private) issues.push({level:'privacy',title:r.title||r.id,reason:'Ограниченный доступ',id:r.id});
      if(['demo','unverified'].includes(r.status)) issues.push({level:r.status,title:r.title||r.id,reason:r.status==='demo'?'Демо-запись':'Требуется проверка',id:r.id});
      if(r._origin==='knowledge'&&!r.authored&&!(r.sourceIds||[]).length) issues.push({level:'source',title:r.title,reason:'Нет прикреплённого источника',id:r.id});
    });
    return issues.slice(0,500);
  };

  const countsBy=(rows,key)=>rows.reduce((m,x)=>{const k=x[key]||'не указан';m[k]=(m[k]||0)+1;return m},{});

  H.pages.control=()=>{
    const rows=H.registryRecords(),issues=H.adminIssues(),graph=H.graphData();
    const kinds=countsBy(rows,'kind'),statuses=countsBy(rows,'status');
    const documented=rows.filter(x=>x.status==='documented').length;
    const local=rows.filter(x=>x._origin==='local'||x._origin==='admin').length;
    return H.head('CONTROL CENTER','Панель управления','Реестр, Heritage Graph, очередь проверки, структура разделов и резервные копии в одном рабочем месте.')+
      '<div class="admin-sync-note"><span class="sync-dot local"></span><div><strong>Offline-first режим</strong><p>Опубликованный корпус объединён в единый реестр. Новые черновики сохраняются на этом устройстве. Серверную запись подключим к уже существующему бесплатному backend, когда его дневной лимит сборок снова станет доступен.</p></div></div>'+
      '<section class="admin-kpis"><article><span>Единый реестр</span><strong>'+rows.length+'</strong><small>сущностей</small></article><article><span>Подтверждено</span><strong>'+documented+'</strong><small>documented</small></article><article><span>Heritage Graph</span><strong>'+graph.nodes.length+'</strong><small>'+graph.edges.length+' связей</small></article><article><span>Очередь проверки</span><strong>'+issues.length+'</strong><small>требуют внимания</small></article><article><span>Черновики</span><strong>'+local+'</strong><small>локально</small></article></section>'+
      '<nav class="admin-tabs"><button class="active" data-admin-tab="overview">Обзор</button><button data-admin-tab="registry">Реестр</button><button data-admin-tab="graph">Heritage Graph</button><button data-admin-tab="moderation">Проверка <b>'+issues.length+'</b></button><button data-admin-tab="sections">Разделы</button><button data-admin-tab="data">Данные</button></nav>'+
      '<section class="admin-panel active" data-admin-panel="overview"><div class="admin-grid two"><article class="admin-card"><div class="kicker">ТИПЫ СУЩНОСТЕЙ</div><h2>Что хранится</h2><div class="bar-list">'+Object.entries(kinds).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>'<div><span>'+E(k)+'</span><b>'+v+'</b><i style="width:'+Math.max(4,Math.min(100,v/Math.max(1,rows.length)*400))+'%"></i></div>').join('')+'</div></article><article class="admin-card"><div class="kicker">ДОСТОВЕРНОСТЬ</div><h2>Статусы данных</h2><div class="status-stack">'+Object.entries(statuses).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div><span>'+H.badge(k)+'</span><strong>'+v+'</strong></div>').join('')+'</div></article></div><div class="admin-grid three"><a class="admin-shortcut" href="#/contribute"><span>＋</span><b>Добавить материал</b><small>Фото, документ, голос, текст</small></a><a class="admin-shortcut" href="#/research"><span>◇</span><b>Исследования</b><small>Задачи и источники</small></a><a class="admin-shortcut" href="#/explore"><span>◎</span><b>Все разделы</b><small>Навигационный центр</small></a></div></section>'+
      '<section class="admin-panel" data-admin-panel="registry"><div class="admin-toolbar"><input id="registrySearch" class="field big" placeholder="Найти сущность, ID, фамилию, дом, книгу…"><select id="registryKind" class="field"><option value="">Все типы</option>'+Object.keys(kinds).sort().map(k=>'<option>'+E(k)+'</option>').join('')+'</select><select id="registryStatus" class="field"><option value="">Все статусы</option>'+Object.keys(statuses).sort().map(k=>'<option>'+E(k)+'</option>').join('')+'</select></div><div id="registryCount" class="result-count"></div><div class="registry-table-wrap"><table class="registry-table"><thead><tr><th>ID</th><th>Тип</th><th>Название</th><th>Статус</th><th>Слой</th></tr></thead><tbody id="registryBody"></tbody></table></div></section>'+
      '<section class="admin-panel" data-admin-panel="graph"><div class="admin-grid two"><article class="admin-card graph-summary"><div class="kicker">HERITAGE GRAPH</div><h2>'+graph.nodes.length+' узлов · '+graph.edges.length+' связей</h2><p>Люди, семьи, места, архивные объекты и захоронения связываются в одну сеть.</p><div class="graph-legend"><span class="person">Человек</span><span class="family">Семья</span><span class="place">Место</span><span class="archive">Архив</span><span class="word">Джуури</span></div></article><article class="admin-card"><div class="kicker">СВЯЗИ</div><div class="edge-list">'+(graph.edges.length?graph.edges.map(e=>'<div><code>'+E(e.from)+'</code><span>→ '+E(e.type)+' →</span><code>'+E(e.to)+'</code></div>').join(''):'<p class="muted">Связи появятся по мере наполнения.</p>')+'</div></article></div><div class="graph-canvas" id="heritageGraphCanvas">'+graph.nodes.slice(0,60).map((n,i)=>'<button class="graph-node '+E(n.type)+'" style="--i:'+i+'" title="'+E(n.type)+' · '+E(n.status)+'"><span>'+E(n.label)+'</span><small>'+E(n.type)+'</small></button>').join('')+'</div></section>'+
      '<section class="admin-panel" data-admin-panel="moderation"><div class="admin-toolbar"><input id="issueSearch" class="field big" placeholder="Поиск в очереди проверки"><select id="issueLevel" class="field"><option value="">Все причины</option><option value="unverified">Не подтверждено</option><option value="demo">Демо</option><option value="privacy">Приватность</option><option value="source">Нет источника</option></select></div><div class="issue-list" id="issueList">'+issues.map(x=>'<article data-level="'+E(x.level)+'" data-search="'+E(H.norm(x.title+' '+x.reason))+'"><span class="issue-dot '+E(x.level)+'"></span><div><strong>'+E(x.title)+'</strong><p>'+E(x.reason)+'</p><small>'+E(x.id||'')+'</small></div></article>').join('')+'</div></section>'+
      '<section class="admin-panel" data-admin-panel="sections"><div class="section-manager"><div class="kicker">ВИДИМОСТЬ НАВИГАЦИИ</div><h2>На виду — 8 основных пунктов</h2><p>Остальные разделы не удалены. Они находятся внутри «Исследовать», доступны через поиск и связанные материалы.</p><div class="primary-preview">'+H.primaryNavIds.map(navLink).join('')+'</div><div class="all-sections"><h3>Все маршруты проекта</h3>'+hubs.map(h=>'<details><summary>'+E(h.title)+' <small>'+h.routes.length+'</small></summary><div>'+h.routes.map(id=>{const n=H.nav.find(x=>x[0]===id);return n?'<a href="#/'+id+'">'+E(n[1])+'</a>':''}).join('')+'</div></details>').join('')+'</div></div></section>'+
      '<section class="admin-panel" data-admin-panel="data"><div class="admin-grid two"><article class="admin-card"><div class="kicker">РЕЗЕРВНАЯ КОПИЯ</div><h2>Экспортировать систему</h2><p>Снимок реестра, графа, источников и локальных черновиков.</p><button class="btn primary" id="exportSystem">Скачать JSON-снимок</button><button class="btn secondary" id="exportRegistryCsv">Реестр CSV</button></article><article class="admin-card"><div class="kicker">ЛОКАЛЬНЫЙ ИМПОРТ</div><h2>Добавить черновые записи</h2><p>JSON импортируется только в локальный слой устройства и не публикуется автоматически.</p><input type="file" id="importSystem" class="field" accept=".json,application/json"><div id="importResult" class="small muted"></div></article></div><form class="admin-add-form" id="adminAddForm"><div><div class="kicker">БЫСТРАЯ ЗАПИСЬ</div><h2>Новый черновик</h2></div><select class="field" name="kind" required><option value="person">Человек</option><option value="family">Семья</option><option value="place">Место</option><option value="archive">Архив</option><option value="book">Книга</option><option value="story">История</option></select><input class="field" name="title" placeholder="Название / имя" required><textarea class="field" name="summary" rows="4" placeholder="Краткое описание"></textarea><button class="btn primary" type="submit">Сохранить черновик</button></form></section>';
  };

  const prior=H.bindFeatures;
  H.bindFeatures=route=>{
    if(prior) prior(route);

    const actions=$('.top-actions');
    if(actions) actions.innerHTML='<a class="quiet-link" href="#/explore">Разделы</a><a class="quiet-link" href="#/control">⚙ Управление</a><a class="primary-small" href="#/contribute">＋ Добавить</a>';

    if(route!=='control') return;

    const rows=H.registryRecords(),graph=H.graphData();

    $$('[data-admin-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-admin-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      $$('[data-admin-panel]').forEach(p=>p.classList.toggle('active',p.dataset.adminPanel===btn.dataset.adminTab));
    }));

    const renderRegistry=()=>{
      const q=H.norm($('#registrySearch')?.value||''),kind=$('#registryKind')?.value||'',status=$('#registryStatus')?.value||'';
      const filtered=rows.filter(r=>(!kind||r.kind===kind)&&(!status||r.status===status)&&(!q||H.norm([r.id,r.kind,r.title,r.summary,r._origin].join(' ')).includes(q))).slice(0,400);
      $('#registryBody').innerHTML=filtered.map(r=>'<tr><td><code>'+E(r.id||'—')+'</code></td><td>'+E(r.kind||'record')+'</td><td><strong>'+E(r.title||'Без названия')+'</strong><small>'+E((r.summary||'').slice(0,100))+'</small></td><td>'+H.badge(r.status)+'</td><td>'+E(r._origin||'core')+'</td></tr>').join('');
      $('#registryCount').textContent='Показано '+filtered.length+' из '+rows.length+(rows.length>400?' · таблица ограничена 400 строками':'');
    };
    ['#registrySearch','#registryKind','#registryStatus'].forEach(sel=>$(sel)?.addEventListener(sel==='#registrySearch'?'input':'change',renderRegistry));
    renderRegistry();

    const filterIssues=()=>{
      const q=H.norm($('#issueSearch')?.value||''),level=$('#issueLevel')?.value||'';
      $$('#issueList article').forEach(a=>a.hidden=!((!level||a.dataset.level===level)&&(!q||a.dataset.search.includes(q))));
    };
    $('#issueSearch')?.addEventListener('input',filterIssues);
    $('#issueLevel')?.addEventListener('change',filterIssues);

    $('#exportSystem')?.addEventListener('click',()=>H.json('niti-pamyati-backup-'+new Date().toISOString().slice(0,10)+'.json',{version:1,exportedAt:new Date().toISOString(),project:D.project,registry:rows,graph,sources:[...(D.sources||[]),...(H.knowledgeSources||[])],drafts:H.getFeature?.('admin-records')||[],contributions:H.getLocal?.()||[]}));
    $('#exportRegistryCsv')?.addEventListener('click',()=>H.csv('niti-pamyati-registry.csv',rows.map(r=>({kind:r.kind,id:r.id,title:r.title,status:r.status,summary:r.summary}))));

    $('#adminAddForm')?.addEventListener('submit',e=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const row={id:'LOCAL-'+Date.now(),kind:fd.get('kind'),title:fd.get('title'),summary:fd.get('summary'),status:'unverified',visibility:'private',createdAt:new Date().toISOString(),_origin:'admin'};
      const current=H.getFeature('admin-records')||[]; current.push(row); H.setFeature('admin-records',current);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    $('#importSystem')?.addEventListener('change',async e=>{
      const file=e.target.files?.[0]; if(!file)return;
      const result=$('#importResult');
      try{
        const parsed=JSON.parse(await file.text());
        const incoming=Array.isArray(parsed)?parsed:(parsed.registry||parsed.records||[]);
        const clean=incoming.filter(x=>x&&typeof x==='object').slice(0,5000).map((x,i)=>({...x,id:x.id||('IMPORT-'+Date.now()+'-'+i),status:x.status||'unverified',visibility:x.visibility||'private',_origin:'admin'}));
        const current=H.getFeature('admin-records')||[];
        H.setFeature('admin-records',[...current,...clean]);
        result.textContent='Импортировано локально: '+clean.length+'. Ничего не опубликовано автоматически.';
      }catch(err){result.textContent='Не удалось прочитать JSON.'}
    });
  };
})();