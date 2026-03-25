// ============================================================
//  THE BRIDGE PUBLIC — app.js  v1.0
//  Identical AI features to personal version.
//  Adds: welcome screen, onboarding, A2HS prompt, about page.
// ============================================================

const STORE_KEY = 'bridge_pub_v1';
const CACHE_KEY = 'bridge_pub_cache_v1';

let S = {
  translation: 'KJV',
  aiKey: '',
  currentBook: null,
  currentChapter: null,
  completedChapters: {},
  notes: [],
  streak: 0,
  lastStudyDate: null,
  totalMinutes: 0,
  seenWelcome: false,
};

let cache = {};
let selectedVerse = null;
let deferredInstallPrompt = null;

// ── BOOT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupA2HS();
  if (S.seenWelcome) {
    showScreen('home');
    bootApp();
  }
  // Otherwise welcome screen shows (default active in HTML)
});

function bootApp() {
  renderHome();
  renderLibrary();
  renderNotes();
  renderAnalytics();
  initSettings();
  checkStreak();
  renderAIStatus();
}

// ── WELCOME / ONBOARDING ────────────────────────────────
function skipOnboarding() {
  S.seenWelcome = true;
  save();
  showScreen('home');
  bootApp();
  setTimeout(showA2HSBanner, 3500);
}

function saveOnboardKey() {
  const key = document.getElementById('onboard-key-inp')?.value?.trim();
  if (key && key.startsWith('sk-ant-')) {
    S.aiKey = key;
    S.seenWelcome = true;
    save();
    showScreen('home');
    bootApp();
    toast('AI key saved! All study features are now unlocked.');
    setTimeout(showA2HSBanner, 3500);
  } else if (key) {
    toast('That doesn\'t look like a valid Anthropic key (should start with sk-ant-)');
  } else {
    // No key — just skip
    skipOnboarding();
  }
}

// ── ADD TO HOME SCREEN ──────────────────────────────────
function setupA2HS() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

function showA2HSBanner() {
  // Already a PWA
  if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return;
  // Dismissed recently (7 days)
  const dismissed = localStorage.getItem('bridge_a2hs_dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  const banner = document.getElementById('a2hs-banner');
  const iosSteps = document.getElementById('a2hs-ios-steps');
  const installBtn = document.getElementById('a2hs-install-btn');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isIOS) {
    iosSteps.style.display = 'block';
    installBtn.style.display = 'none';
  } else if (deferredInstallPrompt) {
    iosSteps.style.display = 'none';
    installBtn.style.display = 'block';
  } else {
    iosSteps.style.display = 'block';
    iosSteps.innerHTML = 'To install: use your browser\'s menu and select <strong style="color:var(--gold)">Add to Home Screen</strong> or <strong style="color:var(--gold)">Install App</strong>.';
    installBtn.style.display = 'none';
  }
  banner.classList.add('show');
}

async function installA2HS() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dismissA2HS();
}

function dismissA2HS() {
  document.getElementById('a2hs-banner').classList.remove('show');
  localStorage.setItem('bridge_a2hs_dismissed', Date.now().toString());
}

// ── PERSIST ─────────────────────────────────────────────
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e) {}
}
function loadState() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s) S = { ...S, ...JSON.parse(s) };
    const c = localStorage.getItem(CACHE_KEY);
    if (c) cache = JSON.parse(c);
  } catch(e) {}
}
function saveCache() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      const trimmed = {};
      keys.slice(-180).forEach(k => trimmed[k] = cache[k]);
      cache = trimmed;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch(e) {}
}
function checkStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (S.lastStudyDate === today) return;
  if (S.lastStudyDate === yesterday) S.streak = (S.streak || 0) + 1;
  else if (S.lastStudyDate && S.lastStudyDate !== today) S.streak = 0;
}

// ── HELPERS ─────────────────────────────────────────────
function rt(w) { return Math.max(1, Math.round(w / 200)); }
function bookTime(b) { return b.wordCounts.reduce((s, w) => s + rt(w), 0); }
function bookProg(b) {
  let n = 0;
  for (let c = 1; c <= b.chapters; c++) if (S.completedChapters[b.id + '-' + c]) n++;
  return n;
}
function ntProgress() {
  const done = Object.keys(S.completedChapters).filter(k => S.completedChapters[k]).length;
  return { done, total: NT_TOTAL_CHAPTERS, pct: Math.round(done / NT_TOTAL_CHAPTERS * 100) };
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.style.display = 'none', 3000);
}
function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$'); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── SCREEN NAV ──────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  if (name === 'analytics') renderAnalytics();
  if (name === 'notes') renderNotes();
  if (name === 'settings') refreshSettings();
}

// ── AI STATUS BADGE ─────────────────────────────────────
function renderAIStatus() {
  const wrap = document.getElementById('ai-status-wrap');
  if (!wrap) return;
  if (S.aiKey) {
    wrap.innerHTML = `<div class="ai-status-badge active">
      <span style="width:7px;height:7px;background:var(--green);border-radius:50%;display:inline-block"></span>
      AI Study Assistant active
    </div>`;
  } else {
    wrap.innerHTML = `<div class="ai-status-badge inactive" onclick="showScreen('settings')" style="cursor:pointer">
      🤖 Add AI key to unlock full study features →
    </div>`;
  }
}

// ── HOME ────────────────────────────────────────────────
function renderHome() {
  const p = ntProgress();
  const bar = document.getElementById('nt-bar');
  if (bar) setTimeout(() => bar.style.width = p.pct + '%', 200);
  setText('nt-done-lbl', p.done + ' of ' + p.total + ' chapters');
  setText('nt-pct-lbl', p.pct + '%');
  setText('s-streak', S.streak || 0);
  setText('s-hours', Math.floor((S.totalMinutes || 0) / 60));
  setText('s-notes', (S.notes || []).length);
  setText('notes-lbl', (S.notes||[]).length + ' insight' + ((S.notes||[]).length !== 1 ? 's' : ''));
  const v = DAILY_VERSES[Math.floor(Date.now() / 86400000) % DAILY_VERSES.length];
  setText('dv-text', '\u201c' + v.text + '\u201d');
  setText('dv-ref', '\u2014 ' + v.ref);
  if (S.currentBook && S.currentChapter) {
    const b = NT_BOOKS.find(b => b.id === S.currentBook);
    setText('continue-lbl', (b ? b.name : '') + ' ' + S.currentChapter);
  } else {
    setText('continue-lbl', 'Start with Matthew 1');
  }
  renderAIStatus();
}

