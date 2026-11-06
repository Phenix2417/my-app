// Builds public/wikt/<letter>.json: Chinese (Mandarin, simplified) translations of English words, by meaning,
// from Wiktionary (CC BY-SA 4.0, https://en.wiktionary.org) via the wiktextract extract at kaikki.org.
// ECDICT's Chinese comes first in the app, so only Bible words ECDICT lacks are kept (mostly names and places). The extract is large (~3.4 GB),
// so it's read as it downloads and never saved:
//   curl -sL https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl | node scripts/build-wiktionary-zh.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictDir = path.join(root, 'public', 'dict');
const outDir = path.join(root, 'public', 'wikt');

const normalize = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');
const inEcdict = new Set();
for (const f of fs.readdirSync(dictDir)) if (/^[a-z]\.json$/.test(f)) for (const w of Object.keys(JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8')))) inEcdict.add(w);
const wanted = new Set();
for (const f of fs.readdirSync(path.join(root, 'public', 'bible'))) {
  for (const ch of JSON.parse(fs.readFileSync(path.join(root, 'public', 'bible', f), 'utf8'))) {
    for (const [t] of ch) for (const raw of t.split(/[\s—–]+/)) { const w = normalize(raw); if (w && !inEcdict.has(w)) wanted.add(w); }
  }
}

const POS = { noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.', pron: 'pron.', prep: 'prep.', conj: 'conj.', intj: 'int.', num: 'num.', det: 'det.', article: 'art.', name: 'n.' };
// "優雅／优雅" → "优雅"; traditional-only forms are skipped.
const simplified = (t) => {
  const tags = (t.tags || []).join(' ');
  if (/Traditional/i.test(tags) && !/Simplified/i.test(tags)) return null;
  const w = String(t.word || '').split(/[／/]/).pop().trim();
  return w && /[㐀-鿿]/.test(w) && w.length <= 20 ? w : null;
};
// Mandarin is labelled either with the code cmn or as "Chinese Mandarin" under zh; other Chinese languages
// (Cantonese, Hokkien, Dungan…) share zh, so the name decides.
const isMandarin = (t) => t.lang === 'Chinese Mandarin' || t.lang === 'Mandarin' || ((t.code === 'cmn' || t.lang_code === 'cmn') && !/Hokkien|Cantonese|Min|Wu|Hakka|Dungan/.test((t.tags || []).join(' ')));

const out = new Map(); // word -> [[pos, sense, "译1、译2"], ...]
let lines = 0, kept = 0;
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (++lines % 200000 === 0) process.stderr.write(`${lines} lines, ${kept} words\n`);
  if (!line.startsWith('{')) continue;
  if (!line.includes('Chinese Mandarin') && !line.includes('"cmn"')) continue; // only entries with Mandarin translations are worth parsing
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'en' || !wanted.has(String(e.word).toLowerCase())) continue;
  const trs = [...(e.translations || []), ...(e.senses || []).flatMap((s) => (s.translations || []).map((t) => ({ sense: s.glosses?.[0], ...t })))];
  const bySense = new Map();
  for (const t of trs) {
    if (!isMandarin(t)) continue;
    const w = simplified(t);
    if (!w) continue;
    const sense = String(t.sense || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!bySense.has(sense)) bySense.set(sense, []);
    const list = bySense.get(sense);
    if (!list.includes(w) && list.length < 6) list.push(w);
  }
  if (!bySense.size) continue;
  const rows = out.get(e.word.toLowerCase()) || [];
  for (const [sense, zh] of bySense) if (rows.length < 12) rows.push([POS[e.pos] || '', sense, zh.join('、')]);
  if (!out.has(e.word.toLowerCase())) kept++;
  out.set(e.word.toLowerCase(), rows);
}
fs.mkdirSync(outDir, { recursive: true });
const byLetter = new Map();
for (const [w, rows] of out) { const l = w[0]; if (!/[a-z]/.test(l)) continue; if (!byLetter.has(l)) byLetter.set(l, {}); byLetter.get(l)[w] = rows; }
for (const [l, data] of byLetter) fs.writeFileSync(path.join(outDir, `${l}.json`), JSON.stringify(data));
fs.writeFileSync(path.join(outDir, 'LICENSE'), 'Chinese translations from Wiktionary (https://en.wiktionary.org), available under the Creative Commons Attribution-ShareAlike 4.0 licence (https://creativecommons.org/licenses/by-sa/4.0/). Extracted with wiktextract (https://kaikki.org). Only words used in the Bible text that ECDICT lacks are included.\n');
console.log(`${lines} lines read; ${out.size} words with Chinese translations (of ${wanted.size} wanted)`);
