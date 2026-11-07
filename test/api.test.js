import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createServer, seedTestUsers } from '../server/app.js';

let server, base;
before(async () => {
  server = createServer(openDb(':memory:'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const note = (over = {}) => ({
  book: 'john', chapter: 1, start: { verse: 1, word: 0 }, end: { verse: 1, word: 3 },
  color: 'yellow', quote: 'In the beginning was', body: 'Creation echo', ...over,
});

test('friends only see notes after the owner allows it', async () => {
  const alice = (await api('POST', '/api/register', { body: { username: 'alice', password: 'password1' } })).data;
  const james = (await api('POST', '/api/register', { body: { username: 'james', password: 'password2' } })).data;
  assert.ok(alice.token && james.token);

  assert.equal((await api('PUT', '/api/notes/note-alice-1', { token: alice.token, body: note() })).status, 200);

  // Not friends yet: nothing visible, and sharing can't be enabled.
  let fn = await api('GET', '/api/friends/notes?book=john&chapter=1', { token: james.token });
  assert.deepEqual(fn.data.notes, []);
  assert.equal((await api('PUT', `/api/friends/${james.user.id}/sharing`, { token: alice.token, body: { enabled: true } })).status, 404);

  // Request + accept.
  let r = await api('POST', '/api/friends/requests', { token: alice.token, body: { username: '@James' } });
  assert.equal(r.data.outgoing[0].username, 'james');
  r = await api('GET', '/api/friends', { token: james.token });
  assert.equal(r.data.incoming[0].username, 'alice');
  r = await api('POST', `/api/friends/${alice.user.id}/accept`, { token: james.token });
  assert.deepEqual(r.data.friends, [{ id: alice.user.id, username: 'alice', displayName: 'alice', sharing: false, sharesWithMe: false, unread: 0 }]);

  // Friends can message each other; unread messages are counted until the conversation is opened.
  assert.equal((await api('POST', `/api/messages/${alice.user.id}`, { token: james.token, body: { body: '  Where did you get your ESV?  ' } })).status, 201);
  assert.equal((await api('POST', `/api/messages/${alice.user.id}`, { token: james.token, body: { body: '   ' } })).status, 400);
  assert.equal((await api('GET', '/api/friends', { token: alice.token })).data.friends[0].unread, 1);
  let conv = await api('GET', `/api/messages/${james.user.id}`, { token: alice.token });
  assert.deepEqual(conv.data.messages.map((m) => [m.mine, m.body]), [[false, 'Where did you get your ESV?']]);
  assert.equal((await api('GET', '/api/friends', { token: alice.token })).data.friends[0].unread, 0);
  await api('POST', `/api/messages/${james.user.id}`, { token: alice.token, body: { body: 'From the publisher’s site.' } });
  conv = await api('GET', `/api/messages/${alice.user.id}`, { token: james.token });
  assert.deepEqual(conv.data.messages.map((m) => [m.mine, m.body]), [[true, 'Where did you get your ESV?'], [false, 'From the publisher’s site.']]);

  // Friends but sharing off: still hidden.
  fn = await api('GET', '/api/friends/notes?book=john&chapter=1', { token: james.token });
  assert.deepEqual(fn.data.notes, []);

  // Alice allows James.
  r = await api('PUT', `/api/friends/${james.user.id}/sharing`, { token: alice.token, body: { enabled: true } });
  assert.equal(r.data.friends[0].sharing, true);
  fn = await api('GET', '/api/friends/notes?book=john&chapter=1', { token: james.token });
  assert.equal(fn.data.notes.length, 1);
  assert.equal(fn.data.notes[0].author.username, 'alice');
  assert.equal(fn.data.notes[0].body, 'Creation echo');
  assert.equal((await api('GET', '/api/friends', { token: james.token })).data.friends[0].sharesWithMe, true);

  // Alice's own view doesn't include James's (he hasn't shared).
  await api('PUT', '/api/notes/note-james-1', { token: james.token, body: note({ color: 'blue' }) });
  assert.deepEqual((await api('GET', '/api/friends/notes', { token: alice.token })).data.notes, []);

  // James can't edit or delete Alice's note.
  assert.equal((await api('PUT', '/api/notes/note-alice-1', { token: james.token, body: note() })).status, 404);
  await api('DELETE', '/api/notes/note-alice-1', { token: james.token });
  assert.equal((await api('GET', '/api/notes', { token: alice.token })).data.notes.length, 1);

  // Unfriending removes access, to notes and to messages.
  await api('DELETE', `/api/friends/${alice.user.id}`, { token: james.token });
  fn = await api('GET', '/api/friends/notes', { token: james.token });
  assert.deepEqual(fn.data.notes, []);
  assert.equal((await api('POST', `/api/messages/${alice.user.id}`, { token: james.token, body: { body: 'hi' } })).status, 404);
  assert.equal((await api('GET', `/api/messages/${alice.user.id}`, { token: james.token })).status, 404);
});

test('validation and auth', async () => {
  assert.equal((await api('GET', '/api/notes')).status, 401);
  assert.equal((await api('POST', '/api/register', { body: { username: 'x', password: 'password1' } })).status, 400);
  assert.equal((await api('POST', '/api/login', { body: { username: 'alice', password: 'nope' } })).status, 401);
  const { token } = (await api('POST', '/api/login', { body: { username: 'ALICE', password: 'password1' } })).data;
  assert.ok(token);
  assert.equal((await api('PUT', '/api/notes/abcdefgh', { token, body: note({ color: 'red' }) })).status, 400);
  assert.equal((await api('PUT', '/api/notes/abcdefgh', { token, body: note({ chapter: 99 }) })).status, 400);
  await api('POST', '/api/logout', { token });
  assert.equal((await api('GET', '/api/me', { token })).status, 401);
});

test('display names can be in any language and are separate from usernames', async () => {
  const xm = (await api('POST', '/api/register', { body: { username: 'xiaoming', password: 'password1', displayName: '  小明​  ' } })).data;
  assert.deepEqual(xm.user, { id: xm.user.id, username: 'xiaoming', displayName: '小明', commentaries: null });
  const jo = (await api('POST', '/api/register', { body: { username: 'jose_1', password: 'password1' } })).data;
  assert.equal(jo.user.displayName, 'jose_1'); // falls back to the username

  // Friends are still added by username, and see each other's display name.
  await api('POST', '/api/friends/requests', { token: jo.token, body: { username: 'xiaoming' } });
  let r = await api('POST', `/api/friends/${jo.user.id}/accept`, { token: xm.token });
  assert.equal(r.data.friends[0].displayName, 'jose_1');

  r = await api('PUT', '/api/me', { token: jo.token, body: { displayName: 'José 🙏' } });
  assert.equal(r.data.user.displayName, 'José 🙏');
  assert.equal(r.data.user.username, 'jose_1');
  assert.equal((await api('GET', '/api/friends', { token: xm.token })).data.friends[0].displayName, 'José 🙏');

  await api('PUT', `/api/friends/${xm.user.id}/sharing`, { token: jo.token, body: { enabled: true } });
  await api('PUT', '/api/notes/note-jose-1', { token: jo.token, body: note() });
  const fn = await api('GET', '/api/friends/notes', { token: xm.token });
  assert.deepEqual(fn.data.notes[0].author, { id: jo.user.id, username: 'jose_1', displayName: 'José 🙏' });

  // 40 characters max, counted as characters (so CJK names get the same room); clearing falls back to username.
  assert.equal((await api('PUT', '/api/me', { token: jo.token, body: { displayName: '字'.repeat(40) } })).status, 200);
  assert.equal((await api('PUT', '/api/me', { token: jo.token, body: { displayName: '字'.repeat(41) } })).status, 400);
  assert.equal((await api('PUT', '/api/me', { token: jo.token, body: { displayName: '' } })).data.user.displayName, 'jose_1');
});

test('each person keeps their own ordered commentary list', async () => {
  const { token } = (await api('POST', '/api/register', { body: { username: 'lister', password: 'password1' } })).data;
  assert.equal((await api('GET', '/api/me', { token })).data.user.commentaries, null); // not customised yet
  let r = await api('PUT', '/api/me', { token, body: { commentaries: ['fhl-zh-hans', 'matthew-henry', 'tsk', 'fhl-zh-hans'] } });
  assert.deepEqual(r.data.user.commentaries, ['fhl-zh-hans', 'matthew-henry', 'tsk']); // duplicates dropped
  assert.equal(r.data.user.displayName, 'lister', 'other fields untouched');
  assert.equal((await api('PUT', '/api/me', { token, body: { commentaries: ['not-a-commentary'] } })).status, 400);
  r = await api('PUT', '/api/me', { token, body: { commentaries: [] } });
  assert.deepEqual(r.data.user.commentaries, []);
  // Changing the display name leaves the list alone.
  r = await api('PUT', '/api/me', { token, body: { displayName: '读者' } });
  assert.deepEqual(r.data.user.commentaries, []);
});

test('test accounts are created once, as friends who share notes', async () => {
  const db = openDb(':memory:');
  const users = [{ username: 'phenix', password: 'xqq888999', displayName: 'Phenix' }, { username: 'james', password: 'xqq888999' }];
  assert.deepEqual(seedTestUsers(db, users), ['phenix', 'james']);
  assert.deepEqual(seedTestUsers(db, users), [], 'second start creates nothing');
  const srv = createServer(db);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const call = async (method, path, token, body) => (await fetch(`http://127.0.0.1:${srv.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })).json();
  try {
    const p = await call('POST', '/api/login', null, { username: 'phenix', password: 'xqq888999' });
    assert.equal(p.user.displayName, 'Phenix');
    const f = await call('GET', '/api/friends', p.token);
    assert.deepEqual(f.friends.map((x) => [x.username, x.sharing, x.sharesWithMe]), [['james', true, true]]);
  } finally { srv.close(); }
});

test('chats: private and group conversations, shared verses, unread counts', async () => {
  const reg = async (u) => (await api('POST', '/api/register', { body: { username: u, password: 'password1' } })).data;
  const [wang, li, chen, stranger] = [await reg('wang'), await reg('li_s'), await reg('chen'), await reg('stranger')];
  const befriend = async (a, b) => { await api('POST', '/api/friends/requests', { token: a.token, body: { username: b.user.username } }); await api('POST', `/api/friends/${a.user.id}/accept`, { token: b.token }); };
  await befriend(wang, li); await befriend(wang, chen);

  // A group of friends; a stranger can't be added.
  assert.equal((await api('POST', '/api/groups', { token: wang.token, body: { name: '周三查经小组', members: [li.user.id, stranger.user.id] } })).status, 404);
  const { group } = (await api('POST', '/api/groups', { token: wang.token, body: { name: '  周三查经小组 ', members: [li.user.id, chen.user.id] } })).data;
  assert.equal(group.name, '周三查经小组');
  assert.deepEqual(group.members.map((m) => m.username), ['wang', 'li_s', 'chen']);
  assert.equal((await api('GET', `/api/groups/${group.id}`, { token: stranger.token })).status, 404);

  // A shared verse in the group, and a plain message.
  const verse = { book: 'psalms', chapter: 23, start: 4, end: 4, version: 'web', text: 'Even though I walk through the valley…' };
  assert.equal((await api('POST', `/api/groups/${group.id}/messages`, { token: li.token, body: { ref: { ...verse, book: 'nope' } } })).status, 400);
  assert.equal((await api('POST', `/api/groups/${group.id}/messages`, { token: li.token, body: { ref: verse } })).status, 201);
  await api('POST', `/api/groups/${group.id}/messages`, { token: wang.token, body: { body: '阿们！' } });

  let chats = (await api('GET', '/api/chats', { token: chen.token })).data.chats;
  const g = chats.find((c) => c.kind === 'group');
  assert.deepEqual([g.name, g.members, g.unread, g.last.body, g.last.from.username], ['周三查经小组', 3, 2, '阿们！', 'wang']);
  const msgs = (await api('GET', `/api/groups/${group.id}/messages`, { token: chen.token })).data.messages;
  assert.deepEqual(msgs.map((m) => [m.from.username, m.ref?.chapter ?? m.body]), [['li_s', 23], ['wang', '阿们！']]);
  assert.equal((await api('GET', '/api/chats', { token: chen.token })).data.chats.find((c) => c.kind === 'group').unread, 0);

  // Private chats are listed too (newest first), with verses.
  await api('POST', `/api/messages/${chen.user.id}`, { token: wang.token, body: { ref: verse } });
  chats = (await api('GET', '/api/chats', { token: chen.token })).data.chats;
  assert.deepEqual([chats[0].kind, chats[0].user.username, chats[0].unread, chats[0].last.verse.start], ['friend', 'wang', 1, 4]);

  // Renaming, leaving; the last one out removes the group.
  assert.equal((await api('PUT', `/api/groups/${group.id}`, { token: chen.token, body: { name: '查经小组' } })).data.group.name, '查经小组');
  for (const u of [chen, li, wang]) await api('DELETE', `/api/groups/${group.id}/members/me`, { token: u.token });
  assert.equal((await api('GET', '/api/chats', { token: wang.token })).data.chats.filter((c) => c.kind === 'group').length, 0);
});

test('a shared verse can carry two versions, each with its name', async () => {
  const reg = async (u) => (await api('POST', '/api/register', { body: { username: u, password: 'password1' } })).data;
  const a = await reg('pair_a'), b = await reg('pair_b');
  await api('POST', '/api/friends/requests', { token: a.token, body: { username: 'pair_b' } });
  await api('POST', `/api/friends/${a.user.id}/accept`, { token: b.token });
  const ref = { book: 'galatians', chapter: 4, start: 2, end: 3, version: 'uX1234567', label: 'ESV', text: 'but he is under guardians',
    alt: { version: 'uY1234567', label: '和合本', text: '乃在师傅和管家的手下' } };
  await api('POST', `/api/messages/${b.user.id}`, { token: a.token, body: { ref } });
  await api('POST', `/api/messages/${b.user.id}`, { token: a.token, body: { ref: { ...ref, kind: 'note' }, body: 'My note' } });
  const [m, n] = (await api('GET', `/api/messages/${a.user.id}`, { token: b.token })).data.messages;
  assert.deepEqual([m.ref.label, m.ref.text, m.ref.alt.label, m.ref.alt.text, m.ref.kind], ['ESV', 'but he is under guardians', '和合本', '乃在师傅和管家的手下', undefined]);
  assert.deepEqual([n.ref.kind, n.body], ['note', 'My note']);
});

test('a note on two versions read side by side keeps both versions’ words', async () => {
  const u = (await api('POST', '/api/register', { body: { username: 'twover', password: 'password1' } })).data;
  const note = { book: 'galatians', chapter: 4, version: 'web', start: { verse: 2, word: 0 }, end: { verse: 3, word: 6 }, color: 'yellow',
    quote: 'but is under guardians', body: 'n', alt: { version: 'eng_kjv', quote: 'But is under tutors', start: { verse: 2, word: 0 }, end: { verse: 2, word: 3 } } };
  assert.equal((await api('PUT', '/api/notes/note-twover-1', { token: u.token, body: note })).status, 200);
  const [n] = (await api('GET', '/api/notes', { token: u.token })).data.notes;
  assert.deepEqual([n.quote, n.alt.version, n.alt.quote, n.alt.end.word], ['but is under guardians', 'eng_kjv', 'But is under tutors', 3]);
  // Each version's words verse by verse, for showing them in the Bible's order.
  await api('PUT', '/api/notes/note-twover-1', { token: u.token, body: { ...note, parts: { main: [[2, 'but is under'], [3, 'So we also']], alt: [[2, 'But is under'], [3, 'Even so we']] } } });
  assert.deepEqual((await api('GET', '/api/notes', { token: u.token })).data.notes[0].parts.alt, [[2, 'But is under'], [3, 'Even so we']]);
  // A one-version note keeps its words verse by verse too (for its verse numbers).
  await api('PUT', '/api/notes/note-twover-2', { token: u.token, body: { ...note, alt: undefined, parts: { main: [[2, 'but is under'], [3, 'So we also']] } } });
  assert.deepEqual((await api('GET', '/api/notes', { token: u.token })).data.notes.find((x) => x.id === 'note-twover-2').parts, { main: [[2, 'but is under'], [3, 'So we also']], alt: [] });
  // An unknown second version is dropped, not stored.
  await api('PUT', '/api/notes/note-twover-1', { token: u.token, body: { ...note, alt: { version: 'nope', quote: 'x' } } });
  assert.equal((await api('GET', '/api/notes', { token: u.token })).data.notes[0].alt, undefined);
});

test('app short links are followed only to the video sites', async () => {
  const u = (await api('POST', '/api/register', { body: { username: 'shortlinks', password: 'password1' } })).data;
  const real = globalThis.fetch;
  const hops = { 'https://v.douyin.com/iRNBho6u/': 'https://www.iesdouyin.com/share/video/7300000000000000002/?region=CN',
    'https://vm.tiktok.com/ZMabc123/': 'https://www.tiktok.com/@someone/video/7300000000000000001?_r=1', 'https://b23.tv/evil12': 'https://evil.example/x' };
  globalThis.fetch = (url, opts) => (hops[url] ? Promise.resolve(new Response(null, { status: 301, headers: { location: hops[url] } })) : real(url, opts));
  try {
    const get = (url) => api('GET', `/api/video-link?url=${encodeURIComponent(url)}`, { token: u.token });
    assert.match((await get('https://v.douyin.com/iRNBho6u/')).data.url, /iesdouyin\.com\/share\/video\/7300000000000000002/);
    assert.match((await get('https://vm.tiktok.com/ZMabc123/')).data.url, /tiktok\.com\/@someone\/video\/7300000000000000001/);
    assert.equal((await get('https://b23.tv/evil12')).status, 404); // leads off the video sites
    assert.equal((await get('https://example.com/abc123')).status, 400); // not a short-link host
  } finally { globalThis.fetch = real; }
});
