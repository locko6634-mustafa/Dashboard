import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service.js';

export class AdminController {
  static async checkSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.checkSetupStatus();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async setup(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, ad_soyad } = req.body;
      const result = await AdminService.setupInitialAdmin({ email, password, ad_soyad });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ success: false, error: 'E-posta ve şifre zorunludur' });
        return;
      }
      const result = await AdminService.login(email, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.getSystemStats();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const search = req.query.search as string | undefined;
      const durum = req.query.durum as string | undefined;
      const result = await AdminService.listTenants(search, durum);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.createTenant(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.updateTenant(id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async regenerateApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.regenerateApiKey(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async impersonate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.impersonateTenant(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const result = await AdminService.deleteTenant(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
