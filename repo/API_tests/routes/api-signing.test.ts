/**
 * API functional tests — API signing enforcement
 * Tests that privileged integration endpoints require HMAC signing headers
 * and reject unsigned or incorrectly signed requests.
 */
import request from "supertest";
import {
  app,
  authGet,
  authPost,
  computeSignature,
  uuid,
} from "../helpers/setup";

describe("API signing enforcement — classroom heartbeat", () => {
  const endpoint = "/api/classrooms/heartbeat/NODE-001";

  it("rejects requests with no signing headers (401)", async () => {
    const res = await request(app)
      .post(endpoint)
      .send({ recognitionConfidence: 0.95 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
    expect(res.body.success).toBe(false);
  });

  it("rejects requests with missing X-Signature header", async () => {
    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", "some-key")
      .set("X-Timestamp", String(Date.now()))
      .send({ recognitionConfidence: 0.95 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
  });

  it("rejects requests with missing X-Timestamp header", async () => {
    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", "some-key")
      .set("X-Signature", "somesig")
      .send({ recognitionConfidence: 0.95 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
  });

  it("rejects requests with expired timestamp (>5 min)", async () => {
    const oldTimestamp = String(Date.now() - 6 * 60 * 1000);
    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", "some-key")
      .set("X-Timestamp", oldTimestamp)
      .set("X-Signature", "somesig")
      .send({ recognitionConfidence: 0.95 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TIMESTAMP_EXPIRED");
  });

  it("rejects requests with unknown API key", async () => {
    const timestamp = String(Date.now());
    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", "nonexistent-api-key-id")
      .set("X-Timestamp", timestamp)
      .set("X-Signature", "a".repeat(64))
      .send({ recognitionConfidence: 0.95 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNKNOWN_API_KEY");
  });
});

describe("API signing enforcement — parking entry", () => {
  const endpoint = "/api/parking/sessions/entry";

  it("rejects requests with no signing headers (401)", async () => {
    const res = await request(app).post(endpoint).send({ lotId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
  });
});

describe("API signing enforcement — parking exit", () => {
  const endpoint = "/api/parking/sessions/exit";

  it("rejects requests with no signing headers (401)", async () => {
    const res = await request(app).post(endpoint).send({ sessionId: uuid() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
  });
});

describe("API signing enforcement — carrier sync signed", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";
  const endpoint = `/api/shipments/sync-signed/${validUuid}`;

  it("rejects requests with no signing headers (401)", async () => {
    const res = await request(app).post(endpoint);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_API_SIGNING");
  });

  it("rejects requests with invalid signature", async () => {
    const timestamp = String(Date.now());
    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", "bad-key")
      .set("X-Timestamp", timestamp)
      .set("X-Signature", "invalidsignaturehere");
    expect(res.status).toBe(401);
  });
});

describe("API signing — error response structure", () => {
  const signingEndpoints = [
    "/api/classrooms/heartbeat/NODE-001",
    "/api/parking/sessions/entry",
    "/api/parking/sessions/exit",
  ];

  signingEndpoints.forEach((endpoint) => {
    it(`POST ${endpoint} — structured error without stack`, async () => {
      const res = await request(app).post(endpoint).send({});
      expect(res.body.stack).toBeUndefined();
      expect(res.body.success).toBe(false);
      expect(res.status).toBe(401);
    });
  });
});

describe("API signing enforcement — valid signed parking entry", () => {
  const endpoint = "/api/parking/sessions/entry";

  it("accepts requests with a valid integration key and signature", async () => {
    const keyName = `parking-key-${Date.now()}`;
    const keyRes = await authPost("/api/admin/settings/keys", "admin", {
      name: keyName,
      scope: "parking",
    });

    expect(keyRes.status).toBe(201);
    expect(keyRes.body.success).toBe(true);

    const keyId = keyRes.body?.data?.keyId as string;
    const secret = keyRes.body?.data?.secret as string;
    expect(keyId).toBeTruthy();
    expect(secret).toBeTruthy();

    const lotsRes = await authGet("/api/parking/lots", "admin");
    expect(lotsRes.status).toBe(200);
    expect(Array.isArray(lotsRes.body?.data)).toBe(true);
    expect(lotsRes.body.data.length).toBeGreaterThan(0);

    const lotId = lotsRes.body.data[0].id as string;
    const payload = {
      lotId,
      plateNumber: "TEST-API-SIGNED-001",
    };
    const timestamp = String(Date.now());
    const signature = computeSignature(
      secret,
      "POST",
      endpoint,
      timestamp,
      JSON.stringify(payload),
    );

    const res = await request(app)
      .post(endpoint)
      .set("X-Api-Key", keyId)
      .set("X-Timestamp", timestamp)
      .set("X-Signature", signature)
      .set("X-Idempotency-Key", uuid())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lotId).toBe(lotId);
  });
});
