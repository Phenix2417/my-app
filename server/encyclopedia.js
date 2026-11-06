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
    marks(words, skip = new Set()) { return [...new Set(words)].filter((w) => { const n = normalize(w); return n && !skip.has(n) && find('easton', n).length > 0; }); },
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
