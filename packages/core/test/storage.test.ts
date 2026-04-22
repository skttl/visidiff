import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { writeRunData, writeComparisonRecord } from '../src/output/storage.js';
import type { RunData, ComparisonRecord } from '../src/types.js';

describe('output storage', () => {
  it('writes run data JSON', async () => {
    const dir = join(tmpdir(), 'visidiff-storage-run');
    await mkdir(dir, { recursive: true });
    try {
      const runId = 'test-run-123';
      const data: RunData = {
        version: 1,
        createdAt: new Date().toISOString(),
        config: { original: 'https://a.com', updated: 'https://b.com', viewports: [1440], threshold: 0.1 },
        comparisons: [],
        failedComparisons: [],
        stats: { totalUrls: 0, succeeded: 0, failed: 0, skipped: 0 },
      };
      await writeRunData(dir, runId, data);
      // File should exist
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes comparison record JSON', async () => {
    const dir = join(tmpdir(), 'visidiff-storage-record');
    await mkdir(dir, { recursive: true });
    try {
      const record: ComparisonRecord = {
        url: {
          id: 'test-id',
          originalUrl: 'https://example.com',
          updatedUrl: 'https://example.com',
          group: '/',
          originalStatus: 200,
          updatedStatus: 200,
        },
        viewports: [
          {
            viewport: 1440,
            originalPath: 'orig.png',
            updatedPath: 'upd.png',
            diffPath: 'diff.png',
            pixelDiffPercent: 0.05,
            heightDeltaPx: 0,
            status: 'computed',
          },
        ],
      };
      await writeComparisonRecord(dir, record);
      // File should exist
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
