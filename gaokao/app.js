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
window.__katexReady=function(){
  renderMath($('#question'));renderMath($('#options'));
  const ex=document.querySelector('#feedback:not(.hidden) .explain');renderMath(ex);
};

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
  /* 教学进度优先：当前进度章节的题优先安排 */
  if(state.prog){
    for(const [sub,p] of Object.entries(state.prog)){
      if(pool.length>=n)break;
      const words=(p.name||'').match(/[\u4e00-\u9fff]{2,}/g)||[];
      const qs=shuffle(QB.filter(q=>q.s===sub&&words.some(w=>(q.k||'').includes(w)||(q.q||'').includes(w))));
      qs.slice(0,3).forEach(q=>{if(!used.has(q.s+'|'+q.k)){pool.push(q);used.add(q.s+'|'+q.k)}});
    }
  }
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
  if(id==='ai')renderAI();
  if(id==='preview')renderPreview();
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
      <p><small>解析：${esc(relabelLetters(q.exp,q._lmap))}</small></p></div>`;
  }).join('');
}

/* ---------- quiz session ---------- */
let session=null;
function startSession(list,mode='practice'){
  applyPaperLayout(list);
  session={list, idx:0, correct:0, mode};
  nav('practice');showQuestion();
}
/* ---------- 高考式答案排布：按卷面计划重排选项 ---------- */
function planLetters(n){
  const base=Math.floor(n/4);const arr=[];
  for(let i=0;i<4;i++)for(let j=0;j<base;j++)arr.push(i);
  arr.push(...shuffle([0,1,2,3]).slice(0,n%4));
  return shuffle(arr);
}
function applyPaperLayout(list){
  const singles=list.filter(q=>!q.multi);
  const plan=planLetters(singles.length);
  let pi=0;
  list.forEach(q=>{
    if(q.multi){q._lmap=null;return}
    const t=plan[pi++];const m=q.a.length,old=q.ans;
    if(t==null||t>=m||old>=m){q._lmap=null;return}
    if(t===old){q._lmap=null;return}
    const slots=[...Array(m).keys()].filter(i=>i!==t);
    const others=shuffle([...Array(m).keys()].filter(i=>i!==old));
    const na=[];let oi=0;
    for(let i=0;i<m;i++)na[i]=(i===t)?q.a[old]:q.a[others[oi++]];
    const lm={};
    [...Array(m).keys()].forEach(k=>{lm['ABCD'[k]]='ABCD'[(k===old)?t:slots[others.indexOf(k)]]});
    q.a=na;q.ans=t;q._lmap=lm;
  });
}
const RELABEL_RE=(function(){try{return new RegExp('(?<![A-Za-z])([A-D])(?![A-Za-z0-9])','g')}catch(e){return /([A-D])(?![A-Za-z0-9])/g}})();
function relabelLetters(s,lm){
  if(!s||!lm)return s||'';
  return s.replace(RELABEL_RE,m=>lm[m]||m);
}
function showQuestion(){
  const q=session.list[session.idx];
  const s=SUBJECTS[q.s];
  const modeLabel=session.mode==='diag'?'能力诊断':session.mode==='review'?'错题复盘':'智能训练';
  const src=q._src||(q.r?(q.r+(q.y?'·'+q.y:'')):(q.exp?'题库':''));
  $('#qMeta').textContent=`${modeLabel} · ${s.name} · ${q.k}${src?' · '+src:''}${session._byAI?' · 🤖'+session._byAI:''}`;
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
  const ex=fb.querySelector('.explain');
  ex.textContent='正确答案：'+ansTxt+'　'+relabelLetters(q.exp,q._lmap);
  renderMath(ex);
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
$('#startDaily').onclick=async()=>{
  Sound.start();
  /* AI 优先：用最近错题诊断薄弱知识点，直接练该知识点 */
  if(state.diag&&state.wrong.length&&typeof aiPost==='function'){
    try{
      const wq=QB[state.wrong[state.wrong.length-1].i];
      if(wq&&wq.q){
        const r=await aiPost('/predict',{question:wq.q.slice(0,600)});
        const pool=QB.filter(q=>q.k===r.chapter||q.k===r.chapter.replace(/\s*知识梳理与习题\.pdf$/,''));
        if(pool.length>=5){
          toast('AI 定位薄弱点：'+r.chapter.slice(0,14));
          startSession(pickAdaptiveFrom(pool,10),'practice');
          session._byAI='AI 选题';
          return;
        }
      }
    }catch(e){/* AI 不可达，走本地逻辑 */}
  }
  const list=state.diag?pickAdaptive(10):pickDiagnostic(12);
  startSession(list,state.diag?'practice':'diag');
  session._byAI='本地策略';
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
loadPreview().catch(()=>{});

/* ===== AI 智能诊断出题 ===== */
const AI_BASE=localStorage.aiBase||'http://100.99.67.96:8898';
let AI_OK=null;
async function aiCheck(){
  try{
    const ctl=('timeout' in AbortSignal)?{signal:AbortSignal.timeout(5000)}:{};
    const r=await fetch(AI_BASE+'/health',Object.assign({method:'GET'},ctl));
    AI_OK=r.ok;
  }catch(e){AI_OK=false}
  const el=$('#aiStatus');
  if(el)el.innerHTML=AI_OK?'✅ <b style="color:#58cc02">AI 在线</b> · 电脑端服务':'❌ <b style="color:#ef4444">AI 离线</b> · 当前使用本地策略';
  const b=$('#aiBadge');
  if(b)b.textContent=AI_OK?'🤖 AI 已接管选题':'📴 AI 离线 · 本地策略';
  return AI_OK;
}
aiCheck(); setInterval(aiCheck,60000);
async function aiPost(path,body){
  const r=await fetch(AI_BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
function renderAI(){
  const d=$('#aiDiag'), g=$('#aiGen');
  if(!d||d._bind)return; d._bind=g._bind=1;
  $('#aiTest').onclick=async()=>{
    const el=$('#aiStatus'); el.textContent='测试中…';
    await aiCheck();
    toast(AI_OK?'✅ AI 服务正常':'❌ 连不上 AI（地址 '+AI_BASE+'）');
  };
  d.onclick=async()=>{
    const q=$('#aiQ').value.trim(); if(!q)return toast('先粘贴一道题');
    const out=$('#aiDiagOut'); out.textContent='诊断中…';
    try{
      const r=await aiPost('/predict',{question:q});
      const ch=r.chapter.replace(/\s*知识梳理与习题\.pdf$/,'');
      out.innerHTML=`<b>知识点：</b>${ch}（置信度 ${(r.confidence*100).toFixed(0)}%）<br><b>难度：</b>${'★'.repeat(r.difficulty)}<br>— 正在推荐同类题 —`;
      try{
        const rec=await aiPost('/recommend',{question:q});
        out.innerHTML+=rec.questions.map(x=>`<div style="margin-top:10px;padding:10px;border-radius:10px;background:#faf7f0"><span style="font-size:12px;color:#999">来源：🤖 AI 推荐 · ${x.subject||''}${x.r?'·'+x.r:''}${x.y?'·'+x.y:''}</span><br>${(x.q||x.question||'').slice(0,300)}${(x.exp||x.answer)?'<br><b>解析：</b>'+(x.exp||x.answer).slice(0,150):''}</div>`).join('');
      }catch(e){}
    }catch(e){ out.textContent='连接失败：点上方「测试连接」排查（当前地址 '+AI_BASE+'）'; }
  };
  g.onclick=async()=>{
    const s=$('#aiSubject').value,k=$('#aiKnow').value.trim(),out=$('#aiGenOut');
    out.textContent='生成中…（约 10-30 秒）';
    try{
      const r=await aiPost('/generate',{subject:s,knowledge:k,n:1});
      out.innerHTML=`<span style="font-size:12px;color:#999">来源：🤖 AI 生成（${s}·${k||'自选考点'}）· 仅供参考，请自行核对</span>\n${r.questions[0]||'（未生成）'}`;
    }catch(e){ out.textContent='连接失败：点上方「测试连接」排查'; }
  };
}

/* ===== 预习课（课本教材）===== */
let PB=null;
async function loadPreview(){
  try{
    const r=await fetch('preview.json?v='+Date.now());
    PB=await r.json();
    if($('#preview').classList.contains('active'))renderPreview();
  }catch(e){}
}
function progKey(sub){
  const p=state.prog&&state.prog[sub];
  if(!p)return [];
  const t=(p.name||'').replace(/第[\d一二三四五六七八九十]+章/g,'').replace(/[（(].*?[)）]/g,'')
    .replace(/(知识梳理|强化训练|习题|微专题\d*|必修[一二三上下]|选择性必修[一二三])/g,' ');
  return t.split(/\s+/).filter(x=>x.length>=2);
}
function renderPreview(){
  if(!PB)return;
  const subs=[...new Set(PB.books.map(b=>b.s))].filter(s=>SUBJECTS[s]);
  const sel=$('#prevSubject');
  if(!sel.options.length)sel.innerHTML=subs.map(s=>`<option value="${s}">${SUBJECTS[s].icon} ${SUBJECTS[s].name}</option>`).join('');
  const sub=sel.value||subs[0];
  if(sel.value!==sel.dataset.cur){sel.dataset.cur=sub;renderPreviewBooks(sub)}
  $('#prevSub').textContent=SUBJECTS[sub].name;
  const p=state.prog&&state.prog[sub];
  $('#prevProgress').textContent=p?('当前进度：'+p.name+'（之后的章节可提前预习）'):'还没设置教学进度，点章节下的「设为进度」';
}
function renderPreviewBooks(sub){
  const box=$('#prevChapters');box.innerHTML='';
  const books=PB.books.filter(b=>b.s===sub);
  const p=state.prog&&state.prog[sub];
  const pIdx=p?books.findIndex(b=>b.name===p.name):-1;
  box.innerHTML=books.map((b,i)=>{
    const mark=i<pIdx?'✅ ':i===pIdx?'📍 ':'';
    return `<button class="focus-item prev-ch" data-i="${i}" style="text-align:left;width:100%;margin-bottom:8px"><b>${mark}${b.name}</b><p>${b.chapters.length} 个小节${i===pIdx?' · 当前进度':i<pIdx?' · 已学':' · 未学'}</p></button>`;
  }).join('');
  $$('.prev-ch').forEach(el=>el.onclick=()=>openChapter(sub,+el.dataset.i));
}
function openChapter(sub,i){
  const b=PB.books.filter(x=>x.s===sub)[i];
  const box=$('#prevContent');box.style.display='block';
  const p=state.prog&&state.prog[sub];
  const isCur=p&&p.name===b.name;
  box.innerHTML=`<div class="section-head"><h2>📖 ${b.name}</h2></div>
    <button class="secondary" id="prevSet" style="width:100%;margin-bottom:10px">${isCur?'📍 当前进度':'设为当前教学进度'}</button>`+
    b.chapters.map(c=>`<div style="margin-bottom:14px"><b style="color:var(--brand)">${esc(c.t)}</b><p style="white-space:pre-line;font-size:15px;line-height:1.75;margin-top:6px">${esc(c.content)}</p></div>`).join('')+
    `<button class="primary big" id="prevPractice" style="width:100%;margin-top:6px">✏️ 练一练本章</button>`;
  $('#prevSet').onclick=()=>{
    if(isCur)return;
    state.prog=state.prog||{};state.prog[sub]={name:b.name};save();
    renderPreviewBooks(sub);renderPreview();toast('已更新教学进度');
  };
  $('#prevPractice').onclick=()=>{
    const words=(b.name.match(/[\u4e00-\u9fff]{2,}/g)||[]).filter(w=>!/^(知识梳理|强化训练|习题)$/.test(w));
    const pool=QB.filter(q=>q.s===sub&&words.some(w=>(q.k||'').includes(w)||(q.q||'').includes(w)));
    if(pool.length<4)return toast('本章匹配的题还不多，换一章试试');
    startSession(shuffle(pool).slice(0,10),'practice');
    session._byAI='预习 '+b.name.slice(0,10);
  };
  box.scrollIntoView({behavior:'smooth'});
}
