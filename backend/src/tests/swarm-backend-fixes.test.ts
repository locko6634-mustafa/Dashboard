import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { NotesController } from '../controllers/notes.controller.js';
import { ChatbotController } from '../controllers/chatbot.controller.js';
import { NotesService } from '../services/notes.service.js';
import { ClientService, updateClientSchema } from '../services/client.service.js';
import { createAppointmentSchema, updateAppointmentSchema } from '../services/appointment.service.js';
import { CronService } from '../services/cron.service.js';
import { authMiddleware, type AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { prisma } from '../config/prisma.js';

function stubMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

function createMockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {
    status(code: number) {
      res.statusCode = code;
      return res as Response;
    },
    json(payload: unknown) {
      res.body = payload;
      return res as Response;
    },
  };
  return res as Response & { statusCode?: number; body?: unknown };
}

describe('Swarm Backend Fixes Regression Tests', () => {
  test('1. NotesController.deleteNote handles undefined/null req.body without 500 TypeError', async (t) => {
    let calledWith: { tenantId: string; noteId: string } | undefined;
    t.after(
      stubMethod(NotesService, 'deleteNote', (async (tenantId: string, noteId: string) => {
        calledWith = { tenantId, noteId };
        return { success: true };
      }) as typeof NotesService.deleteNote)
    );

    for (const bodyValue of [undefined, null, 'invalid-string']) {
      const req = {
        tenantId: 'tenant-1',
        params: {},
        body: bodyValue,
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      let forwardedErr: unknown;
      const next: NextFunction = (err?: unknown) => {
        forwardedErr = err;
      };

      await NotesController.deleteNote(req, res, next);
      assert.equal(forwardedErr, undefined);
      assert.equal(res.statusCode, 400);
    }

    const validReq = {
      tenantId: 'tenant-1',
      params: {},
      body: { payload: { note_id: 'note-123' } },
    } as unknown as AuthenticatedRequest;
    const validRes = createMockRes();
    let validErr: unknown;
    await NotesController.deleteNote(validReq, validRes, (err?: unknown) => {
      validErr = err;
    });
    assert.equal(validErr, undefined);
    assert.deepEqual(calledWith, { tenantId: 'tenant-1', noteId: 'note-123' });
  });

  test('2. NotesController and ChatbotController safely ignore non-string query values', async (t) => {
    let capturedHastaId: string | undefined = 'sentinel';
    t.after(
      stubMethod(NotesService, 'getNotes', (async (_tenantId: string, hastaId?: string) => {
        capturedHastaId = hastaId;
        return [];
      }) as typeof NotesService.getNotes)
    );

    const notesReq = {
      tenantId: 'tenant-1',
      query: { id: ['h1', 'h2'], hasta_id: { bad: true } },
    } as unknown as AuthenticatedRequest;
    const notesRes = createMockRes();
    await NotesController.getNotes(notesReq, notesRes, () => {});
    assert.equal(capturedHastaId, undefined);
    assert.deepEqual(notesRes.body, []);

    for (const handler of [ChatbotController.getClientByPhone, ChatbotController.getAppointments]) {
      const req = {
        tenantId: 'tenant-1',
        headers: {},
        query: { phone: ['5551234567'], telefon: { nested: '5551234567' } },
        body: {},
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      let nextErr: unknown;
      await handler(req, res, (err?: unknown) => {
        nextErr = err;
      });
      assert.equal(nextErr, undefined);
      assert.equal(res.statusCode, 400);
    }

    const stateReq = {
      tenantId: 'tenant-1',
      headers: {},
      query: {
        conversation_id: ['c1'],
        conversationId: { id: 'c2' },
        phone: ['5551234567'],
        telefon: 12345,
      },
      body: {},
    } as unknown as AuthenticatedRequest;
    const stateRes = createMockRes();
    let stateErr: unknown;
    await ChatbotController.getState(stateReq, stateRes, (err?: unknown) => {
      stateErr = err;
    });
    assert.equal(stateErr, undefined);
    assert.deepEqual(stateRes.body, {
      conversation_id: '',
      current_intent: '',
      current_stage: 'START',
      step: '',
      context_data: {},
    });
  });

  test('3. ClientService.updateClient uses Serializable transaction, FOR UPDATE lock, and atomic deltas', async (t) => {
    let capturedOptions: unknown;
    let lockedQueryCalled = false;
    let capturedUpdateData: unknown;

    t.after(
      stubMethod(prisma, '$transaction', (async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
        capturedOptions = options;
        const mockTx = {
          $queryRaw: async () => {
            lockedQueryCalled = true;
            return [{ id: 'c1', gelinen_seans: 2, alinan_odeme: new Prisma.Decimal('500.00') }];
          },
          client: {
            updateMany: async (args: { data: unknown }) => {
              capturedUpdateData = args.data;
              return { count: 1 };
            },
            findFirst: async () => ({
              id: 'c1',
              tenant_id: 't1',
              ad_soyad: 'Ali Veli',
              telefon: '5551234567',
              kronik_rahatsizlik: null,
              paket_adi: null,
              toplam_seans: 10,
              gelinen_seans: 3,
              toplam_tutar: new Prisma.Decimal('1000.00'),
              alinan_odeme: new Prisma.Decimal('750.00'),
              created_at: new Date(),
            }),
          },
        };
        return fn(mockTx);
      }) as unknown as typeof prisma.$transaction)
    );

    const parsed = updateClientSchema.parse({ gelinen_seans_delta: 1, alinan_odeme_delta: 250 });
    const res = await ClientService.updateClient('t1', 'c1', parsed);
    assert.equal(res.success, true);
    assert.equal(lockedQueryCalled, true);
    assert.deepEqual(capturedOptions, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    assert.deepEqual(capturedUpdateData, {
      gelinen_seans: { increment: 1 },
      alinan_odeme: { increment: 250 },
    });

    // Negative delta below 0 must throw 400
    await assert.rejects(
      () => ClientService.updateClient('t1', 'c1', { gelinen_seans_delta: -5 }),
      (err: { status?: number }) => err.status === 400
    );

    // Absolute contract still works
    await ClientService.updateClient('t1', 'c1', { gelinen_seans: 4, alinan_odeme: 800 });
    assert.deepEqual(capturedUpdateData, {
      gelinen_seans: 4,
      alinan_odeme: 800,
    });
  });

  test('3b. ClientService.updateClient maps Prisma P2034 serialization conflict to 409', async (t) => {
    t.after(
      stubMethod(prisma, '$transaction', (async () => {
        throw { code: 'P2034', message: 'Transaction failed due to a write conflict' };
      }) as unknown as typeof prisma.$transaction)
    );

    await assert.rejects(
      () => ClientService.updateClient('t1', 'c1', { gelinen_seans: 5 }),
      (err: { status?: number }) => err.status === 409
    );
  });

  test('4. Prisma schema has Appointment [tenant_id, hasta_id] index and schemas trim/validate date & time', () => {
    const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
    const schemaText = fs.readFileSync(schemaPath, 'utf-8');
    assert.match(schemaText, /model Appointment[\s\S]*@@index\(\[tenant_id, hasta_id\]\)/);

    const validCreate = createAppointmentSchema.parse({
      tarih: ' 2026-06-15 ',
      baslangic_saati: ' 09:30 ',
    });
    assert.equal(validCreate.tarih, '2026-06-15');
    assert.equal(validCreate.baslangic_saati, '09:30');

    assert.throws(
      () => createAppointmentSchema.parse({ tarih: '15-06-2026', baslangic_saati: '09:30' }),
      ZodError
    );
    assert.throws(
      () => updateAppointmentSchema.parse({ baslangic_saati: '25:99' }),
      ZodError
    );
  });

  test('5. CronService.start attaches .catch on initial setTimeout sweep and server.ts registers global error handlers', async (t) => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalSetInterval = globalThis.setInterval;
    let scheduledFn: (() => void) | undefined;

    t.after(() => {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.setInterval = originalSetInterval;
      CronService.stop();
    });

    globalThis.setTimeout = ((fn: () => void) => {
      scheduledFn = fn;
      return { unref() {} } as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;

    globalThis.setInterval = (() => {
      return { unref() {} } as unknown as NodeJS.Timeout;
    }) as unknown as typeof setInterval;

    t.after(
      stubMethod(CronService, 'sweepExpiredAppointments', (async () => {
        throw new Error('simulated sweep error');
      }) as typeof CronService.sweepExpiredAppointments)
    );

    const errors: unknown[][] = [];
    t.after(
      stubMethod(console, 'error', ((...args: unknown[]) => {
        errors.push(args);
      }) as typeof console.error)
    );

    CronService.start(15);
    assert.ok(scheduledFn);
    scheduledFn();
    await new Promise((r) => originalSetTimeout(r, 10));
    assert.ok(errors.some((args) => String(args[0]).includes('Initial sweep failed')));

    const serverPath = path.resolve(process.cwd(), 'src/server.ts');
    const serverText = fs.readFileSync(serverPath, 'utf-8');
    assert.match(serverText, /process\.on\('unhandledRejection'/);
    assert.match(serverText, /process\.on\('uncaughtException'/);
  });

  test('6. authMiddleware logs contextual tenant.id without leaking secrets on lazy api_key_hash migration failure', async (t) => {
    const rawKey = 'super-secret-api-key-12345';
    const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    let findFirstCall = 0;
    t.after(
      stubMethod(prisma.tenant, 'findFirst', (async () => {
        findFirstCall += 1;
        if (findFirstCall === 1) return null;
        return {
          id: 'tenant-abc-999',
          email: 'salon@example.com',
          salon_adi: 'Test Salon',
          api_key: rawKey,
        };
      }) as unknown as typeof prisma.tenant.findFirst)
    );

    t.after(
      stubMethod(prisma.tenant, 'update', (() => {
        return Promise.reject(new Error('DB write error'));
      }) as unknown as typeof prisma.tenant.update)
    );

    const warnings: string[] = [];
    t.after(
      stubMethod(console, 'warn', ((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
      }) as typeof console.warn)
    );

    const req = {
      headers: {
        'x-api-key': rawKey,
        'x-tenant-id': 'tenant-abc-999',
      },
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    await new Promise((r) => setTimeout(r, 10));

    assert.equal(nextCalled, true);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('tenant-abc-999'), 'Expected tenant.id in warning');
    assert.ok(!warnings[0].includes(rawKey), 'Must not leak raw api_key');
    assert.ok(!warnings[0].includes(expectedHash), 'Must not leak api_key_hash');
  });
});
