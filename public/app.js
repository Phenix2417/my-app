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
  commentary: 'M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  personAdd: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  account: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  textSize: 'M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z',
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  chevronRight: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  chevronLeft: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
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

const openSheets = new Map(); // label -> close(); a sheet is never stacked on a copy of itself
function openSheet(build, { label } = {}) {
  const key = label || 'Dialog';
  openSheets.get(key)?.();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': key });
  const scrim = h('div', { class: 'scrim' }, sheet);
  const close = () => {
    scrim.remove(); document.removeEventListener('keydown', onKey);
    if (openSheets.get(key) === close) openSheets.delete(key);
  };
  openSheets.set(key, close);
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
  const setShowFriends = async (on) => {
    state.showFriends = on; store.set('showFriends', on);
    paint();
    if (on) { await refreshChapterFriendNotes(); paint(); }
  };
  // A quiet one-line header (tap it to choose a book and chapter); the Bible text scrolls on its own.
  // Swipe sideways on the text, or use the side bar, to change chapter.
  const scroller = h('div', { class: 'r-scroll' }, body);
  const goChapter = (dir) => {
    const to = dir > 0 ? next : prev;
    if (!to) { toast(dir > 0 ? 'This is the last chapter of the Bible.' : 'This is the first chapter of the Bible.'); return; }
    reader.slideFrom = dir;
    goTo(to);
  };
  const screen = h('main', { class: 'screen reader-page' },
    h('header', { class: 'r-head' },
      h('h1', {}, h('button', { class: 'r-title', onclick: openPicker, 'aria-label': `${meta.name} ${chapter}. Choose book and chapter` },
        h('span', {}, meta.name), h('span', {}, String(chapter))))),
    scroller,
    sideDock([
      { id: 'show-friends', label: "Friends' notes", icon: ICONS.friends, toggle: { get: () => state.showFriends, set: setShowFriends } },
      { id: 'open-commentary', label: 'Commentary', icon: ICONS.commentary, action: () => openCommentaryPage(topVisibleVerse()) },
      { id: 'text-size', label: 'Text size', icon: ICONS.textSize, popover: textSizeControl },
    ]));
  enableChapterSwipe(scroller, body, goChapter);
  if (!store.get('seenReadTip', false)) { // the instructions used to sit above the text; show them once instead
    store.set('seenReadTip', true);
    setTimeout(() => toast('Tip: hold a word or tap a verse number to select. Swipe sideways to change chapter.'), 600);
  }
  mount(screen);
  reader.body = body;
  reader.scroller = scroller;
  setBars(true);
  // Reading further down slides the bars away; a tap brings them back.
  let lastTop = 0;
  scroller.addEventListener('scroll', () => {
    if (state.selection) { positionHandles(); positionToolbar(); }
    const top = scroller.scrollTop;
    if (top > lastTop + 6 && top > 60 && !state.selection) setBars(false);
    lastTop = top;
  }, { passive: true });

  let data;
  try { data = await loadBook(meta.id); } catch {
    body.append(h('p', { class: 'error' }, "Couldn't load this chapter. Check your connection and try again."));
    return;
  }
  if (state.pos.book !== book || state.pos.chapter !== chapter || state.tab !== 'read') return;
  buildVerses(data[chapter - 1] || []);
  paint();
  if (reader.slideFrom) { body.classList.add(reader.slideFrom > 0 ? 'slide-from-right' : 'slide-from-left'); reader.slideFrom = 0; }
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

// Sideways swipe on the Bible text changes chapter. Ignored while text is selected or being selected.
function enableChapterSwipe(el, content, onSwipe) {
  let g = null;
  el.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || state.selection || e.target.closest('button, .handle')) return;
    g = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horiz: null };
  });
  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (state.selection) { g = null; content.style.transform = ''; return; } // a long-press started a selection
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.horiz === null && Math.hypot(dx, dy) > 10) g.horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
    if (!g.horiz) return;
    g.dx = dx;
    content.style.transition = 'none';
    content.style.transform = `translateX(${dx * 0.5}px)`;
  });
  const end = () => {
    if (!g) return;
    const { dx, horiz } = g;
    g = null;
    content.style.transition = 'transform .18s ease';
    content.style.transform = '';
    if (horiz && Math.abs(dx) > 80) onSwipe(dx < 0 ? 1 : -1);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

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
  // Scroll when the finger nears the top or bottom of the Bible text area.
  const box = visibleTextArea();
  const edge = box ? box.top + 50 : 70, bottomEdge = box ? box.bottom - 60 : window.innerHeight - 170;
  const speed = y < edge ? -(edge - y) / 4 : y > bottomEdge ? (y - bottomEdge) / 4 : 0;
  if (!speed) { autoScroll = null; return; }
  const tick = () => { (reader.scroller || window).scrollBy(0, speed); onTick(); autoScroll = { raf: requestAnimationFrame(tick) }; };
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
  let lastTap = null; // {word, time, timer}: a short tap on a word, waiting to see if a second tap follows
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
    // Short tap. A second tap on the same word soon after is a double tap: straight to the dictionary.
    const now = Date.now();
    if (p.word && lastTap && now - lastTap.time < 320 && !cmp(lastTap.word, p.word)) {
      clearTimeout(lastTap.timer); lastTap = null;
      openDictionaryFor(p.word);
      return;
    }
    const target = e.target;
    const single = () => {
      if (state.selection) { clearSelection(); return; }
      const vnum = target.closest('.vnum');
      if (vnum) { // tap a verse number to select the whole verse
        const v = +vnum.dataset.v;
        const ws = reader.words.filter((x) => x.v === v);
        if (ws.length) setSelection({ v, w: 0 }, { v, w: ws[ws.length - 1].w });
        return;
      }
      // A tap on a word with notes opens them; any other tap shows or hides the top and bottom bars.
      const here = p.word ? notesAt(p.word) : { mine: [], friends: [] };
      if (here.mine.length || here.friends.length) showNotesAt(p.word);
      else setBars(document.body.classList.contains('bars-hidden'));
    };
    if (!p.word) { single(); return; } // taps off words can't be double taps: act at once
    clearTimeout(lastTap?.timer);
    lastTap = { word: p.word, time: now, timer: setTimeout(() => { lastTap = null; single(); }, 280) };
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
      h('button', { class: 'text-btn', onclick: () => { const v = start.v; clearSelection(); openCommentaryPage(v); } }, 'Commentary'),
      // One word: its dictionary entry. Several words: translate the selection, then look up each word.
      h('button', { class: 'text-btn dict-btn', 'aria-expanded': 'false', onclick: (e) => toggleDictionary(bar, e.currentTarget) },
        cmp(start, end) ? 'Translate' : 'Dictionary'),
      h('button', { class: 'text-btn grammar-btn', 'aria-expanded': 'false', onclick: (e) => toggleGrammar(bar, e.currentTarget) }, 'Grammar'),
      h('button', { class: 'text-btn', onclick: async () => {
        const text = `${selectedQuote()} — ${ref(draft('yellow'))} (WEB)`;
        try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast("Couldn't copy"); }
        clearSelection();
      } }, 'Copy')));
  reader.toolbar = bar;
  document.body.append(bar);
  positionToolbar();
}

