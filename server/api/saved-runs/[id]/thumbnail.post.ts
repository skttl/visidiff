import { join } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { generateThumbnail } from '../../../utils/diff'
import { getRunsRoot } from '../../../utils/runs-root'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id || /[/\\]/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const runsRoot = getRunsRoot()
  const runDir = join(runsRoot, id)
  const thumbPath = join(runDir, 'thumbnail.png')

  try {
    await access(thumbPath)
    return { ok: true }
  } catch {}

  const manifestPath = join(runDir, 'result.json')
  let data: any
  try {
    const raw = await readFile(manifestPath, 'utf8')
    data = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  }

  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'No results to generate thumbnail from' })
  }

  const thumbResult = data.results.find((r: any) => r.pagePath === '/') ?? data.results[0]
  const aFile = join(runsRoot, id, thumbResult.files.a.replace(`/runs/${id}/`, ''))
  const bFile = join(runsRoot, id, thumbResult.files.b.replace(`/runs/${id}/`, ''))

  try {
    await generateThumbnail(aFile, bFile, thumbPath)
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err?.message || 'Failed to generate thumbnail' })
  }

  return { ok: true }
})
