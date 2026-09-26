const LIVE_API='https://matchscope-live-api.onrender.com';

const DEMO_MATCHES=[
  {id:'demo-1',sport:'football',league:'Premier League',time:'18:30',a:'Arsenal',b:'Liverpool',p:[48,26,26],demo:true},
  {id:'demo-2',sport:'football',league:'LaLiga',time:'21:00',a:'Barcelona',b:'Sevilla',p:[62,22,16],demo:true},
  {id:'demo-3',sport:'basketball',league:'NBA',time:'22:30',a:'Boston',b:'Miami',p:[64,36],demo:true},
  {id:'demo-4',sport:'hockey',league:'NHL',time:'23:00',a:'Toronto',b:'Boston',p:[44,24,32],demo:true},
  {id:'demo-5',sport:'tennis',league:'ATP',time:'16:00',a:'Player A',b:'Player B',p:[57,43],demo:true}
];

let matches=[...DEMO_MATCHES];
let activeFilter='all';
let activeLeague='all';
let footballLeagues=[];
let dayOffset=0;
let liveMode=false;

const labels={football:'Футбол',basketball:'Баскетбол',hockey:'Хоккей',tennis:'Теннис'};
const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

function factorial(n){let v=1;for(let i=2;i<=n;i++)v*=i;return v}
function poisson(k,l){return Math.exp(-l)*Math.pow(l,k)/factorial(k)}

function seedFromRecord(summary,sport){
  const nums=String(summary||'').match(/\d+/g)?.map(Number)||[];
  if(!nums.length) return {atk:70,def:70,form:65};
  const wins=nums[0]||0;
  const draws=sport==='football'&&nums.length>=3?(nums[1]||0):0;
  const losses=sport==='football'&&nums.length>=3?(nums[2]||0):(nums.slice(1).reduce((a,b)=>a+b,0));
  const games=Math.max(1,wins+draws+losses);
  const winRate=wins/games, drawRate=draws/games, lossRate=losses/games;
  return {
    atk:Math.round(clamp(56+winRate*34+drawRate*6,50,92)),
    def:Math.round(clamp(56+(1-lossRate)*28,50,92)),
    form:Math.round(clamp(42+winRate*46+drawRate*12,40,94))
  };
}

function footballMath(a,b,home){
  const homeBoost=home?0.18:0;
  let xga=1.15+(a.atk-b.def)*0.012+(a.form-b.form)*0.006+homeBoost;
  let xgb=1.05+(b.atk-a.def)*0.012+(b.form-a.form)*0.006;
  xga=clamp(xga,.25,3.8);xgb=clamp(xgb,.25,3.8);
  let homeP=0,draw=0,awayP=0,over=0,btts=0,scores=[];
  for(let i=0;i<=7;i++)for(let j=0;j<=7;j++){
    const p=poisson(i,xga)*poisson(j,xgb);
    scores.push([i,j,p]);
    if(i>j)homeP+=p;else if(i===j)draw+=p;else awayP+=p;
    if(i+j>2)over+=p;if(i>0&&j>0)btts+=p;
  }
  const sum=homeP+draw+awayP||1;
  scores.sort((x,y)=>y[2]-x[2]);
  return {main:[homeP/sum,draw/sum,awayP/sum],xga,xgb,over,btts,scores:scores.slice(0,3)};
}

function twoWayMath(a,b,sport,home){
  let d=(a.atk-b.atk)*0.045+(a.def-b.def)*0.025+(a.form-b.form)*0.04+(home?0.14:0);
  let p=1/(1+Math.exp(-d));p=clamp(p,.08,.92);
  if(sport==='basketball'){
    const base=108;
    return {main:[p,1-p],score:[Math.round(base+(a.atk-b.def)*.18+(home?4:0)),Math.round(base+(b.atk-a.def)*.18)],total:Math.round((base*2+(a.atk+b.atk-a.def-b.def)*.12)*10)/10};
  }
  let sets=p>.5?'2:1':'1:2';
  if(Math.abs(p-.5)>.22)sets=p>.5?'2:0':'0:2';
  return {main:[p,1-p],sets};
}

function hockeyMath(a,b,home){
  const base=2.55;
  const ga=clamp(base+(a.atk-b.def)*.028+(a.form-b.form)*.01+(home?.18:0),.8,5.5);
  const gb=clamp(base+(b.atk-a.def)*.028+(b.form-a.form)*.01,.8,5.5);
  let h=0,d=0,aw=0;
  for(let i=0;i<=9;i++)for(let j=0;j<=9;j++){
    const p=poisson(i,ga)*poisson(j,gb);
    if(i>j)h+=p;else if(i===j)d+=p;else aw+=p;
  }
  const s=h+d+aw||1;
  return {main:[h/s,d/s,aw/s],ga,gb,total:ga+gb};
}

