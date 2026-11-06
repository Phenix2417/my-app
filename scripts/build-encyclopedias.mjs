// Build server/data/easton.json.gz and server/data/isbe.json.gz from CrossWire's SWORD modules (both public domain):
//   curl -O https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/Easton.zip   (and ISBE.zip), unzip each into its own folder, then
//   node scripts/build-encyclopedias.mjs <Easton folder> <ISBE folder>
// Each file is a gzipped JSON array of [headword, text]. In the text, paragraphs are separated by "\n" and Bible
// references are written ⟦Gen.6.8|Gen. 6:8⟧ (OSIS reference | the words shown) and links to other entries ⟦@ABRAHAM|ABRAHAM⟧,
// so the app can make them tappable.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readZld } from './sword-zld.mjs';
import { headwords } from '../server/encyclopedia.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ''), /^#x/i.test(e) ? 16 : 10)) : (ENT[e] ?? m));

export function cleanEntry(raw) {
  return decode(String(raw)
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    // "See ABRAHAM": a link to another entry, written ⟦@ABRAHAM|ABRAHAM⟧
    .replace(/<ref\b[^>]*target="(?:[A-Za-z]+:)?([^"]+)"[^>]*>([\s\S]*?)<\/ref>/g, (m, key, label) => `⟦@${key.trim()}|${label.replace(/<[^>]+>/g, '').trim()}⟧`)
    .replace(/<ref\b[^>]*osisRef="(?:Bible:)?([^"]+)"[^>]*>([\s\S]*?)<\/ref>/g, (m, osis, label) => `⟦${osis.replace(/Bible:/g, '')}|${label.replace(/<[^>]+>/g, '').trim()}⟧`)
    .replace(/<lb\s*\/?>|<\/p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/(^|[\s(\[“"'’‘`-])_([^_\n]+?)_(?=[\s).,;:!?\]”"'’-]|$)/g, '$1$2') // _italics_ in the source text
    .replace(/(^|\s)_(?=\S)|(?<=\S)_(?=\s|$)/g, '$1')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// Links to other entries: keep those that lead somewhere (the exact headword, or the first "WORD, …" entry), written
// with the headword the app looks up (⟦@baptism|BAPTISM⟧); any other (a section inside an article) becomes plain text.
export function resolveLinks(entries) {
  const words = new Set(entries.flatMap(([k]) => headwords(k)));
  const target = (raw) => {
    const k = raw.replace(/’/g, "'").replace(/\(\d+\)/g, '').replace(/[.:]+$/, '').trim().toLowerCase();
    if (words.has(k)) return k;
    return [...words].some((w) => w.startsWith(`${k}, `)) ? k : null;
  };
  return entries.map(([key, text]) => [key, text.replace(/⟦@([^|⟧]*)\|([^⟧]*)⟧/g, (m, k, label) => { const t = target(k); return t ? `⟦@${t}|${label}⟧` : label; })]);
}

function build(dir, name, out) {
  const conf = fs.readFileSync(path.join(dir, 'mods.d', `${name}.conf`), 'utf8');
  if (!/DistributionLicense=Public Domain/i.test(conf)) throw new Error(`${name} is not marked public domain`);
  const base = path.join(dir, conf.match(/DataPath=\.?\/?(.+)/)[1].trim());
  const entries = resolveLinks(readZld(base).map(([k, t]) => [k, cleanEntry(t)]).filter(([k, t]) => k && t));
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(entries), { level: 9 }));
  console.log(`${name}: ${entries.length} entries → ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [easton, isbe] = process.argv.slice(2);
  if (!easton || !isbe) { console.error('usage: node scripts/build-encyclopedias.mjs <Easton folder> <ISBE folder>'); process.exit(1); }
  build(easton, 'easton', path.join(here, '..', 'server', 'data', 'easton.json.gz'));
  build(isbe, 'isbe', path.join(here, '..', 'server', 'data', 'isbe.json.gz'));
}
