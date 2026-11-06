import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createServer, seedTestUsers } from './app.js';
import { createCommentaryService } from './commentary.js';
import { createPronounceService, createPhoneticsService, createFreeDictionary } from './pronounce.js';
import { createTranslateService } from './translate.js';
import { createBibleDictionary } from './bibledict.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// On Railway, a volume attached to the service is mounted at RAILWAY_VOLUME_MOUNT_PATH; keep the database there.
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data');
const db = openDb(process.env.DB_FILE || path.join(dataDir, 'bible-study.db'));
// Behind a hosting proxy every request arrives from the proxy, so read the client address it adds.
const trustProxy = process.env.TRUST_PROXY === '1' || !!process.env.RAILWAY_PROJECT_ID;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

// Test accounts, created on startup when missing. Set SEED_TEST_USERS=0 to turn this off.
if (process.env.SEED_TEST_USERS !== '0') {
  const created = seedTestUsers(db, [
    { username: 'phenix', password: 'xqq888999', displayName: 'Phenix' },
    { username: 'james', password: 'xqq888999', displayName: 'James' },
  ]);
  if (created.length) console.log(`Created test accounts: ${created.join(', ')}`);
}

const commentary = createCommentaryService({ cacheDir: path.join(dataDir, 'commentary-cache') });

const freeDict = createFreeDictionary();
const pronounce = createPronounceService({ cacheDir: path.join(dataDir, 'audio-cache'), freeDict });
const phonetics = createPhoneticsService({ cacheDir: path.join(dataDir, 'phonetics-cache'), freeDict });
const translate = createTranslateService({ cacheDir: path.join(dataDir, 'translate-cache') });

createServer(db, { publicDir: path.join(root, 'public'), trustProxy, commentary, pronounce, phonetics, translate, bibleDict: createBibleDictionary({ cacheDir: path.join(dataDir, 'bibledict-cache') }) }).listen(port, host, () => {
  console.log(`Bible Study running at http://localhost:${port}`);
});
