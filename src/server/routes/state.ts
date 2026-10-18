import { Router } from 'express'
import type { StateEngine } from '../engine'

export function createStateRouter(engine: StateEngine): Router {
  const router = Router()

  // GET /api/state — Public dashboard polling endpoint (R4, PRD §4, §10)
  router.get('/state', (_req, res) => {
    const state = engine.getState()
    res.json(state)
  })

  return router
}
