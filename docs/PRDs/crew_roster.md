# Crew Roster (Besatzung) — PRD

Scope: new feature adding named crew rosters — assignment of persons to role
slots across all trucks — with a third admin tab, drag-and-drop editing,
server-side random assignment, and slot display on the dashboard. Supplements
`docs/PRD.md` (which remains authoritative for existing behaviour) and is
derived from `docs/crew-assignment-goal.md`.

## 1. Data Model

```ts
Person {
  name: string             // identity key — unique in data.json, no separate id
  excludedRoles: string[]  // roles the person may not hold; default []
}

Roster {
  id: string               // ULID, server-generated
  name: string             // no uniqueness requirement
  assignments: {           // per truck, per slot; slot lists are NOT stored
    [truckId: string]: {
      [role: string]: string | null   // person name, null = empty slot
    }
  }
}
```

`DataFile` gains:

```ts
persons: Person[]
rosters: Roster[]
activeRosterId: string | null   // single-active invariant is structural
```

Slot lists are derived from the truck's current category via a new shared
constant (order = display order):

```ts
CREW_SLOTS: Record<TruckCategory, string[]> = {
  Gruppe: ["GF", "MA", "ME", "AF", "AM", "WF", "WM", "SF", "SM"],
  Staffel: ["SF", "MA", "AF", "AM", "WF", "WM"],
  Trupp: ["MA", "MF", "TM"],
};
```

## 2. Invariants & Validation (server-authoritative)

- At most one active roster at a time — guaranteed by `activeRosterId`.
- Within a roster, a person occupies **at most one slot** → violation: 400.
- A person may not be assigned to an excluded role → 400.
- Assignments reference only existing trucks, slots, and persons:
  - unknown `truckId` entries are **pruned** from input,
  - unknown role or unknown person name → 400.
- Deleting a truck removes its `assignments` entry from **all** rosters.
- Changing a truck's category removes slot entries for roles no longer in that
  category's slot list (same silent-stripping pattern as alerts' `truckIds`).
- Deleting the active roster sets `activeRosterId = null`.
- `PATCH assignments` is a **full replacement** of the roster's assignments.
- Unknown role names inside `excludedRoles` are tolerated (ignored).

## 3. Random Assignment

`POST /api/rosters/:id/random-assign` — engine-side, best-effort:

1. Clear all slots of the roster.
2. Repeat until no further assignment is possible:
   - pick a random unassigned truck that still has a free slot,
   - pick a random unassigned person who has at least one free non-excluded role
     on that truck,
   - assign them to a random free non-excluded role on that truck.
3. Persist and return `{ roster, assigned, unassigned }`.

The engine gains an injectable `rng: () => number` (default `Math.random`)
alongside the existing injected `now` clock, so tests can drive deterministic
sequences.

## 4. Admin UI

### 4.1 RosterManager (third tab "Besatzung")

- Table of rosters: Bezeichnung, filled-slot count, "aktiv" chip when active.
- Actions per row: **Aktivieren** (inactive rosters), **Deaktivieren** (active
  roster only), **Bearbeiten**, **Löschen** (with confirm).
- **Neue Besatzung** button opens the create dialog.

### 4.2 RosterDialog (create + edit, one dialog)

- Name field (**Bezeichnung**).
- Per-truck slot grid rendered from `CREW_SLOTS` for the truck's category; each
  slot shows the assigned person name (or placeholder).
- **"Nicht zugewiesen"** pool of unassigned persons below/beside the grid.
- Drag-and-drop via **@dnd-kit/core** (touch support for mobile; add
  `@dnd-kit/core` + `@dnd-kit/utilities` to dependencies), scoped to this
  dialog:
  - pool → slot: assign (blocked client-side for excluded roles; server is
    authoritative),
  - slot → slot (including cross-truck): swap if target occupied, move if empty,
  - slot → pool: unassign.
- **"Zufällig belegen"** button in both modes; in edit mode a confirm dialog
  warns that all existing assignments are replaced.
- Edits are held in local dialog state; **Speichern** sends one `POST`/`PATCH`
  (or random-assign first, then save is not required since random-assign
  persists immediately), **Abbrechen** discards.

## 5. Dashboard

`TruckCard` always renders the full slot list for its category as
`<role>: <name>` rows; `<name>` is `-` when the slot is empty. With no active
roster all rows show `-`. Data comes from the public `activeRoster` state.

## 6. API

All admin routes behind HTTP Basic auth (existing middleware):

