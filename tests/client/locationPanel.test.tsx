import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LocationPanel } from '../../src/client/components/common/LocationPanel'

const HINT = 'Bitte Addresse und optional Koordinaten eintragen'

function getMapSrc(): string | null {
  return document.querySelector('iframe')?.getAttribute('src') ?? null
}

describe('LocationPanel', () => {
  it('shows the entry hint and no map when the address is empty', () => {
    render(<LocationPanel title="Einsatzort" address="" lat={null} lng={null} zoom={15} />)
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('treats a whitespace-only address as empty', () => {
    render(<LocationPanel title="Einsatzort" address={'   '} lat={52.5} lng={13.4} zoom={15} />)
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('embeds a map with the URL-encoded address when no position is stored', () => {
    render(<LocationPanel title="Einsatzort" address='Musterstraße 5' lat={null} lng={null} zoom={15} />)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=Musterstra%C3%9Fe%205&z=15&output=embed')
  })

  it('uses the coordinates in the map query when both are present', () => {
    render(<LocationPanel title="Einsatzort" address='Musterstraße 5' lat={52.52} lng={13.405} zoom={17} />)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=52.52,13.405&z=17&output=embed')
  })

  it('falls back to the address when only one of lat/lng is set', () => {
    render(<LocationPanel title="Einsatzort" address='B3, km 12' lat={52.5} lng={null} zoom={14} />)
    expect(getMapSrc()).toBe(`https://maps.google.com/maps?q=${encodeURIComponent('B3, km 12')}&z=14&output=embed`)
  })

  it('falls back to zoom 17 when no zoom is stored', () => {
    render(<LocationPanel title="Einsatzort" address='Musterstraße 5' lat={null} lng={null} />)
    expect(getMapSrc()).toBe('https://maps.google.com/maps?q=Musterstra%C3%9Fe%205&z=17&output=embed')
  })

  it('exposes the numeric position as screen-reader text when lat/lng are set', () => {
    render(<LocationPanel title="Einsatzort" address='Musterstraße 5' lat={52.52} lng={13.405} zoom={17} />)
    expect(screen.getByRole('status')).toHaveTextContent('Musterstraße 5, Position 52.52000, 13.40500')
  })

  it('renders no coordinate readout without a full position', () => {
    render(<LocationPanel title="Einsatzort" address='Musterstraße 5' lat={52.5} lng={null} zoom={17} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
