import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import fs from 'node:fs'
import path from 'node:path'
import {
  EngineError,
  InvariantError,
  NotFoundError,
  StateEngine,
  ValidationError,
} from './engine'
import { authMiddleware } from './middleware/auth'
import { createAlertsRouter } from './routes/alerts'
import { createFalseAlertRouter } from './routes/falseAlert'
import { createSettingsRouter } from './routes/settings'
import { createStateRouter } from './routes/state'
import { createTrucksRouter } from './routes/trucks'
import { load, save } from './storage'
import { TICK_INTERVAL_MS } from '../shared/constants'

export interface AppOptions {
  staticDir?: string
}

/**
 * Creates and configures the Express application instance.
 */
export function createApp(engine: StateEngine, options: AppOptions = {}): Express {
  const app = express()

  // Security headers: clickjacking, XSS mitigation, content-type sniffing.
  // frame-src allows the embedded Google Maps iframe (LocationPanel) while
  // the remaining default CSP directives stay in effect.
  // upgrade-insecure-requests is disabled: the app is served over plain HTTP
  // on the LAN, and the directive makes browsers rewrite asset requests to
  // https:// for any non-localhost origin, breaking the page.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'frame-src': ['https://maps.google.com', 'https://www.google.com'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  )
  app.use(express.json())

  // --- Public routes ---
  app.use('/api', createStateRouter(engine))

  // --- Protected admin routes (R4) ---
  app.use('/api', authMiddleware, createTrucksRouter(engine))
  app.use('/api', authMiddleware, createAlertsRouter(engine))
  app.use('/api', authMiddleware, createFalseAlertRouter(engine))
  app.use('/api', authMiddleware, createSettingsRouter(engine))

  // --- Static client SPA serving (PRD §1, §10) ---
  const staticDir = options.staticDir ?? path.resolve('dist/client')
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir))
    app.get('*', (req, res, next) => {
      // Don't intercept unmatched API routes
      if (req.path.startsWith('/api')) {
        next()
        return
      }
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  // --- Centralized error handler ---
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code })
      return
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message, code: err.code })
      return
    }
    if (err instanceof InvariantError) {
      res.status(409).json({ error: err.message, code: err.code })
      return
    }
    if (err instanceof EngineError) {
      const status =
        err.code === 'NOT_FOUND' ? 404 : err.code === 'BAD_REQUEST' ? 400 : 409
      res.status(status).json({ error: err.message, code: err.code })
      return
    }

    console.error('Unhandled server error:', err)
    // Never reflect raw exception messages to callers — they may contain
    // filesystem paths or other internal details.
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}

/**
 * Boots the server and background tick interval.
 */
export async function startServer(
  port = Number(process.env.PORT || 3000),
  dataFile = process.env.DATA_FILE || 'data.json',
  staticDir?: string,
) {
  const data = await load(dataFile)
  const engine = new StateEngine(data, {
    persist: (d) => save(dataFile, d),
    now: () => Date.now(),
  })

  // Evaluate any elapsed countdowns on startup (PRD §2)
  engine.tick(Date.now())

  // Periodic tick runner (R3, R17a)
  const timer = setInterval(() => {
    engine.tick(Date.now())
  }, TICK_INTERVAL_MS)

  const app = createApp(engine, { staticDir })
  const server = app.listen(port, () => {
    console.log(`Firealarm Simulator running on http://localhost:${port}`)
  })

  return { server, app, engine, timer }
}

// Auto-start when executed directly
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('server/index.ts') ||
    process.argv[1].endsWith('server/index.js'))

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
