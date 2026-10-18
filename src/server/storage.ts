import { rename, readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { ulid } from 'ulid'
import { defaultDataFile } from '../shared/constants'
import type { DataFile } from '../shared/types'

// In-process serialization of writes so overlapping save calls cannot
// interleave and leave partial or corrupt state on disk (R3).
// saveChain serialises writes for one DataFile path. Not safe to use from
// multiple DataFile instances in the same process.
let saveChain: Promise<void> = Promise.resolve()

// Coalescing slot: only the latest data snapshot is written when a write is
// already in flight. This prevents the chain from growing unboundedly under
// sustained disk errors (e.g. disk full, EACCES).
let pendingWrite: { dataFile: string; data: DataFile } | null = null

function tmpPath(dataFile: string): string {
  const dir = path.dirname(path.resolve(dataFile))
  return path.join(dir, `data.json.tmp.${process.pid}.${Date.now()}.${ulid()}`)
}

export async function save(dataFile: string, data: DataFile): Promise<void> {
  // Record the latest snapshot. If a write is already queued, it will pick up
  // this data when it runs, coalescing multiple rapid saves into one disk write.
  pendingWrite = { dataFile, data }
  const step = saveChain.then(() => {
    const pending = pendingWrite
    if (!pending) return
    pendingWrite = null
    return doWrite(pending.dataFile, pending.data)
  }, undefined)
  saveChain = step.catch(() => undefined)
  return step
}

async function doWrite(dataFile: string, data: DataFile): Promise<void> {
  const resolved = path.resolve(dataFile)
  const tmp = tmpPath(dataFile)
  const json = JSON.stringify(data, null, 2) + '\n'
  await writeFile(tmp, json, 'utf8')
  try {
    // Atomic replace: readers never see a half-written file.
    await rename(tmp, resolved)
  } catch (err) {
    // Clean up the temp file if the rename failed to avoid accumulation.
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

export async function load(dataFile: string): Promise<DataFile> {
  const resolved = path.resolve(dataFile)
  let raw: string
  try {
    raw = await readFile(resolved, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      // First run: create and seed the data file.
      await ensureSeeded(resolved)
      return defaultDataFile()
    }
    if (err instanceof Error) {
      throw new Error(`Failed to read data.json: ${err.message}`)
    }
    throw err
  }

  let parsed: DataFile | null
  try {
    parsed = JSON.parse(raw) as DataFile
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to parse data.json: ${err.message}`)
    }
    throw err
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('trucks' in parsed) ||
    !('alerts' in parsed) ||
    !('settings' in parsed)
  ) {
    throw new Error(`Invalid data.json structure at ${resolved}`)
  }

  // Data integrity sweep: clear any orphaned triggerAt on non-pending alerts.
  // This prevents ghost slot lockout from partial writes or crashes (R3).
  for (const alert of (parsed as DataFile).alerts) {
    if (alert.status !== 'pending' && alert.triggerAt !== undefined) {
      alert.triggerAt = undefined
    }
  }

  return parsed
}

async function ensureSeeded(dataFile: string): Promise<void> {
  const resolved = path.resolve(dataFile)
  try {
    await mkdir(path.dirname(resolved), { recursive: true })
    await doWrite(resolved, defaultDataFile())
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to seed data.json: ${err.message}`)
    }
    throw err
  }
}
