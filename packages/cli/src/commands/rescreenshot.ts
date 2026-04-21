import { runPipeline } from '@visidiff/core';
import { loadConfigFromFile } from '@visidiff/core';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

export async function runRescreenshot(configPath: string): Promise<void> {
  const cwd = process.cwd();
  const resolvedConfig = join(cwd, configPath);

  if (!existsSync(resolvedConfig)) {
    console.error(`Config file not found: ${resolvedConfig}`);
    process.exit(1);
  }

  const config = await loadConfigFromFile(resolvedConfig);
  const runId = config.runId ?? Date.now().toString();

  console.log(`Clearing screenshot cache at: ${config.cacheDir}`);
  await rm(config.cacheDir, { recursive: true, force: true });

  console.log(`Starting visidiff re-screenshot (run: ${runId})...`);

  await runPipeline({
    config,
    runId,
    fetcher: async (url: string) => fetch(url),
    progress: (msg: string) => console.log(`  ${msg}`),
  });

  console.log(`Done. Results saved to: ${config.outputDir}`);
}
