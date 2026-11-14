import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { getAuthCookieOptions, USER_AUTH_COOKIE_NAME } from '../middlewares/auth.middleware.js';

const USER_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ success: false, error: 'E-posta ve şifre zorunludur' });
        return;
      }

      const result = await AuthService.login(email, password);
      if (result.token) {
        res.cookie(USER_AUTH_COOKIE_NAME, result.token, getAuthCookieOptions(USER_TOKEN_MAX_AGE_MS));
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie(USER_AUTH_COOKIE_NAME, getAuthCookieOptions());
    res.json({ success: true, message: 'Çıkış yapıldı' });
  }
}
