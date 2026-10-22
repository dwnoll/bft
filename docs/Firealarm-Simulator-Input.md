# Firealarm Simulator

Create a web-application which simulates the alarm system of a fire station.

The application should satisfy the following requirements:

- SPA based on Node.js
- GUI built with MUI
- Data storage using a JSON file
- Access via web-browser on computer and mobile devices
- Admin authentication via configurable username/bassword (default:
  'ffw_bft'/'bft_2026' ), using Basic authentication
- Dashboard view (no authentication required) with current alarm (if any) and
  list of all fire trucks with indication which ones are to be used in the alarm
- When no alert is active, the dashboard shows an info of "Einsatzmonitor" as
  large text (top half of the screen) and a card reprentation of all available
  fire tracks (in a grid view in the lower half of the screen) - not highlighted
- When an alert is active, the dashboard shows the category, address, and info
  instead of "Einsatzmonitor" in the upper half of the screen, and changes to
  cards of the fire trucks used in the alert to use a highlighting background
  color.
- Admin page (requires authentication) to allow creation/modification/deletion
  of available fire trucks (assume 5 for layout/design) with attributes:
  - Name
  - Category (Gruppe / Staffel / Trupp)
- Admin page to create/modify/delete planned alerts with:
  - Name
  - Category
  - Address
  - Info
  - Notes
  - List/selection of fire tracks used
  - Status ('pending', 'active', 'complete')
- For an alert, an Admin should be able to trigger the alert by pressing a
  button on the alert in the alert admin page with a selectable delay between
  3-15 minutes)
- When an alert is triggered, the alert becomes 'active' data (category,
  address, info) is shown on the dashboard, and the fire trucks to be used are
  highlighted (while those not used are not)
- When an alert is triggered, and alert sound is played for a configurable time
  (default: 60 seconds)
- When an alert is active, it is automatically reset to status 'complete' after
  10 minutes.
- When an alert is active, an Admin can reset to status 'complete' by pressing a
  button on the alert in the alert admin page
- As an Admin, a false alert can be triggered at any time to be shown on the
  dashboard
- Only one alert can be active at any point in time.
