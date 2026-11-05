// Public-domain (and one openly licensed) Bible commentaries from the Free Use Bible API
// (https://bible.helloao.org). Chapters are fetched on first use, simplified, and cached in memory
// and on disk so later reads are fast and survive the upstream being down.
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS } from './books.js';

// USFM book codes, in the same order as BOOKS.
const CODES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR',
  'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON',
  'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
const CODE_OF = Object.fromEntries(BOOKS.map((b, i) => [b.id, CODES[i]]));
const NT = new Set(CODES.slice(39));
const PUBLIC_DOMAIN = { license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/' };

// `missing` lists the books each commentary doesn't cover (from each commentary's books.json).
export const COMMENTARIES = [
  { id: 'matthew-henry', name: 'Matthew Henry', about: 'Warm and devotional', ...PUBLIC_DOMAIN, missing: ['SNG'] },
  { id: 'jamieson-fausset-brown', name: 'Jamieson-Fausset-Brown', about: 'Short, verse by verse', ...PUBLIC_DOMAIN, missing: [] },
  { id: 'adam-clarke', name: 'Adam Clarke', about: 'Detailed, with notes on the original languages', ...PUBLIC_DOMAIN,
    missing: ['DEU', 'JDG', 'PSA', 'PRO', 'ECC', 'JER', 'JOL', 'MAL', 'MAT'] },
  { id: 'john-gill', name: 'John Gill', about: 'Very thorough, with Jewish background', ...PUBLIC_DOMAIN, missing: [] },
  { id: 'john-calvin', name: 'John Calvin', about: 'The Reformer’s commentaries', ...PUBLIC_DOMAIN,
    missing: ['JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PRO', 'ECC', 'SNG', '2JN', '3JN', 'REV'] },
  { id: 'keil-delitzsch', name: 'Keil & Delitzsch', about: 'Scholarly, Old Testament only', ...PUBLIC_DOMAIN, missing: [...NT] },
  { id: 'tyndale', name: 'Tyndale Open Study Notes', about: 'Modern study notes', missing: ['JDG'],
    license: 'Tyndale Open Study Notes © Tyndale House Publishers, licensed CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
];
const BY_ID = new Map(COMMENTARIES.map((c) => [c.id, c]));

export const commentaryList = () => COMMENTARIES.map(({ id, name, about, license, licenseUrl, missing }) => ({
  id, name, about, license, licenseUrl, missingBooks: BOOKS.filter((b) => missing.includes(CODE_OF[b.id])).map((b) => b.id),
}));

export class CommentaryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function simplify(json) {
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

export function createCommentaryService({ cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://bible.helloao.org', memoryLimit = 60 } = {}) {
  const memory = new Map(); // key -> {data} or {notCovered: true}; insertion order = LRU
  const inflight = new Map();

  const remember = (key, value) => {
    memory.delete(key);
    memory.set(key, value);
    while (memory.size > memoryLimit) memory.delete(memory.keys().next().value);
  };
  const diskPath = (id, code, chapter) => cacheDir && path.join(cacheDir, id, `${code}-${chapter}.json`);

  async function load(id, code, chapter) {
    const file = diskPath(id, code, chapter);
    if (file) {
      try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached yet */ }
    }
    let res;
    try {
      res = await fetchImpl(`${upstream}/api/c/${id}/${code}/${chapter}.json`, { signal: AbortSignal.timeout(15000) });
    } catch {
      throw new CommentaryError(503, "Couldn't reach the commentary service. Try again in a moment.");
    }
    // A chapter the commentary doesn't cover comes back as an HTML "not found" page.
    const isJson = (res.headers.get('content-type') || '').includes('json');
    let value;
    if (res.status === 404 || (res.ok && !isJson)) value = { notCovered: true };
    else if (!res.ok) throw new CommentaryError(503, "The commentary service isn't responding right now. Try again later.");
    else value = { data: simplify(await res.json()) };
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
    const code = CODE_OF[book.id];
    const notCovered = () => new CommentaryError(404, `${c.name} doesn't cover ${book.name} ${chapter}. Try another commentary.`);
    if (c.missing.includes(code)) throw notCovered();

    const key = `${id}/${code}/${chapter}`;
    let value = memory.get(key);
    if (!value) {
      if (!inflight.has(key)) inflight.set(key, load(id, code, chapter).finally(() => inflight.delete(key)));
      value = await inflight.get(key);
    }
    remember(key, value);
    if (value.notCovered) throw notCovered();
    return { commentary: { id: c.id, name: c.name, license: c.license, licenseUrl: c.licenseUrl }, book: book.id, chapter, ...value.data };
  };
}
