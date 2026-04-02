import { prisma } from '../../lib/prisma';
import { encryptAmount, decryptAmount } from '../../lib/encryption';
import { writeAuditEntry } from '../admin/audit.service';

export async function getBalance(studentId: string): Promise<number> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    const err: any = new Error('Student not found');
    err.status = 404;
    err.code = 'STUDENT_NOT_FOUND';
    throw err;
  }
  const enc = (student as any).storedValueEncrypted;
  return enc ? decryptAmount(enc) : 0;
}

export async function topUp(
  studentId: string,
  amount: number,
  actorId: string,
  note?: string,
) {
  if (amount <= 0 || amount > 10000) {
    const err: any = new Error('Amount must be > 0 and ≤ 10000');
    err.status = 422;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  const balance = await getBalance(studentId);
  const newBalance = balance + amount;

  await prisma.student.update({
    where: { id: studentId },
    data: { storedValueEncrypted: encryptAmount(newBalance) },
  });

  const transaction = await prisma.storedValueTransaction.create({
    data: {
      studentId,
      type: 'top_up',
      amountEncrypted: encryptAmount(amount),
      balanceAfterEncrypted: encryptAmount(newBalance),
      note,
    },
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
) {
  const balance = await getBalance(studentId);
  if (balance < amount) {
    const err: any = new Error('Insufficient stored value balance');
    err.status = 422;
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  const newBalance = balance - amount;

  await prisma.student.update({
    where: { id: studentId },
    data: { storedValueEncrypted: encryptAmount(newBalance) },
  });

  const transaction = await prisma.storedValueTransaction.create({
    data: {
      studentId,
      type: 'spend',
      amountEncrypted: encryptAmount(amount),
      balanceAfterEncrypted: encryptAmount(newBalance),
      referenceId,
      referenceType,
    },
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
) {
  const where: any = { studentId };
  if (params.type) where.type = params.type;

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

export async function generateReceiptText(transactionId: string): Promise<string> {
  const txn = await prisma.storedValueTransaction.findUnique({ where: { id: transactionId } });
  if (!txn) {
    const err: any = new Error('Transaction not found');
    err.status = 404;
    err.code = 'TRANSACTION_NOT_FOUND';
    throw err;
  }

  const amount = decryptAmount(txn.amountEncrypted);
  const balanceAfter = decryptAmount(txn.balanceAfterEncrypted);

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

  if (txn.referenceId) {
    lines.push(`Reference:     ${txn.referenceType ?? ''} ${txn.referenceId}`);
  }
  if (txn.note) {
    lines.push(`Note:          ${txn.note}`);
  }

  lines.push('================================');
  return lines.join('\n');
}
