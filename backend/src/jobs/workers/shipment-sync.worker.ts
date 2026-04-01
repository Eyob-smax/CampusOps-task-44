import { Worker } from 'bullmq';
import { getRedisClient } from '../../lib/redis';
import { runSyncForAllActiveCarriers } from '../../modules/shipment/carrier-sync.service';
import { logger } from '../../lib/logger';

const connection = { connection: getRedisClient() };

export const shipmentSyncWorker = new Worker(
  'campusops:shipment-sync',
  async (job) => {
    const { updated, errors } = await runSyncForAllActiveCarriers();
    logger.info({ msg: 'Shipment sync completed', updated, errors });
    return { updated, errors };
  },
  connection,
);

shipmentSyncWorker.on('failed', (job, err) => {
  logger.error({ msg: 'Shipment sync job failed', jobId: job?.id, err });
});

shipmentSyncWorker.on('error', (err) => {
  logger.error({ msg: 'Shipment sync worker connection error', err });
});
