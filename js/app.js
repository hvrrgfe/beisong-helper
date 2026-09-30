/* ============================================================
 * 背诵助手 — 简单·熟悉·重复
 * A memorization app for Chinese literature & English vocabulary
 * ============================================================ */

// ===== Global State =====
const App = {
  data: { chinese: [], vocab2050: [], vocab700: [], vocab370: [], irregularVerbs: [] },
  view: 'home',
  loaded: false,
  // Flashcard session state
  fc: {
    deck: [],      // current deck of cards
    index: 0,
    flipped: false,
    source: 'vocab2050',
    mode: 'all',   // all | unfamiliar | learning
    sessionCount: 0,
  },
  // Recitation state
  rc: {
    piece: null,
    mode: 'read',  // read | cloze | hard
    blanks: [],    // indices of hidden characters
    revealed: new Set(),
    wrongSet: new Set(),
  },
  // Quiz state
  quiz: {
    phase: 'setup',   // setup | running | results
    type: '',         // vocab | verb | poetry
    questions: [],
    current: 0,
    answers: [],      // {selected, correct, itemId}
    score: 0,
    startTime: 0,
    config: {},
    repeatMode: false,
  },
};

// ===== Progress / localStorage =====
const Progress = {
  key: 'beisong_progress_v1',
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch { this.data = {}; }
    if (!this.data.items) this.data.items = {};
    if (!this.data.stats) this.data.stats = { totalSessions: 0, totalReviews: 0 };
    return this.data;
  },
  save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
  getItem(id) {
    if (!this.data.items[id]) {
      this.data.items[id] = { fam: 0, reviews: 0, lastReview: 0, correct: 0 };
    }
    return this.data.items[id];
  },
  setFam(id, fam, correct) {
    const it = this.getItem(id);
    it.fam = Math.max(0, Math.min(5, fam));
    it.reviews++;
    if (correct) it.correct++;
    else it.correct = Math.max(0, it.correct - 1);
    it.lastReview = Date.now();
    this.save();
  },
  resetItem(id) {
    this.data.items[id] = { fam: 0, reviews: 0, lastReview: 0, correct: 0 };
    this.save();
  },
  getStats() {
    const items = Object.values(this.data.items);
    const total = items.length;
    const mastered = items.filter(i => i.fam >= 4).length;
    const familiar = items.filter(i => i.fam >= 2 && i.fam < 4).length;
    const unfamiliar = items.filter(i => i.fam < 2).length;
    return { total, mastered, familiar, unfamiliar, sessions: this.data.stats.totalSessions || 0, reviews: this.data.stats.totalReviews || 0 };
  },
  incSession() { this.data.stats.totalSessions++; this.save(); },
  incReview() { this.data.stats.totalReviews++; this.save(); },
  getFam(id) { return this.getItem(id).fam; },
};

// ===== Data Loading =====
async function loadData() {
  const base = 'data/';
  const files = {
    chinese: 'chinese_60.json',
    vocab2050: 'vocab_2050.json',
    vocab700: 'vocab_700.json',
    vocab370: 'vocab_370.json',
    irregularVerbs: 'irregular_verbs.json',
  };
  const entries = Object.entries(files);
  const results = await Promise.all(entries.map(async ([k, f]) => {
    const res = await fetch(base + f);
    return [k, await res.json()];
  }));
  for (const [k, v] of results) App.data[k] = v;
  App.loaded = true;
}

// ===== Navigation =====
function navigate(view) {
  App.view = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.getElementById('sidebar').classList.remove('open');
  render();
  window.scrollTo(0, 0);
}

// ===== Render Dispatcher =====
function render() {
  const content = document.getElementById('content');
  content.className = 'fade-in';
  switch (App.view) {
    case 'home': renderHome(content); break;
    case 'materials': renderMaterials(content); break;
    case 'flashcard': renderFlashcardSetup(content); break;
    case 'recite': renderReciteList(content); break;
    case 'test': renderTest(content); break;
    case 'progress': renderProgress(content); break;
  }
  updateQuickStats();
}

// ===== Home View =====
function renderHome(c) {
  const s = Progress.getStats();
  c.innerHTML = `
    <div class="view-header"><h1>背诵助手</h1><p>简单 · 熟悉 · 重复 — 让背诵成为一种习惯</p></div>
    <div class="grid grid-4">
      <div class="card stat-card"><div class="stat-num">${App.data.chinese.length}</div><div class="stat-label">古诗文篇目</div></div>
      <div class="card stat-card"><div class="stat-num">${App.data.vocab2050.length}</div><div class="stat-label">核心词汇</div></div>
      <div class="card stat-card"><div class="stat-num">${App.data.vocab700.length + App.data.vocab370.length}</div><div class="stat-label">基础+拓展词汇</div></div>
      <div class="card stat-card"><div class="stat-num">${App.data.irregularVerbs.length}</div><div class="stat-label">不规则动词</div></div>
    </div>
    <div class="home-section">
      <h2>📊 我的学习</h2>
      <div class="grid grid-4">
        <div class="card stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">已学条目</div></div>
        <div class="card stat-card"><div class="stat-num" style="color:var(--success)">${s.mastered}</div><div class="stat-label">已掌握</div></div>
        <div class="card stat-card"><div class="stat-num" style="color:var(--warning)">${s.familiar}</div><div class="stat-label">熟悉中</div></div>
        <div class="card stat-card"><div class="stat-num" style="color:var(--danger)">${s.unfamiliar}</div><div class="stat-label">尚不熟</div></div>
      </div>
    </div>
    <div class="home-section">
      <h2>🚀 快速开始</h2>
      <div class="grid grid-3">
        <div class="card" style="cursor:pointer;text-align:center" onclick="navigate('flashcard')">
          <div style="font-size:2.5rem">🎴</div>
          <h3 style="margin:8px 0">闪卡背诵</h3>
          <p style="font-size:.85rem;color:var(--text-light)">英语单词、不规则动词</p>
        </div>
        <div class="card" style="cursor:pointer;text-align:center" onclick="navigate('recite')">
          <div style="font-size:2.5rem">✍️</div>
          <h3 style="margin:8px 0">古文背诵</h3>
          <p style="font-size:.85rem;color:var(--text-light)">古诗文、文言文</p>
        </div>
        <div class="card" style="cursor:pointer;text-align:center" onclick="navigate('test')">
          <div style="font-size:2.5rem">📝</div>
          <h3 style="margin:8px 0">检验</h3>
          <p style="font-size:.85rem;color:var(--text-light)">词汇/动词/诗文测验</p>
        </div>
        <div class="card" style="cursor:pointer;text-align:center" onclick="navigate('materials')">
          <div style="font-size:2.5rem">📚</div>
          <h3 style="margin:8px 0">资料库</h3>
          <p style="font-size:.85rem;color:var(--text-light)">浏览所有资料</p>
        </div>
      </div>
    </div>
    <div class="home-section">
      <h2>💡 背诵方法</h2>
      <div class="card">
        <p style="line-height:2;font-size:.95rem">
          <strong>简单</strong> — 每次只看一张卡片/一篇诗文，不必贪多。<br>
          <strong>熟悉</strong> — 先通读全文建立印象，再逐步遮盖测试。<br>
          <strong>重复</strong> — 不熟的反复出现，已熟的间隔复习。每天少量多次，效果最佳。
        </p>
      </div>
    </div>
  `;
}

