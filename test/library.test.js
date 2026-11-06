import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';
import { createLibraryStore } from '../server/library.js';

let server, base, dir;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-'));
  server = createServer(openDb(':memory:'), { library: createLibraryStore({ dir }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const json = async (method, p, token, body) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const upload = (p, token, bytes) => fetch(base + p, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: bytes });
const register = async (username) => (await (await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password: 'password1' }) })).json()).token;

test('books are private, checked by content, and can be read, renamed, positioned and deleted', async () => {
  const ann = await register('ann'), bob = await register('bob');
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 32)]);
  let res = await upload('/api/library?format=pdf&title=' + encodeURIComponent('My  Book‮') + '&author=Me', ann, pdf);
  assert.equal(res.status, 201);
  const { book } = await res.json();
  assert.equal(book.title, 'My Book');
  assert.equal(book.format, 'pdf');
  assert.equal(book.size, pdf.length);

  // Binary that isn't a PDF/EPUB is refused whatever it claims to be.
  res = await upload('/api/library?format=pdf', ann, Buffer.from([0, 1, 2, 3, 0, 5]));
  assert.equal(res.status, 415);
  // Text is fine.
  res = await upload('/api/library?format=txt&title=Notes', ann, Buffer.from('第一章\n起初，神创造天地。'));
  assert.equal(res.status, 201);

  assert.equal((await json('GET', '/api/library', ann)).data.books.length, 2);
  assert.equal((await json('GET', '/api/library', bob)).data.books.length, 0);
  assert.equal((await fetch(`${base}/api/library/${book.id}/file`, { headers: { Authorization: `Bearer ${bob}` } })).status, 404);

  const file = await fetch(`${base}/api/library/${book.id}/file`, { headers: { Authorization: `Bearer ${ann}` } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);

  // A short-lived link for the phone's PDF viewer works without signing in.
  const { url } = (await json('POST', `/api/library/${book.id}/link`, ann)).data;
  const viaLink = await fetch(base + url);
  assert.equal(viaLink.status, 200);
  assert.match(viaLink.headers.get('content-disposition'), /inline; filename="My Book\.pdf"/);
  assert.equal((await fetch(base + '/api/library-file/' + 'x'.repeat(32))).status, 404);

  assert.equal((await json('PUT', `/api/library/${book.id}`, ann, { title: 'Renamed', position: { chapter: 3, frac: 0.5, progress: 0.2 } })).data.book.title, 'Renamed');
  assert.deepEqual((await json('GET', '/api/library', ann)).data.books.find((b) => b.id === book.id).position, { chapter: 3, frac: 0.5, progress: 0.2 });
  assert.equal((await json('PUT', `/api/library/${book.id}`, ann, { position: { chapter: 1, frac: 7 } })).status, 400);

  // Covers must be images.
  const coverPut = (bytes) => fetch(`${base}/api/library/${book.id}/cover`, { method: 'PUT', headers: { Authorization: `Bearer ${ann}` }, body: bytes });
  assert.equal((await coverPut(Buffer.from('not an image'))).status, 415);
  assert.equal((await coverPut(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).status, 200);
  const cover = await fetch(`${base}/api/library/${book.id}/cover`, { headers: { Authorization: `Bearer ${ann}` } });
  assert.equal(cover.headers.get('content-type'), 'image/jpeg');

  // Highlights and notes in a book: only the owner can add or see them; they go when the book does.
  const hl = { lib: book.id, chapter: 2, start: { verse: 3, word: 0 }, end: { verse: 3, word: 4 }, color: 'pink', quote: 'Now I saw in my', body: 'Bunyan' };
  assert.equal((await json('PUT', '/api/library-notes/note-0001', bob, hl)).status, 404);
  assert.equal((await json('PUT', '/api/library-notes/note-0001', ann, hl)).data.note.body, 'Bunyan');
  assert.equal((await json('PUT', '/api/library-notes/note-0001', bob, { ...hl, lib: undefined })).status, 404);
  assert.equal((await json('PUT', '/api/library-notes/note-0002', ann, { ...hl, color: 'red' })).status, 400);
  assert.deepEqual((await json('GET', `/api/library/${book.id}/notes`, ann)).data.notes.map((n) => [n.chapter, n.start, n.color]), [[2, { verse: 3, word: 0 }, 'pink']]);
  assert.equal((await json('GET', `/api/library/${book.id}/notes`, bob)).status, 404);

  assert.equal((await json('DELETE', `/api/library/${book.id}`, bob)).status, 404);
  assert.equal((await json('DELETE', `/api/library/${book.id}`, ann)).status, 200);
  assert.equal((await json('GET', '/api/library', ann)).data.books.length, 1);
  assert.equal(fs.readdirSync(path.join(dir, String(1))).filter((f) => f.startsWith(book.id)).length, 0);
});
