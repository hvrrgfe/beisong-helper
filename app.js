/* 背背 BeiBei - 前端 */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c]));

const S = {
  state: { library: [], progress: { items: {}, wrong: [], daily: {} }, settings: {} },
  view: 'library',
  sel: { read: null, recite: null, quiz: null },
  audio: document.getElementById('player'),
  stopFlag: false,
  loopOn: false,
  shadowOn: false,
  quiz: { list: [], i: 0, results: [] },
  types: { fill: true, choice: true, dictation: true, translate: false },
  blanks: 0.3,
  blankMode: 'word',
  recorder: null,
  recChunks: [],
  health: {},
  staticLibrary: [],
  vocab: [],
  dict: [],
  quizSource: 'text',
};

/* ---------------- 基础 ---------------- */
let MODE = 'static';               // server（电脑本地）| static（GitHub Pages 外网版）
const LS = {
  lib: 'beibei_userlib', prog: 'beibei_prog', set: 'beibei_set',
};
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function gapFor(level) { return [0, 1, 2, 4, 7, 15, 30][Math.min(6, level)] * 86400; }

function localApi(path, body) {
  if (path === '/api/state') {
    const base = S.staticLibrary || [];
    const user = lsGet(LS.lib, []);
    return {
      library: base.concat(user),
      progress: lsGet(LS.prog, { items: {}, wrong: [], daily: {} }),
      settings: { ...DEFAULT_SETTINGS_LOCAL, ...lsGet(LS.set, {}) },
    };
  }
  if (path === '/api/health') return { sovits: false, edge: false, mode: 'static' };
  if (path === '/api/library/save') {
    const user = lsGet(LS.lib, []);
    const item = { ...body };
    if (item.id) {
      const i = user.findIndex(x => x.id === item.id);
      if (i >= 0) { item.updated = Date.now(); user[i] = item; }
      else user.push(item);
    } else {
      item.id = 'u' + Date.now();
      item.created = item.updated = Date.now();
      item.user = true;
      user.push(item);
    }
    lsSet(LS.lib, user);
    return { ok: true, id: item.id, library: S.staticLibrary.concat(user) };
  }
  if (path === '/api/library/delete') {
    const user = lsGet(LS.lib, []).filter(x => x.id !== body.id);
    lsSet(LS.lib, user);
    const prog = lsGet(LS.prog, { items: {}, wrong: [], daily: {} });
    delete prog.items[body.id];
    lsSet(LS.prog, prog);
    return { ok: true, library: S.staticLibrary.concat(user) };
  }
  if (path === '/api/progress') {
    const prog = lsGet(LS.prog, { items: {}, wrong: [], daily: {} });
    prog.items = prog.items || {};
    const it = prog.items[body.id] = prog.items[body.id] || {};
    Object.entries(body.patch || {}).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'number' && typeof it[k] === 'number') it[k] += v; else it[k] = v;
    });
    lsSet(LS.prog, prog);
    return { ok: true, item: it };
  }
  if (path === '/api/quiz/answer') {
    const prog = lsGet(LS.prog, { items: {}, wrong: [], daily: {} });
    const today = new Date().toISOString().slice(0, 10);
    prog.daily = prog.daily || {};
    prog.daily[today] = prog.daily[today] || { read: 0, recite: 0, quiz: 0, right: 0 };
    prog.daily[today].quiz++;
    if (body.correct) prog.daily[today].right++;
    const q = { ...(body.question || {}) };
    q.qid = q.qid || ('q' + Date.now() + Math.random().toString(36).slice(2, 6));
    q.itemId = body.itemId; q.correct = !!body.correct;
    q.reviewed = (q.reviewed || 0) + 1; q.lastAt = Date.now();
    q.level = body.correct ? Math.min(6, (q.level || 0) + 1) : 0;
    q.nextReview = Date.now() + gapFor(q.level) * 1000;
    prog.wrong = prog.wrong || [];
    const i = prog.wrong.findIndex(x => x.qid === q.qid);
    if (i >= 0) prog.wrong[i] = q; else prog.wrong.push(q);
    lsSet(LS.prog, prog);
    return { ok: true, question: q };
  }
  if (path === '/api/settings') {
    const s = { ...lsGet(LS.set, {}), ...(body || {}) };
    lsSet(LS.set, s);
    return { ok: true, settings: { ...DEFAULT_SETTINGS_LOCAL, ...s } };
  }
  if (path === '/api/sovits/voices') return { voices: [] };
  return Promise.reject(new Error('静态模式不支持该接口'));
}
const DEFAULT_SETTINGS_LOCAL = {
  ttsProvider: 'browser', edgeVoiceZh: 'zh-CN-XiaoxiaoNeural', edgeVoiceEn: 'en-US-JennyNeural',
  speed: 1, repeatGap: 0.6, customTtsUrl: '', words: '',
};

