(async()=>{
  const {autofillPayload}=await chrome.storage.local.get('autofillPayload');
  const p=autofillPayload?.product;
  if(!p)return;

  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru');
  const visible=el=>!!(el&&el.isConnected&&el.getClientRects().length&&!el.disabled);
  const fire=el=>{for(const type of ['input','change','blur'])el.dispatchEvent(new Event(type,{bubbles:true}))};
  const setValue=(el,value)=>{
    if(!visible(el)||value===undefined||value===null||String(value)==='')return false;
    if(el.isContentEditable){el.textContent=String(value);fire(el);return true}
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    const desc=Object.getOwnPropertyDescriptor(proto,'value');
    if(desc?.set)desc.set.call(el,String(value));else el.value=String(value);
    fire(el);return true;
  };
  const controls=()=>[...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')].filter(visible);
  const textOf=el=>norm([
    el.getAttribute?.('name'),el.getAttribute?.('id'),el.getAttribute?.('placeholder'),
    el.getAttribute?.('aria-label'),el.getAttribute?.('data-testid')
  ].filter(Boolean).join(' '));
  const candidateItems=()=>[...document.querySelectorAll('.ant-form-item,.form-group,[class*="form-item"],[class*="field"],label')];
  const findByMeta=needles=>{
    const ns=needles.map(norm);
    let best=null,bestScore=0;
    for(const el of controls()){
      if(['hidden','file','search'].includes(el.type))continue;
      const meta=textOf(el);let score=0;
      for(const n of ns){if(meta===n)score=Math.max(score,100);else if(meta.includes(n))score=Math.max(score,80)}
      if(score>bestScore){best=el;bestScore=score}
    }
    return best;
  };
  const findByLabel=(needles,{textarea=false}={})=>{
    const ns=(Array.isArray(needles)?needles:[needles]).map(norm);
    const meta=findByMeta(ns);if(meta&&(!textarea||meta.tagName==='TEXTAREA'||meta.isContentEditable))return meta;
    let best=null,bestLen=Infinity;
    for(const item of candidateItems()){
      const txt=norm(item.innerText||item.textContent);
      if(!ns.some(n=>txt.includes(n)))continue;
      const el=item.querySelector?.(textarea?'textarea,[contenteditable="true"]':'input,textarea,select,[contenteditable="true"]');
      if(visible(el)&&txt.length<bestLen){best=el;bestLen=txt.length}
    }
    if(best)return best;
    for(const lab of document.querySelectorAll('label,div,span')){
      const txt=norm(lab.innerText||lab.textContent);
      if(!ns.some(n=>txt===n||txt.startsWith(n)))continue;
      const root=lab.closest('.ant-form-item,[class*="form-item"],[class*="field"]')||lab.parentElement?.parentElement||lab.parentElement;
      const el=root?.querySelector(textarea?'textarea,[contenteditable="true"]':'input,textarea,select,[contenteditable="true"]');
      if(visible(el))return el;
    }
    return null;
  };

  const report={version:'3.0.0',at:Date.now(),url:location.href,filled:0,missing:[],filledFields:[],imagesRequested:Array.isArray(p.images)?p.images.length:0,imagesUploaded:0,inputCount:controls().length,fileInputCount:document.querySelectorAll('input[type="file"]').length};
  const put=(name,needles,value,opts={})=>{
    if(!value)return;
    const el=findByLabel(needles,opts);
    if(setValue(el,value)){report.filled++;report.filledFields.push(name)}else report.missing.push(name);
  };

  put('Название',['название товара','наименование товара','название'],p.title);
  put('Бренд',['бренд','brand'],p.brand);
  put('SKU',['sku','артикул','код товара','код позиции'],p.sku);
  put('EAN',['штрихкод','ean','barcode','gtin'],p.barcode);
  put('Описание',['полное описание','описание товара','описание'],p.description,{textarea:true});

  const categoryInput=findByLabel(['категория товара','категория']);
  if(setValue(categoryInput,p.category)){report.filled++;report.filledFields.push('Категория');setTimeout(()=>categoryInput?.focus(),150)}else if(p.category)report.missing.push('Категория');

  const oldPrice=findByLabel(['старая цена','цена до скидки']);
  if(p.prices?.old){if(setValue(oldPrice,p.prices.old)){report.filled++;report.filledFields.push('Старая цена')}else report.missing.push('Старая цена')}

  const priceAliases=[
    ['Цена 1 шт.',['цена за 1','розничная цена','цена 1','цена']],
    ['Цена от 2',['цена от 2','2 шт','опт 2']],
    ['Цена от 3',['цена от 3','3 шт','опт 3']]
  ];
  const priceValues=[p.prices?.one,p.prices?.two,p.prices?.three];
  const usedPrice=new Set();
  priceAliases.forEach((cfg,i)=>{
    const value=priceValues[i];if(!value)return;
    let el=findByLabel(cfg[1]);
    if(el&&usedPrice.has(el))el=null;
    if(el&&setValue(el,value)){usedPrice.add(el);report.filled++;report.filledFields.push(cfg[0])}else report.missing.push(cfg[0]);
  });
  if(usedPrice.size<priceValues.filter(Boolean).length){
    const priceInputs=[];
    for(const item of candidateItems()){
      const txt=norm(item.innerText||item.textContent);
      if(!txt.includes('цена')||txt.includes('старая'))continue;
      const el=item.querySelector?.('input');if(visible(el)&&!priceInputs.includes(el))priceInputs.push(el);
    }
    priceValues.forEach((value,i)=>{if(value&&priceInputs[i]&&!usedPrice.has(priceInputs[i])&&setValue(priceInputs[i],value)){usedPrice.add(priceInputs[i]);report.filled++}});
  }

  const chars=Array.isArray(p.characteristics)?p.characteristics.filter(x=>x?.name&&x?.value).slice(0,12):[];
  if(chars.length){
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    const addBtn=buttons.find(b=>/добавить.*характерист/.test(norm(b.innerText||b.textContent)));
    const section=addBtn?.closest('.ant-card,section,[class*="card"],[class*="character"]')||addBtn?.parentElement?.parentElement||document;
    for(let i=0;i<chars.length;i++){
      let inputs=[...section.querySelectorAll('input')].filter(el=>visible(el)&&!['search','hidden','file'].includes(el.type));
      let pairs=[];for(let j=0;j+1<inputs.length;j+=2)pairs.push([inputs[j],inputs[j+1]]);
      if(!pairs[i]&&addBtn){addBtn.click();await new Promise(r=>setTimeout(r,140));inputs=[...section.querySelectorAll('input')].filter(el=>visible(el)&&!['search','hidden','file'].includes(el.type));pairs=[];for(let j=0;j+1<inputs.length;j+=2)pairs.push([inputs[j],inputs[j+1]])}
      const pair=pairs[i];if(pair){setValue(pair[0],chars[i].name);setValue(pair[1],chars[i].value)}else report.missing.push('Характеристика '+(i+1));
    }
  }

  const imageItems=Array.isArray(p.images)?p.images.filter(x=>x?.base64).slice(0,4):[];
  if(imageItems.length){
    const decode=value=>{const binary=atob(String(value||''));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes};
    const candidates=[...document.querySelectorAll('input[type="file"]')].filter(visible);
    const imageInputs=candidates.filter(el=>{
      const accept=norm(el.getAttribute('accept'));const root=el.closest('.ant-form-item,section,[class*="card"],[class*="upload"]')||el.parentElement;const txt=norm(root?.innerText||root?.textContent);
      return accept.includes('image')||txt.includes('изображ')||txt.includes('фото');
    });
    try{
      if(imageInputs.length===1||imageInputs.some(x=>x.multiple)){
        const target=imageInputs.find(x=>x.multiple)||imageInputs[0]||candidates[0];
        if(target){
          const dt=new DataTransfer();
          imageItems.forEach((img,index)=>{const mime=String(img.mimeType||'image/png');const name=String(img.name||('yuvion-card-'+(index+1)+'.png')).replace(/[\\/:*?"<>|]+/g,'_');dt.items.add(new File([decode(img.base64)],name,{type:mime}))});
          target.files=dt.files;fire(target);report.imagesUploaded=dt.files.length;
        }
      }else if(imageInputs.length>1){
        for(let i=0;i<Math.min(imageItems.length,imageInputs.length);i++){
          const img=imageItems[i],dt=new DataTransfer(),mime=String(img.mimeType||'image/png'),name=String(img.name||('yuvion-card-'+(i+1)+'.png')).replace(/[\\/:*?"<>|]+/g,'_');
          dt.items.add(new File([decode(img.base64)],name,{type:mime}));imageInputs[i].files=dt.files;fire(imageInputs[i]);report.imagesUploaded++;
        }
      }
    }catch(e){report.imageError=String(e.message||'image transfer failed').slice(0,160)}
  }

  await chrome.storage.local.set({lastFillReport:report});
  document.getElementById('yuvion-helper-banner')?.remove();
  const banner=document.createElement('div');banner.id='yuvion-helper-banner';
  banner.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;z-index:2147483647;background:#101D2A;color:#fff;padding:13px 15px;border-radius:12px;font:600 13px/1.45 system-ui;box-shadow:0 15px 45px rgba(0,0,0,.28)';
  banner.textContent='Yuvion Helper 3.0: полей заполнено '+report.filled+', не найдено '+report.missing.length+'; изображений '+report.imagesUploaded+' из '+report.imagesRequested+'. Проверьте категорию и форму. Публикация остаётся только за вами.';
  document.body.appendChild(banner);setTimeout(()=>banner.remove(),14000);
})();