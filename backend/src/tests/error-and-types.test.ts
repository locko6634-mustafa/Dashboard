import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from '../config/prisma.js';
import { AdminService, isIdempotentDdlError } from '../services/admin.service.js';
import { NotesController, addNoteSchema } from '../controllers/notes.controller.js';
import { NotesService } from '../services/notes.service.js';
import { ClientService } from '../services/client.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';
import { toMoneyNumber } from '../utils/decimal.util.js';

function stubMethod<T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]): () => void {
  const original = obj[key];
  (obj as any)[key] = impl;
  return () => {
    (obj as any)[key] = original;
  };
}

function createMockResponse() {
  let statusCode = 200;
  let body: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      body = payload;
      return this;
    },
  };
  return {
    res,
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe('AdminService.ensureSchema error handling', () => {
  test('isIdempotentDdlError recognizes 42P07, 42710, 42701 across code, meta.code and cause.code', () => {
    assert.equal(isIdempotentDdlError({ code: '42P07' }), true);
    assert.equal(isIdempotentDdlError({ code: 'P2010', meta: { code: '42710' } }), true);
    assert.equal(isIdempotentDdlError({ cause: { code: '42701' } }), true);

    assert.equal(isIdempotentDdlError({ code: 'P2010', meta: { code: '42501' } }), false);
    assert.equal(isIdempotentDdlError({ code: '42601' }), false);
    assert.equal(isIdempotentDdlError(new Error('Connection refused')), false);
    assert.equal(isIdempotentDdlError(null), false);
  });

  test('ensureSchema ignores idempotent Postgres codes (42P07, 42710, 42701)', async (t) => {
    let callCount = 0;
    const codes = ['42P07', '42710', '42701'];
    const restoreRaw = stubMethod(prisma, '$executeRaw', (async () => {
      const code = codes[callCount % codes.length];
      callCount += 1;
      const err: any = new Error('Already exists');
      err.code = 'P2010';
      err.meta = { code };
      throw err;
    }) as any);
    const restoreFind = stubMethod(prisma.tenant, 'findMany', (async () => []) as any);
    t.after(() => {
      restoreRaw();
      restoreFind();
    });

    await assert.doesNotReject(() => AdminService.ensureSchema());
    assert.ok(callCount > 0);
  });

  test('ensureSchema logs and rethrows real DDL errors', async (t) => {
    const restoreRaw = stubMethod(prisma, '$executeRaw', (async () => {
      const err: any = new Error('permission denied for schema public');
      err.code = 'P2010';
      err.meta = { code: '42501' };
      throw err;
    }) as any);
    let logged = false;
    const restoreConsole = stubMethod(console, 'error', (() => {
      logged = true;
    }) as any);
    t.after(() => {
      restoreRaw();
      restoreConsole();
    });

    await assert.rejects(
      () => AdminService.ensureSchema(),
      (err: any) => err?.meta?.code === '42501'
    );
    assert.equal(logged, true);
  });
});

describe('NotesController.addNote & NotesService validation', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const validClientId = '22222222-2222-4222-8222-222222222222';

  test('addNote supports direct body and payload wrapper', async (t) => {
    const restoreClient = stubMethod(prisma.client, 'findFirst', (async () => ({ id: validClientId })) as any);
    const restoreCreate = stubMethod(prisma.hastaNotu, 'create', (async ({ data }: any) => ({
      id: '33333333-3333-4333-8333-333333333333',
      ...data,
    })) as any);
    t.after(() => {
      restoreClient();
      restoreCreate();
    });

    // Direct body
    const mockDirect = createMockResponse();
    let directNextErr: any = null;
    await NotesController.addNote(
      {
        tenantId,
        body: { hasta_id: validClientId, not_metni: 'Kontrol notu', tarih: '2026-11-14T10:00:00Z' },
      } as any,
      mockDirect.res,
      (err) => {
        directNextErr = err;
      }
    );
    assert.equal(directNextErr, null);
    assert.equal(mockDirect.getStatus(), 201);
    assert.equal(mockDirect.getBody().success, true);

    // Payload wrapper
    const mockWrapped = createMockResponse();
    let wrappedNextErr: any = null;
    await NotesController.addNote(
      {
        tenantId,
        body: { payload: { not: 'Sarmalanmış not' } },
      } as any,
      mockWrapped.res,
      (err) => {
        wrappedNextErr = err;
      }
    );
    assert.equal(wrappedNextErr, null);
    assert.equal(mockWrapped.getStatus(), 201);
    assert.equal(mockWrapped.getBody().data.hasta_id, null);
  });

  test('addNote passes ZodError -> 400 Bad Request for invalid or missing inputs', async (t) => {
    const restoreConsole = stubMethod(console, 'error', (() => {}) as any);
    t.after(restoreConsole);

    const invalidBodies = [
      undefined,
      {},
      { payload: null },
      { not_metni: '   ' },
      { not_metni: 12345 },
      { hasta_id: 'not-a-uuid', not_metni: 'Geçerli metin' },
      { hasta_id: 999, not_metni: 'Geçerli metin' },
      { not_metni: 'Geçerli metin', tarih: 'gecersiz-tarih' },
    ];

    for (const body of invalidBodies) {
      const mock = createMockResponse();
      let capturedErr: any = null;
      await NotesController.addNote(
        { tenantId, body } as any,
        mock.res,
        (err) => {
          capturedErr = err;
        }
      );
      assert.ok(capturedErr instanceof ZodError, `Expected ZodError for body: ${JSON.stringify(body)}`);
      errorHandler(capturedErr, {} as any, mock.res, (() => {}) as any);
      assert.equal(mock.getStatus(), 400);
      assert.equal(mock.getBody().success, false);
    }

    assert.equal(addNoteSchema.safeParse({ not: 'Merhaba' }).success, true);
  });

  test('NotesService.addNote enforces consistent hasta_id, text and date validation', async () => {
    await assert.rejects(
      () => NotesService.addNote(tenantId, null, '   '),
      (err: any) => err?.status === 400
    );
    await assert.rejects(
      () => NotesService.addNote(tenantId, 'invalid-uuid', 'Not metni'),
      (err: any) => err?.status === 400
    );
    await assert.rejects(
      () => NotesService.addNote(tenantId, null, 'Not metni', 'not-a-date'),
      (err: any) => err?.status === 400
    );
  });
});

