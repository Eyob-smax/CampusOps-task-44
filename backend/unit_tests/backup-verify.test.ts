import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { prisma } = await import('../src/lib/prisma');
const { verifyBackup } = await import('../src/modules/observability/backup.service');

function makeBackupRecord(id: string, filePath: string) {
  return {
    id,
    fileName: path.basename(filePath),
    filePath,
    sizeBytes: BigInt(128),
    status: 'completed',
    verifyStatus: 'pending',
    startedAt: new Date(),
    finishedAt: new Date(),
    errorMsg: null,
    createdAt: new Date(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyBackup', () => {
  it('passes when dump and manifest are valid', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-verify-'));
    const dumpPath = path.join(dir, 'backup_valid.sql');
    const manifestPath = dumpPath.replace(/\.sql$/, '.json');

    fs.writeFileSync(dumpPath, '-- valid dump');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        id: 'backup-1',
        timestamp: new Date().toISOString(),
        tables: ['User', 'Role'],
        rowCounts: { User: 10, Role: 3 },
      })
    );

    const record = makeBackupRecord('backup-1', dumpPath);

    vi.spyOn(prisma.backupRecord, 'findUnique').mockResolvedValue(record as any);
    const updateSpy = vi
      .spyOn(prisma.backupRecord, 'update')
      .mockResolvedValue({ ...record, verifyStatus: 'passed' } as any);

    const result = await verifyBackup(record.id);

    expect(result.passed).toBe(true);
    expect(result.details).toContain('Dump file valid');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: record.id },
      data: { verifyStatus: 'passed' },
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when dump file is missing', async () => {
    const dumpPath = path.join(os.tmpdir(), 'missing-backup.sql');
    const record = makeBackupRecord('backup-missing', dumpPath);

    vi.spyOn(prisma.backupRecord, 'findUnique').mockResolvedValue(record as any);
    const updateSpy = vi
      .spyOn(prisma.backupRecord, 'update')
      .mockResolvedValue({ ...record, verifyStatus: 'failed' } as any);

    const result = await verifyBackup(record.id);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('Dump file not found');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: record.id },
      data: { verifyStatus: 'failed' },
    });
  });

  it('passes legacy backups when dump exists but manifest is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-verify-legacy-'));
    const dumpPath = path.join(dir, 'backup_legacy.sql');

    fs.writeFileSync(dumpPath, '-- legacy dump');

    const record = makeBackupRecord('backup-legacy', dumpPath);
    vi.spyOn(prisma.backupRecord, 'findUnique').mockResolvedValue(record as any);
    vi.spyOn(prisma.backupRecord, 'update').mockResolvedValue({ ...record, verifyStatus: 'passed' } as any);

    const result = await verifyBackup(record.id);

    expect(result.passed).toBe(true);
    expect(result.details).toContain('legacy backup format');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when manifest is malformed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-verify-bad-manifest-'));
    const dumpPath = path.join(dir, 'backup_bad_manifest.sql');
    const manifestPath = dumpPath.replace(/\.sql$/, '.json');

    fs.writeFileSync(dumpPath, '-- dump data');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        id: 'backup-bad-manifest',
        timestamp: new Date().toISOString(),
      })
    );

    const record = makeBackupRecord('backup-bad-manifest', dumpPath);
    vi.spyOn(prisma.backupRecord, 'findUnique').mockResolvedValue(record as any);
    vi.spyOn(prisma.backupRecord, 'update').mockResolvedValue({ ...record, verifyStatus: 'failed' } as any);

    const result = await verifyBackup(record.id);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('Manifest missing keys');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws a 404-shaped error when backup does not exist', async () => {
    vi.spyOn(prisma.backupRecord, 'findUnique').mockResolvedValue(null as any);
    const updateSpy = vi.spyOn(prisma.backupRecord, 'update');

    await expect(verifyBackup('does-not-exist')).rejects.toMatchObject({
      status: 404,
      code: 'BACKUP_NOT_FOUND',
    });

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
