import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';

test('an existing database without display names is upgraded in place', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bs-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO users (username, pass_hash, salt, created_at) VALUES ('alice', 'x', 'y', 1);`);
  old.close();
  const db = openDb(file);
  assert.deepEqual({ ...db.prepare('SELECT username, display_name FROM users').get() }, { username: 'alice', display_name: '' });
});
