---
date: 2026-10-17
topic: firealarm-simulator
---

# Firealarm Simulator — Requirements

## Summary

A web app that simulates a fire station's alarm system: a public dashboard plus
an admin interface to manage trucks and planned alerts, arm delayed triggers,
and play the alarm sound — with strict one-alert-at-a-time semantics.

---

## Problem Frame

Fire drills need a believable, remote-triggerable alarm experience: an alert
armed minutes ahead, a dashboard that visibly "fires" (alert details +
highlighted trucks + loud alarm sound), and automatic reset after the alarm
window ends. Doing this by hand — announcing the drill, waiting, flipping
screens, stopping sound — is error-prone and not repeatable. A self-service
simulator with strict single-active-alarm semantics and restart-surviving timers
makes drills repeatable and unattended.

This document is the requirements baseline for planning; `docs/PRD.md` remains
the detailed technical specification (data model, routes, seed data, scripts)
and stays authoritative on implementation-level detail.

---

## Actors

- A1. Fire-station staff (viewer): watches the public dashboard, hears the
  alarm, optionally enables sound on their own device.
- A2. Admin: manages trucks and alerts, arms delayed triggers,
  fires/false-alarms, completes alerts, configures sound duration. Credentialed
  via HTTP Basic auth.

---

## Key Flows

- F1. Planned drill (delayed trigger)
  - **Trigger:** Admin presses Trigger on a pending/complete alert
  - **Actors:** A2
  - **Steps:** Admin selects a pending or complete alert to trigger, then
    selects a delay (3–15 min) and confirms. If another alert is active or has a
    pending trigger, the attempt is rejected with a toast (R10). Otherwise the
    row shows a live countdown and a Cancel action → when the delay elapses the
    alert fires (dashboard switches to alert view, sound starts) → after 10 min
    the alert auto-completes (or Admin completes it early)
  - **Outcome:** Dashboard returns to the idle display; the alert is complete
    and can be triggered again
  - **Covered by:** R9, R10, R11, R12, R13, R14
- F2. False alarm (drill)
  - **Trigger:** Admin triggers a false alert while no alert is active or
    pending
  - **Actors:** A2
  - **Steps:** Admin confirms → dashboard shows "Fehlalarm" with no trucks
    highlighted, sound plays → clears after 10 minutes
  - **Outcome:** No alert record is created; system returns to idle
  - **Covered by:** R15, R16
- F3. Watch the alarm (viewer device)
  - **Trigger:** Any alert fires on a device with the sound toggle enabled
  - **Actors:** A1
  - **Steps:** Device polls the public state → detects the active alert → shows
    alert view with highlighted trucks → plays the alarm sound for the
    configured duration
  - **Outcome:** Device returns to the idle dashboard display when the alert
    completes
  - **Covered by:** R17, R18, R19, R20

---

## Requirements

**App & platform**

- R1. The app works in desktop and mobile browsers with a responsive layout.
- R1a. The app is operable entirely via keyboard and announced for screen
  readers: admin controls are focusable in tab order, focus is managed across
  modal transitions (e.g., delay arm/cancel, trigger confirm), and the
  active/pending/ idle state and any truck-highlight changes are announced.
  Adequate contrast is maintained.
- R2. UI text is German; source code and identifiers are English.
- R3. State persists across restarts: an armed trigger fires and an active alert
  auto-completes even if the server restarted in between.

**Deployment & connectivity**

- D1. The simulator is deployed as a single shared instance; the one-alarm
  invariant is enforced org-wide (not per-station). This is a product decision;
  re-scoping to one instance per station would make the single-alarm rule local
  and require the dashboard to filter by station.
- D2. Admin credentials are generated per build from an environment or secret
  store and are never committed to source. Credentials cannot be recovered once
  exposed; a rotation policy applies.

**Access & authentication**

- R4. Admin features require HTTP Basic authentication with credentials sourced
  from the secret store (see D2); the dashboard and its state endpoint are
  public on the internal network and served over TLS. No authentication is
  required on the public path, which exposes only drill state; admin-only routes
  are behind HTTP Basic auth.

**Truck management**

- R5. Admin can create, modify, and delete trucks identified by name and seat
  count; the app seeds 5 trucks for layout.
- R6. A truck is an ephemeral drill asset: its existence is defined only for the
  drill in which it appears, never as a persistent record with its own
  lifecycle. Deleting a truck removes it from every alert's truck list,
  including an alert currently active, because the truck ceases to exist as a
  drill asset. Deletion requires no extra confirmation or warning; the dashboard
  reflects the remaining trucks and the active alert highlights only the trucks
  that still exist.

**Alert management**

- R7. Admin can create, modify, and delete planned alerts with name, category,
  address, info, optional notes, and a (possibly empty) selection of trucks;
  name, category, address, and info are required.
- R8. Alerts have status pending, active, or complete; a completed alert can be
  triggered again (repeat drill).
- R9. Triggering a pending or complete alert arms a delayed trigger of 3–15
  minutes; during the countdown the admin's row shows a live countdown in
  HH:MM:SS format in a prominent header on the arm view, plus a Cancel action.
- R9b. Canceling an armed delay shows a confirmation toast ("Trigger canceled")
  consistent with the R10 rejected-trigger toast.
