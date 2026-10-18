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
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import type { Alert, Truck } from '../../../shared/types'
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

  const [touched, setTouched] = useState({
    name: false,
    category: false,
    address: false,
    info: false,
  })

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name || '')
        setCategory(initialData.category || '')
        setAddress(initialData.address || '')
        setInfo(initialData.info || '')
        setNotes(initialData.notes || '')
        setSelectedTruckIds(initialData.truckIds || [])
      } else {
        setName('')
        setCategory('')
        setAddress('')
        setInfo('')
        setNotes('')
        setSelectedTruckIds([])
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

    await onSubmit({
      name: name.trim(),
      category: category.trim(),
      address: address.trim(),
      info: info.trim(),
      notes: notes.trim() ? notes.trim() : undefined,
      truckIds: selectedTruckIds,
    })
  }

  const isEdit = Boolean(initialData)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Alarm bearbeiten' : 'Neuen Alarm anlegen'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
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
              label="Einsatzort / Adresse"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, address: true }))}
              error={addressError}
              helperText={addressError ? 'Adresse ist erforderlich' : undefined}
              required
              fullWidth
            />

            <TextField
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
                    <ListItemText primary={`${truck.name} (${truck.seats} Plätze)`} />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Ausgewählte Fahrzeuge werden bei Alarmauslösung auf dem Einsatzmonitor hervorgehoben.
              </FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading} variant="contained" color="primary">
            {isEdit ? 'Änderungen speichern' : 'Alarm anlegen'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
