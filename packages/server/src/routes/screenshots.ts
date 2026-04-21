import staticPlugin from '@fastify/static';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerScreenshotRoutes(app: FastifyInstance, opts: ServerOptions) {
  void app.register(staticPlugin, {
    root: join(opts.outputDir, 'screenshots'),
    prefix: '/screenshots/',
    decorateReply: false,
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  });
}
