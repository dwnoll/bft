import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsCard } from '../../src/client/components/admin/SettingsCard'

describe('SettingsCard', () => {
  it('renders initial sound duration and updates on submit', () => {
    const onSave = vi.fn()
    render(<SettingsCard initialDurationSec={60} onSave={onSave} />)

    expect(screen.getByText('Einstellungen')).toBeInTheDocument()
    const input = screen.getByLabelText(/Dauer Warnton/i)
    expect(input).toHaveValue(60)

    fireEvent.change(input, { target: { value: '90' } })
    const submitBtn = screen.getByRole('button', { name: 'Speichern' })
    fireEvent.click(submitBtn)

    expect(onSave).toHaveBeenCalledWith(90)
  })

  it('rejects invalid duration', () => {
    const onSave = vi.fn()
    render(<SettingsCard initialDurationSec={60} onSave={onSave} />)

    const input = screen.getByLabelText(/Dauer Warnton/i)
    fireEvent.change(input, { target: { value: '0' } })

    const submitBtn = screen.getByRole('button', { name: 'Speichern' })
    fireEvent.click(submitBtn)

    expect(onSave).not.toHaveBeenCalled()
  })
})
