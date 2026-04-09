import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readView(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('frontend operational workflow coverage', () => {
  it('classroom anomaly queue exposes full operator lifecycle and 20-char resolution contract', () => {
    const source = readView('src/views/classroom/AnomalyQueueView.vue');

    expect(source).toContain('Acknowledge');
    expect(source).toContain('Assign');
    expect(source).toContain('Resolve');
    expect(source).toContain('Escalate');
    expect(source).toContain('resolveNote.length < 20');
    expect(source).toContain('Resolution note must be at least 20 characters');
  });

  it('parking supervisor queue includes escalated alert and SLA deadline behavior', () => {
    const source = readView('src/views/parking/SupervisorQueueView.vue');

    expect(source).toContain('Supervisor Queue');
    expect(source).toContain('Escalated');
    expect(source).toContain('SLA Deadline');
    expect(source).toContain('msToSlaDeadline');
  });

  it('after-sales detail includes compensation actions, evidence, and timeline', () => {
    const source = readView('src/views/after-sales/TicketDetailView.vue');

    expect(source).toContain('Compensations');
    expect(source).toContain('approveComp');
    expect(source).toContain('rejectComp');
    expect(source).toContain('Evidence');
    expect(source).toContain('Timeline');
  });

  it('stored value view supports balance, top-up, spend, transactions, and receipt flow', () => {
    const source = readView('src/views/membership/StoredValueView.vue');

    expect(source).toContain('Current Balance');
    expect(source).toContain('Top Up Balance');
    expect(source).toContain('Spend from Balance');
    expect(source).toContain('loadTransactions');
    expect(source).toContain('openReceipt');
    expect(source).toContain('printReceipt');
    expect(source).toContain('receipt-pre');
    expect(source).not.toContain('v-html="receiptContent"');
  });
});
