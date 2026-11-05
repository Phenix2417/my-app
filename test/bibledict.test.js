import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBibleDictionary } from '../server/bibledict.js';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

test('finds Easton entries by headword, including "Word, The" and qualified headwords', () => {
  const look = createBibleDictionary();
  assert.match(look('grace').entries[0].definitions[0], /God's forgiving mercy/);
  assert.equal(look('Word').entries[0].term, 'Word, The');
  assert.deepEqual(look('adam').entries.map((e) => e.term).slice(0, 2), ['Adam', 'Adam, a type']);
  assert.equal(look('beginning'), null);
  assert.equal(look('<script>'), null);
});

test('route needs sign-in and answers 404 for words without an entry', async () => {
  const server = createServer(openDb(':memory:'), { bibleDict: createBibleDictionary({ entries: [['Grace', ['Favour.']]] }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/bible-dictionary/grace`)).status, 401);
    const { token } = await (await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'bd_user', password: 'password1' }) })).json();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    assert.deepEqual((await (await fetch(`${base}/api/bible-dictionary/grace`, auth)).json()).entries, [{ term: 'Grace', definitions: ['Favour.'] }]);
    assert.equal((await fetch(`${base}/api/bible-dictionary/table`, auth)).status, 404);
  } finally { server.close(); }
});
