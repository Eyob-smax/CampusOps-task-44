/**
 * Unit tests — Prompt 8: shipment, after-sales, evidence dedup, compensation
 *
 * Tests pure functions and Zod schemas without database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

const { simulateCarrierResponse } =
  await import("../src/modules/shipment/carrier-sync.service");

const { hammingDistance } =
  await import("../src/modules/after-sales/evidence.service");

const { createTicketSchema, updateTicketStatusSchema, computeSlaStatus } =
  await import("../src/modules/after-sales/after-sales.service");

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

// ---- simulateCarrierResponse ----

describe("simulateCarrierResponse — age-based status rules", () => {
  function makeParcels(
    count: number,
    ageHours: number,
    currentStatus = "pending",
  ) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => ({
      id: `parcel-${i}`,
      createdAt: new Date(now.getTime() - ageHours * 3600_000),
      status: currentStatus,
    }));
  }

  it("returns no updates when parcel status would not change", () => {
    const parcels = makeParcels(1, 0.5, "pending"); // < 1h, status = pending
    const now = new Date();
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(0);
  });

  it("transitions pending → in_transit after 1h", () => {
    const parcels = makeParcels(1, 1.5, "pending");
    const now = new Date();
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.newStatus).toBe("in_transit");
    expect(updates[0]!.parcelId).toBe("parcel-0");
  });

  it("transitions pending → out_for_delivery after 6h", () => {
    const parcels = makeParcels(1, 7, "pending");
    const now = new Date();
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.newStatus).toBe("out_for_delivery");
  });

  it("transitions pending → delivered after 24h", () => {
    const parcels = makeParcels(1, 25, "pending");
    const now = new Date();
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.newStatus).toBe("delivered");
  });

  it("does not re-update a parcel already in the correct status", () => {
    const parcels = makeParcels(1, 25, "delivered");
    const now = new Date();
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(0);
  });

  it("handles multiple parcels at different ages", () => {
    const now = new Date();
    const parcels = [
      {
        id: "p1",
        createdAt: new Date(now.getTime() - 0.5 * 3600_000),
        status: "pending",
      },
      {
        id: "p2",
        createdAt: new Date(now.getTime() - 2 * 3600_000),
        status: "pending",
      },
      {
        id: "p3",
        createdAt: new Date(now.getTime() - 25 * 3600_000),
        status: "pending",
      },
    ];
    const updates = simulateCarrierResponse(parcels, now);
    expect(updates).toHaveLength(2); // p1 stays pending; p2 → in_transit; p3 → delivered
    const statuses = updates.map((u) => u.newStatus).sort();
    expect(statuses).toEqual(["delivered", "in_transit"]);
  });

  it("in_transit update includes 1 tracking event", () => {
    const parcels = makeParcels(1, 2, "pending");
    const updates = simulateCarrierResponse(parcels, new Date());
    expect(updates[0]!.trackingEvents).toHaveLength(1);
    expect(updates[0]!.trackingEvents[0]!.description).toContain("warehouse");
  });

  it("out_for_delivery update includes 2 tracking events", () => {
    const parcels = makeParcels(1, 7, "pending");
    const updates = simulateCarrierResponse(parcels, new Date());
    expect(updates[0]!.trackingEvents).toHaveLength(2);
  });

  it("delivered update includes 3 tracking events", () => {
    const parcels = makeParcels(1, 25, "pending");
    const updates = simulateCarrierResponse(parcels, new Date());
    expect(updates[0]!.trackingEvents).toHaveLength(3);
    expect(updates[0]!.trackingEvents[2]!.description).toContain("Delivered");
  });

  it("returns empty array for empty input", () => {
    const updates = simulateCarrierResponse([], new Date());
    expect(updates).toHaveLength(0);
  });
});

// ---- hammingDistance ----

describe("hammingDistance — perceptual hash dedup", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
  });

  it("returns 0 for another pair of identical hashes", () => {
    expect(hammingDistance("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
  });

  it("returns 64 for fully inverted hashes", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("counts single bit differences", () => {
    // '0' vs '1' in hex = 0000 vs 0001 = 1 bit difference
    const h1 = "0" + "0".repeat(15);
    const h2 = "1" + "0".repeat(15);
    expect(hammingDistance(h1, h2)).toBe(1);
  });

  it("returns Infinity for different-length hashes", () => {
    expect(hammingDistance("abc", "ab")).toBe(Infinity);
  });

  it("identifies near-duplicate: distance ≤ 5 should be flagged", () => {
    // Two hashes with 3 bits different
    const h1 = "0000000000000000"; // all 0 bits
    const h2 = "7000000000000000"; // '7' = 0111, so 3 bits different from '0' = 0000
    const dist = hammingDistance(h1, h2);
    expect(dist).toBe(3);
    expect(dist).toBeLessThanOrEqual(5); // within dedup threshold
  });

  it("identifies non-duplicate: distance > 5", () => {
    const h1 = "0000000000000000";
    const h2 = "ff00000000000000"; // 'f' = 1111, 'f' = 1111 → 8 bits diff
    const dist = hammingDistance(h1, h2);
    expect(dist).toBeGreaterThan(5);
  });
});

// ---- createTicketSchema ----

describe("createTicketSchema", () => {
  const base = {
    studentId: validUuid,
    type: "delay",
    description: "Package was late",
  };

  it("accepts valid delay ticket", () => {
    const result = createTicketSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts all valid ticket types", () => {
    for (const type of ["delay", "dispute", "lost_item"]) {
      const result = createTicketSchema.safeParse({ ...base, type });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional shipmentId and parcelId", () => {
    const result = createTicketSchema.safeParse({
      ...base,
      shipmentId: validUuid,
      parcelId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID studentId", () => {
    const result = createTicketSchema.safeParse({
      ...base,
      studentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ticket type", () => {
    const result = createTicketSchema.safeParse({ ...base, type: "scam" });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createTicketSchema.safeParse({ ...base, description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID shipmentId", () => {
    const result = createTicketSchema.safeParse({
      ...base,
      shipmentId: "bad-id",
    });
    expect(result.success).toBe(false);
  });
});

// ---- updateTicketStatusSchema ----

describe("updateTicketStatusSchema", () => {
  it("accepts all valid statuses", () => {
    const statuses = [
      "open",
      "under_review",
      "pending_approval",
      "resolved",
      "closed",
    ];
    for (const status of statuses) {
      const result = updateTicketStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional note", () => {
    const result = updateTicketStatusSchema.safeParse({
      status: "closed",
      note: "Issue resolved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateTicketStatusSchema.safeParse({ status: "cancelled" });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const result = updateTicketStatusSchema.safeParse({ note: "test" });
    expect(result.success).toBe(false);
  });
});

// ---- computeSlaStatus ----

describe("computeSlaStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "closed" when status is "resolved"', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 10 * 3600_000),
      resolvedAt: new Date(),
      status: "resolved",
    };
    expect(computeSlaStatus(ticket)).toBe("closed");
  });

  it('returns "closed" when status is "closed"', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 10 * 3600_000),
      resolvedAt: null,
      status: "closed",
    };
    expect(computeSlaStatus(ticket)).toBe("closed");
  });

  it('returns "within_sla" when 10 hours remaining', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 10 * 3600_000),
      resolvedAt: null,
      status: "open",
    };
    expect(computeSlaStatus(ticket)).toBe("within_sla");
  });

  it('returns "at_risk" when 3 hours remaining (< 4h threshold)', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 3 * 3600_000),
      resolvedAt: null,
      status: "open",
    };
    expect(computeSlaStatus(ticket)).toBe("at_risk");
  });

  it('returns "at_risk" when exactly 4h - 1ms remaining', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 4 * 3600_000 - 1),
      resolvedAt: null,
      status: "under_review",
    };
    expect(computeSlaStatus(ticket)).toBe("at_risk");
  });

  it('returns "within_sla" when exactly 4h remaining', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() + 4 * 3600_000),
      resolvedAt: null,
      status: "open",
    };
    expect(computeSlaStatus(ticket)).toBe("within_sla");
  });

  it('returns "breached" when deadline is in the past', () => {
    const ticket = {
      slaDeadlineAt: new Date(Date.now() - 1000),
      resolvedAt: null,
      status: "open",
    };
    expect(computeSlaStatus(ticket)).toBe("breached");
  });
});

// ---- Ticket SLA deadline arithmetic ----

describe("Ticket SLA deadline calculation", () => {
  it("delay SLA: 72 hours", () => {
    const SLA_HOURS: Record<string, number> = {
      delay: 72,
      dispute: 48,
      lost_item: 96,
    };
    const now = new Date("2024-01-01T12:00:00Z");
    const deadline = new Date(now.getTime() + SLA_HOURS["delay"]! * 3600_000);
    expect(deadline.toISOString()).toBe("2024-01-04T12:00:00.000Z");
  });

  it("dispute SLA: 48 hours", () => {
    const SLA_HOURS: Record<string, number> = {
      delay: 72,
      dispute: 48,
      lost_item: 96,
    };
    const now = new Date("2024-01-01T12:00:00Z");
    const deadline = new Date(now.getTime() + SLA_HOURS["dispute"]! * 3600_000);
    expect(deadline.toISOString()).toBe("2024-01-03T12:00:00.000Z");
  });

  it("lost_item SLA: 96 hours", () => {
    const SLA_HOURS: Record<string, number> = {
      delay: 72,
      dispute: 48,
      lost_item: 96,
    };
    const now = new Date("2024-01-01T12:00:00Z");
    const deadline = new Date(
      now.getTime() + SLA_HOURS["lost_item"]! * 3600_000,
    );
    expect(deadline.toISOString()).toBe("2024-01-05T12:00:00.000Z");
  });
});

// ---- Ticket status transitions (pure logic) ----

describe("ticket status state machine", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    open: ["under_review", "closed"],
    under_review: ["pending_approval", "closed"],
    pending_approval: ["resolved", "closed"],
    resolved: ["closed"],
    closed: [],
  };

  function canTransition(from: string, to: string) {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  it("open → under_review: valid", () =>
    expect(canTransition("open", "under_review")).toBe(true));
  it("open → closed: valid", () =>
    expect(canTransition("open", "closed")).toBe(true));
  it("open → pending_approval: invalid", () =>
    expect(canTransition("open", "pending_approval")).toBe(false));
  it("open → resolved: invalid", () =>
    expect(canTransition("open", "resolved")).toBe(false));
  it("under_review → pending_approval: valid", () =>
    expect(canTransition("under_review", "pending_approval")).toBe(true));
  it("under_review → open: invalid", () =>
    expect(canTransition("under_review", "open")).toBe(false));
  it("pending_approval → resolved: valid", () =>
    expect(canTransition("pending_approval", "resolved")).toBe(true));
  it("pending_approval → closed: valid", () =>
    expect(canTransition("pending_approval", "closed")).toBe(true));
  it("resolved → closed: valid", () =>
    expect(canTransition("resolved", "closed")).toBe(true));
  it("resolved → open: invalid", () =>
    expect(canTransition("resolved", "open")).toBe(false));
  it("closed → anything: invalid", () => {
    expect(canTransition("closed", "open")).toBe(false);
    expect(canTransition("closed", "resolved")).toBe(false);
    expect(canTransition("closed", "closed")).toBe(false);
  });
});

// ---- Compensation approval tier logic ----

describe("compensation approval tiers", () => {
  const LIMITS: Record<string, number> = {
    limited: 25,
    full: 50,
    override: Infinity,
  };

  function canApprove(permissionLevel: string, amount: number): boolean {
    const limit = LIMITS[permissionLevel] ?? 0;
    return amount <= limit;
  }

  it("limited tier: can approve $25", () =>
    expect(canApprove("limited", 25)).toBe(true));
  it("limited tier: cannot approve $25.01", () =>
    expect(canApprove("limited", 25.01)).toBe(false));
  it("limited tier: cannot approve $50", () =>
    expect(canApprove("limited", 50)).toBe(false));
  it("full tier: can approve $50", () =>
    expect(canApprove("full", 50)).toBe(true));
  it("full tier: can approve $25", () =>
    expect(canApprove("full", 25)).toBe(true));
  it("full tier: cannot approve $50.01", () =>
    expect(canApprove("full", 50.01)).toBe(false));
  it("override tier: can approve any amount", () => {
    expect(canApprove("override", 50)).toBe(true);
    expect(canApprove("override", 999)).toBe(true);
    expect(canApprove("override", 0.01)).toBe(true);
  });
  it("unknown tier: cannot approve any amount", () =>
    expect(canApprove("unknown", 1)).toBe(false));
});

// ---- Global compensation cap logic ----

describe("compensation cap: $50 global cap", () => {
  const GLOBAL_CAP = 50;

  function computeFinalAmount(
    suggested: number,
    existingApproved: number,
    capAmount: number,
  ): number {
    const effectiveCap = Math.min(capAmount, GLOBAL_CAP);
    const remaining = Math.max(0, effectiveCap - existingApproved);
    return Math.min(suggested, remaining);
  }

  it("full suggestion when no existing compensations", () => {
    expect(computeFinalAmount(10, 0, 50)).toBe(10);
  });

  it("caps at remaining allowance", () => {
    expect(computeFinalAmount(10, 45, 50)).toBe(5);
  });

  it("returns 0 when cap already reached", () => {
    expect(computeFinalAmount(10, 50, 50)).toBe(0);
  });

  it("rule-specific cap overrides if lower than global cap", () => {
    // Rule cap = $20, no existing → finalAmount = $10 (under rule cap)
    expect(computeFinalAmount(10, 0, 20)).toBe(10);
    // Rule cap = $20, existing = $15 → only $5 remaining
    expect(computeFinalAmount(10, 15, 20)).toBe(5);
  });

  it("global cap prevents rule cap above $50", () => {
    // Rule cap = $100 → effective cap = $50
    expect(computeFinalAmount(80, 0, 100)).toBe(50);
  });
});
