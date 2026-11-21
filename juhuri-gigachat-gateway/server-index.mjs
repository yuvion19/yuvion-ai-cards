/* Juhur AI 3.0. Public licensed Google SMOL server index.
 * Does not import STMEGI or upload privately held PUSK corpus assets.
 * Control-set document lines and all suspicious identical pairs are excluded. */
const REV='fdaff3a1a019f89fa30a562a85d7c1d3e9150444';
const ROOT='https://huggingface.co/datasets/google/smol/resolve/'+REV+'/';
const BLOB='https://huggingface.co/datasets/google/smol/blob/'+REV+'/';
const HELD={
  smolsent:new Set([31,35,36,46,69,72,79,123,143,149,150,169,191,193,197,231,238,259,290,292,342,345,352,371,427,447,460,466,497,502,521,532,541,656,666,669,675,769,776,779]),
  smoldoc:new Set([15,16,27,33,53,95,96,106,115,126,132,145,172,237,258,260,328,363,372,377,382,419,429,432,464,474,476,546,560,568])
};
let snapshot=null, promise=null, loadedAt=0;
const maxAge=2*3600000;
const stop=new Set('и а на в с у по для это как мне мы я он она что из или но до вот та не их ты вы было там есть его ей тебя где как'.split(' '));
function normalize(v){return String(v||'').toLocaleLowerCase('ru')
  .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,'')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\p{L}\p{N}']+/gu,' ').trim().replace(/\s+/g,' ');}
function tokens(v){return [...new Set(normalize(v).split(' ').filter(x=>x.length>=2&&!stop.has(x)))].slice(0,32);}
function stem(t,lang){
 if(lang!=='ru')return t.replace(/(гьоре|гьо|ре)$/,'');
 return t.replace(/(иями|ями|ами|ение|ений|ения|ому|ему|ими|ыми|ого|его|ыми|ах|ях|ов|ев|ий|ый|ая|ое|ые|ем|ом|ей|ой|ам|ям|ам|ию|ью|ят|ут|ют|ать|ять|ить|еть|ти|ся|ли|ла|ло|ль)$/,'');
}
function eligible(a,b){const ru=String(a||'').trim(),jdt=String(b||'').trim();
 if(!ru||!jdt||ru.length>2500||jdt.length>2500)return false;
 if(ru.length>55&&normalize(ru)===normalize(jdt))return false;
 return true;}
