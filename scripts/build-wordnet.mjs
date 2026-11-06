// Builds public/wordnet/<letter>.json: English definitions (with an example where WordNet has one) for every
// word in the app's dictionary, from Princeton WordNet 3.1 (the `wordnet-db` npm package; licence in
// public/wordnet/LICENSE). Used when the online Free Dictionary has no entry or can't be reached.
//   npm pack wordnet-db@3.1.14 && tar xzf wordnet-db-3.1.14.tgz && node scripts/build-wordnet.mjs package
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = process.argv[2];
if (!pkg) { console.error('usage: node scripts/build-wordnet.mjs <wordnet-db package dir>'); process.exit(1); }
const dict = path.join(pkg, 'dict');
const outDir = path.join(root, 'public', 'wordnet');

const wanted = new Set();
for (const f of fs.readdirSync(path.join(root, 'public', 'dict'))) if (/^[a-z]\.json$/.test(f)) {
  for (const w of Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'public', 'dict', f), 'utf8')))) wanted.add(w);
}

const POS = { noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.' };
const out = {};
const weight = {}; // word -> { label: number of WordNet meanings }, to put a word's main part of speech first
for (const [file, label] of Object.entries(POS)) {
  const data = fs.readFileSync(path.join(dict, `data.${file}`)); // offsets in the index are byte offsets here
  const lineAt = (off) => data.subarray(off, data.indexOf(10, off)).toString('utf8');
  for (const line of fs.readFileSync(path.join(dict, `index.${file}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const parts = line.trim().split(/\s+/);
    const word = parts[0].replace(/_/g, ' ');
    if (!wanted.has(word)) continue;
    const pCnt = +parts[3], synCnt = +parts[2];
    const offsets = parts.slice(4 + pCnt + 2, 4 + pCnt + 2 + synCnt);
    (weight[word] ||= {})[label] = synCnt;
    for (const off of offsets.slice(0, 4)) { // the most common senses first
      const gloss = lineAt(+off).split(' | ')[1]?.trim() || '';
      const [def, ...rest] = gloss.split(/;\s*(?=")/);
      const ex = rest.map((x) => x.replace(/^"|"$/g, '').trim()).find(Boolean);
      if (!def) continue;
      (out[word] ||= []);
      if (out[word].length < 10) out[word].push(ex ? [label, def.trim(), ex] : [label, def.trim()]);
    }
  }
}
for (const [w, rows] of Object.entries(out)) rows.sort((a, b) => (weight[w][b[0]] || 0) - (weight[w][a[0]] || 0)); // stable within a part of speech
fs.mkdirSync(outDir, { recursive: true });
const byLetter = {};
for (const [w, rows] of Object.entries(out)) (byLetter[w[0]] ||= {})[w] = rows;
for (const [l, rows] of Object.entries(byLetter)) if (/[a-z]/.test(l)) fs.writeFileSync(path.join(outDir, `${l}.json`), JSON.stringify(rows));
fs.copyFileSync(path.join(pkg, 'LICENSE'), path.join(outDir, 'LICENSE'));
console.log(`${Object.keys(out).length} of ${wanted.size} words have WordNet definitions`);
