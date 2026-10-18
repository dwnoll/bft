# AGENTS.md

## Current state

- Repo is pre-implementation: no code, no commits yet. The only source of truth
  is `docs/PRD.md` — read it before building or modifying
  anything.

## Stack (fixed by the PRD)

- Node.js web app (SPA), MUI for the GUI.
- Persistence via a JSON file (no database).
- Must work on desktop and mobile browsers.

## Auth

- HTTP Basic auth, configurable username/password.
- Defaults: `ffw_bft` / `bft_2026`.

## Domain rules easy to miss (all in the PRD)

- Only one alert may be active at a time.
- Active alerts auto-complete after 10 minutes.
- Alert trigger supports a 3–15 minute delay.
- Alert sound plays for a configurable duration (default 60s).
- Admin can trigger a false alert at any time.
