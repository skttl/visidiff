import { loadConfigFromFile, type VisidiffConfig } from '@visidiff/core';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_FILE_PATTERN = /^[^.].*\.visidiff\.config\.js$/;
/**
 * Represents a discovered visidiff config file.
 */
export interface ConfigEntry {
  filename: string;
  absolutePath: string;
  config: VisidiffConfig;
}

export async function discoverConfigs(cwd: string): Promise<ConfigEntry[]> {
  const entries = await readdir(cwd, { withFileTypes: true });
  const configFiles = entries
    .filter((entry) => entry.isFile() && CONFIG_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const configs = await Promise.all(
    configFiles.map(async (filename) => {
      const absolutePath = join(cwd, filename);
      const config = await loadConfigFromFile(absolutePath);
      return { filename, absolutePath, config } satisfies ConfigEntry;
    }),
  );

  return configs;
}
