// Chinese Bible dictionary: the 信望愛 (FHL) Chinese translations of Nave's and Torrey's Topical Bibles
// (originals public domain; FHL's own material may be reused freely, see fhl.net/main/fhl/fhl8.html).
// An English word is matched to English topic titles, then the same topics are fetched in Chinese.
// Results are cached in memory and on disk.
import fs from 'node:fs';
import path from 'node:path';

export class BibleDictError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// FHL's JSON sometimes has an empty value ("book":,); patch that before parsing.
export function parseFhlJson(text) {
  return JSON.parse(String(text).replace(/"book":\s*,/g, '"book":null,'));
}

// Topic text uses "#refs|" for verse references, "-" / "." for list levels and occasional links.
export function cleanTopicText(raw) {
  return String(raw).replace(/\r\n?/g, '\n')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, '')
    .replace(/#([^|#]*)\|/g, (m, refs) => `（${refs.replace(/\s*\n\s*/g, ' ').trim()}）`)
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^-\s*/, '• ').replace(/^\.\s*/, '　· '))
    .join('\n')
    .replace(/\n(（[^）]*）)/g, ' $1'); // keep each reference list on its point's line
}

// Topic titles that are about this word: "Grace", "GRACE OF GOD", "Grace, means of" — not "SWORD" or "GRACES".
export function topicMatches(title, word) {
  const t = String(title).toLowerCase().trim();
  return t === word || t.startsWith(`${word} `) || t.startsWith(`${word},`);
}

export function createBibleDictionary({ cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://bible.fhl.net/json/st.php', maxTopics = 3 } = {}) {
  const memory = new Map();
  const inflight = new Map();

  async function call(params) {
    let res;
    try { res = await fetchImpl(`${upstream}?${new URLSearchParams({ ...params, gb: '1' })}`, { signal: AbortSignal.timeout(15000) }); } catch {
      throw new BibleDictError(503, "Couldn't reach the Bible dictionary.");
    }
    if (!res.ok) throw new BibleDictError(503, "The Bible dictionary isn't responding right now.");
    try { return parseFhlJson(await res.text()); } catch { throw new BibleDictError(502, 'The Bible dictionary sent something unexpected'); }
  }

  async function load(word) {
    const file = cacheDir && path.join(cacheDir, `${word}.json`);
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    // English Torrey (N=0) and Nave (N=1) topics whose title is about this word.
    const found = [];
    for (const [en, zh] of [['0', '2'], ['1', '3']]) {
      const d = await call({ N: en, keyword: word });
      for (const r of d?.record || []) if (topicMatches(r.topic, word)) found.push({ id: r.id, english: r.topic, zhN: zh, exact: r.topic.toLowerCase() === word });
    }
    found.sort((a, b) => b.exact - a.exact);
    const entries = [];
    for (const t of found.slice(0, maxTopics)) {
      const d = await call({ N: t.zhN, k: String(t.id).replace(/\D/g, '') });
      const r = d?.record?.[0];
      if (r?.topic && r?.text) entries.push({ term: String(r.topic).trim(), english: t.english, text: cleanTopicText(r.text) });
    }
    const value = entries.length ? { source: '信望爱 主题查经（Nave’s / Torrey’s 中译）', entries } : null;
    if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  }

  return async function lookUp(raw) {
    const word = String(raw || '').toLowerCase().trim();
    if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return null;
    if (memory.has(word)) return memory.get(word);
    if (!inflight.has(word)) inflight.set(word, load(word).finally(() => inflight.delete(word)));
    const value = await inflight.get(word);
    memory.set(word, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    return value;
  };
}
