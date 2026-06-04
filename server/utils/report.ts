import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

export type ReportLocale = 'en' | 'da'

const translations = {
  en: {
    htmlLang: 'en',
    coverTitle: 'Visual Regression Report',
    overallDiff: 'Overall diff',
    pages: 'Pages',
    viewports: 'Viewports',
    generated: 'Generated',
    methodTitle: 'How the diff works',
    methodSubtitle: 'VisiDiff uses pixel-level comparison to detect visual regressions between two environments.',
    step1Num: 'Step 1',
    step1Title: 'Full-page capture',
    step1Body: 'Headless Chromium opens each URL at the specified viewport width. The page is auto-scrolled to trigger lazy-loaded images and dynamic content before a full-page screenshot is taken.',
    step2Num: 'Step 2',
    step2Title: 'Pixel comparison',
    step2Body: 'Screenshots A and B are compared pixel-by-pixel using <strong>pixelmatch</strong>. Each pixel is evaluated in a perceptual colour space (YIQ) with a configurable threshold to reduce noise from anti-aliasing and sub-pixel rendering.',
    step3Num: 'Step 3',
    step3Title: 'Diff percentage',
    step3Body: 'The number of mismatched pixels is divided by the total pixel count of the larger screenshot. This gives a percentage that represents the proportion of the page that changed visually.',
    step4Num: 'Step 4',
    step4Title: 'Diff image',
    step4Body: 'A diff PNG is produced where unchanged areas are shown at reduced opacity and changed pixels are highlighted in magenta/pink. The brighter the highlight, the greater the local difference.',
    legendTitle: 'Diff percentage thresholds used in this report',
    legendGreen: '&lt; 1% — No significant change',
    legendYellow: '1–5% — Minor differences',
    legendRed: '&gt; 5% — Notable regression',
    legendGray: '&lt; 0.1% — Omitted from diff pages (listed in summary)',
    methodNote: (vp: string, date: string) => `Each page in this report was captured at ${vp}. Screenshots were taken at ${date}.`,
    causesTitle: 'Typical causes of differences',
    negligibleHeader: 'Negligible &amp; expected',
    significantHeader: 'Worth investigating',
    cause_dynamicTitle: 'Dynamic content',
    cause_dynamicBody: 'Dates, counters, personalised text, or A/B test variants differ between environments. These are content differences, not layout regressions.',
    cause_videosTitle: 'Videos',
    cause_videosBody: 'A video element is captured at whichever frame it happens to be on at screenshot time. Both screenshots are rarely in sync, producing a diff on the video area.',
    cause_animationsTitle: 'Animations &amp; transitions',
    cause_animationsBody: 'CSS animations, carousels, or entrance transitions may be mid-frame when the screenshot is taken. The resulting diff is a timing artifact, not a regression.',
    cause_subpixelTitle: 'Sub-pixel rendering',
    cause_subpixelBody: 'Text and edges are rendered using fractions of a pixel, coloured differently depending on the surrounding CSS. Small changes in font size, weight, or colour can shift how sub-pixels are painted, producing faint pixel-level noise with no visible impact.',
    cause_cssTitle: 'CSS differences',
    cause_cssBody: 'The primary signal. Layout shifts, colour changes, missing styles, or broken responsive behaviour indicate that CSS is diverging between environments. These should behave identically.',
    cause_assetsTitle: 'Missing or broken assets',
    cause_assetsBody: 'A broken image, missing icon font, or failed script can cause large sections of the page to render differently. Look for empty boxes or unstyled areas in the diff image.',
    cause_cookieTitle: 'Unblocked cookie or consent banners',
    cause_cookieBody: 'VisiDiff blocks known consent scripts by glob pattern before capture. If a banner still appears, the blocking globs need to be extended — the overlay will cover content and inflate the diff.',
    cause_fontTitle: 'Font loading (FOUT)',
    cause_fontBody: 'Web fonts should be fully loaded before the screenshot is taken. If a fallback system font appears, the page did not load correctly — treat this as a rendering failure worth investigating.',
    cause_imagesTitle: 'Missing images',
    cause_imagesBody: 'VisiDiff auto-scrolls and waits before screenshotting so lazy-loaded images have time to appear. A missing or broken image in the diff is a real asset failure, not a timing artifact.',
    cause_jsTitle: 'JavaScript errors',
    cause_jsBody: 'A script failure in one environment may prevent a component from rendering or leave the page in a broken state, creating large visible differences.',
    unchangedTitle: 'Unchanged pages',
    unchangedSub: (n: number) => `${n} page${n !== 1 ? 's' : ''} with &lt;0.1% average diff — no visual changes detected`,
    colTitle: 'Title',
    colPath: 'Path',
    colAvgDiff: 'Avg diff',
    original: 'original',
    diffLabel: 'diff',
  },
  da: {
    htmlLang: 'da',
    coverTitle: 'Visuelt regressionsrapport',
    overallDiff: 'Samlet forskel',
    pages: 'Sider',
    viewports: 'Viewports',
    generated: 'Genereret',
    methodTitle: 'Sådan fungerer diff\'en',
    methodSubtitle: 'VisiDiff bruger pixelniveau-sammenligning til at opdage visuelle regressioner mellem to miljøer.',
    step1Num: 'Trin 1',
    step1Title: 'Fuld-side screenshot',
    step1Body: 'Headless Chromium åbner hver URL ved den angivne viewport-bredde. Siden rulles automatisk ned for at udløse lazy-loadede billeder og dynamisk indhold, inden et fuld-side screenshot tages.',
    step2Num: 'Trin 2',
    step2Title: 'Pixel-sammenligning',
    step2Body: 'Screenshots A og B sammenlignes pixel for pixel med <strong>pixelmatch</strong>. Hver pixel evalueres i et perceptuelt farverum (YIQ) med en konfigurerbar tærskel for at reducere støj fra anti-aliasing og sub-pixel-rendering.',
    step3Num: 'Trin 3',
    step3Title: 'Forskelsprocentage',
    step3Body: 'Antallet af uoverensstemmende pixels divideres med det samlede antal pixels i det største screenshot. Dette giver en procentdel, der repræsenterer den andel af siden, der har ændret sig visuelt.',
    step4Num: 'Trin 4',
    step4Title: 'Diff-billede',
    step4Body: 'Et diff-PNG produceres, hvor uændrede områder vises med reduceret opacitet og ændrede pixels fremhæves i magenta/lyserød. Jo lysere fremhævningen er, jo større er den lokale forskel.',
    legendTitle: 'Forkelstærskler brugt i denne rapport',
    legendGreen: '&lt; 1% — Ingen væsentlig ændring',
    legendYellow: '1–5% — Mindre forskelle',
    legendRed: '&gt; 5% — Bemærkelsesværdig regression',
    legendGray: '&lt; 0,1% — Udeladt fra diff-sider (vist i oversigt)',
    methodNote: (vp: string, date: string) => `Hver side i denne rapport blev optaget ved ${vp}. Screenshots blev taget den ${date}.`,
    causesTitle: 'Typiske årsager til forskelle',
    negligibleHeader: 'Ubetydelige &amp; forventede',
    significantHeader: 'Værd at undersøge',
    cause_dynamicTitle: 'Dynamisk indhold',
    cause_dynamicBody: 'Datoer, tællere, personaliseret tekst eller A/B-testvarianter adskiller sig mellem miljøer. Dette er indholdsforskelle, ikke layoutregressioner.',
    cause_videosTitle: 'Videoer',
    cause_videosBody: 'Et videoelement optages ved det frame, det tilfældigvis befinder sig på under screenshottet. Begge screenshots er sjældent synkroniserede, hvilket giver en forskel i videoområdet.',
    cause_animationsTitle: 'Animationer &amp; overgange',
    cause_animationsBody: 'CSS-animationer, karruseller eller indgangsovergange kan være midt i en frame, når screenshottet tages. Den resulterende forskel er en timingfejl, ikke en regression.',
    cause_subpixelTitle: 'Sub-pixel-rendering',
    cause_subpixelBody: 'Tekst og kanter renderes ved hjælp af brøkdele af en pixel, der farves forskelligt afhængigt af den omgivende CSS. Små ændringer i skriftstørrelse, vægt eller farve kan ændre, hvordan sub-pixels males, og producere svag pixelniveaustøj uden synlig effekt.',
    cause_cssTitle: 'CSS-forskelle',
    cause_cssBody: 'Det primære signal. Layoutforskydninger, farveændringer, manglende stilarter eller ødelagt responsiv adfærd indikerer, at CSS adskiller sig mellem miljøer. Disse bør opføre sig identisk.',
    cause_assetsTitle: 'Manglende eller ødelagte ressourcer',
    cause_assetsBody: 'Et ødelagt billede, manglende ikonskrifttype eller fejlet script kan få store dele af siden til at renderes forskelligt. Kig efter tomme bokse eller ustylet indhold i diff-billedet.',
    cause_cookieTitle: 'Ikke-blokerede cookie- eller samtykkebannere',
    cause_cookieBody: 'VisiDiff blokerer kendte samtykke-scripts med glob-mønstre inden optagelse. Hvis et banner stadig vises, skal blokeringsmønstrene udvides — overlayet vil dække indhold og oppuste forskellen.',
    cause_fontTitle: 'Skriftindlæsning (FOUT)',
    cause_fontBody: 'Webskrifttyper bør være fuldt indlæst, inden screenshottet tages. Hvis en reserve-systemskrifttype vises, indlæste siden sig ikke korrekt — behandl dette som en renderingsfejl, der er værd at undersøge.',
    cause_imagesTitle: 'Manglende billeder',
    cause_imagesBody: 'VisiDiff ruller automatisk og venter inden screenshottet, så lazy-loadede billeder har tid til at vises. Et manglende eller ødelagt billede i diff\'en er en reel asset-fejl, ikke en timingfejl.',
    cause_jsTitle: 'JavaScript-fejl',
    cause_jsBody: 'En scriptfejl i ét miljø kan forhindre en komponent i at rendere eller efterlade siden i en ødelagt tilstand, hvilket skaber store synlige forskelle.',
    unchangedTitle: 'Uændrede sider',
    unchangedSub: (n: number) => `${n} side${n !== 1 ? 'r' : ''} med &lt;0,1% gennemsnitlig forskel — ingen visuelle ændringer registreret`,
    colTitle: 'Titel',
    colPath: 'Sti',
    colAvgDiff: 'Gns. forskel',
    original: 'original',
    diffLabel: 'forskel',
  },
} as const

