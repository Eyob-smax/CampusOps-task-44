import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { writeAuditEntry } from "../admin/audit.service";
import { logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackupManifest {
  id: string;
  timestamp: string;
  tables: string[];
  rowCounts: Record<string, number>;
  mode: "full_dump" | "manifest_only";
  dumpStatus: "pending" | "succeeded" | "failed";
  dumpFile: string | null;
  error: string | null;
}

type BackupModeValue = "full_dump" | "manifest_only";
type BackupDumpStatusValue = "pending" | "succeeded" | "failed";

const ALL_TABLES = [
  "User",
  "AuditLog",
  "IntegrationKey",
  "Department",
  "Semester",
  "Course",
  "Class",
  "Student",
  "Classroom",
  "AnomalyEvent",
  "AnomalyTimelineEntry",
  "ParkingLot",
  "ParkingSession",
  "ParkingAlert",
  "ParkingAlertTimelineEntry",
  "Warehouse",
  "Carrier",
  "DeliveryZone",
  "DeliveryZoneZip",
  "ShippingFeeTemplate",
  "MembershipTier",
  "Coupon",
  "FulfillmentRequest",
  "FulfillmentItem",
  "StoredValueTransaction",
  "CompensationRule",
  "Shipment",
  "Parcel",
  "AfterSalesTicket",
  "TicketEvidence",
  "TicketTimelineEntry",
  "Compensation",
  "MetricsSnapshot",
  "AlertThreshold",
  "AlertHistory",
  "BackupRecord",
  "JobRecord",
  "SystemSetting",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackupDir(): string {
  return config.backup?.path ?? "./backups";
}

function ensureBackupDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDateForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function collectRowCounts(): Promise<Record<string, number>> {
  return {
    User: await prisma.user.count(),
    AuditLog: await prisma.auditLog.count(),
    IntegrationKey: await prisma.integrationKey.count(),
    Department: await prisma.department.count(),
    Semester: await prisma.semester.count(),
    Course: await prisma.course.count(),
    Class: await prisma.class.count(),
    Student: await prisma.student.count(),
    Classroom: await prisma.classroom.count(),
    AnomalyEvent: await prisma.anomalyEvent.count(),
    AnomalyTimelineEntry: await prisma.anomalyTimelineEntry.count(),
    ParkingLot: await prisma.parkingLot.count(),
    ParkingSession: await prisma.parkingSession.count(),
    ParkingAlert: await prisma.parkingAlert.count(),
    ParkingAlertTimelineEntry: await prisma.parkingAlertTimelineEntry.count(),
    Warehouse: await prisma.warehouse.count(),
    Carrier: await prisma.carrier.count(),
    DeliveryZone: await prisma.deliveryZone.count(),
    DeliveryZoneZip: await prisma.deliveryZoneZip.count(),
    ShippingFeeTemplate: await prisma.shippingFeeTemplate.count(),
    MembershipTier: await prisma.membershipTier.count(),
    Coupon: await prisma.coupon.count(),
    FulfillmentRequest: await prisma.fulfillmentRequest.count(),
    FulfillmentItem: await prisma.fulfillmentItem.count(),
    StoredValueTransaction: await prisma.storedValueTransaction.count(),
    CompensationRule: await prisma.compensationRule.count(),
    Shipment: await prisma.shipment.count(),
    Parcel: await prisma.parcel.count(),
    AfterSalesTicket: await prisma.afterSalesTicket.count(),
    TicketEvidence: await prisma.ticketEvidence.count(),
    TicketTimelineEntry: await prisma.ticketTimelineEntry.count(),
    Compensation: await prisma.compensation.count(),
    MetricsSnapshot: await prisma.metricsSnapshot.count(),
    AlertThreshold: await prisma.alertThreshold.count(),
    AlertHistory: await prisma.alertHistory.count(),
    BackupRecord: await prisma.backupRecord.count(),
    JobRecord: await prisma.jobRecord.count(),
    SystemSetting: await prisma.systemSetting.count(),
  };
}

function buildFallbackRowCounts(value = 0): Record<string, number> {
  return Object.fromEntries(ALL_TABLES.map((table) => [table, value]));
}

// ---------------------------------------------------------------------------
// runBackup
// ---------------------------------------------------------------------------

/**
 * Extracts MySQL connection params from DATABASE_URL.
 * Expected format: mysql://user:password@host:port/dbname
 */
function parseDatabaseUrl(): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  const url = config.database.url;
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    return {
      host: "db",
      port: "3306",
      user: "campusops",
      password: "",
      database: "campusops",
    };
  }
  return {
    user: match[1],
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: match[4],
    database: match[5],
  };
}

