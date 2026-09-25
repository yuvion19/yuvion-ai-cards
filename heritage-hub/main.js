(() => {
  const H=window.H,D=H.D,$=H.$,$$=H.$$,E=H.esc,B=H.badge;

  function render(){
    document.documentElement.dataset.theme=localStorage.getItem('heritage-theme')||'light';
    const r=H.route(), fn=H.pages[r]||H.pages.home;
    $('#app').innerHTML=H.shell(fn());
    bindCommon();
    bindPage(r);
    document.title=(H.nav.find(x=>x[0]===r)?.[1]||'Нити Памяти')+' — Нити Памяти';
  }

  function bindCommon(){
    const side=$('#sidebar'), overlay=$('#overlay');
    const setNav=v=>{side?.classList.toggle('open',v);overlay?.classList.toggle('show',v);document.body.classList.toggle('nav-open',v)};
    $('#menuBtn')?.addEventListener('click',()=>setNav(true));
    $('#closeNav')?.addEventListener('click',()=>setNav(false));
    overlay?.addEventListener('click',()=>setNav(false));
    $('#themeBtn')?.addEventListener('click',()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('heritage-theme',n)});
    const input=$('#globalSearch'),pop=$('#searchPop');
    if(input&&pop){
      input.addEventListener('input',()=>{
        if(input.value.trim().length<2){pop.classList.remove('show');pop.innerHTML='';return}
        const hits=H.search(input.value);
        pop.innerHTML=hits.length?hits.map(({x})=>'<a href="#/'+H.recordRoute(x)+'"><strong>'+E(x.title||x.lemma)+'</strong><span>'+E(x.type||x.subtype||x.kind)+'</span>'+B(x.status)+'</a>').join(''):'<div class="no-result">Ничего не найдено в локальной базе.</div>';
        pop.classList.add('show');
      });
      input.addEventListener('keydown',e=>{if(e.key==='Escape')pop.classList.remove('show')});
    }
  }

  function bindPage(r){
    if(r==='red-village'){
      const range=$('#yearRange'),val=$('#yearValue'),title=$('#timeTitle');
      range?.addEventListener('input',()=>{const y=+range.value;val.textContent=y;title.textContent='Слой: '+y;$$('#placeGrid .record-card').forEach(c=>{const yf=+c.dataset.year||0;c.hidden=!!(yf&&yf>y)})});
    }
    if(r==='archive'){
      const f=$('#archiveFilter'),k=$('#archiveKind');
      const run=()=>$$('#archiveGrid .record-card').forEach(c=>{c.hidden=!((!f.value||c.dataset.search.includes(H.norm(f.value)))&&(!k.value||c.dataset.kind===k.value))});
      f?.addEventListener('input',run);k?.addEventListener('change',run);
      $('#exportArchive')?.addEventListener('click',()=>H.json('archive.json',D.archive.filter(x=>!x.private)));
    }
    if(r==='juhuri'){
      const q=$('#juhuriSearch'),d=$('#dialectFilter'),count=$('#juhuriCount');
      const run=()=>{let n=0;$$('#juhuriGrid .word-card').forEach(c=>{const ok=(!q.value||c.dataset.search.includes(H.norm(q.value)))&&(!d.value||c.dataset.dialect===d.value);c.hidden=!ok;if(ok)n++});count.textContent='Найдено: '+n};
      q?.addEventListener('input',run);d?.addEventListener('change',run);run();
    }
    if(r==='learn'){
      const w=D.juhuri[H.quizIndex%D.juhuri.length];
      $('#revealWord')?.addEventListener('click',()=>$('#lessonTranslation').textContent=w.ru.join(', '));
      $('#nextWord')?.addEventListener('click',()=>{H.quizIndex++;render()});
      $$('.quiz-options button').forEach(b=>b.addEventListener('click',()=>{$$('.quiz-options button').forEach(x=>x.disabled=true);b.classList.add(b.dataset.answer===w.id?'correct':'wrong');const right=$('.quiz-options button[data-answer="'+w.id+'"]');right?.classList.add('correct');$('#quizFeedback').textContent=b.dataset.answer===w.id?'Верно. Источник указан ниже.':'Неверно. Правильный вариант выделен.'}));
    }
    if(r==='library'){
      $$('.filter-chips button').forEach(b=>b.addEventListener('click',()=>{$$('.filter-chips button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('#bookList .book-row').forEach(row=>row.hidden=!!b.dataset.bookCat&&row.dataset.cat!==b.dataset.bookCat)}));
    }
    if(r==='cuisine'){
      const q=$('#dishSearch'),k=$('#dishKind');
      const run=()=>$$('#dishGrid article').forEach(c=>{c.hidden=!((!q.value||c.dataset.search.includes(H.norm(q.value)))&&(!k.value||c.dataset.kind===k.value))});
      q?.addEventListener('input',run);k?.addEventListener('change',run);
    }
    if(r==='voices'){
      $('#oralForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);H.saveLocal({type:'oral',speaker:fd.get('speaker'),topic:fd.get('topic'),story:fd.get('story'),consent:!!fd.get('consent')});render()});
      $('#exportOral')?.addEventListener('click',()=>H.json('oral-history-drafts.json',H.getLocal().filter(x=>x.type==='oral')));
    }
    if(r==='ask'){
      const run=()=>{const q=$('#askInput').value.trim(),out=$('#askResult');if(!q){out.innerHTML='';return}const hits=H.search(q).filter(h=>!h.x.private).slice(0,8);if(!hits.length){out.innerHTML='<div class="evidence-answer empty"><strong>Данных недостаточно.</strong><p>В локальной базе нет записи, которая подтверждала бы ответ на этот вопрос. Система не будет додумывать.</p></div>';return}out.innerHTML='<div class="evidence-answer"><div class="kicker">НАЙДЕНО В БАЗЕ</div><h2>'+hits.length+' релевантных записей</h2><p>Это не сгенерированный ответ: ниже только существующие карточки и их статус.</p><div class="evidence-list">'+hits.map(({x})=>'<article><div><strong>'+E(x.title||x.lemma)+'</strong><p>'+E(x.summary||((x.ru||[]).join(', ')))+'</p></div>'+B(x.status)+'</article>').join('')+'</div></div>'};
      $('#askBtn')?.addEventListener('click',run);$('#askInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')run()});
    }
    if(r==='research'){
      const pub=()=>({generatedAt:new Date().toISOString(),sources:D.sources,records:H.records().filter(x=>!x.private)});
      $('#exportAllJson')?.addEventListener('click',()=>H.json('mountain-jewish-heritage-open-data.json',pub()));
      $('#exportAllCsv')?.addEventListener('click',()=>H.csv('mountain-jewish-heritage-open-data.csv',pub().records));
    }
    if(r==='contribute'){
      $('#materialForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);H.saveLocal({type:'material',category:fd.get('category'),title:fd.get('title'),description:fd.get('description'),source:fd.get('source'),rights:fd.get('rights'),consent:!!fd.get('consent')});render()});
      $('#exportMaterials')?.addEventListener('click',()=>H.json('heritage-material-drafts.json',H.getLocal().filter(x=>x.type==='material')));
    }
  }

  window.addEventListener('hashchange',render);
  if(!location.hash) location.hash='#/home'; else render();
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();