async function readFile(group) {
 const url=ROOT+group+'/ru_jdt.jsonl';
 const response=await fetch(url,{
   headers:{'accept':'text/plain'},
   signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error('Источник '+group+' временно недоступен (HTTP '+response.status+')');
 const text=await response.text();
 if(text.length>16000000)throw new Error('Источник превышает безопасный размер');
 const rows=text.split(/\r?\n/).filter(Boolean);
 const all=[];let bad=0;
 rows.forEach((line,i)=>{
  const number=i+1;
  if(HELD[group]?.has(number))return;
  let x;try{x=JSON.parse(line)}catch(_){bad++;return;}
  if(group==='gatitos'){
   const vals=Array.isArray(x.trgs)?x.trgs:[x.trg];
   const jdt=vals.filter(Boolean).join(' | ');
   if(eligible(x.src,jdt))all.push({id:'GAT-'+String(number).padStart(4,'0'),ru:String(x.src),jdt,
     source:'Google SMOL / GATITOS · CC BY 4.0',
     url:BLOB+group+'/ru_jdt.jsonl#L'+number,kind:'word'});
  }else if(group==='smolsent'){
   if(eligible(x.src,x.trg))all.push({id:'SENT-'+String(x.id??(number-1)),ru:String(x.src),jdt:String(x.trg),
     source:'Google SMOL / SmolSent · CC BY 4.0',
     url:BLOB+group+'/ru_jdt.jsonl#L'+number,kind:'phrase'});
  }else if(group==='smoldoc'){
   const ru=Array.isArray(x.srcs)?x.srcs:[],jd=Array.isArray(x.trgs)?x.trgs:[];
   const size=Math.min(ru.length,jd.length,100);
   for(let k=0;k<size;k++){
    if(!eligible(ru[k],jd[k]))continue;
    all.push({id:'DOC-'+String(x.id||number)+'-'+String(k+1).padStart(3,'0'),
      ru:String(ru[k]),jdt:String(jd[k]),
      source:'Google SMOL / SmolDoc · CC BY 4.0',
      url:BLOB+group+'/ru_jdt.jsonl#L'+number,kind:'phrase'});
   }
  }
 });
 return {all,bad,lines:rows.length,group};
}
function build(parts){
 const records=parts.flatMap(p=>p.all);
 const inverted={ru:new Map(),juh:new Map()},exact={ru:new Map(),juh:new Map()};
 function put(map,k,i){if(!k)return;let vals=map.get(k);if(!vals){vals=[];map.set(k,vals)}if(vals.length<900)vals.push(i);}
 records.forEach((r,i)=>{
   for(const lang of ['ru','juh']){
     const raw=lang==='ru'?r.ru:r.jdt;
     const texts=lang==='juh'?raw.split(/\s*\|\s*/).slice(0,8):[raw];
     texts.forEach(t=>{put(exact[lang],normalize(t),i);
       tokens(t).forEach(w=>{put(inverted[lang],w,i);const st=stem(w,lang);if(st.length>=3&&st!==w)put(inverted[lang],st,i);});
     });
   }
 });
 return {records,inverted,exact,stats:{
   total:records.length,bySource:Object.fromEntries(parts.map(p=>[p.group,p.all.length])),
   heldOut:389,bad:parts.reduce((a,p)=>a+p.bad,0),
   sources:'Google SMOL CC BY 4.0 at '+REV,
   verification:'source-attested; not independently native-speaker-verified',revision:REV
 }};
}
async function getIndex(){
 if(snapshot&&Date.now()-loadedAt<maxAge)return snapshot;
 if(promise)return promise;
 promise=Promise.all(['gatitos','smolsent','smoldoc'].map(readFile)).then(parts=>{
   snapshot=build(parts);loadedAt=Date.now();return snapshot;
 }).finally(()=>{promise=null;});
 try{return await promise;}catch(e){if(snapshot)return snapshot;throw e;}
}
function rank(query,from,limit){
 const db=snapshot;
 const q=normalize(query),ts=tokens(query),votes=new Map();
 function bump(i,v){votes.set(i,(votes.get(i)||0)+v);}
 for(const i of db.exact[from].get(q)||[])bump(i,240);
 ts.forEach(t=>{
   const s=stem(t,from);
   const r=db.inverted[from].get(t)||[];
   const weight=12+Math.min(20,Math.floor(300/Math.max(2,r.length)));
   r.slice(0,750).forEach(i=>bump(i,weight));
   if(s!==t&&s.length>=3)(db.inverted[from].get(s)||[]).slice(0,750).forEach(i=>bump(i,5));
 });
 let result=[...votes].map(([i,score])=>{
   const x=db.records[i];
   if(x.kind==='phrase'&&ts.length>=3)score+=Math.min(ts.length,6)*3;
   const corpusText=from==='ru'?x.ru:x.jdt;
   if(normalize(corpusText)===q)score+=90;
   if(normalize(corpusText).includes(q)&&q.length>4)score+=16;
   return {row:x,score};
 }).sort((a,b)=>b.score-a.score).slice(0,limit);
 return result.map(x=>({...x.row,score:x.score,status:'published_unreviewed',confidence_label:'источник найден; проверка носителем отсутствует'}));
}
export async function queryIndex(query,from='ru',limit=8){
 if(!['ru','juh'].includes(from))return {ok:false,reason:'direction_unsupported',results:[]};
 if(!query||query.length>320)return {ok:false,reason:'invalid_query',results:[]};
 let db=await getIndex();
 return {ok:true,source:'Google SMOL · CC BY 4.0',indexSize:db.stats.total,from,
   results:rank(query,from,Math.max(1,Math.min(12,limit)))};
}
export async function indexStats(){const db=await getIndex();return db.stats;}
export const HELD_OUT_COUNTS={smolsent:40,smoldoc:349};
