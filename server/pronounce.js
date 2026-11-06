// British and American pronunciations (phonetic symbols and recordings).
// Main source: the Free Dictionary API (dictionaryapi.dev, built from Wiktionary, CC BY-SA), which has
// UK/US recordings and IPA. Youdao (dict.youdao.com) fills the gaps. Only words in the app's dictionary or
// the Bible text are looked up, so this can't be used as a general proxy. Results are kept on disk.
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

// From a Free Dictionary API reply: clean IPA and recording URLs per accent. Accents come from the recording
// file names (grace-uk.mp3, grace-us.mp3). Narrow transcriptions ([tʰə̥…]) and fragments (/bi-/) are skipped.
export function freeDictionaryPronunciations(reply) {
  const out = { uk: '', us: '', general: '', ukAudio: '', usAudio: '' };
  if (!Array.isArray(reply)) return out;
  let general = '';
  const good = (t) => {
    const m = /^\/([^/]{2,60})\/$/.exec(String(t || '').trim());
    return m && !/^-|-$/.test(m[1]) ? m[1] : '';
  };
  for (const entry of reply) {
    for (const p of entry?.phonetics || []) {
      const accent = /-(uk|us)\.mp3$/i.exec(String(p?.audio || ''))?.[1]?.toLowerCase();
      const text = good(p?.text);
      if (accent) {
        if (!out[`${accent}Audio`] && /^https:\/\//.test(p.audio)) out[`${accent}Audio`] = p.audio;
        if (text && !out[accent]) out[accent] = text;
      } else if (text && !general) general = text;
    }
    if (!general) general = good(entry?.phonetic);
  }
  out.general = general; // unlabelled: only used when no accent-specific phonetic exists anywhere
  return out;
}

// Looks a word up in the Free Dictionary API once (remembered), shared by the phonetics and audio services.
export function createFreeDictionary({ fetchImpl = globalThis.fetch, upstream = 'https://api.dictionaryapi.dev/api/v2/entries/en' } = {}) {
  const memory = new Map();
  return function lookUp(word) {
    if (!memory.has(word)) {
      const p = (async () => {
        const res = await fetchImpl(`${upstream}/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(10000) });
        if (res.status === 404) return freeDictionaryPronunciations(null); // no entry
        if (!res.ok) throw new Error('unavailable');
        return freeDictionaryPronunciations(await res.json());
      })();
      memory.set(word, p);
      p.catch(() => memory.delete(word)); // try again later after a network problem
      if (memory.size > 3000) memory.delete(memory.keys().next().value);
    }
    return memory.get(word);
  };
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
  freeDict = createFreeDictionary({ fetchImpl }), // pass null to use Youdao only
} = {}) {
  let known = words;
  const inflight = new Map();
  const dir = cacheDir && path.join(cacheDir, 'v2'); // v2: Free Dictionary recordings first

  async function download(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = audioType(buf);
    return type && buf.length >= 500 ? { buf, type } : null;
  }

  async function load(accent, word) {
    if (dir) {
      for (const ext of ['mp3', 'wav', 'ogg']) {
        try { const buf = await fs.promises.readFile(path.join(dir, accent, `${word}.${ext}`)); return { buf, type: audioType(buf) }; } catch { /* not cached */ }
      }
    }
    let found = null, reached = false;
    // 1. Free Dictionary recording for this accent.
    if (freeDict) {
      try { const fd = await freeDict(word); reached = true; if (fd[`${accent}Audio`]) found = await download(fd[`${accent}Audio`]).catch(() => null); } catch { /* fall through */ }
    }
    // 2. Youdao.
    if (!found) {
      try { found = await download(`${upstream}?audio=${encodeURIComponent(word)}&type=${ACCENT_TYPE[accent]}`); reached = true; } catch { /* unreachable */ }
    }
    if (!found) throw new PronounceError(reached ? 404 : 503, reached ? 'No recording for this word.' : "Couldn't reach the pronunciation service.");
    if (dir) {
      const ext = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' }[found.type];
      try { await fs.promises.mkdir(path.join(dir, accent), { recursive: true }); await fs.promises.writeFile(path.join(dir, accent, `${word}.${ext}`), found.buf); } catch { /* best effort */ }
    }
    return found;
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

// American IPA for a word from a Merriam-Webster Learner's API reply: the first entry for exactly this
// headword (meta.id "grace" or "grace:1") that has a pronunciation. Suggestions (plain strings) mean no entry.
export function merriamWebsterIpa(reply, word) {
  if (!Array.isArray(reply)) return '';
  for (const e of reply) {
    if (!e || typeof e !== 'object') continue;
    const id = String(e.meta?.id || '').split(':')[0].toLowerCase();
    if (id !== word) continue;
    const ipa = (e.hwi?.prs || []).map((p) => p?.ipa).find(Boolean);
    if (ipa) return String(ipa).trim();
  }
  return '';
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

// British and American phonetic symbols: Free Dictionary first, then Youdao, Merriam-Webster (US, with a key),
// Wiktionary and the built-in name list; kept on disk once fetched.
export function createPhoneticsService({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://dict.youdao.com/jsonapi',
  dictDir = path.join(here, '..', 'public', 'dict'), words = null,
  namesFile = path.join(here, 'data', 'name-phonetics.json'), names = null,
  wiktionary = true, wiktionaryUpstream = 'https://en.wiktionary.org/w/index.php',
  // Merriam-Webster's Learner's Dictionary (American IPA), the main source for US phonetics when a key is set.
  mwKey = process.env.MW_LEARNERS_KEY || '', mwUpstream = 'https://www.dictionaryapi.com/api/v3/references/learners/json',
  freeDict = createFreeDictionary({ fetchImpl }), // pass null to skip it
} = {}) {
  let known = words;
  // Built-in phonetics for Bible names and places (Wiktionary, ipa-dict), used when Youdao has none.
  let builtIn = names;
  const loadNames = () => { if (!builtIn) { try { builtIn = JSON.parse(fs.readFileSync(namesFile, 'utf8')); } catch { builtIn = {}; } } return builtIn; };
  const memory = new Map();
  const inflight = new Map();
  const clean = (s) => (typeof s === 'string' ? s.trim().replace(/^\/|\/$/g, '').slice(0, 80) : '');

  async function load(word) {
    const file = cacheDir && path.join(cacheDir, `${word}.v3${mwKey ? '-mw' : ''}.json`); // v3: Free Dictionary first
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    // 1. Free Dictionary API.
    let value = { uk: '', us: '', src: { uk: '', us: '' } };
    if (freeDict) {
      const fd = await freeDict(word).catch(() => null);
      for (const a of ['uk', 'us']) if (fd?.[a]) { value[a] = fd[a]; value.src[a] = 'freedict'; }
    }
    // 2. Youdao for whatever is still missing.
    let general = '';
    if (freeDict) general = (await freeDict(word).catch(() => null))?.general || '';
    if (!value.uk || !value.us) {
      const yd = await fromYoudao(word).catch((e) => { if (!value.uk && !value.us && !freeDict) throw e; return null; });
      for (const a of ['uk', 'us']) if (!value[a] && yd?.[a]) { value[a] = yd[a]; value.src[a] = 'youdao'; }
    }
    // Then the Free Dictionary's unlabelled phonetic, if an accent still has nothing.
    for (const a of ['uk', 'us']) if (!value[a] && general) { value[a] = general; value.src[a] = 'freedict'; }
    // 3. Merriam-Webster for the American phonetic, when a key is set.
    if (mwKey) {
      const mw = await fromMerriamWebster(word).catch(() => '');
      if (mw) { value.us = mw; value.src.us = 'mw'; }
    }
    // 4. Nothing yet (common for Bible names): ask Wiktionary for this one word.
    if (!value.uk && !value.us && wiktionary) {
      const w = await fromWiktionary(word).catch(() => null);
      if (w) value = { uk: w.uk || w.us, us: w.us || w.uk, src: { uk: 'wiktionary', us: 'wiktionary' } };
    }
    if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  }

  async function fromYoudao(word) {
    let res;
    try { res = await fetchImpl(`${upstream}?q=${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(15000) }); } catch {
      throw new PronounceError(503, "Couldn't reach the dictionary service.");
    }
    if (!res.ok) throw new PronounceError(503, "The dictionary service isn't responding right now.");
    let data;
    try { data = await res.json(); } catch { throw new PronounceError(502, 'The dictionary service sent something unexpected'); }
    const pick = (list) => (Array.isArray(list) ? list[0] : list) || {};
    const ec = pick(data?.ec?.word), simple = pick(data?.simple?.word);
    return { uk: clean(ec.ukphone || simple.ukphone), us: clean(ec.usphone || simple.usphone) };
  }

  async function fromMerriamWebster(word) {
    const res = await fetchImpl(`${mwUpstream}/${encodeURIComponent(word)}?key=${encodeURIComponent(mwKey)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return '';
    return merriamWebsterIpa(await res.json(), word);
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
    if (local) value = { uk: local.uk || local.us || '', us: local.us || local.uk || '', src: { uk: 'ipa-dict', us: 'ipa-dict' } }; // no request needed
    else {
      if (!inflight.has(word)) inflight.set(word, load(word).finally(() => inflight.delete(word)));
      value = await inflight.get(word);
    }
    memory.set(word, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    return value;
  };
}
