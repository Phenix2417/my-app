import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BOOKS, BOOK_IDS } from './books.js';
import { commentaryList, CommentaryError, COMMENTARY_IDS } from './commentary.js';
import { PronounceError } from './pronounce.js';
import { TranslateError } from './translate.js';
import { BibleDictError, MARK_SKIP } from './bibledict.js';
import { WikiError } from './wiki.js';
import { VERSIONS, VERSION_IDS, VersionError } from './versions.js';
import { LibraryError, BOOK_TYPES, MAX_BOOK_BYTES, MAX_LIBRARY_BYTES, MAX_COVER_BYTES, sniffFormat, sniffImage } from './library.js';

const COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const MAX_DISPLAY_NAME = 40;
const MAX_BODY = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');

// Display names may use any language. Strip control and invisible formatting characters, collapse spaces,
// and limit the length in characters (not bytes) so CJK and emoji names get the same room.
function cleanDisplayName(v) {
  if (v == null) return '';
  if (typeof v !== 'string') throw new HttpError(400, 'Invalid display name');
  const s = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/gu, ' ').trim();
  if ([...s].length > MAX_DISPLAY_NAME) throw new HttpError(400, `Display name can be at most ${MAX_DISPLAY_NAME} characters`);
  return s;
}
const userOut = (id, username, displayName) => ({ id, username, displayName: displayName || username });
// The commentaries a person keeps in their list, in their order. null = never customised (the app picks defaults).
function parsePrefs(raw) {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((id) => COMMENTARY_IDS.has(id)) : null; } catch { return null; }
}
function cleanCommentaryList(v) {
  if (!Array.isArray(v) || v.length > 50 || !v.every((id) => typeof id === 'string' && COMMENTARY_IDS.has(id))) {
    throw new HttpError(400, 'Invalid commentary list');
  }
  return [...new Set(v)];
}
const meOut = (u) => ({ ...userOut(u.id, u.username, u.display_name), commentaries: parsePrefs(u.commentary_prefs) });

// Create test accounts if they don't exist yet, and make them friends who share notes with each other.
// Existing accounts are left alone (their passwords and settings are not reset).
export function seedTestUsers(db, users) {
  const created = [];
  const ids = users.map(({ username, password, displayName = '' }) => {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (row) return row.id;
    const salt = crypto.randomBytes(16).toString('hex');
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username, display_name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(username, displayName, hashPassword(password, salt), salt, Date.now());
    created.push(username);
    return Number(lastInsertRowid);
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
      db.prepare("INSERT OR IGNORE INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'accepted', ?)").run(a, b, a, Date.now());
      if (created.length) { // only set up sharing for newly created test accounts
        db.prepare('INSERT OR IGNORE INTO shares (owner_id, viewer_id) VALUES (?, ?)').run(ids[i], ids[j]);
        db.prepare('INSERT OR IGNORE INTO shares (owner_id, viewer_id) VALUES (?, ?)').run(ids[j], ids[i]);
      }
    }
  }
  return created;
}

