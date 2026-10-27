# Code Review Findings — Firealarm Simulator (whole codebase)

**Review run:** `20261024-204324-466f489b` · Branch `dino/security` @ `9e73117`
**Mode:** interactive · **Verdict:** Ready with fixes **Reviewers:** 12
(correctness, security, adversarial, testing, maintainability,
project-standards, api-contract, reliability, kieran-typescript,
julik-frontend-races, agent-native, learnings-researcher)

Scope: merge-base → working tree, 84 files ~18.4k lines. ~30 raw findings; 5
false positives dropped; 2 stale-test fixes (already applied in working tree,
230 tests pass).

---

## Fix order

1. P1 #1: wrap `startServer` `load()` in try/catch (guards corrupt-`data.json`
   boot DoS).
2. P1 #6: wrap tick `setInterval` in try/catch.
3. P1 #7: add graceful shutdown (SIGTERM clears timer + final flush).
4. P1 #4: set `role="status" aria-live="polite"` on toasts.
5. P1 #18/#19: already fixed in working tree — re-verify.
6. P2 #12: extract single `slotOccupied()` predicate shared by engine + storage.
7. P2 #13: hoist 60s sound default into one constant in 4 places.
8. P2 #8: `express.json({ limit: '256kb' })` → clean 413.

---

## P1 — Critical

| # | File:line                                            | Issue                                                                                                                                                                              | Reviewers    | Conf | Route                            | Fix                                                                                                                          |
| - | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 | `src/server/index.ts:114`                            | Corrupt `data.json` (non-array `alerts`) → `TypeError: data.alerts is not iterable`; `startServer` has no try/catch → persistent boot DoS until repaired by hand                   | adversarial  | 100  | safe_auto → review-fixer         | try/catch around `load()` in `startServer()`; log error, don't abort permanently                                             |
| 2 | `src/server/engine.ts:189`                           | Silent durability loss: `schedulePersist` fire-and-forget; failed disk write (EACCES/EAGAIN/ENOSPC) → in-memory state diverges from durable; last mutation(s) lost on next restart | reliability  | 75   | gated_auto → downstream-resolver | surface persist failures to operator (log prominently / expose); retry only transient (EAGAIN/ENOSPC); treat EACCES as fatal |
| 3 | `src/client/components/admin/RosterDialog.tsx:464`   | Roster assignment is DnD-only (pointer/touch sensors, no keyboard/ARIA) — the most interactive feature is unreachable without a mouse/pointer                                      | agent-native | 75   | gated_auto → human               | add keyboard activation path (Enter/Space + Tab) + `role="grid"`/`aria-label` on chips; document scope                       |
| 4 | `src/client/components/common/ToastContainer.tsx:70` | Toasts render MUI `<Snackbar>` → default `role="alert"` (assertive) interrupts SR on every action; Dashboard.tsx:53 uses polite — pattern exists but not reused here               | agent-native | 75   | safe_auto → review-fixer         | add `contentProps={{ role: 'status', 'aria-live': 'polite' }}` to `<Snackbar>`                                               |
| 5 | `src/client/components/common/LocationPanel.tsx:50`  | Alert position reachable only via non-interactive Google Maps `output=embed` iframe — no SR-accessible, keyboard-navigable location view                                           | agent-native | 75   | gated_auto → human               | surface numeric coords as accessible text (role="listitem"/"status"); keep embed for humans                                  |

## P2 — Moderate

