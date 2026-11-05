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
  h('div', { class: 'card-head' }, h('span', {}, ref(n)), friend ? h('span', { class: 'who' }, nameOf(n.author.id)) : null),
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
        !isNew ? confirmButton('Delete', 'Tap again to delete', () => {
          deleteNote(note.id); close(); rerender(); toast('Note deleted');
        }) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'text-btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'filled-btn', type: 'button', onclick: () => {
          if (!canSave()) return;
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
  } });
  const screen = h('main', { class: 'screen' },
    h('h1', {}, `${meta.name} ${chapter}`),
    h('nav', { class: 'chapter-nav', 'aria-label': 'Chapter navigation' },
      h('button', { class: 'text-btn', disabled: !prev, onclick: () => goTo(prev) }, 'Previous'),
      h('button', { class: 'chapter-pill', onclick: openPicker, 'aria-label': 'Choose book and chapter' }, `${meta.name} ${chapter}`),
      h('button', { class: 'text-btn', disabled: !next, onclick: () => goTo(next) }, 'Next')),
    h('p', { class: 'hint' }, 'Hold a word to select. Drag the handles to adjust.'),
    h('div', { class: 'switch-row' }, h('label', { for: 'show-friends' }, "Show friends' notes"), sw),
    h('div', { id: 'status-slot' }),
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
  const mine = Object.values(state.myNotes).filter((n) => n.book === book && n.chapter === chapter)
    .sort((a, b) => a.createdAt - b.createdAt);
  const friends = state.showFriends ? friendNotes().filter((n) => n.book === book && n.chapter === chapter) : [];
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
  for (const n of friends) { const nm = nameOf(n.author.id); addMark(n, `f-${n.color}`, `Note from ${nm}`, nm[0].toUpperCase()); }
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
    ...COLORS.map((c) => h('button', { class: 'swatch', dataset: { c }, 'aria-label': `Highlight ${c}`, onclick: () => {
      if (!canSave()) return;
      saveNote(draft(c)); clearSelection(); toast('Highlighted');
    } })),
    h('span', { class: 'sep' }),
    h('button', { class: 'text-btn', onclick: () => noteEditor(draft('yellow'), { isNew: true }) }, 'Note'),
    h('button', { class: 'text-btn', onclick: async () => {
      const text = `${selectedQuote()} — ${ref(draft('yellow'))} (WEB)`;
      try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast("Couldn't copy"); }
      clearSelection();
    } }, 'Copy'));
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
