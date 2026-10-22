# Firealarm Simulator — PRD

Web-application simulating the alarm system of a fire station (FFW). Supersedes
`Firealarm-Simulator-PRD.md`.

## 1. Stack & Runtime

- Node.js ≥ 20, TypeScript throughout.
- Client: React SPA (Vite) with MUI.
- Server: Express, single port (env `PORT`, default 3000), serves the built SPA
  (catch-all → `index.html`) and the JSON API.
- Persistence: single `data.json`; the server is the sole writer; writes are
  atomic (write temp file, rename over `data.json`).
- Works on desktop and mobile browsers (responsive layout).

## 2. Data Model

```ts
Truck {
  id: string          // short ULID, server-generated
  name: string
  category: 'Gruppe' | 'Staffel' | 'Trupp'
}

Alert {
  id: string
  name: string
  category: string
  address: string
  info: string
  notes?: string
  truckIds: string[]
  status: 'pending' | 'active' | 'complete'
  triggerAt?: number      // epoch ms, set when a delayed trigger is armed
  activeSince?: number    // epoch ms, set when the alert goes active
  completedAt?: number    // epoch ms, set when the alert completes
}

Settings {
  soundDurationSec: number   // default 60
}

DataFile {
  trucks: Truck[]
  alerts: Alert[]
  settings: Settings
}
```

Timers survive server restarts: state is derived from the persisted timestamps
(`triggerAt`, `activeSince`) by a tick loop that runs every second and also on
startup.

## 3. Authentication

- HTTP Basic authentication for admin features.
- Credentials from env vars `BFT_USER` / `BFT_PASS`, defaulting to `ffw_bft` /
  `bft_2026`. Not changeable at runtime.
- All admin API routes are server-side guarded.
- Dashboard and the state endpoint are public (no auth).

## 4. Dashboard (public)

- Polls `GET /api/state` every 2 seconds.
- **No active alert:** large text "Einsatzmonitor" in the top half of the
  screen; grid of all truck cards in the lower half, unhighlighted.
- **Active alert (or false alert):** top half shows category, address, and info
  of the active alert; the lower half shows the truck cards — trucks used in the
  alert have a highlighting background color, unused trucks are not highlighted.
- Truck grid: responsive MUI Grid — 1 column on phones, 2 on small tablets, 3–4
  on desktop (`xs=12, sm=6, md=4`).

## 5. Admin: Trucks

- Create / modify / delete trucks (5 seeded for layout).
- Attributes: name, category (one of `Gruppe`, `Staffel`, `Trupp`).
- Deleting a truck removes it from every alert's `truckIds` silently (including
  alerts currently active — the dashboard simply shows the remaining trucks).

## 6. Admin: Planned Alerts

- Create / modify / delete alerts with: name, category, address, info, notes
  (optional), selection of trucks used (may be empty).
- Validation: name, category, address, info are required.
- Per-row actions:
  - **Trigger** (statuses `pending` or `complete` only): opens a dialog with a
    slider for the delay, 3–15 minutes, integer steps. Confirming arms the
    delayed trigger.
  - While counting down: the row shows a live countdown badge (e.g. "ausstehend
    (4:32)") and a **Cancel** button.
  - While `active`: an **Abschließen** (complete) button.
- Deleting an alert with a pending trigger cancels the trigger automatically.
- Editing a pending alert updates what will go out (no extra confirmation).

## 7. Alert Lifecycle Rules

- **Only one alert may be active or pending (trigger armed) system-wide.** Any
  second trigger attempt is rejected with a toast.
- When a triggered alert fires, it becomes `active`:
  - dashboard switches to the alert view (category, address, info, trucks);
  - the alarm sound plays (see §8).
- A false alert may be triggered at any time **except** while another alert is
  active or has a pending trigger; the attempt is rejected with the toast "Alarm
  aktiv oder ausstehend".
- `active` alerts auto-complete after **10 minutes** (derived from `activeSince`
  in the tick loop).
- Admin can complete an active alert manually at any time.
- A completed alert can be triggered again (repeat drill).

## 8. False Alert

- Admin action available at any time (subject to the rule in §7).
- One-shot, **not stored** as an alert record in `data.json`.
- Shown on the dashboard with info text "Fehlalarm", no trucks highlighted.
- Auto-clears after 10 minutes like a normal active alert.

## 9. Alarm Sound

- Source file: `docs/Warnung.mp3`, copied to `public/sound/` during build.
- Duration configurable in the admin UI ("Einstellungen" card on the alerts
  page, numeric field in seconds, stored in `data.json`, default 60).
- The clip is **looped** until the configured duration elapses, then stops.
- Playback:
  - plays in the admin's browser at trigger time (tab has user gesture);
  - also plays on any dashboard browser where the admin has enabled the "Ton"
    toggle — a per-device arm toggle persisted in `localStorage`, **default
    off** (browsers block autoplay without a prior gesture).

## 10. API (summary)

| Route                                                  | Auth   | Purpose                                                                   |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------- |
| `GET /api/state`                                       | public | current alert (or false alert) + trucks + settings, for dashboard polling |
| `GET/POST /api/trucks`, `PATCH/DELETE /api/trucks/:id` | basic  | truck CRUD                                                                |
| `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/:id` | basic  | alert CRUD                                                                |
| `POST /api/alerts/:id/trigger`                         | basic  | arm delayed trigger `{ delayMinutes: 3..15 }`                             |
| `POST /api/alerts/:id/cancel-trigger`                  | basic  | cancel pending trigger                                                    |
| `POST /api/alerts/:id/complete`                        | basic  | complete active alert                                                     |
| `POST /api/false-alert`                                | basic  | trigger one-shot false alert                                              |
| `PATCH /api/settings`                                  | basic  | update `soundDurationSec`                                                 |

## 11. Seed Data

`data.json` is created on first start if missing, seeded with:

- Trucks: `ELF 1` (Staffel), `HLF 20` (Gruppe), `LF 10` (Trupp), `TLF 16`
  (Trupp), `DLK 23` (Staffel).
- Alerts (both `pending`):
  1. `Wohnungsbrand` — category `Wohnungsbrand`, address `Musterstraße 5`, info
     `Brandgeruch in Wohneinheit`, trucks `ELF 1` + `HLF 20`.
  2. `THL B3` — category `Technische Hilfeleistung`, address `B3, km 12`, info
     `Pannenfahrzeug auf Standspur`, trucks `HLF 20` + `TLF 16`.
- Settings: `soundDurationSec: 60`.

## 12. UI Language & Conventions

- UI text: German (labels, buttons, statuses: `ausstehend`, `aktiv`,
  `abgeschlossen`; toasts in German).
- Source code, identifiers, comments: English.

## 13. Scripts

- `npm run dev` — Vite dev server + Express (proxied) for development.
- `npm run build` — build the SPA, copy `Warnung.mp3` into `public/`.
- `npm start` — production: Express serving API + built SPA on `PORT`.
- `npm test` — vitest.

## 14. Testing

- Vitest unit tests for the pure status/timer transition logic:
  - trigger → active at `triggerAt`
  - active → complete after 10 minutes
  - only-one-active/pending enforcement
  - false-alert rejection while active/pending
  - pending trigger cancellation on alert deletion
- No browser-level tests.

## 15. Out of Scope

- Multiple users / roles beyond the single admin.
- Historical logging / statistics.
- Changeable credentials at runtime.
- Truck attributes beyond name and category.
