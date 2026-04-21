import type { Page } from 'playwright';

export async function injectMask(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  await page.addStyleTag({
    content: `${selectors.join(',')} { background-color: #000 !important; color: transparent !important; }`,
  });
}
