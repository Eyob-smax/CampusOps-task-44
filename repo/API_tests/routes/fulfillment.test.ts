/**
 * API functional tests — logistics, fulfillment, membership, stored-value
 * Tests auth, RBAC, idempotency, and business flows.
 */
import request from 'supertest';
import { app, authGet, authPost, authPut, authPatch, loginAs, uuid } from '../helpers/setup';
import { prisma } from '../../src/lib/prisma';
import { encryptAmount } from '../../src/lib/encryption';

async function createStudentWithBalance(balance: number) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return prisma.student.create({
    data: {
      studentNumber: `SV-${suffix}`,
      fullName: `Stored Value Student ${suffix}`,
      email: `stored-value-${suffix}@example.edu`,
      storedValueEncrypted: encryptAmount(balance),
    },
    select: { id: true },
  });
}

async function getUserId(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) throw new Error(`Missing seed user: ${username}`);
  return user.id;
}

async function setStoredValueEnabled(enabled: boolean) {
  await prisma.systemSetting.upsert({
    where: { key: 'stored_value_enabled' },
    update: { value: enabled ? 'true' : 'false' },
    create: { key: 'stored_value_enabled', value: enabled ? 'true' : 'false' },
  });
}

async function setStoredValueTopUpThreshold(amount: number) {
  await prisma.systemSetting.upsert({
    where: { key: 'stored_value_topup_approval_threshold' },
    update: { value: amount.toFixed(2) },
    create: { key: 'stored_value_topup_approval_threshold', value: amount.toFixed(2) },
  });
}

// ---- Warehouse ----

describe('GET /api/warehouses', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/warehouses');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/warehouses', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for ops_manager', async () => {
    const res = await authGet('/api/warehouses', 'ops');
    expect(res.status).toBe(200);
  });

  it('returns 403 for cs_agent (no warehouse:read)', async () => {
    const res = await authGet('/api/warehouses', 'agent');
    expect(res.status).toBe(403);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/warehouses', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/warehouses', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/warehouses').send({ name: 'Test', address: '123 St' });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test WH', address: '123 Test St' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('creates warehouse for admin with idempotency key', async () => {
    const name = `WH-${Date.now().toString(36)}`;
    const res = await authPost('/api/warehouses', 'admin', { name, address: '456 Test Rd' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 for supervisor', async () => {
    const res = await authPost('/api/warehouses', 'supervisor', { name: 'Blocked', address: '789 No' });
    expect(res.status).toBe(403);
  });
});

// ---- Carriers ----

describe('GET /api/carriers', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/carriers');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/carriers', 'admin');
    expect(res.status).toBe(200);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/carriers', 'auditor');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/carriers', () => {
  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/carriers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Carrier', code: 'TC' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

// ---- Delivery Zones ----

describe('GET /api/delivery-zones', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/delivery-zones');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/delivery-zones', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/delivery-zones/check/:zipCode', () => {
  it('returns a response without stack trace (no auth needed)', async () => {
    const res = await request(app).get('/api/delivery-zones/check/00000');
    // May return 200 (not serviceable), 404, or 422 depending on implementation
    expect([200, 404, 422]).toContain(res.status);
    expect(res.body.stack).toBeUndefined();
  });
});

describe('POST /api/delivery-zones', () => {
  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/delivery-zones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Zone', regionCode: 'TZ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

// ---- Shipping Templates ----

describe('GET /api/shipping-templates', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/shipping-templates');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/shipping-templates', 'admin');
    expect(res.status).toBe(200);
  });
});

// ---- Membership Tiers ----

describe('GET /api/membership/tiers', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/membership/tiers');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin with tier list', async () => {
    const res = await authGet('/api/membership/tiers', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 for cs_agent', async () => {
    const res = await authGet('/api/membership/tiers', 'agent');
    expect(res.status).toBe(200);
  });

  it('returns 403 for auditor', async () => {
    const res = await authGet('/api/membership/tiers', 'auditor');
    expect(res.status).toBe(403);
  });
});

// ---- Coupons ----

describe('GET /api/coupons', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/coupons');
    expect(res.status).toBe(401);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/coupons', 'admin');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/coupons', () => {
  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST10', discountType: 'flat', discountValue: 10 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });
});

// ---- Fulfillment ----

describe('GET /api/fulfillment', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/fulfillment');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for admin', async () => {
    const res = await authGet('/api/fulfillment', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for auditor (fulfillment:read)', async () => {
    const res = await authGet('/api/fulfillment', 'auditor');
    expect(res.status).toBe(200);
  });

  it('masks student PII for auditor on fulfillment detail', async () => {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const student = await prisma.student.create({
      data: {
        studentNumber: `FUL-${suffix}`,
        fullName: 'Bob Example',
        email: `bob-${suffix}@example.edu`,
        phone: '5551234567',
        storedValueEncrypted: encryptAmount(42),
      },
      select: { id: true },
    });

    const adminId = await getUserId('admin');
    const fulfillment = await prisma.fulfillmentRequest.create({
      data: {
        studentId: student.id,
        createdById: adminId,
        status: 'pending',
        subtotal: 100,
        discountAmount: 0,
        shippingFee: 0,
        totalAmount: 100,
        storedValueUsed: 0,
        pointsEarned: 0,
        receiptNumber: `RCP-MASK-${suffix}`,
        items: {
          create: [
            {
              description: 'Mask test item',
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
      },
      select: { id: true },
    });

    try {
      const res = await authGet(`/api/fulfillment/${fulfillment.id}`, 'auditor');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.fullName).toBe('Bob E.');
      expect(res.body.data.student.email).toBe('***@example.edu');
      expect(res.body.data.student.studentId).toMatch(/\*+.{4}$/);
      expect(res.body.data.student.studentId).not.toBe(`FUL-${suffix}`);
      expect(res.body.data.student.storedValueEncrypted).toBeUndefined();
    } finally {
      await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentRequestId: fulfillment.id } });
      await prisma.fulfillmentRequest.deleteMany({ where: { id: fulfillment.id } });
      await prisma.student.deleteMany({ where: { id: student.id } });
    }
  });
});

