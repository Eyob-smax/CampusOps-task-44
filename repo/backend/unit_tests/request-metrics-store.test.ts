import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRequestMetricsSnapshot,
  observeRequest,
  resetRequestMetricsStore,
} from '../src/modules/observability/request-metrics.store';

describe('request metrics store', () => {
  beforeEach(() => {
    resetRequestMetricsStore();
  });

  it('computes p95 latency and server error rate from rolling samples', () => {
    const now = Date.now();
    [10, 20, 30, 40, 50].forEach((duration) => {
      observeRequest(duration, 200, now);
    });
    observeRequest(60, 500, now);

    const snapshot = getRequestMetricsSnapshot(now);
    expect(snapshot.sampleCount).toBe(6);
    expect(snapshot.errorCount).toBe(1);
    expect(snapshot.p95LatencyMs).toBe(60);
    expect(snapshot.errorRatePercent).toBeCloseTo(16.666, 2);
  });

  it('drops samples outside the rolling window', () => {
    const now = Date.now();
    const twentyMinutesAgo = now - 20 * 60 * 1000;

    observeRequest(100, 500, twentyMinutesAgo);
    observeRequest(20, 200, now);

    const snapshot = getRequestMetricsSnapshot(now);
    expect(snapshot.sampleCount).toBe(1);
    expect(snapshot.errorCount).toBe(0);
    expect(snapshot.p95LatencyMs).toBe(20);
    expect(snapshot.errorRatePercent).toBe(0);
  });
});
