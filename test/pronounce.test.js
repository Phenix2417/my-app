import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPronounceService, createPhoneticsService, audioType } from '../server/pronounce.js';
import { openDb } from '../server/db.js';
import { createServer } from '../server/app.js';

const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(800, 1)]);
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(800, 1)]);

test('detects the real audio format', () => {
  assert.equal(audioType(mp3), 'audio/mpeg');
  assert.equal(audioType(wav), 'audio/wav');
  assert.equal(audioType(Buffer.from('<html>nope</html>')), null);
});

test('fetches British and American audio once each, only for dictionary words', async () => {
  const calls = [];
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'au-'));
  const fetchImpl = async (url) => { calls.push(url); return new Response(url.endsWith('type=1') ? wav : mp3, { headers: { 'content-type': 'audio/mpeg' } }); };
  const get = createPronounceService({ cacheDir, fetchImpl, words: new Set(['grace']) });
  assert.equal((await get('uk', 'grace')).type, 'audio/wav');
  assert.equal((await get('us', 'grace')).type, 'audio/mpeg');
  assert.deepEqual(calls, ['https://dict.youdao.com/dictvoice?audio=grace&type=1', 'https://dict.youdao.com/dictvoice?audio=grace&type=2']);
  const again = createPronounceService({ cacheDir, fetchImpl, words: new Set(['grace']) });
  await again('uk', 'grace');
  assert.equal(calls.length, 2, 'second service reads the disk copy');
  await assert.rejects(get('us', 'notaword'), { status: 404 });
  assert.equal(calls.length, 2, 'unknown words are never fetched');
});

test('audio route serves the right content type without sign-in', async () => {
  const get = createPronounceService({ words: new Set(['grace']), fetchImpl: async () => new Response(wav) });
  const server = createServer(openDb(':memory:'), { pronounce: get });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/pronounce/uk/grace`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.equal(res.headers.get('cache-control'), 'no-store', 'phones must not keep audio');
    assert.equal((await res.arrayBuffer()).byteLength, wav.length);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/pronounce/uk/zzzz`)).status, 404);
  } finally { server.close(); }
});

test('British and American phonetics come from the dictionary service, once per word', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return Response.json({ ec: { word: [{ ukphone: 'təˈmɑːtəʊ', usphone: 'təˈmeɪtoʊ' }] } }); };
  const get = createPhoneticsService({ fetchImpl, words: new Set(['tomato']) });
  assert.deepEqual(await get('tomato'), { uk: 'təˈmɑːtəʊ', us: 'təˈmeɪtoʊ' });
  await get('tomato');
  assert.deepEqual(calls, ['https://dict.youdao.com/jsonapi?q=tomato']);
  await assert.rejects(get('zzzz'), { status: 404 });
  const empty = createPhoneticsService({ fetchImpl: async () => Response.json({}), words: new Set(['x-ray']) });
  assert.deepEqual(await empty('x-ray'), { uk: '', us: '' });
});
