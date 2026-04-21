import type { UrlPattern } from './types.js';

export class UrlPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlPatternError';
  }
}

export function parsePattern(raw: string): UrlPattern {
  const parts = raw.split('*');
  if (parts.length !== 2) {
    throw new UrlPatternError(
      `Pattern must contain exactly one '*': got ${parts.length - 1} in "${raw}"`,
    );
  }
  return { prefix: parts[0]!, suffix: parts[1]!, raw };
}

export function substitute(
  url: string,
  source: UrlPattern,
  target: UrlPattern,
): string | null {
  if (!url.startsWith(source.prefix)) return null;
  const afterPrefix = url.slice(source.prefix.length);
  if (source.suffix) {
    const idx = afterPrefix.lastIndexOf(source.suffix);
    if (idx === -1) return null;
    const captured = afterPrefix.slice(0, idx);
    const trailing = afterPrefix.slice(idx + source.suffix.length);
    return `${target.prefix}${captured}${target.suffix}${trailing}`;
  }
  return `${target.prefix}${afterPrefix}${target.suffix}`;
}
