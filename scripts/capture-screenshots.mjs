import { chromium } from 'playwright'
import { mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '..', 'docs', 'screenshots')
await mkdir(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

await page.goto('http://visidiff.localhost:3000/')
await page.waitForLoadState('networkidle')

// 1. Settings modal open on first visit
await page.waitForSelector('[data-testid="modal-settings"]', { timeout: 5000 }).catch(() => null)
const modalAlreadyOpen = await page.locator('[data-testid="modal-settings"]').isVisible().catch(() => false)
if (!modalAlreadyOpen) {
  await page.click('[data-testid="btn-settings"]')
  await page.waitForSelector('[data-testid="modal-settings"]')
}
await page.screenshot({ path: join(out, '01-settings-modal.png'), fullPage: false })
await page.click('[data-testid="modal-settings"] button:has-text("Close")')
await page.waitForSelector('[data-testid="modal-settings"]', { state: 'hidden' })

// 2. Idle state (no run yet)
await page.screenshot({ path: join(out, '02-idle.png'), fullPage: false })

// 3. Open settings, fill the form, and submit a live run
console.log('Filling form and starting live run…')
await page.click('[data-testid="btn-settings"]')
await page.waitForSelector('[data-testid="modal-settings"]')

// Fill URL A — triple-click then type to trigger Vue v-model reactivity
const urlAInput = page.locator('input[placeholder="https://example.com"]')
await urlAInput.click({ clickCount: 3 })
await urlAInput.type('https://example.com')

// Fill URL B
const urlBInput = page.locator('input[placeholder="https://example.org"]')
await urlBInput.click({ clickCount: 3 })
await urlBInput.type('https://example.org')

await page.screenshot({ path: join(out, '03-form-filled.png'), fullPage: false })

// Click Run diff
await page.click('button:has-text("Run diff")')
await page.waitForSelector('[data-testid="modal-settings"]', { state: 'hidden' })

// Wait for running state
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="run-status"]')
  return el && (el.textContent?.trim() === 'running' || el.textContent?.trim() === 'done')
}, { timeout: 60000 })
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, '04-running.png'), fullPage: false })

// Wait for done
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="run-status"]')
  return el && el.textContent?.trim() === 'done'
}, { timeout: 120000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '05-results.png'), fullPage: false })

// 4. Expand the first result row (rows have data-testid="result-row-<pagePath>")
const firstRow = page.locator('tr[data-testid^="result-row-"]').first()
if (await firstRow.count() > 0) {
  await firstRow.click()
  await page.waitForTimeout(600)
}
await page.screenshot({ path: join(out, '06-result-expanded.png'), fullPage: false })

// 5. Saved runs modal
await page.click('[data-testid="btn-saved-runs"]')
await page.waitForSelector('[data-testid="modal-saved-runs"]')
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, '07-saved-runs-modal.png'), fullPage: false })
await page.keyboard.press('Escape')

await browser.close()
console.log('Screenshots saved to docs/screenshots/')