function showDailyVerse() {
  const v = DAILY_VERSES[Math.floor(Date.now() / 86400000) % DAILY_VERSES.length];
  openVerseSheet({ text: v.text, ref: v.ref });
}
function continueReading() {
  openReader(S.currentBook || 'matthew', S.currentChapter || 1);
}

// ── LIBRARY ─────────────────────────────────────────────
function renderLibrary() {
  const grid = document.getElementById('book-grid');
  if (!grid) return;
  grid.innerHTML = NT_BOOKS.map((b, i) => {
    const prog = bookProg(b), full = prog === b.chapters;
    return `<div class="book-card ${full ? 'completed' : ''}" onclick="openBook('${b.id}')">
      <div class="book-num">${i + 1}</div>
      <div class="book-info">
        <div class="book-name">${b.name}</div>
        <div class="book-meta">${b.chapters} ch &middot; ${bookTime(b)} min</div>
      </div>
      <div class="book-prog" style="color:${full ? 'var(--gold)' : 'var(--text3)'}">${prog}/${b.chapters}</div>
      <div class="book-check ${full ? 'done' : ''}">&#10003;</div>
    </div>`;
  }).join('');
}

// ── BOOK DETAIL ─────────────────────────────────────────
function openBook(bookId) {
  const b = NT_BOOKS.find(x => x.id === bookId);
  if (!b) return;
  S.currentBook = bookId; save();
  setText('book-hdr', b.name);
  const prog = bookProg(b), pct = Math.round(prog / b.chapters * 100);
  document.getElementById('book-body').innerHTML = `
    <div style="margin:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px" class="fade-up">
      <div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;color:var(--text);margin-bottom:14px">${b.name}</div>
      <div class="progress-card" style="margin-bottom:14px">
        <div class="progress-label">Your Progress</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-stats"><span>${prog} of ${b.chapters} chapters</span><span>&#9201; ${bookTime(b)} min total</span></div>
      </div>
      ${row('Author', b.author)}${row('Audience', b.audience)}${row('Purpose', b.purpose)}
      ${row('Period', b.period)}${row('Culture', b.culture)}${row('Fits In', b.fit)}
    </div>
    <div class="section-title">Chapters</div>
    <div class="chapter-list">
      ${Array.from({length: b.chapters}, (_, i) => {
        const ch = i + 1, done = S.completedChapters[b.id + '-' + ch];
        const mins = rt(b.wordCounts[i] || 800);
        const cached = cache[b.id + '-' + ch + '-' + S.translation] ? '&#9679;' : '';
        return `<div class="chapter-btn ${done ? 'done' : ''}" onclick="openReader('${b.id}',${ch})">
          ${ch}<div class="ch-time">${mins}m${cached}</div>
        </div>`;
      }).join('')}
    </div>`;
  showScreen('book');
}
function row(k, v) {
  return `<div class="intro-row"><div class="intro-key">${k}</div><div class="intro-val">${v}</div></div>`;
}

// ── READER ──────────────────────────────────────────────
function openReader(bookId, chapter) {
  S.currentBook = bookId; S.currentChapter = chapter; save();
  const b = NT_BOOKS.find(x => x.id === bookId);
  setText('reader-hdr', (b ? b.name : '') + ' ' + chapter);
  setText('trans-pill', S.translation);
  renderHome();
  showScreen('reader');
  loadChapter(bookId, chapter, S.translation);
}

async function loadChapter(bookId, chapter, translation) {
  const cKey = bookId + '-' + chapter + '-' + translation;
  if (cache[cKey] && cache[cKey].length > 0) { renderVerses(cache[cKey], chapter, true); return; }
  document.getElementById('reader-body').innerHTML = `
    <div class="loading-wrap">
      <div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>
      <div class="loading-text">Loading ${NT_BOOKS.find(b=>b.id===bookId)?.name||''} ${chapter} (${translation})&hellip;</div>
    </div>`;
  try {
    const verses = await fetchChapter(bookId, chapter, translation);
    if (verses && verses.length > 0) {
      cache[cKey] = verses; saveCache();
      renderVerses(verses, chapter, false);
    } else {
      renderError('No content returned. Try a different translation.');
    }
  } catch(err) { renderError(err.message); }
}

async function fetchChapter(bookId, chapter, translation) {
  const bibleId = TRANSLATIONS[translation]?.id;
  const bookCode = BOOK_IDS[bookId];
  if (!bibleId || !bookCode) throw new Error('Book or translation not found.');
  const chapterId = bookCode + '.' + chapter;
  const url = `${API_BASE}/bibles/${bibleId}/chapters/${chapterId}?content-type=json&include-notes=false&include-titles=true&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`;
  const res = await fetch(url, { headers: { 'api-key': API_KEY } });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Bible service error. Please try again later.');
    if (res.status === 403) throw new Error('Translation not available. Try switching to KJV.');
    if (res.status === 404) throw new Error('Chapter not found in this translation.');
    throw new Error('Could not load chapter. Check your internet connection and try again.');
  }
  const data = await res.json();
  return parseChapterContent(data?.data?.content || []);
}

function parseChapterContent(content) {
  const verses = [];
  let verseNum = null, verseText = '';
  function walk(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item) continue;
      if (item.type === 'tag' && (item.name === 'verse' || item.name === 'v')) {
        if (verseNum !== null && verseText.trim()) verses.push({ v: verseNum, t: verseText.trim() });
        const sid = item.attrs?.sid || item.attrs?.number || '';
        const m = sid.match(/(\d+)$/);
        verseNum = m ? parseInt(m[1]) : (verseNum !== null ? verseNum + 1 : 1);
        verseText = '';
      } else if (item.type === 'text') {
        if (verseNum !== null) verseText += item.text || '';
      } else if (item.type === 'tag' && item.name === 'char') {
        if (verseNum !== null && item.items) walk(item.items);
      } else if (item.items) { walk(item.items); }
      else if (Array.isArray(item.content)) { walk(item.content); }
    }
  }
  walk(Array.isArray(content) ? content : [content]);
  if (verseNum !== null && verseText.trim()) verses.push({ v: verseNum, t: verseText.trim() });
  const seen = {};
  verses.forEach(v => seen[v.v] = v);
  return Object.values(seen).sort((a, b) => a.v - b.v);
}

