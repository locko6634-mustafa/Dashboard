import { prisma } from '../config/prisma.js';

export class CronService {
  private static timer: NodeJS.Timeout | null = null;

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
        if (app.tarih < istanbulTodayStr) {
          expiredIds.push(app.id);
          continue;
        }

        // On the same day: check start time + duration
        if (!app.baslangic_saati) continue;
        const timeParts = app.baslangic_saati.split(':');
        if (timeParts.length < 2) continue;
        const h = parseInt(timeParts[0], 10);
        const m = parseInt(timeParts[1], 10);
        if (isNaN(h) || isNaN(m)) continue;

        const startMins = h * 60 + m;
        const duration = app.sure || 30;
        const endMins = startMins + duration;

        if (endMins <= currentTotalMins) {
          expiredIds.push(app.id);
        }
      }

      if (expiredIds.length > 0) {
        const updateResult = await prisma.appointment.updateMany({
          where: { id: { in: expiredIds } },
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
    setTimeout(() => {
      CronService.sweepExpiredAppointments();
    }, 5000);

    // Schedule regular interval
    this.timer = setInterval(() => {
      CronService.sweepExpiredAppointments();
    }, intervalMinutes * 60 * 1000);
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[CronService] Stopped appointment scheduler');
    }
  }
}