describe('POST /api/fulfillment', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/fulfillment').send({});
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/fulfillment')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: uuid(), items: [{ description: 'Book', quantity: 1, unitPrice: 25 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for auditor (no fulfillment:create)', async () => {
    const res = await authPost('/api/fulfillment', 'auditor', {
      studentId: uuid(), items: [{ description: 'Book', quantity: 1, unitPrice: 25 }],
    });
    expect(res.status).toBe(403);
  });
});

// ---- Stored Value ----

describe('GET /api/stored-value/:studentId/balance', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/stored-value/some-student-id/balance');
    expect(res.status).toBe(401);
  });

  it('returns 403 for auditor (no stored-value:read)', async () => {
    const res = await authGet('/api/stored-value/some-student-id/balance', 'auditor');
    expect(res.status).toBe(403);
  });

  it('returns 403 for cs_agent (no stored-value:read)', async () => {
    const res = await authGet('/api/stored-value/some-student-id/balance', 'agent');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/stored-value/:studentId/top-up', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/stored-value/some-student-id/top-up')
      .send({ amount: 50 });
    expect(res.status).toBe(401);
  });

  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/stored-value/some-student-id/top-up')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 FEATURE_DISABLED when stored value is disabled', async () => {
    await setStoredValueEnabled(false);

    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/stored-value/some-student-id/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({ amount: 50 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FEATURE_DISABLED');

    await setStoredValueEnabled(true);
  });

  it('allows high-value top-up for operations manager when feature is enabled', async () => {
    await setStoredValueEnabled(true);
    await setStoredValueTopUpThreshold(200);

    const student = await createStudentWithBalance(100);
    const token = await loginAs('ops');
    const res = await request(app)
      .post(`/api/stored-value/${student.id}/top-up`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({ amount: 250, note: 'Approved by operations manager' });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.balance).toBe(350);
  });

  it('escapes HTML-like note content in receipt output', async () => {
    await setStoredValueEnabled(true);

    const student = await createStudentWithBalance(0);
    const token = await loginAs('admin');

    const topUpRes = await request(app)
      .post(`/api/stored-value/${student.id}/top-up`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({ amount: 10, note: '<script>alert("x")</script>' });

    expect([200, 201]).toContain(topUpRes.status);
    const transactionId = topUpRes.body.data?.transaction?.id;
    expect(typeof transactionId).toBe('string');

    const receiptRes = await request(app)
      .get(`/api/stored-value/transactions/${transactionId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.text).toContain('Note:');
    expect(receiptRes.text).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(receiptRes.text).not.toContain('<script>');
  });
});

describe('POST /api/stored-value/:studentId/spend', () => {
  it('requires idempotency key', async () => {
    const token = await loginAs('admin');
    const res = await request(app)
      .post('/api/stored-value/some-student-id/spend')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10, description: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('returns 403 for cs_agent when reference ticket is outside actor ownership scope', async () => {
    await setStoredValueEnabled(true);
    const student = await createStudentWithBalance(100);
    const adminId = await getUserId('admin');
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
      .post(`/api/stored-value/${student.id}/spend`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({
        amount: 10,
        referenceId: ticket.id,
        referenceType: 'after_sales_ticket',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OBJECT_SCOPE_VIOLATION');
  });

  it('returns 200 for cs_agent when spending against own ticket scope', async () => {
    await setStoredValueEnabled(true);
    const student = await createStudentWithBalance(100);
    const agentId = await getUserId('cs_agent');
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
      .post(`/api/stored-value/${student.id}/spend`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', uuid())
      .send({
        amount: 10,
        referenceId: ticket.id,
        referenceType: 'after_sales_ticket',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.balance).toBe(90);
  });
});

// ---- Idempotency replay ----

describe('Idempotency replay semantics', () => {
  it('duplicate POST with same key returns cached response', async () => {
    const token = await loginAs('admin');
    const idempotencyKey = uuid();
    const name = `WH-Replay-${Date.now().toString(36)}`;

    // First request
    const res1 = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ name, address: '100 Replay St' });

    // Second request with same key
    const res2 = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ name, address: '100 Replay St' });

    expect(res1.status).toBe(res2.status);
    expect(JSON.stringify(res1.body)).toBe(JSON.stringify(res2.body));
  });
});

// ---- Response structure invariants ----

describe('Error response structure — logistics/fulfillment', () => {
  const endpoints: [string, string][] = [
    ['GET', '/api/warehouses'],
    ['GET', '/api/carriers'],
    ['GET', '/api/delivery-zones'],
    ['GET', '/api/shipping-templates'],
    ['GET', '/api/membership/tiers'],
    ['GET', '/api/coupons'],
    ['GET', '/api/fulfillment'],
    ['POST', '/api/fulfillment'],
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
