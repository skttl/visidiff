import type { Page } from 'playwright';

export async function waitForPageStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await page.waitForTimeout(200);
}
