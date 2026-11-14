import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import {
  formatMinutesToTime,
  isValidDateString,
  isValidTimeString,
  parseTimeToMinutes,
} from '../utils/dateTime.util.js';

const optionalTimeSchema = z
  .string()
  .refine((val) => !val.trim() || isValidTimeString(val), {
    message: 'Saat HH:mm formatında ve geçerli olmalıdır (00:00-23:59)',
  })
  .optional();

export const createAppointmentSchema = z
  .object({
    hasta_id: z.string().optional().nullable(),
    is_new: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    ad_soyad: z.string().optional(),
    telefon: z.string().optional(),
    kronik_rahatsizlik: z.string().optional().nullable(),
    paket_adi: z.string().optional().nullable(),
    toplam_seans: z.coerce.number().int().min(0).optional(),
    gelinen_seans: z.coerce.number().int().min(0).optional(),
    toplam_tutar: z.coerce.number().min(0).optional(),
    alinan_odeme: z.coerce.number().min(0).optional(),
    tarih: z
      .string()
      .min(1, 'Tarih zorunludur')
      .refine((val) => isValidDateString(val), {
        message: 'Tarih YYYY-MM-DD formatında ve geçerli olmalıdır',
      }),
    saat: optionalTimeSchema,
    baslangic_saati: optionalTimeSchema,
    bitis_saati: optionalTimeSchema,
    sure: z.coerce.number().int().positive().optional(),
    durum: z.string().optional(),
    hizmet: z.string().optional(),
  })
  .passthrough();

export const updateAppointmentSchema = z
  .object({
    id: z.string().optional(),
    randevu_id: z.string().optional(),
    hasta_id: z.string().optional().nullable(),
    durum: z.string().optional(),
    tarih: z
      .string()
      .min(1)
      .refine((val) => isValidDateString(val), {
        message: 'Tarih YYYY-MM-DD formatında ve geçerli olmalıdır',
      })
      .optional(),
    saat: optionalTimeSchema,
    baslangic_saati: optionalTimeSchema,
    bitis_saati: optionalTimeSchema,
    sure: z.coerce.number().int().positive().optional(),
    hizmet: z.string().optional(),
  })
  .passthrough();

export const batchUpdateAppointmentSchema = z
  .object({
    ids: z.union([z.array(z.string().min(1)), z.string().min(1)]),
    durum: z.string().optional(),
  })
  .passthrough();

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type BatchUpdateAppointmentInput = z.infer<typeof batchUpdateAppointmentSchema>;

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
  const startMins = parseTimeToMinutes(startTime);
  if (startMins === null) return startTime;

  const parts = startTime.trim().split(':');
  const sec = parts[2] ? `:${parts[2]}` : ':00';
  return formatMinutesToTime(startMins + durationMinutes, sec);
}

export interface ConflictCheckParams {
  tx: Prisma.TransactionClient;
  tenantId: string;
  tarih: string;
  baslangicSaati: string;
  bitisSaati?: string | null;
  sure?: number | null;
  excludeId?: string;
}

