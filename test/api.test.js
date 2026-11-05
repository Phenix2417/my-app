import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

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
  assert.deepEqual(r.data.friends, [{ id: alice.user.id, username: 'alice', sharing: false, sharesWithMe: false }]);

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

  // Unfriending removes access.
  await api('DELETE', `/api/friends/${alice.user.id}`, { token: james.token });
  fn = await api('GET', '/api/friends/notes', { token: james.token });
  assert.deepEqual(fn.data.notes, []);
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