/* ----- Dictionary inside the selection bubble (ECDICT English–Chinese, words used in the Bible) ----- */
const dictFiles = new Map();
const dictKey = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');
function dictFile(letter) {
  if (!dictFiles.has(letter)) {
    const p = fetch(`/dict/${letter}.json`).then((r) => (r.ok ? r.json() : {}));
    dictFiles.set(letter, p);
    p.catch(() => dictFiles.delete(letter));
  }
  return dictFiles.get(letter);
}
async function lookUp(word) {
  const w = dictKey(word);
  if (!w || !/^[a-z]/.test(w)) return null;
  const e = (await dictFile(w[0]))[w];
  if (!e) return { word: w };
  const base = e.b ? { word: e.b, ...(await dictFile(e.b[0]))[e.b] } : null;
  return { word: w, ...e, base };
}

// Recorded pronunciations (fetched and kept by the server). One plays at a time.
let wordAudio = null;
function playWord(word, accent, btn) {
  wordAudio?.pause();
  document.querySelectorAll('.pron.playing').forEach((b) => b.classList.remove('playing'));
  const a = new Audio(`/api/pronounce/${accent}/${encodeURIComponent(word)}`);
  wordAudio = a;
  btn?.classList.add('playing');
  const done = () => btn?.classList.remove('playing');
  a.addEventListener('ended', done);
  a.addEventListener('error', () => { done(); if (wordAudio === a) toast(navigator.onLine === false ? 'Pronunciation needs a connection.' : `No ${accent === 'uk' ? 'British' : 'American'} recording for “${word}”.`); });
  a.play().catch(() => {}); // errors are reported by the 'error' event above
}
const phoneticsCache = new Map();
function phoneticsFor(word) {
  if (!phoneticsCache.has(word)) {
    const p = api('GET', `/api/phonetics/${encodeURIComponent(word)}`);
    phoneticsCache.set(word, p);
    p.catch(() => phoneticsCache.delete(word));
  }
  return phoneticsCache.get(word);
}
// "UK /ɡreɪs/ 🔊": shows the dictionary's phonetic until the accent-specific one arrives.
function pronButton(word, accent, fallback) {
  const name = accent === 'uk' ? 'British' : 'American';
  const ipa = h('span', { class: 'ipa' + (fallback ? ' pending' : '') }, fallback ? `/${fallback}/` : '…');
  const btn = h('button', { class: 'pron', 'aria-label': `Play ${name} pronunciation of ${word}`, onclick: () => playWord(word, accent, btn) },
    h('span', { class: 'accent' }, accent.toUpperCase()), ipa, svg(ICONS.speaker));
  phoneticsFor(word).then((p) => {
    const v = p?.[accent];
    if (v) ipa.textContent = `/${v}/`; else if (!fallback) ipa.textContent = '';
    ipa.classList.remove('pending');
    btn.setAttribute('aria-label', `Play ${name} pronunciation of ${word}${v ? `, /${v}/` : ''}`);
    positionToolbar();
  }).catch(() => { ipa.classList.remove('pending'); if (!fallback) ipa.textContent = ''; });
  return btn;
}

/* ----- Grammar analysis inside the bubble (compromise, MIT, runs on the phone) ----- */
let nlpReady = null;
function loadNlp() {
  nlpReady ??= new Promise((resolve, reject) => {
    if (window.nlp) return resolve(window.nlp);
    const sc = document.createElement('script');
    sc.src = '/vendor/compromise-14.19.0.js';
    sc.onload = () => (window.nlp ? resolve(window.nlp) : reject(new Error('missing')));
    sc.onerror = () => { nlpReady = null; reject(new Error('load')); };
    document.head.append(sc);
  });
  return nlpReady;
}

