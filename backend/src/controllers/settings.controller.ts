import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireTenantId } from '../middlewares/auth.middleware.js';
import { SettingsService, updateSettingsSchema } from '../services/settings.service.js';

export class SettingsController {
  static async getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const settings = await SettingsService.getSettings(tenantId);
      res.json(settings);
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const rawPayload = req.body?.payload ? req.body.payload : req.body;
      const payload = updateSettingsSchema.parse(rawPayload);

      const result = await SettingsService.updateSettings(tenantId, payload);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
