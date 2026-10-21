# AGENTS.md

## Rules

Read the following files at the begin of each new session and add the content to the context:

- `/Users/dino/.config/opencode/rules/ask-general.md`
- `/Users/dino/.config/opencode/rules/communication.md`
- `/Users/dino/.config/opencode/rules/general.md`
- `/Users/dino/.config/opencode/rules/communication.md`

## Current state

Fully implemented. Express/TypeScript API in `src/server/`, React/MUI SPA in `src/client/`,
shared types in `src/shared/`. All 6 implementation units complete with full test suite.

Key docs:
- `docs/PRD.md` — authoritative product requirements
- `docs/architecture.md` — system design, state machine, component layout, API routes
- `docs/development.md` — commands, env vars, testing conventions
- `docs/usage.md` — user-facing behaviour, API reference

## Stack

- Node.js/Express backend, React/MUI SPA (TypeScript throughout).
- Persistence via `data.json` (atomic rename writes, no database).
- Must work on desktop and mobile browsers.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Express :3000 (`tsx watch`) + Vite :5173 (proxies `/api`). Open http://localhost:5173 |
| `npm run build` | Typecheck + Vite client build + tsc server build |
| `npm start` | Run production build on port 3000 |
| `npm test` | Run all tests (unit, integration, jsdom client) |
| `npm run test:coverage` | Tests with ≥80% branch/line/function/statement coverage gate |

## Auth

- HTTP Basic auth on all `/api/*` routes except `GET /api/state` (public).
- Credentials configured via `BFT_USER` / `BFT_PASS` env vars.
- Defaults (for development): `ffw_bft` / `bft_2026`.
- Default credentials are defined in `src/server/config.ts` (server-only — not bundled into client JS by Vite).

## Domain rules — easy to miss (see PRD + architecture.md)

- At most one alert **or** false alarm may be **active or armed** at a time (single-slot invariant).
  - "Armed" = `status: 'pending'` + `triggerAt` set (a pending delayed trigger).
  - A `pending` alert *without* `triggerAt` does **not** occupy the slot.
- Active alerts auto-complete after exactly 10 minutes.
- Alert trigger supports a 3–15 minute integer delay.
- Alert sound plays for a configurable duration (default 60 s, stored in `data.json`).
- False alarms are **in-memory only** — not persisted to `data.json`. A server restart
  during a false alarm returns to idle state silently.
- False alarms are blocked when another alert is active or armed.
- Deleting a truck silently removes its ID from every alert's `truckIds`.
- `complete` alerts can be re-triggered.

## Conventions

- UI text in German; source code, identifiers, and comments in English.
- Domain logic lives in `src/server/engine.ts` with an injected clock (`now`) and persist fn.
  Test time-based behaviour with `engine.tick(faketime)` and a fake `now` fn.
- `src/shared/constants.ts` is the canonical source for timing constants (`AUTO_COMPLETE_MS`,
  `MIN_DELAY_MINUTES`, `MAX_DELAY_MINUTES`), default settings, and seed data. Do not duplicate.
- `public/sound/Warnung.mp3` is the sound source of truth — Vite copies it to `dist/client/sound/`.
- `data.json` is gitignored and auto-seeded on first run.
- Tests: `tests/unit/` (engine, storage, auth), `tests/integration/` (HTTP API, lifecycle),
  `tests/client/` (jsdom component/hook tests).
- New admin API routes are mounted in `createApp()` in `src/server/index.ts`; add an integration
  test in `tests/integration/api.test.ts`.
