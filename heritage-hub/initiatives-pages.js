(() => {
  const H=window.H,D=H.D,E=H.esc,B=H.badge;
  H.nav.splice(13,0,['initiatives','Новые направления','✺']);

  H.initiatives=[
    {id:'studio',num:'01',title:'Нити Памяти Studio',tag:'Медиа',desc:'Документальные фильмы, интервью, мини-фильмы о семьях, домах, песнях и языке.',action:'Создать медиаматериал'},
    {id:'yearbook',num:'02',title:'Годовая книга народа',tag:'Издание',desc:'Ежегодный цифровой альманах подтверждённых материалов проекта.',action:'Собрать выпуск'},
    {id:'object-museum',num:'03',title:'Музей одной вещи',tag:'Музей',desc:'История отдельного предмета: кому принадлежал, где использовался и как сохранился.',action:'Добавить предмет'},
    {id:'professions',num:'04',title:'Архив профессий и ремёсел',tag:'История',desc:'Профессии, ремёсла, мастерские и профессиональные династии.',action:'Добавить запись'},
    {id:'names',num:'05',title:'Энциклопедия имён',tag:'Справочник',desc:'Традиционные имена, варианты написания и семейные формы.',action:'Добавить имя'},
    {id:'one-day',num:'06',title:'Один день из прошлого',tag:'Реконструкция',desc:'Интерактивные документальные реконструкции повседневной жизни.',action:'Создать сцену'},
    {id:'exhibitions',num:'07',title:'Цифровые выставки',tag:'Куратор',desc:'Конструктор виртуальных выставок из архивных карточек.',action:'Собрать выставку'},
    {id:'radio',num:'08',title:'Heritage TV / Радио',tag:'Медиа',desc:'Программная сетка интервью, музыки, языка и архивных материалов.',action:'Добавить передачу'},
    {id:'family-books',num:'09',title:'Центр семейных книг',tag:'Семья',desc:'Автоматическая сборка семейной книги из дерева, фото, домов и воспоминаний.',action:'Собрать книгу'},
    {id:'childhood',num:'10',title:'Архив детства',tag:'Память',desc:'Игры, школьные фото, дворы, тетради, песни и воспоминания детства.',action:'Добавить историю'},
    {id:'weddings',num:'11',title:'Архив свадеб',tag:'Семья',desc:'Свадьбы как узлы связей между семьями, фотографиями, музыкой и традициями.',action:'Добавить свадьбу'},
    {id:'migration',num:'12',title:'Архив миграции',tag:'Карта',desc:'Истории переездов семей и маршруты между городами и странами.',action:'Добавить маршрут'},
    {id:'restoration',num:'13',title:'Лаборатория восстановления',tag:'Оцифровка',desc:'Оригинал и восстановленная версия фото/документа хранятся раздельно.',action:'Открыть лабораторию'},
    {id:'lost-pages',num:'14',title:'Потерянные страницы',tag:'Исследование',desc:'Каталог неполных, неизвестных и нуждающихся в идентификации материалов.',action:'Создать задачу'},
    {id:'memory-school',num:'15',title:'Школа хранителей памяти',tag:'Обучение',desc:'Курс по сканированию, интервью, метаданным, источникам и правам.',action:'Начать курс'},
    {id:'nicknames',num:'16',title:'Прозвища и бытовые имена',tag:'Язык',desc:'Семейные прозвища, бытовые формы имён и связи с официальными записями.',action:'Добавить форму'},
    {id:'streets',num:'17',title:'История улиц',tag:'Место',desc:'Биография каждой улицы: названия, дома, семьи, магазины и воспоминания.',action:'Добавить улицу'},
    {id:'business',num:'18',title:'Архив бизнеса и торговли',tag:'Экономика',desc:'Магазины, мастерские, рынки, предприятия и предпринимательские семьи.',action:'Добавить объект'},
    {id:'stories-1000',num:'19',title:'1000 историй',tag:'Цель',desc:'Публичная цель: 1000 проверенных документированных историй.',action:'Добавить историю'},
    {id:'legacy',num:'20',title:'Цифровое наследство',tag:'Капсула',desc:'Личная архивная капсула с настройками доступа и раскрытия.',action:'Создать капсулу'}
  ];

  H.pages.initiatives=()=>H.head('EXPANSION PROGRAM','Новые направления','Двадцать самостоятельных модулей, которые превращают архив в культурную платформу. Все работают внутри этого сайта.')+
    '<section class="initiative-grid">'+H.initiatives.map(x=>'<a class="initiative-card" href="#/initiative-'+E(x.id)+'"><div class="initiative-num">'+E(x.num)+'</div><span class="type">'+E(x.tag)+'</span><h3>'+E(x.title)+'</h3><p>'+E(x.desc)+'</p><b>'+E(x.action)+' →</b></a>').join('')+'</section>';

  const fields={
    studio:[['title','Название фильма / интервью'],['subject','Герой или тема'],['place','Место'],['date','Дата / период'],['sources','Источники и права']],
    yearbook:[['year','Год выпуска'],['theme','Тема выпуска'],['editor','Редактор / куратор']],
    'object-museum':[['title','Название предмета'],['owner','Кому принадлежал'],['period','Период'],['place','Где использовался'],['story','История предмета']],
    professions:[['profession','Профессия / ремесло'],['person','Человек / семья'],['place','Место'],['period','Период'],['evidence','Источник']],
    names:[['name','Имя'],['variants','Варианты написания'],['language','Язык / алфавит'],['familyForm','Семейная форма'],['source','Источник']],
    'one-day':[['title','Название реконструкции'],['period','Год / период'],['place','Место'],['evidence','Какие материалы подтверждают сцену'],['scene','Сценарный фрагмент']],
    exhibitions:[['title','Название выставки'],['theme','Тема'],['curator','Куратор'],['items','ID архивных карточек через запятую']],
    radio:[['title','Название передачи'],['format','Формат'],['duration','Длительность'],['source','Источник материала']],
    'family-books':[['family','Семья'],['title','Название книги'],['period','Период'],['notes','Что включить']],
    childhood:[['title','Название истории'],['person','Человек'],['place','Двор / школа / город'],['period','Период'],['memory','Воспоминание']],
    weddings:[['couple','Жених и невеста'],['date','Дата / период'],['place','Место'],['families','Связанные семьи'],['sources','Фото / свидетели / документы']],
    migration:[['family','Семья'],['from','Откуда'],['to','Куда'],['period','Когда'],['reason','Причина / обстоятельства']],
    'lost-pages':[['title','Что неизвестно'],['kind','Тип материала'],['known','Что уже известно'],['needed','Что нужно установить']],
    nicknames:[['official','Официальное имя'],['nickname','Прозвище / бытовая форма'],['family','Семья'],['place','Где употреблялось'],['source','Кто подтверждает']],
    streets:[['street','Название улицы'],['oldNames','Старые названия'],['period','Период'],['places','Дома / учреждения'],['story','История']],
    business:[['title','Магазин / мастерская / предприятие'],['owners','Владельцы / семья'],['place','Место'],['period','Период'],['source','Источник']],
    'stories-1000':[['title','Название истории'],['person','Кого касается'],['place','Место'],['period','Период'],['story','История'],['source','Источник']],
    legacy:[['title','Название капсулы'],['owner','Человек'],['access','Режим доступа'],['release','Когда открыть'],['instructions','Пожелания / инструкции']]
  };

  function genericPage(id){
    const meta=H.initiatives.find(x=>x.id===id);
    const rows=H.getFeature('initiative-'+id)||[];
    const fs=fields[id]||[];
    return H.head(meta.tag.toUpperCase(),meta.title,meta.desc,
      '<button class="btn secondary" data-export-initiative="'+E(id)+'">Экспорт JSON</button>')+
      '<section class="initiative-work"><form class="panel form-stack initiative-form" data-initiative="'+E(id)+'"><div class="kicker">НОВАЯ ЗАПИСЬ</div>'+
      fs.map(([name,label],i)=>'<label>'+E(label)+(i===fs.length-1&&['story','memory','scene','notes','instructions','known','needed'].includes(name)?'<textarea class="field" rows="5" name="'+E(name)+'"></textarea>':'<input class="field" name="'+E(name)+'" '+(i<2?'required':'')+'>')+'</label>').join('')+
      '<label>Уровень достоверности<select class="field" name="confidence"><option value="unverified">Не подтверждено</option><option value="family">Семейное предание</option><option value="witnesses">Несколько свидетельств</option><option value="documented">Документально подтверждено</option><option value="hypothesis">Версия исследователя</option></select></label>'+
      '<button class="btn primary" type="submit">'+E(meta.action)+'</button></form>'+
      '<div class="initiative-list"><div class="kicker">ЛОКАЛЬНЫЕ ЗАПИСИ</div><h2>'+rows.length+'</h2>'+
      (rows.length?rows.map((r,i)=>'<article><span>#'+(i+1)+'</span><div><strong>'+E(r.title||r.name||r.profession||r.family||r.couple||r.street||r.official||r.owner||'Запись')+'</strong><p>'+E(Object.entries(r).filter(([k])=>!['createdAt','confidence'].includes(k)).slice(1,4).map(([,v])=>v).filter(Boolean).join(' · '))+'</p></div>'+B(r.confidence||'unverified')+'</article>').join(''):'<p class="muted">Записей пока нет.</p>')+
      '</div></section>';
  }

  ['studio','yearbook','object-museum','professions','names','one-day','exhibitions','radio','family-books','childhood','weddings','migration','lost-pages','nicknames','streets','business','stories-1000','legacy'].forEach(id=>H.pages['initiative-'+id]=()=>genericPage(id));

  H.pages['initiative-restoration']=()=>H.head('DIGITAL RESTORATION','Лаборатория восстановления','Оригинал и восстановленная версия всегда существуют отдельно. Эта версия работает локально в браузере, не меняя исходный файл.')+
    '<section class="restore-layout"><div class="restore-pane"><div class="kicker">ОРИГИНАЛ</div><div class="restore-frame"><img id="restoreOriginal"><div id="restoreEmpty">Загрузите фото или документ</div></div><input id="restoreInput" class="field" type="file" accept="image/*"></div><div class="restore-pane"><div class="kicker">ПРЕДПРОСМОТР ОБРАБОТКИ</div><div class="restore-frame"><img id="restorePreview"></div><label>Яркость<input id="restoreBrightness" type="range" min="60" max="160" value="100"></label><label>Контраст<input id="restoreContrast" type="range" min="60" max="180" value="100"></label><label>Насыщенность<input id="restoreSaturation" type="range" min="0" max="160" value="100"></label><p class="muted small">Это только визуальный предпросмотр CSS-фильтра. Оригинальный файл не изменяется.</p></div></section>';

  H.pages['initiative-memory-school']=()=>{
    const progress=H.getFeature('memory-school')||{done:[]};
    const lessons=[
      ['scan','Сканирование','Сканируйте в максимальном доступном качестве; не обрезайте оборот документа.'],
      ['metadata','Метаданные','Запишите кто, где, когда, откуда материал и кому принадлежит оригинал.'],
      ['interview','Интервью','Разделяйте то, что человек видел сам, и то, что знает со слов других.'],
      ['rights','Права','Согласие и право публикации фиксируются отдельно от исторической ценности.'],
      ['sources','Источники','Не повышайте статус записи без конкретного проверяемого источника.']
    ];
    return H.head('MEMORY SCHOOL','Школа хранителей памяти','Короткий курс по правильной работе с семейными архивами.')+
      '<section class="school-grid">'+lessons.map(([id,t,txt],i)=>'<article class="'+(progress.done.includes(id)?'done':'')+'"><span>Урок '+(i+1)+'</span><h3>'+E(t)+'</h3><p>'+E(txt)+'</p><button class="btn secondary school-done" data-lesson="'+E(id)+'">'+(progress.done.includes(id)?'✓ Пройдено':'Отметить пройденным')+'</button></article>').join('')+'</section>'+
      '<div class="notice"><strong>Прогресс:</strong> '+progress.done.length+' из '+lessons.length+' уроков. Данные хранятся только на этом устройстве.</div>';
  };
})();