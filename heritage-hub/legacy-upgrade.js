(() => {
  const H=window.H,E=H.esc,$=H.$,$$=H.$$;

  H.legacyRoutes=[
    {id:'family',title:'Путь одной семьи',desc:'От фамилии и дерева — к дому, фотографиям, голосам и миграции.',steps:[['families','Семья'],['family-tree','Дерево'],['houses','Дом'],['archive','Архив'],['voices','Голоса'],['communities','Миграция']]},
    {id:'language',title:'Путь языка',desc:'От живого слова — к словарю, литературе, голосам и обучению.',steps:[['juhuri','Слово'],['juhuri-voices','Голос'],['learn','Учиться'],['literature','Литература'],['reading','Читать'],['library','Книги']]},
    {id:'place',title:'Путь места',desc:'Как улица и дом становятся историей нескольких поколений.',steps:[['red-village','Красная Слобода'],['houses','Дом'],['archive','Фото'],['families','Люди'],['cemetery','Память'],['research','Источники']]},
    {id:'story',title:'Путь одной истории',desc:'Рассказ старшего превращается в проверяемую архивную запись.',steps:[['voices','Рассказ'],['archive','Документ'],['photo-id','Фото'],['families','Люди'],['research','Проверка'],['reading','Публикация']]},
    {id:'book',title:'Путь одной книги',desc:'Автор, издание, язык, экземпляр, владельческая надпись и семейная история.',steps:[['library','Книга'],['literature','Автор'],['knowledge','Контекст'],['archive','Экземпляр'],['research','Источник'],['reading','Читать']]},
    {id:'memory',title:'Путь памяти',desc:'От одного предмета — к целой сети людей, домов и историй.',steps:[['initiatives','Предмет'],['archive','Фото'],['families','Владелец'],['houses','Дом'],['voices','Рассказ'],['memory','Передать дальше']]}
  ];

  H.memorySuitcase=[
    {id:'photo',icon:'▧',title:'Семейная фотография',desc:'Подписать хотя бы один старый снимок: кто, где, когда.'},
    {id:'voice',icon:'◉',title:'Голос старшего',desc:'Записать хотя бы 3–5 минут живого рассказа.'},
    {id:'document',icon:'▤',title:'Старый документ',desc:'Отсканировать документ полностью, включая оборот.'},
    {id:'house',icon:'⌂',title:'История дома',desc:'Записать адрес, жильцов и хотя бы одно воспоминание.'},
    {id:'word',icon:'א',title:'Слово джуури',desc:'Записать слово, значение и произношение носителя.'},
    {id:'recipe',icon:'◌',title:'Семейный рецепт',desc:'Сохранить не только ингредиенты, но и кто готовил.'},
    {id:'song',icon:'♫',title:'Песня семьи',desc:'Записать название, язык, исполнителя и от кого её узнали.'},
    {id:'object',icon:'◇',title:'Семейная вещь',desc:'Сфотографировать предмет и записать путь через поколения.'}
  ];

  H.memoryWeek=[
    ['День 1','Назовите имена','Выберите одну старую фотографию и подпишите всех, кого удалось узнать.'],
    ['День 2','Запишите голос','Задайте старшему родственнику один вопрос о детстве и сохраните ответ.'],
    ['День 3','Найдите документ','Отсканируйте самый старый семейный документ с обеих сторон.'],
    ['День 4','Запишите слово','Сохраните одно семейное слово или выражение на джуури с аудио.'],
    ['День 5','История дома','Запишите, где жили бабушка или дедушка, и что они помнят о соседях.'],
    ['День 6','История вещи','Выберите одну семейную реликвию и выясните, кому она принадлежала.'],
    ['День 7','Передайте дальше','Сделайте копию собранных материалов и отправьте её другому родственнику.']
  ];

  H.archiveUrgency=[
    {level:'high',title:'Голоса пожилых носителей',desc:'То, что ещё можно спросить лично, невозможно восстановить после утраты свидетеля.',route:'voices'},
    {level:'high',title:'Кассеты и плёнки',desc:'Магнитные носители физически стареют — их нужно оцифровывать до монтажа и обработки.',route:'sound-map'},
    {level:'high',title:'Неподписанные фотографии',desc:'Каждое поколение уменьшает шанс узнать людей и места на старом снимке.',route:'photo-id'},
    {level:'medium',title:'Повреждённые надгробия',desc:'Текст может становиться нечитаемым; важна своевременная фотофиксация.',route:'cemetery'},
    {level:'medium',title:'Старые семейные бумаги',desc:'Обороты, конверты, штампы и поля часто содержат ключевые сведения.',route:'archive'},
    {level:'medium',title:'Редкие слова джуури',desc:'Слово без носителя теряет произношение и контекст употребления.',route:'juhuri-voices'}
  ];

  const oldExplore=H.pages.explore;
  H.pages.explore=()=>{
    const done=H.getFeature?.('memory-suitcase')||[];
    const pct=Math.round(done.length/H.memorySuitcase.length*100);
    const base=oldExplore();

    const routes='<section class="legacy-deep section-block"><div class="section-title"><div><div class="kicker">ТЕМАТИЧЕСКИЕ МАРШРУТЫ</div><h2>Не искать раздел — идти по истории</h2><p>Маршруты объединяют разрозненные разделы в понятный путь.</p></div></div><div class="memory-route-grid">'+H.legacyRoutes.map(r=>'<article><h3>'+E(r.title)+'</h3><p>'+E(r.desc)+'</p><div class="memory-route-steps">'+r.steps.map(([id,label],i)=>'<a href="#/'+id+'"><b>'+String(i+1).padStart(2,'0')+'</b><span>'+E(label)+'</span></a>').join('<i>→</i>')+'</div></article>').join('')+'</div></section>';

    const suitcase='<section class="memory-suitcase section-block"><div class="section-title"><div><div class="kicker">ЧЕМОДАН ПАМЯТИ</div><h2>Соберите семейный минимум</h2><p>Восемь вещей, которые стоит сохранить хотя бы один раз в каждой семье.</p></div><div class="suitcase-score"><strong>'+done.length+'/'+H.memorySuitcase.length+'</strong><span>'+pct+'%</span></div></div><div class="suitcase-progress"><i style="width:'+pct+'%"></i></div><div class="suitcase-grid">'+H.memorySuitcase.map(x=>'<button class="suitcase-item '+(done.includes(x.id)?'done':'')+'" data-suitcase="'+E(x.id)+'"><span class="suitcase-icon">'+x.icon+'</span><div><strong>'+E(x.title)+'</strong><p>'+E(x.desc)+'</p></div><b>'+(done.includes(x.id)?'✓':'＋')+'</b></button>').join('')+'</div><div class="suitcase-actions"><a class="btn secondary" href="#/contribute">Добавить материал в архив</a><button class="btn secondary" id="resetSuitcase">Сбросить отметки</button></div></section>';

    const week='<section class="memory-week section-block"><div class="section-title"><div><div class="kicker">7 ДНЕЙ ПАМЯТИ</div><h2>Одна маленькая задача в день</h2></div></div><div class="week-track">'+H.memoryWeek.map((x,i)=>'<article><span>'+E(x[0])+'</span><h3>'+E(x[1])+'</h3><p>'+E(x[2])+'</p><button data-week="'+i+'">'+((H.getFeature?.('memory-week')||[]).includes(i)?'✓ Выполнено':'Отметить')+'</button></article>').join('')+'</div></section>';

    const urgent='<section class="archive-urgency section-block"><div class="section-title"><div><div class="kicker">СОХРАНИТЬ В ПЕРВУЮ ОЧЕРЕДЬ</div><h2>Что может исчезнуть быстрее всего</h2></div></div><div class="urgency-grid">'+H.archiveUrgency.map(x=>'<a href="#/'+x.route+'" class="'+x.level+'"><span>'+E(x.level==='high'?'Срочно':'Важно')+'</span><h3>'+E(x.title)+'</h3><p>'+E(x.desc)+'</p><b>Открыть →</b></a>').join('')+'</div></section>';

    const all=H.readingForRoute?H.readingForRoute('home',24):H.reading.slice(0,24);
    const living='<section class="living-memory section-block"><div class="section-title"><div><div class="kicker">ЖИВАЯ ПАМЯТЬ</div><h2>Смешанная лента проекта</h2><p>Истории, статьи, стихи и справочные материалы — не по структуре меню, а как живая подборка.</p></div><a class="text-link" href="#/reading">Вся читальня →</a></div><div class="living-grid">'+all.slice(0,12).map(r=>'<a href="#/reading" class="living-card"><span>'+E(r.type)+'</span><h3>'+E(r.title)+'</h3><p>'+E((r.body||'').replace(/\n/g,' ').slice(0,180))+'…</p></a>').join('')+'</div></section>';

    return base+routes+suitcase+week+urgent+living;
  };

  const prior=H.bindFeatures;
  H.bindFeatures=route=>{
    if(prior)prior(route);
    if(route!=='explore')return;

    $$('[data-suitcase]').forEach(btn=>btn.addEventListener('click',()=>{
      let done=H.getFeature('memory-suitcase')||[];
      const id=btn.dataset.suitcase;
      done=done.includes(id)?done.filter(x=>x!==id):[...done,id];
      H.setFeature('memory-suitcase',done);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }));
    $('#resetSuitcase')?.addEventListener('click',()=>{
      H.setFeature('memory-suitcase',[]);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    $$('[data-week]').forEach(btn=>btn.addEventListener('click',()=>{
      let done=H.getFeature('memory-week')||[];
      const id=Number(btn.dataset.week);
      done=done.includes(id)?done.filter(x=>x!==id):[...done,id];
      H.setFeature('memory-week',done);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }));
  };
})();