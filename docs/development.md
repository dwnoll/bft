# Development Guide

## Prerequisites

Node.js 20+ and npm.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Express on :3000 (`tsx watch`) + Vite on :5173 (proxies `/api`). Open http://localhost:5173 |
| `npm run build` | Typecheck client, `vite build` → `dist/client`, `tsc` server → `dist/server` |
| `npm start` | Run the production build on one port (default 3000) |
| `npm test` | Run all tests (unit, integration, jsdom client) |
| `npm run test:coverage` | Tests with coverage; fails below 80 % |

## Configuration (environment variables)

- `PORT` (default `3000`)
- `DATA_FILE` (default `data.json`, created and seeded on first start)
- `BFT_USER` / `BFT_PASS` (default `ffw_bft` / `bft_2026`)

## Conventions

- Code and identifiers in English, UI text in German.
- Domain logic lives in `src/server/engine.ts` and takes an injected clock/persist function; test time-based behaviour with a fake `now` and `engine.tick(now)`.
- The alarm sound source of truth is `public/sound/Warnung.mp3`; Vite copies it into `dist/client/sound/`.
- Tests: `tests/unit` (engine, storage, auth), `tests/integration` (HTTP API, lifecycle), `tests/client` (jsdom).

See [architecture.md](architecture.md) for the system design.
