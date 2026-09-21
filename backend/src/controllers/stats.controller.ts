import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { StatsService } from '../services/stats.service.js';

export class StatsController {
  static async getOverview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const stats = await StatsService.getOverview(tenantId);

      // If called via webhook path, return [stats] to match Supabase pg view format
      if (req.baseUrl.includes('webhook') || req.path.includes('genel-istatistik')) {
        res.json([stats]);
      } else {
        res.json({ success: true, data: stats });
      }
    } catch (err) {
      next(err);
    }
  }
}
