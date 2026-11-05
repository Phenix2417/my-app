import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createServer } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// On Railway, a volume attached to the service is mounted at RAILWAY_VOLUME_MOUNT_PATH; keep the database there.
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data');
const db = openDb(process.env.DB_FILE || path.join(dataDir, 'bible-study.db'));
// Behind a hosting proxy every request arrives from the proxy, so read the client address it adds.
const trustProxy = process.env.TRUST_PROXY === '1' || !!process.env.RAILWAY_PROJECT_ID;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

createServer(db, { publicDir: path.join(root, 'public'), trustProxy }).listen(port, host, () => {
  console.log(`Bible Study running at http://localhost:${port}`);
});
