// Builds public/dict/<letter>.json: English–Chinese entries for every word used in the Bible text
// (plus each inflected word's base form), from ECDICT (MIT licence, https://github.com/skywind3000/ECDICT).
//   curl -LO https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
//   node scripts/build-dict.mjs path/to/ecdict.csv
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2];
if (!csvPath) { console.error('usage: node scripts/build-dict.mjs <ecdict.csv>'); process.exit(1); }

export const normalize = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');

// 1. Words in the Bible text.
const wanted = new Set();
for (const f of fs.readdirSync(path.join(root, 'public', 'bible'))) {
  for (const ch of JSON.parse(fs.readFileSync(path.join(root, 'public', 'bible', f), 'utf8'))) {
    for (const [t] of ch) for (const raw of t.split(/[\s—–]+/)) { const w = normalize(raw); if (w) wanted.add(w); }
  }
}

function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// 2. Read ECDICT; keep wanted words, and note base forms of inflected ones.
const rows = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(csvPath, 'utf8'), crlfDelay: Infinity });
let header = null;
for await (const line of rl) {
  const cols = parseCsvLine(line);
  if (!header) { header = cols; continue; }
  const row = Object.fromEntries(header.map((k, i) => [k, cols[i] ?? '']));
  const w = row.word.toLowerCase();
  if (!/^[a-z][a-z-]*$/.test(w)) continue;
  if (!rows.has(w) || row.word === w) rows.set(w, row); // prefer the lowercase headword
}
const base = (row) => (row.exchange.split('/').find((x) => x.startsWith('0:')) || '').slice(2).toLowerCase();
for (const w of [...wanted]) { const r = rows.get(w); if (r && base(r)) wanted.add(base(r)); }

// 3. Compact entries: phonetic, Chinese meanings, a few English senses, base form.
const clip = (s, lines, max) => s.split('\\n').map((x) => x.trim()).filter(Boolean).slice(0, lines).join('\n').slice(0, max);
const byLetter = {};
let n = 0, missing = 0;
for (const w of [...wanted].sort()) {
  const r = rows.get(w);
  if (!r) { missing++; continue; }
  const e = {};
  if (r.phonetic) e.p = r.phonetic;
  if (r.translation) e.t = clip(r.translation, 4, 220);
  if (r.definition) e.d = clip(r.definition, 3, 260);
  const b = base(r);
  if (b && b !== w && rows.has(b)) e.b = b;
  if (!e.t && !e.d && !e.b) { missing++; continue; }
  (byLetter[w[0]] ??= {})[w] = e;
  n++;
}
const out = path.join(root, 'public', 'dict');
fs.mkdirSync(out, { recursive: true });
for (const [letter, entries] of Object.entries(byLetter)) fs.writeFileSync(path.join(out, `${letter}.json`), JSON.stringify(entries));
console.log(`${wanted.size} words wanted, ${n} entries written, ${missing} not in ECDICT`);
