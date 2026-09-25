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
      const cards=$$('#readerList>[data-reader-main-type]');
      $$('[data-reader-main]').forEach(b=>b.addEventListener('click',()=>{
        const type=b.dataset.readerMain;
        $$('[data-reader-main]').forEach(x=>x.classList.toggle('active',x===b));
        cards.forEach(c=>c.hidden=!(type==='__all'||c.dataset.readerMainType===type));
      }));
    }
  }
  H.bindFeatures=r=>{if(prior) prior(r); bindReading(r);};
})();