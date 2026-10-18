import { rename, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { ulid } from 'ulid'
import { defaultDataFile } from '../shared/constants'
import type { DataFile } from '../shared/types'

// In-process serialization of writes so overlapping save calls cannot
// interleave and leave partial or corrupt state on disk (R3).
let saveChain: Promise<void> = Promise.resolve()

function tmpPath(dataFile: string): string {
  const dir = path.dirname(path.resolve(dataFile))
  return path.join(dir, `data.json.tmp.${process.pid}.${Date.now()}.${ulid()}`)
}

export async function save(dataFile: string, data: DataFile): Promise<void> {
  // Queue the write behind any pending writes to guarantee ordering.
  const step = saveChain.then(() => doWrite(dataFile, data), undefined)
  saveChain = step.catch(() => undefined)
  return step
}

async function doWrite(dataFile: string, data: DataFile): Promise<void> {
  const resolved = path.resolve(dataFile)
  const tmp = tmpPath(dataFile)
  const json = JSON.stringify(data, null, 2) + '\n'
  await writeFile(tmp, json, 'utf8')
  // Atomic replace: readers never see a half-written file.
  await rename(tmp, resolved)
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
