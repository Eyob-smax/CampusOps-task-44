/**
 * Unit tests — Prompt 9: observability, metrics, logs, backup, retention
 *
 * Tests pure functions without database.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';
// Prevent real file I/O for log.service
process.env.LOG_PATH       = '/tmp/campusops-test-logs';

const { getLogRetentionCutoff } = await import('../src/modules/observability/log.service');

// ---- evaluateOperator (pure logic — inline since not exported) ----

function evaluateOperator(current: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>':  return current > threshold;
    case '<':  return current < threshold;
    case '>=': return current >= threshold;
    case '<=': return current <= threshold;
    case '==': return current === threshold;
    default:   return false;
  }
}

describe('evaluateOperator', () => {
  it('>: triggers when current > threshold', () => {
    expect(evaluateOperator(90, '>', 80)).toBe(true);
    expect(evaluateOperator(80, '>', 80)).toBe(false);
    expect(evaluateOperator(70, '>', 80)).toBe(false);
  });

  it('<: triggers when current < threshold', () => {
    expect(evaluateOperator(10, '<', 20)).toBe(true);
    expect(evaluateOperator(20, '<', 20)).toBe(false);
    expect(evaluateOperator(30, '<', 20)).toBe(false);
  });

  it('>=: triggers when current >= threshold', () => {
    expect(evaluateOperator(80, '>=', 80)).toBe(true);
    expect(evaluateOperator(81, '>=', 80)).toBe(true);
    expect(evaluateOperator(79, '>=', 80)).toBe(false);
  });

  it('<=: triggers when current <= threshold', () => {
    expect(evaluateOperator(20, '<=', 20)).toBe(true);
    expect(evaluateOperator(19, '<=', 20)).toBe(true);
    expect(evaluateOperator(21, '<=', 20)).toBe(false);
  });

  it('==: triggers only on exact match', () => {
    expect(evaluateOperator(42, '==', 42)).toBe(true);
    expect(evaluateOperator(42.0, '==', 42)).toBe(true);
    expect(evaluateOperator(42.1, '==', 42)).toBe(false);
  });

  it('unknown operator: never triggers', () => {
    expect(evaluateOperator(100, '!=', 50)).toBe(false);
    expect(evaluateOperator(100, '~', 50)).toBe(false);
  });
});

// ---- getLogRetentionCutoff ----

describe('getLogRetentionCutoff', () => {
  it('returns a Date object', () => {
    const cutoff = getLogRetentionCutoff();
    expect(cutoff).toBeInstanceOf(Date);
    expect(isNaN(cutoff.getTime())).toBe(false);
  });

  it('is approximately 30 days ago', () => {
    const cutoff = getLogRetentionCutoff();
    const now    = new Date();
    const diffMs = now.getTime() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Allow ±1 day for midnight normalization
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it('has its time components zeroed out (midnight)', () => {
    const cutoff = getLogRetentionCutoff();
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
    expect(cutoff.getSeconds()).toBe(0);
    expect(cutoff.getMilliseconds()).toBe(0);
  });

  it('is in the past', () => {
    const cutoff = getLogRetentionCutoff();
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });
});

// ---- Log retention cutoff enforcement (pure date math) ----

describe('log file retention enforcement', () => {
  function isFileOutsideRetention(fileName: string, retentionDays: number): boolean {
    const fileDate = new Date(fileName.replace('.log', ''));
    if (isNaN(fileDate.getTime())) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    cutoff.setHours(0, 0, 0, 0);
    return fileDate < cutoff;
  }

  it('marks files older than 30 days for deletion', () => {
    const d = new Date();
    d.setDate(d.getDate() - 31);
    const filename = `${d.toISOString().slice(0, 10)}.log`;
    expect(isFileOutsideRetention(filename, 30)).toBe(true);
  });

  it('does not mark files 29 days old for deletion', () => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const filename = `${d.toISOString().slice(0, 10)}.log`;
    expect(isFileOutsideRetention(filename, 30)).toBe(false);
  });

  it('does not mark today\'s file for deletion', () => {
    const filename = `${new Date().toISOString().slice(0, 10)}.log`;
    expect(isFileOutsideRetention(filename, 30)).toBe(false);
  });

  it('skips malformed file names', () => {
    expect(isFileOutsideRetention('not-a-date.log', 30)).toBe(false);
    expect(isFileOutsideRetention('app.log', 30)).toBe(false);
  });
});

// ---- Backup retention enforcement (pure date math) ----

describe('backup retention enforcement', () => {
  function isBackupOutsideRetention(startedAt: Date, retentionDays: number): boolean {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return startedAt < cutoff;
  }

  it('flags backups older than 14 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    expect(isBackupOutsideRetention(old, 14)).toBe(true);
  });

  it('does not flag backups from 13 days ago', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 13);
    expect(isBackupOutsideRetention(recent, 14)).toBe(false);
  });

  it('does not flag today\'s backup', () => {
    expect(isBackupOutsideRetention(new Date(), 14)).toBe(false);
  });
});

// ---- Backup manifest validation (pure JSON structure checks) ----

describe('backup manifest validation', () => {
  const validManifest = {
    id:         'backup-uuid-123',
    timestamp:  new Date().toISOString(),
    tables:     ['User', 'Role', 'Shipment'],
    rowCounts:  { User: 10, Role: 3, Shipment: 50 },
  };

  function validateManifest(manifest: unknown): { passed: boolean; details: string } {
    const required = ['id', 'timestamp', 'tables', 'rowCounts'];
    if (typeof manifest !== 'object' || manifest === null) {
      return { passed: false, details: 'Not an object' };
    }
    const m = manifest as Record<string, unknown>;
    const missing = required.filter(k => !(k in m));
    if (missing.length > 0) {
      return { passed: false, details: `Missing keys: ${missing.join(', ')}` };
    }
    if (!Array.isArray(m['tables']) || (m['tables'] as unknown[]).length === 0) {
      return { passed: false, details: 'Tables array is empty or invalid' };
    }
    if (typeof m['rowCounts'] !== 'object' || Array.isArray(m['rowCounts'])) {
      return { passed: false, details: 'rowCounts is not an object' };
    }
    return { passed: true, details: `Manifest valid. Tables: ${(m['tables'] as unknown[]).length}` };
  }

  it('passes for a valid manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.passed).toBe(true);
  });

  it('fails when id is missing', () => {
    const { id: _, ...noId } = validManifest;
    const result = validateManifest(noId);
    expect(result.passed).toBe(false);
    expect(result.details).toContain('id');
  });

  it('fails when tables array is empty', () => {
    const result = validateManifest({ ...validManifest, tables: [] });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('empty');
  });

  it('fails when rowCounts is an array instead of object', () => {
    const result = validateManifest({ ...validManifest, rowCounts: [] });
    expect(result.passed).toBe(false);
  });

  it('fails when rowCounts is a string', () => {
    const result = validateManifest({ ...validManifest, rowCounts: 'invalid' });
    expect(result.passed).toBe(false);
  });

  it('fails when manifest is null', () => {
    const result = validateManifest(null);
    expect(result.passed).toBe(false);
  });

  it('fails when manifest is a primitive', () => {
    expect(validateManifest('string').passed).toBe(false);
    expect(validateManifest(42).passed).toBe(false);
  });

  it('includes table count in details when passing', () => {
    const result = validateManifest(validManifest);
    expect(result.details).toContain('3'); // 3 tables
  });
});

// ---- Log search filter logic (pure) ----

describe('log search filter logic', () => {
  interface LogEntry {
    level:         string;
    message:       string;
    timestamp:     string;
    service?:      string;
    correlationId?: string;
    actor?:        string;
    domain?:       string;
  }

  function filterEntries(entries: LogEntry[], params: {
    severity?:       string;
    service?:        string;
    correlationId?:  string;
    actor?:          string;
    domain?:         string;
    search?:         string;
    fromDate?:       Date;
    toDate?:         Date;
  }): LogEntry[] {
    return entries.filter(entry => {
      if (params.severity && entry.level?.toLowerCase() !== params.severity.toLowerCase()) return false;
      if (params.service && entry.service !== params.service) return false;
      if (params.correlationId && entry.correlationId !== params.correlationId) return false;
      if (params.actor && entry.actor !== params.actor) return false;
      if (params.domain && entry.domain !== params.domain) return false;
      if (params.search) {
        if (!entry.message.toLowerCase().includes(params.search.toLowerCase())) return false;
      }
      if (params.fromDate || params.toDate) {
        const ts = new Date(entry.timestamp);
        if (params.fromDate && ts < params.fromDate) return false;
        if (params.toDate   && ts > params.toDate)   return false;
      }
      return true;
    });
  }

  const entries: LogEntry[] = [
    { level: 'error', message: 'Database connection failed', timestamp: '2024-06-01T10:00:00Z', service: 'api',     correlationId: 'corr-1', actor: 'user-1',   domain: 'auth'    },
    { level: 'warn',  message: 'Slow query detected',        timestamp: '2024-06-01T11:00:00Z', service: 'api',     correlationId: 'corr-2', actor: 'system',   domain: 'parking' },
    { level: 'info',  message: 'User logged in',             timestamp: '2024-06-01T12:00:00Z', service: 'auth',    correlationId: 'corr-3', actor: 'user-2',   domain: 'auth'    },
    { level: 'debug', message: 'Cache hit',                  timestamp: '2024-06-01T13:00:00Z', service: 'api',                              actor: 'system',   domain: 'cache'   },
  ];

  it('filters by severity (case-insensitive)', () => {
    const result = filterEntries(entries, { severity: 'error' });
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe('Database connection failed');
  });

  it('filters by service', () => {
    const result = filterEntries(entries, { service: 'auth' });
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe('info');
  });

  it('filters by correlationId', () => {
    const result = filterEntries(entries, { correlationId: 'corr-2' });
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain('Slow');
  });

  it('filters by actor', () => {
    const result = filterEntries(entries, { actor: 'user-1' });
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe('error');
  });

  it('filters by domain', () => {
    const result = filterEntries(entries, { domain: 'auth' });
    expect(result).toHaveLength(2);
  });

  it('filters by full-text search (case-insensitive)', () => {
    const result = filterEntries(entries, { search: 'database' });
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe('error');
  });

  it('full-text search with no match returns empty', () => {
    const result = filterEntries(entries, { search: 'kubernetes' });
    expect(result).toHaveLength(0);
  });

  it('filters by fromDate', () => {
    const from = new Date('2024-06-01T11:30:00Z');
    const result = filterEntries(entries, { fromDate: from });
    expect(result).toHaveLength(2); // 12:00 and 13:00
  });

  it('filters by toDate', () => {
    const to = new Date('2024-06-01T11:00:00Z');
    const result = filterEntries(entries, { toDate: to });
    expect(result).toHaveLength(2); // 10:00 and 11:00
  });

  it('filters by time range', () => {
    const from = new Date('2024-06-01T10:30:00Z');
    const to   = new Date('2024-06-01T12:30:00Z');
    const result = filterEntries(entries, { fromDate: from, toDate: to });
    expect(result).toHaveLength(2); // 11:00 and 12:00
  });

  it('no filters returns all entries', () => {
    expect(filterEntries(entries, {})).toHaveLength(entries.length);
  });

  it('combined severity + domain filters', () => {
    const result = filterEntries(entries, { severity: 'warn', domain: 'parking' });
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain('Slow');
  });
});

// ---- Metric name formatting (pure) ----

describe('metric name formatting', () => {
  function formatMetricName(n: string): string {
    return n.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  it('converts underscores to spaces and title-cases', () => {
    expect(formatMetricName('cpu_utilization_percent')).toBe('Cpu Utilization Percent');
    expect(formatMetricName('memory_used_mb')).toBe('Memory Used Mb');
    expect(formatMetricName('active_jobs')).toBe('Active Jobs');
    expect(formatMetricName('open_parking_alerts')).toBe('Open Parking Alerts');
  });

  it('handles single-word names', () => {
    expect(formatMetricName('cpu')).toBe('Cpu');
  });

  it('handles already-capitalized names', () => {
    expect(formatMetricName('CPU')).toBe('CPU');
  });
});
