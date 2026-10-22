import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, vi } from 'vitest'
import { apiClient } from '../../src/client/api/client'
import { TruckManager } from '../../src/client/components/admin/TruckManager'
import { ToastProvider } from '../../src/client/components/common/ToastContainer'
import { trucks } from './fixtures'

describe('debug', () => {
  it('inspects select element', () => {
    vi.spyOn(apiClient, 'createTruck').mockResolvedValue({
      id: 't6',
      name: 'GW-L2',
      category: 'Trupp',
    })
    render(
      <ToastProvider>
        <TruckManager trucks={trucks} onRefresh={vi.fn()} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Neues Fahrzeug' }))

    const el = screen.getByLabelText(/Kategorie/i)
    console.log('TAG:', el.tagName)
    console.log('HTML:', el.outerHTML.slice(0, 400))
    const inst = Object.getOwnPropertyDescriptor(el, 'value')
    const proto = Object.getPrototypeOf(el)
    const protoDesc = Object.getOwnPropertyDescriptor(proto, 'value')
    console.log('instance desc:', inst && Object.keys(inst))
    console.log('proto:', proto && proto.constructor && proto.constructor.name)
    console.log('proto desc:', protoDesc && Object.keys(protoDesc))
    const selects = document.querySelectorAll('select')
    console.log('select count:', selects.length)
  })
})
