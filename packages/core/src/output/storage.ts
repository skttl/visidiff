import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunData, ComparisonRecord } from '../types.js';

export async function writeRunData(outputDir: string, runId: string, data: RunData): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, 'run.json');
  await writeFile(path, JSON.stringify({ ...data, runId }, null, 2), 'utf8');
}

export async function writeComparisonRecord(outputDir: string, record: ComparisonRecord): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const filename = `${record.url.id}.json`;
  const path = join(outputDir, 'comparisons', filename);
  await mkdir(join(outputDir, 'comparisons'), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2), 'utf8');
}
