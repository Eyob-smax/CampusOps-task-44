import { Worker } from 'bullmq';
import { getRedisClient } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { escalateSlaBreaches } from '../../modules/parking/alert.service';

const connection = { connection: getRedisClient() };

/**
 * Parking SLA escalation worker — runs every 30 s.
 * Finds parking alerts whose slaDeadlineAt has passed and escalates them.
 */
export const parkingEscalationWorker = new Worker(
  'campusops:parking-sla-check',
  async (job) => {
    logger.debug({ msg: 'Parking SLA check started', jobId: job.id });
    const escalated = await escalateSlaBreaches();
    if (escalated > 0) {
      logger.warn({ msg: 'Parking alerts auto-escalated (SLA breach)', count: escalated });
    }
    return { escalated };
  },
  connection
);

parkingEscalationWorker.on('failed', (job, err) => {
  logger.error({ msg: 'Parking escalation worker failed', jobId: job?.id, err });
});
