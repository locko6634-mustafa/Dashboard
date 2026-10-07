import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { adminMiddleware } from '../middlewares/admin.middleware.js';

const router = Router();

// Onboarding & Auth
router.get('/setup-status', AdminController.checkSetup);
router.post('/setup', AdminController.setup);
router.post('/login', AdminController.login);

// Korumalı Süper Admin Rotaları
router.get('/stats', adminMiddleware, AdminController.getStats);
router.get('/tenants', adminMiddleware, AdminController.listTenants);
router.post('/tenants', adminMiddleware, AdminController.createTenant);
router.put('/tenants/:id', adminMiddleware, AdminController.updateTenant);
router.patch('/tenants/:id', adminMiddleware, AdminController.updateTenant);
router.post('/tenants/:id/api-key', adminMiddleware, AdminController.regenerateApiKey);
router.post('/tenants/:id/impersonate', adminMiddleware, AdminController.impersonate);
router.delete('/tenants/:id', adminMiddleware, AdminController.deleteTenant);
router.post('/tenants/:id/delete', adminMiddleware, AdminController.deleteTenant);

export { router as adminRoutes };
