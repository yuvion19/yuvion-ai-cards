const http=require('http');
const {URL}=require('url');
const PORT=process.env.PORT||10000;
const CACHE_TTL=90*1000;
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
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function ymdDash(d){return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;}
function displayName(c){return c?.team?.displayName||c?.athlete?.displayName||c?.displayName||c?.team?.shortDisplayName||'Участник';}
function logo(c){return c?.team?.logo||c?.athlete?.headshot?.href||null;}
function record(c){return c?.records?.[0]?.summary||null;}
function scoreValue(c){const v=c?.score?.value??c?.score?.displayValue??c?.score;const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeName(s){return String(s||'').toLowerCase().replace(/fc|cf|afc|sc/g,'').replace(/[^a-zа-я0-9]+/gi,' ').trim();}

async function fetchJson(url,timeoutMs=12000){
  const key='json:'+url;
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.time<CACHE_TTL)return hit.data;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 MatchScope/2.0'},signal:AbortSignal.timeout(timeoutMs)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const data=await r.json();
  cache.set(key,{time:Date.now(),data});
  return data;
}

function leagueByTsd(id){return FOOTBALL_LEAGUES.find(l=>String(l.id)===String(id));}
function leagueByEspn(slug){return FOOTBALL_LEAGUES.find(l=>l.espn===slug);}

function parseTsdEvent(ev,sport,forcedLeague=null){
  if(!ev?.strHomeTeam||!ev?.strAwayTeam)return null;
  const rawDate=ev.strTimestamp||(ev.dateEvent?`${ev.dateEvent}T${ev.strTime||'00:00:00'}Z`:null);
  const statusText=ev.strStatus||ev.strPostponed||'';
  const scoreA=ev.intHomeScore===''||ev.intHomeScore==null?null:String(ev.intHomeScore);
  const scoreB=ev.intAwayScore===''||ev.intAwayScore==null?null:String(ev.intAwayScore);
  let state='pre';
  if(scoreA!==null&&scoreB!==null)state='post';
  const s=String(statusText).toLowerCase();
  if(s.includes('live')||s.includes('progress')||s.includes('half')||s.includes('quarter')||s.includes('period'))state='in';
  const mapped=forcedLeague||leagueByTsd(ev.idLeague);
  return {
    id:'tsd-'+String(ev.idEvent||Math.random()),sourceId:String(ev.idEvent||''),sport,
    league:ev.strLeague||mapped?.name||ev.strLeagueAlternate||'Competition',
    leagueSlug:String(ev.idLeague||mapped?.id||''),espnLeague:mapped?.espn||null,
    teamIdA:ev.idHomeTeam?String(ev.idHomeTeam):null,teamIdB:ev.idAwayTeam?String(ev.idAwayTeam):null,
    date:rawDate,state,status:statusText||(state==='post'?'Завершён':''),
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
    league:source.name||ev?.league?.name||'Competition',
    leagueSlug:String(source.id||source.espn||''),espnLeague:source.espn||source.id||null,
    teamIdA:a?.team?.id?String(a.team.id):null,teamIdB:b?.team?.id?String(b.team.id):null,
    date:ev.date||comp.date||null,state:st.state||'pre',status:st.shortDetail||st.detail||st.description||'',
    a:displayName(a),b:displayName(b),logoA:logo(a),logoB:logo(b),scoreA:scoreValue(a),scoreB:scoreValue(b),
    recordA:record(a),recordB:record(b),venue:comp?.venue?.fullName||null,neutral:Boolean(comp?.neutralSite),source:'ESPN'
  };
}

