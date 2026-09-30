import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { AppointmentService } from '../services/appointment.service.js';

export class AppointmentController {
  static async getAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const body = req.body?.payload || req.body || {};
      const dateStr = (req.query.date || req.query.tarih || body.date || body.tarih) as string;
      const viewMode = (req.query.view || req.query.gorunum || body.view || body.gorunum || 'week') as string;
      const startDate = (req.query.startDate || req.query.start_date || req.query.baslangic || body.startDate || body.start_date || body.baslangic) as string;
      const endDate = (req.query.endDate || req.query.end_date || req.query.bitis || body.endDate || body.end_date || body.bitis) as string;
      const lastSync = (body.last_sync || req.query.last_sync) as string;

      const appointments = await AppointmentService.getAppointments(tenantId, dateStr, viewMode, lastSync, startDate, endDate);
      res.json(appointments);
    } catch (err) {
      next(err);
    }
  }

  static async createAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;

      const result = await AppointmentService.createAppointment(tenantId, data);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;
      const id = req.params.id || data.id || data.randevu_id;

      if (!id) {
        res.status(400).json({ success: false, error: 'Randevu ID zorunludur' });
        return;
      }

      const result = await AppointmentService.updateAppointment(tenantId, id, data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async batchUpdate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;
      const ids = data.ids || req.body.ids;

      if (!ids) {
        res.status(400).json({ success: false, error: 'Randevu ID listesi zorunludur' });
        return;
      }

      const result = await AppointmentService.batchUpdateAppointments(tenantId, ids, data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;
      const id = req.params.id || data.randevu_id || data.id;

      if (!id) {
        res.status(400).json({ success: false, error: 'Randevu ID zorunludur' });
        return;
      }

      const result = await AppointmentService.deleteAppointment(tenantId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getClientAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const clientId = (req.query.id as string) || (req.query.hasta_id as string) || req.params.id;

      if (!clientId) {
        res.status(400).json({ success: false, error: 'Müşteri ID zorunludur' });
        return;
      }

      const appointments = await AppointmentService.getClientAppointments(tenantId, clientId);
      res.json(appointments);
    } catch (err) {
      next(err);
    }
  }
}
