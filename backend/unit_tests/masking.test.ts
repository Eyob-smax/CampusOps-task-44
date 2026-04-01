/**
 * Unit tests — PII field-level masking
 */
import { describe, it, expect } from 'vitest';
import { maskStudent } from '../src/lib/masking';

const fullRecord = {
  fullName: 'Alice Johnson',
  studentId: 'S00012345',
  email: 'alice.johnson@campus.edu',
  phone: '5551234567',
};

describe('maskStudent', () => {
  it('returns all fields for administrator', () => {
    const result = maskStudent(fullRecord, 'administrator');
    expect(result.fullName).toBe('Alice Johnson');
    expect(result.email).toBe('alice.johnson@campus.edu');
    expect(result.studentId).toBe('S00012345');
    expect(result.phone).toBe('5551234567');
  });

  it('returns all fields for customer_service_agent', () => {
    const result = maskStudent(fullRecord, 'customer_service_agent');
    expect(result.email).toBe('alice.johnson@campus.edu');
  });

  it('masks studentId for classroom_supervisor (last 4 only)', () => {
    const result = maskStudent(fullRecord, 'classroom_supervisor');
    expect(result.studentId).toMatch(/^\*+2345$/);
  });

  it('masks email to domain-only for auditor', () => {
    const result = maskStudent(fullRecord, 'auditor');
    expect(result.email).toBe('***@campus.edu');
  });

  it('shows first name + last initial for auditor', () => {
    const result = maskStudent(fullRecord, 'auditor');
    expect(result.fullName).toBe('Alice J.');
  });

  it('masks phone last-4 for auditor', () => {
    const result = maskStudent(fullRecord, 'auditor');
    expect(result.phone).toMatch(/^\*+4567$/);
  });
});
