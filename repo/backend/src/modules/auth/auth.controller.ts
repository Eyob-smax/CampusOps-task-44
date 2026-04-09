import { Request, Response, NextFunction } from 'express';
import { loginSchema, changePasswordSchema } from './auth.validator';
import { loginUser, refreshTokens, logoutUser, changePassword } from './auth.service';
import { config } from '../../config';

const REFRESH_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) return acc;
      const key = part.slice(0, idx).trim();
      const value = decodeURIComponent(part.slice(idx + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(config.jwt.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: config.jwt.refreshCookieSecure,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.jwt.refreshCookieName, {
    httpOnly: true,
    secure: config.jwt.refreshCookieSecure,
    sameSite: 'strict',
    path: '/api/auth',
  });
}

function resolveRefreshToken(req: Request): string | undefined {
  const bodyToken = req.body?.refreshToken as string | undefined;
  if (bodyToken) return bodyToken;

  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[config.jwt.refreshCookieName];
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = loginSchema.parse(req.body);
    const ipAddress = (req.ip ?? req.socket.remoteAddress) as string;
    const { tokens, user } = await loginUser(dto.username, dto.password, ipAddress);
    setRefreshCookie(res, tokens.refreshToken);

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          campusId: user.campusId,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = resolveRefreshToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: 'refreshToken is required', code: 'VALIDATION_ERROR' });
      return;
    }
    const tokens = await refreshTokens(token);
    setRefreshCookie(res, tokens.refreshToken);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.slice(7) ?? '';
    await logoutUser(token);
    clearRefreshCookie(res);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    data: req.user,
  });
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = changePasswordSchema.parse(req.body);
    await changePassword(req.user!.id, dto.currentPassword, dto.newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}
