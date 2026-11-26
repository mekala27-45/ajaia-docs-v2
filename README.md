# Ajaia Docs

A lightweight collaborative document editor. Create and format documents in the browser, import existing files, and share each document with other people as an editor or a viewer.

Built for the Ajaia Full Stack Product Engineer assignment.

- **Live app:** {{LIVE_URL}}
- **Walkthrough video:** {{VIDEO_URL}}
- **Source:** https://github.com/mekala27-45/ajaia-docs-v2
- **Architecture note:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **AI workflow note:** [AI_WORKFLOW.md](AI_WORKFLOW.md)
- **Submission index:** [SUBMISSION.md](SUBMISSION.md)

## Test accounts

There is no password. The app ships with three seeded accounts and an account menu in the top right corner. Pick a name there to act as that person. A first time visitor is Alice.

| Name | Email | Starts with |
| --- | --- | --- |
| Alice Chen | alice@example.com | Owns `Welcome to Ajaia Docs`. Can view `Product sync notes`. |
| Bob Patel | bob@example.com | Owns `Product sync notes`. Can edit `Welcome to Ajaia Docs`. |
| Carol Reyes | carol@example.com | Can view `Welcome to Ajaia Docs`. |

## Three minute review path

1. Open the live app. You are Alice. The dashboard shows one document under **Owned by me** and one under **Shared with me**.
2. Click **New document**. Rename it in the title box. Type some text and use the toolbar: bold, italic, underline, headings, lists. The status next to the title moves from `Saving...` to `Saved`.
3. Reload the page. The title, the text and the formatting are still there.
4. Click **Share**. Add Bob with `Can edit` and Carol with `View only`. Click **Done**.
5. Use the account menu to switch to **Bob Patel**. The document is under **Shared with me** with a `Can edit` badge. Open it and add a line.
6. Switch to **Carol Reyes**. She can open the document and read the line from Bob, but the editor is read only and there is no toolbar.
7. Switch back to **Alice Chen**. On the dashboard click **Import file** and pick a file from the [`samples`](samples) folder. It opens as a new document that Alice owns.
8. Optional: open the same document as Alice and as Bob in two browsers and type in both. The slower save is not written over the faster one. The person who lost the race gets a choice between loading the latest version and keeping their own.

## What works

**Documents**

- Create, rename, edit, delete and reopen documents.
- Rich text: bold, italic, underline, strikethrough, headings 1 to 3, bulleted and numbered lists, quotes, undo and redo, clear formatting. Keyboard shortcuts work.
- Autosave 0.8 seconds after the last keystroke, with a visible status. Ctrl+S or Cmd+S saves at once. Failed saves retry with a growing delay.
- Content is stored as sanitized HTML, so formatting survives a refresh exactly as typed.

**File import**

- `.txt`, `.md` and `.docx` files up to 4 MB become new editable documents.
- The allowed types and the size limit are shown next to the Import button.
- Other files are refused with a clear message. The server checks the file contents and not only the name, so a renamed image is refused too.

**Sharing**

- Every document has one owner. The owner can add people, switch them between `Can edit` and `View only`, and remove them.
- The dashboard separates **Owned by me** from **Shared with me** and shows the owner and the role on each shared document.
- Rules are enforced on the server: viewers cannot save, editors cannot share or delete, and people without access get a 404.
- Changes to access apply on the next request. An open editor notices within a few seconds. It switches to view only, or tells the person that access was removed.

**Working on the same document**

- This is not real time co-editing. An open document checks for a newer version every 5 seconds and loads it when you have nothing unsaved.
- Saves carry the version they were based on. A stale save is rejected with a 409 and the user decides what to keep. Nothing is overwritten silently.

**Engineering**

- 60 automated tests, including integration tests that run the real SQL against an embedded Postgres.
- A 14 step browser script that walks the review path above and the edge cases around it.
- Input validation on every endpoint and one error format for all failures.
- `GET /api/health` reports whether the app can reach its database.

