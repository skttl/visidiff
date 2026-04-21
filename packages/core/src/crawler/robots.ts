const robotsParser: any = require('robots-parser');

export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
}

export interface RobotsOptions {
  ignore?: boolean;
  userAgent?: string;
}

export class RobotsChecker {
  private constructor(
    private readonly robots: any,
    private readonly userAgent: string,
    private readonly ignore: boolean,
  ) {}

  static async load(origin: string, fetcher: FetchLike, opts: RobotsOptions = {}) {
    const userAgent = opts.userAgent ?? 'visidiff';
    if (opts.ignore) return new RobotsChecker(null, userAgent, true);
    const robotsUrl = new URL('/robots.txt', origin).toString();
    let text = '';
    try {
      const res = await fetcher(robotsUrl);
      if (res.ok) text = await res.text();
    } catch {
      // treat as empty — allow-all
    }
    const robots = robotsParser(robotsUrl, text);
    return new RobotsChecker(robots, userAgent, false);
  }

  isAllowed(url: string): boolean {
    if (this.ignore || !this.robots) return true;
    return this.robots.isAllowed(url, this.userAgent) ?? true;
  }
}
