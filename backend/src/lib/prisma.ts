// config must be imported first so DATABASE_URL is set in process.env
import '../config';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // Prevent multiple instances in hot-reload dev
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = globalThis.__prisma ?? new PrismaClient({
  log: [
    { level: 'error', emit: 'event' },
    { level: 'warn',  emit: 'event' },
  ],
});

prisma.$on('error' as never, (e: unknown) => {
  logger.error({ msg: 'Prisma error', err: e });
});

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn({ msg: 'Prisma warning', err: e });
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
