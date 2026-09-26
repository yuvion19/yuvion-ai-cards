const http=require('http');
const {URL}=require('url');
const PORT=process.env.PORT||10000;
const CACHE_TTL=60*1000;
const cache=new Map();

const FOOTBALL_LEAGUES=[
  {id:'4328',name:'Premier League',espn:'eng.1'},
  {id:'4335',name:'LaLiga',espn:'esp.1'},
  {id:'4332',name:'Serie A',espn:'ita.1'},
  {id:'4331',name:'Bundesliga',espn:'ger.1'},
  {id:'4334',name:'Ligue 1',espn:'fra.1'},
  {id:'4480',name:'Champions League',espn:'uefa.champions'},
  {id:'4481',name:'Europa League',espn:'uefa.europa'},
  {id:'4355',name:'Russian Premier League',espn:'rus.1'},
  {id:'4346',name:'MLS',espn:'usa.1'},
  {id:'4490',name:'UEFA Nations League',espn:'uefa.nations'},
  {id:'4562',name:'International Friendlies',espn:'fifa.friendly'},
  {id:'5071',name:'UEFA Conference League',espn:'uefa.europa.conf'},
  {id:'4337',name:'Eredivisie',espn:'ned.1'},
  {id:'4344',name:'Primeira Liga',espn:'por.1'},
  {id:'4668',name:'Saudi Pro League',espn:'ksa.1'},
  {id:'4406',name:'Argentinian Primera Division',espn:'arg.1'},
  {id:'4351',name:'Brazilian Serie A',espn:'bra.1'},
  {id:'4339',name:'Turkish Super Lig',espn:'tur.1'},
  {id:'4338',name:'Belgian Pro League',espn:'bel.1'}
];

const OTHER_SPORTS=[
  {sport:'basketball',query:'Basketball',name:'Basketball',espnSport:'basketball',espn:'nba'},
  {sport:'hockey',query:'Ice Hockey',name:'Ice Hockey',espnSport:'hockey',espn:'nhl'},
  {sport:'tennis',query:'Tennis',name:'Tennis',espnSport:null,espn:null}
];

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','public, max-age=30');
}
function send(res,code,body){cors(res);res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function ymdDash(d){return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;}
function displayName(c){return c?.team?.displayName||c?.athlete?.displayName||c?.displayName||c?.team?.shortDisplayName||'Участник';}
function logo(c){return c?.team?.logo||c?.athlete?.headshot?.href||null;}
function record(c){return c?.records?.[0]?.summary||null;}

async function fetchJson(url,timeoutMs=12000){
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 MatchScope/1.2'},signal:AbortSignal.timeout(timeoutMs)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function parseTsdEvent(ev,sport,forcedLeagueId=null,forcedLeagueName=null){
  if(!ev?.strHomeTeam||!ev?.strAwayTeam)return null;
  const rawDate=ev.strTimestamp||(ev.dateEvent?`${ev.dateEvent}T${ev.strTime||'00:00:00'}Z`:null);
  const statusText=ev.strStatus||ev.strPostponed||'';
  const scoreA=ev.intHomeScore===''||ev.intHomeScore==null?null:String(ev.intHomeScore);
  const scoreB=ev.intAwayScore===''||ev.intAwayScore==null?null:String(ev.intAwayScore);
  let state='pre';
  if(scoreA!==null&&scoreB!==null)state='post';
  const s=String(statusText).toLowerCase();
  if(s.includes('live')||s.includes('progress')||s.includes('half')||s.includes('quarter')||s.includes('period'))state='in';
  return {
    id:'tsd-'+String(ev.idEvent||Math.random()),sourceId:String(ev.idEvent||''),sport,
    league:ev.strLeague||forcedLeagueName||ev.strLeagueAlternate||'Competition',
    leagueSlug:String(ev.idLeague||forcedLeagueId||''),date:rawDate,state,
    status:statusText||(state==='post'?'Завершён':''),
    a:ev.strHomeTeam,b:ev.strAwayTeam,logoA:ev.strHomeTeamBadge||null,logoB:ev.strAwayTeamBadge||null,
    scoreA,scoreB,recordA:null,recordB:null,venue:ev.strVenue||null,neutral:false,source:'TheSportsDB'
  };
}

function parseEspnEvent(ev,source,sport='football'){
  const comp=ev?.competitions?.[0]||{},cs=comp.competitors||[];
  if(cs.length<2)return null;
  const a=cs.find(x=>x.homeAway==='home')||cs[0];
  const b=cs.find(x=>x.homeAway==='away')||cs.find(x=>x!==a)||cs[1];
  const st=ev?.status?.type||{};
  return {
    id:'espn-'+String(ev.id),sourceId:String(ev.id),sport,
    league:source.name||ev?.league?.name||'Competition',leagueSlug:String(source.id||source.espn||''),
    date:ev.date||comp.date||null,state:st.state||'pre',status:st.shortDetail||st.detail||st.description||'',
    a:displayName(a),b:displayName(b),logoA:logo(a),logoB:logo(b),scoreA:a?.score??null,scoreB:b?.score??null,
    recordA:record(a),recordB:record(b),venue:comp?.venue?.fullName||null,neutral:Boolean(comp?.neutralSite),source:'ESPN'
  };
}

async function fetchTsdLeague(league,date8){
  const url=`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${ymdDash(date8)}&l=${league.id}`;
  const data=await fetchJson(url);
  return {items:(data.events||[]).map(e=>parseTsdEvent(e,'football',league.id,league.name)).filter(Boolean),url};
}
async function fetchEspnLeague(league,date8){
  const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}/scoreboard?dates=${date8}&limit=200`;
  const data=await fetchJson(url,10000);
  return {items:(data.events||[]).map(e=>parseEspnEvent(e,league,'football')).filter(Boolean),url};
}
async function fetchFootballLeagueBundle(league,date8){
  const [tsd,espn]=await Promise.allSettled([fetchTsdLeague(league,date8),fetchEspnLeague(league,date8)]);
  const items=[
    ...(tsd.status==='fulfilled'?tsd.value.items:[]),
    ...(espn.status==='fulfilled'?espn.value.items:[])
  ];
  return {
    items,
    diagnostic:{
      name:league.name,id:league.id,count:items.length,
      tsd:tsd.status==='fulfilled'?tsd.value.items.length:'ERR '+String(tsd.reason?.message||tsd.reason),
      espn:espn.status==='fulfilled'?espn.value.items.length:'ERR '+String(espn.reason?.message||espn.reason)
    }
  };
}

async function fetchOtherSport(source,date8){
  const date=ymdDash(date8);
  const tsdUrl=`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=${encodeURIComponent(source.query)}`;
  const jobs=[fetchJson(tsdUrl)];
  if(source.espnSport&&source.espn){
    jobs.push(fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${source.espnSport}/${source.espn}/scoreboard?dates=${date8}&limit=200`,10000));
  }
  const settled=await Promise.allSettled(jobs);
  const items=[];
  if(settled[0]?.status==='fulfilled'){
    items.push(...(settled[0].value.events||[]).map(e=>parseTsdEvent(e,source.sport)).filter(Boolean));
  }
  if(settled[1]?.status==='fulfilled'){
    items.push(...(settled[1].value.events||[]).map(e=>parseEspnEvent(e,{id:source.espn,name:source.name,espn:source.espn},source.sport)).filter(Boolean));
  }
  return {items,diagnostic:{name:source.name,count:items.length,tsd:settled[0]?.status||'none',espn:settled[1]?.status||'none'}};
}

