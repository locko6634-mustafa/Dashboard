import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';
import {
  calculateDefaultDuration,
  calculateEndTime,
  createAppointmentSchema,
} from '../services/appointment.service.js';
import { createClientSchema } from '../services/client.service.js';
import { updateSettingsSchema } from '../services/settings.service.js';
import { ChatbotService } from '../services/chatbot.service.js';
import { ENV, validateEnv } from '../config/env.config.js';
import { errorHandler } from '../middlewares/error.middleware.js';

describe('Appointment Service Logic Tests', () => {
  test('calculateDefaultDuration maps service names correctly', () => {
    assert.equal(calculateDefaultDuration('Lazer Epilasyon'), 45);
    assert.equal(calculateDefaultDuration('lazer'), 45);
    assert.equal(calculateDefaultDuration('Cilt Bakımı'), 60);
    assert.equal(calculateDefaultDuration('cilt bakimi'), 60);
    assert.equal(calculateDefaultDuration('Protez Tırnak'), 90);
    assert.equal(calculateDefaultDuration('Bölgesel İncelme'), 45);
    assert.equal(calculateDefaultDuration('bolgesel incelme'), 45);
    assert.equal(calculateDefaultDuration('Danışma'), 30);
    assert.equal(calculateDefaultDuration(''), 30);
    assert.equal(calculateDefaultDuration(null), 30);
  });

  test('calculateEndTime calculates correct finish time', () => {
    assert.equal(calculateEndTime('09:00', 30), '09:30:00');
    assert.equal(calculateEndTime('09:45', 45), '10:30:00');
    assert.equal(calculateEndTime('11:00', 60), '12:00:00');
    assert.equal(calculateEndTime('13:30', 90), '15:00:00');
    assert.equal(calculateEndTime('18:45', 30), '19:15:00');
  });

  test('calculateEndTime handles empty or invalid string gracefully', () => {
    assert.equal(calculateEndTime('', 30), '');
    assert.equal(calculateEndTime('invalid', 30), 'invalid');
  });
});

import { app } from '../app.js';
import type { Server } from 'http';