function renderVerses(verses, chapter, fromCache) {
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  const mins = rt(b?.wordCounts[chapter - 1] || 800);
  const isDone = S.completedChapters[S.currentBook + '-' + chapter];
  document.getElementById('reader-body').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text3)">&#9201; ${mins} min &middot; ${S.translation}</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${fromCache ? '<div class="cache-badge"><div class="cache-dot"></div>Cached</div>' : ''}
        ${isDone ? '<div class="pill">&#10003; Done</div>' : ''}
      </div>
    </div>
    <!-- CHAPTER STUDY BUTTON -->
    <div onclick="openChapterStudy()" style="
      background:linear-gradient(135deg,var(--bg3),var(--surface));
      border:1px solid var(--border);border-left:3px solid var(--gold);
      border-radius:var(--radius);padding:14px 16px;margin-bottom:18px;
      cursor:pointer;display:flex;align-items:center;gap:12px">
      <div style="font-size:24px">🧠</div>
      <div>
        <div style="font-size:14px;font-weight:500;color:var(--gold-light)">Study This Chapter with AI</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Context &middot; Themes &middot; Discussion &middot; Application</div>
      </div>
      <div style="margin-left:auto;color:var(--text3);font-size:18px">›</div>
    </div>
    ${verses.map(v => `
      <div class="verse-block" id="vb-${v.v}" onclick="selectVerse(${v.v},\`${esc(v.t)}\`)">
        <div class="verse-num">${v.v}</div>
        <div class="verse-text">${v.t}</div>
      </div>`).join('')}
    <div style="padding:32px 0 8px;text-align:center;color:var(--text3);font-size:13px">
      &mdash; End of Chapter ${chapter} &mdash;<br>
      <span style="font-size:12px;display:block;margin-top:6px">Tap any verse to study it deeply</span>
    </div>`;
}

function renderError(msg) {
  document.getElementById('reader-body').innerHTML = `
    <div style="padding:40px 20px;text-align:center">
      <div style="font-size:36px;margin-bottom:14px">&#9888;&#65039;</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--text);margin-bottom:10px">Could Not Load Chapter</div>
      <div style="font-size:14px;color:var(--text3);line-height:1.6;margin-bottom:24px">${msg}</div>
      <button class="btn-gold" onclick="loadChapter('${S.currentBook}',${S.currentChapter},'${S.translation}')">Try Again</button>
    </div>`;
}

function selectVerse(num, text) {
  document.querySelectorAll('.verse-block').forEach(b => b.classList.remove('selected'));
  const bl = document.getElementById('vb-' + num);
  if (bl) bl.classList.add('selected');
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  openVerseSheet({ text, ref: (b?.abbr || '') + ' ' + S.currentChapter + ':' + num });
}

function backFromReader() {
  if (S.currentBook) openBook(S.currentBook);
  else showScreen('library');
}

// ── TRANSLATION ─────────────────────────────────────────
function openTransPicker() {
  const list = document.getElementById('trans-picker-list');
  list.innerHTML = Object.entries(TRANSLATIONS).map(([key, t]) => `
    <button onclick="setTranslation('${key}')" style="
      width:100%;text-align:left;padding:14px 16px;border-radius:12px;cursor:pointer;
      border:1px solid ${S.translation === key ? 'var(--gold)' : 'var(--border)'};
      background:${S.translation === key ? 'var(--gold-dim)' : 'var(--surface)'};
      font-family:'DM Sans',sans-serif;margin-bottom:4px">
      <div style="font-size:15px;font-weight:500;color:${S.translation === key ? 'var(--gold-light)' : 'var(--text)'}">
        ${t.short} ${S.translation === key ? '&#10003;' : ''}
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">${t.label}</div>
    </button>`).join('');
  document.getElementById('trans-sheet').classList.add('open');
}
function closeTransSheet(e) {
  if (e.target === document.getElementById('trans-sheet')) document.getElementById('trans-sheet').classList.remove('open');
}
function setTranslation(key) {
  S.translation = key; save();
  document.getElementById('trans-sheet').classList.remove('open');
  setText('trans-pill', key);
  if (S.currentBook && S.currentChapter) loadChapter(S.currentBook, S.currentChapter, key);
  toast('Switched to ' + TRANSLATIONS[key].label);
}

// ── VERSE SHEET ─────────────────────────────────────────
function openVerseSheet({ text, ref }) {
  selectedVerse = { text, ref };
  setText('sv-ref', ref || '');
  document.getElementById('sv-text').textContent = '\u201c' + text + '\u201d';
  document.getElementById('ai-area').innerHTML = '';
  document.getElementById('verse-sheet').classList.add('open');
}
function closeVerseSheet(e) {
  if (e.target === document.getElementById('verse-sheet')) document.getElementById('verse-sheet').classList.remove('open');
}
function copyVerse() {
  if (!selectedVerse) return;
  navigator.clipboard.writeText('\u201c' + selectedVerse.text + '\u201d \u2014 ' + selectedVerse.ref).catch(() => {});
  toast('Verse copied!');
}
function addNote() {
  const ref = selectedVerse?.ref || '';
  const text = prompt('Add a note for ' + ref + ':');
  if (text?.trim()) {
    if (!S.notes) S.notes = [];
    S.notes.unshift({ ref, text: text.trim(), date: new Date().toLocaleDateString(), book: S.currentBook || '' });
    save(); renderNotes(); renderHome(); toast('Note saved!');
  }
}

// ── AI: VERSE DEEP DIVE ─────────────────────────────────
async function askAI() {
  if (!S.aiKey) {
    document.getElementById('ai-area').innerHTML = `
      <div class="ai-response">
        <div class="ai-label">&#9881;&#65039; AI Key Required</div>
        <div class="ai-text" style="margin-bottom:12px">Add your Anthropic API key to unlock verse deep dives with historical context, word studies, and cross-references. Typical cost: ~$1–2/month.</div>
        <button class="btn-gold" onclick="document.getElementById('verse-sheet').classList.remove('open');showScreen('settings')">Set Up AI →</button>
      </div>`;
    return;
  }
  const v = selectedVerse;
  if (!v) return;
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  showAILoading('ai-area', 'Studying this verse in context\u2026');
  const prompt = `You are a biblical scholar helping a family Bible study group. Explain this verse deeply and clearly.

