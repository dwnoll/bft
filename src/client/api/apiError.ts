import { ApiError } from './client'

/** Human-readable labels for the server-side domain error codes (409/404/400).
 *
 * The server attaches a `code` to 4xx responses (see ApiError). Surfacing a
 * short label lets the UI show an actionable hint (e.g. "Alarm aktiv oder
 * ausstehend") instead of a bare message.
 */
export const API_ERROR_LABELS: Record<string, string> = {
  ALARM_ACTIVE_OR_PENDING: 'Ein Alarm ist bereits aktiv oder ausstehend',
  ALERT_NOT_ACTIVE: 'Der Alarm ist nicht aktiv',
  ALERT_NOT_ARMED: 'Der Alarm ist nicht ausgelöst',
  FALSE_ALARM_NOT_ACTIVE: 'Es ist kein Fehlalarm aktiv',
}

/**
 * Resolve a human-facing display string for an API error. For an `ApiError` the
 * optional domain `code` wins when we have a label for it; otherwise the
 * server error message is used. For non-API errors (e.g. runtime failures) the
 * generic fallback is returned.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const label = API_ERROR_LABELS[err.code ?? '']
    if (label) return label
    return err.message
  }
  if (err instanceof Error) return err.message
  return fallback
}
