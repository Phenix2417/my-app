// Builds server/data/name-phonetics.json: UK/US phonetic symbols for words in the Bible text that the
// English dictionary (public/dict) lacks — mostly names and places. Sources:
//   * ipa-dict (MIT), github.com/open-dict-data/ipa-dict, data/en_US.txt and en_UK.txt (pass their paths)
//   * optionally Wiktionary (CC BY-SA) with --wiktionary (50 titles per request; it rate-limits busy networks).
//     Without it, the server asks Wiktionary per name on first lookup instead (server/pronounce.js).
//   node scripts/build-name-phonetics.mjs path/to/en_US.txt path/to/en_UK.txt [--wiktionary]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [usFile, ukFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const useWiktionary = process.argv.includes('--wiktionary');
const key = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');

const dict = new Set();
for (const f of fs.readdirSync(path.join(root, 'public', 'dict'))) if (f.endsWith('.json')) for (const w of Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'public', 'dict', f), 'utf8')))) dict.add(w);
// Missing words, with the spelling used in the text (names are capitalised).
const missing = new Map();
for (const f of fs.readdirSync(path.join(root, 'public', 'bible'))) {
  for (const ch of JSON.parse(fs.readFileSync(path.join(root, 'public', 'bible', f), 'utf8'))) {
    for (const [t] of ch) for (const raw of t.split(/[\s—–]+/)) {
      const w = key(raw); if (!w || dict.has(w) || missing.has(w)) continue;
      const clean = raw.replace(/[’']s$/, '').replace(/[^A-Za-z-]/g, '');
      missing.set(w, clean[0] === clean[0]?.toUpperCase() ? clean : w);
    }
  }
}
const out = {}; // word -> { uk, us }
const put = (w, accent, ipa) => { ipa = ipa.replace(/^\/|\/$/g, '').trim(); if (!ipa) return; out[w] ??= {}; if (!out[w][accent]) out[w][accent] = ipa; };

// Wiktionary: English section, lines with {{IPA|en|/…/}}, labelled UK/RP or US/GA where given.
const titles = useWiktionary ? [...missing.values()] : [];
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const url = `https://en.wiktionary.org/w/api.php?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`;
  let data = null;
  for (let attempt = 0; attempt < 6 && !data; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'BibleStudyApp/1.0 (personal Bible study app; build script)' } });
    const body = await res.text();
    try { data = JSON.parse(body); } catch { await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); } // rate-limited: wait and retry
  }
  if (!data) { console.warn(`skipped batch ${i / 50}`); continue; }
  for (const page of data?.query?.pages || []) {
    const text = page?.revisions?.[0]?.slots?.main?.content;
    if (!text) continue;
    const en = text.split(/\n==English==\n/)[1]?.split(/\n==[^=]/)[0] || '';
    for (const line of en.split('\n')) {
      for (const m of line.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
        const parts = m[1].split('|');
        const ipa = parts.find((x) => /^[/[]/.test(x));
        if (!ipa) continue;
        const label = `${line} ${parts.join(' ')}`;
        const uk = /\b(UK|RP|British)\b/.test(label), us = /\b(US|GA|GenAm|American)\b/.test(label);
        const w = key(page.title);
        if (uk || !us) put(w, 'uk', ipa);
        if (us || !uk) put(w, 'us', ipa);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 2000)); // be polite
}
const fromWiki = Object.keys(out).length;

// ipa-dict fills gaps.
for (const [file, accent] of [[usFile, 'us'], [ukFile, 'uk']]) {
  if (!file) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [w, ipas] = line.split('\t');
    if (w && ipas && missing.has(w.toLowerCase())) put(w.toLowerCase(), accent, ipas.split(',')[0]);
  }
}
fs.mkdirSync(path.join(root, 'server', 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'server', 'data', 'name-phonetics.json'), JSON.stringify(out));
console.log(`${missing.size} words missing from the dictionary; phonetics found for ${Object.keys(out).length} (${fromWiki} from Wiktionary)`);
