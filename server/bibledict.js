// Bible dictionary: Torrey's and Nave's Topical Bibles (public domain), in English and in the 信望愛 (FHL)
// Chinese translations (FHL material may be reused freely, see fhl.net/main/fhl/fhl8.html).
// Whether a word has an entry is answered from a built-in index of topic titles (server/data/topics.json),
// with no network request. The text is fetched from FHL only when asked for, and cached.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export class BibleDictError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// FHL's JSON sometimes has an empty value ("book":,); patch that before parsing.
export function parseFhlJson(text) {
  return JSON.parse(String(text).replace(/"book":\s*,/g, '"book":null,'));
}

// Topic text uses "#refs|" for verse references, "-" / "." for list levels and occasional links.
export function cleanTopicText(raw, { english = false } = {}) {
  const [open, close] = english ? ['(', ')'] : ['（', '）'];
  const refLine = english ? /\n(\([^)]*\))/g : /\n(（[^）]*）)/g;
  return String(raw).replace(/\r\n?/g, '\n')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, '')
    .replace(/#([^|#]*)\|/g, (m, refs) => `${open}${refs.replace(/\s*\n\s*/g, ' ').trim()}${close}`)
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^-\s*/, '• ').replace(/^\.\s*/, english ? '   · ' : '　· '))
    .join('\n')
    .replace(refLine, ' $1'); // keep each reference list on its point's line
}

// Topic titles that are about this word: "Grace", "GRACE OF GOD", "Grace, means of" — not "SWORD" or "GRACES".
export function topicMatches(title, word) {
  const t = String(title).toLowerCase().trim();
  return t === word || t.startsWith(`${word} `) || t.startsWith(`${word},`);
}

const SOURCES = {
  zh: { name: '信望爱 主题查经（Nave’s / Torrey’s 中译）', N: (book) => (book === 0 ? '2' : '3') },
  en: { name: 'Nave’s / Torrey’s Topical Bible', N: (book) => String(book) },
};

export function createBibleDictionary({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://bible.fhl.net/json/st.php',
  indexFile = path.join(here, 'data', 'topics.json'), index = null, maxTopics = 3,
} = {}) {
  let topics = index; // [book (0 Torrey, 1 Nave), number, English title]
  const memory = new Map();
  const inflight = new Map();
  const loadIndex = () => { if (!topics) { try { topics = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { topics = []; } } return topics; };
  const normalize = (raw) => { const w = String(raw || '').toLowerCase().trim(); return /^[a-z][a-z' -]{0,40}$/.test(w) ? w : null; };

  // Matching topics for a word, exact titles first (no network).
  function match(word) {
    const found = loadIndex().filter(([, , title]) => topicMatches(title, word));
    found.sort((a, b) => (b[2].toLowerCase() === word) - (a[2].toLowerCase() === word));
    return found.slice(0, maxTopics);
  }

  async function call(params) {
    let res;
    try { res = await fetchImpl(`${upstream}?${new URLSearchParams({ ...params, gb: '1' })}`, { signal: AbortSignal.timeout(15000) }); } catch {
      throw new BibleDictError(503, "Couldn't reach the Bible dictionary.");
    }
    if (!res.ok) throw new BibleDictError(503, "The Bible dictionary isn't responding right now.");
    try { return parseFhlJson(await res.text()); } catch { throw new BibleDictError(502, 'The Bible dictionary sent something unexpected'); }
  }

  async function load(word, lang) {
    const file = cacheDir && path.join(cacheDir, lang, `${word}.json`);
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    const entries = [];
    for (const [book, num, title] of match(word)) {
      const d = await call({ N: SOURCES[lang].N(book), k: String(num).padStart(7, '0') });
      const r = d?.record?.[0];
      if (r?.text) entries.push({ term: lang === 'zh' ? String(r.topic || title).trim() : title, english: title, text: cleanTopicText(r.text, { english: lang === 'en' }) });
    }
    const value = entries.length ? { source: SOURCES[lang].name, entries } : null;
    if (file) { try { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  }

  // For colouring words in the Bible text: the first word of every topic title ("grace" from "Grace of God"),
  // less common words that are rarely what the topic is about ("on", "will", "so", …).
  let heads = null;
  const MARK_SKIP = new Set('on i will no so new time first years way state good put present second form example company college interest one two all'.split(' '));
  const headSet = () => {
    if (!heads) heads = new Set(loadIndex().map(([, , t]) => String(t).toLowerCase().trim().split(/[ ,]/)[0]).filter((w) => w && !MARK_SKIP.has(w)));
    return heads;
  };
  // Simple English base forms, so "kings", "loved", "blessing" find "king", "love", "bless".
  const forms = (w) => [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e')];

  return {
    // Which of these words have Bible dictionary entries (for colouring the text; no network).
    marks(words) {
      const set = headSet();
      return [...new Set(words)].filter((raw) => { const w = normalize(raw); return w && forms(w).some((f) => f.length > 1 && set.has(f)); });
    },
    // Does this word have a Bible dictionary entry? Answered from the built-in index.
    has(raw) {
      const word = normalize(raw);
      return word ? match(word).map(([, , title]) => title) : [];
    },
    // The full entry in 'zh' or 'en', fetched from FHL on first request and cached.
    async entry(raw, lang) {
      const word = normalize(raw);
      if (!word || !SOURCES[lang]) return null;
      const key = `${lang}/${word}`;
      if (memory.has(key)) return memory.get(key);
      if (!match(word).length) return null;
      if (!inflight.has(key)) inflight.set(key, load(word, lang).finally(() => inflight.delete(key)));
      const value = await inflight.get(key);
      memory.set(key, value);
      if (memory.size > 2000) memory.delete(memory.keys().next().value);
      return value;
    },
  };
}
