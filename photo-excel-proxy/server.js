import express from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 10000;
const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const TMP = path.join(os.tmpdir(), 'photo-excel');
await fs.mkdir(TMP, { recursive: true });

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({ dest: TMP, limits:{ fileSize:50*1024*1024 } });
const jobs = new Map();
const workQueue = [];
const scanCache = new Map();
let running = false;
const CACHE_MS = 15 * 60 * 1000;

function setJob(id,patch){
  const j=jobs.get(id);
  if(!j) return;
  Object.assign(j,patch,{updatedAt:Date.now()});
}
function normalizeName(name=''){
  const s=String(name).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const i=s.lastIndexOf('.');
  let stem=i>0?s.slice(0,i):s;
  let ext=i>0?s.slice(i+1):'';
  if(ext==='jpeg') ext='jpg';
  return {key:stem+(ext?'.'+ext:''),stem,ext};
}
function variantBase(stem=''){
  const s=String(stem).trim();
  const m=s.match(/^(.*?)(?:[_\-\s]+|\s*\()([1-9])\)?$/);
  return m && m[1].trim() ? m[1].trim() : s;
}
function isImage(name=''){return /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(name);}
function joinPath(parent,name){
  const clean=String(name).replace(/^\/+|\/+$/g,'');
  return parent?parent.replace(/\/+$/,'')+'/'+clean:'/'+clean;
}
async function yfetch(url){
  const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'PhotoExcel/3.0'}});
  const txt=await r.text();
  if(!r.ok) throw new Error('Яндекс Диск HTTP '+r.status+': '+txt.slice(0,180));
  return JSON.parse(txt);
}
async function scanPublicDisk(publicKey,onProgress=()=>{}){
  const cached=scanCache.get(publicKey);
  if(cached && Date.now()-cached.at<CACHE_MS) return cached.files;
  const files=[], q=[''], seen=new Set();
  let folders=0;
  while(q.length){
    const folderPath=q.shift();
    if(seen.has(folderPath)) continue;
    seen.add(folderPath);
    let offset=0;
    while(true){
      const p=new URLSearchParams({
        public_key:publicKey,limit:'1000',offset:String(offset),
        preview_size:'360x360',preview_crop:'false'
      });
      if(folderPath) p.set('path',folderPath);
      const data=await yfetch(API+'?'+p.toString());
      const emb=data._embedded;
      if(!emb||!Array.isArray(emb.items)) break;
      for(const item of emb.items){
        if(item.type==='dir') q.push(joinPath(folderPath,item.name));
        else if(item.type==='file'&&isImage(item.name)){
          files.push({
            name:item.name,path:joinPath(folderPath,item.name),
            preview:item.preview||'',file:item.file||'',size:item.size||0,
            mime:item.mime_type||''
          });
        }
      }
      offset+=emb.items.length;
      onProgress({files:files.length,folders,pending:q.length});
      if(!emb.items.length||offset>=(emb.total||0)) break;
    }
    folders++;
  }
  scanCache.set(publicKey,{files,at:Date.now()});
  return files;
}
function buildMaps(files){
  const exact=new Map(), stem=new Map(), groups=new Map();
  for(const item of files){
    const n=normalizeName(item.name);
    if(!exact.has(n.key)) exact.set(n.key,[]);
    exact.get(n.key).push(item);
    if(!stem.has(n.stem)) stem.set(n.stem,[]);
    stem.get(n.stem).push(item);
    const base=variantBase(n.stem);
    if(!groups.has(base)) groups.set(base,[]);
    groups.get(base).push(item);
  }
  return {exact,stem,groups};
}
function uniqByPath(items){
  const seen=new Set();
  return items.filter(x=>x&&!seen.has(x.path)&&seen.add(x.path));
}
function photoGroup(expected,maps,multi=false){
  const n=normalizeName(expected);
  const exact=maps.exact.get(n.key)||[];
  const sameStem=maps.stem.get(n.stem)||[];
  if(!multi) return uniqByPath(exact.length?exact:sameStem);
  const group=maps.groups.get(n.stem)||[];
  const all=uniqByPath([...exact,...sameStem,...group]);
  all.sort((a,b)=>{
    const ae=normalizeName(a.name).key===n.key?0:1;
    const be=normalizeName(b.name).key===n.key?0:1;
    return ae-be||a.name.localeCompare(b.name,'ru',{numeric:true});
  });
  return all.slice(0,4);
}
function cellText(cell){
  const v=cell.value;
  if(v==null) return '';
  if(typeof v==='object'){
    if(v.text!=null) return String(v.text);
    if(v.result!=null) return String(v.result);
    if(Array.isArray(v.richText)) return v.richText.map(x=>x.text||'').join('');
  }
  return String(v);
}
function findHeader(ws,wanted){
  const target=String(wanted||'').trim().toLowerCase();
  let found=0;
  ws.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{
    if(cellText(cell).trim().toLowerCase()===target) found=col;
  });
  return found;
}
async function readWorkbookInfo(inputPath,fileColumn,nameColumn,files,multiPhoto=false){
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);
  const ws=wb.worksheets[0];
  if(!ws) throw new Error('В Excel нет листов.');
  const fileCol=findHeader(ws,fileColumn||'Файл изображения');
  const nameCol=findHeader(ws,nameColumn||'Название товара');
  if(!fileCol) throw new Error('Не найдена колонка «'+(fileColumn||'Файл изображения')+'».');
  if(!nameCol) throw new Error('Не найдена колонка «'+(nameColumn||'Название товара')+'».');
  const maps=buildMaps(files);
  let total=0,found=0,missing=0,duplicates=0,multi=0,blankFileNames=0;
  const missingRows=[], duplicateRows=[];
  for(let r=2;r<=ws.rowCount;r++){
    const expected=cellText(ws.getCell(r,fileCol)).trim();
    const product=cellText(ws.getCell(r,nameCol)).trim();
    if(!expected&&!product) continue;
    total++;
    if(!expected){
      blankFileNames++; missing++;
      if(missingRows.length<100) missingRows.push({row:r,product,expected:''});
      continue;
    }
    const exact=maps.exact.get(normalizeName(expected).key)||[];
    if(exact.length>1){
      duplicates++;
      if(duplicateRows.length<50) duplicateRows.push({row:r,product,expected,count:exact.length});
    }
    const matches=photoGroup(expected,maps,multiPhoto);
    if(matches.length){
      found++;
      if(matches.length>1) multi++;
    }else{
      missing++;
      if(missingRows.length<100) missingRows.push({row:r,product,expected});
    }
  }
  return {sheet:ws.name,total,found,missing,duplicates,multiPhotoProducts:multi,blankFileNames,missingRows,duplicateRows};
}
async function toJpegBuffer(url){
  const r=await fetch(url,{headers:{'User-Agent':'PhotoExcel/3.0'}});
  if(!r.ok) throw new Error('Фото HTTP '+r.status);
  const input=Buffer.from(await r.arrayBuffer());
  return sharp(input).rotate().resize({width:160,height:160,fit:'inside',withoutEnlargement:true})
    .jpeg({quality:60,mozjpeg:true}).toBuffer();
}
function analyzeFiles(files){
  const formats={}, normalized=new Map(), groupCounts=new Map();
  let totalBytes=0;
  for(const f of files){
    totalBytes+=Number(f.size)||0;
    const n=normalizeName(f.name);
    formats[n.ext||'без расширения']=(formats[n.ext||'без расширения']||0)+1;
    normalized.set(n.key,(normalized.get(n.key)||0)+1);
    const base=variantBase(n.stem);
    groupCounts.set(base,(groupCounts.get(base)||0)+1);
  }
  const duplicateGroups=[...normalized.entries()].filter(([,c])=>c>1);
  const multiGroups=[...groupCounts.entries()].filter(([,c])=>c>1);
  const largest=[...files].sort((a,b)=>(b.size||0)-(a.size||0)).slice(0,10).map(f=>({name:f.name,size:f.size,path:f.path}));
  return {
    total:files.length,
    uniqueNames:normalized.size,
    duplicateNameGroups:duplicateGroups.length,
    duplicateFiles:duplicateGroups.reduce((s,[,c])=>s+c-1,0),
    potentialMultiPhotoGroups:multiGroups.length,
    totalBytes,
    formats,
    largest
  };
}
function safeJob(j){
  const {inputPath,outputPath,corrections,diskUrl,...rest}=j;
  return rest;
}
async function processJob(id){
  const job=jobs.get(id);
  if(!job) return;
  try{
    setJob(id,{status:'scanning',progress:3,message:'Сканирую Яндекс Диск…',unmatched:[]});
    const files=await scanPublicDisk(job.diskUrl,s=>{
      setJob(id,{progress:Math.min(18,3+Math.floor(s.files/500)),message:'Найдено фото: '+s.files.toLocaleString('ru-RU')});
    });
    const maps=buildMaps(files);
    setJob(id,{status:'processing',progress:20,message:'Читаю Excel…',diskFiles:files.length});
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.readFile(job.inputPath);
    const ws=wb.worksheets[0];
    if(!ws) throw new Error('В Excel нет листов.');
    const fileCol=findHeader(ws,job.fileColumn||'Файл изображения');
    const nameCol=findHeader(ws,job.nameColumn||'Название товара');
    if(!fileCol) throw new Error('Не найдена колонка «'+(job.fileColumn||'Файл изображения')+'».');
    if(!nameCol) throw new Error('Не найдена колонка «'+(job.nameColumn||'Название товара')+'».');

    const photoStart=ws.columnCount+1;
    const photoCols=job.multiPhoto?4:1;
    const statusCol=photoStart+photoCols;
    const pathCol=statusCol+1;
    for(let i=0;i<photoCols;i++){
      ws.getCell(1,photoStart+i).value=job.mode==='match'?(photoCols>1?'Совпадение '+(i+1):'Совпадение'):(photoCols>1?'Фото '+(i+1):'Фото');
      ws.getColumn(photoStart+i).width=job.mode==='match'?20:22;
    }
    ws.getCell(1,statusCol).value='Статус фото';
    ws.getCell(1,pathCol).value='Пути на Яндекс Диске';
    ws.getColumn(statusCol).width=27; ws.getColumn(pathCol).width=48;
    ws.getRow(1).font={...(ws.getRow(1).font||{}),bold:true};

    const old=wb.getWorksheet('Отчёт сопоставления');
    if(old) wb.removeWorksheet(old.id);
    const report=wb.addWorksheet('Отчёт сопоставления');
    report.columns=[
      {header:'Строка Excel',key:'row',width:14},
      {header:'Название товара',key:'product',width:46},
      {header:'Ожидаемый файл',key:'expected',width:28},
      {header:'Статус',key:'status',width:28},
      {header:'Найденные файлы',key:'matched',width:46},
      {header:'Пути',key:'path',width:58},
      {header:'Фото',key:'count',width:10}
    ];
    report.getRow(1).font={bold:true};

    const total=Math.max(0,ws.rowCount-1);
    let found=0,missing=0,duplicates=0,multiProducts=0;
    const used=new Set(), unmatched=[];
    const filesByPath=new Map(files.map(f=>[f.path,f]));

    for(let r=2;r<=ws.rowCount;r++){
      const expected=cellText(ws.getCell(r,fileCol)).trim();
      const product=cellText(ws.getCell(r,nameCol)).trim();
      if(!expected&&!product) continue;
      const exact=expected?(maps.exact.get(normalizeName(expected).key)||[]):[];
      if(exact.length>1) duplicates++;
      let matches=[];
      const correctionPath=job.corrections?.[String(r)];
      if(correctionPath&&filesByPath.has(correctionPath)) matches=[filesByPath.get(correctionPath)];
      else if(expected) matches=photoGroup(expected,maps,job.multiPhoto);

      if(!matches.length){
        missing++;
        unmatched.push({row:r,product,expected});
        ws.getCell(r,statusCol).value='Не найдено';
        report.addRow({row:r,product,expected,status:'Не найдено',matched:'',path:'',count:0});
      }else{
        found++;
        if(matches.length>1) multiProducts++;
        matches.forEach(x=>used.add(x.path));
        const status=correctionPath?'Исправлено вручную':(matches.length>1?'Найдено '+matches.length+' фото':'Найдено');
        ws.getCell(r,statusCol).value=status;
        ws.getCell(r,pathCol).value=matches.map(x=>x.path).join('\n');

        if(job.mode==='match'){
          matches.forEach((item,i)=>{ if(i<photoCols) ws.getCell(r,photoStart+i).value=item.name; });
        }else{
          let inserted=0;
          for(let i=0;i<Math.min(matches.length,photoCols);i++){
            const item=matches[i], url=item.preview||item.file;
            if(!url) continue;
            try{
              const buf=await toJpegBuffer(url);
              const imageId=wb.addImage({buffer:buf,extension:'jpeg'});
              ws.getRow(r).height=96;
              ws.addImage(imageId,{tl:{col:photoStart+i-1+0.08,row:r-1+0.08},ext:{width:108,height:108},editAs:'oneCell'});
              inserted++;
            }catch{
              ws.getCell(r,photoStart+i).value='Фото найдено';
            }
          }
          if(inserted===0&&matches.length) ws.getCell(r,photoStart).value='Фото найдено';
        }
        report.addRow({
          row:r,product,expected,status,
          matched:matches.map(x=>x.name).join('\n'),
          path:matches.map(x=>x.path).join('\n'),count:matches.length
        });
      }
      if(r%5===0||r===ws.rowCount){
        const done=r-1;
        setJob(id,{
          progress:20+Math.floor((done/Math.max(1,total))*70),
          message:'Обработано '+done.toLocaleString('ru-RU')+' из '+total.toLocaleString('ru-RU'),
          stats:{total,found,missing,duplicates,multiProducts}
        });
      }
    }

    report.addRow([]);
    const t=report.addRow(['Лишние изображения — есть на Яндекс Диске, но не использованы в Excel']); t.font={bold:true};
    report.addRow(['Файл','Путь']);
    const extras=files.filter(x=>!used.has(x.path));
    for(const x of extras) report.addRow([x.name,x.path]);

    const outputPath=path.join(TMP,id+'.xlsx');
    setJob(id,{progress:93,message:'Сохраняю готовый Excel…'});
    await wb.xlsx.writeFile(outputPath);
    setJob(id,{
      status:'done',progress:100,message:'Готово',outputPath,
      outputName:(job.originalName||'Фото_Товар').replace(/\.xlsx$/i,'')+(job.mode==='match'?'_сопоставление.xlsx':'_с_фото.xlsx'),
      unmatched,
      stats:{total,found,missing,duplicates,multiProducts,extras:extras.length,diskFiles:files.length}
    });
  }catch(err){
    setJob(id,{status:'error',progress:0,message:err?.message||String(err)});
  }finally{
    running=false; runNext();
  }
}
function runNext(){
  if(running||!workQueue.length) return;
  const id=workQueue.shift(); running=true; processJob(id);
}
function cleanup(){
  const now=Date.now();
  for(const [id,j] of jobs){
    if(now-j.updatedAt>60*60*1000){
      fs.unlink(j.inputPath||'').catch(()=>{});
      fs.unlink(j.outputPath||'').catch(()=>{});
      jobs.delete(id);
    }
  }
  for(const [key,c] of scanCache) if(now-c.at>CACHE_MS) scanCache.delete(key);
}
setInterval(cleanup,15*60*1000).unref();

