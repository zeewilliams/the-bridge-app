// ============================================================
//  THE BRIDGE PUBLIC — app.js  v1.0
//  No AI key required · Embedded study content · PWA install
// ============================================================

const STORE_KEY = 'bridge_pub_v1';
const CACHE_KEY = 'bridge_pub_cache_v1';

let S = {
  translation: 'KJV',
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
let deferredInstallPrompt = null; // Android install prompt

// ── BOOT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupA2HS();
  if (S.seenWelcome) {
    nav('home');
    initApp();
  } else {
    // Show welcome — app inits when they tap Start
  }
});

function startApp() {
  S.seenWelcome = true;
  save();
  nav('home');
  initApp();
  // Show add-to-home-screen prompt after a short delay
  setTimeout(showA2HSBanner, 3000);
}

function initApp() {
  renderHome();
  renderLibrary();
  renderNotes();
  renderAnalytics();
  checkStreak();
}

// ── ADD TO HOME SCREEN ────────────────────────────────────
function setupA2HS() {
  // Android: capture the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // If already installed as PWA, never show banner
  if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
    return;
  }
}

function showA2HSBanner() {
  // Don't show if already a PWA
  if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return;
  // Don't show if dismissed recently
  const dismissed = localStorage.getItem('a2hs_dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  const banner = document.getElementById('a2hs-banner');
  const iosInstall = document.getElementById('ios-install');
  const installBtn = document.getElementById('a2hs-install-btn');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isIOS) {
    // iOS: show Safari share instructions
    iosInstall.style.display = 'block';
    installBtn.style.display = 'none';
  } else if (deferredInstallPrompt) {
    // Android: show native install button
    iosInstall.style.display = 'none';
    installBtn.style.display = 'block';
  } else {
    // Desktop or unsupported — show iOS-style instructions
    iosInstall.style.display = 'block';
    iosInstall.textContent = 'To install: open this page in your browser menu and select "Add to Home Screen" or "Install App."';
    installBtn.style.display = 'none';
  }

  banner.classList.add('show');
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dismissA2HS();
}

function dismissA2HS() {
  document.getElementById('a2hs-banner').classList.remove('show');
  localStorage.setItem('a2hs_dismissed', Date.now().toString());
}

// ── PERSIST ──────────────────────────────────────────────
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

// ── HELPERS ──────────────────────────────────────────────
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
  t._tid = setTimeout(() => t.style.display = 'none', 2800);
}
function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$'); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── NAV ──────────────────────────────────────────────────
function nav(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');
  if (screen === 'analytics') renderAnalytics();
  if (screen === 'notes') renderNotes();
}

// ── HOME ─────────────────────────────────────────────────
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
}

function showDailyVerse() {
  const v = DAILY_VERSES[Math.floor(Date.now() / 86400000) % DAILY_VERSES.length];
  openVerseSheet({ text: v.text, ref: v.ref });
}
function continueReading() {
  openReader(S.currentBook || 'matthew', S.currentChapter || 1);
}

// ── LIBRARY ──────────────────────────────────────────────
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

// ── BOOK DETAIL ──────────────────────────────────────────
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
      <div class="intro-row"><div class="intro-key">Author</div><div class="intro-val">${b.author}</div></div>
      <div class="intro-row"><div class="intro-key">Audience</div><div class="intro-val">${b.audience}</div></div>
      <div class="intro-row"><div class="intro-key">Purpose</div><div class="intro-val">${b.purpose}</div></div>
      <div class="intro-row"><div class="intro-key">Period</div><div class="intro-val">${b.period}</div></div>
      <div class="intro-row"><div class="intro-key">Culture</div><div class="intro-val">${b.culture}</div></div>
      <div class="intro-row"><div class="intro-key">Fits In</div><div class="intro-val">${b.fit}</div></div>
    </div>
    <div class="section-title" style="padding:16px 20px 8px">Chapters</div>
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
  nav('book');
}

// ── READER ───────────────────────────────────────────────
function openReader(bookId, chapter) {
  S.currentBook = bookId; S.currentChapter = chapter; save();
  const b = NT_BOOKS.find(x => x.id === bookId);
  setText('reader-hdr', (b ? b.name : '') + ' ' + chapter);
  setText('trans-pill', S.translation);
  renderHome();
  nav('reader');
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
  if (!bibleId || !bookCode) throw new Error('Book or translation not configured.');
  const chapterId = bookCode + '.' + chapter;
  const url = `${API_BASE}/bibles/${bibleId}/chapters/${chapterId}?content-type=json&include-notes=false&include-titles=true&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`;
  const res = await fetch(url, { headers: { 'api-key': API_KEY } });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Bible service error. Please try again later.');
    if (res.status === 403) throw new Error('Translation not available. Try KJV.');
    if (res.status === 404) throw new Error('Chapter not found in this translation.');
    throw new Error('Could not load chapter. Check your internet connection.');
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
        <div style="font-size:14px;font-weight:500;color:var(--gold-light)">Study This Chapter</div>
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
      <span style="font-size:12px;display:block;margin-top:6px">Tap any verse to study it</span>
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
  else nav('library');
}

