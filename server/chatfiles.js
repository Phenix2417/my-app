// Files sent in chat (photos, videos, voice and video recordings, documents): kept on disk under a random id.
// The id is the key to the file: it's only ever given to the people in the conversation, and pictures, videos and
// voice messages are loaded by the page's own <img>/<video>/<audio>, which can't send a sign-in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const MAX_CHAT_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_CHAT_BYTES_PER_USER = 2 * 1024 * 1024 * 1024;
// Files are kept for a month after they're sent, then deleted (their messages then say the file has expired).
export const CHAT_FILE_DAYS = 30;

export class ChatFileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// What a file really is, from its first bytes; `declared` (the phone's guess) only decides between audio and video
// for containers that hold either. Anything not recognised is a plain file (downloaded, never shown in the page).
export function sniffChatFile(head, declared = '') {
  const s = (a, b) => head.subarray(a, b).toString('latin1');
  const audio = /^audio\//.test(declared);
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', type: 'image/jpeg' };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', type: 'image/png' };
  if (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a') return { kind: 'image', type: 'image/gif' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return { kind: 'image', type: 'image/webp' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { kind: 'audio', type: 'audio/wav' };
  if (s(4, 8) === 'ftyp') {
    const brand = s(8, 12);
    if (brand === 'M4A ' || brand === 'M4B ' || audio) return { kind: 'audio', type: 'audio/mp4' };
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return { kind: 'file', type: 'application/octet-stream' }; // HEIC: most browsers can't show it
    return { kind: 'video', type: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4' };
  }
  // Books: shown as a book (with its cover) but only ever downloaded.
  if (s(0, 4) === 'PK\u0003\u0004' && head.includes(Buffer.from('application/epub+zip'))) return { kind: 'file', type: 'application/epub+zip' };
  if (s(0, 5) === '%PDF-') return { kind: 'file', type: 'application/pdf' };
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return audio ? { kind: 'audio', type: 'audio/webm' } : { kind: 'video', type: 'video/webm' };
  if (s(0, 4) === 'OggS') return { kind: 'audio', type: 'audio/ogg' };
  if (s(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe6) === 0xe2)) return { kind: 'audio', type: 'audio/mpeg' };
  if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return { kind: 'audio', type: 'audio/aac' };
  return { kind: 'file', type: 'application/octet-stream' };
}

export function createChatFileStore({ dir, blobs = null }) {
  const fileOf = (id) => path.join(dir, id.slice(0, 2), id);
  return {
    // Stream an upload to disk, refusing it past `limit` bytes. Returns { id, size, head, sha256 }.
    async receive(req, limit) {
      const id = crypto.randomBytes(16).toString('hex');
      await fs.promises.mkdir(path.dirname(fileOf(id)), { recursive: true });
      const tmp = `${fileOf(id)}.part`;
      let size = 0, head = Buffer.alloc(0);
      const hash = crypto.createHash('sha256');
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          if (size > limit) return cb(new ChatFileError(413, 'That file is too large.'));
          if (head.length < 4096) head = Buffer.concat([head, chunk.subarray(0, 4096 - head.length)]);
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      try { await pipeline(req, counter, fs.createWriteStream(tmp)); } catch (e) {
        await fs.promises.rm(tmp, { force: true });
        throw e instanceof ChatFileError ? e : new ChatFileError(400, 'The upload was interrupted.');
      }
      if (!size) { await fs.promises.rm(tmp, { force: true }); throw new ChatFileError(400, 'That file is empty.'); }
      await fs.promises.rename(tmp, fileOf(id));
      const sha256 = hash.digest('hex');
      if (blobs) await blobs.adopt(fileOf(id), sha256); // the same file sent before (or on a shelf) is kept once
      return { id, size, head, sha256 };
    },
    // Files on disk with no record (and sends left unfinished), last linked or written before `before`.
    async sweepOrphans(isKnown, before) {
      let n = 0;
      for (const sub of await fs.promises.readdir(dir).catch(() => [])) {
        for (const name of await fs.promises.readdir(path.join(dir, sub)).catch(() => [])) {
          const p = path.join(dir, sub, name);
          const unused = /^[0-9a-f]{32}$/.test(name) ? !isKnown(name) : /\.(part|lnk)$/.test(name);
          try { const st = await fs.promises.stat(p); if (unused && Math.max(st.ctimeMs, st.mtimeMs) < before) { await fs.promises.rm(p, { force: true }); n++; } } catch { /* gone */ }
        }
        await fs.promises.rmdir(path.join(dir, sub)).catch(() => {});
      }
      return n;
    },
    async remove(id) { await fs.promises.rm(fileOf(id), { force: true }); },
    async read(id) {
      try { const st = await fs.promises.stat(fileOf(id)); return { file: fileOf(id), size: st.size }; } catch { return null; }
    },
  };
}
