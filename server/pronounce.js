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
  } catch { /* no dictionary */ }
  // Every word in the Bible text too (names and places that the dictionary lacks), so they can be pronounced.
  try {
    const bibleDir = path.join(dictDir, '..', 'bible');
    for (const f of fs.readdirSync(bibleDir)) {
      if (!f.endsWith('.json')) continue;
      for (const ch of JSON.parse(fs.readFileSync(path.join(bibleDir, f), 'utf8'))) {
        for (const [t] of ch) for (const raw of String(t).split(/[\s—–]+/)) {
          const w = raw.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');
          if (w) words.add(w);
        }
      }
    }
  } catch { /* no Bible text */ }
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

// IPA from a Wiktionary page's English section: { uk, us } (unlabelled pronunciations count for both).
export function wiktionaryPhonetics(wikitext) {
  const en = `\n${wikitext}`.split(/\n==English==\n/)[1]?.split(/\n==[^=]/)[0] || '';
  const out = { uk: '', us: '' };
  for (const line of en.split('\n')) {
    for (const m of line.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
      const parts = m[1].split('|');
      const ipa = parts.find((x) => /^[/[]/.test(x));
      if (!ipa) continue;
      const label = `${line} ${parts.join(' ')}`;
      const uk = /\b(UK|RP|British)\b/.test(label), us = /\b(US|GA|GenAm|American)\b/.test(label);
      const v = ipa.replace(/^[/[]|[/\]]$/g, '').trim();
      if ((uk || !us) && !out.uk) out.uk = v;
      if ((us || !uk) && !out.us) out.us = v;
    }
  }
  return out;
}

// British and American phonetic symbols, from Youdao's dictionary data; kept on disk once fetched.
export function createPhoneticsService({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://dict.youdao.com/jsonapi',
  dictDir = path.join(here, '..', 'public', 'dict'), words = null,
  namesFile = path.join(here, 'data', 'name-phonetics.json'), names = null,
  wiktionary = true, wiktionaryUpstream = 'https://en.wiktionary.org/w/index.php',
} = {}) {
  let known = words;
  // Built-in phonetics for Bible names and places (Wiktionary, ipa-dict), used when Youdao has none.
  let builtIn = names;
  const loadNames = () => { if (!builtIn) { try { builtIn = JSON.parse(fs.readFileSync(namesFile, 'utf8')); } catch { builtIn = {}; } } return builtIn; };
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
    let value = { uk: clean(ec.ukphone || simple.ukphone), us: clean(ec.usphone || simple.usphone) };
    // Nothing from Youdao (common for Bible names): ask Wiktionary for this one word.
    if (!value.uk && !value.us && wiktionary) {
      const w = await fromWiktionary(word).catch(() => null);
      if (w) value = { uk: w.uk || w.us, us: w.us || w.uk };
    }
    if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  }

  // Pronunciation section of the English Wiktionary entry (CC BY-SA): IPA, labelled UK/RP or US/GA where given.
  async function fromWiktionary(word) {
    for (const title of [word[0].toUpperCase() + word.slice(1), word]) {
      const res = await fetchImpl(`${wiktionaryUpstream}?title=${encodeURIComponent(title)}&action=raw`, {
        signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BibleStudyApp/1.0 (personal Bible study app)' } });
      if (!res.ok) continue;
      const found = wiktionaryPhonetics(await res.text());
      if (found.uk || found.us) return found;
    }
    return null;
  }

  return async function getPhonetics(rawWord) {
    const word = String(rawWord).toLowerCase();
    known ??= loadWords(dictDir);
    if (!/^[a-z][a-z-]{0,39}$/.test(word) || !known.has(word)) throw new PronounceError(404, 'Not a dictionary word');
    if (memory.has(word)) return memory.get(word);
    const local = loadNames()[word];
    let value;
    if (local) value = { uk: local.uk || local.us || '', us: local.us || local.uk || '' }; // no request needed
    else {
      if (!inflight.has(word)) inflight.set(word, load(word).finally(() => inflight.delete(word)));
      value = await inflight.get(word);
    }
    memory.set(word, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    return value;
  };
}
