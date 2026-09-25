(() => {
  const H=window.H,D=H.D,$=H.$,$$=H.$$,E=H.esc;
  H.getFeature=k=>{try{return JSON.parse(localStorage.getItem('heritage-feature-'+k)||'null')}catch{return null}};
  H.setFeature=(k,v)=>localStorage.setItem('heritage-feature-'+k,JSON.stringify(v));
  H.pushFeature=(k,v)=>{const a=H.getFeature(k)||[];a.push({...v,createdAt:new Date().toISOString()});H.setFeature(k,a);return a};
  H.sessionAudio={sound:null,voice:null};
  H.photoState={url:null,fileName:null,pending:null};

  function rerender(){window.dispatchEvent(new HashChangeEvent('hashchange'))}
  function featureJson(name,key){H.json(name,H.getFeature(key)||[])}

  async function recorder(kind,onDone){
    const state=H.sessionAudio[kind]||{};
    if(state.recorder&&state.recorder.state==='recording'){
      state.recorder.stop();
      state.stream?.getTracks().forEach(t=>t.stop());
      return {stopping:true};
    }
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder) throw new Error('Запись аудио не поддерживается этим браузером.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const chunks=[];
    const mr=new MediaRecorder(stream);
    state.stream=stream;state.recorder=mr;H.sessionAudio[kind]=state;
    mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    mr.onstop=()=>{
      const blob=new Blob(chunks,{type:mr.mimeType||'audio/webm'});
      if(state.url)URL.revokeObjectURL(state.url);
      state.blob=blob;state.url=URL.createObjectURL(blob);state.stream=null;state.recorder=null;
      onDone(state);
    };
    mr.start();
    return {recording:true,state};
  }

  function downloadAudio(kind,base,meta){
    const s=H.sessionAudio[kind];
    if(!s?.blob)return;
    const ext=(s.blob.type.includes('mp4')?'m4a':s.blob.type.includes('ogg')?'ogg':'webm');
    H.download(base+'.'+ext,s.blob);
    H.json(base+'-metadata.json',meta);
  }

  function drawFaces(){
    const host=$('#faceMarkers'),list=$('#faceList');
    if(!host||!list)return;
    const key=H.photoState.fileName?'faces-'+H.photoState.fileName:'faces-current';
    const marks=H.getFeature(key)||[];
    host.innerHTML=marks.map((m,i)=>'<button class="face-marker" style="left:'+m.x+'%;top:'+m.y+'%" title="'+E(m.name)+'">'+(i+1)+'</button>').join('');
    list.innerHTML=marks.length?marks.map((m,i)=>'<div class="saved-row"><strong>#'+(i+1)+' · '+E(m.name)+'</strong><span>'+E(H.statusLabel(m.confidence))+'</span><small>x '+m.x.toFixed(1)+'% · y '+m.y.toFixed(1)+'%</small></div>').join(''):'<p class="muted">Отметок пока нет.</p>';
  }

  H.bindFeatures=r=>{
    if(r==='family-tree'){
      $('#treeForm')?.addEventListener('submit',e=>{
        e.preventDefault();const fd=new FormData(e.currentTarget);
        H.pushFeature('tree',{id:'local-'+Date.now(),name:fd.get('name'),relation:fd.get('relation'),target:fd.get('target'),status:'unverified'});
        rerender();
      });
      $('#exportTree')?.addEventListener('click',()=>featureJson('family-tree-draft.json','tree'));
    }

    if(r==='houses'){
      $('#houseForm')?.addEventListener('submit',e=>{
        e.preventDefault();const fd=new FormData(e.currentTarget);
        const n=(H.getFeature('houses')||[]).length+1;
        H.pushFeature('houses',{
          id:'house-local-'+Date.now(),heritageId:'MJH-HOUSE-LOCAL-'+String(n).padStart(4,'0'),
          title:fd.get('title'),address:fd.get('address'),memories:fd.get('memories'),
          source:fd.get('source'),status:'unverified',type:'Жилой дом'
        });
        rerender();
      });
      $('#exportHouses')?.addEventListener('click',()=>H.json('house-passports.json',{official:D.places.filter(p=>p.type==='Жилой дом'),drafts:H.getFeature('houses')||[]}));
    }

    if(r==='photo-id'){
      const input=$('#photoInput'),img=$('#photoPreview'),empty=$('#photoEmpty'),ann=$('#photoAnnotator');
      input?.addEventListener('change',()=>{
        const file=input.files?.[0];if(!file)return;
        if(H.photoState.url)URL.revokeObjectURL(H.photoState.url);
        H.photoState.url=URL.createObjectURL(file);H.photoState.fileName=file.name;
        img.src=H.photoState.url;img.style.display='block';empty.style.display='none';drawFaces();
      });
      img?.addEventListener('click',e=>{
        if(!img.src)return;
        const rct=img.getBoundingClientRect();
        H.photoState.pending={x:(e.clientX-rct.left)/rct.width*100,y:(e.clientY-rct.top)/rct.height*100};
        ann.hidden=false;$('#faceName')?.focus();
      });
      $('#saveFace')?.addEventListener('click',()=>{
        const p=H.photoState.pending,name=$('#faceName')?.value.trim();if(!p||!name)return;
        const key='faces-'+(H.photoState.fileName||'current');
        H.pushFeature(key,{...p,name,confidence:$('#faceConfidence').value});
        H.photoState.pending=null;$('#faceName').value='';ann.hidden=true;drawFaces();
      });
      $('#exportFaces')?.addEventListener('click',()=>{
        const key='faces-'+(H.photoState.fileName||'current');
        H.json('photo-identification-'+(H.photoState.fileName||'draft')+'.json',{fileName:H.photoState.fileName,annotations:H.getFeature(key)||[]});
      });
      drawFaces();
    }

    if(r==='mysteries'){
      const dialog=$('#mysteryDialog');
      $$('.mystery-answer').forEach(b=>b.addEventListener('click',()=>{
        const m=H.featureData.mysteries.find(x=>x.id===b.dataset.id);
        $('#mysteryId').value=m.id;$('#mysteryTitle').textContent=m.title;dialog.showModal();
      }));
      $('#mysteryForm')?.addEventListener('submit',e=>{
        const submit=e.submitter?.value;
        if(submit==='cancel')return;
        e.preventDefault();
        const text=$('#mysteryText').value.trim();if(!text)return;
        H.pushFeature('mysteryAnswers',{mysteryId:$('#mysteryId').value,text,reason:$('#mysteryReason').value.trim(),contact:$('#mysteryContact').value.trim(),status:'hypothesis'});
        dialog.close();rerender();
      });
    }

    if(r==='sound-map'){
      let currentMeta=null;
      $('#recordSound')?.addEventListener('click',async()=>{
        const btn=$('#recordSound'),label=$('#recordLabel');
        try{
          const res=await recorder('sound',s=>{
            label.textContent='Запись готова';btn.classList.remove('recording');
            const a=$('#soundPreview');a.src=s.url;a.hidden=false;$('#downloadSound').hidden=false;
            currentMeta={placeId:$('#soundPlace').value,type:$('#soundType').value,createdAt:new Date().toISOString()};
            const list=$('#soundList'),p=D.places.find(x=>x.id===currentMeta.placeId);
            list.innerHTML='<div class="sound-point"><strong>'+E(p?.title||currentMeta.placeId)+'</strong><span>'+E(currentMeta.type)+'</span><small>Запись текущей сессии · не опубликована</small></div>';
          });
          if(res.recording){label.textContent='Идёт запись… нажмите ещё раз, чтобы остановить';btn.classList.add('recording')}
          if(res.stopping)label.textContent='Обработка записи…';
        }catch(err){label.textContent=err.message||'Не удалось получить доступ к микрофону.'}
      });
      $('#downloadSound')?.addEventListener('click',()=>currentMeta&&downloadAudio('sound','heritage-sound-recording',currentMeta));
    }

    if(r==='juhuri-voices'){
      let selected=null,currentMeta=null;
      $$('.voice-word').forEach(b=>b.addEventListener('click',()=>{
        $$('.voice-word').forEach(x=>x.classList.remove('active'));b.classList.add('active');
        selected=D.juhuri.find(x=>x.id===b.dataset.id);$('#voiceWord').textContent=selected.lemma;
        $('#recordVoice').disabled=false;$('#voiceRecordLabel').textContent='Начать запись произношения';
      }));
      $('#recordVoice')?.addEventListener('click',async()=>{
        if(!selected)return;
        const btn=$('#recordVoice'),label=$('#voiceRecordLabel');
        try{
          const res=await recorder('voice',s=>{
            label.textContent='Запись готова';btn.classList.remove('recording');
            const a=$('#voicePreview');a.src=s.url;a.hidden=false;$('#downloadVoice').hidden=false;
            currentMeta={wordId:selected.id,lemma:selected.lemma,dialect:$('#voiceDialect').value,speaker:$('#voiceSpeaker').value.trim(),sourceWord:selected.source,createdAt:new Date().toISOString(),audioStored:'not-uploaded'};
            H.pushFeature('voiceMeta',currentMeta);
          });
          if(res.recording){label.textContent='Идёт запись… нажмите ещё раз для остановки';btn.classList.add('recording')}
          if(res.stopping)label.textContent='Обработка записи…';
        }catch(err){label.textContent=err.message||'Микрофон недоступен.'}
      });
      $('#downloadVoice')?.addEventListener('click',()=>currentMeta&&downloadAudio('voice','juhuri-'+selected.id,currentMeta));
      $('#exportVoiceMeta')?.addEventListener('click',()=>featureJson('juhuri-voices-metadata.json','voiceMeta'));
    }
  };
})();