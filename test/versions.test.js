import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactChapter, createVersionService } from '../server/versions.js';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

test('chapters become [[text, para?]] by verse number, joining poetry lines', () => {
  const v = compactChapter([
    { type: 'heading', content: ['The Beginning'] }, { type: 'line_break', paragraph: 'p' },
    { type: 'verse', number: 1, content: ['The LORD is my shepherd;', { text: 'I shall not want.', poem: 1 }, { noteId: 3 }] },
    { type: 'verse', number: 3, content: ['He restores', { lineBreak: true }, { text: 'my soul .' }] },
    { type: 'line_break' }, { type: 'verse', number: 4, content: ['耶和华是我的牧者，', { text: '我必不致缺乏。', poem: 1 }] },
  ]);
  assert.deepEqual(v, [['The LORD is my shepherd; I shall not want.', 1], [''], ['He restores my soul.'], ['耶和华是我的牧者，我必不致缺乏。', 1]]);
});

test('a version chapter is fetched once, then kept', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls++; assert.match(url, /\/api\/cmn_cu1\/JHN\/1\.json$/); return new Response(JSON.stringify({ chapter: { content: [{ type: 'verse', number: 1, content: ['太初有道'] }] } })); };
  const ch = createVersionService({ fetchImpl });
  assert.deepEqual((await ch('cmn_cu1', 'john', 1)).verses, [['太初有道', 1]]);
  await ch('cmn_cu1', 'john', 1);
  assert.equal(calls, 1);
  await assert.rejects(ch('web', 'john', 1), /Unknown/); // built in, not fetched
  await assert.rejects(ch('cmn_cu1', 'john', 22), /No such chapter/);
});

test('notes remember their Bible version', async () => {
  const server = createServer(openDb(':memory:'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (await (await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'vera', password: 'password1' }) })).json()).token;
  const put = (id, body) => fetch(`${base}/api/notes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const note = { book: 'john', chapter: 1, start: { verse: 1, word: 0 }, end: { verse: 1, word: 3 }, color: 'yellow', quote: '太初有道', body: '' };
  assert.equal((await (await put('note-ver-1', { ...note, version: 'cmn_cu1' })).json()).note.version, 'cmn_cu1');
  assert.equal((await (await put('note-ver-2', note)).json()).note.version, 'web');
  assert.equal((await put('note-ver-3', { ...note, version: 'niv' })).status, 400);
  const list = await (await fetch(`${base}/api/versions`)).json();
  assert.ok(list.versions.some((v) => v.id === 'cmn_cu1' && v.short === '和合本'));
  server.close();
});
