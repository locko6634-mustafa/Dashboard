import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';
import { ADMIN_AUTH_COOKIE_NAME, parseCookies } from './auth.middleware.js';

export interface AdminJwtPayload {
  adminId: string;
  role: 'super_admin';
  email?: string;
}

function isAdminJwtPayload(payload: unknown): payload is AdminJwtPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.adminId === 'string' &&
    candidate.adminId.length > 0 &&
    candidate.role === 'super_admin'
  );
}

export interface AuthenticatedAdminRequest extends Request {
  admin?: {
    id: string;
    email: string;
    ad_soyad: string;
    role: 'super_admin';
  };
}

export async function adminMiddleware(req: AuthenticatedAdminRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[ADMIN_AUTH_COOKIE_NAME]) {
        token = cookies[ADMIN_AUTH_COOKIE_NAME];
      }
    }

    if (!token) {
      res.status(401).json({ success: false, error: 'Yetkilendirme bilgisi (Bearer token veya oturum çerezi) bulunamadı' });
      return;
    }

    let decoded: unknown;
    try {
      decoded = jwt.verify(token, ENV.JWT_SECRET);
    } catch {
      res.status(401).json({ success: false, error: 'Geçersiz veya süresi dolmuş oturum anahtarı' });
      return;
    }

    if (!isAdminJwtPayload(decoded)) {
      res.status(403).json({ success: false, error: 'Bu işlem için Süper Admin yetkisi gereklidir' });
      return;
    }

    const admin = await prisma.superAdmin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, email: true, ad_soyad: true },
    });

    if (!admin) {
      res.status(403).json({ success: false, error: 'Süper Admin hesabı bulunamadı veya silinmiş' });
      return;
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      ad_soyad: admin.ad_soyad,
      role: 'super_admin',
    };

    next();
  } catch (err) {
    next(err);
  }
}
