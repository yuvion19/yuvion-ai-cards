(function(){
  const clear=async()=>{
    try{
      if("caches" in window){
        const keys=await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
      if("serviceWorker" in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
    }catch(e){}
  };
  window.addEventListener("load",clear,{once:true});
  navigator.serviceWorker?.addEventListener?.("message",e=>{
    if(e.data&&e.data.type==="NITI_CACHE_CLEARED") location.reload();
  });
})();