| Method & path                         | Request                   | Response                                                |
| ------------------------------------- | ------------------------- | ------------------------------------------------------- |
| `GET /api/persons`                    | —                         | `Person[]`                                              |
| `GET /api/rosters`                    | —                         | `{ rosters: Roster[], activeRosterId: string \| null }` |
| `POST /api/rosters`                   | `{ name, assignments? }`  | `201` + roster (or shape above)                         |
| `PATCH /api/rosters/:id`              | `{ name?, assignments? }` | updated roster; 404 unknown id                          |
| `DELETE /api/rosters/:id`             | —                         | `204`; clears `activeRosterId` if it was the active one |
| `POST /api/rosters/:id/activate`      | —                         | `{ rosters, activeRosterId }`                           |
| `POST /api/rosters/deactivate`        | —                         | `{ rosters, activeRosterId }` (null)                    |
| `POST /api/rosters/:id/random-assign` | —                         | `{ roster, assigned, unassigned }`                      |

Error mapping via existing `EngineError`: 404 not found, 400 validation
(one-slot-per-person, excluded role, unknown person), 409 invariant.

## 7. Public State

`GET /api/state` (public) gains:

```ts
activeRoster: { name: string, assignments: Roster['assignments'] } | null
```

## 8. Seed Data & Migration

- `defaultDataFile()` seeds **20 fixed persons** (name, `excludedRoles: []`):
  Berger Anna, Brunner Lukas, Gruber Stefan, Hofer Petra, Kramreiter Jonas,
  Leitner Sandra, Maier Thomas, Mooslechner Eva, Oberleitner Felix, Pichler
  Regina, Rabl Markus, Schuster Ingrid, Steiner Wolfgang, Unterberger Katja,
  Watzke Roland, Zeilinger Miriam, Aigner Paul, Bachmeier Sonja, Fessler
  Dietmar, Gstrein Verena. `rosters: []`, `activeRosterId: null`.
- `storage.load()` tolerates missing `persons`/`rosters`/`activeRosterId` keys
  (existing `data.json` files keep working).
- Duplicate person names → **load error**, server refuses to start (name is the
  identity key).
- Orphan slot values (person name not present in `persons`) are pruned to `null`
  at load — same sweep pattern as the existing `triggerAt` cleanup.
- Persons are read-only at runtime: no create/update/delete endpoints. Roster
  slot values are person-name strings; renames in `data.json` do NOT retarget
  slots (they become orphans and are pruned on next load).

## 9. Operational Notes

The server holds `data.json` in memory and overwrites it on every save, so
manual file edits are only valid while the server is **stopped**: stop → edit →
start. Document in `docs/usage.md` and `docs/development.md`.

## 10. UI Copy (German)

- Tab: **Besatzung**; card title: **Mannschaftsbesatzung**; card subtext:
  "Besatzungen anlegen, zuweisen und aktivieren".
- Buttons: **Neue Besatzung**, **Bearbeiten**, **Löschen**, **Aktivieren**,
  **Deaktivieren**; chip: **aktiv**.
- Dialog titles: **Neue Besatzung anlegen** / **Besatzung bearbeiten**; name
  field: **Bezeichnung**; random: **Zufällig belegen**; overwrite confirm:
  "Bestehende Zuweisungen werden ersetzt. Fortsetzen?"; pool: **Nicht
  zugewiesen**; actions: **Speichern** / **Abbrechen**.
- Card rows: `GF: Berger Anna` / `GF: -`.
- Toasts: Besatzung "X" angelegt · aktualisiert · gelöscht · aktiviert ·
  Besatzung deaktiviert · Zufällig belegt: N von M Personen · N Personen nicht
  zuweisbar: …
- Server error texts: "Bezeichnung ist erforderlich", "Person ist für diese
  Rolle ausgeschlossen", "Person ist bereits in einem anderen Slot zugewiesen".

Code identifiers stay English (`RosterManager`, `RosterDialog`, `/api/rosters`,
`activeRosterId`).

## 11. Testing

- `tests/unit/engine.test.ts`: roster CRUD, single-active invariant,
  one-slot-per-person, exclusion violations, truck-delete / category prunes,
  random-assign determinism via seeded `rng`.
- `tests/integration/api.test.ts`: all new routes (persons, rosters,
  activate/deactivate, random-assign), error statuses, public `activeRoster` in
  `GET /api/state`, load-error on duplicate person names.
- `tests/client/`: RosterManager, RosterDialog (DnD flows, random-assign
  confirm, save/cancel), TruckCard slot rendering.
- Coverage gate ≥ 80% (branch/line/function/statement) continues to apply.

## 12. Out of Scope

- Person CRUD via GUI (manual `data.json` maintenance only).
- Scheduling/timed rosters, multiple simultaneously active rosters.
- Roles beyond the slot lists in §1; a person holding more than one slot.