Verse: "${v.text}"
Reference: ${v.ref}
Book: ${b?.name || ''}
Chapter: ${S.currentChapter}

Provide a rich, structured explanation covering:

1. PLAIN MEANING — What does this verse say in simple terms? (2-3 sentences, beginner-friendly)

2. CONTEXT — Who is speaking? To whom? What is happening immediately before and after this verse? Why was it written? (3-4 sentences)

3. ORIGINAL LANGUAGE — If there is a key Greek or Hebrew word that adds meaning, share the word, its meaning, and why it matters. (2-3 sentences. Skip if not significant.)

4. CROSS-REFERENCES — Provide exactly 3 Bible verses that help interpret this verse. For each:
   • [Reference] — [One sentence explaining how it connects and clarifies meaning]

5. COMMON MISUNDERSTANDINGS — Is this verse often taken out of context or misunderstood? Clarify briefly. (2-3 sentences. Write "None noted" if not applicable.)

6. APPLICATION — What is one practical way this verse should change how we think or live this week? (2-3 sentences, family-friendly)

7. SUMMARY — One clear sentence summing up the verse's meaning based on Scripture alone.

Rules:
- Do not rely on personal opinion — ground everything in Scripture and established scholarship
- Keep language simple and family-friendly — no seminary jargon
- Scripture interprets Scripture — let the Bible explain itself`;

  try {
    const text = await callAI(prompt, 1400);
    renderVerseDeepDive(text, v.ref);
  } catch(err) { showAIError('ai-area', err.message); }
}

function renderVerseDeepDive(text, ref) {
  const sections = [
    { key: 'PLAIN MEANING',            icon: '📖' },
    { key: 'CONTEXT',                  icon: '🏛️' },
    { key: 'ORIGINAL LANGUAGE',        icon: '🔤' },
    { key: 'CROSS-REFERENCES',         icon: '🔗' },
    { key: 'COMMON MISUNDERSTANDINGS', icon: '⚠️' },
    { key: 'APPLICATION',              icon: '✅' },
    { key: 'SUMMARY',                  icon: '💡' },
  ];

  function extract(key, nextKey) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nesc = nextKey ? nextKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    const pat = new RegExp(esc + '[:\\s\\-]*(\\d+\\.\\s*)?(\\n|\\r|\\s)*((?:[\\s\\S]*?))(?=' + (nesc || '$') + '|$)', 'i');
    const m = text.match(pat);
    return m ? m[3].trim() : '';
  }

  let html = `<div class="ai-response fade-up"><div class="ai-label">&#128214; Verse Deep Dive &mdash; ${ref}</div>`;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], nextKey = sections[i + 1]?.key;
    let content = extract(s.key, nextKey);
    if (!content) continue;

    if (s.key === 'CROSS-REFERENCES') {
      const lines = content.split('\n').filter(l => l.trim());
      const formatted = lines.map(line => {
        const clean = line.replace(/^[•\-\*]\s*/, '').trim();
        const dash = clean.search(/ [—\-] /);
        if (dash > -1) {
          const refPart = clean.slice(0, dash).trim();
          const explain = clean.slice(dash + 3).trim();
          return `<div style="margin-bottom:10px"><span class="cross-ref-chip">${refPart}</span><div class="ai-text" style="font-size:14px;padding:5px 4px 0">${explain}</div></div>`;
        }
        return `<div class="ai-text">${clean}</div>`;
      }).join('');
      html += `<div style="margin-bottom:14px"><div class="ai-section-title">${s.icon} ${s.key}</div>${formatted}</div>`;
    } else if (s.key === 'SUMMARY') {
      html += `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:10px;padding:14px 16px;margin-top:8px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);margin-bottom:6px">${s.icon} ${s.key}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-style:italic;color:var(--text);line-height:1.5">&ldquo;${content}&rdquo;</div>
      </div>`;
    } else {
      html += `<div style="margin-bottom:14px"><div class="ai-section-title">${s.icon} ${s.key}</div><div class="ai-text">${content.replace(/\n/g,'<br>')}</div></div>`;
    }
  }
  if (html === `<div class="ai-response fade-up"><div class="ai-label">&#128214; Verse Deep Dive &mdash; ${ref}</div>`) {
    html += `<div class="ai-text">${text.replace(/\n/g,'<br>')}</div>`;
  }
  html += '</div>';
  document.getElementById('ai-area').innerHTML = html;
}

// ── AI: CHAPTER STUDY MODE ──────────────────────────────
function openChapterStudy() {
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  if (!b) return;
  setText('study-hdr', b.name + ' — Study');
  showScreen('study');
  renderChapterStudy(b);
}

