// Bible Study — single-page app. No build step, no dependencies.
import { openEpub, openText, ANCHOR_PREFIX } from './epub.js';

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
  // Line icons are written as SVG markup (constants in this file, never user data).
  if (d.startsWith('<')) { s.classList.add('line-icon'); s.innerHTML = d; return s; }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
};
const ICONS = {
  // Reading-page side bar: notes from people, commentary books standing on a shelf, and a serif "Aa".
  friendsNotes: '<path d="M14.5 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5"/><path d="M8 8.5h6M8 12h3.5"/><circle cx="17" cy="13" r="2.6"/><path d="M12.6 21c.5-2.5 2.3-3.9 4.4-3.9s3.9 1.4 4.4 3.9"/>',
  commentaryBooks: '<rect x="3" y="5" width="5" height="15.5" rx="1"/><path d="M3 8h5M3 17.5h5"/><rect x="8" y="3" width="5.5" height="17.5" rx="1"/><path d="M10.75 6v3.6M9.5 7.3h2.5"/><path d="M8 17.5h5.5"/><rect x="14.3" y="5.5" width="5" height="15" rx="1" transform="rotate(14 14.3 20.5)"/>',
  // Commentary side bar: the commentary books with a pencil (edit your list of commentaries).
  editShelf: '<rect x="3" y="5" width="5" height="15.5" rx="1"/><path d="M3 8h5M3 17.5h5"/><rect x="8" y="3" width="5.5" height="17.5" rx="1"/><path d="M10.75 6v3.6M9.5 7.3h2.5"/><path d="M8 17.5h5.5"/><path d="M14.6 21l.7-2.9 5-5a1.3 1.3 0 0 1 1.9 1.9l-5 5z"/>',
  // Selection bubble: copy, and dictionary (an open book with a magnifier) for one word or several.
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  dictionary: '<path d="M12 7C10 5.4 6.8 5 2.8 5.8v12.6c4-.8 7.2-.4 9.2 1.2 2-1.6 5.2-2 9.2-1.2V5.8C17.2 5 14 5.4 12 7z"/><path d="M12 7v12.6"/><circle cx="16.5" cy="12.5" r="3.2"/><path d="M18.8 14.8l2.1 2.1"/>',
  pencil: '<path d="M4.5 19.5l.9-4 10.8-10.8a1.9 1.9 0 0 1 2.7 0l.4.4a1.9 1.9 0 0 1 0 2.7L8.5 18.6z"/><path d="M14.6 6.3l3.1 3.1"/>',
  // Books: tab (filled, like the other tabs), add a book, and a book's contents.
  books: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 9h8v2h-8zm0 3h4v2h-4zm0-6h8v2h-8z',
  addBook: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H17v12H6.5A1.5 1.5 0 0 0 5 16.5z"/><path d="M5 16.5A1.5 1.5 0 0 0 6.5 18H11"/><path d="M18 15v6M15 18h6"/>',
  contents: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".9" fill="currentColor"/><circle cx="4" cy="12" r=".9" fill="currentColor"/><circle cx="4" cy="18" r=".9" fill="currentColor"/>',
  back: '<path d="M20 12H5M11 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  sliders: '<path d="M4 7.5h7M17 7.5h3M4 16.5h3M13 16.5h7"/><circle cx="14" cy="7.5" r="2.5"/><circle cx="10" cy="16.5" r="2.5"/>',
  serifAa: '<text x="1.5" y="19.5" font-family="Georgia,\'Noto Serif\',serif" font-size="17" font-weight="700" fill="currentColor" stroke="none">A</text><text x="13.5" y="19.5" font-family="Georgia,\'Noto Serif\',serif" font-size="12" font-weight="700" fill="currentColor" stroke="none">a</text>',
  read: 'M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5zM17.5 10.5c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zM17.5 14.33c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z',
  notes: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10l6-6V5c0-1.1-.9-2-2-2zM5 19V5h14v9h-5v5H5zm2-12h10v2H7zm0 4h10v2H7zm0 4h5v2H7z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  personAdd: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  account: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
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
  if (n.lib) { // a note in one of the person's own books
    const t = lib.books?.find((x) => x.id === n.lib)?.title || lib.current?.title || 'Book';
    const ch = lib.opened.get(n.lib)?.chapterTitle(n.chapter);
    return ch && ch !== t ? `${t} · ${ch}` : t;
  }
  const b = bookName(n.book);
  if (n.start.verse === n.end.verse) return `${b} ${n.chapter}:${n.start.verse}`;
  return `${b} ${n.chapter}:${n.start.verse}–${n.end.verse}`;
}

/* ---------------- shared UI ---------------- */
// A small info bubble attached to an element (for long presses). Returns { set(text) } to update it.
let tipEl = null, tipTimer = null;
function hideTip() { clearTimeout(tipTimer); tipEl?.remove(); tipEl = null; }
document.addEventListener('pointerdown', (e) => { if (tipEl && !tipEl.contains(e.target)) hideTip(); }, true);
function tipAt(anchor, text) {
  hideTip();
  const tip = h('div', { class: 'tip', role: 'status' }, text);
  document.body.append(tip);
  tipEl = tip;
  const place = () => {
    const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight, gap = 8;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let left, top, side;
    if (anchor.closest('.side-dock')) { left = r.left - w - gap; top = r.top + r.height / 2 - hgt / 2; side = 'left'; } // side bar: to its left
    else {
      left = r.left + r.width / 2 - w / 2; top = r.top - hgt - gap; side = 'above';
      if (top < 8) { top = r.bottom + gap; side = 'below'; }
    }
    left = Math.max(8, Math.min(left, vw - w - 8)); top = Math.max(8, Math.min(top, vh - hgt - 8));
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
    tip.dataset.side = side;
    // Point the little arrow at the element.
    if (side === 'left') tip.style.setProperty('--arrow-y', `${Math.max(10, Math.min(r.top + r.height / 2 - top, hgt - 10))}px`);
    else tip.style.setProperty('--arrow-x', `${Math.max(12, Math.min(r.left + r.width / 2 - left, w - 12))}px`);
  };
  place();
  const restart = () => { clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 3000); };
  restart();
  return { set(t) { if (tipEl !== tip) return; tip.textContent = t; place(); restart(); } };
}

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
  sheet.append(...[build(close)].flat().filter((x) => x != null && x !== false));
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

// "Today, 2:41 PM", "Nov 6, 2:41 PM" this year, "Nov 6, 2025" before; "Edited …" once changed after it was made.
function noteTime(n) {
  const edited = n.updatedAt && n.createdAt && n.updatedAt - n.createdAt > 60000;
  const t = new Date((edited ? n.updatedAt : n.createdAt) || n.updatedAt || Date.now()), now = new Date();
  const today = t.toDateString() === now.toDateString();
  const opts = today ? { hour: 'numeric', minute: '2-digit' }
    : t.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  return h('span', { class: 'note-time', title: t.toLocaleString() }, `${edited ? 'Edited ' : ''}${today ? (edited ? 'today, ' : 'Today, ') : ''}${t.toLocaleString(undefined, opts)}`);
}
// Delete a note (Bible or book) after asking; then refresh what's on screen.
function confirmDeleteNote(n, after) {
  if (!confirm(n.body ? 'Delete this note?' : 'Delete this highlight?')) return false;
  (n.lib ? deleteBookNote : deleteNote)(n.id);
  rerender(); toast(n.body ? 'Note deleted' : 'Highlight deleted');
  after?.();
  return true;
}
const deleteNoteBtn = (onclick) => h('button', { class: 'icon-btn edit-note delete-note', type: 'button', 'aria-label': 'Delete', title: 'Delete',
  onclick: (e) => { e.stopPropagation(); onclick(); } }, svg(ICONS.close));
const editNoteBtn = (onclick) => h('button', { class: 'icon-btn edit-note', type: 'button', 'aria-label': 'Edit note', title: 'Edit note',
  onclick: (e) => { e.stopPropagation(); onclick(); } }, svg(ICONS.pencil));
function noteCard(n, { onClick, friend, onEdit, onDelete, title } = {}) {
  return h('div', { class: 'card' + (onClick ? ' clickable' : ''), onclick: onClick, tabindex: onClick ? 0 : null,
    onkeydown: onClick ? (e) => { if (e.key === 'Enter') onClick(); } : null },
  h('div', { class: 'card-head' }, h('span', { class: 'note-title' }, title || ref(n), noteTime(n)), friend ? h('span', { class: 'who', title: '@' + n.author.username }, dn(n.author)) : null,
    onEdit || onDelete ? h('span', { class: 'note-actions' }, onEdit ? editNoteBtn(onEdit) : null, onDelete ? deleteNoteBtn(onDelete) : null) : null),
  h('div', { class: 'quote', dataset: { c: n.color } }, n.quote),
  n.body ? h('p', { class: 'note-body' }, noteBodyNodes(n.body)) : null);
}

/* ----- Commentary quotes in notes: “quote” — Matthew Henry on John 1:1–5 ----- */
const QUOTE_REF = /“([^”]+)” — (.+?)(?: on (.+?) (\d+):(\d+)(?:–\d+)?|, introduction to (.+?) (\d+))(?![\d–:])/g;
function quoteRefs(body) {
  return [...String(body).matchAll(QUOTE_REF)].map((m) => ({ index: m.index, length: m[0].length, quoteLength: m[1].length + 2, text: m[1], name: m[2],
    bookName: m[3] || m[6], chapter: +(m[4] || m[7]), from: m[5] ? +m[5] : 0 }));
}
// A note's text, with each commentary quote as a link to where it was quoted.
function noteBodyNodes(body) {
  const out = [];
  let last = 0;
  for (const q of quoteRefs(body)) {
    out.push(body.slice(last, q.index), quoteLink(q), body.slice(q.index + q.quoteLength, q.index + q.length));
    last = q.index + q.length;
  }
  out.push(body.slice(last));
  return out.filter((x) => x !== '');
}
const quoteLink = (q) => h('button', { class: 'vref qref', type: 'button', title: `Open in ${q.name}`,
  onclick: (e) => { e.stopPropagation(); openQuotedCommentary(q); } }, `“${q.text}”`);
// In the note editor (a plain text box), the quotes are listed as links below it.
function quoteLinks(ta) {
  const box = h('div', { class: 'quote-links' });
  const draw = () => {
    const qs = quoteRefs(ta.value);
    box.hidden = !qs.length;
    box.replaceChildren(h('div', { class: 'section-label' }, 'Quoted from commentary'),
      ...qs.map((q) => h('p', {}, quoteLink(q), ` — ${q.name}`)));
  };
  ta.addEventListener('input', draw);
  draw();
  return box;
}
async function openQuotedCommentary(q) {
  let list;
  try { list = await loadCommentaryList(); await loadBooks(); } catch { toast("Couldn't load commentaries. Check your connection."); return; }
  const c = list.find((x) => x.name === q.name), book = state.books?.find((b) => b.name === q.bookName);
  if (!c || !book) { toast("Couldn't find where this was quoted."); return; }
  for (const close of [...openSheets.values()]) close();
  clearSelection();
  state.pos = { book: book.id, chapter: q.chapter }; store.set('pos', state.pos);
  cm.quote = { id: c.id, from: q.from, text: q.text };
  cm.current = c.id;
  openCommentaryPage(q.from || null);
}

// An existing note opens to read (quotes are links); the pencil switches to the editor.
function noteViewer(note) {
  openSheet((close) => [
    h('div', { class: 'title-row note-view-head' }, h('h2', {}, ref(note), noteTime(note)),
      h('span', { class: 'note-actions' }, editNoteBtn(() => { close(); noteEditor(note); }), deleteNoteBtn(() => confirmDeleteNote(note, close)))),
    h('div', { class: 'quote', dataset: { c: note.color } }, note.quote),
    note.body ? h('p', { class: 'note-body' }, noteBodyNodes(note.body)) : null,
  ], { label: 'Note' });
}

