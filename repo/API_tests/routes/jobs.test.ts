/**
 * API functional tests — /api/jobs, import/export, and idempotency enforcement
 */
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app, authGet, authPost, loginAs, uuid } from '../helpers/setup';
import { prisma } from '../../src/lib/prisma';
import { importQueue } from '../../src/jobs';
import { config } from '../../src/config';

// ---- Job monitor endpoints ----

describe('GET /api/jobs', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin (jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for ops_manager (jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no jobs:read)', async () => {
    const res = await authGet('/api/jobs', 'agent');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/jobs', 'auditor');
    expect(res.status).toBe(403);
  });

  it('includes shipment-sync runs in job monitor listing', async () => {
    const seeded = await prisma.jobRecord.create({
      data: {
        queueName: 'campusops-shipment-sync',
        jobName: 'shipment-sync',
        actorId: 'system',
        status: 'completed',
        progress: 100,
        totalRows: 4,
        processedRows: 3,
        failedRows: 1,
        result: JSON.stringify({ updated: 3, errors: 1 }),
        startedAt: new Date(Date.now() - 15_000),
        finishedAt: new Date(),
      },
    });

    try {
      const res = await authGet('/api/jobs?queue=campusops-shipment-sync', 'admin');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = (res.body.data as Array<{ id: string; queueName: string; jobName: string; failedRows: number | null; result: unknown }>)
        .find((job) => job.id === seeded.id);

      expect(found).toBeDefined();
      expect(found?.queueName).toBe('campusops-shipment-sync');
      expect(found?.jobName).toBe('shipment-sync');
      expect(found?.failedRows).toBe(1);
      expect(found?.result).toMatchObject({ updated: 3, errors: 1 });
    } finally {
      await prisma.jobRecord.delete({ where: { id: seeded.id } });
    }
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs/nonexistent-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 when reading a job from another campus scope', async () => {
    const seeded = await prisma.jobRecord.create({
      data: {
        queueName: 'campusops-bulk-import',
        jobName: 'student-import',
        status: 'failed',
        progress: 0,
        actorId: 'system',
        inputFilename: 'students.csv',
        campusId: 'campus-out-of-scope',
      } as any,
    });

    try {
      const detailRes = await authGet(`/api/jobs/${seeded.id}`, 'admin');
      expect(detailRes.status).toBe(404);

      const listRes = await authGet('/api/jobs', 'admin');
      expect(listRes.status).toBe(200);
      const ids = (listRes.body.data as Array<{ id: string }>).map((job) => job.id);
      expect(ids).not.toContain(seeded.id);
    } finally {
      await prisma.jobRecord.delete({ where: { id: seeded.id } });
    }
  });
});

describe('GET /api/jobs/:id/error-report', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs/some-id/error-report');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/jobs/:id/retry', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/jobs/some-id/retry')
      .set('X-Idempotency-Key', uuid());
    expect(res.status).toBe(401);
  });

  it('returns 400 when idempotency key is missing (after auth)', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/jobs/some-id/retry')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no jobs:manage)', async () => {
    const res = await authPost('/api/jobs/some-id/retry', 'ops');
    expect(res.status).toBe(403);
  });

  it('returns 404 when retrying a job from another campus scope', async () => {
    const seeded = await prisma.jobRecord.create({
      data: {
        queueName: 'campusops-bulk-import',
        jobName: 'student-import',
        status: 'failed',
        progress: 0,
        actorId: 'system',
        inputFilename: 'students.csv',
        campusId: 'campus-out-of-scope',
      } as any,
    });

    try {
      const res = await authPost(`/api/jobs/${seeded.id}/retry`, 'admin');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    } finally {
      await prisma.jobRecord.delete({ where: { id: seeded.id } });
    }
  });
});

// ---- Student import endpoint ----

describe('POST /api/students/import', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/students/import');
    expect(res.status).toBe(401);
  });

  it('no stack traces in error response', async () => {
    const res = await request(app).post('/api/students/import');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 403 for auditor', async () => {
    const token = await loginAs('auditor');
    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('stores requester campus scope in job record and queued payload', async () => {
    const token = await loginAs('admin');
    const suffix = Date.now().toString(36);
    const csv = `studentNumber,fullName,email\nS-IMP-${suffix},Import Student ${suffix},imp-${suffix}@test.edu\n`;

    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);

    const jobId = res.body?.data?.jobId as string;
    expect(typeof jobId).toBe('string');

    const savedJob = await prisma.jobRecord.findUnique({
      where: { id: jobId },
      select: { bullJobId: true, campusId: true },
    } as any);

    expect(savedJob?.campusId).toBe('main-campus');
    expect(savedJob?.bullJobId).toBeTruthy();

    const queuedJob = savedJob?.bullJobId
      ? await importQueue.getJob(savedJob.bullJobId)
      : null;

    expect(queuedJob?.data?.jobRecordId).toBe(jobId);
    expect(queuedJob?.data?.campusId).toBe('main-campus');

    if (queuedJob) {
      await queuedJob.remove();
    }

    await prisma.jobRecord.delete({ where: { id: jobId } });

    const importFilePath = path.join(config.storage.path, 'imports', `${jobId}.csv`);
    if (fs.existsSync(importFilePath)) {
      fs.unlinkSync(importFilePath);
    }
  });
});

// ---- Export endpoints ----

const exportEndpoints = [
  '/api/departments/export',
  '/api/semesters/export',
  '/api/courses/export',
  '/api/classes/export',
  '/api/students/export',
] as const;

describe('Export endpoints — auth guard', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 401 without token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });
});

describe('Export endpoints — RBAC (authenticated)', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 200 for admin`, async () => {
      const res = await authGet(endpoint, 'admin');
      expect(res.status).toBe(200);
    });
  });
});

describe('Export endpoints — format negotiation', () => {
  exportEndpoints.forEach(endpoint => {
    it(`GET ${endpoint}?format=xlsx returns XLSX file for admin`, async () => {
      const res = await authGet(`${endpoint}?format=xlsx`, 'admin');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('.xlsx');
    });

    it(`GET ${endpoint}?format=invalid returns 400`, async () => {
      const res = await authGet(`${endpoint}?format=invalid`, 'admin');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EXPORT_FORMAT');
    });
  });
});

// ---- Master data read endpoints — auth guard ----

const readEndpoints = [
  '/api/departments',
  '/api/semesters',
  '/api/courses',
  '/api/classes',
  '/api/students',
] as const;

describe('Master data list endpoints — auth guard', () => {
  readEndpoints.forEach(endpoint => {
    it(`GET ${endpoint} returns 401 without token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    });
  });
});

// ---- Response structure invariants ----

describe('Error response structure', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/jobs'],
    ['GET', '/api/students/export'],
    ['POST', '/api/students/import'],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — structured error without stack`, async () => {
      const req = method === 'GET'
        ? request(app).get(path)
        : request(app).post(path);
      const res = await req;
      expect(res.body.stack).toBeUndefined();
      expect(typeof res.body.success).toBe('boolean');
      expect(res.body.success).toBe(false);
    });
  });
});