async function renderChapterStudy(book) {
  const cKey = S.currentBook + '-' + S.currentChapter + '-' + S.translation;
  const verses = cache[cKey] || [];
  const chapterText = verses.slice(0, 30).map(v => v.v + '. ' + v.t).join(' ');

  // Build tabs
  const tabs = ['Overview', 'Deep Dive', 'Discussion', 'Application'];
  document.getElementById('study-tabs').innerHTML = tabs.map((tab, i) =>
    `<button id="stab-${i}" onclick="switchStudyTab(${i})" style="
      padding:10px 14px;border:none;background:none;font-family:'DM Sans',sans-serif;
      font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;
      border-bottom:2px solid ${i===0?'var(--gold)':'transparent'};
      color:${i===0?'var(--gold)':'var(--text3)'};">${tab}</button>`
  ).join('');

  if (!S.aiKey) {
    document.getElementById('study-content').innerHTML = `
      <div style="padding:32px 0;text-align:center">
        <div style="font-size:40px;margin-bottom:14px">&#129504;</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--text);margin-bottom:10px">AI Key Required</div>
        <div style="font-size:14px;color:var(--text2);line-height:1.65;margin-bottom:20px">
          Chapter Study Mode uses AI to give you deep context, cross-references, discussion questions, and practical application for every chapter.<br><br>
          Add your Anthropic API key in Settings to unlock this feature. Typical cost: ~$1–2/month.
        </div>
        <button class="btn-gold" onclick="showScreen('settings')">Set Up AI →</button>
      </div>`;
    return;
  }

  document.getElementById('study-content').innerHTML = `
    <div class="loading-wrap">
      <div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>
      <div class="loading-text">AI is studying ${book.name} ${S.currentChapter}&hellip;</div>
    </div>`;

  try {
    const [overview, deepDive, discussion, application] = await Promise.all([
      fetchStudyOverview(book, chapterText),
      fetchStudyDeepDive(book, chapterText),
      fetchStudyDiscussion(book, chapterText),
      fetchStudyApplication(book, chapterText),
    ]);
    window._studyTabs = [overview, deepDive, discussion, application];
    switchStudyTab(0);
  } catch(err) {
    document.getElementById('study-content').innerHTML = `
      <div style="padding:24px 0;text-align:center;color:var(--text3);font-size:14px;line-height:1.6">
        Could not load study. Check your AI key and internet connection.<br><br>
        <span style="color:var(--red)">${err.message}</span>
      </div>`;
  }
}

window._studyTabs = [];
function switchStudyTab(idx) {
  document.querySelectorAll('[id^="stab-"]').forEach((btn, i) => {
    btn.style.borderBottom = i === idx ? '2px solid var(--gold)' : '2px solid transparent';
    btn.style.color = i === idx ? 'var(--gold)' : 'var(--text3)';
  });
  const content = document.getElementById('study-content');
  if (content && window._studyTabs[idx]) {
    content.innerHTML = window._studyTabs[idx];
    content.scrollTop = 0;
  }
}

async function fetchStudyOverview(book, chapterText) {
  const prompt = `You are helping a family Bible study group understand ${book.name} chapter ${S.currentChapter}.

${chapterText ? 'Chapter text (first 30 verses):\n' + chapterText : ''}

Book purpose: ${book.purpose}
Written to: ${book.audience}
Period: ${book.period}
Cultural context: ${book.culture}
How it fits Scripture: ${book.fit}

Provide a clear chapter overview covering these sections exactly:

WHAT HAPPENED
A plain-English summary of the main events or teachings in this chapter. Tell it like a story. (4-5 sentences)

WHO IS INVOLVED
Key people, groups, or voices in this chapter and their role. (2-3 sentences)

HISTORICAL & CULTURAL BACKGROUND
What was happening historically that makes this chapter more understandable? What did the original readers know that we might miss today? (3-4 sentences)

WHERE THIS FITS
How does this chapter connect to what came before and after? How does it fit in the bigger story of this book and the whole Bible? (3-4 sentences)

KEY VERSE
Name the single most important verse in this chapter and explain in 2 sentences why it is the key verse.

Keep everything simple, clear, and engaging for a family with no formal theology background.`;

  const text = await callAI(prompt, 1200);
  return formatStudySections(text, ['WHAT HAPPENED','WHO IS INVOLVED','HISTORICAL & CULTURAL BACKGROUND','WHERE THIS FITS','KEY VERSE']);
}

async function fetchStudyDeepDive(book, chapterText) {
  const prompt = `You are a biblical scholar helping a family Bible study group go deeper in ${book.name} chapter ${S.currentChapter}.

${chapterText ? 'Chapter text (first 30 verses):\n' + chapterText : ''}

Provide a deep study covering these sections exactly:

MAIN THEMES
What are the 2-3 central theological themes of this chapter? Explain each with supporting Scripture. (2-3 sentences per theme)

SCRIPTURE CROSS-REFERENCES
Provide 4-5 Bible passages (Old or New Testament) that directly connect to this chapter's themes. For each:
• [Reference] — [2 sentences explaining the connection and how it deepens understanding]

WORD STUDY
Pick 1-2 important Greek or Hebrew words from this chapter. Share the original word, its literal meaning, and why understanding it changes or deepens how we read the text. (2-3 sentences each)

WHAT THE WHOLE BIBLE SAYS
What does the broader Bible consistently teach about the central topic of this chapter? (4-5 sentences, cite 2-3 references)

Keep everything grounded in Scripture. Let the Bible interpret itself — no personal speculation.`;

  const text = await callAI(prompt, 1400);
  return formatStudySections(text, ['MAIN THEMES','SCRIPTURE CROSS-REFERENCES','WORD STUDY','WHAT THE WHOLE BIBLE SAYS']);
}

async function fetchStudyDiscussion(book, chapterText) {
  const prompt = `Create a family Bible study discussion guide for ${book.name} chapter ${S.currentChapter}.

${chapterText ? 'Chapter text (first 30 verses):\n' + chapterText : ''}

The group includes adults and possibly teenagers with no formal theology background. Make questions engaging and directly based on the text.

OBSERVATION QUESTIONS
3 questions that require the group to look carefully at what the text actually says. Begin each with "According to the text..." or "What does verse X say about..."

INTERPRETATION QUESTIONS
3 questions that help the group understand what the text means and how it connects to other Scripture.

APPLICATION QUESTIONS
3 questions that connect this chapter to everyday life and challenge the group to respond personally. Begin with "How does..." or "What would it look like if..."

PRAYER PROMPTS
3 specific things to pray about based on this chapter's content.

Format each question on its own line with a number. Keep language warm and conversational.`;

  const text = await callAI(prompt, 1200);
  return formatStudySections(text, ['OBSERVATION QUESTIONS','INTERPRETATION QUESTIONS','APPLICATION QUESTIONS','PRAYER PROMPTS']);
}

