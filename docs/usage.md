# Usage Guide

## Run

```bash
npm install
npm run build
npm start        # http://localhost:3000
```

## Dashboard (public)

Open `/`. Shows the Einsatzmonitor: idle truck grid, or active alert (category, address, info, notes) with the participating trucks highlighted. Click **Ton** once per device to enable the alarm sound (browsers block autoplay).

## Admin

Open the admin view and sign in (default `ffw_bft` / `bft_2026`, override with `BFT_USER` / `BFT_PASS`).

- **Trucks**: add, edit, delete.
- **Alerts**: create planned alerts; **Auslösen** → choose a 3–15 minute delay; **Abbrechen** cancels a countdown; **Abschließen** ends an active alert.
- **Fehlalarm auslösen**: triggers a false alarm at any time (unless another alarm is active/armed).
- **Settings**: alarm sound duration (default 60 s).

## Rules

- Only one alert (or false alarm) may be active or armed at a time (otherwise "Alarm aktiv oder ausstehend").
- Active alerts auto-complete after 10 minutes.
- Countdowns survive server restarts (state is stored in `data.json`).

## API

Public: `GET /api/state`. Everything else under `/api/*` requires HTTP Basic auth: `trucks`, `alerts` (+ `/:id/trigger` with `{delayMinutes}`, `/:id/cancel-trigger`, `/:id/complete`), `false-alert`, `settings`.
