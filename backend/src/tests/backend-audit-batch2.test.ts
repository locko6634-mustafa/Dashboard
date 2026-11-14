import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import type { NextFunction, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AdminService, hashApiKey } from '../services/admin.service.js';
import { AppointmentService } from '../services/appointment.service.js';
import { ChatbotService } from '../services/chatbot.service.js';
import { SettingsService } from '../services/settings.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middlewares/auth.middleware.js';
import { toInputJsonValue } from '../utils/json.util.js';

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

describe('Backend Audit Batch 2 Fixes', () => {
  it('Bulgu 1: AdminService.listTenants and updateTenant never select or return plaintext api_key', async (t) => {
    t.after(
      stubMethod(AdminService, 'ensureSchema', (async () => {}) as typeof AdminService.ensureSchema)
    );
    let listSelect: Record<string, unknown> | undefined;
    t.after(
      stubMethod(
        prisma.tenant,
        'findMany',
        (async (args?: { select?: Record<string, unknown> }) => {
          listSelect = args?.select;
          return [
            {
              id: 'tenant-1',
              salon_adi: 'Salon Bir',
              email: 'bir@example.com',
              whatsapp_phone: null,
              n8n_webhook_url: null,
              chatwoot_inbox_id: null,
              api_key_hash: 'abc123hash',
              durum: 'Aktif',
              created_at: new Date('2026-01-01T00:00:00Z'),
              app_settings: [],
              _count: { clients: 3, appointments: 5 },
            },
            {
              id: 'tenant-2',
              salon_adi: 'Salon İki',
              email: 'iki@example.com',
              whatsapp_phone: null,
              n8n_webhook_url: null,
              chatwoot_inbox_id: null,
              api_key_hash: null,
              durum: 'Aktif',
              created_at: new Date('2026-01-02T00:00:00Z'),
              app_settings: [],
              _count: { clients: 0, appointments: 0 },
            },
          ];
        }) as unknown as typeof prisma.tenant.findMany
      )
    );

    const listResult = await AdminService.listTenants();
    assert.ok(listSelect);
    assert.equal('api_key' in listSelect, false);
    assert.equal(listSelect.api_key_hash, true);
    assert.equal('api_key' in listResult.tenants[0], false);
    assert.equal('api_key_hash' in listResult.tenants[0], false);
    assert.equal(listResult.tenants[0].has_api_key, true);
    assert.equal(listResult.tenants[1].has_api_key, false);

    let updateSelect: Record<string, unknown> | undefined;
    t.after(
      stubMethod(
        prisma.tenant,
        'findUnique',
        (async () => ({ id: 'tenant-1', email: 'bir@example.com' })) as unknown as typeof prisma.tenant.findUnique
      )
    );
    t.after(
      stubMethod(
        prisma.tenant,
        'update',
        (async (args?: { select?: Record<string, unknown> }) => {
          updateSelect = args?.select;
          return {
            id: 'tenant-1',
            salon_adi: 'Salon Güncel',
            email: 'bir@example.com',
            whatsapp_phone: null,
            n8n_webhook_url: null,
            chatwoot_inbox_id: null,
            api_key_hash: 'abc123hash',
            durum: 'Aktif',
          };
        }) as unknown as typeof prisma.tenant.update
      )
    );

    const updateResult = await AdminService.updateTenant('tenant-1', { salon_adi: 'Salon Güncel' });
    assert.ok(updateSelect);
    assert.equal('api_key' in updateSelect, false);
    assert.equal(updateSelect.api_key_hash, true);
    assert.equal('api_key' in updateResult.tenant, false);
    assert.equal('api_key_hash' in updateResult.tenant, false);
    assert.equal(updateResult.tenant.has_api_key, true);
  });

  it('Bulgu 2: authMiddleware skips legacy table scan without tenantId and uses single-record lookup when tenantId is provided', async (t) => {
    let findManyCalled = false;
    t.after(
      stubMethod(
        prisma.tenant,
        'findMany',
        (async () => {
          findManyCalled = true;
          return [];
        }) as unknown as typeof prisma.tenant.findMany
      )
    );
    t.after(
      stubMethod(
        prisma.tenant,
        'findFirst',
        (async () => null) as unknown as typeof prisma.tenant.findFirst
      )
    );

    let statusCode = 0;
    let nextCalled = false;
    const reqNoTenant = {
      headers: { 'x-api-key': 'sk_live_legacy_key_only' },
      body: {},
      query: {},
    } as unknown as AuthenticatedRequest;
    const resNoTenant = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;

    await authMiddleware(reqNoTenant, resNoTenant, (() => {
      nextCalled = true;
    }) as NextFunction);

    assert.equal(findManyCalled, false);
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);

    // tenantId verildiğinde tek kayıt legacy doğrulama çalışır
    const legacyKey = 'sk_live_legacy_tenant_key_999';
    const findFirstCalls: Array<Record<string, unknown>> = [];
    let updatedHash: string | undefined;

    t.after(
      stubMethod(
        prisma.tenant,
        'findFirst',
        (async (args?: { where?: Record<string, unknown> }) => {
          findFirstCalls.push(args?.where ?? {});
          if (findFirstCalls.length === 1) {
            return null;
          }
          return {
            id: 'tenant-legacy-1',
            email: 'legacy@example.com',
            salon_adi: 'Legacy Salon',
            api_key: legacyKey,
          };
        }) as unknown as typeof prisma.tenant.findFirst
      )
    );
    t.after(
      stubMethod(
        prisma.tenant,
        'update',
        (async (args?: { data?: { api_key_hash?: string } }) => {
          updatedHash = args?.data?.api_key_hash;
          return {};
        }) as unknown as typeof prisma.tenant.update
      )
    );

    let legacyNextCalled = false;
    const reqWithTenant = {
      headers: {
        'x-api-key': legacyKey,
        'x-tenant-id': 'tenant-legacy-1',
      },
      body: {},
      query: {},
    } as unknown as AuthenticatedRequest;

    await authMiddleware(reqWithTenant, resNoTenant, (() => {
      legacyNextCalled = true;
    }) as NextFunction);

    assert.equal(findManyCalled, false);
    assert.equal(legacyNextCalled, true);
    assert.equal(reqWithTenant.tenantId, 'tenant-legacy-1');
    assert.equal(findFirstCalls.length, 2);
    assert.equal(findFirstCalls[1].id, 'tenant-legacy-1');
    assert.equal(findFirstCalls[1].api_key_hash, null);
    assert.equal(updatedHash, hashApiKey(legacyKey));
  });

  it('Bulgu 3: AdminService.ensureSchema rethrows API key backfill errors (fail-fast)', async (t) => {
    t.after(
      stubMethod(prisma, '$executeRaw', (async () => 0) as unknown as typeof prisma.$executeRaw)
    );
    t.after(
      stubMethod(
        prisma.tenant,
        'findMany',
        (async () => {
          throw new Error('DB connection lost during backfill');
        }) as unknown as typeof prisma.tenant.findMany
      )
    );

    await assert.rejects(
      () => AdminService.ensureSchema(),
      (err: Error) => err.message === 'DB connection lost during backfill'
    );
  });

  it('Bulgu 4: toInputJsonValue validates JSON-serializable values and SettingsService rejects invalid values', async (t) => {
    assert.deepEqual(toInputJsonValue({ a: 1, b: ['x', true, null] }, 'cfg'), {
      a: 1,
      b: ['x', true, null],
    });
    assert.equal(toInputJsonValue(new Date('2026-05-01T10:00:00.000Z'), 'dt'), '2026-05-01T10:00:00.000Z');

    assert.throws(() => toInputJsonValue(undefined, 'test'), (err: { status?: number }) => err.status === 400);
    assert.throws(() => toInputJsonValue(null, 'test'), (err: { status?: number }) => err.status === 400);
    assert.throws(() => toInputJsonValue(Number.NaN, 'test'), (err: { status?: number }) => err.status === 400);
    assert.throws(() => toInputJsonValue(Infinity, 'test'), (err: { status?: number }) => err.status === 400);
    assert.throws(() => toInputJsonValue(BigInt(10), 'test'), (err: { status?: number }) => err.status === 400);
    assert.throws(() => toInputJsonValue(new Map(), 'test'), (err: { status?: number }) => err.status === 400);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => toInputJsonValue(circular, 'circular'), (err: { status?: number }) => err.status === 400);

    let capturedCreateValue: unknown;
    t.after(
      stubMethod(
        prisma.appSetting,
        'upsert',
        (async (args: { create: { setting_value: unknown } }) => {
          capturedCreateValue = args.create.setting_value;
          return {};
        }) as unknown as typeof prisma.appSetting.upsert
      )
    );

    await assert.rejects(
      () => SettingsService.updateSettings('tenant-1', [{ setting_key: 'bad', setting_value: Number.NaN }]),
      (err: { status?: number }) => err.status === 400
    );

    await SettingsService.updateSettings('tenant-1', [{ setting_key: 'nullable', setting_value: null }]);
    assert.equal(capturedCreateValue, Prisma.JsonNull);
  });

  it('Bulgu 5: AppointmentService.getAppointments rejects invalid YYYY-MM-DD dates with 400', async (t) => {
    let findManyCalled = false;
    t.after(
      stubMethod(
        prisma.appointment,
        'findMany',
        (async () => {
          findManyCalled = true;
          return [];
        }) as unknown as typeof prisma.appointment.findMany
      )
    );

    await assert.rejects(
      () => AppointmentService.getAppointments('tenant-1', '2026-02-30', 'week'),
      (err: { status?: number }) => err.status === 400
    );
    await assert.rejects(
      () => AppointmentService.getAppointments('tenant-1', undefined, 'week', undefined, '2026/05/01', '2026-05-10'),
      (err: { status?: number }) => err.status === 400
    );
    await assert.rejects(
      () => AppointmentService.getAppointments('tenant-1', undefined, 'week', undefined, '2026-05-01', 'invalid-date'),
      (err: { status?: number }) => err.status === 400
    );
    assert.equal(findManyCalled, false);

    const rows = await AppointmentService.getAppointments('tenant-1', '2026-05-15', 'week');
    assert.deepEqual(rows, []);
    assert.equal(findManyCalled, true);
  });

  it('Bulgu 6: ChatbotService.getClientByPhone and getAppointmentsByPhone require non-empty tenantId', async (t) => {
    let capturedClientWhere: Record<string, unknown> | undefined;
    t.after(
      stubMethod(
        prisma.client,
        'findFirst',
        (async (args?: { where?: Record<string, unknown> }) => {
          capturedClientWhere = args?.where;
          return {
            id: 'client-1',
            ad_soyad: 'Ayşe Yılmaz',
            telefon: '05551234567',
            tenant_id: 'tenant-1',
          };
        }) as unknown as typeof prisma.client.findFirst
      )
    );
    let capturedAppWhere: Record<string, unknown> | undefined;
    t.after(
      stubMethod(
        prisma.appointment,
        'findMany',
        (async (args?: { where?: Record<string, unknown> }) => {
          capturedAppWhere = args?.where;
          return [];
        }) as unknown as typeof prisma.appointment.findMany
      )
    );

    await assert.rejects(
      () => ChatbotService.getClientByPhone('05551234567', ''),
      (err: { status?: number }) => err.status === 400
    );
    await assert.rejects(
      () => ChatbotService.getAppointmentsByPhone('05551234567', true, '   '),
      (err: { status?: number }) => err.status === 400
    );

    const client = await ChatbotService.getClientByPhone('05551234567', 'tenant-1');
    assert.equal(client?.id, 'client-1');
    assert.equal(capturedClientWhere?.tenant_id, 'tenant-1');

    const appts = await ChatbotService.getAppointmentsByPhone('05551234567', true, 'tenant-1');
    assert.equal(appts.success, true);
    assert.equal(capturedAppWhere?.tenant_id, 'tenant-1');
  });
});
