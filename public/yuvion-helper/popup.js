const statusEl=document.getElementById('status');
const diagBox=document.getElementById('diagBox');
function status(text){statusEl.textContent=text}
function renderReport(report){
  diagBox.innerHTML='';
  if(!report){diagBox.innerHTML='<div>Отчёта пока нет.</div>';return}
  const rows=[
    ['Поля',String(report.filled||0)+' заполнено / '+String((report.missing||[]).length)+' не найдено'],
    ['Изображения',String(report.imagesUploaded||0)+' из '+String(report.imagesRequested||0)],
    ['Форма',String(report.inputCount||0)+' inputs · '+String(report.fileInputCount||0)+' file inputs'],
    ['Страница',String(report.url||'').replace(/^https?:\/\//,'').slice(0,54)]
  ];
  diagBox.innerHTML=rows.map(x=>'<div><b>'+x[0]+':</b> '+x[1]+'</div>').join('');
}
document.getElementById('open').onclick=()=>chrome.tabs.create({url:'https://admin.yuvion.ru/'});
document.getElementById('diag').onclick=async()=>{
  const {lastFillReport}=await chrome.storage.local.get('lastFillReport');
  renderReport(lastFillReport||null);
};
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
    await new Promise(r=>setTimeout(r,350));
    const {lastFillReport}=await chrome.storage.local.get('lastFillReport');
    renderReport(lastFillReport||null);
    status('Перенос завершён. Проверьте категорию, найденные поля и изображения перед сохранением.');
  }catch(e){status(e.message||'Не удалось заполнить форму.')}
};