interface RequestSample {
  durationMs: number;
  statusCode: number;
  capturedAtMs: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const samples: RequestSample[] = [];

function pruneExpired(nowMs: number): void {
  const cutoff = nowMs - WINDOW_MS;
  while (samples.length > 0 && samples[0]!.capturedAtMs < cutoff) {
    samples.shift();
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function observeRequest(durationMs: number, statusCode: number, nowMs = Date.now()): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }

  samples.push({
    durationMs,
    statusCode,
    capturedAtMs: nowMs,
  });

  pruneExpired(nowMs);
}

export function getRequestMetricsSnapshot(nowMs = Date.now()): {
  p95LatencyMs: number;
  errorRatePercent: number;
  sampleCount: number;
  errorCount: number;
} {
  pruneExpired(nowMs);
  if (samples.length === 0) {
    return {
      p95LatencyMs: 0,
      errorRatePercent: 0,
      sampleCount: 0,
      errorCount: 0,
    };
  }

  const durations = samples.map((s) => s.durationMs);
  const errorCount = samples.filter((s) => s.statusCode >= 500).length;
  const p95LatencyMs = percentile(durations, 95);
  const errorRatePercent = (errorCount / samples.length) * 100;

  return {
    p95LatencyMs,
    errorRatePercent,
    sampleCount: samples.length,
    errorCount,
  };
}

export function resetRequestMetricsStore(): void {
  samples.length = 0;
}