import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslateService } from '../server/translate.js';

// Youdao-shaped replies; a short phrase gets an unrelated answer unless it ends with a full stop.
function fake() {
  const calls = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q'); calls.push(q);
    if (q === 'full of grace and truth') return Response.json({ input: 'afslaet', simple: {} });
    if (q === 'full of grace and truth.') return Response.json({ input: q, fanyi: { input: q, tran: '充满了恩典和真理。' } });
    if (q === 'In him was life') return Response.json({ input: q, fanyi: { tran: '在他身上有生命' } });
    return Response.json({ input: q });
  };
  return { calls, fetchImpl };
}

test('translates, ignoring replies about a different query, and retries with a full stop', async () => {
  const f = fake();
  const t = createTranslateService({ fetchImpl: f.fetchImpl });
  assert.deepEqual(await t('In him was life'), { text: '在他身上有生命' });
  assert.deepEqual(await t('  full of   grace and truth '), { text: '充满了恩典和真理。' });
  assert.deepEqual(f.calls, ['In him was life', 'full of grace and truth', 'full of grace and truth.']);
  await t('In him was life');
  assert.equal(f.calls.length, 3, 'cached');
  await assert.rejects(t('zzz qqq'), { status: 404 });
  await assert.rejects(t('x'.repeat(601)), { status: 400 });
});

test('an unreachable service is reported as retryable', async () => {
  const t = createTranslateService({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(t('hello there'), { status: 503 });
});
