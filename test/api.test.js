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
