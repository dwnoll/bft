import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Person, Roster, Truck } from '../../../shared/types'
import { CREW_SLOTS } from '../../../shared/constants'
import { apiClient } from '../../api/client'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { useToast } from '../common/ToastContainer'

// ---- drag item ID encoding -------------------------------------------------
// Draggable IDs encode their origin:
//   "slot:<truckId>:<role>"   — a slot in the grid
//   "pool:<personName>"       — an unassigned person in the pool

function encodeSlotId(truckId: string, role: string): string {
  return `slot:${truckId}:${role}`
}

function encodePoolId(personName: string): string {
  return `pool:${personName}`
}

// The unassigned pool is a drop target (droppable) so persons can be dragged
// back from a slot to unassign them.
const POOL_DROP_ID = 'pool:__pool__'

function decodeId(id: string): { type: 'slot'; truckId: string; role: string } | { type: 'pool'; name: string } | null {
  if (id.startsWith('slot:')) {
    const parts = id.slice(5).split(':')
    if (parts.length < 2) return null
    const role = parts[parts.length - 1]
    const truckId = parts.slice(0, -1).join(':')
    return { type: 'slot', truckId, role }
  }
  if (id.startsWith('pool:')) {
    return { type: 'pool', name: id.slice(5) }
  }
  return null
}

// ---- DraggablePerson chip --------------------------------------------------
interface PersonChipProps {
  personName: string
  dragging?: boolean
}

function PersonChip({ personName, dragging }: PersonChipProps) {
  return (
    <Box
      data-testid={`person-chip-${personName}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        bgcolor: dragging ? 'primary.light' : 'primary.main',
        color: '#fff',
        fontSize: '0.82rem',
        fontWeight: 600,
        userSelect: 'none',
        opacity: dragging ? 0.9 : 1,
      }}
    >
      {personName}
    </Box>
  )
}

/**
 * A person chip registered as a dnd-kit draggable. Renders the original chip;
 * while dragging, the original fades out and the <DragOverlay> copy follows the
 * pointer.
 */
interface DraggablePersonProps {
  id: string
  personName: string
  testId?: string
}

function DraggablePerson({ id, personName, testId }: DraggablePersonProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={testId}
      sx={{
        display: 'inline-flex',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        opacity: isDragging ? 0 : 1,
      }}
    >
      <PersonChip personName={personName} />
    </Box>
  )
}

/** A box registered as a dnd-kit droppable, used for the unassigned pool. */
interface PoolDropZoneProps {
  isOver?: boolean
  children: React.ReactNode
}

function PoolDropZone({ isOver, children }: PoolDropZoneProps) {
  const { setNodeRef, isOver: droppableIsOver } = useDroppable({ id: POOL_DROP_ID })
  const highlighted = isOver || droppableIsOver
  return (
    <Box
      ref={setNodeRef}
      data-testid="unassigned-pool"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        minHeight: 40,
        p: 1,
        border: '1px dashed',
        borderColor: highlighted ? 'primary.main' : 'divider',
        borderRadius: 1,
      }}
    >
      {children}
    </Box>
  )
}

// ---- SlotCell — a droppable slot containing a draggable person -------------
interface SlotCellProps {
  truckId: string
  role: string
  personName: string | null | undefined
  isDraggingOver?: boolean
}

function SlotCell({ truckId, role, personName, isDraggingOver }: SlotCellProps) {
  const id = encodeSlotId(truckId, role)
  const { setNodeRef, isOver } = useDroppable({ id })
  const highlighted = isDraggingOver || isOver
  return (
    <Box
      ref={setNodeRef}
      data-testid={`slot-${truckId}-${role}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 32,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: highlighted ? 'primary.main' : 'divider',
        bgcolor: highlighted ? 'primary.50' : 'background.paper',
        mb: 0.5,
      }}
    >
      <Typography variant="caption" sx={{ minWidth: 28, fontWeight: 700, color: 'text.secondary' }}>
        {role}
      </Typography>
      {personName ? (
        <DraggablePerson
          id={id}
          personName={personName}
          testId={`draggable-slot-${truckId}-${role}`}
        />
      ) : (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          –
        </Typography>
      )}
    </Box>
  )
}

// ---- RosterDialog ----------------------------------------------------------

interface RosterDialogProps {
  open: boolean
  roster: Roster | null    // null = create mode
  persons: Person[]
  trucks: Truck[]
  onClose: (refreshNeeded: boolean) => void
}

