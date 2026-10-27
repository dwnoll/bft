import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp, startServer } from '../../src/server/index'
import { StateEngine } from '../../src/server/engine'
import { DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS } from '../../src/server/config'
import { defaultDataFile } from '../../src/shared/constants'

const authHeader = `Basic ${Buffer.from(`${DEFAULT_ADMIN_USER}:${DEFAULT_ADMIN_PASS}`).toString('base64')}`

describe('request body limit', () => {
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    const engine = new StateEngine(defaultDataFile(), { persist: async () => {}, now: () => 0 })
    server = http.createServer(createApp(engine))
    await new Promise<void>((resolve) => server.listen(0, resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('returns 413 (not 500) for a body above 256kb', async () => {
    const res = await fetch(`${baseUrl}/api/trucks`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(300 * 1024), category: 'Trupp' }),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'Request body too large' })
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/api/trucks`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: '{ not json',
    })
    expect(res.status).toBe(400)
  })
})

describe('startServer corrupt data.json recovery', () => {
  let tmpDir: string
  let file: string
  let started: Awaited<ReturnType<typeof startServer>> | undefined

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bft-boot-'))
    file = path.join(tmpDir, 'data.json')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    if (started) {
      clearInterval(started.timer)
      await new Promise<void>((resolve) => started!.server.close(() => resolve()))
      started = undefined
    }
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')
    vi.restoreAllMocks()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('backs up unparsable data.json, re-seeds and boots', async () => {
    writeFileSync(file, '{ broken json ]')
    started = await startServer(0, file)

    expect(started.engine.trucks).toHaveLength(5)
    const files = readdirSync(tmpDir)
    expect(files.some((f) => f.startsWith('data.json.corrupt-'))).toBe(true)
    // fresh, valid file written in place of the corrupt one
    expect(() => JSON.parse(readFileSync(file, 'utf8'))).not.toThrow()
  })

  it('recovers from structurally corrupt data (non-array alerts)', async () => {
    writeFileSync(
      file,
      JSON.stringify({ trucks: [], alerts: { nope: true }, settings: { soundDurationSec: 60 } }),
    )
    started = await startServer(0, file)

    expect(Array.isArray(started.engine.alerts)).toBe(true)
    expect(readdirSync(tmpDir).some((f) => f.includes('.corrupt-'))).toBe(true)
  })
})

describe('graceful shutdown', () => {
  it('clears the tick timer, closes the server, flushes and exits 0 on SIGTERM', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'bft-shutdown-'))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    process.removeAllListeners('SIGTERM')

    const { server, timer } = await startServer(0, path.join(tmpDir, 'data.json'))
    try {
      process.emit('SIGTERM')
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
      expect(clearSpy).toHaveBeenCalledWith(timer)
      expect(server.listening).toBe(false)
    } finally {
      clearInterval(timer)
      process.removeAllListeners('SIGINT')
      process.removeAllListeners('SIGTERM')
      vi.restoreAllMocks()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
