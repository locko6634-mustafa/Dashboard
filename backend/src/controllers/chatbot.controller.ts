import { Request, Response, NextFunction } from 'express';
import { ChatbotService } from '../services/chatbot.service.js';

export class ChatbotController {
  static async getClientByPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const phone = (req.query.phone as string) || (req.query.telefon as string);
      if (!phone) {
        res.status(400).json({ success: false, error: 'Telefon numarası zorunludur' });
        return;
      }
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
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
      const activeOnly = req.query.active !== 'false';
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
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
      const duration = parseInt((req.query.duration as string) || (req.query.sure as string) || '30', 10);
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
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
      const result = await ChatbotService.bookAppointment({
        ad_soyad,
        telefon,
        tarih,
        saat,
        hizmet,
        sure: sure ? parseInt(sure, 10) : undefined,
        tenant_id: tenant_id || (req.headers['x-tenant-id'] as string),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointment_id, id, telefon, phone } = req.body;
      const aptId = appointment_id || id;
      const ph = telefon || phone;

      if (!aptId || !ph) {
        res.status(400).json({ success: false, error: 'Randevu ID ve telefon numarası zorunludur' });
        return;
      }

      const result = await ChatbotService.cancelAppointment(aptId, ph);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointment_id, id, tarih, date, saat, time, telefon, phone } = req.body;
      const aptId = appointment_id || id;
      const newDate = tarih || date;
      const newTime = saat || time;
      const ph = telefon || phone;

      if (!aptId || !newDate || !newTime) {
        res.status(400).json({ success: false, error: 'Randevu ID, yeni tarih ve yeni saat zorunludur' });
        return;
      }

      const result = await ChatbotService.rescheduleAppointment(aptId, newDate, newTime, ph);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getState(req: Request, res: Response, next: NextFunction) {
    try {
      const phone = (req.query.phone as string) || (req.query.telefon as string);
      if (!phone) {
        res.status(400).json({ success: false, error: 'Telefon zorunludur' });
        return;
      }
      const state = await ChatbotService.getConversationState(phone);
      res.json({ success: true, state });
    } catch (err) {
      next(err);
    }
  }

  static async setState(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone, telefon, intent, stage, context } = req.body;
      const ph = phone || telefon;
      if (!ph) {
        res.status(400).json({ success: false, error: 'Telefon zorunludur' });
        return;
      }
      const state = await ChatbotService.setConversationState(ph, { intent, stage, context });
      res.json({ success: true, state });
    } catch (err) {
      next(err);
    }
  }
}
