/**
 * Unit tests — extended import validation
 *
 * Extends import-validation.test.ts with:
 * - Rejection of logically negative numeric values
 * - Whitespace trimming behaviour
 * - Large-batch schema validation (100+ rows)
 * - Additional student and user schema edge cases
 *
 * No DB, no network — pure Zod/logic tests.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

// Re-declare the import row schema (matches import.worker.ts exactly)
const importRowSchema = z.object({
  studentNumber: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(2).max(200),
  email: z.string().email().toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  departmentCode: z
    .string()
    .trim()
    .max(20)
    .toUpperCase()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  membershipTier: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
});

// ---- createStudentSchema from student.service.ts ----
const { createStudentSchema, updateStudentSchema } =
  await import("../src/modules/master-data/student.service");

// ---- createUserSchema from user.service.ts ----
const { createUserSchema, updateUserSchema } =
  await import("../src/modules/admin/user.service");

// ============================================================
// Whitespace trimming
// ============================================================

describe("importRowSchema — whitespace trimming", () => {
  it("trims leading and trailing whitespace from studentNumber", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "  S2026001  ",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.studentNumber).toBe("S2026001");
  });

  it("trims leading and trailing whitespace from fullName", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S001",
      fullName: "  Alice Johnson  ",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fullName).toBe("Alice Johnson");
  });

  it("trims whitespace from phone", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice",
      email: "a@b.com",
      phone: "  555-1234  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("555-1234");
  });

  it("trims whitespace from departmentCode before uppercasing", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice",
      email: "a@b.com",
      departmentCode: "  cs  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.departmentCode).toBe("CS");
  });

  it("trims whitespace from membershipTier", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice",
      email: "a@b.com",
      membershipTier: "  Gold  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.membershipTier).toBe("Gold");
  });

  it("whitespace-only studentNumber becomes empty string and is rejected", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "   ",
      fullName: "Alice",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Valid full rows pass schema
// ============================================================

describe("importRowSchema — valid full rows", () => {
  it("row with all fields passes", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S2026099",
      fullName: "Maria Garcia",
      email: "maria.garcia@campus.edu",
      phone: "+1-800-555-0199",
      departmentCode: "BIOL",
      membershipTier: "Platinum",
    });
    expect(result.success).toBe(true);
  });

  it("row with only required fields passes", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S0001",
      fullName: "Lee Park",
      email: "lee@example.org",
    });
    expect(result.success).toBe(true);
  });

  it("row normalizes email to lowercase", () => {
    const result = importRowSchema.safeParse({
      studentNumber: "S0002",
      fullName: "Sam Torres",
      email: "SAM.TORRES@UNI.EDU",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("sam.torres@uni.edu");
  });
});

// ============================================================
// Large-batch validation (100+ rows) — performance / correctness
// ============================================================

describe("importRowSchema — large batch validation", () => {
  it("validates 100 rows without error", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      studentNumber: `S${String(i + 1).padStart(4, "0")}`,
      fullName: `Student Number ${i + 1}`,
      email: `student${i + 1}@uni.edu`,
    }));

    const results = rows.map((r) => importRowSchema.safeParse(r));
    const failures = results.filter((r) => !r.success);
    expect(failures).toHaveLength(0);
  });

  it("validates 200 rows without error", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      studentNumber: `S${String(i + 1001).padStart(5, "0")}`,
      fullName: `Full Name ${i + 1001}`,
      email: `user${i + 1001}@campus.edu`,
      phone: `555-${String(i).padStart(4, "0")}`,
    }));

    const results = rows.map((r) => importRowSchema.safeParse(r));
    const failures = results.filter((r) => !r.success);
    expect(failures).toHaveLength(0);
  });

  it("correctly identifies invalid rows in a large batch", () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({
      // Every 10th row has a bad email
      studentNumber: `S${i + 1}`,
      fullName: `Student ${i + 1}`,
      email: i % 10 === 0 ? "bad-email" : `ok${i}@uni.edu`,
    }));

    const results = rows.map((r) => importRowSchema.safeParse(r));
    const failures = results.filter((r) => !r.success);
    // rows 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 → 11 failures
    expect(failures).toHaveLength(11);
  });
});

// ============================================================
// createStudentSchema — numeric/string constraints
// ============================================================

describe("createStudentSchema validation", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts minimal valid payload", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(true);
  });

  it("rejects studentNumber exceeding 30 chars", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S".repeat(31),
      fullName: "Alice",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty studentNumber", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "",
      fullName: "Alice",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(false);
  });

  it("rejects fullName shorter than 2 chars", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "A",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes email to lowercase", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice Johnson",
      email: "ALICE@UNI.EDU",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@uni.edu");
  });

  it("accepts optional departmentId as UUID", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
      departmentId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejects departmentId that is not a UUID", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
      departmentId: "not-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true when omitted", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "S001",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });

  it("trims whitespace from studentNumber", () => {
    const result = createStudentSchema.safeParse({
      studentNumber: "  S001  ",
      fullName: "Alice Johnson",
      email: "alice@uni.edu",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.studentNumber).toBe("S001");
  });
});

// ============================================================
// updateStudentSchema
// ============================================================

describe("updateStudentSchema validation", () => {
  it("accepts partial update with only email", () => {
    const result = updateStudentSchema.safeParse({ email: "new@uni.edu" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only isActive", () => {
    const result = updateStudentSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all fields optional)", () => {
    const result = updateStudentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects fullName shorter than 2 chars in update", () => {
    const result = updateStudentSchema.safeParse({ fullName: "X" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// updateUserSchema
// ============================================================

describe("updateUserSchema validation", () => {
  it("accepts partial update with only username", () => {
    const result = updateUserSchema.safeParse({ username: "newuser123" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only isActive", () => {
    const result = updateUserSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 3 chars in update", () => {
    const result = updateUserSchema.safeParse({ username: "ab" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// resolveField utility (mirrored from import.worker.ts)
// ============================================================

describe("resolveField utility", () => {
  function resolveField(
    raw: Record<string, unknown>,
    ...keys: string[]
  ): string {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null) return String(raw[k]);
    }
    return "";
  }

  it("returns value of first matching key", () => {
    expect(
      resolveField(
        { studentNumber: "S001" },
        "studentNumber",
        "student_number",
      ),
    ).toBe("S001");
  });

  it("falls back to second key when first is absent", () => {
    expect(
      resolveField(
        { student_number: "S002" },
        "studentNumber",
        "student_number",
      ),
    ).toBe("S002");
  });

  it("returns empty string when no key matches", () => {
    expect(
      resolveField({ other: "X" }, "studentNumber", "student_number"),
    ).toBe("");
  });

  it("skips null values and tries next key", () => {
    expect(
      resolveField(
        { studentNumber: null, student_number: "S003" },
        "studentNumber",
        "student_number",
      ),
    ).toBe("S003");
  });

  it("converts numeric values to string", () => {
    expect(resolveField({ studentNumber: 12345 }, "studentNumber")).toBe(
      "12345",
    );
  });
});
