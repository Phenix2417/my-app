// Builds server/data/topics.json: every topic title (no text) in Torrey's (FHL N=0) and Nave's (N=1)
// Topical Bibles, as [book, topicNumber, title]. The server uses it to tell, without any request,
// whether a word has a Bible dictionary entry.   node scripts/build-topic-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'data', 'topics.json');
const rows = [];
for (const book of [0, 1]) {
  const res = await fetch(`https://bible.fhl.net/json/st.php?N=${book}&gb=1`);
  const data = JSON.parse((await res.text()).replace(/"book":\s*,/g, '"book":null,'));
  for (const r of data.record || []) rows.push([book, Number(String(r.id).replace(/\D/g, '')), String(r.topic).trim()]);
}
rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} topics -> ${out}`);
