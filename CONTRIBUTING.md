# Contributing to Mindmesh

Thanks for taking a look. This guide covers setting up, how the code is organised, and what a good change looks like. The [README](README.md) has the full setup and architecture details.

## Getting started

You need Node.js 20.6 or later (developed on 24) and npm 10 or later.

```bash
npm install
cp server/.env.example server/.env     # then set the two JWT secrets (see the README)
npm run dev                            # API on :4000, web app on :5173
```

For a first run, set `USE_IN_MEMORY_DB=true` in `server/.env` so no database is needed. Data is lost when the server stops. The AI features need API keys, but everything else works without them.

## Checks to run before opening a pull request

```bash
npm test                 # API tests, then component tests
npm run build            # the frontend must build
npm run check:ui         # optional but welcome for UI changes (needs `npm run dev` running)
```

`npm run check:ui` visits every page in all three themes at four screen widths, and reports horizontal overflow, console errors and accessibility violations. It uses Microsoft Edge by default (set `UI_BROWSER=chrome` or a browser path to change that).

CI runs the tests and the build on every push and pull request.

## How the code is organised

- **Backend (`server/src/modules/<feature>/`)**: each feature has `*.routes.js` (HTTP and validation) and `*.service.js` (the logic). Keep controllers thin and put logic in the service.
- **Frontend (`client/src/`)**: pages in `pages/`, shared pieces in `components/`, server calls in `api/`.
- **AI (`server/src/ai/`)**: chat and embedding providers sit behind small adapters, so nothing outside that folder imports a vendor SDK.

## Rules that matter most

1. **Every query is scoped to the signed-in user.** Filter by `user` in every database query, including related lookups and vector searches. A change that could expose one user's data to another will not be merged. Add a test that tries to cross the boundary.
2. **Validate all input** with Zod in the route, and return errors through `ApiError` so responses keep the same `{ error: { message, code } }` shape.
3. **Never fake results.** If a feature needs an API key or a service that isn't configured, say so clearly. Don't return placeholder or invented content, and don't mark work as done when it failed.
4. **Respect the three themes.** Use the design tokens (`bg-surface`, `text-ink`, `border-line`, and so on) instead of fixed colours. Each theme has its own look, so check your change in all three, and keep text readable (WCAG AA contrast).
5. **Clean up after deletes.** Removing an item must not leave stale search content, vectors, graph connections or links behind.
6. **Destructive actions need confirmation**, and every visible button must do something real.

## Tests

- API tests live in `server/tests/` and use `node:test`, supertest and an in-memory MongoDB. AI providers are replaced by **test doubles** (`tests/fakeProviders.js`), so no keys are needed and tests prove the surrounding logic, not AI quality.
- Component tests sit next to the code as `*.test.jsx` and use Vitest and Testing Library.
- New behaviour needs a test. A bug fix needs a test that fails without the fix.

## Pull requests

- Keep each pull request focused on one change, with a clear title.
- Describe what changed and why, and how you checked it.
- Note anything you could not test (for example, behaviour that needs a live AI key).
- Don't include secrets, `.env` files, real personal data or uploaded files.

## Reporting problems

- Bugs and ideas: open an issue using one of the templates.
- **Security problems: don't open a public issue.** See [SECURITY.md](SECURITY.md).
