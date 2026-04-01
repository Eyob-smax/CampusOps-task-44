import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { config } from '../../config';
import { logger } from '../../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: any;
}

export interface SearchLogsParams {
  service?: string;
  severity?: string;
  correlationId?: string;
  actor?: string;
  domain?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Retention helpers
// ---------------------------------------------------------------------------

export function getLogRetentionCutoff(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Internal: enumerate log files within retention window
// ---------------------------------------------------------------------------

function getLogFilesInRange(fromDate?: Date, toDate?: Date): string[] {
  const logsPath = config.logs.path;
  if (!fs.existsSync(logsPath)) return [];

  const cutoff = getLogRetentionCutoff();
  const files = fs.readdirSync(logsPath).filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f));

  return files
    .filter((f) => {
      const fileDate = new Date(f.replace('.log', ''));
      if (isNaN(fileDate.getTime())) return false;
      if (fileDate < cutoff) return false;
      if (fromDate && fileDate < new Date(fromDate.toDateString())) return false;
      if (toDate && fileDate > new Date(toDate.toDateString())) return false;
      return true;
    })
    .sort()
    .map((f) => path.join(logsPath, f));
}

// ---------------------------------------------------------------------------
// Internal: read and parse a single log file
// ---------------------------------------------------------------------------

async function parseLogFile(filePath: string): Promise<LogEntry[]> {
  return new Promise((resolve) => {
    const entries: LogEntry[] = [];
    if (!fs.existsSync(filePath)) {
      resolve(entries);
      return;
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        entries.push(parsed as LogEntry);
      } catch {
        // skip malformed lines
      }
    });

    rl.on('close', () => resolve(entries));
    rl.on('error', () => resolve(entries));
  });
}

// ---------------------------------------------------------------------------
// searchLogs
// ---------------------------------------------------------------------------

export async function searchLogs(params: SearchLogsParams) {
  const {
    service,
    severity,
    correlationId,
    actor,
    domain,
    from,
    to,
    search,
    page = 1,
    limit = 50,
  } = params;

  const fromDate = from ? new Date(from) : undefined;
  const toDate   = to   ? new Date(to)   : undefined;

  const files = getLogFilesInRange(fromDate, toDate);

  let allEntries: LogEntry[] = [];
  for (const file of files) {
    const entries = await parseLogFile(file);
    allEntries = allEntries.concat(entries);
  }

  // Apply filters
  const filtered = allEntries.filter((entry) => {
    // severity / level
    if (severity && entry.level?.toLowerCase() !== severity.toLowerCase()) return false;

    // correlationId
    if (correlationId && entry.correlationId !== correlationId) return false;

    // actor
    if (actor && entry.actor !== actor && entry['req.user.id'] !== actor) return false;

    // domain
    if (domain && entry.domain !== domain) return false;

    // service
    if (service && entry.service !== service) return false;

    // time range
    if (fromDate || toDate) {
      const ts = entry.timestamp ? new Date(entry.timestamp) : null;
      if (ts && !isNaN(ts.getTime())) {
        if (fromDate && ts < fromDate) return false;
        if (toDate   && ts > toDate)   return false;
      }
    }

    // full-text search in message
    if (search) {
      const haystack = (entry.message ?? '').toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }

    return true;
  });

  // Sort descending by timestamp
  filtered.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  const total = filtered.length;
  const skip  = (page - 1) * limit;
  const items = filtered.slice(skip, skip + limit);

  return { items, total, page, limit };
}

// ---------------------------------------------------------------------------
// cleanOldLogs
// ---------------------------------------------------------------------------

export async function cleanOldLogs(): Promise<number> {
  const logsPath = config.logs.path;
  if (!fs.existsSync(logsPath)) return 0;

  const cutoff = getLogRetentionCutoff();
  const files = fs.readdirSync(logsPath).filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f));

  let deleted = 0;
  for (const f of files) {
    const fileDate = new Date(f.replace('.log', ''));
    if (!isNaN(fileDate.getTime()) && fileDate < cutoff) {
      try {
        fs.unlinkSync(path.join(logsPath, f));
        deleted++;
        logger.info({ msg: 'Deleted old log file', file: f });
      } catch (e) {
        logger.warn({ msg: 'Failed to delete log file', file: f, error: (e as Error).message });
      }
    }
  }

  return deleted;
}