async function api(path, body) {
  if (MODE === 'static') return localApi(path, body);
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch(path, opt);
  const ct = r.headers.get('Content-Type') || '';
  if (!ct.includes('json')) { if (!r.ok) throw new Error(await r.text()); return r; }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || '请求失败');
  return j;
}
function toast(msg, ms = 2200) {
  const w = $('#toastWrap');
  const t = el('div', 'toast', esc(msg));
  w.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function modal(title, bodyNode, onOk, okText) {
  const wrap = $('#modalWrap');
  wrap.innerHTML = '';
  const m = el('div', 'modal');
  const s = el('div', 'sheet');
  s.appendChild(el('h3', '', esc(title)));
  s.appendChild(bodyNode);
  const row = el('div', 'row', '');
  row.style.marginTop = '14px';
  const cancel = el('button', 'btn grow', '取消');
  const ok = el('button', 'btn pri grow', okText || '保存');
  row.appendChild(cancel); row.appendChild(ok);
  s.appendChild(row);
  m.appendChild(s); wrap.appendChild(m);
  cancel.onclick = () => wrap.innerHTML = '';
  ok.onclick = () => { if (onOk(bodyNode) !== false) wrap.innerHTML = ''; };
  return { close: () => wrap.innerHTML = '' };
}

/* ---------------- 文本处理 ---------------- */
const ZH_STOP = '的了是在和有我你他她它们这那之乎者也与及其对于所以但是因为如果虽然并且不过还是已经也许可能一下一些什么怎样为了因为'.split('');
const EN_STOP = new Set(('a an the is are was were be been being to of in on at for with and or but if then so as by from that this these those it its i you he she they we my your his her their our not no do does did have has had will would can could should may might there here what when where who how why all any some more most other than too very just also into out up down over under again further once about'.split(' ')));

function splitSentences(text, lang) {
  text = (text || '').replace(/\r/g, '');
  const out = [];
  let buf = '';
  const terms = lang === 'en' ? /([.!?;]+["')\]]?|\n+)/ : /([。！？；…]+["'」』）)]?|\n+)/;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    buf += c;
    if (terms.test(c) && /[。！？；….!?;\n]/.test(c)) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  // 过长句子再切
  const res = [];
  out.forEach(s => {
    if (s.length <= 90) { res.push(s); return; }
    const parts = []; let cur = '';
    for (const ch of s) {
      cur += ch;
      if ('，,、；;：:'.includes(ch) && cur.length > 12) { parts.push(cur); cur = ''; }
    }
    if (cur.trim()) parts.push(cur);
    let acc = '';
    parts.forEach(p => {
      if ((acc + p).length > 60 && acc) { res.push(acc.trim()); acc = p; }
      else acc += p;
    });
    if (acc.trim()) res.push(acc.trim());
  });
  return res.length ? res : [text.trim()];
}
function isCJK(ch) { return /[\u4e00-\u9fff]/.test(ch); }

function contentSpans(sent, lang) {
  // 返回可用于挖空的片段
  const spans = [];
  if (lang === 'en') {
    const re = /[A-Za-z][A-Za-z'-]*/g; let m;
    while ((m = re.exec(sent))) {
      const w = m[0];
      if (w.length < 3 || EN_STOP.has(w.toLowerCase())) continue;
      spans.push({ start: m.index, end: m.index + w.length, word: w });
    }
  } else {
    for (let i = 0; i < sent.length; i++) {
      if (isCJK(sent[i]) && !ZH_STOP.includes(sent[i])) {
        const len = Math.min(3, sent.length - i);
        const w = sent.slice(i, i + len);
        if (len >= 2) spans.push({ start: i, end: i + len, word: w });
      }
    }
  }
  return spans;
}
function maskSentence(sent, lang, ratio) {
  const spans = contentSpans(sent, lang);
  if (!spans.length) return null;
  const n = Math.max(1, Math.round(spans.length * ratio));
  const chosen = [];
  const used = new Set();
  let guard = 0;
  while (chosen.length < n && guard++ < 200) {
    const s = spans[Math.floor(Math.random() * spans.length)];
    if (used.has(s.start)) continue;
    if (chosen.some(c => !(s.end <= c.start || s.start >= c.end))) continue;
    used.add(s.start); chosen.push(s);
  }
  if (!chosen.length) return null;
  chosen.sort((a, b) => a.start - b.start);
  let html = '', p = 0;
  chosen.forEach(c => {
    html += esc(sent.slice(p, c.start)) + '<span class="bl" data-a="' + esc(c.word) + '">' + '＿'.repeat(Math.min(4, c.word.length)) + '</span>';
    p = c.end;
  });
  html += esc(sent.slice(p));
  return { html, answers: chosen.map(c => c.word) };
}
function normalize(s) {
  return (s || '').toLowerCase().replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？；：、,.!?;:"'“”‘’()（）【】\[\]…—\-]/g, '');
}
function diffText(a, b) {
  // 极简 LCS diff：b 为用户输入，a 为标准
  const A = [...a], B = [...b];
  const n = A.length, m = B.length;
  if (n * m > 400000) return { html: esc(b), stats: { right: 0, wrong: 0, miss: 0 } };
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][ j + 1]);
  let i = 0, j = 0, html = '', right = 0, wrong = 0, miss = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { html += esc(A[i]); right++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { html += '<u>' + esc(A[i]) + '</u>'; miss++; i++; }
    else { html += '<i>' + esc(B[j]) + '</i>'; wrong++; j++; }
  }
  while (i < n) { html += '<u>' + esc(A[i]) + '</u>'; miss++; i++; }
  while (j < m) { html += '<i>' + esc(B[j]) + '</i>'; wrong++; j++; }
  return { html, stats: { right, wrong, miss } };
}

/* ---------------- TTS ---------------- */
function speakBrowser(text, lang, onend) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { onend && onend(); return resolve(); }
    const u = new SpeechSynthesisUtterance(text);
    const vs = speechSynthesis.getVoices();
    const pick = lang === 'en'
      ? vs.find(v => /en[-_]/i.test(v.lang) && /Samantha|Karen|Google US English/i.test(v.name))
      : vs.find(v => /zh[-_]CN|zh[-_]Hans/i.test(v.lang)) || vs.find(v => /Tingting|Ting-Ting/i.test(v.name));
    if (pick) u.voice = pick;
    u.lang = lang === 'en' ? 'en-US' : 'zh-CN';
    u.rate = Number(S.state.settings.speed || 1);
    u.onend = () => { onend && onend(); resolve(); };
    u.onerror = () => { onend && onend(); resolve(); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

/* Edge Web TTS：浏览器直连微软朗读服务（HTTPS 页面可用） */
async function genGEC() {
  const token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  let ticks = Date.now() / 1000 + 11644473600;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const str = Math.round(ticks).toString() + token;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function edgeWebTTS(text, voice, rate) {
  return new Promise(async (resolve, reject) => {
    if (!window.WebSocket) return reject(new Error('no websocket'));
    let gec;
    try { gec = await genGEC(); } catch (e) { return reject(new Error('需要 HTTPS 才能使用 Edge 朗读')); }
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75`;
    const ws = new WebSocket(url);
    const chunks = [];
    let done = false;
    const timer = setTimeout(() => { try { ws.close(); } catch (e) { } }, 60000);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const rid = crypto.randomUUID().replace(/-/g, '');
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }));
      const xesc = String(text).replace(/&/g, '\u0026amp;').replace(/</g, '\u0026lt;').replace(/>/g, '\u0026gt;');
      const pct = Math.round((Number(rate || 1) - 1) * 50);
      const r = pct >= 0 ? `+${pct}%` : `${pct}%`;
      ws.send(`X-RequestId:${rid}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xml:lang='zh-CN'><voice name='${voice}'><prosody pitch='+0Hz' rate='${r}' volume='+0%'>${xesc}</prosody></voice></speak>`);
    };
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { if (ev.data.includes('Path:turn.end')) ws.close(); return; }
      const buf = new Uint8Array(ev.data);
      const len = (buf[0] << 8) | buf[1];
      const header = new TextDecoder().decode(buf.slice(2, 2 + len));
      if (header.includes('Path:audio')) chunks.push(buf.slice(2 + len));
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('Edge 朗读连接失败')); };
    ws.onclose = () => {
      clearTimeout(timer);
      if (chunks.length) { done = true; resolve(new Blob(chunks, { type: 'audio/mpeg' })); }
      else if (!done) reject(new Error('Edge 朗读无音频'));
    };
  });
}

async function playTTS(text, lang) {
  const st = S.state.settings;
  const provider = st.ttsProvider || 'browser';
  const blob = await fetchAudio(text, lang, provider, st);
  if (!blob) return;                 // 已用系统语音直接朗读
  const url = URL.createObjectURL(blob);
  S.audio.src = url;
  await new Promise((res, rej) => {
    S.audio.onended = res; S.audio.onerror = () => rej(new Error('play'));
    const p = S.audio.play();
    if (p && p.catch) p.catch(rej);
  });
  URL.revokeObjectURL(url);
}
async function fetchAudio(text, lang, provider, st) {
  if (provider === 'browser') {
    await speakBrowser(text, lang);
    return null;
  }
  if (provider === 'edge-web') {
    const voice = lang === 'en' ? (st.edgeVoiceEn || 'en-US-JennyNeural') : (st.edgeVoiceZh || 'zh-CN-XiaoxiaoNeural');
    try { return await edgeWebTTS(text, voice, st.speed); }
    catch (e) { toast('Edge 网页朗读不可用，已改用系统语音（可在设置里换）'); await speakBrowser(text, lang); return null; }
  }
  if (provider === 'custom' && st.customTtsUrl) {
    try {
      const r = await fetch(st.customTtsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
      if (!r.ok) throw new Error('custom tts');
      return await r.blob();
    } catch (e) { toast('自定义朗读接口不可用'); await speakBrowser(text, lang); return null; }
  }
  // 电脑本地服务器（auto / edge / sovits）
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang, provider }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'tts');
    return await r.blob();
  } catch (e) {
    await speakBrowser(text, lang);
    return null;
  }
}

/* ---------------- 书架 ---------------- */
function renderDash() {
  const lib = S.state.library;
  const items = S.state.progress.items || {};
  let mastered = 0, total = 0;
  lib.forEach(x => { total++; if ((items[x.id] || {}).mastered) mastered++; });
  const today = new Date().toISOString().slice(0, 10);
  const d = (S.state.progress.daily || {})[today] || {};
  $('#dash').innerHTML = `
    <div class="k"><b>${lib.length}</b><span>课文</span></div>
    <div class="k"><b>${mastered}</b><span>已掌握</span></div>
    <div class="k"><b>${d.read || 0}</b><span>今日朗读</span></div>
    <div class="k"><b>${d.quiz || 0}</b><span>今日做题</span></div>`;
}
function itemProgress(id) {
  const p = (S.state.progress.items || {})[id] || {};
  const n = p.sentTotal || 0;
  const done = p.sentDone || 0;
  return { pct: n ? Math.min(100, Math.round(done / n * 100)) : 0, p };
}
function renderLib() {
  const box = $('#libList'); box.innerHTML = '';
  $('#emptyCard').classList.toggle('hide', S.state.library.length > 0);
  S.state.library.forEach(it => {
    const c = el('div', 'card');
    const pr = itemProgress(it.id);
    const sents = splitSentences(it.text, it.lang);
    c.innerHTML = `
      <div class="item">
        <div class="ti">
          <b>${esc(it.title)}</b>
          <div class="row" style="gap:6px;margin-top:4px">
            <span class="badge ${it.lang}">${it.lang === 'en' ? 'English' : '语文'}</span>
            <span class="muted small">${sents.length} 句 · ${(it.text || '').length} 字</span>
            ${pr.p.mastered ? '<span class="pill">已掌握</span>' : ''}
          </div>
          <div class="bar"><i style="width:${pr.pct}%"></i></div>
        </div>
        <button class="btn sm pri" data-open="${it.id}">学习</button>
      </div>`;
    box.appendChild(c);
  });
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    const id = b.dataset.open;
    S.sel.read = S.sel.recite = S.sel.quiz = id;
    syncSelects(); renderRead(); go('read');
  });
  renderDash();
}
function syncSelects() {
  const opts = S.state.library.map(it => `<option value="${it.id}" ${it.lang === 'en' ? 'data-l="en"' : ''}>${esc(it.title)}</option>`).join('');
  ['#readSel', '#reciteSel', '#quizSel'].forEach(sel => {
    const e = $(sel); const old = e.value;
    e.innerHTML = opts || '<option value="">（还没有课文）</option>';
    const want = sel === '#readSel' ? S.sel.read : sel === '#reciteSel' ? S.sel.recite : S.sel.quiz;
    const v = (want && S.state.library.some(x => x.id === want)) ? want : (old && S.state.library.some(x => x.id === old) ? old : (S.state.library[0] || {}).id);
    e.value = v || '';
    if (sel === '#readSel') S.sel.read = v; if (sel === '#reciteSel') S.sel.recite = v; if (sel === '#quizSel') S.sel.quiz = v;
  });
}
function currentItem(key) {
  const id = S.sel[key];
  return S.state.library.find(x => x.id === id) || S.state.library[0] || null;
}

/* ---------------- 新课文 ---------------- */
function openEditor() {
  const box = el('div');
  box.innerHTML = `
    <label class="muted small">标题</label><input id="fTitle" placeholder="如：静夜思 / Unit 1 Reading">
    <div class="row" style="margin-top:8px">
      <div class="grow"><label class="muted small">类型</label>
        <select id="fLang"><option value="zh">语文（中文）</option><option value="en">英语（英文）</option></select></div>
      <div class="grow"><label class="muted small">自动识别</label>
        <select id="fAuto"><option value="1">按内容自动判断</option><option value="0">按上面选择</option></select></div>
    </div>
    <label class="muted small" style="display:block;margin-top:8px">正文（粘贴课文或段落）</label>
    <textarea id="fText" placeholder="把要背的内容粘贴到这里…"></textarea>
    <p class="muted small" id="fHint"></p>`;
  const m = modal('新建课文', box, (n) => {
    const title = n.querySelector('#fTitle').value.trim();
    const text = n.querySelector('#fText').value.trim();
    let lang = n.querySelector('#fLang').value;
    if (n.querySelector('#fAuto').value === '1') {
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const lat = (text.match(/[A-Za-z]/g) || []).length;
      lang = (cjk >= lat * 2 && cjk > 5) ? 'zh' : 'en';
    }
    if (!text) { toast('正文不能为空'); return false; }
    api('/api/library/save', { title: title || text.slice(0, 14), lang, text }).then(r => {
      S.state.library = r.library; syncSelects(); renderLib(); toast('已添加');
    });
  });
  const upd = () => {
    const t = box.querySelector('#fText').value;
    const s = splitSentences(t, 'zh');
    box.querySelector('#fHint').textContent = t ? `自动分句：${s.length} 句` : '';
  };
  box.querySelector('#fText').oninput = upd;
}

/* ---------------- 跟读 ---------------- */
function renderRead() {
  const it = currentItem('read');
  const box = $('#sentBox');
  box.innerHTML = '';
  if (!it) { box.innerHTML = '<p class="muted">先添加课文</p>'; return; }
  const sents = splitSentences(it.text, it.lang);
  const head = el('div', 'row', `<h2 style="margin:0" class="grow">${esc(it.title)}</h2><span class="muted small">${sents.length} 句</span>`);
  box.appendChild(head);
  const list = el('div');
  sents.forEach((s, i) => {
    const d = el('div', 'sent');
    d.dataset.i = i;
    d.innerHTML = `<div class="idx">${i + 1}</div>
      <div class="txt ${it.lang === 'en' ? 'en' : ''}">${esc(s)}</div>
      <div class="ops">
        <button class="btn sm" data-say="${i}">🔊</button>
        <button class="btn sm" data-rec="${i}">🎤</button>
      </div>`;
    list.appendChild(d);
  });
  box.appendChild(list);
  list.querySelectorAll('[data-say]').forEach(b => b.onclick = async () => {
    S.stopFlag = true; setTimeout(() => S.stopFlag = false, 30);
    highlight(i => i === +b.dataset.say);
    await playTTS(sents[+b.dataset.say], it.lang);
  });
  list.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => recordSentence(+b.dataset.rec, sents, it));
  const p = (S.state.progress.items || {})[it.id] || {};
  $('#readTip').textContent = `已跟读 ${p.readCount || 0} 次 · ${p.sentDone || 0}/${sents.length} 句完成`;
}
function highlight(i) {
  $$('#sentBox .sent').forEach(e => e.classList.toggle('cur', +e.dataset.i === i));
  const e = $(`#sentBox .sent[data-i="${i}"]`);
  if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
async function playAll() {
  const it = currentItem('read'); if (!it) return;
  const sents = splitSentences(it.text, it.lang);
  const st = S.state.settings;
  const gap = Number(st.repeatGap || 0.6) * 1000;
  const reps = 1;
  S.stopFlag = false;
  for (let i = 0; i < sents.length; i++) {
    if (S.stopFlag) break;
    highlight(i);
    for (let r = 0; r < reps; r++) {
      if (S.stopFlag) break;
      await playTTS(sents[i], it.lang);
      await sleep(gap);
    }
    if (S.stopFlag) break;
    if (S.shadowOn) {
      await recordSentence(i, sents, it, true);
    }
    api('/api/progress', { id: it.id, patch: { readCount: 1, sentTotal: sents.length, sentDone: Math.min(sents.length, (((S.state.progress.items[it.id] || {}).sentDone) || 0) + 1) } });
    const today = new Date().toISOString().slice(0, 10);
    const d = (S.state.progress.daily || {});
    d[today] = d[today] || { read: 0, recite: 0, quiz: 0, right: 0 };
    d[today].read = (d[today].read || 0) + 1;
    S.state.progress.daily = d;
  }
  renderDash();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 录音跟读 */
async function recordSentence(idx, sents, it, autoNext) {
  const box = $('#sentBox');
  const row = box.querySelector(`.sent[data-i="${idx}"]`);
  if (!row) return;
  const bar = el('div', 'muted small', '录音中…');
  row.appendChild(bar);
  let stream = null, rec = null, chunks = [];
  const secure = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (!secure) {
    bar.innerHTML = '当前为局域网 HTTP，浏览器禁用麦克风。<input type="file" accept="audio/*" class="btn sm" style="margin-top:6px">';
    const inp = bar.querySelector('input');
    inp.onchange = () => { if (inp.files[0]) { const u = URL.createObjectURL(inp.files[0]); row.querySelector('.recplay')?.remove(); const b = el('button', 'btn sm recplay', '▶ 回放我的录音'); b.onclick = () => { const a = new Audio(u); a.play(); }; row.appendChild(b); toast('已载入录音，可回放对比'); } };
    bar.remove();
    if (!autoNext) toast('用系统「语音备忘录」录好，再用 🎤 上传');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const u = URL.createObjectURL(blob);
      row.querySelector('.recplay')?.remove();
      const b = el('button', 'btn sm recplay', '▶ 我的录音');
      b.onclick = () => new Audio(u).play();
      row.appendChild(b);
      const stars = el('div', 'stars');
      stars.innerHTML = '<button>☆</button><button>☆</button><button>☆</button>';
      stars.querySelectorAll('button').forEach((x, k) => x.onclick = () => {
        stars.querySelectorAll('button').forEach((y, j) => y.classList.toggle('on', j <= k));
        api('/api/progress', { id: it.id, patch: { lastScore: k + 1 } });
      });
      row.appendChild(stars);
      bar.remove();
    };
    rec.start();
    toast('开始录音，读完后再点一次 🎤 停止');
    row.querySelector(`[data-rec="${idx}"]`).onclick = () => { if (rec && rec.state === 'recording') { rec.stop(); toast('录音完成'); } };
  } catch (e) { bar.textContent = '无法录音：' + e.message; setTimeout(() => bar.remove(), 2500); }
}

/* ---------------- 背诵 ---------------- */
function renderRecite() {
  const it = currentItem('recite');
  const box = $('#reciteBox');
  box.innerHTML = '';
  if (!it) { box.innerHTML = '<p class="muted">先添加课文</p>'; return; }
  const sents = splitSentences(it.text, it.lang);
  box.innerHTML = `<h2>${esc(it.title)} <span class="muted small">${sents.length} 句</span></h2>`;
  const list = el('div');
  sents.forEach((s, i) => {
    const d = el('div', 'sent');
    d.dataset.i = i;
    d.innerHTML = `<div class="idx">${i + 1}</div><div class="txt">${esc(s)}</div>`;
    list.appendChild(d);
  });
  box.appendChild(list);
}
function showBlank() {
  const it = currentItem('recite'); if (!it) return;
  const sents = splitSentences(it.text, it.lang);
  const box = $('#reciteBox');
  box.innerHTML = `<h2>挖空背诵 · ${esc(it.title)} <span class="muted small" id="bkHint">点击划线处显示答案</span></h2>`;
  const list = el('div');
  sents.forEach((s, i) => {
    const m = maskSentence(s, it.lang, S.blanks);
    const d = el('div', 'sent');
    d.innerHTML = `<div class="idx">${i + 1}</div><div class="txt">${m ? m.html : esc(s)}</div>`;
    d.querySelectorAll('.bl').forEach(b => {
      const ans = b.dataset.a;
      b.style.cursor = 'pointer';
      b.onclick = () => { b.textContent = ans; b.style.color = 'var(--ok)'; };
    });
    list.appendChild(d);
  });
  box.appendChild(list);
}
async function stepMode() {
  const it = currentItem('recite'); if (!it) return;
  const sents = splitSentences(it.text, it.lang);
  const box = $('#reciteBox');
  box.innerHTML = `<h2>逐句推进 · ${esc(it.title)}</h2>`;
  const stage = el('div', 'qbox');
  const txt = el('div', 'qt');
  const ans = el('textarea');
  ans.style.marginTop = '8px';
  const diff = el('div', 'diff muted small');
  const stat = el('div', 'muted small');
  const row = el('div', 'row', `<button class="btn pri" id="stChk">对照检查</button><button class="btn" id="stSay">🔊 听原文</button><button class="btn" id="stNext">下一句 →</button>`);
  box.appendChild(stage); stage.appendChild(txt); stage.appendChild(ans); stage.appendChild(diff); stage.appendChild(stat); stage.appendChild(row);
  let i = 0, done = 0;
  const render = () => {
    txt.textContent = `第 ${i + 1}/${sents.length} 句（先朗读 → 自己背 → 输入检查）`;
    ans.value = ''; diff.innerHTML = ''; stat.textContent = '';
    stage.classList.add('hide');
    $('#stSay').onclick = async () => { stage.classList.remove('hide'); txt.textContent = sents[i]; await playTTS(sents[i], it.lang); setTimeout(() => { txt.textContent = '请背诵这句（可点「对照检查」）：'; ans.focus(); }, 600); };
    $('#stChk').onclick = () => {
      const mine = ans.value.trim();
      if (!mine) { toast('先输入你背的内容'); return; }
      const r = diffText(sents[i], mine);
      diff.innerHTML = '标准：' + r.html;
      const total = r.stats.right + r.stats.wrong + r.stats.miss;
      const acc = total ? Math.round(r.stats.right / total * 100) : 100;
      stat.innerHTML = `准确率 <b class="mono">${acc}%</b> · 错 ${r.stats.wrong} 字 · 漏 ${r.stats.miss} 字 ${acc >= 95 ? '✅ 很棒' : acc >= 80 ? '👌 再来一遍' : '🔁 需要加强'}`;
      if (acc >= 80) { done++; markProgress(it.id, { recite: 1, sentDone: null }); }
    };
    $('#stNext').onclick = () => { if (i < sents.length - 1) { i++; render(); } else { toast('整篇完成 🎉'); api('/api/progress', { id: it.id, patch: { reciteCount: 1, sentDone: sents.length, sentTotal: sents.length } }); renderRecite(); } };
    $('#stSay').click();
  };
  render();
}
function writeMode() {
  const it = currentItem('recite'); if (!it) return;
  const box = $('#reciteBox');
  box.innerHTML = `<h2>全文默写 · ${esc(it.title)}</h2><p class="muted small">不看原文，凭记忆把整篇输入/粘贴，然后对照检查（中文请按原文标点）。</p>`;
  const ta = el('textarea');
  ta.style.minHeight = '180px';
  const row = el('div', 'row', '<button class="btn pri" id="wrChk">对照检查</button><button class="btn" id="wrRef">看原文</button>');
  const out = el('div', 'diff');
  box.appendChild(ta); box.appendChild(row); box.appendChild(out);
  $('#wrChk').onclick = () => {
    const mine = ta.value.trim();
    if (!mine) return toast('先写点内容');
    const r = diffText(it.text.replace(/\r/g, '').trim(), mine);
    out.innerHTML = `<h3>对照结果</h3>` + r.html +
      `<p class="muted small">准确 ${r.stats.right} · 错 ${r.stats.wrong} · 漏 ${r.stats.miss}</p>`;
    markProgress(it.id, { recite: 1 });
  };
  $('#wrRef').onclick = () => out.innerHTML = `<h3>原文</h3><p>${esc(it.text).replace(/\n/g, '<br>')}</p>`;
}
function markProgress(id, patch) {
  const p = S.state.progress;
  p.items = p.items || {};
  const it = p.items[id] = p.items[id] || {};
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null) return;
    if (typeof v === 'number' && typeof it[k] === 'number') it[k] += v; else it[k] = v;
  });
  const today = new Date().toISOString().slice(0, 10);
  p.daily = p.daily || {};
  p.daily[today] = p.daily[today] || { read: 0, recite: 0, quiz: 0, right: 0 };
  if (patch.read) p.daily[today].read = (p.daily[today].read || 0) + 1;
  if (patch.recite) p.daily[today].recite = (p.daily[today].recite || 0) + 1;
  api('/api/progress', { id, patch });
  renderDash();
}

/* ---------------- 出题 ---------------- */
function genVocabQuiz() {
  const pool = S.vocab || [];
  if (!pool.length) return toast('词库还没加载');
  const n = Math.min(10, pool.length);
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 500) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!w || used.has(w.en)) continue;
    used.add(w.en); picked.push(w);
  }
  const list = [];
  picked.forEach(w => {
    const r = Math.random();
    if (r < .4) {
      const opts = new Set([w.zh]);
      let g = 0;
      while (opts.size < 4 && g++ < 80) {
        const o = pool[Math.floor(Math.random() * pool.length)];
        if (o && o.zh !== w.zh && !opts.has(o.zh)) opts.add(o.zh);
      }
      list.push({ type: 'wordchoice', q: `<b>${esc(w.en)}</b> 的意思是？`, a: w.zh, options: [...opts].sort(() => Math.random() - .5), ex: w.ex, exZh: w.exZh });
    } else if (r < .75) {
      list.push({ type: 'wordfill', q: `写出中文意思对应的英文：<b>${esc(w.zh)}</b>`, a: w.en, ex: w.ex, exZh: w.exZh });
    } else {
      list.push({ type: 'wordlisten', q: '听发音写单词', a: w.en, ex: w.ex, exZh: w.exZh, say: w.en });
    }
  });
  S.quiz = { list, i: 0, results: [] };
  renderQuiz();
}
function genDictationQuiz() {
  const pool = S.dict || [];
  if (!pool.length) return toast('默写题库还没加载');
  const n = Math.min(10, pool.length);
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 500) {
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!q || used.has(q.q)) continue;
    used.add(q.q); picked.push(q);
  }
  S.quiz = {
    list: picked.map(q => ({ type: 'memo', q: q.q + ' 句子是：', a: q.a, title: q.title })), i: 0, results: []
  };
  renderQuiz();
}
function genQuiz() {
  if (S.quizSource === 'vocab') return genVocabQuiz();
  if (S.quizSource === 'dict') return genDictationQuiz();
  const it = currentItem('quiz'); if (!it) return;
  const sents = splitSentences(it.text, it.lang);
  const list = [];
  const on = Object.entries(S.types).filter(([k, v]) => v).map(([k]) => k);
  if (!on.length) return toast('请先开启至少一种题型');
  let qi = 0;
  sents.forEach((s, idx) => {
    if (s.length < 6) return;
    const t = on[qi++ % on.length];
    if (t === 'fill' || t === 'choice') {
      const m = maskSentence(s, it.lang, 1);
      if (!m) return;
      const ans = m.answers[0];
      if (!ans || ans.length < 2) return;
      if (t === 'fill') {
        const blanked = s.replace(ans, '＿＿＿＿');
        list.push({ type: 'fill', q: blanked, a: ans, raw: s, sIdx: idx });
      } else {
        const opts = new Set([ans]);
        let guard = 0;
        const pool = [];
        sents.forEach(x => { (x.match(it.lang === 'en' ? /[A-Za-z][A-Za-z'-]{2,}/g : /[\u4e00-\u9fff]{2,4}/g) || []).forEach(w => pool.push(w)); });
        while (opts.size < 4 && guard++ < 60) {
          const w = pool[Math.floor(Math.random() * pool.length)];
          if (w && w !== ans && !opts.has(w)) opts.add(w);
        }
        const arr = [...opts].sort(() => Math.random() - .5);
        const html = m.html.replace(/<span class="bl".*?>.*?<\/span>/, '<b>（ ）</b>');
        list.push({ type: 'choice', q: html, a: ans, options: arr, sIdx: idx, raw: s });
      }
    } else if (t === 'dictation') {
      if (s.length > 80) return;
      list.push({ type: 'dictation', q: '听写下面这句（点 🔊 听写）', a: s, sIdx: idx, raw: s });
    } else if (t === 'translate') {
      const dict = getDict();
      if (!Object.keys(dict.en).length) return;
      if (it.lang === 'en') {
        const words = (s.match(/[A-Za-z][A-Za-z'-]*/g) || []);
        const hit = words.find(w => dict.en[w.toLowerCase()]);
        if (!hit) return;
        list.push({ type: 'translate', q: `写出划线词的中文意思：<span class="bl">${esc(s.replace(new RegExp('\\b' + hit.replace(/[-']/g, '[$&]') + '\\b'), '【' + hit + '】'))}</span>`, a: dict.en[hit.toLowerCase()], sIdx: idx });
      } else {
        const hit = Object.keys(dict.zh).find(z => s.includes(z));
        if (!hit) return;
        list.push({ type: 'translate', q: `写出划线词的英文：${esc(s).replace(hit, '<b>【' + esc(hit) + '】</b>')}`, a: dict.zh[hit], sIdx: idx });
      }
    }
  });
  S.quiz = { list, i: 0, results: [] };
  renderQuiz();
}
function getDict() {
  const raw = (S.state.settings.words || '').split(/\n+/);
  const en = {}, zh = {};
  raw.forEach(line => {
    const parts = line.trim().split(/[\s　]+/).filter(Boolean);
    if (parts.length < 2) return;
    const a = parts[0], b = parts.slice(1).join(' ');
    if (/^[A-Za-z]/.test(a)) { en[a.toLowerCase()] = b; zh[b] = a; }
    else { zh[a] = b; en[b.toLowerCase()] = a; }
  });
  return { en, zh };
}
function renderQuiz() {
  const box = $('#quizBox'); box.innerHTML = '';
  const { list, i, results } = S.quiz;
  const it = currentItem('quiz');
  if (!list.length) { box.innerHTML = '<div class="card"><p class="muted">没有可出的题（试试换课文或调整题型）</p></div>'; return; }
  const q = list[i];
  const card = el('div', 'card');
  card.innerHTML = `<div class="row"><span class="pill">第 ${i + 1}/${list.length} 题</span><span class="pill">${{ fill: '填空', choice: '选择', dictation: '听写', translate: '翻译', wordchoice: '词义选择', wordfill: '词义拼写', wordlisten: '听写单词', memo: '理解默写' }[q.type] || q.type}</span><span class="muted small grow" style="text-align:right">已答对 ${results.filter(r => r.ok).length}</span></div>`;
  const qbox = el('div', 'qbox');
  const qt = el('div', 'qt', q.q || '');
  qbox.appendChild(qt);
  const ansBox = el('div');
  qbox.appendChild(ansBox);
  card.appendChild(qbox);
  let input = null;
  if (q.type === 'choice' || q.type === 'wordchoice') {
    q.options.forEach(o => {
      const b = el('button', 'opt', esc(o));
      b.onclick = () => {
        ansBox.querySelectorAll('.opt').forEach(x => x.classList.remove('ok', 'no'));
        b.classList.add(q.a === o ? 'ok' : 'no');
        judge(q.a === o, o);
      };
      ansBox.appendChild(b);
    });
  } else {
    if (q.type === 'dictation' || q.type === 'wordlisten') {
      const say = el('button', 'btn', '🔊 播放');
      say.onclick = async () => { await playTTS(q.say || q.a, q.say ? 'en' : (currentItem('quiz') || {}).lang || 'zh'); };
      ansBox.appendChild(say);
    }
    input = el('input');
    input.placeholder = q.type === 'memo' ? '默写整句（标点可省）' : '输入答案';
    ansBox.appendChild(input);
  }
  const row = el('div', 'row');
  const chk = el('button', 'btn pri grow', '检查');
  const next = el('button', 'btn grow hide', '下一题 →');
  row.appendChild(chk); row.appendChild(next);
  card.appendChild(row);
  const fb = el('div', 'muted small');
  card.appendChild(fb);
  const judge = (ok, val) => {
    if (q.judged) return;
    q.judged = true;
    results.push({ ok, val });
    fb.innerHTML = (ok ? '<span style="color:var(--ok)">✓ 正确</span>' : `<span style="color:var(--bad)">✗ 答案：${esc(q.a)}</span>`) +
      (q.raw ? ` <span class="muted small">原文：${esc(q.raw)}</span>` : '');
    next.classList.remove('hide');
    api('/api/quiz/answer', { itemId: it.id, correct: ok, question: { type: q.type, q: (q.q || '').replace(/<[^>]+>/g, ''), a: q.a } });
    if (ok) markProgress(it.id, { quizRight: 1 });
    markQuizDaily();
  };
  chk.onclick = () => {
    if (!input) return;
    const mine = normalize(input.value);
    const gold = normalize(q.a);
    let ok;
    if (q.type === 'memo') ok = mine === gold;
    else if (q.type === 'dictation') ok = mine === gold || (mine.length > 6 && gold.includes(mine));
    else ok = mine === gold;
    if ((q.type === 'dictation' || q.type === 'memo') && input.value) {
      const r = diffText(q.a, input.value.trim());
      fb.innerHTML = '对照：<div class="diff">' + r.html + '</div>';
    }
    judge(!!ok, input.value);
  };
  next.onclick = () => { if (S.quiz.i < list.length - 1) { S.quiz.i++; renderQuiz(); } else finishQuiz(); };
  box.appendChild(card);
}
function markQuizDaily() {
  const today = new Date().toISOString().slice(0, 10);
  S.state.progress.daily = S.state.progress.daily || {};
  S.state.progress.daily[today] = S.state.progress.daily[today] || { read: 0, recite: 0, quiz: 0, right: 0 };
  const d = S.state.progress.daily[today];
  d.quiz = (d.quiz || 0) + 1;
  renderDash();
}
function finishQuiz() {
  const { list, results } = S.quiz;
  const right = results.filter(r => r.ok).length;
  $('#quizBox').innerHTML = `<div class="card center">
    <h2>🎉 本轮完成</h2>
    <p class="mono" style="font-size:26px;margin:6px 0">${right} / ${list.length}</p>
    <p class="muted">正确率 ${list.length ? Math.round(right / list.length * 100) : 0}%</p>
    <button class="btn pri" onclick="genQuiz()">再来一轮</button></div>`;
}

/* ---------------- 复习 ---------------- */
function renderReview() {
  const wrong = (S.state.progress.wrong || []);
  const now = Math.floor(Date.now() / 1000);
  const due = wrong.filter(q => (q.nextReview || 0) <= now);
  const soon = wrong.filter(q => (q.nextReview || 0) > now).sort((a, b) => a.nextReview - b.nextReview);
  $('#reviewInfo').textContent = `共 ${wrong.length} 题进入错题本，待复习 ${due.length} 题，之后还有 ${soon.length} 题待安排。`;
  const box = $('#reviewBox'); box.innerHTML = '';
  if (!wrong.length) { box.innerHTML = '<div class="card"><p class="muted">还没有错题。在「出题」里做题后，答错的题会自动进入这里，并按间隔重复安排复习。</p></div>'; return; }
  due.forEach(q => {
    const c = el('div', 'card');
    c.innerHTML = `<div class="row wrap"><span class="pill">${{ fill: '填空', choice: '选择', dictation: '听写', translate: '翻译', wordchoice: '词义选择', wordfill: '词义拼写', wordlisten: '听写单词', memo: '理解默写' }[q.type] || q.type}</span>
      <span class="muted small">已复习 ${q.reviewed || 0} 次 · 等级 ${q.level || 0}</span></div>
      <div class="qt" style="margin:8px 0">${esc(q.q || '')}</div>`;
    const row = el('div', 'row');
    const show = el('button', 'btn grow', '看答案');
    const ok = el('button', 'btn pri grow hide', '记住了 ✓');
    const no = el('button', 'btn warn grow hide', '又忘了');
    row.appendChild(show); row.appendChild(ok); row.appendChild(no);
    c.appendChild(row);
    const ans = el('p', '', `<b>答案：</b>${esc(q.a || '')}`);
    ans.classList.add('hide');
    c.appendChild(ans);
    show.onclick = () => { ans.classList.remove('hide'); ok.classList.remove('hide'); no.classList.remove('hide'); show.classList.add('hide'); };
    ok.onclick = () => api('/api/quiz/answer', { itemId: q.itemId, correct: true, question: q }).then(r => { S.state.progress.wrong = S.state.progress.wrong.map(x => x.qid === q.qid ? r.question : x); renderReview(); });
    no.onclick = () => api('/api/quiz/answer', { itemId: q.itemId, correct: false, question: q }).then(r => { S.state.progress.wrong = S.state.progress.wrong.map(x => x.qid === q.qid ? r.question : x); renderReview(); });
    box.appendChild(c);
  });
  if (!due.length) box.appendChild(el('div', 'card', '<p class="muted">今天的错题都复习完了 🌟，去「出题」继续吧。</p>'));
}

/* ---------------- 我的 ---------------- */
function renderMe() {
  const st = S.state.settings;
  $('#setProvider').value = st.ttsProvider || 'auto';
  $('#setVoiceZh').value = st.edgeVoiceZh || '';
  $('#setVoiceEn').value = st.edgeVoiceEn || '';
  $('#setSpeed').value = st.speed || 1;
  $('#setGap').value = st.repeatGap || .6;
  $('#setRef').value = st.sovitsRef || '';
  $('#setPrompt').value = st.sovitsPrompt || '';
  $('#setCustomUrl').value = st.customTtsUrl || '';
  $('#setWords').value = st.words || '';
  // 统计
  const daily = S.state.progress.daily || {};
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { d, v: daily[d] || {} };
  });
  const max = Math.max(1, ...days.map(x => (x.v.read || 0) + (x.v.recite || 0) + (x.v.quiz || 0)));
  $('#weekChart').innerHTML = days.map(x => {
    const t = (x.v.read || 0) + (x.v.recite || 0) + (x.v.quiz || 0);
    const h = Math.round(t / max * 80);
    return `<div class="grow center"><div style="height:${h}px;background:linear-gradient(#14b8a6,#38bdf8);border-radius:6px 6px 0 0;margin:auto;width:70%"></div><div class="small muted">${x.d.slice(5)}</div><div class="small mono">${t || ''}</div></div>`;
  }).join('');
  const items = S.state.progress.items || {};
  let mastered = 0, srs = 0;
  Object.values(items).forEach(p => { if (p.mastered) mastered++; if (p.readCount) srs++; });
  const streak = calcStreak(daily);
  $('#meStat').innerHTML = `
    <div class="k"><b>${streak}</b><span>连续打卡</span></div>
    <div class="k"><b>${S.state.library.length}</b><span>课文</span></div>
    <div class="k"><b>${Object.keys(daily).length}</b><span>学习天数</span></div>
    <div class="k"><b>${mastered}</b><span>已掌握</span></div>`;
}
function calcStreak(daily) {
  let n = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const v = daily[d];
    if (v && ((v.read || 0) + (v.recite || 0) + (v.quiz || 0)) > 0) n++;
    else if (i > 0) break;
  }
  return n;
}
async function saveSettings(patch) {
  const r = await api('/api/settings', patch);
  S.state.settings = r.settings;
  renderVoiceBadge();
  toast('已保存');
}

/* ---------------- 语音徽标 ---------------- */
function renderVoiceBadge() {
  const st = S.state.settings;
  const p = st.ttsProvider || 'browser';
  const h = S.health;
  const name = { auto: '自动', edge: 'Edge TTS', sovits: 'GPT-SoVITS', browser: '系统语音', 'edge-web': 'Edge 网页', custom: '自定义' }[p] || p;
  const warn = (p === 'sovits' && h.sovits === false) || (p === 'edge' && h.edge === false) || (p === 'auto' && h.sovits === false && h.edge === false);
  const where = MODE === 'static' ? '本机' : '电脑';
  $('#voiceBadge').textContent = `${warn ? '⚠️' : ''}${name} · ${where}`;
}

/* ---------------- 导航 ---------------- */
function go(v) {
  S.view = v;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ['library', 'read', 'recite', 'quiz', 'review', 'me'].forEach(x => $('#v-' + x).classList.toggle('hide', x !== v));
  if (v === 'library') renderLib();
  if (v === 'read') { syncSelects(); renderRead(); }
  if (v === 'recite') { syncSelects(); renderRecite(); }
  if (v === 'quiz') { syncSelects(); }
  if (v === 'review') { S.state = S.state; renderReview(); }
  if (v === 'me') renderMe();
}

/* ---------------- 绑定 ---------------- */
$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.v));
$('#btnAdd').onclick = openEditor;
$('#readSel').onchange = e => { S.sel.read = e.target.value; renderRead(); };
$('#readDel').onclick = () => {
  const it = currentItem('read'); if (!it) return;
  if (!confirm('删除《' + it.title + '》？')) return;
  api('/api/library/delete', { id: it.id }).then(r => { S.state.library = r.library; syncSelects(); renderRead(); toast('已删除'); });
};
$('#btnPlayAll').onclick = playAll;
$('#btnStop').onclick = () => { S.stopFlag = true; S.loopOn = false; S.shadowOn = false; S.audio.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); toast('已停止'); };
$('#btnLoop').onclick = e => { S.loopOn = !S.loopOn; e.currentTarget.classList.toggle('pri', S.loopOn); if (S.loopOn) loopCurrent(); };
$('#btnShadow').onclick = e => { S.shadowOn = !S.shadowOn; e.currentTarget.classList.toggle('pri', S.shadowOn); toast(S.shadowOn ? '跟读模式：每句朗读后进入录音' : '跟读模式关闭'); };
async function loopCurrent() {
  const it = currentItem('read'); if (!it || !S.loopOn) return;
  const sents = splitSentences(it.text, it.lang);
  let i = 0;
  while (S.loopOn && !S.stopFlag) {
    highlight(i % sents.length);
    await playTTS(sents[i % sents.length], it.lang);
    await sleep(600);
    i++;
  }
}
$('#btnBlank').onclick = showBlank;
$('#btnStep').onclick = stepMode;
$('#btnWrite').onclick = writeMode;
$('#blankPill').onclick = () => {
  S.blanks = S.blanks >= .9 ? .15 : S.blanks + .15;
  $('#blankPill').textContent = '挖空 ' + Math.round(S.blanks * 100) + '%';
};
$('#blankModePill').onclick = e => {
  e.currentTarget.textContent = e.currentTarget.textContent.includes('整句') ? '隐藏关键词' : '隐藏整句';
  S.blankMode = S.blankMode === 'word' ? 'sent' : 'word';
};
$('#quizTypes').onclick = e => {
  const t = e.target.closest('[data-t]'); if (!t) return;
  S.types[t.dataset.t] = !S.types[t.dataset.t];
  t.classList.toggle('on', S.types[t.dataset.t]);
};
document.querySelectorAll('[data-src]').forEach(p => p.onclick = () => {
  document.querySelectorAll('[data-src]').forEach(x => x.classList.toggle('on', x === p));
  S.quizSource = p.dataset.src;
});
$('#btnUseVoice').onclick = async () => {
  const name = $('#sovitsVoice').value;
  if (!name) return toast('先选一个音色');
  try {
    const vs = (await api('/api/sovits/voices')).voices || [];
    const v = vs.find(x => x.name === name);
    if (!v) return toast('没有这个音色');
    toast('正在切换…');
    await api('/api/sovits/voice', { gpt: v.gpt, sovits: v.sovits });
    toast('已切换到 ' + name);
  } catch (e) { toast('切换失败：' + e.message); }
};
async function loadSovitsVoices() {
  const sel = $('#sovitsVoice');
  if (!sel) return;
  try {
    const vs = (await api('/api/sovits/voices')).voices || [];
    if (!vs.length) { sel.innerHTML = '<option value="">（电脑未连接 GPT-SoVITS）</option>'; return; }
    sel.innerHTML = vs.map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('');
  } catch (e) { sel.innerHTML = '<option value="">（电脑未连接 GPT-SoVITS）</option>'; }
}
$('#btnGenQuiz').onclick = genQuiz;
$('#btnAIQuiz').onclick = async () => {
  const it = currentItem('quiz'); if (!it) return;
  toast('正在生成…');
  try {
    const r = await api('/api/ai/quiz', { text: it.text, lang: it.lang });
    S.quiz = { list: (r.items || []).map(q => ({ ...q, raw: q.a })), i: 0, results: [] };
    if (!S.quiz.list.length) return toast(r.error || 'AI 没有返回题目');
    renderQuiz();
  } catch (e) { toast('AI 出题失败：' + e.message); }
};
$('#reviewInfo').onclick = renderReview;
$('#btnSaveSet').onclick = () => saveSettings({
  ttsProvider: $('#setProvider').value,
  edgeVoiceZh: $('#setVoiceZh').value.trim(),
  edgeVoiceEn: $('#setVoiceEn').value.trim(),
  speed: Number($('#setSpeed').value) || 1,
  repeatGap: Number($('#setGap').value),
  customTtsUrl: $('#setCustomUrl').value.trim(),
  sovitsRef: $('#setRef').value.trim(),
  sovitsPrompt: $('#setPrompt').value.trim(),
});
$('#btnSaveWords').onclick = () => saveSettings({ words: $('#setWords').value });
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S.state, null, 2)], { type: 'application/json' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'beibei-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};
$('#btnImport').onclick = () => {
  const inp = el('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = async () => {
    const data = JSON.parse(await inp.files[0].text());
    for (const it of data.library || []) await api('/api/library/save', it);
    if (data.settings) await api('/api/settings', data.settings);
    toast('导入完成');
    S.state = await api('/api/state'); syncSelects(); renderLib(); renderVoiceBadge();
  };
  inp.click();
};
$('#btnWipe').onclick = async () => {
  if (!confirm('确定清空所有课文、错题和进度？此操作不可恢复！')) return;
  (await Promise.all(S.state.library.map(it => api('/api/library/delete', { id: it.id }))));
  toast('已清空'); S.state = await api('/api/state'); syncSelects(); renderLib(); renderReview();
};

/* ---------------- 启动 ---------------- */
async function loadStaticData() {
  const get = async (f) => {
    try { const r = await fetch('data/' + f, { cache: 'no-cache' }); return r.ok ? await r.json() : []; }
    catch (e) { return []; }
  };
  const [lib, vocab, dict] = await Promise.all([get('library.json'), get('vocab.json'), get('dictation.json')]);
  S.staticLibrary = lib || [];
  S.vocab = vocab || [];
  S.dict = dict || [];
}
async function init() {
  await loadStaticData();
  let ok = false;
  try {
    const r = await fetch('/api/state');
    if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.library)) { MODE = 'server'; S.state = j; ok = true; } }
  } catch (e) { }
  if (ok) {
    // 合并内置课文（60篇 + 示例），避免与用户自建重复
    const ids = new Set(S.state.library.map(x => x.id));
    S.state.library = S.state.library.concat(S.staticLibrary.filter(x => !ids.has(x.id)));
    S.health = await api('/api/health');
  } else {
    MODE = 'static';
    S.state = await api('/api/state');
    S.health = { sovits: false, edge: false };
  }
  renderVoiceBadge(); renderLib(); syncSelects(); renderRead(); renderRecite(); renderReview();
  loadSovitsVoices();
  const vocabInfo = $('#vocabInfo');
  if (vocabInfo) vocabInfo.textContent = `词库 ${S.vocab.length} 词 · 默写题 ${S.dict.length} 道`;
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { };
}
init();
