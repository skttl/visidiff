import type { UrlGroup, UrlPattern } from '../types.js';
import { substitute } from '../url-pattern.js';

export async function filterUpdatedUrls(
  groups: UrlGroup[],
  originalPattern: UrlPattern,
  updatedPattern: UrlPattern,
  fetcher: (url: string) => Promise<Response>,
): Promise<UrlGroup[]> {
  // Build list of all sampled URLs to check
  const urlsToCheck = groups.flatMap((g) => g.sampled);
  const results = await Promise.all(
    urlsToCheck.map(async (url) => {
      const updatedUrl = substitute(url, originalPattern, updatedPattern) ?? url;
      try {
        const res = await fetcher(updatedUrl);
        return { url, keep: res.status !== 404 };
      } catch {
        // If fetch fails, keep the URL (failures are handled during capture)
        return { url, keep: true };
      }
    }),
  );

  const keepSet = new Set(results.filter((r) => r.keep).map((r) => r.url));

  return groups.map((g) => ({
    ...g,
    urls: g.urls.filter((u) => keepSet.has(u)),
    sampled: g.sampled.filter((u) => keepSet.has(u)),
  }));
}
