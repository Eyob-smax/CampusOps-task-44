import { config } from '../config';

export const SHIPMENT_SYNC_BACKOFF_TYPE = 'shipment-sync-config-backoff';

export function getShipmentSyncRepeatEveryMs(): number {
  return Math.max(1, config.shipmentSync.intervalMinutes) * 60_000;
}

export function getShipmentSyncRetryOptions(): {
  attempts: number;
  backoff: { type: string };
} {
  return {
    // BullMQ attempts include the initial execution.
    attempts: Math.max(1, config.shipmentSync.maxRetries + 1),
    backoff: { type: SHIPMENT_SYNC_BACKOFF_TYPE },
  };
}

export function shipmentSyncBackoffStrategy(
  attemptsMade: number,
  type?: string,
): number {
  if (type !== SHIPMENT_SYNC_BACKOFF_TYPE) {
    return 0;
  }

  const delays = config.shipmentSync.backoffDelaysMs;
  if (!Array.isArray(delays) || delays.length === 0) {
    return 0;
  }

  const clampedIndex = Math.max(0, Math.min(attemptsMade - 1, delays.length - 1));
  return Math.max(0, delays[clampedIndex] ?? 0);
}
