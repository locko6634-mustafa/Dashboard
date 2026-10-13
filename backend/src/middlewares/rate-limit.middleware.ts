import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitStore>();

// Periodic cleanup of expired rate limit entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60000).unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  prefix?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyiniz.',
    prefix = 'rl',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Determine client identifier (IP address)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${prefix}:${clientIp}`;
    const now = Date.now();

    const record = store.get(key);

    if (!record || record.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    next();
  };
}

// 1. Auth & Login Limiter: 15 attempts per 15 minutes per IP
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Çok fazla başarısız giriş denemesi yapıldı. Güvenliğiniz için lütfen 15 dakika sonra tekrar deneyiniz.',
  prefix: 'auth',
});

// 2. Chatbot Limiter: 60 requests per minute per IP
export const chatbotRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Chatbot istek sınırı aşıldı. Lütfen bir dakika sonra tekrar deneyiniz.',
  prefix: 'chatbot',
});

// 3. General API Limiter: 300 requests per minute per IP
export const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Çok fazla API isteği gönderildi. Lütfen biraz bekleyiniz.',
  prefix: 'api',
});
