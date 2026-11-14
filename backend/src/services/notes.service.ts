import { prisma } from '../config/prisma.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotesService {
  static async getNotes(tenantId: string, hastaId?: string) {
    const whereClause: any = { tenant_id: tenantId };
    if (hastaId) {
      whereClause.hasta_id = hastaId;
    }

    return await prisma.hastaNotu.findMany({
      where: whereClause,
      orderBy: { tarih: 'desc' },
    });
  }

  static async addNote(
    tenantId: string,
    hastaId: string | undefined | null,
    notMetni: string,
    tarih?: string | null
  ) {
    if (typeof notMetni !== 'string' || !notMetni.trim()) {
      throw { status: 400, message: 'Not metni boş olamaz' };
    }

    let normalizedHastaId: string | null = null;
    if (hastaId !== undefined && hastaId !== null) {
      if (typeof hastaId !== 'string') {
        throw { status: 400, message: 'Geçersiz hasta_id formatı' };
      }
      const trimmedHastaId = hastaId.trim();
      if (trimmedHastaId) {
        if (!UUID_REGEX.test(trimmedHastaId)) {
          throw { status: 400, message: 'Geçersiz hasta_id formatı' };
        }
        const client = await prisma.client.findFirst({
          where: { id: trimmedHastaId, tenant_id: tenantId },
        });
        if (!client) {
          throw { status: 404, message: 'Belirtilen müşteri bulunamadı' };
        }
        normalizedHastaId = trimmedHastaId;
      }
    }

    let parsedDate = new Date();
    if (tarih !== undefined && tarih !== null && tarih !== '') {
      parsedDate = new Date(tarih);
      if (Number.isNaN(parsedDate.getTime())) {
        throw { status: 400, message: 'Geçersiz tarih formatı' };
      }
    }

    const note = await prisma.hastaNotu.create({
      data: {
        tenant_id: tenantId,
        hasta_id: normalizedHastaId,
        not_metni: notMetni.trim(),
        tarih: parsedDate,
      },
    });

    return { success: true, data: note, id: note.id };
  }

  static async deleteNote(tenantId: string, noteId: string) {
    const existing = await prisma.hastaNotu.findFirst({
      where: { id: noteId, tenant_id: tenantId },
    });

    if (!existing) {
      throw { status: 404, message: 'Not bulunamadı' };
    }

    await prisma.hastaNotu.delete({
      where: { id: noteId },
    });

    return { success: true, message: 'Not başarıyla silindi' };
  }
}
