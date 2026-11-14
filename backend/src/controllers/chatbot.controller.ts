import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { ChatbotService } from '../services/chatbot.service.js';
import { extractQueryString } from '../utils/query.util.js';
import { isValidDateString, isValidTimeString } from '../utils/dateTime.util.js';

const optionalPositiveIntSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val, ctx): number | undefined => {
    if (val === undefined || val === null) {
      return undefined;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) {
        return undefined;
      }
      if (!/^\d+$/.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Süre pozitif bir tam sayı olmalıdır',
        });
        return z.NEVER;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Süre 0’dan büyük olmalıdır',
        });
        return z.NEVER;
      }
      return parsed;
    }
    if (typeof val === 'number') {
      if (!Number.isInteger(val) || val <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Süre pozitif bir tam sayı olmalıdır',
        });
        return z.NEVER;
      }
      return val;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Geçersiz süre formatı',
    });
    return z.NEVER;
  });

const jsonValueSchema = z.custom<Prisma.InputJsonValue>(
  (val) => val !== undefined && val !== null,
  { message: 'Geçersiz JSON değeri' }
);

const optionalDateStringSchema = z
  .string({ invalid_type_error: 'Tarih metin olmalıdır' })
  .trim()
  .refine((val) => !val || isValidDateString(val), {
    message: 'Tarih YYYY-MM-DD formatında ve geçerli olmalıdır',
  })
  .optional();

const optionalTimeStringSchema = z
  .string({ invalid_type_error: 'Saat metin olmalıdır' })
  .trim()
  .refine((val) => !val || isValidTimeString(val), {
    message: 'Saat HH:mm formatında ve geçerli olmalıdır',
  })
  .optional();

export const chatbotBookSchema = z.object({
  ad_soyad: z.string({ invalid_type_error: 'Ad soyad metin olmalıdır' }).optional(),
  telefon: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  tarih: optionalDateStringSchema,
  saat: optionalTimeStringSchema,
  hizmet: z.string({ invalid_type_error: 'Hizmet metin olmalıdır' }).optional(),
  sure: optionalPositiveIntSchema.optional(),
  tenant_id: z.string().optional(),
});

export const chatbotCancelSchema = z.object({
  appointment_id: z.string({ invalid_type_error: 'Randevu ID metin olmalıdır' }).trim().optional(),
  id: z.string({ invalid_type_error: 'Randevu ID metin olmalıdır' }).trim().optional(),
  telefon: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  phone: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  tenant_id: z.string().optional(),
});

export const chatbotRescheduleSchema = z.object({
  appointment_id: z.string({ invalid_type_error: 'Randevu ID metin olmalıdır' }).trim().optional(),
  id: z.string({ invalid_type_error: 'Randevu ID metin olmalıdır' }).trim().optional(),
  tarih: optionalDateStringSchema,
  date: optionalDateStringSchema,
  saat: optionalTimeStringSchema,
  time: optionalTimeStringSchema,
  telefon: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  phone: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  tenant_id: z.string().optional(),
});

export const chatbotSetStateSchema = z.object({
  conversation_id: z.string({ invalid_type_error: 'conversation_id metin olmalıdır' }).trim().optional(),
  conversationId: z.string({ invalid_type_error: 'conversationId metin olmalıdır' }).trim().optional(),
  phone: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  telefon: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
  intent: z.string({ invalid_type_error: 'intent metin olmalıdır' }).optional(),
  current_intent: z.string({ invalid_type_error: 'current_intent metin olmalıdır' }).optional(),
  stage: z.string({ invalid_type_error: 'stage metin olmalıdır' }).optional(),
  current_stage: z.string({ invalid_type_error: 'current_stage metin olmalıdır' }).optional(),
  context: jsonValueSchema.optional(),
  context_data: jsonValueSchema.optional(),
  tenant_id: z.string().optional(),
});

export const chatbotDeleteStateSchema = z
  .object({
    conversation_id: z.string({ invalid_type_error: 'conversation_id metin olmalıdır' }).trim().optional(),
    conversationId: z.string({ invalid_type_error: 'conversationId metin olmalıdır' }).trim().optional(),
    phone: z.string({ invalid_type_error: 'Telefon metin olmalıdır' }).trim().optional(),
    tenant_id: z.string().optional(),
  })
  .optional();

/**
 * Multi-tenant safe tenant resolution for chatbot requests.
 * Relies strictly on req.tenantId populated by authMiddleware.
 * Rejects with 403 if the client supplies a different tenant_id.
 */
function resolveTenantId(req: AuthenticatedRequest): string {
  const authTenantId = req.tenantId;
  if (!authTenantId) {
    throw { status: 401, message: 'Yetkisiz erişim: Geçerli bir tenant oturumu zorunludur' };
  }

  const explicit =
    extractQueryString(req.headers['x-tenant-id']) ||
    extractQueryString(req.query.tenant_id) ||
    extractQueryString(req.body?.tenant_id);

  if (explicit && explicit.trim() && explicit.trim() !== authTenantId) {
    throw { status: 403, message: 'Farklı bir tenant adına işlem yapma yetkiniz yok' };
  }

  return authTenantId;
}

