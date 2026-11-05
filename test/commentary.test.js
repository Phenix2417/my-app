import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCommentaryService, commentaryList, cleanFhlText } from '../server/commentary.js';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

// A stand-in for bible.helloao.org shaped like its real responses.
function fakeUpstream() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/api/c/matthew-henry/JHN/1.json')) {
      return new Response(JSON.stringify({ chapter: { number: 1, introduction: 'Intro text', content: [
        { type: 'verse', number: 6, content: ['Of John the Baptist.', 'Second paragraph.'] },
        { type: 'verse', number: 1, content: ['The Word was God.'] },
        { type: 'heading', content: ['ignored'] },
      ] } }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('<!doctype html><p>Not found</p>', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  return { calls, fetchImpl };
}

test('fetches, simplifies and caches a chapter', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-'));
  const up = fakeUpstream();
  const get = createCommentaryService({ cacheDir, fetchImpl: up.fetchImpl });
  const ch = await get('matthew-henry', 'john', 1);
  assert.equal(up.calls[0], 'https://bible.helloao.org/api/c/matthew-henry/JHN/1.json');
  assert.equal(ch.introduction, 'Intro text');
  assert.deepEqual(ch.entries, [
    { verse: 1, text: 'The Word was God.' },
    { verse: 6, text: 'Of John the Baptist.\n\nSecond paragraph.' },
  ]);
  await get('matthew-henry', 'john', 1);
  assert.equal(up.calls.length, 1, 'served from memory');

  // A fresh service (e.g. after a restart) reads the disk cache instead of the network.
  const up2 = fakeUpstream();
  const get2 = createCommentaryService({ cacheDir, fetchImpl: up2.fetchImpl });
  assert.equal((await get2('matthew-henry', 'john', 1)).entries.length, 2);
  assert.equal(up2.calls.length, 0);
});

test('reports books and chapters a commentary does not cover', async () => {
  const up = fakeUpstream();
  const get = createCommentaryService({ fetchImpl: up.fetchImpl });
  await assert.rejects(get('keil-delitzsch', 'john', 1), { status: 404, message: /Keil & Delitzsch doesn't cover John 1/ });
  assert.equal(up.calls.length, 0, 'known gaps are answered without a request');
  await assert.rejects(get('john-gill', 'john', 2), { status: 404 }); // upstream 404 page
  await assert.rejects(get('nope', 'john', 1), { status: 404 });
  await assert.rejects(get('john-gill', 'john', 99), { status: 400 });
  const kd = commentaryList().find((c) => c.id === 'keil-delitzsch');
  assert.equal(kd.missingBooks.length, 27);
  assert.ok(kd.missingBooks.includes('revelation'));
});

test('upstream outage gives a clear, retryable error', async () => {
  const get = createCommentaryService({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(get('john-gill', 'john', 1), { status: 503 });
});

test('commentary route requires sign-in and returns the chapter', async () => {
  const up = fakeUpstream();
  const server = createServer(openDb(':memory:'), { commentary: createCommentaryService({ fetchImpl: up.fetchImpl }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/commentaries/matthew-henry/john/1`)).status, 401);
    const { token } = await (await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'reader', password: 'password1' }) })).json();
    const res = await fetch(`${base}/api/commentaries/matthew-henry/john/1`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).commentary.name, 'Matthew Henry');
    const list = await (await fetch(`${base}/api/commentaries`)).json();
    assert.equal(list.commentaries.length, 10);
  } finally { server.close(); }
});

// A stand-in for the FHL (信望愛) API: John 1 in three sections that point at each other.
function fakeFhl() {
  const calls = [];
  const sections = { 1: [1, 2, 3], 3: [3, 13, 14], 14: [14, 51, null] };
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname !== '/json/sc.php') return new Response('nope', { status: 404 });
    const p = Object.fromEntries(u.searchParams);
    if (p.engs !== 'John' || p.chap !== '1') return Response.json({ status: 'success', record_count: 0, record: [] });
    if (p.book === '4') { // cross references: one per verse
      return Response.json({ status: 'success', record_count: 1, record: [{ title: `約翰福音 1章${p.sec}節 到 1章${p.sec}節`, com_text: `\n * the Word.\n # Isa 7:14; Mt 1:${p.sec}|\n` }] });
    }
    const s = sections[p.sec];
    if (!s) return Response.json({ status: 'success', record_count: 0, record: [] });
    const [from, to, next] = s;
    const zh = p.gb === '1' ? '节' : '節';
    return Response.json({ status: 'success', record_count: 1,
      next: next ? { engs: 'John', chap: 1, sec: next } : { engs: 'John', chap: 2, sec: 1 },
      record: [{ title: `约翰福音 1章${from}${zh} 到 1章${to}${zh}`, com_text: `  （一）太初有道。#1:1-2|\r\n        ●「道」：SNG03056，基本意義是「言\r\n              語」。第${from}段` }] });
  };
  return { calls, fetchImpl };
}

test('Chinese commentary: walks the sections of a chapter and cleans the text', async () => {
  const up = fakeFhl();
  const get = createCommentaryService({ fetchImpl: up.fetchImpl, verseCount: () => 51 });
  const ch = await get('fhl-zh-hans', 'john', 1);
  assert.deepEqual(ch.entries.map((e) => e.verse), [1, 3, 14]);
  assert.equal(ch.entries[0].text, '（一）太初有道。1:1-2\n●「道」：G3056，基本意義是「言語」。第1段');
  assert.equal(up.calls.length, 3, 'one request per section');
  assert.ok(up.calls[0].includes('gb=1') && up.calls[0].includes('book=3'));
  assert.equal(ch.commentary.lang, 'zh-Hans');
  await assert.rejects(get('fhl-zh-hant', 'genesis', 1), { status: 404 }); // nothing there
});

test('cross references: one entry per verse, fetched a few at a time', async () => {
  const up = fakeFhl();
  const get = createCommentaryService({ fetchImpl: up.fetchImpl, verseCount: () => 5, fhlConcurrency: 2 });
  const ch = await get('tsk', 'john', 1);
  assert.deepEqual(ch.entries.map((e) => e.verse), [1, 2, 3, 4, 5]);
  assert.equal(ch.entries[2].text, '• the Word.\nIsa 7:14; Mt 1:3');
});

test('cleanFhlText joins wrapped Chinese lines without adding spaces', () => {
  assert.equal(cleanFhlText('●「太初」：七十士譯本用此字來翻\n      譯#創 1:1|的「起初」SNH07225。'), '●「太初」：七十士譯本用此字來翻譯創 1:1的「起初」H7225。');
  assert.equal(cleanFhlText('He said\n   that it was'), 'He said that it was');
});
