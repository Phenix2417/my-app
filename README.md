# Bible Study

Read the Bible, highlight passages, write notes, and see the notes your friends choose to share with you.

- **Read** — full World English Bible (public domain), every book and chapter.
  Hold a word to select it, then drag the **selection handles** to adjust the start and end
  (or keep your finger down and slide). Tap a verse number to select the whole verse.
  Pick a color to highlight, or tap **Note** to write a note.
- **Show friends' notes** — friends' highlights appear underlined in their color, with a badge
  showing their initial. Tap it to read their note.
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

## Layout

- `server/` — HTTP API + static files (`app.js`), database schema (`db.js`), book list.
- `public/` — the app (plain HTML/CSS/JS, no build step) and `bible/*.json` scripture text.
- `scripts/build-bible.mjs` — regenerates `public/bible` from the `world-english-bible` npm package.
- `test/` — API tests, including the sharing/privacy rules.
