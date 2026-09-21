import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { SettingsService } from '../services/settings.service.js';

export class SettingsController {
  static async getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const settings = await SettingsService.getSettings(tenantId);
      res.json(settings);
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const payload = req.body?.payload ? req.body.payload : req.body;

      const result = await SettingsService.updateSettings(tenantId, payload);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
