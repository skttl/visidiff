import { pino } from 'pino';

export const logger = pino({
  level: process.env.VISIDIFF_LOG_LEVEL ?? 'info',
});
