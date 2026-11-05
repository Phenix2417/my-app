/* ---------------- books ---------------- */
const BOOKS = [
  ['genesis', 'Genesis', 50], ['exodus', 'Exodus', 40], ['leviticus', 'Leviticus', 27], ['numbers', 'Numbers', 36],
  ['deuteronomy', 'Deuteronomy', 34], ['joshua', 'Joshua', 24], ['judges', 'Judges', 21], ['ruth', 'Ruth', 4],
  ['1samuel', '1 Samuel', 31], ['2samuel', '2 Samuel', 24], ['1kings', '1 Kings', 22], ['2kings', '2 Kings', 25],
  ['1chronicles', '1 Chronicles', 29], ['2chronicles', '2 Chronicles', 36], ['ezra', 'Ezra', 10], ['nehemiah', 'Nehemiah', 13],
  ['esther', 'Esther', 10], ['job', 'Job', 42], ['psalms', 'Psalms', 150], ['proverbs', 'Proverbs', 31],
  ['ecclesiastes', 'Ecclesiastes', 12], ['songofsolomon', 'Song of Solomon', 8], ['isaiah', 'Isaiah', 66], ['jeremiah', 'Jeremiah', 52],
  ['lamentations', 'Lamentations', 5], ['ezekiel', 'Ezekiel', 48], ['daniel', 'Daniel', 12], ['hosea', 'Hosea', 14],
  ['joel', 'Joel', 3], ['amos', 'Amos', 9], ['obadiah', 'Obadiah', 1], ['jonah', 'Jonah', 4], ['micah', 'Micah', 7],
  ['nahum', 'Nahum', 3], ['habakkuk', 'Habakkuk', 3], ['zephaniah', 'Zephaniah', 3], ['haggai', 'Haggai', 2],
  ['zechariah', 'Zechariah', 14], ['malachi', 'Malachi', 4],
  ['matthew', 'Matthew', 28], ['mark', 'Mark', 16], ['luke', 'Luke', 24], ['john', 'John', 21], ['acts', 'Acts', 28],
  ['romans', 'Romans', 16], ['1corinthians', '1 Corinthians', 16], ['2corinthians', '2 Corinthians', 13],
  ['galatians', 'Galatians', 6], ['ephesians', 'Ephesians', 6], ['philippians', 'Philippians', 4], ['colossians', 'Colossians', 4],
  ['1thessalonians', '1 Thessalonians', 5], ['2thessalonians', '2 Thessalonians', 3], ['1timothy', '1 Timothy', 6],
  ['2timothy', '2 Timothy', 4], ['titus', 'Titus', 3], ['philemon', 'Philemon', 1], ['hebrews', 'Hebrews', 13],
  ['james', 'James', 5], ['1peter', '1 Peter', 5], ['2peter', '2 Peter', 3], ['1john', '1 John', 5], ['2john', '2 John', 1],
  ['3john', '3 John', 1], ['jude', 'Jude', 1], ['revelation', 'Revelation', 22],
].map(([id, name, chapters]) => ({ id, name, chapters }));

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
const LONG_PRESS_MS = 400;
const $app = document.getElementById('app');

/* ---------------- state ---------------- */
const state = {
  tab: 'read',
  books: BOOKS,
  pos: store.get('pos', { book: 'john', chapter: 1 }),
  showFriends: store.get('showFriends', true),
  fontSize: store.get('fontSize', 22),
  notesTab: 'mine',
  status: 'loading', // loading | ready | slow | unavailable | noid
  readOnly: false, // this viewer can't write (view-only access)
  me: null,
  members: new Map(), // id -> member doc {friends, shareWith, declined, nickname, joinedAt}
  myNotes: {}, // id -> note (from my private storage)
  friendShared: new Map(), // friend id -> notes[]
  names: {}, // id -> display name from claude.ai profile
  selection: null,
};

