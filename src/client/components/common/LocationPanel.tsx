import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface LocationPanelProps {
  /** Alert address. Empty (or whitespace-only) shows the "please enter" hint. */
  address: string
  /** Map position (decimal degrees). Both must be non-null to be used in the map query. */
  lat?: number | null
  lng?: number | null
  /** Map zoom level (14-17). Falls back to 17 in the map URL when absent. */
  zoom?: number
  /** Fill the parent's height (parent must be a flex container). Off by default. */
  stretch?: boolean
  /** Vertically center the panel content (meant to be combined with `stretch`). Off by default. */
  centered?: boolean
}

/** Fallback zoom level for the embedded map when the alert has no explicit zoom. */
const DEFAULT_MAP_ZOOM = 17
/** Fixed map/hint area height so both branches render at the same size. */
const MAP_AREA_HEIGHT = 320

/**
 * Location panel for an alert: embeds a Google map derived from the position
 * (when both lat and lng are present) or from the URL-encoded address.
 * When the address is empty, a hint prompts the user to enter an address
 * (and optionally coordinates).
 */
export function LocationPanel({ address, lat, lng, zoom, stretch = false, centered = false }: LocationPanelProps) {
  const hasAddress = address.trim().length > 0
  const hasPosition = lat != null && lng != null
  const mapZoom = zoom ?? DEFAULT_MAP_ZOOM
  const query = hasPosition ? `${lat},${lng}` : encodeURIComponent(address.trim())

  return (
    <Box
      component="fieldset"
      sx={{
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.default',
        p: 0.5,
        ...(stretch ? { display: 'flex', flexDirection: 'column', flex: 1 } : undefined),
        ...(centered ? { justifyContent: 'center' } : undefined),
      }}
    >
      {hasAddress ? (
        <Box sx={{ height: MAP_AREA_HEIGHT }}>
          <iframe
            title={`Karte: ${address.trim()}`}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            src={`https://maps.google.com/maps?q=${query}&z=${mapZoom}&output=embed`}
          />
        </Box>
      ) : (
        <Box
          sx={{
            height: MAP_AREA_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="body1" align="center">
            Bitte Addresse und optional Koordinaten eintragen
          </Typography>
        </Box>
      )}
    </Box>
  )
}
