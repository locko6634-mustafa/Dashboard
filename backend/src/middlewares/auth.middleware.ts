import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  user?: {
    id: string;
    email: string;
    salon_adi: string;
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    const tenantIdHeader = req.headers['x-tenant-id'] as string | undefined;

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (apiKeyHeader) {
      token = apiKeyHeader;
    }

    // Tenant ID detection
    let tenantId = tenantIdHeader || (req.body?.tenant_id as string) || (req.query?.tenant_id as string);

    if (token) {
      // 1. Try JWT verification (standard for dashboard frontend)
      let decoded: {
        id: string;
        email: string;
        salon_adi: string;
        tenant_id?: string;
        tenantId?: string;
      } | null = null;
      try {
        decoded = jwt.verify(token, ENV.JWT_SECRET) as {
          id: string;
          email: string;
          salon_adi: string;
          tenant_id?: string;
          tenantId?: string;
        };
      } catch {
        // Not a valid JWT or expired, check if it's a valid API Key
      }

      if (decoded) {
        const jwtTenantId = decoded.tenant_id || decoded.tenantId || decoded.id;
        if (!jwtTenantId) {
          res.status(403).json({ error: 'Hesabınız aktif değil veya bulunamadı', success: false });
          return;
        }

        const tenant = await prisma.tenant.findUnique({
          where: { id: jwtTenantId },
          select: { id: true, durum: true },
        });

        if (!tenant || tenant.durum !== 'Aktif') {
          res.status(403).json({ error: 'Hesabınız aktif değil veya bulunamadı', success: false });
          return;
        }

        req.tenantId = tenant.id;
        req.user = {
          id: decoded.id || tenant.id,
          email: decoded.email,
          salon_adi: decoded.salon_adi,
        };
        return next();
      }

      // 2. Try API Key verification (for server-to-server or integration access)
      const tenantByKey = await prisma.tenant.findFirst({
        where: {
          api_key: token,
          durum: 'Aktif',
          ...(tenantId ? { id: tenantId } : {}),
        },
      });

      if (tenantByKey) {
        req.tenantId = tenantByKey.id;
        req.user = { id: tenantByKey.id, email: tenantByKey.email, salon_adi: tenantByKey.salon_adi };
        return next();
      }

      res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum anahtarı / API token', success: false });
      return;
    }

    res.status(401).json({ error: 'Yetkisiz erişim: Oturum anahtarı (Authorization Bearer / x-api-key) zorunludur', success: false });
    return;
  } catch (err) {
    next(err);
  }
}
