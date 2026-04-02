/**
 * Shared test setup — provides authenticated supertest agents per role
 * and utility functions for API testing.
 */
import request from "supertest";
import { Application } from "express";
import crypto from "crypto";

// Environment setup — must be before any app imports
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a".repeat(64);
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-for-api-tests";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  "mysql://campusops:test@db:3306/campusops_test";
process.env.REDIS_URL =
  process.env.REDIS_URL || process.env.TEST_REDIS_URL || "redis://redis:6379";

import { createApp } from "../../src/app";

export const app: Application = createApp();

function seedPassword(envName: string, fallback: string): string {
  return process.env[envName] || fallback;
}

// Seed credentials (from database/seeders/seed.ts)
export const SEED_USERS = {
  admin: {
    username: "admin",
    password: seedPassword("SEED_ADMIN_PASSWORD", "TestAdminPass1!"),
    role: "administrator",
  },
  ops: {
    username: "ops_manager",
    password: seedPassword("SEED_OPS_MANAGER_PASSWORD", "TestOpsPass1!"),
    role: "operations_manager",
  },
  supervisor: {
    username: "supervisor",
    password: seedPassword("SEED_SUPERVISOR_PASSWORD", "TestSupervisorPass1!"),
    role: "classroom_supervisor",
  },
  agent: {
    username: "cs_agent",
    password: seedPassword("SEED_CS_AGENT_PASSWORD", "TestCsAgentPass1!"),
    role: "customer_service_agent",
  },
  auditor: {
    username: "auditor",
    password: seedPassword("SEED_AUDITOR_PASSWORD", "TestAuditorPass1!"),
    role: "auditor",
  },
} as const;

export type RoleKey = keyof typeof SEED_USERS;

const tokenCache: Record<string, string> = {};

/** Login as a specific role and cache the token */
export async function loginAs(role: RoleKey): Promise<string> {
  if (tokenCache[role]) return tokenCache[role];

  const { username, password } = SEED_USERS[role];
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username, password });

  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(
      `Login failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  tokenCache[role] = res.body.data.accessToken;
  return tokenCache[role];
}

/** Create an authenticated supertest request for a given role */
export async function authGet(path: string, role: RoleKey) {
  const token = await loginAs(role);
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

export async function authPost(path: string, role: RoleKey, body?: object) {
  const token = await loginAs(role);
  const req = request(app)
    .post(path)
    .set("Authorization", `Bearer ${token}`)
    .set("X-Idempotency-Key", crypto.randomUUID());
  return body ? req.send(body) : req;
}

export async function authPut(path: string, role: RoleKey, body?: object) {
  const token = await loginAs(role);
  const req = request(app)
    .put(path)
    .set("Authorization", `Bearer ${token}`)
    .set("X-Idempotency-Key", crypto.randomUUID());
  return body ? req.send(body) : req;
}

export async function authPatch(path: string, role: RoleKey, body?: object) {
  const token = await loginAs(role);
  const req = request(app)
    .patch(path)
    .set("Authorization", `Bearer ${token}`)
    .set("X-Idempotency-Key", crypto.randomUUID());
  return body ? req.send(body) : req;
}

export async function authDelete(path: string, role: RoleKey) {
  const token = await loginAs(role);
  return request(app).delete(path).set("Authorization", `Bearer ${token}`);
}

/** Generate a valid UUIDv4 for idempotency keys */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Helper to compute HMAC-SHA256 for API signing tests */
export function computeSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${method}:${path}:${timestamp}:${body}`)
    .digest("hex");
}
