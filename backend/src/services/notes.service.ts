import { prisma } from '../config/prisma.js';

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

  static async addNote(tenantId: string, hastaId: string, notMetni: string, tarih?: string) {
    if (!notMetni || !notMetni.trim()) {
      throw { status: 400, message: 'Not metni boş olamaz' };
    }

    const note = await prisma.hastaNotu.create({
      data: {
        tenant_id: tenantId,
        hasta_id: hastaId || null,
        not_metni: notMetni.trim(),
        tarih: tarih ? new Date(tarih) : new Date(),
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
