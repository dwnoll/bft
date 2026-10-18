import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { COLOR_EMERGENCY } from '../../theme'

export type AppView = 'dashboard' | 'admin'

export interface HeaderProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  isAuthenticated?: boolean
  onLogout?: () => void
}

export function Header({
  currentView,
  onViewChange,
  isAuthenticated = false,
  onLogout,
}: HeaderProps) {
  return (
    <AppBar position="static" color="default" sx={{ bgcolor: '#1a1a1a', borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: COLOR_EMERGENCY,
            }}
          />
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
            Einsatzsimulator
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tabs
            value={currentView}
            onChange={(_e, val: AppView) => onViewChange(val)}
            textColor="primary"
            indicatorColor="primary"
            aria-label="Navigation"
          >
            <Tab label="Einsatzmonitor" value="dashboard" />
            <Tab label="Verwaltung" value="admin" />
          </Tabs>

          {currentView === 'admin' && isAuthenticated && onLogout && (
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              onClick={onLogout}
              sx={{ ml: 1 }}
            >
              Abmelden
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  )
}
