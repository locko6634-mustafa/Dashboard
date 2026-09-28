import { prisma } from '../config/prisma.js';

export class ClientService {
  static async searchClients(tenantId: string, query: string) {
    const q = (query || '').trim();
    const whereClause: any = { tenant_id: tenantId };
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

    return clients.map((c) => ({
      ...c,
      toplam_tutar: c.toplam_tutar ? Number(c.toplam_tutar) : 0,
      alinan_odeme: c.alinan_odeme ? Number(c.alinan_odeme) : 0,
    }));
  }

  static async createClient(tenantId: string, data: any) {
    const created = await prisma.client.create({
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

    return {
      success: true,
      message: 'Müşteri başarıyla eklendi',
      data: {
        ...created,
        toplam_tutar: created.toplam_tutar ? Number(created.toplam_tutar) : 0,
        alinan_odeme: created.alinan_odeme ? Number(created.alinan_odeme) : 0,
      },
    };
  }

  static async updateClient(tenantId: string, id: string, data: any) {
    const existing = await prisma.client.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw { status: 404, message: 'Müşteri bulunamadı' };
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ad_soyad: data.ad_soyad !== undefined ? data.ad_soyad : existing.ad_soyad,
        telefon: data.telefon !== undefined ? data.telefon : existing.telefon,
        kronik_rahatsizlik: data.kronik_rahatsizlik !== undefined ? data.kronik_rahatsizlik : existing.kronik_rahatsizlik,
        paket_adi: data.paket_adi !== undefined ? data.paket_adi : existing.paket_adi,
        toplam_seans: data.toplam_seans !== undefined ? parseInt(data.toplam_seans, 10) : existing.toplam_seans,
        gelinen_seans: data.gelinen_seans !== undefined ? parseInt(data.gelinen_seans, 10) : existing.gelinen_seans,
        toplam_tutar: data.toplam_tutar !== undefined ? Number(data.toplam_tutar) : existing.toplam_tutar,
        alinan_odeme: data.alinan_odeme !== undefined ? Number(data.alinan_odeme) : existing.alinan_odeme,
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        toplam_tutar: updated.toplam_tutar ? Number(updated.toplam_tutar) : 0,
        alinan_odeme: updated.alinan_odeme ? Number(updated.alinan_odeme) : 0,
      },
    };
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

    return {
      ...client,
      toplam_tutar: client.toplam_tutar ? Number(client.toplam_tutar) : 0,
      alinan_odeme: client.alinan_odeme ? Number(client.alinan_odeme) : 0,
    };
  }
}
