import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createServer } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.DB_FILE || path.join(root, 'data', 'bible-study.db'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

createServer(db, { publicDir: path.join(root, 'public') }).listen(port, host, () => {
  console.log(`Bible Study running at http://localhost:${port}`);
});
