import express from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import archiver from 'archiver';
import ZXing from '@zxing/library';
const { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } = ZXing;
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
function levRatio(a='',b=''){
  a=String(a);b=String(b);
  if(a===b)return 1;
  if(!a.length||!b.length)return 0;
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let left=i,diag=i-1;
    for(let j=1;j<=b.length;j++){
      const up=prev[j];
      const cur=Math.min(up+1,left+1,diag+(a[i-1]===b[j-1]?0:1));
      prev[j]=cur;diag=up;left=cur;
    }
  }
  return 1-prev[b.length]/Math.max(a.length,b.length);
}
function smartMatch(expected,files){
  const n=normalizeName(expected), compact=n.stem.replace(/[^a-zа-яё0-9]/gi,'');
  const nums=n.stem.match(/\d+/g)||[];
  let best=null,bestScore=0;
  for(const f of files){
    const x=normalizeName(f.name);
    const xc=x.stem.replace(/[^a-zа-яё0-9]/gi,'');
    const xnums=x.stem.match(/\d+/g)||[];
    let score=0;
    if(x.key===n.key)score=100;
    else if(x.stem===n.stem)score=99;
    else if(variantBase(x.stem)===variantBase(n.stem))score=98;
    else if(compact&&xc===compact)score=97;
    else if(nums.length===1&&xnums.length===1&&nums[0].length>=3&&nums[0]===xnums[0])score=94;
    else{
      const ratio=levRatio(n.stem,x.stem);
      if(ratio>=0.94)score=93;
      else if(ratio>=0.9)score=89;
      else if(n.stem.length>=4&&(x.stem.startsWith(n.stem)||n.stem.startsWith(x.stem)))score=87;
    }
    if(score>bestScore){best=f;bestScore=score;}
  }
  return best?{item:best,score:bestScore}:null;
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
async function fetchImageBuffer(url){
  const r=await fetch(url,{headers:{'User-Agent':'PhotoExcel/6.0'}});
  if(!r.ok)throw new Error('Фото HTTP '+r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function toJpegBuffer(url){
  const input=await fetchImageBuffer(url);
  return sharp(input).rotate().resize({width:160,height:160,fit:'inside',withoutEnlargement:true})
    .jpeg({quality:60,mozjpeg:true}).toBuffer();
}
async function inspectImage(url){
  const input=await fetchImageBuffer(url);
  const img=sharp(input,{failOn:'none'}).rotate();
  const meta=await img.metadata();
  const stat=await img.clone().greyscale().resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).stats();
  const width=meta.width||0,height=meta.height||0,sharpness=Number(stat.sharpness||0),entropy=Number(stat.entropy||0);
  const issues=[];
  if(width<600||height<600)issues.push('Низкое разрешение');
  if(sharpness>0&&sharpness<1.4)issues.push('Возможная размытость');
  if(entropy>0&&entropy<2.5)issues.push('Низкая детализация');
  return {width,height,format:meta.format||'',sharpness:Number(sharpness.toFixed(2)),entropy:Number(entropy.toFixed(2)),issues};
}
async function dHash(url){
  const input=await fetchImageBuffer(url);
  const {data,info}=await sharp(input,{failOn:'none'}).rotate().greyscale().resize(9,8,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  let bits='';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const a=data[y*info.width+x],b=data[y*info.width+x+1];
    bits+=a>b?'1':'0';
  }
  let hex='';
  for(let i=0;i<bits.length;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
  return hex;
}
function hammingHex(a,b){
  let d=0;
  for(let i=0;i<Math.min(a.length,b.length);i++){
    let x=parseInt(a[i],16)^parseInt(b[i],16);
    while(x){d+=x&1;x>>=1;}
  }
  return d+Math.abs(a.length-b.length)*4;
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
function csvEscape(v=''){
  const s=String(v??'');
  return /[",\n\r;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function safeJob(j){
  const {inputPath,outputPath,corrections,diskUrl,extrasList,matchedRecords,...rest}=j;
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
    const confidenceCol=pathCol+1;
    for(let i=0;i<photoCols;i++){
      ws.getCell(1,photoStart+i).value=job.mode==='match'?(photoCols>1?'Совпадение '+(i+1):'Совпадение'):(photoCols>1?'Фото '+(i+1):'Фото');
      ws.getColumn(photoStart+i).width=job.mode==='match'?20:22;
    }
    ws.getCell(1,statusCol).value='Статус фото';
    ws.getCell(1,pathCol).value='Пути на Яндекс Диске';
    ws.getCell(1,confidenceCol).value='Уверенность';
    ws.getColumn(statusCol).width=27; ws.getColumn(pathCol).width=48; ws.getColumn(confidenceCol).width=18;
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
      {header:'Фото',key:'count',width:10},
      {header:'Уверенность',key:'confidence',width:18}
    ];
    report.getRow(1).font={bold:true};

    const total=Math.max(0,ws.rowCount-1);
    let found=0,missing=0,duplicates=0,multiProducts=0;
    const used=new Set(), unmatched=[], matchedRecords=[];
    const filesByPath=new Map(files.map(f=>[f.path,f]));

    for(let r=2;r<=ws.rowCount;r++){
      const expected=cellText(ws.getCell(r,fileCol)).trim();
      const product=cellText(ws.getCell(r,nameCol)).trim();
      if(!expected&&!product) continue;
      const exact=expected?(maps.exact.get(normalizeName(expected).key)||[]):[];
      if(exact.length>1) duplicates++;
      let matches=[], confidence=0, matchMethod='', smartCandidate=null;
      const correctionPath=job.corrections?.[String(r)];
      if(correctionPath&&filesByPath.has(correctionPath)){
        matches=[filesByPath.get(correctionPath)];confidence=100;matchMethod='manual';
      }else if(expected){
        matches=photoGroup(expected,maps,job.multiPhoto);
        if(matches.length){confidence=exact.length?100:99;matchMethod='exact';}
        else{
          smartCandidate=smartMatch(expected,files);
          if(smartCandidate&&smartCandidate.score>=94){
            matches=[smartCandidate.item];confidence=smartCandidate.score;matchMethod='smart';
          }
        }
      }

      if(!matches.length){
        missing++;
        unmatched.push({row:r,product,expected,suggestion:smartCandidate&&smartCandidate.score>=80?{name:smartCandidate.item.name,path:smartCandidate.item.path,score:smartCandidate.score}:null});
        ws.getCell(r,statusCol).value='Не найдено';
        ws.getCell(r,confidenceCol).value=smartCandidate?smartCandidate.score+'%':'';
        report.addRow({row:r,product,expected,status:'Не найдено',matched:'',path:'',count:0,confidence:smartCandidate?smartCandidate.score+'%':''});
      }else{
        found++;
        if(matches.length>1) multiProducts++;
        matches.forEach(x=>used.add(x.path));
        const status=matchMethod==='manual'?'Исправлено вручную':(matchMethod==='smart'?'Умное совпадение':(matches.length>1?'Найдено '+matches.length+' фото':'Найдено'));
        ws.getCell(r,statusCol).value=status;
        ws.getCell(r,pathCol).value=matches.map(x=>x.path).join('\n');
        ws.getCell(r,confidenceCol).value=confidence+'%';

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
          path:matches.map(x=>x.path).join('\n'),count:matches.length,confidence:confidence+'%'
        });
        matchedRecords.push({
          row:r,product,expected,confidence,matchMethod,
          matches:matches.map(x=>({name:x.name,path:x.path,preview:x.preview||'',file:x.file||'',size:x.size||0}))
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
      matchedRecords,
      extrasList:extras.map(x=>({name:x.name,path:x.path})),
      stats:{total,found,missing,duplicates,multiProducts,extras:extras.length,diskFiles:files.length,smartMatched:matchedRecords.filter(x=>x.matchMethod==='smart').length}
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

app.get('/health',(req,res)=>res.json({ok:true,version:6,jobs:jobs.size,queued:workQueue.length,running,scanCache:scanCache.size}));

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
    corrections:{},unmatched:[],extrasList:[],matchedRecords:[],quality:{status:'idle',progress:0,checked:0,issues:0,visualDuplicateGroups:0,items:[]},
    stats:{total:0,found:0,missing:0,duplicates:0,multiProducts:0,smartMatched:0}
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

app.get('/api/jobs/:id/report/:type.csv',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j) return res.status(404).send('job not found');
  const type=String(req.params.type||'');
  let rows=[], name='report.csv';
  if(type==='missing'){
    rows=[['Строка Excel','Название товара','Ожидаемый файл'],...(j.unmatched||[]).map(x=>[x.row,x.product,x.expected])];
    name='missing_photos.csv';
  }else if(type==='extras'){
    rows=[['Файл','Путь'],...(j.extrasList||[]).map(x=>[x.name,x.path])];
    name='extra_photos.csv';
  }else{
    return res.status(404).send('unknown report');
  }
  const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(';')).join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="'+name+'"');
  res.send(csv);
});


async function runQualityAnalysis(id,limit=0){
  const j=jobs.get(id);
  if(!j||!Array.isArray(j.matchedRecords))return;
  const all=[];
  for(const rec of j.matchedRecords){
    for(const im of rec.matches||[]) all.push({row:rec.row,product:rec.product,expected:rec.expected,...im});
  }
  const selected=limit>0?all.slice(0,Math.min(limit,all.length)):all;
  j.quality={status:'running',progress:0,checked:0,total:selected.length,issues:0,visualDuplicateGroups:0,items:[],duplicates:[]};
  const hashed=[];
  for(let i=0;i<selected.length;i++){
    const item=selected[i],url=item.preview||item.file;
    if(!url)continue;
    try{
      const [q,h]=await Promise.all([inspectImage(url),dHash(url)]);
      if(q.issues.length&&j.quality.items.length<250)j.quality.items.push({row:item.row,product:item.product,name:item.name,path:item.path,...q});
      hashed.push({row:item.row,product:item.product,name:item.name,path:item.path,hash:h});
      j.quality.issues+=q.issues.length?1:0;
    }catch(err){
      if(j.quality.items.length<250)j.quality.items.push({row:item.row,product:item.product,name:item.name,path:item.path,issues:['Ошибка чтения изображения']});
      j.quality.issues++;
    }
    j.quality.checked=i+1;
    j.quality.progress=Math.round(((i+1)/Math.max(1,selected.length))*100);
  }
  const buckets=new Map();
  for(const x of hashed){
    const key=x.hash.slice(0,2);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(x);
  }
  const groups=[];
  for(const arr of buckets.values()){
    const used=new Set();
    for(let i=0;i<arr.length;i++){
      if(used.has(i))continue;
      const g=[arr[i]];
      for(let k=i+1;k<arr.length;k++){
        if(!used.has(k)&&hammingHex(arr[i].hash,arr[k].hash)<=4){g.push(arr[k]);used.add(k);}
      }
      if(g.length>1){used.add(i);groups.push(g);}
    }
  }
  j.quality.visualDuplicateGroups=groups.length;
  j.quality.duplicates=groups.slice(0,100).map(g=>g.map(x=>({row:x.row,product:x.product,name:x.name,path:x.path})));
  j.quality.status='done';
  j.quality.progress=100;
  j.updatedAt=Date.now();
}

function safePathPart(v=''){
  return String(v||'item').normalize('NFKC').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,120)||'item';
}

app.post('/api/jobs/:id/quality',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j)return res.status(404).json({error:'job_not_found'});
  if(j.status!=='done')return res.status(409).json({error:'job_not_ready'});
  if(j.quality?.status==='running')return res.json({ok:true,quality:j.quality});
  const limit=Math.max(0,Math.min(10000,Number(req.body?.limit)||0));
  runQualityAnalysis(j.id,limit).catch(err=>{
    j.quality={...(j.quality||{}),status:'error',message:err?.message||String(err)};
  });
  res.json({ok:true,started:true});
});

app.get('/api/jobs/:id/products',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j)return res.status(404).json({error:'job_not_found'});
  const offset=Math.max(0,Number(req.query.offset)||0);
  const limit=Math.max(1,Math.min(100,Number(req.query.limit)||30));
  const list=(j.matchedRecords||[]).slice(offset,offset+limit).map(r=>({
    row:r.row,product:r.product,expected:r.expected,confidence:r.confidence,matchMethod:r.matchMethod,
    matches:(r.matches||[]).map(x=>({name:x.name,path:x.path,preview:x.preview||x.file||''}))
  }));
  res.json({ok:true,total:(j.matchedRecords||[]).length,offset,items:list});
});

