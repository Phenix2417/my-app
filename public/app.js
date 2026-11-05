// Bible Study — single-page app. No build step, no dependencies.

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
const LONG_PRESS_MS = 400;
const $app = document.getElementById('app');

/* ---------------- tiny DOM helper (always uses textContent, never innerHTML for data) ---------------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const svg = (d) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
};
const ICONS = {
  read: 'M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5zM17.5 10.5c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zM17.5 14.33c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z',
  notes: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10l6-6V5c0-1.1-.9-2-2-2zM5 19V5h14v9h-5v5H5zm2-12h10v2H7zm0 4h10v2H7zm0 4h5v2H7z',
  friends: 'M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zM4.34 17c.84-.58 2.87-1.25 4.66-1.25s3.82.67 4.66 1.25H4.34zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm0-5c.83 0 1.5.67 1.5 1.5S9.83 10 9 10s-1.5-.67-1.5-1.5S8.17 7 9 7zm7.04 6.81c1.16.84 1.96 1.96 1.96 3.44V19h4v-1.75c0-2.02-3.5-3.17-5.96-3.44zM15 12c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z',
};

/* ---------------- storage ---------------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('bs.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, v) { try { localStorage.setItem('bs.' + key, JSON.stringify(v)); } catch { /* full or blocked */ } },
  del(key) { try { localStorage.removeItem('bs.' + key); } catch { /* ignore */ } },
};

function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------------- state ---------------- */
const state = {
  auth: store.get('auth', null), // {token, user}
  tab: 'read',
  books: null,
  pos: store.get('pos', { book: 'john', chapter: 1 }),
  showFriends: store.get('showFriends', true),
  fontSize: store.get('fontSize', 22),
  notesTab: 'mine',
  mine: { notes: {}, queue: [] }, // my notes + pending sync ops
  friendNotes: [], // for the current chapter
  friendsFeed: store.get('friendsFeed', []),
  friends: store.get('friends', null),
  friendsError: false,
  notesError: false,
  selection: null, // {start:{v,w}, end:{v,w}}
};
const uid = () => state.auth?.user.id;
// Display names can be in any language; @username is the ASCII handle used to add friends.
const dn = (u) => u?.displayName || u?.username || 'Someone';
const firstChar = (s) => (Array.from(s)[0] || '?').toUpperCase();
const personName = (u, extra) => h('div', { class: 'person-name' },
  h('div', {}, h('div', { class: 'dname' }, dn(u)), h('div', { class: 'handle-sub' }, '@' + u.username)), extra);
const mineKey = () => `mine.${uid()}`;
const loadMine = () => { state.mine = store.get(mineKey(), { notes: {}, queue: [] }); };
const saveMine = () => store.set(mineKey(), state.mine);

