import { describe, expect, it } from 'vitest';
import { validateConfig, DEFAULT_CONFIG } from '../src/config.js';

describe('validateConfig', () => {
  it('fills defaults from minimal input', () => {
    const cfg = validateConfig({
      original: 'https://a.com/*',
      updated: 'https://b.com/*',
    });
    expect(cfg.viewports).toEqual(DEFAULT_CONFIG.viewports);
    expect(cfg.concurrency).toBe(DEFAULT_CONFIG.concurrency);
  });

  it('rejects missing asterisk in original', () => {
    expect(() =>
      validateConfig({ original: 'https://a.com/', updated: 'https://b.com/*' }),
    ).toThrow(/original.*asterisk/i);
  });

  it('allows overrides', () => {
    const cfg = validateConfig({
      original: 'https://a.com/*',
      updated: 'https://b.com/*',
      viewports: [1920],
      concurrency: 2,
    });
    expect(cfg.viewports).toEqual([1920]);
    expect(cfg.concurrency).toBe(2);
  });
});
