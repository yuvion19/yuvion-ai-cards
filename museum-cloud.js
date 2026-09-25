window.MUSEUM_CLOUD={
 url:"https://huvbrphblapbobklttup.supabase.co",
 key:"sb_publishable_NCmeCgGk_eyVUOZjBSxHcg_5bP3DfsM",
 async select(table,query=""){const r=await fetch(this.url+"/rest/v1/"+table+(query?"?"+query:""),{headers:{apikey:this.key}});if(!r.ok)throw new Error("read");return r.json()},
 async insert(table,row){const r=await fetch(this.url+"/rest/v1/"+table,{method:"POST",headers:{apikey:this.key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(row)});if(!r.ok)throw new Error("write");return true}
};