const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 10000;
const CACHE_TTL = 60 * 1000;
const cache = new Map();

const ESPN_SOURCES = [
  { sport:'football', apiSport:'soccer', league:'eng.1', name:'Premier League' },
  { sport:'football', apiSport:'soccer', league:'esp.1', name:'LaLiga' },
  { sport:'football', apiSport:'soccer', league:'ita.1', name:'Serie A' },
  { sport:'football', apiSport:'soccer', league:'ger.1', name:'Bundesliga' },
  { sport:'football', apiSport:'soccer', league:'fra.1', name:'Ligue 1' },
  { sport:'football', apiSport:'soccer', league:'uefa.champions', name:'Champions League' },
  { sport:'football', apiSport:'soccer', league:'uefa.europa', name:'Europa League' },
  { sport:'basketball', apiSport:'basketball', league:'nba', name:'NBA' },
  { sport:'hockey', apiSport:'hockey', league:'nhl', name:'NHL' }
];

const TSD_SPORTS = [
  {sport:'football', query:'Soccer', name:'Soccer'},
  {sport:'basketball', query:'Basketball', name:'Basketball'},
  {sport:'hockey', query:'Ice Hockey', name:'Ice Hockey'},
  {sport:'tennis', query:'Tennis', name:'Tennis'}
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30');
}
function send(res, code, body) {
  cors(res);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}
function displayName(c) {
  return c?.team?.displayName || c?.athlete?.displayName || c?.displayName || c?.team?.shortDisplayName || 'Участник';
}
function logo(c) { return c?.team?.logo || c?.athlete?.headshot?.href || null; }
function record(c) { return c?.records?.[0]?.summary || null; }

function parseEspnEvent(ev, source) {
  const comp = ev?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  if (cs.length < 2) return null;
  let a = cs.find(x=>x.homeAway==='home') || cs[0];
  let b = cs.find(x=>x.homeAway==='away') || cs.find(x=>x!==a) || cs[1];
  const st = ev?.status?.type || {};
  return {
    id: 'espn-'+String(ev.id),
    sourceId: String(ev.id),
    sport: source.sport,
    league: ev?.league?.name || source.name,
    leagueSlug: source.league,
    date: ev.date || comp.date || null,
    state: st.state || 'pre',
    status: st.shortDetail || st.detail || st.description || '',
    a: displayName(a),
    b: displayName(b),
    logoA: logo(a),
    logoB: logo(b),
    scoreA: a?.score ?? null,
    scoreB: b?.score ?? null,
    recordA: record(a),
    recordB: record(b),
    venue: comp?.venue?.fullName || null,
    neutral: Boolean(comp?.neutralSite),
    source: 'ESPN'
  };
}

function ymdDash(date8){
  return `${date8.slice(0,4)}-${date8.slice(4,6)}-${date8.slice(6,8)}`;
}

function parseTsdEvent(ev, sport) {
  if (!ev?.strHomeTeam || !ev?.strAwayTeam) return null;
  const rawDate = ev.strTimestamp || (ev.dateEvent ? `${ev.dateEvent}T${ev.strTime || '00:00:00'}Z` : null);
  const statusText = ev.strStatus || ev.strPostponed || '';
  const scoreA = ev.intHomeScore === '' || ev.intHomeScore == null ? null : String(ev.intHomeScore);
  const scoreB = ev.intAwayScore === '' || ev.intAwayScore == null ? null : String(ev.intAwayScore);
  let state='pre';
  if (scoreA!==null && scoreB!==null) state='post';
  const s=String(statusText).toLowerCase();
  if (s.includes('live') || s.includes('progress') || s.includes('half') || s.includes('quarter') || s.includes('period')) state='in';
  return {
    id:'tsd-'+String(ev.idEvent || Math.random()),
    sourceId:String(ev.idEvent || ''),
    sport,
    league:ev.strLeague || ev.strLeagueAlternate || 'Competition',
    leagueSlug:String(ev.idLeague || ''),
    date:rawDate,
    state,
    status:statusText || (state==='post'?'Завершён':''),
    a:ev.strHomeTeam,
    b:ev.strAwayTeam,
    logoA:ev.strHomeTeamBadge || null,
    logoB:ev.strAwayTeamBadge || null,
    scoreA,
    scoreB,
    recordA:null,
    recordB:null,
    venue:ev.strVenue || null,
    neutral:false,
    source:'TheSportsDB'
  };
}

async function fetchJson(url, timeoutMs=12000){
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 MatchScope/1.1'},signal:AbortSignal.timeout(timeoutMs)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchTsdSport(source,date8){
  const date=ymdDash(date8);
  const url=`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${encodeURIComponent(date)}&s=${encodeURIComponent(source.query)}`;
  const data=await fetchJson(url);
  const items=(data.events||[]).map(e=>parseTsdEvent(e,source.sport)).filter(Boolean);
  return {items,url,provider:'TheSportsDB'};
}

