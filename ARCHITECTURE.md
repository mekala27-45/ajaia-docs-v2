# Architecture note

What I built, what I left out, and why.

## What I optimized for

The brief asks for the strongest working slice inside a fixed timebox and says product judgment counts as much as code. I ranked the work like this:

1. **Nobody loses text.** A document editor that drops a paragraph is worse than no editor. Saving, reloading and two people saving at once had to be right before anything else.
2. **Sharing rules that hold on the server.** The interesting part of sharing is not the dialog. It is whether a viewer can still save by calling the API directly. They cannot.
3. **A reviewer can test everything in three minutes** with no sign up, no setup and no second browser.
4. **File import that fails clearly.** Three useful formats done properly, and a plain message for everything else.
5. **Proof.** Tests that run the real SQL, and a browser script that walks the main flow.

Everything outside those five was a candidate for cutting.

## Shape of the system

```
Browser
  TipTap editor, autosave engine, share dialog, account menu
      |
      |  JSON over HTTPS
      v
Next.js on the server
  app/            pages (server rendered) and API route handlers
  server/         services: documents, shares, importers, access rules
  server/db/      one small database interface, two adapters
      |
      v
Postgres          Neon in production
                  PGlite (embedded Postgres) for local runs and tests
```

One deployable unit. Pages are rendered on the server for the current account. All writes go through JSON route handlers. Route handlers stay thin: they read input, validate it and call a service. The services hold the rules, which is why the tests can call them directly and cover the same code that production runs.

## Data model

Three tables in their own schema (`ajaia_docs`), so the app can share a database with other projects.

```
users            id, name, email (unique), color
documents        id (uuid), title, content (HTML), owner_id -> users,
                 version (int), created_at, updated_at, updated_by -> users
document_shares  document_id -> documents, user_id -> users,
                 role ('viewer' | 'editor'), primary key (document_id, user_id)
```

- **Content is sanitized HTML.** The editor reads and writes HTML, imports produce HTML, and a strict allowlist runs on every write. Stored content can be shown anywhere without a second cleaning step. The page uses that to render the document on the server before the editor has loaded.
- **`version` counts content saves.** It is what makes conflict detection possible. Renames do not change it, so a rename never blocks someone who is typing.
- **Shares are a join table with a composite key.** Adding a person and changing a role are the same idempotent upsert. Deleting a document removes its shares through `ON DELETE CASCADE`.

The schema is created by the app on first connection. Each statement is idempotent and the whole step runs under an advisory lock, so two cold starts at the same moment cannot collide. When the database is up to date the check costs one small query.

## Access rules

One pure function decides what a person is to a document: `owner`, `editor`, `viewer` or nothing. Everything else derives from it.

| Action | Owner | Editor | Viewer | No access |
| --- | --- | --- | --- | --- |
| Open and read | yes | yes | yes | 404 |
| Edit content, rename | yes | yes | 403 | 404 |
| See who has access | yes | yes | yes | 404 |
| Share, change roles, remove people | yes | 403 | 403 | 404 |
| Delete | yes | 403 | 403 | 404 |

Two choices worth pointing out:

- **No access answers 404, not 403.** A person who guesses a document id learns nothing, not even that the document exists.
- **The checks live in the service layer.** The UI hides buttons a person cannot use, but that is only for comfort. The API refuses the request on its own.

## Saving and working together

I did not build real time co-editing. Doing it properly means a CRDT or operational transforms plus a socket server, which is a project of its own. Doing it badly loses text, which breaks priority 1. What I built instead is small and honest:

- **Autosave.** The editor saves 0.8 seconds after the last keystroke. Only one save runs at a time and it always sends the latest text. Temporary failures retry with a growing delay. Errors the server will keep refusing are shown and not retried.
- **Optimistic concurrency.** Every save carries the version it was based on. The database write only succeeds if that version is still current (`UPDATE ... WHERE id = $1 AND version = $2`). The check is inside the SQL statement, so two saves that race cannot both win. A test fires two saves at once and asserts exactly one succeeds.
- **A choice, not a silent overwrite.** The person who lost the race sees who saved and picks between loading the latest version and keeping their own.
- **Light sync.** An open document asks for the current version every 5 seconds. With nothing unsaved it quietly loads the newer content. It also notices a role change or removed access and reacts.

The autosave logic is a plain class with no React in it (`src/lib/autosave.ts`). That made it possible to test debounce, retry and conflict behavior with fake timers.

## File import

`POST /api/import` accepts one file and returns a new document owned by the caller.

