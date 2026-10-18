import { createTheme, responsiveFontSizes } from '@mui/material/styles'

// Fire station palette (plan: Resolved During Planning, MUI theme tokens).
export const COLOR_BACKGROUND = '#121212'
export const COLOR_SURFACE = '#1e1e1e'
export const COLOR_EMERGENCY = '#d32f2f'
export const COLOR_WARNING = '#ed6c02'
export const COLOR_SUCCESS = '#2e7d32'
export const COLOR_TRUCK_IDLE = '#2c2c2c'
export const COLOR_TRUCK_ACTIVE = COLOR_EMERGENCY

export const theme = responsiveFontSizes(
  createTheme({
    palette: {
      mode: 'dark',
      background: { default: COLOR_BACKGROUND, paper: COLOR_SURFACE },
      primary: { main: COLOR_EMERGENCY, contrastText: '#ffffff' },
      error: { main: COLOR_EMERGENCY },
      warning: { main: COLOR_WARNING },
      success: { main: COLOR_SUCCESS },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
    },
  }),
)
