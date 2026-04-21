import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerDataRoutes(app: FastifyInstance, opts: ServerOptions) {
  app.get('/api/data', async (_req, reply) => {
    try {
      const raw = await readFile(join(opts.outputDir, 'data.json'), 'utf8');
      reply.header('Cache-Control', 'no-store');
      reply.type('application/json').send(raw);
    } catch (err) {
      reply.code(404).send({ error: 'data.json not found', detail: (err as Error).message });
    }
  });

  app.get('/api/health', async () => ({ ok: true, mode: 'readonly' }));
}
