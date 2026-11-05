// English → Chinese translation of a selected passage, from Youdao's dictionary service (the same source
// as the pronunciations). Results are cached in memory and on disk so each passage is asked about once.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class TranslateError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const MAX_LEN = 600;

export function createTranslateService({ cacheDir, fetchImpl = globalThis.fetch, upstream = 'https://dict.youdao.com/jsonapi_s', memoryLimit = 500 } = {}) {
  const memory = new Map();
  const inflight = new Map();

  // One request. Youdao sometimes answers a different query (it guesses at short phrases), so only a reply
  // about exactly what we sent counts.
  async function ask(q) {
    let res;
    try {
      res = await fetchImpl(`${upstream}?doctype=json&jsonversion=4&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
    } catch { return { error: 'network' }; }
    if (!res.ok) return { error: 'status' };
    let d;
    try { d = await res.json(); } catch { return { error: 'format' }; }
    const same = String(d?.input ?? '').trim().toLowerCase() === q.trim().toLowerCase();
    const tran = d?.fanyi?.tran;
    return same && typeof tran === 'string' && tran.trim() ? { text: tran.trim() } : { error: 'none' };
  }

  async function load(text) {
    const file = cacheDir && path.join(cacheDir, `${crypto.createHash('sha1').update(text).digest('hex')}.json`);
    if (file) { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { /* not cached */ } }
    // A sentence-ending full stop makes Youdao translate rather than look the phrase up as a word.
    const attempts = [text];
    if (!/[.!?。]$/.test(text)) attempts.push(`${text}.`);
    let last;
    for (const q of attempts) {
      last = await ask(q);
      if (last.text) {
        const value = { text: last.text };
        if (file) { try { await fs.promises.mkdir(cacheDir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(value)); } catch { /* best effort */ } }
        return value;
      }
    }
    if (last.error === 'network' || last.error === 'status') throw new TranslateError(503, "Couldn't reach the translation service. Try again in a moment.");
    throw new TranslateError(404, 'No translation for this selection.');
  }

  return async function translate(raw) {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new TranslateError(400, 'Nothing to translate');
    if (text.length > MAX_LEN) throw new TranslateError(400, 'That selection is too long to translate. Try a shorter part.');
    if (memory.has(text)) return memory.get(text);
    if (!inflight.has(text)) inflight.set(text, load(text).finally(() => inflight.delete(text)));
    const value = await inflight.get(text);
    memory.set(text, value);
    if (memory.size > memoryLimit) memory.delete(memory.keys().next().value);
    return value;
  };
}
