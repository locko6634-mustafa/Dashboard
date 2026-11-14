import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdminService } from '../services/admin.service.js';
import { ADMIN_AUTH_COOKIE_NAME, getAuthCookieOptions } from '../middlewares/auth.middleware.js';

const ADMIN_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const tenantSettingsSchema = z
  .object({
    calendar: z.unknown().optional(),
    services: z.unknown().optional(),
    sector: z.string().optional(),
    terminology: z.unknown().optional(),
    ui_preferences: z.unknown().optional(),
  })
  .optional();

const setupSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
  ad_soyad: z.string().trim().min(1, 'Ad soyad zorunludur'),
});

const createTenantSchema = z.object({
  salon_adi: z.string().trim().min(1, 'Salon adı zorunludur'),
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
  whatsapp_phone: z.string().nullable().optional(),
  n8n_webhook_url: z.string().nullable().optional(),
  chatwoot_inbox_id: z.string().nullable().optional(),
  durum: z.string().optional(),
  settings: tenantSettingsSchema,
});

const updateTenantSchema = z.object({
  salon_adi: z.string().trim().min(1, 'Salon adı boş olamaz').optional(),
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz').optional(),
  password: z.union([z.literal(''), z.string().min(6, 'Şifre en az 6 karakter olmalıdır')]).optional(),
  whatsapp_phone: z.string().nullable().optional(),
  n8n_webhook_url: z.string().nullable().optional(),
  chatwoot_inbox_id: z.string().nullable().optional(),
  durum: z.string().optional(),
  settings: tenantSettingsSchema,
});

export class AdminController {
  static async checkSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.checkSetupStatus();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async setup(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = setupSchema.parse(req.body);
      const result = await AdminService.setupInitialAdmin(parsed);
      if (result.token) {
        res.cookie(ADMIN_AUTH_COOKIE_NAME, result.token, getAuthCookieOptions(ADMIN_TOKEN_MAX_AGE_MS));
      }
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ success: false, error: 'E-posta ve şifre zorunludur' });
        return;
      }
      const result = await AdminService.login(email, password);
      if (result.token) {
        res.cookie(ADMIN_AUTH_COOKIE_NAME, result.token, getAuthCookieOptions(ADMIN_TOKEN_MAX_AGE_MS));
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie(ADMIN_AUTH_COOKIE_NAME, getAuthCookieOptions());
    res.json({ success: true, message: 'Çıkış yapıldı' });
  }

  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.getSystemStats();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const search = req.query.search as string | undefined;
      const durum = req.query.durum as string | undefined;
      const result = await AdminService.listTenants(search, durum);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createTenantSchema.parse(req.body);
      const result = await AdminService.createTenant({
        ...parsed,
        whatsapp_phone: parsed.whatsapp_phone ?? undefined,
        n8n_webhook_url: parsed.n8n_webhook_url ?? undefined,
        chatwoot_inbox_id: parsed.chatwoot_inbox_id ?? undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const parsed = updateTenantSchema.parse(req.body);
      const result = await AdminService.updateTenant(id, {
        ...parsed,
        whatsapp_phone: parsed.whatsapp_phone ?? undefined,
        n8n_webhook_url: parsed.n8n_webhook_url ?? undefined,
        chatwoot_inbox_id: parsed.chatwoot_inbox_id ?? undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async regenerateApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.regenerateApiKey(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async impersonate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.impersonateTenant(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.deleteTenant(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
