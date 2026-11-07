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

test('a sender can edit or delete their own messages, which stay marked', async () => {
  const reg = async (n) => (await api('POST', '/api/register', { body: { username: n, password: 'password1' } })).data;
  const a = await reg('edit_a'), b = await reg('edit_b');
  await api('POST', '/api/friends/requests', { token: a.token, body: { username: 'edit_b' } });
  await api('POST', `/api/friends/${a.user.id}/accept`, { token: b.token });
  const m1 = (await api('POST', `/api/messages/${b.user.id}`, { token: a.token, body: { body: 'helo' } })).data.message;
  const m2 = (await api('POST', `/api/messages/${b.user.id}`, { token: a.token, body: { body: 'oops' } })).data.message;
  assert.equal((await api('PUT', `/api/dm-messages/${m1.id}`, { token: b.token, body: { body: 'not yours' } })).status, 404);
  assert.equal((await api('PUT', `/api/dm-messages/${m1.id}`, { token: a.token, body: { body: 'hello' } })).status, 200);
  assert.equal((await api('DELETE', `/api/dm-messages/${m2.id}`, { token: a.token })).status, 200);
  const msgs = (await api('GET', `/api/messages/${a.user.id}`, { token: b.token })).data.messages;
  assert.deepEqual(msgs.map((m) => [m.body, !!m.editedAt, !!m.deleted]), [['hello', true, false], ['', false, true]]);
  assert.equal((await api('PUT', `/api/dm-messages/${m2.id}`, { token: a.token, body: { body: 'again' } })).status, 400);
  // groups too
  const { group } = (await api('POST', '/api/groups', { token: a.token, body: { name: 'g', members: [b.user.id] } })).data;
  const gm = (await api('POST', `/api/groups/${group.id}/messages`, { token: a.token, body: { body: 'hi all' } })).data.message;
  assert.equal((await api('DELETE', `/api/group-messages/${gm.id}`, { token: b.token })).status, 404);
  await api('PUT', `/api/group-messages/${gm.id}`, { token: a.token, body: { body: 'hi everyone' } });
  const g = (await api('GET', `/api/groups/${group.id}/messages`, { token: b.token })).data.messages[0];
  assert.deepEqual([g.body, !!g.editedAt], ['hi everyone', true]);
  assert.equal((await api('GET', '/api/chats', { token: b.token })).data.chats.find((c) => c.kind === 'friend').last.deleted, true);
});
