import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { computeDiff } from '../src/diff/compute.js';

describe('computeDiff', () => {
  it('returns null when images are identical', async () => {
    const img = await sharp({ create: { width: 100, height: 100, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const dir = join(tmpdir(), 'visidiff-diff-identical');
    await mkdir(dir, { recursive: true });
    try {
      const result = await computeDiff(img, img, join(dir, 'diff.png'), 0.1);
      expect(result).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('computes diff for different images', async () => {
    const a = await sharp({ create: { width: 100, height: 100, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const b = await sharp({ create: { width: 100, height: 100, background: { r: 0, g: 0, b: 0 }, channels: 3 } }).png().toBuffer();
    const dir = join(tmpdir(), 'visidiff-diff-diff');
    await mkdir(dir, { recursive: true });
    try {
      const result = await computeDiff(a, b, join(dir, 'diff.png'), 0.1);
      expect(result).not.toBeNull();
      expect(result!.pixelDiffPercent).toBeGreaterThan(0.5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
