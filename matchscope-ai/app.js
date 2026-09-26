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
let selectedCenterMatch=null;

const labels={football:'Футбол',basketball:'Баскетбол',hockey:'Хоккей',tennis:'Теннис'};
const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

function factorial(n){let v=1;for(let i=2;i<=n;i++)v*=i;return v}
function poisson(k,l){return Math.exp(-l)*Math.pow(l,k)/factorial(k)}

function seedFromRecord(summary,sport){
  const nums=String(summary||'').match(/\d+/g)?.map(Number)||[];
  if(!nums.length)return {atk:70,def:70,form:65};
  const wins=nums[0]||0;
  const draws=sport==='football'&&nums.length>=3?(nums[1]||0):0;
  const losses=sport==='football'&&nums.length>=3?(nums[2]||0):nums.slice(1).reduce((a,b)=>a+b,0);
  const games=Math.max(1,wins+draws+losses);
  const wr=wins/games,dr=draws/games,lr=losses/games;
  return {
    atk:Math.round(clamp(56+wr*34+dr*6,50,92)),
    def:Math.round(clamp(56+(1-lr)*28,50,92)),
    form:Math.round(clamp(42+wr*46+dr*12,40,94))
  };
}

function footballMath(a,b,home){
  const boost=home?0.18:0;
  let xga=1.15+(a.atk-b.def)*0.012+(a.form-b.form)*0.006+boost;
  let xgb=1.05+(b.atk-a.def)*0.012+(b.form-a.form)*0.006;
  xga=clamp(xga,.25,3.8);xgb=clamp(xgb,.25,3.8);
  let p1=0,px=0,p2=0,over=0,btts=0,scores=[];
  for(let i=0;i<=7;i++)for(let j=0;j<=7;j++){
    const p=poisson(i,xga)*poisson(j,xgb);
    scores.push([i,j,p]);
    if(i>j)p1+=p;else if(i===j)px+=p;else p2+=p;
    if(i+j>2)over+=p;if(i>0&&j>0)btts+=p;
  }
  const sum=p1+px+p2||1;
  scores.sort((a,b)=>b[2]-a[2]);
  return {main:[p1/sum,px/sum,p2/sum],xga,xgb,over,btts,scores:scores.slice(0,4)};
}

function twoWayMath(a,b,sport,home){
  let d=(a.atk-b.atk)*0.045+(a.def-b.def)*0.025+(a.form-b.form)*0.04+(home?0.14:0);
  let p=1/(1+Math.exp(-d));p=clamp(p,.08,.92);
  if(sport==='basketball'){
    const base=108;
    return {
      main:[p,1-p],
      score:[Math.round(base+(a.atk-b.def)*.18+(home?4:0)),Math.round(base+(b.atk-a.def)*.18)],
      total:Math.round((base*2+(a.atk+b.atk-a.def-b.def)*.12)*10)/10
    };
  }
  let sets=p>.5?'2:1':'1:2';
  if(Math.abs(p-.5)>.22)sets=p>.5?'2:0':'0:2';
  return {main:[p,1-p],sets};
}

function hockeyMath(a,b,home){
  const base=2.55;
  const ga=clamp(base+(a.atk-b.def)*.028+(a.form-b.form)*.01+(home?.18:0),.8,5.5);
  const gb=clamp(base+(b.atk-a.def)*.028+(b.form-a.form)*.01,.8,5.5);
  let p1=0,px=0,p2=0;
  for(let i=0;i<=9;i++)for(let j=0;j<=9;j++){
    const p=poisson(i,ga)*poisson(j,gb);
    if(i>j)p1+=p;else if(i===j)px+=p;else p2+=p;
  }
  const s=p1+px+p2||1;
  return {main:[p1/s,px/s,p2/s],ga,gb,total:ga+gb};
}

function previewForMatch(m){
  if(Array.isArray(m.p))return m.p;
  const a=seedFromRecord(m.recordA,m.sport),b=seedFromRecord(m.recordB,m.sport);
  const home=!m.neutral&&m.sport!=='tennis';
  if(m.sport==='football')return footballMath(a,b,home).main.map(x=>Math.round(x*100));
  if(m.sport==='hockey')return hockeyMath(a,b,home).main.map(x=>Math.round(x*100));
  return twoWayMath(a,b,m.sport,home).main.map(x=>Math.round(x*100));
}

