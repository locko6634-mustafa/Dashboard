import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';

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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Yetkilendirme başlığı (Bearer token) bulunamadı' });
      return;
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, ENV.JWT_SECRET);
    } catch (jwtErr) {
      res.status(401).json({ success: false, error: 'Geçersiz veya süresi dolmuş oturum anahtarı' });
      return;
    }

    if (decoded.role !== 'super_admin' || !decoded.adminId) {
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
