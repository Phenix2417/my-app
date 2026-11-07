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

test('files sent in chat: uploaded, recognised by their bytes, served in parts, carried by messages', async () => {
  const { mkdtempSync } = await import('node:fs');
  const os = await import('node:os'), path = await import('node:path');
  const { createChatFileStore } = await import('../server/chatfiles.js');
  const fdb = openDb(':memory:');
  const srv = createServer(fdb, { chatFiles: createChatFileStore({ dir: mkdtempSync(path.join(os.tmpdir(), 'chatfiles-')) }) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, token, body) => { const r = await fetch(b2 + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  const reg = async (n) => (await (await fetch(`${b2}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'password1' }) })).json());
  const a = await reg('file_a'), b = await reg('file_b');
  await call('POST', '/api/friends/requests', a.token, { username: 'file_b' });
  await call('POST', `/api/friends/${a.user.id}/accept`, b.token);
  const upload = async (bytes, q) => { const r = await fetch(`${b2}/api/chat-files?${new URLSearchParams(q)}`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` }, body: bytes }); return { status: r.status, data: await r.json() }; };
  // A webm recording said to be audio is a voice message; an HTML page is only ever a file to download.
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(996, 7)]);
  const voice = (await upload(webm, { name: 'voice.webm', type: 'audio/webm', duration: '12.34' })).data.file;
  assert.deepEqual([voice.kind, voice.type, voice.size, voice.duration], ['audio', 'audio/webm', 1000, 12.3]);
  const page = (await upload(Buffer.from('<html><script>alert(1)</script>'), { name: 'x.html', type: 'text/html' })).data.file;
  assert.deepEqual([page.kind, page.type], ['file', 'application/octet-stream']);
  let r = await fetch(`${b2}/api/chat-file/${page.id}`);
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  // Ranges, for seeking in videos.
  r = await fetch(`${b2}/api/chat-file/${voice.id}`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 0-3/1000');
  assert.deepEqual([...Buffer.from(await r.arrayBuffer())], [0x1a, 0x45, 0xdf, 0xa3]);
  assert.equal((await fetch(`${b2}/api/chat-file/${'0'.repeat(32)}`)).status, 404);
  // A message with just a file; the friend sees it, and can forward it on.
  const sent = (await call('POST', `/api/messages/${b.user.id}`, a.token, { file: { id: voice.id } })).data.message;
  assert.equal(sent.file.id, voice.id);
  const got = (await call('GET', `/api/messages/${a.user.id}`, b.token)).data.messages[0];
  assert.deepEqual([got.file.kind, got.file.duration], ['audio', 12.3]);
  assert.equal((await call('POST', `/api/messages/${a.user.id}`, b.token, { file: { id: voice.id } })).status, 201);
  assert.equal((await call('POST', `/api/messages/${a.user.id}`, b.token, { file: { id: 'f'.repeat(32) } })).status, 400);
  assert.equal((await call('GET', '/api/chats', b.token)).data.chats[0].last.file.kind, 'audio');
  // An EPUB: a book card's details, with its cover (a picture the sender sent); only the sender can fill them in later.
  const cover = (await upload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]), { name: 'cover.jpg', type: 'image/jpeg' })).data.file;
  const epubBytes = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(26), Buffer.from('mimetypeapplication/epub+zip'), Buffer.alloc(200)]);
  const book = (await upload(epubBytes, { name: 'b.epub', type: '', title: 'Pilgrim’s Progress', author: 'John Bunyan', cover: cover.id })).data.file;
  assert.deepEqual([book.type, book.book], ['application/epub+zip', { title: 'Pilgrim’s Progress', author: 'John Bunyan', cover: cover.id }]);
  const plain = (await upload(epubBytes, { name: 'c.epub' })).data.file;
  assert.equal(plain.book, undefined);
  await call('POST', `/api/messages/${b.user.id}`, a.token, { file: { id: plain.id } });
  assert.equal((await call('PUT', `/api/chat-files/${plain.id}/book`, b.token, { title: 'X' })).status, 404);
  assert.equal((await call('PUT', `/api/chat-files/${plain.id}/book`, a.token, { title: 'Later', cover: cover.id })).status, 200);
  assert.equal((await call('GET', `/api/messages/${a.user.id}`, b.token)).data.messages.at(-1).file.book.title, 'Later');
  // A month later the file is deleted: the message says it expired, and it can't be fetched or forwarded.
  const pic = (await upload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { name: 'p.jpg', type: 'image/jpeg' })).data.file;
  await call('POST', `/api/messages/${b.user.id}`, a.token, { file: { id: pic.id } });
  fdb.prepare('UPDATE chat_files SET created_at = ? WHERE id = ?').run(Date.now() - 31 * 86400000, pic.id);
  assert.equal(await srv.purgeChatFiles(), 1);
  assert.equal((await fetch(`${b2}/api/chat-file/${pic.id}`)).status, 404);
  const last = (await call('GET', `/api/messages/${a.user.id}`, b.token)).data.messages.at(-1);
  assert.deepEqual([last.file.id, last.file.expired], [pic.id, true]);
  assert.equal((await call('POST', `/api/messages/${a.user.id}`, b.token, { file: { id: pic.id } })).status, 400);
  assert.equal((await fetch(`${b2}/api/chat-file/${voice.id}`)).status, 200); // newer files stay
  // Deleting the message takes the file off it.
  await call('DELETE', `/api/dm-messages/${sent.id}`, a.token);
  assert.equal((await call('GET', `/api/messages/${a.user.id}`, b.token)).data.messages[0].file, undefined);
  srv.close();
});
