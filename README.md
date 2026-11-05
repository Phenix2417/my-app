# Bible Study

Read the Bible, highlight passages, write notes, and see the notes your friends choose to share with you.

- **Read** — full World English Bible (public domain), every book and chapter.
  Hold a word to select it, then drag the **selection handles** to adjust the start and end
  (or keep your finger down and slide). Tap a verse number to select the whole verse.
  Pick a color to highlight, or tap **Note** to write a note.
- **Show friends' notes** — friends' highlights appear underlined in their color, with a badge
  showing their initial. Tap it to read their note.
- **Commentary** — its own page: open the side bar (the tab on the right edge) and tap **Commentary**, or select
  verses and tap **Commentary** in the toolbar to open it at those verses. Each comment shows the verses it explains;
  tap the label to read them. Choose from Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, John Calvin,
  Keil & Delitzsch (Old Testament), Tyndale Open Study Notes, 信望愛站註釋 (Simplified or Traditional) and 串珠 cross
  references. Tap **Edit list** to add or remove commentaries, and press and hold one to drag it into a new place;
  each person's list is saved to their account. Texts come from the Free Use Bible API (bible.helloao.org) and the
  信望愛 (FHL) site; the server fetches each chapter once and keeps a copy (in the Railway volume when one is attached).
- **Dictionary** — select a word (or a phrase) and tap **Dictionary** in the bubble for its pronunciation, Chinese
  meaning and English definition; inflected words also show their base form. Built from ECDICT (MIT licence) for every
  word used in the Bible text: `node scripts/build-dict.mjs ecdict.csv` regenerates `public/dict/`.
  Tap the phonetic or the **UK** / **US** speaker buttons to hear recorded British or American pronunciation
  (Youdao audio, fetched by the server once per word and kept in the data folder).
- **Notes** — *Mine* lists your notes; *Friends'* lists notes shared with you. Tap a card to jump to the verse.
- **Friends** — add a friend by username; they accept the request. Each friend has a
  **Can see my notes** switch. Your notes stay private until you turn it on for that person,
  and removing a friend stops sharing both ways.
- Works offline: notes you write offline are saved on the device and synced when you reconnect.
  Installable as an app from the browser menu ("Add to Home screen").

## Run it

Requires Node.js 22.13 or newer. No npm packages to install (uses Node's built-in SQLite).

```sh
npm start          # http://localhost:3000
npm test
```

Environment variables: `PORT` (default 3000), `HOST` (default 0.0.0.0), `DB_FILE` (default `data/bible-study.db`).

To use it on your phone, deploy it behind HTTPS (needed for install + offline mode), e.g. on any host
that runs Node with a persistent disk for the database file.

## Deploy on Railway (works from a phone browser)

1. Sign in at railway.com with GitHub → **New Project** → **Deploy from GitHub repo** → pick this repo and branch.
2. In the service, add a **Volume** (mount path `/data`). The app stores its database there automatically.
3. **Settings → Networking → Generate Domain** to get the public HTTPS link.

`railway.json` sets the start command and health check.

## Test accounts

On startup the server creates two test accounts if they don't exist: **phenix** and **james** (password `xqq888999`).
They are friends and share notes with each other. Set the environment variable `SEED_TEST_USERS=0` to turn this off
before real use, and change the passwords.

## Layout

- `server/` — HTTP API + static files (`app.js`), database schema (`db.js`), book list.
- `public/` — the app (plain HTML/CSS/JS, no build step) and `bible/*.json` scripture text.
- `scripts/build-bible.mjs` — regenerates `public/bible` from the `world-english-bible` npm package.
- `test/` — API tests, including the sharing/privacy rules.

## claude.ai version

`artifact/` holds a version of the app that runs as a claude.ai page, using claude.ai sign-in and the
page's built-in storage instead of the Node server. Build it with `node artifact/build.mjs`; it is published
together with the files in `public/bible/`. Notes are stored privately per person; while someone shares with at
least one friend, a copy of their notes is kept in the page's shared storage and shown only to the friends they
switched on.