// Part of speech in Chinese (and English), most specific tag first.
const POS = [
  ['Copula', '系动词', 'linking verb'], ['Modal', '情态动词', 'modal verb'], ['Auxiliary', '助动词', 'auxiliary'],
  ['Verb', '动词', 'verb'], ['Possessive', '物主代词', 'possessive'], ['Pronoun', '代词', 'pronoun'],
  ['ProperNoun', '专有名词', 'proper noun'], ['Noun', '名词', 'noun'], ['Adjective', '形容词', 'adjective'],
  ['Adverb', '副词', 'adverb'], ['Preposition', '介词', 'preposition'], ['Conjunction', '连词', 'conjunction'],
  ['QuestionWord', '关系词', 'relative/question word'], ['Value', '数词', 'number'], ['Negative', '否定词', 'negative'],
];
const ARTICLES = new Set(['the', 'a', 'an']);
function posOf(term) {
  const tags = new Set(term.tags || []);
  if (tags.has('Determiner')) return ARTICLES.has(term.normal) ? ['冠词', 'article'] : ['限定词', 'determiner'];
  const hit = POS.find(([t]) => tags.has(t));
  return hit ? [hit[1], hit[2]] : ['其他', 'other'];
}
const TENSE = { PastTense: '过去时', PresentTense: '现在时', FutureTense: '将来时' };
function describeVerb(v) {
  const g = v.verb?.grammar || {};
  const form = g.form || '';
  const parts = [];
  // has/have/had + past participle is a perfect tense (the library reports "has been made" as plain present).
  const perfect = /\b(has|have|had)(n[’']t)?\s+\S/i.test(v.text) ? (/\bhad/i.test(v.text) ? '过去完成时' : '现在完成时') : '';
  if (perfect) parts.push(perfect);
  else if (/perfect/.test(form)) parts.push(g.tense === 'PastTense' ? '过去完成时' : g.tense === 'FutureTense' ? '将来完成时' : '现在完成时');
  else if (/progressive|continuous/.test(form)) parts.push(`${TENSE[g.tense] ? TENSE[g.tense].replace('时', '') : ''}进行时`);
  else if (g.tense && TENSE[g.tense]) parts.push(`一般${TENSE[g.tense]}`);
  if (g.passive || /passive/.test(form)) parts.push('被动语态');
  if (v.verb?.negative || /n[’']t\b|\bnot\b/i.test(v.text)) parts.push('否定');
  if (/infinitive/.test(form)) parts.push('不定式');
  return parts.join(' · ') || '动词';
}

function toggleGrammar(bar, btn) {
  const open = bar.querySelector('.grammar');
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); positionToolbar(); return; }
  // One panel at a time: close the translation/dictionary panel if it's open.
  bar.querySelector('.dict')?.remove(); bar.querySelector('.dict-btn')?.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-expanded', 'true');
  const text = reader.words.filter((x) => inRange(x, state.selection.start, state.selection.end)).map((x) => x.el.textContent).join(' ');
  const panel = h('div', { class: 'grammar', 'aria-live': 'polite' }, h('p', { class: 'dict-muted' }, 'Analysing…'));
  bar.append(panel);
  positionToolbar();
  loadNlp().then((nlp) => {
    const sections = nlp(text).sentences().json().map((sj) => {
      const doc = nlp(sj.text);
      const terms = doc.json()[0]?.terms || [];
      const words = h('div', { class: 'g-words' });
      terms.forEach((t, i) => {
        if (!t.text.trim()) return; // the hidden "not" of a contraction
        let [zh, en] = posOf(t);
        // "that/which/who" between a noun and a verb introduces a clause: a relative pronoun.
        const next = terms.slice(i + 1).find((x) => x.text.trim());
        if (i > 0 && ['that', 'which', 'who', 'whom', 'whose'].includes(t.normal) && next && (next.tags || []).some((g) => ['Verb', 'Auxiliary', 'Copula', 'Modal'].includes(g))) {
          [zh, en] = ['关系代词', 'relative pronoun'];
        }
        words.append(h('span', { class: 'g-word', title: en, dataset: { pos: en.split(/[ /]/)[0] } },
          h('span', { class: 'g-text' }, t.text.replace(/[,.;:!?]+$/, '')), h('span', { class: 'g-pos' }, zh)));
      });
      const rows = [];
      // Subject / verb, only when the parser found a believable subject (it can't handle inverted word order).
      const s = sj.sentence || {};
      const firstSubj = terms.find((t) => t.normal === String(s.subject || '').split(' ')[0]);
      if (s.subject && s.verb && firstSubj && !(firstSubj.tags || []).includes('Preposition')) {
        rows.push(h('div', { class: 'g-row' }, h('span', { class: 'g-key' }, '主语 Subject'), h('span', {}, s.subject)));
        rows.push(h('div', { class: 'g-row' }, h('span', { class: 'g-key' }, '谓语 Verb'), h('span', {}, s.verb)));
        if (s.predicate) rows.push(h('div', { class: 'g-row' }, h('span', { class: 'g-key' }, '其余 Rest'), h('span', {}, s.predicate)));
      }
      for (const v of doc.verbs().json()) {
        rows.push(h('div', { class: 'g-row' }, h('span', { class: 'g-key' }, '动词 Verb'), h('span', {}, h('b', {}, v.text.replace(/[,.;:!?]+$/, '')), ` — ${describeVerb(v)}`)));
      }
      const phrases = [
        ...doc.match('#Preposition (#Determiner|#Possessive)? #Adjective? #Noun+').out('array').map((p) => ['介词短语', p]),
        ...doc.nouns().out('array').filter((p) => p.trim().split(/\s+/).length > 1).map((p) => ['名词短语', p.replace(/^(and|or|but)\s+/i, '')]),
      ];
      const seen = new Set();
      for (const [kind, p] of phrases) {
        const clean = p.split(/[,.;:!?]/)[0].trim(); // a phrase ends at punctuation
        if (seen.has(kind + clean)) continue;
        seen.add(kind + clean);
        rows.push(h('div', { class: 'g-row' }, h('span', { class: 'g-key' }, kind), h('span', {}, clean)));
      }
      return h('section', { class: 'g-sentence' }, words, ...rows);
    });
    panel.replaceChildren(...sections,
      h('p', { class: 'dict-credit' }, 'Automatic analysis by compromise · may be wrong for unusual word order'));
    positionToolbar();
  }).catch(() => {
    panel.replaceChildren(h('p', { class: 'dict-muted' }, "Couldn't load the grammar tool. Check your connection and try again."));
    positionToolbar();
  });
}

// Double tap: select the word and open its dictionary entry in the bubble.
function openDictionaryFor(word) {
  navigator.vibrate?.(8);
  setSelection(word, word);
  const btn = reader.toolbar?.querySelector('.dict-btn');
  if (btn) toggleDictionary(reader.toolbar, btn);
}

function toggleDictionary(bar, btn) {
  const open = bar.querySelector('.dict');
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); positionToolbar(); return; }
  btn.setAttribute('aria-expanded', 'true');
  bar.querySelector('.grammar')?.remove(); bar.querySelector('.grammar-btn')?.setAttribute('aria-expanded', 'false');
  const all = reader.words.filter((x) => inRange(x, state.selection.start, state.selection.end)).map((x) => x.el.textContent);
  const multi = all.length > 1;
  const words = [dictKey(all[0] || '')];
  const body = h('div', { class: 'dict-entry', 'aria-live': 'polite' });
  // Several words: translate the whole selection, and make every word of it tappable for its definition.
  let trans = null;
  if (multi) {
    const zh = h('p', { class: 'trans-zh', lang: 'zh-Hans' }, 'Translating…');
    const en = h('p', { class: 'trans-en', role: 'group', 'aria-label': 'Tap a word for its definition' });
    all.forEach((token, i) => {
      const key = dictKey(token);
      if (i) en.append(' ');
      en.append(key ? h('button', { class: 'tw', type: 'button', dataset: { w: key }, 'aria-pressed': 'false', onclick: () => show(key) }, token) : token);
    });
    trans = h('div', { class: 'trans', 'aria-live': 'polite' }, en, zh);
    api('POST', '/api/translate', { text: all.join(' ') }).then((r) => { zh.textContent = r.text; positionToolbar(); }).catch((err) => {
      zh.classList.add('dict-muted');
      zh.textContent = err instanceof OfflineError ? 'Translation needs a connection.' : err.message;
      positionToolbar();
    });
  }
  const show = async (w) => {
    trans?.querySelectorAll('.tw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === w)));
    body.replaceChildren(h('p', { class: 'dict-muted' }, 'Looking up…'));
    let e;
    try { e = await lookUp(w); } catch { body.replaceChildren(h('p', { class: 'dict-muted' }, "Couldn't load the dictionary. Check your connection.")); positionToolbar(); return; }
    const block = (x, main) => [
      h('div', { class: 'dict-head' }, h('span', { class: 'dict-word' }, x.word)),
      // British and American phonetics; tapping either plays that recording.
      h('div', { class: 'dict-prons' }, pronButton(x.word, 'uk', x.p), pronButton(x.word, 'us', x.p)),
      x.t ? h('p', { class: 'dict-zh', lang: 'zh-Hans' }, x.t) : null,
      x.d && main ? h('p', { class: 'dict-en' }, x.d) : null,
    ];
    if (!e || (!e.t && !e.d && !e.base)) body.replaceChildren(h('p', { class: 'dict-muted' }, `“${w}” isn't in the dictionary. Names of people and places usually aren't.`));
    else body.replaceChildren(...[...block(e, !e.base), ...(e.base ? [h('div', { class: 'dict-base' }, `Base form: ${e.base.word}`), ...block(e.base, true)] : [])].filter(Boolean));
    positionToolbar();
  };
  bar.append(h('div', { class: 'dict' }, trans, body,
    h('p', { class: 'dict-credit' }, multi ? 'Translation, phonetics & audio: Youdao · Dictionary: ECDICT' : 'ECDICT English–Chinese dictionary · Phonetics & audio: Youdao')));
  if (multi) body.replaceChildren(h('p', { class: 'dict-muted' }, 'Tap any word in the text above for its definition.'));
  else show(words[0]);
}

// Place the selection bubble just above the selected words (or below them if there's no room),
// centred on the selection and kept on screen. Hidden while the selection is scrolled out of view.
function positionToolbar() {
  const bar = reader.toolbar;
  if (!bar || !state.selection) return;
  const startEl = wordEl(state.selection.start), endEl = wordEl(state.selection.end);
  const area = visibleTextArea();
  if (!startEl || !endEl || !area) return;
  const a = startEl.getClientRects()[0], z = [...endEl.getClientRects()].pop();
  const offscreen = z.bottom < area.top || a.top > area.bottom;
  bar.style.visibility = offscreen ? 'hidden' : '';
  if (offscreen) return;
  const knob = 26, gap = 10, w = bar.offsetWidth, hgt = bar.offsetHeight, vw = document.documentElement.clientWidth;
  let top = a.top - knob - gap - hgt, below = false;
  if (top < area.top + 4) { top = z.bottom + knob + gap; below = true; }
  top = Math.max(area.top + 4, Math.min(top, area.bottom - hgt - 4));
  // Centre on the selection when it's on one line; otherwise on the start of it.
  const anchorX = Math.abs(a.top - z.top) < 4 ? (a.left + z.right) / 2 : a.left + Math.min(60, a.width / 2);
  const left = Math.max(8, Math.min(anchorX - w / 2, vw - w - 8));
  Object.assign(bar.style, { top: `${top}px`, left: `${left}px` });
  bar.classList.toggle('below', below);
  bar.style.setProperty('--arrow-x', `${Math.max(20, Math.min(anchorX - left, w - 20))}px`);
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

// The person's own commentary list, in their order. Until they customise it, Chinese readers get the
// Chinese commentary first; everyone gets every English commentary and the cross references.
function defaultCommentaryIds(list) {
  const lang = (navigator.language || '').toLowerCase();
  const zh = lang.startsWith('zh') ? [/-(tw|hk|mo)|hant/.test(lang) ? 'fhl-zh-hant' : 'fhl-zh-hans'] : [];
  return [...zh, ...list.filter((c) => c.lang === 'en' && c.id !== 'tsk').map((c) => c.id), 'tsk'];
}
function myCommentaryIds(list) {
  const known = new Set(list.map((c) => c.id));
  const saved = state.auth?.user.commentaries;
  return (Array.isArray(saved) ? saved : defaultCommentaryIds(list)).filter((id) => known.has(id));
}
let prefsTimer;
function saveMyCommentaryIds(ids) {
  state.auth = { ...state.auth, user: { ...state.auth.user, commentaries: ids } };
  store.set('auth', state.auth);
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    api('PUT', '/api/me', { commentaries: ids }).catch((e) => {
      toast(e instanceof OfflineError ? "You're offline. Your list is saved on this phone and will sync when you reorder again online." : e.message);
    });
  }, 500);
}
const LANG_LABEL = { en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };

