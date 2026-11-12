# Mindmesh

An AI-powered personal knowledge and learning workspace: a general-purpose AI assistant, a personal knowledge vault, semantic search, document analysis and an interactive knowledge graph, in three distinct visual themes.

> **Status: Phase 4 (Intelligent discovery) complete.** All modules are live: authentication and the three themes, the Knowledge Vault, the AI assistant (General AI and cited My Knowledge modes), Smart Search (keyword and semantic), the interactive Knowledge Graph with reviewed AI suggestions, and the Knowledge Timeline. **The assistant needs an API key**, and semantic features work best with an embedding key (see [AI setup](#ai-setup-phase-3)). Without keys, Mindmesh says so and falls back to keyword methods. It never fabricates results.

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Foundation | Monorepo, Express API, MongoDB, JWT auth with rotating refresh tokens, onboarding, three themes, shared UI, navigation, home, settings | ✅ Done |
| 2. Knowledge management | Vault, rich-text notes, collections, tags, uploads, text extraction, chunking, saved links, keyword search | ✅ Done |
| 3. AI assistant | Streaming chat, conversations, provider adapters, embeddings, vector search, General AI / My Knowledge modes, RAG with citations | ✅ Done |
| 4. Discovery | Smart Search (keyword + semantic), Knowledge Graph (React Flow), reviewed AI relationship suggestions, Knowledge Timeline | ✅ Done |
| 5. Refinement | Performance, accessibility audit, security review, wider test coverage | — |

---

## Quick start

**Requirements:** Node.js 20.6 or later (developed on Node 24) and npm 10 or later. MongoDB is optional for local development (see below).

```bash
# 1. Install all workspaces
npm install

# 2. Configure the server
cp server/.env.example server/.env
#   - set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (generate each one with the command in the file)
#   - set MONGODB_URI, or set USE_IN_MEMORY_DB=true for a throwaway local database

# 3. Run API (port 4000) and client (port 5173) together
npm run dev
```

Open <http://localhost:5173>. In development, Vite proxies `/api` to the Express server. The browser therefore sees a single origin, and the httpOnly refresh cookie works without CORS configuration.

| Script (repo root) | What it does |
| --- | --- |
| `npm run dev` | Runs the API (with `node --watch`) and the Vite client together |
| `npm test` | Runs the API test suite against a real in-memory MongoDB |
| `npm run build` | Builds the client for production into `client/dist` |

### Database options

- **MongoDB Atlas (recommended).** Create a free cluster and put its connection string in `MONGODB_URI`. Phase 3 uses **Atlas Vector Search** for retrieval, so Atlas is the intended target.
- **In-memory (development only).** Leave `MONGODB_URI` empty and set `USE_IN_MEMORY_DB=true`. The server starts an ephemeral MongoDB via `mongodb-memory-server` (the binary downloads on first run). **All data is lost when the server stops.** This option is refused when `NODE_ENV=production`.
- **Local MongoDB.** Use `MONGODB_URI=mongodb://localhost:27017/mindmesh`.

---

## Architecture

```
mindmesh/
├── package.json                 npm workspaces + root scripts
├── server/                      Node.js + Express 5 REST API
│   ├── .env.example
│   ├── src/
│   │   ├── index.js             boot: connect DB, start server, graceful shutdown
│   │   ├── app.js               middleware stack + route mounting (importable for tests)
│   │   ├── config/              env.js (zod-validated, fail-fast) · db.js
│   │   ├── models/              User · Session
│   │   ├── middleware/          auth · validate · errorHandler · rateLimit
│   │   ├── modules/             one folder per feature: routes → controller → service
│   │   │   ├── auth/
│   │   │   └── users/
│   │   └── utils/               ApiError · tokens
│   └── tests/                   node:test + supertest + mongodb-memory-server
└── client/                      React 19 + Vite + Tailwind CSS 4
    ├── index.html               fonts and a pre-paint theme script (no flash of the wrong theme)
    └── src/
        ├── main.jsx · App.jsx   providers + routes
        ├── api/                 fetch client (token refresh, error normalisation) + endpoints
        ├── context/             Auth · Theme · Toast
        ├── themes/              themes.css (design tokens) · registry.js (theme metadata)
        ├── index.css            Tailwind token mapping, theme variants, component personalities
        ├── components/
        │   ├── ui/              Button · Field · Toggle · Dialog · Card · ChoiceCards · Alert · Skeleton · EmptyState · Spinner
        │   ├── theme/           Logo · ThemePicker · InterestPicker · InterestConstellation
        │   └── layout/          AppShell · Sidebar · navigation · RouteGuards · PageHeader
        ├── hooks/               useForm · usePreferences
        ├── lib/                 cn · format · aiModes
        └── pages/               auth/ · OnboardingPage · HomePage · settings/ · NotFoundPage
```

### Backend conventions

- **Modules:** each feature has `*.routes.js` (HTTP wiring), `*.validators.js` (zod schemas), `*.controller.js` (request to response) and `*.service.js` (business logic and DB access). Later phases add `notes/`, `documents/`, `collections/`, `search/`, `graph/`, `conversations/` and `ai/` in the same shape.
- **Validation:** every body and param is parsed with zod via `validate()`. Unknown keys on preference and profile updates are rejected (`.strict()`), which prevents mass assignment.
- **Errors:** services throw `ApiError(status, message, code, details)`. A central handler maps Mongoose validation, cast and duplicate-key errors and malformed JSON to consistent JSON: `{ error: { message, code, details? } }`. Field errors appear under `details.fields` and are shown inline by the client.
- **Ownership:** every query filters by the authenticated `user` id, for example `Session.updateOne({ _id, user })`, so one user can never touch another user's records. Tests cover this.

### Authentication design

| Piece | Implementation |
| --- | --- |
| Passwords | bcrypt (cost 12 by default). Login timing is equalised for unknown emails. |
| Access token | JWT (`HS256`, 15 min, `iss`/`aud` checked). Held **in memory only** on the client, never in localStorage. |
| Refresh token | 384-bit random opaque token in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth` (`Secure` in production). Only its HMAC is stored. |
| Sessions | One `Session` document per sign-in, with an expiry TTL index. The access token carries the session id, and every request checks that the session is still active, so revocation takes effect immediately. |
| Rotation and theft detection | Each refresh swaps the token atomically. Replaying a previously rotated token revokes **all** of that user's sessions. |
| Rate limiting | Login and register: 20 per 15 min per IP. Password change and account deletion: 10 per 15 min. All API routes: 300 per min. |
| Headers | `helmet`, a strict CORS allow-list (`CLIENT_ORIGIN`), and a 1 MB JSON body limit. |

The client restores the session on load by calling `POST /api/auth/refresh`. When an access token expires, the client performs a single shared refresh and retries the request once.

### Theme system

The three themes are complete visual identities built on one token contract:

| | The Library | The Studio | The Lab |
| --- | --- | --- | --- |
| Mood | Warm reading room, vintage editorial | Bright modular creative studio | Dark research instrument panel |
| Type | Cormorant Garamond + Source Serif 4 | Bricolage Grotesque + DM Sans | Space Grotesk + IBM Plex Sans + JetBrains Mono |
| Surfaces | Paper grain, ruled card borders, warm shadows | Borderless rounded modules, pastel washes | Layered navy panels, faint grid, hairline light |
| Navigation | Bound ledger with roman-numeral sections and a bookmark marker | Floating rounded panel with coloured icon chips | Slim instrument rail with numbered mono sections and a signal bar |
| Buttons | Small-caps serif, leather-red | Pills with soft coloured shadow | Mono uppercase, luminous hover |

How it works:

1. `themes/themes.css` defines every token (`--mm-bg`, `--mm-ink`, `--mm-accent`, fonts, radii, shadows, texture and so on) per `[data-theme]`.
2. `index.css` maps the tokens into Tailwind 4 (`bg-surface`, `text-ink`, `rounded-card`, `shadow-card`, `font-display`, …). It also defines `library:`, `studio:` and `lab:` variants for theme-specific layout tweaks, plus a small set of `mm-*` component classes with per-theme personality.
3. Switching themes only changes `<html data-theme>`. React is not remounted, so drafts and other in-progress state survive.
4. The choice is saved to `user.preferences.theme`, restored at sign-in, and mirrored to localStorage so the correct theme paints before JavaScript loads. Visitors can preview themes on the sign-in page, and the previewed theme carries into their new account.

---

## API reference (Phase 1)

All routes are prefixed with `/api`. 🔒 means `Authorization: Bearer <accessToken>` is required.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness and database status |
| POST | `/auth/register` | `{ name, email, password, theme? }` → `{ user, accessToken }` and sets the refresh cookie |
| POST | `/auth/login` | `{ email, password }` → `{ user, accessToken }` and sets the refresh cookie |
| POST | `/auth/refresh` | Rotates the refresh cookie → `{ user, accessToken }` |
| POST | `/auth/logout` | Revokes the current session |
| POST | `/auth/logout-all` 🔒 | Revokes every session |
| GET | `/users/me` 🔒 | Current user |
| PATCH | `/users/me` 🔒 | `{ name?, bio?, interests? }` |
| PATCH | `/users/me/preferences` 🔒 | Deep-partial `{ theme?, reduceMotion?, ai?: {…}, library?: {…} }` |
| POST | `/users/me/onboarding` 🔒 | `{ name?, theme, interests, defaultMode }` |
| POST | `/users/me/password` 🔒 | `{ currentPassword, newPassword }`. Signs out other sessions. |
| GET | `/users/me/sessions` 🔒 | Active sessions (the current one is flagged) |
| DELETE | `/users/me/sessions/:id` 🔒 | Revoke one of your own sessions |
| DELETE | `/users/me` 🔒 | `{ password, confirm: "DELETE" }`. Deletes the account and all of its library data and files. |

### Knowledge library (Phase 2)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/resources` 🔒 | List or search. Query: `q`, `type` (`note`/`document`/`link`), `collection` (id or `none`), `tags` (comma-separated ids, all must match), `pinned`, `status`, `sort` (`relevance`/`updated`/`created`/`accessed`/`title`), `page`, `limit` (max 60) |
| GET | `/resources/overview` 🔒 | Counts by type, pinned, recently opened, recently added |
| POST | `/resources/notes` 🔒 | `{ title?, content? (TipTap JSON), collectionId?, tags?: string[], pinned? }` |
| POST | `/resources/documents` 🔒 | `multipart/form-data`: `file`, optional `title`, `collectionId`, `tags` (JSON array). Returns **202** with status `pending`. |
| POST | `/resources/links` 🔒 | `{ url, title?, collectionId?, tags? }`. Returns **202**; the page is fetched in the background. |
| GET | `/resources/:id` 🔒 | One item (records the access; add `?touch=false` to skip) |
| PATCH | `/resources/:id` 🔒 | `{ title?, pinned?, collectionId?, tags?, content?, baseRevision? }`. Content saves need the `baseRevision` they were edited from, and a stale one gets **409 `NOTE_CONFLICT`**. |
| GET | `/resources/:id/chunks` 🔒 | Indexed text passages (`page`, `limit`) |
| GET | `/resources/:id/file` 🔒 | The original upload, streamed with safe headers (`?download=1` to force a download) |
| POST | `/resources/:id/reprocess` 🔒 | Re-run extraction for a document or link |
| DELETE | `/resources/:id` 🔒 | Deletes the item, its passages and its stored file |
| POST | `/resources/bulk` 🔒 | `{ ids, action: move/pin/unpin/delete/addTags, collectionId?, tags? }` |
| GET / POST | `/collections` 🔒 | List (flat, with item counts and `unfiledCount`) / create `{ name, description?, parentId? }` |
| PATCH | `/collections/:id` 🔒 | Rename, re-describe or move (`parentId`). Cycles and nesting deeper than 3 levels are rejected. |
| DELETE | `/collections/:id` 🔒 | Optional `?moveTo=<id>`. Items are **never deleted**: they move to `moveTo` or become unfiled, and sub-collections move up one level. |
| GET / POST | `/tags` 🔒 | List with counts / create `{ name }` |
| PATCH / DELETE | `/tags/:id` 🔒 | Rename / delete (the tag is removed from items; the items are kept) |

---

## Knowledge library architecture (Phase 2)

**One `Resource` model** stores notes, documents and links. Shared concerns live in one place: ownership, title, pinning, `collectionId`, tags, `lastAccessedAt` and processing status. Type-specific data lives in the `note`, `file` and `link` sub-documents. This keeps listing, search, recents and the future knowledge graph uniform across types.

**`Chunk` documents** hold extracted text passages, each with `user`, `resource`, `index`, `page`/`pageEnd` (PDFs), the nearest `heading` (notes and Markdown), `charCount` and `tokenEstimate`. Chunks back full-text search now. In Phase 3 each chunk gains an `embedding` field for vector search and RAG, so no re-architecture is needed.

**Processing pipeline** (`server/src/processing/`):

```
upload ─► multer (size/type limits) ─► signature check (magic bytes / UTF-8) ─► random storage key
      ─► Resource{status: pending} ─► 202 to client
                                        │  in-process queue (PROCESSING_CONCURRENCY)
                                        ▼
         extract (pdfjs per page · mammoth · markdown/html/csv/json/rtf readers)
      ─► normalise + chunk (~1,200 chars, ~200 overlap, page & heading aware)
      ─► replace Chunk docs ─► status ready | failed (with a user-facing reason)
```

- Jobs run outside the request cycle. Status is durable in MongoDB, and jobs interrupted by a restart are re-queued at boot. The queue module has a single `enqueue(id)` entry point, so it can be swapped for BullMQ/Redis in multi-instance deployments.
- A PDF with no extractable text (e.g. a scan) is marked **failed** with `NO_TEXT`, never "ready". OCR isn't implemented.
- Notes are chunked synchronously on every save, since they are small.

**Note editor:** TipTap 3 (StarterKit: headings, lists, quotes, code blocks, bold/italic/underline/strike, links, undo/redo). Content is stored as ProseMirror JSON. The server sanitises it (structure and depth limits, `javascript:` links stripped) and never renders it as HTML. Autosave is debounced (~0.9 s) with one request in flight at a time. **Optimistic concurrency** (`note.revision` + `baseRevision`) detects edits from another tab: autosave pauses and the user chooses *Load latest* or *Save mine as a copy*.

**Saved links (SSRF-safe fetching):** only `http(s)`. Every DNS answer is checked at connect time, so private, loopback, link-local, CGNAT and cloud-metadata ranges are refused, which also defeats DNS rebinding. Redirects are followed manually (max 5) and each hop is re-validated. There are timeouts, a byte cap and a content-type allow-list, and **robots.txt is honoured**. When a site disallows bots, the link is kept as a bookmark and labelled *Bookmark only*. Unreachable, 403/404 and rate-limited pages are reported honestly with the reason, and you can retry them.

**File security:** files are stored under `UPLOAD_DIR/<userId>/<random>.<ext>` and user-supplied names never touch the filesystem. They are served only through an authenticated, ownership-checked route with `Content-Security-Policy: sandbox`, and HTML or text uploads are always served as `text/plain`. Deleting an item or an account removes its files.

**Search (Phase 2):** a MongoDB text index over titles, descriptions and domains (title-weighted), plus a text index over every chunk's content, merged and ranked together. A title substring match adds partial-word matches. Results include a snippet and page number from the best-matching passage. Semantic search arrives in Phase 4 on the same chunks.

---

## Environment variables

See [`server/.env.example`](server/.env.example) for the annotated file.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | | `development` | `development`, `test` or `production` |
| `PORT` | | `4000` | API port |
| `CLIENT_ORIGIN` | | `http://localhost:5173` | Comma-separated CORS allow-list |
| `TRUST_PROXY` | | `false` | Set to `true` behind a reverse proxy so client IPs are correct |
| `MONGODB_URI` | ✅* | — | MongoDB connection string (*or use `USE_IN_MEMORY_DB`) |
| `USE_IN_MEMORY_DB` | | `false` | Dev-only ephemeral database |
| `JWT_ACCESS_SECRET` | ✅ | — | 32 characters or more; signs access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | 32 characters or more; HMAC key for stored refresh-token hashes |
| `ACCESS_TOKEN_TTL` | | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | | `14` | Session lifetime |
| `BCRYPT_ROUNDS` | | `12` | Password hashing cost |
| `UPLOAD_DIR` | | `./uploads` | Where uploaded files are stored (relative to `server/`; gitignored) |
| `MAX_UPLOAD_MB` | | `25` | Per-file upload limit |
| `PROCESSING_CONCURRENCY` | | `2` | Background extraction jobs that run in parallel |
| `LINK_FETCH_TIMEOUT_MS` | | `10000` | Timeout for fetching saved links |
| `LINK_MAX_BYTES` | | `3000000` | Maximum page size read when fetching a link |
| `ALLOW_PRIVATE_LINK_FETCH` | | `false` | Dev/test only: allow fetching localhost and private IPs. Refused in production. |
| `AI_PROVIDER` | | `anthropic` | Chat provider adapter |
| `ANTHROPIC_API_KEY` | for chat | — | Anthropic API key. Without it, chat shows a setup message. |
| `AI_MODEL` | | `claude-opus-5-5` | Chat model |
| `AI_UTILITY_MODEL` | | `AI_MODEL` | Model for titles, follow-ups and summaries (e.g. `claude-haiku-5-5`) |
| `AI_EFFORT` | | `medium` | `low` / `medium` / `high` / `xhigh` / `max` |
| `AI_MAX_OUTPUT_TOKENS` | | `16000` | Maximum answer length |
| `AI_REFUSAL_FALLBACKS` | | `true` | Anthropic server-side refusal fallbacks |
| `EMBEDDING_PROVIDER` | | `voyage` | `voyage`, `openai` or `none` |
| `VOYAGE_API_KEY` / `OPENAI_API_KEY` | for semantic search | — | Embedding provider key |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | | provider default | `voyage-3.5`/1024, `text-embedding-3-small`/1536 |
| `VECTOR_SEARCH` | | `auto` | `auto`, `atlas` or `local` |
| `VECTOR_INDEX_NAME` | | `chunk_embedding_index` | Atlas Vector Search index name |
| `RAG_TOP_K` | | `8` | Passages given to the model per question |
| `RAG_MIN_SCORE` | | `0.3` | Minimum cosine similarity for a semantic-only match (assistant and Smart Search) |
| `GRAPH_SUGGEST_MIN_EMBEDDING` | | `0.6` | Minimum embedding similarity before two items are suggested as related |
| `GRAPH_SUGGEST_MIN_KEYWORD` | | `0.12` | Minimum TF-IDF similarity for suggestions when no embedding provider is set |

The server validates these at boot and exits with a clear message if any are missing or invalid.

---

## AI setup (Phase 3)

1. **Chat (required for the assistant).** Create a key at <https://console.anthropic.com/> and add it to `server/.env`:
   ```
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   The default model is `claude-opus-5-5` at `AI_EFFORT=medium`. For a cheaper model for titles, follow-up suggestions and conversation summaries, set `AI_UTILITY_MODEL=claude-haiku-5-5`. **Refusal fallbacks are on by default:** if Claude declines a request on safety grounds, the API re-runs it on a fallback model in the same call. Set `AI_REFUSAL_FALLBACKS=false` to turn this off.
2. **Embeddings (recommended, for semantic My Knowledge answers).** For Voyage AI, create a key at <https://dash.voyageai.com/> and set `EMBEDDING_PROVIDER=voyage` and `VOYAGE_API_KEY=...`. Alternatively, set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY=...`. Without embeddings, My Knowledge still works using keyword retrieval, and each answer says so.
3. **Restart the server.** Existing notes, documents and links, including Phase 2 content, are queued for embedding automatically at startup. You can also use **Settings → AI assistant → Index missing items**.
4. **Atlas Vector Search (optional, for large libraries).** With `MONGODB_URI` pointing at Atlas, run `npm run vector-index -w server` once. It creates this index on the `chunks` collection:
   ```json
   { "name": "chunk_embedding_index", "type": "vectorSearch",
     "definition": { "fields": [
       { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" },
       { "type": "filter", "path": "user" },
       { "type": "filter", "path": "embeddingModel" } ] } }
   ```
   `numDimensions` must match your embedding model. If you change the embedding model, recreate the index and choose **Rebuild everything** in Settings.

### Vector search strategy

`VECTOR_SEARCH=auto` (the default) uses **MongoDB Atlas Vector Search** (`$vectorSearch`, pre-filtered by `user` and `embeddingModel`) when it is available. Otherwise it computes **exact cosine similarity in-process** over the requesting user's own vectors. Local MongoDB and the in-memory development database don't support `$vectorSearch`, so local development needs no extra infrastructure. Exact search is fast at personal-library scale (tens of thousands of passages). Set `VECTOR_SEARCH=atlas` to require Atlas, or `local` to always use in-process search.

## AI assistant architecture (Phase 3)

**Providers** (`server/src/ai/`): `providers.js` is a registry. `anthropic.js` (the official `@anthropic-ai/sdk`) and `embeddings.js` (Voyage, OpenAI) register adapters with a small interface: `streamChat`, `completeJson` and `embed`. To add a provider, write an adapter, register a name, and select it with `AI_PROVIDER` / `EMBEDDING_PROVIDER`. Keys are read only on the server and are never sent to the browser.

**Embedding pipeline:** after text extraction (Phase 2), each item's passages are embedded in a background queue. Every chunk stores:
- `embedding`: a unit-length vector
- `embeddingModel`: `provider:model:dimensions`
- `embeddedAt` and `textHash`
- its page and position (`index`)
- its `resource` and `user`

Each item tracks `embedding.status` (`pending` / `processing` / `ready` / `failed` / `disabled`).

**No duplicate embeddings:** when an item is re-chunked, passages with an unchanged `textHash` keep their vectors, so editing one paragraph re-embeds only that passage. Note embeddings wait until 15 s after the last edit, and rate-limit or network errors are retried with backoff.

**Retrieval (My Knowledge):**
1. The query is embedded (`input_type: query`) and run through vector search *and* full-text search.
2. The two rankings are merged with Reciprocal Rank Fusion.
3. Passages below `RAG_MIN_SCORE` are dropped unless they also match on keywords.
4. At most 3 passages per item are kept, up to `RAG_TOP_K` in total.

Every query filters on the requesting user, and every result's item is re-checked for ownership. Short follow-up questions are expanded with the previous question before retrieval.

**Generation and citations:** passages go to Claude in a `<sources>` block of numbered `<source>` tags. The system prompt:
- requires inline `[n]` citations
- forbids invented sources
- requires saying so when the sources are insufficient
- puts any general knowledge in a separate paragraph labelled **From general knowledge:**
- treats passage text as data, not instructions

After generation, only numbers that match retrieved passages become citations. Each stored citation keeps the chunk id, item id, title, type, page, section, excerpt and similarity, and the UI links it to the original item.

**Chat runtime:** answers stream over Server-Sent Events (`start → status → sources → delta… → done → meta → end`).
- **Duplicate submissions** are blocked by a client request id, enforced by a unique index.
- **Concurrent generations** in one conversation are blocked by an atomic per-conversation lock, with recovery for stale locks.
- **Stopping or disconnecting** saves the partial answer as *stopped*.
- **Provider errors** are saved on the message with a message the user can retry from.
- **Conversation memory:** recent turns are sent in full within a character budget. Older turns are folded into a rolling summary (one small structured-output call) that goes ahead of the history.
- **Titles and follow-up suggestions** come from one structured-output call after the answer.
- **Empty library:** in My Knowledge mode with nothing saved, Mindmesh replies with a clearly marked notice and does not call the model.

### Assistant API

| Method | Path | Description |
| --- | --- | --- |
| GET / POST | `/conversations` 🔒 | List (`q`, `limit`, `before`) / create `{ title?, mode? }` |
| GET / PATCH / DELETE | `/conversations/:id` 🔒 | Messages, rename/mode change, delete (with its messages) |
| POST | `/conversations/:id/messages` 🔒 | `{ content, mode: general\|knowledge, clientRequestId }` → `text/event-stream`. **503 `AI_NOT_CONFIGURED`** without a provider; **409** on duplicate or concurrent sends. |
| POST | `/conversations/:id/messages/:messageId/regenerate` 🔒 | Replaces the latest answer (optional `{ mode }`), streamed |
| GET | `/ai/status` 🔒 | Provider/model configuration (no secrets), vector-search mode, the user's index progress |
| POST | `/ai/reindex` 🔒 | `{ force? }`: queue missing (or all) embeddings for the user's library |

Client (optional, `client/.env`): `VITE_API_URL` overrides the API base URL (default `/api`), and `VITE_API_PROXY` changes the dev proxy target.

## External services

| Service | Needed for | When |
| --- | --- | --- |
| MongoDB (Atlas recommended) | All data | Phase 1 |
| Google Fonts | Theme typography (system fallbacks are defined) | Phase 1 |
| Anthropic API (Claude) | Assistant chat, titles, follow-ups, summaries | Phase 3 (required for chat) |
| Voyage AI or OpenAI embeddings | Semantic retrieval in My Knowledge mode | Phase 3 (optional; keyword fallback) |
| MongoDB Atlas Vector Search | Indexed vector search at scale | Phase 3 (optional; in-process search otherwise) |
| Outbound internet access from the server | Fetching saved links | Phase 2 |

No API keys are ever sent to or bundled into the frontend.

---

## Phase 1 checklist

- [x] Monorepo with npm workspaces; client and server scaffolding
- [x] Fail-fast, zod-validated environment config; complete `.env.example`
- [x] MongoDB connection (Atlas, local or in-memory dev), with indexes synced at boot
- [x] `User` model with preferences (theme, motion, AI, library), interests and onboarding flag
- [x] `Session` model with TTL expiry, refresh-token rotation and reuse detection
- [x] Register, login, refresh, logout and logout-all; rate-limited; bcrypt
- [x] Auth middleware with immediate session revocation
- [x] Profile, preferences, onboarding, password change, session management and account deletion
- [x] Central validation and error handling with field-level errors
- [x] API test suite (11 tests: auth, rotation, revocation, preferences merge, ownership, deletion)
- [x] Design-token system; three fully distinct themes; theme-scoped Tailwind variants
- [x] Theme persisted to the account, restored at login, applied before first paint, switchable without losing state
- [x] Shared UI kit (buttons, fields, toggle, dialog with focus trap, cards, choice cards, alerts, toasts, skeletons, empty states)
- [x] Responsive app shell: per-theme desktop navigation, mobile drawer, skip link
- [x] Sign-in and sign-up with theme preview; four-step onboarding (name, theme, interests, AI mode)
- [x] Home dashboard showing only real data (profile, interests map, setup progress, sessions)
- [x] Settings: Profile, Account, Appearance, AI, Knowledge library, Security
- [x] Reduced-motion support (system setting plus account preference)

## Phase 2 checklist

- [x] `Resource`, `Chunk`, `Collection` and `Tag` models with user-scoped indexes and text indexes
- [x] Knowledge Vault: grid/list views (each theme with its own card and table design), search, type filter, collection and tag navigation, sorting, pagination, pinned and recently opened items, drag-and-drop upload
- [x] Rich-text notes: headings, paragraphs, bold/italic/underline/strike, bullet and numbered lists, links (Ctrl/⌘+K), inline code, code blocks, blockquotes, dividers, undo/redo
- [x] Autosave with a live status (saving / saved / unsaved / failed + retry / edited elsewhere), Ctrl/⌘+S, unsaved-changes warning, conflict detection with *Load latest* / *Save mine as a copy*
- [x] Uploads: PDF, DOCX, TXT, MD, CSV, JSON, HTML, RTF; extension + MIME + signature validation, size limit, per-file progress, cancel and retry
- [x] Background pipeline: extract → chunk (with page and heading metadata) → store → ready/failed with reasons; retry; crash recovery
- [x] Document view: inline PDF preview, extracted-text view for every format, download, rename, delete
- [x] Saved links: title, description, domain, site name, favicon and preview image, extracted article text; SSRF protection; robots.txt; honest failure states
- [x] Collections: create, rename, describe, nest (3 levels), move, open, delete without losing items (unfile or move elsewhere)
- [x] Tags: create, rename, delete, assign many per item with autocomplete and inline creation, filter by several tags
- [x] Full-text search across titles and the contents of notes, documents and pages, with snippets and page numbers
- [x] Home dashboard: real quick actions, recently opened and recently added items
- [x] Ownership checks on every query; cross-user access tests; files and chunks removed on delete and on account deletion
- [x] 24 new API tests (35 total), including generated PDF/DOCX fixtures, a local web server for link tests, and SSRF cases

### Known limitations

- **Scanned PDFs** (images only) are marked failed with a clear message, because OCR isn't implemented.
- Legacy `.doc`, `.pptx` and `.xlsx` files and **images** are not accepted yet.
- Search is **keyword-based** for now. Semantic (meaning-based) search needs embeddings and arrives with Phase 3–4.
- The processing queue is **in-process**. It survives restarts (jobs are re-queued from the database) but isn't shared across multiple server instances.
- Pages that need JavaScript to render their content may yield little text, and those that block bots are saved as bookmarks only.
- Files are stored on **local disk**. Move `processing/storage.js` to S3/GCS for multi-server or serverless hosting.

## Discovery architecture (Phase 4)

### Smart Search (`server/src/modules/search/`)

`GET /api/search` takes `q`, `mode` (`smart` | `keyword` | `semantic`), `type`, `collection`, `tags`, `from`, `to`, `sort` (`relevance` | `newest` | `oldest`), `page`, `limit` and `record`.

**How it ranks:**
- Filters are applied first, as an allowed set of item ids, so filtered searches are complete and vector search only scans permitted items.
- Up to four ranked lists are built:
  - title substring matches
  - the title/description text index
  - full-text matches inside every passage
  - semantic nearest neighbours (Phase 3 embeddings, Atlas or in-process)
- The lists are fused at the **item** level with weighted Reciprocal Rank Fusion, so every item appears **once**.
- Semantic-only matches must clear `RAG_MIN_SCORE`.

**What each result returns:**
- a match type: *Title*, *Exact words* or *Related meaning*
- up to two passages, with page and section
- highlight **character ranges**, computed server-side with light stemming and rendered as `<mark>` without injecting HTML

**Recent searches and suggestions:**
- **Recent searches** are stored per user, one row per distinct query, capped at 50. They are recorded on Enter, on picking a suggestion, or after the user pauses on a query.
- **Type-ahead suggestions** combine matching titles, tags, collections and past searches.

Without an embedding provider, Smart mode runs keyword-only and the response says so.

### Knowledge Graph (`server/src/modules/graph/`, `client/src/pages/graph/`)

**Nodes:** notes, documents and links; **topics** (tags); and **collections**, including their ancestors.

**Edges:**
- item → topic
- collection → item
- collection → sub-collection
- **connections**

**Connections:**
- A connection is an undirected `Connection` record with one row per pair.
- It is `manual`, or `ai` once a suggestion is accepted.
- Ownership of both ends is checked, and deleting an item removes its connections.

**Interactions:** zoom and pan, drag (positions persist per user in `GraphLayout`), select, double-click to open, search nodes, and filter by type, topic, collection, and whether topics and collections are shown.

**Exploring:** neighbour focus mode, a side panel listing connected items, topics and "related by content", drag-to-connect between items, and editable and removable connection labels.

**Layout:** d3-force runs on the client, and nodes the user placed stay fixed.

The graph shows up to 400 items, pinned and recently opened first, and notes when it is truncated.

**AI-assisted relationship suggestions** (`POST /api/graph/suggestions/generate`):
1. Score every pair of the user's items, using embedding centroids (cosine) or TF-IDF (keyword fallback).
2. Keep each item's **top 2 neighbours** above a similarity floor.
3. Skip any pair that was ever connected, suggested, dismissed or removed.
4. If a chat provider is configured, Claude reviews the batch with structured output. It drops pairs that aren't genuinely related and writes a short label and reason.
5. Store **at most 8** per run as `suggested`.

Nothing enters the graph until the user **accepts** it, and dismissed or removed pairs are never proposed again. This keeps the graph from filling up with meaningless links.

### Knowledge Timeline (`server/src/modules/timeline/`)

**What's recorded:** an append-only `Activity` log, written by the existing services, of:
- notes written, documents uploaded and links saved
- collections created and connections made
- topics searched (once per query per day)
- questions asked (each new conversation's first question)
- items revisited (at most once per item per 30 minutes)

**Backfill:** the first time a user opens the timeline, history is rebuilt from their existing items, collections, conversations and connections. Anything already logged is skipped, so nothing is duplicated.

**API:**
- `GET /api/timeline` filters by `types`, `from` and `to`, and pages with a time cursor (`before`).
- `GET /api/timeline/summary` returns per-day counts in the viewer's IANA time zone, for the 12-week heat map.
- Events for items that were deleted later are kept and marked as deleted, never linked.

### Discovery API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/search` 🔒 | Unified search (see above) |
| GET | `/search/suggest?q=` 🔒 | Type-ahead suggestions |
| GET / DELETE | `/search/recent` 🔒 | Recent searches / clear all |
| DELETE | `/search/recent/:id` 🔒 | Remove one recent search |
| GET | `/graph` 🔒 | Nodes and edges: `types`, `collection`, `tag`, `showTopics`, `showCollections` |
| POST / PATCH / DELETE | `/graph/connections[/:id]` 🔒 | Create `{ sourceId, targetId, label? }`, relabel, remove |
| GET | `/graph/suggestions` 🔒 | Pending suggestions |
| POST | `/graph/suggestions/generate` 🔒 | Find new suggestions (rate-limited) |
| POST | `/graph/suggestions/:id/accept` / `dismiss` 🔒 | Review a suggestion |
| GET | `/graph/related/:resourceId` 🔒 | Connected and content-similar items |
| PUT / DELETE | `/graph/layout` 🔒 | Save dragged positions / reset layout |
| GET | `/timeline` 🔒 | Activity feed |
| GET | `/timeline/summary` 🔒 | Daily counts by type (`days`, `tz`) |

## Phase 4 checklist

- [x] Smart Search page: prominent input, type-ahead suggestions, recent searches, filters (type, collection, tags, date presets and custom range), sort (relevance, newest, oldest), keyword / meaning / smart modes, result previews with highlights, type indicators, tags, links to the original
- [x] Semantic search on the Phase 3 embeddings, fused with keyword retrieval; one result per item; per-user scoping on every list
- [x] Interactive Knowledge Graph (React Flow): notes, documents, links, topics and collections; zoom, pan, drag with saved layout, select, open, search nodes, filter by type, topic and collection; neighbour focus; related items; manual connections with labels
- [x] AI-assisted relationship suggestions with review (accept / dismiss), a similarity floor, a per-item cap, AI confirmation when available, and no repeats
- [x] Distinct graph styling per theme (catalogue cards / pastel pills / instrument nodes)
- [x] Knowledge Timeline: notes, documents, links, collections, connections, topics searched, questions asked, items revisited; filters by type and date; 12-week heat map; backfill of earlier history
- [x] "Related" panel on every item page; recent searches on Home
- [x] 11 new API tests (62 total)

### Known limitations (Phase 4)

- **Not exercised against live embedding or Claude APIs in this environment.** The semantic search ranking and AI review of suggestions are covered by test doubles; with real keys, thresholds such as `GRAPH_SUGGEST_MIN_EMBEDDING` may need tuning for your embedding model.
- The graph renders up to 400 items at once, with no clustering for very large libraries.
- Similarity for suggestions and related items is computed in-process per request, which is fine for personal libraries (hundreds of items) but not for very large ones.
- Searching inside chat conversations isn't part of Smart Search yet.

## Phase 3 checklist

- [x] General-purpose assistant (Claude via the official SDK): works with an empty library and keeps conversation context
- [x] Two clearly labelled modes, **General AI** and **My Knowledge**, switchable mid-conversation without losing it
- [x] Provider registry with swappable chat and embedding adapters; keys stay on the server; a setup message (never a fake reply) when unconfigured
- [x] Embedding pipeline with per-chunk vectors, model/version, page, position, ownership and status; Phase 2 content backfilled at boot; re-indexing on change; hash-based reuse to avoid duplicate embeddings
- [x] Vector search: Atlas `$vectorSearch` when available, exact in-process cosine otherwise; hybrid fusion with keyword search; strictly per user
- [x] RAG with numbered sources, guardrailed prompt, insufficiency admitted, general knowledge labelled, citations only for really retrieved passages (title, type, excerpt, page, link)
- [x] Empty-library and nothing-relevant cases handled honestly
- [x] Chat UI: history with search and date groups, new / rename / delete, timestamps, Markdown with GitHub tables, syntax-highlighted code with copy, copy response, regenerate, stop, live status (searching / thinking), error and retry states, follow-up suggestions, citation chips linked to source cards
- [x] Streaming (SSE), duplicate-submission and concurrent-generation protection, partial answers saved on stop
- [x] Conversation memory: recent window plus rolling summary
- [x] Settings: default mode, response style, follow-ups, live AI status, index progress, re-index
- [x] 16 new API tests (51 total) using test-only provider doubles

### Known limitations (Phase 3)

- **Not exercised against the live Claude/Voyage APIs in this environment**, because no API keys were available. The adapters follow the official SDK reference and are covered by the test doubles, but the first real run should be checked once keys are configured.
- Retrieval quality without an embedding key is keyword-only.
- Conversation search covers titles, not message text.
- Answers aren't editable or branched; regenerate replaces only the latest answer.

### Known limitations in Phase 1

- No email verification or password-reset email (this needs an email provider; planned for Phase 5).
- AI and library preferences are stored now but only take effect when their modules ship.
- The `/api` dev proxy assumes the client and API share an origin. For split-origin production deployments, set `CLIENT_ORIGIN` and `VITE_API_URL`, and serve both over HTTPS.
