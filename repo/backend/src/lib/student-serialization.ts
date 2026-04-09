import { decryptAmount } from './encryption';
import { maskStudent } from './masking';
import type { UserRole } from '../types';

interface StudentLike {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string;
  phone?: string | null;
  storedValueEncrypted?: string | null;
  [key: string]: unknown;
}

function normalizeRole(role?: UserRole): UserRole {
  return role ?? 'administrator';
}

export function serializeStudentForRole(student: StudentLike, role?: UserRole): Record<string, unknown> {
  const effectiveRole = normalizeRole(role);
  const masked = maskStudent(
    {
      fullName: student.fullName,
      studentId: student.studentNumber,
      email: student.email,
      phone: student.phone ?? '',
    },
    effectiveRole,
  );

  const serialized: Record<string, unknown> = {
    ...student,
    fullName: masked.fullName,
    studentId: masked.studentId,
    email: masked.email,
    phone: masked.phone ?? null,
  };

  delete serialized.studentNumber;

  if (typeof student.storedValueEncrypted === 'string' && student.storedValueEncrypted.length > 0) {
    try {
      serialized.storedValue = decryptAmount(student.storedValueEncrypted);
    } catch {
      serialized.storedValue = null;
    }
  }

  delete serialized.storedValueEncrypted;

  return serialized;
}

export function serializeStudentInRecord<T extends Record<string, unknown>>(
  record: T,
  role?: UserRole,
): T {
  const student = record.student as StudentLike | null | undefined;
  if (!student) {
    return record;
  }

  return {
    ...record,
    student: serializeStudentForRole(student, role),
  } as T;
}

export function serializeStudentInRecords<T extends Record<string, unknown>>(
  records: T[],
  role?: UserRole,
): T[] {
  return records.map((record) => serializeStudentInRecord(record, role));
}
