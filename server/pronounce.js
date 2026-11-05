// British and American pronunciations for dictionary words, from Youdao's pronunciation audio
// (dict.youdao.com/dictvoice, type=1 British, type=2 American). Only words in the app's dictionary are
// fetched, so this can't be used as a general proxy. Each recording is fetched once and kept on disk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ACCENT_TYPE = { uk: 1, us: 2 };

export class PronounceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Youdao labels everything audio/mpeg, but British recordings are often WAV: look at the bytes.
export function audioType(buf) {
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.length > 3 && (buf.toString('latin1', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (buf.length > 4 && buf.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
  return null;
}

function loadWords(dictDir) {
  const words = new Set();
  try {
    for (const f of fs.readdirSync(dictDir)) {
      if (f.endsWith('.json')) for (const w of Object.keys(JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8')))) words.add(w);
    }
  } catch { /* no dictionary: nothing can be pronounced */ }
  return words;
}

export function createPronounceService({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://dict.youdao.com/dictvoice',
  dictDir = path.join(here, '..', 'public', 'dict'), words = null,
} = {}) {
  let known = words;
  const inflight = new Map();

  async function load(accent, word) {
    const exts = ['mp3', 'wav', 'ogg'];
    if (cacheDir) {
      for (const ext of exts) {
        try { const buf = await fs.promises.readFile(path.join(cacheDir, accent, `${word}.${ext}`)); return { buf, type: audioType(buf) }; } catch { /* not cached */ }
      }
    }
    let res;
    try {
      res = await fetchImpl(`${upstream}?audio=${encodeURIComponent(word)}&type=${ACCENT_TYPE[accent]}`, { signal: AbortSignal.timeout(15000) });
    } catch { throw new PronounceError(503, "Couldn't reach the pronunciation service."); }
    if (!res.ok) throw new PronounceError(res.status === 404 ? 404 : 503, 'No recording for this word.');
    const buf = Buffer.from(await res.arrayBuffer());
    const type = audioType(buf);
    if (!type || buf.length < 500) throw new PronounceError(404, 'No recording for this word.');
    if (cacheDir) {
      const ext = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' }[type];
      try { await fs.promises.mkdir(path.join(cacheDir, accent), { recursive: true }); await fs.promises.writeFile(path.join(cacheDir, accent, `${word}.${ext}`), buf); } catch { /* best effort */ }
    }
    return { buf, type };
  }

  return async function getAudio(accent, rawWord) {
    if (!ACCENT_TYPE[accent]) throw new PronounceError(404, 'Unknown accent');
    const word = String(rawWord).toLowerCase();
    known ??= loadWords(dictDir);
    if (!/^[a-z][a-z-]{0,39}$/.test(word) || !known.has(word)) throw new PronounceError(404, 'Not a dictionary word');
    const key = `${accent}/${word}`;
    if (!inflight.has(key)) inflight.set(key, load(accent, word).finally(() => inflight.delete(key)));
    return inflight.get(key);
  };
}

// British and American phonetic symbols, from Youdao's dictionary data; kept on disk once fetched.
export function createPhoneticsService({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://dict.youdao.com/jsonapi',
  dictDir = path.join(here, '..', 'public', 'dict'), words = null,
} = {}) {
  let known = words;
  const memory = new Map();
  const inflight = new Map();
  const clean = (s) => (typeof s === 'string' ? s.trim().replace(/^\/|\/$/g, '').slice(0, 80) : '');

  async function load(word) {
    const file = cacheDir && path.join(cacheDir, `${word}.json`);
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    let res;
    try { res = await fetchImpl(`${upstream}?q=${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(15000) }); } catch {
      throw new PronounceError(503, "Couldn't reach the dictionary service.");
    }
    if (!res.ok) throw new PronounceError(503, "The dictionary service isn't responding right now.");
    let data;
    try { data = await res.json(); } catch { throw new PronounceError(502, 'The dictionary service sent something unexpected'); }
    const pick = (list) => (Array.isArray(list) ? list[0] : list) || {};
    const ec = pick(data?.ec?.word), simple = pick(data?.simple?.word);
    const value = { uk: clean(ec.ukphone || simple.ukphone), us: clean(ec.usphone || simple.usphone) };
    if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  }

  return async function getPhonetics(rawWord) {
    const word = String(rawWord).toLowerCase();
    known ??= loadWords(dictDir);
    if (!/^[a-z][a-z-]{0,39}$/.test(word) || !known.has(word)) throw new PronounceError(404, 'Not a dictionary word');
    if (memory.has(word)) return memory.get(word);
    if (!inflight.has(word)) inflight.set(word, load(word).finally(() => inflight.delete(word)));
    const value = await inflight.get(word);
    memory.set(word, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    return value;
  };
}
