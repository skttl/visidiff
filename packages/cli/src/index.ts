import { program } from 'commander';
import { runInit } from './commands/init.js';
import { runCompare } from './commands/compare.js';

program.name('visidiff').description('Visual regression testing tool').version('0.0.0');

program
  .command('init')
  .description('Initialize visidiff.config.js in current directory')
  .action(async () => {
    await runInit(process.cwd());
  });

program
  .command('compare [config]')
  .description('Run visual regression comparison')
  .option('-c, --config <path>', 'Path to config file', 'visidiff.config.js')
  .action(async (config) => {
    await runCompare(config);
  });

program.parse();
