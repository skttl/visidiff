import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { padImagesToSameHeight } from '../src/diff/pad.js';

describe('padImagesToSameHeight', () => {
  it('returns same-size buffers when heights match', async () => {
    const a = await sharp({ create: { width: 100, height: 100, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const b = await sharp({ create: { width: 100, height: 100, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const result = await padImagesToSameHeight(a, b, 100, 100);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });

  it('pads shorter image with white background', async () => {
    const a = await sharp({ create: { width: 100, height: 50, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const b = await sharp({ create: { width: 100, height: 100, background: { r: 255, g: 255, b: 255 }, channels: 3 } }).png().toBuffer();
    const result = await padImagesToSameHeight(a, b, 50, 100);
    expect(result[0].length).toBeGreaterThan(a.length);
    expect(result[1]).toBe(b);
  });
});
