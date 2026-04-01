import { Queue, Worker } from "bullmq";
import { getRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";
import { emitToNamespace } from "../lib/socket";
import { config } from "../config";

const connection = { connection: getRedisClient() };

// ---- Queue definitions ----
export const importQueue = new Queue("campusops-bulk-import", connection);
export const shipmentSyncQueue = new Queue(
  "campusops-shipment-sync",
  connection,
);
export const escalationQueue = new Queue(
  "campusops-escalation-checker",
  connection,
);
export const heartbeatQueue = new Queue(
  "campusops-heartbeat-checker",
  connection,
);
export const parkingSlaQueue = new Queue(
  "campusops-parking-sla-check",
  connection,
);
export const backupQueue = new Queue("campusops-backup", connection);
export const alertCheckQueue = new Queue(
  "campusops-metric-alert-check",
  connection,
);
export const retentionQueue = new Queue("campusops-log-retention", connection);

/**
 * Registers all repeatable jobs and workers.
 * Called once at server startup.
 */
export async function registerJobs(): Promise<void> {
  // Escalation checker — every 60 s
  await escalationQueue.add(
    "check-escalations",
    {},
    { repeat: { every: 60_000 }, jobId: "escalation-checker" },
  );

  // Classroom heartbeat checker — every 30 s
  await heartbeatQueue.add(
    "check-heartbeats",
    {},
    { repeat: { every: 30_000 }, jobId: "heartbeat-checker" },
  );

  // Parking SLA escalation — every 30 s
  await parkingSlaQueue.add(
    "parking-sla-check",
    {},
    { repeat: { every: 30_000 }, jobId: "parking-sla-check" },
  );

  // Shipment carrier sync — every 5 minutes
  await shipmentSyncQueue.add(
    "shipment-sync",
    {},
    { repeat: { every: 5 * 60_000 }, jobId: "shipment-sync" },
  );

  // Daily backup — 02:00 UTC
  await backupQueue.add(
    "daily-backup",
    {},
    { repeat: { pattern: config.backup.scheduleCron }, jobId: "daily-backup" },
  );

  // Metric alert check — every 30 s
  await alertCheckQueue.add(
    "check-alerts",
    {},
    { repeat: { every: 30_000 }, jobId: "alert-checker" },
  );

  // Log retention cleanup — daily 03:00 UTC
  await retentionQueue.add(
    "log-cleanup",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "log-cleanup" },
  );

  // Register workers (handlers registered in per-domain modules)
  registerWorkerStubs();

  // Import worker — real implementation
  await import("./workers/import.worker");

  // Heartbeat + escalation workers — real implementations
  await import("./workers/heartbeat.worker");

  // Parking SLA escalation worker
  await import("./workers/parking-escalation.worker");

  // Shipment carrier sync worker
  await import("./workers/shipment-sync.worker");

  // Observability workers — real implementations
  await import("./workers/backup.worker");
  await import("./workers/log-retention.worker");
  await import("./workers/metric-alert.worker");

  logger.info({ msg: "Background jobs registered", queues: 8 });
}

/**
 * Emit job progress updates over Socket.IO /jobs namespace.
 * Called from individual job workers.
 */
export function notifyJobProgress(
  jobId: string,
  status: string,
  progress?: number,
  data?: unknown,
): void {
  emitToNamespace("/jobs", "job:update", {
    jobId,
    status,
    progress,
    data,
    timestamp: new Date().toISOString(),
  });
}

// Stub workers — replaced by real implementations in subsequent prompts
function registerWorkerStubs(): void {
  // All previously-stubbed workers are now handled by real worker files
  const queues: { queue: string; name: string }[] = [];

  for (const { queue, name } of queues) {
    new Worker(
      queue,
      async (job) => {
        logger.debug({
          msg: `Job worker stub executed`,
          job: name,
          jobId: job.id,
        });
      },
      connection,
    );
  }
}
