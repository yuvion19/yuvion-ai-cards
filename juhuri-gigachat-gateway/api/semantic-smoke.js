import { validateSemantic } from '../server.mjs';
import { queryIndex } from '../server-index.mjs';
export default async function(req,res){
 if(req.method!=='GET'||req.query?.nonce!=='juhur3-verify-91a27ab8')return res.status(404).json({error:'not found'});
 try{
  const sem=await validateSemantic();
  const idx=await queryIndex('персик','ru',2);
  return res.status(200).json({semantic:sem,lookup:{ok:idx.ok,top:idx.results?.[0]?.id,indexSize:idx.indexSize}});
 }catch(error){return res.status(200).json({error:String(error.message||error).slice(0,200),cause:String(error.cause?.code||'')});}
}