app.get('/health',(req,res)=>res.json({ok:true,version:3,jobs:jobs.size,queued:workQueue.length,running,scanCache:scanCache.size}));

app.post('/api/scan',async(req,res)=>{
  try{
    const diskUrl=String(req.body?.diskUrl||'').trim();
    if(!diskUrl) return res.status(400).json({error:'disk_url_required'});
    const files=await scanPublicDisk(diskUrl);
    res.json({ok:true,count:files.length});
  }catch(err){res.status(400).json({ok:false,error:err?.message||String(err)});}
});

app.post('/api/analytics',async(req,res)=>{
  try{
    const diskUrl=String(req.body?.diskUrl||'').trim();
    if(!diskUrl) return res.status(400).json({error:'disk_url_required'});
    const files=await scanPublicDisk(diskUrl);
    res.json({ok:true,analytics:analyzeFiles(files)});
  }catch(err){res.status(400).json({ok:false,error:err?.message||String(err)});}
});

app.post('/api/precheck',upload.single('excel'),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'excel_required'});
    const diskUrl=String(req.body.diskUrl||'').trim();
    if(!diskUrl) throw new Error('Не указана ссылка Яндекс Диска.');
    const files=await scanPublicDisk(diskUrl);
    const result=await readWorkbookInfo(
      req.file.path,
      String(req.body.fileColumn||'Файл изображения'),
      String(req.body.nameColumn||'Название товара'),
      files,
      String(req.body.multiPhoto||'false')==='true'
    );
    res.json({ok:true,precheck:{...result,diskFiles:files.length}});
  }catch(err){
    res.status(400).json({ok:false,error:err?.message||String(err)});
  }finally{
    if(req.file?.path) await fs.unlink(req.file.path).catch(()=>{});
  }
});

