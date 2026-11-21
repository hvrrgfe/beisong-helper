const SUBJECTS={
  math:{name:'数学',icon:'📐',color:'#1cb0f6'},
  physics:{name:'物理',icon:'⚛️',color:'#ff9600'},
  chemistry:{name:'化学',icon:'🧪',color:'#ce82ff'},
  biology:{name:'生物',icon:'🧬',color:'#58cc02'},
  chinese:{name:'语文',icon:'📚',color:'#ef4444'},
  english:{name:'英语',icon:'🌍',color:'#0ea5e9'},
  politics:{name:'政治',icon:'🏛️',color:'#f59e0b'},
  history:{name:'历史',icon:'🏺',color:'#8b5cf6'},
  geography:{name:'地理',icon:'🗺️',color:'#10b981'}
};
QB.forEach((q,i)=>q.id=i);

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function renderMath(el){
  if(!el||!window.renderMathInElement) return;
  try{
    renderMathInElement(el,{delimiters:[{left:'$',right:'$',display:false}],throwOnError:false,ignoredTags:['script','noscript','style','textarea','pre','code']});
  }catch(e){}
}

/* ---------- real question bank loading ---------- */
async function loadBank(){
  try{
    const r=await fetch('bank.json?v='+Date.now());
    if(!r.ok) return;
    const arr=await r.json();
    if(!Array.isArray(arr)) return;
    const seen=new Set(QB.map(q=>(q.q||'')+'|'+(q.a||[]).join('|')));
    arr.forEach(q=>{
      const key=(q.q||'')+'|'+(q.a||[]).join('|');
      if(seen.has(key)) return;
      seen.add(key);
      q.id=QB.length;
      QB.push(q);
    });
  }catch(e){}
}


function defaultState(){
  return {
    version:2,
    xp:0,gem:0,streak:0,last:'',total:0,correct:0,
    todayDone:0,dailyDate:'',
    mastery:{},wrong:[],hist:{},diag:false,
    voice:true,sfx:true
  };
}
function migrateOld(old){
  const s=defaultState();
  if(!old) return s;
  s.xp=old.xp||0; s.gem=old.gem||0; s.streak=old.streak||0;
  s.total=old.total||0; s.correct=old.correct||0;
  s.todayDone=old.todayDone||0; s.dailyDate=old.dailyDate||''; s.last=old.last||'';
  s.diag=!!old.diag;
  s.voice=old.voice!==false; s.sfx=old.sfx!==false;
  s.wrong=(old.wrong||[]).map(x=>{
    const i=QB.findIndex(q=>q.q===x);
    return i>=0?{i,box:1,due:todayKey()}:null;
  }).filter(Boolean);
  return s;
}
function loadState(){
  try{
    const raw=localStorage.getItem('gk_state_v2');
    if(raw) return JSON.parse(raw);
    const old=JSON.parse(localStorage.getItem('gk_state')||'null');
    return migrateOld(old);
  }catch(e){return defaultState()}
}
let state=loadState();

function save(){localStorage.setItem('gk_state_v2',JSON.stringify(state))}
function todayKey(d=new Date()){return d.toLocaleDateString('sv-SE')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return todayKey(x)}
function initDay(){
  const k=todayKey();
  if(state.dailyDate!==k){
    state.dailyDate=k; state.todayDone=0;
    if(state.last!==k){state.streak++;state.last=k}
    save();
  }
}
function toast(s){
  const t=$('#toast');t.textContent=s;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1600);
}

