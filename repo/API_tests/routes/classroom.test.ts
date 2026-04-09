/**
 * API functional tests — /api/classrooms and /api/anomalies endpoints
 * Tests auth, RBAC, API signing for heartbeat, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPatch, loginAs, uuid, computeSignature } from '../helpers/setup';
import { prisma } from '../../src/lib/prisma';

function makeSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function alternateCampus(campusId: string) {
  return campusId === 'main-campus' ? 'satellite-campus' : 'main-campus';
}

async function createClassroomFixture(campusId: string) {
  const suffix = makeSuffix();
  const course = await prisma.course.findFirst({ select: { id: true, departmentId: true } });
  const semester = await prisma.semester.findFirst({ select: { id: true } });

  if (!course || !semester) {
    throw new Error('Missing seed course/semester fixtures');
  }

  const klass = await prisma.class.create({
    data: {
      name: `Campus scope class ${suffix}`,
      courseId: course.id,
      departmentId: course.departmentId,
      semesterId: semester.id,
      roomNumber: `RM-${suffix}`,
    },
    select: { id: true },
  });

  const classroom = await prisma.classroom.create({
    data: {
      campusId,
      classId: klass.id,
      hardwareNodeId: `NODE-${suffix}`,
    },
    select: { id: true },
  });

  return { classroomId: classroom.id, classId: klass.id };
}

async function cleanupClassroomFixture(classroomId: string, classId: string) {
  await prisma.anomalyEvent.deleteMany({ where: { classroomId } });
  await prisma.classroom.deleteMany({ where: { id: classroomId } });
  await prisma.class.deleteMany({ where: { id: classId } });
}

// ---- Classroom endpoints ----

describe('GET /api/classrooms', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/classrooms');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin (classroom:read)', async () => {
    const res = await authGet('/api/classrooms', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for supervisor (classroom:read)', async () => {
    const res = await authGet('/api/classrooms', 'supervisor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for ops_manager (no classroom:read)', async () => {
    const res = await authGet('/api/classrooms', 'ops');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/classrooms', 'auditor');
    expect(res.status).toBe(403);
  });

  it('excludes classrooms from other campuses', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const fixture = await createClassroomFixture(alternateCampus(admin.campusId));

    try {
      const res = await authGet('/api/classrooms', 'admin');
      expect(res.status).toBe(200);
      const classroomIds = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(classroomIds).not.toContain(fixture.classroomId);
    } finally {
      await cleanupClassroomFixture(fixture.classroomId, fixture.classId);
    }
  });
});

describe('GET /api/classrooms/stats', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/classrooms/stats');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/classrooms/stats', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/classrooms/heartbeat/:nodeId (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app)
      .post('/api/classrooms/heartbeat/NODE-001')
      .send({ recognitionConfidence: 0.92 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });

  it('returns 401 with invalid API key', async () => {
    const timestamp = String(Date.now());
    const body = JSON.stringify({ recognitionConfidence: 0.92 });
    const res = await request(app)
      .post('/api/classrooms/heartbeat/NODE-001')
      .set('X-Api-Key', 'nonexistent-key')
      .set('X-Timestamp', timestamp)
      .set('X-Signature', 'invalidsignature')
      .send({ recognitionConfidence: 0.92 });
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired timestamp', async () => {
    const timestamp = String(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const res = await request(app)
      .post('/api/classrooms/heartbeat/NODE-001')
      .set('X-Api-Key', 'some-key')
      .set('X-Timestamp', timestamp)
      .set('X-Signature', 'somesig')
      .send({ recognitionConfidence: 0.92 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TIMESTAMP_EXPIRED');
  });
});

// ---- Anomaly endpoints ----

describe('GET /api/anomalies', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/anomalies');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/anomalies', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for supervisor', async () => {
    const res = await authGet('/api/anomalies', 'supervisor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no classroom:read)', async () => {
    const res = await authGet('/api/anomalies', 'agent');
    expect(res.status).toBe(403);
  });

  it('excludes anomalies from other campuses', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const otherCampus = alternateCampus(admin.campusId);
    const fixture = await createClassroomFixture(otherCampus);
    const anomaly = await prisma.anomalyEvent.create({
      data: {
        campusId: otherCampus,
        classroomId: fixture.classroomId,
        type: 'scope_test',
        description: 'Cross-campus anomaly should not leak',
        status: 'open',
      },
      select: { id: true },
    });

    try {
      const res = await authGet('/api/anomalies', 'admin');
      expect(res.status).toBe(200);
      const anomalyIds = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(anomalyIds).not.toContain(anomaly.id);
    } finally {
      await cleanupClassroomFixture(fixture.classroomId, fixture.classId);
    }
  });
});

describe('GET /api/anomalies/:id campus scoping', () => {
  it('returns 404 for anomaly outside requester campus', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const otherCampus = alternateCampus(admin.campusId);
    const fixture = await createClassroomFixture(otherCampus);
    const anomaly = await prisma.anomalyEvent.create({
      data: {
        campusId: otherCampus,
        classroomId: fixture.classroomId,
        type: 'scope_detail_test',
        description: 'Cross-campus anomaly detail should not be readable',
        status: 'open',
      },
      select: { id: true },
    });

    try {
      const res = await authGet(`/api/anomalies/${anomaly.id}`, 'admin');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    } finally {
      await cleanupClassroomFixture(fixture.classroomId, fixture.classId);
    }
  });
});

describe('POST /api/anomalies', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/anomalies')
      .send({ classroomId: uuid(), type: 'test', description: 'Test' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for ops_manager (no classroom:manage)', async () => {
    const res = await authPost('/api/anomalies', 'ops', {
      classroomId: uuid(), type: 'test', description: 'Test anomaly',
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/anomalies/:id/acknowledge', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/api/anomalies/some-id/acknowledge');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/anomalies/:id/resolve', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/anomalies/some-id/resolve')
      .send({ resolutionNote: 'Fixed the issue successfully.' });
    expect(res.status).toBe(401);
  });

  it('rejects short resolution note (after auth)', async () => {
    const res = await authPatch('/api/anomalies/some-id/resolve', 'admin', { resolutionNote: 'x' });
    // 400 (validation) or 404 (anomaly not found) — both valid
    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/anomalies/:id/escalate', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/api/anomalies/some-id/escalate');
    expect(res.status).toBe(401);
  });
});

// ---- Response structure invariants ----

describe('Error response structure — classroom/anomaly', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/classrooms'],
    ['GET', '/api/classrooms/stats'],
    ['GET', '/api/anomalies'],
    ['POST', '/api/anomalies'],
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
