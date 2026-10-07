import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { AppointmentController } from '../controllers/appointment.controller.js';
import { ClientController } from '../controllers/client.controller.js';
import { NotesController } from '../controllers/notes.controller.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { StatsController } from '../controllers/stats.controller.js';
import { ChatbotController } from '../controllers/chatbot.controller.js';
import { adminRoutes } from './admin.routes.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Super Admin APIs
router.use('/admin', adminRoutes);

// Health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'randevu-paneli-backend', timestamp: new Date().toISOString() });
});

// Auth
router.post('/auth/login', AuthController.login);

// Stats
router.get('/stats/overview', authMiddleware, StatsController.getOverview);

// Appointments
router.get('/appointments', authMiddleware, AppointmentController.getAppointments);
router.post('/appointments/list', authMiddleware, AppointmentController.getAppointments);
router.post('/appointments', authMiddleware, AppointmentController.createAppointment);
router.patch('/appointments/:id', authMiddleware, AppointmentController.updateAppointment);
router.put('/appointments/:id', authMiddleware, AppointmentController.updateAppointment);
router.post('/appointments/:id', authMiddleware, AppointmentController.updateAppointment);
router.delete('/appointments/:id', authMiddleware, AppointmentController.deleteAppointment);
router.post('/appointments/:id/delete', authMiddleware, AppointmentController.deleteAppointment);
router.post('/appointments/batch', authMiddleware, AppointmentController.batchUpdate);

// Clients
router.get('/clients/search', authMiddleware, ClientController.searchClients);
router.post('/clients', authMiddleware, ClientController.createClient);
router.get('/clients/:id', authMiddleware, ClientController.getClientById);
router.put('/clients/:id', authMiddleware, ClientController.updateClient);
router.patch('/clients/:id', authMiddleware, ClientController.updateClient);
router.post('/clients/:id', authMiddleware, ClientController.updateClient);

// Notes
router.get('/notes', authMiddleware, NotesController.getNotes);
router.post('/notes', authMiddleware, NotesController.addNote);
router.delete('/notes/:id', authMiddleware, NotesController.deleteNote);
router.post('/notes/:id/delete', authMiddleware, NotesController.deleteNote);

// Settings
router.get('/settings', authMiddleware, SettingsController.getSettings);
router.post('/settings', authMiddleware, SettingsController.updateSettings);

// Chatbot APIs
router.get('/chatbot/client-by-phone', ChatbotController.getClientByPhone);
router.get('/chatbot/appointments', ChatbotController.getAppointments);
router.get('/chatbot/available-slots', ChatbotController.getAvailableSlots);
router.post('/chatbot/appointments', ChatbotController.bookAppointment);
router.post('/chatbot/cancel', ChatbotController.cancelAppointment);
router.post('/chatbot/reschedule', ChatbotController.rescheduleAppointment);
router.get('/chatbot/state', ChatbotController.getState);
router.post('/chatbot/state', ChatbotController.setState);
router.delete('/chatbot/state', ChatbotController.deleteState);
router.post('/chatbot/state/delete', ChatbotController.deleteState);

export default router;