/* Commentary has its own page, opened from the side bar or the selection toolbar. */
const cm = { chips: null, manage: null, status: null, listEl: null, list: null, current: null, manageOpen: false, token: 0,
  focusVerse: null, returnVerse: null };

function topVisibleVerse() {
  for (let v = 1; v < reader.verseEls.length; v++) {
    const el = reader.verseEls[v];
    if (el && el.getBoundingClientRect().bottom > (visibleTextArea()?.top ?? 0) + 8) return v;
  }
  return 1;
}

// A− / size / A+ for the Bible text; changes apply immediately and are remembered.
function textSizeControl() {
  const label = h('span', { class: 'size-value', 'aria-live': 'polite' }, `${state.fontSize}`);
  const change = (d) => {
    state.fontSize = Math.max(16, Math.min(34, state.fontSize + d));
    store.set('fontSize', state.fontSize);
    label.textContent = `${state.fontSize}`;
    reader.body?.style.setProperty('--verse-size', `${state.fontSize}px`);
    positionHandles(); positionToolbar();
  };
  return [
    h('button', { class: 'size-btn', 'aria-label': 'Smaller text', onclick: () => change(-2) }, h('span', { class: 'size-a small' }, 'A'), '−'),
    label,
    h('button', { class: 'size-btn', 'aria-label': 'Larger text', onclick: () => change(2) }, h('span', { class: 'size-a big' }, 'A'), '+'),
  ];
}

