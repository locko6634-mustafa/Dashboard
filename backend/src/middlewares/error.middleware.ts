import { Request, Response, NextFunction } from 'express';
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

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Sunucu içi hata oluştu';

  res.status(statusCode).json({
    error: message,
    success: false,
  });
}
