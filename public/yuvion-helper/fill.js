(async()=>{
  const {autofillPayload}=await chrome.storage.local.get('autofillPayload');
  const p=autofillPayload?.product;
  if(!p)return;

  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru');
  const setValue=(el,value)=>{
    if(!el||value===undefined||value===null||String(value)==='')return false;
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const desc=Object.getOwnPropertyDescriptor(proto,'value');
    if(desc?.set)desc.set.call(el,String(value));else el.value=String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  };

  const candidateItems=()=>[...document.querySelectorAll('.ant-form-item, .form-group, label, [class*="form-item"], [class*="field"]')];
  const findInputByLabel=(needles,{textarea=false}={})=>{
    const ns=(Array.isArray(needles)?needles:[needles]).map(norm);
    let best=null,bestLen=Infinity;
    for(const item of candidateItems()){
      const txt=norm(item.innerText||item.textContent);
      if(!ns.some(n=>txt.includes(n)))continue;
      const el=item.querySelector(textarea?'textarea':'input,textarea');
      if(el&&txt.length<bestLen){best=el;bestLen=txt.length}
    }
    if(best)return best;
    for(const lab of document.querySelectorAll('label,div,span')){
      const txt=norm(lab.innerText||lab.textContent);
      if(!ns.some(n=>txt===n||txt.startsWith(n)))continue;
      const root=lab.closest('.ant-form-item')||lab.parentElement?.parentElement||lab.parentElement;
      const el=root?.querySelector(textarea?'textarea':'input,textarea');
      if(el)return el;
    }
    return null;
  };

  let filled=0;
  if(setValue(findInputByLabel(['название']),p.title))filled++;
  if(setValue(findInputByLabel(['бренд']),p.brand))filled++;
  if(setValue(findInputByLabel(['sku','артикул']),p.sku))filled++;
  if(setValue(findInputByLabel(['штрихкод','ean','barcode']),p.barcode))filled++;
  if(setValue(findInputByLabel(['описание'],{textarea:true}),p.description))filled++;

  const categoryInput=findInputByLabel(['категория']);
  if(setValue(categoryInput,p.category)){filled++;setTimeout(()=>categoryInput?.click(),250)}

  const oldPrice=findInputByLabel(['старая цена']);
  if(setValue(oldPrice,p.prices?.old))filled++;

  const priceInputs=[];
  for(const item of candidateItems()){
    const txt=norm(item.innerText||item.textContent);
    if(!txt.includes('цена')||txt.includes('старая'))continue;
    const el=item.querySelector('input');
    if(el&&!priceInputs.includes(el))priceInputs.push(el);
  }
  const prices=[p.prices?.one,p.prices?.two,p.prices?.three];
  priceInputs.slice(0,3).forEach((el,i)=>{if(setValue(el,prices[i]))filled++});

  const chars=Array.isArray(p.characteristics)?p.characteristics.filter(x=>x?.name&&x?.value).slice(0,12):[];
  if(chars.length){
    const addBtn=[...document.querySelectorAll('button')].find(b=>norm(b.innerText||b.textContent).includes('добавить характеристик'));
    const section=addBtn?.closest('.ant-card,section,[class*="card"]')||addBtn?.parentElement?.parentElement||document;
    for(let i=0;i<chars.length;i++){
      let inputs=[...section.querySelectorAll('input')].filter(el=>!['search','hidden','file'].includes(el.type));
      let pairs=[];
      for(let j=0;j+1<inputs.length;j+=2)pairs.push([inputs[j],inputs[j+1]]);
      if(!pairs[i]&&addBtn){
        addBtn.click();
        await new Promise(r=>setTimeout(r,100));
        inputs=[...section.querySelectorAll('input')].filter(el=>!['search','hidden','file'].includes(el.type));
      }
      pairs=[];
      for(let j=0;j+1<inputs.length;j+=2)pairs.push([inputs[j],inputs[j+1]]);
      const pair=pairs[i];
      if(pair){setValue(pair[0],chars[i].name);setValue(pair[1],chars[i].value)}
    }
  }

  const imageItems=Array.isArray(p.images)?p.images.filter(x=>x?.base64).slice(0,4):[];
  let uploaded=0;
  if(imageItems.length){
    const decode=(value)=>{
      const binary=atob(String(value||''));
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return bytes;
    };
    const candidates=[...document.querySelectorAll('input[type="file"]')].filter(el=>!el.disabled);
    const imageInputs=candidates.filter(el=>{
      const accept=norm(el.getAttribute('accept'));
      const root=el.closest('.ant-form-item,section,[class*="card"],[class*="upload"]')||el.parentElement;
      const txt=norm(root?.innerText||root?.textContent);
      return accept.includes('image')||txt.includes('изображ')||txt.includes('фото');
    });
    const target=imageInputs[0]||candidates[0]||null;
    if(target){
      try{
        const dt=new DataTransfer();
        imageItems.forEach((img,index)=>{
          const mime=String(img.mimeType||'image/png');
          const name=String(img.name||('yuvion-card-'+(index+1)+'.png')).replace(/[\\/:*?"<>|]+/g,'_');
          dt.items.add(new File([decode(img.base64)],name,{type:mime}));
        });
        target.files=dt.files;
        target.dispatchEvent(new Event('input',{bubbles:true}));
        target.dispatchEvent(new Event('change',{bubbles:true}));
        uploaded=dt.files.length;
      }catch(e){
        console.warn('Yuvion Helper image transfer failed',e);
      }
    }
  }

  document.getElementById('yuvion-helper-banner')?.remove();
  const banner=document.createElement('div');
  banner.id='yuvion-helper-banner';
  banner.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;z-index:2147483647;background:#0B1D2D;color:#fff;padding:12px 14px;border-radius:12px;font:600 13px/1.4 system-ui;box-shadow:0 15px 45px rgba(0,0,0,.28)';
  banner.textContent='Yuvion Helper 2.0: заполнено полей — '+filled+(imageItems.length?'; изображений передано — '+uploaded+' из '+imageItems.length:'')+'. Проверьте форму, подтвердите категорию и изображения. Отправка на модерацию остаётся только за вами.';
  document.body.appendChild(banner);
  setTimeout(()=>banner.remove(),12000);
})();
