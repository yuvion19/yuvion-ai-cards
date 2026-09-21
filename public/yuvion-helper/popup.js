const statusEl=document.getElementById('status');
function status(text){statusEl.textContent=text}
document.getElementById('open').onclick=()=>chrome.tabs.create({url:'https://admin.yuvion.ru/'});
document.getElementById('fill').onclick=async()=>{
  try{
    status('Читаем полный пакет Yuvion…');
    const raw=await navigator.clipboard.readText();
    const payload=JSON.parse(raw);
    if(payload?.type!=='yuvion-product-autofill'||!payload.product)throw new Error('В буфере нет пакета Yuvion AI Cards.');
    await chrome.storage.local.set({autofillPayload:payload});
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!String(tab.url||'').startsWith('https://admin.yuvion.ru/'))throw new Error('Сначала откройте admin.yuvion.ru.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['fill.js']});
    status('Перенос выполнен. Проверьте форму, категорию и изображения перед сохранением.');
  }catch(e){status(e.message||'Не удалось заполнить форму.')}
};
