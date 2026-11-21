export default async function handler(req,res){
 if(req.method!=='GET'||req.query?.nonce!=='juhur3-verify-source-2026'){
   return res.status(404).json({error:'not found'});
 }
 const origin='https://huggingface.co/datasets/google/smol/resolve/fdaff3a1a019f89fa30a562a85d7c1d3e9150444/';
 const result=[];
 for(const f of ['gatitos/ru_jdt.jsonl','smolsent/ru_jdt.jsonl','smoldoc/ru_jdt.jsonl']){
  try{
   const response=await fetch(origin+f,{headers:{Accept:'text/plain'},signal:AbortSignal.timeout(12000)});
   const text=(await response.text()).slice(0,9000);
   const first=text.split('\n').find(x=>x.trim());
   let obj=null;try{obj=JSON.parse(first)}catch(_){}
   result.push({file:f,status:response.status,type:response.headers.get('content-type'),
     bytesRead:text.length,jsonKeys:obj?Object.keys(obj):[],shape:obj?Object.fromEntries(
      Object.entries(obj).slice(0,15).map(([k,v])=>[k,Array.isArray(v)?'array:'+v.length:typeof v])):{},
      sample:text.slice(0,320)});
  }catch(e){result.push({file:f,error:String(e?.message||e).slice(0,180)});}
 }
 return res.status(200).json({result});
}
