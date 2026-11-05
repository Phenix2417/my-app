// Bible commentaries shown beside the verses.
//   * English: public-domain commentaries (and the openly licensed Tyndale notes) from the
//     Free Use Bible API, https://bible.helloao.org
//   * Chinese: 信望愛站註釋 (GNU FDL) and 串珠 cross references (Treasury of Scripture Knowledge,
//     public domain) from the 信望愛 (FHL) JSON API, https://bible.fhl.net/json/
// Chapters are fetched on first use, simplified, and cached in memory and on disk so later reads are fast
// and survive the upstream being down.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './books.js';

// USFM book codes, in the same order as BOOKS.
const CODES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR',
  'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON',
  'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
// FHL's English book abbreviations (https://bible.fhl.net/json/listall.html), same order.
const FHL_ENGS = ['Gen', 'Ex', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1 Sam', '2 Sam', '1 Kin', '2 Kin', '1 Chr',
  '2 Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Is', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel',
  'Amos', 'Obad', 'Jon', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom',
  '1 Cor', '2 Cor', 'Gal', 'Eph', 'Phil', 'Col', '1 Thess', '2 Thess', '1 Tim', '2 Tim', 'Titus', 'Philem', 'Heb', 'James',
  '1 Pet', '2 Pet', '1 John', '2 John', '3 John', 'Jude', 'Rev'];