1. Check the extension against the allowlist (`.txt`, `.md`, `.markdown`, `.docx`) and the size against 4 MB.
2. Check the bytes. A `.docx` must be a zip archive. A text file must not contain binary data. A renamed PNG is refused.
3. Convert: plain text to paragraphs, Markdown through `marked`, Word through `mammoth`.
4. Run the result through the same sanitizer as typed content.

I chose import as new document over attachments because it turns existing work into something editable, which is the reason a team adopts a tool like this. The 4 MB limit sits under the request size limit of serverless hosts.

## Simulated sign in

The brief allows seeded accounts, and I used them on purpose. A cookie holds the id of the acting account and a menu switches it. This makes the sharing flow testable by one person in one browser.

The cost is that this is not security. Anyone can act as anyone. The rules behind the cookie are real, and replacing the cookie with a real session changes one file (`src/server/context.ts`).

## One database interface, two engines

The app talks to the database through a three method interface (`query`, `transaction`, `close`). Production uses node-postgres. Local runs and tests use PGlite, a real Postgres compiled to WebAssembly.

Why this was worth the extra adapter:

- `npm install && npm run dev` works with no account, no Docker and no connection string.
- The integration tests run the same SQL as production, including constraints, cascades and the version check. They need no network and finish in seconds.
- I could exercise the whole app in a browser before it was deployed anywhere.

On a hosted platform the app refuses to fall back to the embedded database, because the disk there does not persist.

## Tests

| Suite | What it proves |
| --- | --- |
| `access.test.ts` | The role rules, including a missing user |
| `content.test.ts` | The sanitizer removes scripts, handlers and unsafe links and keeps supported formatting |
| `importers.test.ts` | All three formats convert. Unsupported, fake, empty, binary and oversized files are refused |
| `documents.test.ts` | Create, save, reload, rename, 404 for strangers, stale saves, two saves at once, delete with cascade |
| `shares.test.ts` | Viewer and editor limits, role changes, revoking, owner only rules |
| `autosave.test.ts` | Debounce, one save at a time, retry delays, conflict stop, flush |
| `scripts/e2e.mjs` | The review path in a real browser, 12 steps |

The browser script found a bug the unit tests could not: pages for missing documents answered HTTP 200. Details are in the AI workflow note.

## What I left out, and why

| Left out | Reason |
| --- | --- |
| Real sign in | Allowed by the brief. It would have cost an hour without showing anything new about the product. |
| Real time co-editing | Needs a CRDT and a socket layer to be correct. Conflict detection gives safety without it. |
| Comments, suggestions, version history | Each adds tables and UI surface. None is needed to demonstrate create, edit, import and share. |
| Export to PDF or Markdown | Small, but I spent the stretch budget on roles because roles deepen the sharing logic the brief asks about. |
| Images and tables in imports | Would need storage and a table extension in the editor. Dropped images and flattened tables are stated in the README. |
| Email invitations | Sharing between seeded accounts shows the whole access model. |
| Search, folders, pagination | The lists stay short in a demo. |

## What I would build next with 2 to 4 more hours

1. **Version history** (about 1.5 hours). The `version` column already exists. Store a snapshot per save in a `document_versions` table and let the owner restore one. This also makes the keep my version choice less final.
2. **Presence** (about 1 hour). Show who else has the document open, using the existing 5 second poll as the heartbeat.
3. **Export to Markdown** (about 30 minutes). The stored HTML converts cleanly.
4. **CI on pull requests** (about 30 minutes). Run `npm run check` and the build on every push. Add the browser script once it runs in a container with Chrome.
5. **Rate limiting on writes and imports** (about 30 minutes).

## What I would change before real users

- Replace the simulated sign in with real sessions.
- Move from polling to a socket and from last save wins with a prompt to real merging.
- Move imports to object storage with a background job, so large files do not run inside a request.
- Add audit logging for share changes.

## What changed since my April attempt

I did this brief once before, on April 30, 2026, for a different Ajaia role. This build shares no code with that one. It applies what that attempt showed me:

| April build | This build |
| --- | --- |
| Two people saving at once: last write wins | Stale saves are rejected and the user chooses |
| One access level | Viewer and editor roles, enforced on the server |
| `.txt` and `.md` import | `.txt`, `.md` and `.docx`, with content checks |
| No delete in the UI | Owner can delete, with a confirmation |
| 5 unit tests on pure functions | 60 tests, most of them against real SQL, plus a browser script |
| Needed a hosted database to run locally | Runs locally with no setup |
| Manual `db push` and seed before first use | Schema and seed are applied by the app |
