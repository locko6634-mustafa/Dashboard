import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { calculateDefaultDuration, calculateEndTime, hasAppointmentConflict } from './appointment.service.js';

export class ChatbotService {
  static async getClientByPhone(phone: string, tenantId?: string) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      return null;
    }
    const targetDigits = cleaned.slice(-10);
    const client = await prisma.client.findFirst({
      where: {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        telefon: { contains: targetDigits },
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

    const whereClause: Prisma.AppointmentWhereInput = {
      hasta_id: client.id,
      deleted_at: null,
      ...(tenantId ? { tenant_id: tenantId } : {}),
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

  static async getAvailableSlots(date: string, durationMinutes: number = 30, tenantId: string) {
    if (!tenantId || !tenantId.trim()) {
      throw { status: 400, message: 'tenant_id zorunludur' };
    }

    // Salon çalışma saatleri (varsayılan: 09:00 - 19:00)
    let startHour = 9;
    let endHour = 19;
    let slotStep = 15; // 15 dk

    try {
      const calSetting = await prisma.appSetting.findFirst({
        where: { tenant_id: tenantId, setting_key: 'calendar' },
      });
      if (
        calSetting &&
        calSetting.setting_value &&
        typeof calSetting.setting_value === 'object' &&
        !Array.isArray(calSetting.setting_value)
      ) {
        const val = calSetting.setting_value as Record<string, unknown>;
        if (val.START_HOUR !== undefined) startHour = Number(val.START_HOUR);
        if (val.END_HOUR !== undefined) endHour = Number(val.END_HOUR);
        if (val.SLOT_MINS !== undefined) slotStep = Number(val.SLOT_MINS);
      }
    } catch {
      // Varsayılan ayarlarla devam et
    }

    // Get all existing appointments on this date
    const existing = await prisma.appointment.findMany({
      where: {
        tenant_id: tenantId,
        tarih: date,
        deleted_at: null,
        durum: { not: 'İptal' },
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
    tenant_id: string;
  }) {
    const tenantId = data.tenant_id;
    if (!tenantId) {
      throw { status: 400, message: 'tenant_id zorunludur' };
    }

    const cleanedPhone = data.telefon.replace(/\D/g, '');
    if (cleanedPhone.length < 10) {
      throw { status: 400, message: 'Geçersiz telefon numarası' };
    }
    const targetDigits = cleanedPhone.slice(-10);

    const duration = data.sure || calculateDefaultDuration(data.hizmet);
    const bitisSaati = calculateEndTime(data.saat, duration);

    return await prisma.$transaction(
      async (tx) => {
        const lockKey = `${tenantId}:${data.tarih}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // Conflict check first to avoid creating orphan clients on conflict
        const hasConflict = await hasAppointmentConflict({
          tx,
          tenantId,
          tarih: data.tarih,
          baslangicSaati: data.saat,
          bitisSaati,
          sure: duration,
        });

        if (hasConflict) {
          return {
            success: false,
            conflict: true,
            message: 'Seçtiğiniz tarih ve saatte başka bir randevu mevcuttur. Lütfen başka bir saat seçiniz.',
          };
        }

        // Check or create client inside transaction
        let client = await tx.client.findFirst({
          where: {
            tenant_id: tenantId,
            telefon: { contains: targetDigits },
          },
        });

        if (!client) {
          client = await tx.client.create({
            data: {
              tenant_id: tenantId,
              ad_soyad: data.ad_soyad || 'Chatbot Danışanı',
              telefon: data.telefon,
            },
          });
        }

        const appointment = await tx.appointment.create({
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  static async cancelAppointment(appointmentId: string, phone: string, tenantId: string) {
    if (!tenantId || !tenantId.trim()) {
      throw { status: 400, message: 'tenant_id zorunludur' };
    }

    const client = await this.getClientByPhone(phone, tenantId);
    if (!client) {
      return { success: false, message: 'Bu telefon numarasına ait müşteri bulunamadı' };
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hasta_id: client.id,
        tenant_id: tenantId,
        deleted_at: null,
      },
    });

    if (!appointment) {
      return { success: false, message: 'İlgili randevu bulunamadı veya müşteriye ait değil' };
    }

    const updated = await prisma.appointment.updateMany({
      where: { id: appointmentId, tenant_id: tenantId, deleted_at: null },
      data: { durum: 'İptal' },
    });

    if (updated.count === 0) {
      return { success: false, message: 'İlgili randevu bulunamadı veya müşteriye ait değil' };
    }

    return { success: true, message: 'Randevunuz başarıyla iptal edildi.' };
  }

  static async rescheduleAppointment(
    appointmentId: string,
    newDate: string,
    newTime: string,
    phone: string | undefined,
    tenantId: string
  ) {
    if (!tenantId || !tenantId.trim()) {
      throw { status: 400, message: 'tenant_id zorunludur' };
    }

    let clientId: string | undefined;
    if (phone) {
      const client = await this.getClientByPhone(phone, tenantId);
      if (!client) return { success: false, message: 'Müşteri bulunamadı' };
      clientId = client.id;
    }

    return await prisma.$transaction(
      async (tx) => {
        const whereClause: Prisma.AppointmentWhereInput = {
          id: appointmentId,
          tenant_id: tenantId,
          deleted_at: null,
          ...(clientId ? { hasta_id: clientId } : {}),
        };

        const appointment = await tx.appointment.findFirst({ where: whereClause });
        if (!appointment) {
          return { success: false, message: 'Randevu bulunamadı' };
        }

        const duration = appointment.sure || calculateDefaultDuration(appointment.hizmet);
        const newEndTime = calculateEndTime(newTime, duration);

        const lockKey = `${tenantId}:${newDate}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const hasConflict = await hasAppointmentConflict({
          tx,
          tenantId,
          tarih: newDate,
          baslangicSaati: newTime,
          bitisSaati: newEndTime,
          sure: duration,
          excludeId: appointmentId,
        });

        if (hasConflict) {
          return {
            success: false,
            conflict: true,
            message: 'Seçtiğiniz tarih ve saatte başka bir randevu mevcuttur. Lütfen başka bir saat seçiniz.',
          };
        }

        const updated = await tx.appointment.updateMany({
          where: { id: appointmentId, tenant_id: tenantId, deleted_at: null },
          data: {
            tarih: newDate,
            baslangic_saati: newTime,
            bitis_saati: newEndTime,
            durum: 'Bekliyor',
          },
        });

        if (updated.count === 0) {
          return { success: false, message: 'Randevu bulunamadı' };
        }

        return {
          success: true,
          message: 'Randevunuz başarıyla güncellendi.',
          id: appointment.id,
          tarih: newDate,
          saat: newTime,
          bitis_saati: newEndTime,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  static async getConversationState(identifier: string, tenantId: string) {
    if (!identifier || !tenantId) return null;
    const cleaned = identifier.replace(/\D/g, '');
    return await prisma.conversationState.findFirst({
      where: {
        tenant_id: tenantId,
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
      context?: Prisma.InputJsonValue;
      context_data?: Prisma.InputJsonValue;
      phone?: string;
      phone_number?: string;
    },
    tenantId: string
  ) {
    if (!tenantId || !tenantId.trim()) {
      throw { status: 400, message: 'tenant_id zorunludur' };
    }
    const convId = String(identifier || (data.phone ? `conv_${data.phone}` : `conv_${Date.now()}`));
    const ph = data.phone_number || data.phone || '';
    const it = data.current_intent || data.intent || null;
    const st = data.current_stage || data.stage || 'START';
    const ctx: Prisma.InputJsonValue = data.context_data ?? data.context ?? {};

    return await prisma.conversationState.upsert({
      where: {
        conversation_id_tenant_id: {
          conversation_id: convId,
          tenant_id: tenantId,
        },
      },
      update: {
        current_intent: it,
        current_stage: st,
        context_data: ctx,
        ...(ph ? { phone_number: ph } : {}),
        updated_at: new Date(),
      },
      create: {
        conversation_id: convId,
        tenant_id: tenantId,
        phone_number: ph,
        current_intent: it,
        current_stage: st,
        context_data: ctx,
      },
    });
  }

  static async deleteConversationState(identifier: string, tenantId: string) {
    if (!identifier || !tenantId) return { success: false, message: 'ID veya tenant_id belirtilmedi' };
    const cleaned = identifier.replace(/\D/g, '');
    await prisma.conversationState.deleteMany({
      where: {
        tenant_id: tenantId,
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