function dedupe(items){
  const seen=new Set();
  return items.filter(m=>{
    const k=`${m.sport}|${String(m.a).toLowerCase()}|${String(m.b).toLowerCase()}|${(m.date||'').slice(0,10)}|${m.leagueSlug}`;
    if(seen.has(k))return false;
    seen.add(k);return true;
  });
}

async function getMatches(date8,sport='all',withDiagnostics=false){
  const key=`${date8}:${sport}:${withDiagnostics?'debug':'normal'}`;
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.time<CACHE_TTL)return hit.data;

  const tasks=[];
  if(sport==='all'||sport==='football')FOOTBALL_LEAGUES.forEach(l=>tasks.push({type:'football',source:l,p:fetchFootballLeagueBundle(l,date8)}));
  OTHER_SPORTS.filter(s=>sport==='all'||s.sport===sport).forEach(s=>tasks.push({type:s.sport,source:s,p:fetchOtherSport(s,date8)}));

  const settled=await Promise.all(tasks.map(t=>t.p));
  const matches=dedupe(settled.flatMap(x=>x.items)).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0));
  const diagnostics=settled.map(x=>x.diagnostic);
  const footballLeagues=[...new Map(matches.filter(m=>m.sport==='football').map(m=>[m.leagueSlug,{id:m.leagueSlug,name:m.league}])).values()]
    .sort((a,b)=>a.name.localeCompare(b.name));

  const data={
    date:date8,sport,matches,footballLeagues,
    sourceCount:tasks.length,failedSources:diagnostics.filter(x=>x.count===0).length,
    updatedAt:new Date().toISOString(),providers:[...new Set(matches.map(x=>x.source))]
  };
  if(withDiagnostics)data.diagnostics=diagnostics;
  cache.set(key,{time:Date.now(),data});
  return data;
}

function ymdInMoscow(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${map.year}${map.month}${map.day}`;
}
async function startupDiagnostics(){
  try{
    const date=ymdInMoscow(0),data=await getMatches(date,'all',true);
    console.log('[startup-diagnostics]',JSON.stringify({date,total:data.matches.length,football:data.matches.filter(x=>x.sport==='football').length,leagues:data.footballLeagues,diagnostics:data.diagnostics}));
  }catch(e){console.log('[startup-diagnostics-error]',e?.stack||String(e));}
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){cors(res);res.writeHead(204);return res.end();}
  const u=new URL(req.url,`http://${req.headers.host}`);
  console.log('[request]',req.method,u.pathname,u.search);
  if(u.pathname==='/health')return send(res,200,{ok:true,time:new Date().toISOString()});
  if(u.pathname==='/api/matches'){
    const date=(u.searchParams.get('date')||'').replace(/\D/g,''),sport=u.searchParams.get('sport')||'all';
    if(!/^\d{8}$/.test(date))return send(res,400,{error:'date must be YYYYMMDD'});
    try{return send(res,200,await getMatches(date,sport,false));}
    catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)});}
  }
  if(u.pathname==='/api/debug'){
    const date=(u.searchParams.get('date')||ymdInMoscow(0)).replace(/\D/g,'');
    try{return send(res,200,await getMatches(date,'all',true));}
    catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)});}
  }
  return send(res,200,{name:'MatchScope Live API',ok:true,footballLeagues:FOOTBALL_LEAGUES,providers:['TheSportsDB free','ESPN fallback']});
});
server.listen(PORT,()=>{console.log('MatchScope Live API listening on',PORT);startupDiagnostics();});
