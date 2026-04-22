import { confirm, isCancel, text } from '@clack/prompts';
import { DEFAULT_CONFIG } from '@visidiff/core';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { getConfigPath, ensureDataDirs } from '../paths.js';

export async function createConfig(): Promise<string | null> {
  await ensureDataDirs();
  const name = await text({
    message: 'Config name',
    placeholder: 'marketing-site',
    validate(value: string) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return 'Config name is required.';
      }

      if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(value.trim())) {
        return 'Use letters, numbers, dashes, underscores, or periods.';
      }
    },
  });

  if (isCancel(name)) {
    return null;
  }

  const original = await text({
    message: 'Original URL pattern',
    placeholder: 'https://example.com/*',
    validate(value: string) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return 'Value is required.';
      }

      return (value.match(/\*/g) ?? []).length === 1 ? undefined : "Pattern must contain exactly one '*'.";
    },
  });

  if (isCancel(original)) {
    return null;
  }

  const updated = await text({
    message: 'Updated URL pattern',
    placeholder: 'https://staging.example.com/*',
    validate(value: string) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return 'Value is required.';
      }

      return (value.match(/\*/g) ?? []).length === 1 ? undefined : "Pattern must contain exactly one '*'.";
    },
  });

  if (isCancel(updated)) {
    return null;
  }

  const viewports = await text({
    message: 'Viewports',
    initialValue: DEFAULT_CONFIG.viewports.join(','),
    placeholder: '1440,390',
    validate(value: string) {
      return parseViewports(value).length > 0 ? undefined : 'Enter one or more positive numbers separated by commas.';
    },
  });

  if (isCancel(viewports)) {
    return null;
  }

  const maxPages = await text({
    message: 'Max pages',
    initialValue: String(DEFAULT_CONFIG.maxPages),
    validate(value: string) {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer.';
    },
  });

  if (isCancel(maxPages)) {
    return null;
  }

  const threshold = await text({
    message: 'Threshold',
    initialValue: String(DEFAULT_CONFIG.threshold),
    validate(value: string) {
      const parsed = Number(value);
      return parsed >= 0 && parsed <= 1 ? undefined : 'Enter a number between 0 and 1.';
    },
  });

  if (isCancel(threshold)) {
    return null;
  }

  const filename = `${name.trim()}.visidiff.config.js`;
  const absolutePath = getConfigPath(filename);

  if (existsSync(absolutePath)) {
    const overwrite = await confirm({
      message: `${filename} already exists. Overwrite it?`,
      initialValue: false,
    });

    if (isCancel(overwrite) || !overwrite) {
      return null;
    }
  }

  const content = renderConfig({
    original: original.trim(),
    updated: updated.trim(),
    viewports: parseViewports(viewports),
    maxPages: Number(maxPages),
    threshold: Number(threshold),
    blockedRequestUrls: [],
  });

  await writeFile(absolutePath, content, 'utf8');
  return filename;
}

function parseViewports(value: string): number[] {
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((viewport) => Number.isInteger(viewport) && viewport > 0);

  return Array.from(new Set(parsed));
}

function renderConfig(input: {
  original: string;
  updated: string;
  viewports: number[];
  maxPages: number;
  threshold: number;
  blockedRequestUrls: string[];
}): string {
  return `export default {
  original: ${JSON.stringify(input.original)},
  updated: ${JSON.stringify(input.updated)},
  viewports: [${input.viewports.join(', ')}],
  maxDepth: ${DEFAULT_CONFIG.maxDepth},
  maxPages: ${input.maxPages},
  exclude: ${JSON.stringify(DEFAULT_CONFIG.exclude)},
  blockedRequestUrls: ${JSON.stringify(input.blockedRequestUrls)},
  samplesPerGroup: ${DEFAULT_CONFIG.samplesPerGroup},
  samplingThreshold: ${DEFAULT_CONFIG.samplingThreshold},
  fullPageMaxHeight: ${DEFAULT_CONFIG.fullPageMaxHeight},
  concurrency: ${DEFAULT_CONFIG.concurrency},
  requestDelayMs: ${DEFAULT_CONFIG.requestDelayMs},
  retries: ${DEFAULT_CONFIG.retries},
  ignoreRobots: ${DEFAULT_CONFIG.ignoreRobots},
  threshold: ${input.threshold},
  mask: ${JSON.stringify(DEFAULT_CONFIG.mask)},
  originalAuth: {},
  updatedAuth: {},
  beforeScreenshot: undefined,
  runId: undefined,
};
`;
}
