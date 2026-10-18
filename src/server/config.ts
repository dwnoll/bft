/**
 * Server-only configuration constants.
 *
 * This file must NOT be imported from any client (src/client/) path.
 * Vite bundles everything under src/client/ and src/shared/ into the browser
 * bundle — credentials in those directories become readable in DevTools.
 */

// --- Authentication defaults (R4, D2) ---
// Override via BFT_USER / BFT_PASS environment variables in production.
export const DEFAULT_ADMIN_USER = 'ffw_bft'
export const DEFAULT_ADMIN_PASS = 'bft_2026'
export const ADMIN_AUTH_REALM = 'Firealarm Simulator Admin'
