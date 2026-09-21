import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { NotesService } from '../services/notes.service.js';

export class NotesController {
  static async getNotes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const hastaId = (req.query.id as string) || (req.query.hasta_id as string);

      const notes = await NotesService.getNotes(tenantId, hastaId);
      res.json(notes);
    } catch (err) {
      next(err);
    }
  }

  static async addNote(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;
      const hastaId = data.hasta_id;
      const notMetni = data.not || data.not_metni || data.note;
      const tarih = data.tarih;

      const result = await NotesService.addNote(tenantId, hastaId, notMetni, tarih);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteNote(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const data = req.body?.payload ? req.body.payload : req.body;
      const noteId = req.params.id || data.note_id || data.id;

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
