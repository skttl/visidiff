import { join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  const runsDir = join(process.cwd(), 'public', 'runs')
  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    return []
  }

  const manifests = await Promise.all(
    entries.map(async (id) => {
      const manifestPath = join(runsDir, id, 'result.json')
      try {
        await stat(manifestPath)
        const raw = await readFile(manifestPath, 'utf8')
        const data = JSON.parse(raw)
        return {
          id: data.id ?? id,
          savedAt: data.savedAt ?? 0,
          input: data.input,
          totalPercent: data.totalPercent ?? null,
          resultCount: Array.isArray(data.results) ? data.results.length : 0
        }
      } catch {
        return null
      }
    })
  )

  return manifests
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.savedAt - a.savedAt)
})
