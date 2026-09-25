(() => {
  const H=window.H,E=H.esc,B=H.badge,$=H.$,$$=H.$$;

  H.nav.push(['favorites','Избранное','★']);

  H.sectionMeta={
    home:{label:'Главная',group:'Обзор',related:['knowledge','communities','literature','memory']},
    'red-village':{label:'Красная Слобода',group:'Места',related:['houses','communities','archive','cemetery']},
    houses:{label:'Паспорта домов',group:'Места',related:['red-village','archive','families','photo-id']},
    communities:{label:'Атлас общин',group:'Места',related:['red-village','families','research','archive']},
    archive:{label:'Архив',group:'Архив',related:['photo-id','voices','mysteries','research']},
    'photo-id':{label:'Кто на фото?',group:'Архив',related:['archive','families','mysteries','memory']},
    mysteries:{label:'Архивные загадки',group:'Архив',related:['archive','photo-id','research','contribute']},
    families:{label:'Семьи и люди',group:'Семья',related:['family-tree','surnames','houses','memory']},
    'family-tree':{label:'Семейное дерево',group:'Семья',related:['families','surnames','archive','memory']},
    surnames:{label:'Фамилии',group:'Семья',related:['families','family-tree','research','knowledge']},
    cemetery:{label:'Кладбище',group:'Память',related:['memory','families','archive','methodology']},
    memory:{label:'Память предков',group:'Память',related:['voices','family-tree','photo-id','contribute']},
    voices:{label:'Голоса народа',group:'Память',related:['sound-map','memory','families','contribute']},
    'sound-map':{label:'Звуковая карта',group:'Память',related:['voices','communities','juhuri-voices','red-village']},
    juhuri:{label:'Джуури',group:'Язык',related:['learn','juhuri-voices','literature','knowledge']},
    learn:{label:'Учить джуури',group:'Язык',related:['juhuri','juhuri-voices','memory','knowledge']},
    'juhuri-voices':{label:'Juhuri Voices',group:'Язык',related:['juhuri','learn','sound-map','voices']},
    literature:{label:'Литература джуури',group:'Культура',related:['reading','library','juhuri','culture']},
    reading:{label:'Читальня',group:'Культура',related:['literature','culture','knowledge','library']},
    culture:{label:'Культура',group:'Культура',related:['literature','cuisine','calendar','library']},
    cuisine:{label:'Кухня',group:'Культура',related:['culture','memory','voices','knowledge']},
    calendar:{label:'Календарь и праздники',group:'Традиция',related:['library','culture','memory','knowledge']},
    library:{label:'Библиотека',group:'Знания',related:['literature','knowledge','research','calendar']},
    knowledge:{label:'Энциклопедия',group:'Знания',related:['library','literature','research','communities']},
    research:{label:'Исследования',group:'Исследование',related:['knowledge','archive','methodology','communities']},
    methodology:{label:'Методология',group:'Исследование',related:['research','archive','contribute','knowledge']},
    contribute:{label:'Передать материал',group:'Участие',related:['methodology','archive','voices','memory']},
    initiatives:{label:'Новые направления',group:'Проект',related:['about','research','knowledge','contribute']},
    about:{label:'О проекте',group:'Проект',related:['initiatives','methodology','knowledge','home']},
    ask:{label:'Спроси архив',group:'Знания',related:['knowledge','archive','research','juhuri']},
    favorites:{label:'Избранное',group:'Личное',related:['knowledge','library','memory','home']}
  };

  const extendedCats={
    home:['Самобытность','Писатели и поэты','Литературные деятели','Книги','География общин','Пожелания проекта','Память предков','Детям'],
    'red-village':['Здания и места','География общин','Фотоархивы','Архивы и коллекции','Историография','Вопросы старшим','Исследовательские темы'],
    houses:['Здания и места','Архивная практика','Вопросы старшим','Фотоархивы','Память предков','Исследовательские темы','География общин'],
    communities:['География общин','Диаспора','Архивы и коллекции','Историография','Исследовательские темы','Вопросы старшим'],
    archive:['Архивы и коллекции','Фотоархивы','Пресса и периодика','Архивная практика','Историография','Исследовательские темы','Книги'],
    'photo-id':['Фотоархивы','Архивная практика','Вопросы старшим','Исследовательские темы','Память предков','Пожелания проекта'],
    mysteries:['Авторские загадки','Фотоархивы','Архивная практика','Исследовательские темы','Фольклор','Вопросы старшим'],
    families:['Фамилии','Вопросы старшим','Память предков','География общин','Архивная практика','Диаспора','Пожелания проекта'],
    'family-tree':['Фамилии','Вопросы старшим','Архивная практика','Память предков','География общин','Исследовательские темы'],
    surnames:['Фамилии','Вопросы старшим','Архивная практика','Память предков','Исследовательские темы','География общин'],
    cemetery:['Память предков','Тора и иудаизм','Архивная практика','Исследовательские темы','Вопросы старшим','Здания и места'],
    memory:['Память предков','Пожелания проекта','Вопросы старшим','Афоризмы проекта','Авторские загадки','Детям','Архивная практика'],
    voices:['Вопросы старшим','Темы интервью','Пожелания проекта','Язык и письменность','Фольклор','Память предков','Архивная практика'],
    'sound-map':['Музыка','География общин','Темы интервью','Фольклор','Язык и письменность','Архивная практика'],
    juhuri:['Язык и письменность','История языка','История письменности','Словари и грамматики','Писатели и поэты','Литературные деятели','Фольклор','Пресса и периодика'],
    learn:['Словари и грамматики','Детям','Авторские загадки','Фольклор','История языка','Произведения','Пожелания проекта'],
    'juhuri-voices':['Язык и письменность','История языка','Музыка','Темы интервью','Словари и грамматики','Архивная практика'],
    literature:['Литературные деятели','Писатели и поэты','Произведения','Литературная история','Книги','История прессы','Театр','Пресса и периодика'],
    culture:['Фольклор','Музыка','Театр','Литературные деятели','Самобытность','Рассказы и сказки','Афоризмы','Праздники'],
    cuisine:['Самобытность','Фольклор','Память предков','Вопросы старшим','Пожелания проекта','Детям'],
    calendar:['Еврейский календарь','Праздники','Тора и иудаизм','Самобытность','Пожелания проекта','Память предков'],
    library:['Книги','Книги и аудио','Книги и музыка','Словари и грамматики','Историография','Тора и иудаизм','Пресса и периодика','Произведения'],
    knowledge:['Самобытность','Книги','Писатели и поэты','Литературные деятели','География общин','Тора и иудаизм','Праздники','Язык и письменность'],
    research:['Исследовательские темы','Историография','Архивы и коллекции','География общин','Пресса и периодика','История языка','Фотоархивы','Исследователи'],
    methodology:['Архивная практика','Историография','Исследовательские темы','Фотоархивы','Архивы и коллекции','Пожелания проекта'],
    contribute:['Архивная практика','Вопросы старшим','Темы интервью','Пожелания проекта','Память предков','Фотоархивы','Детям'],
    initiatives:['Книги','Писатели и поэты','Литературные деятели','Меценаты','Фольклор','Музыка','Архивы и коллекции','Исследовательские темы'],
    about:['Самобытность','Меценаты','Пожелания проекта','География общин','Историография','Книги','Память предков'],
    ask:['Самобытность','Книги','Здания и места','Язык и письменность','География общин','Писатели и поэты','Тора и иудаизм'],
    favorites:[]
  };

  Object.assign(H.knowledgeRouteMap,extendedCats);

  const oldKnowledgeCard=H.knowledgeCard;
  H.knowledgeCard=k=>{
    const favs=H.getFeature('favorites')||[];
    const isFav=favs.includes(k.id);
    const html=oldKnowledgeCard(k);
    return html.replace('<article class="knowledge-card"', '<article class="knowledge-card" data-kid="'+E(k.id)+'"')
      .replace('<div class="knowledge-top">','<button class="fav-btn '+(isFav?'active':'')+'" data-fav="'+E(k.id)+'" aria-label="В избранное">★</button><div class="knowledge-top">');
  };

  H.pages.favorites=()=>{
    const ids=H.getFeature('favorites')||[];
    const items=ids.map(id=>H.knowledge.find(k=>k.id===id)).filter(Boolean);
    return H.head('PERSONAL COLLECTION','Избранное','Сохранённые статьи энциклопедии на этом устройстве. Они не отправляются на сервер.')+
      '<div class="notice"><strong>Локально сохранено:</strong> '+items.length+' материалов.</div>'+
      '<section class="knowledge-grid favorite-grid">'+(items.length?items.map(H.knowledgeCard).join(''):'<div class="empty-favorites"><h2>Пока пусто</h2><p>Нажимайте ★ на интересных карточках в любом разделе.</p><a class="btn primary" href="#/knowledge">Открыть энциклопедию</a></div>')+'</section>';
  };

  H.knowledgeSection=route=>{
    if(route==='knowledge'||route==='favorites')return '';
    const cats=(H.knowledgeRouteMap[route]||['Самобытность','Пожелания проекта','Книги']).filter(Boolean);
    const items=H.knowledge.filter(k=>cats.includes(k.cat));
    if(!items.length)return '';
    const perCat={};
    cats.forEach(c=>perCat[c]=items.filter(k=>k.cat===c));
    return '<section class="deep-dossier section-block" data-route="'+E(route)+'">'+
      '<div class="section-title dossier-head"><div><div class="kicker">РАСШИРЕННАЯ СПРАВКА</div><h2>Большая подборка по разделу</h2><p>'+items.length+' связанных материалов · '+cats.length+' тем</p></div><a class="text-link" href="#/knowledge">Вся энциклопедия →</a></div>'+
      '<div class="dossier-tabs">'+cats.map((c,i)=>'<button class="'+(i===0?'active':'')+'" data-dossier-tab="'+E(c)+'">'+E(c)+' <small>'+perCat[c].length+'</small></button>').join('')+'</div>'+
      '<div class="dossier-grid">'+cats.map((c,ci)=>perCat[c].map((k,ki)=>'<div class="dossier-item" data-dossier-cat="'+E(c)+'" '+((ci===0&&ki<12)?'':'hidden')+'>'+H.knowledgeCard(k)+'</div>').join('')).join('')+'</div>'+
      '<div class="dossier-actions"><button class="btn secondary" data-dossier-all>Показать все '+items.length+' материалов</button><button class="btn secondary" data-dossier-collapse>Свернуть подборку</button></div>'+
      '</section>';
  };

  const groupOrder=['Обзор','Места','Архив','Семья','Память','Язык','Культура','Традиция','Знания','Исследование','Участие','Проект','Личное'];
  const groupMap={
    home:'Обзор',
    'red-village':'Места',houses:'Места',communities:'Места',
    archive:'Архив','photo-id':'Архив',mysteries:'Архив',
    families:'Семья','family-tree':'Семья',surnames:'Семья',
    cemetery:'Память',memory:'Память',voices:'Память','sound-map':'Память',
    juhuri:'Язык',learn:'Язык','juhuri-voices':'Язык',
    literature:'Культура',reading:'Культура',culture:'Культура',cuisine:'Культура',
    calendar:'Традиция',
    library:'Знания',knowledge:'Знания',ask:'Знания',
    research:'Исследование',methodology:'Исследование',
    contribute:'Участие',
    initiatives:'Проект',about:'Проект',
    favorites:'Личное'
  };

  const previousBind=H.bindFeatures;
  H.bindFeatures=r=>{
    if(previousBind)previousBind(r);
    enhanceUI(r);
  };

  function enhanceUI(route){
    const content=$('#content');
    let fallbackLabel=(H.nav.find(x=>x[0]===route)||[])[1]||route;
    if(route.startsWith('initiative-')){
      const ii=H.initiatives?.find(x=>'initiative-'+x.id===route);
      if(ii) fallbackLabel=ii.title;
    }
    const meta=H.sectionMeta[route]||{label:fallbackLabel,group:route.startsWith('initiative-')?'Новые направления':'Раздел',related:['initiatives','knowledge','research','contribute']};
    if(content){
      const related=(meta.related||[]).map(id=>{
        const n=H.nav.find(x=>x[0]===id);
        return n?'<a href="#/'+id+'">'+E(n[1])+'</a>':'';
      }).join('');
      content.insertAdjacentHTML('afterbegin',
        '<div class="context-strip"><div class="crumbs"><a href="#/home">Нити Памяти</a><span>›</span><span>'+E(meta.group)+'</span><span>›</span><strong>'+E(meta.label)+'</strong></div>'+
        '<div class="context-tools"><span class="route-count">'+countForRoute(route)+' материалов</span><button id="densityBtn" class="tool-btn">↕ Плотность</button><a class="tool-btn" href="#/favorites">★ Избранное</a></div></div>'+
        (route!=='home'?'<div class="related-strip"><span>Рядом:</span>'+related+'</div>':''));
    }

    groupSidebar(route);
    addMobileDock(route);
    addBackTop();
    bindDossier();
    bindFavorites();
    bindDensity();
    bindShortcuts();
  }

  function countForRoute(route){
    const cats=H.knowledgeRouteMap[route]||['Самобытность','Пожелания проекта','Книги'];
    return H.knowledge.filter(k=>cats.includes(k.cat)).length;
  }

  function groupSidebar(route){
    const nav=$('.side-nav');if(!nav)return;
    const lookup=new Map(H.nav.map(x=>[x[0],x]));
    nav.innerHTML='';
    groupOrder.forEach(group=>{
      const ids=Object.keys(groupMap).filter(id=>groupMap[id]===group&&lookup.has(id));
      if(!ids.length)return;
      const block=document.createElement('div');
      block.className='nav-group';
      block.innerHTML='<button class="nav-group-title" type="button"><span>'+E(group)+'</span><b>⌄</b></button><div class="nav-group-links">'+ids.map(id=>{const n=lookup.get(id);return '<a class="'+(route===id?'active':'')+'" href="#/'+id+'"><span>'+n[2]+'</span><b>'+E(n[1])+'</b></a>'}).join('')+'</div>';
      nav.appendChild(block);
    });
    $$('.nav-group-title',nav).forEach(btn=>btn.addEventListener('click',()=>btn.parentElement.classList.toggle('collapsed')));
  }

  function addMobileDock(route){
    const existing=$('.mobile-dock');
    if(existing){
      $('a',existing).forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#/'+route));
      return;
    }
    const el=document.createElement('nav');
    el.className='mobile-dock';
    el.innerHTML='<a class="'+(route==='home'?'active':'')+'" href="#/home"><span>⌂</span><b>Главная</b></a>'+
      '<button id="dockSearch"><span>⌕</span><b>Поиск</b></button>'+
      '<a class="'+(route==='archive'?'active':'')+'" href="#/archive"><span>▤</span><b>Архив</b></a>'+
      '<a class="'+(route==='juhuri'?'active':'')+'" href="#/juhuri"><span>א</span><b>Джуури</b></a>'+
      '<button id="dockMenu"><span>☰</span><b>Меню</b></button>';
    document.body.appendChild(el);
    $('#dockSearch')?.addEventListener('click',()=>{const i=$('#globalSearch');i?.focus();window.scrollTo({top:0,behavior:'smooth'})});
    $('#dockMenu')?.addEventListener('click',()=>$('#sidebar')?.classList.add('open'));
  }

  function addBackTop(){
    if($('#backTop'))return;
    const b=document.createElement('button');b.id='backTop';b.className='back-top';b.textContent='↑';
    document.body.appendChild(b);
    b.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    const sync=()=>b.classList.toggle('show',scrollY>700);
    window.onscroll=sync;sync();
  }

  function bindDossier(){
    $$('.dossier-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      const root=btn.closest('.deep-dossier'),cat=btn.dataset.dossierTab;
      $$('.dossier-tabs button',root).forEach(x=>x.classList.toggle('active',x===btn));
      $$('.dossier-item',root).forEach((item,i)=>{
        const same=item.dataset.dossierCat===cat;
        item.hidden=!same;
      });
      root.dataset.mode='category';
    }));
    $$('[data-dossier-all]').forEach(btn=>btn.addEventListener('click',()=>{
      const root=btn.closest('.deep-dossier');
      $$('.dossier-item',root).forEach(i=>i.hidden=false);
      $$('.dossier-tabs button',root).forEach(x=>x.classList.remove('active'));
      root.dataset.mode='all';
    }));
    $$('[data-dossier-collapse]').forEach(btn=>btn.addEventListener('click',()=>{
      const root=btn.closest('.deep-dossier');
      root.classList.toggle('collapsed');
      btn.textContent=root.classList.contains('collapsed')?'Развернуть подборку':'Свернуть подборку';
    }));
  }

  function bindFavorites(){
    $$('[data-fav]').forEach(btn=>btn.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const id=btn.dataset.fav;let favs=H.getFeature('favorites')||[];
      favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];
      H.setFeature('favorites',favs);
      $$('[data-fav="'+CSS.escape(id)+'"]').forEach(x=>x.classList.toggle('active',favs.includes(id)));
      if(H.route()==='favorites'&&!favs.includes(id))window.dispatchEvent(new HashChangeEvent('hashchange'));
    }));
  }

  function bindDensity(){
    const compact=localStorage.getItem('heritage-density')==='compact';
    document.documentElement.classList.toggle('compact-ui',compact);
    $('#densityBtn')?.addEventListener('click',()=>{
      const next=!document.documentElement.classList.contains('compact-ui');
      document.documentElement.classList.toggle('compact-ui',next);
      localStorage.setItem('heritage-density',next?'compact':'comfortable');
    });
  }

  function bindShortcuts(){
    document.onkeydown=e=>{
      if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){
        e.preventDefault();$('#globalSearch')?.focus();
      }
      if(e.key==='Escape')$('#sidebar')?.classList.remove('open');
    };
  }
})();