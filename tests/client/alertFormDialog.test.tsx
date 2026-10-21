import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlertFormDialog } from '../../src/client/components/admin/AlertFormDialog'
import { trucks } from './fixtures'
import { DEFAULT_ZOOM, MAX_ZOOM as MAX } from '../../src/shared/constants'

const HINT = 'Bitte Addresse und optional Koordinaten eintragen'

function getMapSrc(): string | null {
  return document.querySelector('iframe')?.getAttribute('src') ?? null
}

describe('AlertFormDialog', () => {
  it('renders blank form in create mode and validates required fields', () => {
    const onSubmit = vi.fn()
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Neuen Alarm anlegen')).toBeInTheDocument()

    // Click submit with empty fields
    const submitBtn = screen.getByRole('button', { name: 'Alarm anlegen' })
    fireEvent.click(submitBtn)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Bezeichnung ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Stichwort ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Adresse ist erforderlich')).toBeInTheDocument()
    expect(screen.getByText('Zusatzinfo ist erforderlich')).toBeInTheDocument()
  })

  it('submits valid alert payload with default zoom and no position', () => {
    const onSubmit = vi.fn()
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Bezeichnung \/ Name/i), {
      target: { value: 'B3 Kellerbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Stichwort \/ Kategorie/i), {
      target: { value: 'Kellerbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Einsatzort \/ Adresse/i), {
      target: { value: 'Bahnhofstr. 12' },
    })
    fireEvent.change(screen.getByLabelText(/Zusatzinfo/i), {
      target: { value: 'Starke Rauchentwicklung' },
    })
    fireEvent.change(screen.getByLabelText(/Notizen/i), {
      target: { value: 'Zugang über Hof' },
    })

    const submitBtn = screen.getByRole('button', { name: 'Alarm anlegen' })
    fireEvent.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'B3 Kellerbrand',
      category: 'Kellerbrand',
      address: 'Bahnhofstr. 12',
      info: 'Starke Rauchentwicklung',
      notes: 'Zugang über Hof',
      truckIds: [],
      lat: undefined,
      lng: undefined,
      zoom: DEFAULT_ZOOM,
    })
  })

  it('splits a "lat, lng" coordinate string and reports it live', () => {
    const onSubmit = vi.fn()
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Bezeichnung \/ Name/i), {
      target: { value: 'Wohnungsbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Stichwort \/ Kategorie/i), {
      target: { value: 'Wohnungsbrand' },
    })
    fireEvent.change(screen.getByLabelText(/Einsatzort \/ Adresse/i), {
      target: { value: 'Musterstraße 5' },
    })
    fireEvent.change(screen.getByLabelText(/Zusatzinfo/i), {
      target: { value: 'Brandgeruch' },
    })
    fireEvent.change(screen.getByLabelText(/Notizen/i), {
      target: { value: '' },
    })

    // Type a coordinate and normalise whitespace/padding.
    fireEvent.change(screen.getByLabelText(/Koordinaten/i), {
      target: { value: '52.52, 13.405' },
    })

    // Helper text reflects the parsed values (4 decimal places).
    expect(screen.getByText(/Breitengrad: 52\.5200/)).toBeInTheDocument()
    expect(screen.getByText(/Längengrad: 13\.4050/)).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: 'Alarm anlegen' })
    fireEvent.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      lat: 52.52,
      lng: 13.405,
      zoom: DEFAULT_ZOOM,
    }))
  })

  it('populates fields when initialData is provided for edit', () => {
    const onSubmit = vi.fn()
    const initialAlert = {
      id: 'a1',
      name: 'Einsatz Brand 1',
      category: 'Wohnungsbrand',
      address: 'Musterstraße 5',
      info: 'Brandgeruch',
      notes: 'Schlüssel da',
      truckIds: ['t1', 't2'],
      status: 'pending' as const,
      lat: 48.14,
      lng: 11.58,
      zoom: 16,
    }

    render(
      <AlertFormDialog
        open={true}
        initialData={initialAlert}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Alarm bearbeiten')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Einsatz Brand 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Wohnungsbrand')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Musterstraße 5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Brandgeruch')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Schlüssel da')).toBeInTheDocument()
    expect(screen.getByText(/Breitengrad: 48\.1400/)).toBeInTheDocument()
    expect(screen.getByText(/Längengrad: 11\.5800/)).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: 'Änderungen speichern' })
    fireEvent.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Einsatz Brand 1',
      category: 'Wohnungsbrand',
      address: 'Musterstraße 5',
      info: 'Brandgeruch',
      notes: 'Schlüssel da',
      truckIds: ['t1', 't2'],
      lat: 48.14,
      lng: 11.58,
      zoom: 16,
    })
  })

  it('pre-fills zoom from existing data and renders it on the slider', () => {
    render(
      <AlertFormDialog
        open={true}
        initialData={{
          id: 'a1',
          name: 'X',
          category: 'C',
          address: 'A',
          info: 'I',
          status: 'pending',
          zoom: 14,
        }}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    // Not locked on a pending record.
    expect(screen.getByLabelText('Kartenzoom')).not.toBeDisabled()

    // Slider reports its controlled value (14) and exposes the labelled marks.
    const slider = screen.getByLabelText('Kartenzoom')
    expect(slider.getAttribute('aria-valuenow')).toBe('14')
    expect(slider.getAttribute('aria-valuemin')).toBe('14')
    expect(slider.getAttribute('aria-valuemax')).toBe('17')

    // The far-right mark label "sehr stark" is present in the DOM.
    expect(screen.getByText('sehr stark')).toBeInTheDocument()
  })

  it('reflects a new zoom on re-render', () => {
    const { rerender } = render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const slider = screen.getByRole('slider', { name: 'Kartenzoom' })
    expect(slider.getAttribute('aria-valuenow')).toBe('15')

    // Controlled value updates when props change.
    rerender(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    expect(slider.getAttribute('aria-valuenow')).toBe('15')
  })

  it('locks the position/zoom fields while editing an active alert', () => {
    render(
      <AlertFormDialog
        open={true}
        initialData={{
          id: 'a1',
          name: 'X',
          category: 'C',
          address: 'A',
          info: 'I',
          status: 'active',
          lat: 52.5,
          lng: 13.4,
          zoom: 15,
        }}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Wird nur gelesen – keine Änderungen möglich, da Alarm aktiv.')).toBeInTheDocument()
    expect(screen.getByLabelText('Einsatzort / Koordinaten (optional)')).toHaveAttribute('disabled', '')
    // The zoom slider stays visible (read-only) while locked.
    const slider = screen.getByRole('slider', { name: 'Kartenzoom' })
    expect(slider).toBeDisabled()
    expect(screen.getByLabelText('Kartenzoom')).toBeDisabled()
    // Only one slider exists while locked (the zoom one, disabled).
    expect(screen.queryAllByRole('slider')).toHaveLength(1)
  })

  it('commits the map preview when the address or coordinate field loses focus', () => {
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const addressField = screen.getByLabelText(/Einsatzort \/ Adresse/i)
    const coordField = screen.getByLabelText(/Koordinaten/i)

    // While typing: the preview still shows the entry hint, no map yet.
    fireEvent.change(addressField, { target: { value: 'Bahnhofstr. 12' } })
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(getMapSrc()).toBeNull()

    // After blur: the map appears with the URL-encoded address.
    fireEvent.blur(addressField)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=Bahnhofstr.%2012&z=15&output=embed')

    // A coordinate commit (blur) takes precedence over the address in the query.
    fireEvent.change(coordField, { target: { value: '52.52, 13.405' } })
    fireEvent.blur(coordField)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=52.52,13.405&z=15&output=embed')
  })

  it('initialises the map preview from initialData when editing', () => {
    render(
      <AlertFormDialog
        open={true}
        initialData={{
          id: 'a1',
          name: 'X',
          category: 'C',
          address: 'Musterstraße 5',
          info: 'I',
          status: 'pending',
          lat: 48.14,
          lng: 11.58,
          zoom: 16,
        }}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=48.14,11.58&z=16&output=embed')
  })

  it('falls back to the address in the preview when the coordinate entry is invalid', () => {
    render(
      <AlertFormDialog
        open={true}
        availableTrucks={trucks}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const addressField = screen.getByLabelText(/Einsatzort \/ Adresse/i)
    const coordField = screen.getByLabelText(/Koordinaten/i)

    fireEvent.change(addressField, { target: { value: 'Musterstraße 5' } })
    fireEvent.blur(addressField)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=Musterstra%C3%9Fe%205&z=15&output=embed')

    // An unparseable coordinate entry resets the preview position to the address.
    fireEvent.change(coordField, { target: { value: 'abc' } })
    fireEvent.blur(coordField)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=Musterstra%C3%9Fe%205&z=15&output=embed')
  })
})
