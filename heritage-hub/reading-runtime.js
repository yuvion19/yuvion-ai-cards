(() => {
  const H=window.H,$=H.$,$$=H.$$;
  const prior=H.bindFeatures;

  function bindReading(route){
    $$('.reading-shelf').forEach(root=>{
      const wraps=$$('.reader-wrap',root);
      const showType=type=>{
        let shown=0;
        wraps.forEach(w=>{
          const ok=type==='__all'||w.dataset.readerType===type;
          w.hidden=!ok;
          if(ok)shown++;
        });
        $$('.reading-filter-row button',root).forEach(b=>b.classList.toggle('active',b.dataset.readType===type));
        const allBtn=$('[data-read-all]',root);
        if(allBtn) allBtn.textContent='Показано '+shown+' материалов';
      };
      $$('.reading-filter-row button',root).forEach(b=>b.addEventListener('click',()=>showType(b.dataset.readType)));
      $('[data-read-all]',root)?.addEventListener('click',()=>{
        wraps.forEach(w=>w.hidden=false);
        $$('.reading-filter-row button',root).forEach(b=>b.classList.remove('active'));
        const btn=$('[data-read-all]',root); if(btn)btn.textContent='Показано '+wraps.length+' материалов';
      });
    });

    if(route==='reading'){
      const all=H.allReading?H.allReading():H.reading;
      const search=$('#readerSearch'), type=$('#readerType'), list=$('#readerList'), count=$('#readerLibraryCount'), more=$('#readerMore');
      let limit=60;

      const filtered=()=>{
        const q=H.norm(search?.value||'');
        const t=type?.value||'';
        return all.filter(r=>{
          const hay=H.norm([r.title,r.body,...(r.tags||[]),r.author||''].join(' '));
          return (!q||hay.includes(q))&&(!t||r.type===t);
        });
      };

      const render=()=>{
        const rows=filtered(), shown=rows.slice(0,limit);
        list.innerHTML=shown.map(r=>H.readingCard(r)).join('');
        count.textContent='Показано '+shown.length+' из '+rows.length+' · всего в читальне '+all.length;
        more.hidden=shown.length>=rows.length;
        more.textContent='Показать ещё '+Math.min(60,Math.max(0,rows.length-shown.length));
      };

      search?.addEventListener('input',()=>{limit=60;render()});
      type?.addEventListener('change',()=>{limit=60;render()});
      more?.addEventListener('click',()=>{limit+=60;render()});
      render();
    }
  }

  H.bindFeatures=r=>{if(prior) prior(r); bindReading(r);};
})();