/* ---------- mastery & adaptive engine ---------- */
function mastery(s,k){
  return (state.mastery[s]&&state.mastery[s][k])||{n:0,c:0,ew:null};
}
function updateMastery(q,ok){
  if(!state.mastery[q.s]) state.mastery[q.s]={};
  const m=state.mastery[q.s];
  if(!m[q.k]) m[q.k]={n:0,c:0,ew:null};
  const t=m[q.k];
  t.n++; if(ok)t.c++;
  t.ew = t.ew==null ? (ok?0.7:0.25) : t.ew*0.65 + (ok?0.35:0);
}
function subjectMastery(s){
  const m=state.mastery[s]; if(!m) return null;
  let sum=0,n=0;
  Object.values(m).forEach(t=>{sum+=(t.ew||0)*t.n;n+=t.n});
  return n?sum/n:null;
}
function allTopics(){
  const map=new Map();
  QB.forEach(q=>{map.set(q.s+'|'+q.k,{s:q.s,k:q.k})});
  return [...map.values()];
}
function topicPriority(t){
  const m=mastery(t.s,t.k);
  const ew=m.ew==null?0.55:m.ew;
  const novelty=m.n<2?0.8:0;
  return (1-ew)*2 + novelty;
}
function weakestTopics(n=3){
  return allTopics().sort((a,b)=>topicPriority(b)-topicPriority(a)).slice(0,n);
}
function dueWrong(){
  const k=todayKey();
  return state.wrong.filter(w=>w.due<=k).map(w=>QB[w.i]).filter(Boolean);
}
function updateWrong(q,ok){
  const idx=state.wrong.findIndex(w=>w.i===q.id);
  if(ok){
    if(idx>=0){
      const w=state.wrong[idx]; w.box++;
      if(w.box>4){state.wrong.splice(idx,1)}
      else{w.due=addDays(new Date(),[1,2,4,7,15][w.box])}
    }
  }else{
    if(idx<0) state.wrong.push({i:q.id,box:1,due:addDays(new Date(),1)});
    else{state.wrong[idx].box=1;state.wrong[idx].due=addDays(new Date(),1)}
  }
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function pickAdaptive(n=10){
  const pool=[]; const used=new Set();
  dueWrong().slice(0,3).forEach(q=>{pool.push(q);used.add(q.s+'|'+q.k)});
  const topics=allTopics().sort((a,b)=>topicPriority(b)-topicPriority(a));
  for(const t of topics){
    if(pool.length>=n) break;
    if(used.has(t.s+'|'+t.k)) continue;
    const qs=QB.filter(q=>q.s===t.s&&q.k===t.k);
    if(qs.length){pool.push(qs[Math.floor(Math.random()*qs.length)]);used.add(t.s+'|'+t.k)}
  }
  if(pool.length<n){
    const rest=shuffle(QB.filter(q=>!pool.includes(q)));
    pool.push(...rest.slice(0,n-pool.length));
  }
  return shuffle(pool).slice(0,n);
}
function pickDiagnostic(n=12){
  const topics=shuffle(allTopics());
  const out=[];
  for(const t of topics){
    if(out.length>=n) break;
    const qs=QB.filter(q=>q.s===t.s&&q.k===t.k);
    if(qs.length) out.push(qs[Math.floor(Math.random()*qs.length)]);
  }
  return out;
}
function recordAnswer(ok){
  state.total++; state.todayDone++;
  if(ok) state.correct++;
  const d=todayKey();
  if(!state.hist[d]) state.hist[d]={n:0,c:0};
  state.hist[d].n++; if(ok) state.hist[d].c++;
}

/* ---------- UI helpers ---------- */
function nav(id){
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===id));
  $$('.bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.nav===id));
  if(id==='stats')renderStats();
  if(id==='wrong')renderWrong();
  if(id==='home')renderHome();
  window.scrollTo(0,0);
}
$$('[data-nav]').forEach(x=>x.onclick=()=>{Sound.tap();nav(x.dataset.nav)});

