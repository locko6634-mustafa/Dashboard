import { prisma } from '../config/prisma.js';
import { calculateDefaultDuration, calculateEndTime } from './appointment.service.js';

export class ChatbotService {
  static async getClientByPhone(phone: string, tenantId?: string) {
    const cleaned = phone.replace(/\D/g, '');
    const client = await prisma.client.findFirst({
      where: {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        telefon: { contains: cleaned.length >= 10 ? cleaned.slice(-10) : cleaned },
      },
    });
    return client;
  }

  static async getAppointmentsByPhone(phone: string, activeOnly: boolean = true, tenantId?: string) {
    const client = await this.getClientByPhone(phone, tenantId);
    if (!client) {
      return { success: false, message: 'Bu telefon numarasına ait müşteri kaydı bulunamadı', appointments: [] };
    }

    const todayStr = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const whereClause: any = {
      hasta_id: client.id,
      deleted_at: null,
    };

    if (activeOnly) {
      whereClause.durum = 'Bekliyor';
      whereClause.tarih = { gte: todayStr };
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      orderBy: [{ tarih: 'asc' }, { baslangic_saati: 'asc' }],
    });

    return {
      success: true,
      client: {
        id: client.id,
        ad_soyad: client.ad_soyad,
        telefon: client.telefon,
      },
      appointments: appointments.map((a) => ({
        id: a.id,
        tarih: a.tarih,
        saat: a.baslangic_saati ? a.baslangic_saati.substring(0, 5) : '',
        bitis_saati: a.bitis_saati ? a.bitis_saati.substring(0, 5) : '',
        durum: a.durum,
        hizmet: a.hizmet,
        sure: a.sure,
      })),
    };
  }

  static async getAvailableSlots(date: string, durationMinutes: number = 30, tenantId?: string) {
    // Salon working hours: 09:00 - 19:00
    const startHour = 9;
    const endHour = 19;
    const slotStep = 15; // 15 mins

    // Get all existing appointments on this date
    const existing = await prisma.appointment.findMany({
      where: {
        tarih: date,
        deleted_at: null,
        durum: { not: 'İptal' },
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: {
        baslangic_saati: true,
        bitis_saati: true,
        sure: true,
      },
    });

    // Busy ranges in minutes from 00:00
    const busyRanges = existing.map((a) => {
      const [sh, sm] = a.baslangic_saati.split(':').map(Number);
      const startMins = sh * 60 + sm;
      let endMins: number;
      if (a.bitis_saati) {
        const [eh, em] = a.bitis_saati.split(':').map(Number);
        endMins = eh * 60 + em;
      } else {
        endMins = startMins + (a.sure || 30);
      }
      return { start: startMins, end: endMins };
    });

    const openMins = startHour * 60;
    const closeMins = endHour * 60;
    const availableSlots: string[] = [];

    const pad = (n: number) => n.toString().padStart(2, '0');

    for (let m = openMins; m + durationMinutes <= closeMins; m += slotStep) {
      const slotEnd = m + durationMinutes;

      // Check conflict
      const hasConflict = busyRanges.some(
        (b) => Math.max(m, b.start) < Math.min(slotEnd, b.end)
      );

      if (!hasConflict) {
        const slotH = Math.floor(m / 60);
        const slotM = m % 60;
        availableSlots.push(`${pad(slotH)}:${pad(slotM)}`);
      }
    }

    return {
      success: true,
      date,
      duration: durationMinutes,
      slots: availableSlots,
    };
  }

  static async bookAppointment(data: {
    ad_soyad: string;
    telefon: string;
    tarih: string;
    saat: string;
    hizmet?: string;
    sure?: number;
    tenant_id?: string;
  }) {
    let tenantId = data.tenant_id;
    if (!tenantId) {
      const firstTenant = await prisma.tenant.findFirst();
      if (!firstTenant) throw new Error('Tenant bulunamadı');
      tenantId = firstTenant.id;
    }

    // Check or create client
    let client = await this.getClientByPhone(data.telefon, tenantId);
    if (!client) {
      client = await prisma.client.create({
        data: {
          tenant_id: tenantId,
          ad_soyad: data.ad_soyad || 'Chatbot Danışanı',
          telefon: data.telefon,
        },
      });
    }

    const duration = data.sure || calculateDefaultDuration(data.hizmet);
    const bitisSaati = calculateEndTime(data.saat, duration);

    // Conflict check
    const conflicts = await prisma.appointment.findMany({
      where: {
        tenant_id: tenantId,
        tarih: data.tarih,
        deleted_at: null,
        durum: { not: 'İptal' },
      },
    });

    const [reqH, reqM] = data.saat.split(':').map(Number);
    const reqStart = reqH * 60 + reqM;
    const reqEnd = reqStart + duration;

    const hasConflict = conflicts.some((c) => {
      const [cStartH, cStartM] = c.baslangic_saati.split(':').map(Number);
      const cStart = cStartH * 60 + cStartM;
      let cEnd = cStart + (c.sure || 30);
      if (c.bitis_saati) {
        const [ceh, cem] = c.bitis_saati.split(':').map(Number);
        cEnd = ceh * 60 + cem;
      }
      return Math.max(reqStart, cStart) < Math.min(reqEnd, cEnd);
    });

    if (hasConflict) {
      return {
        success: false,
        conflict: true,
        message: 'Seçtiğiniz tarih ve saatte başka bir randevu mevcuttur. Lütfen başka bir saat seçiniz.',
      };
    }

    const appointment = await prisma.appointment.create({
      data: {
        tenant_id: tenantId,
        hasta_id: client.id,
        tarih: data.tarih,
        baslangic_saati: data.saat,
        bitis_saati: bitisSaati,
        durum: 'Bekliyor',
        hizmet: data.hizmet || 'Diğer',
        sure: duration,
      },
    });

    return {
      success: true,
      message: 'Randevunuz başarıyla oluşturuldu.',
      appointment_id: appointment.id,
      tarih: appointment.tarih,
      saat: appointment.baslangic_saati,
      bitis_saati: appointment.bitis_saati,
      hizmet: appointment.hizmet,
      musteri: client.ad_soyad,
    };
  }

  static async cancelAppointment(appointmentId: string, phone: string) {
    const client = await this.getClientByPhone(phone);
    if (!client) {
      return { success: false, message: 'Bu telefon numarasına ait müşteri bulunamadı' };
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hasta_id: client.id,
        deleted_at: null,
      },
    });

    if (!appointment) {
      return { success: false, message: 'İlgili randevu bulunamadı veya müşteriye ait değil' };
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { durum: 'İptal' },
    });

    return { success: true, message: 'Randevunuz başarıyla iptal edildi.' };
  }

  static async rescheduleAppointment(appointmentId: string, newDate: string, newTime: string, phone?: string) {
    let whereClause: any = { id: appointmentId, deleted_at: null };
    if (phone) {
      const client = await this.getClientByPhone(phone);
      if (!client) return { success: false, message: 'Müşteri bulunamadı' };
      whereClause.hasta_id = client.id;
    }

    const appointment = await prisma.appointment.findFirst({ where: whereClause });
    if (!appointment) {
      return { success: false, message: 'Randevu bulunamadı' };
    }

    const duration = appointment.sure || calculateDefaultDuration(appointment.hizmet);
    const newEndTime = calculateEndTime(newTime, duration);

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        tarih: newDate,
        baslangic_saati: newTime,
        bitis_saati: newEndTime,
        durum: 'Bekliyor',
      },
    });

    return {
      success: true,
      message: 'Randevunuz başarıyla güncellendi.',
      id: appointment.id,
      tarih: newDate,
      saat: newTime,
      bitis_saati: newEndTime,
    };
  }

  static async getConversationState(identifier: string) {
    if (!identifier) return null;
    const cleaned = identifier.replace(/\D/g, '');
    return await prisma.conversationState.findFirst({
      where: {
        OR: [
          { conversation_id: String(identifier) },
          { phone_number: identifier },
          ...(cleaned.length >= 10 ? [{ phone_number: { contains: cleaned.slice(-10) } }] : []),
        ],
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  static async setConversationState(
    identifier: string,
    data: {
      intent?: string;
      current_intent?: string;
      stage?: string;
      current_stage?: string;
      context?: any;
      context_data?: any;
      phone?: string;
      phone_number?: string;
    }
  ) {
    const convId = String(identifier || (data.phone ? `conv_${data.phone}` : `conv_${Date.now()}`));
    const ph = data.phone_number || data.phone || '';
    const it = data.current_intent || data.intent || null;
    const st = data.current_stage || data.stage || 'START';
    const ctx = data.context_data || data.context || {};

    return await prisma.conversationState.upsert({
      where: { conversation_id: convId },
      update: {
        current_intent: it,
        current_stage: st,
        context_data: ctx,
        ...(ph ? { phone_number: ph } : {}),
        updated_at: new Date(),
      },
      create: {
        conversation_id: convId,
        phone_number: ph,
        current_intent: it,
        current_stage: st,
        context_data: ctx,
      },
    });
  }

  static async deleteConversationState(identifier: string) {
    if (!identifier) return { success: false, message: 'ID belirtilmedi' };
    const cleaned = identifier.replace(/\D/g, '');
    await prisma.conversationState.deleteMany({
      where: {
        OR: [
          { conversation_id: String(identifier) },
          { phone_number: identifier },
          ...(cleaned.length >= 10 ? [{ phone_number: { contains: cleaned.slice(-10) } }] : []),
        ],
      },
    });
    return { success: true, message: 'State silindi' };
  }
}
