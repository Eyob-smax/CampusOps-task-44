import { Worker } from 'bullmq';
import { getRedisClient } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { markStaleClassroomsOffline } from '../../modules/classroom/classroom.service';
import { escalateStaleAnomalies } from '../../modules/classroom/anomaly.service';

const connection = { connection: getRedisClient() };

// ---- Heartbeat checker — runs every 30 s ----
export const heartbeatWorker = new Worker(
  'campusops:heartbeat-checker',
  async (job) => {
    logger.debug({ msg: 'Heartbeat check started', jobId: job.id });

    const { offlineCount, anomaliesCreated } = await markStaleClassroomsOffline();

    if (offlineCount > 0) {
      logger.warn({ msg: 'Classrooms marked offline by heartbeat checker', count: offlineCount, anomaliesCreated });
    }

    return { offlineCount, anomaliesCreated };
  },
  connection
);

// ---- Escalation checker — runs every 60 s ----
export const escalationWorker = new Worker(
  'campusops:escalation-checker',
  async (job) => {
    logger.debug({ msg: 'Escalation check started', jobId: job.id });
    const escalated = await escalateStaleAnomalies();
    if (escalated > 0) {
      logger.info({ msg: 'Stale anomalies auto-escalated', count: escalated });
    }
    return { escalated };
  },
  connection
);

heartbeatWorker.on('failed', (job, err) => {
  logger.error({ msg: 'Heartbeat worker failed', jobId: job?.id, err });
});

escalationWorker.on('failed', (job, err) => {
  logger.error({ msg: 'Escalation worker failed', jobId: job?.id, err });
});