/*
 * Storage layout (claude.ai artifact database):
 *   data/users/<me>/<noteId>       my notes — private to me, nobody else can read them
 *   members/<me>                   {friends:[ids I added], shareWith:[ids], declined:[ids], nickname}
 *   shared/<me>/notes/<noteId>     copies of my notes, kept only while I share with at least one friend
 * Two people are friends when each has added the other. A friend's shared notes are shown only when
 * you are friends and they switched "Can see my notes" on for you.
 */
let db = null, user = null;
let writes = Promise.resolve();
const queueWrite = (fn) => { writes = writes.then(fn).catch(onWriteError); return writes; };
function onWriteError(e) {
  if (e?.code === 'invalid_argument' || e?.code === 'not_granted') {
    state.readOnly = true;
    toast("You can read here but not save. Ask the owner to give you edit access.");
  } else if (e?.code === 'quota_exceeded') toast('Storage is full. Delete some notes, then try again.');
  else toast("Couldn't save. Check your connection and try again.");
  rerender();
}
function canSave() {
  if (state.status === 'ready' && !state.readOnly) return true;
  toast(state.readOnly ? 'You have view-only access, so notes can’t be saved.' : 'Still connecting. Try again in a moment.');
  return false;
}

const myMember = () => state.members.get(state.me) || { friends: [], shareWith: [], declined: [] };
const isSharing = () => (myMember().shareWith || []).length > 0;
const areFriends = (id) => (myMember().friends || []).includes(id) && (state.members.get(id)?.friends || []).includes(state.me);
const sharesWithMe = (id) => areFriends(id) && (state.members.get(id)?.shareWith || []).includes(state.me);
const nameOf = (id) => (id === state.me ? 'You' : state.names[id] || state.members.get(id)?.nickname || 'Someone');

function friendNotes() {
  const out = [];
  for (const [fid, notes] of state.friendShared) if (sharesWithMe(fid)) out.push(...notes);
  return out;
}

async function connect() {
  [user, db] = await Promise.all([claude.use('user'), claude.use('db')]);
  if (!db || !user) { state.status = 'unavailable'; return rerender(); }
  state.me = await user.id();
  if (!state.me) { state.status = 'noid'; return rerender(); }
  if ((await user.can('data.write')) === false) state.readOnly = true;

  const slow = setTimeout(() => { if (state.status === 'loading') { state.status = 'slow'; rerender(); } }, 10000);
  let gotMembers = false, gotNotes = false;
  const maybeReady = () => {
    if (gotMembers && gotNotes && state.status !== 'ready') { clearTimeout(slow); state.status = 'ready'; rerender(); }
  };

  db.collection('data/users/' + state.me).onSnapshot((snap) => {
    const notes = {};
    for (const d of snap.docs) { const n = d.data(); if (n?.book) notes[d.id] = { ...n, id: d.id }; }
    state.myNotes = notes;
    if (!snap.metadata.fromCache) gotNotes = true;
    maybeReady();
    rerender(true);
  }, () => { gotNotes = true; maybeReady(); });

  db.collection('members').onSnapshot((snap) => {
    state.members = new Map(snap.docs.map((d) => [d.id, d.data()]));
    if (!snap.metadata.fromCache) {
      gotMembers = true;
      if (!state.members.has(state.me) && !state.readOnly) {
        queueWrite(() => db.doc('members/' + state.me).set({ friends: [], shareWith: [], declined: [], nickname: '', joinedAt: Date.now() }));
      }
    }
    syncFriendSubscriptions();
    resolveNames();
    maybeReady();
    rerender(true);
  }, () => { gotMembers = true; maybeReady(); });
}

