import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';
import {
  AppointmentService,
  calculateDefaultDuration,
  calculateEndTime,
  createAppointmentSchema,
  hasAppointmentConflict,
} from '../services/appointment.service.js';
import { AuthService } from '../services/auth.service.js';
import { createClientSchema } from '../services/client.service.js';
import { NotesService } from '../services/notes.service.js';
import { updateSettingsSchema } from '../services/settings.service.js';
import { ChatbotService } from '../services/chatbot.service.js';
import { ENV, validateEnv } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';
import { errorHandler } from '../middlewares/error.middleware.js';

function stubMethod<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  impl: T[K]
): () => void {
  const original = obj[key];
  (obj as any)[key] = impl;
  return () => {
    (obj as any)[key] = original;
  };
}

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
  let restoreTenantFindUnique: (() => void) | undefined;

  const testTenantId = '11111111-1111-4111-8111-111111111111';
  const passiveTenantId = '33333333-3333-4333-8333-333333333333';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';

  before(() => {
    restoreTenantFindUnique = stubMethod(
      prisma.tenant,
      'findUnique',
      (async (args: { where?: { id?: string } }) => {
        if (args?.where?.id === testTenantId) {
          return { id: testTenantId, durum: 'Aktif' } as any;
        }
        if (args?.where?.id === passiveTenantId) {
          return { id: passiveTenantId, durum: 'Pasif' } as any;
        }
        return null;
      }) as any
    );
  });

  after(() => {
    restoreTenantFindUnique?.();
  });

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
  const passiveAuthToken = jwt.sign(
    {
      id: passiveTenantId,
      tenant_id: passiveTenantId,
      email: 'pasif@salon.local',
      salon_adi: 'Pasif Salon',
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

  test('GET /api/v1/chatbot/* rejects passive tenant JWT with 403', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/available-slots?date=2026-11-15`, {
      headers: { Authorization: `Bearer ${passiveAuthToken}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('CORS with wildcard origin does not return Access-Control-Allow-Credentials true', async () => {
    assert.equal(ENV.CORS_ORIGIN.trim() === '*' || !ENV.CORS_ORIGIN.trim(), true);
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://example.com' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.notEqual(res.headers.get('access-control-allow-credentials'), 'true');
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
      CORS_ORIGIN: 'https://app.example.com',
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

  test('AuthService.login rejects passive tenant with 403', async (t) => {
    const passwordHash = await argon2.hash('Sifre123!');
    const restore = stubMethod(
      prisma.tenant,
      'findUnique',
      (async () => ({
        id: '33333333-3333-4333-8333-333333333333',
        email: 'pasif@salon.local',
        salon_adi: 'Pasif Salon',
        password_hash: passwordHash,
        durum: 'Pasif',
      })) as any
    );
    t.after(restore);

    await assert.rejects(
      () => AuthService.login('pasif@salon.local', 'Sifre123!'),
      (err: any) => err?.status === 403
    );
  });

  test('errorHandler maps P2003 and P2023 to 400 and hides raw 500 error message', () => {
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

    const p2003Err = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '6.3.0',
    });
    const mockP2003 = createMockRes();
    errorHandler(p2003Err, {} as any, mockP2003.res, (() => {}) as any);
    assert.equal(mockP2003.out.statusCode, 400);
    assert.equal(mockP2003.out.body.success, false);

    const p2023Err = new Prisma.PrismaClientKnownRequestError('Inconsistent column data', {
      code: 'P2023',
      clientVersion: '6.3.0',
    });
    const mockP2023 = createMockRes();
    errorHandler(p2023Err, {} as any, mockP2023.res, (() => {}) as any);
    assert.equal(mockP2023.out.statusCode, 400);
    assert.equal(mockP2023.out.body.success, false);

    const rawSecretErr = new Error('Sensitive internal DB failure: postgres://user:pass@host/db');
    const mock500 = createMockRes();
    errorHandler(rawSecretErr, {} as any, mock500.res, (() => {}) as any);
    assert.equal(mock500.out.statusCode, 500);
    assert.equal(mock500.out.body.success, false);
    assert.equal(mock500.out.body.error, 'Sunucu içi hata oluştu');
  });

  test('AppointmentService.createAppointment throws 404 for cross-tenant hasta_id', async (t) => {
    const fakeTx = {
      appointment: {
        findMany: async () => [],
      },
      client: {
        findFirst: async () => null,
      },
    };
    const restore = stubMethod(
      prisma,
      '$transaction',
      (async (cb: any) => cb(fakeTx)) as any
    );
    t.after(restore);

    await assert.rejects(
      () =>
        AppointmentService.createAppointment('11111111-1111-4111-8111-111111111111', {
          hasta_id: '99999999-9999-4999-8999-999999999999',
          tarih: '2026-11-15',
          saat: '10:00',
        }),
      (err: any) => err?.status === 404
    );
  });

  test('NotesService.addNote throws 404 for cross-tenant hasta_id', async (t) => {
    const restore = stubMethod(prisma.client, 'findFirst', (async () => null) as any);
    t.after(restore);

    await assert.rejects(
      () =>
        NotesService.addNote(
          '11111111-1111-4111-8111-111111111111',
          '99999999-9999-4999-8999-999999999999',
          'Yetkisiz müşteri notu'
        ),
      (err: any) => err?.status === 404
    );
  });

  test('hasAppointmentConflict returns true on overlapping appointment time', async () => {
    const fakeTx = {
      appointment: {
        findMany: async () => [
          {
            baslangic_saati: '10:00:00',
            bitis_saati: '10:45:00',
            sure: 45,
          },
        ],
      },
    } as any;

    const overlapping = await hasAppointmentConflict({
      tx: fakeTx,
      tenantId: '11111111-1111-4111-8111-111111111111',
      tarih: '2026-11-15',
      baslangicSaati: '10:15',
      sure: 30,
    });
    assert.equal(overlapping, true);

    const adjacent = await hasAppointmentConflict({
      tx: fakeTx,
      tenantId: '11111111-1111-4111-8111-111111111111',
      tarih: '2026-11-15',
      baslangicSaati: '10:45',
      sure: 30,
    });
    assert.equal(adjacent, false);
  });
});

