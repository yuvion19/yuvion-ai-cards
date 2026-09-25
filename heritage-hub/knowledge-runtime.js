(() => {
  const H=window.H,$=H.$,$$=H.$$,E=H.esc;
  const prior=H.bindFeatures;

  function bindKnowledge(r){
    if(r==='knowledge'){
      const q=$('#knowledgeSearch'),cat=$('#knowledgeCat'),count=$('#knowledgeCount');
      const filter=()=>{
        const nq=H.norm(q?.value||''), c=cat?.value||'';
        let n=0;
        $$('#knowledgeGrid .knowledge-card').forEach(card=>{
          const ok=(!nq||card.dataset.search.includes(nq))&&(!c||card.dataset.cat===c);
          card.hidden=!ok;if(ok)n++;
        });
        if(count)count.textContent='Показано: '+n+' из '+H.knowledge.length;
      };
      q?.addEventListener('input',filter);cat?.addEventListener('change',filter);
      $$('.knowledge-cats button').forEach(b=>b.addEventListener('click',()=>{
        if(cat)cat.value=b.dataset.kcat;
        $$('.knowledge-cats button').forEach(x=>x.classList.toggle('active',x===b));
        filter();
      }));
      filter();
    }
  }

  H.bindFeatures=r=>{if(prior)prior(r);bindKnowledge(r)};
})();