## Run it locally

You need Node.js 20.9 or newer. No database setup is required.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Without a `DATABASE_URL` the app uses PGlite, an embedded Postgres, and keeps its data in the `.data` folder. Delete that folder to start again from the seed data.

To run against a real Postgres instead, create `.env.local`:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

The app creates its own schema (`ajaia_docs`), tables and demo accounts the first time it connects. There is no migration command to run.

## Tests and checks

```bash
npm test          # 60 unit and integration tests (Vitest)
npm run typecheck # TypeScript
npm run lint      # ESLint
npm run check     # all three
```

The browser walkthrough needs Google Chrome and a running app:

```bash
npm run build && npm start        # terminal 1
npm run e2e                       # terminal 2
```

Set `BASE_URL` to point the script at another address and `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.

## Deploy

The live app runs on Netlify with a free Neon Postgres database. Both have free plans.

1. Create a Postgres database (Neon, Supabase or any other) and copy its connection string.
2. Import this repository in Netlify. The build command (`npm run build`) and the publish folder (`.next`) are read from `netlify.toml`.
3. Add the environment variable `DATABASE_URL` with the connection string.
4. Deploy, then open `/api/health` on the new address. It should answer `{"ok":true,"database":"postgres",...}`.

The app also runs as a plain Node server on any host: `npm run build && npm start` with `DATABASE_URL` set. A `render.yaml` blueprint for Render is included.

On a hosted platform the app refuses to start without `DATABASE_URL` and shows a setup message instead. This is deliberate: the embedded database would lose data there.

## API

All endpoints answer JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | Database check |
| `POST /api/session` | Switch the acting demo account |
| `GET /api/documents` | Documents owned by and shared with the caller |
| `POST /api/documents` | Create a document |
| `GET /api/documents/:id` | Read a document. `?meta=1` leaves out the content |
| `PATCH /api/documents/:id` | Rename, save content, or both. Content needs `baseVersion` |
| `DELETE /api/documents/:id` | Delete (owner only) |
| `GET /api/documents/:id/shares` | Who has access |
| `PUT /api/documents/:id/shares` | Add a person or change a role (owner only) |
| `DELETE /api/documents/:id/shares/:userId` | Remove a person (owner only) |
| `POST /api/import` | Upload a file and get a new document |

## Project layout

```
src/
  app/                    Pages and API routes (Next.js App Router)
    page.tsx              Dashboard
    d/[id]/page.tsx       Document page
    api/                  Route handlers, thin wrappers around src/server
  components/             UI. The editor lives in components/editor
  lib/                    Code shared with the browser: autosave engine, limits, fetch helper
  server/                 Everything with business rules
    access.ts             Who may do what (pure functions)
    documents.ts          Create, read, save, delete, with access checks
    shares.ts             Sharing rules
    importers.ts          .txt, .md and .docx to sanitized HTML
    content.ts            HTML sanitizer and text helpers
    db/                   Database adapters, schema and seed
tests/                    Vitest suites
scripts/e2e.mjs           Browser walkthrough
samples/                  Files to try the import with
```

## Known limits

- Sign in is simulated. Anyone who opens the app can act as any of the three accounts. The brief allows this, and the real rules behind it (ownership, roles, access checks) are fully enforced.
- No real time co-editing, comments, version history or export.
- Imports keep headings, bold, italic, underline, lists, quotes and links. Images are dropped and tables are flattened to text.
- Sharing works only between the seeded accounts. No invitations are sent.
- The free hosting tier sleeps when idle, so the first request after a quiet period can take a few seconds.

More detail, and what I would build next, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Background

I completed this same brief on April 30, 2026 for the Ajaia Technical Program Manager and AI Implementation Manager assessment. That build is still public at https://github.com/mekala27-45/ajaia-docs. This repository is a new codebase written inside the timebox for this assessment. No code was carried over. What I carried over is what the first attempt taught me, and the architecture note lists it.
