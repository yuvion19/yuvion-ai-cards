(() => {
  const H=window.H,E=H.esc;
  const anchor=Math.max(1,H.nav.findIndex(x=>x[0]==='knowledge'));
  H.nav.splice(anchor+1,0,
    ['communities','Атлас общин','◎'],
    ['literature','Литература джуури','✎']
  );

  H.pages.communities=()=>{
    const geo=H.knowledge.filter(k=>k.cat==='География общин');
    const diaspora=H.knowledge.filter(k=>k.cat==='Диаспора');
    return H.head('COMMUNITY ATLAS','Атлас общин','Исторические и современные центры горско-еврейской жизни. Это справочный атлас, а не карта проживания конкретных живых людей.')+
      '<section class="atlas-intro panel"><div><div class="kicker">ГЕОГРАФИЯ ПАМЯТИ</div><h2>От Кавказа к мировой диаспоре</h2><p>Каждая географическая карточка должна со временем связывать людей, семьи, документы, фотографии, прессу, язык, синагоги и устные свидетельства — с обязательной временной привязкой.</p></div><div class="atlas-chain"><span>Кавказ</span><b>→</b><span>город</span><b>→</b><span>семья</span><b>→</b><span>диаспора</span></div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ИСТОРИЧЕСКИЕ ЦЕНТРЫ</div><h2>'+geo.length+' карточек</h2></div></div><div class="atlas-grid">'+geo.map(H.knowledgeCard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ДИАСПОРА</div><h2>Современные центры</h2></div></div><div class="knowledge-grid">'+diaspora.map(H.knowledgeCard).join('')+'</div></section>';
  };

  H.pages.literature=()=>{
    const people=H.knowledge.filter(k=>k.cat==='Литературные деятели');
    const works=H.knowledge.filter(k=>k.cat==='Произведения');
    const hist=H.knowledge.filter(k=>k.cat==='Литературная история');
    const press=H.knowledge.filter(k=>k.cat==='История прессы'||k.cat==='Пресса и периодика');
    return H.head('JUHURI LITERATURE','Литературная панорама джуури','Авторы, произведения, театральные тексты, поэзия, проза, перевод и печать — как единая литературная история.')+
      '<section class="literature-hero"><div><div class="kicker">ЛИТЕРАТУРНАЯ СЕТЬ</div><h2>Автор → произведение → издание → язык → архив</h2><p>Задача раздела — не просто перечислить имена, а связать писателя с конкретными текстами, газетами, рукописями, переводами и аудиозаписями.</p></div><aside><strong>'+people.length+'</strong><span>литературных персоналий</span><strong>'+works.length+'</strong><span>карточек произведений</span></aside></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ЛЮДИ</div><h2>Писатели, поэты, переводчики</h2></div></div><div class="knowledge-grid">'+people.map(H.knowledgeCard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ПРОИЗВЕДЕНИЯ</div><h2>Тексты и книги</h2></div></div><div class="knowledge-grid">'+works.map(H.knowledgeCard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">КОНТЕКСТ</div><h2>Литературная история</h2></div></div><div class="knowledge-mini-grid">'+hist.map(H.knowledgeCard).join('')+'</div></section>'+
      '<section class="section-block"><div class="section-title"><div><div class="kicker">ПЕЧАТЬ</div><h2>Газеты как литературный архив</h2></div></div><div class="knowledge-mini-grid">'+press.slice(0,18).map(H.knowledgeCard).join('')+'</div></section>';
  };

  Object.assign(H.knowledgeRouteMap,{
    communities:['География общин','Диаспора','Архивы и коллекции','Вопросы старшим'],
    literature:['Литературные деятели','Произведения','Литературная история','История прессы'],
    home:['Самобытность','Литературные деятели','География общин','Пожелания проекта'],
    research:['Исследовательские темы','Историография','Архивы и коллекции','География общин']
  });
})();