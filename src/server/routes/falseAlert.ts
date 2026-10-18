import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createFalseAlertRouter(engine: StateEngine): Router {
  const router = Router()

  // POST /api/false-alert — Trigger one-shot false alarm drill (PRD §7, §8, §10, R15)
  router.post('/false-alert', (_req, res, next) => {
    try {
      const result = engine.triggerFalseAlert()
      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  })

  return router
}
