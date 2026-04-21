import { runPipeline } from '@visidiff/core';
import { loadConfigFromFile } from '@visidiff/core';
import { startServer } from '@visidiff/server';
import open from 'open';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function runCompare(configPath: string, noServer = false): Promise<void> {
  const cwd = process.cwd();
  const resolvedConfig = join(cwd, configPath);

  if (!existsSync(resolvedConfig)) {
    console.error(`Config file not found: ${resolvedConfig}`);
    process.exit(1);
  }

  const config = await loadConfigFromFile(resolvedConfig);
  const runId = config.runId ?? Date.now().toString();

  console.log(`Starting visidiff comparison (run: ${runId})...`);

  await runPipeline({
    config,
    runId,
    fetcher: async (url: string) => fetch(url),
    progress: (msg: string) => console.log(`  ${msg}`),
  });

  console.log(`Done. Results saved to: ${config.outputDir}`);

  if (!noServer) {
    const uiPkg = await import.meta.resolve('@visidiff/ui/package.json');
    const uiDist = join(fileURLToPath(uiPkg), '..', 'dist');
    const started = await startServer({ outputDir: config.outputDir, uiDistDir: uiDist });
    console.log(`\n🌐 Report available at ${started.url}`);
    await open(started.url);
    console.log('Press Ctrl+C to stop the server.');

    const cleanup = async () => {
      await started.app.close();
      process.exit(0);
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    await new Promise<void>((resolve) => {
      // Keep process alive until signal
    });
  }
}