/* Side bar: a tab fixed to the middle of the right edge; tapping it slides out a vertical bar of switches. */
let closeSideDock = () => {};
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.side-dock')) closeSideDock(); }, true);
function sideDock(items) {
  const panel = h('div', { class: 'side-panel', id: 'side-panel', role: 'group', 'aria-label': 'Reading options' },
    // Icon-only buttons: a toggle shows its state by being filled; an action opens something.
    ...items.map(({ id, label, icon, toggle, action, popover }) => {
      const btn = h('button', { id, class: 'side-btn', title: label, 'aria-label': label }, svg(icon));
      if (toggle) {
        const show = () => btn.setAttribute('aria-pressed', String(!!toggle.get()));
        btn.addEventListener('click', () => {
          const on = !toggle.get(); toggle.set(on); show();
          if (toggle.announce !== false) toast(`${label} ${on ? 'on' : 'off'}`);
        });
        show();
      } else if (popover) {
        // Opens a small control beside the bar; the bar stays open while it's used.
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', () => {
          const existing = dock.querySelector('.side-popover');
          existing?.remove();
          const opening = !existing;
          btn.setAttribute('aria-expanded', String(opening));
          if (!opening) return;
          const pop = h('div', { class: 'side-popover', role: 'group', 'aria-label': label }, popover());
          dock.append(pop);
          pop.style.top = `${btn.offsetTop + panel.offsetTop + btn.offsetHeight / 2}px`;
          pop.querySelector('button')?.focus();
        });
      } else btn.addEventListener('click', () => { closeSideDock(); action(); });
      return btn;
    }));
  const tab = h('button', { class: 'side-tab', 'aria-controls': 'side-panel', 'aria-expanded': 'false', 'aria-label': 'Show reading options' },
    svg(ICONS.chevronLeft));
  const dock = h('div', { class: 'side-dock' }, tab, panel);
  const setOpen = (open) => {
    dock.classList.toggle('open', open);
    tab.setAttribute('aria-expanded', String(open));
    tab.setAttribute('aria-label', open ? 'Hide reading options' : 'Show reading options');
    panel.inert = !open;
    if (!open) { dock.querySelector('.side-popover')?.remove(); dock.querySelector('[aria-expanded="true"].side-btn')?.setAttribute('aria-expanded', 'false'); }
  };
  setOpen(false);
  closeSideDock = () => setOpen(false); // tapping anywhere else slides it back
  tab.addEventListener('click', () => setOpen(!dock.classList.contains('open')));
  dock.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); tab.focus(); } });
  return dock;
}

function setStatus(...kids) { cm.status?.replaceChildren(...kids.filter(Boolean)); }

function drawCommentaryChips() {
  if (!cm.chips || !cm.list) return;
  const { book } = state.pos;
  const ids = myCommentaryIds(cm.list);
  cm.chips.replaceChildren(...ids.map((id) => cm.list.find((c) => c.id === id)).map((c) => h('button', {
    class: 'chip' + (c.missingBooks.includes(book) ? ' unavailable' : ''), 'aria-pressed': String(c.id === cm.current), lang: c.lang,
    title: c.missingBooks.includes(book) ? `${c.name} doesn't cover ${bookName(book)}` : c.about,
    onclick: () => { cm.current = c.id; store.set('commentary', c.id); loadCommentaryPage(); },
  }, c.name)));
  requestAnimationFrame(revealActiveChip);
}

