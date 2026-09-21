import { prisma } from '../config/prisma.js';

export class StatsService {
  static async getOverview(tenantId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    // 1. Clients totals
    const clients = await prisma.client.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        ad_soyad: true,
        telefon: true,
        toplam_tutar: true,
        alinan_odeme: true,
        created_at: true,
      },
    });

    const total_clients = clients.length;
    let total_revenue = 0;
    let total_paid = 0;
    let current_clients = 0;
    let last_clients = 0;
    let current_revenue = 0;
    let last_revenue = 0;

    for (const c of clients) {
      const tutar = c.toplam_tutar ? Number(c.toplam_tutar) : 0;
      const odeme = c.alinan_odeme ? Number(c.alinan_odeme) : 0;
      total_revenue += tutar;
      total_paid += odeme;

      if (c.created_at) {
        if (c.created_at >= sevenDaysAgo) {
          current_clients++;
          current_revenue += tutar;
        } else if (c.created_at >= fourteenDaysAgo) {
          last_clients++;
          last_revenue += tutar;
        }
      }
    }

    const total_debt = total_revenue - total_paid;

    // 2. Appointments totals
    const appointments = await prisma.appointment.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
      },
      select: {
        durum: true,
        hizmet: true,
        tarih: true,
      },
    });

    const total_appointments = appointments.length;
    let completed_apps = 0;
    let canceled_apps = 0;
    let current_apps = 0;
    let last_apps = 0;
    let current_completed = 0;
    let current_closed = 0;
    let last_completed = 0;
    let last_closed = 0;

    const serviceCounts: Record<string, number> = {};

    for (const a of appointments) {
      if (a.durum === 'Tamamlandı') completed_apps++;
      if (a.durum === 'İptal') canceled_apps++;

      if (a.hizmet && a.hizmet.trim()) {
        const s = a.hizmet.trim();
        serviceCounts[s] = (serviceCounts[s] || 0) + 1;
      }

      if (a.tarih >= sevenDaysAgoStr) {
        current_apps++;
        if (a.durum === 'Tamamlandı' || a.durum === 'İptal') {
          current_closed++;
          if (a.durum === 'Tamamlandı') current_completed++;
        }
      } else if (a.tarih >= fourteenDaysAgoStr) {
        last_apps++;
        if (a.durum === 'Tamamlandı' || a.durum === 'İptal') {
          last_closed++;
          if (a.durum === 'Tamamlandı') last_completed++;
        }
      }
    }

    const success_rate =
      completed_apps + canceled_apps > 0
        ? Number(((completed_apps / (completed_apps + canceled_apps)) * 100).toFixed(1))
        : 0;

    const current_success =
      current_closed > 0 ? (current_completed / current_closed) * 100 : 0;
    const last_success =
      last_closed > 0 ? (last_completed / last_closed) * 100 : 0;

    // Service distribution
    const service_distribution = Object.entries(serviceCounts)
      .map(([hizmet, count]) => ({ hizmet, count }))
      .sort((a, b) => b.count - a.count);

    // Recent clients (latest 5)
    const recentClientsList = await prisma.client.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        ad_soyad: true,
        telefon: true,
        created_at: true,
      },
    });

    // Deltas
    const calcDelta = (current: number, last: number): number => {
      if (last > 0) {
        return Number((((current - last) / last) * 100).toFixed(1));
      }
      return current > 0 ? 100 : 0;
    };

    const delta_clients = calcDelta(current_clients, last_clients);
    const delta_appointments = calcDelta(current_apps, last_apps);
    const delta_revenue = calcDelta(current_revenue, last_revenue);
    const delta_success_rate = Number((current_success - last_success).toFixed(1));

    return {
      total_clients,
      total_revenue: String(total_revenue),
      total_paid: String(total_paid),
      total_debt: String(total_debt),
      total_appointments,
      success_rate: String(success_rate),
      service_distribution,
      recent_patients: recentClientsList,
      delta_clients: String(delta_clients),
      delta_appointments: String(delta_appointments),
      delta_revenue: String(delta_revenue),
      delta_success_rate: String(delta_success_rate),
    };
  }
}
