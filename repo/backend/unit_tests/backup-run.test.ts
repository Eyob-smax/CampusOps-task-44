import fs from "fs";
import os from "os";
import path from "path";
import * as childProcess from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.DATABASE_URL =
  "mysql://campusops:password@127.0.0.1:3306/campusops";
process.env.BACKUP_PATH = fs.mkdtempSync(path.join(os.tmpdir(), "backup-run-"));

const { prisma } = await import("../src/lib/prisma");
const { runBackup } =
  await import("../src/modules/observability/backup.service");

function mockAllCountQueries() {
  const modelNames = [
    "user",
    "role",
    "permission",
    "auditLog",
    "metricsSnapshot",
    "alertThreshold",
    "alertHistory",
    "backupRecord",
    "jobRecord",
    "parkingAlert",
    "afterSalesTicket",
    "membership",
    "storedValue",
    "shipment",
    "deliveryZone",
    "carrier",
    "warehouse",
    "storageUnit",
    "classroomSession",
  ];

  for (const name of modelNames) {
    const model = (prisma as any)[name];
    if (model?.count) {
      vi.spyOn(model, "count").mockResolvedValue(0);
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runBackup", () => {
  it("fails closed when SQL dump tooling is unavailable and records manifest-only failure", async () => {
    mockAllCountQueries();

    const createdRecord = {
      id: "backup-fail-closed",
      fileName: "",
      filePath: "",
      manifestPath: null,
      sizeBytes: BigInt(0),
      status: "running",
      backupMode: "full_dump",
      dumpStatus: "pending",
      verifyStatus: "pending",
      startedAt: new Date(),
      finishedAt: null,
      errorMsg: null,
      createdAt: new Date(),
    };

    vi.spyOn(prisma.backupRecord, "create").mockResolvedValue(
      createdRecord as any,
    );
    const updateSpy = vi
      .spyOn(prisma.backupRecord, "update")
      .mockResolvedValue({ ...createdRecord, status: "failed" } as any);

    const missingCmdError = Object.assign(new Error("spawn ENOENT"), {
      code: "ENOENT",
    });
    vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
      throw missingCmdError;
    });

    await expect(runBackup()).rejects.toThrow(/SQL dump failed/i);

    expect(updateSpy).toHaveBeenCalledTimes(1);

    const updatePayload = updateSpy.mock.calls[0][0] as any;
    expect(updatePayload.data.status).toBe("failed");
    expect(updatePayload.data.backupMode).toBe("manifest_only");
    expect(updatePayload.data.dumpStatus).toBe("failed");
    expect(updatePayload.data.manifestPath).toMatch(/backup_.*\.json$/);
    expect(updatePayload.data.errorMsg).toMatch(/SQL dump failed/i);

    const manifestPath = updatePayload.data.manifestPath as string;
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.mode).toBe("manifest_only");
    expect(manifest.dumpStatus).toBe("failed");
    expect(manifest.dumpFile).toBeNull();
    expect(typeof manifest.error).toBe("string");

    fs.rmSync(process.env.BACKUP_PATH!, { recursive: true, force: true });
  });
});
