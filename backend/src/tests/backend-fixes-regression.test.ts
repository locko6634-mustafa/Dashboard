import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  ChatbotController,
  chatbotBookSchema,
  chatbotCancelSchema,
  chatbotRescheduleSchema,
  chatbotSetStateSchema,
} from '../controllers/chatbot.controller.js';
import { AuthController, authLoginSchema } from '../controllers/auth.controller.js';
import { AdminController, adminLoginSchema } from '../controllers/admin.controller.js';
import { extractQueryString } from '../controllers/appointment.controller.js';
import { CronService } from '../services/cron.service.js';
import { AdminService } from '../services/admin.service.js';
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

describe('Backend Fixes Regression Tests', () => {
  test('extractQueryString returns string values only and undefined for non-strings', () => {
    assert.equal(extractQueryString('2026-05-01'), '2026-05-01');
    assert.equal(extractQueryString(''), '');
    assert.equal(extractQueryString(['a', 'b']), undefined);
    assert.equal(extractQueryString({ nested: true }), undefined);
    assert.equal(extractQueryString(123), undefined);
    assert.equal(extractQueryString(undefined), undefined);
    assert.equal(extractQueryString(null), undefined);
  });

  test('authLoginSchema and adminLoginSchema reject invalid types and empty payloads', () => {
    assert.throws(() => authLoginSchema.parse({}), ZodError);
    assert.throws(() => authLoginSchema.parse({ email: 123, password: 'secret' }), ZodError);
    assert.throws(() => authLoginSchema.parse({ email: 'a@b.com', password: { bad: true } }), ZodError);

    assert.throws(() => adminLoginSchema.parse({}), ZodError);
    assert.throws(() => adminLoginSchema.parse({ email: ['a@b.com'], password: 'secret' }), ZodError);

    const valid = authLoginSchema.parse({ email: ' test@example.com ', password: 'secret' });
    assert.equal(valid.email, 'test@example.com');
  });

  test('AuthController.login and AdminController.login forward ZodError to next() on invalid body types', async () => {
    let authErr: unknown = null;
    await AuthController.login(
      { body: { email: 999, password: 'x' } } as Request,
      createMockRes(),
      ((err: unknown) => {
        authErr = err;
      }) as NextFunction
    );
    assert.ok(authErr instanceof ZodError);

    let adminErr: unknown = null;
    await AdminController.login(
      { body: { email: 'a@b.com', password: 123 } } as Request,
      createMockRes(),
      ((err: unknown) => {
        adminErr = err;
      }) as NextFunction
    );
    assert.ok(adminErr instanceof ZodError);
  });

  test('chatbotBookSchema prevents NaN for sure and rejects non-numeric/non-positive values', () => {
    const parsedStr = chatbotBookSchema.parse({
      telefon: '05551234567',
      tarih: '2026-06-01',
      saat: '10:00',
      sure: '45',
    });
    assert.equal(parsedStr.sure, 45);

    const parsedNum = chatbotBookSchema.parse({
      telefon: '05551234567',
      tarih: '2026-06-01',
      saat: '10:00',
      sure: 60,
    });
    assert.equal(parsedNum.sure, 60);

    const parsedEmpty = chatbotBookSchema.parse({
      telefon: '05551234567',
      tarih: '2026-06-01',
      saat: '10:00',
      sure: '',
    });
    assert.equal(parsedEmpty.sure, undefined);

    assert.throws(() => chatbotBookSchema.parse({ sure: 'abc' }), ZodError);
    assert.throws(() => chatbotBookSchema.parse({ sure: NaN }), ZodError);
    assert.throws(() => chatbotBookSchema.parse({ sure: -15 }), ZodError);
    assert.throws(() => chatbotBookSchema.parse({ sure: 0 }), ZodError);
    assert.throws(() => chatbotBookSchema.parse({ telefon: 5551234567 }), ZodError);
  });

  test('chatbotCancelSchema, chatbotRescheduleSchema, and chatbotSetStateSchema reject invalid types', () => {
    assert.throws(() => chatbotCancelSchema.parse({ appointment_id: 123 }), ZodError);
    assert.throws(() => chatbotRescheduleSchema.parse({ tarih: ['2026-06-01'] }), ZodError);
    assert.throws(() => chatbotSetStateSchema.parse({ conversation_id: { id: 1 } }), ZodError);
  });

  test('ChatbotController.getAvailableSlots rejects non-numeric duration with 400 instead of NaN', async () => {
    const res = createMockRes();
    let nextCalled = false;
    await ChatbotController.getAvailableSlots(
      {
        tenantId: 'tenant-1',
        headers: {},
        query: { date: '2026-06-01', sure: 'abc' },
        body: {},
      } as unknown as Request & { tenantId: string },
      res,
      (() => {
        nextCalled = true;
      }) as NextFunction
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
  });

  test('CronService.sweepExpiredAppointments scopes updateMany with deleted_at: null', async (t) => {
    let capturedWhere: unknown = null;
    t.after(
      stubMethod(prisma.appointment, 'findMany', (async () => [
        {
          id: 'apt-expired-1',
          tarih: '2020-01-01',
          baslangic_saati: '09:00',
          sure: 30,
        },
      ]) as unknown as typeof prisma.appointment.findMany)
    );
    t.after(
      stubMethod(prisma.appointment, 'updateMany', (async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return { count: 1 };
      }) as unknown as typeof prisma.appointment.updateMany)
    );

    await CronService.sweepExpiredAppointments();
    assert.deepEqual(capturedWhere, {
      id: { in: ['apt-expired-1'] },
      deleted_at: null,
    });
  });

  test('AdminService.deleteTenant ignores P2021 missing table error but rethrows real DB errors', async (t) => {
    t.after(
      stubMethod(prisma.tenant, 'findUnique', (async () => ({
        id: 'tenant-1',
        salon_adi: 'Test Salon',
      })) as unknown as typeof prisma.tenant.findUnique)
    );
    let deleteCount = 0;
    t.after(
      stubMethod(prisma.tenant, 'delete', (async () => {
        deleteCount += 1;
        return { id: 'tenant-1' };
      }) as unknown as typeof prisma.tenant.delete)
    );

    // P2021 should warn and continue to tenant.delete
    const p2021Err = new Prisma.PrismaClientKnownRequestError('Table does not exist', {
      code: 'P2021',
      clientVersion: '6.3.0',
    });
    const restoreP2021 = stubMethod(prisma.conversationState, 'deleteMany', (async () => {
      throw p2021Err;
    }) as unknown as typeof prisma.conversationState.deleteMany);

    const okResult = await AdminService.deleteTenant('tenant-1');
    restoreP2021();
    assert.equal(okResult.success, true);
    assert.equal(deleteCount, 1);

    // Real DB error (e.g. connection/permission error) must be rethrown
    t.after(
      stubMethod(prisma.conversationState, 'deleteMany', (async () => {
        throw new Error('DB connection lost');
      }) as unknown as typeof prisma.conversationState.deleteMany)
    );

    await assert.rejects(() => AdminService.deleteTenant('tenant-1'), /DB connection lost/);
  });

  test('AdminService.ensureSchema uses $executeRaw instead of $executeRawUnsafe', async (t) => {
    let rawCount = 0;
    let unsafeCount = 0;
    t.after(
      stubMethod(prisma, '$executeRaw', (async () => {
        rawCount += 1;
        return 0;
      }) as unknown as typeof prisma.$executeRaw)
    );
    t.after(
      stubMethod(prisma, '$executeRawUnsafe', (async () => {
        unsafeCount += 1;
        return 0;
      }) as unknown as typeof prisma.$executeRawUnsafe)
    );
    t.after(
      stubMethod(prisma.tenant, 'findMany', (async () => []) as unknown as typeof prisma.tenant.findMany)
    );

    await AdminService.ensureSchema();
    assert.ok(rawCount > 0, 'Expected $executeRaw to be called');
    assert.equal(unsafeCount, 0, 'Expected $executeRawUnsafe never to be called');
  });
});
