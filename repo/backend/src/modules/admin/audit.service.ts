import { prisma } from '../../lib/prisma';
import { encrypt, decrypt } from '../../lib/encryption';
import { logger } from '../../lib/logger';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorUsername?: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AuditSearchParams {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function writeAuditEntry(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  try {
    const encryptedDetail = encrypt(JSON.stringify(detail));
    await prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, encryptedDetail, ipAddress },
    });
  } catch (err) {
    logger.error({ msg: 'Failed to write audit log', err, action, entityId });
  }
}

export async function searchAuditLogs(
  params: AuditSearchParams,
  revealDetail = false
): Promise<{ data: AuditLogEntry[]; total: number }> {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const skip  = (page - 1) * limit;

  const where = {
    ...(params.actorId    && { actorId: params.actorId }),
    ...(params.entityType && { entityType: params.entityType }),
    ...(params.entityId   && { entityId: params.entityId }),
    ...(params.action     && { action: { contains: params.action } }),
    ...(params.from || params.to
      ? {
          createdAt: {
            ...(params.from && { gte: params.from }),
            ...(params.to   && { lte: params.to }),
          },
        }
      : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data: AuditLogEntry[] = logs.map((log) => {
    let detail: Record<string, unknown> | null = null;
    if (revealDetail) {
      try {
        detail = JSON.parse(decrypt(log.encryptedDetail)) as Record<string, unknown>;
      } catch {
        detail = { error: 'decrypt_failed' };
      }
    }
    return {
      id: log.id,
      actorId: log.actorId,
      actorUsername: log.actor.username,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      detail,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    };
  });

  return { data, total };
}

export async function getAuditLogById(
  id: string,
  revealDetail = false,
): Promise<AuditLogEntry | null> {
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: { actor: { select: { username: true } } },
  });

  if (!log) {
    return null;
  }

  let detail: Record<string, unknown> | null = null;
  if (revealDetail) {
    try {
      detail = JSON.parse(decrypt(log.encryptedDetail)) as Record<string, unknown>;
    } catch {
      detail = { error: 'decrypt_failed' };
    }
  }

  return {
    id: log.id,
    actorId: log.actorId,
    actorUsername: log.actor.username,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    detail,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}
