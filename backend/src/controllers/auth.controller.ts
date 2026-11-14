import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { getAuthCookieOptions, USER_AUTH_COOKIE_NAME } from '../middlewares/auth.middleware.js';

const USER_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const authLoginSchema = z.object({
  email: z
    .string({
      required_error: 'E-posta ve şifre zorunludur',
      invalid_type_error: 'E-posta metin olmalıdır',
    })
    .trim()
    .min(1, 'E-posta ve şifre zorunludur'),
  password: z
    .string({
      required_error: 'E-posta ve şifre zorunludur',
      invalid_type_error: 'Şifre metin olmalıdır',
    })
    .min(1, 'E-posta ve şifre zorunludur'),
});

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = authLoginSchema.parse(req.body ?? {});

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