// ===== Materials View =====
function renderMaterials(c) {
  c.innerHTML = `
    <div class="view-header"><h1>资料库</h1><p>浏览所有背诵资料</p></div>
    <div class="material-tabs" id="mat-tabs">
      <button class="tab-btn active" data-cat="chinese">古诗文 60篇</button>
      <button class="tab-btn" data-cat="vocab2050">核心词汇 2050</button>
      <button class="tab-btn" data-cat="vocab700">基础词汇 700</button>
      <button class="tab-btn" data-cat="vocab370">拓展词汇 370</button>
      <button class="tab-btn" data-cat="irregularVerbs">不规则动词 ${App.data.irregularVerbs.length}</button>
    </div>
    <input class="search-box" id="mat-search" placeholder="搜索..." oninput="filterMaterials()">
    <div id="mat-list"></div>
  `;
  document.querySelectorAll('#mat-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#mat-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMaterialList(btn.dataset.cat);
    };
  });
  renderMaterialList('chinese');
}

function renderMaterialList(cat) {
  const list = document.getElementById('mat-list');
  const search = (document.getElementById('mat-search')?.value || '').toLowerCase();
  
  if (cat === 'chinese') {
    let items = App.data.chinese;
    if (search) items = items.filter(p => p.title.includes(search) || (p.author && p.author.includes(search)));
    list.innerHTML = items.map((p, i) => {
      const id = `chinese_${p.title}`;
      const fam = Progress.getFam(id);
      const badge = fam >= 4 ? '<span class="material-badge mastered">已掌握</span>' : fam > 0 ? '<span class="material-badge learning">学习中</span>' : '';
      return `<div class="material-item" onclick="openRecitePiece('${p.title}')">
        <div class="material-info">
          <div class="material-title">${p.title}</div>
          <div class="material-meta">${p.author || ''} · ${p.category} · ${p.part} · ${p.text.length}字</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
  } else if (cat === 'irregularVerbs') {
    let items = App.data.irregularVerbs;
    if (search) items = items.filter(v => v.base.includes(search) || v.meaning.includes(search));
    list.innerHTML = items.map((v, i) => {
      const id = `verb_${v.base}`;
      const fam = Progress.getFam(id);
      const stars = renderStars(fam);
      return `<div class="material-item" onclick="navigate('flashcard');startFlashcard('irregularVerbs','all')">
        <div class="material-info">
          <div class="material-title">${v.base} → ${v.past} → ${v.participle}</div>
          <div class="material-meta">${v.meaning} · ${v.type}型</div>
        </div>
        <div class="fam-stars">${stars}</div>
      </div>`;
    }).join('');
  } else {
    let items = App.data[cat];
    if (search) items = items.filter(v => v.word.toLowerCase().includes(search) || v.meaning.includes(search));
    list.innerHTML = items.map((v, i) => {
      const id = `${cat}_${v.seq}`;
      const fam = Progress.getFam(id);
      const stars = renderStars(fam);
      const freqLabel = v.freq !== undefined ? `词频${v.freq}` : '';
      return `<div class="material-item" onclick="navigate('flashcard');startFlashcard('${cat}','all')">
        <div class="material-info">
          <div class="material-title">${v.word}</div>
          <div class="material-meta">${v.meaning} ${freqLabel}</div>
        </div>
        <div class="fam-stars">${stars}</div>
      </div>`;
    }).join('');
  }
}

function filterMaterials() {
  const activeCat = document.querySelector('#mat-tabs .tab-btn.active')?.dataset.cat || 'chinese';
  renderMaterialList(activeCat);
}

function renderStars(fam) {
  let html = '';
  for (let i = 0; i < 5; i++) html += `<span class="fam-star ${i < fam ? 'active' : ''}">★</span>`;
  return html;
}

// ===== Flashcard View =====
function renderFlashcardSetup(c) {
  // If a session is active, show the card
  if (App.fc.deck.length > 0 && App.fc.index < App.fc.deck.length) {
    renderFlashcard(c);
    return;
  }
  c.innerHTML = `
    <div class="view-header"><h1>闪卡背诵</h1><p>选择资料开始背诵</p></div>
    <div class="session-settings">
      <div class="settings-row">
        <label>选择资料</label>
        <select id="fc-source" onchange="updateRangeMax(this.value)">
          <option value="vocab2050">核心词汇 2050</option>
          <option value="vocab700">基础词汇 700</option>
          <option value="vocab370">拓展词汇 370</option>
          <option value="irregularVerbs">不规则动词 ${App.data.irregularVerbs.length}</option>
        </select>
      </div>
      <div class="settings-row">
        <label>背诵范围</label>
        <select id="fc-mode">
          <option value="all">全部</option>
          <option value="unfamiliar">仅不熟 (★0-1)</option>
          <option value="learning">学习中 (★2-3)</option>
          <option value="mastered">已掌握 (★4-5)</option>
        </select>
      </div>
      <div class="settings-row">
        <label>顺序</label>
        <select id="fc-order" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="seq" selected>正序</option>
          <option value="shuffle">乱序</option>
        </select>
      </div>
      <div class="settings-row">
        <label>范围</label>
        <div style="font-size:.9rem;display:flex;align-items:center;gap:4px">
          第 <input type="number" id="fc-from" value="1" min="1" style="width:56px;padding:6px;border:1px solid var(--border);border-radius:6px"> 
          ~ <input type="number" id="fc-to" style="width:56px;padding:6px;border:1px solid var(--border);border-radius:6px"> 词
        </div>
      </div>
      <div class="settings-row">
        <label>每次张数</label>
        <input type="number" id="fc-count" value="20" min="5" max="100" style="width:80px">
      </div>
    </div>
    <div style="text-align:center;margin-top:24px">
      <button class="btn btn-primary btn-lg" onclick="startFlashcardSession()">开始背诵</button>
    </div>
    <div class="home-section" style="max-width:600px;margin:32px auto 0">
      <div class="card">
        <h3 style="margin-bottom:12px">📖 使用方法</h3>
        <p style="font-size:.9rem;line-height:2;color:var(--text-light)">
          1. 选择资料和范围<br>
          2. 看到单词/动词，先想出释义<br>
          3. 点击卡片翻转查看答案<br>
          4. <strong style="color:var(--success)">认识</strong> → 熟悉度+1<br>
          5. <strong style="color:var(--danger)">不认识</strong> → 熟悉度归0，该词会在本轮重复出现
        </p>
      </div>
    </div>
  `;
}

function startFlashcardSession() {
  const source = document.getElementById('fc-source').value;
  const mode = document.getElementById('fc-mode').value;
  const count = parseInt(document.getElementById('fc-count').value);
  const order = document.getElementById('fc-order')?.value || 'shuffle';
  const fromVal = parseInt(document.getElementById('fc-from')?.value || '1');
  const toVal = parseInt(document.getElementById('fc-to')?.value || '0') || App.data[source].length;
  
  let items = App.data[source].slice();
  
  // Range filter (by seq index, 1-based)
  if (source !== 'irregularVerbs') {
    items = items.filter(item => item.seq >= fromVal && item.seq <= toVal);
  } else {
    items = items.filter((item, i) => i >= fromVal - 1 && i <= toVal - 1);
  }
  
  // Filter by familiarity mode
  items = items.filter(item => {
    const id = source === 'irregularVerbs' ? `verb_${item.base}` : `${source}_${item.seq}`;
    const fam = Progress.getFam(id);
    if (mode === 'unfamiliar') return fam < 2;
    if (mode === 'learning') return fam >= 2 && fam < 4;
    if (mode === 'mastered') return fam >= 4;
    return true;
  });
  
  if (order === 'shuffle') {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  // seq = keep as-is (already sequential)
  
  items = items.slice(0, count);
  
  if (items.length === 0) {
    const msg = mode === 'unfamiliar' ? '没有不熟的单词，试试选择"全部"' : mode === 'mastered' ? '还没有已掌握的单词，继续努力' : '没有符合条件的单词';
    alert(msg);
    return;
  }
  
  App.fc.source = source;
  App.fc.mode = mode;
  App.fc.deck = items;
  App.fc.index = 0;
  App.fc.flipped = false;
  App.fc.sessionCount = 0;
  Progress.incSession();
  render();
}

function updateRangeMax(source) {
  const total = App.data[source]?.length || 0;
  const toInput = document.getElementById('fc-to');
  if (toInput && !toInput.value) toInput.placeholder = total;
  const toQuiz = document.getElementById('qc-to');
  if (toQuiz && !toQuiz.value) toQuiz.placeholder = total;
}

function startFlashcard(source, mode) {
  // Quick start with defaults
  App.fc.source = source;
  App.fc.mode = mode;
  let items = App.data[source].slice();
  items = items.filter(item => {
    const id = source === 'irregularVerbs' ? `verb_${item.base}` : `${source}_${item.seq}`;
    const fam = Progress.getFam(id);
    if (mode === 'unfamiliar') return fam < 2;
    return true;
  });
  // Shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items = items.slice(0, 20);
  App.fc.deck = items;
  App.fc.index = 0;
  App.fc.flipped = false;
  App.fc.sessionCount = 0;
  Progress.incSession();
  render();
}

function getItemId(item) {
  if (App.fc.source === 'irregularVerbs') return `verb_${item.base}`;
  return `${App.fc.source}_${item.seq}`;
}

function renderFlashcard(c) {
  const card = App.fc.deck[App.fc.index];
  if (!card) { renderFlashcardSetup(c); return; }
  const total = App.fc.deck.length;
  const progress = Math.round((App.fc.index / total) * 100);
  const itemId = getItemId(card);
  const fam = Progress.getFam(itemId);
  
  let front, back, forms = '', type = '';
  if (App.fc.source === 'irregularVerbs') {
    front = card.base;
    back = `<div style="margin-bottom:12px">${card.past} / ${card.participle}</div><div>${card.meaning}</div>`;
    forms = `${card.type}型`;
    type = '不规则动词';
  } else {
    front = card.word;
    back = card.meaning;
    if (card.forms) forms = card.forms;
    if (card.freq !== undefined) type = `词频 ${card.freq}`;
  }
  
  c.innerHTML = `
    <div class="view-header"><h1>闪卡背诵</h1><p>来源：${getSourceName(App.fc.source)} · 点击卡片翻转</p></div>
    <div class="flashcard-container">
      <div class="flashcard-progress">
        <span>${App.fc.index + 1} / ${total}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <span>${renderStars(fam)}</span>
      </div>
      <div class="flashcard ${App.fc.flipped ? 'flipped' : ''}" onclick="flipCard()">
        <span class="flashcard-seq">#${App.fc.index + 1}</span>
        <span class="flashcard-type">${type}</span>
        ${App.fc.flipped ? `
          <div class="flashcard-meaning">${back}</div>
          ${forms ? `<div class="flashcard-forms">${forms}</div>` : ''}
          <div class="flashcard-hint">↑ 点击翻回</div>
        ` : `
          <div class="flashcard-word">${front}</div>
          <div class="flashcard-hint">点击查看释义 ↓</div>
        `}
      </div>
      ${App.fc.flipped ? `
        <div class="flashcard-controls">
          <button class="btn btn-danger" onclick="rateCard(false)">✕ 不认识</button>
          <button class="btn btn-success" onclick="rateCard(true)">✓ 认识</button>
        </div>
      ` : ''}
    </div>
  `;
}

function getSourceName(src) {
  const names = { vocab2050: '核心词汇', vocab700: '基础词汇', vocab370: '拓展词汇', irregularVerbs: '不规则动词' };
  return names[src] || src;
}

function flipCard() {
  App.fc.flipped = !App.fc.flipped;
  render();
}

function rateCard(correct) {
  const card = App.fc.deck[App.fc.index];
  const id = getItemId(card);
  const item = Progress.getItem(id);
  let newFam = item.fam;
  if (correct) newFam = Math.min(5, item.fam + 1);
  else newFam = Math.max(0, item.fam - 2);
  Progress.setFam(id, newFam, correct);
  Progress.incReview();
  App.fc.sessionCount++;
  
  // If wrong, add the card back to the end of the deck
  if (!correct && App.fc.index < App.fc.deck.length - 1) {
    // Insert a duplicate near the end (3 positions later)
    const insertPos = Math.min(App.fc.deck.length, App.fc.index + 3);
    App.fc.deck.splice(insertPos, 0, card);
  }
  
  App.fc.index++;
  App.fc.flipped = false;
  
  if (App.fc.index >= App.fc.deck.length) {
    // Session complete
    renderFlashcardComplete();
  } else {
    render();
  }
}

function renderFlashcardComplete() {
  const c = document.getElementById('content');
  c.className = 'fade-in';
  const s = Progress.getStats();
  c.innerHTML = `
    <div class="view-header"><h1>🎉 本轮完成！</h1><p>共复习 ${App.fc.sessionCount} 张卡片</p></div>
    <div class="grid grid-3" style="max-width:600px;margin:0 auto">
      <div class="card stat-card"><div class="stat-num">${App.fc.sessionCount}</div><div class="stat-label">本轮复习</div></div>
      <div class="card stat-card"><div class="stat-num" style="color:var(--success)">${s.mastered}</div><div class="stat-label">总已掌握</div></div>
      <div class="card stat-card"><div class="stat-num" style="color:var(--warning)">${s.unfamiliar}</div><div class="stat-label">尚不熟</div></div>
    </div>
    <div style="text-align:center;margin-top:32px">
      <button class="btn btn-primary btn-lg" onclick="startFlashcardSession()">再来一轮</button>
      <button class="btn btn-outline btn-lg" onclick="navigate('home')" style="margin-left:12px">返回首页</button>
    </div>
  `;
}

// ===== Recitation View (Chinese Literature) =====
function renderReciteList(c) {
  c.innerHTML = `
    <div class="view-header"><h1>古文背诵</h1><p>选择篇目开始背诵 · 先通读熟悉，再遮盖测试</p></div>
    <div class="material-tabs" id="rc-tabs">
      <button class="tab-btn active" data-cat="all">全部 ${App.data.chinese.length}</button>
      <button class="tab-btn" data-cat="文言文">文言文 ${App.data.chinese.filter(p=>p.category==='文言文').length}</button>
      <button class="tab-btn" data-cat="诗词曲">诗词曲 ${App.data.chinese.filter(p=>p.category==='诗词曲').length}</button>
    </div>
    <input class="search-box" id="rc-search" placeholder="搜索篇目或作者..." oninput="filterReciteList()">
    <div class="recite-list" id="rc-list"></div>
  `;
  document.querySelectorAll('#rc-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#rc-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderReciteItemList(btn.dataset.cat);
    };
  });
  renderReciteItemList('all');
}

function renderReciteItemList(cat) {
  const list = document.getElementById('rc-list');
  const search = (document.getElementById('rc-search')?.value || '').toLowerCase();
  let items = App.data.chinese;
  if (cat !== 'all') items = items.filter(p => p.category === cat);
  if (search) items = items.filter(p => p.title.includes(search) || (p.author && p.author.includes(search)));
  
  list.innerHTML = items.map(p => {
    const id = `chinese_${p.title}`;
    const fam = Progress.getFam(id);
    const stars = renderStars(fam);
    return `<div class="recite-item" onclick="openRecitePiece('${p.title.replace(/'/g, "\\'")}')">
      <div class="recite-item-info">
        <div class="recite-item-title">${p.title}</div>
        <div class="recite-item-meta">${p.author || ''} · ${p.part} · ${p.text.length}字</div>
      </div>
      <div class="fam-stars">${stars}</div>
    </div>`;
  }).join('');
}

function filterReciteList() {
  const activeCat = document.querySelector('#rc-tabs .tab-btn.active')?.dataset.cat || 'all';
  renderReciteItemList(activeCat);
}

function openRecitePiece(title) {
  const piece = App.data.chinese.find(p => p.title === title);
  if (!piece) return;
  App.rc.piece = piece;
  App.rc.mode = 'read';
  App.rc.blanks = [];
  App.rc.revealed = new Set();
  App.rc.wrongSet = new Set();
  App.view = 'recite';
  renderRecitePiece();
}

function renderRecitePiece() {
  const c = document.getElementById('content');
  c.className = 'fade-in';
  const p = App.rc.piece;
  const id = `chinese_${p.title}`;
  const fam = Progress.getFam(id);
  
  // Generate text HTML based on mode
  let textHTML;
  if (App.rc.mode === 'read') {
    textHTML = `<div style="white-space:pre-wrap">${escapeHTML(p.text)}</div>`;
  } else {
    // Cloze mode: hide some characters
    textHTML = renderClozeText(p.text);
  }
  
  c.innerHTML = `
    <div class="recite-container">
      <div class="recite-piece-header">
        <div class="recite-title">${p.title}</div>
        <div class="recite-author">${p.author || ''} · ${p.category} · ${p.part}</div>
        <div style="margin-top:8px">${renderStars(fam)}</div>
      </div>
      <div class="recite-modes">
        <button class="mode-btn ${App.rc.mode==='read'?'active':''}" onclick="setReciteMode('read')">📖 通读</button>
        <button class="mode-btn ${App.rc.mode==='cloze'?'active':''}" onclick="setReciteMode('cloze')">🔲 填空</button>
        <button class="mode-btn ${App.rc.mode==='hard'?'active':''}" onclick="setReciteMode('hard')">🔥 挑战</button>
      </div>
      <div class="recite-text">${textHTML}</div>
      ${App.rc.mode !== 'read' ? `
        <div class="recite-controls">
          <button class="btn btn-outline" onclick="revealAll()">全部显示</button>
          <button class="btn btn-outline" onclick="regenerateBlanks()">重新出题</button>
          <button class="btn btn-primary" onclick="rateRecite(true)">背熟了 ✓</button>
          <button class="btn btn-outline" onclick="rateRecite(false)">还需练习</button>
        </div>
      ` : `
        <div class="recite-controls">
          <button class="btn btn-primary" onclick="setReciteMode('cloze')">开始填空测试 →</button>
          <button class="btn btn-outline" onclick="navigate('recite')">返回列表</button>
        </div>
      `}
      ${p.footnotes && p.footnotes.length > 0 ? `
        <details style="margin-top:16px">
          <summary style="cursor:pointer;font-size:.9rem;color:var(--text-light)">查看注释 (${p.footnotes.length}条)</summary>
          <div style="margin-top:12px;padding:16px;background:var(--surface);border-radius:8px;border:1px solid var(--border);font-size:.85rem;line-height:1.8;color:var(--text-light)">
            ${p.footnotes.map(fn => `<div>${escapeHTML(fn)}</div>`).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
  
  // Add click handlers for blanks
  if (App.rc.mode !== 'read') {
    c.querySelectorAll('.blank').forEach(el => {
      el.onclick = function() {
        const idx = parseInt(this.dataset.idx);
        App.rc.revealed.add(idx);
        this.classList.add('revealed');
      };
    });
  }
}

function renderClozeText(text) {
  // For cloze mode, hide ~30% of characters; for hard mode, hide ~60%
  const hideRate = App.rc.mode === 'hard' ? 0.6 : 0.3;
  
  // Generate blanks if not yet generated
  if (App.rc.blanks.length === 0) {
    const chars = Array.from(text);
    const candidates = [];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      // Only hide Chinese characters, not punctuation/spaces
      if (/[\u4e00-\u9fff]/.test(ch)) {
        candidates.push(i);
      }
    }
    // Shuffle and pick
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const numHide = Math.floor(candidates.length * hideRate);
    App.rc.blanks = candidates.slice(0, numHide).sort((a, b) => a - b);
    App.rc.revealed = new Set();
    App.rc.wrongSet = new Set();
  }
  
  // Build HTML with blanks
  const blankSet = new Set(App.rc.blanks);
  let html = '';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    if (blankSet.has(i)) {
      const revealed = App.rc.revealed.has(i);
      html += `<span class="blank ${revealed ? 'revealed' : ''}" data-idx="${i}">${chars[i]}</span>`;
    } else {
      html += escapeHTML(chars[i]);
    }
  }
  return html;
}

function setReciteMode(mode) {
  App.rc.mode = mode;
  App.rc.blanks = [];
  App.rc.revealed = new Set();
  renderRecitePiece();
}

function regenerateBlanks() {
  App.rc.blanks = [];
  App.rc.revealed = new Set();
  renderRecitePiece();
}

function revealAll() {
  App.rc.blanks.forEach(idx => App.rc.revealed.add(idx));
  renderRecitePiece();
}

function rateRecite(correct) {
  const p = App.rc.piece;
  const id = `chinese_${p.title}`;
  const item = Progress.getItem(id);
  let newFam = item.fam;
  if (correct) newFam = Math.min(5, item.fam + 1);
  else newFam = Math.max(0, item.fam - 1);
  Progress.setFam(id, newFam, correct);
  Progress.incReview();
  renderRecitePiece();
}

// ===== Progress View =====
function renderProgress(c) {
  const s = Progress.getStats();
  
  // Category breakdown
  const cats = [
    { name: '古诗文', items: App.data.chinese.map(p => `chinese_${p.title}`) },
    { name: '核心词汇', items: App.data.vocab2050.map(v => `vocab2050_${v.seq}`) },
    { name: '基础词汇', items: App.data.vocab700.map(v => `vocab700_${v.seq}`) },
    { name: '拓展词汇', items: App.data.vocab370.map(v => `vocab370_${v.seq}`) },
    { name: '不规则动词', items: App.data.irregularVerbs.map(v => `verb_${v.base}`) },
  ];
  
  const catProgress = cats.map(cat => {
    const learned = cat.items.filter(id => Progress.getItem(id).fam > 0).length;
    const mastered = cat.items.filter(id => Progress.getItem(id).fam >= 4).length;
    return { ...cat, total: cat.items.length, learned, mastered };
  });
  
  c.innerHTML = `
    <div class="view-header"><h1>学习进度</h1><p>总览你的背诵情况</p></div>
    <div class="grid grid-4" style="margin-bottom:32px">
      <div class="card stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">已学条目</div></div>
      <div class="card stat-card"><div class="stat-num" style="color:var(--success)">${s.mastered}</div><div class="stat-label">已掌握</div></div>
      <div class="card stat-card"><div class="stat-num" style="color:var(--warning)">${s.familiar}</div><div class="stat-label">熟悉中</div></div>
      <div class="card stat-card"><div class="stat-num">${s.reviews}</div><div class="stat-label">总复习次数</div></div>
    </div>
    <div class="progress-section">
      <h2>分类进度</h2>
      ${catProgress.map(cat => {
        const pct = cat.total > 0 ? Math.round((cat.mastered / cat.total) * 100) : 0;
        const learnedPct = cat.total > 0 ? Math.round((cat.learned / cat.total) * 100) : 0;
        return `<div class="progress-item">
          <div class="progress-item-label">${cat.name}</div>
          <div class="progress-item-bar">
            <div class="progress-item-fill" style="width:${pct}%;background:var(--success)">${pct > 15 ? pct + '%掌握' : ''}</div>
          </div>
          <div class="progress-item-num">${cat.learned}/${cat.total}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="progress-section">
      <h2>熟悉度分布</h2>
      <div class="grid grid-5" style="display:flex;gap:16px;flex-wrap:wrap">
        ${[0,1,2,3,4,5].map(level => {
          const count = Object.values(Progress.data.items).filter(i => i.fam === level).length;
          const colors = ['#e5e7eb','#fca5a5','#fcd34d','#fde68a','#86efac','#22c55e'];
          const labels = ['未学','不熟','一般','较熟','熟悉','精通'];
          return `<div class="card stat-card" style="min-width:100px">
            <div class="stat-num" style="color:${colors[level]}">${count}</div>
            <div class="stat-label">${labels[level]} ${'★'.repeat(level)||'☆'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="progress-section" style="text-align:center;margin-top:32px">
      <button class="btn btn-outline" onclick="if(confirm('确定要重置所有进度吗？此操作不可撤销。')){localStorage.removeItem(Progress.key);Progress.load();render();}">重置所有进度</button>
    </div>
  `;
}

// ===== Test / Quiz =====
function renderTest(c) {
  if (App.quiz.phase === 'setup') {
    renderQuizSetup(c);
  } else if (App.quiz.phase === 'running') {
    renderQuizRunning(c);
  } else {
    renderQuizResults(c);
  }
}

function renderQuizSetup(c) {
  c.innerHTML = `
    <div class="view-header"><h1>📝 检验</h1><p>测试你的背诵成果</p></div>
    <div class="quiz-container">
      <div class="quiz-type-grid">
        <div class="quiz-type-card" onclick="startQuiz('vocab')">
          <div class="quiz-type-icon">🔤</div>
          <div class="quiz-type-title">词汇测验</div>
          <div class="quiz-type-desc">四选一<br>英↔中双向出题</div>
        </div>
        <div class="quiz-type-card" onclick="startQuiz('verb')">
          <div class="quiz-type-icon">📝</div>
          <div class="quiz-type-title">动词测验</div>
          <div class="quiz-type-desc">不规则动词<br>原形/过去/分词</div>
        </div>
        <div class="quiz-type-card" onclick="startQuiz('poetry')">
          <div class="quiz-type-icon">📜</div>
          <div class="quiz-type-title">诗文默写</div>
          <div class="quiz-type-desc">填空默写<br>按难度出题</div>
        </div>
      </div>
      <div id="quiz-config-panel"></div>
    </div>
  `;
  document.getElementById('quiz-config-panel').innerHTML = `
    <div class="card" style="text-align:center">
      <p style="font-size:.9rem;color:var(--text-light)">选择一种测验类型开始</p>
    </div>
  `;
}

function startQuiz(type) {
  const panel = document.getElementById('quiz-config-panel');
  App.quiz.type = type;
  if (type === 'vocab') renderVocabConfig(panel);
  else if (type === 'verb') renderVerbConfig(panel);
  else renderPoetryConfig(panel);
}

function renderVocabConfig(panel) {
  panel.innerHTML = `
    <div class="card" style="margin-top:8px">
      <h3 style="margin-bottom:16px">词汇测验设置</h3>
      <div class="settings-row"><label>词汇来源</label>
        <select id="qc-source" onchange="updateRangeMax(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="vocab2050">核心词汇 2050</option>
          <option value="vocab700">基础词汇 700</option>
          <option value="vocab370">拓展词汇 370</option>
        </select>
      </div>
      <div class="settings-row"><label>出题方向</label>
        <select id="qc-direction" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="en2zh">英 → 中（看英文选中文）</option>
          <option value="zh2en">中 → 英（看中文选英文）</option>
          <option value="mix">混合</option>
        </select>
      </div>
      <div class="settings-row"><label>顺序</label>
        <select id="qc-order" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="seq" selected>正序</option>
          <option value="shuffle">乱序</option>
        </select>
      </div>
      <div class="settings-row"><label>范围</label>
        <div style="font-size:.9rem;display:flex;align-items:center;gap:4px">
          第 <input type="number" id="qc-from" value="1" min="1" style="width:56px;padding:6px;border:1px solid var(--border);border-radius:6px"> 
          ~ <input type="number" id="qc-to" style="width:56px;padding:6px;border:1px solid var(--border);border-radius:6px"> 词
        </div>
      </div>
      <div class="settings-row"><label>题量</label>
        <select id="qc-count" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="5">5 题</option>
          <option value="10" selected>10 题</option>
          <option value="20">20 题</option>
          <option value="30">30 题</option>
          <option value="50">50 题</option>
        </select>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary btn-lg" onclick="launchVocabQuiz()">开始测验</button>
        <button class="btn btn-outline" onclick="renderQuizSetup(document.getElementById('content'))">返回</button>
      </div>
    </div>
  `;
}

function renderVerbConfig(panel) {
  panel.innerHTML = `
    <div class="card" style="margin-top:8px">
      <h3 style="margin-bottom:16px">动词测验设置</h3>
      <div class="settings-row"><label>出题方向</label>
        <select id="qc-verb-dir" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="base2past">原形 → 过去式</option>
          <option value="base2part">原形 → 过去分词</option>
          <option value="past2base">过去式 → 原形</option>
          <option value="part2base">过去分词 → 原形</option>
          <option value="mix">混合</option>
        </select>
      </div>
      <div class="settings-row"><label>题量</label>
        <select id="qc-count" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="5">5 题</option>
          <option value="10" selected>10 题</option>
          <option value="15">15 题</option>
          <option value="30">30 题</option>
        </select>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary btn-lg" onclick="launchVerbQuiz()">开始测验</button>
        <button class="btn btn-outline" onclick="renderQuizSetup(document.getElementById('content'))">返回</button>
      </div>
    </div>
  `;
}

function renderPoetryConfig(panel) {
  const pieces = App.data.chinese;
  panel.innerHTML = `
    <div class="card" style="margin-top:8px">
      <h3 style="margin-bottom:16px">诗文默写设置</h3>
      <div class="settings-row"><label>难度</label>
        <select id="qc-difficulty" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.9rem">
          <option value="0.15">简单 (15%空)</option>
          <option value="0.3" selected>中等 (30%空)</option>
          <option value="0.5">困难 (50%空)</option>
          <option value="0.7">地狱 (70%空)</option>
        </select>
      </div>
      <label style="font-size:.9rem;display:block;margin-top:12px">选择篇目（不选则随机）</label>
      <div class="quiz-piece-select" style="margin-top:8px;max-height:200px;overflow-y:auto">
        ${pieces.map(p => `
          <div class="quiz-piece-option" data-title="${escapeHTML(p.title)}" onclick="toggleQuizPiece(this)">
            ${escapeHTML(p.title)} <span style="font-size:.8rem;color:var(--text-light)">${p.text.length}字</span>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary btn-lg" onclick="launchPoetryQuiz()">开始默写</button>
        <button class="btn btn-outline" onclick="renderQuizSetup(document.getElementById('content'))">返回</button>
      </div>
    </div>
  `;
}

function toggleQuizPiece(el) {
  el.classList.toggle('selected');
}

function launchVocabQuiz() {
  const source = document.getElementById('qc-source').value;
  const dir = document.getElementById('qc-direction').value;
  const count = parseInt(document.getElementById('qc-count').value);
  const order = document.getElementById('qc-order')?.value || 'shuffle';
  const fromVal = parseInt(document.getElementById('qc-from')?.value || '1');
  const toVal = parseInt(document.getElementById('qc-to')?.value || '0') || App.data[source].length;
  App.quiz.config = { source, direction: dir, count, order, from: fromVal, to: toVal };
  App.quiz.questions = generateVocabQuestions(source, dir, count, order, fromVal, toVal);
  App.quiz.current = 0;
  App.quiz.answers = [];
  App.quiz.score = 0;
  App.quiz.phase = 'running';
  App.quiz.startTime = Date.now();
  App.quiz.repeatMode = false;
  Progress.incSession();
  render();
}

function launchVerbQuiz() {
  const dir = document.getElementById('qc-verb-dir').value;
  const count = parseInt(document.getElementById('qc-count').value);
  App.quiz.config = { direction: dir, count };
  App.quiz.questions = generateVerbQuestions(dir, count);
  App.quiz.current = 0;
  App.quiz.answers = [];
  App.quiz.score = 0;
  App.quiz.phase = 'running';
  App.quiz.startTime = Date.now();
  App.quiz.repeatMode = false;
  Progress.incSession();
  render();
}

function launchPoetryQuiz() {
  const difficulty = parseFloat(document.getElementById('qc-difficulty').value);
  let piece = null;
  const selected = document.querySelector('.quiz-piece-option.selected');
  if (selected) {
    piece = App.data.chinese.find(p => p.title === selected.dataset.title);
  } else {
    piece = App.data.chinese[Math.floor(Math.random() * App.data.chinese.length)];
  }
  if (!piece) return;
  App.quiz.config = { difficulty, piece };
  App.quiz.questions = generatePoetryQuestions(piece, difficulty);
  App.quiz.current = 0;
  App.quiz.answers = [];
  App.quiz.score = 0;
  App.quiz.phase = 'running';
  App.quiz.startTime = Date.now();
  App.quiz.repeatMode = false;
  Progress.incSession();
  render();
}

// ===== Quiz Question Generators =====

function generateVocabQuestions(source, direction, count, order, fromVal, toVal) {
  let pool = App.data[source].slice();
  // Range filter
  if (fromVal && toVal) {
    pool = pool.filter(item => item.seq >= fromVal && item.seq <= toVal);
  }
  const shuffled = pool.slice();
  if (order !== 'seq') {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  const selected = shuffled.slice(0, Math.max(count * 2, 20)); // extra for distractors
  
  const questions = [];
  for (let i = 0; i < count && i < selected.length; i++) {
    const item = selected[i];
    const itemDir = direction === 'mix' ? (Math.random() < 0.5 ? 'en2zh' : 'zh2en') : direction;
    const options = getVocabDistractors(item, selected, itemDir, 3);
    if (!options) continue;
    const answer = itemDir === 'en2zh' ? item.meaning : item.word;
    const display = itemDir === 'en2zh' ? item.word : item.meaning;
    questions.push({
      type: 'vocab', direction: itemDir,
      display, answer, options,
      itemId: `${source}_${item.seq}`,
      word: item.word, meaning: item.meaning
    });
  }
  return questions;
}

function getVocabDistractors(item, pool, direction, n) {
  // Find n similar distractors
  const distractors = [];
  const seen = new Set([item.word]);
  for (let i = 0; i < pool.length && distractors.length < n; i++) {
    const c = pool[i];
    if (seen.has(c.word)) continue;
    seen.add(c.word);
    distractors.push(direction === 'en2zh' ? c.meaning : c.word);
  }
  if (distractors.length < n) return null;
  const correct = direction === 'en2zh' ? item.meaning : item.word;
  const allOpts = [correct, ...distractors];
  shuffleArr(allOpts);
  return allOpts;
}

function generateVerbQuestions(direction, count) {
  const pool = App.data.irregularVerbs;
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, Math.max(count * 2, 30));
  const allForms = pool.map(v => v.base).concat(pool.map(v => v.past)).concat(pool.map(v => v.participle));
  const uniqueForms = [...new Set(allForms)].filter(f => f.length > 0);
  
  const questions = [];
  for (let i = 0; i < count && i < selected.length; i++) {
    const v = selected[i];
    let itemDir = direction;
    if (direction === 'mix') itemDir = ['base2past','base2part','past2base','part2base'][Math.floor(Math.random()*4)];
    
    let display, answer;
    if (itemDir === 'base2past') { display = v.base; answer = v.past; }
    else if (itemDir === 'base2part') { display = v.base; answer = v.participle; }
    else if (itemDir === 'past2base') { display = v.past; answer = v.base; }
    else { display = v.participle; answer = v.base; }
    
    const distractors = getVerbDistractors(v, selected, itemDir, 3);
    if (!distractors) continue;
    const allOpts = [answer, ...distractors];
    shuffleArr(allOpts);
    questions.push({
      type: 'verb', direction: itemDir,
      display, answer, options: allOpts,
      itemId: `verb_${v.base}`,
      base: v.base, past: v.past, participle: v.participle, meaning: v.meaning
    });
  }
  return questions;
}

function getVerbDistractors(v, pool, direction, n) {
  const distractors = [];
  const seen = new Set([v.past, v.participle]);
  const candidates = pool.filter(x => x.base !== v.base);
  shuffleArr(candidates);
  for (const c of candidates) {
    if (distractors.length >= n) break;
    let form;
    if (direction === 'base2past') form = c.past;
    else if (direction === 'base2part') form = c.participle;
    else form = c.base;
    if (!seen.has(form)) { seen.add(form); distractors.push(form); }
  }
  return distractors.length >= n ? distractors : null;
}

function generatePoetryQuestions(piece, difficulty) {
  const chars = Array.from(piece.text);
  const candidates = [];
  for (let i = 0; i < chars.length; i++) {
    if (/[\u4e00-\u9fff]/.test(chars[i])) candidates.push(i);
  }
  shuffleArr(candidates);
  const numHide = Math.max(1, Math.floor(candidates.length * difficulty));
  const blankIndices = candidates.slice(0, numHide).sort((a, b) => a - b);
  const blanks = blankIndices.map(idx => ({ index: idx, answer: chars[idx] }));
  return [{
    type: 'poetry', piece: piece,
    text: piece.text, blanks
  }];
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== Quiz Running View =====

function renderQuizRunning(c) {
  if (App.quiz.questions.length === 0) {
    App.quiz.phase = 'results';
    renderQuizResults(c);
    return;
  }
  const q = App.quiz.questions[App.quiz.current];
  const total = App.quiz.questions.length;
  const progress = (App.quiz.current / total) * 100;
  const elapsed = Math.round((Date.now() - App.quiz.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  
  if (q.type === 'poetry') {
    renderPoetryRunning(c, q, progress, total, elapsed, mins, secs);
  } else {
    renderMultipleChoiceRunning(c, q, progress, total, elapsed, mins, secs);
  }
}

function renderMultipleChoiceRunning(c, q, progress, total, elapsed, mins, secs) {
  const dirLabels = {
    en2zh: '看英文选中文释义', zh2en: '看中文选英文单词',
    base2past: '原形 → 过去式', base2part: '原形 → 过去分词',
    past2base: '过去式 → 原形', part2base: '过去分词 → 原形',
    mix: ''
  };
  c.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-header">
        <div class="quiz-progress-wrap">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${progress}%"></div></div>
          <div class="quiz-info">
            <span>第 ${App.quiz.current + 1} / ${total} 题</span>
            <span>⏱ ${mins}:${String(secs).padStart(2,'0')}</span>
          </div>
        </div>
      </div>
      <div class="quiz-question-area">
        <div class="quiz-question-label">${dirLabels[q.direction] || q.direction}</div>
        <div class="quiz-question-text">${escapeHTML(q.display)}</div>
        ${q.type === 'verb' ? `<div class="quiz-question-hint">释义：${escapeHTML(q.meaning)}</div>` : ''}
      </div>
      <div class="quiz-options" id="quiz-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option" data-idx="${i}" onclick="selectQuizOption(${i})">${escapeHTML(opt)}</button>
        `).join('')}
      </div>
      <div class="quiz-nav">
        <button class="btn btn-outline" onclick="skipQuizQuestion()">跳过</button>
        <button class="btn btn-primary" id="quiz-next-btn" disabled onclick="nextQuizQuestion()" style="opacity:.5">下一题 →</button>
      </div>
    </div>
  `;
}

function renderPoetryRunning(c, q, progress, total, elapsed, mins, secs) {
  const text = q.text;
  const blankSet = new Set(q.blanks.map(b => b.index));
  let html = '';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    if (blankSet.has(i)) {
      html += `<input class="quiz-input-blank" type="text" maxlength="1" data-idx="${i}" data-answer="${chars[i]}" 
        placeholder="　" autocomplete="off">`;
    } else {
      html += escapeHTML(chars[i]);
    }
  }
  c.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-header">
        <div class="quiz-progress-wrap">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${progress}%"></div></div>
          <div class="quiz-info">
            <span>${q.blanks.length} 空</span>
            <span>⏱ ${mins}:${String(secs).padStart(2,'0')}</span>
          </div>
        </div>
      </div>
      <div class="quiz-question-area" style="text-align:left;font-family:var(--font-serif);font-size:1.1rem;line-height:2.2;white-space:pre-wrap">
        <div style="text-align:center;margin-bottom:12px;font-family:var(--font-sans)">
          <div style="font-weight:600;font-size:1.1rem">${escapeHTML(q.piece.title)}</div>
          <div style="font-size:.85rem;color:var(--text-light)">${escapeHTML(q.piece.author || '')}</div>
        </div>
        ${html}
      </div>
      <div class="quiz-nav">
        <button class="btn btn-outline" onclick="skipQuizQuestion()">跳过</button>
        <button class="btn btn-primary" onclick="submitPoetryQuiz()">提交答案</button>
      </div>
    </div>
  `;
  // Focus first blank
  setTimeout(() => {
    const first = c.querySelector('.quiz-input-blank');
    if (first) first.focus();
  }, 100);
  // Enter key handler
  c.querySelectorAll('.quiz-input-blank').forEach((input, i, arr) => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (i < arr.length - 1) arr[i+1].focus();
        else submitPoetryQuiz();
      }
    });
  });
}

function selectQuizOption(idx) {
  const btns = document.querySelectorAll('.quiz-option');
  if (Array.from(btns).some(b => b.classList.contains('selected'))) return; // already answered
  
  const q = App.quiz.questions[App.quiz.current];
  const selected = q.options[idx];
  const correct = selected === q.answer;
  
  // Highlight
  btns.forEach((b, i) => {
    b.classList.add('disabled');
    if (q.options[i] === q.answer) b.classList.add('correct');
    if (i === idx && !correct) b.classList.add('wrong');
  });
  
  App.quiz.answers.push({
    itemId: q.itemId, selected, correct, answer: q.answer, display: q.display
  });
  if (correct) App.quiz.score++;
  Progress.incReview();
  
  // Update progress familiarity
  if (correct) {
    const item = Progress.getItem(q.itemId);
    Progress.setFam(q.itemId, Math.min(5, item.fam + 1), true);
  } else {
    Progress.setFam(q.itemId, Math.max(0, Progress.getFam(q.itemId) - 1), false);
  }
  
  // Enable next button
  const nextBtn = document.getElementById('quiz-next-btn');
  if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = '1'; }
}

function nextQuizQuestion() {
  App.quiz.current++;
  render();
}

function skipQuizQuestion() {
  const q = App.quiz.questions[App.quiz.current];
  App.quiz.answers.push({ itemId: q.itemId, selected: null, correct: false, answer: q.answer, display: q.display });
  App.quiz.current++;
  render();
}

function submitPoetryQuiz() {
  const q = App.quiz.questions[App.quiz.current];
  const inputs = document.querySelectorAll('.quiz-input-blank');
  let correct = 0;
  inputs.forEach(input => {
    const user = input.value.trim();
    const answer = input.dataset.answer;
    if (user === answer) { input.classList.add('correct'); correct++; }
    else { input.classList.add('wrong'); }
  });
  const total = q.blanks.length;
  App.quiz.score = correct;
  App.quiz.answers.push({
    itemId: `chinese_${q.piece.title}`, selected: correct, correct: correct === total,
    answer: total, display: `${correct}/${total}`
  });
  if (correct === total) {
    Progress.setFam(`chinese_${q.piece.title}`, Math.min(5, Progress.getFam(`chinese_${q.piece.title}`) + 1), true);
  } else {
    Progress.setFam(`chinese_${q.piece.title}`, Math.max(0, Progress.getFam(`chinese_${q.piece.title}`) - 1), false);
  }
  Progress.incReview();
  App.quiz.current++;
  render();
}

// ===== Quiz Results View =====

function repeatWrongQuestions() {
  // Collect wrong answers from the quiz
  const wrongAnswers = App.quiz.answers.filter(a => !a.correct);
  if (wrongAnswers.length === 0) return;
  
  // Rebuild questions from wrong answers' source items
  const wrongQuestions = [];
  for (const ans of wrongAnswers) {
    // Find the original question
    const origQ = App.quiz.questions.find(q => q.itemId === ans.itemId);
    if (origQ) {
      // Re-shuffle options
      const newOpts = origQ.options.slice();
      shuffleArr(newOpts);
      wrongQuestions.push({ ...origQ, options: newOpts });
    }
  }
  
  if (wrongQuestions.length === 0) return;
  
  App.quiz.questions = wrongQuestions;
  App.quiz.current = 0;
  App.quiz.answers = [];
  App.quiz.score = 0;
  App.quiz.phase = 'running';
  App.quiz.startTime = Date.now();
  App.quiz.repeatMode = true;
  Progress.incSession();
  render();
}

function renderQuizResults(c) {
  const total = App.quiz.questions.length;
  const score = App.quiz.score;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const elapsed = Math.round((Date.now() - App.quiz.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const level = pct >= 90 ? 'excellent' : pct >= 60 ? 'good' : 'poor';
  const levelText = pct >= 90 ? '优秀！' : pct >= 60 ? '不错！' : '继续加油！';
  const levelColor = pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  
  c.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-result">
        <div class="quiz-score-circle quiz-score-${level}" style="border-color:${levelColor}">
          <div class="quiz-score-pct" style="color:${levelColor}">${pct}%</div>
          <div class="quiz-score-label">正确率</div>
        </div>
        <h2 style="margin-bottom:8px;color:${levelColor}">${App.quiz.repeatMode ? '🔄 重复错题 ' : ''}${levelText}</h2>
        <div class="quiz-result-stats">
          <div class="quiz-result-stat"><div class="quiz-result-stat-num" style="color:var(--success)">${score}</div><div class="quiz-result-stat-label">正确</div></div>
          <div class="quiz-result-stat"><div class="quiz-result-stat-num" style="color:var(--danger)">${total - score}</div><div class="quiz-result-stat-label">错误</div></div>
          <div class="quiz-result-stat"><div class="quiz-result-stat-num">${mins}:${String(secs).padStart(2,'0')}</div><div class="quiz-result-stat-label">用时</div></div>
        </div>
        ${App.quiz.answers.filter(a => !a.correct).length > 0 ? `
        <div class="quiz-review-list">
          <h3 style="margin-bottom:12px">错题回顾</h3>
          ${App.quiz.answers.filter(a => !a.correct).map(a => `
            <div class="quiz-review-item wrong">
              <div class="quiz-review-q">${escapeHTML(a.display || '')}</div>
              <div class="quiz-review-a">
                正确答案：<span class="correct">${escapeHTML(String(a.answer))}</span>
                ${a.selected ? ` | 你的答案：<span class="your">${escapeHTML(String(a.selected))}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>` : ''}
        <div class="quiz-nav">
          ${App.quiz.answers.filter(a => !a.correct).length > 0 ? `
          <button class="btn btn-danger btn-lg" onclick="repeatWrongQuestions()">🔄 重复错题 (${App.quiz.answers.filter(a => !a.correct).length})</button>
          ` : ''}
          <button class="btn btn-primary btn-lg" onclick="renderTest(document.getElementById('content'));App.quiz.phase='setup';">再测一次</button>
          <button class="btn btn-outline btn-lg" onclick="navigate('test')">换类型</button>
          <button class="btn btn-outline" onclick="navigate('progress')">查看进度</button>
        </div>
      </div>
    </div>
  `;
  App.quiz.phase = 'results';
}

// ===== Utility =====
function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateQuickStats() {
  const el = document.getElementById('quick-stats');
  if (!el) return;
  const s = Progress.getStats();
  el.innerHTML = `
    <div>已学 <strong>${s.total}</strong> 条</div>
    <div>掌握 <strong style="color:var(--success)">${s.mastered}</strong></div>
    <div>待复习 <strong style="color:var(--danger)">${s.unfamiliar}</strong></div>
  `;
}

// ===== Init =====
async function init() {
  Progress.load();
  await loadData();
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => navigate(el.dataset.view);
  });
  
  // Mobile menu
  document.getElementById('menu-toggle').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
  };
  
  render();
}

init();
