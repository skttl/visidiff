import { cancel, confirm, intro, isCancel, note, outro, select } from '@clack/prompts';
import open from 'open';
import { basename } from 'node:path';
import { formatConfigSummary } from './summary.js';
import { createConfig } from './create.js';
import { discoverConfigs } from './discover.js';
import { discoverRuns, deleteRun, deleteConfig } from './runs.js';
import { runCompare, openRun } from '../commands/compare.js';
import { maybeMigrateConfigs } from './migrate.js';

function getConfigName(filename: string): string {
  return basename(filename, '.visidiff.config.js');
}

export async function runTui(): Promise<void> {
  intro('visidiff');
  await maybeMigrateConfigs();

  while (true) {
    const configs = await discoverConfigs();
    if (configs.length === 0) {
      note('No *.visidiff.config.js files found in roaming storage.', 'Configs');
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
      const filename = await createConfig();
      if (filename) {
        note(`Created ${filename}`, 'Config created');
      }
      continue;
    }

    const selected = configs.find((entry) => entry.filename === action);
    if (!selected) {
      continue;
    }

    const configName = getConfigName(selected.filename);

    while (true) {
      note(formatConfigSummary(selected.filename, selected.config), 'Selected config');
      const runs = await discoverRuns(configName);

      const options: { value: string; label: string; hint?: string }[] = [];

      if (runs.length > 0) {
        options.push({ value: 'open-latest', label: 'Open latest run', hint: runs[0]!.folderName });
        options.push({ value: 'view-runs', label: 'View previous runs', hint: `${runs.length} run${runs.length === 1 ? '' : 's'}` });
      }

      options.push({ value: 'run-new', label: 'Run new comparison' });
      options.push({ value: 'edit', label: 'Edit config' });
      options.push({ value: 'delete-config', label: 'Delete config' });
      options.push({ value: 'back', label: 'Back' });

      const nextAction = await select({
        message: 'What would you like to do?',
        options,
      });

      if (isCancel(nextAction) || nextAction === 'back') {
        break;
      }

      if (nextAction === 'edit') {
        try {
          await open(selected.absolutePath, { wait: true });
        } catch {
          /* editor may exit with non-zero code; ignore */
        }
        continue;
      }

      if (nextAction === 'open-latest') {
        console.clear();
        await openRun(runs[0]!.absolutePath);
        outro(`Finished ${selected.filename}`);
        return;
      }

      if (nextAction === 'run-new') {
        console.clear();
        await runCompare(selected.absolutePath);
        outro(`Finished ${selected.filename}`);
        return;
      }

      if (nextAction === 'view-runs') {
        const runAction = await select({
          message: 'Select a run:',
          options: [
            ...runs.map((run) => ({
              value: run.absolutePath,
              label: run.folderName,
              hint: run.createdAt.toLocaleString(),
            })),
            { value: '__back__', label: 'Back' },
          ],
        });

        if (isCancel(runAction) || runAction === '__back__') {
          continue;
        }

        const runMenu = await select({
          message: 'What would you like to do?',
          options: [
            { value: 'open', label: 'Open run' },
            { value: 'delete', label: 'Delete run' },
            { value: 'back', label: 'Back' },
          ],
        });

        if (isCancel(runMenu) || runMenu === 'back') {
          continue;
        }

        if (runMenu === 'open') {
          console.clear();
          await openRun(runAction);
          outro(`Finished ${selected.filename}`);
          return;
        }

        if (runMenu === 'delete') {
          const shouldDelete = await confirm({
            message: `Delete run ${runs.find((r) => r.absolutePath === runAction)?.folderName}?`,
            initialValue: false,
          });

          if (!isCancel(shouldDelete) && shouldDelete) {
            await deleteRun(runAction);
            note('Run deleted.', 'Deleted');
          }
          continue;
        }
      }

      if (nextAction === 'delete-config') {
        const shouldDelete = await confirm({
          message: `Delete ${selected.filename} and all its runs?`,
          initialValue: false,
        });

        if (!isCancel(shouldDelete) && shouldDelete) {
          await deleteConfig(selected.absolutePath, configName);
          note(`${selected.filename} and all runs deleted.`, 'Deleted');
          break;
        }
        continue;
      }
    }
  }
}