export function RosterDialog({ open, roster, persons, trucks, onClose }: RosterDialogProps) {
  const { showSuccess, showError } = useToast()
  const isCreate = roster === null

  const [name, setName] = useState(roster?.name ?? '')
  const [assignments, setAssignments] = useState<Roster['assignments']>(() =>
    roster ? { ...roster.assignments } : {},
  )
  const [saving, setSaving] = useState(false)
  const [randomConfirmOpen, setRandomConfirmOpen] = useState(false)
  const [randomLoading, setRandomLoading] = useState(false)

  // The DnD active item id (for overlay)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null)

  // A saved-roster id is needed for random-assign (server-side).
  // In create mode we need to first create the roster, then random-assign.
  const savedRosterIdRef = useRef<string | null>(roster?.id ?? null)

  // Reset state when roster prop changes
  useEffect(() => {
    setName(roster?.name ?? '')
    setAssignments(roster ? JSON.parse(JSON.stringify(roster.assignments)) : {})
    savedRosterIdRef.current = roster?.id ?? null
  }, [roster])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Derive unassigned persons
  const assignedNames = new Set<string>()
  for (const slots of Object.values(assignments)) {
    for (const v of Object.values(slots)) {
      if (v) assignedNames.add(v)
    }
  }
  const unassignedPersons = persons.filter((p) => !assignedNames.has(p.name))

  // Helper: get person name for a slot
  const getSlot = useCallback(
    (truckId: string, role: string): string | null => {
      return assignments[truckId]?.[role] ?? null
    },
    [assignments],
  )

  // Helper: set person for a slot (null = clear)
  const setSlot = useCallback(
    (truckId: string, role: string, personName: string | null) => {
      setAssignments((prev) => ({
        ...prev,
        [truckId]: {
          ...prev[truckId],
          [role]: personName,
        },
      }))
    },
    [],
  )

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragOver = (event: { over: { id: string } | null }) => {
    setOverDroppableId(event.over ? String(event.over.id) : null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    setOverDroppableId(null)
    const { active, over } = event
    if (!over) return

    const sourceDecoded = decodeId(String(active.id))
    const targetDecoded = decodeId(String(over.id))
    if (!sourceDecoded || !targetDecoded) return

    // Resolve source person name
    let sourcePerson: string | null = null
    if (sourceDecoded.type === 'pool') {
      sourcePerson = sourceDecoded.name
    } else {
      sourcePerson = getSlot(sourceDecoded.truckId, sourceDecoded.role)
    }
    if (!sourcePerson) return

    // slot → pool: unassign the person from their slot (pool → pool is a no-op)
    if (targetDecoded.type === 'pool') {
      if (sourceDecoded.type === 'slot') {
        setSlot(sourceDecoded.truckId, sourceDecoded.role, null)
      }
      return
    }

    // The remaining target type is a slot
    const targetTruckId = targetDecoded.truckId
    const targetRole = targetDecoded.role

    // Dropping a person back onto their own slot is a no-op
    if (
      sourceDecoded.type === 'slot' &&
      sourceDecoded.truckId === targetTruckId &&
      sourceDecoded.role === targetRole
    ) {
      return
    }

    // Client-side exclusion check (server is authoritative)
    const person = persons.find((p) => p.name === sourcePerson)
    if (person?.excludedRoles.includes(targetRole)) {
      showError(`${sourcePerson} ist für Rolle ${targetRole} ausgeschlossen`)
      return
    }

    const existingInTarget = getSlot(targetTruckId, targetRole)

    if (sourceDecoded.type === 'slot') {
      // slot → slot: swap if target occupied, move if empty
      if (existingInTarget) {
        setSlot(sourceDecoded.truckId, sourceDecoded.role, existingInTarget)
        setSlot(targetTruckId, targetRole, sourcePerson)
      } else {
        setSlot(sourceDecoded.truckId, sourceDecoded.role, null)
        setSlot(targetTruckId, targetRole, sourcePerson)
      }
    } else {
      // pool → slot: assign. A person already in the target slot is bumped back
      // to the pool automatically (the pool derives from unassigned persons).
      setSlot(targetTruckId, targetRole, sourcePerson)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isCreate) {
        const created = await apiClient.createRoster({ name: name.trim(), assignments })
        showSuccess(`Besatzung "${created.name}" angelegt`)
      } else {
        const updated = await apiClient.updateRoster(roster!.id, { name: name.trim(), assignments })
        showSuccess(`Besatzung "${updated.name}" aktualisiert`)
      }
      onClose(true)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const handleRandomClick = () => {
    if (isCreate) {
      // In create mode, just do it without confirm (no existing assignments to lose)
      void doRandomAssign()
    } else {
      setRandomConfirmOpen(true)
    }
  }

  const doRandomAssign = async () => {
    setRandomLoading(true)
    setRandomConfirmOpen(false)
    try {
      let rosterId = savedRosterIdRef.current
      if (!rosterId) {
        // Create a stub roster first so random-assign has an id to work with
        if (!name.trim()) {
          showError('Bitte zuerst eine Bezeichnung eingeben')
          return
        }
        const stub = await apiClient.createRoster({ name: name.trim() })
        rosterId = stub.id
        savedRosterIdRef.current = rosterId
      }
      const result = await apiClient.randomAssignRoster(rosterId)
      setAssignments(result.roster.assignments)
      const unassignedCount = result.unassigned.length
      if (unassignedCount > 0) {
        showSuccess(
          `Zufällig belegt: ${result.assigned} von ${persons.length} Personen · ${unassignedCount} Personen nicht zuweisbar: ${result.unassigned.join(', ')}`,
        )
      } else {
        showSuccess(`Zufällig belegt: ${result.assigned} von ${persons.length} Personen`)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fehler bei der Zufallsbelegung')
    } finally {
      setRandomLoading(false)
    }
  }

  // Drag overlay content
  const overlayPerson = activeId ? (() => {
    const decoded = decodeId(activeId)
    if (!decoded) return null
    if (decoded.type === 'pool') return decoded.name
    return getSlot(decoded.truckId, decoded.role)
  })() : null

  return (
    <>
      <Dialog open={open} onClose={() => onClose(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {isCreate ? 'Neue Besatzung anlegen' : 'Besatzung bearbeiten'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Bezeichnung"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              autoFocus={isCreate}
              inputProps={{ 'data-testid': 'roster-name-input' }}
            />

            <Button
              variant="outlined"
              onClick={handleRandomClick}
              disabled={randomLoading}
              data-testid="random-assign-button"
              sx={{ alignSelf: 'flex-start' }}
            >
              {randomLoading ? 'Wird belegt...' : 'Zufällig belegen'}
            </Button>

            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver as (event: unknown) => void}
              onDragEnd={handleDragEnd}
            >
              {/* Slot grids per truck */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {trucks.map((truck) => {
                  const slots = CREW_SLOTS[truck.category] ?? []
                  return (
                    <Paper
                      key={truck.id}
                      variant="outlined"
                      data-testid={`truck-slot-grid-${truck.id}`}
                      sx={{ p: 1.5, minWidth: 180, flex: '1 1 180px' }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        {truck.name}
                        <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                          ({truck.category})
                        </Typography>
                      </Typography>
                      {slots.map((role) => {
                        const slotId = encodeSlotId(truck.id, role)
                        const isDraggingOver = overDroppableId === slotId
                        return (
                          <SlotCell
                            key={role}
                            truckId={truck.id}
                            role={role}
                            personName={getSlot(truck.id, role)}
                            isDraggingOver={isDraggingOver}
                          />
                        )
                      })}
                    </Paper>
                  )
                })}
              </Box>

              <Divider sx={{ my: 1 }} />

              {/* Unassigned persons pool */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Nicht zugewiesen ({unassignedPersons.length})
                </Typography>
                <PoolDropZone isOver={overDroppableId === POOL_DROP_ID}>
                  {unassignedPersons.map((p) => (
                    <DraggablePerson
                      key={p.name}
                      id={encodePoolId(p.name)}
                      personName={p.name}
                      testId={`pool-person-${p.name}`}
                    />
                  ))}
                  {unassignedPersons.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      Alle Personen zugewiesen
                    </Typography>
                  )}
                </PoolDropZone>
              </Box>

              <DragOverlay>
                {overlayPerson ? <PersonChip personName={overlayPerson} dragging /> : null}
              </DragOverlay>
            </DndContext>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose(false)} disabled={saving || randomLoading}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || randomLoading || !name.trim()}
            data-testid="save-roster-button"
          >
            {saving ? 'Wird gespeichert...' : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm random overwrite in edit mode */}
      <ConfirmDialog
        open={randomConfirmOpen}
        title="Zufällig belegen"
        message="Bestehende Zuweisungen werden ersetzt. Fortsetzen?"
        confirmText="Fortsetzen"
        cancelText="Abbrechen"
        onConfirm={doRandomAssign}
        onCancel={() => setRandomConfirmOpen(false)}
        loading={randomLoading}
      />
    </>
  )
}
