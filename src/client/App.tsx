import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { useState } from 'react'
import { apiClient } from './api/client'
import { AdminLayout } from './components/admin/AdminLayout'
import { Header, type AppView } from './components/common/Header'
import { ToastProvider } from './components/common/ToastContainer'
import { Dashboard } from './components/dashboard/Dashboard'
import { theme } from './theme'

export function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => apiClient.isAuthenticated())

  const handleViewChange = (view: AppView) => {
    setCurrentView(view)
    setIsAuthenticated(apiClient.isAuthenticated())
  }

  const handleLogout = () => {
    apiClient.clearCredentials()
    setIsAuthenticated(false)
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
        <Header
          currentView={currentView}
          onViewChange={handleViewChange}
          isAuthenticated={isAuthenticated}
          onLogout={handleLogout}
        />
        {currentView === 'dashboard' ? (
          <Dashboard />
        ) : (
          <AdminLayout
            isAuthenticated={isAuthenticated}
            onAuthenticatedChange={setIsAuthenticated}
            onLogout={handleLogout}
          />
        )}
      </ToastProvider>
    </ThemeProvider>
  )
}
