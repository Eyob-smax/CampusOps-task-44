import { UserRole } from '../types';

/**
 * Field-level PII masking rules per role.
 * Applied in the serialization layer — raw DB records are never modified.
 */

export interface StudentPii {
  fullName: string;
  studentId: string;
  email: string;
  phone: string;
}

export function maskStudent(data: StudentPii, role: UserRole): Partial<StudentPii> {
  switch (role) {
    case 'administrator':
    case 'operations_manager':
    case 'customer_service_agent':
      return { ...data };

    case 'classroom_supervisor':
      return {
        fullName: data.fullName, // Full
        studentId: maskLastFour(data.studentId),
        email: maskEmail(data.email),
        phone: maskLastFour(data.phone),
      };

    case 'auditor':
      return {
        fullName: maskFirstNameLastInitial(data.fullName),
        studentId: maskLastFour(data.studentId),
        email: maskEmailDomainOnly(data.email),
        phone: maskLastFour(data.phone),
      };
  }
}

function maskLastFour(value: string): string {
  if (value.length <= 4) return '****';
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function maskEmail(email: string): string {
  // customer_service_agent gets full email — but classroom_supervisor sees masked
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***.***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}@${domain}`;
}

function maskEmailDomainOnly(email: string): string {
  const domain = email.split('@')[1] ?? '***';
  return `***@${domain}`;
}

function maskFirstNameLastInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}
