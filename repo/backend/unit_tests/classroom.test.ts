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
  canAcknowledgeAnomalyStatus,
  canAssignAnomalyStatus,
  canResolveAnomalyStatus,
  canEscalateAnomalyStatus,
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

// ---- resolveAnomalySchema — critical: 20 char minimum ----
describe('resolveAnomalySchema', () => {
  it('accepts note of exactly 20 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '12345678901234567890' });
    expect(result.success).toBe(true);
  });

  it('accepts note longer than 20 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: 'Fixed by restarting the hardware node and verifying connection.' });
    expect(result.success).toBe(true);
  });

  it('rejects note of 19 chars', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '1234567890123456789' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('20');
    }
  });

  it('rejects empty note', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '' });
    expect(result.success).toBe(false);
  });

  it('trims leading/trailing whitespace before validation', () => {
    // Trimmed value below threshold should fail.
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '          too short         ' });
    expect(result.success).toBe(false);
  });

  it('passes when note has 20 non-whitespace chars after trim', () => {
    const result = resolveAnomalySchema.safeParse({ resolutionNote: '  Node restarted and validated  ' });
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

// ---- State transition rules ----
describe('anomaly state transition rules', () => {
  it('open → acknowledged: valid', () => expect(canAcknowledgeAnomalyStatus('open')).toBe(true));
  it('acknowledged → acknowledged: invalid', () => expect(canAcknowledgeAnomalyStatus('acknowledged')).toBe(false));
  it('acknowledged → assigned: valid', () => expect(canAssignAnomalyStatus('acknowledged')).toBe(true));
  it('open → assigned: invalid', () => expect(canAssignAnomalyStatus('open')).toBe(false));
  it('assigned → resolved: valid', () => expect(canResolveAnomalyStatus('assigned')).toBe(true));
  it('acknowledged → resolved: invalid', () => expect(canResolveAnomalyStatus('acknowledged')).toBe(false));
  it('open → escalated: valid', () => expect(canEscalateAnomalyStatus('open')).toBe(true));
  it('acknowledged → escalated: valid', () => expect(canEscalateAnomalyStatus('acknowledged')).toBe(true));
  it('assigned → escalated: valid', () => expect(canEscalateAnomalyStatus('assigned')).toBe(true));
  it('resolved → escalated: invalid', () => expect(canEscalateAnomalyStatus('resolved')).toBe(false));
  it('escalated → escalated: invalid', () => expect(canEscalateAnomalyStatus('escalated')).toBe(false));
});
