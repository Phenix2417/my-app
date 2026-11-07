// One copy of each file on the server. Every file kept (a book on a shelf, its cover, a file sent in chat) is a hard
// link to a single copy named by its content's SHA-256 under blobs/, so the same file sent in chat, forwarded, and put
// on several shelves takes the space of one. A copy no longer linked from anywhere is deleted by sweep().
// Files are never changed in place (new versions are written aside and renamed over), so sharing one copy is safe.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export function createBlobStore({ dir }) {
  const blobOf = (sha) => path.join(dir, sha.slice(0, 2), sha);
  const valid = (sha) => /^[0-9a-f]{64}$/.test(sha || '');

  // `file` has just been written with content `sha`: make it the stored copy, or, when an identical file is stored
  // already, a link to that one (and the new bytes are freed).
  async function adopt(file, sha) {
    if (!valid(sha)) return;
    const blob = blobOf(sha);
    try {
      await fs.promises.mkdir(path.dirname(blob), { recursive: true });
      await fs.promises.link(file, blob);
      return; // the first of its kind
    } catch (e) { if (e.code !== 'EEXIST') return; } // (a file system without links: each file keeps its own bytes)
    const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.lnk`;
    try {
      const [a, b] = await Promise.all([fs.promises.stat(file), fs.promises.stat(blob)]);
      if (a.ino === b.ino || a.size !== b.size) return;
      await fs.promises.link(blob, tmp);
      await fs.promises.rename(tmp, file);
    } catch { await fs.promises.rm(tmp, { force: true }); }
  }
  // Keep a file that's already stored (by any path of it) at another path too: a link, or a copy if links can't be made.
  async function share(from, to) {
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    const tmp = `${to}.${crypto.randomBytes(4).toString('hex')}.lnk`;
    try { await fs.promises.link(from, tmp); } catch { await fs.promises.copyFile(from, tmp); }
    await fs.promises.rename(tmp, to);
  }
  async function hashFile(file) {
    const h = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(file), h);
    return h.digest('hex');
  }
  // Delete stored copies nothing links to any more.
  async function sweep() {
    let freed = 0;
    for (const sub of await fs.promises.readdir(dir).catch(() => [])) {
      for (const name of await fs.promises.readdir(path.join(dir, sub)).catch(() => [])) {
        const p = path.join(dir, sub, name);
        try { if ((await fs.promises.stat(p)).nlink <= 1) { await fs.promises.unlink(p); freed++; } } catch { /* gone */ }
      }
    }
    return freed;
  }
  // Files kept before this store existed: link each to its single copy (once; a marker file records it's done).
  async function adoptExisting(roots, { skip = () => false } = {}) {
    const marker = path.join(dir, '.adopted');
    if (fs.existsSync(marker)) return 0;
    let n = 0;
    const walk = async (d) => {
      for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!skip(p, true)) await walk(p); }
        else if (e.isFile() && !skip(p, false)) { try { await adopt(p, await hashFile(p)); n++; } catch { /* skip it */ } }
      }
    };
    for (const r of roots) await walk(r);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(marker, new Date().toISOString());
    return n;
  }
  return { adopt, share, sweep, hashFile, adoptExisting };
}
