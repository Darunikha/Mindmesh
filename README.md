# Mindmesh

An AI-powered personal knowledge and learning workspace: a general-purpose AI assistant, a personal knowledge vault, semantic search, document analysis and an interactive knowledge graph, in three distinct visual themes.

> **Status: Phase 1 (Foundation) complete.** Authentication, onboarding, the theme system, the app shell, the home dashboard and settings are working end to end. Modules from later phases appear in the navigation as disabled items marked with their phase (`P2`, `P3`, `P4`). They are never linked to empty or fake pages.

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Foundation | Monorepo, Express API, MongoDB, JWT auth with rotating refresh tokens, onboarding, three themes, shared UI, navigation, home, settings | ✅ Done |
| 2. Knowledge management | Vault, rich-text notes, collections, tags, uploads, text extraction, chunking, embeddings | ⏳ Next |
| 3. AI assistant | Chat, conversations, provider adapters, General / My Knowledge / Blended modes, RAG, citations | — |
| 4. Discovery | Semantic search, knowledge graph (React Flow), AI-suggested links, timeline | — |
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
| DELETE | `/users/me` 🔒 | `{ password, confirm: "DELETE" }`. Deletes the account. |

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

The server validates these at boot and exits with a clear message if any are missing or invalid. Placeholders for later phases (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `EMBEDDING_PROVIDER`, `VOYAGE_API_KEY`, `UPLOAD_DIR` and others) are listed but commented out in `.env.example`. They are not read yet.

Client (optional, `client/.env`): `VITE_API_URL` overrides the API base URL (default `/api`), and `VITE_API_PROXY` changes the dev proxy target.

## External services

| Service | Needed for | When |
| --- | --- | --- |
| MongoDB (Atlas recommended) | All data | Phase 1 |
| Google Fonts | Theme typography (system fallbacks are defined) | Phase 1 |
| Atlas Vector Search | Semantic search and RAG retrieval | Phase 3–4 |
| LLM provider (Anthropic or OpenAI, swappable) | Assistant | Phase 3 |
| Embedding provider (Voyage or OpenAI, swappable) | Chunk and query embeddings | Phase 2–3 |

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

### Known limitations in Phase 1

- No email verification or password-reset email (this needs an email provider; planned for Phase 5).
- AI and library preferences are stored now but only take effect when their modules ship.
- The `/api` dev proxy assumes the client and API share an origin. For split-origin production deployments, set `CLIENT_ORIGIN` and `VITE_API_URL`, and serve both over HTTPS.