app.get('/api/jobs/:id/export/ozon.zip',async(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j||j.status!=='done')return res.status(404).send('not ready');
  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition','attachment; filename="ozon_products.zip"');
  const archive=archiver('zip',{zlib:{level:7}});
  archive.on('error',err=>{try{res.destroy(err)}catch{}});
  archive.pipe(res);
  const report=[['Строка','Товар','Исходное имя','Экспортировано фото']];
  for(const rec of j.matchedRecords||[]){
    const base=safePathPart(normalizeName(rec.expected||String(rec.row)).stem||String(rec.row));
    let count=0;
    for(let i=0;i<Math.min(4,(rec.matches||[]).length);i++){
      const im=rec.matches[i],url=im.file||im.preview;
      if(!url)continue;
      try{
        const input=await fetchImageBuffer(url);
        const out=await sharp(input,{failOn:'none'}).rotate()
          .resize({width:900,height:1200,fit:'contain',background:{r:255,g:255,b:255,alpha:1},withoutEnlargement:false})
          .flatten({background:{r:255,g:255,b:255}})
          .jpeg({quality:90,mozjpeg:true}).toBuffer();
        archive.append(out,{name:'products/'+base+'/'+base+'_'+(i+1)+'.jpg'});
        count++;
      }catch{}
    }
    report.push([rec.row,rec.product,rec.expected,count]);
  }
  const csv='\uFEFF'+report.map(r=>r.map(csvEscape).join(';')).join('\r\n');
  archive.append(csv,{name:'report.csv'});
  archive.finalize();
});

