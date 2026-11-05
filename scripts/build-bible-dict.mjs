// Builds server/data/eastons.json from Easton's Bible Dictionary (1897, public domain), JSONL with
// {term, definitions[]} per line (e.g. github.com/garydavenport73/eastons-bible-dictionary-json, eastons.jsonl).
//   node scripts/build-bible-dict.mjs path/to/eastons.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-bible-dict.mjs <eastons.jsonl>'); process.exit(1); }
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'data', 'eastons.json');
const entries = [];
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { term, definitions } = JSON.parse(line);
  const defs = (Array.isArray(definitions) ? definitions : [definitions]).map((d) => String(d).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (term && defs.length) entries.push([String(term).trim(), defs]);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(entries));
console.log(`${entries.length} entries -> ${out}`);
