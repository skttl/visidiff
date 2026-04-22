import { runPipeline } from '@visidiff/core';
import { loadConfigFromFile } from '@visidiff/core';
import { startServer } from '@visidiff/server';
import { log, note, spinner } from '@clack/prompts';
import open from 'open';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function renderProgressBar(done: number, total: number, width = 24): string {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, done / safeTotal));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function restoreTerminalInput(): void {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
}

function formatDiscoveryMessage(discoveredUrls: number, latestDiscoveredUrls: string[]): string {
  if (latestDiscoveredUrls.length === 0) {
    return `Discovering URLs... ${discoveredUrls} found`;
  }

  return `Discovering URLs... ${discoveredUrls} found | Latest: ${latestDiscoveredUrls[latestDiscoveredUrls.length - 1]}`;
}

export async function runCompare(configPath: string): Promise<void> {
  const cwd = process.cwd();
  const configFilePath = resolve(cwd, configPath);

  restoreTerminalInput();

  if (!existsSync(configFilePath)) {
    log.error(`Config file not found: ${configFilePath}`);
    process.exit(1);
  }

  const config = await loadConfigFromFile(configFilePath);
  const runId = config.runId ?? Date.now().toString();
  const outputDir = resolve(cwd, config.outputDir);

  await rm(outputDir, { recursive: true, force: true });

  log.step(`Starting visidiff comparison (run: ${runId})`);

  const discoverySpinner = spinner();
  const captureSpinner = spinner();
  let discoveredUrls = 0;
  const latestDiscoveredUrls: string[] = [];
  let done = 0;
  let failed = 0;
  let totalToCapture = 0;

  await runPipeline({
    config,
    runId,
    fetcher: async (url: string) => fetch(url),
    progress: (event) => {
      if (typeof event === 'string') {
        log.message(event);
        return;
      }

      const e = event as Exclude<typeof event, string>;
      switch (e.type) {
        case 'discover:start':
          discoverySpinner.start(formatDiscoveryMessage(0, latestDiscoveredUrls));
          break;
        case 'discover:progress':
          discoveredUrls = e.urlCount;
          latestDiscoveredUrls.push(e.latestUrl);
          if (latestDiscoveredUrls.length > 5) {
            latestDiscoveredUrls.shift();
          }
          discoverySpinner.message(formatDiscoveryMessage(discoveredUrls, latestDiscoveredUrls));
          break;
        case 'discover:done':
          discoveredUrls = e.urlCount;
          discoverySpinner.stop(`Discovered ${discoveredUrls} URLs`);
          totalToCapture = e.urlCount;
          captureSpinner.start(`Capturing URLs... [${renderProgressBar(0, totalToCapture)}] 0/${totalToCapture}`);
          break;
        case 'url:start':
          if (totalToCapture === 0) {
            totalToCapture = e.total;
            captureSpinner.start(`Capturing URLs... [${renderProgressBar(done, totalToCapture)}] ${done}/${totalToCapture}`);
          }
          captureSpinner.message(
            `Capturing URLs... [${renderProgressBar(done, totalToCapture)}] ${done}/${totalToCapture} | ${e.url.slice(0, 60)}`,
          );
          break;
        case 'url:done':
          done++;
          if (e.status === 'failed') failed++;
          totalToCapture = e.total;
          captureSpinner.message(
            `Capturing URLs... [${renderProgressBar(done, totalToCapture)}] ${done}/${totalToCapture} | ${e.url.slice(0, 60)}${e.status === 'failed' ? ' | failed' : ''}`,
          );
          break;
        case 'complete':
          captureSpinner.stop(
            `Captured ${e.stats.totalUrls} URLs [${renderProgressBar(e.stats.totalUrls, e.stats.totalUrls)}] ${e.stats.succeeded} succeeded, ${e.stats.failed} failed, ${e.stats.skipped} skipped`,
          );
          log.success(`${e.stats.succeeded} succeeded, ${e.stats.failed} failed, ${e.stats.skipped} skipped`);
          break;
      }
    },
  });

  note(`Results saved to: ${config.outputDir}`, 'Comparison complete');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uiDist = resolve(__dirname, '../../../../packages/ui/dist');
  const started = await startServer({ outputDir, uiDistDir: uiDist });

  note(`${started.url}\nPress Ctrl+C to stop the server.`, 'Report server');
  await open(started.url);

  let shuttingDown = false;
  let resolveShutdown = () => {};
  const shutdownComplete = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const cleanup = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    process.off('SIGINT', cleanup);
    process.off('SIGTERM', cleanup);
    process.stdin.off('data', handleStdinData);

    try {
      await started.app.close();
    } finally {
      resolveShutdown();
    }
  };

  const handleStdinData = (chunk: Buffer | string) => {
    const value = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (value.includes('\u0003')) {
      void cleanup();
    }
  };

  restoreTerminalInput();
  process.stdin.resume();
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.stdin.on('data', handleStdinData);

  await shutdownComplete;
  process.exit(0);
}
