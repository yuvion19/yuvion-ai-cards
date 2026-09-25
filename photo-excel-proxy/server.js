import express from 'express';

const app = express();
const PORT = process.env.PORT || 10000;
const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';

app.disable('x-powered-by');

app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health',(req,res)=>res.json({ok:true}));

function allowedYandexUrl(raw){
  try{
    const u = new URL(raw);
    if(u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'yandex.ru' || h.endsWith('.yandex.ru') ||
           h === 'yandex.net' || h.endsWith('.yandex.net') ||
           h === 'yandex.com' || h.endsWith('.yandex.com');
  }catch{
    return false;
  }
}

app.get('/api/yandex', async (req,res)=>{
  try{
    const publicKey = String(req.query.public_key || '').trim();
    if(!publicKey) return res.status(400).json({error:'public_key_required'});

    const p = new URLSearchParams();
    p.set('public_key',publicKey);
    p.set('limit',String(Math.min(1000,Math.max(1,Number(req.query.limit)||1000))));
    p.set('offset',String(Math.max(0,Number(req.query.offset)||0)));
    p.set('preview_size','360x360');
    p.set('preview_crop','false');
    if(req.query.path) p.set('path',String(req.query.path));

    const upstream = await fetch(API + '?' + p.toString(), {
      headers:{'Accept':'application/json','User-Agent':'PhotoExcel/1.0'}
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type',upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.send(text);
  }catch(err){
    res.status(502).json({error:'upstream_failed',message:err?.message || String(err)});
  }
});

app.get('/api/image', async (req,res)=>{
  try{
    const raw = String(req.query.url || '');
    if(!allowedYandexUrl(raw)) return res.status(400).json({error:'invalid_yandex_url'});
    const upstream = await fetch(raw,{headers:{'User-Agent':'PhotoExcel/1.0'}});
    if(!upstream.ok) return res.status(upstream.status).send('Image upstream error');
    res.status(200);
    res.setHeader('Content-Type',upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control','public, max-age=86400');
    if(upstream.body) {
      const reader = upstream.body.getReader();
      res.on('close',()=>reader.cancel().catch(()=>{}));
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }
  }catch(err){
    res.status(502).json({error:'image_proxy_failed',message:err?.message || String(err)});
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log('Photo Excel proxy listening on',PORT));
