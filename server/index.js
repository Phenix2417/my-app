import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createServer, seedTestUsers } from './app.js';
import { createCommentaryService } from './commentary.js';
import { createPronounceService, createPhoneticsService, createFreeDictionary } from './pronounce.js';
import { createTranslateService } from './translate.js';
import { createBibleDictionary } from './bibledict.js';
import { createWikiService } from './wiki.js';
import { createEncyclopedias } from './encyclopedia.js';
import { createLibraryStore } from './library.js';
import { createChatFileStore } from './chatfiles.js';
import { createBlobStore } from './blobs.js';
import { createVersionService } from './versions.js';

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

// Each file is stored once: shelf books, covers and chat files are links to a single copy of each content.
const blobs = createBlobStore({ dir: path.join(dataDir, 'blobs') });
const libraryDir = path.join(dataDir, 'library'), chatDir = path.join(dataDir, 'chat-files');

const commentary = createCommentaryService({ cacheDir: path.join(dataDir, 'commentary-cache') });

const freeDict = createFreeDictionary();
const pronounce = createPronounceService({ cacheDir: path.join(dataDir, 'audio-cache'), freeDict });
const phonetics = createPhoneticsService({ cacheDir: path.join(dataDir, 'phonetics-cache'), freeDict });
const translate = createTranslateService({ cacheDir: path.join(dataDir, 'translate-cache') });

const server = createServer(db, { publicDir: path.join(root, 'public'), trustProxy, commentary, pronounce, phonetics, translate, bibleDict: createBibleDictionary({ cacheDir: path.join(dataDir, 'bibledict-cache') }),
  library: createLibraryStore({ dir: libraryDir, blobs }), freeDict,
  versions: createVersionService({ cacheDir: path.join(dataDir, 'bible-cache') }),
  wiki: createWikiService({ cacheDir: path.join(dataDir, 'wiki-cache') }), encyclopedias: createEncyclopedias(),
  chatFiles: createChatFileStore({ dir: chatDir, blobs }) }).listen(port, host, () => {
  console.log(`Bible Study running at http://localhost:${port}`);
});

// Clean-up, on start and every hour: chat files past 30 days, then every file nothing in the app uses any more,
// then stored copies nothing links to. (First, once: files kept before single copies are merged.)
async function tidyFiles() {
  try {
    await server.purgeChatFiles();
    const unused = await server.sweepOrphans();
    const freed = await blobs.sweep();
    if (unused || freed) console.log(`Files tidied: ${unused} unused removed, ${freed} stored copies freed`);
  } catch (e) { console.warn('file clean-up:', e.message); }
}
blobs.adoptExisting([libraryDir, chatDir], { skip: (p, isDir) => (isDir ? path.basename(p) === 'versions' : /(^\.upload-|\.part$|\.lnk$)/.test(path.basename(p))) })
  .catch((e) => console.warn('file store:', e.message)).then(tidyFiles);
setInterval(tidyFiles, 3600000).unref();
