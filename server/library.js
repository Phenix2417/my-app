// Digital books uploaded by each person: files kept on disk, one folder per user.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const MAX_BOOK_BYTES = 60 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024;
export const MAX_COVER_BYTES = 600 * 1024;
export const BOOK_TYPES = { epub: 'application/epub+zip', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8' };

export class LibraryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// What a file really is, from its first bytes (the name and the phone's guess aren't trusted).
export function sniffFormat(head, declared) {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    // An EPUB is a zip that normally names itself in its first file; some don't, so trust the app's check then.
    return head.includes(Buffer.from('application/epub+zip')) || declared === 'epub' ? 'epub' : null;
  }
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (head.length && !head.includes(0)) return 'txt'; // text has no zero bytes (UTF-16 isn't supported)
  return null;
}
export function sniffImage(head) {
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export function createLibraryStore({ dir, blobs = null }) {
  const userDir = (userId) => path.join(dir, String(Number(userId)));
  const fileOf = (userId, id) => path.join(userDir(userId), `${id}.book`);
  const coverOf = (userId, id) => path.join(userDir(userId), `${id}.cover`);

  // Stream an upload to a temporary file, refusing it once it passes `limit` bytes. Returns { tmp, size, head }.
  async function receive(req, userId, limit) {
    await fs.promises.mkdir(userDir(userId), { recursive: true });
    const tmp = path.join(userDir(userId), `.upload-${crypto.randomBytes(8).toString('hex')}`);
    let size = 0, head = Buffer.alloc(0);
    const hash = crypto.createHash('sha256'); // the file's fingerprint, to spot the same book uploaded twice
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > limit) return cb(new LibraryError(413, 'That file is too large.'));
        if (head.length < 4096) head = Buffer.concat([head, chunk.subarray(0, 4096 - head.length)]);
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try { await pipeline(req, counter, fs.createWriteStream(tmp)); } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e instanceof LibraryError ? e : new LibraryError(400, 'The upload was interrupted.');
    }
    return { tmp, size, head, sha256: hash.digest('hex') };
  }

  return {
    receive,
    // sha: the file's SHA-256, so an identical file anywhere on the server is kept only once.
    async keep(tmp, userId, id, { cover = false, sha = null } = {}) {
      const to = cover ? coverOf(userId, id) : fileOf(userId, id);
      await fs.promises.rename(tmp, to);
      if (blobs && sha) await blobs.adopt(to, sha);
    },
    // Put a file already on the server (e.g. sent in chat) on a shelf: the same stored copy, not a new one.
    async keepShared(from, userId, id, { cover = false } = {}) {
      await fs.promises.mkdir(userDir(userId), { recursive: true });
      const to = cover ? coverOf(userId, id) : fileOf(userId, id);
      if (blobs) await blobs.share(from, to); else await fs.promises.copyFile(from, to);
    },
    async discard(tmp) { await fs.promises.rm(tmp, { force: true }); },
    async remove(userId, id) {
      await fs.promises.rm(fileOf(userId, id), { force: true });
      await fs.promises.rm(coverOf(userId, id), { force: true });
    },
    // A Bible version added from the person's own ebook: one JSON file per Bible book.
    async saveVersionBook(userId, versionId, book, json) {
      const dir = path.join(userDir(userId), 'versions', versionId);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${book}.json`), json);
    },
    async readVersionBook(userId, versionId, book) {
      try { return JSON.parse(await fs.promises.readFile(path.join(userDir(userId), 'versions', versionId, `${book}.json`), 'utf8')); } catch { return null; }
    },
    // The Bible books saved so far for a version (an import stopped partway leaves some out).
    async versionBooks(userId, versionId) {
      try { return (await fs.promises.readdir(path.join(userDir(userId), 'versions', versionId))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
    },
    async removeVersion(userId, versionId) { await fs.promises.rm(path.join(userDir(userId), 'versions', versionId), { recursive: true, force: true }); },
    // Fingerprint of a book already kept (for books uploaded before fingerprints were recorded).
    async fingerprint(userId, id) {
      const h = crypto.createHash('sha256');
      try { await pipeline(fs.createReadStream(fileOf(userId, id)), h); return h.digest('hex'); } catch { return null; }
    },
    async read(userId, id, { cover = false } = {}) {
      const file = cover ? coverOf(userId, id) : fileOf(userId, id);
      try { const st = await fs.promises.stat(file); return { file, size: st.size }; } catch { return null; }
    },
  };
}
