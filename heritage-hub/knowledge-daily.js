(() => {
  const H=window.H,D=H.D,E=H.esc;
  const oldHome=H.pages.home;
  const dayIndex=(len,offset=0)=>{
    const d=new Date();
    const seed=Number(String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'))+offset;
    return len?seed%len:0;
  };
  H.pages.home=()=>{
    const base=oldHome();
    const sourced=H.knowledge.filter(k=>k.sourceIds?.length);
    const wishes=H.knowledge.filter(k=>k.cat==='Пожелания проекта');
    const questions=H.knowledge.filter(k=>k.cat==='Вопросы старшим');
    const kids=H.knowledge.filter(k=>k.cat==='Детям');
    const practices=H.knowledge.filter(k=>k.cat==='Архивная практика');
    const item=sourced[dayIndex(sourced.length)];
    const wish=wishes[dayIndex(wishes.length,7)];
    const q=questions[dayIndex(questions.length,13)];
    const mission=kids[dayIndex(kids.length,19)];
    const practice=practices[dayIndex(practices.length,23)];
    const word=D.juhuri[dayIndex(D.juhuri.length,29)];
    const dailyHtml='<section class="daily-memory section-block"><div class="section-title"><div><div class="kicker">ПАМЯТЬ СЕГОДНЯ</div><h2>Шесть поводов открыть архив</h2></div><a class="text-link" href="#/knowledge">Все '+H.knowledge.length+' материалов →</a></div><div class="daily-grid">'+
      '<article class="daily-main"><span class="type">Материал дня</span><h3>'+E(item?.title||'')+'</h3><p>'+E(item?.summary||'')+'</p>'+H.knowledgeSourceHtml(item?.sourceIds||[])+'</article>'+
      '<article><span class="type">Слово джуури</span><h3>'+E(word?.lemma||'')+'</h3><p>'+E((word?.ru||[]).join(', '))+'</p><a href="#/juhuri">Открыть словарь →</a></article>'+
      '<article><span class="type">Вопрос старшим</span><h3>'+E(q?.title||'')+'</h3><p>'+E(q?.summary||'')+'</p><a href="#/voices">Записать ответ →</a></article>'+
      '<article><span class="type">Семейная миссия</span><h3>'+E(mission?.title||'')+'</h3><p>'+E(mission?.summary||'')+'</p><a href="#/memory">Все задания →</a></article>'+
      '<article><span class="type">Правило архива</span><h3>'+E(practice?.title||'')+'</h3><p>'+E(practice?.summary||'')+'</p><a href="#/methodology">Методология →</a></article>'+
      '<article class="daily-wish"><span class="type">Пожелание</span><blockquote>'+E(wish?.summary||'')+'</blockquote><small>Авторский текст «Нити Памяти»</small></article>'+
      '</div></section>';
    return base+dailyHtml;
  };
})();