async function fetchEspnSource(source,date8){
  const bases=['https://site.api.espn.com','https://site.web.api.espn.com'];
  let lastErr;
  for(const base of bases){
    const url=`${base}/apis/site/v2/sports/${source.apiSport}/${source.league}/scoreboard?dates=${date8}&limit=200`;
    try{
      const data=await fetchJson(url,10000);
      return {items:(data.events||[]).map(e=>parseEspnEvent(e,source)).filter(Boolean),url,provider:'ESPN'};
    }catch(e){lastErr=e}
  }
  throw lastErr||new Error(source.name+': source failed');
}

async function fetchSportBundle(tsdSource,date8){
  let tsdError=null;
  try{
    const primary=await fetchTsdSport(tsdSource,date8);
    if(primary.items.length) return {items:primary.items,diagnostic:{name:tsdSource.name,provider:'TheSportsDB',ok:true,count:primary.items.length}};
  }catch(e){tsdError=String(e?.message||e)}

  const espnSources=ESPN_SOURCES.filter(s=>s.sport===tsdSource.sport);
  const settled=await Promise.allSettled(espnSources.map(s=>fetchEspnSource(s,date8)));
  const items=settled.flatMap(r=>r.status==='fulfilled'?r.value.items:[]);
  const failures=settled.filter(r=>r.status==='rejected').map(r=>String(r.reason?.message||r.reason));
  if(items.length){
    return {items,diagnostic:{name:tsdSource.name,provider:'ESPN fallback',ok:true,count:items.length,tsdError}};
  }
  return {items:[],diagnostic:{name:tsdSource.name,provider:'none',ok:false,count:0,tsdError,errors:failures.slice(0,3)}};
}

async function getMatches(date8,sport='all',withDiagnostics=false){
  const key=`${date8}:${sport}:${withDiagnostics?'debug':'normal'}`;
  const hit=cache.get(key);
  if(hit && Date.now()-hit.time<CACHE_TTL) return hit.data;

  const selected=TSD_SPORTS.filter(s=>sport==='all'||s.sport===sport);
  const settled=await Promise.allSettled(selected.map(s=>fetchSportBundle(s,date8)));
  const matches=[];
  const diagnostics=[];
  settled.forEach((result,idx)=>{
    const source=selected[idx];
    if(result.status==='fulfilled'){
      matches.push(...result.value.items);
      diagnostics.push(result.value.diagnostic);
    }else{
      diagnostics.push({name:source.name,provider:'none',ok:false,count:0,error:String(result.reason?.message||result.reason)});
    }
  });

  const seen=new Set();
  const deduped=matches.filter(m=>{
    const key=`${m.sport}|${m.a}|${m.b}|${m.date||''}`;
    if(seen.has(key)) return false;
    seen.add(key);return true;
  }).sort((x,y)=>new Date(x.date||0)-new Date(y.date||0));

  const data={
    date:date8,
    sport,
    matches:deduped,
    sourceCount:selected.length,
    failedSources:diagnostics.filter(x=>!x.ok).length,
    updatedAt:new Date().toISOString(),
    providers:[...new Set(deduped.map(x=>x.source))]
  };
  if(withDiagnostics) data.diagnostics=diagnostics;
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
  const date=ymdInMoscow(0);
  try{
    const data=await getMatches(date,'all',true);
    console.log('[startup-diagnostics]',JSON.stringify({date,total:data.matches.length,providers:data.providers,failed:data.failedSources,sources:data.diagnostics}));
  }catch(e){
    console.log('[startup-diagnostics-error]',e?.stack||String(e));
  }
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){cors(res);res.writeHead(204);return res.end()}
  const u=new URL(req.url,`http://${req.headers.host}`);
  console.log('[request]',req.method,u.pathname,u.search);

  if(u.pathname==='/health') return send(res,200,{ok:true,time:new Date().toISOString()});
  if(u.pathname==='/api/matches'){
    const date=(u.searchParams.get('date')||'').replace(/\D/g,'');
    const sport=u.searchParams.get('sport')||'all';
    if(!/^\d{8}$/.test(date)) return send(res,400,{error:'date must be YYYYMMDD'});
    try{return send(res,200,await getMatches(date,sport,false))}
    catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)})}
  }
  if(u.pathname==='/api/debug'){
    const date=(u.searchParams.get('date')||ymdInMoscow(0)).replace(/\D/g,'');
    try{return send(res,200,await getMatches(date,'all',true))}
    catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)})}
  }
  return send(res,200,{name:'MatchScope Live API',ok:true,providers:['TheSportsDB free','ESPN fallback'],endpoints:['/api/matches?date=YYYYMMDD&sport=all','/api/debug?date=YYYYMMDD']});
});

server.listen(PORT,()=>{
  console.log('MatchScope Live API listening on',PORT);
  startupDiagnostics();
});