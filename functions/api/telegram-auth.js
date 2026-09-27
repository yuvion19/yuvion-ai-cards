const enc = new TextEncoder();
function hex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function hmac(key,data){
  const k=await crypto.subtle.importKey("raw",typeof key==="string"?enc.encode(key):key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return crypto.subtle.sign("HMAC",k,enc.encode(data));
}
export async function onRequestPost({ request, env }) {
  if(!env.TELEGRAM_BOT_TOKEN) return Response.json({ok:false,error:"telegram_bot_not_configured"},{status:503});
  let body; try{ body=await request.json(); }catch{ return Response.json({ok:false,error:"invalid_json"},{status:400}); }
  const initData=String(body.initData||"");
  if(!initData) return Response.json({ok:false,error:"init_data_required"},{status:400});
  const p=new URLSearchParams(initData), provided=p.get("hash")||"";
  p.delete("hash");
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const secret=await hmac("WebAppData",env.TELEGRAM_BOT_TOKEN);
  const calc=hex(await hmac(secret,check));
  const authDate=Number(p.get("auth_date")||0);
  const fresh=authDate && (Math.floor(Date.now()/1000)-authDate)<86400;
  if(calc!==provided || !fresh) return Response.json({ok:false,error:"invalid_init_data"},{status:401});
  let user=null; try{user=JSON.parse(p.get("user")||"null")}catch{}
  return Response.json({ok:true,user});
}