app.post('/api/jobs',upload.single('excel'),async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'excel_required'});
  const diskUrl=String(req.body.diskUrl||'').trim();
  if(!diskUrl){await fs.unlink(req.file.path).catch(()=>{});return res.status(400).json({error:'disk_url_required'});}
  const id=randomUUID();
  jobs.set(id,{
    id,status:'queued',progress:1,message:'Задача в очереди',
    createdAt:Date.now(),updatedAt:Date.now(),inputPath:req.file.path,
    originalName:req.file.originalname,diskUrl,
    mode:req.body.mode==='match'?'match':'embedded',
    multiPhoto:String(req.body.multiPhoto||'false')==='true',
    fileColumn:String(req.body.fileColumn||'Файл изображения'),
    nameColumn:String(req.body.nameColumn||'Название товара'),
    corrections:{},unmatched:[],
    stats:{total:0,found:0,missing:0,duplicates:0,multiProducts:0}
  });
  workQueue.push(id); runNext(); res.json({ok:true,id});
});

app.get('/api/jobs/:id',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j) return res.status(404).json({error:'job_not_found'});
  res.json(safeJob(j));
});

app.get('/api/jobs/:id/unmatched',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j) return res.status(404).json({error:'job_not_found'});
  res.json({ok:true,items:j.unmatched||[]});
});

