import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireTenantId } from '../middlewares/auth.middleware.js';
import { NotesService } from '../services/notes.service.js';
import { extractQueryString } from '../utils/query.util.js';

export const addNoteSchema = z
  .object({
    hasta_id: z
      .union([z.string().trim().uuid('Geçersiz hasta_id formatı'), z.literal('')])
      .optional()
      .nullable(),
    not: z.string().optional(),
    not_metni: z.string().optional(),
    note: z.string().optional(),
    tarih: z
      .string()
      .refine((val) => !val.trim() || !Number.isNaN(Date.parse(val)), {
        message: 'Geçersiz tarih formatı',
      })
      .optional()
      .nullable(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const text = (data.not_metni ?? data.not ?? data.note ?? '').trim();
    if (!text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['not_metni'],
        message: 'Not metni zorunludur',
      });
    }
  });

export class NotesController {
  static async getNotes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const hastaId = extractQueryString(req.query.id) || extractQueryString(req.query.hasta_id);

      const notes = await NotesService.getNotes(tenantId, hastaId);
      res.json(notes);
    } catch (err) {
      next(err);
    }
  }

  static async addNote(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const rawData =
        req.body && typeof req.body === 'object' && 'payload' in req.body
          ? req.body.payload
          : req.body;
      const data = addNoteSchema.parse(rawData);
      const hastaId = data.hasta_id || undefined;
      const notMetni = (data.not_metni ?? data.not ?? data.note ?? '').trim();
      const tarih = data.tarih || undefined;

      const result = await NotesService.addNote(tenantId, hastaId, notMetni, tarih);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteNote(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = requireTenantId(req);
      const rawBody = req.body && typeof req.body === 'object' ? req.body : undefined;
      const data = rawBody?.payload && typeof rawBody.payload === 'object' ? rawBody.payload : rawBody;
      const rawNoteId = req.params.id || data?.note_id || data?.id;
      const noteId = typeof rawNoteId === 'string' ? rawNoteId.trim() : '';

      if (!noteId) {
        res.status(400).json({ success: false, error: 'Not ID zorunludur' });
        return;
      }

      const result = await NotesService.deleteNote(tenantId, noteId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
