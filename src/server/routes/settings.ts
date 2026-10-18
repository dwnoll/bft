import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createSettingsRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/settings — Get current settings (PRD §9, §10)
  router.get('/settings', (_req, res) => {
    res.json(engine.settings)
  })

  // PATCH /api/settings — Update settings such as soundDurationSec (PRD §9, §10, R17)
  router.patch('/settings', (req, res, next) => {
    try {
      const { soundDurationSec } = req.body || {}
      const settings = engine.updateSettings({ soundDurationSec })
      res.json(settings)
    } catch (err) {
      next(err)
    }
  })

  return router
}
