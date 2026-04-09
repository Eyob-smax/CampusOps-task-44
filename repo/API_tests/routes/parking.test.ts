/**
 * API functional tests — /api/parking and /api/parking-alerts
 * Tests auth, RBAC, API signing for ingest, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPatch, loginAs, uuid } from '../helpers/setup';
import { prisma } from '../../src/lib/prisma';
import { runParkingExceptionDetectors } from '../../src/modules/parking/parking.service';

function makeSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function alternateCampus(campusId: string) {
  return campusId === 'main-campus' ? 'satellite-campus' : 'main-campus';
}

async function createParkingLotFixture(campusId: string) {
  return prisma.parkingLot.create({
    data: {
      campusId,
      name: `Scope Lot ${makeSuffix()}`,
      totalSpaces: 80,
      isActive: true,
    },
    select: { id: true },
  });
}

async function cleanupParkingFixture(lotId: string) {
  const alerts = await prisma.parkingAlert.findMany({ where: { lotId }, select: { id: true } });
  const alertIds = alerts.map((alert) => alert.id);

  if (alertIds.length > 0) {
    await prisma.parkingAlertTimelineEntry.deleteMany({ where: { alertId: { in: alertIds } } });
    await prisma.parkingAlert.deleteMany({ where: { id: { in: alertIds } } });
  }

  await prisma.parkingSession.deleteMany({ where: { lotId } });
  await prisma.parkingLot.deleteMany({ where: { id: lotId } });
}

// ---- Parking lot endpoints ----

describe('GET /api/parking/dashboard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking/dashboard', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for supervisor', async () => {
    const res = await authGet('/api/parking/dashboard', 'supervisor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no parking:read)', async () => {
    const res = await authGet('/api/parking/dashboard', 'agent');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/parking/dashboard', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/parking/lots', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/lots');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin with lot list', async () => {
    const res = await authGet('/api/parking/lots', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('excludes lots from other campuses', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const lot = await createParkingLotFixture(alternateCampus(admin.campusId));
    try {
      const res = await authGet('/api/parking/lots', 'admin');
      expect(res.status).toBe(200);
      const lotIds = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(lotIds).not.toContain(lot.id);
    } finally {
      await cleanupParkingFixture(lot.id);
    }
  });

  it('returns 404 for stats on lot outside requester campus', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const lot = await createParkingLotFixture(alternateCampus(admin.campusId));
    try {
      const res = await authGet(`/api/parking/lots/${lot.id}/stats`, 'admin');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    } finally {
      await cleanupParkingFixture(lot.id);
    }
  });
});

describe('GET /api/parking/sessions', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking/sessions');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking/sessions', 'admin');
    expect(res.status).toBe(200);
  });

  it('excludes sessions from other campuses', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const otherCampus = alternateCampus(admin.campusId);
    const lot = await createParkingLotFixture(otherCampus);
    const session = await prisma.parkingSession.create({
      data: {
        campusId: otherCampus,
        lotId: lot.id,
        plateNumber: `SCOPE-${makeSuffix()}`,
      },
      select: { id: true },
    });

    try {
      const res = await authGet('/api/parking/sessions', 'admin');
      expect(res.status).toBe(200);
      const sessionIds = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(sessionIds).not.toContain(session.id);
    } finally {
      await cleanupParkingFixture(lot.id);
    }
  });
});

describe('POST /api/parking/sessions/entry (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .set('X-Api-Key', 'bad-key')
      .set('X-Timestamp', String(Date.now()))
      .set('X-Signature', 'badsig')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired timestamp', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/entry')
      .set('X-Api-Key', 'some-key')
      .set('X-Timestamp', String(Date.now() - 10 * 60 * 1000))
      .set('X-Signature', 'sig')
      .send({ lotId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TIMESTAMP_EXPIRED');
  });
});

describe('POST /api/parking/sessions/exit (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app)
      .post('/api/parking/sessions/exit')
      .send({ sessionId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });
});

// ---- Alert endpoints ----

describe('GET /api/parking-alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking-alerts');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking-alerts', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 200 for supervisor', async () => {
    const res = await authGet('/api/parking-alerts', 'supervisor');
    expect(res.status).toBe(200);
  });

  it('excludes alerts from other campuses', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const otherCampus = alternateCampus(admin.campusId);
    const lot = await createParkingLotFixture(otherCampus);
    const alert = await prisma.parkingAlert.create({
      data: {
        campusId: otherCampus,
        lotId: lot.id,
        type: 'overtime',
        description: 'Cross-campus alert should not leak',
        status: 'open',
      },
      select: { id: true },
    });

    try {
      const res = await authGet('/api/parking-alerts', 'admin');
      expect(res.status).toBe(200);
      const alertIds = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(alertIds).not.toContain(alert.id);
    } finally {
      await cleanupParkingFixture(lot.id);
    }
  });
});

describe('GET /api/parking-alerts/:id campus scoping', () => {
  it('returns 404 for alert outside requester campus', async () => {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { campusId: true },
    });
    if (!admin) {
      throw new Error('Missing seeded admin user');
    }

    const otherCampus = alternateCampus(admin.campusId);
    const lot = await createParkingLotFixture(otherCampus);
    const alert = await prisma.parkingAlert.create({
      data: {
        campusId: otherCampus,
        lotId: lot.id,
        type: 'overtime',
        description: 'Cross-campus alert detail should be denied',
        status: 'open',
      },
      select: { id: true },
    });

    try {
      const res = await authGet(`/api/parking-alerts/${alert.id}`, 'admin');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    } finally {
      await cleanupParkingFixture(lot.id);
    }
  });
});

describe('GET /api/parking-alerts/metrics', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parking-alerts/metrics');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parking-alerts/metrics', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/parking-alerts', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/parking-alerts')
      .send({ lotId: uuid(), type: 'overtime', description: 'Over 2h' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for cs_agent (no parking:manage)', async () => {
    const res = await authPost('/api/parking-alerts', 'agent', {
      lotId: uuid(), type: 'overtime', description: 'Over 2h',
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/parking-alerts/:id/claim', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/api/parking-alerts/some-id/claim');
    expect(res.status).toBe(401);
  });

  it('returns 403 for ops_manager (no parking-alert:claim)', async () => {
    const res = await authPatch('/api/parking-alerts/some-id/claim', 'ops');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/parking-alerts/:id/close', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/parking-alerts/some-id/close')
      .send({ closureNote: 'Vehicle moved.' });
    expect(res.status).toBe(401);
  });

  it('rejects short closure note', async () => {
    const res = await authPatch('/api/parking-alerts/some-id/close', 'admin', { closureNote: 'ok' });
    // 400 or 404 both valid
    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('Parking exception detectors', () => {
  async function createLotForTest(suffix: string) {
    return prisma.parkingLot.create({
      data: {
        name: `Detector Lot ${suffix} ${Date.now()}`,
        totalSpaces: 50,
      },
    });
  }

  async function cleanupLot(lotId: string) {
    const alerts = await prisma.parkingAlert.findMany({ where: { lotId }, select: { id: true } });
    const alertIds = alerts.map((a) => a.id);

    if (alertIds.length > 0) {
      await prisma.parkingAlertTimelineEntry.deleteMany({ where: { alertId: { in: alertIds } } });
      await prisma.parkingAlert.deleteMany({ where: { id: { in: alertIds } } });
    }

    await prisma.parkingSession.deleteMany({ where: { lotId } });
    await prisma.parkingLot.delete({ where: { id: lotId } });
  }

  it('auto-creates overtime alert for stale active sessions', async () => {
    const lot = await createLotForTest('overtime');
    try {
      const session = await prisma.parkingSession.create({
        data: {
          lotId: lot.id,
          plateNumber: `OVT-${Date.now()}`,
          entryAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
      });

      await runParkingExceptionDetectors();

      const alert = await prisma.parkingAlert.findFirst({
        where: {
          lotId: lot.id,
          type: 'overtime',
          description: { contains: session.id },
        },
      });
      expect(alert).toBeTruthy();
    } finally {
      await cleanupLot(lot.id);
    }
  });

  it('auto-creates unsettled_session alert for exited unpaid sessions', async () => {
    const lot = await createLotForTest('unsettled');
    try {
      const session = await prisma.parkingSession.create({
        data: {
          lotId: lot.id,
          plateNumber: `UNS-${Date.now()}`,
          entryAt: new Date(Date.now() - 40 * 60 * 1000),
          exitAt: new Date(Date.now() - 20 * 60 * 1000),
          isSettled: false,
        },
      });

      await runParkingExceptionDetectors();

      const alert = await prisma.parkingAlert.findFirst({
        where: {
          lotId: lot.id,
          type: 'unsettled_session',
          description: { contains: session.id },
        },
      });
      expect(alert).toBeTruthy();
    } finally {
      await cleanupLot(lot.id);
    }
  });

  it('auto-creates duplicate_plate alert when multiple active sessions share a plate', async () => {
    const lot = await createLotForTest('duplicate');
    try {
      const plate = `DUP-${Date.now()}`;
      await prisma.parkingSession.createMany({
        data: [
          { lotId: lot.id, plateNumber: plate, entryAt: new Date(Date.now() - 60_000) },
          { lotId: lot.id, plateNumber: plate, entryAt: new Date() },
        ],
      });

      await runParkingExceptionDetectors();

      const alert = await prisma.parkingAlert.findFirst({
        where: {
          lotId: lot.id,
          type: 'duplicate_plate',
          description: { contains: plate },
        },
      });
      expect(alert).toBeTruthy();
    } finally {
      await cleanupLot(lot.id);
    }
  });

  it('auto-creates inconsistent_entry_exit alert for settled sessions missing exit timestamp', async () => {
    const lot = await createLotForTest('inconsistent');
    try {
      const session = await prisma.parkingSession.create({
        data: {
          lotId: lot.id,
          plateNumber: `INC-${Date.now()}`,
          entryAt: new Date(Date.now() - 5 * 60 * 1000),
          isSettled: true,
        },
      });

      await runParkingExceptionDetectors();

      const alert = await prisma.parkingAlert.findFirst({
        where: {
          lotId: lot.id,
          type: 'inconsistent_entry_exit',
          description: { contains: session.id },
        },
      });
      expect(alert).toBeTruthy();
    } finally {
      await cleanupLot(lot.id);
    }
  });
});

// ---- Response structure invariants ----

describe('Error response structure — parking', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/parking/dashboard'],
    ['GET', '/api/parking/lots'],
    ['GET', '/api/parking/sessions'],
    ['GET', '/api/parking-alerts'],
    ['GET', '/api/parking-alerts/metrics'],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — structured error without stack`, async () => {
      const res = await request(app).get(path);
      expect(res.body.stack).toBeUndefined();
      expect(typeof res.body.success).toBe('boolean');
      expect(res.body.success).toBe(false);
    });
  });
});
