// Converts the `world-english-bible` npm package (public domain WEB) into the
// compact per-book files served from public/bible.
//   npm pack world-english-bible && tar xzf world-english-bible-*.tgz
//   node scripts/build-bible.mjs package/json
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS } from '../server/books.js';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-bible.mjs <path-to-json-dir>'); process.exit(1); }
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'bible');
fs.mkdirSync(out, { recursive: true });

for (const book of BOOKS) {
  const items = JSON.parse(fs.readFileSync(path.join(src, `${book.id}.json`), 'utf8'));
  const chapters = [];
  let newPara = true;
  let last = null;
  for (const it of items) {
    if (it.type === 'paragraph start' || it.type === 'stanza start' || it.type === 'break') { newPara = true; continue; }
    if (it.type !== 'paragraph text' && it.type !== 'line text') continue;
    const c = it.chapterNumber - 1, v = it.verseNumber - 1;
    chapters[c] ??= [];
    const ch = chapters[c];
    if (!ch[v]) { ch[v] = { t: '', p: newPara || v === 0 }; }
    newPara = false;
    ch[v].t += ' ' + it.value;
    last = ch[v];
  }
  const compact = chapters.map((ch) => ch.map((vs) => {
    const t = vs.t.replace(/\s+/g, ' ').replace(/ ([,.;:!?’”)])/g, '$1').trim();
    return vs.p ? [t, 1] : [t];
  }));
  fs.writeFileSync(path.join(out, `${book.id}.json`), JSON.stringify(compact));
  if (compact.length !== book.chapters) console.warn(`${book.id}: ${compact.length} chapters, expected ${book.chapters}`);
}
console.log(`wrote ${BOOKS.length} books to ${out}`);