function revealActiveChip() {
  const chip = cm.chips?.querySelector('.chip[aria-pressed="true"]');
  if (chip) cm.chips.scrollTo({ left: chip.offsetLeft - (cm.chips.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
}

// While editing, the page shows only the editor: the commentary buttons and text are hidden until Done.
function setManageOpen(open) {
  cm.manageOpen = open;
  if (cm.manage) cm.manage.hidden = !open;
  for (const el of [cm.chips, cm.status, cm.listEl]) if (el) el.hidden = open;
  drawManage(); drawCommentaryChips();
  if (cm.scroller) cm.scroller.scrollTop = 0;
  document.getElementById('side-edit-list')?.setAttribute('aria-pressed', String(open));
  closeSideDock(); // don't cover the list's remove buttons
}

function drawManage() {
  if (!cm.manage || !cm.manageOpen || !cm.list) return;
  const list = cm.list;
  const ids = myCommentaryIds(list);
  const meta = (id) => list.find((c) => c.id === id);
  const info = (c) => h('div', { class: 'manage-info', lang: c.lang }, h('div', { class: 'manage-name' }, c.name),
    h('div', { class: 'manage-about' }, `${LANG_LABEL[c.lang] || c.lang} · ${c.about}`));
  const set = (next) => {
    saveMyCommentaryIds(next);
    drawManage(); drawCommentaryChips();
    if (!next.includes(cm.current)) loadCommentaryPage(); // the open one was removed
  };
  const mine = h('div', { class: 'mine-list', role: 'list', 'aria-label': 'Your commentaries, in order' },
    ...ids.map((id, i) => {
      const c = meta(id);
      const row = h('div', { class: 'manage-row draggable', role: 'listitem', tabindex: 0, dataset: { id },
        'aria-label': `${c.name}, position ${i + 1} of ${ids.length}. Press and hold to drag, or use the arrow keys.`,
        onkeydown: (e) => {
          const d = { ArrowUp: -1, ArrowDown: 1 }[e.key];
          if (!d || !ids[i + d]) return;
          e.preventDefault();
          const next = [...ids]; [next[i], next[i + d]] = [next[i + d], next[i]];
          set(next);
          cm.manage.querySelector(`.manage-row[data-id="${id}"]`)?.focus();
        } },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), info(c),
      h('div', { class: 'manage-actions' }, h('button', { class: 'icon-btn', 'aria-label': `Remove ${c.name}`, title: `Remove ${c.name}`,
        onclick: () => set(ids.filter((x) => x !== id)) }, '✕')));
      enableHoldToDrag(row, () => set([...mine.querySelectorAll('.manage-row')].map((r) => r.dataset.id)));
      return row;
    }));
  const others = list.filter((c) => !ids.includes(c.id));
  const groups = ['zh-Hans', 'zh-Hant', 'en'].map((lang) => others.filter((c) => c.lang === lang)).filter((g) => g.length);
  cm.manage.replaceChildren(...[
    h('div', { class: 'manage-head' }, h('h2', {}, 'Edit your list'), h('button', { class: 'filled-btn', onclick: () => setManageOpen(false) }, 'Done')),
    h('p', { class: 'hint' }, 'The first one opens by default. Press and hold a commentary, then drag it to change the order.'),
    ids.length ? mine : h('p', { class: 'empty' }, 'Your list is empty. Add commentaries below.'),
    others.length ? h('div', { class: 'section-label' }, 'Add more') : null,
    ...groups.flatMap((g) => g.map((c) => h('div', { class: 'manage-row' }, info(c),
      h('div', { class: 'manage-actions' }, h('button', { class: 'tonal-btn small-btn', onclick: () => set([...ids, c.id]) }, 'Add'))))),
  ].filter(Boolean));
}

// Press and hold a row, then drag it up or down among its siblings. A quick swipe still scrolls the page.
function enableHoldToDrag(row, onDrop) {
  let timer = null, drag = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  row.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    cancel();
    timer = setTimeout(() => {
      timer = null;
      drag = { grabY: start.y, id: start.id, moved: false };
      try { row.setPointerCapture(start.id); } catch { /* pointer already gone */ }
      row.classList.add('dragging');
      navigator.vibrate?.(12);
    }, 300);
    row.addEventListener('pointermove', function early(ev) {
      if (timer && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) cancel(); // it's a scroll
      if (!timer) row.removeEventListener('pointermove', early);
    });
  });
  row.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const y = e.clientY;
    // Swap with a neighbour once the finger passes its middle.
    const prev = row.previousElementSibling, next = row.nextElementSibling;
    if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) {
      row.parentNode.insertBefore(next, row); drag.grabY += next.offsetHeight; drag.moved = true;
    } else if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
      row.parentNode.insertBefore(row, prev); drag.grabY -= prev.offsetHeight; drag.moved = true;
    }
    row.style.transform = `translateY(${y - drag.grabY}px)`;
  });
  const end = () => {
    cancel();
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    row.classList.remove('dragging');
    row.style.transform = '';
    if (moved) onDrop();
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('contextmenu', (e) => e.preventDefault());
  row.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
}

function openCommentaryPage(verse) {
  cm.focusVerse = verse || null;
  cm.returnVerse = verse || null;
  clearSelection();
  state.tab = 'commentary';
  render();
}

