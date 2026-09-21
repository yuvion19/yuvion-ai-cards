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
      let inputs=[...section.querySelectorAll('input')].filter(el=>!['search','hidden'].includes(el.type));
      const pairs=[];
      for(let j=0;j+1<inputs.length;j+=2)pairs.push([inputs[j],inputs[j+1]]);
      if(!pairs[i]&&addBtn){addBtn.click();await new Promise(r=>setTimeout(r,80));inputs=[...section.querySelectorAll('input')].filter(el=>!['search','hidden'].includes(el.type))}
      const refreshed=[];
      for(let j=0;j+1<inputs.length;j+=2)refreshed.push([inputs[j],inputs[j+1]]);
      const pair=refreshed[i];
      if(pair){setValue(pair[0],chars[i].name);setValue(pair[1],chars[i].value)}
    }
  }

  document.getElementById('yuvion-helper-banner')?.remove();
  const banner=document.createElement('div');
  banner.id='yuvion-helper-banner';
  banner.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;z-index:2147483647;background:#0B1D2D;color:#fff;padding:12px 14px;border-radius:12px;font:600 13px/1.35 system-ui;box-shadow:0 15px 45px rgba(0,0,0,.28)';
  banner.textContent='Yuvion Helper: заполнено полей — '+filled+'. Проверьте данные, подтвердите категорию, загрузите изображения и только затем отправляйте на модерацию.';
  document.body.appendChild(banner);
  setTimeout(()=>banner.remove(),9000);
})();