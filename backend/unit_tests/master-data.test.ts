/**
 * Unit tests — master data validators and student PII masking
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { createDepartmentSchema, updateDepartmentSchema } =
  await import('../src/modules/master-data/department.service');
const { createSemesterSchema } =
  await import('../src/modules/master-data/semester.service');
const { createCourseSchema } =
  await import('../src/modules/master-data/course.service');
const { createStudentSchema, updateStudentSchema, serializeStudent } =
  await import('../src/modules/master-data/student.service');

// ---- Department validation ----
describe('createDepartmentSchema', () => {
  it('accepts valid department', () => {
    expect(() => createDepartmentSchema.parse({ name: 'Computer Science', code: 'cs' })).not.toThrow();
  });

  it('upcases code', () => {
    const d = createDepartmentSchema.parse({ name: 'CS', code: 'cs' });
    expect(d.code).toBe('CS');
  });

  it('rejects empty name', () => {
    expect(() => createDepartmentSchema.parse({ name: '', code: 'CS' })).toThrow();
  });

  it('rejects code longer than 20 chars', () => {
    expect(() => createDepartmentSchema.parse({ name: 'X', code: 'A'.repeat(21) })).toThrow();
  });
});

describe('updateDepartmentSchema', () => {
  it('allows partial update', () => {
    expect(() => updateDepartmentSchema.parse({ name: 'New Name' })).not.toThrow();
  });

  it('allows isActive toggle', () => {
    const d = updateDepartmentSchema.parse({ isActive: false });
    expect(d.isActive).toBe(false);
  });
});

// ---- Semester validation ----
describe('createSemesterSchema', () => {
  it('accepts valid semester', () => {
    expect(() => createSemesterSchema.parse({ name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' })).not.toThrow();
  });

  it('rejects when endDate is before startDate', () => {
    expect(() => createSemesterSchema.parse({ name: 'Bad', startDate: '2026-12-01', endDate: '2026-09-01' })).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() => createSemesterSchema.parse({ name: 'Bad', startDate: '01/09/2026', endDate: '2026-12-01' })).toThrow();
  });
});

// ---- Course validation ----
describe('createCourseSchema', () => {
  const deptId = '550e8400-e29b-41d4-a716-446655440000';
  it('accepts valid course', () => {
    expect(() => createCourseSchema.parse({ code: 'CS101', name: 'Intro to CS', departmentId: deptId })).not.toThrow();
  });

  it('upcases code', () => {
    const c = createCourseSchema.parse({ code: 'cs101', name: 'X', departmentId: deptId });
    expect(c.code).toBe('CS101');
  });

  it('rejects non-UUID departmentId', () => {
    expect(() => createCourseSchema.parse({ code: 'CS101', name: 'X', departmentId: 'not-a-uuid' })).toThrow();
  });
});

// ---- Student validation ----
describe('createStudentSchema', () => {
  it('accepts valid student', () => {
    expect(() => createStudentSchema.parse({ studentNumber: 'S001', fullName: 'Alice Johnson', email: 'alice@example.com' })).not.toThrow();
  });

  it('normalises email to lowercase', () => {
    const s = createStudentSchema.parse({ studentNumber: 'S001', fullName: 'Alice', email: 'ALICE@EXAMPLE.COM' });
    expect(s.email).toBe('alice@example.com');
  });

  it('rejects invalid email', () => {
    expect(() => createStudentSchema.parse({ studentNumber: 'S001', fullName: 'Alice', email: 'not-email' })).toThrow();
  });

  it('rejects short fullName', () => {
    expect(() => createStudentSchema.parse({ studentNumber: 'S001', fullName: 'A', email: 'a@b.com' })).toThrow();
  });
});

describe('updateStudentSchema', () => {
  it('allows partial update', () => {
    expect(() => updateStudentSchema.parse({ phone: '+1-555-0100' })).not.toThrow();
  });

  it('allows null phone', () => {
    const s = updateStudentSchema.parse({ phone: null });
    expect(s.phone).toBeNull();
  });
});

// ---- PII masking via serializeStudent ----
const baseStudent = {
  id: 'student-1',
  studentNumber: 'S2026001',
  fullName: 'Alice Johnson',
  email: 'alice@university.edu',
  phone: '+15550100',
  departmentId: 'dept-1',
  membershipTierId: null,
  membershipTier: null,
  growthPoints: 150,
  storedValueEncrypted: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('serializeStudent — PII masking', () => {
  it('administrator sees full data', () => {
    const s = serializeStudent(baseStudent, 'administrator');
    expect(s.fullName).toBe('Alice Johnson');
    expect(s.email).toBe('alice@university.edu');
    expect(s.studentNumber).toBe('S2026001');
  });

  it('operations_manager sees full PII', () => {
    const s = serializeStudent(baseStudent, 'operations_manager');
    expect(s.fullName).toBe('Alice Johnson');
    expect(s.email).toBe('alice@university.edu');
  });

  it('customer_service_agent sees full PII', () => {
    const s = serializeStudent(baseStudent, 'customer_service_agent');
    expect(s.fullName).toBe('Alice Johnson');
    expect(s.email).toBe('alice@university.edu');
  });

  it('classroom_supervisor sees masked student number', () => {
    const s = serializeStudent(baseStudent, 'classroom_supervisor');
    // studentNumber S2026001 (8 chars) → ****2001 (last 4 visible)
    expect(s.studentNumber).toMatch(/^\*+\d{4}$/);
    expect(s.fullName).toBe('Alice Johnson'); // full name is visible
  });

  it('classroom_supervisor sees masked email', () => {
    const s = serializeStudent(baseStudent, 'classroom_supervisor');
    expect(s.email).not.toBe('alice@university.edu');
    expect(s.email).toContain('@');
  });

  it('auditor sees only first name + last initial', () => {
    const s = serializeStudent(baseStudent, 'auditor');
    expect(s.fullName).toBe('Alice J.');
  });

  it('auditor sees domain-only email', () => {
    const s = serializeStudent(baseStudent, 'auditor');
    expect(s.email).toBe('***@university.edu');
  });

  it('stored value hidden for classroom_supervisor', () => {
    const s = serializeStudent(baseStudent, 'classroom_supervisor');
    expect(s.storedValueBalance).toBeUndefined();
  });

  it('stored value hidden for auditor', () => {
    const s = serializeStudent(baseStudent, 'auditor');
    expect(s.storedValueBalance).toBeUndefined();
  });

  it('stored value shown for administrator (null when no encrypted value)', () => {
    const s = serializeStudent(baseStudent, 'administrator');
    expect(s.storedValueBalance).toBeNull();
  });
});
