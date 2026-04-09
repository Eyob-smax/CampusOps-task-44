import { describe, expect, it } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const { scopedStudentWhere: scopedStoredValueStudentWhere } = await import('../src/modules/stored-value/stored-value.service');
const { scopedStudentWhere: scopedMasterDataStudentWhere } = await import('../src/modules/master-data/student.service');
const { scopedShipmentWhere } = await import('../src/modules/shipment/parcel.service');

describe('tenant and campus isolation guards', () => {
  it('adds campus scope to student queries when requester context is present', () => {
    const where = scopedStoredValueStudentWhere('student-123', {
      id: 'u-1',
      username: 'ops',
      role: 'operations_manager',
      campusId: 'campus-a',
    });

    expect(where).toEqual({ id: 'student-123', campusId: 'campus-a' });
  });

  it('does not inject campus scope when requester context is unavailable', () => {
    const where = scopedStoredValueStudentWhere('student-123');
    expect(where).toEqual({ id: 'student-123' });
  });

  it('applies campus scope for master-data student lookups', () => {
    const where = scopedMasterDataStudentWhere('student-123', {
      id: 'u-1',
      username: 'admin',
      role: 'administrator',
      campusId: 'campus-b',
    });

    expect(where).toEqual({ id: 'student-123', campusId: 'campus-b' });
  });

  it('builds shipment scope for customer service ownership checks', () => {
    const where = scopedShipmentWhere({
      id: 'u-cs',
      username: 'cs_agent',
      role: 'customer_service_agent',
      campusId: 'campus-a',
    });

    expect(where).toEqual({
      campusId: 'campus-a',
      fulfillmentRequest: { createdById: 'u-cs' },
    });
  });

  it('returns empty shipment scope without requester context', () => {
    expect(scopedShipmentWhere()).toEqual({});
  });
});