/* ---------------- API ---------------- */
class OfflineError extends Error {}
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(state.auth ? { Authorization: `Bearer ${state.auth.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new OfflineError('You seem to be offline.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.auth && !path.startsWith('/api/login')) { signOut(true); throw new Error(data.error || 'Signed out'); }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

/* ---------------- sync of my notes ---------------- */
let flushing = null;
function queueOp(op, id) {
  state.mine.queue = state.mine.queue.filter((q) => q.id !== id);
  state.mine.queue.push({ op, id });
  saveMine();
  flush().catch(() => {});
}
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    while (state.mine.queue.length) {
      const { op, id } = state.mine.queue[0];
      try {
        if (op === 'put') {
          const n = state.mine.notes[id];
          if (n) {
            const { note } = await api('PUT', `/api/notes/${id}`, n);
            if (state.mine.notes[id] && state.mine.notes[id].updatedAt <= note.updatedAt) state.mine.notes[id] = note;
          }
        } else await api('DELETE', `/api/notes/${id}`);
      } catch (e) {
        if (e instanceof OfflineError || !e.status || e.status >= 500 || e.status === 429) throw e;
        // Rejected by the server (bad data): drop the op so the queue doesn't jam.
      }
      state.mine.queue.shift();
      saveMine();
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
async function refreshMine() {
  try {
    await flush();
    const { notes } = await api('GET', '/api/notes');
    const pending = new Set(state.mine.queue.map((q) => q.id));
    const next = {};
    for (const n of notes) next[n.id] = n;
    for (const id of pending) { if (state.mine.notes[id]) next[id] = state.mine.notes[id]; else delete next[id]; }
    state.mine.notes = next;
    saveMine();
    state.notesError = false;
  } catch { state.notesError = true; }
}
function saveNote(n) {
  n.updatedAt = Date.now();
  n.createdAt ??= n.updatedAt;
  state.mine.notes[n.id] = n;
  queueOp('put', n.id);
}
function deleteNote(id) {
  delete state.mine.notes[id];
  queueOp('del', id);
}

/* ---------------- friends ---------------- */
async function refreshFriends() {
  try {
    state.friends = await api('GET', '/api/friends');
    store.set('friends', state.friends);
    state.friendsError = false;
  } catch { state.friendsError = true; }
}
async function refreshChapterFriendNotes() {
  const { book, chapter } = state.pos;
  const key = `fn.${uid()}.${book}.${chapter}`;
  state.friendNotes = store.get(key, []);
  if (!state.showFriends) return;
  try {
    const { notes } = await api('GET', `/api/friends/notes?book=${book}&chapter=${chapter}`);
    if (state.pos.book !== book || state.pos.chapter !== chapter) return;
    state.friendNotes = notes;
    store.set(key, notes);
  } catch { /* keep saved copy */ }
}
async function refreshFeed() {
  try {
    const { notes } = await api('GET', '/api/friends/notes');
    state.friendsFeed = notes;
    store.set('friendsFeed', notes);
    return true;
  } catch { return false; }
}

/* ---------------- Bible text ---------------- */
const bookCache = new Map();
async function loadBooks() {
  if (state.books) return state.books;
  state.books = store.get('books', null);
  if (!state.books) {
    const res = await fetch('/api/books');
    state.books = (await res.json()).books;
    store.set('books', state.books);
  }
  return state.books;
}
async function loadBook(id) {
  if (!bookCache.has(id)) {
    const p = fetch(`/bible/${id}.json`).then((r) => { if (!r.ok) throw new Error('missing'); return r.json(); });
    bookCache.set(id, p);
    p.catch(() => bookCache.delete(id));
  }
  return bookCache.get(id);
}
const bookName = (id) => state.books?.find((b) => b.id === id)?.name || id;
const splitWords = (t) => t.split(/\s+/).filter(Boolean);

function ref(n) {
  const b = bookName(n.book);
  if (n.start.verse === n.end.verse) return `${b} ${n.chapter}:${n.start.verse}`;
  return `${b} ${n.chapter}:${n.start.verse}–${n.end.verse}`;
}

/* ---------------- shared UI ---------------- */
let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}

function openSheet(build, { label } = {}) {
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || 'Dialog' });
  const scrim = h('div', { class: 'scrim' }, sheet);
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  sheet.append(...[build(close)].flat());
  document.body.append(scrim);
  sheet.querySelector('[autofocus]')?.focus();
  return close;
}

function swatchRow(selected, onPick) {
  const row = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Highlight color' });
  for (const c of COLORS) {
    row.append(h('button', {
      class: 'swatch', type: 'button', 'aria-label': c, 'aria-pressed': String(c === selected), dataset: { c },
      onclick: () => { row.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.c === c))); onPick(c); },
    }));
  }
  return row;
}

function noteCard(n, { onClick, friend } = {}) {
  return h('div', { class: 'card' + (onClick ? ' clickable' : ''), onclick: onClick, tabindex: onClick ? 0 : null,
    onkeydown: onClick ? (e) => { if (e.key === 'Enter') onClick(); } : null },
  h('div', { class: 'card-head' }, h('span', {}, ref(n)), friend ? h('span', { class: 'who', title: '@' + n.author.username }, dn(n.author)) : null),
  h('div', { class: 'quote', dataset: { c: n.color } }, n.quote),
  n.body ? h('p', { class: 'note-body' }, n.body) : null);
}

function noteEditor(note, { isNew } = {}) {
  let color = note.color;
  openSheet((close) => {
    const ta = h('textarea', { placeholder: 'Write a note (optional)', autofocus: true, maxlength: 10000 });
    ta.value = note.body || '';
    return [
      h('h2', {}, ref(note)),
      h('div', { class: 'quote', dataset: { c: color } }, note.quote),
      h('div', { style: 'height:14px' }),
      swatchRow(color, (c) => { color = c; ta.closest('.sheet').querySelector('.quote').dataset.c = c; }),
      h('label', { class: 'field' }, h('span', {}, 'Note'), ta),
      h('div', { class: 'sheet-actions' },
        !isNew ? h('button', { class: 'text-btn danger', type: 'button', onclick: () => {
          if (!confirm('Delete this note?')) return;
          deleteNote(note.id); close(); rerender(); toast('Note deleted');
        } }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'text-btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'filled-btn', type: 'button', onclick: () => {
          saveNote({ ...note, color, body: ta.value.trim() });
          clearSelection(); close(); rerender();
        } }, 'Save')),
    ];
  }, { label: 'Edit note' });
}

/* ---------------- Reader ---------------- */
const reader = { words: [], gaps: [], verseEls: [], body: null, handles: null, toolbar: null, chapterData: null };
const cmp = (a, b) => a.v - b.v || a.w - b.w;
const inRange = (p, s, e) => cmp(p, s) >= 0 && cmp(p, e) <= 0;
const noteRange = (n) => [{ v: n.start.verse, w: n.start.word }, { v: n.end.verse, w: n.end.word }];

async function renderReader() {
  const { book, chapter } = state.pos;
  const books = await loadBooks();
  const meta = books.find((b) => b.id === book) || books[42];
  const idx = books.indexOf(meta);
  const prev = chapter > 1 ? { book, chapter: chapter - 1 } : idx > 0 ? { book: books[idx - 1].id, chapter: books[idx - 1].chapters } : null;
  const next = chapter < meta.chapters ? { book, chapter: chapter + 1 } : idx < books.length - 1 ? { book: books[idx + 1].id, chapter: 1 } : null;

  const body = h('div', { class: 'reader-body', style: `--verse-size:${state.fontSize}px` });
  const sw = h('input', { type: 'checkbox', class: 'switch', id: 'show-friends', checked: state.showFriends, onchange: async (e) => {
    state.showFriends = e.target.checked; store.set('showFriends', state.showFriends);
    paint();
    if (state.showFriends) { await refreshChapterFriendNotes(); paint(); }
  } });
  const screen = h('main', { class: 'screen' },
    h('h1', {}, `${meta.name} ${chapter}`),
    h('nav', { class: 'chapter-nav', 'aria-label': 'Chapter navigation' },
      h('button', { class: 'text-btn', disabled: !prev, onclick: () => goTo(prev) }, 'Previous'),
      h('button', { class: 'chapter-pill', onclick: openPicker, 'aria-label': 'Choose book and chapter' }, `${meta.name} ${chapter}`),
      h('button', { class: 'text-btn', disabled: !next, onclick: () => goTo(next) }, 'Next')),
    h('p', { class: 'hint' }, 'Hold a word or tap a verse number to select. Drag the handles to adjust.'),
    h('div', { class: 'switch-row' }, h('label', { for: 'show-friends' }, "Show friends' notes"), sw),
    body);
  mount(screen);
  reader.body = body;

  let data;
  try { data = await loadBook(meta.id); } catch {
    body.append(h('p', { class: 'error' }, "Couldn't load this chapter. Check your connection and try again."));
    return;
  }
  if (state.pos.book !== book || state.pos.chapter !== chapter || state.tab !== 'read') return;
  buildVerses(data[chapter - 1] || []);
  paint();
  refreshChapterFriendNotes().then(() => { if (reader.body === body) paint(); });
}

function buildVerses(verses) {
  reader.words = []; reader.gaps = []; reader.verseEls = [];
  const frag = document.createDocumentFragment();
  verses.forEach(([text, para], vi) => {
    const v = vi + 1;
    const verse = h('span', { class: 'verse' + (para && vi ? ' para' : ''), id: `v${v}` },
      h('span', { class: 'vnum', dataset: { v } }, v));
    splitWords(text).forEach((word, w, arr) => {
      const el = h('span', { class: 'w', dataset: { v, w } }, word);
      reader.words.push({ v, w, el });
      verse.append(el);
      if (w < arr.length - 1) {
        const g = h('span', { class: 'g' }, ' ');
        reader.gaps.push({ v, w, el: g }); // gap after word w
        verse.append(g);
      }
    });
    reader.verseEls[v] = verse;
    frag.append(verse);
  });
  reader.chapterData = verses;
  reader.body.append(frag);
  attachReaderGestures(reader.body);
}

function chapterNotes() {
  const { book, chapter } = state.pos;
  const mine = Object.values(state.mine.notes).filter((n) => n.book === book && n.chapter === chapter)
    .sort((a, b) => a.createdAt - b.createdAt);
  const friends = state.showFriends ? state.friendNotes.filter((n) => n.book === book && n.chapter === chapter) : [];
  return { mine, friends };
}

function notesAt(p) {
  const { mine, friends } = chapterNotes();
  const at = (n) => { const [s, e] = noteRange(n); return inRange(p, s, e); };
  return { mine: mine.filter(at), friends: friends.filter(at) };
}

// Apply highlight colors, friend underlines, note markers and the selection to the rendered words.
function paint() {
  if (!reader.body) return;
  const { mine, friends } = chapterNotes();
  const top = (list, p) => { let hit = null; for (const n of list) { const [s, e] = noteRange(n); if (inRange(p, s, e)) hit = n; } return hit; };
  const sel = state.selection;
  for (const { v, w, el } of reader.words) {
    const p = { v, w };
    const m = top(mine, p), f = top(friends, p);
    setAttr(el, 'data-c', m?.color); setAttr(el, 'data-f', f?.color);
    el.classList.toggle('sel', !!sel && inRange(p, sel.start, sel.end));
  }
  for (const { v, w, el } of reader.gaps) {
    const a = { v, w }, b = { v, w: w + 1 };
    const m1 = top(mine, a), m2 = top(mine, b), f1 = top(friends, a), f2 = top(friends, b);
    setAttr(el, 'data-c', m1 && m1 === m2 ? m1.color : null);
    setAttr(el, 'data-f', f1 && f1 === f2 ? f1.color : null);
    el.classList.toggle('sel', !!sel && inRange(a, sel.start, sel.end) && inRange(b, sel.start, sel.end));
  }
  reader.body.querySelectorAll('.mark').forEach((m) => m.remove());
  const addMark = (n, cls, label, text) => {
    const end = reader.words.find((x) => x.v === n.end.verse && x.w === n.end.word);
    if (!end) return;
    end.el.after(h('button', { class: `mark ${cls}`, 'aria-label': label, title: label,
      onclick: (e) => { e.stopPropagation(); showNotesAt({ v: n.end.verse, w: n.end.word }); } }, text));
  };
  for (const n of mine) if (n.body) addMark(n, 'mine', 'Your note', '✎');
  for (const n of friends) addMark(n, `f-${n.color}`, `Note from ${dn(n.author)}`, firstChar(dn(n.author)));
  positionHandles();
}
function setAttr(el, name, val) { if (val) el.setAttribute(name, val); else el.removeAttribute(name); }

/* ----- selection with draggable handles ----- */
function setSelection(start, end) {
  if (cmp(start, end) > 0) [start, end] = [end, start];
  state.selection = { start, end };
  paint();
  showToolbar();
}
function clearSelection() {
  if (!state.selection) return;
  state.selection = null;
  paint();
  reader.toolbar?.remove(); reader.toolbar = null;
}
const wordEl = (p) => reader.words.find((x) => x.v === p.v && x.w === p.w)?.el;

function selectedQuote() {
  const { start, end } = state.selection;
  return reader.words.filter((x) => inRange(x, start, end)).map((x) => x.el.textContent).join(' ');
}

const KNOB = 22;
function makeHandle() {
  const el = h('div', { class: 'handle', role: 'slider', tabindex: 0 }, h('div', { class: 'bar' }), h('div', { class: 'knob' }));
  el.addEventListener('pointerdown', (e) => startHandleDrag(e, el));
  el.addEventListener('keydown', (e) => nudgeHandle(e, el.dataset.role));
  return el;
}
// Handles are persistent elements so an in-progress drag keeps its pointer capture while we repaint.
function positionHandles() {
  if (!state.selection || !reader.body) { reader.handles?.start.remove(); reader.handles?.end.remove(); reader.handles = null; return; }
  if (!reader.handles || !reader.body.contains(reader.handles.start)) {
    reader.handles = { start: makeHandle(), end: makeHandle() };
    reader.body.append(reader.handles.start, reader.handles.end);
  }
  const box = reader.body.getBoundingClientRect();
  for (const role of ['start', 'end']) {
    const handle = reader.handles[role];
    const el = wordEl(state.selection[role]);
    if (!el) continue;
    const rects = el.getClientRects();
    const r = role === 'start' ? rects[0] : rects[rects.length - 1];
    const x = (role === 'start' ? r.left : r.right) - box.left;
    const top = r.top - box.top, height = r.height;
    handle.dataset.role = role;
    handle.className = `handle ${role}`;
    handle.setAttribute('aria-label', role === 'start' ? 'Selection start' : 'Selection end');
    Object.assign(handle.style, { left: `${x}px`, top: `${role === 'start' ? top - KNOB + 2 : top}px`, height: `${height + KNOB}px` });
    Object.assign(handle.firstChild.style, { top: `${role === 'start' ? KNOB - 2 : 0}px`, height: `${height}px` });
    handle.lastChild.style.top = role === 'start' ? '0px' : `${height - 2}px`;
  }
}

// Find the word nearest to a viewport point.
function wordAtPoint(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (hit?.classList?.contains('w')) return { v: +hit.dataset.v, w: +hit.dataset.w };
  let best = null, bestD = Infinity;
  for (const wd of reader.words) {
    for (const r of wd.el.getClientRects()) {
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dy * 4 + dx; // prefer the same line
      if (d < bestD) { bestD = d; best = wd; }
    }
  }
  return best && { v: best.v, w: best.w };
}

let autoScroll = null;
function autoScrollFor(y, onTick) {
  cancelAnimationFrame(autoScroll?.raf);
  const edge = 70, bottomEdge = window.innerHeight - 170;
  const speed = y < edge ? -(edge - y) / 4 : y > bottomEdge ? (y - bottomEdge) / 4 : 0;
  if (!speed) { autoScroll = null; return; }
  const tick = () => { window.scrollBy(0, speed); onTick(); autoScroll = { raf: requestAnimationFrame(tick) }; };
  autoScroll = { raf: requestAnimationFrame(tick) };
}
function stopAutoScroll() { cancelAnimationFrame(autoScroll?.raf); autoScroll = null; }

function startHandleDrag(e, handle) {
  e.preventDefault(); e.stopPropagation();
  handle.setPointerCapture(e.pointerId);
  reader.toolbar?.remove(); reader.toolbar = null;
  const role = handle.dataset.role;
  const anchor = role === 'start' ? state.selection.end : state.selection.start;
  // Aim at the text line, not at the knob under the finger.
  const offsetY = role === 'start' ? 24 : -24;
  let last = { x: e.clientX, y: e.clientY };
  const update = () => {
    const p = wordAtPoint(last.x, last.y + offsetY);
    if (!p) return;
    const before = cmp(p, anchor) < 0;
    const next = before ? { start: p, end: anchor } : { start: anchor, end: p };
    // If the dragged handle crossed the other one, swap their roles so the finger keeps "its" end.
    const wantRole = before ? 'start' : 'end';
    if (reader.handles[wantRole] !== handle) reader.handles = { start: reader.handles.end, end: reader.handles.start };
    if (cmp(next.start, state.selection.start) || cmp(next.end, state.selection.end)) { state.selection = next; paint(); }
  };
  const move = (ev) => { last = { x: ev.clientX, y: ev.clientY }; update(); autoScrollFor(ev.clientY, update); };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    stopAutoScroll();
    showToolbar();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

function nudgeHandle(e, which) {
  const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  const i = reader.words.findIndex((x) => !cmp(x, state.selection[which]));
  const j = Math.max(0, Math.min(reader.words.length - 1, i + dir));
  const p = { v: reader.words[j].v, w: reader.words[j].w };
  const other = which === 'start' ? state.selection.end : state.selection.start;
  setSelection(which === 'start' ? p : other, which === 'start' ? other : p);
  reader.handles?.[which]?.focus();
}

function attachReaderGestures(body) {
  let press = null; // {timer, x, y, word, sliding}
  const cancel = () => { if (press) clearTimeout(press.timer); press = null; };

  body.addEventListener('contextmenu', (e) => e.preventDefault());
  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.handle, .mark')) return;
    const wEl = e.target.closest('.w');
    cancel();
    const word = wEl ? { v: +wEl.dataset.v, w: +wEl.dataset.w } : null;
    press = { x: e.clientX, y: e.clientY, word, sliding: false, id: e.pointerId };
    if (!word) return;
    press.timer = setTimeout(() => {
      if (!press) return;
      press.sliding = true;
      navigator.vibrate?.(12);
      setSelection(word, word);
      reader.toolbar?.remove(); reader.toolbar = null;
    }, LONG_PRESS_MS);
  });
  body.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.sliding) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancel(); // it's a scroll
      return;
    }
    // Hold-and-slide still works: extend from the pressed word.
    const update = () => {
      const p = wordAtPoint(press.lastX, press.lastY);
      if (p) { state.selection = cmp(p, press.word) < 0 ? { start: p, end: press.word } : { start: press.word, end: p }; paint(); }
    };
    press.lastX = e.clientX; press.lastY = e.clientY;
    update();
    autoScrollFor(e.clientY, () => press && update());
  });
  const end = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    cancel();
    stopAutoScroll();
    if (p.sliding) { showToolbar(); return; }
    if (e.type === 'pointercancel') return;
    // Short tap
    if (state.selection) { clearSelection(); return; }
    const vnum = e.target.closest('.vnum');
    if (vnum) { // tap a verse number to select the whole verse
      const v = +vnum.dataset.v;
      const ws = reader.words.filter((x) => x.v === v);
      if (ws.length) setSelection({ v, w: 0 }, { v, w: ws[ws.length - 1].w });
      return;
    }
    if (p.word) showNotesAt(p.word);
  };
  body.addEventListener('pointerup', end);
  body.addEventListener('pointercancel', end);
  // Stop the page scrolling while sliding a selection with a finger.
  body.addEventListener('touchmove', (e) => { if (press?.sliding) e.preventDefault(); }, { passive: false });
}

function showToolbar() {
  reader.toolbar?.remove();
  if (!state.selection) return;
  const { start, end } = state.selection;
  const draft = (color) => ({
    id: newId(), book: state.pos.book, chapter: state.pos.chapter,
    start: { verse: start.v, word: start.w }, end: { verse: end.v, word: end.w }, color, quote: selectedQuote(), body: '',
  });
  const bar = h('div', { class: 'sel-toolbar', role: 'toolbar', 'aria-label': 'Selection actions' },
    h('div', { class: 'row' }, ...COLORS.map((c) => h('button', { class: 'swatch', dataset: { c }, 'aria-label': `Highlight ${c}`, onclick: () => {
      saveNote(draft(c)); clearSelection(); toast('Highlighted');
    } }))),
    h('div', { class: 'row' },
      h('button', { class: 'text-btn', onclick: () => noteEditor(draft('yellow'), { isNew: true }) }, 'Note'),
      h('button', { class: 'text-btn', onclick: () => openCommentary(start.v) }, 'Commentary'),
      h('button', { class: 'text-btn', onclick: async () => {
        const text = `${selectedQuote()} — ${ref(draft('yellow'))} (WEB)`;
        try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast("Couldn't copy"); }
        clearSelection();
      } }, 'Copy')));
  reader.toolbar = bar;
  document.body.append(bar);
}

function showNotesAt(p) {
  const { mine, friends } = notesAt(p);
  if (!mine.length && !friends.length) return;
  if (mine.length === 1 && !friends.length) return noteEditor(mine[0]);
  openSheet((close) => [
    h('h2', {}, 'Notes here'),
    ...mine.map((n) => noteCard(n, { onClick: () => { close(); noteEditor(n); } })),
    ...friends.map((n) => noteCard(n, { friend: true })),
  ], { label: 'Notes on this passage' });
}

/* ---------------- Commentaries ---------------- */
const commentaryCache = new Map(); // "id/book/chapter" -> response
async function loadCommentaryList() {
  if (state.commentaries) return state.commentaries;
  state.commentaries = store.get('commentaries', null);
  try {
    const { commentaries } = await api('GET', '/api/commentaries');
    state.commentaries = commentaries;
    store.set('commentaries', commentaries);
  } catch (e) { if (!state.commentaries) throw e; }
  return state.commentaries;
}

async function openCommentary(verse) {
  const { book, chapter } = state.pos;
  const verseCount = reader.chapterData?.length || verse;
  let list;
  try { list = await loadCommentaryList(); } catch { toast("Couldn't load commentaries. Check your connection."); return; }
  let current = store.get('commentary', 'matthew-henry');
  if (!list.some((c) => c.id === current)) current = list[0].id;

  openSheet((close) => {
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Commentary' });
    const body = h('div', { class: 'commentary-body', 'aria-live': 'polite' });
    const credit = h('p', { class: 'credit' });

    const drawChips = () => chips.replaceChildren(...list.map((c) => h('button', {
      class: 'chip' + (c.missingBooks.includes(book) ? ' unavailable' : ''), 'aria-pressed': String(c.id === current),
      title: c.missingBooks.includes(book) ? `${c.name} doesn't cover ${bookName(book)}` : c.about,
      onclick: () => { current = c.id; store.set('commentary', current); drawChips(); show(); },
    }, c.name)));

    async function show() {
      const id = current;
      const meta = list.find((c) => c.id === id);
      credit.replaceChildren(meta.licenseUrl
        ? h('a', { href: meta.licenseUrl, target: '_blank', rel: 'noopener' }, meta.license) : meta.license);
      if (meta.missingBooks.includes(book)) {
        body.replaceChildren(h('p', { class: 'empty' }, `${meta.name} doesn't cover ${bookName(book)}. Pick another commentary above.`));
        return;
      }
      const key = `${id}/${book}/${chapter}`;
      let data = commentaryCache.get(key);
      if (!data) {
        body.replaceChildren(h('p', { class: 'empty' }, `Loading ${meta.name}…`));
        try { data = await api('GET', `/api/commentaries/${id}/${book}/${chapter}`); commentaryCache.set(key, data); } catch (e) {
          if (current !== id) return;
          body.replaceChildren(h('p', { class: e.status === 404 ? 'empty' : 'error' },
            e instanceof OfflineError ? "You're offline. Commentary needs a connection the first time you open a chapter." : e.message));
          return;
        }
      }
      if (current !== id) return; // switched while loading
      renderEntries(data);
    }

    function renderEntries(data) {
      const kids = [];
      if (data.introduction) {
        kids.push(h('details', { class: 'intro' }, h('summary', {}, `Introduction to ${bookName(book)} ${chapter}`),
          h('div', { class: 'commentary-text' }, data.introduction)));
      }
      // Each comment starts at a verse and runs until the next one.
      let target = null;
      data.entries.forEach((e, i) => {
        const last = i + 1 < data.entries.length ? data.entries[i + 1].verse - 1 : Math.max(e.verse, verseCount);
        const label = last > e.verse ? `Verses ${e.verse}–${last}` : `Verse ${e.verse}`;
        const covers = verse >= e.verse && verse <= last;
        const section = h('section', { class: 'entry' + (covers ? ' current' : '') },
          h('div', { class: 'entry-label' }, `${bookName(book)} ${chapter} · ${label}`),
          h('div', { class: 'commentary-text' }, e.text));
        if (covers) target = section;
        kids.push(section);
      });
      if (!data.entries.length) kids.push(h('p', { class: 'empty' }, 'No comments on this chapter.'));
      else if (!target) kids.unshift(h('p', { class: 'hint' }, `No comment on verse ${verse} in this commentary. Here's the rest of the chapter.`));
      body.replaceChildren(...kids);
      body.scrollTop = 0;
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    }

    drawChips();
    show();
    return [
      h('div', { class: 'title-row' }, h('h2', {}, `Commentary · ${bookName(book)} ${chapter}:${verse}`),
        h('button', { class: 'text-btn', onclick: close }, 'Close')),
      chips, body, credit,
    ];
  }, { label: 'Commentary' });
}

