// Easton's Bible Dictionary (1897) and the International Standard Bible Encyclopedia (1915), both public domain,
// from CrossWire's SWORD modules (built into server/data by scripts/build-encyclopedias.mjs). Each is loaded the
// first time it's needed; whether a word has an entry is answered from memory, with no outside request.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SOURCES = {
  easton: { name: "Easton's Bible Dictionary (1897)", file: 'easton.json.gz' },
  isbe: { name: 'International Standard Bible Encyclopedia (1915)', file: 'isbe.json.gz' },
};
// Everyday English words: coloured for the ISBE only when another dictionary has them too.
const COMMON_WORDS = new Set(('after again against all also always among another any away back because become before began behind being below '
  + 'best better between both bring came cannot come could day days did do does done down during each early end enough even ever every far few '
  + 'find first found four from gave get give given go going good got great had half hand hands has have having he her here high him himself his '
  + 'how into its itself just keep kind knew know large last later least left less let like little long look made make making many may me might '
  + 'more most much must my never new next no none nor not nothing now of off often old on once one only open or other others our out over own part '
  + 'place put rather right said same saw say see seen several shall she should show side since small so some something still such take taken than '
  + 'that the their them then there these they thing things think this those though three through thus to together too took toward turn turned two '
  + 'under until up upon us use used very want was way we well went were what when where whether which while who whole whom whose why will with '
  + 'within without would yet you your able above across almost already although become came either else full however indeed instead less mean '
  + 'means near nearly neither person quite ready real really say seem seemed seems set short sure taking tell told true upon usually whatever wish').split(' '));
const MAX_TEXT = 60000; // the longest ISBE articles run to 340,000 characters
const MAX_ENTRIES = 3;

// "ABEL (1)" -> ["abel"]; "LIGHT; LIGHTNESS" -> ["light", "lightness"]; "ABRAHAM’S BOSOM" -> ["abraham's bosom"]
export function headwords(key) {
  return String(key).split(';').map((k) => k.replace(/\(\d+\)/g, '').replace(/[’]/g, "'").replace(/[.!]+$/, '').trim().toLowerCase()).filter(Boolean);
}
// Simple English base forms, so "kings", "loved", "blessing" find "king", "love", "bless".
export const baseForms = (w) => [...new Set([w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e')])].filter((f) => f.length > 1);

export function createEncyclopedias({ dir = path.join(here, 'data'), data = null } = {}) {
  const loaded = {};
  const load = (source) => {
    if (!loaded[source]) {
      let entries = data?.[source];
      if (!entries) { try { entries = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, SOURCES[source].file)))); } catch { entries = []; } }
      const index = new Map(); // headword -> [entry numbers]
      entries.forEach(([key], i) => { for (const w of headwords(key)) { if (!index.has(w)) index.set(w, []); index.get(w).push(i); } });
      loaded[source] = { entries, index };
    }
    return loaded[source];
  };
  const normalize = (raw) => { const w = String(raw || '').toLowerCase().replace(/[’]/g, "'").trim(); return /^[a-z][a-z' ,-]{0,60}$/.test(w) ? w : null; };
  // The entry numbers for a word: the word itself, else its first base form that has entries.
  const find = (source, raw) => {
    const word = normalize(raw);
    if (!word) return [];
    const { index } = load(source);
    for (const f of baseForms(word)) if (index.has(f)) return index.get(f).slice(0, MAX_ENTRIES);
    // "baptism" -> "BAPTISM, CHRISTIAN" (an entry filed under a longer heading)
    for (const [h, list] of index) if (h.startsWith(`${word}, `)) return list.slice(0, MAX_ENTRIES);
    return [];
  };

  return {
    // Which sources have an entry for this word: { easton: true, isbe: false }.
    has(raw) { return Object.fromEntries(Object.keys(SOURCES).map((s) => [s, find(s, raw).length > 0])); },
    // Which of these words have an Easton entry (for colouring the Bible text; ISBE also covers ordinary words
    // like "after" and "again", so it isn't used for that).
    // Which sources have each word (for colouring the Bible text): { word: ['easton', 'isbe'] }. The ISBE also has
    // studies of everyday words ("after", "again"); those count only when another dictionary has the word too.
    marks(words, skip = new Set(), others = new Set()) {
      const out = {};
      for (const w of new Set(words)) {
        const n = normalize(w);
        if (!n || skip.has(n)) continue;
        const easton = find('easton', n).length > 0;
        const isbe = find('isbe', n).length > 0 && (!COMMON_WORDS.has(n) || easton || others.has(w));
        const list = [easton && 'easton', isbe && 'isbe'].filter(Boolean);
        if (list.length) out[w] = list;
      }
      return out;
    },
    entry(source, raw) {
      if (!SOURCES[source]) return null;
      const found = find(source, raw);
      if (!found.length) return null;
      const { entries } = load(source);
      return { source: SOURCES[source].name, entries: found.map((i) => {
        const [key, text] = entries[i];
        return { term: key, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT).replace(/\s+\S*$/, '')}…` : text };
      }) };
    },
  };
}