function runSqlClient(
  db: ReturnType<typeof parseDatabaseUrl>,
  args: string[],
  options?: { input?: string | Buffer; timeout?: number; maxBuffer?: number },
): Buffer {
  const commands = ["mariadb", "mysql"];
  let lastError: any = null;

  for (const command of commands) {
    try {
      return execFileSync(command, args, {
        env: { ...process.env, MYSQL_PWD: db.password },
        input: options?.input,
        timeout: options?.timeout ?? 300_000,
        maxBuffer: options?.maxBuffer ?? 64 * 1024 * 1024,
      });
    } catch (err: any) {
      lastError = err;
      if (err?.code !== "ENOENT") {
        break;
      }
    }
  }

  throw lastError ?? new Error("No SQL client command available");
}

function shouldRunRestoreSmokeTest(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;

  if ((process.env.NODE_ENV ?? "development") === "test") {
    return false;
  }

  const envSetting = process.env.BACKUP_RESTORE_TEST_ENABLED;
  if (envSetting === undefined) return true;
  return envSetting.toLowerCase() !== "false";
}

function createRestoreValidationDatabaseName(baseDatabase: string): string {
  const safeBase = baseDatabase.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24) || "campusops";
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${safeBase}_restore_verify_${Date.now().toString(36)}_${entropy}`;
}

function runRestoreSmokeTest(dumpPath: string): { passed: boolean; details: string } {
  const db = parseDatabaseUrl();
  const clientArgsBase = [
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
  ];
  const tempDatabase = createRestoreValidationDatabaseName(db.database);
  let databaseCreated = false;

  try {
    runSqlClient(db, [...clientArgsBase, "-e", `CREATE DATABASE \`${tempDatabase}\``]);
    databaseCreated = true;

    const dumpContents = fs.readFileSync(dumpPath);
    runSqlClient(db, [...clientArgsBase, tempDatabase], {
      input: dumpContents,
      maxBuffer: 512 * 1024 * 1024,
      timeout: 600_000,
    });

    const totalTablesRaw = runSqlClient(db, [
      ...clientArgsBase,
      "-Nse",
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${tempDatabase}'`,
    ])
      .toString("utf8")
      .trim();

    const totalTables = Number.parseInt(totalTablesRaw || "0", 10);
    if (!Number.isFinite(totalTables) || totalTables <= 0) {
      return {
        passed: false,
        details: `Restore smoke test imported zero tables into ${tempDatabase}`,
      };
    }

    const keyTablesRaw = runSqlClient(db, [
      ...clientArgsBase,
      "-Nse",
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${tempDatabase}' AND table_name IN ('users','fulfillment_requests','shipments','after_sales_tickets','audit_logs')`,
    ])
      .toString("utf8")
      .trim();

    const keyTables = Number.parseInt(keyTablesRaw || "0", 10);
    return {
      passed: true,
      details: `Restore smoke test passed (tables=${totalTables}, keyTablesFound=${Number.isFinite(keyTables) ? keyTables : 0})`,
    };
  } catch (err: any) {
    return {
      passed: false,
      details: `Restore smoke test failed: ${err?.message ?? "unknown restore error"}`,
    };
  } finally {
    if (databaseCreated) {
      try {
        runSqlClient(db, [...clientArgsBase, "-e", `DROP DATABASE IF EXISTS \`${tempDatabase}\``]);
      } catch (cleanupErr: any) {
        logger.warn({
          msg: "Restore smoke test cleanup failed",
          tempDatabase,
          error: cleanupErr?.message,
        });
      }
    }
  }
}

