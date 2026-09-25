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
app.use(express.json({ limit: '1mb' }));
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({
  dest: TMP,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const jobs = new Map();
const queue = [];
let running = false;

function setJob(id, patch){
  const j = jobs.get(id);
  if(!j) return;
  Object.assign(j, patch, { updatedAt: Date.now() });
}
function normalizeName(name=''){
  const s = String(name).normalize('NFKC').trim().toLowerCase();
  const i = s.lastIndexOf('.');
  let stem = i > 0 ? s.slice(0,i) : s;
  let ext = i > 0 ? s.slice(i+1) : '';
  if(ext === 'jpeg') ext = 'jpg';
  return { key: stem + (ext ? '.' + ext : ''), stem, ext };
}
function isImage(name=''){ return /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(name); }
function joinPath(parent,name){
  const clean = String(name).replace(/^\/+|\/+$/g,'');
  return parent ? parent.replace(/\/+$/,'') + '/' + clean : '/' + clean;
}
async function yfetch(url){
  const r = await fetch(url, { headers:{ 'Accept':'application/json','User-Agent':'PhotoExcel/2.0' }});
  const txt = await r.text();
  if(!r.ok) throw new Error('Яндекс Диск HTTP ' + r.status + ': ' + txt.slice(0,180));
  return JSON.parse(txt);
}
async function scanPublicDisk(publicKey, onProgress=()=>{}){
  const files = [];
  const queue = [''];
  const seen = new Set();
  let folders = 0;
  while(queue.length){
    const folderPath = queue.shift();
    if(seen.has(folderPath)) continue;
    seen.add(folderPath);
    let offset = 0;
    while(true){
      const p = new URLSearchParams({
        public_key: publicKey,
        limit: '1000',
        offset: String(offset),
        preview_size: '360x360',
        preview_crop: 'false'
      });
      if(folderPath) p.set('path', folderPath);
      const data = await yfetch(API + '?' + p.toString());
      const emb = data._embedded;
      if(!emb || !Array.isArray(emb.items)) break;
      for(const item of emb.items){
        if(item.type === 'dir') queue.push(joinPath(folderPath,item.name));
        else if(item.type === 'file' && isImage(item.name)){
          files.push({
            name:item.name,
            path:joinPath(folderPath,item.name),
            preview:item.preview || '',
            file:item.file || '',
            size:item.size || 0
          });
        }
      }
      offset += emb.items.length;
      onProgress({ files: files.length, folders, pending: queue.length });
      if(!emb.items.length || offset >= (emb.total || 0)) break;
    }
    folders++;
  }
  return files;
}
function buildMaps(files){
  const exact = new Map(), stem = new Map();
  for(const item of files){
    const n = normalizeName(item.name);
    if(!exact.has(n.key)) exact.set(n.key,[]);
    exact.get(n.key).push(item);
    if(!stem.has(n.stem)) stem.set(n.stem,[]);
    stem.get(n.stem).push(item);
  }
  return { exact, stem };
}
function findMatches(name, maps){
  const n = normalizeName(name);
  const e = maps.exact.get(n.key) || [];
  if(e.length) return e;
  return maps.stem.get(n.stem) || [];
}
function cellText(cell){
  const v = cell.value;
  if(v == null) return '';
  if(typeof v === 'object'){
    if(v.text != null) return String(v.text);
    if(v.result != null) return String(v.result);
    if(Array.isArray(v.richText)) return v.richText.map(x=>x.text || '').join('');
  }
  return String(v);
}
function findHeader(ws, wanted){
  const target = wanted.trim().toLowerCase();
  let found = 0;
  ws.getRow(1).eachCell({includeEmpty:true}, (cell,col)=>{
    if(cellText(cell).trim().toLowerCase() === target) found = col;
  });
  return found;
}
async function toJpegBuffer(url){
  const r = await fetch(url, { headers:{'User-Agent':'PhotoExcel/2.0'} });
  if(!r.ok) throw new Error('Фото HTTP ' + r.status);
  const input = Buffer.from(await r.arrayBuffer());
  return sharp(input).rotate().resize({width:160,height:160,fit:'inside',withoutEnlargement:true})
    .jpeg({quality:60,mozjpeg:true}).toBuffer();
}
async function processJob(id){
  const job = jobs.get(id);
  if(!job) return;
  try{
    setJob(id,{status:'scanning',progress:3,message:'Сканирую Яндекс Диск…'});
    const files = await scanPublicDisk(job.diskUrl, s=>{
      const p = Math.min(18, 3 + Math.floor(s.files / 500));
      setJob(id,{progress:p,message:'Найдено фото: ' + s.files.toLocaleString('ru-RU')});
    });
    const maps = buildMaps(files);

    setJob(id,{status:'processing',progress:20,message:'Читаю Excel…',diskFiles:files.length});
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(job.inputPath);
    const ws = wb.worksheets[0];
    if(!ws) throw new Error('В Excel нет листов.');

    const fileCol = findHeader(ws, job.fileColumn || 'Файл изображения');
    const nameCol = findHeader(ws, job.nameColumn || 'Название товара');
    if(!fileCol) throw new Error('Не найдена колонка «' + (job.fileColumn || 'Файл изображения') + '».');
    if(!nameCol) throw new Error('Не найдена колонка «' + (job.nameColumn || 'Название товара') + '».');

    const photoCol = ws.columnCount + 1;
    const statusCol = photoCol + 1;
    const pathCol = photoCol + 2;
    ws.getCell(1,photoCol).value = job.mode === 'match' ? 'Совпадение' : 'Фото';
    ws.getCell(1,statusCol).value = 'Статус фото';
    ws.getCell(1,pathCol).value = 'Путь на Яндекс Диске';
    ws.getRow(1).font = { ...(ws.getRow(1).font || {}), bold:true };
    ws.getColumn(photoCol).width = job.mode === 'match' ? 20 : 24;
    ws.getColumn(statusCol).width = 24;
    ws.getColumn(pathCol).width = 40;

    const old = wb.getWorksheet('Отчёт сопоставления');
    if(old) wb.removeWorksheet(old.id);
    const report = wb.addWorksheet('Отчёт сопоставления');
    report.columns = [
      {header:'Строка Excel',key:'row',width:14},
      {header:'Название товара',key:'product',width:46},
      {header:'Ожидаемый файл',key:'expected',width:28},
      {header:'Статус',key:'status',width:24},
      {header:'Найденный файл',key:'matched',width:28},
      {header:'Путь',key:'path',width:44},
      {header:'Совпадений',key:'count',width:12}
    ];
    report.getRow(1).font = {bold:true};

    const total = Math.max(0, ws.rowCount - 1);
    let found=0, missing=0, duplicates=0;
    const used = new Set();

    for(let r=2;r<=ws.rowCount;r++){
      const expected = cellText(ws.getCell(r,fileCol)).trim();
      const product = cellText(ws.getCell(r,nameCol)).trim();
      if(!expected && !product) continue;

      const matches = expected ? findMatches(expected,maps) : [];
      const item = matches[0] || null;
      if(!item){
        missing++;
        ws.getCell(r,statusCol).value = 'Не найдено';
        report.addRow({row:r,product,expected,status:'Не найдено',matched:'',path:'',count:0});
      }else{
        found++;
        if(matches.length>1) duplicates++;
        matches.forEach(x=>used.add(x.path));
        const status = matches.length>1 ? 'Найдено, есть дубликаты' : 'Найдено';
        ws.getCell(r,statusCol).value = status;
        ws.getCell(r,pathCol).value = item.path;

        if(job.mode === 'match'){
          ws.getCell(r,photoCol).value = item.name;
        }else{
          const url = item.preview || item.file;
          if(url){
            try{
              const buf = await toJpegBuffer(url);
              const imageId = wb.addImage({buffer:buf,extension:'jpeg'});
              ws.getRow(r).height = 96;
              ws.addImage(imageId,{
                tl:{col:photoCol-1+0.08,row:r-1+0.08},
                ext:{width:110,height:110},
                editAs:'oneCell'
              });
            }catch{
              ws.getCell(r,photoCol).value = 'Фото найдено';
              ws.getCell(r,statusCol).value = status + '; превью не вставлено';
            }
          }
        }
        report.addRow({row:r,product,expected,status,matched:item.name,path:item.path,count:matches.length});
      }

      if(r % 5 === 0 || r === ws.rowCount){
        const done = r-1;
        const progress = 20 + Math.floor((done / Math.max(1,total))*70);
        setJob(id,{
          progress,
          message:'Обработано ' + done.toLocaleString('ru-RU') + ' из ' + total.toLocaleString('ru-RU'),
          stats:{total,found,missing,duplicates}
        });
      }
    }

    report.addRow([]);
    const t = report.addRow(['Лишние изображения — есть на Яндекс Диске, но не использованы в Excel']);
    t.font = {bold:true};
    report.addRow(['Файл','Путь']);
    const extras = files.filter(x=>!used.has(x.path));
    for(const x of extras) report.addRow([x.name,x.path]);

    const outputPath = path.join(TMP, id + '.xlsx');
    setJob(id,{progress:93,message:'Сохраняю готовый Excel…'});
    await wb.xlsx.writeFile(outputPath);

    setJob(id,{
      status:'done',
      progress:100,
      message:'Готово',
      outputPath,
      outputName:(job.originalName || 'Фото_Товар').replace(/\.xlsx$/i,'') + (job.mode==='match' ? '_сопоставление.xlsx' : '_с_фото.xlsx'),
      stats:{total,found,missing,duplicates,extras:extras.length,diskFiles:files.length}
    });
  }catch(err){
    setJob(id,{status:'error',progress:0,message:err?.message || String(err)});
  }finally{
    running = false;
    runNext();
  }
}
function runNext(){
  if(running || !queue.length) return;
  const id = queue.shift();
  running = true;
  processJob(id);
}
function cleanup(){
  const now = Date.now();
  for(const [id,j] of jobs){
    if(now - j.updatedAt > 60*60*1000){
      fs.unlink(j.inputPath || '').catch(()=>{});
      fs.unlink(j.outputPath || '').catch(()=>{});
      jobs.delete(id);
    }
  }
}
setInterval(cleanup, 15*60*1000).unref();

app.get('/health',(req,res)=>res.json({ok:true,version:2,jobs:jobs.size,queued:queue.length,running}));

app.post('/api/scan', async (req,res)=>{
  try{
    const diskUrl = String(req.body?.diskUrl || '').trim();
    if(!diskUrl) return res.status(400).json({error:'disk_url_required'});
    const files = await scanPublicDisk(diskUrl);
    res.json({ok:true,count:files.length});
  }catch(err){
    res.status(400).json({ok:false,error:err?.message || String(err)});
  }
});

app.post('/api/jobs', upload.single('excel'), async (req,res)=>{
  if(!req.file) return res.status(400).json({error:'excel_required'});
  const diskUrl = String(req.body.diskUrl || '').trim();
  if(!diskUrl){
    await fs.unlink(req.file.path).catch(()=>{});
    return res.status(400).json({error:'disk_url_required'});
  }
  const id = randomUUID();
  jobs.set(id,{
    id,
    status:'queued',
    progress:1,
    message:'Задача в очереди',
    createdAt:Date.now(),
    updatedAt:Date.now(),
    inputPath:req.file.path,
    originalName:req.file.originalname,
    diskUrl,
    mode:req.body.mode === 'match' ? 'match' : 'embedded',
    fileColumn:String(req.body.fileColumn || 'Файл изображения'),
    nameColumn:String(req.body.nameColumn || 'Название товара'),
    stats:{total:0,found:0,missing:0,duplicates:0}
  });
  queue.push(id);
  runNext();
  res.json({ok:true,id});
});

app.get('/api/jobs/:id',(req,res)=>{
  const j = jobs.get(req.params.id);
  if(!j) return res.status(404).json({error:'job_not_found'});
  const {inputPath,outputPath,...safe} = j;
  res.json(safe);
});

app.get('/api/jobs/:id/download',(req,res)=>{
  const j = jobs.get(req.params.id);
  if(!j || j.status !== 'done' || !j.outputPath) return res.status(404).send('not ready');
  res.download(j.outputPath,j.outputName || 'result.xlsx');
});

app.listen(PORT,'0.0.0.0',()=>console.log('Photo Excel service v2 listening on',PORT));