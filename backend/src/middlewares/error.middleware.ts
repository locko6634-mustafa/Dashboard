import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('API Error:', err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Doğrulama hatası',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      success: false,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: 'Bu kayıt zaten mevcut (benzersiz alan çakışması)',
        success: false,
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: 'Geçersiz ilişkili kayıt referansı',
        success: false,
      });
      return;
    }
    if (err.code === 'P2023') {
      res.status(400).json({
        error: 'Geçersiz kimlik formatı',
        success: false,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: 'İlgili kayıt bulunamadı',
        success: false,
      });
      return;
    }
  }

  const statusCode =
    typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.status === 'number'
        ? err.status
        : 500;
  const message =
    statusCode >= 500
      ? 'Sunucu içi hata oluştu'
      : err?.message || 'Sunucu içi hata oluştu';

  res.status(statusCode).json({
    error: message,
    success: false,
  });
}
