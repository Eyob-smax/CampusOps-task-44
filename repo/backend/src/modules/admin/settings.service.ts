import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from './audit.service';
import { normalizeThresholdOperator } from '../observability/threshold-operator';

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function updateSettings(
  updates: Record<string, string>,
  actorId: string
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  await writeAuditEntry(actorId, 'settings:updated', 'system_settings', 'global', { keys: Object.keys(updates) });
}

export async function getAlertThresholds() {
  return prisma.alertThreshold.findMany({ orderBy: { metricName: 'asc' } });
}

export async function upsertAlertThreshold(
  metricName: string,
  operator: string,
  value: number,
  isActive: boolean,
  actorId: string
) {
  const normalizedOperator = normalizeThresholdOperator(operator);
  if (!normalizedOperator) {
    const err: any = new Error('Invalid threshold operator');
    err.status = 422;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const threshold = await prisma.alertThreshold.upsert({
    where: { metricName },
    update: { operator: normalizedOperator, value, isActive },
    create: { metricName, operator: normalizedOperator, value, isActive },
  });
  await writeAuditEntry(actorId, 'alert-threshold:updated', 'alert_threshold', threshold.id, {
    metricName,
    operator: normalizedOperator,
    value,
    isActive,
  });
  return threshold;
}

export async function getBackupRecords(limit = 20) {
  return prisma.backupRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