function noteEditor(note, { isNew } = {}) {
  let color = note.color;
  openSheet((close) => {
    const ta = h('textarea', { placeholder: 'Write a note (optional)', autofocus: true, maxlength: 10000 });
    ta.value = note.body || '';
    requestAnimationFrame(() => { ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight; });
    return [
      h('h2', {}, ref(note)),
      h('div', { class: 'quote', dataset: { c: color } }, note.quote),
      h('div', { style: 'height:14px' }),
      swatchRow(color, (c) => { color = c; ta.closest('.sheet').querySelector('.quote').dataset.c = c; }),
      h('label', { class: 'field' }, h('span', {}, 'Note'), ta),
      quoteLinks(ta),
      h('div', { class: 'sheet-actions' },
        !isNew ? h('button', { class: 'text-btn danger', type: 'button', onclick: () => {
          if (!confirm('Delete this note?')) return;
          (note.lib ? deleteBookNote : deleteNote)(note.id); close(); rerender(); toast('Note deleted');
        } }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'text-btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'filled-btn', type: 'button', onclick: () => {
          (note.lib ? saveBookNote : saveNote)({ ...note, color, body: ta.value.trim() });
          clearSelection(); close(); rerender();
        } }, 'Save')),
    ];
  }, { label: 'Edit note' });
}

/* ---------------- Reader ---------------- */
// mode: 'bible' on the Read page, 'commentary' when the same word selection runs on commentary text.
const reader = { mode: 'bible', words: [], gaps: [], verseEls: [], body: null, handles: null, toolbar: null, chapterData: null };
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
      // The book name opens the list of books; the chapter number opens this book's chapters.
      h('h1', { class: 'r-title' },
        h('button', { type: 'button', onclick: () => openPicker(), 'aria-label': `${meta.name}. Choose a book` }, meta.name),
        h('button', { type: 'button', onclick: () => openPicker({ chapters: true }), 'aria-label': `Chapter ${chapter}. Choose a chapter` }, String(chapter)))),
    scroller,
    sideDock([
      { id: 'show-friends', label: "Friends' notes", icon: ICONS.friendsNotes, toggle: { get: () => state.showFriends, set: setShowFriends } },
      { id: 'open-commentary', label: 'Commentary', icon: ICONS.commentaryBooks, action: () => openCommentaryPage(topVisibleVerse()) },
      { id: 'text-size', label: 'Text size', icon: ICONS.serifAa, popover: textSizeControl },
    ]));
  enableChapterSwipe(scroller, body, goChapter);
  if (!store.get('seenReadTip', false)) { // the instructions used to sit above the text; show them once instead
    store.set('seenReadTip', true);
    setTimeout(() => toast('Tip: hold a word or tap a verse number to select. Swipe sideways to change chapter.'), 600);
  }
  mount(screen);
  reader.mode = 'bible';
  reader.body = body;
  reader.scroller = scroller;
  const back = backButton();
  if (back) screen.append(back);
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

// Notes shown on the text being read: the Bible chapter, or the open chapter of one of the person's books.
function pageNotes() {
  if (reader.mode === 'bible') return chapterNotes();
  if (reader.mode === 'book') return { mine: bookChapterNotes(), friends: [] };
  return { mine: [], friends: [] };
}
function notesAt(p) {
  const { mine, friends } = pageNotes();
  const at = (n) => { const [s, e] = noteRange(n); return inRange(p, s, e); };
  return { mine: mine.filter(at), friends: friends.filter(at) };
}

