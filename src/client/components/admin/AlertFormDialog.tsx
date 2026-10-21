import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import OutlinedInput from '@mui/material/OutlinedInput'
import Select, { type SelectChangeEvent } from '@mui/material/Select'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
//import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomLabel,
} from '../../../shared/constants'
import type { Alert, Truck } from '../../../shared/types'
import { LocationPanel } from '../common/LocationPanel'
import type { CreateAlertInput } from '../../api/client'

export interface AlertFormDialogProps {
  open: boolean
  initialData?: Alert | null
  availableTrucks: Truck[]
  onClose: () => void
  onSubmit: (input: CreateAlertInput) => Promise<void> | void
  loading?: boolean
}

export function AlertFormDialog({
  open,
  initialData,
  availableTrucks,
  onClose,
  onSubmit,
  loading = false,
}: AlertFormDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [address, setAddress] = useState('')
  const [info, setInfo] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedTruckIds, setSelectedTruckIds] = useState<string[]>([])

  // Optional map position: entered as a "lat, lng" string and split on submit.
  const [coordinateRaw, setCoordinateRaw] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)

  // LocationPanel preview values. Committed when a field loses focus (not on
  // every keystroke), so the panel reflects the last completed entry.
  const [preview, setPreview] = useState<{ address: string; lat: number | null; lng: number | null }>({
    address: '',
    lat: null,
    lng: null,
  })

  const [touched, setTouched] = useState({
    name: false,
    category: false,
    address: false,
    info: false,
  })

  const status = initialData?.status
  const isEdit = Boolean(initialData)

  // A record cannot have its position/zoom edited while it is active.
  const geoLocked = isEdit && status === 'active'

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name || '')
        setCategory(initialData.category || '')
        setAddress(initialData.address || '')
        setInfo(initialData.info || '')
        setNotes(initialData.notes || '')
        setSelectedTruckIds(initialData.truckIds || [])
        setCoordinateRaw(
          initialData.lat != null && initialData.lng != null
            ? `${initialData.lat},${initialData.lng}`
            : '',
        )
        setLat(initialData.lat ?? null)
        setLng(initialData.lng ?? null)
        setZoom(initialData.zoom ?? DEFAULT_ZOOM)
        setPreview({
          address: initialData.address || '',
          lat: initialData.lat ?? null,
          lng: initialData.lng ?? null,
        })
      } else {
        setName('')
        setCategory('')
        setAddress('')
        setInfo('')
        setNotes('')
        setSelectedTruckIds([])
        setCoordinateRaw('')
        setLat(null)
        setLng(null)
        setZoom(DEFAULT_ZOOM)
        setPreview({ address: '', lat: null, lng: null })
      }
      setTouched({
        name: false,
        category: false,
        address: false,
        info: false,
      })
    }
  }, [open, initialData])

  const nameError = touched.name && !name.trim()
  const categoryError = touched.category && !category.trim()
  const addressError = touched.address && !address.trim()
  const infoError = touched.info && !info.trim()

  const handleTruckChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value
    setSelectedTruckIds(typeof value === 'string' ? value.split(',') : value)
  }

  // Parse a "lat, lng" string into two finite numbers. Returns null when the
  // string has no two usable values.
  const parseCoordinate = (raw: string): { lat: number; lng: number } | null => {
    if (raw.trim().length === 0) return null
    const parts = raw.split(',').map((p) => p.trim())
    if (parts.length !== 2) return null
    const lat = Number(parts[0])
    const lng = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  // The LocationPanel preview updates when focus leaves a field (blur), not on
  // every keystroke; address and coordinates are committed independently.
  const commitAddressToPreview = () => setPreview((p) => ({ ...p, address }))
  const commitCoordinatesToPreview = () => {
    const parsed = parseCoordinate(coordinateRaw)
    setPreview((p) => ({
      ...p,
      lat: parsed ? parsed.lat : null,
      lng: parsed ? parsed.lng : null,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({
      name: true,
      category: true,
      address: true,
      info: true,
    })

    if (!name.trim() || !category.trim() || !address.trim() || !info.trim()) {
      return
    }

    const coord = parseCoordinate(coordinateRaw)
    if (coord) {
      setLat(coord.lat)
      setLng(coord.lng)
    }

    await onSubmit({
      name: name.trim(),
      category: category.trim(),
      address: address.trim(),
      info: info.trim(),
      notes: notes.trim() ? notes.trim() : undefined,
      truckIds: selectedTruckIds,
      lat: coord ? coord.lat : undefined,
      lng: coord ? coord.lng : undefined,
      zoom,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle sx={{ fontSize: 18 }}>{isEdit ? 'Alarm bearbeiten' : 'Neuen Alarm anlegen'}</DialogTitle>
        <DialogContent dividers>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 3,
              pt: 1,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: { xs: 'none', md: 1 } }}>
              <TextField
                size="small"
                label="Bezeichnung / Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                error={nameError}
                helperText={nameError ? 'Bezeichnung ist erforderlich' : undefined}
                required
                fullWidth
                autoFocus
              />

              <TextField
                size="small"
                label="Stichwort / Kategorie"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, category: true }))}
                error={categoryError}
                helperText={categoryError ? 'Stichwort ist erforderlich' : undefined}
                required
                fullWidth
              />

              <TextField
                size="small"
                label="Einsatzort / Adresse"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => {
                  setTouched((p) => ({ ...p, address: true }))
                  commitAddressToPreview()
                }}
                error={addressError}
                helperText={addressError ? 'Adresse ist erforderlich' : undefined}
                required
                fullWidth
              />

              <TextField
                size="small"
                label="Zusatzinfo"
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, info: true }))}
                error={infoError}
                helperText={infoError ? 'Zusatzinfo ist erforderlich' : undefined}
                required
                fullWidth
                multiline
                rows={2}
              />

              <TextField
                size="small"
                label="Notizen (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                rows={2}
              />

              <FormControl fullWidth>
                <InputLabel id="alert-trucks-select-label">Fahrzeuge</InputLabel>
                <Select
                  size="small"
                  labelId="alert-trucks-select-label"
                  id="alert-trucks-select"
                  multiple
                  value={selectedTruckIds}
                  onChange={handleTruckChange}
                  input={<OutlinedInput label="Fahrzeuge" />}
                  renderValue={(selected) => {
                    if (selected.length === 0) {
                      return <em>Keine Fahrzeuge ausgewählt</em>
                    }
                    return availableTrucks
                      .filter((t) => selected.includes(t.id))
                      .map((t) => t.name)
                      .join(', ')
                  }}
                >
                  {availableTrucks.map((truck) => (
                    <MenuItem key={truck.id} value={truck.id}>
                      <Checkbox checked={selectedTruckIds.includes(truck.id)} />
                      <ListItemText primary={`${truck.name} (${truck.category})`} />
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  Ausgewählte Fahrzeuge werden bei Alarmauslösung auf dem Einsatzmonitor hervorgehoben.
                </FormHelperText>
              </FormControl>

              <TextField
                size="small"
                label="Einsatzort / Koordinaten (optional)"
                placeholder="z. B. 52.5200, 13.4050"
                value={coordinateRaw}
                disabled={geoLocked}
                onChange={(e) => {
                  setCoordinateRaw(e.target.value)
                  const parsed = parseCoordinate(e.target.value)
                  setLat(parsed ? parsed.lat : lat)
                  setLng(parsed ? parsed.lng : lng)
                }}
                onBlur={commitCoordinatesToPreview}
                fullWidth
                helperText={
                  geoLocked
                    ? 'Wird nur gelesen – keine Änderungen möglich, da Alarm aktiv.'
                    : lat != null && lng != null
                      ? `Breitengrad: ${lat.toFixed(4)}, Längengrad: ${lng.toFixed(4)}`
                      : undefined
                }
              />

              <FormControl sx={{ width: '80%', alignSelf: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Slider
                    value={zoom}
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={1}
                    marks={[
                      { value: MIN_ZOOM, label: zoomLabel(MIN_ZOOM) },
                      { value: 15, label: zoomLabel(15) },
                      { value: 16, label: zoomLabel(16) },
                      { value: MAX_ZOOM, label: zoomLabel(MAX_ZOOM) },
                    ]}
                    valueLabelDisplay="auto"
                    disabled={geoLocked}
                    onChange={(_e, val) => setZoom(val as number)}
                    aria-label="Kartenzoom"
                  />
                </Box>
                <FormHelperText>
                  Kartenzoom
                </FormHelperText>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', flex: { xs: 'none', md: 1 } }}>
              <LocationPanel
                title="Einsatzort"
                address={preview.address}
                lat={preview.lat}
                lng={preview.lng}
                zoom={zoom}
                stretch
                centered
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button size="small" onClick={onClose} disabled={loading} color="inherit">
            Abbrechen
          </Button>
          <Button size="small" type="submit" disabled={loading} variant="contained" color="primary">
            {isEdit ? 'Änderungen speichern' : 'Alarm anlegen'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
