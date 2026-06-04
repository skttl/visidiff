import { join } from 'node:path'
import { readdir, readFile, stat, access } from 'node:fs/promises'
import { defineEventHandler } from 'h3'
import { getRunsRoot } from '../../utils/runs-root'

export default defineEventHandler(async () => {
  const runsDir = getRunsRoot()
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
        const thumbPath = join(runsDir, id, 'thumbnail.png')
        let thumbnail: string | null = null
        try {
          await access(thumbPath)
          thumbnail = `/runs/${id}/thumbnail.png`
        } catch {}
        return {
          id: data.id ?? id,
          savedAt: data.savedAt ?? 0,
          input: data.input,
          totalPercent: data.totalPercent ?? null,
          resultCount: Array.isArray(data.results) ? data.results.length : 0,
          thumbnail
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
