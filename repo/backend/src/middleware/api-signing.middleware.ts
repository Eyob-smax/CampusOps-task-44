import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { decrypt } from "../lib/encryption";

export type IntegrationKeyScope = "classroom" | "parking" | "carrier";

type IntegrationKeyAuthContext = {
  id: string;
  keyId: string;
  scope: string;
  secret: string;
};

/**
 * HMAC-SHA256 API signing middleware for privileged integrations
 * (classroom hardware, parking ingest, carrier connectors).
 *
 * Expected request headers:
 *   X-Api-Key    — identifies the integration (looked up in DB)
 *   X-Timestamp  — Unix timestamp (ms), rejected if >5 min old
 *   X-Signature  — HMAC-SHA256(secret, `${method}:${fullPath}:${timestamp}:${body}`)
 */
export function apiSigning(
  getIntegrationKeyContext: (
    apiKey: string,
  ) => Promise<IntegrationKeyAuthContext | null>,
  requiredScope?: IntegrationKeyScope,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    const timestamp = req.headers["x-timestamp"] as string | undefined;
    const signature = req.headers["x-signature"] as string | undefined;

    if (!apiKey || !timestamp || !signature) {
      res.status(401).json({
        success: false,
        error: "Missing API signing headers",
        code: "MISSING_API_SIGNING",
      });
      return;
    }

    const tsMs = parseInt(timestamp, 10);
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      res.status(401).json({
        success: false,
        error: "Request timestamp out of acceptable range",
        code: "TIMESTAMP_EXPIRED",
      });
      return;
    }

    const keyContext = await getIntegrationKeyContext(apiKey);
    if (!keyContext) {
      res.status(401).json({
        success: false,
        error: "Unknown API key",
        code: "UNKNOWN_API_KEY",
      });
      return;
    }

    if (requiredScope && keyContext.scope !== requiredScope) {
      logger.warn({
        msg: "API key scope mismatch",
        keyId: keyContext.keyId,
        keyScope: keyContext.scope,
        requiredScope,
        path: req.path,
      });
      res.status(403).json({
        success: false,
        error: "API key scope does not allow this endpoint",
        code: "API_KEY_SCOPE_MISMATCH",
      });
      return;
    }

    const body =
      typeof req.body === "object"
        ? JSON.stringify(req.body)
        : (req.body ?? "");
    const signedPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const signaturePayload = `${req.method}:${signedPath}:${timestamp}:${body}`;
    const expected = crypto
      .createHmac("sha256", keyContext.secret)
      .update(signaturePayload)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const isHexSignature = /^[a-f0-9]{64}$/i.test(signature);

    if (
      !isHexSignature ||
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      logger.warn({ msg: "Invalid API signature", apiKey, path: signedPath });
      res.status(401).json({
        success: false,
        error: "Invalid signature",
        code: "INVALID_SIGNATURE",
      });
      return;
    }

    next();
  };
}

/**
 * Looks up the HMAC secret for a given API key ID from the IntegrationKey table.
 * Used as the getSecretByKey callback for apiSigning middleware.
 */
export async function getIntegrationKeyContextByKeyId(
  apiKeyId: string,
): Promise<IntegrationKeyAuthContext | null> {
  try {
    const { prisma } = await import("../lib/prisma");
    const key = await prisma.integrationKey.findUnique({
      where: { keyId: apiKeyId },
    });
    if (!key || !key.isActive) return null;

    let secret: string;
    try {
      // Integration secrets are encrypted at rest; decrypt only for signature validation.
      secret = decrypt(key.secretHash);
    } catch {
      logger.warn({
        msg: "Integration key uses legacy/invalid secret format; rotate required",
        apiKeyId,
      });
      return null;
    }

    // Update lastUsedAt without blocking
    prisma.integrationKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return {
      id: key.id,
      keyId: key.keyId,
      scope: key.scope,
      secret,
    };
  } catch (err) {
    logger.error({ msg: "Failed to lookup integration key", apiKeyId, err });
    return null;
  }
}

/** Scope-bound API signing middleware for privileged integration endpoints */
export function privilegedApiSigningForScope(scope: IntegrationKeyScope) {
  return apiSigning(getIntegrationKeyContextByKeyId, scope);
}
