import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

function getDataDir(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'visidiff');
  }

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'visidiff');
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'visidiff');
}

export function getConfigDir(): string {
  return join(getDataDir(), 'configs');
}

export function getRunsDir(configName: string): string {
  return join(getDataDir(), 'runs', configName);
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true });
}

export function getConfigPath(filename: string): string {
  return join(getConfigDir(), filename);
}
