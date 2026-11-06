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
  assert.equal(cleanTopicText(' - God is the Giver of\r\n   #Ps 84:11|', { english: true }), '• God is the Giver of (Ps 84:11)');
});

const INDEX = [[0, 250, 'Grace'], [1, 2071, 'GRACE OF GOD'], [1, 2072, 'GRACES'], [1, 4760, 'SWORD']];
function fakeFhl() {
  const calls = [];
  const fetchImpl = async (url) => {
    const p = Object.fromEntries(new URL(url).searchParams); calls.push(p);
    const rec = { '2/0000250': ['恩典', ' - 上帝是恩典的赐予者\r\n  #诗 84:11|'], '3/0002071': ['上帝的恩典', ' -一般经文\r\n  #创 15:6|'],
      '0/0000250': ['Grace', ' - God is the Giver of\r\n  #Ps 84:11|'], '1/0002071': ['GRACE OF GOD', ' -General scriptures\r\n  #Ge 15:6|'] }[`${p.N}/${p.k}`];
    return new Response(JSON.stringify({ status: 'success', record: rec ? [{ book: 0, id: `T${p.k}`, topic: rec[0], text: rec[1] }] : [] }).replace('"book":0', '"book":'));
  };
  return { calls, fetchImpl };
}

test('knows which words have entries without any request, and fetches text only when asked', async () => {
  const f = fakeFhl();
  const dict = createBibleDictionary({ fetchImpl: f.fetchImpl, index: INDEX });
  assert.deepEqual(dict.has('Grace'), ['Grace', 'GRACE OF GOD']);
  assert.deepEqual(dict.has('word'), []);
  assert.equal(f.calls.length, 0, 'checking is free');
  const zh = await dict.entry('grace', 'zh');
  assert.deepEqual(zh.entries.map((e) => [e.term, e.english, e.text]), [['恩典', 'Grace', '• 上帝是恩典的赐予者 （诗 84:11）'], ['上帝的恩典', 'GRACE OF GOD', '• 一般经文 （创 15:6）']]);
  assert.deepEqual(f.calls.map((c) => `${c.N}/${c.k}`), ['2/0000250', '3/0002071'], 'only the Chinese texts were fetched');
  const en = await dict.entry('grace', 'en');
  assert.equal(en.entries[0].text, '• God is the Giver of (Ps 84:11)');
  await dict.entry('grace', 'en');
  assert.equal(f.calls.length, 4, 'cached');
  assert.equal(await dict.entry('table', 'zh'), null);
  assert.equal(f.calls.length, 4, 'no request for words without a topic');
});

test('routes: topic check and entries need sign-in', async () => {
  const server = createServer(openDb(':memory:'), { bibleDict: createBibleDictionary({ fetchImpl: fakeFhl().fetchImpl, index: INDEX }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/bible-dictionary/grace`)).status, 401);
    const { token } = await (await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'bd_user', password: 'password1' }) })).json();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    assert.deepEqual(await (await fetch(`${base}/api/bible-dictionary/grace`, auth)).json(), { topics: ['Grace', 'GRACE OF GOD'] });
    assert.equal((await (await fetch(`${base}/api/bible-dictionary/grace/zh`, auth)).json()).entries[0].term, '恩典');
    assert.equal((await fetch(`${base}/api/bible-dictionary/table/en`, auth)).status, 404);
  } finally { server.close(); }
});
