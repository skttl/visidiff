import { z } from 'zod';
import type { VisidiffConfig } from './types.js';

export const DEFAULT_CONFIG = {
  viewports: [1440, 390],
  maxDepth: 3,
  maxPages: 200,
  exclude: [] as string[],
  samplesPerGroup: 2,
  samplingThreshold: 5,
  fullPageMaxHeight: 10_000,
  concurrency: 4,
  requestDelayMs: 0,
  retries: 2,
  ignoreRobots: false,
  threshold: 0.1,
  mask: [] as string[],
  originalAuth: {},
  updatedAuth: {},
  outputDir: './visidiff-output',
  cacheDir: './.visidiff-cache',
} as const;

const AuthSchema = z.object({
  basic: z.string().optional(),
  headers: z.record(z.string()).optional(),
  cookiesFile: z.string().optional(),
});

const ConfigSchema = z.object({
  original: z
    .string()
    .refine((s) => (s.match(/\*/g) ?? []).length === 1, {
      message: "original: pattern must contain exactly one asterisk ('*')",
    }),
  updated: z
    .string()
    .refine((s) => (s.match(/\*/g) ?? []).length === 1, {
      message: "updated: pattern must contain exactly one asterisk ('*')",
    }),
  viewports: z.array(z.number().int().positive()).default([...DEFAULT_CONFIG.viewports]),
  maxDepth: z.number().int().nonnegative().default(DEFAULT_CONFIG.maxDepth),
  maxPages: z.number().int().positive().default(DEFAULT_CONFIG.maxPages),
  exclude: z.array(z.string()).default([]),
  samplesPerGroup: z.number().int().positive().default(DEFAULT_CONFIG.samplesPerGroup),
  samplingThreshold: z.number().int().min(2).default(DEFAULT_CONFIG.samplingThreshold),
  fullPageMaxHeight: z.number().int().positive().default(DEFAULT_CONFIG.fullPageMaxHeight),
  concurrency: z.number().int().positive().default(DEFAULT_CONFIG.concurrency),
  requestDelayMs: z.number().int().nonnegative().default(0),
  retries: z.number().int().nonnegative().default(DEFAULT_CONFIG.retries),
  ignoreRobots: z.boolean().default(false),
  threshold: z.number().min(0).max(1).default(DEFAULT_CONFIG.threshold),
  mask: z.array(z.string()).default([]),
  originalAuth: AuthSchema.default({}),
  updatedAuth: AuthSchema.default({}),
  beforeScreenshot: z.string().optional(),
  outputDir: z.string().default(DEFAULT_CONFIG.outputDir),
  cacheDir: z.string().default(DEFAULT_CONFIG.cacheDir),
  runId: z.string().optional(),
});

export function validateConfig(input: unknown): VisidiffConfig {
  return ConfigSchema.parse(input) as VisidiffConfig;
}

export async function loadConfigFromFile(path: string): Promise<VisidiffConfig> {
  const mod = await import(path);
  const raw = mod.default ?? mod;
  return validateConfig(raw);
}
