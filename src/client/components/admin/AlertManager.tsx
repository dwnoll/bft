import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { Alert, Truck } from '../../../shared/types'
import { apiClient, type CreateAlertInput } from '../../api/client'
import { COLOR_EMERGENCY, COLOR_SUCCESS } from '../../theme'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { useToast } from '../common/ToastContainer'
import { AlertFormDialog } from './AlertFormDialog'
import { CountdownBadge } from './CountdownBadge'
import { TriggerDialog } from './TriggerDialog'

export interface AlertManagerProps {
  alerts: Alert[]
  trucks: Truck[]
  onRefresh: () => Promise<void> | void
  loading?: boolean
}

export function AlertManager({
  alerts,
  trucks,
  onRefresh,
  loading = false,
}: AlertManagerProps) {
  const { showSuccess, showError } = useToast()

  // Form Dialog state (Create / Edit)
  const [formOpen, setFormOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Trigger Dialog state
  const [triggerAlertTarget, setTriggerAlertTarget] = useState<Alert | null>(null)
  const [triggerSubmitting, setTriggerSubmitting] = useState(false)

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<Alert | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Action busy state per alert id
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const handleOpenCreate = () => {
    setEditingAlert(null)
    setFormOpen(true)
  }

  const handleOpenEdit = (alert: Alert) => {
    setEditingAlert(alert)
    setFormOpen(true)
  }

  const handleFormSubmit = async (input: CreateAlertInput) => {
    setFormSubmitting(true)
    try {
      if (editingAlert) {
        await apiClient.updateAlert(editingAlert.id, input)
        showSuccess(`Alarm "${input.name}" aktualisiert`)
      } else {
        await apiClient.createAlert(input)
        showSuccess(`Alarm "${input.name}" angelegt`)
      }
      setFormOpen(false)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Speichern des Alarms')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.deleteAlert(deleteTarget.id)
      showSuccess(`Alarm "${deleteTarget.name}" gelöscht`)
      setDeleteTarget(null)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Löschen des Alarms')
    } finally {
      setDeleting(false)
    }
  }

  const handleTriggerConfirm = async (delayMinutes: number) => {
    if (!triggerAlertTarget) return
    setTriggerSubmitting(true)
    try {
      await apiClient.triggerAlert(triggerAlertTarget.id, delayMinutes)
      showSuccess(`Alarm "${triggerAlertTarget.name}" mit ${delayMinutes} min Verzögerung ausgelöst`)
      setTriggerAlertTarget(null)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Auslösen des Alarms')
    } finally {
      setTriggerSubmitting(false)
    }
  }

  const handleCancelTrigger = async (alert: Alert) => {
    setActionBusyId(alert.id)
    try {
      await apiClient.cancelTrigger(alert.id)
      showSuccess('Trigger abgebrochen')
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Abbrechen des Triggers')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleCompleteAlert = async (alert: Alert) => {
    setActionBusyId(alert.id)
    try {
      await apiClient.completeAlert(alert.id)
      showSuccess(`Alarm "${alert.name}" abgeschlossen`)
      await onRefresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Abschließen des Alarms')
    } finally {
      setActionBusyId(null)
    }
  }

  const getTruckNames = (truckIds: string[]): string => {
    if (!truckIds || truckIds.length === 0) return 'Keine'
    const names = trucks
      .filter((t) => truckIds.includes(t.id))
      .map((t) => t.name)
    return names.length > 0 ? names.join(', ') : 'Keine'
  }

  const renderStatus = (alert: Alert) => {
    // Use server-authoritative status for action gating to avoid client clock skew.
    const isArmed = alert.status === 'pending' && alert.triggerAt !== undefined

    if (isArmed && alert.triggerAt) {
      return <CountdownBadge triggerAt={alert.triggerAt} onExpire={onRefresh} />
    }

    if (alert.status === 'active') {
      return (
        <Chip
          label="aktiv"
          size="small"
          sx={{ bgcolor: COLOR_EMERGENCY, color: '#ffffff', fontWeight: 600 }}
        />
      )
    }

    if (alert.status === 'complete') {
      return (
        <Chip
          label="abgeschlossen"
          size="small"
          sx={{ bgcolor: COLOR_SUCCESS, color: '#ffffff', fontWeight: 600 }}
        />
      )
    }

    return (
      <Chip
        label="ausstehend"
        size="small"
        variant="outlined"
        sx={{ fontWeight: 600 }}
      />
    )
  }

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
      <CardHeader
        title="Geplante Alarme"
        subheader="Einsatzübungen anlegen, konfigurieren und auslösen"
        titleTypographyProps={{ variant: 'h6', fontWeight: 700 }}
        action={
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreate}
            disabled={loading}
          >
            Neuer Alarm
          </Button>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {alerts.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              Keine ausstehenden Alarme — neuen Alarm anlegen?
            </Typography>
            <Button variant="outlined" color="primary" onClick={handleOpenCreate}>
              Jetzt Alarm anlegen
            </Button>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="medium" aria-label="Alarme Tabelle">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Bezeichnung</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Stichwort</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Einsatzort</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Fahrzeuge</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Status
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Aktionen
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(alerts || []).map((alert) => {
                  // Server-authoritative: armed = pending status + triggerAt present.
                  // Using Date.now() here could hide the "Abbrechen" button due to clock skew.
                  const isArmed = alert.status === 'pending' && alert.triggerAt !== undefined
                  const isBusy = actionBusyId === alert.id || loading

                  return (
                    <TableRow key={alert.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {alert.name}
                        {alert.info && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {alert.info}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{alert.category}</TableCell>
                      <TableCell>{alert.address}</TableCell>
                      <TableCell>{getTruckNames(alert.truckIds)}</TableCell>
                      <TableCell align="center">{renderStatus(alert)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                          {/* Armed trigger: Cancel button */}
                          {isArmed ? (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => handleCancelTrigger(alert)}
                              disabled={isBusy}
                            >
                              Abbrechen
                            </Button>
                          ) : alert.status === 'active' ? (
                            /* Active alert: Complete button */
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              onClick={() => handleCompleteAlert(alert)}
                              disabled={isBusy}
                            >
                              Abschließen
                            </Button>
                          ) : (
                            /* Pending or Complete: Trigger button */
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => setTriggerAlertTarget(alert)}
                              disabled={isBusy}
                            >
                              Auslösen
                            </Button>
                          )}

                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleOpenEdit(alert)}
                            disabled={isBusy}
                          >
                            Bearbeiten
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => setDeleteTarget(alert)}
                            disabled={isBusy}
                          >
                            Löschen
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {/* Alert Form Dialog (Create / Edit) */}
      <AlertFormDialog
        open={formOpen}
        initialData={editingAlert}
        availableTrucks={trucks}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        loading={formSubmitting}
      />

      {/* Trigger Slider Dialog */}
      <TriggerDialog
        open={Boolean(triggerAlertTarget)}
        alertName={triggerAlertTarget?.name}
        onClose={() => setTriggerAlertTarget(null)}
        onConfirm={handleTriggerConfirm}
        loading={triggerSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Alarm löschen"
        message={
          deleteTarget
            ? `Möchten Sie den Alarm "${deleteTarget.name}" wirklich löschen? ${
                deleteTarget.triggerAt && deleteTarget.triggerAt > Date.now()
                  ? 'Der ausstehende Trigger wird automatisch abgebrochen.'
                  : ''
              }`
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