export async function runBackup(actorId?: string) {
  const backupDir = getBackupDir();
  ensureBackupDir(backupDir);

  const record = await prisma.backupRecord.create({
    data: {
      fileName: "",
      filePath: "",
      sizeBytes: BigInt(0),
      status: "running",
      verifyStatus: "pending",
      backupMode: "full_dump",
      dumpStatus: "pending",
      manifestPath: null,
      startedAt: new Date(),
    } as any,
  });

  let backupMode: BackupModeValue = "full_dump";
  let dumpStatus: BackupDumpStatusValue = "pending";
  let dumpFilename = "";
  let manifestFilename = "";
  let dumpPath = "";
  let manifestPath = "";

  try {
    const now = new Date();
    const dateStr = formatDateForFilename(now);
    dumpFilename = `backup_${dateStr}.sql`;
    manifestFilename = `backup_${dateStr}.json`;
    dumpPath = path.join(backupDir, dumpFilename);
    manifestPath = path.join(backupDir, manifestFilename);

    // Perform full mysqldump without exposing password in process arguments.
    const db = parseDatabaseUrl();
    const dumpArgs = [
      `--host=${db.host}`,
      `--port=${db.port}`,
      `--user=${db.user}`,
      "--single-transaction",
      "--no-tablespaces",
      "--routines",
      "--triggers",
      "--databases",
      db.database,
    ];

    let dumpErrorMessage: string | null = null;

    try {
      const dumpCommands = ["mariadb-dump", "mysqldump"];
      let dumpOutput: Buffer | null = null;
      let lastDumpError: any = null;

      for (const dumpCommand of dumpCommands) {
        try {
          dumpOutput = execFileSync(dumpCommand, dumpArgs, {
            env: { ...process.env, MYSQL_PWD: db.password },
            maxBuffer: 512 * 1024 * 1024,
            timeout: 300_000,
          });
          logger.info({ msg: `${dumpCommand} completed`, path: dumpPath });
          break;
        } catch (err: any) {
          lastDumpError = err;
          if (err?.code !== "ENOENT") {
            break;
          }
        }
      }

      if (!dumpOutput) {
        throw lastDumpError ?? new Error("No SQL dump command available");
      }

      fs.writeFileSync(dumpPath, dumpOutput);
      dumpStatus = "succeeded";
      logger.info({ msg: "SQL dump completed", path: dumpPath });
    } catch (dumpErr: any) {
      backupMode = "manifest_only";
      dumpStatus = "failed";
      dumpErrorMessage = dumpErr?.message ?? "SQL dump command failed";
      logger.error({
        msg: "SQL dump failed; backup will be marked failed",
        error: dumpErrorMessage,
      });
    }

    // Collect row counts for verification manifest. If SQL dump already failed,
    // avoid masking the root cause with secondary DB count errors.
    const rowCounts = dumpErrorMessage
      ? buildFallbackRowCounts(0)
      : await collectRowCounts();

    const manifest: BackupManifest = {
      id: record.id,
      timestamp: now.toISOString(),
      tables: ALL_TABLES,
      rowCounts,
      mode: backupMode,
      dumpStatus,
      dumpFile: dumpStatus === "succeeded" ? dumpFilename : null,
      error: dumpErrorMessage,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    if (dumpErrorMessage) {
      throw new Error(`SQL dump failed: ${dumpErrorMessage}`);
    }

    const dumpStats = fs.statSync(dumpPath);

    const updated = await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        fileName: dumpFilename,
        filePath: dumpPath,
        manifestPath,
        sizeBytes: BigInt(dumpStats.size),
        status: "completed",
        backupMode,
        dumpStatus,
        finishedAt: new Date(),
        errorMsg: null,
      },
    });

    if (actorId) {
      await writeAuditEntry(actorId, "RUN_BACKUP", "BackupRecord", record.id, {
        dumpFile: dumpFilename,
        manifestFile: manifestFilename,
        sizeBytes: dumpStats.size,
      });
    }

    logger.info({
      msg: "Backup completed",
      id: record.id,
      dumpFile: dumpFilename,
      manifestFile: manifestFilename,
    });
    return updated;
  } catch (e: any) {
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        fileName: dumpFilename || "",
        filePath: dumpPath || "",
        manifestPath: manifestPath || null,
        sizeBytes:
          dumpPath && fs.existsSync(dumpPath)
            ? BigInt(fs.statSync(dumpPath).size)
            : BigInt(0),
        status: "failed",
        backupMode,
        dumpStatus: dumpStatus === "pending" ? "failed" : dumpStatus,
        finishedAt: new Date(),
        errorMsg: e?.message ?? "Unknown error",
      } as any,
    });
    logger.error({ msg: "Backup failed", id: record.id, error: e?.message });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// verifyBackup
