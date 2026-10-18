import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createAlertsRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/alerts — List all planned alerts (PRD §6, §10)
  router.get('/alerts', (_req, res) => {
    res.json(engine.alerts)
  })

  // POST /api/alerts — Create planned alert (PRD §6, §10)
  router.post('/alerts', (req, res, next) => {
    try {
      const { name, category, address, info, notes, truckIds } = req.body || {}
      const alert = engine.createAlert({
        name,
        category,
        address,
        info,
        notes,
        truckIds,
      })
      res.status(201).json(alert)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/alerts/:id — Update planned alert (PRD §6, §10)
  router.patch('/alerts/:id', (req, res, next) => {
    try {
      const { name, category, address, info, notes, truckIds } = req.body || {}
      const alert = engine.updateAlert(req.params.id, {
        name,
        category,
        address,
        info,
        notes,
        truckIds,
      })
      res.json(alert)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /api/alerts/:id — Delete planned alert (PRD §6, §10, R14)
  router.delete('/alerts/:id', (req, res, next) => {
    try {
      engine.deleteAlert(req.params.id)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  })

  // POST /api/alerts/:id/trigger — Arm delayed trigger (PRD §6, §7, §10, R9)
  router.post('/alerts/:id/trigger', (req, res, next) => {
    try {
      const { delayMinutes } = req.body || {}
      const alert = engine.armTrigger(req.params.id, delayMinutes)
      res.json(alert)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/alerts/:id/cancel-trigger — Cancel pending trigger (PRD §6, §10, R9)
  router.post('/alerts/:id/cancel-trigger', (req, res, next) => {
    try {
      const alert = engine.cancelTrigger(req.params.id)
      res.json(alert)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/alerts/:id/complete — Manually complete active alert (PRD §6, §7, §10, R13)
  router.post('/alerts/:id/complete', (req, res, next) => {
    try {
      const alert = engine.completeAlert(req.params.id)
      res.json(alert)
    } catch (err) {
      next(err)
    }
  })

  return router
}