// Apply highlight colors, friend underlines, note markers and the selection to the rendered words.
function paint() {
  if (!reader.body) return;
  const { mine, friends } = pageNotes(); // commentary: selection only
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
  for (const n of mine) if (n.body) addMark(n, 'mine', 'Your note', svg(ICONS.pencil)); // same pencil as Edit note
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

// Does the selection contain at least one whole sentence (from its first word to its . ? or !)?
function selectionHasFullSentence() {
  const { start, end } = state.selection;
  const ends = (i) => /[.!?。！？]['"’”)\]）」』]*$/.test(reader.words[i].el.textContent);
  const first = reader.words.findIndex((x) => !cmp(x, start)), last = reader.words.findIndex((x) => !cmp(x, end));
  if (first < 0 || last < 0) return false;
  for (let i = first; i <= last; i++) {
    const startsSentence = i === 0 || ends(i - 1);
    if (!startsSentence) continue;
    for (let j = i; j <= last; j++) if (ends(j)) return true;
    return false; // the sentence starting here runs past the selection, and so would any later one
  }
  return false;
}

function selectedQuote() {
  const { start, end } = state.selection;
  const ws = reader.words.filter((x) => inRange(x, start, end));
  if (reader.mode !== 'bible') return ws.map((x, i) => (i && x.el.previousSibling?.classList?.contains('g') ? ' ' : '') + x.el.textContent).join('');
  return ws.map((x) => x.el.textContent).join(' ');
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
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const gap = body.contains(under) ? under.closest?.('.g') : null; // a press on a space counts as the word before it
    const wEl = e.target.closest('.w') || (body.contains(under) ? under.closest?.('.w') : null)
      || (gap?.previousElementSibling?.classList.contains('w') ? gap.previousElementSibling : null);
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
      if (target.closest('a, .bk-link')) return; // a link in a book: it does its own thing
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

// Icon-only bubble button; its name shows on long press.
const bubbleBtn = (label, icon, onclick, extra = '') => h('button', {
  class: `bubble-btn ${extra}`.trim(), type: 'button', 'aria-label': label, title: label,
  ...(extra.includes('dict-btn') ? { 'aria-expanded': 'false' } : {}), onclick }, svg(icon));

function showToolbar() {
  reader.toolbar?.remove();
  if (!state.selection) return;
  const { start, end } = state.selection;
  const draft = (color) => ({
    id: newId(), book: state.pos.book, chapter: state.pos.chapter,
    start: { verse: start.v, word: start.w }, end: { verse: end.v, word: end.w }, color, quote: selectedQuote(), body: '',
  });
  if (reader.mode === 'commentary') return showCommentaryToolbar();
  if (reader.mode === 'book') return showBookToolbar();
  const bar = h('div', { class: 'sel-toolbar', role: 'toolbar', 'aria-label': 'Selection actions' },
    h('div', { class: 'row' }, ...COLORS.map((c) => h('button', { class: 'swatch', dataset: { c }, 'aria-label': `Highlight ${c}`, onclick: () => {
      saveNote(draft(c)); clearSelection(); toast('Highlighted');
    } })),
    h('span', { class: 'sel-divider', 'aria-hidden': 'true' }),
    bubbleBtn('Note', ICONS.notes, () => noteEditor(draft('yellow'), { isNew: true })),
    bubbleBtn('Copy', ICONS.copy, async () => {
      // A complete sentence gets its reference; a word or phrase is copied as is.
      const text = selectionHasFullSentence() ? `${selectedQuote()} — ${ref(draft('yellow'))}` : selectedQuote();
      try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast("Couldn't copy"); }
      clearSelection();
    }),
    bubbleBtn('Commentary', ICONS.commentaryBooks, () => { const sel = { start, end }; clearSelection(); openCommentaryPage(start.v, sel); }),
    // One word: its dictionary entry. Several words: the selection translated, then each word to look up.
    bubbleBtn('Dictionary', ICONS.dictionary, (e) => toggleDictionary(bar, e.currentTarget), 'dict-btn')));
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
// Fetch the recording (the reply says which source it came from), then play it from memory; nothing is stored.
async function playWord(word, accent, btn) {
  wordAudio?.pause();
  document.querySelectorAll('.pron.playing').forEach((b) => b.classList.remove('playing'));
  btn?.classList.add('playing');
  const fail = () => { btn?.classList.remove('playing'); toast(navigator.onLine === false ? 'Pronunciation needs a connection.' : `No ${accent === 'uk' ? 'British' : 'American'} recording for “${word}”.`); };
  let blob, src;
  try {
    const res = await fetch(`/api/pronounce/${accent}/${encodeURIComponent(word)}`, { cache: 'no-store' });
    if (!res.ok) return fail();
    src = res.headers.get('X-Audio-Source') || '';
    blob = await res.blob();
  } catch { return fail(); }
  if (btn) setAudioSource(btn.querySelector('.au-src'), src);
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  wordAudio = a;
  const done = () => { btn?.classList.remove('playing'); URL.revokeObjectURL(url); };
  a.addEventListener('ended', done);
  a.addEventListener('error', () => { done(); if (wordAudio === a) fail(); });
  a.play().catch(() => done());
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
// UK/US row for a word missing from the English dictionary (a name or place): shown only when phonetics exist.
function namePronRow(word) {
  const row = h('div', { class: 'dict-prons', hidden: true }, pronButton(word, 'uk'), pronButton(word, 'us'));
  phoneticsFor(word).then((p) => { if (p?.uk || p?.us) { row.hidden = false; positionToolbar(); } }).catch(() => {});
  return row;
}
// Where a phonetic came from: a small badge before it.
const PH_SOURCES = {
  freedict: ['F', 'Free Dictionary API (Wiktionary)'], mw: ['M', 'Merriam-Webster'], youdao: ['Y', 'Youdao'], wiktionary: ['W', 'Wiktionary'], 'ipa-dict': ['i', 'ipa-dict'], ecdict: ['E', 'ECDICT (offline dictionary)'],
};
// Long-press a pronunciation button: show where its phonetic and recording come from (instead of playing it).
function enableSourceLongPress(btn, accentName) {
  let timer = null, fired = false;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      navigator.vibrate?.(8);
      const ph = btn.querySelector('.ph-src:not(.au-src)'), au = btn.querySelector('.au-src');
      const phName = PH_SOURCES[ph?.dataset.src]?.[1];
      let tip = null;
      const say = (rec) => { const t = `${accentName} phonetic: ${phName || 'none found'} · Recording: ${rec}`; if (tip) tip.set(t); else tip = tipAt(btn, t); };
      const auName = AU_SOURCES[au?.dataset.src]?.[1];
      if (auName) { say(auName); return; }
      // Not known yet: ask the server (it finds and keeps the recording; nothing is played or stored here).
      say('checking…');
      api('GET', `/api/pronounce-source/${btn.dataset.accent}/${encodeURIComponent(btn.dataset.word)}`).then(({ src }) => {
        if (src) setAudioSource(au, src);
        say(AU_SOURCES[src]?.[1] || 'none found');
      }).catch(() => say("couldn't check right now"));
    }, 450);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => clearTimeout(timer));
  btn.addEventListener('pointermove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(timer); });
  // A long press shouldn't also play the sound or open the phone's own menu.
  btn.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Where a recording came from: a badge after the speaker (shown once known).
const AU_SOURCES = { youdao: ['Y', 'Youdao'], freedict: ['F', 'Free Dictionary API'] };
function setAudioSource(badge, src) {
  const s = AU_SOURCES[src];
  if (!badge || !s) return;
  badge.textContent = s[0];
  badge.dataset.src = src;
  badge.title = `Recording from ${s[1]}`;
  refreshAudioBadge(badge);
}
// The recording badge only shows when the recording came from a different source than the phonetic.
function refreshAudioBadge(badge) {
  if (!badge?.dataset.src) return;
  const ph = badge.parentElement?.querySelector('.ph-src:not(.au-src)');
  // Hidden for Youdao recordings (the default), and when it matches the phonetic's source.
  badge.hidden = badge.dataset.src === 'youdao' || !!(ph && ph.dataset.src === badge.dataset.src);
}
function setPhSource(badge, src) {
  const s = PH_SOURCES[src];
  badge.hidden = !s;
  if (!s) { delete badge.dataset.src; refreshAudioBadge(badge.parentElement?.querySelector('.au-src')); return; }
  badge.textContent = s[0];
  badge.dataset.src = src;
  badge.title = `Phonetic from ${s[1]}`;
  badge.hidden = src === 'youdao'; // Youdao is the default source for phonetics: no badge
  refreshAudioBadge(badge.parentElement?.querySelector('.au-src'));
}
function pronButton(word, accent, fallback) {
  const name = accent === 'uk' ? 'British' : 'American';
  const ipa = h('span', { class: 'ipa' + (fallback ? ' pending' : '') }, fallback ? `/${fallback}/` : '…');
  const badge = h('span', { class: 'ph-src', 'aria-hidden': 'true', hidden: true });
  if (fallback) setPhSource(badge, 'ecdict');
  const auBadge = h('span', { class: 'ph-src au-src', 'aria-hidden': 'true', hidden: true });
  const btn = h('button', { class: 'pron', dataset: { word, accent }, 'aria-label': `Play ${name} pronunciation of ${word}`, onclick: () => playWord(word, accent, btn) },
    h('span', { class: 'accent' }, accent.toUpperCase()), badge, ipa, svg(ICONS.speaker), auBadge);
  enableSourceLongPress(btn, name);
  phoneticsFor(word).then((p) => {
    const v = p?.[accent];
    setAudioSource(auBadge, p?.audio?.[accent]);
    if (v) { ipa.textContent = `/${v}/`; setPhSource(badge, p.src?.[accent] || 'youdao'); } else if (!fallback) { ipa.textContent = ''; setPhSource(badge, null); }
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

// Show one explanation at a time in the grammar panel: open this one (or close it if it's already open).
function toggleExplain(btn, exp, text) {
  const wasOpen = btn.getAttribute('aria-expanded') === 'true';
  const scope = btn.closest('.dict') || btn.parentElement;
  scope.querySelectorAll('.g-explain').forEach((e) => { e.hidden = true; });
  scope.querySelectorAll('.g-row, .g-word').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (!wasOpen) { exp.textContent = text(); exp.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  positionToolbar();
}

// What each preposition usually tells you, for explaining prepositional phrases.
const PREP_ROLE = {
  in: '时间或地点（在…里/在…时候）', at: '时间或地点（在…）', on: '时间或地点（在…上）', into: '方向（进入…）',
  to: '方向或对象（到…/向…）', unto: '方向或对象（到…/向…）', toward: '方向（朝着…）', towards: '方向（朝着…）',
  from: '来源或起点（从…）', through: '途径或手段（借着/通过…）', by: '方式或动作的执行者（靠…/被…）',
  with: '伴随或方式（与…一起/用…）', without: '条件或方式（没有…）', for: '目的或对象（为了…/给…）',
  about: '涉及的内容（关于…）', after: '时间（在…之后）', before: '时间或位置（在…之前）', among: '范围（在…中间）',
  upon: '位置或对象（在…上/临到…）', under: '位置（在…下面）', over: '位置或范围（在…之上/遍及…）', of: '所属或性质（…的）',
  as: '身份或方式（作为…/像…）', like: '比较（像…）', against: '对立（反对…/对着…）', within: '范围（在…之内）', out: '方向（向外）',
};
const VERB_MEANING = {
  一般过去时: '一般过去时表示过去发生的动作或过去存在的状态。',
  一般现在时: '一般现在时表示现在的状态、经常发生的动作或普遍的真理。',
  一般将来时: '一般将来时（will/shall + 动词原形）表示将来要发生的动作。',
  现在完成时: '现在完成时（have/has + 过去分词）表示过去发生的动作对现在仍有影响，或一直持续到现在。',
  过去完成时: '过去完成时（had + 过去分词）表示在过去某个时间之前已经完成的动作。',
  将来完成时: '将来完成时（will have + 过去分词）表示到将来某时会已经完成的动作。',
  被动语态: '被动语态（be + 过去分词）：主语是动作的承受者，强调“被怎样”，不强调是谁做的。',
  否定: '句中有 not（或 n’t），表示否定。',
  不定式: '不定式（to + 动词原形）常表示目的或将要做的事。',
};
const q = (x) => `“${x}”`;

// Grammar of a passage, as elements to show in the Translate panel. Every part can be tapped for an
// explanation of what it does in this sentence.
async function analyzeGrammar(text) {
  let nlp;
  try { nlp = await loadNlp(); } catch { return [h('p', { class: 'dict-muted' }, "Couldn't load the grammar tool. Check your connection and try again.")]; }
  const sections = nlp(text).sentences().json().map((sj) => {
    const doc = nlp(sj.text);
    const terms = (doc.json()[0]?.terms || []).filter((t) => t.text.trim()); // drop the hidden "not" of contractions
    const tagsOf = (t) => new Set(t?.tags || []);
    const strip = (x) => String(x || '').split(/[,.;:!?]/)[0].trim();
    const verbs = doc.verbs().json();
    const mainVerb = verbs[0];
    const isPassive = !!(mainVerb && (mainVerb.verb?.grammar?.passive || /passive/.test(mainVerb.verb?.grammar?.form || '')));
    const isCopula = !!(mainVerb && mainVerb.terms?.some((t) => (t.tags || []).includes('Copula')) && !isPassive);
    // "There came a man": there only introduces the sentence; the real subject comes after the verb.
    const isThere = terms[0]?.normal === 'there' && tagsOf(terms[1]).has('Verb');

    const words = h('div', { class: 'g-words' });
    const wordExp = h('p', { class: 'g-explain', hidden: true });
    const labels = terms.map((t, i) => {
      let [zh, en] = posOf(t);
      const next = terms[i + 1];
      if (i > 0 && ['that', 'which', 'who', 'whom', 'whose'].includes(t.normal) && next && ['Verb', 'Auxiliary', 'Copula', 'Modal'].some((g) => tagsOf(next).has(g))) [zh, en] = ['关系代词', 'relative pronoun'];
      if (i === 0 && isThere) [zh, en] = ['引导词', 'introductory there'];
      return [zh, en];
    });

    const rows = [];
    const row = (key, value, explain) => rows.push({ key, value, explain });
    const s = sj.sentence || {};
    const firstSubj = terms.find((t) => t.normal === String(s.subject || '').split(' ')[0]);
    const verbText = strip(s.verb);
    const verbDesc = mainVerb ? describeVerb(mainVerb) : '';
    if (isThere && s.verb) {
      const subj = strip(s.predicate);
      row('主语 Subject', subj, `${q(subj)}是真正的主语。句子以 There 开头，There 只是引导词，本身没有意思；它让主语放到动词${q(verbText)}后面，用来引出一个新出现的人或事物（“有…来了/有…”）。`);
      row('谓语 Verb', verbText, `${q(verbText)}是谓语，说明主语${q(subj)}做了什么或怎样存在。这里是${verbDesc}。`);
    } else if (s.subject && s.verb && firstSubj && !tagsOf(firstSubj).has('Preposition')) {
      const subj = strip(s.subject);
      row('主语 Subject', subj, `${q(subj)}是主语，这句话讲的就是它。` + (isPassive
        ? `本句是被动语态，${q(subj)}是动作${q(verbText)}的承受者（“被…”），而不是发出者。`
        : isCopula ? `谓语是系动词${q(verbText)}，后面的部分用来说明${q(subj)}是什么或怎么样。` : `它是动作${q(verbText)}的发出者。`));
      row('谓语 Verb', verbText, `${q(verbText)}是谓语，说明主语${q(subj)}` + (isPassive ? '遭受了什么动作' : isCopula ? '是什么、在哪里或处于什么状态' : '做了什么') + `。这里是${verbDesc}。`);
      const rest = strip(s.predicate);
      if (rest) {
        const restFirst = terms.find((t) => t.normal === rest.split(' ')[0].toLowerCase());
        const prep = restFirst && tagsOf(restFirst).has('Preposition') ? restFirst.normal : null;
        row('其余 Rest', rest, prep
          ? `${q(rest)}以介词${q(prep)}开头，是介词短语作状语，表示${PREP_ROLE[prep] || '动作的相关情况'}，补充说明谓语${q(verbText)}。`
          : ['that', 'which', 'who', 'whom'].includes(rest.split(' ')[0].toLowerCase())
            ? `${q(rest)}是一个从句，修饰前面的名词，说明它是怎样的。`
            : isCopula ? `${q(rest)}是表语，跟在系动词${q(verbText)}后面，说明主语${q(subj)}是什么或怎么样。`
              : `${q(rest)}是宾语，是动作${q(verbText)}的对象（承受这个动作的人或事物）。`);
      }
    }
    for (const v of verbs) {
      const desc = describeVerb(v);
      const copula = v.terms?.some((t) => (t.tags || []).includes('Copula')) && !/被动语态/.test(desc);
      const meaning = desc.split(' · ').map((p) => VERB_MEANING[p] || '').join('');
      row('动词 Verb', `${strip(v.text)} — ${desc}`, `${q(strip(v.text))}：${meaning}` + (copula ? '它是系动词（be 的一种形式），本身意思很弱，作用是把主语和后面的说明部分连接起来。' : ''));
    }
    const prepPhrases = doc.match('#Preposition (#Determiner|#Possessive)? #Adjective? #Noun+').out('array').map(strip).filter(Boolean);
    const seen = new Set();
    for (const p of prepPhrases) {
      if (seen.has('p' + p)) continue;
      seen.add('p' + p);
      const [prep, ...objWords] = p.split(/\s+/);
      const at = terms.findIndex((t) => t.text.replace(/[,.;:!?]+$/, '') === prep);
      const before = at > 0 ? terms[at - 1] : null;
      // "of" after a noun describes that noun (定语); other prepositions here describe the action (状语).
      const modifiesNoun = prep.toLowerCase() === 'of' && before && tagsOf(before).has('Noun');
      row('介词短语', p, `${q(p)}是介词短语：介词${q(prep)} + ${q(objWords.join(' '))}。它表示${PREP_ROLE[prep.toLowerCase()] || '相关的情况'}，` +
        (modifiesNoun ? `用来修饰前面的名词（作定语）。` : `用来说明动作或状态发生的情况（作状语）。`));
    }
    const subjText = isThere ? strip(s.predicate) : strip(s.subject);
    for (const raw of doc.nouns().out('array')) {
      const np = strip(raw.replace(/^(and|or|but)\s+/i, ''));
      if (np.split(/\s+/).length < 2 || seen.has('n' + np)) continue;
      seen.add('n' + np);
      const head = np.split(/\s+/).pop();
      const inPrep = prepPhrases.find((p) => p.toLowerCase().endsWith(np.toLowerCase()));
      const role = np.toLowerCase() === subjText.toLowerCase() ? '作主语'
        : inPrep ? `作介词${q(inPrep.split(' ')[0])}的宾语，和介词一起组成介词短语${q(inPrep)}`
          : isCopula ? '作表语，说明主语是什么' : '作宾语，是动作的对象';
      row('名词短语', np, `${q(np)}是名词短语，中心词是${q(head)}，前面的词（冠词、形容词或物主代词）修饰它。在这句话里它${role}。`);
    }

    // Each coloured word is a button too: what that word does in this sentence.
    const clean = (t) => t.text.replace(/[,.;:!?]+$/, '');
    const nextContent = (i) => terms.slice(i + 1).find((x) => !tagsOf(x).has('Determiner') && !tagsOf(x).has('Adjective') && !tagsOf(x).has('Possessive')) || terms[i + 1];
    const subjWords = new Set(subjText.toLowerCase().split(/\s+/));
    const explainWord = (t, i) => {
      const [zh] = labels[i];
      const w = clean(t), lw = w.toLowerCase(), nx = nextContent(i), next = nx ? clean(nx) : '';
      const prev = terms.slice(0, i).reverse().find((x) => !tagsOf(x).has('Determiner') && !tagsOf(x).has('Adjective'));
      const phrase = prepPhrases.find((p) => p.split(/\s+/).map((x) => x.toLowerCase()).includes(lw));
      const verbOf = verbs.find((v) => v.terms?.some((x) => x.text.replace(/[,.;:!?]+$/, '').toLowerCase() === lw));
      const nounRole = () => {
        if (prev && tagsOf(prev).has('Preposition') && phrase) return `是介词${q(clean(prev))}的宾语，和它组成介词短语${q(phrase)}。`;
        if (subjWords.has(lw)) return isPassive ? '在这句话里属于主语部分，是动作的承受者。' : '在这句话里属于主语部分，是句子讲述的对象。';
        if (prev && tagsOf(prev).has('Copula')) return `跟在系动词${q(clean(prev))}后面作表语，说明主语是什么。`;
        if (prev && tagsOf(prev).has('Verb')) return `跟在动词${q(clean(prev))}后面作宾语，是这个动作的对象。`;
        return '';
      };
      switch (zh) {
        case '冠词': return lw === 'the'
          ? `${q(w)}是定冠词，表示特指——说的是特定的、双方都知道的那个${next ? q(next) : ''}。`
          : `${q(w)}是不定冠词，表示“一个”，泛指，常用来引出第一次提到的${next ? q(next) : ''}。`;
        case '限定词': return `${q(w)}是限定词，放在名词前面，限定${next ? q(next) : '后面名词'}的范围或数量。`;
        case '引导词': return `${q(w)}在这里是引导词，本身没有“那里”的意思，只是把真正的主语放到动词后面，引出新出现的人或事物。`;
        case '专有名词': return `${q(w)}是专有名词（首字母大写），表示特定的人、事物或称呼。` + nounRole();
        case '名词': return `${q(w)}是名词，表示人、事物或概念。` + nounRole();
        case '代词': return `${q(w)}是代词，代替前面提到过或彼此知道的人或事物，避免重复。` + nounRole();
        case '物主代词': return `${q(w)}是物主代词，表示“…的”，说明后面的${next ? q(next) : '事物'}属于谁。`;
        case '系动词': return `${q(w)}是系动词（be 的${t.tags?.includes('PastTense') ? '过去式' : '一种形式'}），意思是“是/在/存在”，作用是把主语和后面说明主语的部分连接起来。`;
        case '助动词': return `${q(w)}是助动词，本身没有完整意思，帮助${verbOf ? q(strip(verbOf.text)) : '主要动词'}构成时态、语态或否定（${verbOf ? describeVerb(verbOf) : ''}）。`;
        case '情态动词': return `${q(w)}是情态动词，表示能力、可能、允许或必须等语气，后面跟动词原形。`;
        case '动词': {
          const desc = verbOf ? describeVerb(verbOf) : '';
          if (/被动语态/.test(desc) && t.tags?.includes('PastTense')) return `${q(w)}是过去分词，和前面的 be 动词一起构成被动语态${q(strip(verbOf.text))}，表示主语“被${w}”。`;
          return `${q(w)}是动词，表示动作或状态。` + (desc ? `这里是${desc}。` : '');
        }
        case '介词': return `${q(w)}是介词，` + (phrase ? `引出介词短语${q(phrase)}，` : '') + `表示${PREP_ROLE[lw] || '相关的关系'}。`;
        case '连词': {
          const left = terms.slice(0, i).map(clean).join(' ').split(/\band\b|\bbut\b|\bor\b/i).pop().trim();
          const right = terms.slice(i + 1).map(clean).join(' ').split(/\band\b|\bbut\b|\bor\b/i)[0].trim();
          const kind = { and: '并列连词，表示“和/并且”，前后两部分地位相同', but: '转折连词，表示“但是”，后面的意思与前面相对', or: '选择连词，表示“或者”', for: '连词，表示原因“因为”', so: '连词，表示结果“所以”', nor: '连词，表示“也不”' }[lw] || '连词，连接前后两部分';
          return `${q(w)}是${kind}。它连接${left ? q(left) : '前面的部分'}和${right ? q(right) : '后面的部分'}。`;
        }
        case '形容词': return prev && tagsOf(prev).has('Copula')
          ? `${q(w)}是形容词，跟在系动词后面作表语，描述主语的性质或状态。`
          : `${q(w)}是形容词，修饰后面的${next ? q(next) : '名词'}，说明它是什么样的。`;
        case '副词': return `${q(w)}是副词，修饰动词、形容词或整个句子，说明方式、程度、时间或地点。`;
        case '关系代词': return `${q(w)}是关系代词，引导一个从句来修饰前面的${prev ? q(clean(prev)) : '名词'}，说明它是怎样的。`;
        case '关系词': return `${q(w)}是关系词，引导从句，修饰或说明前面的${prev ? q(clean(prev)) : '名词'}。`;
        case '否定词': return `${q(w)}表示否定。`;
        case '数词': return `${q(w)}是数词，表示数量或顺序。`;
        default: return `${q(w)}：${zh}。`;
      }
    };
    terms.forEach((t, i) => {
      const [zh, en] = labels[i];
      const chip = h('button', { class: 'g-word', type: 'button', title: en, 'aria-expanded': 'false', dataset: { pos: en.split(/[ /]/)[0] },
        onclick: () => toggleExplain(chip, wordExp, () => explainWord(t, i)) },
      h('span', { class: 'g-text' }, clean(t)), h('span', { class: 'g-pos' }, zh));
      words.append(chip);
    });

    // Each part is a button; tapping it shows (or hides) what that part does in this sentence.
    const list = h('div', { class: 'g-rows' });
    // Identical parts (e.g. "was — 一般过去时" three times) are listed once, with a count.
    const merged = [];
    for (const r of rows) {
      const same = merged.find((m) => m.key === r.key && m.value === r.value);
      if (same) same.count++; else merged.push({ ...r, count: 1 });
    }
    for (const r of merged) {
      const exp = h('p', { class: 'g-explain', hidden: true });
      const btn = h('button', { class: 'g-row', type: 'button', 'aria-expanded': 'false', onclick: () => toggleExplain(btn, exp, () => r.explain + (r.count > 1 ? `（这句话里出现了 ${r.count} 次。）` : '')) },
        h('span', { class: 'g-key' }, r.key), h('span', { class: 'g-val' }, r.value, r.count > 1 ? h('span', { class: 'g-count' }, ` ×${r.count}`) : null));
      list.append(btn, exp);
    }
    return h('section', { class: 'g-sentence' }, words, wordExp, list);
  });
  return [...sections, h('p', { class: 'g-note' }, 'Tap a part to see what it does. Automatic analysis (compromise) · may be wrong for unusual word order')];
}

// Bible dictionary (Nave's/Torrey's, Chinese and English, via the server).
// Whether a word has topics is a cheap check against the server's built-in index; the text is fetched on tap.
const bibleTopicsCache = new Map();
function bibleTopicsFor(word) {
  const w = String(word || '').toLowerCase();
  if (!w) return Promise.resolve([]);
  if (!bibleTopicsCache.has(w)) {
    bibleTopicsCache.set(w, api('GET', `/api/bible-dictionary/${encodeURIComponent(w)}`).then((r) => r.topics || []).catch(() => { bibleTopicsCache.delete(w); return []; }));
  }
  return bibleTopicsCache.get(w);
}
const bibleTextCache = new Map();
function bibleTextFor(word, lang) {
  const key = `${lang}/${word}`;
  if (!bibleTextCache.has(key)) {
    const p = api('GET', `/api/bible-dictionary/${encodeURIComponent(word)}/${lang}`);
    bibleTextCache.set(key, p);
    p.catch(() => bibleTextCache.delete(key));
  }
  return bibleTextCache.get(key);
}
// Cut a long entry at a word boundary, without leaving an empty bullet line at the end.
const shorten = (full, limit) => `${full.slice(0, limit).replace(/\s+\S*$/, '').replace(/\n[•·\s]*$/, '')}…`;
function bibleSection(found, { english = false } = {}) {
  const LIMIT = english ? 360 : 260;
  return h('section', { class: 'bd' + (english ? ' bd-english' : ''), lang: english ? 'en' : 'zh-Hans' },
    h('div', { class: 'bd-head' }, english ? 'Bible Dictionary' : '圣经辞典', h('span', { class: 'bd-src' }, ` · ${found.source}`)),
    ...found.entries.map((entry) => {
      const full = entry.text;
      const long = full.length > LIMIT;
      const text = h('p', { class: 'bd-text' }, ...withVerseLinks(long ? shorten(full, LIMIT) : full));
      const more = long ? h('button', { class: 'text-btn bd-more', type: 'button', onclick: () => {
        const open = more.textContent === 'More';
        text.replaceChildren(...withVerseLinks(open ? full : shorten(full, LIMIT)));
        more.textContent = open ? 'Less' : 'More';
        positionToolbar();
      } }, 'More') : null;
      return h('div', { class: 'bd-entry' }, english
        ? h('div', { class: 'bd-term bd-term-en' }, String(entry.english).toLowerCase())
        : h('div', { class: 'bd-term' }, entry.term, h('span', { class: 'bd-en', lang: 'en' }, ` ${String(entry.english).toLowerCase()}`)), text, more);
    }));
}

/* ----- Tappable verse references in Bible dictionary text: （约 4:24; 林后 3:17） / (Joh 4:24; 2Co 3:17) ----- */
const REF_ZH = '创 出 利 民 申 书 士 得 撒上 撒下 王上 王下 代上 代下 拉 尼 斯 伯 诗 箴 传 歌 赛 耶 哀 结 但 何 珥 摩 俄 拿 弥 鸿 哈 番 该 亚 玛 太 可 路 约 徒 罗 林前 林后 加 弗 腓 西 帖前 帖后 提前 提后 多 门 来 雅 彼前 彼后 约一 约二 约三 犹 启'.split(' ');
const REF_EN = 'Ge Ex Le Nu De Jos Jud Ru 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Ne Es Job Ps Pr Ec So Isa Jer La Eze Da Ho Joe Am Ob Jon Mic Na Hab Zep Hag Zec Mal Mt Mr Lu Joh Ac Ro 1Co 2Co Ga Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jo 2Jo 3Jo Jude Re'.split(' ');
const REF_BOOK = new Map([...REF_ZH.map((a, i) => [a, i]), ...REF_EN.map((a, i) => [a, i])]);
const REF_BOOK_RE = [...REF_BOOK.keys()].sort((a, b) => b.length - a.length).map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// One reference inside a group: optional book, then chapter[:verse][-verse] (or just a verse after a comma).
const REF_ONE = new RegExp(`^(${REF_BOOK_RE})?\\s*(\\d+)(?::(\\d+))?(?:[-–](\\d+))?$`);

// Turn text into text nodes and buttons, linking every reference inside （…） or (…).
function withVerseLinks(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(/([（(])([^）)]*)([）)])/g)) {
    out.push(text.slice(last, m.index), m[1]);
    let book = null, chapter = null, hadVerse = false;
    for (const part of m[2].split(/([;,；，])/)) {
      if (/^[;,；，]$/.test(part)) { if (part === ';' || part === '；') hadVerse = false; out.push(part); continue; }
      const lead = part.match(/^\s*/)[0];
      const r = part.trim().match(REF_ONE);
      if (!r) { out.push(part); book = null; continue; }
      let [, b, x, y, z] = r;
      let v1, v2, ch;
      if (b) { book = REF_BOOK.get(b); ch = +x; v1 = y ? +y : null; v2 = z ? +z : v1; }
      else if (y) { ch = +x; v1 = +y; v2 = z ? +z : v1; }                         // 9:4-6 (same book)
      else if (hadVerse && chapter) { ch = chapter; v1 = +x; v2 = z ? +z : v1; }    // ,45 or ,57-65 (same chapter)
      else { ch = +x; v1 = null; v2 = null; }                                      // a whole chapter
      const meta = book != null ? state.books?.[book] : null;
      if (!meta || ch < 1 || ch > meta.chapters) { out.push(part); continue; }
      chapter = ch; hadVerse = v1 != null;
      out.push(lead, h('button', { class: 'vref', type: 'button', title: 'Open in the Bible', onclick: (e) => {
        e.stopPropagation();
        openReference(meta.id, ch, v1, v2);
      } }, part.trim()));
    }
    out.push(m[3]);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
}

// Go to a passage in the reader and select it (verses v1–v2; a whole chapter just opens at the top).
// Remember where we came from (chapter, scroll, selection, open panel) so a Back button can return there.
const backStack = [];
function openReference(book, chapter, v1, v2) {
  const panel = reader.toolbar?.querySelector('.dict-btn[aria-expanded="true"]') ? 'dict' : null;
  backStack.push({ pos: { ...state.pos }, scrollTop: reader.scroller?.scrollTop || 0, selection: state.selection ? { ...state.selection } : null, panel,
    target: { book, chapter },
    // From the commentary page: come back to it, and keep the Bible words it was opened from.
    commentary: state.tab === 'commentary' ? { current: cm.current, origin: cm.origin, returnVerse: cm.returnVerse, homeTop: cm.homeTop } : null });
  if (backStack.length > 20) backStack.shift();
  goTo({ book, chapter }, v1 || null, v1 ? [v1, Math.max(v1, v2 || v1)] : null);
}
function goBack() {
  const from = backStack.pop();
  if (!from) return;
  clearSelection();
  if (from.commentary) {
    state.pos = from.pos; store.set('pos', state.pos);
    Object.assign(cm, { origin: from.commentary.origin, returnVerse: from.commentary.returnVerse, focusVerse: null, quote: null,
      current: from.commentary.current, restore: { ...from.commentary, scrollTop: from.scrollTop, selection: from.selection, panel: from.panel } });
    state.tab = 'commentary';
    render();
    return;
  }
  state.pos = from.pos; store.set('pos', state.pos); state.tab = 'read';
  render().then(() => {
    if (reader.scroller) reader.scroller.scrollTop = from.scrollTop;
    if (!from.selection) return;
    requestAnimationFrame(() => {
      setSelection(from.selection.start, from.selection.end);
      if (from.panel) reader.toolbar?.querySelector('.dict-btn')?.click(); // reopen the Dictionary/Translate panel
    });
  });
}
// A "Back to …" button on the Read page while we're on a chapter opened from a reference.
function backButton() {
  const from = backStack[backStack.length - 1];
  if (!from) return null;
  if (from.target.book !== state.pos.book || from.target.chapter !== state.pos.chapter) { backStack.length = 0; return null; } // moved on
  return h('button', { class: 'back-pill', type: 'button', onclick: goBack }, from.commentary ? '‹ Back to commentary' : `‹ Back to ${bookName(from.pos.book)} ${from.pos.chapter}`);
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
  if (open) { open.remove(); bar.querySelector('.to-top')?.remove(); btn.setAttribute('aria-expanded', 'false'); positionToolbar(); return; }
  btn.setAttribute('aria-expanded', 'true');
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
    // Grammar of the whole selection, shown below the translation (where word definitions also appear).
    const gBtn = h('button', { class: 'g-btn', type: 'button', 'aria-pressed': 'false', onclick: async () => {
      trans.querySelectorAll('.tw').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      gBtn.setAttribute('aria-pressed', 'true');
      body.replaceChildren(h('p', { class: 'dict-muted' }, 'Analysing…'));
      positionToolbar();
      const nodes = await analyzeGrammar(all.join(' '));
      if (gBtn.getAttribute('aria-pressed') === 'true') { body.replaceChildren(...nodes); positionToolbar(); }
    } }, 'Grammar');
    en.append(' ', gBtn);
    trans = h('div', { class: 'trans', 'aria-live': 'polite' }, en, zh);
    api('POST', '/api/translate', { text: all.join(' ') }).then((r) => { zh.textContent = r.text; positionToolbar(); }).catch((err) => {
      zh.classList.add('dict-muted');
      zh.textContent = err instanceof OfflineError ? 'Translation needs a connection.' : err.message;
      positionToolbar();
    });
  }
  const show = async (w) => {
    trans?.querySelectorAll('.tw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === w)));
    trans?.querySelector('.g-btn')?.setAttribute('aria-pressed', 'false');
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
    const bibleSlot = h('div', { class: 'bd-slot' });
    // Not in the English dictionary: still show the word (the Bible dictionary buttons attach to it).
    const noEnglish = !e || (!e.t && !e.d && !e.base);
    if (noEnglish) body.replaceChildren(h('div', { class: 'dict-head' }, h('span', { class: 'dict-word' }, w)),
      // Pronunciations are still looked up; the row is removed if no phonetic symbols are found.
      namePronRow(w),
      h('p', { class: 'dict-muted' }, 'Not in the English dictionary.'), bibleSlot);
    else body.replaceChildren(...[...block(e, !e.base), ...(e.base ? [h('div', { class: 'dict-base' }, `Base form: ${e.base.word}`), ...block(e.base, true)] : []), bibleSlot].filter(Boolean));
    positionToolbar();
    // Bible dictionary buttons, only if the word (or its base form) has topics. The text is fetched on tap.
    let bdWord = w;
    let topics = await bibleTopicsFor(w);
    if (!topics.length && e?.base) { bdWord = e.base.word; topics = await bibleTopicsFor(bdWord); }
    if (!topics.length || !bibleSlot.isConnected) return; // none, or another word was tapped meanwhile
    const sections = {};
    // Show (fetching the first time) and scroll to the entry; tapping again just scrolls back to it.
    const toggle = (lang) => async (ev) => {
      const btn = ev.currentTarget;
      let section = sections[lang];
      if (!section) {
        if (btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        try {
          section = sections[lang] = bibleSection(await bibleTextFor(bdWord, lang), { english: lang === 'en' });
        } catch (err) {
          btn.classList.remove('loading');
          toast(err instanceof OfflineError ? 'The Bible dictionary needs a connection.' : err.message);
          return;
        }
        btn.classList.remove('loading');
        if (!bibleSlot.isConnected) return;
        // Chinese above English, whichever was opened first.
        if (lang === 'zh') bibleSlot.prepend(section); else bibleSlot.append(section);
      }
      section.hidden = false;
      positionToolbar();
      const box = body.closest('.dict');
      if (box) box.scrollBy({ top: section.getBoundingClientRect().top - box.getBoundingClientRect().top - 6, behavior: 'smooth' });
      section.classList.remove('flash'); void section.offsetWidth; section.classList.add('flash');
    };
    const zhBtn = h('button', { class: 'bd-jump', type: 'button', 'aria-label': 'Show the Chinese Bible dictionary entry', onclick: toggle('zh') }, '圣经辞典');
    body.querySelector('.dict-head')?.append(zhBtn,
      h('button', { class: 'bd-jump', type: 'button', lang: 'en', 'aria-label': 'Show the English Bible dictionary entry', onclick: toggle('en') }, 'Bible Dictionary'));
    // No English dictionary entry: show the Chinese Bible dictionary entry straight away.
    if (noEnglish) toggle('zh')({ currentTarget: zhBtn });
    positionToolbar();
  };
  const dictBox = h('div', { class: 'dict' }, trans, body,
    h('p', { class: 'dict-credit' }, multi ? 'Translation: Youdao · Phonetics & audio: Youdao, Free Dictionary API · Dictionary: ECDICT · 圣经辞典: 信望爱' : 'ECDICT English–Chinese dictionary · Phonetics & audio: Youdao, Free Dictionary API · 圣经辞典: 信望爱'));
  // An ↑ button appears once the panel is scrolled down, and takes it back to the top.
  const toTop = h('button', { class: 'to-top', type: 'button', hidden: true, 'aria-label': 'Back to top', title: 'Back to top',
    onclick: () => dictBox.scrollTo({ top: 0, behavior: 'smooth' }) }, '↑');
  dictBox.addEventListener('scroll', () => { toTop.hidden = dictBox.scrollTop < 40; }, { passive: true });
  bar.append(dictBox, toTop);
  if (multi) body.replaceChildren(h('p', { class: 'dict-muted' }, 'Tap any word above for its definition, or Grammar to analyse the passage.'));
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
  if (mine.length === 1 && !friends.length) return noteViewer(mine[0]);
  openSheet((close) => [
    h('h2', {}, 'Notes here'),
    ...mine.map((n) => { const card = noteCard(n, { onEdit: () => { close(); noteEditor(n); }, onDelete: () => confirmDeleteNote(n, () => { card.remove(); if (!document.querySelector('.sheet .card')) close(); }) }); return card; }),
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
// The starting list for someone who hasn't edited theirs; the others can be added with Edit list.
function defaultCommentaryIds() {
  return ['matthew-henry', 'fhl-zh-hans', 'tyndale'];
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
  focusVerse: null, returnVerse: null, origin: null, verses: null, meta: null };

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
    document.querySelector('.book-body')?.style.setProperty('--verse-size', `${state.fontSize}px`);
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
  const tab = h('button', { class: 'side-tab', 'aria-controls': 'side-panel', 'aria-expanded': 'false', 'aria-label': 'Show options' },
    svg(ICONS.chevronLeft));
  const dock = h('div', { class: 'side-dock' }, tab, panel);
  const setOpen = (open) => {
    dock.classList.toggle('open', open);
    tab.setAttribute('aria-expanded', String(open));
    tab.setAttribute('aria-label', open ? 'Hide options' : 'Show options');
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
  if (cm.current && !ids.includes(cm.current) && cm.list.some((c) => c.id === cm.current)) ids.push(cm.current); // opened from a quote
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
  if (open) setBars(true); // keep the Done button and tabs in reach while editing
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

function openCommentaryPage(verse, selection) {
  // The Bible words selected when the page was opened: highlights and notes made on commentary text go there.
  cm.origin = selection ? { book: state.pos.book, chapter: state.pos.chapter, start: { ...selection.start }, end: { ...selection.end } } : null;
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
  // The selection bubble works on commentary text too, with the Bible reader's word selection.
  Object.assign(reader, { mode: 'commentary', body: cm.listEl, scroller: cm.scroller, words: [], gaps: [], verseEls: [], handles: null, toolbar: null });
  cm.listEl.addEventListener('pointerdown', (e) => { const t = e.target.closest('.commentary-text'); if (t) wrapCommentaryWords(t); }, { capture: true });
  attachReaderGestures(cm.listEl);
  // Same bars as the Read page: a slim title bar on top and the tabs below, both sliding away while reading.
  const head = h('header', { class: 'c-head' },
    h('div', { class: 'c-titlebar' }, h('h1', {}, 'Commentary')),
    cm.chips);
  // Back to the Bible text: the same bottom-left pill as after following a reference.
  // Back to the Bible text, with the words selected when the commentary was opened still selected.
  const back = h('button', { class: 'back-pill', type: 'button', onclick: () => {
    const o = cm.origin?.book === state.pos.book && cm.origin.chapter === state.pos.chapter ? cm.origin : null;
    goTo(state.pos, cm.returnVerse, o && { start: o.start, end: o.end });
  } }, `‹ Back to ${meta.name} ${chapter}`);
  new ResizeObserver(() => { cm.scroller.style.paddingTop = `${head.offsetHeight + 10}px`; }).observe(head);
  // The dictionary panel's arrow, once you've scrolled away from where the page opened: it returns there.
  cm.homeTop = 0;
  const toTop = h('button', { class: 'to-top page-top', type: 'button', hidden: true, 'aria-label': 'Back to where you started', title: 'Back to where you started',
    onclick: () => cm.scroller.scrollTo({ top: cm.homeTop, behavior: 'smooth' }) }, '↑');
  let lastTop = 0, touched = false; // jumping to the verse on opening isn't reading on, so wait for the reader to scroll
  for (const ev of ['pointerdown', 'wheel', 'keydown']) cm.scroller.addEventListener(ev, () => { touched = true; }, { passive: true });
  cm.scroller.addEventListener('scroll', () => {
    const top = cm.scroller.scrollTop;
    if (state.selection) { positionHandles(); positionToolbar(); }
    if (touched && top > lastTop + 6 && top > 60 && !cm.manageOpen && !state.selection) setBars(false);
    // Below where the page opened: an up arrow. Above it: a down arrow. Either returns there.
    const dir = cm.manageOpen ? 0 : top > cm.homeTop + 300 ? 1 : top < cm.homeTop - 300 ? -1 : 0;
    toTop.hidden = !dir;
    if (dir) {
      toTop.textContent = dir > 0 ? '↑' : '↓';
      const name = dir > 0 ? 'Back up to where you started' : 'Back down to where you started';
      toTop.setAttribute('aria-label', name); toTop.title = name;
    }
    lastTop = top;
  }, { passive: true });
  // A tap on the text (not a button, link or the list editor) shows or hides the bars.
  cm.scroller.addEventListener('click', (e) => {
    if (cm.manageOpen || cm.listEl.contains(e.target) || e.target.closest('button, a, input, .manage-panel')) return; // taps on the text are handled with the selection
    setBars(document.body.classList.contains('bars-hidden'));
  });
  mount(h('main', { class: 'screen commentary-page' },
    head,
    cm.scroller,
    back,
    toTop,
    sideDock([
      { id: 'side-edit-list', label: 'Edit commentary list', icon: ICONS.editShelf, toggle: { get: () => cm.manageOpen, set: setManageOpen, announce: false } },
    ])));
  loadCommentaryPage();
}
const BOOKS_FALLBACK = () => [{ id: state.pos.book, name: bookName(state.pos.book), chapters: 999 }];

async function loadCommentaryPage() {
  const token = ++cm.token;
  const { book, chapter } = state.pos;
  clearSelection(); reader.words = []; reader.gaps = [];
  const stale = () => token !== cm.token || state.tab !== 'commentary' || state.pos.book !== book || state.pos.chapter !== chapter;
  try { cm.list = await loadCommentaryList(); } catch {
    if (!stale()) setStatus(h('p', { class: 'error' }, "Couldn't load commentaries. Check your connection."));
    return;
  }
  if (stale()) return;
  const ids = myCommentaryIds(cm.list);
  const pinned = cm.quote?.id || cm.restore?.current;
  cm.current = pinned && cm.list.some((c) => c.id === pinned) ? pinned
    : ids.includes(cm.current) ? cm.current : ids.includes(store.get('commentary', null)) ? store.get('commentary', null) : ids[0] || null;
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
  cm.verses = verses; cm.meta = meta;
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

  const restore = cm.restore; cm.restore = null;
  if (restore && restore.current === meta.id) { restoreCommentaryView(sections, restore); return; }
  const quote = cm.quote; cm.quote = null;
  if (quote && quote.id === meta.id && showQuoted(sections, quote)) return;
  if (cm.focusVerse) {
    const v = cm.focusVerse;
    const target = sections.find((el) => +el.dataset.from <= v && v <= +el.dataset.to);
    if (target) {
      requestAnimationFrame(() => {
        cm.scroller.scrollTop = target.offsetTop - cm.scroller.offsetTop - 8; target.classList.add('flash');
        cm.homeTop = cm.scroller.scrollTop; // where the page opened; the arrow brings you back here
      });
    } else { toast(`No comment on verse ${v} in ${meta.name}. Showing the whole chapter.`); cm.homeTop = cm.scroller.scrollTop; }
  } else { cm.scroller.scrollTop = 0; cm.homeTop = 0; }
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
    if ((e.pointerType === 'mouse' && e.button !== 0) || cm.manageOpen || state.selection || e.target.closest('button, a, input, .handle')) return;
    g = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, horiz: null };
  });
  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (state.selection) { g = null; cm.listEl.style.transform = ''; cm.listEl.style.opacity = ''; return; } // a long press started a selection
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
    if (e.target.closest('.handle') || state.selection) return; // arrows move a selection handle instead
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

// Mark the quoted words in their passage and scroll to them. False if the quote can't be found.
function showQuoted(sections, quote) {
  const sec = sections.find((el) => +el.dataset.from === quote.from);
  const textEl = sec?.querySelector('.commentary-text');
  if (!textEl) return false;
  wrapCommentaryWords(textEl);
  const v = sections.indexOf(sec) + 1;
  const ws = reader.words.filter((x) => x.v === v);
  let str = '';
  const spans = ws.map((x, i) => { if (i && x.el.previousSibling?.classList?.contains('g')) str += ' '; const a = str.length; str += x.el.textContent; return [a, str.length]; });
  const needle = quote.text.replace(/…$/, '').replace(/\s+/g, ' ').trim();
  const at = needle ? str.indexOf(needle) : -1;
  if (at < 0) return false;
  const hit = ws.filter((_, i) => spans[i][1] > at && spans[i][0] < at + needle.length);
  const first = hit[0].w, last = hit[hit.length - 1].w;
  hit.forEach((x) => x.el.classList.add('quoted'));
  reader.gaps.forEach((g) => { if (g.v === v && g.w >= first && g.w < last) g.el.classList.add('quoted'); });
  requestAnimationFrame(() => {
    const pad = parseFloat(cm.scroller.style.paddingTop) || 60;
    cm.scroller.scrollTop += hit[0].el.getBoundingClientRect().top - cm.scroller.getBoundingClientRect().top - pad - 60;
    cm.homeTop = cm.scroller.scrollTop;
  });
  return true;
}

// Coming back from a verse link: same scroll position, same selected words, dictionary reopened.
function restoreCommentaryView(sections, r) {
  requestAnimationFrame(() => {
    cm.scroller.scrollTop = r.scrollTop; cm.homeTop = r.homeTop ?? r.scrollTop;
    const sel = r.selection, textEl = sel && sections[sel.start.v - 1]?.querySelector('.commentary-text');
    if (!textEl) return;
    for (let v = sel.start.v; v <= sel.end.v; v++) { const t = sections[v - 1]?.querySelector('.commentary-text'); if (t) wrapCommentaryWords(t); }
    setSelection(sel.start, sel.end);
    if (r.panel) reader.toolbar?.querySelector('.dict-btn')?.click();
  });
}

/* ----- Selecting commentary text ----- */
// Split a commentary passage into selectable words the first time it's touched (Chinese: one character each).
const CJK = '\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef';
const COMMENTARY_TOKENS = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g');
function wrapCommentaryWords(textEl) {
  if (textEl.dataset.wrapped) return;
  textEl.dataset.wrapped = '1';
  const v = [...cm.listEl.children].indexOf(textEl.closest('.c-entry')) + 1;
  let w = -1;
  const frag = document.createDocumentFragment();
  for (const [tok] of textEl.textContent.matchAll(COMMENTARY_TOKENS)) {
    if (/^\s/.test(tok)) frag.append(w < 0 ? document.createTextNode(tok) : h('span', { class: 'g', dataset: { v, w } }, tok));
    else frag.append(h('span', { class: 'w', dataset: { v, w: ++w } }, tok));
  }
  textEl.replaceChildren(frag);
  reader.words = []; reader.gaps = [];
  for (const el of cm.listEl.querySelectorAll('.commentary-text[data-wrapped] .w, .commentary-text[data-wrapped] .g')) {
    (el.classList.contains('w') ? reader.words : reader.gaps).push({ v: +el.dataset.v, w: +el.dataset.w, el });
  }
}

// Where a highlight or note made on commentary text goes in the Bible: the words selected when the page was
// opened (if this passage is about them), otherwise the verses the passage comments on.
function commentaryTarget() {
  const { book, chapter } = state.pos;
  const sec = reader.words.find((x) => !cmp(x, state.selection.start))?.el.closest('.c-entry');
  const from = +(sec?.dataset.from || 0), to = Math.max(from, +(sec?.dataset.to || 0));
  const words = (v) => splitWords(cm.verses?.[v - 1]?.[0] || '');
  const o = cm.origin?.book === book && cm.origin.chapter === chapter ? cm.origin : null;
  let start, end;
  if (o && (!from || (o.start.v <= to && o.end.v >= from))) ({ start, end } = o);
  else if (from) { start = { v: from, w: 0 }; end = { v: to, w: Math.max(0, words(to).length - 1) }; }
  else { start = { v: 1, w: 0 }; end = { v: 1, w: Math.max(0, words(1).length - 1) }; }
  const quote = [];
  for (let v = start.v; v <= end.v; v++) words(v).forEach((t, w) => { if (inRange({ v, w }, start, end)) quote.push(t); });
  const passage = from ? `${bookName(book)} ${chapter}:${from}${to > from ? `–${to}` : ''}` : `${bookName(book)} ${chapter}`;
  const existing = Object.values(state.mine.notes).find((n) => n.book === book && n.chapter === chapter
    && n.start.verse === start.v && n.start.word === start.w && n.end.verse === end.v && n.end.word === end.w);
  const note = existing ? { ...existing } : { id: newId(), book, chapter, start: { verse: start.v, word: start.w }, end: { verse: end.v, word: end.w },
    color: 'yellow', quote: (quote.join(' ') || `${bookName(book)} ${chapter}:${start.v}`).slice(0, 4000), body: '' };
  let cited = selectedQuote();
  if (cited.length > 1500) cited = cited.slice(0, 1500) + '…';
  const reference = `“${cited}” — ${cm.meta?.name || 'Commentary'}${from ? ` on ${passage}` : `, introduction to ${passage}`}`;
  return { note, isNew: !existing, body: note.body ? `${note.body}\n\n${reference}` : reference };
}

function showCommentaryToolbar() {
  const toBible = (color) => {
    const { note, body } = commentaryTarget();
    saveNote({ ...note, color, body: body.slice(0, 10000) });
    clearSelection();
    toast(`Added to your note on ${ref(note)}`);
  };
  const bar = h('div', { class: 'sel-toolbar', role: 'toolbar', 'aria-label': 'Selection actions' },
    h('div', { class: 'row' }, ...COLORS.map((c) => h('button', { class: 'swatch', dataset: { c }, 'aria-label': `Highlight ${c} in the Bible text, with this quote`, onclick: () => toBible(c) })),
    h('span', { class: 'sel-divider', 'aria-hidden': 'true' }),
    bubbleBtn('Note on the Bible text', ICONS.notes, () => {
      const { note, isNew, body } = commentaryTarget();
      noteEditor({ ...note, body: body.slice(0, 10000) }, { isNew });
    }),
    bubbleBtn('Copy', ICONS.copy, async () => {
      try { await navigator.clipboard.writeText(selectedQuote()); toast('Copied'); } catch { toast("Couldn't copy"); }
      clearSelection();
    }),
    bubbleBtn('Dictionary', ICONS.dictionary, (e) => toggleDictionary(bar, e.currentTarget), 'dict-btn')));
  reader.toolbar = bar;
  document.body.append(bar);
  positionToolbar();
}

async function openPicker({ chapters = false } = {}) {
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
    const current = books.find((b) => b.id === state.pos.book);
    if (chapters && current) showChapters(current); else showBooks();
    return wrap;
  }, { label: 'Choose book and chapter' });
}

function goTo(pos, verse, select) {
  if (!pos) return;
  clearSelection();
  state.pos = { book: pos.book, chapter: pos.chapter };
  store.set('pos', state.pos);
  state.tab = 'read';
  render().then(() => {
    if (verse && reader.verseEls[verse]) {
      reader.verseEls[verse].scrollIntoView({ block: 'center' });
      if (!select) reader.verseEls[verse].classList.add('flash');
    } else if (reader.scroller) reader.scroller.scrollTop = 0;
    // Or reselect exact words {start, end}, e.g. the selection a commentary was opened from.
    if (select?.start) {
      if (reader.words.some((x) => !cmp(x, select.start)) && reader.words.some((x) => !cmp(x, select.end))) requestAnimationFrame(() => setSelection(select.start, select.end));
      return;
    }
    // Select verses [from, to] (clamped to the chapter), which also shows the selection bubble.
    if (select && reader.words.length) {
      const last = reader.verseEls.length - 1;
      const from = Math.min(select[0], last), to = Math.min(select[1], last);
      const lastWord = reader.words.filter((x) => x.v === to).pop();
      if (lastWord) requestAnimationFrame(() => setSelection({ v: from, w: 0 }, { v: to, w: lastWord.w }));
    }
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
      { id: 'side-notes-friends', label: "Friends' notes", icon: ICONS.friendsNotes,
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

/* ---------------- Books: the person's own digital books ---------------- */
const BOOK_ACCEPT = '.epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain';
const lib = { books: null, opened: new Map(), covers: new Map(), current: null, saveTimer: null, notes: new Map(), chapter: 0, blocks: [] };
const authHeaders = () => (state.auth ? { Authorization: `Bearer ${state.auth.token}` } : {});
async function authFetch(path, opts = {}) {
  let res;
  try { res = await fetch(path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } }); } catch { throw new OfflineError('You seem to be offline.'); }
  if (res.status === 401 && state.auth) { signOut(true); throw new Error('Signed out'); }
  if (!res.ok) { const d = await res.json().catch(() => ({})); const e = new Error(d.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return res;
}
const formatOf = (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  return { epub: 'epub', pdf: 'pdf', txt: 'txt' }[ext] || { 'application/epub+zip': 'epub', 'application/pdf': 'pdf', 'text/plain': 'txt' }[file.type] || null;
};
const bookProgress = (b) => (b.position?.progress != null ? Math.round(b.position.progress * 100) : null);
// A generated cover for books without one: the title on a colour chosen from it.
const TILE_COLORS = ['#3d5a80', '#7b4b94', '#2f6f62', '#9c4a3c', '#5b6b2f', '#8a5a2b', '#38577a', '#6d3f5b'];
function bookTile(b) {
  let hsh = 0; for (const ch of b.title) hsh = (hsh * 31 + ch.codePointAt(0)) >>> 0;
  return h('div', { class: 'lib-tile', style: `background:${TILE_COLORS[hsh % TILE_COLORS.length]}` },
    h('span', { class: 'lib-tile-title' }, b.title), b.author ? h('span', { class: 'lib-tile-author' }, b.author) : null,
    h('span', { class: 'lib-format' }, b.format.toUpperCase()));
}
function coverImg(b) {
  const box = h('div', { class: 'lib-cover' }, bookTile(b));
  if (!b.hasCover) return box;
  const show = (url) => box.replaceChildren(h('img', { src: url, alt: '' }));
  if (lib.covers.has(b.id)) show(lib.covers.get(b.id));
  else authFetch(`/api/library/${b.id}/cover`).then((r) => r.blob()).then((blob) => { const u = URL.createObjectURL(blob); lib.covers.set(b.id, u); show(u); }).catch(() => {});
  return box;
}

async function loadLibrary() {
  const { books } = await api('GET', '/api/library');
  lib.books = books;
  store.set(`library.${uid()}`, books);
  return books;
}

async function renderLibrary() {
  const grid = h('div', { class: 'lib-grid' });
  const status = h('div');
  const input = h('input', { type: 'file', accept: BOOK_ACCEPT, multiple: true, hidden: true, onchange: () => { addBooks([...input.files]); input.value = ''; } });
  const pick = () => input.click();
  mount(h('main', { class: 'screen library-page' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Books'), h('button', { class: 'text-btn', onclick: pick }, 'Add')),
    status, grid, input,
    sideDock([{ id: 'side-add-book', label: 'Add a book', icon: ICONS.addBook, action: pick }])));
  const draw = (books, failed) => {
    status.replaceChildren(failed ? h('p', { class: 'error' }, "Couldn't refresh your books. Showing the saved list.") : '');
    if (!books?.length) {
      grid.replaceChildren(h('div', { class: 'lib-empty' },
        h('p', {}, 'Add EPUB, PDF or text books from your phone, Google Drive or Dropbox. They’re kept in your account, so they open on any device you sign in on.'),
        h('button', { class: 'filled-btn', onclick: pick }, 'Add a book')));
      return;
    }
    grid.replaceChildren(...books.map((b) => h('div', { class: 'lib-card' },
      h('button', { class: 'lib-open', type: 'button', 'aria-label': `Open ${b.title}`, onclick: () => openLibraryBook(b) },
        coverImg(b),
        h('span', { class: 'lib-title' }, b.title),
        h('span', { class: 'lib-meta' }, [b.author, bookProgress(b) != null ? `${bookProgress(b)}%` : null].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn lib-more', type: 'button', 'aria-label': `Options for ${b.title}`, title: 'Book options', onclick: () => bookOptions(b) }, '⋯'))));
  };
  draw(lib.books || store.get(`library.${uid()}`, null));
  try { draw(await loadLibrary()); } catch { if (state.tab === 'books') draw(lib.books || store.get(`library.${uid()}`, null), true); }
}

// The phone's file picker offers files on the phone and in Google Drive, Dropbox, etc.; each is copied into the account.
async function addBooks(files) {
  for (const file of files) {
    const format = formatOf(file);
    if (!format) { toast(`${file.name}: only EPUB, PDF and text files can be added.`); continue; }
    if (file.size > 60 * 1024 * 1024) { toast(`${file.name} is larger than 60 MB.`); continue; }
    let title = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim(), author = '', cover = null;
    if (format === 'epub') {
      try {
        const book = await openEpub(await file.arrayBuffer());
        title = book.title || title; author = book.author || '';
        if (book.coverPath) cover = await makeCover(await book.zip.read(book.coverPath));
      } catch { toast(`${file.name} couldn't be opened as an EPUB book.`); continue; }
    }
    toast(`Adding “${title}”…`);
    try {
      const q = new URLSearchParams({ format, title, author });
      const { book } = await (await authFetch(`/api/library?${q}`, { method: 'POST', body: file })).json();
      if (cover) await authFetch(`/api/library/${book.id}/cover`, { method: 'PUT', body: cover }).catch(() => {});
      toast(`Added “${book.title}”`);
    } catch (e) { toast(e instanceof OfflineError ? "You're offline. Try again when you're connected." : `${title}: ${e.message}`); }
  }
  if (state.tab === 'books') renderLibrary();
}
// A small JPEG of the book's cover for the library grid.
async function makeCover(bytes) {
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const w = 360, hgt = Math.round(w * img.naturalHeight / img.naturalWidth) || 540;
    const c = document.createElement('canvas'); c.width = w; c.height = Math.min(hgt, 720);
    c.getContext('2d').drawImage(img, 0, 0, w, hgt);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

function bookOptions(b, { onSaved = renderLibrary, onDeleted = renderLibrary } = {}) {
  openSheet((close) => {
    const input = h('input', { value: b.title, maxlength: 200, required: true });
    return [
      h('h2', {}, 'Book'),
      h('label', { class: 'field' }, h('span', {}, 'Title'), input),
      h('p', { class: 'handle-sub' }, `${b.format.toUpperCase()} · ${(b.size / 1048576).toFixed(b.size < 10485760 ? 1 : 0)} MB`),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'text-btn danger', type: 'button', onclick: async () => {
          if (!confirm(`Delete “${b.title}” from your books?`)) return;
          try { await api('DELETE', `/api/library/${b.id}`); close(); toast('Book deleted'); onDeleted(); } catch (e) { toast(e.message); }
        } }, 'Delete'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'text-btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'filled-btn', type: 'button', onclick: async () => {
          try { const r = await api('PUT', `/api/library/${b.id}`, { title: input.value }); b.title = r.book.title; close(); onSaved(); } catch (e) { toast(e.message); }
        } }, 'Save')),
    ];
  }, { label: 'Book options' });
}

async function openLibraryBook(b) {
  if (b.format === 'pdf') { // the phone's own PDF viewer, through a short-lived link
    const win = window.open('', '_blank');
    try {
      const { url } = await api('POST', `/api/library/${b.id}/link`);
      if (win) win.location.href = url; else location.href = url;
    } catch (e) { win?.close(); toast(e.message); }
    return;
  }
  lib.current = b;
  state.tab = 'book';
  render();
}

// Reading an EPUB or text book: one chapter at a time, like the Bible reader.
async function renderBookReader() {
  const b = lib.current;
  if (!b) { state.tab = 'books'; return render(); }
  // Full screen, no title bar or tabs: a quiet line of book and chapter on top, where you are at the bottom,
  // and two buttons (back to the library, contents) that show on a tap and slide away while reading.
  const runEl = h('div', { class: 'b-running' }, b.title);
  const whereEl = h('span'), pctEl = h('span');
  const progressEl = h('div', { class: 'b-progress', 'aria-hidden': 'true' }, whereEl, pctEl);
  const body = h('div', { class: 'book-body', style: `--verse-size:${state.fontSize}px` }, h('p', { class: 'empty-inline' }, 'Opening…'));
  const scroller = h('div', { class: 'c-scroll b-scroll', tabindex: 0 }, body);
  // Reader bars: shown on opening and on a tap, slid away while reading.
  const toLibrary = () => { clearSelection(); saveBookPosition(true); state.tab = 'books'; render(); };
  const barBtn = (label, icon, onclick) => h('button', { class: 'icon-btn b-bar-btn', type: 'button', 'aria-label': label, title: label, onclick }, svg(icon));
  const sizePanel = h('div', { class: 'b-size-panel', role: 'group', 'aria-label': 'Text size', hidden: true }, textSizeControl());
  const sizeBtn = barBtn('Text size', ICONS.sliders, () => { sizePanel.hidden = !sizePanel.hidden; sizeBtn.setAttribute('aria-expanded', String(!sizePanel.hidden)); });
  sizeBtn.setAttribute('aria-expanded', 'false');
  const topBar = h('header', { class: 'b-topbar' },
    barBtn('Close book', ICONS.close, toLibrary), h('span', { class: 'spacer' }),
    barBtn('Book options', ICONS.more, () => bookOptions(b, { onSaved: () => { runEl.textContent = runEl.textContent.replace(/^[^·]*/, b.title + ' '); }, onDeleted: toLibrary })));
  const toolbar = h('nav', { class: 'b-toolbar', 'aria-label': 'Book' }, barBtn('Contents', ICONS.contents, () => showContents()),
    barBtn('Notes', ICONS.notes, () => showBookNotes()), sizeBtn);
  const screen = h('main', { class: 'screen commentary-page book-page' }, runEl, scroller, progressEl, topBar, sizePanel, toolbar);
  mount(screen);

  let book;
  try {
    book = lib.opened.get(b.id);
    if (!book) {
      const buf = await (await authFetch(`/api/library/${b.id}/file`)).arrayBuffer();
      book = b.format === 'epub' ? await openEpub(buf) : openText(buf, b.title);
      lib.opened.set(b.id, book);
    }
  } catch (e) {
    body.replaceChildren(h('p', { class: 'error' }, e instanceof OfflineError ? "You're offline. Books need a connection to open." : `This book couldn't be opened (${e.message}).`));
    return;
  }
  if (state.tab !== 'book' || lib.current !== b) return;

  let chapter = Math.min(b.position?.chapter ?? 0, book.chapters.length - 1);
  // The selection bubble works here as on the Bible text: the same word selection, highlights and notes.
  try { lib.notes.set(b.id, (await api('GET', `/api/library/${b.id}/notes`)).notes); } catch { if (!lib.notes.has(b.id)) lib.notes.set(b.id, []); }
  if (state.tab !== 'book' || lib.current !== b) return;
  Object.assign(reader, { mode: 'book', body, scroller, words: [], gaps: [], verseEls: [], handles: null, toolbar: null });
  body.addEventListener('pointerdown', (e) => { const blk = bookBlockAt(e.target); if (blk) wrapBookBlock(blk); }, { capture: true });
  attachReaderGestures(body);
  const show = async (i, { frac = 0, anchor = '', slide = 0, block = 0 } = {}) => {
    chapter = Math.max(0, Math.min(book.chapters.length - 1, i));
    clearSelection();
    const content = await book.render(chapter);
    if (state.tab !== 'book' || lib.current !== b) return;
    lib.chapter = chapter;
    const nav = h('div', { class: 'b-nav' },
      chapter > 0 ? h('button', { class: 'text-btn', onclick: () => show(chapter - 1, { slide: -1 }) }, '‹ Previous') : h('span'),
      chapter < book.chapters.length - 1 ? h('button', { class: 'text-btn', onclick: () => show(chapter + 1, { slide: 1 }) }, 'Next ›') : h('span', { class: 'handle-sub' }, 'The end'));
    body.replaceChildren(content, nav);
    reader.words = []; reader.gaps = []; reader.handles = null;
    indexBookBlocks(body);
    for (const n of bookChapterNotes()) for (let v = n.start.verse; v <= n.end.verse; v++) wrapBookBlock(lib.blocks[v - 1]); // so highlights show
    paint();
    const ct = book.chapterTitle(chapter);
    runEl.textContent = ct && ct !== b.title ? `${b.title} · ${ct}` : b.title;
    whereEl.textContent = `Chapter ${chapter + 1} of ${book.chapters.length}`;
    if (slide) { body.classList.remove('slide-from-right', 'slide-from-left'); void body.offsetWidth; body.classList.add(slide > 0 ? 'slide-from-right' : 'slide-from-left'); }
    requestAnimationFrame(() => {
      const target = (anchor && body.querySelector(`#${CSS.escape(ANCHOR_PREFIX + anchor)}`)) || (block && lib.blocks[block - 1]);
      if (block && target) { target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash'); }
      if (target) scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 56;
      else scroller.scrollTop = frac * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      saveBookPosition();
    });
  };
  lib.show = show;
  lib.where = () => {
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const frac = Math.min(1, Math.max(0, scroller.scrollTop / max));
    return { chapter, frac, progress: Math.min(1, (chapter + frac) / book.chapters.length) };
  };
  // This book's highlights and notes as a full page, in reading order; a tap goes to the place.
  const showBookNotes = () => {
    document.querySelector('.toc-page')?.remove();
    const notes = (lib.notes.get(b.id) || []).slice()
      .sort((x, y) => x.chapter - y.chapter || x.start.verse - y.start.verse || x.start.word - y.start.word);
    const close = () => { page.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const go = (n) => { close(); show(n.chapter, { block: n.start.verse }); };
    const list = h('div', { class: 'toc-list b-notes-list' }, ...(notes.length
      ? notes.map((n) => { const card = noteCard(n, { title: book.chapterTitle(n.chapter) || `Chapter ${n.chapter + 1}`, onClick: () => go(n),
        onEdit: () => { close(); noteEditor(n); }, onDelete: () => confirmDeleteNote(n, () => card.remove()) }); return card; })
      : [h('p', { class: 'empty-inline' }, 'No highlights or notes in this book yet. Hold a word to select text, then pick a colour or Note.')]));
    const page = h('div', { class: 'toc-page', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notes' },
      h('header', { class: 'toc-head' },
        h('button', { class: 'icon-btn toc-close', type: 'button', 'aria-label': 'Back to the book', title: 'Back to the book', onclick: close }, svg(ICONS.back)),
        h('h2', {}, 'Notes'), h('span', { class: 'toc-title' }, notes.length ? `${notes.length} in ${b.title}` : b.title)),
      list);
    document.body.append(page);
    document.addEventListener('keydown', onKey);
    page.querySelector('.toc-close').focus();
  };
  // The contents as a full page over the book; the current chapter is marked and scrolled into view.
  const showContents = () => {
    document.querySelector('.toc-page')?.remove();
    const entries = book.toc.length ? book.toc : book.chapters.map((_, i) => ({ label: book.chapterTitle(i) || `Section ${i + 1}`, chapter: i, depth: 0 }));
    // The entry for where the reader is: the last one at or before the current chapter.
    const here = entries.reduce((best, t, i) => (t.chapter <= chapter ? i : best), 0);
    const close = () => { page.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const list = h('div', { class: 'toc-list' }, ...entries.map((t, i) => h('button', {
      class: 'toc-item' + (i === here ? ' current' : ''), 'aria-current': i === here ? 'true' : null,
      style: `padding-left:${16 + Math.min(t.depth, 4) * 18}px`, onclick: () => { close(); show(t.chapter, { anchor: t.anchor }); } }, t.label)));
    const page = h('div', { class: 'toc-page', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Contents' },
      h('header', { class: 'toc-head' },
        h('button', { class: 'icon-btn toc-close', type: 'button', 'aria-label': 'Back to the book', title: 'Back to the book', onclick: close }, svg(ICONS.back)),
        h('h2', {}, 'Contents'), h('span', { class: 'toc-title' }, b.title)),
      list);
    document.body.append(page);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => { list.querySelector('.current')?.scrollIntoView({ block: 'center' }); page.querySelector('.toc-close').focus(); });
  };

  // Links inside the book go to their chapter (and place on the page).
  body.addEventListener('click', (e) => {
    const link = e.target.closest('.bk-link');
    if (!link || state.selection) return;
    const i = book.chapters.findIndex((c) => c.href === link.dataset.file);
    if (i >= 0) show(i, { anchor: link.dataset.anchor });
  });
  // Bars slide away while reading; a tap brings them back.
  let lastTop = 0, touched = false;
  for (const ev of ['pointerdown', 'wheel', 'keydown']) scroller.addEventListener(ev, () => { touched = true; }, { passive: true });
  scroller.addEventListener('scroll', () => {
    const top = scroller.scrollTop;
    if (state.selection) { positionHandles(); positionToolbar(); }
    if (touched && top > lastTop + 6 && top > 60 && !state.selection) { setBars(false); sizePanel.hidden = true; sizeBtn.setAttribute('aria-expanded', 'false'); }
    lastTop = top;
    saveBookPosition();
  }, { passive: true });
  scroller.addEventListener('click', (e) => {
    if (body.contains(e.target) || e.target.closest('button, a, .bk-link')) return; // taps on the text are handled with the selection
    const show = document.body.classList.contains('bars-hidden');
    setBars(show);
    if (!show) { sizePanel.hidden = true; sizeBtn.setAttribute('aria-expanded', 'false'); }
  });
  enableChapterSwipe(scroller, body, (dir) => {
    const to = chapter + dir;
    if (to < 0 || to >= book.chapters.length) { toast(dir > 0 ? 'This is the end of the book.' : 'This is the beginning of the book.'); return; }
    show(to, { slide: dir });
  });
  show(chapter, { frac: b.position?.frac || 0 });
}
/* ----- Selecting text in a book ----- */
// Blocks are the page's paragraphs, headings, list items…; a place in the book is (chapter, block, word).
const BOOK_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, td, th, figcaption, pre, caption';
function indexBookBlocks(body) {
  const all = [...body.querySelectorAll(BOOK_BLOCKS)].filter((el) => !el.closest('.b-nav'));
  lib.blocks = all.filter((el) => !el.querySelector(BOOK_BLOCKS)); // innermost only
  lib.blocks.forEach((el, i) => { el.dataset.blk = i + 1; });
}
const bookBlockAt = (el) => el?.closest?.('[data-blk]');
// Split a block's text into selectable words, keeping its formatting and links (Chinese: one character each).
function wrapBookBlock(blk) {
  if (!blk || blk.dataset.wrapped) return;
  blk.dataset.wrapped = '1';
  const v = +blk.dataset.blk;
  let w = -1;
  const walker = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    for (const [tok] of t.nodeValue.matchAll(COMMENTARY_TOKENS)) {
      if (/^\s/.test(tok)) frag.append(w < 0 ? document.createTextNode(tok) : h('span', { class: 'g', dataset: { v, w } }, tok));
      else frag.append(h('span', { class: 'w', dataset: { v, w: ++w } }, tok));
    }
    t.replaceWith(frag);
  }
  reader.words = []; reader.gaps = [];
  for (const el of reader.body.querySelectorAll('[data-wrapped] .w, [data-wrapped] .g')) (el.classList.contains('w') ? reader.words : reader.gaps).push({ v: +el.dataset.v, w: +el.dataset.w, el });
}
const bookChapterNotes = () => (lib.notes.get(lib.current?.id) || []).filter((n) => n.chapter === lib.chapter).sort((a, b) => a.createdAt - b.createdAt);
function saveBookNote(n) {
  n.updatedAt = Date.now(); n.createdAt ??= n.updatedAt;
  const list = lib.notes.get(n.lib) || [];
  lib.notes.set(n.lib, [...list.filter((x) => x.id !== n.id), n]);
  api('PUT', `/api/library-notes/${n.id}`, n).catch((e) => toast(e instanceof OfflineError ? "You're offline: this note wasn't saved." : `Couldn't save the note: ${e.message}`));
}
function deleteBookNote(id) {
  for (const [k, list] of lib.notes) lib.notes.set(k, list.filter((x) => x.id !== id));
  api('DELETE', `/api/library-notes/${id}`).catch(() => toast("Couldn't delete the note. Try again when you're connected."));
}
function showBookToolbar() {
  const { start, end } = state.selection;
  const draft = (color) => ({ id: newId(), lib: lib.current.id, chapter: lib.chapter, start: { verse: start.v, word: start.w }, end: { verse: end.v, word: end.w },
    color, quote: selectedQuote().slice(0, 4000), body: '' });
  const bar = h('div', { class: 'sel-toolbar', role: 'toolbar', 'aria-label': 'Selection actions' },
    h('div', { class: 'row' }, ...COLORS.map((c) => h('button', { class: 'swatch', dataset: { c }, 'aria-label': `Highlight ${c}`, onclick: () => {
      saveBookNote(draft(c)); clearSelection(); toast('Highlighted');
    } })),
    h('span', { class: 'sel-divider', 'aria-hidden': 'true' }),
    bubbleBtn('Note', ICONS.notes, () => noteEditor(draft('yellow'), { isNew: true })),
    bubbleBtn('Copy', ICONS.copy, async () => {
      try { await navigator.clipboard.writeText(selectedQuote()); toast('Copied'); } catch { toast("Couldn't copy"); }
      clearSelection();
    }),
    bubbleBtn('Dictionary', ICONS.dictionary, (e) => toggleDictionary(bar, e.currentTarget), 'dict-btn')));
  reader.toolbar = bar;
  document.body.append(bar);
  positionToolbar();
}

// Remember where the reader is, on the server (so other devices open there too).
function saveBookPosition(now) {
  const b = lib.current;
  if (!b || !lib.where) return;
  const pct = document.querySelector('.b-progress span:last-child');
  if (pct) pct.textContent = `${(lib.where().progress * 100).toFixed(1).replace(/\.0$/, '')}%`;
  clearTimeout(lib.saveTimer);
  const go = () => {
    const pos = lib.where();
    b.position = pos;
    api('PUT', `/api/library/${b.id}`, { position: pos }).catch(() => {});
  };
  if (now) go(); else lib.saveTimer = setTimeout(go, 1500);
}

/* ---------------- shell ---------------- */
let navEl;
function mount(screen) {
  $app.replaceChildren(screen, navEl);
}
function buildNav() {
  const item = (tab, label) => h('button', { 'aria-current': state.tab === tab || (tab === 'read' && state.tab === 'commentary') || (tab === 'books' && state.tab === 'book') ? 'page' : null, dataset: { tab },
    onclick: () => {
      if (state.tab === tab && tab === 'read') return;
      if (state.tab === 'book') saveBookPosition(true);
      clearSelection(); state.tab = tab; render(); window.scrollTo(0, 0); // re-tapping Notes/Books/Friends refreshes
    } },
  h('span', { class: 'icon badge' }, svg(ICONS[tab])), label);
  navEl = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' }, item('read', 'Read'), item('notes', 'Notes'), item('books', 'Books'), item('friends', 'Friends'));
}
function updateBadge() {
  const b = navEl?.querySelector('[data-tab="friends"] .badge');
  const n = state.friends?.incoming.length || 0;
  if (b) { if (n) b.dataset.count = n; else delete b.dataset.count; }
}
function rerender() { if (state.tab === 'read' || state.tab === 'book') paint(); else if (state.tab !== 'commentary') render(); }
// The part of the Bible text not covered by the top and bottom bars.
function visibleTextArea() {
  const box = reader.scroller?.getBoundingClientRect();
  if (!box) return null;
  if (document.body.classList.contains('bars-hidden')) return { top: box.top, bottom: box.bottom };
  const head = document.querySelector({ commentary: '.c-head', book: '.b-topbar' }[reader.mode] || '.r-head')?.getBoundingClientRect();
  const nav = (reader.mode === 'book' ? document.querySelector('.b-toolbar') : navEl)?.getBoundingClientRect();
  return { top: head ? head.bottom : box.top, bottom: nav ? Math.min(box.bottom, nav.top) : box.bottom };
}

// Top and bottom bars on the Read page slide away while reading (body.bars-hidden).
function setBars(visible) { document.body.classList.toggle('bars-hidden', !visible); }

async function render() {
  if (state.tab !== 'read') setBars(true);
  document.body.classList.toggle('book-mode', state.tab === 'book'); // the book reader is full screen
  buildNav();
  updateBadge();
  if (state.tab === 'read') return renderReader();
  if (state.tab === 'commentary') return renderCommentaryPage();
  if (state.tab === 'notes') return renderNotes();
  if (state.tab === 'books') return renderLibrary();
  if (state.tab === 'book') return renderBookReader();
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

// Long-press any icon-only button to see what it does (its accessible name), without pressing it.
const ICON_BUTTONS = '.side-btn, .side-tab, .swatch, .icon-btn, .to-top, .size-btn, .bubble-btn';
{
  let timer = null, target = null, fired = null;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.(ICON_BUTTONS);
    clearTimeout(timer);
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) { target = null; return; }
    target = el;
    timer = setTimeout(() => {
      const name = el.getAttribute('aria-label') || el.title || el.dataset.c;
      if (!name) return;
      fired = el;
      navigator.vibrate?.(8);
      tipAt(el, name.charAt(0).toUpperCase() + name.slice(1));
    }, 450);
  }, true);
  const cancel = () => clearTimeout(timer);
  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('pointermove', (e) => { if (target && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); }, true);
  // The long press shouldn't also press the button.
  document.addEventListener('click', (e) => {
    if (fired && fired.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); }
    fired = null;
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.(ICON_BUTTONS)) e.preventDefault(); }, true);
}

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
