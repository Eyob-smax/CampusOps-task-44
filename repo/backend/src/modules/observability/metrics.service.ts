import os from 'os';
import { prisma } from '../../lib/prisma';
import { emitToNamespace } from '../../lib/socket';
import { logger } from '../../lib/logger';
import { normalizeThresholdOperator } from './threshold-operator';
import { getRequestMetricsSnapshot } from './request-metrics.store';

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export async function recordMetric(
  metricName: string,
  value: number,
  labels?: Record<string, string>,
): Promise<void> {
  const labelsStr = labels ? JSON.stringify(labels) : null;
  await prisma.metricsSnapshot.create({
    data: {
      metricName,
      value,
      labels: labelsStr,
      capturedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getLatestMetrics() {
  // Fetch latest snapshot per distinct metricName
  const snapshots = await prisma.metricsSnapshot.findMany({
    orderBy: { capturedAt: 'desc' },
  });

  const seen = new Set<string>();
  const latest: typeof snapshots = [];
  for (const s of snapshots) {
    if (!seen.has(s.metricName)) {
      seen.add(s.metricName);
      latest.push(s);
    }
  }
  return latest;
}

export async function getMetricHistory(
  metricName: string,
  fromIso?: string,
  toIso?: string,
  limit = 200,
) {
  const where: any = { metricName };
  if (fromIso || toIso) {
    where.capturedAt = {};
    if (fromIso) where.capturedAt.gte = new Date(fromIso);
    if (toIso) where.capturedAt.lte = new Date(toIso);
  }

  return prisma.metricsSnapshot.findMany({
    where,
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// System metric collection
// ---------------------------------------------------------------------------

export async function collectSystemMetrics(): Promise<void> {
  // cpu_utilization_percent
  const cpuLoad = (os.loadavg()[0] / os.cpus().length) * 100;
  await recordMetric('cpu_utilization_percent', parseFloat(cpuLoad.toFixed(2)));

  // API quality metrics (rolling 15-minute window)
  const requestSnapshot = getRequestMetricsSnapshot();
  await recordMetric(
    'api_latency_p95_ms',
    parseFloat(requestSnapshot.p95LatencyMs.toFixed(2)),
    {
      windowMinutes: '15',
      sampleCount: String(requestSnapshot.sampleCount),
    },
  );
  await recordMetric(
    'api_error_rate_percent',
    parseFloat(requestSnapshot.errorRatePercent.toFixed(2)),
    {
      windowMinutes: '15',
      sampleCount: String(requestSnapshot.sampleCount),
      errorCount: String(requestSnapshot.errorCount),
    },
  );

  // memory metrics
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  await recordMetric('memory_used_mb', parseFloat(((totalMem - freeMem) / 1024 / 1024).toFixed(2)));
  await recordMetric('memory_free_mb', parseFloat((freeMem / 1024 / 1024).toFixed(2)));

  // active_jobs — JobRecord where status = 'active'
  const activeJobs = await prisma.jobRecord.count({
    where: { status: 'active' },
  });
  await recordMetric('active_jobs', activeJobs);

  // open_parking_alerts
  const openParkingAlerts = await prisma.parkingAlert.count({
    where: { status: { in: ['open', 'claimed'] } },
  });
  await recordMetric('open_parking_alerts', openParkingAlerts);

  // open_after_sales_tickets
  const openAfterSalesTickets = await prisma.afterSalesTicket.count({
    where: { status: { not: 'closed' } },
  });
  await recordMetric('open_after_sales_tickets', openAfterSalesTickets);

  logger.info({ msg: 'System metrics collected' });
}

// ---------------------------------------------------------------------------
// Threshold evaluation
// ---------------------------------------------------------------------------

export async function checkThresholds(): Promise<number> {
  const thresholds = await prisma.alertThreshold.findMany({
    where: { isActive: true },
  });

  if (thresholds.length === 0) return 0;

  // Get latest value for each metric referenced by active thresholds
  const metricNames = [...new Set(thresholds.map((t) => t.metricName))];
  const latestValues: Record<string, number> = {};

  for (const name of metricNames) {
    const snapshot = await prisma.metricsSnapshot.findFirst({
      where: { metricName: name },
      orderBy: { capturedAt: 'desc' },
    });
    if (snapshot) {
      latestValues[name] = snapshot.value;
    }
  }

  let breachCount = 0;

  for (const threshold of thresholds) {
    const current = latestValues[threshold.metricName];
    if (current === undefined) continue;

    const breached = evaluateOperator(current, threshold.operator, threshold.value);
    if (!breached) continue;

    breachCount++;
    const canonicalOperator = normalizeThresholdOperator(threshold.operator) ?? threshold.operator;
    const message = `Metric "${threshold.metricName}" value ${current} ${canonicalOperator} threshold ${threshold.value}`;

    await prisma.alertHistory.create({
      data: {
        metricName: threshold.metricName,
        value: current,
        threshold: threshold.value,
        message,
        isAcknowledged: false,
      },
    });

    emitToNamespace('/alerts', 'alert:threshold-breach', {
      metric: threshold.metricName,
      metricName: threshold.metricName,
      operator: canonicalOperator,
      value: current,
      threshold: threshold.value,
      message,
    });

    logger.warn({ msg: 'Threshold breach detected', metricName: threshold.metricName, value: current, threshold: threshold.value });
  }

  return breachCount;
}

function evaluateOperator(current: number, operator: string, threshold: number): boolean {
  const normalized = normalizeThresholdOperator(operator);
  switch (normalized) {
    case '>':  return current > threshold;
    case '<':  return current < threshold;
    case '>=': return current >= threshold;
    case '<=': return current <= threshold;
    case '==': return current === threshold;
    default:   return false;
  }
}

// ---------------------------------------------------------------------------
// Alert management
// ---------------------------------------------------------------------------

export async function acknowledgeAlert(alertHistoryId: string, actorId: string) {
  const alert = await prisma.alertHistory.findUnique({ where: { id: alertHistoryId } });
  if (!alert) {
    const err: any = new Error('Alert history record not found');
    err.status = 404;
    err.code = 'ALERT_NOT_FOUND';
    throw err;
  }

  return prisma.alertHistory.update({
    where: { id: alertHistoryId },
    data: {
      isAcknowledged: true,
      acknowledgedAt: new Date(),
    },
  });
}

export async function listAlertHistory(params: {
  acknowledged?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { acknowledged, from, to, page = 1, limit = 50 } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (acknowledged !== undefined) where.isAcknowledged = acknowledged;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.alertHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.alertHistory.count({ where }),
  ]);

  return { items, total, page, limit };
}
