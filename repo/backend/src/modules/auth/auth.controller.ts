import { Request, Response, NextFunction } from 'express';
import { loginSchema, changePasswordSchema } from './auth.validator';
import { loginUser, refreshTokens, logoutUser, changePassword } from './auth.service';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = loginSchema.parse(req.body);
    const ipAddress = (req.ip ?? req.socket.remoteAddress) as string;
    const { tokens, user } = await loginUser(dto.username, dto.password, ipAddress);

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: { id: user.id, username: user.username, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.body?.refreshToken as string | undefined;
    if (!token) {
      res.status(400).json({ success: false, error: 'refreshToken is required', code: 'VALIDATION_ERROR' });
      return;
    }
    const tokens = await refreshTokens(token);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.slice(7) ?? '';
    await logoutUser(token);
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
