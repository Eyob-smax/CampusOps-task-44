import { Worker } from "bullmq";
import { getRedisClient } from "../../lib/redis";
import { cleanOldLogs } from "../../modules/observability/log.service";
import { logger } from "../../lib/logger";

const connection = { connection: getRedisClient() };

export const logRetentionWorker = new Worker(
  "campusops-log-retention",
  async (job) => {
    const deleted = await cleanOldLogs();
    logger.info({
      msg: "Log retention cleanup completed",
      deletedFiles: deleted,
    });
    return { deletedFiles: deleted };
  },
  connection,
);
