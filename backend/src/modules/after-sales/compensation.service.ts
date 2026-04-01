import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { logger } from '../../lib/logger';

// ---- Zod schemas ----

export const createCompensationSchema = z.object({
  ticketId: z.string().uuid(),
  amount:   z.number().positive(),
  type:     z.enum(['credit', 'refund', 'replacement']),
  note:     z.string().optional(),
});

export const approveCompensationSchema = z.object({
  note: z.string().optional(),
});

export const createCompensationRuleSchema = z.object({
  condition:        z.string().min(1).max(200),
  ticketType:       z.enum(['delay', 'dispute', 'lost_item']),
  minDelayHours:    z.number().int().positive().optional(),
  suggestedAmount:  z.number().positive(),
  capAmount:        z.number().positive(),
  compensationType: z.enum(['credit', 'refund', 'replacement']),
  isActive:         z.boolean().default(true),
});

// ---- Constants ----

const GLOBAL_CAP = 50; // $50

// Default rule applied when no DB rules match
const DEFAULT_RULE = {
  minDelayHours:    48,
  suggestedAmount:  10,
  capAmount:        GLOBAL_CAP,
  compensationType: 'credit' as const,
};

// ---- Service functions ----

export async function getActiveRules() {
  return prisma.compensationRule.findMany({
    where:   { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getTicketCompensations(ticketId: string) {
  const ticket = await prisma.afterSalesTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    const err: any = new Error('After-sales ticket not found');
    err.status = 404;
    err.code   = 'TICKET_NOT_FOUND';
    throw err;
  }

  return prisma.compensation.findMany({
    where:   { ticketId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function suggestCompensation(ticketId: string, actorId: string) {
  const ticket = await prisma.afterSalesTicket.findUnique({
    where:   { id: ticketId },
    include: { shipment: true, compensations: true },
  });

  if (!ticket) {
    const err: any = new Error('After-sales ticket not found');
    err.status = 404;
    err.code   = 'TICKET_NOT_FOUND';
    throw err;
  }

  // Compute delivery delay in hours
  let deliveryDelayHours = 0;
  if (ticket.shipment?.estimatedDeliveryAt) {
    const estDelivery = ticket.shipment.estimatedDeliveryAt.getTime();
    const actualOrNow = (ticket.shipment.deliveredAt ?? new Date()).getTime();
    deliveryDelayHours = Math.max(0, (actualOrNow - estDelivery) / (1000 * 60 * 60));
  }

  // Sum existing approved compensations
  const existingTotal = ticket.compensations
    .filter(c => c.status === 'approved' || c.status === 'applied')
    .reduce((sum, c) => sum + Number(c.amount), 0);

  if (existingTotal >= GLOBAL_CAP) {
    logger.info({ msg: 'Compensation cap reached, skipping suggestion', ticketId });
    return null;
  }

  // Get active rules
  const rules = await getActiveRules();

  // Match applicable rules
  let suggestedAmount   = 0;
  let compensationType  = 'credit' as string;
  let capAmount         = GLOBAL_CAP;
  let ruleMatched       = false;

  for (const rule of rules) {
    if (rule.ticketType !== ticket.type) continue;
    if (rule.minDelayHours !== null && deliveryDelayHours < rule.minDelayHours) continue;

    // Rule matches — use it
    suggestedAmount  = Number(rule.suggestedAmount);
    compensationType = rule.compensationType;
    capAmount        = Math.min(Number(rule.capAmount), GLOBAL_CAP);
    ruleMatched      = true;
    break;
  }

  // Fall back to default rule for delay tickets
  if (!ruleMatched && ticket.type === 'delay' && deliveryDelayHours >= DEFAULT_RULE.minDelayHours) {
    suggestedAmount  = DEFAULT_RULE.suggestedAmount;
    compensationType = DEFAULT_RULE.compensationType;
    capAmount        = DEFAULT_RULE.capAmount;
    ruleMatched      = true;
  }

  if (!ruleMatched || suggestedAmount <= 0) {
    logger.info({ msg: 'No matching compensation rule', ticketId });
    return null;
  }

  // Cap: min(suggestedAmount, cap - existingTotal)
  const remaining  = Math.max(0, capAmount - existingTotal);
  const finalAmount = Math.min(suggestedAmount, remaining);

  if (finalAmount <= 0) {
    logger.info({ msg: 'Compensation capped at zero, skipping', ticketId });
    return null;
  }

  const compensation = await prisma.compensation.create({
    data: {
      ticketId,
      amount: finalAmount,
      type:   compensationType as any,
      status: 'suggested',
      note:   `Auto-suggested: ${deliveryDelayHours.toFixed(1)}h delay`,
    },
  });

  // Timeline entry
  await prisma.ticketTimelineEntry.create({
    data: {
      ticketId,
      actorId,
      action: 'compensation_suggested',
      note:   `Suggested ${compensationType} of $${finalAmount.toFixed(2)}`,
    },
  });

  logger.info({ msg: 'Compensation suggested', compensationId: compensation.id, ticketId, amount: finalAmount });
  return compensation;
}

export async function approveCompensation(
  compensationId:   string,
  actorId:          string,
  permissionLevel:  'limited' | 'full' | 'override',
  note?:            string,
) {
  const compensation = await prisma.compensation.findUnique({
    where:   { id: compensationId },
    include: { ticket: true },
  });

  if (!compensation) {
    const err: any = new Error('Compensation not found');
    err.status = 404;
    err.code   = 'COMPENSATION_NOT_FOUND';
    throw err;
  }

  if (compensation.status !== 'suggested') {
    const err: any = new Error(`Compensation is already ${compensation.status}`);
    err.status = 422;
    err.code   = 'INVALID_COMPENSATION_STATUS';
    throw err;
  }

  const amount = Number(compensation.amount);

  // Permission level checks
  const LIMITS: Record<string, number> = {
    limited:  25,
    full:     50,
    override: Infinity,
  };

  const limit = LIMITS[permissionLevel] ?? 0;
  if (amount > limit) {
    const err: any = new Error(
      `Compensation amount $${amount.toFixed(2)} exceeds ${permissionLevel} approval limit $${limit === Infinity ? '∞' : limit.toFixed(2)}`,
    );
    err.status = 403;
    err.code   = 'APPROVAL_LIMIT_EXCEEDED';
    throw err;
  }

  const updated = await prisma.compensation.update({
    where: { id: compensationId },
    data: {
      status:      'approved',
      approvedById: actorId,
      approvedAt:  new Date(),
      note:        note ?? compensation.note,
    },
  });

  // Timeline entry
  await prisma.ticketTimelineEntry.create({
    data: {
      ticketId: compensation.ticketId,
      actorId,
      action:   'compensation_approved',
      note:     `Approved ${compensation.type} of $${amount.toFixed(2)}${note ? ': ' + note : ''}`,
    },
  });

  await writeAuditEntry(
    actorId,
    'compensation.approve',
    'Compensation',
    compensationId,
    { amount, type: compensation.type, ticketId: compensation.ticketId, permissionLevel },
  );

  // If credit — call stored-value top-up
  if (compensation.type === 'credit') {
    try {
      const studentId = compensation.ticket.studentId;
      const { topUp }  = await import('../stored-value/stored-value.service');
      await topUp(studentId, amount, actorId, `Compensation for ticket ${compensation.ticketId}`);

      // Mark as applied
      await prisma.compensation.update({
        where: { id: compensationId },
        data:  { status: 'applied' },
      });

      await prisma.ticketTimelineEntry.create({
        data: {
          ticketId: compensation.ticketId,
          actorId:  'system',
          action:   'compensation_applied',
          note:     `Credit of $${amount.toFixed(2)} applied to stored value`,
        },
      });
    } catch (creditErr) {
      logger.error({ msg: 'Failed to apply credit compensation', compensationId, err: creditErr });
    }
  }

  logger.info({ msg: 'Compensation approved', compensationId, amount, actorId });
  return updated;
}

export async function rejectCompensation(
  compensationId: string,
  actorId:        string,
  note?:          string,
) {
  const compensation = await prisma.compensation.findUnique({ where: { id: compensationId } });

  if (!compensation) {
    const err: any = new Error('Compensation not found');
    err.status = 404;
    err.code   = 'COMPENSATION_NOT_FOUND';
    throw err;
  }

  if (compensation.status !== 'suggested') {
    const err: any = new Error(`Compensation is already ${compensation.status}`);
    err.status = 422;
    err.code   = 'INVALID_COMPENSATION_STATUS';
    throw err;
  }

  const updated = await prisma.compensation.update({
    where: { id: compensationId },
    data: {
      status: 'rejected',
      note:   note ?? compensation.note,
    },
  });

  // Timeline entry
  await prisma.ticketTimelineEntry.create({
    data: {
      ticketId: compensation.ticketId,
      actorId,
      action:   'compensation_rejected',
      note:     note ?? 'Compensation rejected',
    },
  });

  await writeAuditEntry(
    actorId,
    'compensation.reject',
    'Compensation',
    compensationId,
    { ticketId: compensation.ticketId, note },
  );

  logger.info({ msg: 'Compensation rejected', compensationId, actorId });
  return updated;
}

// ---- Compensation Rule CRUD ----

export async function createCompensationRule(
  data:    z.infer<typeof createCompensationRuleSchema>,
  actorId: string,
) {
  const rule = await prisma.compensationRule.create({
    data: {
      condition:        data.condition,
      ticketType:       data.ticketType,
      minDelayHours:    data.minDelayHours,
      suggestedAmount:  data.suggestedAmount,
      capAmount:        data.capAmount,
      compensationType: data.compensationType,
      isActive:         data.isActive,
    },
  });

  await writeAuditEntry(
    actorId,
    'compensation-rule.create',
    'CompensationRule',
    rule.id,
    { ticketType: data.ticketType, suggestedAmount: data.suggestedAmount },
  );

  logger.info({ msg: 'Compensation rule created', ruleId: rule.id, actorId });
  return rule;
}

export async function updateCompensationRule(
  id:      string,
  data:    Partial<z.infer<typeof createCompensationRuleSchema>>,
  actorId: string,
) {
  const existing = await prisma.compensationRule.findUnique({ where: { id } });
  if (!existing) {
    const err: any = new Error('Compensation rule not found');
    err.status = 404;
    err.code   = 'RULE_NOT_FOUND';
    throw err;
  }

  const rule = await prisma.compensationRule.update({
    where: { id },
    data: {
      condition:        data.condition,
      ticketType:       data.ticketType,
      minDelayHours:    data.minDelayHours,
      suggestedAmount:  data.suggestedAmount,
      capAmount:        data.capAmount,
      compensationType: data.compensationType,
      isActive:         data.isActive,
    },
  });

  await writeAuditEntry(
    actorId,
    'compensation-rule.update',
    'CompensationRule',
    rule.id,
    { changes: data },
  );

  logger.info({ msg: 'Compensation rule updated', ruleId: rule.id, actorId });
  return rule;
}
