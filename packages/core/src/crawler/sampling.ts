import { createHash } from 'node:crypto';
import type { UrlGroup } from '../types.js';

export interface SamplingOptions {
  samplesPerGroup: number;
  threshold: number;
  seed: string;
  pinned?: string[];
}

export function groupAndSample(urls: string[], opts: SamplingOptions): UrlGroup[] {
  const pinned = new Set(opts.pinned ?? []);
  const tokenized = urls.map((u) => ({ url: u, segments: new URL(u).pathname.split('/') }));

  // Build prefix tree to find variable positions.
  const byPrefix = new Map<string, string[]>();
  for (const { url, segments } of tokenized) {
    const key = buildPatternKey(segments, tokenized, opts.threshold);
    const list = byPrefix.get(key) ?? [];
    list.push(url);
    byPrefix.set(key, list);
  }

  const groups: UrlGroup[] = [];
  for (const [pattern, groupUrls] of byPrefix) {
    const isPatternGroup = pattern.includes('[*]');
    const pinnedInGroup = groupUrls.filter((u) => pinned.has(u));
    const nonPinned = groupUrls.filter((u) => !pinned.has(u));

    let sampled: string[];
    if (!isPatternGroup || nonPinned.length <= opts.samplesPerGroup) {
      sampled = groupUrls.slice();
    } else {
      const first = nonPinned[0]!;
      const rest = deterministicSample(
        nonPinned.slice(1),
        opts.samplesPerGroup - 1,
        `${opts.seed}:${pattern}`,
      );
      sampled = [first, ...rest, ...pinnedInGroup];
    }
    groups.push({ pattern, urls: groupUrls, sampled });
  }
  return groups;
}

function buildPatternKey(
  segments: string[],
  all: Array<{ segments: string[] }>,
  threshold: number,
): string {
  const result: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const matches = all.filter((t) => samePrefix(t.segments, segments, i));
    const uniqAtPos = new Set(matches.map((t) => t.segments[i] ?? ''));
    if (uniqAtPos.size >= threshold) {
      result.push('[*]');
    } else {
      result.push(segments[i] ?? '');
    }
  }
  return result.join('/');
}

function samePrefix(a: string[], b: string[], upTo: number): boolean {
  if (upTo > a.length || upTo > b.length) return false;
  for (let i = 0; i < upTo; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deterministicSample<T>(items: T[], n: number, seed: string): T[] {
  if (n <= 0 || items.length === 0) return [];
  if (items.length <= n) return items.slice();
  const keyed = items.map((item, i) => ({
    item,
    key: createHash('sha256').update(`${seed}:${i}`).digest('hex'),
  }));
  keyed.sort((a, b) => a.key.localeCompare(b.key));
  return keyed.slice(0, n).map((k) => k.item);
}