async function openPicker() {
  const books = await loadBooks();
  openSheet((close) => {
    const wrap = h('div');
    const showBooks = () => {
      wrap.replaceChildren(h('h2', {}, 'Choose a book'),
        h('div', { class: 'section-label' }, 'Old Testament'),
        h('div', { class: 'books' }, books.slice(0, 39).map(btn)),
        h('div', { class: 'section-label' }, 'New Testament'),
        h('div', { class: 'books' }, books.slice(39).map(btn)));
      wrap.querySelector('.current')?.scrollIntoView({ block: 'center' });
    };
    const btn = (b) => h('button', { class: b.id === state.pos.book ? 'current' : '', onclick: () => showChapters(b) }, b.name);
    const showChapters = (b) => {
      wrap.replaceChildren(
        h('div', { class: 'title-row' }, h('h2', {}, b.name), h('button', { class: 'text-btn', onclick: showBooks }, 'Books')),
        h('div', { class: 'chapters' }, Array.from({ length: b.chapters }, (_, i) => h('button', {
          class: b.id === state.pos.book && i + 1 === state.pos.chapter ? 'current' : '',
          onclick: () => { close(); goTo({ book: b.id, chapter: i + 1 }); },
        }, i + 1))));
    };
    showBooks();
    return wrap;
  }, { label: 'Choose book and chapter' });
}

