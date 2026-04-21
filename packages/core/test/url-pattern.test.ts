import { describe, expect, it } from 'vitest';
import { parsePattern, substitute, UrlPatternError } from '../src/url-pattern.js';

describe('parsePattern', () => {
  it('splits around a single asterisk', () => {
    expect(parsePattern('https://example.com/*')).toEqual({
      prefix: 'https://example.com/',
      suffix: '',
      raw: 'https://example.com/*',
    });
  });

  it('supports suffix after asterisk', () => {
    expect(parsePattern('https://example.com/*/details')).toEqual({
      prefix: 'https://example.com/',
      suffix: '/details',
      raw: 'https://example.com/*/details',
    });
  });

  it('throws on zero asterisks', () => {
    expect(() => parsePattern('https://example.com/')).toThrow(UrlPatternError);
  });

  it('throws on multiple asterisks', () => {
    expect(() => parsePattern('https://*.example.com/*')).toThrow(UrlPatternError);
  });
});

describe('substitute', () => {
  const original = parsePattern('https://www.mysite.com/*');
  const updated = parsePattern('https://staging.x.com/mysite/*');

  it('maps matching URL', () => {
    expect(substitute('https://www.mysite.com/about/team', original, updated)).toBe(
      'https://staging.x.com/mysite/about/team',
    );
  });

  it('preserves query string', () => {
    expect(substitute('https://www.mysite.com/search?q=foo', original, updated)).toBe(
      'https://staging.x.com/mysite/search?q=foo',
    );
  });

  it('returns null for URL not matching original pattern', () => {
    expect(substitute('https://other.com/about', original, updated)).toBeNull();
  });

  it('handles patterns with suffix', () => {
    const src = parsePattern('https://a.com/*/page');
    const dst = parsePattern('https://b.com/x/*/page');
    expect(substitute('https://a.com/foo/bar/page', src, dst)).toBe('https://b.com/x/foo/bar/page');
  });
});
