// Bible versions besides the built-in World English Bible, from the Free Use Bible API (bible.helloao.org).
// Each chapter is fetched once and kept in the data folder, in the app's compact form: [[verse text, 1 if a
// paragraph starts here], ...]. Only openly licensed versions are offered.
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS } from './books.js';

const CODES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR',
  'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON',
  'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
const CODE = new Map(BOOKS.map((b, i) => [b.id, CODES[i]]));

export const VERSIONS = [
  { id: 'web', short: 'WEB', name: 'World English Bible', lang: 'en', builtIn: true, credit: 'World English Bible (public domain)' },
  { id: 'BSB', short: 'BSB', name: 'Berean Standard Bible', lang: 'en', credit: 'Berean Standard Bible (public domain)' },
  { id: 'eng_kjv', short: 'KJV', name: 'King James Version', lang: 'en', credit: 'King James Version (public domain)' },
  { id: 'eng_net', short: 'NET', name: 'NET Bible', lang: 'en', credit: 'NET Bible® copyright ©1996–2017 Biblical Studies Press, L.L.C. (netbible.com). Used by permission.' },
  { id: 'eng_asv', short: 'ASV', name: 'American Standard Version (1901)', lang: 'en', credit: 'American Standard Version (public domain)' },
  { id: 'cmn_cu1', short: '和合本', name: '新标点和合本（简体）', lang: 'zh-Hans', credit: '新标点和合本（公有领域）' },
  { id: 'cmn_cuv', short: '和合本(繁)', name: '新標點和合本（繁體）', lang: 'zh-Hant', credit: '新標點和合本（公有領域）' },
  { id: 'cmn_cbs', short: '当代译本', name: '圣经当代译本（简体）', lang: 'zh-Hans', credit: 'Biblica® 圣经当代译本开放资源 (CC BY-SA 4.0)' },
];
export const VERSION_IDS = new Set(VERSIONS.map((v) => v.id));

export class VersionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// The API's chapter content -> [[text, para?], ...] indexed by verse number (missing verses are empty).
export function compactChapter(content) {
  const verses = [];
  let para = true;
  // Pieces (poetry lines, words of Jesus…) are joined with a space, except between Chinese characters.
  const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;
  const text = (parts) => parts.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).filter(Boolean)
    .reduce((acc, t) => (!acc ? t : CJK.test(acc.at(-1)) && CJK.test(t[0]) ? acc + t : `${acc} ${t}`), '');
  for (const item of content || []) {
    if (item.type === 'line_break') { para = true; continue; }
    if (item.type !== 'verse' || !Number.isInteger(item.number)) continue;
    const t = text(item.content || []).replace(/\s+/g, ' ').replace(/ ([,.;:!?’”)])/g, '$1').trim();
    const i = item.number - 1;
    if (verses[i]) { verses[i][0] = `${verses[i][0]} ${t}`.trim(); continue; } // a verse split across paragraphs
    verses[i] = para || i === 0 ? [t, 1] : [t];
    para = false;
  }
  for (let i = 0; i < verses.length; i++) verses[i] ??= [''];
  return verses;
}

export function createVersionService({ cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://bible.helloao.org' } = {}) {
  const memory = new Map();
  return async function chapter(version, book, number) {
    const v = VERSIONS.find((x) => x.id === version && !x.builtIn);
    const meta = BOOKS.find((b) => b.id === book);
    if (!v) throw new VersionError(404, 'Unknown Bible version');
    if (!meta || !(number >= 1 && number <= meta.chapters)) throw new VersionError(404, 'No such chapter');
    const key = `${v.id}/${book}/${number}`;
    if (memory.has(key)) return memory.get(key);
    const file = cacheDir && path.join(cacheDir, v.id, book, `${number}.json`);
    let verses = null;
    if (file) { try { verses = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not kept yet */ } }
    if (!verses) {
      let res;
      try { res = await fetchImpl(`${upstream}/api/${v.id}/${CODE.get(book)}/${number}.json`, { signal: AbortSignal.timeout(15000) }); } catch { throw new VersionError(503, "Couldn't reach the Bible text service."); }
      if (!res.ok) throw new VersionError(res.status === 404 ? 404 : 503, res.status === 404 ? 'This version has no text for this chapter.' : "Couldn't reach the Bible text service.");
      verses = compactChapter((await res.json())?.chapter?.content);
      if (!verses.length) throw new VersionError(404, 'This version has no text for this chapter.');
      if (file) { try { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(verses)); } catch { /* best effort */ } }
    }
    const out = { version: v.id, book, chapter: number, verses };
    memory.set(key, out);
    if (memory.size > 300) memory.delete(memory.keys().next().value);
    return out;
  };
}