function goTo(pos, verse) {
  if (!pos) return;
  clearSelection();
  state.pos = { book: pos.book, chapter: pos.chapter };
  store.set('pos', state.pos);
  state.tab = 'read';
  render().then(() => {
    if (verse && reader.verseEls[verse]) {
      reader.verseEls[verse].scrollIntoView({ block: 'center' });
      reader.verseEls[verse].classList.add('flash');
    } else window.scrollTo(0, 0);
  });
}

/* ---------------- Notes tab ---------------- */
async function renderNotes() {
  const list = h('div');
  const banner = h('div');
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Whose notes' },
    h('button', { 'aria-pressed': String(state.notesTab === 'mine'), onclick: () => { state.notesTab = 'mine'; renderNotes(); } }, 'Mine'),
    h('button', { 'aria-pressed': String(state.notesTab === 'friends'), onclick: () => { state.notesTab = 'friends'; renderNotes(); } }, "Friends'"));
  mount(h('main', { class: 'screen' }, h('h1', {}, state.notesTab === 'mine' ? 'My notes' : "Friends' notes"), seg, banner, list));
  await loadBooks();

  const draw = (failed) => {
    banner.replaceChildren(failed ? h('p', { class: 'error' }, "Couldn't refresh. Showing saved notes.") : '');
    const open = (n) => () => goTo({ book: n.book, chapter: n.chapter }, n.start.verse);
    if (state.notesTab === 'mine') {
      const notes = Object.values(state.mine.notes).sort((a, b) => b.updatedAt - a.updatedAt);
      list.replaceChildren(...(notes.length ? notes.map((n) => noteCard(n, { onClick: open(n) }))
        : [h('p', { class: 'empty' }, 'No notes yet. In Read, hold a word to start a highlight.')]));
    } else {
      const notes = state.friendsFeed;
      list.replaceChildren(...(notes.length ? notes.map((n) => noteCard(n, { friend: true, onClick: open(n) }))
        : [h('p', { class: 'empty' }, "Nothing here yet. Friends' notes appear once they turn on “Can see my notes” for you.")]));
    }
  };
  const tab = state.notesTab;
  draw(false);
  let failed;
  if (tab === 'mine') { await refreshMine(); failed = state.notesError; } else failed = !(await refreshFeed());
  if (state.tab === 'notes' && state.notesTab === tab) draw(failed);
}

