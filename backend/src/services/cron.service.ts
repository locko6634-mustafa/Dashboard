import { prisma } from '../config/prisma.js';
import { isValidDateString, parseTimeToMinutes } from '../utils/dateTime.util.js';

export class CronService {
  private static timer: NodeJS.Timeout | null = null;
  private static startupTimer: NodeJS.Timeout | null = null;

  static async sweepExpiredAppointments() {
    try {
      const now = new Date();
      const istanbulFormatter = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = istanbulFormatter.formatToParts(now);
      const year = parts.find((p) => p.type === 'year')?.value || '';
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const day = parts.find((p) => p.type === 'day')?.value || '';
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

      const istanbulTodayStr = `${year}-${month}-${day}`;
      const currentTotalMins = hour * 60 + minute;

      // Find candidates
      const candidates = await prisma.appointment.findMany({
        where: {
          durum: 'Bekliyor',
          deleted_at: null,
          tarih: { lte: istanbulTodayStr },
        },
      });

      const expiredIds: string[] = [];

      for (const app of candidates) {
        if (!isValidDateString(app.tarih)) continue;
        if (app.tarih < istanbulTodayStr) {
          expiredIds.push(app.id);
          continue;
        }

        // On the same day: check start time + duration
        if (!app.baslangic_saati) continue;
        const startMins = parseTimeToMinutes(app.baslangic_saati);
        if (startMins === null) continue;

        const duration = app.sure || 30;
        const endMins = startMins + duration;

        if (endMins <= currentTotalMins) {
          expiredIds.push(app.id);
        }
      }

      if (expiredIds.length > 0) {
        const updateResult = await prisma.appointment.updateMany({
          where: { id: { in: expiredIds }, deleted_at: null },
          data: { durum: 'Tamamlandı' },
        });
        console.log(`[CronService] Auto-completed ${updateResult.count} expired appointments at ${istanbulTodayStr} ${hour}:${minute}`);
      }
    } catch (error) {
      console.error('[CronService] Error sweeping expired appointments:', error);
    }
  }

  static start(intervalMinutes: number = 15) {
    console.log(`[CronService] Starting periodic appointment status updater (every ${intervalMinutes} mins)...`);
    // Run once on startup after 5 seconds
    this.startupTimer = setTimeout(() => {
      CronService.sweepExpiredAppointments().catch((err) => {
        console.error('[CronService] Initial sweep failed:', err);
      });
    }, 5000);
    this.startupTimer.unref();

    // Schedule regular interval
    this.timer = setInterval(() => {
      CronService.sweepExpiredAppointments().catch((err) => {
        console.error('[CronService] Periodic sweep failed:', err);
      });
    }, intervalMinutes * 60 * 1000);
    this.timer.unref();
  }

  static stop() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[CronService] Stopped appointment scheduler');
    }
  }
}
