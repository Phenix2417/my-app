// Easton's Bible Dictionary (1897, public domain): entries for a word, looked up on the server so phones
// only download the entry they need. Headwords like "Word, The" or "Adam, the city of" are found by the
// part before the comma.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createBibleDictionary({ file = path.join(here, 'data', 'eastons.json'), entries = null } = {}) {
  let index = null;
  const build = () => {
    index = new Map();
    let list = entries;
    if (!list) { try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; } }
    for (const [term, defs] of list) {
      const key = term.split(',')[0].trim().toLowerCase();
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ term, definitions: defs });
    }
  };
  return function lookUp(raw) {
    if (!index) build();
    const word = String(raw || '').toLowerCase().trim();
    if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return null;
    const found = index.get(word);
    // The plain headword first ("Word, The" before "Word of God"), at most three entries.
    return found ? { source: "Easton's Bible Dictionary (1897)", entries: found.slice(0, 3) } : null;
  };
}
