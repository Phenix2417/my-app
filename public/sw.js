// Offline support: app shell is network-first, Bible text is cache-first, API is never cached here
// (the app keeps its own saved copy of notes).
const CACHE = 'bible-study-v122';
// Bible text saved for reading offline is kept across new versions of the app (its own cache, never cleared here).
const TEXT_CACHE = 'bible-text';
const SHELL = ['/', '/index.html', '/app.js', '/epub.js', '/i18n.js', '/video.js', '/booknames.js', '/styles.css', '/manifest.webmanifest', '/icon.svg'];

// A new version takes over at once — unless the one running is sending files: then it waits until they're done.
const channel = new BroadcastChannel('bs-uploads');
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(async () => {
    if (!(await othersBusy())) return self.skipWaiting();
    channel.addEventListener('message', (m) => { if (m.data === 'idle') self.skipWaiting(); });
  }));
});
function othersBusy() {
  return new Promise((resolve) => {
    const on = (m) => { if (m.data === 'busy') { channel.removeEventListener('message', on); resolve(true); } };
    channel.addEventListener('message', on);
    channel.postMessage('busy?');
    setTimeout(() => { channel.removeEventListener('message', on); resolve(false); }, 400);
  });
}
channel.addEventListener('message', (m) => { if (m.data === 'busy?' && [...jobs.values()].some((j) => !j.finished)) channel.postMessage('busy'); });

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TEXT_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/bible/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(TEXT_CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }

  const key = url.pathname.includes('.') ? e.request : '/index.html';
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key)));
});

/* ----- Sending files in the background -----
   The app hands a file here, and it's sent from here in 1 MB pieces (each sent again, from what the server has, if
   it's cut off), then handed to its place (?upload=<id>) and, for chat, the message is sent — so it carries on when
   you leave the page or the app, as long as the phone lets this run. Open pages are told how it's going. */
const jobs = new Map(); // jobId -> { jobId, key, name, label, progress, uploadId, finished, result, error }
const pub = (j) => ({ jobId: j.jobId, key: j.key, name: j.name, label: j.label, progress: j.progress, uploadId: j.uploadId, finished: j.finished, result: j.result, error: j.error });
async function tell(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function send(url, opts, ms = 60000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'upload') e.waitUntil(runUpload(m));
  else if (m.type === 'upload-cancel') { const j = jobs.get(m.jobId); if (j) j.cancelled = true; }
  else if (m.type === 'upload-list') e.source?.postMessage({ type: 'upload-list', jobs: [...jobs.values()].map(pub) });
});
async function runUpload({ jobId, url, blob, token, key, name, label, then }) {
  const j = { jobId, key, name, label, progress: 0, finished: false };
  jobs.set(jobId, j);
  const H = { Authorization: `Bearer ${token}` };
  const fail = (msg, fatal) => Object.assign(new Error(msg), { fatal });
  try {
    let r = await send('/api/uploads', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ size: blob.size }) });
    if (!r.ok) throw fail((await r.json().catch(() => ({}))).error || `Upload failed (${r.status})`, true);
    const { id } = await r.json();
    j.uploadId = id; tell({ type: 'upload-progress', ...pub(j) });
    let received = 0, tries = 0;
    while (received < blob.size) {
      if (j.cancelled) throw fail('Cancelled', true);
      try {
        r = await send(`/api/uploads/${id}?offset=${received}`, { method: 'PUT', headers: H, body: blob.slice(received, received + 1024 * 1024) }, 45000);
        const d = await r.json().catch(() => ({}));
        if (r.status === 409 && Number.isInteger(d.received)) { received = d.received; continue; }
        if (r.status === 404 || r.status === 413 || r.status === 401) throw fail(d.error || `Upload failed (${r.status})`, true);
        if (!r.ok) throw fail(d.error || `Upload failed (${r.status})`);
        received = d.received; tries = 0;
      } catch (err) {
        if (err.fatal) throw err;
        await sleep(Math.min(10000, 1000 * 2 ** Math.min(tries++, 4)));
        try { const st = await send(`/api/uploads/${id}`, { headers: H }, 15000); if (st.ok) received = (await st.json()).received; else if (st.status === 404) throw fail('That upload has expired. Try again.', true); } catch (e2) { if (e2.fatal) throw e2; }
      }
      j.progress = received / blob.size;
      tell({ type: 'upload-progress', ...pub(j) });
    }
    r = await send(`${url}${url.includes('?') ? '&' : '?'}upload=${id}`, { method: 'POST', headers: H });
    let result = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(result.error || `Upload failed (${r.status})`, true);
    // Then, for a chat: the message with the file.
    if (then?.url && result.file?.id) {
      const m = await send(then.url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { id: result.file.id } }) });
      result = { ...result, message: (await m.json().catch(() => ({}))).message };
    }
    j.finished = true; j.result = result;
    tell({ type: 'upload-done', ...pub(j) });
  } catch (err) {
    j.finished = true; j.error = err.message || 'Upload failed';
    tell({ type: 'upload-failed', ...pub(j), cancelled: err.message === 'Cancelled' });
  } finally {
    setTimeout(() => jobs.delete(jobId), 10 * 60000); // (kept a while, so a page opened later can still be told)
    if (![...jobs.values()].some((x) => !x.finished)) channel.postMessage('idle');
  }
}