// ── TRANSLATION ──────────────────────────────────────────
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

// ── VERSE SHEET ──────────────────────────────────────────
function openVerseSheet({ text, ref }) {
  selectedVerse = { text, ref };
  setText('sv-ref', ref || '');
  document.getElementById('sv-text').textContent = '\u201c' + text + '\u201d';
  document.getElementById('verse-study-area').innerHTML = '';
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

// ── VERSE STUDY (embedded) ───────────────────────────────
function openVerseStudy() {
  const v = selectedVerse;
  if (!v) return;
  const area = document.getElementById('verse-study-area');

  // Find relevant study content for this book
  const study = getBookStudy(S.currentBook);
  if (!study) {
    area.innerHTML = `<div style="padding:16px 0;font-size:14px;color:var(--text2)">
      Tap the Study button while reading to access full chapter context, cross-references, and discussion questions.
    </div>`;
    return;
  }

  // Show cross-references relevant to this verse
  const crossRefs = study.crossRefs || [];
  const refsHTML = crossRefs.map(r =>
    `<div style="margin-bottom:10px">
      <span class="cross-ref-chip">${r.ref}</span>
      <div class="study-text" style="font-size:14px;padding:5px 4px 0">${r.note}</div>
    </div>`
  ).join('');

  area.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-top:4px" class="fade-up">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        &#128214; Scripture Context — ${v.ref}
      </div>
      <div style="font-size:12px;color:var(--gold-light);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Book Overview</div>
      <div class="study-text" style="margin-bottom:14px">${study.overview.slice(0, 280)}&#8230; <span onclick="openChapterStudy()" style="color:var(--gold);cursor:pointer">Read full study →</span></div>
      ${refsHTML ? `<div style="font-size:12px;color:var(--gold-light);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Key Cross-References</div>${refsHTML}` : ''}
      <div style="background:var(--bg3);border-left:3px solid var(--gold);border-radius:8px;padding:12px 14px;margin-top:8px">
        <div style="font-size:12px;color:var(--gold);margin-bottom:4px">Memory Verse</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-style:italic;color:var(--text);line-height:1.5">&ldquo;${study.memoryVerse.text}&rdquo;</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${study.memoryVerse.ref}</div>
      </div>
    </div>`;
}

// ── CHAPTER STUDY ────────────────────────────────────────
function openChapterStudy() {
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  if (!b) return;
  setText('study-hdr', b.name + ' — Study');
  const study = getBookStudy(S.currentBook);
  renderStudyTabs(study, b);
  nav('study');
}

function renderStudyTabs(study, book) {
  const tabs = ['Overview', 'Deep Dive', 'Discussion', 'Application'];
  const tabsEl = document.getElementById('study-tabs');
  tabsEl.innerHTML = tabs.map((tab, i) =>
    `<button id="stab-${i}" onclick="switchStudyTab(${i})" style="
      padding:10px 14px;border:none;background:none;font-family:'DM Sans',sans-serif;
      font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;
      border-bottom:2px solid ${i===0?'var(--gold)':'transparent'};
      color:${i===0?'var(--gold)':'var(--text3)'};">${tab}</button>`
  ).join('');

  // Build all tab content
  window._studyTabs = [
    buildOverviewTab(study, book),
    buildDeepDiveTab(study, book),
    buildDiscussionTab(study, book),
    buildApplicationTab(study, book),
  ];
  switchStudyTab(0);
}

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