export async function hasAppointmentConflict({
  tx,
  tenantId,
  tarih,
  baslangicSaati,
  bitisSaati,
  sure,
  excludeId,
}: ConflictCheckParams): Promise<boolean> {
  const reqStart = parseTimeToMinutes(baslangicSaati);
  if (reqStart === null) return false;

  const parsedEnd = bitisSaati ? parseTimeToMinutes(bitisSaati) : null;
  const reqEnd = parsedEnd !== null && parsedEnd > reqStart ? parsedEnd : reqStart + (sure || 30);

  const existing = await tx.appointment.findMany({
    where: {
      tenant_id: tenantId,
      tarih,
      deleted_at: null,
      durum: { not: 'İptal' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      baslangic_saati: true,
      bitis_saati: true,
      sure: true,
    },
  });

  return existing.some((c) => {
    const cStart = parseTimeToMinutes(c.baslangic_saati);
    if (cStart === null) return false;
    const cParsedEnd = c.bitis_saati ? parseTimeToMinutes(c.bitis_saati) : null;
    const cEnd = cParsedEnd !== null && cParsedEnd > cStart ? cParsedEnd : cStart + (c.sure || 30);
    return Math.max(reqStart, cStart) < Math.min(reqEnd, cEnd);
  });
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

    const whereClause: Prisma.AppointmentWhereInput = {
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

  static async createAppointment(tenantId: string, data: CreateAppointmentInput) {
    const sure = data.sure ?? calculateDefaultDuration(data.hizmet);
    const baslangicSaati = (data.saat || data.baslangic_saati || '09:00').trim();
    const bitisSaati = data.bitis_saati || calculateEndTime(baslangicSaati, sure);
    const durum = data.durum || 'Bekliyor';

    const appointment = await prisma.$transaction(
      async (tx) => {
        if (durum !== 'İptal') {
          const lockKey = `${tenantId}:${data.tarih}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

          const conflict = await hasAppointmentConflict({
            tx,
            tenantId,
            tarih: data.tarih,
            baslangicSaati,
            bitisSaati,
            sure,
          });
          if (conflict) {
            throw { status: 409, message: 'Seçilen saatte başka bir randevu bulunmaktadır' };
          }
        }

        let hastaId = data.hasta_id || undefined;

        // Handle is_new client
        if (data.is_new === true || data.is_new === 'true' || !hastaId) {
          const newClient = await tx.client.create({
            data: {
              tenant_id: tenantId,
              ad_soyad: data.ad_soyad || 'İsimsiz Müşteri',
              telefon: data.telefon || '',
              kronik_rahatsizlik: data.kronik_rahatsizlik || null,
              paket_adi: data.paket_adi || null,
              toplam_seans: data.toplam_seans ?? 0,
              gelinen_seans: data.gelinen_seans ?? 0,
              toplam_tutar: data.toplam_tutar ?? 0,
              alinan_odeme: data.alinan_odeme ?? 0,
            },
          });
          hastaId = newClient.id;
        } else {
          const clientExists = await tx.client.findFirst({
            where: { id: hastaId, tenant_id: tenantId },
          });
          if (!clientExists) {
            throw { status: 404, message: 'Belirtilen müşteri bulunamadı' };
          }
        }

        return await tx.appointment.create({
          data: {
            tenant_id: tenantId,
            hasta_id: hastaId,
            tarih: data.tarih,
            baslangic_saati: baslangicSaati,
            bitis_saati: bitisSaati,
            durum,
            hizmet: data.hizmet || 'Diğer',
            sure: sure,
          },
          include: {
            client: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return {
      success: true,
      data: appointment,
      id: appointment.id,
      randevu_id: appointment.id,
    };
  }

  static async updateAppointment(tenantId: string, id: string, data: UpdateAppointmentInput) {
    const updated = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.appointment.findFirst({
          where: { id, tenant_id: tenantId, deleted_at: null },
        });

        if (!existing) {
          throw { status: 404, message: 'Randevu bulunamadı' };
        }

        if (data.hasta_id) {
          const clientExists = await tx.client.findFirst({
            where: { id: data.hasta_id, tenant_id: tenantId },
          });
          if (!clientExists) {
            throw { status: 404, message: 'Belirtilen müşteri bulunamadı' };
          }
        }

        const updateData: {
          hasta_id?: string | null;
          durum?: string;
          tarih?: string;
          baslangic_saati?: string;
          sure?: number;
          bitis_saati?: string;
          hizmet?: string;
        } = {};

        if (data.hasta_id !== undefined) updateData.hasta_id = data.hasta_id;
        if (data.durum !== undefined) updateData.durum = data.durum;
        if (data.tarih !== undefined) updateData.tarih = data.tarih;
        if (data.saat !== undefined || data.baslangic_saati !== undefined) {
          updateData.baslangic_saati = data.saat || data.baslangic_saati;
        }
        if (data.sure !== undefined) {
          updateData.sure = data.sure;
        }
        if (data.bitis_saati !== undefined) {
          updateData.bitis_saati = data.bitis_saati;
        } else if (updateData.baslangic_saati || updateData.sure) {
          const startTime = updateData.baslangic_saati || existing.baslangic_saati;
          const duration = updateData.sure ?? existing.sure ?? 30;
          updateData.bitis_saati = calculateEndTime(startTime, duration);
        }
        if (data.hizmet !== undefined) updateData.hizmet = data.hizmet;

        const effectiveDurum = updateData.durum ?? existing.durum;
        const timeOrDateChanged =
          updateData.tarih !== undefined ||
          updateData.baslangic_saati !== undefined ||
          updateData.bitis_saati !== undefined ||
          updateData.sure !== undefined ||
          existing.durum === 'İptal';

        if (effectiveDurum !== 'İptal' && timeOrDateChanged) {
          const targetTarih = updateData.tarih ?? existing.tarih;
          const lockKey = `${tenantId}:${targetTarih}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

          const conflict = await hasAppointmentConflict({
            tx,
            tenantId,
            tarih: targetTarih,
            baslangicSaati: updateData.baslangic_saati ?? existing.baslangic_saati,
            bitisSaati: updateData.bitis_saati ?? existing.bitis_saati,
            sure: updateData.sure ?? existing.sure,
            excludeId: id,
          });
          if (conflict) {
            throw { status: 409, message: 'Seçilen saatte başka bir randevu bulunmaktadır' };
          }
        }

        return await tx.appointment.update({
          where: { id },
          data: updateData,
          include: { client: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return { success: true, data: updated };
  }

  static async batchUpdateAppointments(tenantId: string, ids: string[] | string, data?: Partial<BatchUpdateAppointmentInput>) {
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
    const result = await prisma.appointment.updateMany({
      where: { id, tenant_id: tenantId, deleted_at: null },
      data: { deleted_at: new Date() },
    });

    if (result.count === 0) {
      throw { status: 404, message: 'Randevu bulunamadı veya zaten silinmiş' };
    }

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
