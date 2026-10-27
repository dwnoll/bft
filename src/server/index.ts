import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import fs from 'node:fs'
import { rename } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import type { Server } from 'node:http'
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
import { createPersonsRouter } from './routes/persons'
import { createRostersRouter } from './routes/rosters'
import { createSettingsRouter } from './routes/settings'
import { createStateRouter } from './routes/state'
import { createTrucksRouter } from './routes/trucks'
import { flush, load, save } from './storage'
import { TICK_INTERVAL_MS, defaultDataFile } from '../shared/constants'
import type { DataFile } from '../shared/types'

export interface AppOptions {
  staticDir?: string
  /** When true the app is being served over HTTPS; enables CSP upgrade-insecure-requests. */
  httpsEnabled?: boolean
}

/**
 * Creates and configures the Express application instance.
 */
export function createApp(engine: StateEngine, options: AppOptions = {}): Express {
  const app = express()

  // Security headers: clickjacking, XSS mitigation, content-type sniffing.
  // frame-src allows the embedded Google Maps iframe (LocationPanel) while
  // the remaining default CSP directives stay in effect.
  // upgrade-insecure-requests is disabled for plain HTTP: the directive makes
  // browsers rewrite asset requests to https:// for non-localhost origins,
  // breaking the page on LAN. Re-enable it when the server itself runs HTTPS.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'frame-src': ['https://maps.google.com', 'https://www.google.com'],
          ...(options.httpsEnabled ? {} : { 'upgrade-insecure-requests': null }),
        },
      },
    }),
  )
  // Bound the JSON body size so an oversized request yields a clean 413
  // (payload too large) rather than failing deep in the parser.
  app.use(express.json({ limit: '256kb' }))

  // --- Public routes ---
  app.use('/api', createStateRouter(engine))

  // --- Protected admin routes (R4) ---
  app.use('/api', authMiddleware, createTrucksRouter(engine))
  app.use('/api', authMiddleware, createAlertsRouter(engine))
  app.use('/api', authMiddleware, createFalseAlertRouter(engine))
  app.use('/api', authMiddleware, createSettingsRouter(engine))
  app.use('/api', authMiddleware, createPersonsRouter(engine))
  app.use('/api', authMiddleware, createRostersRouter(engine))

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
    // Respect the HTTP status carried by middleware errors (body-parser and
    // other http-errors). Without this, an oversized body (413 entity.too.large)
    // would be masked as a 500 below. These messages are safe to surface.
    const httpStatus = (err as { status?: unknown } | null)?.status
    if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      const message = httpStatus === 413 ? 'Request body too large' : 'Bad Request'
      res.status(httpStatus).json({ error: message })
      return
    }
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

const CERT_DIR = 'certs'
const CERT_FILE = path.join(CERT_DIR, 'bft-server.crt')
const KEY_FILE = path.join(CERT_DIR, 'bft-server.key')

/** Returns TLS options when cert+key are present in the certs/ folder, otherwise undefined. */
function loadTlsOptions(): { cert: Buffer; key: Buffer; minVersion: 'TLSv1.3' } | undefined {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return {
      cert: fs.readFileSync(CERT_FILE),
      key: fs.readFileSync(KEY_FILE),
      minVersion: 'TLSv1.3',
    }
  }
  return undefined
}

/**
 * Boots the server and background tick interval.
 * Runs HTTPS on port 8443 (default) when certs/bft-server.crt and
 * certs/bft-server.key exist, otherwise HTTP on port 8080 (default).
 * The PORT env var overrides whichever default is active.
 */
export async function startServer(
  port?: number,
  dataFile = process.env.DATA_FILE || 'data.json',
  staticDir?: string,
) {
  const tls = loadTlsOptions()
  const httpsEnabled = tls !== undefined
  const defaultPort = httpsEnabled ? 8443 : 8080
  const resolvedPort = port ?? Number(process.env.PORT || defaultPort)
  // A corrupt or unreadable data.json must not permanently block startup
  // (boot DoS). Preserve the corrupt file for inspection, re-seed fresh, and
  // continue so the app recovers instead of staying dead.
  let data: DataFile
  try {
    data = await load(dataFile)
  } catch (err) {
    console.error('data.json is corrupt or unreadable; backing it up and re-seeding fresh.', err)
    await backupCorruptFile(dataFile)
    data = defaultDataFile()
    // Best-effort: persist the re-seeded state so future boots don't hit the
    // corrupt file. If the disk is not writable, keep serving in-memory.
    await save(dataFile, data).catch((e) =>
      console.error('Failed to persist re-seeded data.json (continuing in-memory):', e),
    )
  }

  const engine = new StateEngine(data, {
    persist: (d) => save(dataFile, d),
    now: () => Date.now(),
  })

  // Evaluate any elapsed countdowns on startup (PRD §2). A malformed persisted
  // alert must not crash the boot — the periodic tick below re-evaluates each
  // second and the condition either self-heals or is logged.
  try {
    engine.tick(Date.now())
  } catch (err) {
    console.error('Error during initial tick (continuing startup):', err)
  }

  // Periodic tick runner (R3, R17a). A throwing tick must never crash the
  // process (e.g. a malformed persisted alert).
  const timer = setInterval(() => {
    try {
      engine.tick(Date.now())
    } catch (err) {
      console.error('Error in tick loop:', err)
    }
  }, TICK_INTERVAL_MS)

  const app = createApp(engine, { staticDir, httpsEnabled })
  const server: Server = httpsEnabled
    ? https.createServer(tls!, app).listen(resolvedPort, () => {
        console.log(`Firealarm Simulator running on https://localhost:${resolvedPort}`)
      })
    : http.createServer(app).listen(resolvedPort, () => {
        console.log(`Firealarm Simulator running on http://localhost:${resolvedPort}`)
      })

  attachShutdownHandlers(server, timer)

  return { server, app, engine, timer }
}

/**
 * Best-effort rename of a corrupt data file to a timestamped backup so it can be
 * inspected or recovered. Never throws — a failed backup must not block startup.
 */
async function backupCorruptFile(dataFile: string): Promise<void> {
  const resolved = path.resolve(dataFile)
  try {
    await rename(resolved, `${resolved}.corrupt-${Date.now()}`)
  } catch {
    // Best-effort: if the file cannot be moved, continue with the re-seed.
  }
}

/**
 * Graceful shutdown on SIGINT/SIGTERM: clear the tick timer, stop accepting new
 * connections, await a final persist flush, then exit. Prevents hangs under
 * Docker/PM2 and avoids losing an in-flight fire-and-forget write.
 */
function attachShutdownHandlers(server: Server, timer: NodeJS.Timeout): void {
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`Received ${signal}; shutting down gracefully...`)
    clearInterval(timer)

    // server.close() stops accepting new connections and waits for in-flight
    // requests to finish. Guard against a hung keep-alive with a hard deadline.
    let resolveClose: () => void
    const closeDone = new Promise<void>((resolve) => {
      resolveClose = resolve
      server.close(() => resolve())
    })
    const deadline = setTimeout(() => resolveClose(), 5000)

    void Promise.allSettled([closeDone, flush()]).then(() => {
      clearTimeout(deadline)
      process.exit(0)
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
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
