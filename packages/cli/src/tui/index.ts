import { cancel, intro, isCancel, note, outro, select } from '@clack/prompts';
import open from 'open';
import { formatConfigSummary } from './summary.js';
import { createConfig } from './create.js';
import { discoverConfigs } from './discover.js';
import { runCompare } from '../commands/compare.js';

export async function runTui(): Promise<void> {
  intro('visidiff');

  while (true) {
    const configs = await discoverConfigs(process.cwd());
    if (configs.length === 0) {
      note('No *.visidiff.config.js files found in this folder.', 'Configs');
    }

    const action = await select({
      message: 'What would you like to do?',
      options: [
        ...configs.map((entry) => ({
          value: entry.filename,
          label: entry.filename,
          hint: `${entry.config.original} → ${entry.config.updated}`,
        })),
        { value: '__create__', label: 'Create new config' },
        { value: '__exit__', label: 'Exit' },
      ],
    });

    if (isCancel(action) || action === '__exit__') {
      cancel('Cancelled.');
      return;
    }

    if (action === '__create__') {
      const filename = await createConfig(process.cwd());
      if (filename) {
        note(`Created ${filename}`, 'Config created');
      }
      continue;
    }

    const selected = configs.find((entry) => entry.filename === action);
    if (!selected) {
      continue;
    }

    note(formatConfigSummary(selected.filename, selected.config), 'Selected config');
    const nextAction = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'run', label: 'Run comparison' },
        { value: 'edit', label: 'Edit config' },
        { value: 'back', label: 'Back' },
      ],
    });

    if (isCancel(nextAction) || nextAction === 'back') {
      continue;
    }

    if (nextAction === 'edit') {
      try {
        await open(selected.absolutePath, { wait: true });
      } catch {
        /* editor may exit with non-zero code; ignore */
      }
      continue;
    }

    console.clear();
    await runCompare(selected.absolutePath);
    outro(`Finished ${selected.filename}`);
    return;
  }
}
