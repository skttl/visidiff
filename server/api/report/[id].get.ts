import { join } from 'node:path'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import { chromium } from 'playwright'
import { buildReportHtml, type ReportManifest, type ReportLocale } from '../../utils/report'
import { getRunsRoot } from '../../utils/runs-root'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!id || /[/\\]/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const { lang } = getQuery(event)
  const locale: ReportLocale = lang === 'da' ? 'da' : 'en'

  const runsRoot = getRunsRoot()
  const manifestPath = join(runsRoot, id, 'result.json')

  let manifest: ReportManifest
  try {
    const raw = await readFile(manifestPath, 'utf8')
    manifest = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  }

  const thumbnailPath = join(runsRoot, id, 'thumbnail.png')
  const html = await buildReportHtml(manifest, runsRoot, thumbnailPath, locale)

  const tmpFile = join(tmpdir(), `visidiff-report-${id}-${Date.now()}.html`)
  await writeFile(tmpFile, html, 'utf8')

  const browser = await chromium.launch({ headless: true })
  let pdfBuf: Buffer
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(0)
    page.setDefaultNavigationTimeout(0)
    await page.goto(`file://${tmpFile}`, { waitUntil: 'domcontentloaded', timeout: 0 })
    pdfBuf = Buffer.from(await page.pdf({
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    }))
  } finally {
    await browser.close()
    await unlink(tmpFile).catch(() => {})
  }

  const filename = `visidiff-report-${id}.pdf`
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Content-Length', pdfBuf.length)

  return pdfBuf
})