// Listen to the shared notes of each friend who shares with me; stop when they no longer do.
const friendSubs = new Map();
function syncFriendSubscriptions() {
  const want = new Set([...state.members.keys()].filter((id) => id !== state.me && sharesWithMe(id)));
  for (const [id, unsub] of friendSubs) if (!want.has(id)) { unsub(); friendSubs.delete(id); state.friendShared.delete(id); }
  for (const id of want) {
    if (friendSubs.has(id) || friendSubs.size >= 50) continue;
    friendSubs.set(id, db.collection(`shared/${id}/notes`).onSnapshot((snap) => {
      state.friendShared.set(id, snap.docs.map((d) => ({ ...d.data(), id: d.id, author: { id } })).filter((n) => n.book));
      rerender(true);
    }, () => {}));
  }
}

async function resolveNames() {
  const ids = [...state.members.keys()];
  if (!ids.length) return;
  const ps = await user.profiles(ids);
  let changed = false;
  for (const id of ids) if (ps[id]?.name && state.names[id] !== ps[id].name) { state.names[id] = ps[id].name; changed = true; }
  if (changed) rerender(true);
}

function updateMe(patch) {
  const next = { ...myMember(), ...patch };
  state.members.set(state.me, next); // show it right away
  return queueWrite(() => db.doc('members/' + state.me).set(next));
}

function saveNote(n) {
  const now = Date.now();
  const note = { ...n, createdAt: n.createdAt || now, updatedAt: now };
  delete note.author;
  state.myNotes[note.id] = note;
  const { id, ...body } = note;
  queueWrite(async () => {
    await db.collection('data/users/' + state.me).doc(id).set(body);
    if (isSharing()) await db.doc(`shared/${state.me}/notes/${id}`).set(body);
  });
}

function deleteNote(id) {
  delete state.myNotes[id];
  queueWrite(async () => {
    await db.collection('data/users/' + state.me).doc(id).delete();
    await db.doc(`shared/${state.me}/notes/${id}`).delete();
  });
}

// Turning sharing on copies my notes to the shared area; turning it off for everyone removes the copies.
async function setSharing(friendId, enabled) {
  const before = isSharing();
  const shareWith = new Set(myMember().shareWith || []);
  if (enabled) shareWith.add(friendId); else shareWith.delete(friendId);
  await updateMe({ shareWith: [...shareWith] });
  const after = isSharing();
  if (!before && after) {
    queueWrite(async () => {
      for (const [id, n] of Object.entries(state.myNotes)) { const { id: _, ...body } = n; await db.doc(`shared/${state.me}/notes/${id}`).set(body); }
    });
  } else if (before && !after) await unshareAll();
}
function unshareAll() {
  return queueWrite(async () => {
    const snap = await db.collection(`shared/${state.me}/notes`).get();
    for (const d of snap.docs) await db.doc(`shared/${state.me}/notes/${d.id}`).delete();
  });
}

/* ---------------- Bible text ---------------- */
const bookCache = new Map();
async function loadBooks() { return BOOKS; }
async function loadBook(id) {
  if (!bookCache.has(id)) {
    const p = fetch(`bible/${id}.json`).then((r) => { if (!r.ok) throw new Error('missing'); return r.json(); });
    bookCache.set(id, p);
    p.catch(() => bookCache.delete(id));
  }
  return bookCache.get(id);
}
const bookName = (id) => BOOKS.find((b) => b.id === id)?.name || id;
const splitWords = (t) => t.split(/\s+/).filter(Boolean);
function ref(n) {
  const b = bookName(n.book);
  if (n.start.verse === n.end.verse) return `${b} ${n.chapter}:${n.start.verse}`;
  return `${b} ${n.chapter}:${n.start.verse}–${n.end.verse}`;
}

// A two-tap button for destructive actions (the viewer blocks confirm() dialogs).
function confirmButton(label, armedLabel, onConfirm, cls = 'text-btn danger') {
  let armed = false, timer;
  const b = h('button', { class: cls, type: 'button', onclick: (e) => {
    e.stopPropagation();
    if (armed) { clearTimeout(timer); onConfirm(); return; }
    armed = true; b.textContent = armedLabel;
    timer = setTimeout(() => { armed = false; b.textContent = label; }, 3000);
  } }, label);
  return b;
}
