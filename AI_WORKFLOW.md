# AI workflow note

The brief asks for practical AI usage. This note says who did what, where the AI was wrong, and how the result was checked.

## Tools

| Tool | Used for |
| --- | --- |
| Claude by Anthropic (model Claude Fable 5.2), working as an agent in the Claude desktop app with its own cloud workspace | Scope proposal, all code and tests, running builds and a headless browser, first drafts of these notes |
| The Next.js documentation that ships inside the installed package | The agent read it before writing framework code, because the installed version is newer than what it was trained on |
| GitHub, Netlify, Neon | Source control, hosting, database |

No inline code completion tool was used.

## How the work was split

I did not type this code. I directed the work, made the decisions that were mine to make, set up the accounts, and checked the result. The agent did the engineering inside that frame. Every commit carries a `Co-Authored-By: Claude` line, so the split is visible in the history.

**Me**

- Gave the agent the full brief and the time limit.
- Decided to start from an empty repository. I already had a working build of this brief from April and reusing it was the fastest option on the table. I turned it down so that everything submitted here was made inside this timebox.
- Created the GitHub repository and gave the agent push access to that one repository.
- Set up the database connection and the hosting project, including the move to Netlify when my Vercel account turned out to be blocked.
- Tested the live app by hand: created and formatted documents, shared them with the other two accounts, and edited one as a second person. That pass is where I questioned why a heading changes the whole paragraph. It is the intended behavior, and the README now says so.

**The agent**

- Proposed the scope, the stack and the order of work, and asked me to decide the open points before writing code.
- Wrote the application, the tests and the browser script.
- Ran the type checker, the linter, the tests, a production build and the browser walkthrough after each stage, and fixed what they caught before pushing.

## Where AI materially sped up the work

- **First commit 21 minutes after the brief.** Schema, data layer, services, API routes and 51 passing tests.
- **Complete app 39 minutes after the brief.** Editor, dashboard, sharing dialog and a browser walkthrough, all green.
- **Test depth that does not fit a timebox by hand.** 86 tests, many of them against real SQL, plus a 16 step browser script. On my April attempt at this brief I finished with 5 tests.
- **Current framework knowledge.** The project generator installed Next.js 16.4. The agent read the documentation inside the package instead of relying on memory. That avoided two wrong turns listed below.
- **Recovery from surprises.** When Vercel refused to deploy, configuration for two other hosts was in the repository a few minutes later. When the first Netlify deploy could not reach the database, the app was reporting the exact reason one deploy later.

## AI output that was changed or rejected

Each item says how the problem was found. The automated checks found most of them.

1. **Reusing my April code.** Rejected by me before any code was written. See above.
2. **Framework defaults from the project generator.** The generated config turned on Cache Components and partial prefetching. Every page in this app is per account and read live from the database, so caching adds risk and no benefit. Turned off, with a comment in `next.config.ts`.
3. **Fonts fetched from Google at build time.** The generated layout did this. Replaced with a font package that is bundled with the app, so a build never depends on an outside request.
4. **An API remembered wrong.** Error pages in this Next.js version receive `retry`, not `reset`. The agent found this in the installed documentation and wrote the page against it.
5. **Two wrong tests.** The first test run was 49 of 51. Both failures were bad assumptions in tests the AI had just written: the sanitizer writes `<br />` and not `<br>`, and Node treats a file named `.md` as having no extension. The behavior was checked and was fine. The tests were corrected, the code was not touched.
6. **Impure render.** The linter rejected a `Date.now()` call during render on the dashboard. Removed.
7. **Wrong HTTP status, found only in the browser.** Pages for documents that do not exist showed the right message but answered 200. Cause: a loading placeholder made the server start the response before the access check ran. The placeholder was removed and the browser script now asserts a 404.
8. **A test run that tested the wrong thing.** The first browser run failed on every step. The health endpoint reported 5 documents where a fresh database has 2, which showed an old server process was still holding the port. It was stopped and the run repeated. Since then the script prints the health check first, so it is clear what a run tested.
9. **Phone layout.** A screenshot at phone width showed the document title squeezed to two letters. The title now has its own row on small screens, and the browser script checks that neither page scrolls sideways.
10. **Extra features, held back and then added.** The agent offered Markdown export and a presence indicator early on. They were dropped while the hosting problem was open, and roles stayed as the one stretch. Once the live site had passed the full browser walkthrough and an hour was left, I asked for both. They came with their own tests, including one that replays the database upgrade on an old schema, and were verified on the live site.
11. **A deploy that could not reach its database.** The first Netlify deploy showed only a generic database error. Instead of guessing, the agent made the health endpoint report the reason. It reported that the saved setting held no Postgres address. I added the key again under Keys and secrets in Netlify and the app connected. The diagnosis stayed in the product, with tests, because the next person who deploys this would hit the same wall.

## How correctness, UX quality and reliability were verified

| Check | What it covers |
| --- | --- |
| TypeScript and ESLint on every change | Types, React rules, unused code |
| 86 Vitest tests | Access rules, sanitizer, importers, save conflicts, sharing, presence, export, autosave timing, database setup, the schema upgrade |
| Integration tests against an embedded Postgres | The real SQL: constraints, cascades, the version check, two saves at once |
| Production build before every push | The same build that gets deployed |
| GitHub Actions on every push | Linter, type checker, tests and build on a clean machine. Green on every run so far |
| Browser walkthrough, 16 steps, in Chrome | Create, format, reload, export, share, switch accounts, view only, import, refused file, conflict, live update, presence, role change, revoked access, phone width, delete |
| Screenshots from that walkthrough | Layout and readability. They are in `docs/screenshots` |
| `/api/health` on the live address | The deployed app reaches its database and the seed ran |
| The same browser walkthrough against the live site | Every step passed from an outside browser with no Netlify login, before and after the last feature deploy. This is the check that covers the production database adapter and the hosting setup |
| My own pass on the live site | Create, format, share with roles, switch accounts, edit as a second person |

What was **not** verified, so nobody has to guess:

- Only Chrome was tested. Firefox and Safari were not.
- No screen reader pass. Controls have labels and roles, and the dialogs use the native dialog element, but that is not the same as testing with assistive technology.
- No load test.
- The committed test suite runs against the embedded Postgres. The node-postgres adapter that production uses is covered by the browser walkthrough against the live site, and was also run once by the agent against a Postgres wire protocol server. Neither of those runs in CI.

## Where judgment stayed with me

- **What counts as my work.** Starting over instead of resubmitting April, and saying so in the README.
- **Scope.** Roles first. No keystroke by keystroke editing, because a half working version of that loses text. Export and presence only after the core was proven on the live site.
- **Hosting.** Moving off a blocked account instead of waiting, and keeping a second deployment path in the repository.
- **What to claim.** These notes list what was not tested. I would rather a reviewer hear it from me.

## What I would do differently next time

- Record a first take of the walkthrough as soon as the core flow works. I left the video for last, a power outage ended my session, and I had to record it after the timer.
- Check the hosting account before the clock starts. The blocked Vercel account cost time that had nothing to do with the product.
- Ask the agent for the browser script earlier. It found a bug that the unit and integration tests could not see.
