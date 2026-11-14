import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { ChatbotService } from '../services/chatbot.service.js';
import { ENV, validateEnv } from '../config/env.config.js';
import { app, resolveCorsConfig } from '../app.js';
import { prisma } from '../config/prisma.js';
import { authMiddleware, USER_AUTH_COOKIE_NAME } from '../middlewares/auth.middleware.js';
import { AdminController } from '../controllers/admin.controller.js';
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

describe('Security Fixes — Tenant Isolation & CORS/CSP', () => {
  test('cancelAppointment rejects empty tenantId with 400', async () => {
    await assert.rejects(
      () => ChatbotService.cancelAppointment('apt-1', '05551234567', ''),
      (err: any) => err?.status === 400
    );
    await assert.rejects(
      () => ChatbotService.cancelAppointment('apt-1', '05551234567', '   '),
      (err: any) => err?.status === 400
    );
  });

  test('cancelAppointment scopes findFirst and updateMany by tenant_id', async (t) => {
    let capturedClientWhere: any = null;
    let capturedAptWhere: any = null;
    let capturedUpdateManyWhere: any = null;

    t.after(
      stubMethod(prisma.client, 'findFirst', (async (args: any) => {
        capturedClientWhere = args?.where;
        return { id: 'client-1', ad_soyad: 'Test', telefon: '05551234567' };
      }) as any)
    );
    t.after(
      stubMethod(prisma.appointment, 'findFirst', (async (args: any) => {
        capturedAptWhere = args?.where;
        return { id: 'apt-1', hasta_id: 'client-1', tenant_id: 'tenant-a' };
      }) as any)
    );
    t.after(
      stubMethod(prisma.appointment, 'updateMany', (async (args: any) => {
        capturedUpdateManyWhere = args?.where;
        return { count: 1 };
      }) as any)
    );

    const res = await ChatbotService.cancelAppointment('apt-1', '05551234567', 'tenant-a');
    assert.equal(res.success, true);
    assert.equal(capturedClientWhere?.tenant_id, 'tenant-a');
    assert.equal(capturedAptWhere?.tenant_id, 'tenant-a');
    assert.equal(capturedUpdateManyWhere?.id, 'apt-1');
    assert.equal(capturedUpdateManyWhere?.tenant_id, 'tenant-a');
  });

  test('cancelAppointment returns failure when updateMany matches 0 rows (cross-tenant guard)', async (t) => {
    t.after(
      stubMethod(prisma.client, 'findFirst', (async () => ({
        id: 'client-1',
        ad_soyad: 'Test',
        telefon: '05551234567',
      })) as any)
    );
    t.after(
      stubMethod(prisma.appointment, 'findFirst', (async () => ({
        id: 'apt-1',
        hasta_id: 'client-1',
        tenant_id: 'tenant-a',
      })) as any)
    );
    t.after(
      stubMethod(prisma.appointment, 'updateMany', (async () => ({ count: 0 })) as any)
    );

    const res = await ChatbotService.cancelAppointment('apt-1', '05551234567', 'tenant-a');
    assert.equal(res.success, false);
  });

  test('rescheduleAppointment rejects empty tenantId with 400', async () => {
    await assert.rejects(
      () => ChatbotService.rescheduleAppointment('apt-1', '2026-11-20', '14:00', undefined, ''),
      (err: any) => err?.status === 400
    );
  });

  test('rescheduleAppointment scopes findFirst and updateMany by tenant_id inside $transaction', async (t) => {
    let capturedFindWhere: any = null;
    let capturedUpdateManyWhere: any = null;
    let executeRawCalled = false;

    const fakeTx = {
      $executeRaw: async () => {
        executeRawCalled = true;
        return 0;
      },
      appointment: {
        findFirst: async (args: any) => {
          capturedFindWhere = args?.where;
          return {
            id: 'apt-2',
            tenant_id: 'tenant-b',
            hizmet: 'Danışmanlık',
            sure: 30,
          };
        },
        findMany: async () => [],
        updateMany: async (args: any) => {
          capturedUpdateManyWhere = args?.where;
          return { count: 1 };
        },
      },
    };

    t.after(
      stubMethod(prisma, '$transaction', (async (cb: any) => cb(fakeTx)) as any)
    );

    const res = await ChatbotService.rescheduleAppointment(
      'apt-2',
      '2026-11-20',
      '14:00',
      undefined,
      'tenant-b'
    );
    assert.equal(res.success, true);
    assert.equal(executeRawCalled, true);
    assert.equal(capturedFindWhere?.tenant_id, 'tenant-b');
    assert.equal(capturedUpdateManyWhere?.id, 'apt-2');
    assert.equal(capturedUpdateManyWhere?.tenant_id, 'tenant-b');
  });

  test('setConversationState isolates states per tenant using composite PK conversation_id_tenant_id', async (t) => {
    const store = new Map<string, any>();
    const capturedWheres: any[] = [];

    t.after(
      stubMethod(prisma.conversationState, 'upsert', (async (args: any) => {
        capturedWheres.push(args?.where);
        const pk = args?.where?.conversation_id_tenant_id;
        assert.ok(pk, 'upsert must use composite PK conversation_id_tenant_id');
        const mapKey = `${pk.conversation_id}::${pk.tenant_id}`;
        const existing = store.get(mapKey);
        const record = existing
          ? { ...existing, ...args.update }
          : { ...args.create };
        store.set(mapKey, record);
        return record;
      }) as any)
    );

    const stateA = await ChatbotService.setConversationState(
      '05551234567',
      { stage: 'ASK_DATE', intent: 'book', phone: '05551234567', context: { step: 1 } },
      'tenant-a'
    );
    const stateB = await ChatbotService.setConversationState(
      '05551234567',
      { stage: 'CONFIRM', intent: 'cancel', phone: '05551234567', context: { step: 2 } },
      'tenant-b'
    );

    assert.equal(capturedWheres.length, 2);
    assert.deepEqual(capturedWheres[0], {
      conversation_id_tenant_id: {
        conversation_id: '05551234567',
        tenant_id: 'tenant-a',
      },
    });
    assert.deepEqual(capturedWheres[1], {
      conversation_id_tenant_id: {
        conversation_id: '05551234567',
        tenant_id: 'tenant-b',
      },
    });

    assert.equal(store.size, 2);
    assert.equal(stateA.tenant_id, 'tenant-a');
    assert.equal(stateA.current_stage, 'ASK_DATE');
    assert.equal(stateB.tenant_id, 'tenant-b');
    assert.equal(stateB.current_stage, 'CONFIRM');
    assert.equal(store.get('05551234567::tenant-a')?.current_stage, 'ASK_DATE');
  });

  test('validateEnv and resolveCorsConfig reject wildcard/empty CORS_ORIGIN in production', () => {
    const baseProd = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'a-very-secure-production-secret-at-least-32-chars',
    };

    assert.throws(() => validateEnv({ ...baseProd }), /CORS_ORIGIN/);
    assert.throws(() => validateEnv({ ...baseProd, CORS_ORIGIN: '*' }), /CORS_ORIGIN/);
    assert.throws(() => validateEnv({ ...baseProd, CORS_ORIGIN: '' }), /CORS_ORIGIN/);
    assert.throws(
      () => validateEnv({ ...baseProd, CORS_ORIGIN: 'https://app.example.com, *' }),
      /CORS_ORIGIN/
    );

    const validProd = validateEnv({
      ...baseProd,
      CORS_ORIGIN: 'https://app.example.com,https://admin.example.com',
    });
    assert.equal(validProd.CORS_ORIGIN, 'https://app.example.com,https://admin.example.com');

    assert.throws(() => resolveCorsConfig('*', 'production'), /CORS_ORIGIN/);
    assert.throws(() => resolveCorsConfig('', 'production'), /CORS_ORIGIN/);
    assert.deepEqual(resolveCorsConfig('*', 'development'), {
      isWildcardCors: true,
      allowedOrigins: ['*'],
    });
    assert.deepEqual(resolveCorsConfig('https://app.example.com', 'production'), {
      isWildcardCors: false,
      allowedOrigins: ['https://app.example.com'],
    });
  });

  test('Helmet sets strict API Content-Security-Policy on API routes and self-based CSP on static frontend', async () => {
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = server.address() as any;
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const healthRes = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(healthRes.status, 200);
      const apiCsp = healthRes.headers.get('content-security-policy') || '';
      assert.match(apiCsp, /default-src 'none'/);
      assert.match(apiCsp, /frame-ancestors 'none'/);

      const staticRes = await fetch(`${baseUrl}/login.html`);
      assert.equal(staticRes.status, 200);
      const staticCsp = staticRes.headers.get('content-security-policy') || '';
      assert.match(staticCsp, /default-src 'self'/);
      assert.doesNotMatch(staticCsp, /default-src 'none'/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test('authMiddleware reads JWT from rp_user_token cookie and rejects mismatched x-tenant-id with 403', async (t) => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const otherTenantId = '22222222-2222-4222-8222-222222222222';
    const token = jwt.sign(
      {
        id: tenantId,
        tenant_id: tenantId,
        email: 'cookie@salon.local',
        salon_adi: 'Cookie Salon',
      },
      ENV.JWT_SECRET,
      { expiresIn: '1h' }
    );

    t.after(
      stubMethod(prisma.tenant, 'findUnique', (async (args: any) => {
        if (args?.where?.id === tenantId) {
          return { id: tenantId, durum: 'Aktif' } as any;
        }
        return null;
      }) as any)
    );

    const createMockRes = () => {
      const out: { statusCode: number; body: any } = { statusCode: 200, body: null };
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

    // 1. Valid rp_user_token cookie without conflicting x-tenant-id -> calls next() and sets req.tenantId
    const reqOk: any = {
      headers: {
        cookie: `${USER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
      body: {},
      query: {},
    };
    const mockOk = createMockRes();
    let nextCalledOk = false;
    await authMiddleware(reqOk, mockOk.res, () => {
      nextCalledOk = true;
    });
    assert.equal(nextCalledOk, true);
    assert.equal(reqOk.tenantId, tenantId);
    assert.equal(reqOk.user?.email, 'cookie@salon.local');

    // 2. Valid rp_user_token cookie + conflicting x-tenant-id -> 403
    const reqMismatch: any = {
      headers: {
        cookie: `${USER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'x-tenant-id': otherTenantId,
      },
      body: {},
      query: {},
    };
    const mockMismatch = createMockRes();
    let nextCalledMismatch = false;
    await authMiddleware(reqMismatch, mockMismatch.res, () => {
      nextCalledMismatch = true;
    });
    assert.equal(nextCalledMismatch, false);
    assert.equal(mockMismatch.out.statusCode, 403);
    assert.equal(mockMismatch.out.body?.success, false);
  });

  test('AdminController.setup and AdminController.createTenant return 400 on invalid payloads', async () => {
    const createMockRes = () => {
      const out: { statusCode: number; body: any } = { statusCode: 200, body: null };
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

    // Invalid setup payload -> next(ZodError) -> errorHandler -> 400
    const setupMock = createMockRes();
    let setupErr: any = null;
    await AdminController.setup(
      { body: { email: 'not-an-email', password: '123', ad_soyad: '' } } as any,
      setupMock.res,
      (err?: any) => {
        setupErr = err;
      }
    );
    assert.ok(setupErr, 'setup should forward validation error to next');
    errorHandler(setupErr, {} as any, setupMock.res, (() => {}) as any);
    assert.equal(setupMock.out.statusCode, 400);
    assert.equal(setupMock.out.body?.success, false);

    // Invalid createTenant payload -> next(ZodError) -> errorHandler -> 400
    const createMock = createMockRes();
    let createErr: any = null;
    await AdminController.createTenant(
      { body: { salon_adi: '', email: 'invalid', password: '12' } } as any,
      createMock.res,
      (err?: any) => {
        createErr = err;
      }
    );
    assert.ok(createErr, 'createTenant should forward validation error to next');
    errorHandler(createErr, {} as any, createMock.res, (() => {}) as any);
    assert.equal(createMock.out.statusCode, 400);
    assert.equal(createMock.out.body?.success, false);
  });
});