async function fetchStudyApplication(book, chapterText) {
  const prompt = `Help a family Bible study group apply ${book.name} chapter ${S.currentChapter} to their daily lives.

${chapterText ? 'Chapter text (first 30 verses):\n' + chapterText : ''}

Provide practical, family-friendly application covering these sections exactly:

THIS WEEK'S CHALLENGE
One specific, concrete action the whole family can do this week based on this chapter. Be specific — not vague. (3-4 sentences)

FOR EACH PERSON
How might a parent, a teenager, and a younger child each apply this chapter differently? Give one specific idea for each. (2-3 sentences each)

A STRUGGLE THIS CHAPTER ADDRESSES
What is one real-life struggle or temptation that this chapter speaks directly to? How does the chapter's teaching help? (3-4 sentences)

MEMORIZE THIS
Recommend one verse from this chapter to memorize as a family and explain in 2-3 sentences why this verse is worth hiding in your heart.

CLOSING ENCOURAGEMENT
A short, warm, Scripture-grounded encouragement for the family as they close this study. (2-3 sentences)`;

  const text = await callAI(prompt, 1200);
  return formatStudySections(text, ["THIS WEEK'S CHALLENGE",'FOR EACH PERSON','A STRUGGLE THIS CHAPTER ADDRESSES','MEMORIZE THIS','CLOSING ENCOURAGEMENT']);
}

function formatStudySections(text, sectionKeys) {
  const icons = {
    'WHAT HAPPENED':'📖','WHO IS INVOLVED':'👥','HISTORICAL & CULTURAL BACKGROUND':'🏛️',
    'WHERE THIS FITS':'🗺️','KEY VERSE':'⭐','MAIN THEMES':'🎯',
    'SCRIPTURE CROSS-REFERENCES':'🔗','WORD STUDY':'🔤','WHAT THE WHOLE BIBLE SAYS':'📜',
    'OBSERVATION QUESTIONS':'👁️','INTERPRETATION QUESTIONS':'💭',
    'APPLICATION QUESTIONS':'✅','PRAYER PROMPTS':'🙏',
    "THIS WEEK'S CHALLENGE":'🚀','FOR EACH PERSON':'👨‍👩‍👧',
    'A STRUGGLE THIS CHAPTER ADDRESSES':'⚔️','MEMORIZE THIS':'💾',
    'CLOSING ENCOURAGEMENT':'❤️',
  };
  let html = '';
  for (let i = 0; i < sectionKeys.length; i++) {
    const key = sectionKeys[i], nextKey = sectionKeys[i + 1];
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nesc = nextKey ? nextKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    const pat = new RegExp(esc + '[:\\s]*((?:[\\s\\S]*?))(?=' + (nesc || '$') + '|$)', 'i');
    const m = text.match(pat);
    if (!m) continue;
    let content = m[1].trim();
    const icon = icons[key] || '📌';

    if (key.includes('CROSS-REFERENCES') || key.includes('SCRIPTURE CROSS')) {
      const lines = content.split('\n').filter(l => l.trim());
      const formatted = lines.map(line => {
        const clean = line.replace(/^[•\-\*\d\.]\s*/, '').trim();
        const dash = clean.search(/ [—\-] /);
        if (dash > -1) {
          return `<div style="margin-bottom:10px"><span class="cross-ref-chip">${clean.slice(0,dash).trim()}</span><div class="ai-text" style="font-size:14px;padding:5px 4px 0">${clean.slice(dash+3).trim()}</div></div>`;
        }
        return `<div class="ai-text">${clean}</div>`;
      }).join('');
      html += `<div style="margin-bottom:18px"><div class="ai-section-title">${icon} ${key}</div>${formatted}</div>`;

    } else if (key.includes('QUESTION') || key.includes('PRAYER')) {
      const lines = content.split('\n').filter(l => l.trim());
      const formatted = lines.map(line => {
        const clean = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (!clean) return '';
        return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:15px;color:var(--text2);line-height:1.5">${clean}</div>`;
      }).join('');
      html += `<div style="margin-bottom:18px"><div class="ai-section-title">${icon} ${key}</div>${formatted}</div>`;

    } else if (key === 'MEMORIZE THIS' || key === 'KEY VERSE') {
      html += `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:10px;padding:16px;margin-bottom:18px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);margin-bottom:8px">${icon} ${key}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--text);line-height:1.6;font-style:italic">${content.replace(/\n/g,'<br>')}</div>
      </div>`;

    } else if (key === 'CLOSING ENCOURAGEMENT') {
      html += `<div style="background:linear-gradient(135deg,var(--bg3),var(--surface));border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:18px;text-align:center">
        <div style="font-size:22px;margin-bottom:10px">${icon}</div>
        <div style="font-size:15px;color:var(--text2);line-height:1.65">${content.replace(/\n/g,'<br>')}</div>
      </div>`;

    } else {
      html += `<div style="margin-bottom:18px"><div class="ai-section-title">${icon} ${key}</div><div class="ai-text">${content.replace(/\n/g,'<br>')}</div></div>`;
    }
  }
  return html || `<div class="ai-text">${text.replace(/\n/g,'<br>')}</div>`;
}