function previewForMatch(m){
  if(Array.isArray(m.p)) return m.p;
  const a=seedFromRecord(m.recordA,m.sport);
  const b=seedFromRecord(m.recordB,m.sport);
  const home=!m.neutral&&m.sport!=='tennis';
  if(m.sport==='football') return footballMath(a,b,home).main.map(x=>Math.round(x*100));
  if(m.sport==='hockey') return hockeyMath(a,b,home).main.map(x=>Math.round(x*100));
  return twoWayMath(a,b,m.sport,home).main.map(x=>Math.round(x*100));
}

function formatMatchTime(m){
  if(m.date){
    const d=new Date(m.date);
    if(!Number.isNaN(d.getTime())) return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  return m.time||'—';
}

function scoreText(m){
  if(m.scoreA==null||m.scoreB==null||m.state==='pre') return '';
  return `${escapeHTML(m.scoreA)} : ${escapeHTML(m.scoreB)}`;
}

function renderMatches(filter=activeFilter){
  activeFilter=filter;
  const el=$('matchGrid');
  const list=matches.filter(m=>(filter==='all'||m.sport===filter)&&(activeLeague==='all'||m.sport!=='football'||String(m.leagueSlug)===String(activeLeague)));
  if(!list.length){
    el.innerHTML='<div class="empty matches-empty">На выбранную дату матчей в подключённых турнирах не найдено.</div>';
    return;
  }
  el.innerHTML='';
  list.forEach(m=>{
    const p=previewForMatch(m);
    const probs=p.length===3
      ?`<div class="mini-probs"><span>1 · ${p[0]}%</span><span>${m.sport==='hockey'?'X/OT':'X'} · ${p[1]}%</span><span>2 · ${p[2]}%</span></div>`
      :`<div class="mini-probs" style="grid-template-columns:1fr 1fr"><span>1 · ${p[0]}%</span><span>2 · ${p[1]}%</span></div>`;
    const stateClass=m.state==='in'?' live-now':'';
    const badge=m.demo?'<span class="source-badge">DEMO</span>':m.state==='in'?'<span class="source-badge live">● LIVE</span>':'<span class="source-badge live">REAL DATA</span>';
    const status=m.state==='in'?'<span class="match-status-live">'+escapeHTML(m.status||'LIVE')+'</span>':escapeHTML(m.status||formatMatchTime(m));
    const logoA=m.logoA?`<img src="${escapeHTML(m.logoA)}" alt="" onerror="this.style.display='none'">`:'';
    const logoB=m.logoB?`<img src="${escapeHTML(m.logoB)}" alt="" onerror="this.style.display='none'">`:'';
    const score=scoreText(m);
    el.insertAdjacentHTML('beforeend',`<article class="match-card${stateClass}">
      <div class="match-top"><span>${escapeHTML(labels[m.sport]||m.sport)} · ${escapeHTML(m.league)}</span>${badge}</div>
      <h3>${escapeHTML(m.a)} — ${escapeHTML(m.b)}</h3>
      <div class="teams">
        <div class="scoreline"><div class="team-ident">${logoA}<span>${escapeHTML(m.a)}</span></div><b class="match-score">${score?escapeHTML(m.scoreA):''}</b></div>
        <div class="scoreline"><div class="team-ident">${logoB}<span>${escapeHTML(m.b)}</span></div><b class="match-score">${score?escapeHTML(m.scoreB):''}</b></div>
      </div>
      <div class="match-top" style="margin-top:12px"><span>${status}</span><span>${escapeHTML(formatMatchTime(m))}</span></div>
      ${probs}
      <button class="secondary analyze-match" data-id="${escapeHTML(m.id)}">Открыть анализ</button>
    </article>`);
  });
  document.querySelectorAll('.analyze-match').forEach(btn=>btn.onclick=()=>loadMatch(btn.dataset.id));
}

function setSlider(id,val){
  const e=$(id),l=$(id+'Label');
  e.value=String(Math.round(clamp(val,+e.min,+e.max)));
  l.textContent=e.value;
}

function loadMatch(id){
  const m=matches.find(x=>String(x.id)===String(id));
  if(!m)return;
  $('sport').value=m.sport;
  $('teamA').value=m.a;
  $('teamB').value=m.b;
  const sa=seedFromRecord(m.recordA,m.sport),sb=seedFromRecord(m.recordB,m.sport);
  setSlider('atkA',sa.atk);setSlider('defA',sa.def);setSlider('formA',sa.form);
  setSlider('atkB',sb.atk);setSlider('defB',sb.def);setSlider('formB',sb.form);
  $('homeAdv').checked=!m.neutral&&m.sport!=='tennis';
  calc(false);
  $('analyzer').scrollIntoView({behavior:'smooth'});
}

function readInputs(){
  return {
    a:{atk:+$('atkA').value,def:+$('defA').value,form:+$('formA').value},
    b:{atk:+$('atkB').value,def:+$('defB').value,form:+$('formB').value}
  };
}

function factorHTML(name,val){
  return `<div class="factor"><div><b>${escapeHTML(name)}</b><br><small>${val>=0?'+':''}${val.toFixed(1)} условных пунктов</small></div><div class="factorbar"><i style="width:${clamp(Math.abs(val)*7,8,100)}%"></i></div></div>`;
}

function calc(save=true){
  const sport=$('sport').value;
  const A=$('teamA').value.trim()||'Команда 1',B=$('teamB').value.trim()||'Команда 2';
  const {a,b}=readInputs();
  $('outA').textContent=A;$('outB').textContent=B;$('sportName').textContent=labels[sport];
  let main='',secondary='',summary='';
  const dif=(a.atk-b.atk)*.35+(a.def-b.def)*.2+(a.form-b.form)*.3+($('homeAdv').checked?4:0);
  const conf=clamp(50+Math.abs(dif)*1.1,52,91);
  $('confidence').textContent=`${conf<62?'Низкая':conf<76?'Средняя':'Высокая'} уверенность · ${Math.round(conf)}%`;

  if(sport==='football'){
    const r=footballMath(a,b,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    main=`<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>${p[0]}%</strong></div><div class="outcome"><small>Ничья</small><strong>${p[1]}%</strong></div><div class="outcome"><small>П2</small><strong>${p[2]}%</strong></div></div>`;
    secondary=`<div class="metric"><span>Ожидаемые голы</span><b>${escapeHTML(A)}: ${r.xga.toFixed(2)} · ${escapeHTML(B)}: ${r.xgb.toFixed(2)}</b></div><div class="metric"><span>ТБ 2.5</span><b>${Math.round(r.over*100)}%</b></div><div class="metric"><span>Обе забьют</span><b>${Math.round(r.btts*100)}%</b></div><div class="metric"><span>Вероятные счета</span><b>${r.scores.map(s=>s[0]+':'+s[1]).join(' · ')}</b></div>`;
    summary=`${p[0]}% / ${p[1]}% / ${p[2]}%`;
  }else if(sport==='hockey'){
    const r=hockeyMath(a,b,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    main=`<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>${p[0]}%</strong></div><div class="outcome"><small>X / OT</small><strong>${p[1]}%</strong></div><div class="outcome"><small>П2</small><strong>${p[2]}%</strong></div></div>`;
    secondary=`<div class="metric"><span>Ожидаемые шайбы</span><b>${r.ga.toFixed(1)} — ${r.gb.toFixed(1)}</b></div><div class="metric"><span>Ожидаемый тотал</span><b>${r.total.toFixed(1)}</b></div>`;
    summary=`${p[0]}% / ${p[1]}% / ${p[2]}%`;
  }else{
    const r=twoWayMath(a,b,sport,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    main=`<div class="outcome-grid" style="grid-template-columns:1fr 1fr"><div class="outcome"><small>${escapeHTML(A)}</small><strong>${p[0]}%</strong></div><div class="outcome"><small>${escapeHTML(B)}</small><strong>${p[1]}%</strong></div></div>`;
    secondary=sport==='basketball'
      ?`<div class="metric"><span>Ожидаемый счёт</span><b>${r.score[0]} : ${r.score[1]}</b></div><div class="metric"><span>Ожидаемый тотал</span><b>${r.total}</b></div>`
      :`<div class="metric"><span>Вероятный счёт по сетам</span><b>${r.sets}</b></div><div class="metric"><span>Разница вероятностей</span><b>${Math.abs(p[0]-p[1])} п.п.</b></div>`;
    summary=`${p[0]}% / ${p[1]}%`;
  }

  $('primaryResult').innerHTML=main;
  $('secondaryResult').innerHTML=secondary;
  $('factors').innerHTML=factorHTML('Разница атаки',(a.atk-b.atk)/5)+factorHTML('Разница защиты',(a.def-b.def)/5)+factorHTML('Текущая форма',(a.form-b.form)/5)+factorHTML('Домашний фактор',$('homeAdv').checked?2.5:0);

  if(save){
    const h=JSON.parse(localStorage.getItem('ms_history')||'[]');
    h.unshift({date:new Date().toLocaleString('ru-RU'),sport:labels[sport],match:`${A} — ${B}`,summary});
    localStorage.setItem('ms_history',JSON.stringify(h.slice(0,30)));
    renderHistory();
  }
}

function renderHistory(){
  const h=JSON.parse(localStorage.getItem('ms_history')||'[]'),el=$('historyList');
  if(!h.length){el.innerHTML='<div class="empty">История пока пуста. Сделайте расчёт в анализаторе.</div>';return}
  el.innerHTML=h.map(x=>`<div class="history-item"><div><b>${escapeHTML(x.match)}</b><br><small>${escapeHTML(x.date)}</small></div><div>${escapeHTML(x.sport)}</div><div><b>${escapeHTML(x.summary)}</b></div></div>`).join('');
}

function dateKey(offset=0){
  const d=new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+offset);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function setLiveStatus(type,text){
  $('liveDot').className='live-dot '+type;
  $('liveStatus').textContent=text;
}
function renderLeagueFilter(){
  const wrap=$('leagueFilterWrap'),select=$('leagueFilter');
  if(!wrap||!select)return;
  wrap.style.display=activeFilter==='football'||activeFilter==='all'?'flex':'none';
  const previous=activeLeague;
  select.innerHTML='<option value="all">Все футбольные лиги</option>'+footballLeagues.map(l=>'<option value="'+escapeHTML(l.id)+'">'+escapeHTML(l.name)+'</option>').join('');
  if(footballLeagues.some(l=>String(l.id)===String(previous)))select.value=previous;
  else{activeLeague='all';select.value='all';}
}

async function loadLiveMatches(offset=dayOffset){
  dayOffset=offset;
  $('todayBtn').classList.toggle('active',offset===0);
  $('tomorrowBtn').classList.toggle('active',offset===1);
  setLiveStatus('loading','Получаем реальные матчи…');
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    const resp=await fetch(`${LIVE_API}/api/matches?date=${dateKey(offset)}&sport=all`,{cache:'no-store',signal:controller.signal});
    clearTimeout(timer);
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const data=await resp.json();
    liveMode=true;
    matches=(data.matches||[]).map((m,i)=>({...m,id:`live-${m.sport}-${m.leagueSlug||'league'}-${m.id||i}`,demo:false}));
    footballLeagues=data.footballLeagues||[];
    renderLeagueFilter();
    renderMatches(activeFilter);
    const failed=data.failedSources||0;
    setLiveStatus('ok',`Реальные данные · ${matches.length} матчей${failed?' · '+failed+' источн. временно недоступно':''}`);
  }catch(err){
    liveMode=false;
    matches=[...DEMO_MATCHES];
    renderMatches(activeFilter);
    setLiveStatus('error','Live-источник недоступен — показан резерв DEMO');
  }
}

['atkA','atkB','defA','defB','formA','formB'].forEach(id=>{
  const e=$(id),l=$(id+'Label');
  e.oninput=()=>{l.textContent=e.value;calc(false)};
});
$('sport').onchange=()=>calc(false);
$('homeAdv').onchange=()=>calc(false);
$('calcBtn').onclick=()=>calc(true);
$('clearHistory').onclick=()=>{localStorage.removeItem('ms_history');renderHistory()};
$('themeBtn').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('ms_theme',document.body.classList.contains('light')?'light':'dark')};
$('todayBtn').onclick=()=>loadLiveMatches(0);
$('tomorrowBtn').onclick=()=>loadLiveMatches(1);
$('refreshLive').onclick=()=>loadLiveMatches(dayOffset);
$('leagueFilter').onchange=()=>{activeLeague=$('leagueFilter').value;renderMatches(activeFilter)};

if(localStorage.getItem('ms_theme')==='light')document.body.classList.add('light');

document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>$(b.dataset.scroll).scrollIntoView({behavior:'smooth'}));
document.querySelectorAll('.filter[data-filter]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filter[data-filter]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  activeFilter=b.dataset.filter;
  if(activeFilter!=='football'&&activeFilter!=='all')activeLeague='all';
  renderLeagueFilter();
  renderMatches(activeFilter);
});

renderLeagueFilter();
renderMatches();
renderHistory();
calc(false);
loadLiveMatches(0);
