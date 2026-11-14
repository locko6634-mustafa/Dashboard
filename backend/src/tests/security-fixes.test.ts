import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import { ChatbotService } from '../services/chatbot.service.js';
import { validateEnv } from '../config/env.config.js';
import { app, resolveCorsConfig } from '../app.js';
import { prisma } from '../config/prisma.js';

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

  test('rescheduleAppointment scopes findFirst and updateMany by tenant_id', async (t) => {
    let capturedFindWhere: any = null;
    let capturedUpdateManyWhere: any = null;

    t.after(
      stubMethod(prisma.appointment, 'findFirst', (async (args: any) => {
        capturedFindWhere = args?.where;
        return {
          id: 'apt-2',
          tenant_id: 'tenant-b',
          hizmet: 'Danışmanlık',
          sure: 30,
        };
      }) as any)
    );
    t.after(
      stubMethod(prisma.appointment, 'updateMany', (async (args: any) => {
        capturedUpdateManyWhere = args?.where;
        return { count: 1 };
      }) as any)
    );

    const res = await ChatbotService.rescheduleAppointment(
      'apt-2',
      '2026-11-20',
      '14:00',
      undefined,
      'tenant-b'
    );
    assert.equal(res.success, true);
    assert.equal(capturedFindWhere?.tenant_id, 'tenant-b');
    assert.equal(capturedUpdateManyWhere?.id, 'apt-2');
    assert.equal(capturedUpdateManyWhere?.tenant_id, 'tenant-b');
  });

  test('setConversationState rejects null or mismatched existing.tenant_id with 403', async (t) => {
    t.after(
      stubMethod(prisma.conversationState, 'findUnique', (async () => ({
        tenant_id: null,
      })) as any)
    );

    await assert.rejects(
      () => ChatbotService.setConversationState('conv_null', { stage: 'START' }, 'tenant-a'),
      (err: any) => err?.status === 403
    );

    t.after(
      stubMethod(prisma.conversationState, 'findUnique', (async () => ({
        tenant_id: 'tenant-other',
      })) as any)
    );

    await assert.rejects(
      () => ChatbotService.setConversationState('conv_other', { stage: 'START' }, 'tenant-a'),
      (err: any) => err?.status === 403
    );
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
});
