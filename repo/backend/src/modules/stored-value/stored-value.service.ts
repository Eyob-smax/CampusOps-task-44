import { prisma } from '../../lib/prisma';
import { encryptAmount, decryptAmount } from '../../lib/encryption';
import { writeAuditEntry } from '../admin/audit.service';
import type { AuthenticatedUser } from '../../types';

const STORED_VALUE_ENABLED_KEY = 'stored_value_enabled';
const STORED_VALUE_TOPUP_APPROVAL_THRESHOLD_KEY = 'stored_value_topup_approval_threshold';
const DEFAULT_STORED_VALUE_ENABLED = true;
const DEFAULT_STORED_VALUE_TOPUP_APPROVAL_THRESHOLD = 200;
const MAX_BALANCE_MUTATION_RETRIES = 3;

export function parseStoredValueEnabled(rawValue: string | null | undefined): boolean {
  if (rawValue == null) return DEFAULT_STORED_VALUE_ENABLED;
  return ['true', '1', 'yes', 'on'].includes(rawValue.trim().toLowerCase());
}

export function parseTopUpApprovalThreshold(rawValue: string | null | undefined): number {
  if (rawValue == null) return DEFAULT_STORED_VALUE_TOPUP_APPROVAL_THRESHOLD;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STORED_VALUE_TOPUP_APPROVAL_THRESHOLD;
  }
  return parsed;
}

export function requiresTopUpApproval(amount: number, threshold: number): boolean {
  return amount > threshold;
}

export function canApproveHighValueTopUp(requester?: AuthenticatedUser): boolean {
  return requester?.role === 'administrator' || requester?.role === 'operations_manager';
}

export function scopedStudentWhere(studentId: string, requester?: AuthenticatedUser): Record<string, unknown> {
  const where: Record<string, unknown> = { id: studentId };
  if (requester?.campusId) {
    where.campusId = requester.campusId;
  }
  return where;
}

async function getStoredValuePolicy(): Promise<{ enabled: boolean; topUpApprovalThreshold: number }> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          STORED_VALUE_ENABLED_KEY,
          STORED_VALUE_TOPUP_APPROVAL_THRESHOLD_KEY,
        ],
      },
    },
  });

  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    enabled: parseStoredValueEnabled(byKey.get(STORED_VALUE_ENABLED_KEY) ?? null),
    topUpApprovalThreshold: parseTopUpApprovalThreshold(
      byKey.get(STORED_VALUE_TOPUP_APPROVAL_THRESHOLD_KEY) ?? null,
    ),
  };
}

async function assertStoredValueEnabled(): Promise<{ topUpApprovalThreshold: number }> {
  const policy = await getStoredValuePolicy();
  if (!policy.enabled) {
    const err: any = new Error('Feature disabled');
    err.status = 403;
    err.code = 'FEATURE_DISABLED';
    throw err;
  }
  return { topUpApprovalThreshold: policy.topUpApprovalThreshold };
}

async function getScopedStudentOrThrow(studentId: string, requester?: AuthenticatedUser) {
  const student = await prisma.student.findFirst({
    where: scopedStudentWhere(studentId, requester) as any,
  });

  if (!student) {
    const err: any = new Error('Student not found');
    err.status = 404;
    err.code = 'STUDENT_NOT_FOUND';
    throw err;
  }

  return student;
}

async function assertCustomerServiceSpendScope(
  studentId: string,
  referenceId: string,
  referenceType: string,
  requester?: AuthenticatedUser,
): Promise<void> {
  if (!requester || requester.role !== 'customer_service_agent') {
    return;
  }

  const normalizedType = referenceType.trim().toLowerCase();
  const allowedTypes = new Set([
    'after_sales_ticket',
    'after-sales-ticket',
    'after_sales',
    'after-sales',
  ]);

  if (!allowedTypes.has(normalizedType)) {
    const err: any = new Error('Customer service spend requires an after-sales ticket reference');
    err.status = 403;
    err.code = 'OBJECT_SCOPE_VIOLATION';
    throw err;
  }

  const ticket = await prisma.afterSalesTicket.findFirst({
    where: {
      id: referenceId,
      studentId,
      createdById: requester.id,
      campusId: requester.campusId,
    },
    select: { id: true },
  });

  if (!ticket) {
    const err: any = new Error('Customer service access denied for this student ticket context');
    err.status = 403;
    err.code = 'OBJECT_SCOPE_VIOLATION';
    throw err;
  }
}

type StoredValueMutationType = 'top_up' | 'spend';

function buildBalanceConflictError(): Error {
  const err: any = new Error('Stored value balance changed during processing; retry the request');
  err.status = 409;
  err.code = 'BALANCE_CONFLICT';
  return err;
}

