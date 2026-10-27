import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createRostersRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/rosters — list all rosters + activeRosterId (crew_roster PRD §6)
  router.get('/rosters', (_req, res) => {
    res.json({ rosters: engine.rosters, activeRosterId: engine.activeRosterId })
  })

  // POST /api/rosters — create roster (crew_roster PRD §6)
  router.post('/rosters', (req, res, next) => {
    try {
      const { name, assignments } = req.body || {}
      const roster = engine.createRoster({ name, assignments })
      res.status(201).json(roster)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/rosters/:id — update roster (crew_roster PRD §6)
  router.patch('/rosters/:id', (req, res, next) => {
    try {
      const { name, assignments } = req.body || {}
      const roster = engine.updateRoster(req.params.id, { name, assignments })
      res.json(roster)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /api/rosters/:id — delete roster (crew_roster PRD §6)
  // Returns 200 { success: true } to match the trucks/alerts DELETE convention.
  router.delete('/rosters/:id', (req, res, next) => {
    try {
      engine.deleteRoster(req.params.id)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  })

  // POST /api/rosters/:id/activate — activate a roster (crew_roster PRD §6)
  router.post('/rosters/:id/activate', (req, res, next) => {
    try {
      const result = engine.activateRoster(req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/rosters/deactivate — deactivate the active roster (crew_roster PRD §6)
  router.post('/rosters/deactivate', (_req, res) => {
    const result = engine.deactivateRoster()
    res.json(result)
  })

  // POST /api/rosters/:id/random-assign — random assignment (crew_roster PRD §3)
  router.post('/rosters/:id/random-assign', (req, res, next) => {
    try {
      const result = engine.randomAssign(req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  return router
}