// ── AI: QUIZ GENERATOR ──────────────────────────────────
async function openQuiz() {
  document.getElementById('verse-sheet').classList.remove('open');
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  setText('quiz-hdr', (b?.name || '') + ' ' + S.currentChapter + ' Quiz');
  showScreen('quiz');

  const preset = QUIZZES[S.currentBook + '-' + S.currentChapter];
  if (preset) { renderQuiz(preset.slice(0, 3)); return; }

  const body = document.getElementById('quiz-body');

  if (!S.aiKey) {
    body.innerHTML = `
      <div style="padding:32px 20px;text-align:center">
        <div style="font-size:36px;margin-bottom:14px">&#128173;</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold-light);margin-bottom:8px">Family Discussion</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:16px">Add an AI key in Settings to get AI-generated quizzes for every chapter. For now, use these discussion questions:</div>
        ${discussionFallback()}
        <button class="btn-gold" onclick="openComplete()">Mark Chapter Complete &#10003;</button>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div style="padding:24px 20px">
      <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius);padding:14px 16px;margin-bottom:16px">
        <div style="font-size:12px;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">&#129504; AI is generating your quiz</div>
        <div style="font-size:14px;color:var(--text2)">Creating 3 questions based on ${b?.name||''} ${S.currentChapter}&hellip;</div>
      </div>
      <div class="loading-wrap" style="padding:20px 0">
        <div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>
      </div>
    </div>`;

  const cKey = S.currentBook + '-' + S.currentChapter + '-' + S.translation;
  const verses = cache[cKey] || [];
  const chapterText = verses.slice(0, 25).map(v => v.v + '. ' + v.t).join(' ');

  const prompt = `You are a Bible teacher creating a comprehension quiz for a family Bible study group who just finished reading ${b?.name||''} chapter ${S.currentChapter}.

${chapterText ? 'Chapter text:\n' + chapterText : 'Book: ' + (b?.name||'') + ', Chapter: ' + S.currentChapter}

Create EXACTLY 3 multiple choice questions. Each question must:
- Be based directly on what the text actually says (not outside trivia)
- Require genuine understanding, not surface reading
- Have exactly 4 answer options — only one correct
- Include a clear, Scripture-based explanation for why the correct answer is right
- Reference the specific verse(s) that support the correct answer

Output ONLY valid JSON — no markdown fences, no explanation, no extra text:
[
  {
    "q": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explain": "Explanation of why this answer is correct, grounded in the text.",
    "ref": "Book Chapter:Verse"
  },
  {
    "q": "Question 2?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 2,
    "explain": "Explanation.",
    "ref": "Book Chapter:Verse"
  },
  {
    "q": "Question 3?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 1,
    "explain": "Explanation.",
    "ref": "Book Chapter:Verse"
  }
]`;

  try {
    const text = await callAI(prompt, 1200);
    const clean = text.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(clean);
    if (Array.isArray(questions) && questions.length >= 3) {
      renderQuiz(questions.slice(0, 3));
    } else { throw new Error('Invalid format returned.'); }
  } catch(err) {
    body.innerHTML = `
      <div style="padding:20px 16px">
        <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius);padding:14px;margin-bottom:16px">
          <div style="font-size:13px;color:var(--text3)">Quiz generation failed (${err.message}). Here are discussion questions instead:</div>
        </div>
        ${discussionFallback()}
        <button class="btn-gold" style="width:100%" onclick="openComplete()">Mark Chapter Complete &#10003;</button>
      </div>`;
  }
}

function discussionFallback() {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius);padding:16px;margin-bottom:16px;text-align:left">
    <div style="font-size:15px;color:var(--text2);line-height:2.2">
      1. What happened in this chapter?<br>
      2. What does this reveal about God&apos;s character?<br>
      3. Is there a command, promise, or warning here?<br>
      4. How does this connect to other Scripture we know?<br>
      5. What should change in how we live this week?
    </div>
  </div>`;
}

function renderQuiz(questions) {
  let score = 0, answered = 0;
  document.getElementById('quiz-body').innerHTML = `
    <div style="padding:16px 16px 8px">
      <div style="font-size:13px;color:var(--text3)">3 questions &middot; All answers from Scripture</div>
    </div>
    ${questions.map((q, qi) => `
      <div class="quiz-q" id="qq-${qi}">
        <div class="quiz-q-text">${qi + 1}. ${q.q}</div>
        ${q.options.map((opt, oi) => `
          <button class="quiz-option" id="qo-${qi}-${oi}" onclick="answerQ(${qi},${oi},${q.correct})">${opt}</button>`).join('')}
        <div class="quiz-explain" id="qe-${qi}">
          <div>${q.explain}</div>
          <div class="quiz-ref">&#128214; ${q.ref}</div>
        </div>
      </div>`).join('')}
    <div id="quiz-result" style="display:none;padding:24px 16px;text-align:center">
      <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--gold-light);margin-bottom:8px">Quiz Complete</div>
      <div id="quiz-score" style="font-size:16px;color:var(--text2);margin-bottom:20px"></div>
      <button class="btn-gold" onclick="openComplete()">Mark Chapter Complete &#10003;</button>
    </div>`;

  window.answerQ = function(qi, sel, correct) {
    const exp = document.getElementById('qe-' + qi);
    if (exp.classList.contains('show')) return;
    answered++;
    if (sel === correct) score++;
    for (let i = 0; i < questions[qi].options.length; i++) {
      const btn = document.getElementById('qo-' + qi + '-' + i);
      btn.disabled = true;
      if (i === correct) btn.classList.add('correct');
      else if (i === sel) btn.classList.add('wrong');
    }
    exp.classList.add('show');
    if (answered === 3) {
      document.getElementById('quiz-result').style.display = 'block';
      const pct = Math.round(score / 3 * 100);
      document.getElementById('quiz-score').textContent =
        `${score} of 3 correct (${pct}%) \u2014 ${pct === 100 ? 'Perfect score! \uD83C\uDF89' : 'Keep growing in His Word!'}`;
    }
  };
}

// ── COMPLETE MODAL ──────────────────────────────────────
function openComplete() {
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  setText('cm-title', (b ? b.name + ' ' + S.currentChapter : 'Chapter') + ' Complete!');
  setText('cm-sub', 'What did God show you in this chapter?');
  document.getElementById('cm-note').value = '';
  document.getElementById('cm-note').placeholder = 'Write your insight or takeaway\u2026';
  document.getElementById('complete-modal').classList.add('open');
}
function saveComplete() {
  const key = S.currentBook + '-' + S.currentChapter;
  S.completedChapters[key] = true;
  const note = document.getElementById('cm-note').value.trim();
  if (note) {
    const b = NT_BOOKS.find(x => x.id === S.currentBook);
    S.notes.unshift({ ref: (b?.name||S.currentBook) + ' ' + S.currentChapter, text: note, date: new Date().toLocaleDateString(), book: S.currentBook });
  }
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  S.totalMinutes = (S.totalMinutes||0) + rt(b?.wordCounts[(S.currentChapter-1)]||800);
  S.lastStudyDate = new Date().toDateString();
  S.streak = Math.max(1, S.streak||0);
  save(); closeComplete(); renderHome(); renderLibrary();
  const cKey = S.currentBook + '-' + S.currentChapter + '-' + S.translation;
  if (cache[cKey]) renderVerses(cache[cKey], S.currentChapter, true);
  if (b && bookProg(b) === b.chapters) setTimeout(() => {
    setText('cm-title', '\uD83C\uDF89 ' + b.name + ' Complete!');
    setText('cm-sub', 'All ' + b.chapters + ' chapters done! Theme: ' + b.purpose);
    document.getElementById('cm-note').value = '';
    document.getElementById('cm-note').placeholder = 'Your biggest takeaway from this entire book\u2026';
    document.getElementById('complete-modal').classList.add('open');
  }, 400);
}
function closeComplete() { document.getElementById('complete-modal').classList.remove('open'); }

// ── NOTES ───────────────────────────────────────────────
function renderNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  const notes = S.notes || [];
  if (!notes.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">&#9999;&#65039;</div><div class="empty-text">Your insights will appear here.<br>Tap any verse while reading &rarr; Add Note.</div></div>`;
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="note-card">
      <div class="note-ref">&#128214; ${n.ref}</div>
      <div class="note-text">${n.text}</div>
      <div class="note-date">${n.date}</div>
    </div>`).join('');
}

// ── ANALYTICS ───────────────────────────────────────────
function renderAnalytics() {
  const body = document.getElementById('analytics-body');
  if (!body) return;
  const p = ntProgress();
  const h = Math.floor((S.totalMinutes||0)/60), m = (S.totalMinutes||0)%60;
  const booksComplete = NT_BOOKS.filter(b => bookProg(b) === b.chapters).length;
  const notes = S.notes || [];
  body.innerHTML = `
    <div class="analytics-hero">
      <div class="analytics-big">${h}h ${m}m</div>
      <div class="analytics-big-label">Total time in Scripture</div>
    </div>
    <div class="analytics-grid">
      <div class="analytics-card"><div class="analytics-card-num">${p.done}</div><div class="analytics-card-label">Chapters Read</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${booksComplete}</div><div class="analytics-card-label">Books Complete</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${S.streak||0}</div><div class="analytics-card-label">Day Streak &#128293;</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${notes.length}</div><div class="analytics-card-label">Insights Saved</div></div>
    </div>
    <div style="padding:16px 16px 0">
      <div class="progress-card">
        <div class="progress-label">New Testament &mdash; ${p.done} of ${p.total} chapters</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div>
        <div class="progress-stats"><span>${p.pct}% complete</span><span>${p.total-p.done} remaining</span></div>
      </div>
    </div>
    ${notes.length ? `
      <div class="section-title">Recent Insights</div>
      ${notes.slice(0,8).map(n=>`
        <div class="insight-row" onclick="showScreen('notes')">
          <div class="insight-book">&#128214; ${n.ref} &middot; ${n.date}</div>
          <div class="insight-text">${n.text}</div>
        </div>`).join('')}` :
    `<div style="padding:28px 20px;text-align:center;color:var(--text3);font-size:14px;line-height:1.7">
      Start reading and marking chapters complete<br>to see your progress grow here.
    </div>`}
    <div style="padding:20px;text-align:center">
      <div style="font-family:'Cormorant Garamond',serif;font-size:17px;font-style:italic;color:var(--gold-light);margin-bottom:6px">&ldquo;Thy word have I hid in mine heart,<br>that I might not sin against thee.&rdquo;</div>
      <div style="font-size:12px;color:var(--text3)">Psalm 119:11</div>
    </div>`;
}

// ── SETTINGS ────────────────────────────────────────────
function initSettings() {
  const inp = document.getElementById('ai-key-inp');
  if (inp && S.aiKey) inp.value = S.aiKey;
  const tl = document.getElementById('trans-settings-list');
  if (tl && !tl.children.length) {
    tl.innerHTML = Object.entries(TRANSLATIONS).map(([key, t]) =>
      `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:14px;font-weight:500;color:var(--text)">${t.short}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${t.label}</div>
      </div>`
    ).join('');
  }
  refreshSettings();
}
function refreshSettings() {
  const inp = document.getElementById('ai-key-inp');
  if (inp && S.aiKey && !inp.value) inp.value = S.aiKey;
  const cc = document.getElementById('cache-count');
  if (cc) cc.textContent = Object.keys(cache).length + ' chapters';
}
function saveAIKey() {
  const key = document.getElementById('ai-key-inp')?.value?.trim();
  if (key) {
    S.aiKey = key; save(); renderAIStatus(); toast('AI key saved! Study features are now unlocked.');
    const btn = event.currentTarget;
    btn.textContent = '&#10003; Saved!'; btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Save AI Key'; btn.style.background = ''; }, 2000);
  } else { toast('Please enter a valid Anthropic API key.'); }
}
function showCacheStats() {
  const count = Object.keys(cache).length;
  const trans = [...new Set(Object.keys(cache).map(k => k.split('-').pop()))];
  toast(count + ' chapters cached \u00b7 ' + (trans.length ? trans.join(', ') : 'none'));
}
function clearCache() {
  if (confirm('Clear cached chapters? They will reload from the API on next read.')) {
    cache = {};
    try { localStorage.removeItem(CACHE_KEY); } catch(e) {}
    toast('Cache cleared.'); refreshSettings();
  }
}
function exportData() {
  const exp = {...S}; delete exp.aiKey;
  const blob = new Blob([JSON.stringify(exp, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'the-bridge-' + new Date().toISOString().split('T')[0] + '.json';
  a.click(); toast('Data exported!');
}
function confirmReset() {
  if (confirm('Reset ALL progress, notes, streak, and stats? This cannot be undone.')) {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(CACHE_KEY); } catch(e) {}
    location.reload();
  }
}

// ── AI CORE ─────────────────────────────────────────────
async function callAI(prompt, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': S.aiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

function showAILoading(containerId, msg) {
  document.getElementById(containerId).innerHTML = `
    <div class="ai-response">
      <div class="ai-label"><div class="ai-dot"></div> ${msg}</div>
      <div class="loading-dots" style="margin:8px 0"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>
    </div>`;
}
function showAIError(containerId, msg) {
  document.getElementById(containerId).innerHTML = `
    <div class="ai-response">
      <div class="ai-label">&#9888; Error</div>
      <div class="ai-text">Could not reach AI. Check your API key in Settings and try again.</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">${msg}</div>
    </div>`;
}
