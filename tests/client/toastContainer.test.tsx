import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from '../../src/client/components/common/ToastContainer'

function Trigger() {
  const { showSuccess } = useToast()
  return <button onClick={() => showSuccess('Gespeichert')}>go</button>
}

describe('ToastContainer a11y', () => {
  it('announces toasts politely (role=status, aria-live=polite), not as an assertive alert', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    act(() => screen.getByText('go').click())

    const toast = screen.getByText('Gespeichert').closest('[aria-live]')
    expect(toast).toHaveAttribute('role', 'status')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
