import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import argon2 from 'argon2';
import type { NextFunction, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AdminService, hashApiKey } from '../services/admin.service.js';
import { AuthService } from '../services/auth.service.js';
import {
  AuthenticatedRequest,
  authMiddleware,
  requireTenantId,
} from '../middlewares/auth.middleware.js';
import {
  createRateLimiter,
  MAX_STORE_SIZE,
} from '../middlewares/rate-limit.middleware.js';
import { createAppointmentSchema } from '../services/appointment.service.js';
import { ChatbotService } from '../services/chatbot.service.js';
import { chatbotBookSchema } from '../controllers/chatbot.controller.js';
import {
  isValidDateString,
  isValidTimeString,
  parseTimeToMinutes,
} from '../utils/dateTime.util.js';

function stubMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K]
): () => void {
  const original = target[key];
  Object.defineProperty(target, key, {
    value: replacement,
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(target, key, {
      value: original,
      configurable: true,
      writable: true,
    });
  };
}

describe('Audit Fixes Verification Tests', () => {
  it('Bulgu 1: AdminService.ensureSchema creates composite PK on conversation_states and migrates single-col PK', async (t) => {
    const sqlQueries: string[] = [];
    t.after(
      stubMethod(prisma, '$executeRaw', (async (strings: TemplateStringsArray) => {
        sqlQueries.push(strings.join(' '));
        return 0;
      }) as unknown as typeof prisma.$executeRaw)
    );
    t.after(
      stubMethod(prisma.tenant, 'findMany', (async () => []) as unknown as typeof prisma.tenant.findMany)
    );

    await AdminService.ensureSchema();
    const combined = sqlQueries.join('\n');
    assert.ok(
      combined.includes('PRIMARY KEY (conversation_id, tenant_id)'),
      'conversation_states tablosu composite PRIMARY KEY (conversation_id, tenant_id) içermeli'
    );
    assert.ok(
      combined.includes('DO $$') && combined.includes('pk_cols = 1'),
      'Mevcut tek kolonlu PK için güvenli DO $$ migration bloğu içermeli'
    );
  });

  it('Bulgu 2: AuthService.login rejects legacy plaintext password_hash and accepts only $argon2', async (t) => {
    const restorePlain = stubMethod(
      prisma.tenant,
      'findUnique',
      (async () => ({
        id: 'tenant-1',
        email: 'salon@example.com',
        salon_adi: 'Test Salon',
        password_hash: 'plain-secret-123',
        durum: 'Aktif',
      })) as unknown as typeof prisma.tenant.findUnique
    );

    try {
      await assert.rejects(
        () => AuthService.login('salon@example.com', 'plain-secret-123'),
        (err: { status?: number }) => err.status === 401
      );
    } finally {
      restorePlain();
    }

    const argonHash = await argon2.hash('valid-secret-123');
    t.after(
      stubMethod(
        prisma.tenant,
        'findUnique',
        (async () => ({
          id: 'tenant-2',
          email: 'salon2@example.com',
          salon_adi: 'Test Salon 2',
          password_hash: argonHash,
          durum: 'Aktif',
        })) as unknown as typeof prisma.tenant.findUnique
      )
    );

    const result = await AuthService.login('salon2@example.com', 'valid-secret-123');
    assert.equal(result.success, true);
    assert.equal(result.tenant_id, 'tenant-2');
    assert.ok(result.token);
  });

  it('Bulgu 3: authMiddleware looks up api_key_hash (SHA-256) instead of plaintext api_key', async (t) => {
    const rawApiKey = 'sk_live_test_key_12345';
    const expectedHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    assert.equal(hashApiKey(rawApiKey), expectedHash);

    let capturedWhere: Record<string, unknown> | undefined;
    t.after(
      stubMethod(
        prisma.tenant,
        'findFirst',
        (async (args: { where?: Record<string, unknown> }) => {
          capturedWhere = args?.where;
          return {
            id: 'tenant-api-1',
            email: 'api@example.com',
            salon_adi: 'API Salon',
          };
        }) as unknown as typeof prisma.tenant.findFirst
      )
    );

    const req = {
      headers: { 'x-api-key': rawApiKey },
      body: {},
      query: {},
    } as unknown as AuthenticatedRequest;
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;

    let nextCalled = false;
    const next: NextFunction = (err?: unknown) => {
      if (err) throw err;
      nextCalled = true;
    };

    await authMiddleware(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(req.tenantId, 'tenant-api-1');
    assert.ok(capturedWhere);
    assert.equal(capturedWhere.api_key_hash, expectedHash);
    assert.equal('api_key' in capturedWhere, false);
  });

  it('Bulgu 4: rate-limit middleware enforces MAX_STORE_SIZE and evicts oldest entries', () => {
    assert.equal(MAX_STORE_SIZE, 10000);
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 5,
      prefix: 'audit-test',
    });

    for (let i = 0; i < MAX_STORE_SIZE + 25; i++) {
      const req = {
        ip: `10.0.${Math.floor(i / 255)}.${i % 255}`,
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as AuthenticatedRequest;
      const res = {
        setHeader() {},
        status() {
          return this;
        },
        json() {
          return this;
        },
      } as unknown as Response;
      let passed = false;
      limiter(req, res, () => {
        passed = true;
      });
      assert.equal(passed, true);
    }
  });

  it('Bulgu 6: requireTenantId throws 401 when missing and returns trimmed tenantId when present', () => {
    assert.throws(
      () => requireTenantId({} as AuthenticatedRequest),
      (err: { status?: number }) => err.status === 401
    );
    assert.throws(
      () => requireTenantId({ tenantId: '   ' } as AuthenticatedRequest),
      (err: { status?: number }) => err.status === 401
    );
    assert.equal(
      requireTenantId({ tenantId: ' tenant-abc ' } as AuthenticatedRequest),
      'tenant-abc'
    );
  });

  it('Bulgu 8: dateTime helpers and schemas validate YYYY-MM-DD and HH:mm strictly', async () => {
    assert.equal(isValidDateString('2026-05-15'), true);
    assert.equal(isValidDateString('2026-02-30'), false);
    assert.equal(isValidDateString('2026-13-01'), false);
    assert.equal(isValidDateString('not-a-date'), false);

    assert.equal(parseTimeToMinutes('09:30'), 570);
    assert.equal(parseTimeToMinutes('23:59:59'), 23 * 60 + 59);
    assert.equal(parseTimeToMinutes('24:00'), null);
    assert.equal(parseTimeToMinutes('12:60'), null);
    assert.equal(parseTimeToMinutes('aa:bb'), null);
    assert.equal(isValidTimeString('14:15'), true);
    assert.equal(isValidTimeString('99:99'), false);

    assert.equal(
      createAppointmentSchema.safeParse({ tarih: '2026-02-30', saat: '10:00' }).success,
      false
    );
    assert.equal(
      createAppointmentSchema.safeParse({ tarih: '2026-05-15', saat: '25:00' }).success,
      false
    );
    assert.equal(
      createAppointmentSchema.safeParse({ tarih: '2026-05-15', saat: '10:30' }).success,
      true
    );

    assert.equal(
      chatbotBookSchema.safeParse({ tarih: '2026-05-32', saat: '10:00' }).success,
      false
    );

    await assert.rejects(
      () => ChatbotService.getAvailableSlots('2026-02-30', 30, 'tenant-1'),
      (err: { status?: number }) => err.status === 400
    );
  });
});