function renderCommentaryPage() {
  const { book, chapter } = state.pos;
  const books = state.books || BOOKS_FALLBACK();
  const meta = books.find((b) => b.id === book) || books[0];
  cm.manageOpen = false; // the page always opens showing commentary, not the editor
  cm.chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Commentary' });
  cm.manage = h('div', { class: 'manage-panel', hidden: true });
  cm.status = h('div', { class: 'commentary-status', 'aria-live': 'polite' });
  cm.listEl = h('div', { class: 'c-list' });
  // The header stays put; only this area scrolls. Swiping sideways in it changes commentary.
  cm.scroller = h('div', { class: 'c-scroll', tabindex: 0, 'aria-label': 'Commentary text' }, cm.manage, cm.status, cm.listEl);
  enableCommentarySwipe(cm.scroller);
  mount(h('main', { class: 'screen commentary-page' },
    h('div', { class: 'c-head' },
      h('div', { class: 'c-titlebar' },
        h('button', { class: 'text-btn back-btn', onclick: () => goTo(state.pos, cm.returnVerse) }, `‹ Back to ${meta.name} ${chapter}`),
        h('h1', {}, 'Commentary')),
      cm.chips),
    cm.scroller,
    sideDock([
      { id: 'side-edit-list', label: 'Edit list', icon: ICONS.edit, toggle: { get: () => cm.manageOpen, set: setManageOpen, announce: false } },
      { id: 'side-back', label: `Back to ${meta.name} ${chapter}`, icon: ICONS.back, action: () => goTo(state.pos, cm.returnVerse) },
    ])));
  loadCommentaryPage();
}
const BOOKS_FALLBACK = () => [{ id: state.pos.book, name: bookName(state.pos.book), chapters: 999 }];

async function loadCommentaryPage() {
  const token = ++cm.token;
  const { book, chapter } = state.pos;
  const stale = () => token !== cm.token || state.tab !== 'commentary' || state.pos.book !== book || state.pos.chapter !== chapter;
  try { cm.list = await loadCommentaryList(); } catch {
    if (!stale()) setStatus(h('p', { class: 'error' }, "Couldn't load commentaries. Check your connection."));
    return;
  }
  if (stale()) return;
  const ids = myCommentaryIds(cm.list);
  cm.current = ids.includes(cm.current) ? cm.current : ids.includes(store.get('commentary', null)) ? store.get('commentary', null) : ids[0] || null;
  drawCommentaryChips(); drawManage();
  cm.listEl.replaceChildren();
  if (!cm.current) return setStatus(h('p', { class: 'empty-inline' }, 'Your commentary list is empty. Open the side bar and tap the pencil to add some.'));
  const meta = cm.list.find((c) => c.id === cm.current);
  const credit = h('p', { class: 'credit' }, meta.licenseUrl ? h('a', { href: meta.licenseUrl, target: '_blank', rel: 'noopener' }, meta.license) : meta.license);
  if (meta.missingBooks.includes(book)) return setStatus(h('p', { class: 'empty-inline' }, `${meta.name} doesn't cover ${bookName(book)}. Pick another commentary above.`));

  const key = `${meta.id}/${book}/${chapter}`;
  let data = commentaryCache.get(key);
  if (!data) {
    setStatus(h('p', { class: 'empty-inline' }, `Loading ${meta.name}…`));
    try { data = await api('GET', `/api/commentaries/${meta.id}/${book}/${chapter}`); commentaryCache.set(key, data); } catch (e) {
      if (!stale()) setStatus(h('p', { class: e.status === 404 ? 'empty-inline' : 'error' },
        e instanceof OfflineError ? "You're offline. Commentary needs a connection the first time you open a chapter." : e.message));
      return;
    }
    if (stale()) return;
  }
  let verses = [];
  try { verses = (await loadBook(book))[chapter - 1] || []; } catch { /* show commentary without the verse text */ }
  if (stale()) return;
  const verseCount = verses.length || Math.max(0, ...data.entries.map((e) => e.verse));
  setStatus(data.entries.length ? null : h('p', { class: 'empty-inline' }, `${meta.name} has no comments on this chapter.`),
    h('div', { class: 'c-meta' }, credit, swipeHint()));

  const sections = [];
  if (data.introduction) sections.push(commentarySection(meta, `Introduction to ${bookName(book)} ${chapter}`, data.introduction, null, 0, 0));
  data.entries.forEach((e, i) => {
    const last = Math.min(i + 1 < data.entries.length ? data.entries[i + 1].verse - 1 : verseCount, verseCount || e.verse);
    const to = Math.max(last, e.verse);
    const label = to > e.verse ? `Verses ${e.verse}–${to}` : `Verse ${e.verse}`;
    const text = verses.slice(e.verse - 1, to).map(([t], k) => `${e.verse + k} ${t}`).join(' ');
    sections.push(commentarySection(meta, label, e.text, text, e.verse, to));
  });
  cm.listEl.replaceChildren(...sections);
  if (cm.slideFrom) {
    cm.listEl.classList.remove('slide-from-right', 'slide-from-left'); void cm.listEl.offsetWidth;
    cm.listEl.classList.add(cm.slideFrom > 0 ? 'slide-from-right' : 'slide-from-left');
    cm.slideFrom = 0;
  }

  if (cm.focusVerse) {
    const v = cm.focusVerse;
    const target = sections.find((el) => +el.dataset.from <= v && v <= +el.dataset.to);
    if (target) {
      requestAnimationFrame(() => { cm.scroller.scrollTop = target.offsetTop - cm.scroller.offsetTop - 8; target.classList.add('flash'); });
    } else toast(`No comment on verse ${v} in ${meta.name}. Showing the whole chapter.`);
  } else cm.scroller.scrollTop = 0;
}