app.get('/api/jobs/:id/candidates',async(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j) return res.status(404).json({error:'job_not_found'});
  try{
    const files=await scanPublicDisk(j.diskUrl);
    const q=normalizeName(String(req.query.q||'')).stem;
    const row=Number(req.query.row)||0;
    const rowInfo=(j.unmatched||[]).find(x=>x.row===row);
    const fallback=normalizeName(rowInfo?.expected||'').stem;
    const needle=q||fallback;
    const scored=files.map(f=>{
      const n=normalizeName(f.name).stem;
      let score=0;
      if(needle&&n===needle) score=100;
      else if(needle&&n.startsWith(needle)) score=80;
      else if(needle&&n.includes(needle)) score=60;
      else if(needle&&needle.includes(n)&&n.length>2) score=40;
      return {f,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.f.name.localeCompare(b.f.name,'ru',{numeric:true})).slice(0,30);
    res.json({ok:true,items:scored.map(x=>({name:x.f.name,path:x.f.path,preview:x.f.preview||x.f.file||''}))});
  }catch(err){res.status(400).json({ok:false,error:err?.message||String(err)});}
});

app.post('/api/jobs/:id/corrections',async(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j) return res.status(404).json({error:'job_not_found'});
  if(j.status!=='done'&&j.status!=='error') return res.status(409).json({error:'job_busy'});
  try{
    const corrections=Array.isArray(req.body?.corrections)?req.body.corrections:[];
    const files=await scanPublicDisk(j.diskUrl);
    const validPaths=new Set(files.map(f=>f.path));
    for(const c of corrections){
      const row=Number(c.row), p=String(c.path||'');
      if(Number.isInteger(row)&&row>1&&validPaths.has(p)) j.corrections[String(row)]=p;
    }
    if(j.outputPath) await fs.unlink(j.outputPath).catch(()=>{});
    setJob(j.id,{status:'queued',progress:1,message:'Пересобираю с ручными исправлениями…'});
    workQueue.push(j.id); runNext();
    res.json({ok:true,id:j.id,accepted:Object.keys(j.corrections).length});
  }catch(err){res.status(400).json({ok:false,error:err?.message||String(err)});}
});

app.get('/api/jobs/:id/download',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j||j.status!=='done'||!j.outputPath) return res.status(404).send('not ready');
  res.download(j.outputPath,j.outputName||'result.xlsx');
});

app.listen(PORT,'0.0.0.0',()=>{
  console.log('Photo Excel service v3 listening on',PORT);
  const p=new URLSearchParams({public_key:'https://disk.yandex.ru/d/zTdZ9PlnyQZY9A',limit:'1',offset:'0',preview_size:'360x360',preview_crop:'false'});
  yfetch(API+'?'+p.toString())
    .then(data=>console.log('YANDEX_SELF_TEST_OK',JSON.stringify({name:data.name||'',rootItems:data._embedded?.total??null})))
    .catch(err=>console.error('YANDEX_SELF_TEST_FAIL',err?.message||String(err)));
});