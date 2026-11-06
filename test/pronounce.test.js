import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPronounceService, createPhoneticsService, audioType, wiktionaryPhonetics, merriamWebsterIpa, freeDictionaryPronunciations, createFreeDictionary } from '../server/pronounce.js';
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
  const get = createPronounceService({ cacheDir, fetchImpl, words: new Set(['grace']), freeDict: null });
  assert.equal((await get('uk', 'grace')).type, 'audio/wav');
  assert.equal((await get('us', 'grace')).type, 'audio/mpeg');
  assert.deepEqual(calls, ['https://dict.youdao.com/dictvoice?audio=grace&type=1', 'https://dict.youdao.com/dictvoice?audio=grace&type=2']);
  const again = createPronounceService({ cacheDir, fetchImpl, words: new Set(['grace']), freeDict: null });
  await again('uk', 'grace');
  assert.equal(calls.length, 2, 'second service reads the disk copy');
  await assert.rejects(get('us', 'notaword'), { status: 404 });
  assert.equal(calls.length, 2, 'unknown words are never fetched');
});

test('audio route serves the right content type without sign-in', async () => {
  const get = createPronounceService({ words: new Set(['grace']), fetchImpl: async () => new Response(wav), freeDict: null });
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
  const get = createPhoneticsService({ fetchImpl, words: new Set(['tomato']), wiktionary: false, freeDict: null });
  assert.deepEqual(await get('tomato'), { uk: 'təˈmɑːtəʊ', us: 'təˈmeɪtoʊ', src: { uk: 'youdao', us: 'youdao' } });
  await get('tomato');
  assert.deepEqual(calls, ['https://dict.youdao.com/jsonapi?q=tomato']);
  await assert.rejects(get('zzzz'), { status: 404 });
  const empty = createPhoneticsService({ fetchImpl: async () => Response.json({}), words: new Set(['x-ray']), wiktionary: false, freeDict: null });
  assert.deepEqual(await empty('x-ray'), { uk: '', us: '', src: { uk: '', us: '' } });
});

test('built-in phonetics for Bible names are used without asking the service', async () => {
  const calls = [];
  const get = createPhoneticsService({ fetchImpl: async (u) => { calls.push(u); return Response.json({}); },
    words: new Set(['caiaphas', 'malchus']), names: { caiaphas: { uk: 'ˈkaɪ.ə.fəs' } }, wiktionary: false, freeDict: null });
  assert.deepEqual(await get('caiaphas'), { uk: 'ˈkaɪ.ə.fəs', us: 'ˈkaɪ.ə.fəs', src: { uk: 'ipa-dict', us: 'ipa-dict' } });
  assert.equal(calls.length, 0);
  assert.deepEqual(await get('malchus'), { uk: '', us: '', src: { uk: '', us: '' } });
  assert.equal(calls.length, 1, 'other words still ask the service');
});

test('reads IPA from Wiktionary wikitext, with UK/US labels', () => {
  const page = '==English==\n===Pronunciation===\n* {{IPA|en|/ˌbɛθˈseɪ.ɪ.də/|aa=UK}}\n* {{IPA|en|/ˌbɛθˈseɪ.ɪ.ɾə/|aa=US}}\n==Latin==\n* {{IPA|la|/x/}}';
  assert.deepEqual(wiktionaryPhonetics(page), { uk: 'ˌbɛθˈseɪ.ɪ.də', us: 'ˌbɛθˈseɪ.ɪ.ɾə' });
  assert.deepEqual(wiktionaryPhonetics('==English==\n* {{IPA|en|/ˈkaɪ.ə.fəs/}}'), { uk: 'ˈkaɪ.ə.fəs', us: 'ˈkaɪ.ə.fəs' });
  assert.deepEqual(wiktionaryPhonetics('no entry'), { uk: '', us: '' });
});

test('falls back to Wiktionary, once, when Youdao has nothing', async () => {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u.includes('wiktionary')) return new Response(u.includes('title=Caiaphas') ? '==English==\n* {{IPA|en|/ˈkaɪ.ə.fəs/}}' : '', { status: u.includes('title=Caiaphas') ? 200 : 404 });
    return Response.json({});
  };
  const get = createPhoneticsService({ fetchImpl, words: new Set(['caiaphas']), names: {}, freeDict: null });
  assert.deepEqual(await get('caiaphas'), { uk: 'ˈkaɪ.ə.fəs', us: 'ˈkaɪ.ə.fəs', src: { uk: 'wiktionary', us: 'wiktionary' } });
  await get('caiaphas');
  assert.equal(calls.filter((u) => u.includes('wiktionary')).length, 1);
});