// ---------------------------------------------------------------------------

export async function verifyBackup(
  backupId: string,
  options?: { runRestoreTest?: boolean },
): Promise<{ passed: boolean; details: string }> {
  const record = await prisma.backupRecord.findUnique({
    where: { id: backupId },
  });
  if (!record) {
    const err: any = new Error("Backup record not found");
    err.status = 404;
    err.code = "BACKUP_NOT_FOUND";
    throw err;
  }

  let passed = false;
  let details = "";

  try {
    if (record.status !== "completed") {
      details = `Backup status is '${record.status}', not 'completed'`;
    } else if ((record as any).backupMode !== "full_dump") {
      details = `Backup mode is '${(record as any).backupMode}', expected 'full_dump'`;
    } else if ((record as any).dumpStatus !== "succeeded") {
      details = `Dump status is '${(record as any).dumpStatus}', expected 'succeeded'`;
    }

    if (details) {
      passed = false;
    } else {
      // Check the SQL dump file exists
      if (!fs.existsSync(record.filePath)) {
        details = `Dump file not found at path: ${record.filePath}`;
      } else {
        const dumpStats = fs.statSync(record.filePath);
        const dumpSizeOk = dumpStats.size > 0;

        // Check the manifest file exists (prefer persisted manifestPath).
        const persistedManifestPath = (record as any).manifestPath as
          | string
          | null
          | undefined;
        const manifestPath =
          persistedManifestPath && persistedManifestPath.trim().length > 0
            ? persistedManifestPath
            : record.filePath.replace(/\.sql$/, ".json");
        let manifestOk = false;
        let manifestDetails = "";

        if (fs.existsSync(manifestPath)) {
          const raw = fs.readFileSync(manifestPath, "utf8");
          const manifest = JSON.parse(raw) as BackupManifest;

          const requiredKeys: (keyof BackupManifest)[] = [
            "id",
            "timestamp",
            "tables",
            "rowCounts",
            "mode",
            "dumpStatus",
            "dumpFile",
            "error",
          ];
          const missing = requiredKeys.filter((k) => !(k in manifest));

          if (missing.length > 0) {
            manifestDetails = `Manifest missing keys: ${missing.join(", ")}`;
          } else if (
            !Array.isArray(manifest.tables) ||
            manifest.tables.length === 0
          ) {
            manifestDetails = "Manifest tables array is empty or invalid";
          } else if (
            !manifest.rowCounts ||
            typeof manifest.rowCounts !== "object" ||
            Array.isArray(manifest.rowCounts)
          ) {
            manifestDetails = "Manifest rowCounts is not an object";
          } else if (manifest.mode !== "full_dump") {
            manifestDetails = `Manifest backup mode is '${manifest.mode}', expected 'full_dump'`;
          } else if (manifest.dumpStatus !== "succeeded") {
            manifestDetails = `Manifest dumpStatus is '${manifest.dumpStatus}', expected 'succeeded'`;
          } else if (!manifest.dumpFile) {
            manifestDetails = "Manifest does not include a dump file reference";
          } else {
            const unknownTables = manifest.tables.filter(
              (table) => !ALL_TABLES.includes(table),
            );
            const rowCountKeys = Object.keys(manifest.rowCounts);
            const invalidRowCountKeys = rowCountKeys.filter((key) => {
              const value = manifest.rowCounts[key];
              return typeof value !== "number" || !Number.isFinite(value) || value < 0;
            });

            if (rowCountKeys.length === 0) {
              manifestDetails = "Manifest rowCounts is empty";
            } else if (invalidRowCountKeys.length > 0) {
              manifestDetails = `Manifest rowCounts contains invalid numeric values for: ${invalidRowCountKeys.join(", ")}`;
            } else {
              manifestOk = true;
              manifestDetails = `Tables: ${manifest.tables.length}. BackupId: ${manifest.id}`;
              if (unknownTables.length > 0) {
                manifestDetails = `${manifestDetails}. Compatibility mode: includes unknown tables (${unknownTables.join(", ")})`;
              }
            }
          }
        } else {
          // Keep backward compatibility with legacy dump-only backups.
          manifestOk = true;
          manifestDetails = "Manifest file not found (legacy backup format accepted)";
        }

        if (dumpSizeOk && manifestOk) {
          passed = true;
          details = `Dump file valid (${dumpStats.size} bytes). ${manifestDetails}`;

          if (shouldRunRestoreSmokeTest(options?.runRestoreTest)) {
            const restoreSmoke = runRestoreSmokeTest(record.filePath);
            if (!restoreSmoke.passed) {
              passed = false;
              details = `${details} ${restoreSmoke.details}`;
            } else {
              details = `${details} ${restoreSmoke.details}`;
            }
          }
        } else {
          details = `Dump: ${dumpSizeOk ? "OK" : "empty/missing"}. Manifest: ${manifestDetails}`;
        }
      }
    }
  } catch (e: any) {
    details = `Verification error: ${e?.message ?? "Unknown"}`;
  }

  await prisma.backupRecord.update({
    where: { id: backupId },
    data: { verifyStatus: passed ? "passed" : "failed" },
  });

  logger.info({
    msg: "Backup verification done",
    id: backupId,
    passed,
    details,
  });
  return { passed, details };
}