app.post('/api/decode-code',upload.single('image'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'image_required'});
    const input=await fs.readFile(req.file.path);
    const {data,info}=await sharp(input,{failOn:'none'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const source=new RGBLuminanceSource(Uint8ClampedArray.from(data),info.width,info.height);
    const bitmap=new BinaryBitmap(new HybridBinarizer(source));
    const reader=new MultiFormatReader();
    const result=reader.decode(bitmap);
    res.json({ok:true,text:result.getText(),format:String(result.getBarcodeFormat())});
  }catch(err){
    res.status(422).json({ok:false,error:'Код не распознан',detail:err?.message||String(err)});
  }finally{
    if(req.file?.path)await fs.unlink(req.file.path).catch(()=>{});
  }
});

app.get('/api/jobs/:id/download',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j||j.status!=='done'||!j.outputPath) return res.status(404).send('not ready');
  res.download(j.outputPath,j.outputName||'result.xlsx');
});

app.listen(PORT,'0.0.0.0',()=>{
  console.log('Photo Excel service v6 listening on',PORT);
  const p=new URLSearchParams({public_key:'https://disk.yandex.ru/d/zTdZ9PlnyQZY9A',limit:'1',offset:'0',preview_size:'360x360',preview_crop:'false'});
  yfetch(API+'?'+p.toString())
    .then(data=>console.log('YANDEX_SELF_TEST_OK',JSON.stringify({name:data.name||'',rootItems:data._embedded?.total??null})))
    .catch(err=>console.error('YANDEX_SELF_TEST_FAIL',err?.message||String(err)));
});