describe('HTTP API Endpoints Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  test('Start test HTTP server', async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
    assert.ok(baseUrl);
  });

  test('GET /health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'randevu-paneli-backend');
  });

  test('GET /api/v1/health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  test('POST /webhook/kullanici-girisi rejects empty body', async () => {
    const res = await fetch(`${baseUrl}/webhook/kullanici-girisi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('POST /api/v1/auth/login rejects empty body', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  const testTenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const authToken = jwt.sign(
    {
      id: testTenantId,
      tenant_id: testTenantId,
      email: 'test@salon.local',
      salon_adi: 'Test Salon',
    },
    ENV.JWT_SECRET,
    { expiresIn: '1h' }
  );

  test('GET /api/v1/chatbot/* rejects unauthenticated requests with 401', async () => {
    const endpoints = [
      '/api/v1/chatbot/available-slots?date=2026-11-15',
      '/api/v1/chatbot/appointments?phone=05551234567',
      '/api/v1/chatbot/state?phone=05551234567',
    ];
    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 401, `${ep} should return 401 without auth`);
      const body = await res.json();
      assert.equal(body.success, false);
    }
  });

  test('GET /api/v1/chatbot/* rejects cross-tenant mismatch with 403', async () => {
    const resHeader = await fetch(`${baseUrl}/api/v1/chatbot/available-slots?date=2026-11-15`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-tenant-id': otherTenantId,
      },
    });
    assert.equal(resHeader.status, 403);

    const resQuery = await fetch(
      `${baseUrl}/api/v1/chatbot/appointments?phone=05551234567&tenant_id=${otherTenantId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert.equal(resQuery.status, 403);

    const resBody = await fetch(`${baseUrl}/api/v1/chatbot/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        ad_soyad: 'Test',
        telefon: '05551234567',
        tarih: '2026-11-15',
        saat: '10:00',
        tenant_id: otherTenantId,
      }),
    });
    assert.equal(resBody.status, 403);
  });

  test('GET /api/v1/chatbot/available-slots validates date param when authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/available-slots`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('GET /api/v1/chatbot/appointments validates phone param when authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/appointments`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('POST /api/v1/appointments validates body with Zod when authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ad_soyad: 'Eksik Tarih' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Doğrulama hatası');
  });

  test('Close test HTTP server', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

describe('Security, Env, Validation and Error Handling Regression Tests', () => {
  test('validateEnv fails fast in production without or with short JWT_SECRET', () => {
    assert.throws(() => {
      validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/db' });
    }, /JWT_SECRET/);

    assert.throws(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/db',
        JWT_SECRET: 'too-short-secret',
      });
    }, /32 characters/);

    const validProd = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'a-very-secure-production-secret-at-least-32-chars',
    });
    assert.equal(validProd.JWT_SECRET, 'a-very-secure-production-secret-at-least-32-chars');
  });

  test('validateEnv generates random runtime JWT_SECRET in test/dev when omitted', () => {
    const first = validateEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/db' });
    const second = validateEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/db' });
    assert.equal(first.JWT_SECRET.length, 64);
    assert.equal(second.JWT_SECRET.length, 64);
    assert.notEqual(first.JWT_SECRET, second.JWT_SECRET);
  });

  test('errorHandler maps Prisma P2002 to 409 and P2025 to 404', () => {
    const createMockRes = () => {
      const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
      return {
        out,
        res: {
          status(code: number) {
            out.statusCode = code;
            return this;
          },
          json(payload: any) {
            out.body = payload;
            return this;
          },
        } as any,
      };
    };

    const p2002Err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.3.0',
    });
    const mock409 = createMockRes();
    errorHandler(p2002Err, {} as any, mock409.res, (() => {}) as any);
    assert.equal(mock409.out.statusCode, 409);
    assert.equal(mock409.out.body.success, false);

    const p2025Err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.3.0',
    });
    const mock404 = createMockRes();
    errorHandler(p2025Err, {} as any, mock404.res, (() => {}) as any);
    assert.equal(mock404.out.statusCode, 404);
    assert.equal(mock404.out.body.success, false);

    const parsed = z.object({ name: z.string() }).safeParse({});
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const mock400 = createMockRes();
      errorHandler(parsed.error as ZodError, {} as any, mock400.res, (() => {}) as any);
      assert.equal(mock400.out.statusCode, 400);
      assert.equal(mock400.out.body.success, false);
    }
  });

  test('Zod schemas validate appointment, client and settings payloads', () => {
    assert.equal(createAppointmentSchema.safeParse({ tarih: '2026-11-15', sure: '45' }).success, true);
    assert.equal(createAppointmentSchema.safeParse({ ad_soyad: 'No Date' }).success, false);
    assert.equal(createClientSchema.safeParse({ ad_soyad: 'Ali Veli', toplam_seans: '5' }).success, true);
    assert.equal(updateSettingsSchema.safeParse([{ setting_key: 'k', setting_value: 1 }]).success, true);
    assert.equal(updateSettingsSchema.safeParse({ calendar: { START_HOUR: 9 } }).success, true);
    assert.equal(updateSettingsSchema.safeParse('invalid-string').success, false);
  });

  test('ChatbotService requires tenant_id for bookAppointment and setConversationState', async () => {
    await assert.rejects(
      () =>
        ChatbotService.bookAppointment({
          ad_soyad: 'Test',
          telefon: '05551234567',
          tarih: '2026-11-15',
          saat: '10:00',
          tenant_id: '',
        }),
      (err: any) => err?.status === 400
    );

    await assert.rejects(
      () => ChatbotService.setConversationState('conv_1', { stage: 'START' }, ''),
      (err: any) => err?.status === 400
    );
  });
});

