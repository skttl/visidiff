import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export class ScreenshotCache {
  constructor(private readonly dir: string) {}

  private key(url: string, viewport: number): string {
    const hash = Buffer.from(`${url}:${viewport}`).toString('base64').replace(/[/+=]/g, '');
    return join(this.dir, `${hash}.png`);
  }

  async get(url: string, viewport: number): Promise<Buffer | null> {
    const path = this.key(url, viewport);
    if (!existsSync(path)) return null;
    return readFile(path);
  }

  async set(url: string, viewport: number, data: Buffer): Promise<void> {
    const path = this.key(url, viewport);
    await mkdir(this.dir, { recursive: true });
    await writeFile(path, data);
  }

  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }
}
