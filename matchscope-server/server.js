const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 10000;
const CACHE_TTL = 60 * 1000;
const cache = new Map();

const SOURCES = [
  { sport:'football', apiSport:'soccer', league:'eng.1', name:'Premier League' },
  { sport:'football', apiSport:'soccer', league:'esp.1', name:'LaLiga' },
  { sport:'football', apiSport:'soccer', league:'ita.1', name:'Serie A' },
  { sport:'football', apiSport:'soccer', league:'ger.1', name:'Bundesliga' },
  { sport:'football', apiSport:'soccer', league:'fra.1', name:'Ligue 1' },
  { sport:'football', apiSport:'soccer', league:'uefa.champions', name:'Champions League' },
  { sport:'football', apiSport:'soccer', league:'uefa.europa', name:'Europa League' },
  { sport:'football', apiSport:'soccer', league:'rus.1', name:'Russian Premier League' },
  { sport:'basketball', apiSport:'basketball', league:'nba', name:'NBA' },
  { sport:'hockey', apiSport:'hockey', league:'nhl', name:'NHL' },
  { sport:'tennis', apiSport:'tennis', league:'atp', name:'ATP' },
  { sport:'tennis', apiSport:'tennis', league:'wta', name:'WTA' }
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
function logo(c) {
  return c?.team?.logo || c?.athlete?.headshot?.href || null;
}
function record(c) {
  return c?.records?.[0]?.summary || null;
}

function parseEvent(ev, source) {
  const comp = ev?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  if (cs.length < 2) return null;
  let a = cs.find(x=>x.homeAway==='home') || cs[0];
  let b = cs.find(x=>x.homeAway==='away') || cs.find(x=>x!==a) || cs[1];
  const st = ev?.status?.type || {};
  return {
    id: String(ev.id),
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

async function fetchSource(source, date) {
  const bases = ['https://site.api.espn.com','https://site.web.api.espn.com'];
  let lastErr;
  for (const base of bases) {
    try {
      const url = `${base}/apis/site/v2/sports/${source.apiSport}/${source.league}/scoreboard?dates=${date}&limit=200`;
      const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 MatchScope/1.0'}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return (data.events || []).map(e=>parseEvent(e, source)).filter(Boolean);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('source failed');
}

async function getMatches(date, sport='all') {
  const key = `${date}:${sport}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  const selected = SOURCES.filter(s=>sport==='all' || s.sport===sport);
  const settled = await Promise.allSettled(selected.map(s=>fetchSource(s,date)));
  const matches = settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  const failed = settled.filter(x=>x.status==='rejected').length;
  matches.sort((x,y)=>new Date(x.date||0)-new Date(y.date||0));
  const data = {date,sport,matches,sourceCount:selected.length,failedSources:failed,updatedAt:new Date().toISOString()};
  cache.set(key,{time:Date.now(),data});
  return data;
}

const server = http.createServer(async (req,res)=>{
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === '/health') return send(res,200,{ok:true,time:new Date().toISOString()});
  if (u.pathname === '/api/matches') {
    const date = (u.searchParams.get('date') || '').replace(/\D/g,'');
    const sport = u.searchParams.get('sport') || 'all';
    if (!/^\d{8}$/.test(date)) return send(res,400,{error:'date must be YYYYMMDD'});
    try { return send(res,200,await getMatches(date,sport)); }
    catch(e){ return send(res,502,{error:'sports source unavailable',detail:String(e?.message||e)}); }
  }
  return send(res,200,{name:'MatchScope Live API',ok:true,endpoints:['/api/matches?date=YYYYMMDD&sport=all']});
});
server.listen(PORT,()=>console.log('MatchScope Live API listening on',PORT));