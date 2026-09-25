(() => {
  const H=window.H,$=H.$,$$=H.$$,D=H.D;
  const prior=H.bindFeatures;

  function bindInitiatives(r){
    if(r==='initiatives') return;

    if(r.startsWith('initiative-')){
      const id=r.replace('initiative-','');

      $$('.initiative-form').forEach(form=>form.addEventListener('submit',e=>{
        e.preventDefault();
        const fd=new FormData(form), row={};
        for(const [k,v] of fd.entries()) row[k]=v;
        H.pushFeature('initiative-'+id,row);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }));

      $$('[data-export-initiative]').forEach(b=>b.addEventListener('click',()=>{
        const key='initiative-'+b.dataset.exportInitiative;
        H.json(key+'.json',H.getFeature(key)||[]);
      }));

      if(id==='restoration'){
        const input=$('#restoreInput'),orig=$('#restoreOriginal'),preview=$('#restorePreview'),empty=$('#restoreEmpty');
        let url=null;
        const apply=()=>{
          if(!preview)return;
          preview.style.filter='brightness('+($('#restoreBrightness')?.value||100)+'%) contrast('+($('#restoreContrast')?.value||100)+'%) saturate('+($('#restoreSaturation')?.value||100)+'%)';
        };
        input?.addEventListener('change',()=>{
          const file=input.files?.[0];if(!file)return;
          if(url)URL.revokeObjectURL(url);
          url=URL.createObjectURL(file);
          orig.src=url;preview.src=url;orig.style.display='block';preview.style.display='block';if(empty)empty.style.display='none';apply();
        });
        ['#restoreBrightness','#restoreContrast','#restoreSaturation'].forEach(s=>$(s)?.addEventListener('input',apply));
      }

      if(id==='memory-school'){
        $$('.school-done').forEach(b=>b.addEventListener('click',()=>{
          const p=H.getFeature('memory-school')||{done:[]};
          if(!p.done.includes(b.dataset.lesson))p.done.push(b.dataset.lesson);
          H.setFeature('memory-school',p);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }));
      }

      if(id==='stories-1000'){
        const rows=H.getFeature('initiative-stories-1000')||[];
        const target=1000, pct=Math.min(100,rows.length/target*100);
        const host=$('.initiative-list');
        if(host){
          host.insertAdjacentHTML('afterbegin','<div class="stories-progress"><div><strong>'+rows.length+'</strong><span>из 1000 историй</span></div><div class="progress-bar"><i style="width:'+pct+'%"></i></div><small>Счётчик отражает только реально сохранённые записи на этом устройстве.</small></div>');
        }
      }

      if(id==='yearbook'){
        const rows=H.getFeature('initiative-yearbook')||[];
        const host=$('.initiative-list');
        if(host&&rows.length){
          const last=rows[rows.length-1];
          const btn=document.createElement('button');
          btn.className='btn secondary';
          btn.textContent='Печать / PDF последнего выпуска';
          btn.addEventListener('click',()=>window.print());
          host.prepend(btn);
        }
      }

      if(id==='family-books'){
        const host=$('.initiative-list');
        if(host){
          const btn=document.createElement('button');
          btn.className='btn secondary';
          btn.textContent='Собрать черновик книги из текущего архива';
          btn.addEventListener('click',()=>{
            const family=(H.getFeature('initiative-family-books')||[]).at(-1);
            if(!family){alert('Сначала создайте запись семьи для книги.');return}
            const pkg={
              generatedAt:new Date().toISOString(),
              family:family.family,
              title:family.title,
              notes:family.notes,
              demoFamilyRecords:D.families,
              linkedPeople:D.people.filter(p=>!p.private),
              places:D.places.filter(p=>!p.private),
              archive:D.archive.filter(a=>!a.private)
            };
            H.json('family-book-draft.json',pkg);
          });
          host.prepend(btn);
        }
      }

      if(id==='exhibitions'){
        const host=$('.initiative-list');
        if(host){
          const note=document.createElement('div');
          note.className='notice compact';
          note.innerHTML='<strong>Конструктор:</strong> в поле ID можно использовать идентификаторы карточек из архива, мест, семей и людей. Экспорт сохраняет кураторскую подборку без копирования оригиналов.';
          host.prepend(note);
        }
      }

      if(id==='legacy'){
        const forms=$$('.initiative-form');
        forms.forEach(f=>{
          const access=f.querySelector('[name="access"]');
          if(access){access.setAttribute('placeholder','семье / публично / после даты / после смерти');}
        });
      }
    }
  }

  H.bindFeatures=r=>{if(prior)prior(r);bindInitiatives(r)};
})();