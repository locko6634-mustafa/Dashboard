import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireTenantId } from '../middlewares/auth.middleware.js';
import {
  AppointmentService,
  batchUpdateAppointmentSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from '../services/appointment.service.js';
import { extractQueryString } from '../utils/query.util.js';

export { extractQueryString };

export class AppointmentController {
  static async getAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const body = req.body?.payload || req.body || {};
      const dateStr =
        extractQueryString(req.query.date) ||
        extractQueryString(req.query.tarih) ||
        extractQueryString(body.date) ||
        extractQueryString(body.tarih);
      const viewMode =
        extractQueryString(req.query.view) ||
        extractQueryString(req.query.gorunum) ||
        extractQueryString(body.view) ||
        extractQueryString(body.gorunum) ||
        'week';
      const startDate =
        extractQueryString(req.query.startDate) ||
        extractQueryString(req.query.start_date) ||
        extractQueryString(req.query.baslangic) ||
        extractQueryString(body.startDate) ||
        extractQueryString(body.start_date) ||
        extractQueryString(body.baslangic);
      const endDate =
        extractQueryString(req.query.endDate) ||
        extractQueryString(req.query.end_date) ||
        extractQueryString(req.query.bitis) ||
        extractQueryString(body.endDate) ||
        extractQueryString(body.end_date) ||
        extractQueryString(body.bitis);
      const lastSync = extractQueryString(body.last_sync) || extractQueryString(req.query.last_sync);

      const appointments = await AppointmentService.getAppointments(tenantId, dateStr, viewMode, lastSync, startDate, endDate);
      res.json(appointments);
    } catch (err) {
      next(err);
    }
  }

  static async createAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const rawData = req.body?.payload ? req.body.payload : req.body;
      const data = createAppointmentSchema.parse(rawData);

      const result = await AppointmentService.createAppointment(tenantId, data);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const rawData = req.body?.payload ? req.body.payload : req.body;
      const data = updateAppointmentSchema.parse(rawData);
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
      const tenantId = requireTenantId(req);
      const rawData = req.body?.payload ? req.body.payload : req.body;
      const parsed = batchUpdateAppointmentSchema.parse({
        ...rawData,
        ids: rawData?.ids ?? req.body?.ids,
      });

      const result = await AppointmentService.batchUpdateAppointments(tenantId, parsed.ids, parsed);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
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
      const tenantId = requireTenantId(req);
      const clientId = extractQueryString(req.query.id) || extractQueryString(req.query.hasta_id) || req.params.id;

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
