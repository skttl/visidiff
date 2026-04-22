import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerScreenshotRoutes(app: FastifyInstance, opts: ServerOptions) {
  if (!existsSync(opts.outputDir)) return;
  void app.register(staticPlugin, {
    root: opts.outputDir,
    prefix: '/screenshots/',
    decorateReply: false,
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  });
}
