import Alert, { type AlertColor } from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export interface ToastMessage {
  id: number
  message: string
  severity: AlertColor
  durationMs?: number
}

export interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor, durationMs?: number) => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showWarning: (message: string) => void
  showInfo: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}

let toastIdCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, severity: AlertColor = 'info', durationMs: number = 4000) => {
      const id = ++toastIdCounter
      setToasts((prev) => [...prev, { id, message, severity, durationMs }])
    },
    [],
  )

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast])
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const showWarning = useCallback((message: string) => showToast(message, 'warning'), [showToast])
  const showInfo = useCallback((message: string) => showToast(message, 'info'), [showToast])

  const contextValue = useMemo(
    () => ({
      showToast,
      showSuccess,
      showError,
      showWarning,
      showInfo,
    }),
    [showToast, showSuccess, showError, showWarning, showInfo],
  )

  // Current active toast is the first in queue
  const currentToast = toasts[0] ?? null

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {currentToast && (
        <Snackbar
          key={currentToast.id}
          open={true}
          autoHideDuration={currentToast.durationMs}
          onClose={(_event, reason) => {
            if (reason !== 'clickaway') {
              removeToast(currentToast.id)
            }
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={currentToast.severity}
            onClose={() => removeToast(currentToast.id)}
            variant="filled"
            role="status"
            aria-live="polite"
            sx={{ width: '100%', minWidth: 280 }}
          >
            {currentToast.message}
          </Alert>
        </Snackbar>
      )}
    </ToastContext.Provider>
  )
}
