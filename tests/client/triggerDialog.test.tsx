import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TriggerDialog } from '../../src/client/components/admin/TriggerDialog'

describe('TriggerDialog', () => {
  it('renders slider and default 3 min delay', () => {
    render(
      <TriggerDialog
        open={true}
        alertName="Wohnungsbrand"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Alarm verzögert auslösen')).toBeInTheDocument()
    expect(screen.getByText('Wohnungsbrand')).toBeInTheDocument()
    expect(screen.getByText('3 Minuten')).toBeInTheDocument()
  })

  it('calls onConfirm with delay when clicking confirm button', () => {
    const onConfirm = vi.fn()
    render(
      <TriggerDialog
        open={true}
        alertName="Wohnungsbrand"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    const confirmBtn = screen.getByRole('button', { name: /Auslösen/i })
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(3)
  })

  it('calls onClose when clicking cancel button', () => {
    const onClose = vi.fn()
    render(
      <TriggerDialog
        open={true}
        alertName="Wohnungsbrand"
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /Abbrechen/i })
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