async function fetchTsdLeague(league,date8){
  const url=`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${ymdDash(date8)}&l=${league.id}`;
  const data=await fetchJson(url);
  return {items:(data.events||[]).map(e=>parseTsdEvent(e,'football',league)).filter(Boolean),url};
}
async function fetchEspnLeague(league,date8){
  const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}/scoreboard?dates=${date8}&limit=200`;
  const data=await fetchJson(url,10000);
  return {items:(data.events||[]).map(e=>parseEspnEvent(e,league,'football')).filter(Boolean),url};
}
async function fetchFootballLeagueBundle(league,date8){
  const [tsd,espn]=await Promise.allSettled([fetchTsdLeague(league,date8),fetchEspnLeague(league,date8)]);
  const items=[...(tsd.status==='fulfilled'?tsd.value.items:[]),...(espn.status==='fulfilled'?espn.value.items:[])];
  return {items,diagnostic:{name:league.name,id:league.id,count:items.length,tsd:tsd.status==='fulfilled'?tsd.value.items.length:'ERR',espn:espn.status==='fulfilled'?espn.value.items.length:'ERR'}};
}
async function fetchOtherSport(source,date8){
  const date=ymdDash(date8);
  const jobs=[fetchJson(`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=${encodeURIComponent(source.query)}`)];
  if(source.espnSport&&source.espn)jobs.push(fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${source.espnSport}/${source.espn}/scoreboard?dates=${date8}&limit=200`,10000));
  const settled=await Promise.allSettled(jobs),items=[];
  if(settled[0]?.status==='fulfilled')items.push(...(settled[0].value.events||[]).map(e=>parseTsdEvent(e,source.sport)).filter(Boolean));
  if(settled[1]?.status==='fulfilled')items.push(...(settled[1].value.events||[]).map(e=>parseEspnEvent(e,{id:source.espn,name:source.name,espn:source.espn},source.sport)).filter(Boolean));
  return {items,diagnostic:{name:source.name,count:items.length,tsd:settled[0]?.status||'none',espn:settled[1]?.status||'none'}};
}
function dedupe(items){
  const map=new Map();
  for(const m of items){
    const k=`${m.sport}|${normalizeName(m.a)}|${normalizeName(m.b)}|${(m.date||'').slice(0,10)}|${m.espnLeague||m.leagueSlug}`;
    const prev=map.get(k);
    if(!prev){map.set(k,m);continue;}
    const merged={...prev,...m};
    if(prev.source==='TheSportsDB'&&m.source==='ESPN'){
      merged.logoA=prev.logoA||m.logoA;merged.logoB=prev.logoB||m.logoB;
      merged.teamIdA=m.teamIdA||prev.teamIdA;merged.teamIdB=m.teamIdB||prev.teamIdB;
      merged.leagueSlug=prev.leagueSlug||m.leagueSlug;merged.espnLeague=m.espnLeague||prev.espnLeague;
      merged.source='TheSportsDB + ESPN';
    }
    map.set(k,merged);
  }
  return [...map.values()];
}
async function getMatches(date8,sport='all',withDiagnostics=false){
  const key=`matches:${date8}:${sport}:${withDiagnostics}`;
  const hit=cache.get(key);if(hit&&Date.now()-hit.time<CACHE_TTL)return hit.data;
  const tasks=[];
  if(sport==='all'||sport==='football')FOOTBALL_LEAGUES.forEach(l=>tasks.push(fetchFootballLeagueBundle(l,date8)));
  OTHER_SPORTS.filter(s=>sport==='all'||s.sport===sport).forEach(s=>tasks.push(fetchOtherSport(s,date8)));
  const settled=await Promise.all(tasks);
  const matches=dedupe(settled.flatMap(x=>x.items)).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0));
  const footballLeagues=[...new Map(matches.filter(m=>m.sport==='football').map(m=>[m.leagueSlug,{id:m.leagueSlug,name:m.league}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const data={date:date8,sport,matches,footballLeagues,sourceCount:tasks.length,failedSources:settled.filter(x=>x.diagnostic?.count===0).length,updatedAt:new Date().toISOString(),providers:[...new Set(matches.map(x=>x.source))]};
  if(withDiagnostics)data.diagnostics=settled.map(x=>x.diagnostic);
  cache.set(key,{time:Date.now(),data});return data;
}

function teamFromTeamsPayload(data,name){
  const list=(data?.sports||[]).flatMap(s=>(s.leagues||[]).flatMap(l=>(l.teams||[]).map(x=>x.team||x)));
  const target=normalizeName(name);
  return list.find(t=>normalizeName(t.displayName)===target||normalizeName(t.name)===target||normalizeName(t.shortDisplayName)===target)
    ||list.find(t=>normalizeName(t.displayName).includes(target)||target.includes(normalizeName(t.displayName)));
}
async function resolveEspnTeam(league,name){
  const data=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams?limit=500`,10000);
  return teamFromTeamsPayload(data,name);
}
function completedTeamGames(schedule,teamId,beforeDate){
  const cutoff=new Date(beforeDate||Date.now());
  const out=[];
  for(const ev of schedule?.events||[]){
    const d=new Date(ev.date||0);if(!(d<cutoff))continue;
    const comp=ev?.competitions?.[0]||{},cs=comp.competitors||[];
    const me=cs.find(x=>String(x?.team?.id)===String(teamId));
    const opp=cs.find(x=>String(x?.team?.id)!==String(teamId));
    if(!me||!opp||me.score==null||opp.score==null)continue;
    const gf=scoreValue(me),ga=scoreValue(opp);if(gf==null||ga==null)continue;
    out.push({id:String(ev.id),date:ev.date,opponent:displayName(opp),gf,ga,result:gf>ga?'W':gf<ga?'L':'D',home:me.homeAway==='home'});
  }
  return out.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function date8Shift(date8,days){
  const d=new Date(Date.UTC(Number(date8.slice(0,4)),Number(date8.slice(4,6))-1,Number(date8.slice(6,8))));
  d.setUTCDate(d.getUTCDate()+days);
  return String(d.getUTCFullYear())+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0');
}
function completedFromParsedEvents(events,teamId,teamName,beforeDate){
  const cutoff=new Date(beforeDate||Date.now()),target=normalizeName(teamName),out=[];
  for(const m of events||[]){
    const d=new Date(m.date||0);if(!(d<cutoff))continue;
    let mineA=teamId&&String(m.teamIdA)===String(teamId);
    let mineB=teamId&&String(m.teamIdB)===String(teamId);
    if(!mineA&&!mineB){mineA=normalizeName(m.a)===target;mineB=normalizeName(m.b)===target;}
    if(!mineA&&!mineB||m.scoreA==null||m.scoreB==null)continue;
    const gf=Number(mineA?m.scoreA:m.scoreB),ga=Number(mineA?m.scoreB:m.scoreA);
    if(!Number.isFinite(gf)||!Number.isFinite(ga))continue;
    out.push({id:String(m.sourceId||m.id),date:m.date,opponent:mineA?m.b:m.a,gf,ga,result:gf>ga?'W':gf<ga?'L':'D',home:mineA});
  }
  return out.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
async function leagueHistoryRange(league,date8){
  const start=date8Shift(date8,-150);
  const cfg=leagueByEspn(league)||{name:league,espn:league,id:league};
  const data=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${start}-${date8}&limit=500`,15000);
  return (data.events||[]).map(e=>parseEspnEvent(e,cfg,'football')).filter(Boolean);
}
function summarizeForm(games){
  const sample=games.slice(0,8),n=sample.length||1;
  const wins=sample.filter(g=>g.result==='W').length,draws=sample.filter(g=>g.result==='D').length,losses=sample.filter(g=>g.result==='L').length;
  const gf=sample.reduce((s,g)=>s+g.gf,0),ga=sample.reduce((s,g)=>s+g.ga,0);
  const ppg=(wins*3+draws)/n,gfpg=gf/n,gapg=ga/n;
  const attack=clamp(50+gfpg*14+(ppg-1.3)*8,35,95);
  const defense=clamp(86-gapg*14+(ppg-1.3)*5,35,95);
  const form=clamp(38+ppg*20+(gfpg-gapg)*7,30,96);
  return {games:sample,wins,draws,losses,gf,ga,ppg:+ppg.toFixed(2),gfpg:+gfpg.toFixed(2),gapg:+gapg.toFixed(2),attack:Math.round(attack),defense:Math.round(defense),form:Math.round(form)};
}
function flattenStandings(data){
  const out=[];
  function walk(node){
    if(Array.isArray(node))return node.forEach(walk);
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node.standings?.entries))out.push(...node.standings.entries);
    if(Array.isArray(node.entries))out.push(...node.entries);
    if(Array.isArray(node.children))node.children.forEach(walk);
    if(Array.isArray(node.groups))node.groups.forEach(walk);
  }
  walk(data);
  const seen=new Set();
  return out.filter(e=>{const id=e?.team?.id||e?.team?.uid;if(!id||seen.has(id))return false;seen.add(id);return true;});
}
function statValue(entry,name){
  const s=(entry?.stats||[]).find(x=>x.name===name||x.abbreviation===name);return s?.value??s?.displayValue??null;
}
async function getStandings(league,season){
  try{
    const data=await fetchJson(`https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings?season=${season}`,10000);
    return flattenStandings(data).map((e,i)=>({
      rank:Number(statValue(e,'rank')||statValue(e,'RANK')||i+1),
      teamId:String(e?.team?.id||''),team:e?.team?.displayName||e?.team?.name||'Team',
      played:Number(statValue(e,'gamesPlayed')||statValue(e,'GP')||0),
      wins:Number(statValue(e,'wins')||statValue(e,'W')||0),draws:Number(statValue(e,'ties')||statValue(e,'D')||0),losses:Number(statValue(e,'losses')||statValue(e,'L')||0),
      points:Number(statValue(e,'points')||statValue(e,'PTS')||0),
      gf:Number(statValue(e,'pointsFor')||statValue(e,'GF')||0),ga:Number(statValue(e,'pointsAgainst')||statValue(e,'GA')||0)
    })).sort((a,b)=>a.rank-b.rank);
  }catch(e){return []}
}
function h2hFromSchedules(gamesA,teamBName){
  const target=normalizeName(teamBName);
  return gamesA.filter(g=>normalizeName(g.opponent)===target).slice(0,5);
}
function eloEstimate(form,standing,totalTeams){
  let elo=1500+(form.ppg-1.5)*120+(form.gfpg-form.gapg)*45;
  if(standing&&totalTeams>1)elo+=(0.5-(standing.rank-1)/(totalTeams-1))*140;
  return Math.round(clamp(elo,1200,1900));
}
function poissonPrediction(a,b,home=true,eloA=1500,eloB=1500){
  const eloAdj=(eloA-eloB)/400;
  let xga=1.18+(a.attack-b.defense)*.012+(a.form-b.form)*.005+(home ? .18 : 0)+eloAdj*.18;
  let xgb=1.05+(b.attack-a.defense)*.012+(b.form-a.form)*.005-eloAdj*.12;
  xga=clamp(xga,.25,3.8);xgb=clamp(xgb,.25,3.8);
  const fact=n=>{let v=1;for(let i=2;i<=n;i++)v*=i;return v};const pois=(k,l)=>Math.exp(-l)*Math.pow(l,k)/fact(k);
  let p1=0,px=0,p2=0,over=0,btts=0,scores=[];
  for(let i=0;i<=7;i++)for(let j=0;j<=7;j++){const p=pois(i,xga)*pois(j,xgb);scores.push([i,j,p]);if(i>j)p1+=p;else if(i===j)px+=p;else p2+=p;if(i+j>2)over+=p;if(i>0&&j>0)btts+=p}
  const s=p1+px+p2||1;scores.sort((x,y)=>y[2]-x[2]);
  return {p1:+(p1/s).toFixed(4),px:+(px/s).toFixed(4),p2:+(p2/s).toFixed(4),xgA:+xga.toFixed(2),xgB:+xgb.toFixed(2),over25:+over.toFixed(4),btts:+btts.toFixed(4),scores:scores.slice(0,4).map(x=>({score:`${x[0]}:${x[1]}`,p:+x[2].toFixed(4)}))};
}
async function matchIntelligence(league,teamAName,teamBName,targetDate){
  const season=Number(String(targetDate||new Date().getFullYear()).slice(0,4));
  const [teamA,teamB,standings]=await Promise.all([resolveEspnTeam(league,teamAName),resolveEspnTeam(league,teamBName),getStandings(league,season)]);
  if(!teamA||!teamB)throw new Error('Не удалось сопоставить одну из команд с ESPN');
  const [schA,schB]=await Promise.all([
    fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamA.id}/schedule?season=${season}`,10000),
    fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamB.id}/schedule?season=${season}`,10000)
  ]);
  const before=targetDate&&/^\d{8}$/.test(targetDate)?`${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}T23:59:59Z`:new Date().toISOString();
  let gamesA=completedTeamGames(schA,teamA.id,before),gamesB=completedTeamGames(schB,teamB.id,before);
  if(gamesA.length<3||gamesB.length<3){
    try{
      const [schA2,schB2]=await Promise.all([
        fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamA.id}/schedule`,10000),
        fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${teamB.id}/schedule`,10000)
      ]);
      if(gamesA.length<3)gamesA=completedTeamGames(schA2,teamA.id,before);
      if(gamesB.length<3)gamesB=completedTeamGames(schB2,teamB.id,before);
    }catch(e){}
  }
  if(gamesA.length<3||gamesB.length<3){
    try{
      const rangeEvents=await leagueHistoryRange(league,targetDate);
      if(gamesA.length<3)gamesA=completedFromParsedEvents(rangeEvents,teamA.id,teamA.displayName||teamAName,before);
      if(gamesB.length<3)gamesB=completedFromParsedEvents(rangeEvents,teamB.id,teamB.displayName||teamBName,before);
    }catch(e){}
  }
  const formA=summarizeForm(gamesA),formB=summarizeForm(gamesB);
  const standingA=standings.find(x=>String(x.teamId)===String(teamA.id)),standingB=standings.find(x=>String(x.teamId)===String(teamB.id));
  const eloA=eloEstimate(formA,standingA,standings.length),eloB=eloEstimate(formB,standingB,standings.length);
  const pred=poissonPrediction(formA,formB,true,eloA,eloB);
  return {
    league,season,generatedAt:new Date().toISOString(),
    teamA:{id:String(teamA.id),name:teamA.displayName||teamAName,logo:teamA.logos?.[0]?.href||teamA.logo||null,form:formA,standing:standingA||null,elo:eloA},
    teamB:{id:String(teamB.id),name:teamB.displayName||teamBName,logo:teamB.logos?.[0]?.href||teamB.logo||null,form:formB,standing:standingB||null,elo:eloB},
    h2h:h2hFromSchedules(gamesA,teamBName),prediction:pred,standings:standings.slice(0,24)
  };
}
async function eventResult(source,id,sport='football',league=''){
  if(source==='TheSportsDB'){
    const data=await fetchJson(`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${encodeURIComponent(id)}`);
    const ev=data?.events?.[0];if(!ev)return null;return parseTsdEvent(ev,sport,leagueByEspn(league));
  }
  if(!league)return null;
  const data=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${sport==='football'?'soccer':sport}/${league}/summary?event=${encodeURIComponent(id)}`,10000);
  const header=data?.header||{},ev={id,date:header.competitions?.[0]?.date,competitions:header.competitions,status:header.competitions?.[0]?.status};
  return parseEspnEvent(ev,{name:header.league?.name||league,espn:league,id:league},sport);
}

function ymdInMoscow(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}${map.month}${map.day}`;
}
async function startupDiagnostics(){
  try{
    const date=ymdInMoscow(0),data=await getMatches(date,'all',true);
    console.log('[startup-diagnostics]',JSON.stringify({date,total:data.matches.length,football:data.matches.filter(x=>x.sport==='football').length,leagues:data.footballLeagues}));
    const sample=data.matches.find(x=>x.sport==='football'&&x.espnLeague);
    if(sample){
      try{
        const intel=await matchIntelligence(sample.espnLeague,sample.a,sample.b,date);
        console.log('[intelligence-selftest]',JSON.stringify({ok:true,league:sample.espnLeague,match:sample.a+' vs '+sample.b,eloA:intel.teamA.elo,eloB:intel.teamB.elo,lastA:intel.teamA.form.games.length,lastB:intel.teamB.form.games.length,pred:intel.prediction}));
      }catch(e){console.log('[intelligence-selftest]',JSON.stringify({ok:false,match:sample.a+' vs '+sample.b,error:String(e?.message||e)}));}
    }
  }catch(e){console.log('[startup-diagnostics-error]',e?.stack||String(e));}
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){cors(res);res.writeHead(204);return res.end();}
  const u=new URL(req.url,`http://${req.headers.host}`);console.log('[request]',req.method,u.pathname,u.search);
  if(u.pathname==='/health')return send(res,200,{ok:true,time:new Date().toISOString()});
  if(u.pathname==='/api/matches'){
    const date=(u.searchParams.get('date')||'').replace(/\D/g,''),sport=u.searchParams.get('sport')||'all';
    if(!/^\d{8}$/.test(date))return send(res,400,{error:'date must be YYYYMMDD'});
    try{return send(res,200,await getMatches(date,sport,false));}catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)});}
  }
  if(u.pathname==='/api/intelligence'){
    const league=u.searchParams.get('league')||'',teamA=u.searchParams.get('teamA')||'',teamB=u.searchParams.get('teamB')||'',date=(u.searchParams.get('date')||ymdInMoscow(0)).replace(/\D/g,'');
    if(!league||!teamA||!teamB)return send(res,400,{error:'league, teamA and teamB required'});
    try{return send(res,200,await matchIntelligence(league,teamA,teamB,date));}catch(e){return send(res,502,{error:'intelligence unavailable',detail:String(e?.message||e)});}
  }
  if(u.pathname==='/api/standings'){
    const league=u.searchParams.get('league')||'',season=Number(u.searchParams.get('season')||new Date().getFullYear());
    if(!league)return send(res,400,{error:'league required'});
    return send(res,200,{league,season,standings:await getStandings(league,season)});
  }
  if(u.pathname==='/api/result'){
    const source=u.searchParams.get('source')||'',id=u.searchParams.get('id')||'',sport=u.searchParams.get('sport')||'football',league=u.searchParams.get('league')||'';
    try{return send(res,200,{event:await eventResult(source,id,sport,league)});}catch(e){return send(res,502,{error:'result unavailable',detail:String(e?.message||e)});}
  }
  if(u.pathname==='/api/debug'){
    const date=(u.searchParams.get('date')||ymdInMoscow(0)).replace(/\D/g,'');
    try{return send(res,200,await getMatches(date,'all',true));}catch(e){return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)});}
  }
  return send(res,200,{name:'MatchScope Live API 2.0',ok:true,footballLeagues:FOOTBALL_LEAGUES,providers:['TheSportsDB free','ESPN fallback'],endpoints:['/api/matches','/api/intelligence','/api/standings','/api/result']});
});
server.listen(PORT,()=>{console.log('MatchScope Live API 2.0 listening on',PORT);startupDiagnostics();});
