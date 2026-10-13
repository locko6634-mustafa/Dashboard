import { Request, Response, NextFunction } from 'express';
import { ChatbotService } from '../services/chatbot.service.js';
import { prisma } from '../config/prisma.js';

/**
 * Multi-tenant safe tenant resolution for chatbot requests.
 * Uses header x-tenant-id, body tenant_id, or query tenant_id.
 * If not supplied, falls back to the single active tenant only if exactly 1 active tenant exists.
 */
async function resolveTenantId(req: Request): Promise<string | null> {
  const explicit =
    (req.headers['x-tenant-id'] as string) ||
    (req.query.tenant_id as string) ||
    (req.body?.tenant_id as string);

  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  try {
    const activeTenants = await prisma.tenant.findMany({
      where: { durum: 'Aktif' },
      select: { id: true },
      take: 2,
    });
    if (activeTenants.length === 1) {
      return activeTenants[0].id;
    }
  } catch {
    // DB error fallback
  }

  return null;
}

export class ChatbotController {
  static async getClientByPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const phone = (req.query.phone as string) || (req.query.telefon as string);
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

      const tenantId = await resolveTenantId(req);
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
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

  static async getAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const phone = (req.query.phone as string) || (req.query.telefon as string);
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

      const tenantId = await resolveTenantId(req);
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
        return;
      }

      const activeOnly = req.query.active !== 'false';
      const result = await ChatbotService.getAppointmentsByPhone(phone, activeOnly, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getAvailableSlots(req: Request, res: Response, next: NextFunction) {
    try {
      const date = (req.query.date as string) || (req.query.tarih as string);
      if (!date) {
        res.status(400).json({ success: false, error: 'Tarih zorunludur (YYYY-MM-DD)' });
        return;
      }

      const tenantId = await resolveTenantId(req);
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
        return;
      }

      const duration = parseInt((req.query.duration as string) || (req.query.sure as string) || '30', 10);
      const result = await ChatbotService.getAvailableSlots(date, duration, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async bookAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { ad_soyad, telefon, tarih, saat, hizmet, sure, tenant_id } = req.body;
      if (!telefon || !tarih || !saat) {
        res.status(400).json({ success: false, error: 'Telefon, tarih ve saat zorunludur' });
        return;
      }

      const cleaned = String(telefon).replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const resolvedTenantId = await resolveTenantId(req);
      if (!resolvedTenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
        return;
      }

      const result = await ChatbotService.bookAppointment({
        ad_soyad,
        telefon,
        tarih,
        saat,
        hizmet,
        sure: sure ? parseInt(sure, 10) : undefined,
        tenant_id: resolvedTenantId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointment_id, id, telefon, phone, tenant_id } = req.body;
      const aptId = appointment_id || id;
      const ph = telefon || phone;

      if (!aptId || !ph) {
        res.status(400).json({ success: false, error: 'Randevu ID ve telefon numarası zorunludur' });
        return;
      }

      const cleaned = String(ph).replace(/\D/g, '');
      if (cleaned.length < 10) {
        res.status(400).json({
          success: false,
          error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
        });
        return;
      }

      const resolvedTenantId = await resolveTenantId(req);
      if (!resolvedTenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
        return;
      }

      const result = await ChatbotService.cancelAppointment(aptId, ph, resolvedTenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointment_id, id, tarih, date, saat, time, telefon, phone, tenant_id } = req.body;
      const aptId = appointment_id || id;
      const newDate = tarih || date;
      const newTime = saat || time;
      const ph = telefon || phone;

      if (!aptId || !newDate || !newTime) {
        res.status(400).json({ success: false, error: 'Randevu ID, yeni tarih ve yeni saat zorunludur' });
        return;
      }

      if (ph) {
        const cleaned = String(ph).replace(/\D/g, '');
        if (cleaned.length < 10) {
          res.status(400).json({
            success: false,
            error: 'Geçersiz telefon numarası. Lütfen en az 10 haneli telefon numarası giriniz.',
          });
          return;
        }
      }

      const resolvedTenantId = await resolveTenantId(req);
      if (!resolvedTenantId) {
        res.status(400).json({ success: false, error: 'Multi-tenant ortamında tenant_id parametresi zorunludur' });
        return;
      }

      const result = await ChatbotService.rescheduleAppointment(aptId, newDate, newTime, ph, resolvedTenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getState(req: Request, res: Response, next: NextFunction) {
    try {
      const identifier =
        (req.query.conversation_id as string) ||
        (req.query.conversationId as string) ||
        (req.query.phone as string) ||
        (req.query.telefon as string);

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

      const state = await ChatbotService.getConversationState(identifier);
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

  static async setState(req: Request, res: Response, next: NextFunction) {
    try {
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
      } = req.body;

      const identifier = conversation_id || conversationId || phone || telefon;
      if (!identifier) {
        res.status(400).json({ success: false, error: 'conversation_id veya telefon zorunludur' });
        return;
      }

      const state = await ChatbotService.setConversationState(String(identifier), {
        intent,
        current_intent,
        stage,
        current_stage,
        context,
        context_data,
        phone: phone || telefon,
      });
      res.json({ success: true, state });
    } catch (err) {
      next(err);
    }
  }

  static async deleteState(req: Request, res: Response, next: NextFunction) {
    try {
      const identifier =
        (req.body?.conversation_id as string) ||
        (req.body?.conversationId as string) ||
        (req.query?.conversation_id as string) ||
        (req.body?.phone as string) ||
        (req.query?.phone as string);

      const result = await ChatbotService.deleteConversationState(identifier);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
