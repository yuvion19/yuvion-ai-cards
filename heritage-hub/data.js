window.HERITAGE_DATA = {
  project: {
    name: "Нити Памяти",
    international: "Mountain Jewish Heritage Network",
    creator: "Давидов Дон Сережович",
    mission: "Собрать, связать и сохранить цифровую память горских евреев так, чтобы люди, семьи, дома, документы, язык, музыка и устные истории не существовали разрозненно."
  },
  confidence: {
    documented: "Документально подтверждено",
    witnesses: "Подтверждено несколькими свидетельствами",
    family: "Семейное предание",
    hypothesis: "Версия исследователя",
    unverified: "Не подтверждено",
    demo: "ДЕМО"
  },
  sources: [
    {id:"azt-ru", title:"Azerbaijan Travel — Еврейское наследие Красной Слободы", url:"https://azerbaijan.travel/evreyskoe-nasledie-krasnoy-slobody", accessed:"24.09.2026"},
    {id:"azt-en", title:"Azerbaijan Travel — Introduction to Jewish heritage in the Red Settlement", url:"https://azerbaijan.travel/introduction-to-jewish-heritage-in-the-red-settlement", accessed:"24.09.2026"},
    {id:"osm", title:"OpenStreetMap — картографическая основа", url:"https://www.openstreetmap.org/copyright", accessed:"24.09.2026"},
    {id:"naftaliev-2023", title:"М. Н. Нафталиев — Русско-еврейский (джуури) словарь", year:2023, place:"Москва"},
    {id:"naftaliev-2025", title:"М. Н. Нафталиев — Мудрость народа. Книга первая. Пословицы и поговорки", year:2025},
    {id:"bogdanov-2018", title:"Г. Н. Богданов — Учебник горско-еврейского языка джуури", year:2018},
    {id:"bakhshiev-2019", title:"Д. Р. Бахшиев — О фонетике и алфавите джуьгьури", year:2019},
    {id:"agarunov-2010", title:"Я. Агарунов, М. Агарунов — Большой словарь языка горских евреев — джуури", year:2010},
    {id:"amir-2022", title:"Валерий Амир (Иванченко) — Горско-еврейско-русский словарь", year:2022},
    {id:"semenduev-2021", title:"А. Ш. Семендуев, С. М. Семендуева — Горско-еврейско-русский словарь", year:2021},
    {id:"gilyadov-1995", title:"Н. И. Гилядов, Н. Х. Авшалумова — Русско-татский (джуури) разговорник", year:1995}
  ],
  places: [
    {
      id:"qirmizi-qesebe", kind:"place", title:"Красная Слобода", alt:"Qırmızı Qəsəbə",
      type:"Населённый пункт", address:"Губинский район, Азербайджан", lat:41.3737, lng:48.5171, yearFrom:1750,
      status:"documented", visibility:"public",
      summary:"Поселение горских евреев на правом берегу реки Гудиалчай, напротив города Губа.",
      history:"По публичным источникам поселение сформировалось в середине XVIII века. Подробная хронология улиц, домов и семей добавляется только вместе с подтверждающими материалами.",
      sources:["azt-ru","azt-en","osm"]
    },
    {
      id:"museum-mountain-jews", kind:"place", title:"Музей горских евреев", alt:"Dağ Yəhudiləri Muzeyi",
      type:"Музей", address:"Красная Слобода, Губинский район", lat:41.3721, lng:48.5158,
      status:"unverified", visibility:"public",
      summary:"Музей, посвящённый истории и культуре горских евреев Красной Слободы.",
      history:"Карточка перенесена из цифрового архива. Координаты и подробности экспозиции требуют дополнительной сверки с официальными материалами музея.",
      sources:["azt-ru","azt-en"]
    },
    {
      id:"six-dome-synagogue", kind:"place", title:"Шестикупольная синагога", alt:"Altı Günbəzli Sinaqoq",
      type:"Синагога", address:"Красная Слобода, Губинский район",
      status:"unverified", visibility:"public",
      summary:"Историческая синагога поселения, известная как Six Dome Synagogue.",
      history:"Сам объект подтверждается публичными материалами, однако датировка, координаты и история перестроек в этой базе пока не считаются окончательно верифицированными.",
      sources:["azt-ru","azt-en"]
    },
    {
      id:"cemetery-area", kind:"place", title:"Кладбище поселения",
      type:"Кладбище", address:"Красная Слобода, Губинский район", lat:41.3781, lng:48.5123,
      status:"unverified", visibility:"public",
      summary:"Историческое кладбище общины. Реестр секций, эпитафий и захоронений формируется постепенно.",
      history:"Полевые границы участка, номера секций и привязки отдельных захоронений требуют фотофиксации и проверки.",
      sources:["azt-ru"]
    },
    {
      id:"house-demo-001", kind:"place", title:"Дом №001", type:"Жилой дом",
      address:"Улица уточняется, дом 001", lat:41.3752, lng:48.5189, yearFrom:1900,
      status:"demo", visibility:"public", demo:true,
      summary:"Демонстрационная карточка дома для проверки структуры будущего реестра.",
      history:"Не является историческим утверждением. Реальные дома добавляются после идентификации адреса, семьи и источников.",
      sources:["osm"]
    }
  ],
  families: [
    {id:"family-demo-a", kind:"family", title:"Фамилия A", spellings:["Вариант I","Вариант II (лат.)","Вариант III (ивр.)"], geography:["Красная Слобода","Губа"], status:"demo", demo:true, summary:"Демонстрационная карточка фамилии. Реальные фамилии публикуются только с источником."},
    {id:"family-demo-b", kind:"family", title:"Фамилия B", spellings:["Вариант I","Вариант II (лат.)"], geography:["Красная Слобода"], status:"demo", demo:true, summary:"Шаблон связей семьи с домами, людьми, документами и географией."}
  ],
  people: [
    {id:"person-demo-1", kind:"person", title:"Историческая персона", years:"XIX век — период уточняется", familyId:"family-demo-a", status:"demo", demo:true, summary:"Имя не указано: запись служит только для демонстрации структуры связей."},
    {id:"person-demo-2", kind:"person", title:"Запись скрыта — живущий человек", familyId:"family-demo-a", status:"demo", demo:true, private:true, summary:"Данные живых людей не публикуются без согласия."},
    {id:"person-demo-3", kind:"person", title:"Историческая персона", years:"период уточняется", familyId:"family-demo-b", status:"demo", demo:true, summary:"Сведения будут добавлены после подтверждения источником."}
  ],
  archive: [
    {id:"photo-demo-1", kind:"archive", subtype:"Фото", title:"Историческое фото", period:"период уточняется", place:"Красная Слобода", rights:"права уточняются", status:"demo", demo:true, summary:"Демо-карточка: датировка, автор, права и связи с местом."},
    {id:"doc-demo-1", kind:"archive", subtype:"Документ", title:"Архивный документ", period:"период уточняется", place:"Губинский район", rights:"внутреннее использование до проверки", status:"demo", demo:true, private:true, summary:"Приватные документы не отображаются публично; доступен только паспорт записи."},
    {id:"video-demo-1", kind:"archive", subtype:"Видео", title:"Прогулка по поселению", period:"2020-е", place:"Красная Слобода", rights:"лицензия уточняется", status:"demo", demo:true, summary:"Шаблон карточки видео: длительность, автор, лицензия и связи."},
    {id:"audio-demo-1", kind:"archive", subtype:"Аудио", title:"Аудио-воспоминание", period:"период уточняется", place:"Красная Слобода", rights:"требуется согласие информанта", status:"demo", demo:true, summary:"Устные свидетельства публикуются только с согласием и после проверки метаданных."}
  ],
  cemeterySections: [
    {id:"section-1", title:"Секция 1", count:1, status:"demo", note:"Граница секции уточняется"},
    {id:"section-2", title:"Секция 2", count:1, status:"demo", note:"Граница секции уточняется"},
    {id:"section-3", title:"Секция 3", count:0, status:"demo", note:"Съёмка не проводилась"},
    {id:"section-4", title:"Секция 4", count:0, status:"demo", note:"Съёмка не проводилась"}
  ],
  burials: [
    {id:"burial-demo-1", kind:"burial", title:"Захоронение 001", section:"section-1", years:"годы уточняются", transcription:"Транскрипция эпитафии не выполнена", translation:"Перевод будет добавлен после транскрипции", lat:41.3783,lng:48.5126,status:"demo",demo:true},
    {id:"burial-demo-2", kind:"burial", title:"Захоронение 002", section:"section-2", years:"годы уточняются", transcription:"Транскрипция эпитафии не выполнена", translation:"Перевод будет добавлен после транскрипции", lat:41.3779,lng:48.512,status:"demo",demo:true}
  ],
  juhuri: [
    {id:"astara", kind:"word", lemma:"астара", ru:["звезда"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «звезда»"},
    {id:"mar", kind:"word", lemma:"мар", ru:["змея"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «змея»"},
    {id:"biror", kind:"word", lemma:"бирор", ru:["брат"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «брат»"},
    {id:"vorvori", kind:"word", lemma:"ворвори", ru:["ветер"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «ветер»"},
    {id:"tavar", kind:"word", lemma:"тәвәр", ru:["топор"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «топор»"},
    {id:"holov", kind:"word", lemma:"һолов", ru:["палас"], pos:"сущ.", dialect:"guba", status:"documented", source:"naftaliev-2023", locator:"словарная статья «палас»"},
    {id:"sholum", kind:"word", lemma:"Шолум!", ru:["Здравствуй!","приветствие"], pos:"межд.", dialect:"derbent", status:"documented", source:"bogdanov-2018", locator:"учебный материал, приветствия", example:"Шолум! — Здравствуй! / Мир вам!"}
  ],
  books: [
    {id:"torah",title:"Тора (Пятикнижие Моисеево)",author:"Традиция",category:"Священные тексты",note:"Пять книг Моисея. В проекте используется как библиографическая ссылка, а не как собственная копия текста.",url:"https://www.sefaria.org/texts/Tanakh/Torah"},
    {id:"tanakh",title:"Танах",author:"Традиция",category:"Священные тексты",note:"Тора, Пророки и Писания.",url:"https://www.sefaria.org/texts/Tanakh"},
    {id:"talmud",title:"Вавилонский Талмуд",author:"Мудрецы Вавилона",category:"Священные тексты",note:"Библиографическая ссылка на открытую библиотеку.",url:"https://www.sefaria.org/texts/Talmud/Bavli"},
    {id:"shulchan",title:"Шулхан Арух",author:"Йосеф Каро",category:"Галаха",note:"Кодекс практического еврейского закона, XVI век.",url:"https://www.sefaria.org/texts/Halakhah/Shulchan%20Arukh"},
    {id:"zohar",title:"Зохар",author:"Каббалистическая традиция",category:"Каббала",note:"Библиографическая карточка.",url:"https://www.sefaria.org/texts/Kabbalah/Zohar"},
    {id:"sidur",title:"Сидур",author:"Литургическая традиция",category:"Литургия",note:"Молитвенник; ссылка ведёт во внешнюю открытую библиотеку.",url:"https://www.sefaria.org/texts/Liturgy"},
    {id:"mishneh",title:"Мишне Тора",author:"Рамбам",category:"Галаха",note:"Систематический свод еврейского права.",url:"https://www.sefaria.org/texts/Halakhah/Mishneh%20Torah"},
    {id:"mishnah",title:"Мишна",author:"Рабби Йегуда ха-Наси",category:"Священные тексты",note:"Библиографическая карточка.",url:"https://www.sefaria.org/texts/Mishnah"},
    {id:"pirkei",title:"Пиркей Авот",author:"Мудрецы Мишны",category:"Этика",note:"Этические поучения.",url:"https://www.sefaria.org/Pirkei_Avot"},
    {id:"tehillim",title:"Тегилим (Псалмы)",author:"Традиция",category:"Священные тексты",note:"Книга Псалмов.",url:"https://www.sefaria.org/Psalms"},
    {id:"juhuri-ref",title:"Материалы по языку джуури",author:"Языковой раздел проекта",category:"Джуури",note:"Словари и учебные материалы собраны в разделе «Джуури».",url:"#/juhuri"}
  ],
  dishes: [
    {id:"d1",title:"Хойягушт",juhuri:"Хойягуьшт",kind:"Основное",note:"Материал старого проекта; рецепт и происхождение требуют семейного/печатного источника."},
    {id:"d2",title:"Ярпаг долма",juhuri:"Долмей барг",kind:"Основное",note:"Виноградные листья с мясной начинкой; карточка требует источника."},
    {id:"d3",title:"Бугламу",juhuri:"Буглами",kind:"Основное",note:"Тушёное мясное блюдо; карточка требует источника."},
    {id:"d4",title:"Ош / плов",juhuri:"Ош",kind:"Основное",note:"Материал старого проекта; семейные варианты будут храниться отдельно."},
    {id:"d5",title:"Кюфта",juhuri:"Куфтэ",kind:"Основное",note:"Карточка требует источника."},
    {id:"d6",title:"Хамраши",juhuri:"Хамраши",kind:"Суп",note:"Карточка требует источника."},
    {id:"d7",title:"Дюшпара",juhuri:"Дуьшпэрэ",kind:"Суп",note:"Карточка требует источника."},
    {id:"d8",title:"Пити",juhuri:"Пити",kind:"Суп",note:"Карточка требует источника."},
    {id:"d9",title:"Довга",juhuri:"Довгэ",kind:"Суп",note:"Карточка требует источника."},
    {id:"d10",title:"Ширин плов",juhuri:"Ош ширин",kind:"Основное",note:"Карточка требует источника."},
    {id:"d11",title:"Тара",juhuri:"Тара",kind:"Основное",note:"Карточка требует источника."},
    {id:"d12",title:"Чуду",juhuri:"Чуьду",kind:"Выпечка",note:"Карточка требует источника."},
    {id:"d13",title:"Гогал",juhuri:"Гогал",kind:"Выпечка",note:"Карточка требует источника."},
    {id:"d14",title:"Шор гогал",juhuri:"Шор гогал",kind:"Выпечка",note:"Карточка требует источника."},
    {id:"d15",title:"Пахлава губинская",juhuri:"Пахлавей Губо",kind:"Сладость",note:"Карточка требует источника."},
    {id:"d16",title:"Шакербура",juhuri:"Шэкэрбурэ",kind:"Сладость",note:"Карточка требует источника."},
    {id:"d17",title:"Гата",juhuri:"Гатэ",kind:"Сладость",note:"Карточка требует источника."},
    {id:"d18",title:"Халва губинская",juhuri:"Халвей Губо",kind:"Сладость",note:"Карточка требует источника."},
    {id:"d19",title:"Хойяин ош",juhuri:"Хойин ош",kind:"Основное",note:"Карточка требует источника."},
    {id:"d20",title:"Кебаб люля",juhuri:"Кебаб",kind:"Основное",note:"Карточка требует источника."},
    {id:"d21",title:"Рыба на углях",juhuri:"Мохи",kind:"Основное",note:"Карточка требует источника."},
    {id:"d22",title:"Турши",juhuri:"Турши",kind:"Закуска",note:"Карточка требует источника."},
    {id:"d23",title:"Нарынджи мураба",juhuri:"Мурабей",kind:"Сладость",note:"Карточка требует источника."},
    {id:"d24",title:"Чай",juhuri:"Чой",kind:"Напиток",note:"Карточка требует источника."}
  ],
  timeline: [
    {year:1750,label:"Середина XVIII века",title:"Формирование Красной Слободы",status:"documented",sources:["azt-ru","azt-en"],text:"В базе фиксируется только общий подтверждённый период; более точные даты будут добавлены после источниковой сверки."},
    {year:2020,label:"Современность",title:"Цифровое сохранение наследия",status:"hypothesis",sources:[],text:"Эта запись описывает направление проекта, а не историческое событие общины."}
  ],
  legacySections: [
    {id:"history",title:"История",icon:"🏛",status:"unverified",body:"Материалы старого проекта переносятся в новую систему только после источниковой проверки."},
    {id:"music",title:"Музыка и фольклор",icon:"🎻",status:"unverified",body:"Раздел подготовлен для песен, исполнителей, нот, текстов, полевых записей и истории произведений."},
    {id:"traditions",title:"Культура и традиции",icon:"✦",status:"unverified",body:"Одежда, украшения, ремёсла, праздники, свадьбы и бытовая культура будут связываться с семьями, местами и источниками."},
    {id:"oral",title:"Голоса народа",icon:"◉",status:"unverified",body:"Устные истории старшего поколения: детство, дом, школа, свадьбы, кухня, язык, переезд и память о родственниках."}
  ],
  modules: [
    {id:"graph",title:"Heritage Graph",desc:"Связи человек → семья → дом → место → документ → фотография → голос → событие.",ready:true},
    {id:"twin",title:"Red Village Digital Twin",desc:"Карта Красной Слободы, временные слои, дома, синагоги, музей и кладбище.",ready:true},
    {id:"language",title:"Juhuri Language Lab",desc:"Словарь, диалекты, учебные карточки, источники и будущий корпус.",ready:true},
    {id:"archive",title:"Global Archive",desc:"Фото, документы, видео, аудио, книги, права и уровни доступа.",ready:true},
    {id:"voices",title:"Oral History Network",desc:"Система сбора рассказов старшего поколения с согласием и метаданными.",ready:true}
  ]
};