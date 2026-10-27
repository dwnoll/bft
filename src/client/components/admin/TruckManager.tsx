import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { Truck, TruckCategory } from '../../../shared/types'
import { TRUCK_CATEGORIES } from '../../../shared/constants'
import { apiClient } from '../../api/client'
import { errorMessage } from '../../api/apiError'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { useToast } from '../common/ToastContainer'

export interface TruckManagerProps {
  trucks: Truck[]
  onRefresh: () => Promise<void> | void
  loading?: boolean
}

export function TruckManager({ trucks, onRefresh, loading = false }: TruckManagerProps) {
  const { showSuccess, showError } = useToast()

  // Form Dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TruckCategory>(TRUCK_CATEGORIES[0])
  const [nameError, setNameError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<Truck | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleOpenAdd = () => {
    setEditingTruck(null)
    setName('')
    setCategory(TRUCK_CATEGORIES[0])
    setNameError(false)
    setFormOpen(true)
  }

  const handleOpenEdit = (truck: Truck) => {
    setEditingTruck(truck)
    setName(truck.name)
    setCategory(truck.category)
    setNameError(false)
    setFormOpen(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError(true)
      return
    }

    setSubmitting(true)
    try {
      if (editingTruck) {
        await apiClient.updateTruck(editingTruck.id, {
          name: name.trim(),
          category,
        })
        showSuccess(`Fahrzeug "${name.trim()}" aktualisiert`)
      } else {
        await apiClient.createTruck({
          name: name.trim(),
          category,
        })
        showSuccess(`Fahrzeug "${name.trim()}" angelegt`)
      }
      setFormOpen(false)
      await onRefresh()
    } catch (err) {
      showError(errorMessage(err, 'Fehler beim Speichern des Fahrzeugs'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.deleteTruck(deleteTarget.id)
      showSuccess(`Fahrzeug "${deleteTarget.name}" gelöscht`)
      setDeleteTarget(null)
      await onRefresh()
    } catch (err) {
      showError(errorMessage(err, 'Fehler beim Löschen des Fahrzeugs'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
      <CardHeader
        title="Fahrzeuge verwalten"
        subheader="Übersicht und Konfiguration der Einsatzfahrzeuge"
        titleTypographyProps={{ variant: 'h6', fontWeight: 700 }}
        action={
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenAdd}
            disabled={loading}
          >
            Neues Fahrzeug
          </Button>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {trucks.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Keine Fahrzeuge vorhanden.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="medium" aria-label="Fahrzeuge Tabelle">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Funkrufname / Bezeichnung</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Kategorie
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Aktionen
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trucks.map((truck) => (
                  <TableRow key={truck.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{truck.name}</TableCell>
                    <TableCell align="center">{truck.category}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenEdit(truck)}
                          disabled={loading}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => setDeleteTarget(truck)}
                          disabled={loading}
                        >
                          Löschen
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleFormSubmit} noValidate>
          <DialogTitle>
            {editingTruck ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug anlegen'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
              <TextField
                label="Funkrufname / Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (e.target.value.trim()) setNameError(false)
                }}
                error={nameError}
                helperText={nameError ? 'Name ist erforderlich' : undefined}
                required
                fullWidth
                autoFocus
              />
              <TextField
                select
                label="Kategorie"
                SelectProps={{ native: true }}
                value={category}
                onChange={(e) => setCategory(e.target.value as TruckCategory)}
                required
                fullWidth
              >
                {TRUCK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setFormOpen(false)} disabled={submitting} color="inherit">
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting} variant="contained" color="primary">
              Speichern
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Fahrzeug löschen"
        message={
          deleteTarget
            ? `Möchten Sie das Fahrzeug "${deleteTarget.name}" wirklich löschen? Es wird aus allen Alarmen entfernt.`
            : ''
        }
        confirmText="Löschen"
        cancelText="Abbrechen"
        confirmColor="error"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Card>
  )
}
