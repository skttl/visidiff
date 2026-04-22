// Static-asset extensions that are clearly not HTML pages.
// Used as a cheap pre-filter so we never emit non-HTML URLs as crawl results
// (e.g. from sitemaps, which frequently list PDFs and media files).
const NON_HTML_EXTENSIONS = new Set([
  'pdf',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'csv',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'tiff',
  'avif',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'js',
  'mjs',
  'css',
  'map',
  'json',
  'xml',
  'rss',
  'atom',
  'wasm',
  'dmg',
  'exe',
  'msi',
  'apk',
]);

/**
 * Cheap heuristic that rejects URLs whose path ends in a well-known
 * non-HTML file extension. Avoids a network request for obvious cases.
 */
export function hasHtmlLikePath(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const lastSlash = pathname.lastIndexOf('/');
  const last = pathname.slice(lastSlash + 1);
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return true; // no extension -> assume html
  const ext = last.slice(dot + 1).toLowerCase();
  return !NON_HTML_EXTENSIONS.has(ext);
}

/**
 * Returns true if a `Content-Type` header value indicates an HTML document.
 */
export function isHtmlContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const value = contentType.toLowerCase().split(';')[0]!.trim();
  return value === 'text/html' || value === 'application/xhtml+xml';
}
