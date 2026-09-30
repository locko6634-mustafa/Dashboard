import { prisma } from '../config/prisma.js';

export function calculateDefaultDuration(hizmet?: string | null): number {
  if (!hizmet) return 30;
  const lower = hizmet.trim().toLowerCase();
  if (lower.includes('lazer')) return 45;
  if (lower.includes('cilt bakımı') || lower.includes('cilt bakimi')) return 60;
  if (lower.includes('protez')) return 90;
  if (lower.includes('bölgesel i̇ncelme') || lower.includes('bolgesel incelme') || lower.includes('incelme')) return 45;
  return 30;
}

export function calculateEndTime(startTime: string, durationMinutes: number): string {
  if (!startTime) return '';
  const parts = startTime.split(':');
  if (parts.length < 2) return startTime;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return startTime;

  const totalMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const sec = parts[2] ? `:${parts[2]}` : ':00';
  return `${pad(endH)}:${pad(endM)}${sec}`;
}

export class AppointmentService {
  static async getAppointments(
    tenantId: string, 
    dateStr?: string, 
    viewMode: string = 'week', 
    lastSync?: string,
    startDate?: string,
    endDate?: string
  ) {
    let minDate: string;
    let maxDate: string;

    if (startDate && endDate) {
      minDate = startDate <= endDate ? startDate : endDate;
      maxDate = startDate <= endDate ? endDate : startDate;
    } else if (startDate && !endDate) {
      minDate = startDate;
      maxDate = '2099-12-31';
    } else if (!startDate && endDate) {
      minDate = '1970-01-01';
      maxDate = endDate;
    } else if (viewMode === 'all') {
      minDate = '1970-01-01';
      maxDate = '2099-12-31';
    } else if (viewMode === 'month') {
      const today = new Date();
      const todayStr = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(today);

      const queryDateStr = dateStr || todayStr;
      const targetDate = new Date(queryDateStr);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const firstDay = new Date(year, month, 1);

      const start = new Date(firstDay);
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start.setDate(start.getDate() - diff);

      const end = new Date(start);
      end.setDate(start.getDate() + 41);

      minDate = start.toISOString().split('T')[0];
      maxDate = end.toISOString().split('T')[0];
    } else {
      const today = new Date();
      const todayStr = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(today);

      const queryDateStr = dateStr || todayStr;
      const targetDate = new Date(queryDateStr);
      const day = targetDate.getDay();
      const diffToMon = targetDate.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(targetDate);
      mon.setDate(diffToMon);

      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const baslangicStr = mon.toISOString().split('T')[0];
      const bitisStr = sun.toISOString().split('T')[0];

      minDate = baslangicStr < todayStr ? baslangicStr : todayStr;
      maxDate = bitisStr > todayStr ? bitisStr : todayStr;
    }

    const whereClause: any = {
      tenant_id: tenantId,
      deleted_at: null,
      tarih: {
        gte: minDate,
        lte: maxDate,
      },
    };

    if (lastSync) {
      whereClause.updated_at = {
        gte: new Date(lastSync),
      };
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        client: true,
      },
      orderBy: [
        { tarih: 'asc' },
        { baslangic_saati: 'asc' },
      ],
    });

    // Map to the exact whitelist shape expected by frontend
    return appointments.map((a) => {
      const c = a.client;
      const saat = a.baslangic_saati ? a.baslangic_saati.substring(0, 5) : '';
      return {
        id: a.id,
        randevu_id: a.id,
        hasta_id: a.hasta_id,
        ad_soyad: c?.ad_soyad || 'İsimsiz',
        telefon: c?.telefon || '',
        kronik_rahatsizlik: c?.kronik_rahatsizlik || '',
        paket_adi: c?.paket_adi || 'Paket Seçilmedi',
        toplam_seans: c?.toplam_seans ?? 0,
        gelinen_seans: c?.gelinen_seans ?? 0,
        toplam_tutar: c?.toplam_tutar ? Number(c.toplam_tutar) : 0,
        alinan_odeme: c?.alinan_odeme ? Number(c.alinan_odeme) : 0,
        tarih: a.tarih,
        baslangic_saati: a.baslangic_saati,
        saat: saat,
        bitis_saati: a.bitis_saati || '',
        durum: a.durum || 'Bekliyor',
        hizmet: a.hizmet || '',
        sure: a.sure,
        created_at: a.created_at,
        updated_at: a.updated_at,
        deleted_at: a.deleted_at,
        tenant_id: a.tenant_id,
      };
    });
  }

  static async createAppointment(tenantId: string, data: any) {
    let hastaId = data.hasta_id;

    // Handle is_new client
    if (data.is_new === true || data.is_new === 'true' || !hastaId) {
      const newClient = await prisma.client.create({
        data: {
          tenant_id: tenantId,
          ad_soyad: data.ad_soyad || 'İsimsiz Müşteri',
          telefon: data.telefon || '',
          kronik_rahatsizlik: data.kronik_rahatsizlik || null,
          paket_adi: data.paket_adi || null,
          toplam_seans: parseInt(data.toplam_seans, 10) || 0,
          gelinen_seans: parseInt(data.gelinen_seans, 10) || 0,
          toplam_tutar: data.toplam_tutar ? Number(data.toplam_tutar) : 0,
          alinan_odeme: data.alinan_odeme ? Number(data.alinan_odeme) : 0,
        },
      });
      hastaId = newClient.id;
    }

    const sure = parseInt(data.sure, 10) || calculateDefaultDuration(data.hizmet);
    const baslangicSaati = (data.saat || data.baslangic_saati || '09:00').trim();
    const bitisSaati = data.bitis_saati || calculateEndTime(baslangicSaati, sure);

    const appointment = await prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        hasta_id: hastaId,
        tarih: data.tarih,
        baslangic_saati: baslangicSaati,
        bitis_saati: bitisSaati,
        durum: data.durum || 'Bekliyor',
        hizmet: data.hizmet || 'Diğer',
        sure: sure,
      },
      include: {
        client: true,
      },
    });

    return {
      success: true,
      data: appointment,
      id: appointment.id,
      randevu_id: appointment.id,
    };
  }

  static async updateAppointment(tenantId: string, id: string, data: any) {
    const existing = await prisma.appointment.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });

    if (!existing) {
      throw { status: 404, message: 'Randevu bulunamadı' };
    }

    const updateData: any = {};

    if (data.durum !== undefined) updateData.durum = data.durum;
    if (data.tarih !== undefined) updateData.tarih = data.tarih;
    if (data.saat !== undefined || data.baslangic_saati !== undefined) {
      updateData.baslangic_saati = data.saat || data.baslangic_saati;
    }
    if (data.sure !== undefined) {
      updateData.sure = parseInt(data.sure, 10);
    }
    if (data.bitis_saati !== undefined) {
      updateData.bitis_saati = data.bitis_saati;
    } else if (updateData.baslangic_saati || updateData.sure) {
      const startTime = updateData.baslangic_saati || existing.baslangic_saati;
      const duration = updateData.sure ?? existing.sure ?? 30;
      updateData.bitis_saati = calculateEndTime(startTime, duration);
    }
    if (data.hizmet !== undefined) updateData.hizmet = data.hizmet;

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: { client: true },
    });

    return { success: true, data: updated };
  }

  static async batchUpdateAppointments(tenantId: string, ids: string[] | string, data?: any) {
    let idList: string[] = [];
    if (Array.isArray(ids)) {
      idList = ids;
    } else if (typeof ids === 'string') {
      idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (idList.length === 0) {
      return { success: true, count: 0 };
    }

    const newStatus = data?.durum || 'Tamamlandı';

    const result = await prisma.appointment.updateMany({
      where: {
        id: { in: idList },
        tenant_id: tenantId,
        deleted_at: null,
      },
      data: {
        durum: newStatus,
      },
    });

    return { success: true, count: result.count };
  }

  static async deleteAppointment(tenantId: string, id: string) {
    const existing = await prisma.appointment.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });

    if (!existing) {
      throw { status: 404, message: 'Randevu bulunamadı veya zaten silinmiş' };
    }

    await prisma.appointment.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true, message: 'Randevu başarıyla silindi' };
  }

  static async getClientAppointments(tenantId: string, clientId: string) {
    const appointments = await prisma.appointment.findMany({
      where: {
        tenant_id: tenantId,
        hasta_id: clientId,
        deleted_at: null,
      },
      include: {
        client: true,
      },
      orderBy: [
        { tarih: 'desc' },
        { baslangic_saati: 'desc' },
      ],
    });

    return appointments.map((a) => {
      const c = a.client;
      const saat = a.baslangic_saati ? a.baslangic_saati.substring(0, 5) : '';
      return {
        id: a.id,
        randevu_id: a.id,
        hasta_id: a.hasta_id,
        ad_soyad: c?.ad_soyad || 'İsimsiz',
        telefon: c?.telefon || '',
        kronik_rahatsizlik: c?.kronik_rahatsizlik || '',
        paket_adi: c?.paket_adi || 'Paket Seçilmedi',
        toplam_seans: c?.toplam_seans ?? 0,
        gelinen_seans: c?.gelinen_seans ?? 0,
        toplam_tutar: c?.toplam_tutar ? Number(c.toplam_tutar) : 0,
        alinan_odeme: c?.alinan_odeme ? Number(c.alinan_odeme) : 0,
        tarih: a.tarih,
        saat,
        sure: a.sure,
        bitis_saati: a.bitis_saati ? a.bitis_saati.substring(0, 5) : '',
        durum: a.durum,
        hizmet: a.hizmet,
        created_at: a.created_at,
        updated_at: a.updated_at,
      };
    });
  }
}
