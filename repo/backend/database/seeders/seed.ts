/**
 * CampusOps — deterministic seed data
 * Run via: ts-node database/seeders/seed.ts
 * Idempotent: uses upsert / skip-if-exists patterns.
 */

// Must be first to set DATABASE_URL
import "../../src/config";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function resolveSeedPassword(
  envName: string,
  testDefault: string,
): string | null {
  const configured = process.env[envName]?.trim();
  if (configured && !configured.startsWith("CHANGE_ME_")) {
    return configured;
  }

  if (process.env.NODE_ENV === "test") {
    return testDefault;
  }

  return null;
}

async function main() {
  console.log("[seed] Starting...");

  // ---- System Settings ----
  const settings: [string, string][] = [
    ["stored_value_enabled", "false"],
    ["stored_value_topup_approval_threshold", "200.00"],
    ["anomaly_escalation_minutes", "30"],
    ["parking_sla_minutes", "15"],
    ["parking_second_escalation_minutes", "30"],
    ["points_per_dollar", "1"],
    ["receipt_prefix", "RCP"],
    ["max_compensation_csa_dollars", "25.00"],
    ["max_compensation_ops_dollars", "100.00"],
  ];

  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log("[seed] System settings: OK");

  // ---- Users (credentials come from environment variables) ----
  const BCRYPT_ROUNDS = 12;
  const users: {
    username: string;
    role: UserRole;
    passwordEnv: string;
    testDefault: string;
  }[] = [
    {
      username: "admin",
      role: "administrator",
      passwordEnv: "SEED_ADMIN_PASSWORD",
      testDefault: "TestAdminPass1!",
    },
    {
      username: "ops_manager",
      role: "operations_manager",
      passwordEnv: "SEED_OPS_MANAGER_PASSWORD",
      testDefault: "TestOpsPass1!",
    },
    {
      username: "supervisor",
      role: "classroom_supervisor",
      passwordEnv: "SEED_SUPERVISOR_PASSWORD",
      testDefault: "TestSupervisorPass1!",
    },
    {
      username: "cs_agent",
      role: "customer_service_agent",
      passwordEnv: "SEED_CS_AGENT_PASSWORD",
      testDefault: "TestCsAgentPass1!",
    },
    {
      username: "auditor",
      role: "auditor",
      passwordEnv: "SEED_AUDITOR_PASSWORD",
      testDefault: "TestAuditorPass1!",
    },
  ];

  for (const u of users) {
    const password = resolveSeedPassword(u.passwordEnv, u.testDefault);
    if (!password) {
      console.warn(
        `[seed] Skipping seeded user '${u.username}' (${u.role}) because ${u.passwordEnv} is not configured`,
      );
      continue;
    }

    const existing = await prisma.user.findUnique({
      where: { username: u.username },
    });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await prisma.user.create({
        data: { username: u.username, passwordHash, role: u.role },
      });
      console.log(`[seed] Created user: ${u.username} (${u.role})`);
      continue;
    }

    if (process.env.NODE_ENV === "test") {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          role: u.role,
          isActive: true,
        },
      });
    }
  }

  // ---- Membership Tiers ----
  const tiers = [
    {
      name: "Standard",
      discountPercent: 0,
      pointThreshold: 0,
      benefits: JSON.stringify(["Basic fulfillment access"]),
    },
    {
      name: "Silver",
      discountPercent: 5,
      pointThreshold: 500,
      benefits: JSON.stringify(["5% discount", "Priority processing"]),
    },
    {
      name: "Gold",
      discountPercent: 10,
      pointThreshold: 2000,
      benefits: JSON.stringify([
        "10% discount",
        "Priority processing",
        "Free standard shipping",
      ]),
    },
    {
      name: "Platinum",
      discountPercent: 15,
      pointThreshold: 5000,
      benefits: JSON.stringify([
        "15% discount",
        "Priority processing",
        "Free express shipping",
        "Dedicated support",
      ]),
    },
  ];

  for (const tier of tiers) {
    await prisma.membershipTier.upsert({
      where: { name: tier.name },
      update: {},
      create: tier,
    });
  }
  console.log("[seed] Membership tiers: OK");

  // ---- Compensation Rules ----
  const compRules = [
    {
      condition: "Delivery 24–48h late",
      ticketType: "delay" as const,
      minDelayHours: 24,
      suggestedAmount: 5.0,
      capAmount: 25.0,
      compensationType: "credit" as const,
    },
    {
      condition: "Delivery >48h late",
      ticketType: "delay" as const,
      minDelayHours: 48,
      suggestedAmount: 10.0,
      capAmount: 50.0,
      compensationType: "credit" as const,
    },
    {
      condition: "Item lost in transit",
      ticketType: "lost_item" as const,
      minDelayHours: null,
      suggestedAmount: 25.0,
      capAmount: 100.0,
      compensationType: "credit" as const,
    },
    {
      condition: "Disputed item condition",
      ticketType: "dispute" as const,
      minDelayHours: null,
      suggestedAmount: 15.0,
      capAmount: 75.0,
      compensationType: "credit" as const,
    },
  ];

  for (const rule of compRules) {
    const existing = await prisma.compensationRule.findFirst({
      where: { condition: rule.condition },
    });
    if (!existing) {
      await prisma.compensationRule.create({ data: rule });
    }
  }
  console.log("[seed] Compensation rules: OK");

  // ---- Alert Thresholds ----
  const thresholds = [
    { metricName: "http_p95_latency_ms", operator: "gt", value: 2000 },
    { metricName: "http_error_rate", operator: "gt", value: 5 },
    { metricName: "cpu_utilization", operator: "gt", value: 85 },
    { metricName: "queue_depth", operator: "gt", value: 100 },
  ];

  for (const t of thresholds) {
    await prisma.alertThreshold.upsert({
      where: { metricName: t.metricName },
      update: {},
      create: t,
    });
  }
  console.log("[seed] Alert thresholds: OK");

  // ---- Demo Department + Course + Semester ----
  const dept = await prisma.department.upsert({
    where: { code: "CS" },
    update: {},
    create: { name: "Computer Science", code: "CS" },
  });

  const semester = await prisma.semester.upsert({
    where: { name: "Fall 2026" },
    update: {},
    create: {
      name: "Fall 2026",
      startDate: new Date("2026-08-25"),
      endDate: new Date("2026-12-15"),
      isActive: true,
    },
  });

  const course = await prisma.course.upsert({
    where: { code: "CS101" },
    update: {},
    create: {
      code: "CS101",
      name: "Introduction to Computer Science",
      departmentId: dept.id,
    },
  });

  await prisma.class.upsert({
    where: {
      courseId_semesterId_roomNumber: {
        courseId: course.id,
        semesterId: semester.id,
        roomNumber: "A101",
      },
    },
    update: {},
    create: {
      name: "CS101 - Section A",
      courseId: course.id,
      departmentId: dept.id,
      semesterId: semester.id,
      roomNumber: "A101",
    },
  });
  console.log("[seed] Demo master data: OK");

  // ---- Demo Warehouse ----
  await prisma.warehouse.upsert({
    where: { name: "Main Campus Warehouse" },
    update: {},
    create: {
      name: "Main Campus Warehouse",
      address: "1 University Drive, Campus, CA 90000",
    },
  });

  // ---- Demo Parking Lot ----
  await prisma.parkingLot.upsert({
    where: { name: "Lot A - Main Campus" },
    update: {},
    create: { name: "Lot A - Main Campus", totalSpaces: 200 },
  });
  console.log("[seed] Demo logistics data: OK");

  // ---- Demo Delivery Zone ----
  const zone = await prisma.deliveryZone.upsert({
    where: { name: "Continental US" },
    update: {},
    create: { name: "Continental US", regionCode: "CONUS" },
  });

  await prisma.shippingFeeTemplate.upsert({
    where: {
      zoneId_tier_name: {
        zoneId: zone.id,
        tier: "standard",
        name: "Standard Continental",
      },
    },
    update: {},
    create: {
      name: "Standard Continental",
      zoneId: zone.id,
      tier: "standard",
      baseFee: 6.95,
      baseWeightLb: 2,
      perLbFee: 1.25,
      surchargeAk: 12.0,
      surchargeHi: 12.0,
    },
  });
  console.log("[seed] Shipping template: OK");

  console.log("[seed] Done.");
}

main()
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