function renderHome(){
  const xpNeed=state.xp%100;
  $('#xpBar').style.width=xpNeed+'%';
  $('#streak').textContent=state.streak;
  $('#gem').textContent=state.gem;
  $('#dailyText').textContent=`${state.todayDone} / 20 题`;
  const pct=Math.min(100,state.todayDone*10);
  $('#goalRing').style.background=`conic-gradient(var(--green) ${pct*3.6}deg,#e5e5e5 0)`;
  $('#goalRing span').textContent=pct+'%';
  const lv=1+Math.floor(state.xp/100);
  $('#levelText').textContent=`Lv.${lv} ${lv<3?'起步阶段':lv<6?'进阶阶段':lv<10?'突破阶段':'冲刺阶段'}`;
  $('#levelBar').style.width=xpNeed+'%';
  $('#levelNext').textContent=`再获得 ${100-xpNeed} XP 升级`;
  renderSkills();renderFocus();
  const d=new Date('2029-06-07');
  const days=Math.ceil((d-new Date())/864e5);
  $('#countdown').textContent=days>0?days:0;
  $('#modeHint').textContent=state.diag?'已定位薄弱点，正在智能训练':'先完成一次诊断，系统会定位薄弱点';
  renderWeeklyHome();
  updateBankInfo();
}
function updateBankInfo(){
  const el=$('#bankInfo');
  if(el) el.textContent=`题库 ${QB.length} 道 · 真题 ${QB.filter(q=>q.y).length} 道`;
}
function renderSkills(){
  $('#skills').innerHTML=Object.entries(SUBJECTS).map(([k,s])=>{
    const m=subjectMastery(k);
    const r=m==null?0:Math.round(m*100);
    const topics=Object.keys(state.mastery[k]||{}).length;
    return `<button class="skill" data-subject="${k}">
      <span class="skill-icon" style="background:${s.color}22">${s.icon}</span>
      <div class="skill-info"><b>${s.name}</b><small>掌握度 ${r}% · ${topics} 个专题</small>
      <div class="bar"><i style="width:${r}%;background:${s.color}"></i></div></div>
      <span class="skill-arrow">›</span></button>`;
  }).join('');
  $$('.skill').forEach(x=>x.onclick=()=>{
    const k=x.dataset.subject;
    const qs=QB.filter(q=>q.s===k);
    startSession(pickAdaptiveFrom(qs,10),'practice');
  });
}
function pickAdaptiveFrom(qs,n=10){
  const pool=[];
  const topics=[...new Set(qs.map(q=>q.s+'|'+q.k))];
  topics.sort((a,b)=>{
    const [s1,k1]=a.split('|'),[s2,k2]=b.split('|');
    return topicPriority({s:s2,k:k2})-topicPriority({s:s1,k:k1});
  });
  for(const t of topics){
    if(pool.length>=n) break;
    const [s,k]=t.split('|');
    const cand=qs.filter(q=>q.s===s&&q.k===k);
    if(cand.length) pool.push(cand[Math.floor(Math.random()*cand.length)]);
  }
  if(pool.length<n) pool.push(...shuffle(qs.filter(q=>!pool.includes(q))).slice(0,n-pool.length));
  return shuffle(pool).slice(0,n);
}
function renderFocus(){
  const box=$('#focusList');
  const due=dueWrong().length;
  if(!state.total){
    box.innerHTML='<div class="focus-item"><b>先完成一次诊断</b><p>我会根据结果定位薄弱知识点。</p></div>';
    return;
  }
  const weak=weakestTopics(3);
  const items=weak.map(t=>{
    const m=mastery(t.s,t.k);
    const acc=m.n?Math.round(m.c/m.n*100):0;
    const s=SUBJECTS[t.s];
    return `<button class="focus-item" data-topic="${t.s}|${t.k}">
      <b>${s.icon} ${s.name} · ${t.k}</b><p>正确率 ${acc}% · 建议优先练</p></button>`;
  });
  if(due) items.unshift(`<button class="focus-item due" id="startReview"><b>📕 今天有 ${due} 道错题到期</b><p>先清错题，再学新题</p></button>`);
  box.innerHTML=items.join('');
  $$('#focusList .focus-item').forEach(x=>{
    x.onclick=()=>{
      if(x.id==='startReview'){
        const k=todayKey();
        const qs=state.wrong.filter(w=>w.due<=k).map(w=>QB[w.i]).filter(Boolean);
        startSession(qs,'review');
      }else{
        const [s,k]=x.dataset.topic.split('|');
        startSession(QB.filter(q=>q.s===s&&q.k===k),'practice');
      }
    };
  });
}
function renderStats(){
  $('#sStreak').textContent=state.streak;
  $('#sCorrect').textContent=state.correct;
  $('#sTotal').textContent=state.total;
  $('#sAccuracy').textContent=(state.total?Math.round(state.correct/state.total*100):0)+'%';
  let n=0,c=0;
  Object.keys(state.hist||{}).forEach(k=>{n+=state.hist[k].n;c+=state.hist[k].c});
  $('#recentAcc').textContent=(n?Math.round(c/n*100):0)+'%';
  $('#mastery').innerHTML=Object.entries(SUBJECTS).map(([k,s])=>{
    const m=subjectMastery(k);
    const r=m==null?0:Math.round(m*100);
    return `<div class="mastery-row"><div><span>${s.icon} ${s.name}</span><span>${r}%</span></div><div class="bar"><i style="width:${r}%;background:${s.color}"></i></div></div>`;
  }).join('');
  const weak=weakestTopics(5);
  $('#weakList').innerHTML=weak.map(t=>{
    const m=mastery(t.s,t.k);
    const acc=m.n?Math.round(m.c/m.n*100):0;
    const s=SUBJECTS[t.s];
    return `<div class="weak-item"><b>${s.icon} ${s.name} · ${t.k}</b><p>${m.n?`正确率 ${acc}%`:'待检测'}</p></div>`;
  }).join('');
  const badges=[['初出茅庐',state.total>=1,'🌱'],['坚持三天',state.streak>=3,'🔥'],['百题达人',state.total>=100,'💯'],['神射手',state.total>=20&&state.correct/state.total>=.9,'🎯'],['博览群书',Object.keys(state.mastery).length>=4,'📚'],['满级学霸',state.xp>=1000,'👑']];
  $('#badges').innerHTML=badges.map(b=>`<div class="badge ${b[1]?'':'lock'}"><span>${b[2]}</span><b>${b[0]}</b></div>`).join('');
}
function renderWrong(){
  const due=dueWrong().length;
  $('#dueCount').textContent=due;
  $('#wrongCount').textContent=state.wrong.length;
  const list=$('#wrongList');
  if(!state.wrong.length){
    list.innerHTML='<div class="daily-card" style="text-align:center"><div style="font-size:50px">🎉</div><b>还没有错题</b><p class="muted">继续保持！你已经完成得很好了。</p></div>';
    return;
  }
  list.innerHTML=state.wrong.map(w=>{
    const q=QB[w.i]; if(!q) return '';
    const s=SUBJECTS[q.s];
    const dueTag=w.due<=todayKey()?'<span class="due-tag">今天复习</span>':`<span class="due-tag later">${w.due} 复习</span>`;
    return `<div class="wrong-item">
      <b>${s.icon} ${s.name} · ${q.k}</b> ${dueTag}
      <p>${esc(q.q)}</p>
      <small>正确答案：${'ABCD'[q.ans]} · ${esc(q.a[q.ans])}</small>
      <p><small>解析：${esc(q.exp)}</small></p></div>`;
  }).join('');
}

