// Bible wiki: the Wikipedia article about a Bible word or name, in English and (where Wikipedia has one) Chinese.
// Plain search gives poor matches for common words ("grace bible" finds a college), so one request asks for a
// short list of Bible-specific titles at once ("Grace (Bible)", "Grace in Christianity", …) and takes the first
// that exists; the bare word ("Abraham") counts only if its opening is about the Bible.
// Wikipedia text is CC BY-SA 4.0: the app names the source and links to the article.
import fs from 'node:fs';
import path from 'node:path';

export class WikiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const UA = 'BibleStudyApp/1.0 (+https://github.com/Phenix2417/my-app)';
const MAX_TEXT = 1500;
const BIBLE_WORDS = /\b(Bible|Abrahamic|biblical|Hebrew|Israel(ite)?s?|Jesus|Christ|God|Christian(ity)?|Jewish|Judaism|Old Testament|New Testament|Genesis|Exodus|Torah|Gospels?|prophets?|apostles?|patriarchs?|Tanakh|scripture)\b/i;

export function candidateTitles(word) {
  const w = String(word).trim().toLowerCase();
  const W = w.replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  return [`${W} (Bible)`, `${W} (biblical figure)`, `${W} (biblical)`, `${W} in the Bible`, `Biblical ${w}`, `${W} in Christianity`,
    `${W} (Christianity)`, `Divine ${w}`, `${W} (theology)`, `${W} in Judaism`, W];
}

// The page a title leads to in a batch query's answer (after normalising and redirects), or null.
export function findPage(query, title) {
  let t = title;
  for (const n of query?.normalized || []) if (n.from === t) t = n.to;
  for (const r of query?.redirects || []) if (r.from === t) t = r.to;
  const p = (query?.pages || []).find((x) => x.title === t);
  return p && !p.missing && !p.invalid ? p : null;
}

// From a batch query's answer, the best page: the first candidate (in order) that exists and isn't a
// disambiguation page; the bare word only if its opening mentions the Bible.
export function pickPage(query, titles) {
  for (const [i, t] of titles.entries()) {
    const p = findPage(query, t);
    if (!p || p.pageprops?.disambiguation !== undefined || !p.extract) continue;
    if (i === titles.length - 1 && !BIBLE_WORDS.test(p.extract.slice(0, 600))) continue;
    return p;
  }
  return null;
}

const trimText = (s) => {
  const t = String(s || '').replace(/\n{2,}/g, '\n').trim();
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT).replace(/\s+\S*$/, '')}…` : t;
};
const articleUrl = (host, title) => `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

export function createWikiService({ cacheDir, fetchImpl = globalThis.fetch } = {}) {
  const inflight = new Map();
  const get = async (url, headers = {}) => {
    let res;
    try { res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000) }); } catch { return { error: 'network' }; }
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { error: 'status' };
    try { return { json: await res.json() }; } catch { return { error: 'format' }; }
  };

  async function load(word) {
    const titles = candidateTitles(word);
    const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|langlinks|pageprops',
      exintro: '1', explaintext: '1', lllang: 'zh', ppprop: 'disambiguation', titles: titles.join('|') });
    const en = await get(`https://en.wikipedia.org/w/api.php?${q}`);
    if (en.error) throw new WikiError(503, "Couldn't reach Wikipedia. Try again in a moment.");
    const page = pickPage(en.json?.query, titles);
    if (!page) return null;
    const out = { source: 'Wikipedia', license: 'CC BY-SA 4.0',
      en: { title: page.title, text: trimText(page.extract), url: articleUrl('en.wikipedia.org', page.title) }, zh: null };
    const zhTitle = page.langlinks?.[0]?.title;
    if (zhTitle) {
      // The summary endpoint gives simplified characters when asked for zh-cn.
      const zh = await get(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(zhTitle.replace(/ /g, '_'))}`, { 'Accept-Language': 'zh-cn' });
      const s = zh.json;
      if (s?.extract) out.zh = { title: s.title || zhTitle, text: trimText(s.extract), url: s.content_urls?.mobile?.page || articleUrl('zh.wikipedia.org', zhTitle) };
    }
    return out;
  }

  // Which of these names have a Bible-related Wikipedia article (for colouring names in the text). One request
  // per 16 names, asking for "Name", "Name (biblical figure)" and "Name (Bible)" with their short descriptions;
  // answers are kept (in memory and on disk) so each name is asked about once.
  let known = null;
  const knownFile = cacheDir && path.join(cacheDir, '_names.json');
  async function names(list) {
    if (!known) { known = new Map(); if (knownFile) { try { known = new Map(Object.entries(JSON.parse(await fs.promises.readFile(knownFile, 'utf8')))); } catch { /* none yet */ } } }
    const wanted = [...new Set(list.map((n) => String(n).trim()).filter((n) => /^[A-Z][a-z'-]{1,30}$/.test(n)))].slice(0, 80);
    const todo = wanted.filter((n) => !known.has(n));
    for (let i = 0; i < todo.length; i += 16) {
      const batch = todo.slice(i, i + 16);
      const titles = batch.flatMap((n) => [n, `${n} (biblical figure)`, `${n} (Bible)`]);
      const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'description|pageprops', ppprop: 'disambiguation', titles: titles.join('|') });
      const r = await get(`https://en.wikipedia.org/w/api.php?${q}`);
      if (!r.json?.query) break; // unreachable: try again another time
      const query = r.json.query;
      for (const n of batch) {
        // A qualified title ("Name (biblical figure)") counts if it exists; the bare name if its description is about the Bible.
        const ok = [n, `${n} (biblical figure)`, `${n} (Bible)`].some((t, j) => {
          const p = findPage(query, t);
          return p && p.pageprops?.disambiguation === undefined && (j > 0 || BIBLE_WORDS.test(p.description || ''));
        });
        known.set(n, ok);
      }
    }
    if (knownFile && todo.length) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(knownFile, JSON.stringify(Object.fromEntries(known))); } catch { /* best effort */ } }
    return wanted.filter((n) => known.get(n));
  }

  const wiki = async function wiki(raw) {
    const word = String(raw ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z' -]{0,59}$/.test(word)) throw new WikiError(400, 'Not a word');
    const file = cacheDir && path.join(cacheDir, `${encodeURIComponent(word)}.json`);
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    if (!inflight.has(word)) inflight.set(word, load(word).finally(() => inflight.delete(word)));
    const value = await inflight.get(word);
    if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
    return value;
  };
  wiki.names = names;
  return wiki;
}
