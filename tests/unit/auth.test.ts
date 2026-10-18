import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../src/server/middleware/auth'
import { ADMIN_AUTH_REALM, DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS } from '../../src/server/config'

describe('authMiddleware (R4, D2)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BFT_USER
    delete process.env.BFT_PASS
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function createMocks(authHeader?: string) {
    const req = {
      headers: authHeader ? { authorization: authHeader } : {},
    } as unknown as Request

    let statusCode = 200
    let jsonBody: unknown = null
    const headers: Record<string, string> = {}

    const res = {
      status: vi.fn((code: number) => {
        statusCode = code
        return res
      }),
      json: vi.fn((body: unknown) => {
        jsonBody = body
        return res
      }),
      setHeader: vi.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value
        return res
      }),
    } as unknown as Response

    const next = vi.fn() as NextFunction

    return {
      req,
      res,
      next,
      getStatus: () => statusCode,
      getBody: () => jsonBody,
      getHeaders: () => headers,
    }
  }

  it('rejects requests without Authorization header with 401 and WWW-Authenticate', () => {
    const { req, res, next, getStatus, getBody, getHeaders } = createMocks()

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(getStatus()).toBe(401)
    expect(getBody()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    expect(getHeaders()['www-authenticate']).toBe(`Basic realm="${ADMIN_AUTH_REALM}"`)
  })

  it('rejects non-Basic authorization headers with 401', () => {
    const { req, res, next, getStatus } = createMocks('Bearer some-token')

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(getStatus()).toBe(401)
  })

  it('rejects malformed base64 or missing colon with 401', () => {
    const tokenWithoutColon = Buffer.from('invalidformat').toString('base64')
    const { req, res, next, getStatus } = createMocks(`Basic ${tokenWithoutColon}`)

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(getStatus()).toBe(401)
  })

  it('rejects incorrect username or password with 401', () => {
    const badCreds = Buffer.from('wrong_user:wrong_pass').toString('base64')
    const { req, res, next, getStatus } = createMocks(`Basic ${badCreds}`)

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(getStatus()).toBe(401)
  })

  it('accepts default credentials (ffw_bft / bft_2026) and calls next()', () => {
    const creds = Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')
    const { req, res, next, getStatus } = createMocks(`Basic ${creds}`)

    authMiddleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(getStatus()).toBe(200)
  })

  it('respects BFT_USER and BFT_PASS environment variables', () => {
    process.env.BFT_USER = 'custom_admin'
    process.env.BFT_PASS = 'secret_pwd_99'

    // Default creds should now fail
    const defaultCreds = Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')
    const defaultMocks = createMocks(`Basic ${defaultCreds}`)
    authMiddleware(defaultMocks.req, defaultMocks.res, defaultMocks.next)
    expect(defaultMocks.next).not.toHaveBeenCalled()
    expect(defaultMocks.getStatus()).toBe(401)

    // Custom creds should succeed
    const customCreds = Buffer.from('custom_admin:secret_pwd_99').toString('base64')
    const customMocks = createMocks(`Basic ${customCreds}`)
    authMiddleware(customMocks.req, customMocks.res, customMocks.next)
    expect(customMocks.next).toHaveBeenCalledTimes(1)
    expect(customMocks.getStatus()).toBe(200)
  })
})
