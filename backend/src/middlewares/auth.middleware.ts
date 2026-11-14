import crypto from 'crypto';
import { CookieOptions, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';
import { hashApiKey } from '../services/admin.service.js';

export const USER_AUTH_COOKIE_NAME = 'rp_user_token';
export const ADMIN_AUTH_COOKIE_NAME = 'rp_admin_token';

/**
 * Harici bağımlılık olmadan Cookie başlığını ayrıştırır.
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    if (!key) continue;

    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}

/**
 * Auth HttpOnly cookie ayarlarını üretir (set ve clearCookie için ortak).
 */
export function getAuthCookieOptions(maxAgeMs?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  if (typeof maxAgeMs === 'number') {
    options.maxAge = maxAgeMs;
  }
  return options;
}

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  user?: {
    id: string;
    email: string;
    salon_adi: string;
  };
}

/**
 * Doğrulanmış istekten tenantId döndürür; eksik veya boşsa 401 hatası fırlatır.
 */
export function requireTenantId(req: AuthenticatedRequest): string {
  const tenantId = typeof req.tenantId === 'string' ? req.tenantId.trim() : '';
  if (!tenantId) {
    throw Object.assign(new Error('Yetkisiz erişim: Geçerli bir işletme oturumu zorunludur'), {
      status: 401,
    });
  }
  return tenantId;
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
    } else {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[USER_AUTH_COOKIE_NAME]) {
        token = cookies[USER_AUTH_COOKIE_NAME];
      }
    }

    // Tenant ID detection
    const rawTenantId = tenantIdHeader || (req.body?.tenant_id as string) || (req.query?.tenant_id as string);
    const tenantId = typeof rawTenantId === 'string' && rawTenantId.trim() ? rawTenantId.trim() : undefined;

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

        if (typeof tenantId === 'string' && tenantId.trim() && tenantId.trim() !== jwtTenantId) {
          res.status(403).json({ error: 'Farklı bir tenant adına işlem yapma yetkiniz yok', success: false });
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
      const tokenHash = hashApiKey(token);
      const tokenHashBuf = Buffer.from(tokenHash, 'hex');

      let tenantByKey = await prisma.tenant.findFirst({
        where: {
          api_key_hash: tokenHash,
          durum: 'Aktif',
          ...(tenantId ? { id: tenantId } : {}),
        },
        select: { id: true, email: true, salon_adi: true },
      });

      // Legacy fallback: hashlenmemiş eski api_key kayıtları için yalnızca tenantId varsa tek kayıt kontrolü + lazy migration
      if (!tenantByKey && tenantId) {
        const legacyCandidate = await prisma.tenant.findFirst({
          where: {
            id: tenantId,
            api_key_hash: null,
            api_key: { not: null },
            durum: 'Aktif',
          },
          select: { id: true, email: true, salon_adi: true, api_key: true },
        });

        if (legacyCandidate?.api_key) {
          const candidateHashBuf = Buffer.from(hashApiKey(legacyCandidate.api_key), 'hex');
          if (
            candidateHashBuf.length === tokenHashBuf.length &&
            crypto.timingSafeEqual(candidateHashBuf, tokenHashBuf)
          ) {
            tenantByKey = {
              id: legacyCandidate.id,
              email: legacyCandidate.email,
              salon_adi: legacyCandidate.salon_adi,
            };
            prisma.tenant
              .update({
                where: { id: legacyCandidate.id },
                data: { api_key_hash: tokenHash },
              })
              .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
                console.warn(`Lazy api_key_hash migration failed for tenant ${legacyCandidate.id}: ${message}`);
              });
          }
        }
      }

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
