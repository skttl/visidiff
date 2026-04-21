import { fastify } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { join } from 'node:path';
import { registerDataRoutes } from './routes/data.js';
import { registerScreenshotRoutes } from './routes/screenshots.js';
import { registerUiRoutes } from './routes/ui.js';
import type { ServerOptions } from './types.js';

export async function createServer(opts: ServerOptions) {
  const app = fastify({ logger: { level: 'warn' } });
  await app.register(cors);
  registerDataRoutes(app, opts);
  registerScreenshotRoutes(app, opts);
  registerUiRoutes(app, opts);
  return app;
}

export async function startServer(opts: ServerOptions) {
  const app = await createServer(opts);
  const port = opts.port ?? 4321;
  const host = opts.host ?? '127.0.0.1';
  await app.listen({ port, host });
  return { app, url: `http://${host}:${port}` };
}

export type { ServerOptions };
