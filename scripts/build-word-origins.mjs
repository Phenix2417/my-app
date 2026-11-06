// Build public/origins.json: words in the Bible text that English takes directly from a language of the Bible's world
// (Hebrew, Aramaic, Greek, Akkadian, Egyptian, Persian…), with the source word. From Wiktionary (CC BY-SA) via
// kaikki.org: the first etymology template of an entry (borrowed / derived / inherited from …) must name one of
// those languages, so "amen" (borrowed from Hebrew) counts but "angel" (from Old English, from Latin, from Greek) doesn't.
//   curl -s https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl | node scripts/build-word-origins.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
// Language codes -> [English name, Chinese name]
export const LANGS = {
  he: ['Hebrew', '希伯来语'], hbo: ['Biblical Hebrew', '希伯来语'], 'he-old': ['Hebrew', '希伯来语'],
  arc: ['Aramaic', '亚兰语'], 'arc-imp': ['Aramaic', '亚兰语'], 'arc-bib': ['Aramaic', '亚兰语'], syc: ['Syriac', '叙利亚语'],
  grc: ['Ancient Greek', '古希腊语'], 'grc-koi': ['Koine Greek', '通用希腊语'], el: ['Greek', '希腊语'],
  akk: ['Akkadian', '阿卡德语'], egy: ['Egyptian', '古埃及语'], peo: ['Old Persian', '古波斯语'], fa: ['Persian', '波斯语'],
  phn: ['Phoenician', '腓尼基语'], uga: ['Ugaritic', '乌加里特语'], sux: ['Sumerian', '苏美尔语'],
};
const KINDS = new Set(['bor', 'bor+', 'lbor', 'slbor', 'ubor', 'der', 'der+', 'inh', 'inh+', 'uder', 'translit', 'obor']);

// Every word in the WEB text (case kept), to keep the output small.
const wanted = new Set();
for (const f of fs.readdirSync(path.join(root, 'public', 'bible'))) {
  const book = JSON.parse(fs.readFileSync(path.join(root, 'public', 'bible', f), 'utf8'));
  const walk = (x) => { if (typeof x === 'string') for (const w of x.split(/[^A-Za-z'’-]+/)) { const k = w.replace(/[’']s$/, '').replace(/^['’-]+|['’-]+$/g, ''); if (k) { wanted.add(k); wanted.add(k.toLowerCase()); } } else if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v); };
  walk(book);
}

// Follow the etymology chain (inherited / borrowed / derived from … from …) and take its oldest step in a language of
// the Bible's world: "Moses" (Late Latin ← Greek ← Hebrew מֹשֶׁה) is Hebrew; "amen" (… ← Hebrew אָמֵן) too.
// The chain stops at the first template of another kind (compounds, cognates, "see also"…).
export function originOf(entry) {
  let found = null;
  for (const t of entry.etymology_templates || []) {
    if (!KINDS.has(t.name)) { if (found || /^(cog|ncog|m|l|affix|af|suffix|prefix|compound|blend)$/.test(t.name)) break; continue; }
    const code = t.name === 'translit' ? t.args?.['1'] : t.args?.['2'];
    if (!LANGS[code]) continue;
    const word = String(t.args?.['3'] || '').trim().replace(/^\*/, '');
    found = { lang: code, word: /^[-–]?$/.test(word) ? '' : word, tr: String(t.args?.tr || '').trim() };
  }
  return found;
}

// Which words count as transliterations. Names (capitalised): from any of these languages. Ordinary words: from Hebrew,
// Aramaic and the other ancient Near Eastern languages (amen, cherub, ephod, shekel…), less look-alikes ("get", "tell");
// from Greek, only Bible terms taken over as they were (angel, apostle, baptize…) — not everyday words like "hour".
const NEAR_EAST = new Set(['he', 'hbo', 'he-old', 'arc', 'arc-imp', 'arc-bib', 'syc', 'akk', 'egy', 'peo', 'phn', 'uga', 'sux']);
const NOT_THESE = new Set('get tell ben bat mate tar lake cheese sack mat kite gum cane chameleon alpha sarai pul luz holon meron meon kore pan carpus rose leopard tartan ha caravan leprosy cinnamon'.split(' '));
const GREEK_TERMS = new Set(('angel angels archangel apostle apostles baptize baptized baptism baptisms demon demons demonic devil eunuch eunuchs hyssop '
  + 'idol idols idolatry myrrh parable parables paradise patriarch patriarchs prophet prophets prophecy proselyte psalm psalms synagogue synagogues '
  + 'tetrarch stater blasphemy blaspheme hypocrite hypocrites leper lepers zealot diadem nard alabaster').split(' '));
function keep(word, o) {
  if (/^[A-Z]/.test(word)) return true;
  if (NOT_THESE.has(word)) return false;
  return NEAR_EAST.has(o.lang) || GREEK_TERMS.has(word);
}

const out = {};
let n = 0;
const dump = process.env.DUMP ? fs.createWriteStream(process.env.DUMP) : null; // the matching entries, to try the rule again offline
const input = process.env.FROM_DUMP ? fs.createReadStream(process.env.FROM_DUMP) : process.stdin;
const rl = readline.createInterface({ input, crlfDelay: Infinity });
for await (const line of rl) {
  if (++n % 200000 === 0) process.stderr.write(`${n} entries, ${Object.keys(out).length} kept\n`);
  // The entry's own "word" isn't the first one in the line (descendants and related words come earlier), so parse every
  // line that mentions a Bible word and has an etymology.
  if (process.env.FROM_DUMP) { const d = JSON.parse(line); const o = originOf({ etymology_templates: d.t }); if (o && !out[d.word] && keep(d.word, o)) out[d.word] = o; continue; }
  if (!line.includes('"etymology_templates"')) continue;
  let hit = false;
  for (const m of line.matchAll(/"word": "([^"]{1,40})"/g)) if (wanted.has(m[1])) { hit = true; break; }
  if (!hit) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'en' || !wanted.has(e.word)) continue;
  if (dump) dump.write(JSON.stringify({ word: e.word, pos: e.pos, t: e.etymology_templates }) + '\n');
  const o = originOf(e);
  if (o && !out[e.word] && keep(e.word, o)) out[e.word] = o;
}
const file = path.join(root, 'public', 'origins.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`${Object.keys(out).length} words → ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