function buildOverviewTab(study, book) {
  return `
    <div class="study-section">
      <div class="study-section-title">📖 Book Overview</div>
      <div class="study-text">${study.overview}</div>
    </div>
    <div class="study-section">
      <div class="study-section-title">🎯 Key Themes</div>
      ${(study.keyThemes || []).map(t => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">${t.title}</div>
          <div class="study-text" style="margin-bottom:8px">${t.text}</div>
          <div>${(t.refs||[]).map(r => `<span class="cross-ref-chip">${r}</span>`).join('')}</div>
        </div>`).join('')}
    </div>
    <div class="study-section">
      <div class="study-section-title">🔤 Word Study</div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:10px;padding:14px 16px">
        <div style="font-size:16px;font-weight:600;color:var(--gold-light);margin-bottom:4px">${study.wordStudy?.word || ''}</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:8px">${study.wordStudy?.meaning || ''}</div>
        <div class="study-text">${study.wordStudy?.insight || ''}</div>
      </div>
    </div>
    <div class="study-section">
      <div class="study-section-title">⭐ Memory Verse</div>
      <div class="study-key-verse">
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-style:italic;color:var(--text);line-height:1.55;margin-bottom:8px">&ldquo;${study.memoryVerse?.text || ''}&rdquo;</div>
        <div style="font-size:12px;color:var(--gold)">${study.memoryVerse?.ref || ''}</div>
      </div>
    </div>`;
}

function buildDeepDiveTab(study, book) {
  const refs = study.crossRefs || [];
  return `
    <div class="study-section">
      <div class="study-section-title">🔗 Scripture Cross-References</div>
      <div class="study-text" style="margin-bottom:12px">These passages from across the Bible help interpret and deepen your understanding of ${book.name}. Scripture interprets Scripture.</div>
      ${refs.map(r => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px">
          <span class="cross-ref-chip" style="font-size:13px;padding:4px 12px;margin-bottom:8px;display:inline-block">${r.ref}</span>
          <div class="study-text">${r.note}</div>
        </div>`).join('')}
    </div>
    <div class="study-section">
      <div class="study-section-title">📜 How This Book Fits in Scripture</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
        <div class="study-text">${book.fit}</div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Written to: ${book.audience}</div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Period: ${book.period}</div>
          <div style="font-size:12px;color:var(--text3)">Cultural context: ${book.culture}</div>
        </div>
      </div>
    </div>`;
}

function buildDiscussionTab(study, book) {
  const questions = study.discussion || [];
  return `
    <div class="study-section">
      <div class="study-section-title">💬 Family Discussion Questions</div>
      <div class="study-text" style="margin-bottom:14px">Use these to guide your group. There are no wrong answers — the goal is to think carefully about Scripture together.</div>
      ${questions.map((q, i) => `
        <div class="study-question">${i + 1}. ${q}</div>`).join('')}
    </div>
    <div class="study-section">
      <div class="study-section-title">🙏 Prayer Prompts</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:10px;padding:14px 16px">
        <div class="study-text">Based on what you studied today, pray together about:</div>
        <div style="margin-top:10px;font-size:15px;color:var(--text2);line-height:2.1">
          &bull; What this book reveals about who God is<br>
          &bull; Any command or truth that is hard to obey<br>
          &bull; Someone you can share what you learned with<br>
          &bull; Gratitude for what God has done through Jesus
        </div>
      </div>
    </div>`;
}

function buildApplicationTab(study, book) {
  return `
    <div class="study-section">
      <div class="study-section-title">🚀 This Week's Challenge</div>
      <div class="study-challenge">
        <div class="study-text">${study.application}</div>
      </div>
    </div>
    <div class="study-section">
      <div class="study-section-title">💾 Verse to Memorize</div>
      <div class="study-key-verse">
        <div style="font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Hide this in your heart this week</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:19px;font-style:italic;color:var(--text);line-height:1.6;margin-bottom:8px">&ldquo;${study.memoryVerse?.text || ''}&rdquo;</div>
        <div style="font-size:13px;color:var(--gold)">${study.memoryVerse?.ref || ''}</div>
      </div>
    </div>
    <div class="study-section">
      <div class="study-section-title">❤️ Closing Encouragement</div>
      <div style="background:linear-gradient(135deg,var(--bg3),var(--surface));border:1px solid var(--border);border-radius:var(--radius);padding:18px;text-align:center">
        <div style="font-size:24px;margin-bottom:10px">✝️</div>
        <div class="study-text" style="text-align:left">God gave us His Word not just to inform our minds but to transform our lives. Every time your family opens the Bible together, you are doing something that matters — for this generation and the ones that come after. Keep going.</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:17px;font-style:italic;color:var(--gold-light);margin-top:14px">"Thy word is a lamp unto my feet, and a light unto my path." &mdash; Psalm 119:105</div>
      </div>
    </div>`;
}

// ── QUIZ ─────────────────────────────────────────────────
function openQuiz() {
  document.getElementById('verse-sheet').classList.remove('open');
  const qKey = S.currentBook + '-' + S.currentChapter;
  const questions = QUIZZES[qKey];
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  setText('quiz-hdr', (b?.name || '') + ' ' + S.currentChapter + ' Quiz');
  const body = document.getElementById('quiz-body');

  if (!questions || questions.length === 0) {
    body.innerHTML = `
      <div style="padding:32px 20px;text-align:center">
        <div style="font-size:36px;margin-bottom:14px">&#128173;</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold-light);margin-bottom:8px">Family Discussion</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:16px">Use these to guide your group:</div>
        <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius);padding:16px;margin-bottom:16px;text-align:left">
          <div style="font-size:15px;color:var(--text2);line-height:2.2">
            1. What happened in this chapter?<br>
            2. What does this reveal about God&apos;s character?<br>
            3. Is there a command, promise, or warning here?<br>
            4. How does this connect to other Scripture?<br>
            5. What should change in how we live this week?
          </div>
        </div>
        <button class="btn-gold" onclick="openComplete()">Mark Chapter Complete &#10003;</button>
      </div>`;
    nav('quiz'); return;
  }

  const qs = questions.slice(0, 3); // Always exactly 3
  let score = 0, answered = 0;

  body.innerHTML = `
    <div style="padding:16px 16px 8px">
      <div style="font-size:13px;color:var(--text3)">3 questions &middot; All answers from Scripture</div>
    </div>
    ${qs.map((q, qi) => `
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
    for (let i = 0; i < qs[qi].options.length; i++) {
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
        `${score} of 3 correct (${pct}%) \u2014 ${pct === 100 ? 'Perfect! 🎉' : 'Keep growing in His Word!'}`;
    }
  };
  nav('quiz');
}

