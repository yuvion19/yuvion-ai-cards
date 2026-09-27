function clean(v=""){return String(v).replace(/[<>]/g,"").trim()}
export async function onRequestPost({ request, env }) {
  const expected=env.UVMALL_AUTOPOST_SECRET;
  const provided=request.headers.get("x-uvmall-secret");
  if(!expected || provided!==expected) return Response.json({ok:false,error:"unauthorized"},{status:401});
  if(!env.TELEGRAM_BOT_TOKEN) return Response.json({ok:false,error:"telegram_bot_not_configured"},{status:503});
  let p; try{p=await request.json()}catch{return Response.json({ok:false,error:"invalid_json"},{status:400})}
  const chat=env.TELEGRAM_CHANNEL_ID||"@uvmall";
  const title=clean(p.title||"Новый товар"), seller=clean(p.seller||"Продавец UVMALL"), pavilion=clean(p.pavilion||"—");
  const price=Number(p.price||0), wh=Number(p.wholesale||0), moq=Number(p.moq||0);
  const url=/^https:\/\//.test(String(p.url||""))?String(p.url):"https://uvmall.ru/product/"+encodeURIComponent(p.id||"");
  const lines=["🆕 <b>Новинка на UVMALL</b>","",
    "<b>"+title+"</b>",
    price?"💰 Цена: "+price.toLocaleString("ru-RU")+" ₽":"",
    wh?"📦 Опт: "+wh.toLocaleString("ru-RU")+" ₽"+(moq?" от "+moq+" шт.":""):"",
    "🏪 "+seller,
    "📍 Павильон: "+pavilion
  ].filter(Boolean);
  const payload={chat_id:chat,parse_mode:"HTML",reply_markup:{inline_keyboard:[[{text:"🛍 Посмотреть на UVMALL",url:url}]]}};
  let method="sendMessage";
  if(/^https:\/\//.test(String(p.image||""))){method="sendPhoto";payload.photo=String(p.image);payload.caption=lines.join("\n")}else payload.text=lines.join("\n");
  const api="https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/"+method;
  const r=await fetch(api,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const j=await r.json();
  if(!r.ok || !j.ok) return Response.json({ok:false,error:"telegram_error",details:j},{status:502});
  return Response.json({ok:true,messageId:j.result&&j.result.message_id,chatId:chat});
}