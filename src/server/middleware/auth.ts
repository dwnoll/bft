import type { Request, Response, NextFunction } from 'express'
import {
  DEFAULT_ADMIN_USER,
  DEFAULT_ADMIN_PASS,
  ADMIN_AUTH_REALM,
} from '../../shared/constants'

/**
 * Express middleware implementing HTTP Basic Authentication (R4, D2).
 * Reads credentials from `BFT_USER` and `BFT_PASS` environment variables,
 * defaulting to `ffw_bft` / `bft_2026`.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expectedUser = process.env.BFT_USER || DEFAULT_ADMIN_USER
  const expectedPass = process.env.BFT_PASS || DEFAULT_ADMIN_PASS

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', `Basic realm="${ADMIN_AUTH_REALM}"`)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const base64Credentials = authHeader.substring(6).trim()
  let credentials = ''
  try {
    credentials = Buffer.from(base64Credentials, 'base64').toString('utf8')
  } catch {
    res.setHeader('WWW-Authenticate', `Basic realm="${ADMIN_AUTH_REALM}"`)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const colonIndex = credentials.indexOf(':')
  if (colonIndex === -1) {
    res.setHeader('WWW-Authenticate', `Basic realm="${ADMIN_AUTH_REALM}"`)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const user = credentials.substring(0, colonIndex)
  const pass = credentials.substring(colonIndex + 1)

  if (user !== expectedUser || pass !== expectedPass) {
    res.setHeader('WWW-Authenticate', `Basic realm="${ADMIN_AUTH_REALM}"`)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
