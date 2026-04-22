import { describe, expect, it } from 'vitest';
import { validateConfig, loadConfigFromFile, DEFAULT_CONFIG } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('validateConfig', () => {
  it('fills defaults from minimal input', () => {
    const cfg = validateConfig({
      original: 'https://a.com/*',
      updated: 'https://b.com/*',
    });
    expect(cfg.viewports).toEqual(DEFAULT_CONFIG.viewports);
    expect(cfg.blockedRequestUrls).toEqual(DEFAULT_CONFIG.blockedRequestUrls);
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
      blockedRequestUrls: ['https://cdn.cookiebot.com/*'],
      viewports: [1920],
      concurrency: 2,
    });
    expect(cfg.blockedRequestUrls).toEqual(['https://cdn.cookiebot.com/*']);
    expect(cfg.viewports).toEqual([1920]);
    expect(cfg.concurrency).toBe(2);
  });
});

describe('loadConfigFromFile', () => {
  it('derives outputDir from JS config filename', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visi-cfg-'));
    const configPath = join(dir, 'my-site.visidiff.config.js');
    writeFileSync(
      configPath,
      `export default { original: 'https://a.com/*', updated: 'https://b.com/*' };`,
      'utf8',
    );
    const cfg = await loadConfigFromFile(configPath);
    expect(cfg.outputDir).toBe(join(dir, '.visidiff', 'output', 'my-site'));
    expect(cfg.original).toBe('https://a.com/*');
  });
});
