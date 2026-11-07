import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL DEFAULT '',
      commentary_prefs TEXT NOT NULL DEFAULT '',
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    -- One row per pair of users; user_a < user_b.
    CREATE TABLE IF NOT EXISTS friendships (
      user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_a, user_b)
    );

    -- owner_id lets viewer_id read all of owner's notes.
    CREATE TABLE IF NOT EXISTS shares (
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (owner_id, viewer_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse_start INTEGER NOT NULL,
      word_start INTEGER NOT NULL,
      verse_end INTEGER NOT NULL,
      word_end INTEGER NOT NULL,
      color TEXT NOT NULL,
      quote TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_by_chapter ON notes (book, chapter, user_id);
    CREATE INDEX IF NOT EXISTS notes_by_user ON notes (user_id, updated_at);

    -- The person's own digital books (EPUB, PDF, text). Files live on disk in the library folder.
    CREATE TABLE IF NOT EXISTS library_books (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL CHECK (format IN ('epub', 'pdf', 'txt')),
      size INTEGER NOT NULL,
      has_cover INTEGER NOT NULL DEFAULT 0,
      position TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      opened_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS library_by_user ON library_books (user_id);

    -- Highlights and notes in those books. A place is (chapter, block, word) in the app's reading of the book.
    CREATE TABLE IF NOT EXISTS library_notes (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      block_start INTEGER NOT NULL,
      word_start INTEGER NOT NULL,
      block_end INTEGER NOT NULL,
      word_end INTEGER NOT NULL,
      color TEXT NOT NULL,
      quote TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS library_notes_by_book ON library_notes (user_id, book_id);

    -- Messages between friends.
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS messages_pair ON messages (from_id, to_id, id);

    -- Group chats: a name, members (each with the last message they've read), and the group's messages.
    CREATE TABLE IF NOT EXISTS chat_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_group_members (
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_group_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      from_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      ref TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_group_messages_group ON chat_group_messages (group_id, id);

    -- Bible versions a person added from an ebook they own (text kept privately in their library folder).
    CREATE TABLE IF NOT EXISTS user_versions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      short TEXT NOT NULL,
      name TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      created_at INTEGER NOT NULL
    );
  `);
  // Databases created before display names existed get the column added.
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('display_name')) db.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('commentary_prefs')) db.exec("ALTER TABLE users ADD COLUMN commentary_prefs TEXT NOT NULL DEFAULT ''");
  // Books uploaded before fingerprints were recorded get theirs when it's first needed.
  if (!db.prepare('PRAGMA table_info(library_books)').all().some((c) => c.name === 'sha256')) db.exec('ALTER TABLE library_books ADD COLUMN sha256 TEXT');
  // Notes made before Bible versions existed are on the World English Bible.
  // Which ebook a Bible version was imported from (its SHA-256), so opening that ebook on the shelf opens the Bible reader.
  // A shared verse in a message: { book, chapter, start, end, version, text }.
  // Edited / deleted messages (the sender's own): when, so they show as "edited" or "deleted".
  for (const t of ['messages', 'chat_group_messages']) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    if (!cols.includes('edited_at')) db.exec(`ALTER TABLE ${t} ADD COLUMN edited_at INTEGER`);
    if (!cols.includes('deleted_at')) db.exec(`ALTER TABLE ${t} ADD COLUMN deleted_at INTEGER`);
  }
  if (!db.prepare('PRAGMA table_info(messages)').all().some((c) => c.name === 'ref')) db.exec('ALTER TABLE messages ADD COLUMN ref TEXT');
  if (!db.prepare('PRAGMA table_info(user_versions)').all().some((c) => c.name === 'year')) db.exec('ALTER TABLE user_versions ADD COLUMN year INTEGER');
  if (!db.prepare('PRAGMA table_info(user_versions)').all().some((c) => c.name === 'source_sha')) db.exec('ALTER TABLE user_versions ADD COLUMN source_sha TEXT');
  // A note made while reading two versions side by side: the second version and its words, kept apart from the first's.
  if (!db.prepare('PRAGMA table_info(notes)').all().some((c) => c.name === 'alt_version')) db.exec('ALTER TABLE notes ADD COLUMN alt_version TEXT; ALTER TABLE notes ADD COLUMN alt_quote TEXT');
  // A note on two versions: each version's words verse by verse ({ main: [[verse, text]…], alt: […] }), to show them interleaved.
  if (!db.prepare('PRAGMA table_info(notes)').all().some((c) => c.name === 'parts')) db.exec('ALTER TABLE notes ADD COLUMN parts TEXT');
  if (!db.prepare('PRAGMA table_info(notes)').all().some((c) => c.name === 'alt_range')) db.exec('ALTER TABLE notes ADD COLUMN alt_range TEXT');
  if (!db.prepare('PRAGMA table_info(notes)').all().some((c) => c.name === 'version')) db.exec("ALTER TABLE notes ADD COLUMN version TEXT NOT NULL DEFAULT 'web'");
  return db;
}
