import { Worker } from "bullmq";
import { getRedisClient } from "../../lib/redis";
import { runSyncForAllActiveCarriers } from "../../modules/shipment/carrier-sync.service";
import { logger } from "../../lib/logger";
import { shipmentSyncBackoffStrategy } from "../shipment-sync-policy";
import { createJobRecord, updateJobRecord } from "../../modules/jobs/job.service";
import { notifyJobProgress } from "../index";

const connection = { connection: getRedisClient() };

export const shipmentSyncWorker = new Worker(
  "campusops-shipment-sync",
  async (job) => {
    const jobRecord = await createJobRecord({
      queueName: "campusops-shipment-sync",
      jobName: "shipment-sync",
      actorId: "system",
    });

    await updateJobRecord(jobRecord.id, {
      status: "active",
      bullJobId: String(job.id),
      startedAt: new Date(),
      progress: 10,
      attempts: job.attemptsMade,
    });
    notifyJobProgress(jobRecord.id, "active", 10, {
      queueName: "campusops-shipment-sync",
      jobName: "shipment-sync",
      bullJobId: String(job.id),
    });

    try {
      const { updated, errors } = await runSyncForAllActiveCarriers();

      await updateJobRecord(jobRecord.id, {
        status: "completed",
        progress: 100,
        totalRows: updated + errors,
        processedRows: updated,
        failedRows: errors,
        result: JSON.stringify({ updated, errors }),
        finishedAt: new Date(),
        attempts: job.attemptsMade,
      });
      notifyJobProgress(jobRecord.id, "completed", 100, { updated, errors });

      logger.info({
        msg: "Shipment sync completed",
        jobRecordId: jobRecord.id,
        updated,
        errors,
      });

      return { jobRecordId: jobRecord.id, updated, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateJobRecord(jobRecord.id, {
        status: "failed",
        progress: 100,
        errorMsg: message,
        finishedAt: new Date(),
        attempts: job.attemptsMade,
      });
      notifyJobProgress(jobRecord.id, "failed", 100, { error: message });
      throw err;
    }
  },
  {
    ...connection,
    settings: {
      backoffStrategy: (attemptsMade: number, type?: string) =>
        shipmentSyncBackoffStrategy(attemptsMade, type),
    },
  },
);

shipmentSyncWorker.on("failed", (job, err) => {
  logger.error({ msg: "Shipment sync job failed", jobId: job?.id, err });
});

shipmentSyncWorker.on("error", (err) => {
  logger.error({ msg: "Shipment sync worker connection error", err });
});