export class ChatbotController {
  static async getClientByPhone(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

      const phone = extractQueryString(req.query.phone) || extractQueryString(req.query.telefon);
      if (!phone) {
        res.status(400).json({ success: false, error: 'Telefon numarası zorunludur' });
        return;
      }

      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const client = await ChatbotService.getClientByPhone(phone, tenantId);
      if (!client) {
        res.status(404).json({ success: false, message: 'Müşteri bulunamadı' });
        return;
      }
      res.json({ success: true, client });
    } catch (err) {
      next(err);
    }
  }

  static async getAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

      const phone = extractQueryString(req.query.phone) || extractQueryString(req.query.telefon);
      if (!phone) {
        res.status(400).json({ success: false, error: 'Telefon numarası zorunludur' });
        return;
      }

      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const activeOnly = req.query.active !== 'false';
      const result = await ChatbotService.getAppointmentsByPhone(phone, activeOnly, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getAvailableSlots(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

      const date = extractQueryString(req.query.date) || extractQueryString(req.query.tarih);
      if (!date) {
        res.status(400).json({ success: false, error: 'Tarih zorunludur (YYYY-MM-DD)' });
        return;
      }

      const rawDuration = extractQueryString(req.query.duration) || extractQueryString(req.query.sure);
      let duration = 30;
      if (rawDuration !== undefined && rawDuration.trim() !== '') {
        if (!/^\d+$/.test(rawDuration.trim())) {
          res.status(400).json({ success: false, error: 'Süre pozitif bir tam sayı olmalıdır' });
          return;
        }
        duration = Number.parseInt(rawDuration.trim(), 10);
      }
      const result = await ChatbotService.getAvailableSlots(date, duration, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async bookAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { ad_soyad, telefon, tarih, saat, hizmet, sure } = chatbotBookSchema.parse(req.body ?? {});
      if (!telefon || !tarih || !saat) {
        res.status(400).json({ success: false, error: 'Telefon, tarih ve saat zorunludur' });
        return;
      }

      const cleaned = telefon.replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const result = await ChatbotService.bookAppointment({
        ad_soyad: ad_soyad ?? '',
        telefon,
        tarih,
        saat,
        hizmet,
        sure,
        tenant_id: resolvedTenantId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async cancelAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { appointment_id, id, telefon, phone } = chatbotCancelSchema.parse(req.body ?? {});
      const aptId = appointment_id || id;
      const ph = telefon || phone;

      if (!aptId || !ph) {
        res.status(400).json({ success: false, error: 'Randevu ID ve telefon numarası zorunludur' });
        return;
      }

      const cleaned = ph.replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const result = await ChatbotService.cancelAppointment(aptId, ph, resolvedTenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async rescheduleAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { appointment_id, id, tarih, date, saat, time, telefon, phone } = chatbotRescheduleSchema.parse(
        req.body ?? {}
      );
      const aptId = appointment_id || id;
      const newDate = tarih || date;
      const newTime = saat || time;
      const ph = telefon || phone;

      if (!aptId || !newDate || !newTime) {
        res.status(400).json({ success: false, error: 'Randevu ID, yeni tarih ve yeni saat zorunludur' });
        return;
      }

      if (ph) {
        const cleaned = ph.replace(/\D/g, '');
        if (cleaned.length < 10) {
          res.status(400).json({
            success: false,
            error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
          });
          return;
        }
      }

      const result = await ChatbotService.rescheduleAppointment(aptId, newDate, newTime, ph, resolvedTenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getState(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

      const identifier =
        extractQueryString(req.query.conversation_id) ||
        extractQueryString(req.query.conversationId) ||
        extractQueryString(req.query.phone) ||
        extractQueryString(req.query.telefon);

      if (!identifier) {
        res.json({
          conversation_id: '',
          current_intent: '',
          current_stage: 'START',
          step: '',
          context_data: {},
        });
        return;
      }

      const state = await ChatbotService.getConversationState(identifier, tenantId);
      if (state) {
        res.json({
          id: state.conversation_id,
          conversation_id: state.conversation_id,
          phone_number: state.phone_number,
          current_intent: state.current_intent || '',
          current_stage: state.current_stage || 'START',
          step: state.current_stage || '',
          context_data: state.context_data || {},
        });
      } else {
        res.json({
          conversation_id: '',
          current_intent: '',
          current_stage: 'START',
          step: '',
          context_data: {},
        });
      }
    } catch (err) {
      next(err);
    }
  }

  static async setState(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

      const {
        conversation_id,
        conversationId,
        phone,
        telefon,
        intent,
        current_intent,
        stage,
        current_stage,
        context,
        context_data,
      } = chatbotSetStateSchema.parse(req.body ?? {});

      const identifier = conversation_id || conversationId || phone || telefon;
      if (!identifier) {
        res.status(400).json({ success: false, error: 'conversation_id veya telefon zorunludur' });
        return;
      }

      const state = await ChatbotService.setConversationState(
        identifier,
        {
          intent,
          current_intent,
          stage,
          current_stage,
          context,
          context_data,
          phone: phone || telefon,
        },
        tenantId
      );
      res.json({ success: true, state });
    } catch (err) {
      next(err);
    }
  }

  static async deleteState(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);
      const parsedBody = chatbotDeleteStateSchema.parse(req.body);

      const identifier =
        parsedBody?.conversation_id ||
        parsedBody?.conversationId ||
        extractQueryString(req.query?.conversation_id) ||
        parsedBody?.phone ||
        extractQueryString(req.query?.phone) ||
        '';

      const result = await ChatbotService.deleteConversationState(identifier, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
