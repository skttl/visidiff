import { readdir, stat, rmdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getRunsDir } from '../paths.js';

export interface RunEntry {
  folderName: string;
  absolutePath: string;
  createdAt: Date;
}

export async function discoverRuns(configName: string): Promise<RunEntry[]> {
  const runsDir = getRunsDir(configName);

  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    const runs: RunEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const absolutePath = join(runsDir, entry.name);
      const info = await stat(absolutePath);
      runs.push({
        folderName: entry.name,
        absolutePath,
        createdAt: info.ctime,
      });
    }

    return runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

export async function deleteRun(outputDir: string): Promise<void> {
  await rmdir(outputDir, { recursive: true });
}

export async function deleteConfig(configPath: string, configName: string): Promise<void> {
  await rm(configPath, { force: true });
  const runsDir = getRunsDir(configName);
  await rm(runsDir, { recursive: true, force: true });
}
