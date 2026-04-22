import { DEFAULT_CONFIG, type VisidiffConfig } from '@visidiff/core';

export function formatConfigSummary(filename: string, config: VisidiffConfig): string {
  const lines = [
    `File: ${filename}`,
    `Original: ${config.original}`,
    `Updated: ${config.updated}`,
    `Viewports: ${config.viewports.join(', ')}`,
    `Max pages: ${config.maxPages}`,
    `Threshold: ${config.threshold}`,
  ];

  if (config.maxDepth !== DEFAULT_CONFIG.maxDepth) {
    lines.push(`Max depth: ${config.maxDepth}`);
  }

  if (config.exclude.length > 0) {
    lines.push(`Exclude: ${config.exclude.join(', ')}`);
  }

  if (config.blockedRequestUrls.length > 0) {
    lines.push(`Blocked request URLs: ${config.blockedRequestUrls.join(', ')}`);
  }

  if (config.samplesPerGroup !== DEFAULT_CONFIG.samplesPerGroup) {
    lines.push(`Samples per group: ${config.samplesPerGroup}`);
  }

  if (config.samplingThreshold !== DEFAULT_CONFIG.samplingThreshold) {
    lines.push(`Sampling threshold: ${config.samplingThreshold}`);
  }

  if (config.fullPageMaxHeight !== DEFAULT_CONFIG.fullPageMaxHeight) {
    lines.push(`Full page max height: ${config.fullPageMaxHeight}`);
  }

  if (config.concurrency !== DEFAULT_CONFIG.concurrency) {
    lines.push(`Concurrency: ${config.concurrency}`);
  }

  if (config.requestDelayMs !== DEFAULT_CONFIG.requestDelayMs) {
    lines.push(`Request delay ms: ${config.requestDelayMs}`);
  }

  if (config.retries !== DEFAULT_CONFIG.retries) {
    lines.push(`Retries: ${config.retries}`);
  }

  if (config.ignoreRobots !== DEFAULT_CONFIG.ignoreRobots) {
    lines.push(`Ignore robots: ${config.ignoreRobots}`);
  }

  if (config.mask.length > 0) {
    lines.push(`Mask selectors: ${config.mask.join(', ')}`);
  }

  if (Object.keys(config.originalAuth).length > 0) {
    lines.push('Original auth: configured');
  }

  if (Object.keys(config.updatedAuth).length > 0) {
    lines.push('Updated auth: configured');
  }

  if (config.beforeScreenshot) {
    lines.push(`Before screenshot: ${config.beforeScreenshot}`);
  }

  if (config.runId) {
    lines.push(`Run id: ${config.runId}`);
  }

  return lines.join('\n');
}
