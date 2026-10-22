import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createTrucksRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/trucks — List all trucks (PRD §5, §10)
  router.get('/trucks', (_req, res) => {
    res.json(engine.trucks)
  })

  // POST /api/trucks — Create truck (PRD §5, §10)
  router.post('/trucks', (req, res, next) => {
    try {
      const { name, category } = req.body || {}
      const truck = engine.createTruck({ name, category })
      res.status(201).json(truck)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/trucks/:id — Update truck (PRD §5, §10)
  router.patch('/trucks/:id', (req, res, next) => {
    try {
      const { name, category } = req.body || {}
      const truck = engine.updateTruck(req.params.id, { name, category })
      res.json(truck)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /api/trucks/:id — Delete truck (PRD §5, §10, R6)
  router.delete('/trucks/:id', (req, res, next) => {
    try {
      engine.deleteTruck(req.params.id)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
