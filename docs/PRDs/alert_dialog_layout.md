# AlertFormDialog Layout Overhaul — PRD

Scope: presentation-layer changes to the admin "Neuen Alarm anlegen / Alarm
bearbeiten" dialog only. No changes to state, validation, API, or domain rules.
Supplements `docs/PRD.md` (which remains authoritative for behaviour).

## 1. Background

The dialog is currently `maxWidth="md"` (768px) with a single column of 8 field
groups followed by the `LocationPanel` placeholder. The panel is the designated
seam for the real map (a later iteration), and the dialog's default MUI sizing
(16px labels, 20px title, 20px field gaps) is looser than needed for a dense
form. Goal: wider canvas, compact type, and a permanent two-column arrangement
so the form (left) and map area (right) sit side by side on desktop.

## 2. Width

- `maxWidth="md"` (768px) → `maxWidth="lg"` (960px).
- `fullWidth` retained — the dialog still spans the full screen on mobile.

## 3. Smaller Fonts (dialog-local)

- All `TextField` and `Select` fields use `size="small"`: labels 12px, input
  text 14px, helper text 12px, compact field height.
- `DialogTitle` reduced from 20px (h6) to 18px.
- `DialogActions` buttons use `size="small"`.
- Left-column field spacing tightened from gap 2.5 (20px) to gap 2 (16px).
- `LocationPanel` text unchanged (already body2/caption).
- The global theme (`src/client/theme.ts`) is NOT modified. The Dashboard keeps
  its deliberately large, distance-readable typography.

## 4. Two-Column Layout (responsive)

- At `md` (≥900px) and up: 50/50 split.
  - Left half: all attribute entries, order unchanged: Name → Stichwort →
    Adresse → Zusatzinfo → Notizen → Fahrzeuge → Koordinaten → Zoom. The geo
    pair (Koordinaten, Zoom) stays at the bottom of the left column, adjacent to
    the map area.
  - Right half: `LocationPanel`.
- Below `md`: single column — all fields on top, `LocationPanel` below (existing
  flow, unchanged on phones/tablets).
- Columns separated by a 24px gap; no vertical divider.

## 5. LocationPanel in the Right Half

- Stretches to fill the full height of the right column (the form column defines
  the height).
- Panel content (title, coordinates, "Karte wird später eingefügt") is
  vertically centered within the stretched area.
- Implemented as new opt-in props on `LocationPanel` (e.g. `stretch`,
  `centered`), defaulting to off. The Dashboard banner
  (`src/client/components/dashboard/Dashboard.tsx`) renders the panel with
  natural height and must be unaffected.

## 6. Tests

- The 7 existing assertions in `tests/client/alertFormDialog.test.tsx` must stay
  green. All matched strings (labels, helper texts, error messages, "sehr
  stark", "… — Zoom-Level …") are preserved verbatim; `getByLabelText` selectors
  are unaffected by the layout change.
- No new layout-specific assertions are added (brittle under jsdom).

## 7. Explicitly Out of Scope

- `geoLocked` behaviour (position/zoom locked while an alert is active).
- `autoFocus` on Name, all state and validation logic.
- German UI text (identifiers/comments remain English per convention).
- `TriggerDialog`, `ConfirmDialog`, `SettingsCard`, Dashboard, and the global
  theme.
- Embedding the real map (future iteration; this PR only repositions the seam).

## 8. Acceptance Criteria

1. Dialog renders at 960px max width on desktop; fields use the compact
   (`size="small"`) scale; title 18px; buttons compact.
2. At ≥900px viewport: form fields occupy the left half, LocationPanel the right
   half, panel stretched to full column height with centered content.
3. Below 900px viewport: single column, form above the panel.
4. Dashboard renders exactly as before (LocationPanel natural height, unchanged
   typography).
5. `npm test` green, including all 7 existing dialog assertions.