// ---------------------------------------------------------------------------
// listBackups / getBackupById
// ---------------------------------------------------------------------------

export async function listBackups(params: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { status, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.backupRecord.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.backupRecord.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getBackupById(id: string) {
  const record = await prisma.backupRecord.findUnique({ where: { id } });
  if (!record) {
    const err: any = new Error("Backup record not found");
    err.status = 404;
    err.code = "BACKUP_NOT_FOUND";
    throw err;
  }
  return record;
}

// ---------------------------------------------------------------------------
// enforceRetention
// ---------------------------------------------------------------------------

export async function enforceRetention(
  retentionDays?: number,
): Promise<{ deleted: number }> {
  const days = retentionDays ?? config.backup?.retentionDays ?? 14;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const old = await prisma.backupRecord.findMany({
    where: { startedAt: { lt: cutoff } },
  });

  let deleted = 0;
  for (const rec of old) {
    // Delete dump file from disk if it exists
    if (rec.filePath && fs.existsSync(rec.filePath)) {
      try {
        fs.unlinkSync(rec.filePath);
      } catch (e) {
        logger.warn({
          msg: "Could not delete backup dump file",
          filePath: rec.filePath,
          error: (e as Error).message,
        });
      }
    }
    // Delete manifest file (.json companion) if it exists
    const manifestPath =
      (rec as any).manifestPath &&
      String((rec as any).manifestPath).trim().length > 0
        ? String((rec as any).manifestPath)
        : rec.filePath?.replace(/\.sql$/, ".json");
    if (manifestPath && fs.existsSync(manifestPath)) {
      try {
        fs.unlinkSync(manifestPath);
      } catch (e) {
        logger.warn({
          msg: "Could not delete backup manifest",
          filePath: manifestPath,
          error: (e as Error).message,
        });
      }
    }

    await prisma.backupRecord.delete({ where: { id: rec.id } });
    deleted++;
  }

  logger.info({
    msg: "Backup retention enforced",
    deleted,
    retentionDays: days,
  });
  return { deleted };
}
