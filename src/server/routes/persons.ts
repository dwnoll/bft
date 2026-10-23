import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createPersonsRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/persons — List all persons (crew_roster PRD §6)
  router.get('/persons', (_req, res) => {
    res.json(engine.persons)
  })

  return router
}