async function mutateStoredValueBalance(params: {
  studentId: string;
  amount: number;
  type: StoredValueMutationType;
  requester?: AuthenticatedUser;
  referenceId?: string;
  referenceType?: string;
  note?: string;
}): Promise<{ balance: number; transaction: any }> {
  for (let attempt = 1; attempt <= MAX_BALANCE_MUTATION_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const student = await tx.student.findFirst({
          where: scopedStudentWhere(params.studentId, params.requester) as any,
          select: {
            id: true,
            campusId: true,
            storedValueEncrypted: true,
          },
        });

        if (!student) {
          const err: any = new Error('Student not found');
          err.status = 404;
          err.code = 'STUDENT_NOT_FOUND';
          throw err;
        }

        const currentEncrypted = student.storedValueEncrypted ?? null;
        const currentBalance = currentEncrypted
          ? decryptAmount(currentEncrypted)
          : 0;

        const newBalance =
          params.type === 'top_up'
            ? currentBalance + params.amount
            : currentBalance - params.amount;

        if (params.type === 'spend' && newBalance < 0) {
          const err: any = new Error('Insufficient stored value balance');
          err.status = 422;
          err.code = 'INSUFFICIENT_BALANCE';
          throw err;
        }

        const updateResult = await tx.student.updateMany({
          where: {
            id: student.id,
            campusId: student.campusId,
            storedValueEncrypted: currentEncrypted,
          },
          data: {
            storedValueEncrypted: encryptAmount(newBalance),
          },
        });

        if (updateResult.count !== 1) {
          throw buildBalanceConflictError();
        }

        const transaction = await tx.storedValueTransaction.create({
          data: {
            studentId: params.studentId,
            type: params.type,
            amountEncrypted: encryptAmount(params.amount),
            balanceAfterEncrypted: encryptAmount(newBalance),
            referenceId: params.referenceId,
            referenceType: params.referenceType,
            note: params.note,
          },
        });

        return { balance: newBalance, transaction };
      });

      return result;
    } catch (err: any) {
      if (
        err?.code === 'BALANCE_CONFLICT' &&
        attempt < MAX_BALANCE_MUTATION_RETRIES
      ) {
        continue;
      }

      throw err;
    }
  }

  throw buildBalanceConflictError();
}

export async function getBalance(studentId: string, _requester?: AuthenticatedUser): Promise<number> {
  await assertStoredValueEnabled();
  const student = await getScopedStudentOrThrow(studentId, _requester);
  const enc = (student as any).storedValueEncrypted;
  return enc ? decryptAmount(enc) : 0;
}

export async function topUp(
  studentId: string,
  amount: number,
  actorId: string,
  note?: string,
  requester?: AuthenticatedUser,
) {
  const { topUpApprovalThreshold } = await assertStoredValueEnabled();

  if (amount <= 0 || amount > 10000) {
    const err: any = new Error('Amount must be > 0 and ≤ 10000');
    err.status = 422;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  if (requiresTopUpApproval(amount, topUpApprovalThreshold) && !canApproveHighValueTopUp(requester)) {
    const err: any = new Error(
      `Top-up amounts above $${topUpApprovalThreshold.toFixed(2)} require administrator or operations manager approval`,
    );
    err.status = 403;
    err.code = 'TOP_UP_APPROVAL_REQUIRED';
    throw err;
  }

  const { balance: newBalance, transaction } = await mutateStoredValueBalance({
    studentId,
    amount,
    type: 'top_up',
    requester,
    note,
  });

  await writeAuditEntry(
    actorId,
    'storedValue.topUp',
    'StoredValueTransaction',
    transaction.id,
    { studentId, amount, newBalance },
  );

  return { balance: newBalance, transaction };
}

export async function spend(
  studentId: string,
  amount: number,
  referenceId: string,
  referenceType: string,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  await assertStoredValueEnabled();
  await assertCustomerServiceSpendScope(studentId, referenceId, referenceType, requester);

  const { balance: newBalance, transaction } = await mutateStoredValueBalance({
    studentId,
    amount,
    type: 'spend',
    requester,
    referenceId,
    referenceType,
  });

  await writeAuditEntry(
    actorId,
    'storedValue.spend',
    'StoredValueTransaction',
    transaction.id,
    { studentId, amount, newBalance, referenceId, referenceType },
  );

  return { balance: newBalance, transaction };
}

export async function listTransactions(
  studentId: string,
  params: { page?: number; limit?: number; type?: string },
  requester?: AuthenticatedUser,
) {
  await assertStoredValueEnabled();
  await getScopedStudentOrThrow(studentId, requester);

  const where: any = { studentId };
  if (params.type) where.type = params.type;
  if (requester?.campusId) {
    where.student = { campusId: requester.campusId };
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.storedValueTransaction.count({ where }),
    prisma.storedValueTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, items };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeReceiptText(value: string, maxLength: number): string {
  const collapsed = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return escapeHtml(collapsed.slice(0, maxLength));
}

export async function generateReceiptText(transactionId: string, requester?: AuthenticatedUser): Promise<string> {
  await assertStoredValueEnabled();

  const txn = await prisma.storedValueTransaction.findUnique({
    where: { id: transactionId },
    include: { student: { select: { campusId: true } } },
  });
  if (!txn) {
    const err: any = new Error('Transaction not found');
    err.status = 404;
    err.code = 'TRANSACTION_NOT_FOUND';
    throw err;
  }

  if (requester?.campusId && txn.student?.campusId !== requester.campusId) {
    const err: any = new Error('Transaction not found');
    err.status = 404;
    err.code = 'TRANSACTION_NOT_FOUND';
    throw err;
  }

  const amount = decryptAmount(txn.amountEncrypted);
  const balanceAfter = decryptAmount(txn.balanceAfterEncrypted);
  const safeReferenceType = txn.referenceType ? sanitizeReceiptText(txn.referenceType, 40) : '';
  const safeReferenceId = txn.referenceId ? sanitizeReceiptText(txn.referenceId, 120) : '';
  const safeNote = txn.note ? sanitizeReceiptText(txn.note, 500) : '';

  const lines = [
    '================================',
    '     STORED VALUE RECEIPT',
    '================================',
    `Date:          ${txn.createdAt.toISOString()}`,
    `Transaction:   ${txn.id}`,
    `Type:          ${txn.type.toUpperCase()}`,
    `Amount:        $${amount.toFixed(2)}`,
    `Balance After: $${balanceAfter.toFixed(2)}`,
  ];

  if (safeReferenceId) {
    lines.push(`Reference:     ${safeReferenceType} ${safeReferenceId}`.trimEnd());
  }
  if (safeNote) {
    lines.push(`Note:          ${safeNote}`);
  }

  lines.push('================================');
  return lines.join('\n');
}