/* ---------- quiz session ---------- */
let session=null;
function startSession(list,mode='practice'){
  session={list, idx:0, correct:0, mode};
  nav('practice');showQuestion();
}
function showQuestion(){
  const q=session.list[session.idx];
  const s=SUBJECTS[q.s];
  const modeLabel=session.mode==='diag'?'能力诊断':session.mode==='review'?'错题复盘':'智能训练';
  $('#qMeta').textContent=`${modeLabel} · ${s.name} · ${q.k}`;
  $('#question').textContent=q.q; renderMath($('#question'));
  $('#qCount').textContent=`${session.idx+1}/${session.list.length}`;
  $('#qBar').style.width=(session.idx/session.list.length*100)+'%';
  const multi=!!q.multi;
  session.multiSel=multi?[]:null;
  $('#options').innerHTML=q.a.map((o,i)=>`<button class="option ${multi?'choice':''}" data-i="${i}"><span>${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('');
  renderMath($('#options'));
  $$('.option').forEach(b=>b.onclick=()=>answer(+b.dataset.i));
  if(multi){
    const btn=document.createElement('button');
    btn.className='primary confirm-btn';
    btn.textContent='确认作答';
    btn.onclick=()=>{
      if(!session.multiSel||!session.multiSel.length){
        toast('请至少选择一个选项');
        return;
      }
      answer(-1);
    };
    $('#options').appendChild(btn);
  }
  $('#feedback').classList.add('hidden');
}
function answer(i){
  if(!session) return;
  const q=session.list[session.idx];
  const multi=!!q.multi;
  let ok;
  if(multi){
    if(i>=0){
      const pos=session.multiSel.indexOf(i);
      if(pos<0){session.multiSel.push(i);session.multiSel.sort()}else{session.multiSel.splice(pos,1)}
      $$('.option').forEach((b,idx)=>{
        const on=session.multiSel.includes(idx);
        b.classList.toggle('picked',on);
      });
      Sound.tick();
      return;
    }
    const sel=session.multiSel.slice().sort();
    ok=sel.length===q.ans.length&&sel.every((v,k)=>v===q.ans[k]);
  }else{
    ok=i===q.ans;
  }
  const opts=$$('.option');
  opts.forEach(b=>b.classList.remove('correct','wrong'));
  if(multi){
    opts.forEach((b,idx)=>{
      const isAns=q.ans.includes(idx);
      const isSel=sel.includes(idx);
      if(isAns)b.classList.add('correct');
      else if(isSel)b.classList.add('wrong');
    });
  }else{
    opts[i].classList.add(ok?'correct':'wrong');
    if(!ok) opts[q.ans].classList.add('correct');
  }
  recordAnswer(ok);
  updateMastery(q,ok);
  updateWrong(q,ok);
  if(ok){
    session.correct++;
    state.xp+=10;
    Sound.right();
    const beforeLv=Math.floor(state.xp/100);
    if(state.todayDone===10){state.gem+=30;Sound.goal();toast('今日目标达成 +30 💎')}
    else if(state.todayDone===20){Sound.gem();toast('今日 20 题全部完成！')}
    const afterLv=Math.floor(state.xp/100);
    if(afterLv>beforeLv) setTimeout(()=>{Sound.levelUp();toast('🎉 升到 Lv.'+(afterLv+1)+' 了！')},500);
  } else {
    Sound.wrong();
  }
  save();
  const fb=$('#feedback');
  fb.classList.remove('hidden');
  fb.classList.toggle('bad',!ok);
  fb.querySelector('.feedback-title').textContent=ok?'答对了！ +10 XP':'再想想，答案不正确';
  const ansTxt=q.multi?q.ans.map(i=>'ABCD'[i]).join(''):('ABCD'[q.ans]);
  fb.querySelector('.explain').textContent='正确答案：'+ansTxt+'　'+(q.exp||'');
  $('#next').textContent=session.idx===session.list.length-1?(session.mode==='diag'?'查看诊断结果':'完成训练'):'继续';
}
$('#next').onclick=()=>{
  if(!session) return;
  if(session.idx<session.list.length-1){
    session.idx++;showQuestion();
  }else{
    $('#feedback').classList.add('hidden');
    if(session.mode==='diag'){state.diag=true;save();Sound.goal();toast(`诊断完成：答对 ${session.correct}/${session.list.length}`)}
    else{Sound.great();toast(`完成训练：答对 ${session.correct}/${session.list.length}`)}
    renderHome();nav('home');
  }
};
$('#startDaily').onclick=()=>{
  Sound.start();
  const list=state.diag?pickAdaptive(10):pickDiagnostic(12);
  startSession(list,state.diag?'practice':'diag');
};
$('#quit').onclick=()=>{if(confirm('退出本次训练？已答题进度不会保存。')){session=null;nav('home')}};
$('#clearWrong').onclick=()=>{if(confirm('确定清空错题本？')){state.wrong=[];save();renderWrong();toast('错题本已清空')}};
$('#reset').onclick=()=>{if(confirm('确定重置全部学习记录？此操作无法撤销。')){localStorage.removeItem('gk_state_v2');localStorage.removeItem('gk_state');location.reload()}};
function syncSoundUI(){
  $('#voiceSwitch').classList.toggle('on',state.voice);
  $('#sfxSwitch').classList.toggle('on',state.sfx);
  $('#soundToggle').textContent=(state.voice||state.sfx)?'🔊':'🔇';
  Sound.setVoice(state.voice);Sound.setSfx(state.sfx);
}
$('#voiceSwitch').onclick=()=>{state.voice=!state.voice;state.sfx=state.voice;save();syncSoundUI();if(state.voice)Sound.right()};
$('#sfxSwitch').onclick=()=>{state.sfx=!state.sfx;save();syncSoundUI();if(state.sfx)Sound.tap()};
$('#soundToggle').onclick=()=>{
  if(state.voice&&state.sfx){state.voice=false;state.sfx=false}
  else{state.voice=true;state.sfx=true}
  save();syncSoundUI();
  if(state.voice||state.sfx)setTimeout(()=>Sound.tap(),50);
};
document.addEventListener('pointerdown',()=>Sound.unlock(),{once:true});
syncSoundUI();

/* ---------- weekly PDFs ---------- */
let weeklyData=null,weekIdx=0,subjectIdx=0;
async function loadWeekly(){
  if(weeklyData) return;
  try{
    const r=await fetch('weekly.json?v='+Date.now());
    weeklyData=await r.json();
  }catch(e){weeklyData={weeks:[]}}
  renderWeeklyHome();renderWeekly();
}
function renderWeeklyHome(){
  const w=weeklyData&&weeklyData.weeks[0];
  if(!w){$('#weeklyDate').textContent='暂无';return}
  $('#weeklyDate').textContent='共 '+w.files.length+' 科';
  $('#weeklyGrid').innerHTML=w.files.slice(0,6).map((f,i)=>`<button data-week="0" data-subject="${i}">${f.subject}</button>`).join('');
  $$('#weeklyGrid button').forEach(b=>b.onclick=()=>{weekIdx=+b.dataset.week;subjectIdx=+b.dataset.subject;renderWeekly();nav('weekly')});
}
function renderWeekly(){
  const w=weeklyData&&weeklyData.weeks[weekIdx];
  if(!w){$('#weekLabel').textContent='暂无';return}
  $('#weekLabel').textContent=w.title;
  $('#weekTabs').innerHTML=w.files.map((f,i)=>`<button class="${i===subjectIdx?'active':''}" data-i="${i}">${f.subject}</button>`).join('');
  $$('#weekTabs button').forEach(b=>b.onclick=()=>{subjectIdx=+b.dataset.i;renderWeekly()});
  const f=w.files[subjectIdx];
  $('#weeklyPages').innerHTML=(f.preview||[]).map(u=>`<img src="${u}" loading="lazy" alt="${f.subject}页面">`).join('');
}
loadWeekly();
initDay();
renderHome();renderStats();
loadBank().then(()=>{updateBankInfo();}).catch(()=>{});
