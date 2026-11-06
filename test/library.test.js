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

test("a Bible added from a person's own ebook is private to them", async () => {
  const ann = await register('ann2'), bob = await register('bob2');
  const { version } = (await json('POST', '/api/my-versions', ann, { short: 'ESV', name: 'English Standard Version', lang: 'en' })).data;
  assert.match(version.id, /^u/);
  const put = (token, book, body) => fetch(`${base}/api/my-versions/${version.id}/${book}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body });
  assert.equal((await put(ann, 'john', JSON.stringify([[['In the beginning was the Word.', 1]]]))).status, 200);
  assert.equal((await put(ann, 'john', JSON.stringify([[[42]]]))).status, 400);
  assert.equal((await put(bob, 'john', JSON.stringify([[['x']]]))).status, 404);
  const read = (token) => fetch(`${base}/api/bible/${version.id}/john/1`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.deepEqual((await (await read(ann)).json()).verses, [['In the beginning was the Word.', 1]]);
  assert.equal((await read(bob)).status, 404);
  assert.equal((await read(null)).status, 404);
  assert.ok((await json('GET', '/api/versions', ann)).data.versions.some((v) => v.id === version.id && v.mine));
  assert.ok(!(await json('GET', '/api/versions', bob)).data.versions.some((v) => v.id === version.id));
  // Notes can be made in it by its owner only.
  const note = { book: 'john', chapter: 1, version: version.id, start: { verse: 1, word: 0 }, end: { verse: 1, word: 1 }, color: 'pink', quote: 'In the', body: '' };
  assert.equal((await json('PUT', '/api/notes/note-esv-1', ann, note)).status, 200);
  assert.equal((await json('PUT', '/api/notes/note-esv-2', bob, note)).status, 400);
  assert.equal((await json('DELETE', `/api/my-versions/${version.id}`, ann)).status, 200);
  assert.equal((await read(ann)).status, 404);
});

test('the same book is kept once, recognised by its content rather than its name', async () => {
  const db = openDb(':memory:');
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'library-dup-'));
  const srv = createServer(db, { library: createLibraryStore({ dir: dir2 }) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base2 = `http://127.0.0.1:${srv.address().port}`;
  const token = (await (await fetch(base2 + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dee', password: 'password1' }) })).json()).token;
  const up = (title, bytes) => fetch(`${base2}/api/library?format=pdf&title=${encodeURIComponent(title)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: bytes });
  const count = async () => (await (await fetch(base2 + '/api/library', { headers: { Authorization: `Bearer ${token}` } })).json()).books.length;
  const a = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000, 65)]);
  const first = await (await up('My Bible', a)).json();
  let res = await up('A different name.pdf', a);
  assert.equal(res.status, 200);
  const again = await res.json();
  assert.equal(again.duplicate, true);
  assert.equal(again.book.id, first.book.id);
  assert.equal(await count(), 1);
  // Same name but different content is a different book.
  res = await up('My Bible', Buffer.concat([a, Buffer.from('x')]));
  assert.equal(res.status, 201);
  assert.equal(await count(), 2);
  // The app can ask first, without uploading.
  const sha = (await import('node:crypto')).createHash('sha256').update(a).digest('hex');
  const find = async (q) => (await (await fetch(`${base2}/api/library/find?${q}`, { headers: { Authorization: `Bearer ${token}` } })).json()).book;
  assert.equal((await find(`sha=${sha}&size=${a.length}`)).id, first.book.id);
  assert.equal(await find(`sha=${'0'.repeat(64)}&size=${a.length}`), null);
  // A book uploaded before fingerprints existed is still recognised.
  db.prepare('UPDATE library_books SET sha256 = NULL').run();
  assert.equal((await find(`sha=${sha}&size=${a.length}`)).id, first.book.id);
  assert.equal((await (await up('Old copy', a)).json()).duplicate, true);
  assert.equal(await count(), 2);
  srv.close(); fs.rmSync(dir2, { recursive: true, force: true });
});

test("notes in a person's own Bible reach friends, in their copy when they have that Bible too", async () => {
  const cat = await register('cat'), dan = await register('dan');
  const me = async (t) => (await json('GET', '/api/me', t)).data.user;
  const catId = (await me(cat)).id, danId = (await me(dan)).id;
  await json('POST', '/api/friends/requests', cat, { username: 'dan' });
  await json('POST', `/api/friends/${catId}/accept`, dan);
  await json('PUT', `/api/friends/${danId}/sharing`, cat, { enabled: true });
  const sha = 'a'.repeat(64);
  const esv = (await json('POST', '/api/my-versions', cat, { short: 'ESV', name: 'English Standard Version', lang: 'en', source: sha })).data.version;
  const note = (id, version) => ({ book: 'john', chapter: 1, version, start: { verse: 1, word: 0 }, end: { verse: 1, word: 3 }, color: 'yellow', quote: 'In the beginning was', body: id });
  assert.equal((await json('PUT', '/api/notes/note-cat-web-1', cat, note('web note', 'web'))).status, 200);
  assert.equal((await json('PUT', '/api/notes/note-cat-esv-1', cat, note('esv note', esv.id))).status, 200);

  // Dan has no ESV: he sees both notes in full, the ESV one labelled with its short name.
  let seen = (await json('GET', '/api/friends/notes?book=john&chapter=1', dan)).data.notes;
  const other = seen.find((n) => n.body === 'esv note');
  assert.deepEqual([other.quote, other.versionLabel], ['In the beginning was', 'ESV']);

  // Dan imports the same ebook: the ESV note appears, in his copy.
  const danEsv = (await json('POST', '/api/my-versions', dan, { short: 'ESV-2', name: 'ESV', lang: 'en', source: sha })).data.version;
  seen = (await json('GET', '/api/friends/notes?book=john&chapter=1', dan)).data.notes;
  assert.deepEqual(seen.map((n) => [n.body, n.version]).sort(), [['esv note', danEsv.id], ['web note', 'web']]);
});