export function createApp(db, { publicDir, trustProxy = false, commentary = null, pronounce = null, phonetics = null, translate = null, bibleDict = null, library = null, freeDict = null, versions = null, wiki = null, encyclopedias = null } = {}) {
  const q = (sql) => db.prepare(sql);
  const stmt = {
    userByName: q('SELECT * FROM users WHERE username = ?'),
    userById: q('SELECT id, username, display_name FROM users WHERE id = ?'),
    insertUser: q('INSERT INTO users (username, display_name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'),
    setDisplayName: q('UPDATE users SET display_name = ? WHERE id = ?'),
    setCommentaryPrefs: q('UPDATE users SET commentary_prefs = ? WHERE id = ?'),
    meRow: q('SELECT id, username, display_name, commentary_prefs FROM users WHERE id = ?'),
    insertSession: q('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)'),
    sessionUser: q('SELECT u.id, u.username, u.display_name, u.commentary_prefs FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),

    friendship: q('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?'),
    insertFriendship: q("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'pending', ?)"),
    acceptFriendship: q("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?"),
    deleteFriendship: q('DELETE FROM friendships WHERE user_a = ? AND user_b = ?'),
    friendRows: q(`
      SELECT f.*, u.id AS other_id, u.username AS other_name, u.display_name AS other_display,
        EXISTS (SELECT 1 FROM shares WHERE owner_id = :me AND viewer_id = u.id) AS i_share,
        EXISTS (SELECT 1 FROM shares WHERE owner_id = u.id AND viewer_id = :me) AS they_share
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_a = :me THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = :me OR f.user_b = :me
      ORDER BY u.username COLLATE NOCASE`),

    share: q('INSERT OR IGNORE INTO shares (owner_id, viewer_id) VALUES (?, ?)'),
    unshare: q('DELETE FROM shares WHERE owner_id = ? AND viewer_id = ?'),
    canView: q(`SELECT 1 FROM shares s JOIN friendships f
      ON f.user_a = MIN(s.owner_id, s.viewer_id) AND f.user_b = MAX(s.owner_id, s.viewer_id) AND f.status = 'accepted'
      WHERE s.owner_id = ? AND s.viewer_id = ?`),

    myNotes: q('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC'),
    myChapterNotes: q('SELECT * FROM notes WHERE user_id = ? AND book = ? AND chapter = ? ORDER BY created_at'),
    note: q('SELECT * FROM notes WHERE id = ?'),
    upsertNote: q(`INSERT INTO notes (id, user_id, book, chapter, version, verse_start, word_start, verse_end, word_end, color, quote, body, created_at, updated_at)
      VALUES (:id, :user_id, :book, :chapter, :version, :verse_start, :word_start, :verse_end, :word_end, :color, :quote, :body, :now, :now)
      ON CONFLICT (id) DO UPDATE SET book = :book, chapter = :chapter, version = :version, verse_start = :verse_start, word_start = :word_start,
        verse_end = :verse_end, word_end = :word_end, color = :color, quote = :quote, body = :body, updated_at = :now`),
    deleteNote: q('DELETE FROM notes WHERE id = ? AND user_id = ?'),
    // Notes from friends who have allowed `viewer` to see them.
    friendNotes: q(`SELECT n.*, u.username, u.display_name FROM notes n
      JOIN users u ON u.id = n.user_id
      JOIN shares s ON s.owner_id = n.user_id AND s.viewer_id = :viewer
      JOIN friendships f ON f.user_a = MIN(n.user_id, :viewer) AND f.user_b = MAX(n.user_id, :viewer) AND f.status = 'accepted'
      WHERE (:book IS NULL OR (n.book = :book AND n.chapter = :chapter))
      ORDER BY n.updated_at DESC LIMIT 500`),
  };

  Object.assign(stmt, {
    myLibrary: q('SELECT * FROM library_books WHERE user_id = ? ORDER BY MAX(opened_at, created_at) DESC'),
    libraryBook: q('SELECT * FROM library_books WHERE id = ? AND user_id = ?'),
    libraryBytes: q('SELECT COALESCE(SUM(size), 0) AS total FROM library_books WHERE user_id = ?'),
    addLibraryBook: q(`INSERT INTO library_books (id, user_id, title, author, format, size, sha256, created_at, updated_at)
      VALUES (:id, :user_id, :title, :author, :format, :size, :sha256, :now, :now)`),
    // Books that may be the same file: same fingerprint, or no fingerprint yet and the same size.
    sameBookCandidates: q('SELECT * FROM library_books WHERE user_id = ? AND (sha256 = ? OR (sha256 IS NULL AND size = ?))'),
    setLibrarySha: q('UPDATE library_books SET sha256 = ? WHERE id = ?'),
    setLibraryTitle: q('UPDATE library_books SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
    setLibraryPosition: q('UPDATE library_books SET position = ?, opened_at = ? WHERE id = ? AND user_id = ?'),
    setLibraryCover: q('UPDATE library_books SET has_cover = 1 WHERE id = ? AND user_id = ?'),
    deleteLibraryBook: q('DELETE FROM library_books WHERE id = ? AND user_id = ?'),
    libraryNotes: q('SELECT * FROM library_notes WHERE user_id = ? AND book_id = ? ORDER BY created_at'),
    libraryNote: q('SELECT * FROM library_notes WHERE id = ?'),
    upsertLibraryNote: q(`INSERT INTO library_notes (id, user_id, book_id, chapter, block_start, word_start, block_end, word_end, color, quote, body, created_at, updated_at)
      VALUES (:id, :user_id, :book_id, :chapter, :block_start, :word_start, :block_end, :word_end, :color, :quote, :body, :created, :now)
      ON CONFLICT (id) DO UPDATE SET chapter = :chapter, block_start = :block_start, word_start = :word_start, block_end = :block_end,
        word_end = :word_end, color = :color, quote = :quote, body = :body, updated_at = :now`),
    deleteLibraryNote: q('DELETE FROM library_notes WHERE id = ? AND user_id = ?'),
    myVersions: q('SELECT * FROM user_versions WHERE user_id = ? ORDER BY created_at'),
    userVersion: q('SELECT * FROM user_versions WHERE id = ? AND user_id = ?'),
    versionById: q('SELECT * FROM user_versions WHERE id = ?'),
    addUserVersion: q('INSERT INTO user_versions (id, user_id, short, name, lang, created_at, source_sha, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    setVersionSource: q('UPDATE user_versions SET source_sha = ? WHERE id = ? AND user_id = ?'),
    deleteUserVersion: q('DELETE FROM user_versions WHERE id = ? AND user_id = ?'),
    deleteVersionNotes: q('DELETE FROM notes WHERE version = ? AND user_id = ?'),
    deleteLibraryBookNotes: q('DELETE FROM library_notes WHERE book_id = ? AND user_id = ?'),
  });
  const libraryNoteOut = (n) => ({ id: n.id, lib: n.book_id, chapter: n.chapter, start: { verse: n.block_start, word: n.word_start },
    end: { verse: n.block_end, word: n.word_end }, color: n.color, quote: n.quote, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at });
  const libraryOut = (b) => ({ id: b.id, title: b.title, author: b.author, format: b.format, size: b.size, hasCover: !!b.has_cover, sha256: b.sha256 || null,
    position: b.position ? JSON.parse(b.position) : null, createdAt: b.created_at, openedAt: b.opened_at });
  const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  function myBook(me, id) {
    const b = stmt.libraryBook.get(id, me.id);
    if (!b) throw new HttpError(404, 'Book not found');
    return b;
  }
  // The person's book with exactly this content, if any (books from before fingerprints get theirs worked out here).
  async function findSameBook(userId, sha, size) {
    for (const b of stmt.sameBookCandidates.all(userId, sha, size)) {
      const bsha = b.sha256 || (library && await library.fingerprint(userId, b.id));
      if (bsha && !b.sha256) stmt.setLibrarySha.run(bsha, b.id);
      if (bsha === sha) return stmt.libraryBook.get(b.id, userId);
    }
    return null;
  }
  function needLibrary() { if (!library) throw new HttpError(503, 'Books are not set up on this server'); }
  // Short-lived links so a PDF can open in the phone's own viewer, which can't send the sign-in header.
  const fileLinks = new Map(); // token -> { userId, id, exp }
  const libraryErr = (e) => { if (e instanceof LibraryError) throw new HttpError(e.status, e.message); throw e; };

  const pair = (x, y) => (x < y ? [x, y] : [y, x]);
  const now = () => Date.now();

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    stmt.insertSession.run(sha256(token), userId, now());
    return token;
  }

  // Simple in-memory throttle for auth endpoints: 20 attempts / 10 min per IP.
  const attempts = new Map();
  function throttle(ip) {
    const t = now();
    const list = (attempts.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (list.length >= 20) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    list.push(t);
    attempts.set(ip, list);
  }

  const noteOut = (n) => ({
    id: n.id, book: n.book, chapter: n.chapter, version: n.version || 'web', // words are counted in this version's text
    start: { verse: n.verse_start, word: n.word_start }, end: { verse: n.verse_end, word: n.word_end },
    color: n.color, quote: n.quote, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at,
    ...(n.username ? { author: userOut(n.user_id, n.username, n.display_name) } : {}),
  });

  const ownVersion = (me, id) => !!(me && /^u[\w-]{6,20}$/.test(String(id)) && stmt.userVersion.get(id, me.id));
  function validateNote(b, me) {
    const book = BOOKS.find((x) => x.id === b.book);
    if (!book) throw new HttpError(400, 'Unknown book');
    const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    if (!int(b.chapter, 1, book.chapters)) throw new HttpError(400, 'Invalid chapter');
    for (const p of [b.start, b.end]) {
      if (!p || !int(p.verse, 1, 200) || !int(p.word, 0, 500)) throw new HttpError(400, 'Invalid selection');
    }
    if (b.end.verse < b.start.verse || (b.end.verse === b.start.verse && b.end.word < b.start.word)) {
      throw new HttpError(400, 'Selection end is before start');
    }
    if (!COLORS.has(b.color)) throw new HttpError(400, 'Invalid color');
    if (typeof b.quote !== 'string' || !b.quote.trim() || b.quote.length > 4000) throw new HttpError(400, 'Invalid quote');
    const body = b.body ?? '';
    if (typeof body !== 'string' || body.length > 10000) throw new HttpError(400, 'Note is too long');
    return { book: book.id, chapter: b.chapter, verse_start: b.start.verse, word_start: b.start.word,
      verse_end: b.end.verse, word_end: b.end.word, color: b.color, quote: b.quote.trim(), body,
      version: b.version == null ? 'web' : VERSION_IDS.has(b.version) || ownVersion(me, b.version) ? b.version : (() => { throw new HttpError(400, 'Unknown Bible version'); })() };
  }

  function friendsPayload(me) {
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of stmt.friendRows.all({ me })) {
      const user = userOut(r.other_id, r.other_name, r.other_display);
      if (r.status === 'accepted') out.friends.push({ ...user, sharing: !!r.i_share, sharesWithMe: !!r.they_share });
      else if (r.requested_by === me) out.outgoing.push(user);
      else out.incoming.push(user);
    }
    return out;
  }

  function otherUser(id) {
    const u = stmt.userById.get(Number(id));
    if (!u) throw new HttpError(404, 'User not found');
    return u;
  }

  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true })],

    // English definitions from the Free Dictionary API (Wiktionary). The app falls back to its built-in WordNet.
    ['GET', /^\/api\/define\/([a-z-]{1,40})$/, async ({ params: [word] }) => {
      if (!freeDict) throw new HttpError(503, 'Definitions are not set up on this server');
      try { return { word, en: (await freeDict(word)).definitions || [] }; } catch { throw new HttpError(503, "Couldn't reach the dictionary service."); }
    }, true],

    /* ----- Library: the person's own books ----- */
    ['GET', /^\/api\/library$/, ({ me }) => ({ books: stmt.myLibrary.all(me.id).map(libraryOut) }), true],
    // Before uploading, the app asks whether the person already has this exact file (by fingerprint), so it isn't sent again.
    ['GET', /^\/api\/library\/find$/, async ({ me, query }) => {
      const sha = String(query.get('sha') || ''), size = Number(query.get('size'));
      if (!/^[0-9a-f]{64}$/.test(sha) || !Number.isInteger(size) || size < 1) throw new HttpError(400, 'Invalid fingerprint');
      const same = await findSameBook(me.id, sha, size);
      return { book: same ? libraryOut(same) : null };
    }, true],
    ['POST', /^\/api\/library$/, async ({ me, query, req }) => {
      needLibrary();
      const declared = query.get('format');
      const used = stmt.libraryBytes.get(me.id).total;
      const room = Math.min(MAX_BOOK_BYTES, MAX_LIBRARY_BYTES - used);
      if (room <= 0) throw new HttpError(413, 'Your library is full. Delete a book to make room.');
      const up = await library.receive(req, me.id, room).catch(libraryErr);
      const format = up.size ? sniffFormat(up.head, declared) : null;
      if (!format) { await library.discard(up.tmp); throw new HttpError(415, 'Only EPUB, PDF and text files can be added.'); }
      // The same book (byte for byte, whatever its name) is kept only once.
      const same = await findSameBook(me.id, up.sha256, up.size);
      if (same) { await library.discard(up.tmp); return { status: 200, body: { book: libraryOut(same), duplicate: true } }; }
      const id = crypto.randomBytes(12).toString('base64url');
      const title = cleanText(query.get('title'), 200) || 'Untitled', author = cleanText(query.get('author'), 120);
      await library.keep(up.tmp, me.id, id);
      stmt.addLibraryBook.run({ id, user_id: me.id, title, author, format, size: up.size, sha256: up.sha256, now: now() });
      return { status: 201, body: { book: libraryOut(stmt.libraryBook.get(id, me.id)) } };
    }, true, { raw: true }],
    ['PUT', /^\/api\/library\/([\w-]{16})\/cover$/, async ({ me, params: [id], req }) => {
      needLibrary(); myBook(me, id);
      const up = await library.receive(req, me.id, MAX_COVER_BYTES).catch(libraryErr);
      if (!sniffImage(up.head)) { await library.discard(up.tmp); throw new HttpError(415, 'The cover must be a JPEG or PNG image.'); }
      await library.keep(up.tmp, me.id, id, { cover: true });
      stmt.setLibraryCover.run(id, me.id);
      return { ok: true };
    }, true, { raw: true }],
    ['GET', /^\/api\/library\/([\w-]{16})\/cover$/, async ({ me, params: [id] }) => {
      needLibrary(); myBook(me, id);
      const f = await library.read(me.id, id, { cover: true });
      if (!f) throw new HttpError(404, 'No cover');
      const head = Buffer.alloc(8); const fd = await fs.promises.open(f.file); await fd.read(head, 0, 8, 0); await fd.close();
      return { file: f.file, size: f.size, headers: { 'Content-Type': sniffImage(head) || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' } };
    }, true],
    ['GET', /^\/api\/library\/([\w-]{16})\/file$/, async ({ me, params: [id] }) => {
      needLibrary();
      const b = myBook(me, id), f = await library.read(me.id, id);
      if (!f) throw new HttpError(404, 'The book file is missing');
      return { file: f.file, size: f.size, headers: { 'Content-Type': BOOK_TYPES[b.format], 'Cache-Control': 'private, no-store' } };
    }, true],
    ['POST', /^\/api\/library\/([\w-]{16})\/link$/, ({ me, params: [id] }) => {
      needLibrary(); myBook(me, id);
      for (const [t, l] of fileLinks) if (l.exp < now()) fileLinks.delete(t);
      const token = crypto.randomBytes(24).toString('base64url');
      fileLinks.set(token, { userId: me.id, id, exp: now() + 5 * 60 * 1000 });
      return { url: `/api/library-file/${token}` };
    }, true],
    ['GET', /^\/api\/library-file\/([\w-]{32})$/, async ({ params: [token] }) => {
      needLibrary();
      const l = fileLinks.get(token);
      if (!l || l.exp < now()) throw new HttpError(404, 'This link has expired. Open the book again from your library.');
      const b = stmt.libraryBook.get(l.id, l.userId), f = b && await library.read(l.userId, l.id);
      if (!f) throw new HttpError(404, 'Book not found');
      const name = `${b.title.replace(/[^\w .()-]+/g, '_').slice(0, 80) || 'book'}.${b.format}`;
      return { file: f.file, size: f.size, headers: { 'Content-Type': BOOK_TYPES[b.format], 'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="${name}"` } };
    }],
    ['PUT', /^\/api\/library\/([\w-]{16})$/, ({ me, params: [id], body }) => {
      myBook(me, id);
      if ('title' in body) {
        const title = cleanText(body.title, 200);
        if (!title) throw new HttpError(400, 'Please enter a title');
        stmt.setLibraryTitle.run(title, now(), id, me.id);
      }
      if ('position' in body) {
        const p = body.position;
        if (!p || !Number.isInteger(p.chapter) || p.chapter < 0 || p.chapter > 100000 || typeof p.frac !== 'number' || !(p.frac >= 0 && p.frac <= 1)
          || (p.progress != null && !(p.progress >= 0 && p.progress <= 1))) throw new HttpError(400, 'Invalid position');
        stmt.setLibraryPosition.run(JSON.stringify({ chapter: p.chapter, frac: p.frac, progress: p.progress ?? null }), now(), id, me.id);
      }
      return { book: libraryOut(myBook(me, id)) };
    }, true],
    // Highlights and notes in a book (private, like the book).
    ['GET', /^\/api\/library\/([\w-]{16})\/notes$/, ({ me, params: [id] }) => {
      myBook(me, id);
      return { notes: stmt.libraryNotes.all(me.id, id).map(libraryNoteOut) };
    }, true],
    ['PUT', /^\/api\/library-notes\/([\w-]{8,64})$/, ({ me, params: [id], body: b }) => {
      myBook(me, String(b.lib || ''));
      const old = stmt.libraryNote.get(id);
      if (old && old.user_id !== me.id) throw new HttpError(404, 'Note not found');
      const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
      if (!int(b.chapter, 0, 100000)) throw new HttpError(400, 'Invalid chapter');
      for (const p of [b.start, b.end]) if (!p || !int(p.verse, 0, 1000000) || !int(p.word, 0, 1000000)) throw new HttpError(400, 'Invalid selection');
      if (b.end.verse < b.start.verse || (b.end.verse === b.start.verse && b.end.word < b.start.word)) throw new HttpError(400, 'Selection end is before start');
      if (!COLORS.has(b.color)) throw new HttpError(400, 'Invalid color');
      if (typeof b.quote !== 'string' || !b.quote.trim() || b.quote.length > 4000) throw new HttpError(400, 'Invalid quote');
      const body = b.body ?? '';
      if (typeof body !== 'string' || body.length > 10000) throw new HttpError(400, 'Note is too long');
      stmt.upsertLibraryNote.run({ id, user_id: me.id, book_id: b.lib, chapter: b.chapter, block_start: b.start.verse, word_start: b.start.word,
        block_end: b.end.verse, word_end: b.end.word, color: b.color, quote: b.quote.trim(), body,
        created: Number.isInteger(b.createdAt) ? Math.min(b.createdAt, now()) : now(), now: now() });
      return { note: libraryNoteOut(stmt.libraryNote.get(id)) };
    }, true],
    ['DELETE', /^\/api\/library-notes\/([\w-]{8,64})$/, ({ me, params: [id] }) => {
      stmt.deleteLibraryNote.run(id, me.id);
      return { ok: true };
    }, true],
    ['DELETE', /^\/api\/library\/([\w-]{16})$/, async ({ me, params: [id] }) => {
      myBook(me, id);
      stmt.deleteLibraryBook.run(id, me.id);
      stmt.deleteLibraryBookNotes.run(id, me.id);
      if (library) await library.remove(me.id, id);
      return { ok: true };
    }, true],

    ['GET', /^\/api\/books$/, () => ({ books: BOOKS })],
    // Bible versions; the World English Bible is built in, the others are fetched once per chapter and kept.
    ['GET', /^\/api\/versions$/, async ({ me }) => ({ versions: [
      ...VERSIONS.map(({ id, short, name, year, lang, credit }) => ({ id, short, name, year, lang, credit })),
      // The person's own versions, from ebooks they own: private to them. `missing`: Bible books not saved (an import
      // that stopped partway), so the app can offer to complete it.
      ...(me ? await Promise.all(stmt.myVersions.all(me.id).map(async (v) => {
        const have = new Set(library ? await library.versionBooks(me.id, v.id) : []);
        return { id: v.id, short: v.short, name: v.name, lang: v.lang, mine: true, credit: `${v.name} (from your own copy)`, source: v.source_sha || null, year: v.year || null,
          missing: BOOKS.filter((b) => !have.has(b.id)).map((b) => b.id) };
      })) : []),
    ] })],
    ['POST', /^\/api\/my-versions$/, ({ me, body }) => {
      needLibrary();
      if (stmt.myVersions.all(me.id).length >= 5) throw new HttpError(400, 'You can add up to 5 Bibles of your own.');
      const short = cleanText(body.short, 12), name = cleanText(body.name, 80);
      if (!short || !name) throw new HttpError(400, 'Please give the version a name and a short name.');
      const lang = /^zh(-Hans|-Hant)?$/.test(body.lang) ? body.lang : 'en';
      const id = 'u' + crypto.randomBytes(9).toString('base64url');
      const source = /^[0-9a-f]{64}$/.test(body.source || '') ? body.source : null; // the ebook's fingerprint
      const year = Number.isInteger(body.year) && body.year >= 100 && body.year <= 2200 ? body.year : null; // when it was published
      stmt.addUserVersion.run(id, me.id, short, name, lang, now(), source, year);
      return { status: 201, body: { version: { id, short, name, lang, mine: true, source, year } } };
    }, true],
    // Link a version to the ebook it came from (for versions imported before that was recorded).
    ['PUT', /^\/api\/my-versions\/(u[\w-]{6,20})$/, ({ me, params: [id], body }) => {
      if (!stmt.userVersion.get(id, me.id)) throw new HttpError(404, 'Version not found');
      if (!/^[0-9a-f]{64}$/.test(body.source || '')) throw new HttpError(400, 'Invalid fingerprint');
      stmt.setVersionSource.run(body.source, id, me.id);
      return { ok: true };
    }, true],
    ['PUT', /^\/api\/my-versions\/(u[\w-]{6,20})\/([a-z0-9]{1,20})$/, async ({ me, params: [id, book], req }) => {
      needLibrary();
      if (!stmt.userVersion.get(id, me.id)) throw new HttpError(404, 'Version not found');
      const meta = BOOKS.find((b) => b.id === book);
      if (!meta) throw new HttpError(404, 'Unknown book');
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > 4 * 1024 * 1024) throw new HttpError(413, 'That book is too large.'); chunks.push(c); }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid book data'); }
      // [[ [text, 1?], ... ] per chapter]
      const ok = Array.isArray(data) && data.length <= meta.chapters && data.every((ch) => Array.isArray(ch) && ch.length <= 200
        && ch.every((v) => Array.isArray(v) && typeof v[0] === 'string' && v[0].length <= 4000 && (v.length === 1 || v[1] === 1)));
      if (!ok) throw new HttpError(400, 'Invalid book data');
      await library.saveVersionBook(me.id, id, book, JSON.stringify(data));
      return { ok: true };
    }, true, { raw: true }],
    ['DELETE', /^\/api\/my-versions\/(u[\w-]{6,20})$/, async ({ me, params: [id] }) => {
      if (!stmt.userVersion.get(id, me.id)) throw new HttpError(404, 'Version not found');
      stmt.deleteUserVersion.run(id, me.id);
      stmt.deleteVersionNotes.run(id, me.id);
      if (library) await library.removeVersion(me.id, id);
      return { ok: true };
    }, true],
    ['GET', /^\/api\/bible\/([\w-]{2,20})\/([a-z0-9]{1,20})\/(\d{1,3})$/, async ({ me, params: [version, book, chapter] }) => {
      if (/^u[\w-]{6,20}$/.test(version)) { // the person's own version: only they can read it
        if (!ownVersion(me, version) || !library) throw new HttpError(404, 'Version not found');
        const verses = (await library.readVersionBook(me.id, version, book))?.[Number(chapter) - 1];
        if (!verses?.length) throw new HttpError(404, 'This version has no text for this chapter.');
        return { status: 200, body: { version, book, chapter: Number(chapter), verses }, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' } };
      }
      if (!versions) throw new HttpError(503, 'Bible versions are not set up on this server');
      try {
        return { status: 200, body: await versions(version, book, Number(chapter)), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } };
      } catch (e) { if (e instanceof VersionError) throw new HttpError(e.status, e.message); throw e; }
    }],
    ['GET', /^\/api\/commentaries$/, () => ({ commentaries: commentaryList() })],
    ['GET', /^\/api\/phonetics\/([a-z-]{1,40})$/, async ({ params: [word] }) => {
      if (!phonetics) throw new HttpError(503, 'Phonetics are not set up on this server');
      // Also say where any recordings already saved on the server came from (no fetching).
      try { return { ...(await phonetics(word)), audio: pronounce?.savedSources ? await pronounce.savedSources(word) : { uk: '', us: '' } }; } catch (e) {
        if (e instanceof PronounceError) throw new HttpError(e.status, e.message);
        throw e;
      }
    }, true],
    // Which Bible dictionary topics a word has (from the built-in index, no outside request) — for the buttons.
    ['GET', /^\/api\/bible-dictionary\/([a-zA-Z0-9' %,-]{1,120})$/, ({ params: [word] }) => {
      if (!bibleDict) throw new HttpError(503, 'The Bible dictionary is not set up on this server');
      const w = decodeURIComponent(word);
      // Also: whether Easton's and the ISBE have an entry (answered from memory).
      return { topics: bibleDict.has(w), ...(encyclopedias ? encyclopedias.has(w) : {}) };
    }, true],
    // The full entry, in Chinese (zh) or English (en), fetched when a button is tapped.
    ['GET', /^\/api\/bible-dictionary\/([a-z' %-]{1,60})\/(zh|en)$/, async ({ params: [word, lang] }) => {
      if (!bibleDict) throw new HttpError(503, 'The Bible dictionary is not set up on this server');
      let found;
      try { found = await bibleDict.entry(decodeURIComponent(word), lang); } catch (e) {
        if (e instanceof BibleDictError) throw new HttpError(e.status, e.message);
        throw e;
      }
      if (!found) throw new HttpError(404, 'Not in the Bible dictionary');
      return found;
    }, true],
    // For colouring the Bible text: which words have Bible dictionary entries (no network).
    ['POST', /^\/api\/bible-dictionary\/marks$/, ({ body }) => {
      if (!bibleDict) throw new HttpError(503, 'The Bible dictionary is not set up on this server');
      const words = Array.isArray(body?.words) ? body.words.slice(0, 2000).map(String) : [];
      // { word: ['bd', 'easton', 'isbe'] }: which Bible dictionaries have each word (each is coloured its own way).
      const bd = new Set(bibleDict.marks(words));
      const enc = encyclopedias ? encyclopedias.marks(words, MARK_SKIP, bd) : {};
      const marks = {};
      for (const w of words) { const list = [...(bd.has(w) ? ['bd'] : []), ...(enc[w] || [])]; if (list.length) marks[w] = list; }
      return { marks };
    }, true],
    // …and which names have a Bible wiki article (one Wikipedia request per chapter at most, then kept).
    ['POST', /^\/api\/wiki\/names$/, async ({ body }) => {
      if (!wiki?.names) throw new HttpError(503, 'The Bible wiki is not set up on this server');
      const names = await wiki.names(Array.isArray(body?.names) ? body.names.slice(0, 200).map(String) : [], body?.lang === 'zh' ? 'zh' : 'en');
      return { names: [...names], unknown: names.unknown || [] };
    }, true],
    // An Easton's Bible Dictionary or ISBE entry (built in, public domain).
    ['GET', /^\/api\/encyclopedia\/(easton|isbe)\/([a-zA-Z0-9' %,-]{1,120})$/, ({ params: [source, word] }) => {
      if (!encyclopedias) throw new HttpError(503, 'Easton and the ISBE are not set up on this server');
      const found = encyclopedias.entry(source, decodeURIComponent(word));
      if (!found) throw new HttpError(404, source === 'easton' ? "Not in Easton's Bible Dictionary" : 'Not in the ISBE');
      return found;
    }, true],
    // Bible wiki: the Wikipedia article about a Bible word or name, English and Chinese.
    ['GET', /^\/api\/wiki\/([a-z' %-]{1,60})$/, async ({ params: [word] }) => {
      if (!wiki) throw new HttpError(503, 'The Bible wiki is not set up on this server');
      let found;
      try { found = await wiki(decodeURIComponent(word)); } catch (e) {
        if (e instanceof WikiError) throw new HttpError(e.status, e.message);
        throw e;
      }
      if (!found) throw new HttpError(404, 'No wiki article for this word');
      return found;
    }, true],
    ['POST', /^\/api\/translate$/, async ({ body }) => {
      if (!translate) throw new HttpError(503, 'Translation is not set up on this server');
      try { return await translate(body.text); } catch (e) {
        if (e instanceof TranslateError) throw new HttpError(e.status, e.message);
        throw e;
      }
    }, true],
    // Audio for <audio> elements, which can't send a sign-in header; limited to dictionary words.
    // Which source a word's recording comes from (the server fetches and keeps it if needed; no audio is sent).
    ['GET', /^\/api\/pronounce-source\/(uk|us)\/([a-z-]{1,40})$/, async ({ params: [accent, word] }) => {
      if (!pronounce) throw new HttpError(503, 'Pronunciation is not set up on this server');
      try { return { src: (await pronounce(accent, word)).src || '' }; } catch (e) {
        if (e instanceof PronounceError) { if (e.status === 404) return { src: '' }; throw new HttpError(e.status, e.message); }
        throw e;
      }
    }, true],
    ['GET', /^\/api\/pronounce\/(uk|us)\/([a-z-]{1,40})$/, async ({ params: [accent, word] }) => {
      if (!pronounce) throw new HttpError(503, 'Pronunciation is not set up on this server');
      try {
        const { buf, type, src } = await pronounce(accent, word);
        // no-store: phones stream the recording each time instead of keeping it (the server keeps the copy).
        return { status: 200, body: buf, headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Audio-Source': src || '' } };
      } catch (e) {
        if (e instanceof PronounceError) throw new HttpError(e.status, e.message);
        throw e;
      }
    }],
    ['GET', /^\/api\/commentaries\/([a-z-]{1,40})\/([a-z0-9]{1,20})\/(\d{1,3})$/, async ({ params: [id, book, chapter] }) => {
      if (!commentary) throw new HttpError(503, 'Commentaries are not set up on this server');
      try { return await commentary(id, book, Number(chapter)); } catch (e) {
        if (e instanceof CommentaryError) throw new HttpError(e.status, e.message);
        throw e;
      }
    }, true],

    ['POST', /^\/api\/register$/, ({ body, ip }) => {
      throttle(ip);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username must be 3–20 letters, numbers or _');
      if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      const displayName = cleanDisplayName(body.displayName);
      if (stmt.userByName.get(username)) throw new HttpError(409, 'That username is taken');
      const salt = crypto.randomBytes(16).toString('hex');
      const { lastInsertRowid } = stmt.insertUser.run(username, displayName, hashPassword(password, salt), salt, now());
      const id = Number(lastInsertRowid);
      return { status: 201, body: { token: createSession(id), user: meOut(stmt.meRow.get(id)) } };
    }],

    ['POST', /^\/api\/login$/, ({ body, ip }) => {
      throttle(ip);
      const u = stmt.userByName.get(String(body.username || '').trim());
      const ok = u && crypto.timingSafeEqual(
        Buffer.from(hashPassword(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
      if (!ok) throw new HttpError(401, 'Wrong username or password');
      return { token: createSession(u.id), user: meOut(u) };
    }],

    ['POST', /^\/api\/logout$/, ({ token }) => { if (token) stmt.deleteSession.run(sha256(token)); return { ok: true }; }],
    ['GET', /^\/api\/me$/, ({ me }) => ({ user: meOut(me) }), true],
    // Change any of: displayName, commentaries. Fields left out stay as they are.
    ['PUT', /^\/api\/me$/, ({ me, body }) => {
      if ('displayName' in body) stmt.setDisplayName.run(cleanDisplayName(body.displayName), me.id);
      if ('commentaries' in body) stmt.setCommentaryPrefs.run(JSON.stringify(cleanCommentaryList(body.commentaries)), me.id);
      return { user: meOut(stmt.meRow.get(me.id)) };
    }, true],

    ['GET', /^\/api\/notes$/, ({ me, query }) => {
      const book = query.get('book');
      const rows = book ? stmt.myChapterNotes.all(me.id, book, Number(query.get('chapter'))) : stmt.myNotes.all(me.id);
      return { notes: rows.map(noteOut) };
    }, true],

    ['PUT', /^\/api\/notes\/([\w-]{8,64})$/, ({ me, body, params: [id] }) => {
      const existing = stmt.note.get(id);
      if (existing && existing.user_id !== me.id) throw new HttpError(404, 'Note not found');
      const n = validateNote(body, me);
      const createdAt = Number.isInteger(body.createdAt) ? Math.min(body.createdAt, now()) : now();
      stmt.upsertNote.run({ id, user_id: me.id, ...n, now: now() });
      if (!existing) db.prepare('UPDATE notes SET created_at = ? WHERE id = ?').run(createdAt, id);
      return { note: noteOut(stmt.note.get(id)) };
    }, true],

    ['DELETE', /^\/api\/notes\/([\w-]{8,64})$/, ({ me, params: [id] }) => {
      stmt.deleteNote.run(id, me.id);
      return { ok: true };
    }, true],

    ['GET', /^\/api\/friends$/, ({ me }) => friendsPayload(me.id), true],

    ['POST', /^\/api\/friends\/requests$/, ({ me, body }) => {
      const other = stmt.userByName.get(String(body.username || '').trim().replace(/^@/, ''));
      if (!other) throw new HttpError(404, 'No one has that username');
      if (other.id === me.id) throw new HttpError(400, "That's you!");
      const [a, b] = pair(me.id, other.id);
      const f = stmt.friendship.get(a, b);
      if (!f) stmt.insertFriendship.run(a, b, me.id, now());
      else if (f.status === 'pending' && f.requested_by !== me.id) stmt.acceptFriendship.run(a, b); // they asked first
      return friendsPayload(me.id);
    }, true],

    ['POST', /^\/api\/friends\/(\d+)\/accept$/, ({ me, params: [id] }) => {
      const other = otherUser(id);
      const [a, b] = pair(me.id, other.id);
      const f = stmt.friendship.get(a, b);
      if (!f || f.status !== 'pending' || f.requested_by === me.id) throw new HttpError(404, 'No request to accept');
      stmt.acceptFriendship.run(a, b);
      return friendsPayload(me.id);
    }, true],

    // Decline a request, cancel your own request, or remove a friend.
    ['DELETE', /^\/api\/friends\/(\d+)$/, ({ me, params: [id] }) => {
      const other = otherUser(id);
      const [a, b] = pair(me.id, other.id);
      stmt.deleteFriendship.run(a, b);
      stmt.unshare.run(me.id, other.id);
      stmt.unshare.run(other.id, me.id);
      return friendsPayload(me.id);
    }, true],

    ['PUT', /^\/api\/friends\/(\d+)\/sharing$/, ({ me, body, params: [id] }) => {
      const other = otherUser(id);
      const f = stmt.friendship.get(...pair(me.id, other.id));
      if (!f || f.status !== 'accepted') throw new HttpError(404, 'You are not friends with this person');
      if (body.enabled) stmt.share.run(me.id, other.id); else stmt.unshare.run(me.id, other.id);
      return friendsPayload(me.id);
    }, true],

    ['GET', /^\/api\/friends\/notes$/, ({ me, query }) => {
      const book = query.get('book');
      if (book && !BOOK_IDS.has(book)) throw new HttpError(400, 'Unknown book');
      const rows = stmt.friendNotes.all({ viewer: me.id, book: book || null, chapter: book ? Number(query.get('chapter')) : null });
      // A note made in a friend's own imported Bible (and its quoted text) is shown only to someone who has that Bible
      // too — imported from the same ebook, or a version with the same short name and language — and in their copy.
      const mine = stmt.myVersions.all(me.id), owners = new Map();
      const visible = [];
      for (const n of rows) {
        if (!/^u/.test(n.version || '')) { visible.push(n); continue; }
        if (!owners.has(n.version)) owners.set(n.version, stmt.versionById.get(n.version));
        const theirs = owners.get(n.version);
        const match = theirs && mine.find((v) => v.lang === theirs.lang && ((theirs.source_sha && v.source_sha === theirs.source_sha) || v.short === theirs.short));
        if (match) visible.push({ ...n, version: match.id });
      }
      return { notes: visible.map(noteOut) };
    }, true],
  ];

  async function readJson(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return {};
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return v && typeof v === 'object' ? v : {};
    } catch { throw new HttpError(400, 'Invalid JSON'); }
  }

  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(typeof body === 'object' && !Buffer.isBuffer(body) ? { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' } : {}),
      ...headers,
    });
    res.end(data);
  }

  function serveStatic(req, res, pathname) {
    if (!publicDir) return send(res, 404, { error: 'Not found' });
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA fallback
    const file = path.resolve(publicDir, '.' + rel);
    if (!file.startsWith(path.resolve(publicDir) + path.sep)) return send(res, 404, { error: 'Not found' });
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: 'Not found' });
      const ext = path.extname(file);
      send(res, 200, data, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': rel.startsWith('/bible/') ? 'public, max-age=604800' : 'no-cache',
        ...(ext === '.html' ? {
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        } : {}),
      });
    });
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
        return serveStatic(req, res, url.pathname);
      }
      const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!route) throw new HttpError(404, 'Not found');
      const [, re, fn, needsAuth, opts] = route;
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const me = token ? stmt.sessionUser.get(sha256(token)) : null;
      if (needsAuth && !me) throw new HttpError(401, 'Please sign in again');
      const body = opts?.raw ? {} : await readJson(req); // raw routes stream the request themselves
      const result = await fn({
        me, token, body, req, query: url.searchParams, params: url.pathname.match(re).slice(1),
        // The proxy appends the real client address last; earlier entries can be forged by the client.
        ip: (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress,
      });
      if (result && result.status && result.body) return send(res, result.status, result.body, result.headers);
      if (result && result.file) { // a file from disk, streamed
        res.writeHead(200, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Length': result.size, ...result.headers });
        return fs.createReadStream(result.file).on('error', () => res.destroy()).pipe(res);
      }
      return send(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Something went wrong' });
    }
  };
}

export function createServer(db, opts) {
  return http.createServer(createApp(db, opts));
}
