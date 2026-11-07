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
import { CARD_SITES } from '../public/video.js';
import { VERSIONS, VERSION_IDS, VersionError } from './versions.js';
import { ChatFileError, MAX_CHAT_FILE_BYTES, MAX_CHAT_BYTES_PER_USER, CHAT_FILE_DAYS, sniffChatFile } from './chatfiles.js';
import { LibraryError, BOOK_TYPES, MAX_BOOK_BYTES, MAX_LIBRARY_BYTES, MAX_COVER_BYTES, sniffFormat, sniffImage } from './library.js';

const COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const MAX_DISPLAY_NAME = 40;
const MAX_BODY = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.mjs': 'text/javascript; charset=utf-8', // (PDF.js, for previewing PDFs sent in chat)
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

export function createApp(db, { publicDir, trustProxy = false, commentary = null, pronounce = null, phonetics = null, translate = null, bibleDict = null, library = null, freeDict = null, versions = null, wiki = null, encyclopedias = null, chatFiles = null } = {}) {
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
        EXISTS (SELECT 1 FROM shares WHERE owner_id = u.id AND viewer_id = :me) AS they_share,
        (SELECT COUNT(*) FROM messages WHERE from_id = u.id AND to_id = :me AND read_at IS NULL) AS unread
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_a = :me THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = :me OR f.user_b = :me
      ORDER BY u.username COLLATE NOCASE`),

    conversation: q(`SELECT * FROM (SELECT * FROM messages WHERE (from_id = :me AND to_id = :other) OR (from_id = :other AND to_id = :me)
      ORDER BY id DESC LIMIT 200) ORDER BY id`),
    markRead: q('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL'),
    messageById: q('SELECT * FROM messages WHERE id = ?'),
    groupMessageById: q('SELECT * FROM chat_group_messages WHERE id = ?'),
    editMessage: q('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?'),
    editGroupMessage: q('UPDATE chat_group_messages SET body = ?, edited_at = ? WHERE id = ?'),
    deleteMessage: q("UPDATE messages SET deleted_at = ?, body = '', ref = NULL, file = NULL WHERE id = ?"),
    deleteGroupMessage: q("UPDATE chat_group_messages SET deleted_at = ?, body = '', ref = NULL, file = NULL WHERE id = ?"),
    addMessage: q('INSERT INTO messages (from_id, to_id, body, created_at, ref, file) VALUES (?, ?, ?, ?, ?, ?)'),
    addChatFile: q('INSERT INTO chat_files (id, user_id, name, type, kind, size, duration, created_at, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    chatFile: q('SELECT * FROM chat_files WHERE id = ?'),
    oldChatFiles: q('SELECT id FROM chat_files WHERE created_at < ? LIMIT 500'),
    deleteChatFile: q('DELETE FROM chat_files WHERE id = ?'),
    setChatFileMeta: q('UPDATE chat_files SET meta = ? WHERE id = ?'),
    // Chat files no message carries (never sent, or every message with it deleted) and that aren't a sent book's cover.
    unusedChatFiles: q(`SELECT id FROM chat_files cf WHERE created_at < ?
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.file IS NOT NULL AND json_extract(m.file, '$.id') = cf.id)
      AND NOT EXISTS (SELECT 1 FROM chat_group_messages g WHERE g.file IS NOT NULL AND json_extract(g.file, '$.id') = cf.id)
      AND NOT EXISTS (SELECT 1 FROM chat_files b WHERE b.meta IS NOT NULL AND json_extract(b.meta, '$.cover') = cf.id) LIMIT 500`),
    chatBytes: q('SELECT COALESCE(SUM(size), 0) AS total FROM chat_files WHERE user_id = ?'),
    lastMessage: q(`SELECT * FROM messages WHERE (from_id = :me AND to_id = :other) OR (from_id = :other AND to_id = :me) ORDER BY id DESC LIMIT 1`),
    // Group chats
    addGroup: q('INSERT INTO chat_groups (name, created_by, created_at) VALUES (?, ?, ?)'),
    renameGroup: q('UPDATE chat_groups SET name = ? WHERE id = ?'),
    group: q('SELECT * FROM chat_groups WHERE id = ?'),
    addMember: q('INSERT OR IGNORE INTO chat_group_members (group_id, user_id, joined_at, last_read) VALUES (?, ?, ?, (SELECT COALESCE(MAX(id), 0) FROM chat_group_messages WHERE group_id = ?))'),
    removeMember: q('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?'),
    member: q('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?'),
    members: q(`SELECT u.id, u.username, u.display_name FROM chat_group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at`),
    memberCount: q('SELECT COUNT(*) AS n FROM chat_group_members WHERE group_id = ?'),
    myGroups: q(`SELECT g.*, m.last_read,
        (SELECT COUNT(*) FROM chat_group_messages WHERE group_id = g.id AND id > m.last_read AND (from_id IS NULL OR from_id != :me)) AS unread,
        (SELECT COUNT(*) FROM chat_group_members WHERE group_id = g.id) AS member_count
      FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.user_id = :me`),
    lastGroupMessage: q(`SELECT gm.*, u.username, u.display_name FROM chat_group_messages gm LEFT JOIN users u ON u.id = gm.from_id
      WHERE gm.group_id = ? ORDER BY gm.id DESC LIMIT 1`),
    groupMessages: q(`SELECT * FROM (SELECT gm.*, u.username, u.display_name FROM chat_group_messages gm LEFT JOIN users u ON u.id = gm.from_id
      WHERE gm.group_id = ? ORDER BY gm.id DESC LIMIT 200) ORDER BY id`),
    addGroupMessage: q('INSERT INTO chat_group_messages (group_id, from_id, body, ref, created_at, file) VALUES (?, ?, ?, ?, ?, ?)'),
    markGroupRead: q('UPDATE chat_group_members SET last_read = MAX(last_read, ?) WHERE group_id = ? AND user_id = ?'),
    deleteGroupIfEmpty: q('DELETE FROM chat_groups WHERE id = ? AND NOT EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = ?)'),
    share: q('INSERT OR IGNORE INTO shares (owner_id, viewer_id) VALUES (?, ?)'),
    unshare: q('DELETE FROM shares WHERE owner_id = ? AND viewer_id = ?'),
    canView: q(`SELECT 1 FROM shares s JOIN friendships f
      ON f.user_a = MIN(s.owner_id, s.viewer_id) AND f.user_b = MAX(s.owner_id, s.viewer_id) AND f.status = 'accepted'
      WHERE s.owner_id = ? AND s.viewer_id = ?`),

    myNotes: q('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC'),
    myChapterNotes: q('SELECT * FROM notes WHERE user_id = ? AND book = ? AND chapter = ? ORDER BY created_at'),
    note: q('SELECT * FROM notes WHERE id = ?'),
    upsertNote: q(`INSERT INTO notes (id, user_id, book, chapter, version, verse_start, word_start, verse_end, word_end, color, quote, body, alt_version, alt_quote, alt_range, parts, created_at, updated_at)
      VALUES (:id, :user_id, :book, :chapter, :version, :verse_start, :word_start, :verse_end, :word_end, :color, :quote, :body, :alt_version, :alt_quote, :alt_range, :parts, :now, :now)
      ON CONFLICT (id) DO UPDATE SET book = :book, chapter = :chapter, version = :version, verse_start = :verse_start, word_start = :word_start,
        verse_end = :verse_end, word_end = :word_end, color = :color, quote = :quote, body = :body, alt_version = :alt_version, alt_quote = :alt_quote, alt_range = :alt_range, parts = :parts, updated_at = :now`),
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
    ...(n.parts ? { parts: JSON.parse(n.parts) } : {}),
    ...(n.alt_quote ? { alt: { version: n.alt_version, quote: n.alt_quote, ...(n.alt_label ? { label: n.alt_label } : {}), ...(n.alt_range ? JSON.parse(n.alt_range) : {}) } } : {}),
    ...(n.version_label ? { versionLabel: n.version_label } : {}),
    ...(n.username ? { author: userOut(n.user_id, n.username, n.display_name) } : {}),
  });

  const ownVersion = (me, id) => !!(me && /^u[\w-]{6,20}$/.test(String(id)) && stmt.userVersion.get(id, me.id));
  // Each version's words verse by verse: { main: [[verse, text]…], alt: [[verse, text]…] } (checked, size-limited), as JSON.
  function cleanParts(parts) {
    const list = (x) => (Array.isArray(x) ? x.slice(0, 200).filter((e) => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 1 && e[0] <= 200 && typeof e[1] === 'string')
      .map(([v, t]) => [v, t.trim().slice(0, 2000)]).filter(([, t]) => t) : []);
    const main = list(parts?.main), alt = list(parts?.alt);
    const json = main.length ? JSON.stringify({ main, alt }) : null;
    return json && json.length <= 12000 ? json : null;
  }
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
      version: b.version == null ? 'web' : VERSION_IDS.has(b.version) || ownVersion(me, b.version) ? b.version : (() => { throw new HttpError(400, 'Unknown Bible version'); })(),
      // The second version's words, when the selection covered both versions read side by side.
      ...(() => {
        const a = b.alt, q = typeof a?.quote === 'string' ? a.quote.trim().slice(0, 4000) : '';
        if (!q || !(VERSION_IDS.has(a.version) || ownVersion(me, a.version))) {
          const parts = cleanParts(b.parts);
          return { alt_version: null, alt_quote: null, alt_range: null, parts: parts && JSON.stringify({ main: JSON.parse(parts).main, alt: [] }) };
        }
        // Where its words are in that version (for highlighting them), if given and sensible.
        const ok = (x) => x && int(x.verse, 1, 200) && int(x.word, 0, 500);
        const range = ok(a.start) && ok(a.end) ? JSON.stringify({ start: { verse: a.start.verse, word: a.start.word }, end: { verse: a.end.verse, word: a.end.word } }) : null;
        return { alt_version: a.version, alt_quote: q, alt_range: range, parts: cleanParts(b.parts) };
      })() };
  }

  function friendsPayload(me) {
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of stmt.friendRows.all({ me })) {
      const user = userOut(r.other_id, r.other_name, r.other_display);
      if (r.status === 'accepted') out.friends.push({ ...user, sharing: !!r.i_share, sharesWithMe: !!r.they_share, unread: r.unread || 0 });
      else if (r.requested_by === me) out.outgoing.push(user);
      else out.incoming.push(user);
    }
    return out;
  }

  // A shared verse, checked: { book, chapter, start, end, version, text }.
  function cleanRef(ref) {
    if (!ref) return null;
    const n = (x, max) => (Number.isInteger(x) && x >= 1 && x <= max ? x : null);
    const book = BOOK_IDS.has(ref.book) ? ref.book : null, chapter = n(ref.chapter, 150), start = n(ref.start, 176);
    const end = n(ref.end, 176) || start, text = String(ref.text ?? '').trim().slice(0, 2000);
    if (!book || !chapter || !start || end < start || !text) throw new HttpError(400, 'Invalid verse');
    const version = (x) => (/^[\w-]{2,20}$/.test(x?.version || '') ? x.version : 'web');
    const label = (x) => String(x?.label ?? '').trim().slice(0, 20);
    // The second version's words, when two were read side by side.
    const altText = String(ref.alt?.text ?? '').trim().slice(0, 2000);
    // kind: 'note' for a shared note (else a shared verse).
    const parts = cleanParts(ref.parts);
    return { book, chapter, start, end, ...(parts ? { parts: JSON.parse(parts) } : {}), ...(ref.kind === 'note' ? { kind: 'note' } : {}), version: version(ref), ...(label(ref) ? { label: label(ref) } : {}), text,
      ...(altText ? { alt: { version: version(ref.alt), ...(label(ref.alt) ? { label: label(ref.alt) } : {}), text: altText } } : {}) };
  }
  const messageOut = (m, me) => ({ id: m.id, mine: m.from_id === me, body: m.deleted_at ? '' : m.body, createdAt: m.created_at,
    ...(m.deleted_at ? { deleted: true } : m.edited_at ? { editedAt: m.edited_at } : {}),
    ...(m.ref && !m.deleted_at ? { ref: JSON.parse(m.ref) } : {}),
    ...(m.file && !m.deleted_at ? { file: fileState(JSON.parse(m.file)) } : {}),
    ...(m.username !== undefined && m.from_id !== me ? { from: m.username ? userOut(m.from_id, m.username, m.display_name) : null } : {}) });
  // A file sent with a message: one uploaded to chat (by anyone: forwarding sends the same file on). Its id is its key.
  const fileOut = (f) => ({ id: f.id, name: f.name, type: f.type, kind: f.kind, size: f.size, ...(f.duration ? { duration: f.duration } : {}),
    ...(f.meta ? { book: JSON.parse(f.meta) } : {}) });
  // A book's details for its card: title, author, and its cover (a picture this person sent to chat).
  // bible: whether it holds a Bible (so the app offers to add it as a Bible version).
  function bookMeta(me, { title, author, cover, bible } = {}) {
    const c = /^[0-9a-f]{32}$/.test(cover || '') && stmt.chatFile.get(cover);
    const meta = { title: cleanText(title, 200), author: cleanText(author, 120), ...(c && c.kind === 'image' && c.user_id === me ? { cover: c.id } : {}), ...(bible !== undefined ? { bible: bible === true || bible === 'true' } : {}) };
    return meta.title || meta.cover ? JSON.stringify(meta) : null;
  }
  // A message's file, marked expired once it's been deleted (a month after it was sent).
  const fingerprintFile = async (file) => { const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(file)) h.update(c); return h.digest('hex'); };
  const fileState = (f) => { const row = stmt.chatFile.get(f.id); return row ? fileOut(row) : { ...f, expired: true }; };
  // Delete chat files more than CHAT_FILE_DAYS old: on start, then every hour.
  async function purgeChatFiles(at = now()) {
    let gone = 0;
    for (;;) {
      const old = stmt.oldChatFiles.all(at - CHAT_FILE_DAYS * 86400000);
      if (!old.length) return gone;
      for (const { id } of old) { if (chatFiles) await chatFiles.remove(id).catch(() => {}); stmt.deleteChatFile.run(id); gone++; }
    }
  }
  // Delete every file nothing in the app uses any more: chat files no message carries, and files on disk with no
  // record (a book or cover whose book was deleted, a removed Bible version, uploads left unfinished). A file gets an
  // hour's grace, so one being sent or added right now isn't taken.
  async function sweepOrphans(at = now()) {
    let n = 0;
    for (;;) {
      const unused = stmt.unusedChatFiles.all(at - 3600000);
      if (!unused.length) break;
      for (const { id } of unused) { if (chatFiles) await chatFiles.remove(id).catch(() => {}); stmt.deleteChatFile.run(id); n++; }
    }
    if (chatFiles?.sweepOrphans) n += await chatFiles.sweepOrphans((id) => !!stmt.chatFile.get(id), at - 3600000);
    if (library?.sweepOrphans) {
      n += await library.sweepOrphans({ hasBook: (u, id) => !!stmt.libraryBook.get(id, Number(u)), hasVersion: (u, v) => !!stmt.userVersion.get(v, Number(u)) }, at - 3600000);
    }
    return n;
  }
  // (Run on start and every hour by the server: expired chat files, then unused files, then unlinked stored copies.)
  function cleanFile(file) {
    if (!file) return null;
    const f = /^[0-9a-f]{32}$/.test(file.id || '') && stmt.chatFile.get(file.id);
    if (!f || f.created_at < now() - CHAT_FILE_DAYS * 86400000) throw new HttpError(400, 'That file has expired');
    return fileOut(f);
  }
  const messageText = (body) => String(body ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
  // A message this person sent, still in a conversation they're in.
  function ownMessage(kind, id, me) {
    const m = (kind === 'dm' ? stmt.messageById : stmt.groupMessageById).get(Number(id));
    if (!m || m.from_id !== me) throw new HttpError(404, 'Message not found');
    if (kind === 'group' && !stmt.member.get(m.group_id, me)) throw new HttpError(404, 'Message not found');
    return m;
  }
  function groupFor(me, id) {
    const g = stmt.group.get(Number(id));
    if (!g || !stmt.member.get(g.id, me)) throw new HttpError(404, 'Group not found');
    return g;
  }
  const groupOut = (g) => ({ id: g.id, name: g.name, members: stmt.members.all(g.id).map((u) => userOut(u.id, u.username, u.display_name)) });
  const videoLinks = new Map(); // short link -> where it leads
  // Pages on the platforms that chat shows (videos, posts, cards); short links and cards only ever go to these.
  const PLATFORM_URL = new RegExp(`^https?:\\/\\/([\\w-]+\\.)*(${Object.keys(CARD_SITES).map((d) => d.replace(/\./g, '\\.')).join('|')})(:443)?\\/`);
  const linkCards = new Map(); // page address -> card
  const cardImages = new Map(); // key -> picture address (only pictures named by a card can be fetched)
  const weiboCards = new Map(); // 微博 post id -> card
  function acceptedFriend(me, id) {
    const other = stmt.userById.get(Number(id));
    const f = other && stmt.friendship.get(Math.min(me, other.id), Math.max(me, other.id));
    if (!f || f.status !== 'accepted') throw new HttpError(404, 'You are not friends with this person');
    return other;
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
    ['GET', /^\/api\/library$/, async ({ me }) => {
      // Books added before fingerprints were recorded get theirs now (once), so an imported Bible can be matched to them.
      const books = stmt.myLibrary.all(me.id);
      if (library) for (const b of books) if (!b.sha256) { b.sha256 = await library.fingerprint(me.id, b.id).catch(() => null); if (b.sha256) stmt.setLibrarySha.run(b.sha256, b.id); }
      return { books: books.map(libraryOut) };
    }, true],
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
      await library.keep(up.tmp, me.id, id, { sha: up.sha256 });
      stmt.addLibraryBook.run({ id, user_id: me.id, title, author, format, size: up.size, sha256: up.sha256, now: now() });
      return { status: 201, body: { book: libraryOut(stmt.libraryBook.get(id, me.id)) } };
    }, true, { raw: true }],
    // A book sent in chat, put on my shelf: the server links the same stored file (and its cover); nothing is uploaded again.
    ['POST', /^\/api\/library\/from-chat$/, async ({ me, body }) => {
      needLibrary();
      const f = /^[0-9a-f]{32}$/.test(body.file || '') && stmt.chatFile.get(body.file);
      const disk = f && f.created_at >= now() - CHAT_FILE_DAYS * 86400000 && chatFiles && await chatFiles.read(f.id);
      if (!disk) throw new HttpError(404, 'This file has expired');
      const head = Buffer.alloc(4096), fd = await fs.promises.open(disk.file);
      const { bytesRead } = await fd.read(head, 0, 4096, 0); await fd.close();
      const format = sniffFormat(head.subarray(0, bytesRead), /\.epub$/i.test(f.name) ? 'epub' : null);
      if (!format) throw new HttpError(415, 'Only EPUB, PDF and text files can be added.');
      if (disk.size > MAX_BOOK_BYTES) throw new HttpError(413, 'That file is too large.');
      if (stmt.libraryBytes.get(me.id).total + disk.size > MAX_LIBRARY_BYTES) throw new HttpError(413, 'Your library is full. Delete a book to make room.');
      const sha = f.sha256 || await fingerprintFile(disk.file);
      const same = await findSameBook(me.id, sha, disk.size);
      if (same) return { status: 200, body: { book: libraryOut(same), duplicate: true } };
      const meta = f.meta ? JSON.parse(f.meta) : {};
      const id = crypto.randomBytes(12).toString('base64url');
      const title = cleanText(body.title || meta.title, 200) || f.name.replace(/\.[^.]+$/, '') || 'Untitled', author = cleanText(meta.author || body.author, 120);
      await library.keepShared(disk.file, me.id, id);
      stmt.addLibraryBook.run({ id, user_id: me.id, title, author, format, size: disk.size, sha256: sha, now: now() });
      const cover = meta.cover && stmt.chatFile.get(meta.cover), coverDisk = cover && cover.size <= MAX_COVER_BYTES && await chatFiles.read(cover.id);
      if (coverDisk) { await library.keepShared(coverDisk.file, me.id, id, { cover: true }); stmt.setLibraryCover.run(id, me.id); }
      return { status: 201, body: { book: libraryOut(stmt.libraryBook.get(id, me.id)) } };
    }, true],
    ['PUT', /^\/api\/library\/([\w-]{16})\/cover$/, async ({ me, params: [id], req }) => {
      needLibrary(); myBook(me, id);
      const up = await library.receive(req, me.id, MAX_COVER_BYTES).catch(libraryErr);
      if (!sniffImage(up.head)) { await library.discard(up.tmp); throw new HttpError(415, 'The cover must be a JPEG or PNG image.'); }
      await library.keep(up.tmp, me.id, id, { cover: true, sha: up.sha256 });
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

    // Messages between friends: the conversation (the friend's messages are then marked read), and sending one.
    ['GET', /^\/api\/messages\/(\d+)$/, ({ me, params: [id] }) => {
      const other = acceptedFriend(me.id, id);
      const rows = stmt.conversation.all({ me: me.id, other: other.id });
      stmt.markRead.run(now(), other.id, me.id);
      return { messages: rows.map((m) => messageOut(m, me.id)) };
    }, true],
    ['POST', /^\/api\/messages\/(\d+)$/, ({ me, params: [id], body }) => {
      const other = acceptedFriend(me.id, id);
      const ref = cleanRef(body.ref), file = cleanFile(body.file), text = messageText(body.body) || (ref || file ? ' ' : '');
      if (!text) throw new HttpError(400, 'Write a message first');
      const at = now(), r = stmt.addMessage.run(me.id, other.id, text, at, ref ? JSON.stringify(ref) : null, file ? JSON.stringify(file) : null);
      return { status: 201, body: { message: { id: Number(r.lastInsertRowid), mine: true, body: text, createdAt: at, ...(ref ? { ref } : {}), ...(file ? { file } : {}) } } };
    }, true],

    // An app's short link (b23.tv, vm./vt.tiktok.com, tiktok.com/t/, v.douyin.com, fb.watch, facebook.com/share/v|r) → where it leads. Only those hosts are
    // asked, only their redirects are followed (to the same sites), and only the address is returned.
    ['GET', /^\/api\/video-link$/, async ({ query }) => {
      const SHORT = /^https:\/\/(b23\.tv|vm\.tiktok\.com|vt\.tiktok\.com|www\.tiktok\.com\/t|v\.douyin\.com|fb\.watch|www\.facebook\.com\/share\/[vrp]|t\.cn|xhslink\.com(\/[am])?)\/[\w-]{4,30}\/?$/;
      const DEST = PLATFORM_URL;
      let url = String(query.get('url') || (query.get('b23') ? `https://b23.tv/${query.get('b23')}` : ''));
      if (!SHORT.test(url)) throw new HttpError(400, 'Invalid link');
      if (videoLinks.has(url)) return { url: videoLinks.get(url) };
      const start = url;
      for (let i = 0; i < 4; i++) {
        let res;
        try { res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }, signal: AbortSignal.timeout(8000) }); }
        catch { throw new HttpError(503, "Couldn't open that link."); }
        const to = res.headers.get('location');
        if (!to) break;
        const next = new URL(to, url).href;
        if (!DEST.test(next)) throw new HttpError(404, 'Not a video link');
        url = next;
        if (!SHORT.test(url)) break;
      }
      if (url === start) throw new HttpError(404, 'Not a video link');
      const clean = url.split('#')[0];
      videoLinks.set(start, clean); if (videoLinks.size > 2000) videoLinks.delete(videoLinks.keys().next().value);
      return { url: clean };
    }, true],
    // A link card for a page on those platforms (profiles, channels, 动态, 小红书 notes, photo posts…): its title,
    // description, site name and picture, from the page's Open Graph tags. Redirects are followed only within the platforms.
    ['GET', /^\/api\/link-card$/, async ({ query }) => {
      let url = String(query.get('url') || '');
      if (!PLATFORM_URL.test(url) || url.length > 1000) throw new HttpError(400, 'Invalid link');
      if (linkCards.has(url)) return linkCards.get(url);
      const asked = url;
      // Wikipedia: the article's summary (title, opening sentences, picture) from its own API, in the page's language.
      const wm = url.match(/^https:\/\/([a-z-]{2,12})\.wikipedia\.org\/(wiki|zh-[a-z]{2,4})\/([^#?]+)/);
      if (wm) {
        let d = null;
        try {
          const r = await fetch(`https://${wm[1]}.wikipedia.org/api/rest_v1/page/summary/${wm[3]}`, { headers: { 'User-Agent': 'BibleStudyApp/1.0 (+https://github.com/Phenix2417/my-app)', ...(wm[2] !== 'wiki' ? { 'Accept-Language': wm[2] } : wm[1] === 'zh' ? { 'Accept-Language': 'zh-cn' } : {}) }, signal: AbortSignal.timeout(8000) });
          if (r.ok) d = await r.json();
        } catch { /* unreachable */ }
        if (!d?.title) throw new HttpError(404, 'No preview for this link');
        let image = null;
        const pic = d.thumbnail?.source;
        if (/^https:\/\/upload\.wikimedia\.org\//.test(pic || '')) { const key = sha256(pic).slice(0, 24); cardImages.set(key, { url: pic, referer: url }); image = `/api/card-image/${key}`; }
        const card = { title: d.title, text: String(d.extract || d.description || '').slice(0, 400), site: wm[1] === 'zh' ? '维基百科' : 'Wikipedia', image, url };
        linkCards.set(asked, card);
        return card;
      }
      const page = async (ua) => {
        let at = asked;
        for (let i = 0; i < 4; i++) {
          let res;
          try { res = await fetch(at, { redirect: 'manual', headers: { 'User-Agent': ua, Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(8000) }); } catch { return null; }
          const to = res.headers.get('location');
          if (to) { const next = new URL(to, at).href; if (!PLATFORM_URL.test(next)) return null; at = next; continue; }
          if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) return null;
          const reader = res.body.getReader(); let got = 0; const parts = [];
          while (got < 1_500_000) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; }
          reader.cancel().catch(() => {});
          return { html: Buffer.concat(parts.map((x) => Buffer.from(x))).toString('utf8'), at };
        }
        return null;
      };
      const meta = (html, names) => {
        for (const n of names) {
          const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
          const m = html.match(re); if (m) return (m[1] ?? m[2]).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        }
        return '';
      };
      // Asked honestly as this app's link-preview fetcher; a site that doesn't share previews with it just gets the plain card.
      const got = await page('BibleStudyApp-LinkPreview/1.0 (+https://github.com/Phenix2417/my-app)');
      if (!got) throw new HttpError(404, 'No preview for this link');
      const { html, at } = got;
      const title = (meta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]{1,300})/i) || [])[1] || '').replace(/&amp;/g, '&').trim();
      // A login or "security check" page instead of the post isn't worth a card.
      if (!title || (/^(知乎|zhihu|安全验证|登录|log ?in|sign ?in|access denied|robot check|just a moment)/i.test(title) && title.length < 20)) throw new HttpError(404, 'No preview for this link');
      // Only the site's own name ("Amazon.com", "淘宝网") isn't a preview of the page either.
      const bare = (x) => String(x).toLowerCase().replace(/^www\./, '').replace(/\.(com|cn|net|org|us)$/, '').replace(/[\s:：|\-–—_.网]+/g, '');
      const domain = new URL(at).hostname.replace(/^([\w-]+\.)*(?=[\w-]+\.[a-z]+$)/, '');
      if (bare(title) === bare(domain) || bare(title) === bare(CARD_SITES[domain] || '') || /^amazon\.com\s*[:：]\s*online shopping/i.test(title)) throw new HttpError(404, 'No preview for this link');
      let picture = meta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
      if (picture.startsWith('//')) picture = `https:${picture}`;
      let image = null;
      let picHost = ''; try { picHost = new URL(picture).hostname; } catch { /* not an address */ }
      // Only ordinary public addresses (no IP literals or local names).
      if (/^https?:\/\//.test(picture) && /\.[a-z]{2,}$/i.test(picHost) && !/^(localhost|[\d.]+|\[.*\])$/i.test(picHost)) { const key = sha256(picture).slice(0, 24); cardImages.set(key, { url: picture, referer: at }); image = `/api/card-image/${key}`; }
      const card = { title: title.slice(0, 200), text: meta(html, ['og:description', 'twitter:description', 'description']).slice(0, 400),
        site: meta(html, ['og:site_name']) || new URL(at).hostname.replace(/^www\./, ''), image, url: at };
      linkCards.set(asked, card); if (linkCards.size > 2000) linkCards.delete(linkCards.keys().next().value);
      if (cardImages.size > 5000) cardImages.delete(cardImages.keys().next().value);
      return card;
    }, true],
    // A card's picture, passed through (only pictures that a card named; loaded by <img>, so no sign-in).
    ['GET', /^\/api\/card-image\/([0-9a-f]{24})$/, async ({ params: [key] }) => {
      const pic = cardImages.get(key);
      if (!pic) throw new HttpError(404, 'No picture');
      let res;
      try { res = await fetch(pic.url, { headers: { Referer: pic.referer, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }); } catch { throw new HttpError(503, "Couldn't load the picture."); }
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/^image\/(jpeg|png|gif|webp|avif)/.test(type)) throw new HttpError(404, 'No picture');
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > 8 * 1024 * 1024) throw new HttpError(413, 'Picture too large');
      return { status: 200, body, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } };
    }, false],
    // A 微博 post as a card: author, text, a picture or video cover (pictures come through /api/weibo-image). From
    // m.weibo.cn's public post data; Weibo can't be shown in a frame. Kept for a while.
    ['GET', /^\/api\/weibo\/(\w{6,20}|1034:\d{6,25})$/, async ({ params: [id] }) => {
      if (weiboCards.has(id)) return weiboCards.get(id);
      const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', Referer: 'https://m.weibo.cn/', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
      const get = async (url) => { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; } };
      const img = (u) => (/^https?:\/\/[\w.-]+\.sinaimg\.cn\//.test(u || '') ? `/api/weibo-image?url=${encodeURIComponent(u.replace(/^http:/, 'https:'))}` : null);
      let card = null;
      if (/^1034:/.test(id)) {
        const d = await get(`https://h5.video.weibo.com/api/component?page=${encodeURIComponent(`/show/${id}`)}`);
        const v = d?.data?.Component_Play_Playinfo;
        if (v) card = { author: v.author || '', text: String(v.title || v.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 500), picture: img(v.cover_image && (v.cover_image.startsWith('//') ? `https:${v.cover_image}` : v.cover_image)), video: true, url: `https://weibo.com/tv/show/${id}` };
      } else {
        const d = await get(`https://m.weibo.cn/statuses/show?id=${id}`);
        const p = d?.ok === 1 ? d.data : null;
        if (p) {
          const text = String(p.text || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
          const video = p.page_info?.type === 'video';
          card = { author: p.user?.screen_name || '', avatar: img(p.user?.profile_image_url), text: text.slice(0, 500),
            picture: img(video ? p.page_info?.page_pic?.url : p.pics?.[0]?.large?.url || p.pics?.[0]?.url), pictures: (p.pics || []).length, video,
            url: `https://m.weibo.cn/status/${p.bid || p.id || id}` };
        }
      }
      if (!card) throw new HttpError(404, 'Weibo post not available');
      weiboCards.set(id, card); if (weiboCards.size > 1000) weiboCards.delete(weiboCards.keys().next().value);
      return card;
    }, true],
    // A 微博 picture (sinaimg.cn only), passed through with the Referer Weibo's image servers need.
    ['GET', /^\/api\/weibo-image$/, async ({ query }) => {
      const url = String(query.get('url') || '');
      if (!/^https:\/\/[\w.-]+\.sinaimg\.cn\/[\w./%-]+$/.test(url)) throw new HttpError(400, 'Invalid picture');
      let res;
      try { res = await fetch(url, { headers: { Referer: 'https://weibo.com/' }, signal: AbortSignal.timeout(10000) }); } catch { throw new HttpError(503, "Couldn't load the picture."); }
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/^image\/(jpeg|png|gif|webp)/.test(type)) throw new HttpError(404, 'No picture');
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > 8 * 1024 * 1024) throw new HttpError(413, 'Picture too large');
      return { status: 200, body, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } };
    }, false], // loaded by <img>, which sends no sign-in; only sinaimg.cn pictures are passed through
    // A file to send in chat: the body is the file itself; name, type (the phone's guess) and, for recordings, duration
    // (seconds) come in the address. What it is comes from its first bytes.
    ['POST', /^\/api\/chat-files$/, async ({ me, req, query }) => {
      if (!chatFiles) throw new HttpError(503, 'Sending files is not set up on this server');
      const room = Math.min(MAX_CHAT_FILE_BYTES, MAX_CHAT_BYTES_PER_USER - stmt.chatBytes.get(me.id).total);
      if (room <= 0) throw new HttpError(413, "You've sent too many files. Delete some messages with files to make room.");
      const up = await chatFiles.receive(req, room).catch((e) => { if (e instanceof ChatFileError) throw new HttpError(e.status, e.message); throw e; });
      const { kind, type } = sniffChatFile(up.head, String(query.get('type') || ''));
      const name = cleanText(query.get('name'), 120).replace(/[\\/\u0000-\u001f]/g, '_') || 'file';
      const d = Number(query.get('duration'));
      const duration = (kind === 'audio' || kind === 'video') && d > 0 && d < 86400 ? Math.round(d * 10) / 10 : null;
      stmt.addChatFile.run(up.id, me.id, name, type, kind, up.size, duration, now(), up.sha256);
      if (type === 'application/epub+zip') stmt.setChatFileMeta.run(bookMeta(me.id, { title: query.get('title'), author: query.get('author'), cover: query.get('cover'), bible: query.get('bible') ?? undefined }), up.id);
      return { status: 201, body: { file: fileOut(stmt.chatFile.get(up.id)) } };
    }, true, { raw: true }],
    // A book sent before its details were read (title, author, cover): the person who sent it fills them in.
    ['PUT', /^\/api\/chat-files\/([0-9a-f]{32})\/book$/, ({ me, params: [id], body }) => {
      const f = stmt.chatFile.get(id);
      if (!f || f.user_id !== me.id) throw new HttpError(404, 'File not found');
      stmt.setChatFileMeta.run(bookMeta(me.id, body), id);
      return { status: 200, body: { file: fileOut(stmt.chatFile.get(id)) } }; // (a bare { file } would be taken as a file to stream)
    }, true],
    // A chat file, by its id (shown by <img>/<video>/<audio>, which send no sign-in). Pictures, videos and sound play in
    // the page; anything else is only ever downloaded. Ranges are served, so videos can seek (and play at all on iPhones).
    ['GET', /^\/api\/chat-file\/([0-9a-f]{32})$/, async ({ params: [id] }) => {
      const f = stmt.chatFile.get(id), disk = f && chatFiles && await chatFiles.read(id);
      if (!disk) throw new HttpError(404, 'File not found');
      if (f.created_at < now() - CHAT_FILE_DAYS * 86400000) throw new HttpError(404, 'This file has expired');
      const show = f.kind !== 'file';
      return { file: disk.file, size: disk.size, ranges: true, headers: { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': `${show ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'Content-Security-Policy': "sandbox; default-src 'none'" } };
    }, false],
    // Edit or delete a message you sent (in a private chat: kind 'dm'; in a group: 'group'). A deleted message stays
    // in the conversation as "deleted"; an edited one is marked "edited".
    ['PUT', /^\/api\/(dm|group)-messages\/(\d+)$/, ({ me, params: [kind, id], body }) => {
      const m = ownMessage(kind, id, me.id);
      if (m.deleted_at) throw new HttpError(400, 'That message was deleted');
      const text = messageText(body.body);
      if (!text && !m.ref && !m.file) throw new HttpError(400, 'Write a message first');
      const at = now();
      (kind === 'dm' ? stmt.editMessage : stmt.editGroupMessage).run(text || ' ', at, m.id);
      return { message: messageOut({ ...m, body: text || ' ', edited_at: at }, me.id) };
    }, true],
    ['DELETE', /^\/api\/(dm|group)-messages\/(\d+)$/, ({ me, params: [kind, id] }) => {
      const m = ownMessage(kind, id, me.id);
      (kind === 'dm' ? stmt.deleteMessage : stmt.deleteGroupMessage).run(now(), m.id);
      return { ok: true };
    }, true],
    // All conversations, newest first: friends (private chats) and groups, with the last message and unread count.
    ['GET', /^\/api\/chats$/, ({ me }) => {
      const f = friendsPayload(me.id);
      const preview = (m) => (m ? { body: m.deleted_at ? '' : m.body, deleted: !!m.deleted_at, verse: m.ref && !m.deleted_at ? JSON.parse(m.ref) : null,
        file: m.file && !m.deleted_at ? (({ kind, name, duration }) => ({ kind, name, duration }))(JSON.parse(m.file)) : null, mine: m.from_id === me.id, at: m.created_at,
        from: m.username && m.from_id !== me.id ? userOut(m.from_id, m.username, m.display_name) : null } : null);
      const chats = [
        ...f.friends.map((u) => ({ kind: 'friend', id: u.id, user: u, name: u.displayName, unread: u.unread, last: preview(stmt.lastMessage.get({ me: me.id, other: u.id })) })),
        ...stmt.myGroups.all({ me: me.id }).map((g) => ({ kind: 'group', id: g.id, name: g.name, members: g.member_count, unread: g.unread,
          last: preview(stmt.lastGroupMessage.get(g.id)), createdAt: g.created_at })),
      ].sort((a, b) => (b.last?.at || b.createdAt || 0) - (a.last?.at || a.createdAt || 0));
      return { chats, incoming: f.incoming, outgoing: f.outgoing };
    }, true],

    // Group chats: create (with friends), see, rename, add members, leave; read and send messages.
    ['POST', /^\/api\/groups$/, ({ me, body }) => {
      const name = cleanText(body.name, 40);
      if (!name) throw new HttpError(400, 'Please give the group a name');
      const ids = [...new Set((Array.isArray(body.members) ? body.members : []).map(Number))].filter((id) => id !== me.id).slice(0, 200);
      for (const id of ids) acceptedFriend(me.id, id);
      const at = now(), gid = Number(stmt.addGroup.run(name, me.id, at).lastInsertRowid);
      for (const id of [me.id, ...ids]) stmt.addMember.run(gid, id, at, gid);
      return { status: 201, body: { group: groupOut(stmt.group.get(gid)) } };
    }, true],
    ['GET', /^\/api\/groups\/(\d+)$/, ({ me, params: [id] }) => ({ group: groupOut(groupFor(me.id, id)) }), true],
    ['PUT', /^\/api\/groups\/(\d+)$/, ({ me, params: [id], body }) => {
      const g = groupFor(me.id, id), name = cleanText(body.name, 40);
      if (!name) throw new HttpError(400, 'Please give the group a name');
      stmt.renameGroup.run(name, g.id);
      return { group: groupOut(stmt.group.get(g.id)) };
    }, true],
    ['POST', /^\/api\/groups\/(\d+)\/members$/, ({ me, params: [id], body }) => {
      const g = groupFor(me.id, id);
      for (const uid of (Array.isArray(body.members) ? body.members : []).map(Number).slice(0, 200)) { acceptedFriend(me.id, uid); stmt.addMember.run(g.id, uid, now(), g.id); }
      return { group: groupOut(g) };
    }, true],
    ['DELETE', /^\/api\/groups\/(\d+)\/members\/me$/, ({ me, params: [id] }) => {
      const g = groupFor(me.id, id);
      stmt.removeMember.run(g.id, me.id);
      stmt.deleteGroupIfEmpty.run(g.id, g.id);
      return { ok: true };
    }, true],
    ['GET', /^\/api\/groups\/(\d+)\/messages$/, ({ me, params: [id] }) => {
      const g = groupFor(me.id, id), rows = stmt.groupMessages.all(g.id);
      if (rows.length) stmt.markGroupRead.run(rows[rows.length - 1].id, g.id, me.id);
      return { messages: rows.map((m) => messageOut(m, me.id)) };
    }, true],
    ['POST', /^\/api\/groups\/(\d+)\/messages$/, ({ me, params: [id], body }) => {
      const g = groupFor(me.id, id);
      const ref = cleanRef(body.ref), file = cleanFile(body.file), text = messageText(body.body) || (ref || file ? ' ' : '');
      if (!text) throw new HttpError(400, 'Write a message first');
      const at = now(), mid = Number(stmt.addGroupMessage.run(g.id, me.id, text, ref ? JSON.stringify(ref) : null, at, file ? JSON.stringify(file) : null).lastInsertRowid);
      stmt.markGroupRead.run(mid, g.id, me.id);
      return { status: 201, body: { message: { id: mid, mine: true, body: text, createdAt: at, ...(ref ? { ref } : {}), ...(file ? { file } : {}) } } };
    }, true],

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
      // A note made in a friend's own imported Bible: someone who has that Bible too (imported from the same ebook, or a
      // version with the same short name and language) sees it in their copy; anyone else sees it labelled with its name.
      const mine = stmt.myVersions.all(me.id), owners = new Map();
      const visible = [];
      // A version as the viewer knows it: built in; their copy of the friend's own Bible; or the friend's, named.
      const place = (id) => {
        if (!/^u/.test(id || '')) return { id };
        if (!owners.has(id)) owners.set(id, stmt.versionById.get(id));
        const theirs = owners.get(id);
        const match = theirs && mine.find((v) => v.lang === theirs.lang && ((theirs.source_sha && v.source_sha === theirs.source_sha) || v.short === theirs.short));
        return match ? { id: match.id } : { id, label: theirs?.short || 'Bible' };
      };
      for (const n of rows) {
        const main = place(n.version), alt = n.alt_version ? place(n.alt_version) : null;
        visible.push({ ...n, version: main.id, ...(main.label ? { version_label: main.label } : {}),
          ...(alt ? { alt_version: alt.id, ...(alt.label ? { alt_label: alt.label } : {}) } : {}) });
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
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://player.bilibili.com https://platform.twitter.com https://www.instagram.com https://www.tiktok.com https://open.douyin.com https://www.facebook.com; base-uri 'none'; frame-ancestors 'none'",
        } : {}),
      });
    });
  }

  return Object.assign(async function handler(req, res) {
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
      if (result && result.file) { // a file from disk, streamed (a part of it, when asked for a range)
        const base = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(result.ranges ? { 'Accept-Ranges': 'bytes' } : {}), ...result.headers };
        const r = result.ranges && /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
        if (r && (r[1] || r[2])) {
          const size = result.size;
          let start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2])), end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
          if (start >= size || start > end) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${size}` }); return res.end(); }
          res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(result.file, { start, end }).on('error', () => res.destroy()).pipe(res);
        }
        res.writeHead(200, { ...base, 'Content-Length': result.size });
        return fs.createReadStream(result.file).on('error', () => res.destroy()).pipe(res);
      }
      return send(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Something went wrong' });
    }
  }, { purgeChatFiles, sweepOrphans });
}

export function createServer(db, opts) {
  const app = createApp(db, opts);
  return Object.assign(http.createServer(app), { purgeChatFiles: app.purgeChatFiles, sweepOrphans: app.sweepOrphans });
}