| #  | File:line                         | Issue                                                                                                                                                                                 | Reviewers         | Conf | Route                            | Fix                                                                                                                    |
| -- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 6  | `src/server/index.ts:124`         | `setInterval` tick has no try/catch; a malformed persisted alert makes a tick throw and crash the process                                                                             | reliability       | 75   | safe_auto → review-fixer         | wrap `engine.tick()` in try/catch + log                                                                                |
| 7  | `src/server/index.ts:124`         | No graceful shutdown: tick timer never cleared, no SIGINT/SIGTERM handler → hangs under Docker/PM2                                                                                    | reliability       | 75   | manual → release                 | add `SIGINT/SIGTERM` handler resolving `server.close()`, clearing the timer, awaiting final flush                      |
| 8  | `src/server/index.ts:49`          | `express.json()` default 100kb → oversized body returns 500, not 413                                                                                                                  | reliability       | 75   | safe_auto → review-fixer         | `express.json({ limit: '256kb' })`                                                                                     |
| 9  | `src/client/api/client.ts:126`    | Server returns `{ error, code }`; `error.code` (409/404 reason) never surfaced/consumed client-side                                                                                   | api-contract      | 75   | gated_auto → review-fixer        | surface `data.code` onto ApiError (e.g. `this.code`) + document in types                                               |
| 10 | `src/server/routes/rosters.ts:38` | DELETE returns 200 `{success:true}` (trucks/alerts) but 204 empty (rosters); no single convention                                                                                     | api-contract      | 75   | advisory → human                 | pick one (always 200 with `{success:true}`) and align all four delete routes + client return types                     |
| 11 | `src/server/engine.ts:206`        | Single-slot-invariant predicate duplicated & subtly different across engine + storage (PRD §1 core rule); a new slot consumer can violate it by reusing the wrong predicate           | maintainability   | 75   | gated_auto → review-fixer        | export `slotOccupied(a) => a.status==='active'                                                                         |
| 12 | `src/shared/constants.ts:96`      | 60s sound default hardcoded in 4 places (seedSettings, AdminLayout, Dashboard, SettingsCard text) — drifts from the canonical seed                                                    | maintainability   | 75   | gated_auto → downstream-resolver | add `defaultSoundDurationSec` to constants, reference it in all 4                                                      |
| 13 | `src/server/storage.ts:124`       | storage `load()` prunes orphaned roster roles with its own copy of the category logic (`CREW_SLOTS`); layering inversion (business rule in persistence layer)                         | maintainability   | 75   | manual → human                   | pass `validRoles` into the prune step, or move normalization into the engine                                           |
| 14 | `src/server/engine.ts:453`        | `truckIds.filter(id => typeof id === 'string')` duplicated in createAlert + updateAlert                                                                                               | maintainability   | 75   | safe_auto → review-fixer         | extract `normalizeIdArray(v)` and call from both                                                                       |
| 15 | `src/server/engine.ts:697`        | `randomAssign` is the most complex method (greedy loop, excluded roles, free-slot bookkeeping) but only trivially covered — a regression (infinite loop / double-assign) is invisible | kieran-typescript | 85   | manual → review-fixer            | add tests: all slots filled, no person twice, excluded stay unassigned + loop terminates, deterministic with fixed rng |

## P3 — Low

| #  | File:line                                           | Issue                                                                              | Reviewers            | Conf | Route            | Fix                                                                          |
| -- | --------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- | ---- | ---------------- | ---------------------------------------------------------------------------- |
| 16 | `src/client/components/admin/CountdownBadge.tsx:28` | Countdown ticks off local `Date.now()`; shows stale minutes until the next 2s poll | julik-frontend-races | 75   | advisory → human | display skew only, self-healing; optional: source countdown from server poll |

---

## False positives dropped (verified against code)

- `updateTruck` unconditional overwrite (`src/server/engine.ts:374`) — has
  `input.category !== undefined` guard; masked because TruckManager always sends
  both fields.
- `updateAlert` category overwrite — has `input.category !== undefined` guard.
- kieran-typescript "randomAssign untested" — it IS covered
  (seeded-deterministic, excluded-role loop ×10 runs, NotFound).
- project-standards stale-test assertions
  (`tests/client/rosterManager.test.tsx:48`,
  `tests/client/locationPanel.test.tsx`) — already corrected in the working tree
  (230/230 pass).

## Already fixed in working tree (re-verify before merge)

- `Mannschaftsbesatzung` → `Fahrzeug-Besatzungen` in both component and test.
- Removed `Zoom: stark`/`Einsatzort` legend test in locationPanel.test.tsx.
- Fixed `Fahreug` → `Fahrzeug` typo in RosterManager.tsx title.

---

## Testing gaps (real)

- `tests/unit/storage.test.ts`: load() integrity sweep untested —
  corrupt/person-conflicting/inconsistent `data.json` (duplicate person names,
  orphaned `triggerAt` on non-pending, deleted-truck roster entries, invalid
  top-level structure). Add load()-fuzz tests using temp dir per test.
- `tests/unit/engine.test.ts`: `validateLocation` bounds never reach the engine
  — out-of-range/NaN lat, lng, zoom=13/18 pass create/update with a 400-free
  save. Add negative-path tests.
- No test asserts `schedulePersist` rejects without crashing the tick/request
  (inject a throwing persist fn).
- No test firing two rapid `armTrigger`/`triggerFalseAlert` requests to
  empirically demonstrate the single-active invariant under interleaving.
- No a11y test (axe / keyboard-only E2E) for RosterDialog, ToastContainer,
  LocationPanel.

## Docs drift (advisory, P2)

- `docs/PRD.md`: §10 API table + architecture §2 omit /api/persons,
  /api/rosters, random-assign, map/location fields. §14 "No browser-level tests"
  contradicted by 17 jsdom client tests. §2 Data Model omits
  Person/Roster/activeRosterId/Alert.lat/lng/zoom.
- `docs/architecture.md`: same omissions (Routes list, er-diagram). Do NOT
  delete docs — update them.

## Clean (verified)

- Basic auth: `crypto.timingSafeEqual` + equal-length pre-check; 401 +
  `WWW-Authenticate: Basic` realm; malformed → 401.
- All 7 admin routes mounted with `authMiddleware`; only `GET /api/state`
  public.
- `config.ts` credentials imported only from server/test paths (never
  client/shared) — Vite bundles only `src/client`+`public`.
- SPA fallback `/api/*` never answered with HTML; static `../` path traversal
  rejected.
- Coalesced atomic save: last snapshot wins;
  `saveChain = step.catch(()=>undefined)` prevents unbounded growth;
  `express.json()` parse-corruption surfaces a clean startup error.

## Residual risk

- `upgrade-insecure-requests` CSP directive must be re-evaluated if the app
  moves to HTTPS/containerized deployment (currently disabled on purpose for LAN
  HTTP).


# Implementation status

> Sections above are the original review (historical). Current state is below.

Validation: `npm run build` clean (client + server typecheck), `npm test`
24 files / 279 tests pass, `npm run test:coverage` passes
(92.9 % stmts / 87.7 % branches / 84.1 % funcs).

## Per-finding status

| #  | Status | Evidence |
| -- | ------ | -------- |
| 1  | ✅ Done | `startServer` try/catch → backup `.corrupt-<ts>` + reseed. Tests: `tests/integration/server.test.ts` (unparsable + non-array `alerts`). |
| 2  | ✅ Done | `persistWithRetry` (EAGAIN/ENOSPC bounded retry, others logged, `lastPersistFailure`). Tests in `engine.test.ts` (rejecting/throwing persist, retry, give-up, tick survives). EACCES is logged loudly, not process-fatal (deliberate: keeps drill running in-memory). |
| 3  | ✅ Done | `RosterDialog.tsx`: dnd-kit `KeyboardSensor` added; slots/pool are labelled `role="group"`; draggables carry `aria-label` + dnd-kit `tabIndex`/`role=button`. Broken custom handler removed. Test: `rosterDialog.test.tsx` keyboard suite. |
| 4  | ✅ Done | `role="status" aria-live="polite"` on toast `Alert`. Test: `toastContainer.test.tsx`. |
| 5  | ✅ Done | Visually-hidden `role="status"` coordinate text. Tests in `locationPanel.test.tsx`. |
| 6  | ✅ Done | Initial + interval tick wrapped in try/catch. |
| 7  | ✅ Done | `attachShutdownHandlers` (SIGINT/SIGTERM). Test: graceful shutdown in `server.test.ts`. |
| 8  | ✅ Done | `express.json({limit:'256kb'})` + 4xx status passthrough. Tests: 413 and malformed-JSON 400 in `server.test.ts`. |
| 9  | ✅ Done | `ApiError.code`; `errorMessage()` now used in all managers incl. `AlertManager`. |
| 10 | ✅ Done | Rosters DELETE → `200 {success:true}`. `DELETE /false-alert` intentionally returns engine result. |
| 11 | ✅ Done | `slotOccupied`/`isArmed` in shared constants; engine, storage and `AlertManager` use them (client duplicates removed). |
| 12 | ✅ Done | `DEFAULT_SOUND_DURATION_SEC` used everywhere. |
| 13 | ✅ Done | Roster pruning moved from `storage.load()` to `StateEngine.pruneRosters()` (constructor). `storage.ts` no longer imports `CREW_SLOTS`. Tests: engine normalization + storage "no business pruning". |
| 14 | ✅ Done | `normalizeIdArray`. |
| 15 | ✅ Done | Added `randomAssign` invariants: no person twice + termination (5 seeds), slots-full with surplus persons, all-roles-excluded person unassigned, determinism with fixed seed. |
| 16 | ⏸ Deferred | Advisory/P3: display skew only, self-healing on 2 s poll. No change. |

## Testing gaps — closed

- `storage.load()` integrity sweep: invalid top-level (5 variants), duplicate persons, pre-roster defaults, orphaned `triggerAt`, non-array `alerts`.
- `validateLocation`: lat/lng/zoom bounds, boundary zooms 14/17, NaN/non-number coordinates, `updateAlert` leaves state unchanged.
- Persist rejection / sync throw / tick survival / retry.
- Single-slot invariant under interleaved arm + false-alarm calls.
- a11y (jsdom): RosterDialog keyboard move + ARIA names, toast role, LocationPanel SR text. Not covered: axe-core audit, real-browser keyboard E2E.

## Docs drift — fixed

`docs/PRD.md` (data model, API table, §14 testing) and `docs/architecture.md`
(storage/bootstrap/engine/routes/admin components, ER diagram) now cover
persons, rosters, random-assign, location fields, resilience and a11y.

## Behaviour notes / residual

- Roster pruning now happens on engine construction, so a stale `data.json`
  is normalized in memory and persisted on the next mutation (not rewritten at
  load time).
- Keyboard assignment relies on dnd-kit `KeyboardSensor` (Space/Enter lift,
  arrows move, Esc cancel); arrow step is the library default (25 px), which
  may be coarse on dense layouts.
- `CountdownBadge` (#16) still uses local `Date.now()`.
- CSP `upgrade-insecure-requests` residual risk unchanged (see above).
