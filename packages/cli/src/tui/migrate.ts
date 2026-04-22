import { confirm, note } from '@clack/prompts';
import { readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfigDir, getConfigPath, ensureDataDirs } from '../paths.js';

const CONFIG_FILE_PATTERN = /^[^.].*\.visidiff\.config\.js$/;

export async function maybeMigrateConfigs(): Promise<void> {
  const configDir = getConfigDir();
  await ensureDataDirs();

  let roamingEntries: string[];
  try {
    roamingEntries = await readdir(configDir);
  } catch {
    return;
  }

  const hasRoamingConfigs = roamingEntries.some((name) => CONFIG_FILE_PATTERN.test(name));
  if (hasRoamingConfigs) {
    return;
  }

  let localEntries: string[];
  try {
    localEntries = await readdir(process.cwd());
  } catch {
    return;
  }

  const localConfigs = localEntries.filter((name) => CONFIG_FILE_PATTERN.test(name));
  if (localConfigs.length === 0) {
    return;
  }

  note(`Found ${localConfigs.length} config(s) in the current directory.`, 'Migration');
  const shouldMigrate = await confirm({
    message: 'Copy them to roaming storage?',
    initialValue: true,
  });

  if (!shouldMigrate) {
    return;
  }

  for (const filename of localConfigs) {
    const src = join(process.cwd(), filename);
    const dest = getConfigPath(filename);
    await copyFile(src, dest);
  }

  note(`Migrated ${localConfigs.length} config(s) to roaming storage.`, 'Migration complete');
}
