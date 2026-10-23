import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import { useState } from 'react'
import type { Person, Roster, Truck } from '../../../shared/types'
import { apiClient } from '../../api/client'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { useToast } from '../common/ToastContainer'
import { RosterDialog } from './RosterDialog'

interface RosterManagerProps {
  rosters: Roster[]
  activeRosterId: string | null
  persons: Person[]
  trucks: Truck[]
  onRefresh: () => Promise<void>
}

function countFilledSlots(roster: Roster): number {
  let count = 0
  for (const slots of Object.values(roster.assignments)) {
    for (const val of Object.values(slots)) {
      if (val !== null) count++
    }
  }
  return count
}

export function RosterManager({
  rosters,
  activeRosterId,
  persons,
  trucks,
  onRefresh,
}: RosterManagerProps) {
  const { showSuccess, showError } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRoster, setEditingRoster] = useState<Roster | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Roster | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleCreate = () => {
    setEditingRoster(null)
    setDialogOpen(true)
  }

  const handleEdit = (roster: Roster) => {
    setEditingRoster(roster)
    setDialogOpen(true)
  }

  const handleDialogClose = async (refreshNeeded: boolean) => {
    setDialogOpen(false)
    setEditingRoster(null)
    if (refreshNeeded) await onRefresh()
  }

  const handleActivate = async (roster: Roster) => {
    try {
      await apiClient.activateRoster(roster.id)
      showSuccess(`Besatzung "${roster.name}" aktiviert`)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Aktivieren')
    }
  }

  const handleDeactivate = async () => {
    try {
      await apiClient.deactivateRoster()
      showSuccess('Besatzung deaktiviert')
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Deaktivieren')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.deleteRoster(deleteTarget.id)
      showSuccess(`Besatzung "${deleteTarget.name}" gelöscht`)
      setDeleteTarget(null)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Fahreug-Besatzungen"
        subheader="Besatzungen anlegen, zuweisen und aktivieren"
        action={
          <Button variant="contained" onClick={handleCreate} sx={{ fontWeight: 700 }}>
            Neue Besatzung
          </Button>
        }
      />
      <CardContent sx={{ p: 0 }}>
        {rosters.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">Keine Besatzungen vorhanden.</Typography>
          </Box>
        ) : (
          <Table data-testid="roster-table" size="small">
            <TableHead>
              <TableRow>
                <TableCell>Bezeichnung</TableCell>
                <TableCell>Belegte Slots</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Aktionen</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rosters.map((roster) => {
                const isActive = roster.id === activeRosterId
                return (
                  <TableRow key={roster.id} data-testid="roster-row">
                    <TableCell>{roster.name}</TableCell>
                    <TableCell>{countFilledSlots(roster)}</TableCell>
                    <TableCell>
                      {isActive && (
                        <Chip
                          label="aktiv"
                          size="small"
                          color="success"
                          data-testid="active-chip"
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        {isActive ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={handleDeactivate}
                            data-testid={`deactivate-${roster.id}`}
                          >
                            Deaktivieren
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={() => handleActivate(roster)}
                            data-testid={`activate-${roster.id}`}
                          >
                            Aktivieren
                          </Button>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(roster)}
                          data-testid={`edit-${roster.id}`}
                          aria-label="Bearbeiten"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(roster)}
                          data-testid={`delete-${roster.id}`}
                          aria-label="Löschen"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      {dialogOpen && (
        <RosterDialog
          open={dialogOpen}
          roster={editingRoster}
          persons={persons}
          trucks={trucks}
          onClose={handleDialogClose}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Besatzung löschen"
        message={deleteTarget ? `Besatzung "${deleteTarget.name}" wirklich löschen?` : ''}
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
