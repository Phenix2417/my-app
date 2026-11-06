import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBibleDictionary, cleanTopicText, topicMatches, parseFhlJson } from '../server/bibledict.js';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

test('topic titles about a word', () => {
  assert.ok(topicMatches('Grace', 'grace'));
  assert.ok(topicMatches('GRACE OF GOD', 'grace'));
  assert.ok(topicMatches('Grace, means of', 'grace'));
  assert.ok(!topicMatches('GRACES', 'grace'));
  assert.ok(!topicMatches('SWORD', 'word'));
});

test('cleans FHL topic text and its JSON quirk', () => {
  assert.deepEqual(parseFhlJson('{"record":[{"book":,"id":"T1"}]}').record[0].book, null);
  assert.equal(cleanTopicText(' - 上帝是一切恩典的上帝\r\n     #彼前 5:10|\r\n - 见 <a href="t.php?k=1">上帝</a>'),
    '• 上帝是一切恩典的上帝 （彼前 5:10）\n• 见 上帝');
});

// A stand-in for FHL's st.php: English search, then Chinese by topic number.
function fakeFhl() {
  const calls = [];
  const fetchImpl = async (url) => {
    const p = Object.fromEntries(new URL(url).searchParams); calls.push(p);
    const body = (record) => new Response(JSON.stringify({ status: 'success', record_count: record.length, record }).replace('"book":0', '"book":'));
    if (p.N === '0' && p.keyword === 'grace') return body([{ book: 0, id: 'T0000250', topic: 'Grace', text: '...' }]);
    if (p.N === '1' && p.keyword === 'grace') return body([{ book: 1, id: 'T0002071', topic: 'GRACE OF GOD', text: '...' }, { book: 1, id: 'T0002072', topic: 'GRACES', text: '...' }]);
    if (p.N === '2' && p.k === '0000250') return body([{ book: 2, id: 'T0000250', topic: '恩典', text: ' - 上帝是恩典的赐予者\r\n  #诗 84:11|' }]);
    if (p.N === '3' && p.k === '0002071') return body([{ book: 3, id: 'T0002071', topic: '上帝的恩典', text: ' -一般经文\r\n  #创 15:6|' }]);
    return body([]);
  };
  return { calls, fetchImpl };
}

test('finds the Chinese topics for an English word, once', async () => {
  const f = fakeFhl();
  const look = createBibleDictionary({ fetchImpl: f.fetchImpl });
  const r = await look('Grace');
  assert.deepEqual(r.entries.map((e) => [e.term, e.english]), [['恩典', 'Grace'], ['上帝的恩典', 'GRACE OF GOD']]);
  assert.equal(r.entries[0].text, '• 上帝是恩典的赐予者 （诗 84:11）');
  const n = f.calls.length;
  await look('grace');
  assert.equal(f.calls.length, n, 'cached');
  assert.equal(await look('table'), null);
  assert.ok(f.calls.every((c) => c.gb === '1'), 'simplified Chinese');
});

test('route needs sign-in and answers 404 for words without a topic', async () => {
  const server = createServer(openDb(':memory:'), { bibleDict: createBibleDictionary({ fetchImpl: fakeFhl().fetchImpl }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/bible-dictionary/grace`)).status, 401);
    const { token } = await (await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'bd_user', password: 'password1' }) })).json();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    assert.equal((await (await fetch(`${base}/api/bible-dictionary/grace`, auth)).json()).entries[0].term, '恩典');
    assert.equal((await fetch(`${base}/api/bible-dictionary/table`, auth)).status, 404);
  } finally { server.close(); }
});
