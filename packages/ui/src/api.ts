import type { RunData } from './types.js';

export async function fetchRunData(): Promise<RunData> {
  const res = await fetch('/api/data', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load /api/data: ${res.status}`);
  return (await res.json()) as RunData;
}
