import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { AppointmentController } from '../controllers/appointment.controller.js';
import { ClientController } from '../controllers/client.controller.js';
import { NotesController } from '../controllers/notes.controller.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { StatsController } from '../controllers/stats.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// 1. Auth
router.post('/kullanici-girisi', AuthController.login);

// 2. Overview / Stats
router.get('/genel-istatistik', authMiddleware, StatsController.getOverview);

// 3. Appointments list
router.post('/randevulari-getir', authMiddleware, AppointmentController.getAppointments);
router.get('/randevulari-getir', authMiddleware, AppointmentController.getAppointments);
router.get('/musteri-randevulari', authMiddleware, AppointmentController.getClientAppointments);

// 4. Live Search & Clients List
router.get('/arama', authMiddleware, ClientController.searchClients);
router.get('/musteriler', authMiddleware, ClientController.searchClients);

// 5. Add appointment
router.post('/ekle-dashboard', authMiddleware, AppointmentController.createAppointment);

// 6. Update appointment
router.post('/guncelleme', authMiddleware, AppointmentController.updateAppointment);

// 7. Batch update
router.post('/guncelleme-toplu', authMiddleware, AppointmentController.batchUpdate);

// 8. Delete appointment
router.post('/randevu-sil', authMiddleware, AppointmentController.deleteAppointment);

// 9. Notes
router.get('/notlari-getir', authMiddleware, NotesController.getNotes);
router.post('/not-ekle', authMiddleware, NotesController.addNote);
router.post('/not-sil', authMiddleware, NotesController.deleteNote);

// 10. Update & Add client
router.post('/hasta-guncelle', authMiddleware, ClientController.updateClient);
router.post('/musteri-ekle', authMiddleware, ClientController.createClient);
router.post('/clients', authMiddleware, ClientController.createClient);

// 11. Settings
router.get('/ayarlar-getir', authMiddleware, SettingsController.getSettings);
router.post('/ayarlar-guncelle', authMiddleware, SettingsController.updateSettings);

export default router;
