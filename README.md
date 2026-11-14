# Mindmesh

An AI-powered personal knowledge and learning workspace: a general-purpose AI assistant, a knowledge vault for notes, documents and web pages, meaning-based search, retrieval-augmented answers with citations, an interactive knowledge graph and a timeline of how your knowledge grows, presented in three distinct visual themes.

**Status:** all five phases are complete. The assistant needs an Anthropic API key, and semantic features need an embedding key (see [AI setup](#ai-provider-setup)). Without keys, Mindmesh tells you so and falls back to keyword methods. It never fabricates answers, sources or results.

**Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md). **Security issues:** please report them privately, as described in [SECURITY.md](SECURITY.md).

---

## Screenshots

The same app in its three themes (click an image for full size). These show sample data.

| | The Library | The Studio | The Lab |
| --- | --- | --- | --- |
| **Home** | <a href="docs/screenshots/library-home.jpg"><img src="docs/screenshots/library-home.jpg" alt="library theme: home" width="100%"></a> | <a href="docs/screenshots/studio-home.jpg"><img src="docs/screenshots/studio-home.jpg" alt="studio theme: home" width="100%"></a> | <a href="docs/screenshots/lab-home.jpg"><img src="docs/screenshots/lab-home.jpg" alt="lab theme: home" width="100%"></a> |
| **Knowledge Vault** | <a href="docs/screenshots/library-vault.jpg"><img src="docs/screenshots/library-vault.jpg" alt="library theme: vault" width="100%"></a> | <a href="docs/screenshots/studio-vault.jpg"><img src="docs/screenshots/studio-vault.jpg" alt="studio theme: vault" width="100%"></a> | <a href="docs/screenshots/lab-vault.jpg"><img src="docs/screenshots/lab-vault.jpg" alt="lab theme: vault" width="100%"></a> |
| **Note editor** | <a href="docs/screenshots/library-note.jpg"><img src="docs/screenshots/library-note.jpg" alt="library theme: note" width="100%"></a> | <a href="docs/screenshots/studio-note.jpg"><img src="docs/screenshots/studio-note.jpg" alt="studio theme: note" width="100%"></a> | <a href="docs/screenshots/lab-note.jpg"><img src="docs/screenshots/lab-note.jpg" alt="lab theme: note" width="100%"></a> |
| **Knowledge Graph** | <a href="docs/screenshots/library-graph.jpg"><img src="docs/screenshots/library-graph.jpg" alt="library theme: graph" width="100%"></a> | <a href="docs/screenshots/studio-graph.jpg"><img src="docs/screenshots/studio-graph.jpg" alt="studio theme: graph" width="100%"></a> | <a href="docs/screenshots/lab-graph.jpg"><img src="docs/screenshots/lab-graph.jpg" alt="lab theme: graph" width="100%"></a> |

Each theme has its own typography, surfaces, navigation and component shapes, not just different colours: catalogue-style cards and a bound-ledger sidebar in The Library, colour-blocked rounded modules in The Studio, and dark instrument panels with monospaced readouts in The Lab.

---

## Contents

1. [Screenshots](#screenshots)
2. [Features](#features)
3. [Technology stack](#technology-stack)
4. [Quick start](#quick-start)
5. [Configuration](#configuration)
6. [Database setup](#database-setup)
7. [AI provider setup](#ai-provider-setup)
8. [Vector search configuration](#vector-search-configuration)
9. [File storage](#file-storage)
10. [Architecture](#architecture)
11. [Security](#security)
12. [Testing and quality checks](#testing-and-quality-checks)
13. [Deployment notes](#deployment-notes)
14. [Known limitations](#known-limitations)

---

## Features

| Area | What you can do |
| --- | --- |
| **Accounts and themes** | Sign up, onboard (name, theme, interests, default AI mode), and choose between three complete visual identities: **The Library** (warm editorial), **The Studio** (bright modular) and **The Lab** (dark research instrument). Your theme is saved to your account. |
| **Knowledge Vault** | Rich-text notes with autosave and conflict detection; uploads of PDF, DOCX, TXT, MD, CSV, JSON, HTML and RTF, with background text extraction; saved web links (title, description, favicon, readable text); pinning; grid and list views; recent items. |
| **Organisation** | Nested collections (3 levels) and tags. Deleting a collection or tag never deletes your items. |
| **AI assistant** | Streaming chat with **General AI** (model knowledge) and **My Knowledge** (retrieval-augmented, with inline citations to your sources), switchable mid-conversation. Conversation history, rename and delete, copy, regenerate, stop, follow-up suggestions, Markdown and highlighted code. |
| **Smart Search** | One search over titles, full text and meaning, with filters (type, collection, tags, date), sorting, highlighted passages, type-ahead suggestions and recent searches. |
| **Knowledge Graph** | Interactive React Flow graph of items, topics (tags) and collections. Drag, zoom, search, filter, focus on neighbours, connect items by dragging, and review AI-suggested connections (accept or dismiss). |
| **Flashcards (Review)** | Make flashcards by hand or generate them from any note, document or link with AI (answers must come from the item's own text; duplicate questions are skipped). Review with **spaced repetition** (an SM-2 style schedule): reveal, then grade Again / Hard / Good / Easy, with the next interval shown on each button, keyboard shortcuts (Space, 1–4), and "Again" cards returning later in the same session. Cards outlive their source item. Due counts appear on Home. |
| **Quiz me** | Pick a scope (everything, a collection, or one item) and the assistant writes questions from your own text. You answer in your own words and each answer is graded against the source passage, then you see the reference answer, the source excerpt (with a link) and a note that grading is AI-made. Questions you miss or half-answer become flashcards in one click. Progress is saved, and past quizzes are listed. |
| **Save to Vault** | One click turns an assistant answer into an editable note: the Markdown becomes rich text, your question is quoted, and cited sources are listed with links. Saving twice returns the same note. |
| **Timeline** | A history of notes written, documents and links added, connections made, topics searched, questions asked and items revisited, with type and date filters and a 12-week activity map. |
| **Settings** | Profile, account, theme, reduced motion, AI preferences, live AI and index status, re-indexing, library defaults, password change, sessions and sign-out-everywhere, account deletion. |

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, Framer Motion, Lucide icons, TipTap 3 (editor), React Flow 12 + d3-force (graph), react-markdown + highlight.js |
| Backend | Node.js 20+ (tested on 24), Express 5, Mongoose 9, Zod 4, JWT, bcrypt, helmet, express-rate-limit, multer, marked |
| Database | MongoDB (Atlas recommended), with optional Atlas Vector Search |
| AI | Anthropic Claude via `@anthropic-ai/sdk` (default `claude-opus-5-5`); Voyage AI or OpenAI embeddings; provider adapters are swappable |
| Documents | pdfjs-dist (PDF, per page), mammoth (DOCX), cheerio (HTML), undici (link fetching) |
| Tests | `node:test` + supertest + mongodb-memory-server (API), Vitest + Testing Library (components), Playwright + axe-core (UI and accessibility) |

## Quick start

**Requirements:** Node.js 20.6 or later, and npm 10 or later. A MongoDB instance is optional for a first look.

```bash
npm install                                  # installs both workspaces
cp server/.env.example server/.env           # then edit it, see below
npm run dev                                  # API on :4000, web app on :5173
```

Open <http://localhost:5173>. The minimum `server/.env` for local development is:

```
JWT_ACCESS_SECRET=<48+ random characters>
JWT_REFRESH_SECRET=<48+ random characters>
USE_IN_MEMORY_DB=true          # or MONGODB_URI=..., see Database setup
```

Generate each secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

| Command (repo root) | Purpose |
| --- | --- |
| `npm run dev` | Runs the API (auto-restart) and the Vite dev server together |
| `npm test` | Runs the API tests, then the frontend component tests |
| `npm start` | Production mode: builds the frontend, then serves it and the API from one server |
| `npm run build` | Builds the frontend to `client/dist` |
| `npm run check:ui` | Visual, responsive and accessibility check (needs `npm run dev` running; see [Testing](#testing-and-quality-checks)) |
| `npm run vector-index -w server` | Creates the Atlas Vector Search index |

## Configuration

All configuration lives in `server/.env`. It is validated at boot, and the server exits with a clear message if anything is missing or invalid. [`server/.env.example`](server/.env.example) documents every variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated CORS allow-list |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy (for correct client IPs and rate limits) |
| `SERVE_CLIENT` / `CLIENT_DIST` | `false` / `../client/dist` | Serve the built web app from the API server (single origin; use in production after `npm run build`) |
| `API_RATE_LIMIT_PER_MIN` | `1200` | General per-IP ceiling. Sign-in, uploads, AI and other sensitive routes have stricter limits. |
| `MONGODB_URI` | — | MongoDB connection string |
| `USE_IN_MEMORY_DB` | `false` | Dev only: an ephemeral database. **Data is lost on restart.** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — (required) | 32 or more characters each |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `14` | Token lifetimes |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | `./uploads` / `25` | File storage folder and per-file limit |
| `PROCESSING_CONCURRENCY` | `2` | Parallel extraction jobs |
| `LINK_FETCH_TIMEOUT_MS` / `LINK_MAX_BYTES` | `10000` / `3000000` | Limits for fetching saved links |
| `ALLOW_PRIVATE_LINK_FETCH` | `false` | Dev/test only. Allows localhost and private IPs; refused in production. |
| `AI_PROVIDER` / `ANTHROPIC_API_KEY` | `anthropic` / — | Chat provider and key |
| `AI_MODEL` / `AI_UTILITY_MODEL` | `claude-opus-5-5` / same | Chat model, and an optional cheaper model for titles, follow-ups and summaries |
| `AI_EFFORT` / `AI_MAX_OUTPUT_TOKENS` | `medium` / `16000` | Reasoning effort and answer length cap |
| `AI_REFUSAL_FALLBACKS` | `true` | Anthropic server-side refusal fallbacks |
| `EMBEDDING_PROVIDER` | `voyage` | `voyage`, `openai` or `none` |
| `VOYAGE_API_KEY` / `OPENAI_API_KEY` | — | Embedding key |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | provider default | `voyage-3.5`/1024 or `text-embedding-3-small`/1536 |
| `VECTOR_SEARCH` / `VECTOR_INDEX_NAME` | `auto` / `chunk_embedding_index` | `auto`, `atlas` or `local` |
| `RAG_TOP_K` / `RAG_MIN_SCORE` | `8` / `0.3` | Passages per answer, and the semantic similarity floor |
| `GRAPH_SUGGEST_MIN_EMBEDDING` / `GRAPH_SUGGEST_MIN_KEYWORD` | `0.6` / `0.12` | Similarity floors for connection suggestions |

Client (optional, `client/.env`): `VITE_API_URL` overrides the API base URL (default `/api`), and `VITE_API_PROXY` changes the dev proxy target.

## Database setup

- **MongoDB Atlas (recommended):** create a cluster (the free M0 tier works), allow your IP, create a database user, and set `MONGODB_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/mindmesh`. Indexes are created automatically at startup.
- **Local MongoDB 6+:** `MONGODB_URI=mongodb://localhost:27017/mindmesh`. Everything works, and vector search runs in-process.
- **In-memory (`USE_IN_MEMORY_DB=true`):** for a quick try-out only. The MongoDB binary downloads on first run, and all data disappears when the server stops.

## AI provider setup

1. **Chat (required for the assistant):** create a key at <https://console.anthropic.com/> and set `ANTHROPIC_API_KEY`.
   - The default model is `claude-opus-5-5`.
   - To reduce cost, set `AI_UTILITY_MODEL=claude-haiku-5-5` for the small helper calls (titles, follow-ups and summaries).
   - **Refusal fallbacks are on by default:** if Claude declines a request on safety grounds, the API re-runs it on a fallback model. Set `AI_REFUSAL_FALLBACKS=false` to turn this off.
2. **Embeddings (recommended):** create a key at <https://dash.voyageai.com/> and set `VOYAGE_API_KEY`, or use `EMBEDDING_PROVIDER=openai` with `OPENAI_API_KEY`.
3. **Restart the server.** Existing content is queued for embedding automatically. You can also use **Settings → AI assistant → Index missing items**.

API keys are read only by the server and are never sent to the browser. **Settings → AI assistant** shows what is configured.

To add another provider, implement the small adapter interface in `server/src/ai/` (`streamChat` and `completeJson` for chat, `embed` for embeddings), call `registerChatProvider` or `registerEmbeddingProvider`, and select it with `AI_PROVIDER` or `EMBEDDING_PROVIDER`.

## Vector search configuration

With `VECTOR_SEARCH=auto` (the default), Mindmesh uses **MongoDB Atlas Vector Search** (`$vectorSearch`) when it is available, and otherwise computes **exact cosine similarity in-process** over the requesting user's own vectors. In-process search uses a per-user, LRU-cached set of vectors that is invalidated whenever that user's content changes. Local and in-memory MongoDB therefore need no extra setup, and exact search is fast at personal-library scale.

To use Atlas, point `MONGODB_URI` at Atlas, configure an embedding provider, and run `npm run vector-index -w server` once. It creates this index on the `chunks` collection:

```json
{ "name": "chunk_embedding_index", "type": "vectorSearch",
  "definition": { "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" },
    { "type": "filter", "path": "user" },
    { "type": "filter", "path": "embeddingModel" },
    { "type": "filter", "path": "resource" } ] } }
```

`numDimensions` must match the embedding model. If you change models, drop and recreate the index, then use **Settings → Rebuild everything**. If you created the index before Phase 4, recreate it so it includes the `resource` filter.

## File storage

- **Where files go:** uploads are stored on local disk under `UPLOAD_DIR/<userId>/<random>.<ext>`. The default is `server/uploads`, which is gitignored. Client filenames are kept only as metadata.
- **How they're served:** only through an authenticated, ownership-checked route, with `Content-Security-Policy: sandbox`. HTML and text uploads are always served as `text/plain`.
- **Cleanup:** deleting an item or an account removes its files.
- **Hosting:** for multi-server or serverless hosting, replace `server/src/processing/storage.js` with an object-store (S3/GCS) implementation. Its interface is small: move into storage, open a stream, remove.

## Architecture

```
mindmesh/
├── client/                    React SPA
│   └── src/
│       ├── api/               fetch client (token refresh, SSE streaming, uploads with progress)
│       ├── context/           Auth · Theme · Toast · Library (collections and tags)
│       ├── themes/            design tokens per theme (themes.css) + registry
│       ├── components/        ui · layout · theme · library · editor · chat · graph · discovery
│       ├── hooks/             useForm · useAutosave · usePreferences · useProcessingPoll
│       └── pages/             auth · onboarding · home · vault · collections · assistant · search · graph · timeline · settings
├── server/
│   └── src/
│       ├── config/            env (Zod-validated), db
│       ├── models/            User Session Resource Chunk Collection Tag Conversation Message Connection Activity SearchHistory GraphLayout Flashcard Quiz
│       ├── middleware/        auth · validate · errorHandler · rateLimit
│       ├── modules/           auth users library collections tags chat ai search graph timeline flashcards quiz (routes → service)
│       ├── processing/        storage · fileTypes · extractors · chunker · linkFetcher · queue · processor · embedder
│       └── ai/                providers (registry) · anthropic · embeddings · vectorSearch · vectorCache · retrieval · prompts
├── scripts/ui-check.mjs       Playwright + axe-core UI/accessibility check
└── server/tests, client/src/**/*.test.jsx
```

**Data flow for an upload:**
1. Multer enforces size and type limits, and the file signature is checked.
2. The file gets a random storage key, and the item is marked `pending` (the client gets a 202).
3. The background queue extracts text (per page for PDFs) and chunks it (~1,200 characters with overlap, page- and heading-aware).
4. The chunks are stored, and the item is marked ready, or failed with a reason.
5. The embedding queue embeds only passages whose text hash changed, so unchanged passages keep their vectors.

**A My Knowledge answer:**
1. Short follow-up questions are expanded with the previous question.
2. The query is embedded (and cached), then vector and full-text search run over **this user's** passages and are fused with Reciprocal Rank Fusion. There's a similarity floor and at most 3 passages per item.
3. Numbered `<source>` passages are sent to Claude, under a prompt that requires inline `[n]` citations, admitting gaps, labelling general knowledge, and ignoring instructions found inside documents.
4. The answer streams over Server-Sent Events.
5. Only numbers matching really retrieved passages become citations.
6. An empty library returns a notice from Mindmesh, with no model call.

**Chat runtime safeguards:**
- client request ids (enforced by a unique index) against duplicate sends
- a per-conversation lock against concurrent generations
- partial answers saved when the user stops
- recent turns sent in full, with older turns folded into a rolling summary

**Search:**
- Filters first narrow the allowed items.
- Title, description, full-text and semantic lists are then fused per item, so each item appears once.
- Highlight ranges are computed on the server and rendered as `<mark>` with no HTML injection.

**Graph suggestions:**
- Pairs are scored with embedding centroids, or TF-IDF without embeddings.
- Each item keeps at most its top 2 neighbours above a floor, and a run stores at most 8 new suggestions.
- Claude reviews the batch when available and drops weak pairs.
- Nothing is added until you accept it, and decided pairs are never suggested again.

**Timeline:** an `Activity` log written by the services. Existing history is backfilled once without duplicates, and per-day summaries are bucketed in the viewer's time zone.

**Themes:**
- Every colour, font, radius and shadow is a CSS variable set per `[data-theme]` in `client/src/themes/themes.css`, then mapped into Tailwind.
- `library:`, `studio:` and `lab:` variants plus a few `mm-*` component classes give each theme its own structure (catalogue cards, colour-blocked modules, instrument readouts; different navigation, editor typography and graph nodes).
- Switching themes only changes `<html data-theme>`, so no state is lost.

## Security

| Area | Measures |
| --- | --- |
| Passwords | bcrypt (cost 12); maximum 72 bytes so nothing is silently truncated; login timing equalised for unknown emails |
| Tokens | 15-minute JWT access tokens (HS256 pinned; issuer and audience checked), held in memory only; rotating httpOnly `SameSite=Strict` refresh cookies, stored hashed; replaying a rotated token revokes every session; every request checks that its session is still active |
| Authorisation | Every query is scoped to the authenticated user, including vector search pre-filters and re-checks of retrieved items; tests attempt cross-user reads, writes, searches, retrieval, files, connections and conversations |
| Input | Zod validation on all bodies, params and queries (unknown keys rejected where it matters); note JSON sanitised (depth and size limits, unsafe links stripped); Markdown rendered without raw HTML |
| Uploads | Extension, MIME and signature checks, size limits, random storage names, sandboxed download headers |
| Link fetching (SSRF) | http/https only; DNS answers checked at connect time (private, loopback, link-local and metadata ranges blocked, which also defeats DNS rebinding); redirects re-validated; timeouts and byte caps; robots.txt honoured |
| Abuse | Per-IP and per-user rate limits (sign-in, sensitive account actions, uploads and links, chat, suggestions); a configurable general ceiling |
| Transport and errors | helmet, a CORS allow-list, a 2 MB JSON limit; errors return `{ error: { message, code } }` without stack traces |
| Secrets | Only in `server/.env` (gitignored); never sent to the client; `/api/ai/status` reports configuration without keys |

## Testing and quality checks

```bash
npm test                    # API tests (86) + component tests (18)
npm test -w server          # API only: node:test + supertest + in-memory MongoDB
npm test -w client          # components only: Vitest + Testing Library (jsdom)
npm run dev & npm run check:ui
```

- **API tests** cover auth, sessions, preferences, notes and autosave conflicts, uploads (generated PDF and DOCX files), extraction failures, links (a local test server, redirects, robots.txt, SSRF), collections and tags, search (keyword, semantic, filters, highlights), stale-data cleanup, the assistant (streaming, citations, isolation, locking, stop, errors, regenerate, memory), embeddings (reuse, re-index), graph and suggestions, timeline and backfill, and security hardening. AI providers are replaced by **test-only doubles** registered inside the tests, so no keys are needed and no real AI quality is implied.
- **Component tests** cover citation linking, the composer, source cards (including deleted sources), the autosave engine, highlights, graph layout and formatting helpers.
- **`npm run check:ui`** registers a user, seeds content, then signs in once with Playwright (system **Edge** by default; set `UI_BROWSER=chrome` or a browser path) and visits 11 pages in all 3 themes at 1440, 1024, 768 and 390 px. It reports horizontal overflow, console errors, failed requests and **axe-core WCAG 2.1 AA** serious and critical violations, and saves screenshots to `ui-report/`. It signs in once because sign-in is rate-limited, so restart the API before running it repeatedly.

## Deployment notes

**The simplest setup is one process serving everything.** With `SERVE_CLIENT=true`, the API server also serves the built web app from `client/dist`, so the app and API share one origin (which the `SameSite=Strict` refresh cookie needs). It adds a strict Content-Security-Policy (the one inline script is allowed by its SHA-256 hash, not `unsafe-inline`), long-lived caching for hashed assets, and falls back to the app shell for client routes such as `/vault/123`.

```bash
npm start        # builds the web app, then serves app + API together on PORT (default 4000)
```

**Docker:** the included `Dockerfile` builds the frontend and runs the combined server as a non-root user, with a health check on `/api/health`.

```bash
docker build -t mindmesh .
docker run -p 4000:4000 --env-file server/.env -v mindmesh-uploads:/app/server/uploads mindmesh
```

The Docker build is **untested** here because Docker isn't installed on the development machine. The same steps run without Docker as shown above.

- Use a hosted MongoDB (Atlas) via `MONGODB_URI`. `USE_IN_MEMORY_DB` is refused in production.
- Set `NODE_ENV=production`, serve over HTTPS (cookies become `Secure`), set `TRUST_PROXY=true` behind a proxy, and set `CLIENT_ORIGIN` to your site's address.
- Persist `UPLOAD_DIR` on a volume, or replace the storage module with an object store.
- Run one API instance, or move the in-process queues and vector cache to shared infrastructure first (see limitations).
- **CI:** `.github/workflows/ci.yml` runs the API tests, the component tests and a production build on every push and pull request.

## Known limitations

- **AI quality hasn't been verified against the live Claude and Voyage APIs in the development environment**, because no keys were available. The adapters follow the official SDK reference and all surrounding logic is tested with doubles. Check answers, citations and suggestion thresholds once keys are configured.
- **Single-instance design:** background jobs use an in-process queue (durable status, re-queued at boot), and in-process vector search uses an in-memory cache. Both need shared infrastructure (e.g. BullMQ/Redis, Atlas Vector Search) for multiple API instances.
- **Local disk** file storage; there's no object-store adapter yet.
- **No OCR:** scanned PDFs are reported as having no text. Legacy `.doc`, PowerPoint, Excel and image files aren't accepted.
- Very long items are indexed up to **3,000 passages**, and the item says so.
- The graph shows **400 items** at a time (pinned and recently opened first), with no clustering; similarity for suggestions is computed on demand.
- Pages that need JavaScript to render may yield little text; sites that disallow bots are saved as bookmarks only.
- Smart Search doesn't include chat messages; conversation search covers titles only; answers can't be edited or branched.
- No email verification or password reset by email (it needs an email provider); registering with an existing email reveals that the account exists.
- The UI check verifies layout, errors and automated accessibility rules; it doesn't replace manual testing with a screen reader or on real phones.