const CODE_OF = Object.fromEntries(BOOKS.map((b, i) => [b.id, CODES[i]]));
const ENGS_OF = Object.fromEntries(BOOKS.map((b, i) => [b.id, FHL_ENGS[i]]));
const NT = new Set(CODES.slice(39));
const PUBLIC_DOMAIN = { license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/' };
const FHL_LICENSE = {
  license: '信望愛站註釋 © 信望愛資訊中心 (FHL)，採用 GNU Free Documentation License 授權',
  licenseUrl: 'https://www.fhl.net/main/fhl/fhl8.html',
};

// `missing` lists books a commentary doesn't cover (from each commentary's own book list).
export const COMMENTARIES = [
  { id: 'matthew-henry', source: 'helloao', lang: 'en', name: 'Matthew Henry', about: 'Warm and devotional', ...PUBLIC_DOMAIN, missing: ['SNG'] },
  { id: 'jamieson-fausset-brown', source: 'helloao', lang: 'en', name: 'Jamieson-Fausset-Brown', about: 'Short, verse by verse', ...PUBLIC_DOMAIN, missing: [] },
  { id: 'adam-clarke', source: 'helloao', lang: 'en', name: 'Adam Clarke', about: 'Detailed, with notes on the original languages', ...PUBLIC_DOMAIN,
    missing: ['DEU', 'JDG', 'PSA', 'PRO', 'ECC', 'JER', 'JOL', 'MAL', 'MAT'] },
  { id: 'john-gill', source: 'helloao', lang: 'en', name: 'John Gill', about: 'Very thorough, with Jewish background', ...PUBLIC_DOMAIN, missing: [] },
  { id: 'john-calvin', source: 'helloao', lang: 'en', name: 'John Calvin', about: 'The Reformer’s commentaries', ...PUBLIC_DOMAIN,
    missing: ['JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PRO', 'ECC', 'SNG', '2JN', '3JN', 'REV'] },
  { id: 'keil-delitzsch', source: 'helloao', lang: 'en', name: 'Keil & Delitzsch', about: 'Scholarly, Old Testament only', ...PUBLIC_DOMAIN, missing: [...NT] },
  { id: 'tyndale', source: 'helloao', lang: 'en', name: 'Tyndale Open Study Notes', about: 'Modern study notes', missing: ['JDG'],
    license: 'Tyndale Open Study Notes © Tyndale House Publishers, licensed CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'fhl-zh-hans', source: 'fhl', fhlBook: 3, gb: 1, lang: 'zh-Hans', name: '信望爱站注释（简体）', about: '中文逐段解经，附原文字义', ...FHL_LICENSE, missing: [] },
  { id: 'fhl-zh-hant', source: 'fhl', fhlBook: 3, gb: 0, lang: 'zh-Hant', name: '信望愛站註釋（繁體）', about: '中文逐段解經，附原文字義', ...FHL_LICENSE, missing: [] },
  { id: 'tsk', source: 'fhl', fhlBook: 4, gb: 0, lang: 'en', perVerse: true, name: '串珠 Cross references', about: 'Treasury of Scripture Knowledge',
    ...PUBLIC_DOMAIN, missing: [] },
];
const BY_ID = new Map(COMMENTARIES.map((c) => [c.id, c]));
export const COMMENTARY_IDS = new Set(BY_ID.keys());

export const commentaryList = () => COMMENTARIES.map(({ id, name, about, lang, license, licenseUrl, missing }) => ({
  id, name, about, lang, license, licenseUrl, missingBooks: BOOKS.filter((b) => missing.includes(CODE_OF[b.id])).map((b) => b.id),
}));

export class CommentaryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Free Use Bible API ---------- */
function simplifyHelloao(json) {
  const ch = json?.chapter;
  if (!ch || !Array.isArray(ch.content)) throw new CommentaryError(502, 'The commentary service sent something unexpected');
  const entries = [];
  for (const it of ch.content) {
    if (it?.type !== 'verse' || !Number.isInteger(it.number) || !Array.isArray(it.content)) continue;
    const text = it.content.filter((s) => typeof s === 'string').join('\n\n').replace(/\r\n?/g, '\n').trim();
    if (text) entries.push({ verse: it.number, text });
  }
  entries.sort((a, b) => a.verse - b.verse);
  const intro = typeof ch.introduction === 'string' ? ch.introduction.trim() : '';
  return { introduction: intro || null, entries };
}

/* ---------- FHL (信望愛) ---------- */
const CJK = /[　-〿㐀-鿿＀-￯]/;
// FHL text is hard-wrapped with indentation, marks references as "#1:14-15|" and Strong's numbers as "SNG01096".
export function cleanFhlText(raw, { keepLines = false } = {}) {
  const lines = String(raw).replace(/\r\n?/g, '\n')
    .replace(/#([^|#\n]*)\|/g, '$1')
    .replace(/SN([GH])0*(\d+)/g, '$1$2')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  if (keepLines) return lines.map((l) => l.replace(/^\*\s*/, '• ')).join('\n');
  const startsParagraph = /^([●○◎■□▲△◆◇※]|[（(][一二三四五六七八九十\d]+[）)]|[一二三四五六七八九十壹貳贰參叁肆伍陸陆柒捌玖拾]+[、．.]|\d+[.、])/;
  const out = [];
  for (const l of lines) {
    if (!out.length || startsParagraph.test(l)) { out.push(l); continue; }
    const prev = out[out.length - 1];
    out[out.length - 1] = prev + (CJK.test(prev.slice(-1)) || CJK.test(l[0]) ? '' : ' ') + l;
  }
  return out.join('\n');
}
const TITLE_RE = /(\d+)\s*章\s*(\d+)\s*[節节]\s*到\s*(\d+)\s*章\s*(\d+)\s*[節节]/;

/* ---------- service ---------- */
const here = path.dirname(fileURLToPath(import.meta.url));
function defaultVerseCount(bibleDir) {
  const cache = new Map();
  return (bookId, chapter) => {
    if (!cache.has(bookId)) {
      try { cache.set(bookId, JSON.parse(fs.readFileSync(path.join(bibleDir, `${bookId}.json`), 'utf8')).map((c) => c.length)); }
      catch { cache.set(bookId, []); }
    }
    return cache.get(bookId)[chapter - 1] || 0;
  };
}

export function createCommentaryService({
  cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://bible.helloao.org', fhlUpstream = 'https://bible.fhl.net',
  memoryLimit = 60, verseCount = defaultVerseCount(path.join(here, '..', 'public', 'bible')), fhlConcurrency = 4,
} = {}) {
  const memory = new Map(); // key -> {data} or {notCovered: true}; insertion order = LRU
  const inflight = new Map();

  const remember = (key, value) => {
    memory.delete(key);
    memory.set(key, value);
    while (memory.size > memoryLimit) memory.delete(memory.keys().next().value);
  };
  const diskPath = (id, code, chapter) => cacheDir && path.join(cacheDir, id, `${code}-${chapter}.json`);

  async function getJson(url) {
    let res;
    try { res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) }); } catch {
      throw new CommentaryError(503, "Couldn't reach the commentary service. Try again in a moment.");
    }
    const isJson = (res.headers.get('content-type') || '').includes('json');
    if (res.status === 404) return null;
    if (!res.ok) throw new CommentaryError(503, "The commentary service isn't responding right now. Try again later.");
    const body = await res.text();
    if (!isJson && !/^\s*[{[]/.test(body)) return null; // helloao answers a missing chapter with an HTML page
    try { return JSON.parse(body); } catch { throw new CommentaryError(502, 'The commentary service sent something unexpected'); }
  }

  async function fetchHelloao(c, bookId, chapter) {
    const json = await getJson(`${upstream}/api/c/${c.id}/${CODE_OF[bookId]}/${chapter}.json`);
    return json ? { data: simplifyHelloao(json) } : { notCovered: true };
  }

  async function fhlSection(c, bookId, chapter, verse) {
    const q = new URLSearchParams({ book: String(c.fhlBook), engs: ENGS_OF[bookId], chap: String(chapter), sec: String(verse), gb: String(c.gb) });
    const json = await getJson(`${fhlUpstream}/json/sc.php?${q}`);
    const rec = json?.record?.[0];
    if (!rec || typeof rec.com_text !== 'string') return null;
    const m = TITLE_RE.exec(rec.title || '');
    const start = m ? (Number(m[1]) < chapter ? 1 : Number(m[2])) : verse;
    const next = json.next && Number(json.next.chap) === chapter ? Number(json.next.sec) : null;
    const text = cleanFhlText(rec.com_text, { keepLines: c.perVerse });
    return { verse: start, text, next };
  }

  async function fetchFhl(c, bookId, chapter) {
    const total = verseCount(bookId, chapter);
    const entries = [];
    if (c.perVerse) {
      // One section per verse: fetch a few verses at a time.
      let v = 1;
      const worker = async () => {
        while (v <= total) {
          const mine = v++;
          const s = await fhlSection(c, bookId, chapter, mine);
          if (s && s.text) entries.push({ verse: mine, text: s.text });
        }
      };
      await Promise.all(Array.from({ length: Math.min(fhlConcurrency, Math.max(total, 1)) }, worker));
    } else {
      // Sections cover verse ranges and point at the next one: walk the chapter.
      let v = 1;
      for (let guard = 0; v && v <= Math.max(total, 1) && guard < 200; guard++) {
        const s = await fhlSection(c, bookId, chapter, v);
        if (!s) { v += 1; continue; } // no section starts here; try the next verse
        if (s.text && !entries.some((e) => e.verse === s.verse)) entries.push({ verse: s.verse, text: s.text });
        v = s.next && s.next > v ? s.next : null;
      }
    }
    entries.sort((a, b) => a.verse - b.verse);
    return entries.length ? { data: { introduction: null, entries } } : { notCovered: true };
  }

  async function load(c, bookId, chapter) {
    const file = diskPath(c.id, CODE_OF[bookId], chapter);
    if (file) {
      try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached yet */ }
    }
    const value = c.source === 'fhl' ? await fetchFhl(c, bookId, chapter) : await fetchHelloao(c, bookId, chapter);
    if (file) {
      try {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, JSON.stringify(value));
      } catch { /* caching is best effort */ }
    }
    return value;
  }

  return async function getChapter(id, bookId, chapter) {
    const c = BY_ID.get(id);
    if (!c) throw new CommentaryError(404, 'Unknown commentary');
    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) throw new CommentaryError(400, 'Unknown book');
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) throw new CommentaryError(400, 'Invalid chapter');
    const notCovered = () => new CommentaryError(404, `${c.name} doesn't cover ${book.name} ${chapter}. Try another commentary.`);
    if (c.missing.includes(CODE_OF[book.id])) throw notCovered();

    const key = `${id}/${book.id}/${chapter}`;
    let value = memory.get(key);
    if (!value) {
      if (!inflight.has(key)) inflight.set(key, load(c, book.id, chapter).finally(() => inflight.delete(key)));
      value = await inflight.get(key);
    }
    remember(key, value);
    if (value.notCovered) throw notCovered();
    return { commentary: { id: c.id, name: c.name, lang: c.lang, license: c.license, licenseUrl: c.licenseUrl }, book: book.id, chapter, ...value.data };
  };
}
