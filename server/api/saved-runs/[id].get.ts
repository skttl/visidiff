import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createError, defineEventHandler, getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id || /[/\\]/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  const manifestPath = join(process.cwd(), 'public', 'runs', id, 'result.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  }
  return JSON.parse(raw)
})
