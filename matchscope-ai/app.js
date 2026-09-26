const matches=[
{id:1,sport:'football',league:'Premier League',time:'18:30',a:'Arsenal',b:'Liverpool',p:[48,26,26]},
{id:2,sport:'football',league:'LaLiga',time:'21:00',a:'Barcelona',b:'Sevilla',p:[62,22,16]},
{id:3,sport:'basketball',league:'NBA',time:'22:30',a:'Boston',b:'Miami',p:[64,36]},
{id:4,sport:'hockey',league:'NHL',time:'23:00',a:'Toronto',b:'Boston',p:[44,24,32]},
{id:5,sport:'tennis',league:'ATP',time:'16:00',a:'Player A',b:'Player B',p:[57,43]},
{id:6,sport:'football',league:'Serie A',time:'20:45',a:'Inter',b:'Napoli',p:[51,27,22]}
];
const labels={football:'Футбол',basketball:'Баскетбол',hockey:'Хоккей',tennis:'Теннис'};
function renderMatches(filter='all'){
 const el=document.querySelector('#matchGrid'); el.innerHTML='';
 matches.filter(m=>filter==='all'||m.sport===filter).forEach(m=>{
   const probs=m.p.length===3?`<div class="mini-probs"><span>1 · ${m.p[0]}%</span><span>${m.sport==='hockey'?'X/OT':'X'} · ${m.p[1]}%</span><span>2 · ${m.p[2]}%</span></div>`:`<div class="mini-probs" style="grid-template-columns:1fr 1fr"><span>1 · ${m.p[0]}%</span><span>2 · ${m.p[1]}%</span></div>`;
   el.insertAdjacentHTML('beforeend',`<article class="match-card"><div class="match-top"><span>${labels[m.sport]} · ${m.league}</span><span>${m.time}</span></div><h3>${m.a} — ${m.b}</h3><div class="teams"><div class="team-row"><span>${m.a}</span><b>DEMO</b></div><div class="team-row"><span>${m.b}</span><span>сегодня</span></div></div>${probs}<button class="secondary analyze-match" data-id="${m.id}">Анализировать</button></article>`)
 })
 document.querySelectorAll('.analyze-match').forEach(btn=>btn.onclick=()=>loadMatch(+btn.dataset.id));
}
function loadMatch(id){const m=matches.find(x=>x.id===id);if(!m)return;document.querySelector('#sport').value=m.sport;document.querySelector('#teamA').value=m.a;document.querySelector('#teamB').value=m.b;calc(false);document.querySelector('#analyzer').scrollIntoView({behavior:'smooth'});}
function factorial(n){let v=1;for(let i=2;i<=n;i++)v*=i;return v}function poisson(k,l){return Math.exp(-l)*Math.pow(l,k)/factorial(k)}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function footballModel(a,b){
 const home=document.querySelector('#homeAdv').checked?0.18:0;
 let xga=1.15+(a.atk-b.def)*.012+(a.form-b.form)*.006+home;
 let xgb=1.05+(b.atk-a.def)*.012+(b.form-a.form)*.006;
 xga=clamp(xga,.25,3.8);xgb=clamp(xgb,.25,3.8);
 let homeP=0,draw=0,awayP=0,over=0,btts=0,scores=[];
 for(let i=0;i<=7;i++)for(let j=0;j<=7;j++){let p=poisson(i,xga)*poisson(j,xgb);scores.push([i,j,p]);if(i>j)homeP+=p;else if(i===j)draw+=p;else awayP+=p;if(i+j>2)over+=p;if(i>0&&j>0)btts+=p}
 const sum=homeP+draw+awayP;homeP/=sum;draw/=sum;awayP/=sum;scores.sort((x,y)=>y[2]-x[2]);
 return {main:[homeP,draw,awayP],xga,xgb,over,btts,scores:scores.slice(0,3)}
}
function twoWayModel(a,b,sport){let d=(a.atk-b.atk)*.045+(a.def-b.def)*.025+(a.form-b.form)*.04+(document.querySelector('#homeAdv').checked?.14:0);let p=1/(1+Math.exp(-d));p=clamp(p,.08,.92);if(sport==='basketball'){let base=108;return {main:[p,1-p],score:[Math.round(base+(a.atk-b.def)*.18+4),Math.round(base+(b.atk-a.def)*.18)],total:Math.round((base*2+(a.atk+b.atk-a.def-b.def)*.12)*10)/10}}if(sport==='tennis'){let sets=p>.5?'2:1':'1:2';if(Math.abs(p-.5)>.22)sets=p>.5?'2:0':'0:2';return {main:[p,1-p],sets}}}
function hockeyModel(a,b){let base=2.55;let ga=clamp(base+(a.atk-b.def)*.028+(a.form-b.form)*.01+(document.querySelector('#homeAdv').checked?.18:0),.8,5.5),gb=clamp(base+(b.atk-a.def)*.028+(b.form-a.form)*.01,.8,5.5);let h=0,d=0,aw=0;for(let i=0;i<=9;i++)for(let j=0;j<=9;j++){let p=poisson(i,ga)*poisson(j,gb);if(i>j)h+=p;else if(i===j)d+=p;else aw+=p}let s=h+d+aw;return {main:[h/s,d/s,aw/s],ga,gb,total:ga+gb}}
function readInputs(){return {a:{atk:+atkA.value,def:+defA.value,form:+formA.value},b:{atk:+atkB.value,def:+defB.value,form:+formB.value}}}
function factorHTML(name,val){return `<div class="factor"><div><b>${name}</b><br><small>${val>=0?'+':''}${val.toFixed(1)} условных пунктов</small></div><div class="factorbar"><i style="width:${clamp(Math.abs(val)*7,8,100)}%"></i></div></div>`}
function calc(save=true){
 const sport=document.querySelector('#sport').value,A=document.querySelector('#teamA').value.trim()||'Команда 1',B=document.querySelector('#teamB').value.trim()||'Команда 2';
 const {a,b}=readInputs();outA.textContent=A;outB.textContent=B;sportName.textContent=labels[sport];let main='',secondary='',summary='';
 let dif=(a.atk-b.atk)*.35+(a.def-b.def)*.2+(a.form-b.form)*.3+(homeAdv.checked?4:0);let conf=clamp(50+Math.abs(dif)*1.1,52,91);confidence.textContent=`${conf<62?'Низкая':conf<76?'Средняя':'Высокая'} уверенность · ${Math.round(conf)}%`;
 if(sport==='football'){
   let r=footballModel(a,b),p=r.main.map(x=>Math.round(x*100));main=`<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>${p[0]}%</strong></div><div class="outcome"><small>Ничья</small><strong>${p[1]}%</strong></div><div class="outcome"><small>П2</small><strong>${p[2]}%</strong></div></div>`;
   secondary=`<div class="metric"><span>Ожидаемые голы</span><b>${A}: ${r.xga.toFixed(2)} · ${B}: ${r.xgb.toFixed(2)}</b></div><div class="metric"><span>ТБ 2.5</span><b>${Math.round(r.over*100)}%</b></div><div class="metric"><span>Обе забьют</span><b>${Math.round(r.btts*100)}%</b></div><div class="metric"><span>Вероятные счета</span><b>${r.scores.map(s=>s[0]+':'+s[1]).join(' · ')}</b></div>`;summary=`${p[0]}% / ${p[1]}% / ${p[2]}%`;
 } else if(sport==='hockey'){
   let r=hockeyModel(a,b),p=r.main.map(x=>Math.round(x*100));main=`<div class="outcome-grid"><div class="outcome"><small>П1</small><strong>${p[0]}%</strong></div><div class="outcome"><small>X / OT</small><strong>${p[1]}%</strong></div><div class="outcome"><small>П2</small><strong>${p[2]}%</strong></div></div>`;secondary=`<div class="metric"><span>Ожидаемые шайбы</span><b>${r.ga.toFixed(1)} — ${r.gb.toFixed(1)}</b></div><div class="metric"><span>Ожидаемый тотал</span><b>${r.total.toFixed(1)}</b></div>`;summary=`${p[0]}% / ${p[1]}% / ${p[2]}%`;
 } else {let r=twoWayModel(a,b,sport),p=r.main.map(x=>Math.round(x*100));main=`<div class="outcome-grid" style="grid-template-columns:1fr 1fr"><div class="outcome"><small>${A}</small><strong>${p[0]}%</strong></div><div class="outcome"><small>${B}</small><strong>${p[1]}%</strong></div></div>`;if(sport==='basketball')secondary=`<div class="metric"><span>Ожидаемый счёт</span><b>${r.score[0]} : ${r.score[1]}</b></div><div class="metric"><span>Ожидаемый тотал</span><b>${r.total}</b></div>`;else secondary=`<div class="metric"><span>Вероятный счёт по сетам</span><b>${r.sets}</b></div><div class="metric"><span>Разница сил</span><b>${Math.abs(p[0]-p[1])} п.п.</b></div>`;summary=`${p[0]}% / ${p[1]}%`;}
 primaryResult.innerHTML=main;secondaryResult.innerHTML=secondary;
 factors.innerHTML=factorHTML('Разница атаки',(a.atk-b.atk)/5)+factorHTML('Разница защиты',(a.def-b.def)/5)+factorHTML('Текущая форма',(a.form-b.form)/5)+factorHTML('Домашний фактор',homeAdv.checked?2.5:0);
 if(save){let h=JSON.parse(localStorage.getItem('ms_history')||'[]');h.unshift({date:new Date().toLocaleString('ru-RU'),sport:labels[sport],match:`${A} — ${B}`,summary});localStorage.setItem('ms_history',JSON.stringify(h.slice(0,30)));renderHistory()}
}
function renderHistory(){let h=JSON.parse(localStorage.getItem('ms_history')||'[]'),el=document.querySelector('#historyList');if(!h.length){el.innerHTML='<div class="empty">История пока пуста. Сделайте расчёт в анализаторе.</div>';return}el.innerHTML=h.map(x=>`<div class="history-item"><div><b>${x.match}</b><br><small>${x.date}</small></div><div>${x.sport}</div><div><b>${x.summary}</b></div></div>`).join('')}
['atkA','atkB','defA','defB','formA','formB'].forEach(id=>{let e=document.querySelector('#'+id),l=document.querySelector('#'+id+'Label');e.oninput=()=>{l.textContent=e.value;calc(false)}});sport.onchange=()=>calc(false);homeAdv.onchange=()=>calc(false);calcBtn.onclick=()=>calc(true);clearHistory.onclick=()=>{localStorage.removeItem('ms_history');renderHistory()};themeBtn.onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('ms_theme',document.body.classList.contains('light')?'light':'dark')};if(localStorage.getItem('ms_theme')==='light')document.body.classList.add('light');document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>document.querySelector('#'+b.dataset.scroll).scrollIntoView({behavior:'smooth'}));document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderMatches(b.dataset.filter)});renderMatches();renderHistory();calc(false);