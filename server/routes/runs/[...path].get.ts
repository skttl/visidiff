import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, resolve, normalize } from 'node:path'
import { getRunsRoot } from '../../utils/runs-root'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
}

export default defineEventHandler((event) => {
  const paramPath = getRouterParam(event, 'path') ?? ''
  const runsRoot = getRunsRoot()
  const filePath = resolve(join(runsRoot, paramPath))

  if (!filePath.startsWith(normalize(runsRoot))) {
    throw createError({ statusCode: 403 })
  }

  const ext = extname(filePath).toLowerCase()
  if (!ext) return

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    throw createError({ statusCode: 404 })
  }

  const mime = MIME[ext] ?? 'application/octet-stream'
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return sendStream(event, createReadStream(filePath))
})