type Translations = typeof translations[ReportLocale]

export interface ReportManifest {
  id: string
  savedAt: number
  input: {
    mode: 'direct' | 'sitemap'
    urlA?: string
    urlB?: string
    hostA?: string
    hostB?: string
    viewports: number[]
  }
  totalPercent: number | null
  results: Array<{
    pagePath: string
    pageLabel: string
    urlA: string
    urlB: string
    width: number
    percent: number
    size: { width: number; height: number }
    files: { a: string; b: string; diff: string }
  }>
}

function diffColor(percent: number): string {
  if (percent < 1) return '#34d399'
  if (percent < 5) return '#fbbf24'
  return '#f87171'
}

function formatDate(ms: number, locale: ReportLocale): string {
  const tag = locale === 'da' ? 'da-DK' : 'en-GB'
  return new Date(ms).toLocaleString(tag, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function hostLabel(manifest: ReportManifest): { a: string; b: string } {
  if (manifest.input.mode === 'direct') {
    return {
      a: manifest.input.urlA ?? '',
      b: manifest.input.urlB ?? ''
    }
  }
  return {
    a: manifest.input.hostA ?? '',
    b: manifest.input.hostB ?? ''
  }
}

export async function buildReportHtml(manifest: ReportManifest, runsRoot: string, thumbnailPath?: string, locale: ReportLocale = 'en'): Promise<string> {
  const t: Translations = translations[locale]
  let thumbnailDataUrl: string | null = null
  if (thumbnailPath) {
    try {
      const buf = await readFile(thumbnailPath)
      thumbnailDataUrl = `data:image/png;base64,${buf.toString('base64')}`
    } catch {}
  }
  const { a: labelA, b: labelB } = hostLabel(manifest)
  const date = formatDate(manifest.savedAt, locale)
  const overallPercent = manifest.totalPercent !== null ? manifest.totalPercent.toFixed(2) : '—'
  const pageCount = new Set(manifest.results.map(r => r.pagePath)).size
  const viewports = manifest.input.viewports

  const groupedPages = new Map<string, typeof manifest.results>()
  for (const result of manifest.results) {
    const key = result.pagePath
    if (!groupedPages.has(key)) groupedPages.set(key, [])
    groupedPages.get(key)!.push(result)
  }

  const CLEAN_THRESHOLD = 0.1

  const significantGroups: Array<{ sorted: typeof manifest.results; first: (typeof manifest.results)[0] }> = []
  const cleanGroups: Array<{ sorted: typeof manifest.results; first: (typeof manifest.results)[0] }> = []

  for (const [, pageResults] of groupedPages) {
    const sorted = [...pageResults].sort((a, b) => a.width - b.width)
    const first = sorted[0]
    const avgPercent = sorted.reduce((s, r) => s + r.percent, 0) / sorted.length
    if (avgPercent >= CLEAN_THRESHOLD) {
      significantGroups.push({ sorted, first })
    } else {
      cleanGroups.push({ sorted, first })
    }
  }

  const pageSections: string[] = []

  for (const { sorted, first } of significantGroups) {
    const viewportBlocks: string[] = []

    for (const result of sorted) {
      const diffFilePath = join(runsRoot, manifest.id, result.files.diff.replace(`/runs/${manifest.id}/`, ''))

      const color = diffColor(result.percent)
      const imgTag = `<img src="file://${diffFilePath}" alt="Diff at ${result.width}px" class="diff-img" />`

      const urlAFull = result.urlA
      const urlBFull = result.urlB

      viewportBlocks.push(`
        <div class="viewport-block">
          <div class="viewport-header">
            <span class="badge" style="background:#1e293b;color:#94a3b8;">${result.width}px</span>
            <span class="page-title-inline">${escapeHtml(first.pageLabel)}</span>
            <span style="color:${color};font-weight:600;">${result.percent.toFixed(2)}% ${t.diffLabel}</span>
            <span class="vp-urls">
              <a href="${escapeHtml(urlAFull)}" class="vp-url vp-url-a">A: ${escapeHtml(urlAFull)}</a>
              <a href="${escapeHtml(urlBFull)}" class="vp-url vp-url-b">B: ${escapeHtml(urlBFull)}</a>
            </span>
          </div>
          <div class="diff-image-wrap">
            ${imgTag}
          </div>
        </div>
      `)
    }

    pageSections.push(`
      <section class="page-section">
        ${viewportBlocks.join('')}
      </section>
    `)
  }

  if (cleanGroups.length) {
    const rows = cleanGroups.map(({ sorted, first }) => {
      const avgPercent = sorted.reduce((s, r) => s + r.percent, 0) / sorted.length
      const color = diffColor(avgPercent)
      const vpCells = sorted.map(r =>
        `<td class="clean-td clean-vp" style="color:${diffColor(r.percent)}">${r.percent.toFixed(2)}%</td>`
      ).join('')
      return `
        <tr class="clean-row">
          <td class="clean-td clean-title">${escapeHtml(first.pageLabel)}</td>
          <td class="clean-td clean-path"><a href="${escapeHtml(first.urlB)}" class="clean-link">${escapeHtml(first.pagePath)}</a> <a href="${escapeHtml(first.urlA)}" class="clean-link-muted">(${t.original})</a></td>
          <td class="clean-td" style="color:${color};font-weight:600;">${avgPercent.toFixed(2)}%</td>
          ${vpCells}
        </tr>`
    }).join('')

    const vpHeaders = manifest.input.viewports.map(w =>
      `<th class="clean-th">${w}px</th>`
    ).join('')

    pageSections.push(`
      <div class="clean-page">
        <div class="clean-page-header">
          <div class="clean-page-title">${t.unchangedTitle}</div>
          <div class="clean-page-sub">${t.unchangedSub(cleanGroups.length)}</div>
        </div>
        <table class="clean-table">
          <thead>
            <tr>
              <th class="clean-th">${t.colTitle}</th>
              <th class="clean-th">${t.colPath}</th>
              <th class="clean-th">${t.colAvgDiff}</th>
              ${vpHeaders}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `)
  }

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8" />
<title>VisiDiff Report — ${escapeHtml(labelA)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; background: #fff; color: #0f172a; }
  body { margin: 0; padding: 0; }

  .cover {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 4rem;
    background: #fff;
    color: #0f172a;
    page-break-after: always;
  }
  .cover-thumb {
    width: 560px;
    height: 560px;
    overflow: hidden;
    margin-bottom: 2.5rem;
    border: 1px solid #e2e8f0;
    flex-shrink: 0;
  }
  .cover-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-logo {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 3rem;
  }
  .cover-title {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.15;
    margin-bottom: 1.5rem;
    color: #0f172a;
  }
  .cover-urls {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 2.5rem;
  }
  .cover-url-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
    color: #475569;
  }
  .cover-url-row .label {
    font-weight: 600;
    min-width: 1.2rem;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .cover-url-row a { color: #0284c7; text-decoration: none; word-break: break-all; }
  .cover-stats {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  .cover-stat {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .cover-stat-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #94a3b8;
  }
  .cover-stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #0f172a;
  }
  .cover-date {
    margin-top: 4rem;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .page-section { }

  .clean-page {
    page-break-before: always;
    break-before: page;
    padding: 3rem;
    background: #fff;
  }
  .clean-page-header {
    margin-bottom: 2rem;
  }
  .clean-page-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.4rem;
  }
  .clean-page-sub {
    font-size: 0.82rem;
    color: #64748b;
  }
  .clean-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    padding: 0;
  }
  .clean-th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    border-bottom: 2px solid #e2e8f0;
  }
  .clean-td {
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: middle;
  }
  .clean-title {
    font-weight: 500;
    color: #0f172a;
  }
  .clean-link {
    color: #0284c7;
    text-decoration: none;
    font-size: 0.78rem;
    font-family: ui-monospace, monospace;
  }
  .clean-link:hover { text-decoration: underline; }
  .clean-link-muted {
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.75rem;
  }
  .clean-link-muted:hover { text-decoration: underline; color: #64748b; }
  .clean-path code {
    background: #f1f5f9;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #475569;
  }
  .clean-vp {
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-size: 0.78rem;
  }
  .clean-row:hover td { background: #f8fafc; }

  .vp-urls {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
  }
  .vp-url {
    font-size: 0.7rem;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 36ch;
  }
  .vp-url-a { color: #22c55e; }
  .vp-url-b { color: #38bdf8; }

  .viewport-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.5rem;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    flex-shrink: 0;
  }

  @page { size: A4 portrait; margin: 0; }

  .viewport-block {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    page-break-before: always;
    page-break-inside: avoid;
    break-before: page;
    break-inside: avoid;
    overflow: hidden;
  }
  .diff-image-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem 2rem;
  }
  .diff-img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .diff-img-missing {
    padding: 2rem;
    text-align: center;
    color: #64748b;
    font-size: 0.875rem;
  }
  .page-title-inline {
    font-weight: 600;
    color: #0f172a;
    font-size: 0.85rem;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .method-page {
    page-break-before: always;
    break-before: page;
    padding: 2.5rem 3rem;
    background: #fff;
    color: #0f172a;
  }
  .method-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.25rem;
  }
  .method-subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin-bottom: 1.25rem;
  }
  .method-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem 1.5rem;
    margin-bottom: 1.25rem;
  }
  .method-card {
    border: 1px solid #e2e8f0;
    border-radius: 0.6rem;
    padding: 0.75rem 1rem;
  }
  .method-card-num {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }
  .method-card-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.2rem;
  }
  .method-card-body {
    font-size: 0.75rem;
    color: #475569;
    line-height: 1.45;
  }
  .method-legend {
    border-top: 1px solid #e2e8f0;
    padding-top: 0.9rem;
  }
  .method-legend-title {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #94a3b8;
    margin-bottom: 0.5rem;
  }
  .method-legend-items {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
  }
  .method-legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #334155;
  }
  .method-swatch {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .method-note {
    margin-top: 0.75rem;
    font-size: 0.7rem;
    color: #94a3b8;
    line-height: 1.5;
  }

  .causes-section {
    margin-top: 1rem;
    border-top: 1px solid #e2e8f0;
    padding-top: 0.9rem;
  }
  .causes-title {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #94a3b8;
    margin-bottom: 0.6rem;
  }
  .causes-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem 1.5rem;
  }
  .causes-col-header {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.5rem;
    border-radius: 0.3rem;
    margin-bottom: 0.5rem;
    display: inline-block;
  }
  .causes-col-header--negligible {
    background: #f0fdf4;
    color: #16a34a;
  }
  .causes-col-header--significant {
    background: #fff7ed;
    color: #c2410c;
  }
  .causes-item {
    margin-bottom: 0.45rem;
  }
  .causes-item-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 0.1rem;
  }
  .causes-item-body {
    font-size: 0.7rem;
    color: #475569;
    line-height: 1.4;
  }

  @media print {
    .cover { min-height: 100vh; }
    .viewport-block {
      page-break-before: always;
      break-before: page;
      height: 100vh;
    }
  }