function uncertaintyScore(m){
  const probs=previewForMatch(m).map(x=>Math.max(.0001,x/100));
  const h=-probs.reduce((s,p)=>s+p*Math.log(p),0);
  return Math.round(clamp(h/Math.log(probs.length)*100,0,100));
}

function formatMatchTime(m){
  if(m.date){
    const d=new Date(m.date);
    if(!Number.isNaN(d.getTime()))return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  return m.time||'—';
}

function renderMatches(filter=activeFilter){
  activeFilter=filter;
  const list=matches.filter(m=>(filter==='all'||m.sport===filter)&&(activeLeague==='all'||m.sport!=='football'||String(m.leagueSlug)===String(activeLeague)));
  const el=$('matchGrid');
  if(!list.length){
    el.innerHTML='<div class="empty matches-empty">На выбранную дату матчей в подключённых турнирах не найдено.</div>';
    renderUncertainty();
    return;
  }
  el.innerHTML='';
  list.forEach(m=>{
    const p=previewForMatch(m);
    const probs=p.length===3
      ?'<div class="mini-probs"><span>1 · '+p[0]+'%</span><span>'+(m.sport==='hockey'?'X/OT':'X')+' · '+p[1]+'%</span><span>2 · '+p[2]+'%</span></div>'
      :'<div class="mini-probs" style="grid-template-columns:1fr 1fr"><span>1 · '+p[0]+'%</span><span>2 · '+p[1]+'%</span></div>';
    const badge=m.demo?'<span class="source-badge">DEMO</span>':m.state==='in'?'<span class="source-badge live">● LIVE</span>':'<span class="source-badge live">REAL DATA</span>';
    const logoA=m.logoA?'<img src="'+escapeHTML(m.logoA)+'" alt="" onerror="this.style.display=\'none\'">':'';
    const logoB=m.logoB?'<img src="'+escapeHTML(m.logoB)+'" alt="" onerror="this.style.display=\'none\'">':'';
    const scoreA=m.state!=='pre'&&m.scoreA!=null?escapeHTML(m.scoreA):'';
    const scoreB=m.state!=='pre'&&m.scoreB!=null?escapeHTML(m.scoreB):'';
    el.insertAdjacentHTML('beforeend','<article class="match-card'+(m.state==='in'?' live-now':'')+'">'+
      '<div class="match-top"><span>'+escapeHTML(labels[m.sport]||m.sport)+' · '+escapeHTML(m.league)+'</span>'+badge+'</div>'+
      '<h3>'+escapeHTML(m.a)+' — '+escapeHTML(m.b)+'</h3>'+
      '<div class="teams">'+
        '<div class="scoreline"><div class="team-ident">'+logoA+'<span>'+escapeHTML(m.a)+'</span></div><b class="match-score">'+scoreA+'</b></div>'+
        '<div class="scoreline"><div class="team-ident">'+logoB+'<span>'+escapeHTML(m.b)+'</span></div><b class="match-score">'+scoreB+'</b></div>'+
      '</div>'+
      '<div class="match-top" style="margin-top:12px"><span>'+escapeHTML(m.status||'')+'</span><span>'+escapeHTML(formatMatchTime(m))+'</span></div>'+
      probs+
      '<div class="uncertainty-chip">Неопределённость <b>'+uncertaintyScore(m)+'/100</b></div>'+
      '<button class="secondary center-match" data-id="'+escapeHTML(m.id)+'">Открыть Match Center</button>'+
    '</article>');
  });
  document.querySelectorAll('.center-match').forEach(btn=>btn.onclick=()=>openMatchCenter(btn.dataset.id));
  renderUncertainty();
}

function renderUncertainty(){
  const el=$('uncertaintyList');if(!el)return;
  const list=matches.filter(m=>!m.demo).map(m=>({m,score:uncertaintyScore(m)})).sort((a,b)=>b.score-a.score).slice(0,10);
  if(!list.length){el.innerHTML='<div class="intel-empty">Реальные матчи ещё не загружены.</div>';return}
  el.innerHTML=list.map((x,i)=>'<button class="uncertainty-row" data-id="'+escapeHTML(x.m.id)+'">'+
    '<span class="rank-num">'+(i+1)+'</span><span><b>'+escapeHTML(x.m.a)+' — '+escapeHTML(x.m.b)+'</b><small>'+escapeHTML(x.m.league)+' · '+escapeHTML(formatMatchTime(x.m))+'</small></span>'+
    '<strong>'+x.score+'</strong></button>').join('');
  el.querySelectorAll('.uncertainty-row').forEach(btn=>btn.onclick=()=>openMatchCenter(btn.dataset.id));
}

function renderLeagueFilter(){
  const wrap=$('leagueFilterWrap'),select=$('leagueFilter');
  if(!wrap||!select)return;
  wrap.style.display=activeFilter==='football'||activeFilter==='all'?'flex':'none';
  const prev=activeLeague;
  select.innerHTML='<option value="all">Все футбольные лиги</option>'+footballLeagues.map(l=>'<option value="'+escapeHTML(l.id)+'">'+escapeHTML(l.name)+'</option>').join('');
  if(footballLeagues.some(l=>String(l.id)===String(prev)))select.value=prev;
  else{activeLeague='all';select.value='all'}
}

function setSlider(id,val){
  const e=$(id),l=$(id+'Label');
  e.value=String(Math.round(clamp(val,+e.min,+e.max)));
  l.textContent=e.value;
}

function fillAnalyzerFromMatch(m){
  if(!m)return;
  $('sport').value=m.sport;
  $('teamA').value=m.a;$('teamB').value=m.b;
  const sa=seedFromRecord(m.recordA,m.sport),sb=seedFromRecord(m.recordB,m.sport);
  setSlider('atkA',sa.atk);setSlider('defA',sa.def);setSlider('formA',sa.form);
  setSlider('atkB',sb.atk);setSlider('defB',sb.def);setSlider('formB',sb.form);
  $('homeAdv').checked=!m.neutral&&m.sport!=='tennis';
  calc(false);
}

function readInputs(){
  return {
    a:{atk:+$('atkA').value,def:+$('defA').value,form:+$('formA').value},
    b:{atk:+$('atkB').value,def:+$('defB').value,form:+$('formB').value}
  };
}

function factorHTML(name,val){
  return '<div class="factor"><div><b>'+escapeHTML(name)+'</b><br><small>'+(val>=0?'+':'')+val.toFixed(1)+' условных пунктов</small></div><div class="factorbar"><i style="width:'+clamp(Math.abs(val)*7,8,100)+'%"></i></div></div>';
}

function calc(save=true){
  const sport=$('sport').value,A=$('teamA').value.trim()||'Команда 1',B=$('teamB').value.trim()||'Команда 2';
  const {a,b}=readInputs();
  $('outA').textContent=A;$('outB').textContent=B;$('sportName').textContent=labels[sport];
  let main='',secondary='',summary='',probsForHistory=null;
  const dif=(a.atk-b.atk)*.35+(a.def-b.def)*.2+(a.form-b.form)*.3+($('homeAdv').checked?4:0);
  const conf=clamp(50+Math.abs(dif)*1.1,52,91);
  $('confidence').textContent=(conf<62?'Низкая':conf<76?'Средняя':'Высокая')+' уверенность · '+Math.round(conf)+'%';

  if(sport==='football'){
    const r=footballMath(a,b,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    probsForHistory=r.main;
    main='<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>'+p[0]+'%</strong></div><div class="outcome"><small>Ничья</small><strong>'+p[1]+'%</strong></div><div class="outcome"><small>П2</small><strong>'+p[2]+'%</strong></div></div>';
    secondary='<div class="metric"><span>Ожидаемые голы</span><b>'+escapeHTML(A)+': '+r.xga.toFixed(2)+' · '+escapeHTML(B)+': '+r.xgb.toFixed(2)+'</b></div>'+
      '<div class="metric"><span>ТБ 2.5</span><b>'+Math.round(r.over*100)+'%</b></div>'+
      '<div class="metric"><span>Обе забьют</span><b>'+Math.round(r.btts*100)+'%</b></div>'+
      '<div class="metric"><span>Вероятные счета</span><b>'+r.scores.map(s=>s[0]+':'+s[1]).join(' · ')+'</b></div>';
    summary=p[0]+'% / '+p[1]+'% / '+p[2]+'%';
  }else if(sport==='hockey'){
    const r=hockeyMath(a,b,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    main='<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>'+p[0]+'%</strong></div><div class="outcome"><small>X / OT</small><strong>'+p[1]+'%</strong></div><div class="outcome"><small>П2</small><strong>'+p[2]+'%</strong></div></div>';
    secondary='<div class="metric"><span>Ожидаемые шайбы</span><b>'+r.ga.toFixed(1)+' — '+r.gb.toFixed(1)+'</b></div><div class="metric"><span>Ожидаемый тотал</span><b>'+r.total.toFixed(1)+'</b></div>';
    summary=p[0]+'% / '+p[1]+'% / '+p[2]+'%';
  }else{
    const r=twoWayMath(a,b,sport,$('homeAdv').checked),p=r.main.map(x=>Math.round(x*100));
    main='<div class="outcome-grid" style="grid-template-columns:1fr 1fr"><div class="outcome"><small>'+escapeHTML(A)+'</small><strong>'+p[0]+'%</strong></div><div class="outcome"><small>'+escapeHTML(B)+'</small><strong>'+p[1]+'%</strong></div></div>';
    secondary=sport==='basketball'
      ?'<div class="metric"><span>Ожидаемый счёт</span><b>'+r.score[0]+' : '+r.score[1]+'</b></div><div class="metric"><span>Ожидаемый тотал</span><b>'+r.total+'</b></div>'
      :'<div class="metric"><span>Вероятный счёт по сетам</span><b>'+r.sets+'</b></div><div class="metric"><span>Разница вероятностей</span><b>'+Math.abs(p[0]-p[1])+' п.п.</b></div>';
    summary=p[0]+'% / '+p[1]+'%';
  }
  $('primaryResult').innerHTML=main;$('secondaryResult').innerHTML=secondary;
  $('factors').innerHTML=factorHTML('Разница атаки',(a.atk-b.atk)/5)+factorHTML('Разница защиты',(a.def-b.def)/5)+factorHTML('Текущая форма',(a.form-b.form)/5)+factorHTML('Домашний фактор',$('homeAdv').checked?2.5:0);

  if(save){
    const h=JSON.parse(localStorage.getItem('ms_history')||'[]');
    h.unshift({
      date:new Date().toLocaleString('ru-RU'),createdAt:new Date().toISOString(),sport:labels[sport],sportKey:sport,
      match:A+' — '+B,summary,probabilities:probsForHistory,
      sourceId:selectedCenterMatch?.sourceId||null,
      resultSource:selectedCenterMatch?.espnLeague&&selectedCenterMatch?.sourceId?'ESPN':(selectedCenterMatch?.sourceId?'TheSportsDB':null),
      espnLeague:selectedCenterMatch?.espnLeague||null,eventDate:selectedCenterMatch?.date||null,verified:false
    });
    localStorage.setItem('ms_history',JSON.stringify(h.slice(0,30)));renderHistory();
  }
}

function scorePrediction(entry){
  if(!entry.probabilities||entry.actual==null)return '';
  const p=entry.probabilities.map(Number),actual=entry.actual,targets=[actual===0?1:0,actual===1?1:0,actual===2?1:0];
  const brier=p.reduce((s,x,i)=>s+Math.pow(x-targets[i],2),0)/3;
  const logloss=-Math.log(Math.max(.001,p[actual]||.001));
  return '<small>Brier '+brier.toFixed(3)+' · LogLoss '+logloss.toFixed(3)+'</small>';
}

function renderHistory(){
  const h=JSON.parse(localStorage.getItem('ms_history')||'[]'),el=$('historyList');
  if(!h.length){el.innerHTML='<div class="empty">История пока пуста. Сделайте расчёт в анализаторе.</div>';updateModelStats(h);return}
  el.innerHTML=h.map(x=>'<div class="history-item"><div><b>'+escapeHTML(x.match)+'</b><br><small>'+escapeHTML(x.date)+'</small></div><div>'+escapeHTML(x.sport)+(x.verified?'<br><span class="verified-badge">'+(x.correct?'✓ исход совпал':'результат проверен')+'</span>':'')+'</div><div><b>'+escapeHTML(x.summary)+'</b><br>'+scorePrediction(x)+'</div></div>').join('');
  updateModelStats(h);
}

function updateModelStats(h){
  const verified=h.filter(x=>x.verified&&Array.isArray(x.probabilities)&&x.actual!=null);
  if(!$('brierValue'))return;
  if(!verified.length){$('brierValue').textContent='—';$('loglossValue').textContent='—';$('verifiedValue').textContent='0';return}
  let bs=0,ll=0;
  verified.forEach(x=>{const t=[x.actual===0?1:0,x.actual===1?1:0,x.actual===2?1:0];bs+=x.probabilities.reduce((s,p,i)=>s+Math.pow(p-t[i],2),0)/3;ll+=-Math.log(Math.max(.001,x.probabilities[x.actual]||.001))});
  $('brierValue').textContent=(bs/verified.length).toFixed(3);$('loglossValue').textContent=(ll/verified.length).toFixed(3);$('verifiedValue').textContent=String(verified.length);
}

async function verifyHistory(){
  const h=JSON.parse(localStorage.getItem('ms_history')||'[]');let changed=false;
  for(const x of h.slice(0,15)){
    if(x.verified||!x.sourceId||!x.eventDate||new Date(x.eventDate)>new Date())continue;
    try{
      const url=LIVE_API+'/api/result?source='+encodeURIComponent(x.resultSource||'')+'&id='+encodeURIComponent(x.sourceId)+'&sport='+encodeURIComponent(x.sportKey||'football')+'&league='+encodeURIComponent(x.espnLeague||'');
      const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;
      const d=await r.json(),e=d.event;if(!e||e.state!=='post'||e.scoreA==null||e.scoreB==null)continue;
      const a=Number(e.scoreA),b=Number(e.scoreB);
      x.actual=a>b?0:a===b?1:2;x.verified=true;
      x.correct=Array.isArray(x.probabilities)&&x.probabilities.indexOf(Math.max(...x.probabilities))===x.actual;
      x.finalScore=a+':'+b;changed=true;
    }catch(err){}
  }
  if(changed)localStorage.setItem('ms_history',JSON.stringify(h));renderHistory();
}

function snapshotKey(m){return String(m.sourceId||m.id)}
function savePredictionSnapshot(m){
  if(m.demo)return;
  const store=JSON.parse(localStorage.getItem('ms_probability_history')||'{}'),key=snapshotKey(m);
  const p=previewForMatch(m),arr=Array.isArray(store[key])?store[key]:[];
  const last=arr[arr.length-1],now=Date.now();
  const changed=!last||JSON.stringify(last.p)!==JSON.stringify(p);
  if(!last||changed||now-last.t>30*60*1000){
    arr.push({t:now,p});store[key]=arr.slice(-36);
    localStorage.setItem('ms_probability_history',JSON.stringify(store));
  }
}
function saveAllSnapshots(){matches.filter(m=>!m.demo).forEach(savePredictionSnapshot)}

function predictionChartHTML(m){
  const store=JSON.parse(localStorage.getItem('ms_probability_history')||'{}'),arr=store[snapshotKey(m)]||[];
  if(!arr.length)return '<div class="mc-empty">История прогноза начнёт накапливаться после обновлений страницы.</div>';
  const w=620,h=180,pad=24,n=arr[0].p.length;
  const colors=['currentColor','currentColor','currentColor'];
  const paths=[];
  for(let idx=0;idx<n;idx++){
    const pts=arr.map((x,i)=>{
      const xx=pad+(arr.length===1?(w-pad*2)/2:i*(w-pad*2)/(arr.length-1));
      const yy=h-pad-(x.p[idx]/100)*(h-pad*2);
      return xx.toFixed(1)+','+yy.toFixed(1);
    }).join(' ');
    paths.push('<polyline class="prob-line line-'+idx+'" points="'+pts+'" fill="none" stroke-width="3" vector-effect="non-scaling-stroke"/>');
  }
  const latest=arr[arr.length-1].p;
  return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Динамика вероятностей">'+paths.join('')+'</svg>'+
    '<div class="chart-legend">'+latest.map((v,i)=>'<span class="legend-'+i+'">'+(n===3?(i===0?'П1':i===1?'X':'П2'):(i===0?'1':'2'))+' <b>'+v+'%</b></span>').join('')+'</div>'+
    '<small>Точек истории: '+arr.length+' · сохраняются в этом браузере</small>';
}

function renderCenterFallback(m,message){
  $('mcTeamStats').innerHTML='<div class="mc-empty">'+escapeHTML(message)+'</div>';
  $('mcLineups').innerHTML='<div class="mc-empty">Составы ещё не опубликованы или недоступны в бесплатном источнике.</div>';
  $('mcInjuries').innerHTML='<div class="mc-empty">Нет доступных данных.</div>';
  $('mcPlayers').innerHTML='<div class="mc-empty">Статистика игроков появится, когда источник её опубликует.</div>';
  $('mcStandings').innerHTML='<div class="mc-empty">Турнирная таблица для этого события недоступна.</div>';
}

function renderTeamStats(stats){
  if(!stats?.length)return '<div class="mc-empty">Статистика матча ещё не опубликована.</div>';
  return stats.map(t=>'<div class="team-stat-block"><b>'+escapeHTML(t.team)+'</b>'+Object.entries(t.stats||{}).slice(0,12).map(([k,v])=>'<span>'+escapeHTML(k)+' <strong>'+escapeHTML(v)+'</strong></span>').join('')+'</div>').join('');
}
function renderLineups(blocks){
  if(!blocks?.length)return '<div class="mc-empty">Составы ещё не опубликованы.</div>';
  return blocks.map(b=>'<div class="lineup-block"><h4>'+escapeHTML(b.team)+'</h4><div class="lineup-grid">'+b.players.slice(0,24).map(p=>'<div class="'+(p.starter?'starter':'')+'"><span>'+(p.jersey?escapeHTML(p.jersey):'—')+'</span><b>'+escapeHTML(p.name)+'</b><small>'+escapeHTML(p.position)+(p.captain?' · C':'')+'</small></div>').join('')+'</div></div>').join('');
}
function renderInjuries(items){
  if(!items?.length)return '<div class="mc-empty">В источнике нет опубликованного списка травм/недоступных игроков.</div>';
  return '<div class="injury-list">'+items.map(x=>'<div><b>'+escapeHTML(x.name)+'</b><span>'+escapeHTML(x.team)+'</span><small>'+escapeHTML(x.status||x.detail||'Статус не указан')+'</small></div>').join('')+'</div>';
}
function renderPlayers(items){
  if(!items?.length)return '<div class="mc-empty">Статистика игроков пока недоступна.</div>';
  return '<div class="player-table"><div class="player-row head"><b>Игрок</b><span>Команда</span><span>Статистика</span></div>'+items.slice(0,40).map(x=>'<div class="player-row"><b>'+escapeHTML(x.name)+'</b><span>'+escapeHTML(x.team)+'</span><span>'+Object.entries(x.stats||{}).slice(0,5).map(([k,v])=>escapeHTML(k)+': '+escapeHTML(v)).join(' · ')+'</span></div>').join('')+'</div>';
}
function renderStandings(rows){
  if(!rows?.length)return '<div class="mc-empty">Таблица для этого турнира недоступна.</div>';
  return '<div class="standings-table"><div class="standing-row head"><span>#</span><b>Команда</b><span>И</span><span>В</span><span>Н</span><span>П</span><strong>О</strong></div>'+rows.map(r=>'<div class="standing-row"><span>'+r.rank+'</span><b>'+escapeHTML(r.team)+'</b><span>'+r.played+'</span><span>'+r.wins+'</span><span>'+r.draws+'</span><span>'+r.losses+'</span><strong>'+r.points+'</strong></div>').join('')+'</div>';
}

async function openMatchCenter(id){
  const m=matches.find(x=>String(x.id)===String(id));if(!m)return;
  selectedCenterMatch=m;savePredictionSnapshot(m);
  $('matchCenterOverlay').hidden=false;document.body.style.overflow='hidden';
  $('mcTitle').textContent=m.a+' — '+m.b;
  $('mcMeta').textContent=(m.league||'')+' · '+formatMatchTime(m)+(m.venue?' · '+m.venue:'');
  $('mcScore').innerHTML='<div><span>'+escapeHTML(m.a)+'</span><strong>'+(m.scoreA??'—')+'</strong></div><i>:</i><div><strong>'+(m.scoreB??'—')+'</strong><span>'+escapeHTML(m.b)+'</span></div>';
  $('mcChart').innerHTML=predictionChartHTML(m);
  renderCenterFallback(m,'Загружаем данные Match Center…');
  await refreshMatchCenter();
}

async function refreshMatchCenter(){
  const m=selectedCenterMatch;if(!m)return;
  $('mcChart').innerHTML=predictionChartHTML(m);
  if(!m.espnLeague||!m.sourceId){
    renderCenterFallback(m,'Расширенный Match Center для этого события пока недоступен.');
    return;
  }
  try{
    const season=(m.date?new Date(m.date):new Date()).getFullYear();
    const url=LIVE_API+'/api/match-center?league='+encodeURIComponent(m.espnLeague)+'&event='+encodeURIComponent(m.sourceId)+'&season='+season;
    const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    $('mcMeta').textContent=(m.league||'')+' · '+formatMatchTime(m)+(d.venue?' · '+d.venue:'')+(d.status?' · '+d.status:'');
    if(d.teams?.length>=2)$('mcScore').innerHTML='<div><span>'+escapeHTML(d.teams[0].name)+'</span><strong>'+(d.teams[0].score??'—')+'</strong></div><i>:</i><div><strong>'+(d.teams[1].score??'—')+'</strong><span>'+escapeHTML(d.teams[1].name)+'</span></div>';
    $('mcTeamStats').innerHTML=renderTeamStats(d.teamStats);
    $('mcLineups').innerHTML=renderLineups(d.lineups);
    $('mcInjuries').innerHTML=renderInjuries(d.injuries);
    $('mcPlayers').innerHTML=renderPlayers(d.playerStats);
    $('mcStandings').innerHTML=renderStandings(d.standings);
  }catch(err){
    renderCenterFallback(m,'Расширенные данные сейчас не удалось загрузить. Базовая карточка матча остаётся доступной.');
  }
}

function closeMatchCenter(){
  $('matchCenterOverlay').hidden=true;document.body.style.overflow='';selectedCenterMatch=null;
}

function dateKey(offset=0){
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);
  return ''+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
}
function setLiveStatus(type,text){$('liveDot').className='live-dot '+type;$('liveStatus').textContent=text}

async function loadLiveMatches(offset=dayOffset){
  dayOffset=offset;$('todayBtn').classList.toggle('active',offset===0);$('tomorrowBtn').classList.toggle('active',offset===1);
  setLiveStatus('loading','Получаем реальные матчи…');
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    const resp=await fetch(LIVE_API+'/api/matches?date='+dateKey(offset)+'&sport=all',{cache:'no-store',signal:controller.signal});
    clearTimeout(timer);if(!resp.ok)throw new Error('HTTP '+resp.status);
    const data=await resp.json();
    matches=(data.matches||[]).map((m,i)=>({...m,id:'live-'+m.sport+'-'+(m.leagueSlug||'league')+'-'+(m.id||i),demo:false}));
    footballLeagues=data.footballLeagues||[];renderLeagueFilter();saveAllSnapshots();renderMatches(activeFilter);
    const failed=data.failedSources||0;setLiveStatus('ok','Реальные данные · '+matches.length+' матчей'+(failed?' · '+failed+' источн. без событий':''));
  }catch(err){
    matches=[...DEMO_MATCHES];footballLeagues=[];renderLeagueFilter();renderMatches(activeFilter);
    setLiveStatus('error','Live-источник недоступен — показан резерв DEMO');
  }
}

['atkA','atkB','defA','defB','formA','formB'].forEach(id=>{
  const e=$(id),l=$(id+'Label');e.oninput=()=>{l.textContent=e.value;calc(false)};
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
$('mcClose').onclick=closeMatchCenter;
$('matchCenterOverlay').onclick=e=>{if(e.target===$('matchCenterOverlay'))closeMatchCenter()};
$('mcRefresh').onclick=refreshMatchCenter;
$('mcToAnalyzer').onclick=()=>{const m=selectedCenterMatch;if(!m)return;fillAnalyzerFromMatch(m);closeMatchCenter();$('analyzer').scrollIntoView({behavior:'smooth'})};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('matchCenterOverlay').hidden)closeMatchCenter()});

if(localStorage.getItem('ms_theme')==='light')document.body.classList.add('light');
document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>$(b.dataset.scroll).scrollIntoView({behavior:'smooth'}));
document.querySelectorAll('.filter[data-filter]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filter[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  activeFilter=b.dataset.filter;if(activeFilter!=='football'&&activeFilter!=='all')activeLeague='all';renderLeagueFilter();renderMatches(activeFilter);
});

renderLeagueFilter();renderMatches();renderHistory();calc(false);loadLiveMatches(0);verifyHistory();
