/**
 * API functional tests — shipments, parcels, after-sales
 * Tests auth, RBAC, idempotency, API signing, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPatch, loginAs, uuid } from '../helpers/setup';
import { prisma } from '../../src/lib/prisma';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7N0iUAAAAASUVORK5CYII=',
  'base64',
);

async function createStudentFixture() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prisma.student.create({
    data: {
      studentNumber: `S-${suffix}`,
      fullName: `Fixture Student ${suffix}`,
      email: `fixture-${suffix}@example.edu`,
    },
    select: { id: true },
  });
}

async function createAfterSalesTicketFixture(studentId: string, createdById?: string) {
  return prisma.afterSalesTicket.create({
    data: {
      studentId,
      createdById,
      type: 'delay',
      status: 'open',
      description: 'Fixture after-sales ticket',
      slaDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
}

async function getUserIdByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) throw new Error(`Seed user not found: ${username}`);
  return user.id;
}

async function createFulfillmentFixture(studentId: string, createdById?: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prisma.fulfillmentRequest.create({
    data: {
      studentId,
      createdById,
      status: 'pending',
      subtotal: 100,
      discountAmount: 0,
      shippingFee: 0,
      totalAmount: 100,
      storedValueUsed: 0,
      pointsEarned: 0,
      receiptNumber: `RCP-${suffix}`,
    },
    select: { id: true },
  });
}

async function createWarehouseFixture() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prisma.warehouse.create({
    data: {
      name: `WH-${suffix}`,
      address: 'Fixture warehouse address',
    },
    select: { id: true },
  });
}

async function createCarrierFixture() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prisma.carrier.create({
    data: {
      name: `Carrier-${suffix}`,
      connectorUrl: 'http://carrier.local',
      apiKeyEncrypted: `enc-${suffix}`,
    },
    select: { id: true },
  });
}

async function createShipmentFixture(fulfillmentRequestId: string, warehouseId: string, carrierId: string) {
  return prisma.shipment.create({
    data: {
      fulfillmentRequestId,
      warehouseId,
      carrierId,
      status: 'pending',
    },
    select: { id: true },
  });
}

// ---- Shipments ----

describe('GET /api/shipments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.stack).toBeUndefined();
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/shipments', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for ops_manager', async () => {
    const res = await authGet('/api/shipments', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 200 for auditor (shipment:read)', async () => {
    const res = await authGet('/api/shipments', 'auditor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for supervisor', async () => {
    const res = await authGet('/api/shipments', 'supervisor');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shipments', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .send({ fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({ fulfillmentRequestId: validUuid, carrierId: validUuid });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for cs_agent (no shipment:write)', async () => {
    const res = await authPost('/api/shipments', 'agent', {
      fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid,
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authPost('/api/shipments', 'auditor', {
      fulfillmentRequestId: validUuid, carrierId: validUuid, warehouseId: validUuid,
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/shipments/:id/status', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/shipments/${validUuid}/status`)
      .send({ status: 'in_transit' });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .patch(`/api/shipments/${validUuid}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_transit' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

describe('POST /api/shipments/sync/:carrierId', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post(`/api/shipments/sync/${validUuid}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for cs_agent', async () => {
    const res = await authPost(`/api/shipments/sync/${validUuid}`, 'agent');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/shipments/sync-signed/:carrierId (API signing)', () => {
  it('returns 401 without API signing headers', async () => {
    const res = await request(app).post(`/api/shipments/sync-signed/${validUuid}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_API_SIGNING');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .post(`/api/shipments/sync-signed/${validUuid}`)
      .set('X-Api-Key', 'bad-key')
      .set('X-Timestamp', String(Date.now()))
      .set('X-Signature', 'badsig');
    expect(res.status).toBe(401);
  });
});

// ---- Parcels ----

describe('GET /api/parcels', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/parcels');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/parcels', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 404 for customer service agent when shipment scope does not belong to them', async () => {
    const student = await createStudentFixture();
    const adminId = await getUserIdByUsername('admin');
    const fulfillment = await createFulfillmentFixture(student.id, adminId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);
    await prisma.parcel.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber: `TRK-${Date.now().toString(36)}-OUT`,
        status: 'pending',
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get('/api/parcels')
      .query({ shipmentId: shipment.id })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SHIPMENT_NOT_FOUND');
  });

  it('returns scoped parcel list for customer service agent when shipment belongs to them', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const fulfillment = await createFulfillmentFixture(student.id, agentId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);
    const parcel = await prisma.parcel.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber: `TRK-${Date.now().toString(36)}-OWN`,
        status: 'pending',
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get('/api/parcels')
      .query({ shipmentId: shipment.id })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((p: any) => p.id === parcel.id)).toBe(true);
  });
});

describe('GET /api/parcels/:id object-level scope', () => {
  it('returns 404 for customer service agent when parcel belongs to another actor context', async () => {
    const student = await createStudentFixture();
    const adminId = await getUserIdByUsername('admin');
    const fulfillment = await createFulfillmentFixture(student.id, adminId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);
    const parcel = await prisma.parcel.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber: `TRK-${Date.now().toString(36)}-GET-OUT`,
        status: 'pending',
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/parcels/${parcel.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PARCEL_NOT_FOUND');
  });

  it('returns 200 for customer service agent when parcel belongs to their shipment context', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const fulfillment = await createFulfillmentFixture(student.id, agentId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);
    const parcel = await prisma.parcel.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber: `TRK-${Date.now().toString(36)}-GET-OWN`,
        status: 'pending',
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/parcels/${parcel.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(parcel.id);
  });
});

describe('POST /api/parcels', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/parcels')
      .send({ shipmentId: validUuid, trackingNumber: 'TRK001', weightLb: 2.5 });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/parcels')
      .set('Authorization', `Bearer ${token}`)
      .send({ shipmentId: validUuid, trackingNumber: 'TRK001', weightLb: 2.5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

// ---- After-Sales Tickets ----

describe('GET /api/after-sales', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/after-sales');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/after-sales', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.items)).toBe(true);
  });

  it('returns 200 for auditor (after-sales:read)', async () => {
    const res = await authGet('/api/after-sales', 'auditor');
    expect(res.status).toBe(200);
  });

  it('returns 403 for supervisor (no after-sales:read)', async () => {
    const res = await authGet('/api/after-sales', 'supervisor');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/after-sales/:id object-level scope', () => {
  it('returns 404 for customer service agent when ticket was created by another actor', async () => {
    const student = await createStudentFixture();
    const adminId = await getUserIdByUsername('admin');
    const ticket = await prisma.afterSalesTicket.create({
      data: {
        studentId: student.id,
        createdById: adminId,
        type: 'delay',
        status: 'open',
        description: 'Admin-owned ticket',
        slaDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/after-sales/${ticket.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TICKET_NOT_FOUND');
  });

  it('returns 200 for customer service agent on own ticket', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const ticket = await prisma.afterSalesTicket.create({
      data: {
        studentId: student.id,
        createdById: agentId,
        type: 'delay',
        status: 'open',
        description: 'Agent-owned ticket',
        slaDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/after-sales/${ticket.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(ticket.id);
  });

  it('masks student PII for auditor on ticket detail', async () => {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const student = await prisma.student.create({
      data: {
        studentNumber: `MASK-${suffix}`,
        fullName: 'Alice Example',
        email: `alice-${suffix}@example.edu`,
        phone: '5551234567',
      },
      select: { id: true },
    });

    let ticket: { id: string } | null = null;
    try {
      const adminId = await getUserIdByUsername('admin');
      ticket = await createAfterSalesTicketFixture(student.id, adminId);

      const res = await authGet(`/api/after-sales/${ticket.id}`, 'auditor');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.fullName).toBe('Alice E.');
      expect(res.body.data.student.email).toBe('***@example.edu');
      expect(res.body.data.student.studentId).toMatch(/\*+.{4}$/);
      expect(res.body.data.student.studentId).not.toBe(`MASK-${suffix}`);
      expect(res.body.data.student.phone).toBe('******4567');
    } finally {
      if (ticket) {
        await prisma.afterSalesTicket.deleteMany({ where: { id: ticket.id } });
      }
      await prisma.student.deleteMany({ where: { id: student.id } });
    }
  });
});

describe('GET /api/shipments/:id object-level scope', () => {
  it('returns 404 for customer service agent when shipment belongs to another actor context', async () => {
    const student = await createStudentFixture();
    const adminId = await getUserIdByUsername('admin');
    const fulfillment = await createFulfillmentFixture(student.id, adminId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SHIPMENT_NOT_FOUND');
  });

  it('returns 200 for customer service agent when shipment belongs to their fulfillment request context', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const fulfillment = await createFulfillmentFixture(student.id, agentId);
    const warehouse = await createWarehouseFixture();
    const carrier = await createCarrierFixture();
    const shipment = await createShipmentFixture(fulfillment.id, warehouse.id, carrier.id);

    const token = await loginAs('agent');
    const res = await request(app)
      .get(`/api/shipments/${shipment.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(shipment.id);
  });
});

describe('POST /api/after-sales', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/after-sales')
      .send({ studentId: validUuid, type: 'delay', description: 'Package late' });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/after-sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: validUuid, type: 'delay', description: 'Package late' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for ops_manager (no after-sales:create)', async () => {
    const res = await authPost('/api/after-sales', 'ops', {
      studentId: validUuid, type: 'delay', description: 'Package late',
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 with invalid ticket type', async () => {
    const res = await authPost('/api/after-sales', 'admin', {
      studentId: validUuid, type: 'unknown_type', description: 'test',
    });
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/after-sales/:id/status', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/after-sales/${validUuid}/status`)
      .send({ status: 'closed' });
    expect(res.status).toBe(401);
  });
});

// ---- Evidence ----

describe('POST /api/after-sales/:id/evidence/image', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(`/api/after-sales/${validUuid}/evidence/image`)
      .attach('file', Buffer.from('fake'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('returns 422 when MIME does not match file magic bytes', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const ticket = await createAfterSalesTicketFixture(student.id, agentId);
    const token = await loginAs('agent');

    const res = await request(app)
      .post(`/api/after-sales/${ticket.id}/evidence/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('this is not a png'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_FILE_CONTENT');
  });

  it('returns 413 for evidence files larger than 10 MB', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const ticket = await createAfterSalesTicketFixture(student.id, agentId);
    const token = await loginAs('agent');
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);

    const res = await request(app)
      .post(`/api/after-sales/${ticket.id}/evidence/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, {
        filename: 'too-large.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('returns 409 when uploading duplicate image evidence for the same ticket', async () => {
    const student = await createStudentFixture();
    const agentId = await getUserIdByUsername('cs_agent');
    const ticket = await createAfterSalesTicketFixture(student.id, agentId);
    const token = await loginAs('agent');

    const first = await request(app)
      .post(`/api/after-sales/${ticket.id}/evidence/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tinyPng, {
        filename: 'evidence-a.png',
        contentType: 'image/png',
      });

    const second = await request(app)
      .post(`/api/after-sales/${ticket.id}/evidence/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tinyPng, {
        filename: 'evidence-b.png',
        contentType: 'image/png',
      });

    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);
    expect(first.body.data.filePath).toContain('storage');
    expect(first.body.data.filePath).not.toContain('uploads');
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_EVIDENCE');
  });

  it('returns 404 when cs_agent uploads evidence to ticket outside ownership scope', async () => {
    const student = await createStudentFixture();
    const adminId = await getUserIdByUsername('admin');
    const ticket = await createAfterSalesTicketFixture(student.id, adminId);
    const token = await loginAs('agent');

    const res = await request(app)
      .post(`/api/after-sales/${ticket.id}/evidence/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tinyPng, {
        filename: 'out-of-scope.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TICKET_NOT_FOUND');
  });
});

describe('POST /api/after-sales/:id/evidence/text', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(`/api/after-sales/${validUuid}/evidence/text`)
      .send({ note: 'Package was damaged' });
    expect(res.status).toBe(401);
  });
});

// ---- Compensations ----

describe('GET /api/after-sales/:id/compensations', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get(`/api/after-sales/${validUuid}/compensations`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/after-sales/:id/compensations/suggest', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post(`/api/after-sales/${validUuid}/compensations/suggest`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for ops_manager (no compensation:suggest)', async () => {
    const res = await authPost(`/api/after-sales/${validUuid}/compensations/suggest`, 'ops');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/after-sales/:id/compensations/:cid/approve', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch(`/api/after-sales/${validUuid}/compensations/${validUuid}/approve`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when ticket id does not own compensation id (parent-child binding)', async () => {
    const student = await createStudentFixture();
    const ticketA = await createAfterSalesTicketFixture(student.id);
    const ticketB = await createAfterSalesTicketFixture(student.id);
    const compensation = await prisma.compensation.create({
      data: {
        ticketId: ticketA.id,
        amount: 10,
        type: 'refund',
        status: 'suggested',
        note: 'Fixture compensation',
      },
      select: { id: true },
    });

    const res = await authPatch(
      `/api/after-sales/${ticketB.id}/compensations/${compensation.id}/approve`,
      'admin',
      { note: 'approve fixture' },
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMPENSATION_NOT_FOUND');
  });
});

describe('PATCH /api/after-sales/:id/compensations/:cid/reject', () => {
  it('returns 404 when ticket id does not own compensation id (parent-child binding)', async () => {
    const student = await createStudentFixture();
    const ticketA = await createAfterSalesTicketFixture(student.id);
    const ticketB = await createAfterSalesTicketFixture(student.id);
    const compensation = await prisma.compensation.create({
      data: {
        ticketId: ticketA.id,
        amount: 10,
        type: 'refund',
        status: 'suggested',
        note: 'Fixture compensation',
      },
      select: { id: true },
    });

    const res = await authPatch(
      `/api/after-sales/${ticketB.id}/compensations/${compensation.id}/reject`,
      'admin',
      { note: 'reject fixture' },
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMPENSATION_NOT_FOUND');
  });
});

// ---- Error response structure ----

describe('Error response structure — shipment/after-sales', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/shipments'],
    ['POST', '/api/shipments'],
    ['GET', '/api/parcels'],
    ['POST', '/api/parcels'],
    ['GET', '/api/after-sales'],
    ['POST', '/api/after-sales'],
    ['GET', `/api/after-sales/${validUuid}`],
    ['PATCH', `/api/after-sales/${validUuid}/status`],
    ['GET', `/api/after-sales/${validUuid}/compensations`],
    ['POST', `/api/after-sales/${validUuid}/compensations/suggest`],
  ];

  endpoints.forEach(([method, path]) => {
    it(`${method} ${path} — no stack, success=false`, async () => {
      const req = method === 'GET'
        ? request(app).get(path)
        : method === 'PATCH'
          ? request(app).patch(path)
          : request(app).post(path);
      const res = await req;
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });
});
