export interface UrlPattern {
  prefix: string;
  suffix: string;
  raw: string;
}

export interface AuthConfig {
  basic?: string;
  headers?: Record<string, string>;
  cookiesFile?: string;
}

export interface MaskConfig {
  selectors: string[];
}

export interface VisidiffConfig {
  original: string;
  updated: string;
  viewports: number[];
  maxDepth: number;
  maxPages: number;
  exclude: string[];
  blockedRequestUrls: string[];
  samplesPerGroup: number;
  samplingThreshold: number;
  fullPageMaxHeight: number;
  concurrency: number;
  requestDelayMs: number;
  retries: number;
  ignoreRobots: boolean;
  threshold: number;
  mask: string[];
  originalAuth: AuthConfig;
  updatedAuth: AuthConfig;
  beforeScreenshot?: string;
  runId?: string;
}

export interface UrlGroup {
  pattern: string;
  urls: string[];
  sampled: string[];
}

export type CrawlStatus = 'pending' | 'success' | 'skipped-404' | 'error';

export interface UrlRecord {
  id: string;
  originalUrl: string;
  updatedUrl: string;
  group: string;
  originalStatus: number | null;
  updatedStatus: number | null;
  error?: string;
}

export type DiffStatus = 'pending' | 'computed' | 'failed' | 'skipped';

export interface ViewportDiff {
  viewport: number;
  originalPath: string;
  updatedPath: string;
  diffPath: string | null;
  pixelDiffPercent: number | null;
  heightDeltaPx: number | null;
  status: DiffStatus;
  error?: string;
}

export interface ComparisonRecord {
  url: UrlRecord;
  viewports: ViewportDiff[];
}

export interface RunData {
  version: 1;
  createdAt: string;
  config: Pick<VisidiffConfig, 'original' | 'updated' | 'viewports' | 'threshold'>;
  comparisons: ComparisonRecord[];
  failedComparisons?: ComparisonRecord[];
  stats: {
    totalUrls: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}
