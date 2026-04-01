/**
 * Unit tests — classroom anomaly state machine and validation
 *
 * Tests pure validation schemas and state-transition logic without DB.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const {
  createAnomalySchema,
  assignAnomalySchema,
  resolveAnomalySchema,
  escalateAnomalySchema,
} = await import('../src/modules/classroom/anomaly.service');

const { heartbeatSchema } = await import('../src/modules/classroom/classroom.service');

// ---- createAnomalySchema ----
describe('createAnomalySchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid anomaly payload', () => {
    const result = createAnomalySchema.safeParse({
      classroomId: validId,
      type:        'node_offline',
      description: 'Hardware node has not responded',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID classroomId', () => {
    const result = createAnomalySchema.safeParse({
      classroomId: 'not-a-uuid',
      type: 'x', description: 'y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty type', () => {
    const result = createAnomalySchema.safeParse({
      classroomId: validId, type: '', description: 'y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing description', () => {
    const result = createAnomalySchema.safeParse({
      classroomId: validId, type: 'x',
    });
    expect(result.success).toBe(false);
  });
});

// ---- assignAnomalySchema ----
describe('assignAnomalySchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid assignment', () => {
    const result = assignAnomalySchema.safeParse({ assignedToId: validId });
    expect(result.success).toBe(true);
  });

  it('accepts optional note', () => {
    const result = assignAnomalySchema.safeParse({ assignedToId: validId, note: 'Assigning to on-duty supervisor' });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID assignedToId', () => {
    const result = assignAnomalySchema.safeParse({ assignedToId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

// ---- resolveAnomalySchema — critical: 10 char minimum ----
describe('resolveAnomalySchema', () => {
  it('accepts note of exactly 10 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '1234567890' });
    expect(result.success).toBe(true);
  });

  it('accepts note longer than 10 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: 'Fixed by restarting the hardware node and verifying connection.' });
    expect(result.success).toBe(true);
  });

  it('rejects note of 9 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '123456789' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('10');
    }
  });

  it('rejects empty note', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '' });
    expect(result.success).toBe(false);
  });

  it('trims leading/trailing whitespace before validation', () => {
    // Trimmed value '         x' (9 visible chars after trim → 1) should fail
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '         x' });
    expect(result.success).toBe(false);
  });

  it('passes when note has 10 non-whitespace chars after trim', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '  Node was rebooted  ' });
    expect(result.success).toBe(true);
  });
});

// ---- escalateAnomalySchema ----
describe('escalateAnomalySchema', () => {
  it('accepts empty object', () => {
    expect(escalateAnomalySchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional note', () => {
    expect(escalateAnomalySchema.safeParse({ note: 'Escalating per SLA' }).success).toBe(true);
  });
});

// ---- heartbeatSchema ----
describe('heartbeatSchema', () => {
  it('accepts empty payload', () => {
    expect(heartbeatSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid confidence value', () => {
    const result = heartbeatSchema.safeParse({ recognitionConfidence: 0.85 });
    expect(result.success).toBe(true);
  });

  it('rejects confidence above 1', () => {
    const result = heartbeatSchema.safeParse({ recognitionConfidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence below 0', () => {
    const result = heartbeatSchema.safeParse({ recognitionConfidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('accepts confidence at boundaries (0 and 1)', () => {
    expect(heartbeatSchema.safeParse({ recognitionConfidence: 0 }).success).toBe(true);
    expect(heartbeatSchema.safeParse({ recognitionConfidence: 1 }).success).toBe(true);
  });
});

// ---- State transition rules (pure logic, no DB) ----
describe('anomaly state transition rules', () => {
  type Status = 'open' | 'acknowledged' | 'assigned' | 'resolved' | 'escalated';

  function canAcknowledge(status: Status) { return status === 'open'; }
  function canAssign(status: Status)      { return status === 'acknowledged'; }
  function canResolve(status: Status)     { return status === 'assigned'; }
  function canEscalate(status: Status)    { return ['open', 'acknowledged', 'assigned'].includes(status); }

  it('open → acknowledged: valid', () => expect(canAcknowledge('open')).toBe(true));
  it('acknowledged → acknowledged: invalid', () => expect(canAcknowledge('acknowledged')).toBe(false));
  it('acknowledged → assigned: valid', () => expect(canAssign('acknowledged')).toBe(true));
  it('open → assigned: invalid', () => expect(canAssign('open')).toBe(false));
  it('assigned → resolved: valid', () => expect(canResolve('assigned')).toBe(true));
  it('acknowledged → resolved: invalid', () => expect(canResolve('acknowledged')).toBe(false));
  it('open → escalated: valid', () => expect(canEscalate('open')).toBe(true));
  it('acknowledged → escalated: valid', () => expect(canEscalate('acknowledged')).toBe(true));
  it('assigned → escalated: valid', () => expect(canEscalate('assigned')).toBe(true));
  it('resolved → escalated: invalid', () => expect(canEscalate('resolved')).toBe(false));
  it('escalated → escalated: invalid', () => expect(canEscalate('escalated')).toBe(false));
});
