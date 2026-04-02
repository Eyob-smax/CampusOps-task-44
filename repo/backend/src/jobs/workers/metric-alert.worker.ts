import { Worker } from "bullmq";
import { getRedisClient } from "../../lib/redis";
import {
  collectSystemMetrics,
  checkThresholds,
} from "../../modules/observability/metrics.service";
import { logger } from "../../lib/logger";

const connection = { connection: getRedisClient() };

export const metricAlertWorker = new Worker(
  "campusops-metric-alert-check",
  async (job) => {
    await collectSystemMetrics();
    const breaches = await checkThresholds();
    if (breaches > 0) {
      logger.warn({ msg: "Threshold breaches detected", count: breaches });
    }
    return { breaches };
  },
  connection,
);
