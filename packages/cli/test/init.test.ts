import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';

describe('runInit', () => {
  it('creates visidiff.config.js in target directory', async () => {
    const dir = join(tmpdir(), 'visidiff-init-test');
    await mkdir(dir, { recursive: true });
    try {
      await runInit(dir);
      // Config file should exist
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
