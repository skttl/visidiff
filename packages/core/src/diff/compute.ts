import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { compare } from 'odiff-bin';
import { padImagesToSameHeight } from './pad.js';

export interface DiffResult {
  pixelDiffPercent: number;
  diffPath: string;
}

export async function computeDiff(
  original: Buffer,
  updated: Buffer,
  diffPath: string,
  threshold: number,
): Promise<DiffResult | null> {
  const metaA = await sharp(original).metadata();
  const metaB = await sharp(updated).metadata();
  const [paddedA, paddedB] = await padImagesToSameHeight(original, updated, metaA.height!, metaB.height!);

  const tempDir = await mkdtemp(join(tmpdir(), 'visidiff-diff-'));
  const tempA = join(tempDir, 'original.png');
  const tempB = join(tempDir, 'updated.png');

  try {
    await writeFile(tempA, paddedA);
    await writeFile(tempB, paddedB);

    const result = await compare(tempA, tempB, diffPath, {
      outputDiffMask: true,
      threshold: 0,
    });

    const diffPercent = result.match === false && 'diffPercentage' in result ? result.diffPercentage : 0;
    if (isNaN(diffPercent) || diffPercent < threshold * 100) {
      return null;
    }

    return {
      pixelDiffPercent: diffPercent / 100,
      diffPath,
    };
  } finally {
    await unlink(tempA).catch(() => {});
    await unlink(tempB).catch(() => {});
  }
}