/* ---------------- Friends tab ---------------- */
async function renderFriends() {
  const content = h('div');
  mount(h('main', { class: 'screen' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Friends'),
      h('button', { class: 'text-btn', onclick: openAccount }, 'Account'),
      h('button', { class: 'text-btn', onclick: openAddFriend }, 'Add')),
    content));

  const draw = () => {
    const f = state.friends;
    const kids = [];
    if (state.friendsError) kids.push(h('p', { class: 'error' }, f ? "Couldn't refresh. Showing your saved friends list." : "Couldn't load friends. Check your connection."));
    if (!f) return content.replaceChildren(...kids);
    const act = async (method, path, body, okMsg) => {
      try { state.friends = await api(method, path, body); store.set('friends', state.friends); state.friendsError = false; if (okMsg) toast(okMsg); }
      catch (e) { toast(e instanceof OfflineError ? "You're offline. Try again when connected." : e.message); }
      draw();
      updateBadge();
    };
    if (f.incoming.length) {
      kids.push(h('div', { class: 'section-label' }, 'Friend requests'));
      for (const u of f.incoming) kids.push(h('div', { class: 'card' },
        personName(u),
        h('div', { class: 'hint', style: 'margin:0' }, 'wants to be friends'),
        h('div', { class: 'row-actions' },
          h('button', { class: 'text-btn', onclick: () => act('DELETE', `/api/friends/${u.id}`) }, 'Decline'),
          h('button', { class: 'filled-btn', onclick: () => act('POST', `/api/friends/${u.id}/accept`, null, `You and ${dn(u)} are friends`) }, 'Accept'))));
    }
    kids.push(h('div', { class: 'section-label' }, 'Friends'));
    if (!f.friends.length) kids.push(h('p', { class: 'empty' }, 'No friends yet. Tap Add and enter a username.'));
    for (const u of f.friends) {
      const id = `share-${u.id}`;
      const sw = h('input', { type: 'checkbox', class: 'switch', id, checked: u.sharing, onchange: (e) => {
        sw.disabled = true;
        act('PUT', `/api/friends/${u.id}/sharing`, { enabled: e.target.checked });
      } });
      kids.push(h('div', { class: 'card' },
        personName(u, h('button', { class: 'text-btn danger', style: 'font-size:15px', onclick: () => {
          if (confirm(`Remove ${dn(u)} (@${u.username}) as a friend? You'll stop seeing each other's notes.`)) act('DELETE', `/api/friends/${u.id}`);
        } }, 'Remove')),
        h('div', { class: 'share-row' },
          h('label', { for: id }, h('div', { class: 'label' }, 'Can see my notes'),
            h('div', { class: 'sub' }, u.sharing ? `${dn(u)} can read all your notes` : `Your notes are hidden from ${dn(u)}`)),
          sw),
        h('div', { class: 'status-line' }, u.sharesWithMe ? `You can see ${dn(u)}'s notes` : `${dn(u)} hasn't shared notes with you yet`)));
    }
    if (f.outgoing.length) {
      kids.push(h('div', { class: 'section-label' }, 'Sent requests'));
      for (const u of f.outgoing) kids.push(h('div', { class: 'card' },
        personName(u, h('button', { class: 'text-btn', style: 'font-size:15px', onclick: () => act('DELETE', `/api/friends/${u.id}`) }, 'Cancel'))));
    }
    content.replaceChildren(...kids);
  };
  draw();
  await refreshFriends();
  if (state.tab === 'friends') { draw(); updateBadge(); }

  function openAddFriend() {
    openSheet((close) => {
      const input = h('input', { autofocus: true, autocomplete: 'off', autocapitalize: 'none', spellcheck: false, placeholder: 'username', required: true });
      const err = h('p', { class: 'error' });
      return h('form', { onsubmit: async (e) => {
        e.preventDefault();
        try {
          state.friends = await api('POST', '/api/friends/requests', { username: input.value });
          store.set('friends', state.friends);
          const name = input.value.trim().replace(/^@/, '').toLowerCase();
          close(); draw();
          toast(state.friends.friends.some((u) => u.username.toLowerCase() === name) ? 'You are now friends' : 'Request sent');
        } catch (ex) { err.textContent = ex instanceof OfflineError ? "You're offline." : ex.message; }
      } },
      h('h2', {}, 'Add a friend'),
      h('label', { class: 'field' }, h('span', {}, 'Their username'), input),
      err,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'text-btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'filled-btn', type: 'submit' }, 'Send request')));
    }, { label: 'Add a friend' });
  }
}

function openAccount() {
  openSheet((close) => {
    const size = h('span', {}, `${state.fontSize}px`);
    const setSize = (d) => {
      state.fontSize = Math.max(16, Math.min(32, state.fontSize + d));
      store.set('fontSize', state.fontSize);
      size.textContent = `${state.fontSize}px`;
    };
    const me = state.auth.user;
    const nameInput = h('input', { id: 'display-name', maxlength: 40, value: me.displayName && me.displayName !== me.username ? me.displayName : '', placeholder: me.username });
    const nameErr = h('p', { class: 'error', style: 'margin:6px 0 0' });
    const saveName = h('button', { class: 'tonal-btn', type: 'button', onclick: async () => {
      saveName.disabled = true; nameErr.textContent = '';
      try {
        const { user } = await api('PUT', '/api/me', { displayName: nameInput.value });
        state.auth = { ...state.auth, user: { ...state.auth.user, ...user } };
        store.set('auth', state.auth);
        toast('Display name saved');
      } catch (e) { nameErr.textContent = e instanceof OfflineError ? "You're offline. Try again when connected." : e.message; }
      saveName.disabled = false;
    } }, 'Save');
    return [
      h('h2', {}, 'Account'),
      h('div', { class: 'card' },
        h('label', { class: 'field', style: 'margin:0' }, h('span', {}, 'Display name (any language)'),
          h('div', { class: 'inline-field' }, nameInput, saveName)),
        nameErr,
        h('div', { class: 'hint', style: 'margin:12px 0 0' }, `Your username is @${me.username}. Friends use it to add you; it can't be changed.`)),
      h('div', { class: 'card' }, h('div', { class: 'share-row' }, h('div', { class: 'label' }, 'Reading text size'),
        h('div', { class: 'font-row' },
          h('button', { class: 'tonal-btn', 'aria-label': 'Smaller text', onclick: () => setSize(-2) }, 'A−'), size,
          h('button', { class: 'tonal-btn', 'aria-label': 'Larger text', onclick: () => setSize(2) }, 'A+')))),
      h('p', { class: 'hint' }, 'Scripture: World English Bible (public domain).'),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'text-btn danger', onclick: () => { close(); signOut(); } }, 'Sign out'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'filled-btn', onclick: close }, 'Done')),
    ];
  }, { label: 'Account' });
}

