import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { ChatbotService } from '../services/chatbot.service.js';

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
    (req.headers['x-tenant-id'] as string) ||
    (req.query.tenant_id as string) ||
    (req.body?.tenant_id as string);

  if (explicit && explicit.trim() && explicit.trim() !== authTenantId) {
    throw { status: 403, message: 'Farklı bir tenant adına işlem yapma yetkiniz yok' };
  }

  return authTenantId;
}

export class ChatbotController {
  static async getClientByPhone(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = resolveTenantId(req);

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

      const date = (req.query.date as string) || (req.query.tarih as string);
      if (!date) {
        res.status(400).json({ success: false, error: 'Tarih zorunludur (YYYY-MM-DD)' });
        return;
      }

      const duration = parseInt((req.query.duration as string) || (req.query.sure as string) || '30', 10);
      const result = await ChatbotService.getAvailableSlots(date, duration, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async bookAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { ad_soyad, telefon, tarih, saat, hizmet, sure } = req.body;
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

  static async cancelAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { appointment_id, id, telefon, phone } = req.body;
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

      const result = await ChatbotService.cancelAppointment(aptId, ph, resolvedTenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async rescheduleAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const resolvedTenantId = resolveTenantId(req);

      const { appointment_id, id, tarih, date, saat, time, telefon, phone } = req.body;
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
      } = req.body;

      const identifier = conversation_id || conversationId || phone || telefon;
      if (!identifier) {
        res.status(400).json({ success: false, error: 'conversation_id veya telefon zorunludur' });
        return;
      }

      const state = await ChatbotService.setConversationState(
        String(identifier),
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

      const identifier =
        (req.body?.conversation_id as string) ||
        (req.body?.conversationId as string) ||
        (req.query?.conversation_id as string) ||
        (req.body?.phone as string) ||
        (req.query?.phone as string);

      const result = await ChatbotService.deleteConversationState(identifier, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
