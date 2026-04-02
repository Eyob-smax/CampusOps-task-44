// config must be imported first to set process.env.DATABASE_URL
import './config';
import { createServer } from 'http';
import { createApp } from './app';
import { setupSocket } from './lib/socket';
import { connectRedis, disconnectRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { registerJobs } from './jobs';
import { logger } from './lib/logger';
import { config } from './config';
import fs from 'fs';

async function bootstrap(): Promise<void> {
  // Ensure runtime directories exist
  for (const dir of [config.storage.path, config.logs.path, config.backup.path]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Connect to Redis
  await connectRedis();

  // Connect to database
  await prisma.$connect();
  logger.info({ msg: 'Database connected' });

  // Create Express app
  const app = createApp();

  // HTTP server
  const httpServer = createServer(app);

  // Attach Socket.IO
  setupSocket(httpServer);

  // Register background jobs
  await registerJobs();

  // Start listening
  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, () => {
      logger.info({
        msg: 'CampusOps backend ready',
        port: config.port,
        env: config.env,
        pid: process.pid,
      });
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ msg: `${signal} received — shutting down gracefully` });
    httpServer.close(async () => {
      try {
        await disconnectRedis();
        await prisma.$disconnect();
        logger.info({ msg: 'Shutdown complete' });
      } catch (err) {
        logger.error({ msg: 'Error during shutdown', err });
      }
      process.exit(0);
    });

    // Force exit after 10 s
    setTimeout(() => {
      logger.error({ msg: 'Forced shutdown after timeout' });
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Failed to start server:', err);
  process.exit(1);
});
