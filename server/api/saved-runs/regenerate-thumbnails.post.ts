import { join } from 'node:path'
import { readdir, readFile, unlink } from 'node:fs/promises'
import { defineEventHandler } from 'h3'
import { generateThumbnail } from '../../utils/diff'
import { getRunsRoot } from '../../utils/runs-root'

export default defineEventHandler(async () => {
  const runsRoot = getRunsRoot()
  let entries: string[]
  try {
    entries = await readdir(runsRoot)
  } catch {
    return { regenerated: 0, failed: 0 }
  }

  let regenerated = 0
  let failed = 0

  await Promise.all(
    entries.map(async (id) => {
      const runDir = join(runsRoot, id)
      const manifestPath = join(runDir, 'result.json')
      const thumbPath = join(runDir, 'thumbnail.png')

      let data: any
      try {
        const raw = await readFile(manifestPath, 'utf8')
        data = JSON.parse(raw)
      } catch {
        return
      }

      if (!Array.isArray(data.results) || data.results.length === 0) return

      try { await unlink(thumbPath) } catch {}

      const thumbResult = data.results.find((r: any) => r.pagePath === '/') ?? data.results[0]
      const aFile = join(runsRoot, id, thumbResult.files.a.replace(`/runs/${id}/`, ''))
      const bFile = join(runsRoot, id, thumbResult.files.b.replace(`/runs/${id}/`, ''))

      try {
        await generateThumbnail(aFile, bFile, thumbPath)
        regenerated++
      } catch {
        failed++
      }
    })
  )

  return { regenerated, failed }
})
