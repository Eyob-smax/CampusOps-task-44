import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../lib/prisma';
import { getRedisClient } from '../../lib/redis';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { encrypt } from '../../lib/encryption';
import type { AuthenticatedUser } from '../../types';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL_SECONDS  = 15 * 60;       // 15 min
const REFRESH_TOKEN_TTL_SECONDS = 8 * 60 * 60;   // 8 h

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function issueTokenPair(user: AuthenticatedUser): TokenPair {
  const jti = uuidv4();
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, jti },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );

  const refreshJti = uuidv4();
  const refreshToken = jwt.sign(
    { id: user.id, sub: 'refresh', jti: refreshJti },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  // Store refresh token reference in Redis
  getRedisClient()
    .setex(`campusops:refresh:${refreshJti}`, REFRESH_TOKEN_TTL_SECONDS, user.id)
    .catch((err) => logger.error({ msg: 'Failed to store refresh token', err }));

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function loginUser(
  username: string,
  password: string,
  ipAddress?: string
): Promise<{ tokens: TokenPair; user: AuthenticatedUser }> {
  const dbUser = await prisma.user.findUnique({ where: { username } });

  // Always run bcrypt compare to prevent timing attacks
  const dummyHash = '$2b$12$invalid.hash.for.timing.prevention.xxxxxxxxxxxxxxxxx';
  const valid = dbUser
    ? await bcrypt.compare(password, dbUser.passwordHash)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!dbUser || !valid || !dbUser.isActive) {
    await writeAuditLog(dbUser?.id ?? 'unknown', 'auth:login:failed', 'user', dbUser?.id ?? username, { username, ipAddress });
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const user: AuthenticatedUser = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
  const tokens = issueTokenPair(user);

  await writeAuditLog(user.id, 'auth:login:success', 'user', user.id, { ipAddress });
  logger.info({ msg: 'User logged in', userId: user.id, role: user.role });

  return { tokens, user };
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload: { id: string; sub: string; jti: string };
  try {
    payload = jwt.verify(refreshToken, config.jwt.secret) as typeof payload;
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  if (payload.sub !== 'refresh') {
    throw Object.assign(new Error('Not a refresh token'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const stored = await getRedisClient().get(`campusops:refresh:${payload.jti}`);
  if (!stored || stored !== payload.id) {
    throw Object.assign(new Error('Refresh token not found or revoked'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  // Rotate — invalidate old refresh token
  await getRedisClient().del(`campusops:refresh:${payload.jti}`);

  const dbUser = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!dbUser || !dbUser.isActive) {
    throw Object.assign(new Error('User not found or inactive'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const user: AuthenticatedUser = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
  return issueTokenPair(user);
}

export async function logoutUser(accessToken: string): Promise<void> {
  try {
    const payload = jwt.decode(accessToken) as { jti?: string; id?: string; exp?: number } | null;
    if (payload?.jti) {
      const ttl = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : ACCESS_TOKEN_TTL_SECONDS;
      if (ttl > 0) {
        await getRedisClient().setex(`campusops:revoked:${payload.jti}`, ttl, '1');
      }
    }
    if (payload?.id) {
      await writeAuditLog(payload.id, 'auth:logout', 'user', payload.id, {});
    }
  } catch (err) {
    logger.warn({ msg: 'Logout token decode failed', err });
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400, code: 'INVALID_PASSWORD' });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await writeAuditLog(userId, 'auth:password-changed', 'user', userId, {});
  logger.info({ msg: 'Password changed', userId });
}

/** Internal helper — writes an encrypted audit log entry */
async function writeAuditLog(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    const encryptedDetail = encrypt(JSON.stringify(detail));
    await prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, encryptedDetail },
    });
  } catch (err) {
    logger.error({ msg: 'Failed to write audit log', err, action, entityId });
  }
}