// ── COMPLETE ─────────────────────────────────────────────
function openComplete() {
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  setText('cm-title', (b ? b.name + ' ' + S.currentChapter : 'Chapter') + ' Complete!');
  setText('cm-sub', 'What did God show you in this chapter?');
  document.getElementById('cm-note').value = '';
  document.getElementById('complete-modal').classList.add('open');
}
function saveComplete() {
  const key = S.currentBook + '-' + S.currentChapter;
  S.completedChapters[key] = true;
  const note = document.getElementById('cm-note').value.trim();
  if (note) {
    const b = NT_BOOKS.find(x => x.id === S.currentBook);
    S.notes.unshift({ ref: (b?.name || '') + ' ' + S.currentChapter, text: note, date: new Date().toLocaleDateString(), book: S.currentBook });
  }
  const b = NT_BOOKS.find(x => x.id === S.currentBook);
  S.totalMinutes = (S.totalMinutes || 0) + rt(b?.wordCounts[(S.currentChapter - 1)] || 800);
  S.lastStudyDate = new Date().toDateString();
  S.streak = Math.max(1, S.streak || 0);
  save(); closeComplete(); renderHome(); renderLibrary();
  const cKey = S.currentBook + '-' + S.currentChapter + '-' + S.translation;
  if (cache[cKey]) renderVerses(cache[cKey], S.currentChapter, true);
  if (b && bookProg(b) === b.chapters) setTimeout(() => {
    setText('cm-title', '🎉 ' + b.name + ' Complete!');
    setText('cm-sub', 'You finished all ' + b.chapters + ' chapters!');
    document.getElementById('cm-note').placeholder = 'Your biggest takeaway from this book\u2026';
    document.getElementById('complete-modal').classList.add('open');
  }, 400);
}
function closeComplete() { document.getElementById('complete-modal').classList.remove('open'); }

// ── NOTES ────────────────────────────────────────────────
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

// ── ANALYTICS ────────────────────────────────────────────
function renderAnalytics() {
  const body = document.getElementById('analytics-body');
  if (!body) return;
  const p = ntProgress();
  const h = Math.floor((S.totalMinutes || 0) / 60);
  const m = (S.totalMinutes || 0) % 60;
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
      <div class="analytics-card"><div class="analytics-card-num">${S.streak || 0}</div><div class="analytics-card-label">Day Streak &#128293;</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${notes.length}</div><div class="analytics-card-label">Insights Saved</div></div>
    </div>
    <div style="padding:0 16px 16px;margin-top:8px">
      <div class="progress-card">
        <div class="progress-label">New Testament &mdash; ${p.done} of ${p.total} chapters</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${p.pct}%"></div></div>
        <div class="progress-stats"><span>${p.pct}% complete</span><span>${p.total - p.done} remaining</span></div>
      </div>
    </div>
    ${notes.length ? `
      <div style="padding:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text3);padding:16px 20px 8px">Recent Insights</div>
      ${notes.slice(0, 6).map(n => `
        <div onclick="nav('notes')" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin:0 16px 8px;cursor:pointer">
          <div style="font-size:12px;color:var(--gold);margin-bottom:4px">&#128214; ${n.ref} &middot; ${n.date}</div>
          <div style="font-size:14px;color:var(--text2);line-height:1.4">${n.text}</div>
        </div>`).join('')}` : ''}
    <div style="padding:20px;text-align:center">
      <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-style:italic;color:var(--gold-light);margin-bottom:8px">&ldquo;Thy word have I hid in mine heart, that I might not sin against thee.&rdquo;</div>
      <div style="font-size:12px;color:var(--text3)">Psalm 119:11</div>
    </div>`;
}
