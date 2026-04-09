import { Worker } from "bullmq";
import { getRedisClient } from "../../lib/redis";
import {
  runBackup,
  enforceRetention,
  verifyBackup,
} from "../../modules/observability/backup.service";
import { logger } from "../../lib/logger";

const connection = { connection: getRedisClient() };

export const backupWorker = new Worker(
  "campusops-backup",
  async (job) => {
    logger.info({ msg: "Daily backup starting" });
    const record = await runBackup("system");
    const verification = await verifyBackup(record.id, { runRestoreTest: true });
    const retention = await enforceRetention();
    logger.info({
      msg: "Daily backup completed",
      backupId: record.id,
      verifyPassed: verification.passed,
      verifyDetails: verification.details,
      deleted: retention.deleted,
    });
    return {
      backupId: record.id,
      verifyPassed: verification.passed,
      verifyDetails: verification.details,
      deleted: retention.deleted,
    };
  },
  connection,
);
