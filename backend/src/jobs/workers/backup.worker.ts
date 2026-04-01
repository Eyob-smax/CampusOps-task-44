import { Worker } from 'bullmq';
import { getRedisClient } from '../../lib/redis';
import { runBackup, enforceRetention } from '../../modules/observability/backup.service';
import { logger } from '../../lib/logger';

const connection = { connection: getRedisClient() };

export const backupWorker = new Worker('campusops:backup', async (job) => {
  logger.info({ msg: 'Daily backup starting' });
  const record = await runBackup('system');
  const retention = await enforceRetention();
  logger.info({ msg: 'Daily backup completed', backupId: record.id, deleted: retention.deleted });
  return { backupId: record.id, deleted: retention.deleted };
}, connection);
