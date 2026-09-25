(() => {
  const H=window.H,E=H.esc;
  const kcard=k=>H.knowledgeCard(k);
  const insertAt=Math.max(1,H.nav.findIndex(x=>x[0]==='library'));
  H.nav.splice(insertAt+1,0,
    ['surnames','Фамилии','Aa'],
    ['calendar','Календарь и праздники','◷'],
    ['memory','Память предков','∞']
  );

  H.pages.surnames=()=>{
    const items=H.knowledge.filter(k=>k.cat==='Фамилии');
    return H.head('ONOMASTICS','Горско-еврейские фамилии','Примеры фамилий, встречающихся в источниках и биографиях. Фамилия сама по себе не является доказательством этнического происхождения.')+
      '<div class="notice"><strong>Правило раздела:</strong> совпадение фамилии — это только повод искать документы, места, родственные связи и варианты написания.</div>'+
      '<section class="surname-index">'+items.map(k=>'<article><div class="surname-letter">'+E(k.title[0]||'')+'</div><div><h3>'+E(k.title)+'</h3><p>'+E(k.summary)+'</p>'+H.knowledgeSourceHtml(k.sourceIds)+'</div></article>').join('')+'</section>';
  };

  H.pages.calendar=()=>{
    const months=H.knowledge.filter(k=>k.cat==='Еврейский календарь');
    const holidays=H.knowledge.filter(k=>k.cat==='Праздники');
    return H.head('JEWISH CALENDAR','Еврейский календарь и праздники','Справочник по структуре календаря, месяцам, Шаббату и главным праздникам. Конкретные даты меняются от года к году.')+
      '<section class="panel calendar-intro"><div class="kicker">ЛУННО-СОЛНЕЧНЫЙ КАЛЕНДАРЬ</div><h2>Месяцы, праздники и цикл чтения Торы</h2><p>Для исторического архива календарь полезен ещё и как способ правильно переводить даты между гражданской и еврейской системами. При публикации конкретной даты проект должен сохранять обе формы и источник преобразования.</p>'+H.knowledgeSourceHtml(['sefaria-calendar'])+'</section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">МЕСЯЦЫ</div><h2>Годовой цикл</h2></div></div><div class="calendar-grid">'+months.map(kcard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ПРАЗДНИКИ</div><h2>Основные даты и периоды</h2></div></div><div class="knowledge-grid">'+holidays.map(kcard).join('')+'</div></section>';
  };

  H.pages.memory=()=>{
    const wishes=H.knowledge.filter(k=>k.cat==='Пожелания проекта');
    const aph=H.knowledge.filter(k=>k.cat==='Афоризмы проекта'||k.cat==='Афоризмы');
    const riddles=H.knowledge.filter(k=>k.cat==='Авторские загадки');
    const memory=H.knowledge.filter(k=>k.cat==='Память предков');
    return H.head('MEMORY CODE','Память предков','Практические правила, пожелания и короткие формы, которые помогают передавать память дальше. Авторские тексты проекта помечены отдельно от традиционного фольклора.')+
      '<section class="memory-manifesto"><div class="kicker">ГЛАВНОЕ ПОЖЕЛАНИЕ</div><blockquote>Не оставляйте следующему поколению только вещи. Оставьте имена, голоса, истории, язык и объяснение, почему всё это важно.</blockquote><span>Авторский текст проекта «Нити Памяти»</span></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ПРАКТИКА</div><h2>Что сохранить сегодня</h2></div></div><div class="knowledge-mini-grid">'+memory.map(kcard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ПОЖЕЛАНИЯ</div><h2>Передать дальше</h2></div></div><div class="wish-grid">'+wishes.map(k=>'<blockquote><p>'+E(k.summary)+'</p><span>Нити Памяти</span></blockquote>').join('')+'</div></section>'+
      '<section class="section-block two-col"><div><div class="section-title"><div><div class="kicker">АФОРИЗМЫ</div><h2>Коротко о памяти</h2></div></div><div class="aph-list">'+aph.map(k=>'<div><q>'+E(k.title)+'</q><p>'+E(k.summary)+'</p></div>').join('')+'</div></div><div><div class="section-title"><div><div class="kicker">ЗАГАДКИ</div><h2>Для детей и семей</h2></div></div><div class="riddle-list">'+riddles.map(k=>'<details><summary>'+E(k.title)+'</summary><p>'+E(k.summary)+'</p></details>').join('')+'</div></div></section>';
  };

  H.knowledgeRouteMap.surnames=['Фамилии','Память предков','Пожелания проекта'];
  H.knowledgeRouteMap.calendar=['Еврейский календарь','Праздники','Тора и иудаизм'];
  H.knowledgeRouteMap.memory=['Память предков','Пожелания проекта','Афоризмы проекта','Авторские загадки'];
})();