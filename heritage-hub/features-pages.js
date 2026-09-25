(() => {
  const H=window.H,D=H.D,E=H.esc,B=H.badge;
  H.nav.splice(4,0,
    ['family-tree','Семейное дерево','⑂'],
    ['houses','Паспорта домов','⌂'],
    ['photo-id','Кто на фото?','◎'],
    ['mysteries','Архивные загадки','?'],
    ['sound-map','Звуковая карта','♪']
  );
  const j=H.nav.findIndex(x=>x[0]==='learn');
  H.nav.splice(j+1,0,['juhuri-voices','Juhuri Voices','◖']);

  H.featureData={
    mysteries:[
      {id:'m1',title:'Неизвестные люди на исторической фотографии',kind:'Фотография',status:'demo',priority:'Высокий',question:'Кто изображён, где и когда сделан снимок?',linked:'photo-demo-1'},
      {id:'m2',title:'Точная привязка Шестикупольной синагоги',kind:'Место',status:'unverified',priority:'Средний',question:'Нужен проверяемый источник для точных координат и датировки.',linked:'six-dome-synagogue'},
      {id:'m3',title:'История демонстрационного дома №001',kind:'Дом',status:'demo',priority:'Высокий',question:'Шаблон ожидает реальный адрес, фотографии, семьи и документы.',linked:'house-demo-001'},
      {id:'m4',title:'Транскрипция эпитафии 001',kind:'Кладбище',status:'demo',priority:'Высокий',question:'Нужна фотография надгробия и точная транскрипция.',linked:'burial-demo-1'},
      {id:'m5',title:'Проверка музейной карточки',kind:'Музей',status:'unverified',priority:'Средний',question:'Нужны официальные данные для уточнения координат, дат и описания экспозиции.',linked:'museum-mountain-jews'}
    ],
    houseFields:['Адрес','Исторические фотографии','Связанные семьи','Жители','Документы','Воспоминания','Источники','Координаты'],
    soundPrompts:['Название места на джуури','Воспоминание о доме','История улицы','Фрагмент песни','Произношение топонима']
  };

  H.pages['family-tree']=()=>{
    const local=H.getFeature('tree')||[];
    const persons=[...D.people.map(p=>({id:p.id,name:p.title,family:p.familyId,status:p.status,demo:true})),...local];
    const families=D.families;
    return H.head('FAMILY GRAPH','Семейное дерево','Интерактивный граф строится только из явно внесённых связей. Демонстрационные записи не являются реальной родословной.',
      '<button class="btn secondary" id="exportTree">Экспорт дерева</button>')+
      '<section class="tree-layout"><div class="tree-canvas" id="treeCanvas">'+
        families.map((f,i)=>'<div class="tree-family" style="--x:'+(20+i*50)+'%"><span>СЕМЬЯ · ДЕМО</span><strong>'+E(f.title)+'</strong>'+B(f.status)+'</div>').join('')+
        persons.map((p,i)=>'<div class="tree-person '+(p.demo?'is-demo':'')+'" style="--x:'+(12+(i%4)*25)+'%;--y:'+(170+Math.floor(i/4)*130)+'px" data-person="'+E(p.id)+'"><span>'+E(p.demo?'ДЕМО':'ЛОКАЛЬНЫЙ ЧЕРНОВИК')+'</span><strong>'+E(p.name)+'</strong><small>'+E(p.relation||'связь не указана')+'</small></div>').join('')+
      '</div><form class="panel form-stack" id="treeForm"><div class="kicker">ДОБАВИТЬ ЛОКАЛЬНУЮ ВЕТКУ</div><label>Имя / подпись<input class="field" name="name" required></label><label>Связь<select class="field" name="relation"><option>родитель</option><option>ребёнок</option><option>супруг/супруга</option><option>брат/сестра</option><option>другая связь</option></select></label><label>К кому относится<select class="field" name="target"><option value="">Пока не связывать</option>'+persons.map(p=>'<option value="'+E(p.id)+'">'+E(p.name)+'</option>').join('')+'</select></label><button class="btn primary">Добавить на этом устройстве</button><p class="muted small">Локальная ветка не публикуется в общем архиве автоматически.</p></form></section>';
  };

  H.pages.houses=()=>{
    const drafts=H.getFeature('houses')||[];
    const houses=[...D.places.filter(p=>p.type==='Жилой дом'),...drafts];
    return H.head('HOUSE PASSPORTS','Паспорта домов','Каждый дом получает устойчивый Heritage ID и связывается с семьями, фотографиями, документами и воспоминаниями.',
      '<button class="btn secondary" id="exportHouses">Экспорт паспортов</button>')+
      '<section class="house-grid">'+houses.map((h,i)=>{
        const filled=[h.address,h.photos,h.families,h.people,h.documents,h.memories,h.sources?.length,h.lat].filter(Boolean).length;
        const quality=Math.round(filled/H.featureData.houseFields.length*100);
        return '<article class="house-passport"><div class="passport-id">'+E(h.heritageId||('MJH-HOUSE-DEMO-'+String(i+1).padStart(4,'0')))+'</div><div class="record-top"><span class="type">Дом</span>'+B(h.status||'demo')+'</div><h3>'+E(h.title)+'</h3><p>'+E(h.address||'Адрес уточняется')+'</p><div class="quality"><span><i style="width:'+quality+'%"></i></span><b>'+quality+'%</b></div><small>полнота паспорта</small><details><summary>Поля паспорта</summary><ul>'+H.featureData.houseFields.map(f=>'<li>'+E(f)+'</li>').join('')+'</ul></details></article>';
      }).join('')+'</section>'+
      '<section class="panel section-block"><div class="kicker">НОВЫЙ ЧЕРНОВИК ДОМА</div><form id="houseForm" class="house-form"><label>Адрес<input class="field" name="address" required></label><label>Историческое название / номер<input class="field" name="title" required></label><label>Что известно<textarea class="field" name="memories" rows="4"></textarea></label><label>Источник сведений<input class="field" name="source"></label><button class="btn primary">Создать паспорт</button></form></section>';
  };

  H.pages['photo-id']=()=>H.head('CROWD IDENTIFICATION','Кто на фотографии?','Загрузите семейное фото только в браузер, нажмите на лицо и добавьте предположение. Изображение никуда автоматически не отправляется.')+
    '<section class="photo-lab"><div class="photo-stage"><div class="photo-empty" id="photoEmpty"><strong>Загрузите фотографию</strong><span>JPG / PNG · обработка только на устройстве</span></div><img id="photoPreview" alt="Загруженная семейная фотография"><div id="faceMarkers"></div></div><aside class="panel form-stack"><label>Выбрать фото<input id="photoInput" class="field" type="file" accept="image/*"></label><div class="notice compact">После загрузки нажмите на нужное лицо. Координаты отметки сохраняются только локально.</div><div id="photoAnnotator" hidden><label>Кто это может быть?<input class="field" id="faceName"></label><label>Основание<select class="field" id="faceConfidence"><option value="family">Семейное предание</option><option value="witnesses">Несколько свидетельств</option><option value="hypothesis">Гипотеза</option></select></label><button class="btn primary" id="saveFace">Сохранить отметку</button></div><button class="btn secondary" id="exportFaces">Экспорт разметки JSON</button></aside></section><section class="section-block"><div class="section-title"><div><div class="kicker">ОТМЕТКИ</div><h2>Предположения</h2></div></div><div id="faceList"></div></section>';

  H.pages.mysteries=()=>{
    const answers=H.getFeature('mysteryAnswers')||[];
    return H.head('ARCHIVE DETECTIVE','Архивные загадки','Открытые исследовательские задачи: неизвестные люди, дома, даты, подписи и надгробия. Ответ пользователя считается гипотезой до проверки.')+
      '<section class="mystery-grid">'+H.featureData.mysteries.map(m=>'<article class="mystery-card"><div class="record-top"><span class="priority">'+E(m.priority)+'</span>'+B(m.status)+'</div><span class="type">'+E(m.kind)+'</span><h3>'+E(m.title)+'</h3><p>'+E(m.question)+'</p><button class="btn secondary mystery-answer" data-id="'+E(m.id)+'">Предложить версию</button><small>Предложений на этом устройстве: '+answers.filter(a=>a.mysteryId===m.id).length+'</small></article>').join('')+'</section><dialog id="mysteryDialog"><form method="dialog" class="dialog-card" id="mysteryForm"><button class="dialog-close" value="cancel">×</button><div class="kicker">ИССЛЕДОВАТЕЛЬСКАЯ ВЕРСИЯ</div><h2 id="mysteryTitle">Предложить версию</h2><input type="hidden" id="mysteryId"><label>Ваше предположение<textarea id="mysteryText" class="field" rows="5" required></textarea></label><label>Почему вы так думаете?<textarea id="mysteryReason" class="field" rows="3"></textarea></label><label>Контакт / имя — необязательно<input id="mysteryContact" class="field"></label><button class="btn primary" id="saveMystery" value="default">Сохранить локально как гипотезу</button></form></dialog>';
  };

  H.pages['sound-map']=()=>H.head('SOUND MAP','Звуковая карта','Запишите воспоминание или произношение, привяжите его к месту и скачайте аудио с метаданными. Всё работает в браузере без платного сервера.')+
    '<section class="sound-layout"><div class="map-card">'+H.mapSvg()+'</div><div class="panel form-stack"><label>Место<select class="field" id="soundPlace">'+D.places.filter(p=>!p.demo).map(p=>'<option value="'+E(p.id)+'">'+E(p.title)+'</option>').join('')+'</select></label><label>Тип записи<select class="field" id="soundType">'+H.featureData.soundPrompts.map(x=>'<option>'+E(x)+'</option>').join('')+'</select></label><div class="recorder"><button class="record-btn" id="recordSound">●</button><div><strong id="recordLabel">Начать запись</strong><small>Микрофон запрашивается только после нажатия.</small></div></div><audio id="soundPreview" controls hidden></audio><button class="btn secondary" id="downloadSound" hidden>Скачать аудио</button></div></section><section class="section-block"><div class="section-title"><div><div class="kicker">ЗВУКОВЫЕ ТОЧКИ</div><h2>Текущая сессия</h2></div></div><div id="soundList"><p class="muted">Записей в этой сессии пока нет.</p></div></section>';

  H.pages['juhuri-voices']=()=>{
    const saved=H.getFeature('voiceMeta')||[];
    return H.head('JUHURI VOICES','Голоса джуури','Записывайте реальное произношение слов носителями. Аудио можно прослушать и скачать; метаданные сохраняются локально до передачи куратору.')+
      '<section class="voice-lab"><div class="word-selector">'+D.juhuri.map(w=>'<button class="voice-word" data-id="'+E(w.id)+'"><strong>'+E(w.lemma)+'</strong><span>'+E(w.ru[0])+'</span></button>').join('')+'</div><div class="panel voice-recorder"><div class="kicker">ЗАПИСЬ НОСИТЕЛЯ</div><h2 id="voiceWord">Выберите слово</h2><label>Диалект<select class="field" id="voiceDialect"><option value="guba">Губинский</option><option value="derbent">Дербентский</option><option value="kaitag">Кайтагский</option><option value="other">Другой / уточняется</option></select></label><label>Имя или код носителя<input class="field" id="voiceSpeaker" placeholder="необязательно"></label><div class="recorder"><button class="record-btn" id="recordVoice" disabled>●</button><div><strong id="voiceRecordLabel">Сначала выберите слово</strong><small>Запись не отправляется автоматически.</small></div></div><audio id="voicePreview" controls hidden></audio><button class="btn secondary" id="downloadVoice" hidden>Скачать запись</button></div></section><section class="section-block"><div class="section-title"><div><div class="kicker">МЕТАДАННЫЕ</div><h2>Локально сохранено: '+saved.length+'</h2></div><button class="btn secondary" id="exportVoiceMeta">Экспорт JSON</button></div><div>'+saved.map(x=>'<div class="saved-row"><strong>'+E(x.lemma)+'</strong><span>'+E(x.dialect)+'</span><small>'+E(x.speaker||'анонимно')+'</small></div>').join('')+'</div></section>';
  };
})();