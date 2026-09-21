import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { AppointmentService } from '../services/appointment.service.js';

export class AppointmentController {
  static async getAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const dateStr = (req.query.date as string) || (req.body?.date as string);
      const viewMode = (req.query.view as string) || (req.body?.view as string) || 'week';
      const lastSync = (req.body?.last_sync as string) || (req.query.last_sync as string);

      const appointments = await AppointmentService.getAppointments(tenantId, dateStr, viewMode, lastSync);
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
}