test('Merriam-Webster gives the US phonetic when a key is set', async () => {
  assert.equal(merriamWebsterIpa([{ meta: { id: 'graceful' }, hwi: { prs: [{ ipa: 'x' }] } }, { meta: { id: 'grace:1' }, hwi: { prs: [{ ipa: 'ˈgreɪs' }] } }], 'grace'), 'ˈgreɪs');
  assert.equal(merriamWebsterIpa(['gracious', 'grease'], 'grace'), '', 'suggestions mean no entry');
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u.includes('dictionaryapi.com')) return Response.json([{ meta: { id: 'tomato' }, hwi: { prs: [{ ipa: 'təˈmeɪtoʊ-mw' }] } }]);
    return Response.json({ ec: { word: [{ ukphone: 'təˈmɑːtəʊ', usphone: 'təˈmeɪtoʊ' }] } });
  };
  const get = createPhoneticsService({ fetchImpl, words: new Set(['tomato']), wiktionary: false, mwKey: 'k', freeDict: null });
  assert.deepEqual(await get('tomato'), { uk: 'təˈmɑːtəʊ', us: 'təˈmeɪtoʊ-mw', src: { uk: 'youdao', us: 'mw' } });
  assert.ok(calls.some((u) => u.startsWith('https://www.dictionaryapi.com/api/v3/references/learners/json/tomato?key=k')));
  const noKey = createPhoneticsService({ fetchImpl, words: new Set(['tomato']), wiktionary: false, mwKey: '', freeDict: null });
  assert.equal((await noKey('tomato')).src.us, 'youdao', 'without a key nothing changes');
});

test('Free Dictionary: clean IPA and recordings per accent; narrow forms and fragments skipped', () => {
  assert.deepEqual(freeDictionaryPronunciations([{ phonetics: [{ text: '/ɡɹeɪs/', audio: 'https://x/grace-uk.mp3' }, { text: '/ɡɹeɪs/', audio: 'https://x/grace-us.mp3' }] }]),
    { uk: 'ɡɹeɪs', us: 'ɡɹeɪs', general: '', ukAudio: 'https://x/grace-uk.mp3', usAudio: 'https://x/grace-us.mp3' });
  assert.deepEqual(freeDictionaryPronunciations([{ phonetics: [{ text: '/bɪˈliːv/', audio: '' }, { text: '/bi-/', audio: 'https://x/believe-us.mp3' }] }]),
    { uk: '', us: '', general: 'bɪˈliːv', ukAudio: '', usAudio: 'https://x/believe-us.mp3' });
  assert.deepEqual(freeDictionaryPronunciations([{ phonetics: [{ text: '[tʰə̥ˈmɑːtʰəʊ]', audio: 'https://x/tomato-uk.mp3' }] }]),
    { uk: '', us: '', general: '', ukAudio: 'https://x/tomato-uk.mp3', usAudio: '' });
  assert.deepEqual(freeDictionaryPronunciations({ title: 'No Definitions Found' }), { uk: '', us: '', general: '', ukAudio: '', usAudio: '' });
});

test('Free Dictionary comes first for phonetics and audio; Youdao fills gaps', async () => {
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(800, 2)]);
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u.startsWith('https://api.dictionaryapi.dev/api/v2/entries/en/tomato')) return Response.json([{ phonetics: [{ text: '[tʰə̥ˈmɑːtʰəʊ]', audio: 'https://api.dictionaryapi.dev/media/tomato-uk.mp3' }, { text: '/təˈmeɪtoʊ/', audio: 'https://api.dictionaryapi.dev/media/tomato-us.mp3' }] }]);
    if (u.startsWith('https://api.dictionaryapi.dev/media/')) return new Response(mp3);
    if (u.includes('jsonapi')) return Response.json({ ec: { word: [{ ukphone: 'təˈmɑːtəʊ', usphone: 'x' }] } });
    return new Response('nope', { status: 500 });
  };
  const freeDict = createFreeDictionary({ fetchImpl });
  const ph = createPhoneticsService({ fetchImpl, words: new Set(['tomato']), names: {}, wiktionary: false, mwKey: '', freeDict });
  assert.deepEqual(await ph('tomato'), { uk: 'təˈmɑːtəʊ', us: 'təˈmeɪtoʊ', src: { uk: 'youdao', us: 'freedict' } });
  const au = createPronounceService({ fetchImpl, words: new Set(['tomato']), freeDict });
  assert.equal((await au('us', 'tomato')).type, 'audio/mpeg');
  assert.ok(calls.includes('https://api.dictionaryapi.dev/media/tomato-us.mp3'));
  assert.equal(calls.filter((u) => u.includes('/entries/en/tomato')).length, 1, 'one shared lookup');
  assert.ok(!calls.some((u) => u.includes('dictvoice')), 'no Youdao audio needed');
});
