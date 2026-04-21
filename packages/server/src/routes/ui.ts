import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerUiRoutes(app: FastifyInstance, opts: ServerOptions) {
  if (!existsSync(opts.uiDistDir)) {
    app.log.warn(`UI dist not found at ${opts.uiDistDir} — did you build @visidiff/ui?`);
    return;
  }
  void app.register(staticPlugin, {
    root: opts.uiDistDir,
    prefix: '/',
    decorateReply: true,
    wildcard: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/screenshots/')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    reply.sendFile('index.html');
  });
}