</style>
</head>
<body>

<div class="cover">
  ${thumbnailDataUrl ? `<div class="cover-thumb"><img src="${thumbnailDataUrl}" alt="Run thumbnail" /></div>` : ''}
  <div class="cover-logo">VisiDiff</div>
  <div class="cover-title">${t.coverTitle}</div>
  <div class="cover-urls">
    <div class="cover-url-row">
      <span class="label">A</span>
      <a href="${escapeHtml(labelA)}">${escapeHtml(labelA)}</a>
    </div>
    <div class="cover-url-row">
      <span class="label">B</span>
      <a href="${escapeHtml(labelB)}">${escapeHtml(labelB)}</a>
    </div>
  </div>
  <div class="cover-stats">
    <div class="cover-stat">
      <div class="cover-stat-label">${t.overallDiff}</div>
      <div class="cover-stat-value" style="color:${diffColor(manifest.totalPercent ?? 0)};">${overallPercent}%</div>
    </div>
    <div class="cover-stat">
      <div class="cover-stat-label">${t.pages}</div>
      <div class="cover-stat-value">${pageCount}</div>
    </div>
    <div class="cover-stat">
      <div class="cover-stat-label">${t.viewports}</div>
      <div class="cover-stat-value">${viewports.join(', ')}px</div>
    </div>
  </div>
  <div class="cover-date">${t.generated} ${date}</div>
