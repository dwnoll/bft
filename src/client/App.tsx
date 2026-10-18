import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { Dashboard } from './components/dashboard/Dashboard'
import { theme } from './theme'

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Dashboard />
    </ThemeProvider>
  )
}
