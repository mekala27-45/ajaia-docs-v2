# Submission: Ajaia Docs

**Candidate:** Ajay Mekala (mekalaajayk@gmail.com)
**Role:** Full Stack Product Engineer

## Links

| | |
| --- | --- |
| Live app | https://ajaia-docs-v2.netlify.app |
| Walkthrough video | {{VIDEO_URL}} |
| Source on GitHub | https://github.com/mekala27-45/ajaia-docs-v2 |
| Google Drive folder | https://drive.google.com/drive/folders/1QIZjmCma63ELqWk4bjagwAORzYL02m7t |

## Test accounts

No password and no sign up. Use the account menu in the top right corner of the app to act as any of these people. A first time visitor is Alice.

| Name | Email | Role in the seeded data |
| --- | --- | --- |
| Alice Chen | alice@example.com | Owns `Welcome to Ajaia Docs`. Can view `Product sync notes`. |
| Bob Patel | bob@example.com | Owns `Product sync notes`. Can edit `Welcome to Ajaia Docs`. |
| Carol Reyes | carol@example.com | Can view `Welcome to Ajaia Docs`. |

## Fastest way to review

1. Open the live app. You are Alice and see one owned and one shared document.
2. Click **New document**, rename it, type, and try the toolbar. Reload. Everything is still there.
3. Click **Share**. Add Bob as `Can edit` and Carol as `View only`.
4. Switch to Bob in the account menu. Open the document from **Shared with me** and edit it.
5. Switch to Carol. She can read it but cannot edit.
6. Switch to Alice. Click **Import file** and pick a file from `samples` in the source code.

The README has the full path, including how to see conflict handling with two browsers.

## What is in this folder

| File | Contents |
| --- | --- |
| `SUBMISSION.md` | This index |
| `README.md` | What the app does, test accounts, local setup and run instructions, deployment, API |
| `ARCHITECTURE.md` | Priorities, data model, access rules, save and conflict model, scope cuts, next steps |
| `AI_WORKFLOW.md` | Tools, how the work was split, AI output that was changed or rejected, how it was verified |
| `VIDEO_LINK.txt` | Link to the walkthrough video |
| `LIVE_URL.txt` | Link to the live app and the test accounts |
| `ajaia-docs-v2-source.zip` | Full source code, without `node_modules` and build output |
| `screenshots/` | Screens from the automated browser walkthrough |
| `samples/` | Three small files to try the import with (`.txt`, `.md`, `.docx`) |

## Run locally

Node.js 20.9 or newer. No database setup.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Tests: `npm test`.

## Status against the brief

| Requirement | Status |
| --- | --- |
| Create, rename, edit, save and reopen documents | Working |
| Bold, italic, underline, headings, bulleted and numbered lists | Working, plus strikethrough, quotes, undo and redo |
| File upload | Working. `.txt`, `.md` and `.docx` up to 4 MB become new documents. Limits are stated in the UI and the README |
| Sharing with an owner, a way to grant access, owned and shared shown apart | Working |
| Persistence of documents, formatting and sharing | Working, in Postgres |
| Setup and run instructions | README |
| Live deployment | https://ajaia-docs-v2.netlify.app |
| Validation and error handling | Working. Input validation on every endpoint, clear messages in the UI, one error format |
| At least one meaningful automated test | 74 tests, a 14 step browser script, and CI on every push |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Walkthrough video | {{VIDEO_URL}} |
| Stretch (optional) | Role based sharing: `Can edit` and `View only`, enforced on the server |

## What is partial or not built

Nothing in the core list is partial. These were left out on purpose:

- **Real sign in.** Accounts are seeded and switched from a menu, as the brief allows.
- **Real time co-editing.** Two people can work on one document, but not keystroke by keystroke. An open document picks up saved changes within about 5 seconds, and a save that would overwrite newer work is stopped and the user chooses what to keep.
- **Comments, version history, export.**
- **Images and tables in imported files.** Images are dropped and tables become plain text.

## What I would build next with another 2 to 4 hours

1. Version history with restore, using the version counter that already exists.
2. Presence: show who else has the document open.
3. Export to Markdown.
4. The browser script in CI. The other checks already run there.
5. Rate limiting on writes and imports.

## A note on history

I completed this same brief on April 30, 2026 for the Ajaia Technical Program Manager and AI Implementation Manager assessment. That build is public at https://github.com/mekala27-45/ajaia-docs. This submission is a new codebase written inside the timebox for this assessment and shares no code with it.