</div>

<div class="method-page">
  <div class="method-title">${t.methodTitle}</div>
  <div class="method-subtitle">${t.methodSubtitle}</div>
  <div class="method-grid">
    <div class="method-card">
      <div class="method-card-num">${t.step1Num}</div>
      <div class="method-card-title">${t.step1Title}</div>
      <div class="method-card-body">${t.step1Body}</div>
    </div>
    <div class="method-card">
      <div class="method-card-num">${t.step2Num}</div>
      <div class="method-card-title">${t.step2Title}</div>
      <div class="method-card-body">${t.step2Body}</div>
    </div>
    <div class="method-card">
      <div class="method-card-num">${t.step3Num}</div>
      <div class="method-card-title">${t.step3Title}</div>
      <div class="method-card-body">${t.step3Body}</div>
    </div>
    <div class="method-card">
      <div class="method-card-num">${t.step4Num}</div>
      <div class="method-card-title">${t.step4Title}</div>
      <div class="method-card-body">${t.step4Body}</div>
    </div>
  </div>
  <div class="method-legend">
    <div class="method-legend-title">${t.legendTitle}</div>
    <div class="method-legend-items">
      <div class="method-legend-item"><span class="method-swatch" style="background:#34d399;"></span> ${t.legendGreen}</div>
      <div class="method-legend-item"><span class="method-swatch" style="background:#fbbf24;"></span> ${t.legendYellow}</div>
      <div class="method-legend-item"><span class="method-swatch" style="background:#f87171;"></span> ${t.legendRed}</div>
      <div class="method-legend-item"><span class="method-swatch" style="background:#e2e8f0;"></span> ${t.legendGray}</div>
    </div>
  </div>
  <div class="method-note">${t.methodNote(escapeHtml(viewports.join('px, ') + 'px'), date)}</div>
  <div class="causes-section">
    <div class="causes-title">${t.causesTitle}</div>
    <div class="causes-cols">
      <div class="causes-col">
        <div class="causes-col-header causes-col-header--negligible">${t.negligibleHeader}</div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_dynamicTitle}</div>
          <div class="causes-item-body">${t.cause_dynamicBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_videosTitle}</div>
          <div class="causes-item-body">${t.cause_videosBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_animationsTitle}</div>
          <div class="causes-item-body">${t.cause_animationsBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_subpixelTitle}</div>
          <div class="causes-item-body">${t.cause_subpixelBody}</div>
        </div>
      </div>
      <div class="causes-col">
        <div class="causes-col-header causes-col-header--significant">${t.significantHeader}</div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_cssTitle}</div>
          <div class="causes-item-body">${t.cause_cssBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_assetsTitle}</div>
          <div class="causes-item-body">${t.cause_assetsBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_cookieTitle}</div>
          <div class="causes-item-body">${t.cause_cookieBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_fontTitle}</div>
          <div class="causes-item-body">${t.cause_fontBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_imagesTitle}</div>
          <div class="causes-item-body">${t.cause_imagesBody}</div>
        </div>
        <div class="causes-item">
          <div class="causes-item-title">${t.cause_jsTitle}</div>
          <div class="causes-item-body">${t.cause_jsBody}</div>
        </div>
      </div>
    </div>
  </div>
</div>

${pageSections.join('\n')}

</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
