import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
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

  let statusCode = 500;
  let errMessage: string | undefined;

  if (err instanceof Error) {
    errMessage = err.message;
  }

  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    if (typeof errObj.statusCode === 'number') {
      statusCode = errObj.statusCode;
    } else if (typeof errObj.status === 'number') {
      statusCode = errObj.status;
    }
    if (typeof errObj.message === 'string') {
      errMessage = errObj.message;
    }
  }

  const message =
    statusCode >= 500
      ? 'Sunucu içi hata oluştu'
      : errMessage || 'Sunucu içi hata oluştu';

  res.status(statusCode).json({
    error: message,
    success: false,
  });
}