function swipeHint() {
  const ids = myCommentaryIds(cm.list || []);
  if (ids.length < 2) return null;
  return h('span', { class: 'swipe-hint' }, `‹ swipe › · ${ids.indexOf(cm.current) + 1} of ${ids.length}`);
}

// Move to the next (dir 1) or previous (dir -1) commentary in the person's list.
function switchCommentary(dir) {
  const ids = myCommentaryIds(cm.list || []);
  const i = ids.indexOf(cm.current);
  const next = ids[i + dir];
  if (!next) return false;
  cm.current = next;
  store.set('commentary', next);
  cm.slideFrom = dir; // new content slides in from that side
  loadCommentaryPage();
  return true;
}

// Horizontal swipe on the commentary area. Vertical movement is left to normal scrolling.
function enableCommentarySwipe(el) {
  let g = null;
  const list = () => cm.listEl;
  el.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || cm.manageOpen || e.target.closest('button, a, input')) return;
    g = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horiz: null };
  });
  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.horiz === null && Math.hypot(dx, dy) > 10) g.horiz = Math.abs(dx) > Math.abs(dy) * 1.3;
    if (!g.horiz) return;
    g.dx = dx;
    list().style.transition = 'none';
    list().style.transform = `translateX(${dx * 0.6}px)`;
    list().style.opacity = String(1 - Math.min(Math.abs(dx) / 500, 0.4));
  });
  const end = () => {
    if (!g) return;
    const { dx, horiz } = g;
    g = null;
    list().style.transition = 'transform .18s ease, opacity .18s ease';
    list().style.transform = '';
    list().style.opacity = '';
    if (horiz && Math.abs(dx) > 70 && !switchCommentary(dx < 0 ? 1 : -1)) {
      toast(dx < 0 ? 'That was the last commentary in your list.' : 'That was the first commentary in your list.');
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => { // keyboard: arrow keys while the commentary area has focus
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); switchCommentary(e.key === 'ArrowRight' ? 1 : -1); }
  });
}

function commentarySection(meta, label, text, verseText, from, to) {
  const { book, chapter } = state.pos;
  return h('section', { class: 'c-entry', lang: meta.lang, dataset: { from, to } },
    from
      ? h('button', { class: 'c-label', title: 'Read these verses', onclick: () => goTo({ book, chapter }, from) }, `${bookName(book)} ${chapter} · ${label} ›`)
      : h('div', { class: 'c-label' }, label),
    verseText ? h('p', { class: 'c-verses', lang: 'en' }, verseText) : null,
    h('div', { class: 'commentary-text' }, text));
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
    } else if (reader.scroller) reader.scroller.scrollTop = 0;
  });
}

/* ---------------- Notes tab ---------------- */
async function renderNotes() {
  const list = h('div');
  const banner = h('div');
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Whose notes' },
    h('button', { 'aria-pressed': String(state.notesTab === 'mine'), onclick: () => { state.notesTab = 'mine'; renderNotes(); } }, 'Mine'),
    h('button', { 'aria-pressed': String(state.notesTab === 'friends'), onclick: () => { state.notesTab = 'friends'; renderNotes(); } }, "Friends'"));
  mount(h('main', { class: 'screen' }, h('h1', {}, state.notesTab === 'mine' ? 'My notes' : "Friends' notes"), seg, banner, list,
    sideDock([
      { id: 'side-notes-friends', label: "Friends' notes", icon: ICONS.friends,
        toggle: { get: () => state.notesTab === 'friends', set: (on) => { state.notesTab = on ? 'friends' : 'mine'; renderNotes(); }, announce: false } },
      { id: 'side-refresh', label: 'Refresh', icon: ICONS.refresh, action: () => renderNotes() },
    ])));
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
    content,
    sideDock([
      { id: 'side-add-friend', label: 'Add a friend', icon: ICONS.personAdd, action: () => openAddFriend() },
      { id: 'side-account', label: 'Account', icon: ICONS.account, action: () => openAccount() },
    ])));

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
  const item = (tab, label) => h('button', { 'aria-current': state.tab === tab || (tab === 'read' && state.tab === 'commentary') ? 'page' : null, dataset: { tab },
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
function rerender() { if (state.tab === 'read') paint(); else if (state.tab !== 'commentary') render(); }
// The part of the Bible text not covered by the top and bottom bars.
function visibleTextArea() {
  const box = reader.scroller?.getBoundingClientRect();
  if (!box) return null;
  if (document.body.classList.contains('bars-hidden')) return { top: box.top, bottom: box.bottom };
  const head = document.querySelector('.r-head')?.getBoundingClientRect(), nav = navEl?.getBoundingClientRect();
  return { top: head ? head.bottom : box.top, bottom: nav ? Math.min(box.bottom, nav.top) : box.bottom };
}

// Top and bottom bars on the Read page slide away while reading (body.bars-hidden).
function setBars(visible) { document.body.classList.toggle('bars-hidden', !visible); }

async function render() {
  if (state.tab !== 'read') setBars(true);
  buildNav();
  updateBadge();
  if (state.tab === 'read') return renderReader();
  if (state.tab === 'commentary') return renderCommentaryPage();
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
window.addEventListener('resize', () => { positionHandles(); positionToolbar(); });

if ('serviceWorker' in navigator && window.isSecureContext) {
  // When a new version of the app is deployed, its service worker takes over; reload to show it,
  // but never while a sheet (like an unsaved note) is open.
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;
  const reloadIfIdle = () => { if (pendingReload && !document.querySelector('.scrim') && !state.selection) location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { pendingReload = true; reloadIfIdle(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reloadIfIdle(); });
  document.addEventListener('click', () => setTimeout(reloadIfIdle, 0));
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
if (state.auth) start(); else renderAuth();
