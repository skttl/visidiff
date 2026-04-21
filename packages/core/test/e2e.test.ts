import { describe, expect, it } from 'vitest';
import { parsePattern, substitute } from '../src/url-pattern.js';
import { validateConfig } from '../src/config.js';

describe('e2e smoke test', () => {
  it('end-to-end URL pattern substitution works', () => {
    const pattern = parsePattern('https://example.com/*');
    const result = substitute('https://example.com/about', pattern, pattern);
    expect(result).toBe('https://example.com/about');
  });

  it('config validation works with valid input', () => {
    const config = validateConfig({
      original: 'https://example.com/*',
      updated: 'https://staging.example.com/*',
    });
    expect(config.original).toBe('https://example.com/*');
  });
});