- R9c. The admin manages trucks and alerts from the dashboard via a persistent
  admin surface (header/navigation), so truck management, alert creation,
  triggering, and completion are reachable whether or not an alert is currently
  active.
- R9d. When the admin's alert selection is empty, the arm view shows an explicit
  empty state ("No pending alerts — arm a new one?"), related to R19's idle
  dashboard rather than rendering nothing.
- R10. Only one alert may be active or have a pending trigger system-wide; a
  second trigger attempt is rejected with a toast.
- R11. When the delay elapses, the alert becomes active: the dashboard switches
  to the alert view and the alarm sound plays.
- R12. An active alert auto-completes 10 minutes after it fired.
- R13. Admin can complete an active alert manually at any time.
- R14. Deleting an alert with a pending trigger cancels that trigger
  automatically.

**False alarm**

- R15. Admin can trigger a one-shot false alarm shown as "Fehlalarm" with no
  trucks highlighted; it is not stored as an alert record and clears after 10
  minutes like a normal active alert. The false-alarm screen reuses the active
  alert header (name, category, address, info) but shows only the "Fehlalarm"
  banner over an empty truck grid, since a false alarm has no trucks and no
  stored record.
- R16. A false alarm is rejected with a toast while an alert is active or
  pending.
- R16a. Because a firing false alarm occupies the one-alarm slot (R15) until it
  clears, the "no alert active or pending" condition in R16 includes the
  active/false-alarm display window, not just persisted alert records.

**Alarm sound**

- R17. The alarm clip loops until the configured duration elapses (default 60
  s), which the admin can change in the settings UI.
- R17a. Timers are real: an armed trigger fires and an active alert
  auto-completes on their configured deadlines even after a server restart,
  without admin intervention. This requires a persistence layer that stores the
  relevant timing data (not a purely in-process timer), so deadlines survive
  restart.
- R18. The sound plays in the admin's browser at trigger time; on dashboard
  devices it plays only where the per-device "Ton" toggle (persisted, default
  off) is enabled. The toggle renders as a persistent control in the top-right
  of the dashboard and remains reachable after any alert clears.

**Dashboard**

- R19. With no active alert, the dashboard shows "Einsatzmonitor" as large text
  above a grid of all truck cards, none highlighted.
- R20. With an active alert (or false alarm), the dashboard shows the alert's
  name, category, address, and info above the truck grid, with only the trucks
  used in the alert highlighted.

---

## Acceptance Examples

- AE1. **Covers R10, R16.** Given alert A is armed with a 5-minute trigger, when
  the admin triggers alert B or a false alarm, the attempt is rejected with a
  toast and alert B/false alarm stays un-armed.
- AE2. **Covers R9.** Given a pending alert, when the admin arms a trigger with
  3-minute delay, the row shows a live countdown, and pressing Cancel before it
  elapses returns the alert to pending with no trigger.
- AE3. **Covers R11, R17.** Given an armed trigger whose delay has elapsed, when
  the alert fires, the dashboard switches to the alert view and the alarm sound
  plays continuously for the configured duration, then stops.
- AE4. **Covers R12.** Given an alert active for 10 minutes, when no one
  intervenes, it is complete and the dashboard returns to the idle display.
- AE5. **Covers R6.** Given an active alert showing trucks ELF 1 + HLF 20, when
  the admin deletes HLF 20, the dashboard continues to show the alert with only
  ELF 1 highlighted.
- AE6. **Covers R18.** Given a dashboard device with the "Ton" toggle off, when
  an alert fires, the device shows the alert view but no sound plays; with the
  toggle on, the clip plays for the configured duration.
- AE7. **Covers R3.** Given a trigger armed 4 minutes before restart, when the
  server restarts, the alert still fires ~1 minute later; an active alert
  restarts with its remaining 10-minute window preserved.

---

## Success Criteria

- A full drill runs unattended: delay armed → countdown runs → alert fires with
  dashboard switch and sound → auto-completes in 10 minutes → repeatable for a
  second drill.
- Timers survive server restart without admin intervention (AE7).
- The single-alarm invariant holds under every path: planned trigger, false
  alarm, and repeat drills never overlap an alert that is active or armed.
- `ce-plan` finds every product behavior, scope boundary, and success criterion
  already defined — it only needs to make implementation decisions.

---

## Scope Boundaries

- Multiple users or roles beyond the single admin.
- Historical logging or statistics of alerts.
- Changing credentials at runtime (env-var configuration only).
- Truck attributes beyond name and seat count.
- Truck deletion does not confirm or warn when removing trucks from active
  alerts (R6).

---

## Key Decisions

- Pending triggers count as blocking for the one-alarm rule — two armed drills
  would collide, so "active or pending" gates both further triggers and false
  alarms. The one-alarm invariant is a deliberate product choice to keep drills
  simple and unambiguous, not an emergent property; a second concurrent drill is
  not a supported workflow and is surfaced as a reject, not queued.
- The dashboard sound toggle defaults off and is per-device — browsers block
  autoplay without a gesture, and every watching device should not blast the
  alarm by default.
- False alarms are not persisted — they are a drill tool, not managed records,
  avoiding cleanup and status handling.
- Truck deletion silently updates alert truck lists, including active ones — the
  dashboard simply reflects the remaining trucks; a warning would add friction
  with no real safety benefit.
- `docs/PRD.md` remains the detailed technical spec alongside this requirements
  baseline.
