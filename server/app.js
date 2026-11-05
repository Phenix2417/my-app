import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BOOKS, BOOK_IDS } from './books.js';

const COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
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

export function createApp(db, { publicDir } = {}) {
  const q = (sql) => db.prepare(sql);
  const stmt = {
    userByName: q('SELECT * FROM users WHERE username = ?'),
    userById: q('SELECT id, username FROM users WHERE id = ?'),
    insertUser: q('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)'),
    insertSession: q('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)'),
    sessionUser: q('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),

    friendship: q('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?'),
    insertFriendship: q("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'pending', ?)"),
    acceptFriendship: q("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?"),
    deleteFriendship: q('DELETE FROM friendships WHERE user_a = ? AND user_b = ?'),
    friendRows: q(`
      SELECT f.*, u.id AS other_id, u.username AS other_name,
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
    upsertNote: q(`INSERT INTO notes (id, user_id, book, chapter, verse_start, word_start, verse_end, word_end, color, quote, body, created_at, updated_at)
      VALUES (:id, :user_id, :book, :chapter, :verse_start, :word_start, :verse_end, :word_end, :color, :quote, :body, :now, :now)
      ON CONFLICT (id) DO UPDATE SET book = :book, chapter = :chapter, verse_start = :verse_start, word_start = :word_start,
        verse_end = :verse_end, word_end = :word_end, color = :color, quote = :quote, body = :body, updated_at = :now`),
    deleteNote: q('DELETE FROM notes WHERE id = ? AND user_id = ?'),
    // Notes from friends who have allowed `viewer` to see them.
    friendNotes: q(`SELECT n.*, u.username FROM notes n
      JOIN users u ON u.id = n.user_id
      JOIN shares s ON s.owner_id = n.user_id AND s.viewer_id = :viewer
      JOIN friendships f ON f.user_a = MIN(n.user_id, :viewer) AND f.user_b = MAX(n.user_id, :viewer) AND f.status = 'accepted'
      WHERE (:book IS NULL OR (n.book = :book AND n.chapter = :chapter))
      ORDER BY n.updated_at DESC LIMIT 500`),
  };

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
    id: n.id, book: n.book, chapter: n.chapter,
    start: { verse: n.verse_start, word: n.word_start }, end: { verse: n.verse_end, word: n.word_end },
    color: n.color, quote: n.quote, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at,
    ...(n.username ? { author: { id: n.user_id, username: n.username } } : {}),
  });

  function validateNote(b) {
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
      verse_end: b.end.verse, word_end: b.end.word, color: b.color, quote: b.quote.trim(), body };
  }

  function friendsPayload(me) {
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of stmt.friendRows.all({ me })) {
      const user = { id: r.other_id, username: r.other_name };
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
    ['GET', /^\/api\/books$/, () => ({ books: BOOKS })],

    ['POST', /^\/api\/register$/, ({ body, ip }) => {
      throttle(ip);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username must be 3–20 letters, numbers or _');
      if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      if (stmt.userByName.get(username)) throw new HttpError(409, 'That username is taken');
      const salt = crypto.randomBytes(16).toString('hex');
      const { lastInsertRowid } = stmt.insertUser.run(username, hashPassword(password, salt), salt, now());
      const id = Number(lastInsertRowid);
      return { status: 201, body: { token: createSession(id), user: { id, username } } };
    }],

    ['POST', /^\/api\/login$/, ({ body, ip }) => {
      throttle(ip);
      const u = stmt.userByName.get(String(body.username || '').trim());
      const ok = u && crypto.timingSafeEqual(
        Buffer.from(hashPassword(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
      if (!ok) throw new HttpError(401, 'Wrong username or password');
      return { token: createSession(u.id), user: { id: u.id, username: u.username } };
    }],

    ['POST', /^\/api\/logout$/, ({ token }) => { if (token) stmt.deleteSession.run(sha256(token)); return { ok: true }; }],
    ['GET', /^\/api\/me$/, ({ me }) => ({ user: me }), true],

    ['GET', /^\/api\/notes$/, ({ me, query }) => {
      const book = query.get('book');
      const rows = book ? stmt.myChapterNotes.all(me.id, book, Number(query.get('chapter'))) : stmt.myNotes.all(me.id);
      return { notes: rows.map(noteOut) };
    }, true],

    ['PUT', /^\/api\/notes\/([\w-]{8,64})$/, ({ me, body, params: [id] }) => {
      const existing = stmt.note.get(id);
      if (existing && existing.user_id !== me.id) throw new HttpError(404, 'Note not found');
      const n = validateNote(body);
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
      return { notes: rows.map(noteOut) };
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
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
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
      const [, re, fn, needsAuth] = route;
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const me = token ? stmt.sessionUser.get(sha256(token)) : null;
      if (needsAuth && !me) throw new HttpError(401, 'Please sign in again');
      const body = await readJson(req);
      const result = await fn({
        me, token, body, query: url.searchParams, params: url.pathname.match(re).slice(1),
        ip: req.socket.remoteAddress,
      });
      if (result && result.status && result.body) return send(res, result.status, result.body);
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
