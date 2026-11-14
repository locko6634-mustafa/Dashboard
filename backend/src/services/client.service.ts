import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { MoneyInput, toMoneyNumber } from '../utils/decimal.util.js';

function withMoneyNumbers<T extends { toplam_tutar: MoneyInput; alinan_odeme: MoneyInput }>(client: T) {
  return {
    ...client,
    toplam_tutar: toMoneyNumber(client.toplam_tutar),
    alinan_odeme: toMoneyNumber(client.alinan_odeme),
  };
}

export const createClientSchema = z
  .object({
    ad_soyad: z.string().optional(),
    telefon: z.string().optional(),
    kronik_rahatsizlik: z.string().optional().nullable(),
    paket_adi: z.string().optional().nullable(),
    toplam_seans: z.coerce.number().int().min(0).optional(),
    gelinen_seans: z.coerce.number().int().min(0).optional(),
    toplam_tutar: z.coerce.number().min(0).optional(),
    alinan_odeme: z.coerce.number().min(0).optional(),
  })
  .passthrough();

export const updateClientSchema = createClientSchema.extend({
  id: z.string().optional(),
  hasta_id: z.string().optional(),
  gelinen_seans_delta: z.coerce.number().int().optional(),
  alinan_odeme_delta: z.coerce.number().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export class ClientService {
  static async searchClients(tenantId: string, query: string) {
    const q = (query || '').trim();
    const whereClause: Prisma.ClientWhereInput = { tenant_id: tenantId };
    if (q && q !== '*') {
      whereClause.OR = [
        { ad_soyad: { contains: q, mode: 'insensitive' } },
        { telefon: { contains: q } },
      ];
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      orderBy: q ? { ad_soyad: 'asc' } : { created_at: 'desc' },
      take: q ? 50 : 200,
    });

    return clients.map(withMoneyNumbers);
  }

  static async createClient(tenantId: string, data: CreateClientInput) {
    const created = await prisma.client.create({
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

    return {
      success: true,
      message: 'Müşteri başarıyla eklendi',
      data: withMoneyNumbers(created),
    };
  }

  static async updateClient(tenantId: string, id: string, data: UpdateClientInput) {
    const updateData: Prisma.ClientUpdateManyMutationInput = {};
    if (data.ad_soyad !== undefined) updateData.ad_soyad = data.ad_soyad;
    if (data.telefon !== undefined) updateData.telefon = data.telefon;
    if (data.kronik_rahatsizlik !== undefined) updateData.kronik_rahatsizlik = data.kronik_rahatsizlik;
    if (data.paket_adi !== undefined) updateData.paket_adi = data.paket_adi;
    if (data.toplam_seans !== undefined) updateData.toplam_seans = data.toplam_seans;
    if (data.gelinen_seans !== undefined) updateData.gelinen_seans = data.gelinen_seans;
    if (data.toplam_tutar !== undefined) updateData.toplam_tutar = data.toplam_tutar;
    if (data.alinan_odeme !== undefined) updateData.alinan_odeme = data.alinan_odeme;

    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          // Eşzamanlı güncellemelerde lost update riskini önlemek için satır kilidi (FOR UPDATE)
          if (typeof tx.$queryRaw === 'function') {
            const lockedRows = await tx.$queryRaw<
              Array<{ id: string; gelinen_seans: number | null; alinan_odeme: MoneyInput }>
            >`SELECT id, gelinen_seans, alinan_odeme FROM public.clients WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`;

            const current = lockedRows[0];
            if (!current) {
              throw { status: 404, message: 'Müşteri bulunamadı' };
            }

            if (data.gelinen_seans === undefined && data.gelinen_seans_delta !== undefined) {
              const nextSeans = (current.gelinen_seans ?? 0) + data.gelinen_seans_delta;
              if (nextSeans < 0) {
                throw { status: 400, message: 'Gelinen seans 0’dan küçük olamaz' };
              }
              updateData.gelinen_seans = { increment: data.gelinen_seans_delta };
            }

            if (data.alinan_odeme === undefined && data.alinan_odeme_delta !== undefined) {
              const nextOdeme = toMoneyNumber(current.alinan_odeme) + data.alinan_odeme_delta;
              if (nextOdeme < 0) {
                throw { status: 400, message: 'Alınan ödeme 0’dan küçük olamaz' };
              }
              updateData.alinan_odeme = { increment: data.alinan_odeme_delta };
            }
          } else {
            if (data.gelinen_seans === undefined && data.gelinen_seans_delta !== undefined) {
              updateData.gelinen_seans = { increment: data.gelinen_seans_delta };
            }
            if (data.alinan_odeme === undefined && data.alinan_odeme_delta !== undefined) {
              updateData.alinan_odeme = { increment: data.alinan_odeme_delta };
            }
          }

          const result = await tx.client.updateMany({
            where: { id, tenant_id: tenantId },
            data: updateData,
          });

          if (result.count === 0) {
            throw { status: 404, message: 'Müşteri bulunamadı' };
          }

          const record = await tx.client.findFirst({
            where: { id, tenant_id: tenantId },
          });

          if (!record) {
            throw { status: 404, message: 'Müşteri bulunamadı' };
          }

          return record;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return {
        success: true,
        data: withMoneyNumbers(updated),
      };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2034'
      ) {
        throw {
          status: 409,
          message: 'Eşzamanlı güncelleme çakışması oluştu. Lütfen tekrar deneyiniz.',
        };
      }
      throw err;
    }
  }

  static async getClientById(tenantId: string, id: string) {
    const client = await prisma.client.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        appointments: {
          where: { deleted_at: null },
          orderBy: { tarih: 'desc' },
        },
        hasta_notlari: {
          orderBy: { tarih: 'desc' },
        },
      },
    });

    if (!client) {
      throw { status: 404, message: 'Müşteri bulunamadı' };
    }

    return withMoneyNumbers(client);
  }
}
