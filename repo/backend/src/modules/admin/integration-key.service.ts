import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { decrypt, encrypt } from "../../lib/encryption";
import { writeAuditEntry } from "./audit.service";

export async function listIntegrationKeys() {
  return prisma.integrationKey.findMany({
    select: {
      id: true,
      name: true,
      keyId: true,
      scope: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Creates a new integration key. Returns the raw secret ONCE — stored only in encrypted form. */
export async function createIntegrationKey(
  name: string,
  scope: string,
  actorId: string,
): Promise<{ keyId: string; secret: string; id: string }> {
  const keyId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const secretEncrypted = encrypt(secret);

  const key = await prisma.integrationKey.create({
    data: { name, keyId, secretHash: secretEncrypted, scope },
  });

  await writeAuditEntry(
    actorId,
    "integration-key:created",
    "integration_key",
    key.id,
    { name, scope, keyId },
  );
  return { keyId, secret, id: key.id };
}

export async function rotateIntegrationKey(
  id: string,
  actorId: string,
): Promise<{ keyId: string; secret: string }> {
  const keyId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const secretEncrypted = encrypt(secret);

  await prisma.integrationKey.update({
    where: { id },
    data: { keyId, secretHash: secretEncrypted },
  });
  await writeAuditEntry(
    actorId,
    "integration-key:rotated",
    "integration_key",
    id,
    { keyId },
  );
  return { keyId, secret };
}

export async function deactivateIntegrationKey(id: string, actorId: string) {
  await prisma.integrationKey.update({
    where: { id },
    data: { isActive: false },
  });
  await writeAuditEntry(
    actorId,
    "integration-key:deactivated",
    "integration_key",
    id,
    {},
  );
}

/** Verifies an HMAC-SHA256 signed request — used by API signing middleware. */
export async function verifyApiSignature(
  keyId: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const key = await prisma.integrationKey.findUnique({ where: { keyId } });
  if (!key || !key.isActive) return false;

  // Reject timestamps older than 5 minutes
  const tsMs = parseInt(timestamp, 10);
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false;

  let secret: string;
  try {
    secret = decrypt(key.secretHash);
  } catch {
    return false;
  }

  const signPayload = `${method}:${path}:${timestamp}:${body}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signPayload)
    .digest("hex");

  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  if (signatureBuf.length !== expectedBuf.length) return false;
  const valid = crypto.timingSafeEqual(signatureBuf, expectedBuf);

  if (valid) {
    // Update lastUsedAt without blocking
    prisma.integrationKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  return valid;
}