/* ---------------- Auth ---------------- */
function renderAuth(mode = 'login') {
  const user = h('input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true, minlength: 3, maxlength: 20, pattern: '[A-Za-z0-9_]+' });
  const pass = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: mode === 'login' ? 1 : 8 });
  const display = h('input', { autocomplete: 'nickname', maxlength: 40, placeholder: 'e.g. 小明, José, Anna' });
  const err = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'filled-btn', type: 'submit' }, mode === 'login' ? 'Sign in' : 'Create account');
  $app.replaceChildren(h('main', { class: 'auth' },
    h('img', { class: 'logo', src: '/icon.svg', alt: '' }),
    h('h1', {}, 'Bible Study'),
    h('p', { class: 'hint' }, 'Highlight, take notes, and read alongside your friends.'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true; err.textContent = '';
      try {
        state.auth = await api('POST', mode === 'login' ? '/api/login' : '/api/register',
          { username: user.value.trim(), password: pass.value, ...(mode === 'register' ? { displayName: display.value } : {}) });
        store.set('auth', state.auth);
        start();
      } catch (ex) { err.textContent = ex instanceof OfflineError ? "Can't reach the server. Check your connection." : ex.message; submit.disabled = false; }
    } },
    mode === 'register' ? h('label', { class: 'field' }, h('span', {}, 'Display name (any language, optional)'), display) : null,
    h('label', { class: 'field' }, h('span', {}, mode === 'register' ? 'Username (letters, numbers, _ — friends add you with this)' : 'Username'), user),
    h('label', { class: 'field' }, h('span', {}, mode === 'login' ? 'Password' : 'Password (8+ characters)'), pass),
    err, submit,
    h('button', { class: 'text-btn switch-mode', type: 'button', onclick: () => renderAuth(mode === 'login' ? 'register' : 'login') },
      mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'))));
  user.focus();
}

function signOut(expired) {
  if (!expired && state.auth) fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${state.auth.token}` } }).catch(() => {});
  state.auth = null;
  store.del('auth'); store.del('friends'); store.del('friendsFeed');
  state.friends = null; state.friendsFeed = [];
  clearSelection();
  renderAuth();
  if (expired) toast('Please sign in again');
}

/* ---------------- shell ---------------- */
let navEl;
function mount(screen) {
  $app.replaceChildren(screen, navEl);
}
function buildNav() {
  const item = (tab, label) => h('button', { 'aria-current': state.tab === tab ? 'page' : null, dataset: { tab },
    onclick: () => {
      if (state.tab === tab && tab === 'read') return;
      clearSelection(); state.tab = tab; render(); window.scrollTo(0, 0); // re-tapping Notes/Friends refreshes
    } },
  h('span', { class: 'icon badge' }, svg(ICONS[tab])), label);
  navEl = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' }, item('read', 'Read'), item('notes', 'Notes'), item('friends', 'Friends'));
}
function updateBadge() {
  const b = navEl?.querySelector('[data-tab="friends"] .badge');
  const n = state.friends?.incoming.length || 0;
  if (b) { if (n) b.dataset.count = n; else delete b.dataset.count; }
}
function rerender() { if (state.tab === 'read') paint(); else render(); }
async function render() {
  buildNav();
  updateBadge();
  if (state.tab === 'read') return renderReader();
  if (state.tab === 'notes') return renderNotes();
  return renderFriends();
}

function start() {
  loadMine();
  render();
  refreshMine().then(() => { if (state.tab === 'read') paint(); });
  refreshFriends().then(updateBadge);
  // Detects revoked sessions and picks up display-name changes made on another device.
  api('GET', '/api/me').then(({ user }) => {
    if (!state.auth) return;
    state.auth = { ...state.auth, user: { ...state.auth.user, ...user } };
    store.set('auth', state.auth);
  }).catch(() => {});
}

window.addEventListener('online', () => { if (state.auth) flush().catch(() => {}); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.auth) return;
  flush().catch(() => {});
  if (state.tab === 'read' && state.showFriends) { await refreshChapterFriendNotes(); paint(); }
  refreshFriends().then(updateBadge);
});
setInterval(async () => {
  if (document.visibilityState !== 'visible' || !state.auth || state.tab !== 'read' || !state.showFriends || state.selection) return;
  await refreshChapterFriendNotes(); paint();
}, 60000);
window.addEventListener('resize', () => positionHandles());

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (state.auth) start(); else renderAuth();