describe('Decimal utility & ClientService money serialization', () => {
  test('toMoneyNumber converts Prisma.Decimal, number, string, null/undefined and rounds to 2 decimals', () => {
    assert.equal(toMoneyNumber(new Prisma.Decimal('1234.567')), 1234.57);
    assert.equal(toMoneyNumber(new Prisma.Decimal('100.10')), 100.1);
    assert.equal(toMoneyNumber(1.005), 1.01);
    assert.equal(toMoneyNumber(-1.005), -1.01);
    assert.equal(toMoneyNumber(-0), 0);
    assert.equal(toMoneyNumber(' 99.994 '), 99.99);
    assert.equal(toMoneyNumber(''), 0);
    assert.equal(toMoneyNumber(null), 0);
    assert.equal(toMoneyNumber(undefined), 0);
    assert.equal(toMoneyNumber('invalid'), 0);
    assert.equal(toMoneyNumber(Number.NaN), 0);
    assert.equal(toMoneyNumber(Number.POSITIVE_INFINITY), 0);
  });

  test('ClientService serializes Prisma.Decimal fields using toMoneyNumber', async (t) => {
    const fakeClient = {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      ad_soyad: 'Ayşe Yılmaz',
      telefon: '05551112233',
      toplam_tutar: new Prisma.Decimal('1500.555'),
      alinan_odeme: new Prisma.Decimal('750.2'),
      appointments: [],
      hasta_notlari: [],
    };

    const restoreFindMany = stubMethod(prisma.client, 'findMany', (async () => [fakeClient]) as any);
    const restoreFindFirst = stubMethod(prisma.client, 'findFirst', (async () => fakeClient) as any);
    t.after(() => {
      restoreFindMany();
      restoreFindFirst();
    });

    const list = await ClientService.searchClients(fakeClient.tenant_id, '');
    assert.equal(list[0].toplam_tutar, 1500.56);
    assert.equal(list[0].alinan_odeme, 750.2);

    const detail = await ClientService.getClientById(fakeClient.tenant_id, fakeClient.id);
    assert.equal(detail.toplam_tutar, 1500.56);
    assert.equal(detail.alinan_odeme, 750.2);
  });
});
