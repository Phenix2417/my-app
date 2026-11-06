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
- **Bible versions** — ⋯ → **Bible version** (or tap the version label next to the chapter number) switches between the
  built-in World English Bible and openly licensed versions from the Free Use Bible API (bible.helloao.org): BSB, KJV,
  NET, ASV, 新标点和合本 (简/繁) and 当代译本. The server fetches each chapter once and keeps it (`server/versions.js`).
  Highlights and notes remember the version they were made in. ESV and NIV aren't included: their publishers don't
  offer an open licence.
  **Add a Bible from an EPUB you own** (in the version list) reads a Bible ebook on the phone — by verse ids such as
  `v43003016` / `John.3.16` when the ebook has them, otherwise by its chapter and verse number markup — shows how many
  books, chapters and verses were found and how well they match the usual numbering, with sample verses, then keeps it
  privately in the person's account (`user_versions`, files in the library folder). Only its owner can read it.
- **Dictionary** — select one word and tap **Dictionary** (or double-tap the word) for its pronunciation,
  Chinese meanings and English definitions. With several words selected, the selection is translated into Chinese
  (Youdao), with a button per word for its dictionary entry; inflected words also show their base form.
  - Chinese: ECDICT (MIT licence) first, then Wiktionary's translations by meaning (CC BY-SA 4.0, via the wiktextract
    extract at kaikki.org) for words ECDICT lacks. `curl -sL https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl |
    node scripts/build-wiktionary-zh.mjs` regenerates `public/wikt/`; `node scripts/build-dict.mjs ecdict.csv`
    regenerates `public/dict/`. Both keep only words used in the Bible text.
  - English: ECDICT first, then the Free Dictionary API (online, Wiktionary content), then Princeton WordNet 3.1
    built in (`node scripts/build-wordnet.mjs <wordnet-db package>` regenerates `public/wordnet/`).
  Tap the phonetic or the **UK** / **US** speaker buttons to hear recorded British or American pronunciation
  (Youdao audio, fetched by the server once per word and kept in the data folder).
- **Pronunciation sources** — phonetics and recordings come from Youdao first, then the Free Dictionary API
  (dictionaryapi.dev, built from Wiktionary, CC BY-SA; per accent only when labelled UK or US), then Merriam-Webster,
  Wiktionary and the built-in list. Each phonetic shows a source badge (Y, F, M, W, i, E), and each recording a
  round badge (Y, F) once it has been played or is already saved on the server.
- **Merriam-Webster (optional)** — set the environment variable `MW_LEARNERS_KEY` to a free Merriam-Webster
  Learner's Dictionary API key (dictionaryapi.com, non-commercial, 1,000 lookups/day) and US phonetics come from
  Merriam-Webster first (badge **M**); UK phonetics stay with Youdao.
- **Names and places** — words missing from the English dictionary still get UK/US phonetic symbols where possible:
  Youdao first, then a built-in list from ipa-dict (MIT, `server/data/name-phonetics.json`, rebuilt with
  `node scripts/build-name-phonetics.mjs en_US.txt en_UK.txt`), then the word's Wiktionary page (CC BY-SA), asked
  by the server once per name and kept. The row is hidden when no phonetics exist.
- **圣经辞典 / Bible Dictionary** — Nave's and Torrey's Topical Bibles (public domain), in the 信望愛 (FHL) Chinese
  translation and in English. Whether a word has an entry is checked against a built-in index of topic titles
  (`server/data/topics.json`, 5,952 titles, no text; rebuild with `node scripts/build-topic-index.mjs`), so the
  **圣经辞典** / **Bible Dictionary** buttons cost nothing to show. Tapping one fetches that text from FHL's JSON API
  (`st.php`); the server keeps a copy.
- **Grammar** — in the Translate panel, tap **Grammar** after the selected text: every word gets its part of speech in Chinese
  (colour-coded), each verb its tense and voice (e.g. 一般过去时 · 被动语态), plus subject/verb and prepositional and
  noun phrases. It runs on the phone with [compromise](https://github.com/spencermountain/compromise) 14.19.0 (MIT),
  shipped in `public/vendor/` and loaded on first use; it can misread unusual (e.g. inverted) word order.
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

## Icons

Icons are from [Lucide](https://lucide.dev) (ISC License; portions from Feather, MIT License), copied into `public/app.js` so the app has no icon dependency.
