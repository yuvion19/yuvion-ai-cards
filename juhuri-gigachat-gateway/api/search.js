import { queryIndex,indexStats } from '../server-index.mjs';
const ALLOWED=new Set(['https://juhuritranslate.pusk.io',
 'https://preview-970c667b-ccfd-4d19-a48f-ec2842f5841b.pusk.io']);
export default async function handler(req,res){
 const origin=String(req.headers.origin||'');
 if(origin&&!ALLOWED.has(origin))return res.status(403).json({error:'Origin не разрешён'});
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS'){
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Content-Type');
   return res.status(204).end();
 }
 try {
  const url=new URL(req.url,'https://juhuri-gigachat-api.vercel.app');
  if(req.method==='GET'&&url.searchParams.has('stats'))
    return res.status(200).json({ok:true,stats:await indexStats()});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Используйте POST /api/search'});
  if(!(req.headers['content-type']||'').includes('application/json'))
    return res.status(415).json({ok:false,error:'Ожидается JSON'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const q=String(body.q||'');
  const from=String(body.from||'ru');
  const limit=Math.min(10,Math.max(1,Number(body.limit||7)||7));
  const result=await queryIndex(q,from,limit);
  return res.status(result.ok?200:400).json(result);
 }catch(e){return res.status(503).json({ok:false,error:'Серверный словарь временно недоступен',
  detail:String(e?.message||'неизвестная ошибка').slice(0,120)});}
}
