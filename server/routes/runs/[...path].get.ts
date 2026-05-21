import { createReadStream, existsSync } from 'node:fs'
import { join, extname, resolve, normalize } from 'node:path'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
}

function getRunsRoot(): string {
  const outputPublic = join(process.cwd(), '.output', 'public')
  if (existsSync(outputPublic)) return join(outputPublic, 'runs')
  return join(process.cwd(), 'public', 'runs')
}

export default defineEventHandler((event) => {
  const paramPath = getRouterParam(event, 'path') ?? ''
  const runsRoot = getRunsRoot()
  const filePath = resolve(join(runsRoot, paramPath))

  if (!filePath.startsWith(normalize(runsRoot))) {
    throw createError({ statusCode: 403 })
  }

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404 })
  }

  const ext = extname(filePath).toLowerCase()
  const mime = MIME[ext] ?? 'application/octet-stream'
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return sendStream(event, createReadStream(filePath))
})
