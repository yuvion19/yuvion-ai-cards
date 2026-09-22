const CACHE="pamyat-v7";
const STATIC=["/manifest.webmanifest","/icon.svg","/m","/m/today","/m/calendar","/m/archive","/m/search","/m/wall","/m/reminders","/m/feed","/m/book","/m/inbox","/m/status"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(async c=>{for(const u of STATIC){try{await c.add(u)}catch{}}}).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(async()=>{
      return (await caches.match(e.request))||(await caches.match("/m"))||new Response("<h1>Память</h1><p>Сейчас нет соединения. Попробуйте ещё раз позже.</p>",{headers:{"content-type":"text/html; charset=utf-8"}})
    }));
    return;
  }
  if(u.pathname.startsWith("/api/"))return;
  if(!STATIC.includes(u.pathname)&&!u.pathname.startsWith("/vendor/")&&!u.pathname.startsWith("/qr/"))return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r})));
});
self.addEventListener("push",e=>{let d={title:"Память",body:"Новое напоминание",url:"/m"};try{d={...d,...e.data.json()}}catch{}e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:"/icon.svg",badge:"/icon.svg",data:{url:d.url||"/m",event_id:d.event_id},tag:d.event_id?"event-"+d.event_id:undefined,renotify:false,requireInteraction:false}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=e.notification.data?.url||"/m";e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const c of list){if("focus"in c){c.navigate(url);return c.focus()}}if(clients.openWindow)return clients.openWindow(url)}))});
