import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { config } = await import('../src/config');
const {
  SHIPMENT_SYNC_BACKOFF_TYPE,
  getShipmentSyncRepeatEveryMs,
  getShipmentSyncRetryOptions,
  shipmentSyncBackoffStrategy,
} = await import('../src/jobs/shipment-sync-policy');

describe('shipment sync policy', () => {
  it('uses configured repeat interval in milliseconds', () => {
    expect(getShipmentSyncRepeatEveryMs()).toBe(config.shipmentSync.intervalMinutes * 60_000);
  });

  it('maps maxRetries to BullMQ attempts including initial run', () => {
    const retryOptions = getShipmentSyncRetryOptions();
    expect(retryOptions.attempts).toBe(config.shipmentSync.maxRetries + 1);
    expect(retryOptions.backoff.type).toBe(SHIPMENT_SYNC_BACKOFF_TYPE);
  });

  it('returns configured backoff delays for retry attempts', () => {
    expect(shipmentSyncBackoffStrategy(1, SHIPMENT_SYNC_BACKOFF_TYPE)).toBe(
      config.shipmentSync.backoffDelaysMs[0],
    );
    expect(shipmentSyncBackoffStrategy(2, SHIPMENT_SYNC_BACKOFF_TYPE)).toBe(
      config.shipmentSync.backoffDelaysMs[1],
    );
    expect(shipmentSyncBackoffStrategy(3, SHIPMENT_SYNC_BACKOFF_TYPE)).toBe(
      config.shipmentSync.backoffDelaysMs[2],
    );
    expect(shipmentSyncBackoffStrategy(4, SHIPMENT_SYNC_BACKOFF_TYPE)).toBe(
      config.shipmentSync.backoffDelaysMs[3],
    );
  });

  it('clamps to the final delay after max configured retries', () => {
    const lastDelay =
      config.shipmentSync.backoffDelaysMs[config.shipmentSync.backoffDelaysMs.length - 1];
    expect(shipmentSyncBackoffStrategy(99, SHIPMENT_SYNC_BACKOFF_TYPE)).toBe(lastDelay);
  });

  it('returns zero for unknown backoff strategy type', () => {
    expect(shipmentSyncBackoffStrategy(1, 'unknown-type')).toBe(0);
  });
});
