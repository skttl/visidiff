import { describe, expect, it, vi } from 'vitest';
import { RobotsChecker } from '../src/crawler/robots.js';

describe('RobotsChecker', () => {
  it('allows when robots.txt is missing (404)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    const checker = await RobotsChecker.load('https://example.com', fetcher);
    expect(checker.isAllowed('https://example.com/about')).toBe(true);
  });

  it('disallows path blocked by user-agent *', async () => {
    const txt = 'User-agent: *\nDisallow: /admin\n';
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => txt });
    const checker = await RobotsChecker.load('https://example.com', fetcher);
    expect(checker.isAllowed('https://example.com/admin/login')).toBe(false);
    expect(checker.isAllowed('https://example.com/about')).toBe(true);
  });

  it('ignore mode always returns true', async () => {
    const txt = 'User-agent: *\nDisallow: /\n';
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => txt });
    const checker = await RobotsChecker.load('https://example.com', fetcher, { ignore: true });
    expect(checker.isAllowed('https://example.com/anything')).toBe(true);
  });
});
