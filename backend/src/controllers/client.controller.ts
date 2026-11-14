import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { ClientService, createClientSchema, updateClientSchema } from '../services/client.service.js';
import { extractQueryString } from './appointment.controller.js';

export class ClientController {
  static async searchClients(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const query =
        extractQueryString(req.query.q) ||
        extractQueryString(req.query.ad_soyad) ||
        extractQueryString(req.query.query) ||
        '';

      const clients = await ClientService.searchClients(tenantId, query);
      res.json(clients);
    } catch (err) {
      next(err);
    }
  }

  static async createClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const rawData = req.body?.payload ? req.body.payload : req.body;
      const data = createClientSchema.parse(rawData);
      const result = await ClientService.createClient(tenantId, data);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updateClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const rawData = req.body?.payload ? req.body.payload : req.body;
      const data = updateClientSchema.parse(rawData);
      const id = req.params.id || data.hasta_id || data.id;

      if (!id) {
        res.status(400).json({ success: false, error: 'Müşteri ID zorunludur' });
        return;
      }

      const result = await ClientService.updateClient(tenantId, id, data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getClientById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const id = req.params.id;

      const client = await ClientService.getClientById(tenantId, id);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }
}
