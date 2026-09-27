const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, "public");

function send(res, status, body, type="application/json; charset=utf-8"){
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let data="", size=0;
    req.on("data",chunk=>{
      size += chunk.length;
      if(size>2_000_000){ reject(new Error("Запрос слишком большой")); req.destroy(); return; }
      data += chunk;
    });
    req.on("end",()=>{
      try{ resolve(data ? JSON.parse(data) : {}); } catch(e){ reject(new Error("Некорректный JSON")); }
    });
    req.on("error",reject);
  });
}
function validateToken(token){
  if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(String(token||""))) throw new Error("Неверный Bot Token");
}
async function tg(token, method, form){
  validateToken(token);
  const r = await fetch("https://api.telegram.org/bot"+token+"/"+method, { method:"POST", body: form || new FormData() });
  const j = await r.json();
  if(!j.ok) throw new Error(j.description || ("Telegram API error "+r.status));
  return j.result;
}
function clean(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_+|_+$/g,""); }
function setName(botUsername,userId,mode){
  const suffix="_by_"+clean(botUsername);
  const base=("uvmall_"+(mode==="animated"?"emoji":"stickers")+"_"+String(userId).slice(-6)+"_"+Date.now().toString().slice(-6));
  return clean(base).slice(0,64-suffix.length).replace(/_+$/,"")+suffix;
}
async function uploadFile(token,userId,mode,fileName,dataBase64){
  const format=mode==="video"?"video":"animated";
  const buf=Buffer.from(String(dataBase64||""),"base64");
  const limit=mode==="video"?256*1024:64*1024;
  if(!buf.length) throw new Error("Пустой файл");
  if(buf.length>limit) throw new Error(fileName+": файл превышает лимит Telegram");
  if(mode==="animated" && !String(fileName).toLowerCase().endsWith(".tgs")) throw new Error("Нужен .TGS файл");
  if(mode==="video" && !String(fileName).toLowerCase().endsWith(".webm")) throw new Error("Нужен .WEBM файл");
  const fd=new FormData();
  fd.set("user_id",String(userId));
  fd.set("sticker_format",format);
  fd.set("sticker",new Blob([buf]),String(fileName));
  return tg(token,"uploadStickerFile",fd);
}

async function api(req,res,url){
  try{
    const b=await readJson(req);
    const token=String(b.token||"");
    if(url==="/api/check"){
      const me=await tg(token,"getMe");
      return send(res,200,{ok:true,username:me.username,id:me.id});
    }
    if(url==="/api/find-id"){
      const updates=await tg(token,"getUpdates");
      const found=[...updates].reverse().map(u=>u.message?.from||u.edited_message?.from||u.callback_query?.from).find(x=>x?.id);
      if(!found) throw new Error("Не нашёл сообщений. Сначала отправь своему боту /start");
      return send(res,200,{ok:true,userId:String(found.id),name:[found.first_name,found.last_name].filter(Boolean).join(" ")});
    }
    if(url==="/api/create"){
      const userId=String(b.userId||"");
      if(!/^\d+$/.test(userId)) throw new Error("Некорректный user_id");
      const mode=b.mode==="video"?"video":"animated";
      const title=String(b.title||"UVMALL").slice(0,64);
      const emoji=String(b.emoji||"👍");
      const up=await uploadFile(token,userId,mode,b.fileName,b.dataBase64);
      const me=await tg(token,"getMe");
      if(!me.username) throw new Error("У бота нет username");
      const name=setName(me.username,userId,mode);
      const format=mode==="video"?"video":"animated";
      const type=mode==="video"?"regular":"custom_emoji";
      const fd=new FormData();
      fd.set("user_id",userId); fd.set("name",name); fd.set("title",title); fd.set("sticker_type",type);
      fd.set("stickers",JSON.stringify([{sticker:up.file_id,format,emoji_list:[emoji]}]));
      await tg(token,"createNewStickerSet",fd);
      return send(res,200,{ok:true,setName:name,link:(mode==="video"?"https://t.me/addstickers/":"https://t.me/addemoji/")+name});
    }
    if(url==="/api/add"){
      const userId=String(b.userId||"");
      if(!/^\d+$/.test(userId)) throw new Error("Некорректный user_id");
      const mode=b.mode==="video"?"video":"animated";
      const emoji=String(b.emoji||"👍");
      const name=String(b.setName||"");
      if(!name) throw new Error("Нет имени набора");
      const up=await uploadFile(token,userId,mode,b.fileName,b.dataBase64);
      const format=mode==="video"?"video":"animated";
      const fd=new FormData();
      fd.set("user_id",userId); fd.set("name",name);
      fd.set("sticker",JSON.stringify({sticker:up.file_id,format,emoji_list:[emoji]}));
      await tg(token,"addStickerToSet",fd);
      return send(res,200,{ok:true});
    }
    return send(res,404,{ok:false,error:"Not found"});
  }catch(e){
    return send(res,400,{ok:false,error:e instanceof Error?e.message:String(e)});
  }
}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(req.method==="POST" && url.pathname.startsWith("/api/")) return api(req,res,url.pathname);
  let file=url.pathname==="/"?"index.html":url.pathname.replace(/^\//,"");
  const full=path.join(ROOT,file);
  if(!full.startsWith(ROOT)) return send(res,403,"Forbidden","text/plain");
  fs.readFile(full,(err,data)=>{
    if(err) return send(res,404,"Not found","text/plain");
    const ext=path.extname(full);
    const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
    send(res,200,data,types[ext]||"application/octet-stream");
  });
});
server.listen(PORT,()=>console.log("UVMALL uploader listening on "+PORT));
