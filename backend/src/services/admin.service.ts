import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';
import { toInputJsonValue } from '../utils/json.util.js';

const IDEMPOTENT_PG_CODES = new Set(['42P07', '42710', '42701']);

/**
 * API anahtarının SHA-256 özetini (hex) üretir.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export interface TenantSettingsInput {
  calendar?: Prisma.InputJsonValue;
  services?: Prisma.InputJsonValue;
  sector?: string;
  terminology?: Prisma.InputJsonValue;
  ui_preferences?: Prisma.InputJsonValue;
}

/**
 * Postgres DDL sorgularında yalnızca "zaten var" (duplicate_table, duplicate_object, duplicate_column)
 * hatalarının idempotent olarak yutulup yutulamayacağını kontrol eder.
 */
export function isIdempotentDdlError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as {
    meta?: { code?: unknown };
    cause?: { code?: unknown };
    code?: unknown;
  };
  const candidates = [e.meta?.code, e.cause?.code, e.code];
  return candidates.some((code) => typeof code === 'string' && IDEMPOTENT_PG_CODES.has(code));
}

export class AdminService {
  /**
   * Süper Admin ve Multi-tenant tablolarının/kolonlarının varlığını garantiye alır.
   */
  static async ensureSchema() {
    const statements: Array<() => Promise<unknown>> = [
      () => prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        salon_adi VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        whatsapp_phone VARCHAR(50),
        n8n_webhook_url VARCHAR(500),
        chatwoot_inbox_id VARCHAR(100),
        api_key VARCHAR(100) UNIQUE,
        api_key_hash VARCHAR(64) UNIQUE,
        durum VARCHAR(20) DEFAULT 'Aktif',
        plan_tipi VARCHAR(50) DEFAULT 'Standart',
        plan_bitis_tarihi TIMESTAMPTZ(6),
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_soyad VARCHAR(255) NOT NULL,
        telefon VARCHAR(50) NOT NULL,
        kronik_rahatsizlik TEXT,
        paket_adi VARCHAR(255),
        toplam_seans INT DEFAULT 0,
        gelinen_seans INT DEFAULT 0,
        toplam_tutar NUMERIC(12, 2) DEFAULT 0,
        alinan_odeme NUMERIC(12, 2) DEFAULT 0,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hasta_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
        tarih VARCHAR(20) NOT NULL,
        baslangic_saati VARCHAR(20) NOT NULL,
        bitis_saati VARCHAR(20),
        durum VARCHAR(50) DEFAULT 'Bekliyor',
        hizmet VARCHAR(100),
        sure INT DEFAULT 30,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ(6),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.hasta_notlari (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hasta_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
        not_metni TEXT NOT NULL,
        tarih TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.app_settings (
        setting_key VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key, tenant_id)
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.conversation_states (
        conversation_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        current_intent VARCHAR(100),
        current_stage VARCHAR(100),
        context_data JSONB DEFAULT '{}',
        retry_count INT DEFAULT 0,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, tenant_id)
      )`,
      () => prisma.$executeRaw`CREATE TABLE IF NOT EXISTS public.super_admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        ad_soyad VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      )`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50)`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS n8n_webhook_url VARCHAR(500)`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS chatwoot_inbox_id VARCHAR(100)`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS api_key VARCHAR(100)`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64)`,
      () => prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_api_key_hash ON public.tenants(api_key_hash)`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS durum VARCHAR(20) DEFAULT 'Aktif'`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_tipi VARCHAR(50) DEFAULT 'Standart'`,
      () => prisma.$executeRaw`ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_bitis_tarihi TIMESTAMPTZ(6)`,
      () => prisma.$executeRaw`ALTER TABLE public.conversation_states ADD COLUMN IF NOT EXISTS tenant_id UUID`,
      () => prisma.$executeRaw`
        DO $$
        DECLARE
          pk_name text;
          pk_cols int;
        BEGIN
          SELECT c.conname, array_length(c.conkey, 1)
          INTO pk_name, pk_cols
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'public'
            AND t.relname = 'conversation_states'
            AND c.contype = 'p';

          IF pk_name IS NOT NULL AND pk_cols = 1 THEN
            EXECUTE format('ALTER TABLE public.conversation_states DROP CONSTRAINT %I', pk_name);
            EXECUTE 'ALTER TABLE public.conversation_states ADD PRIMARY KEY (conversation_id, tenant_id)';
          END IF;
        END $$
      `,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_clients_tenant_telefon ON public.clients(tenant_id, telefon)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_tenant_tarih ON public.appointments(tenant_id, tarih)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_tenant_hasta ON public.appointments(tenant_id, hasta_id)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_tenant_deleted ON public.appointments(tenant_id, deleted_at)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_hasta_notlari_tenant_hasta ON public.hasta_notlari(tenant_id, hasta_id)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_conv_phone ON public.conversation_states(phone_number)`,
      () => prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_conv_tenant ON public.conversation_states(tenant_id)`,
    ];

    for (const runStatement of statements) {
      try {
        await runStatement();
      } catch (e) {
        if (isIdempotentDdlError(e)) {
          continue;
        }
        console.error('Schema DDL execution failed:', e);
        throw e;
      }
    }


    // Auto-generate api_key & api_key_hash for tenants missing one, and backfill api_key_hash
    try {
      const tenantsNeedingKeys = await prisma.tenant.findMany({
        where: {
          OR: [
            { api_key: null },
            { api_key: '' },
            { api_key_hash: null },
            { api_key_hash: '' },
          ],
        },
        select: { id: true, api_key: true, api_key_hash: true },
      });
      for (const t of tenantsNeedingKeys) {
        const rawKey = t.api_key && t.api_key.trim()
          ? t.api_key
          : 'sk_live_' + crypto.randomBytes(20).toString('hex');
        const keyHash = hashApiKey(rawKey);
        await prisma.tenant.update({
          where: { id: t.id },
          data: {
            api_key: rawKey,
            api_key_hash: keyHash,
          },
        });
      }
    } catch (keyErr) {
      console.error('Failed to auto-generate tenant API keys:', keyErr);
      throw keyErr;
    }
  }

  /**
   * Sistemde en az bir süper yönetici kayıtlı mı kontrol eder.
   */
  static async checkSetupStatus() {
    await AdminService.ensureSchema();
    const count = await prisma.superAdmin.count();
    return {
      needsSetup: count === 0,
      hasAdmin: count > 0,
    };
  }

  /**
   * İlk kurulumda süper yönetici hesabı oluşturur.
   * Sistemde zaten bir yönetici varsa güvenlik amacıyla engellenir.
   */
  static async setupInitialAdmin(data: { email: string; password: string; ad_soyad: string }) {
    const count = await prisma.superAdmin.count();
    if (count > 0) {
      throw { status: 400, message: 'İlk kurulum zaten tamamlanmış. Yeni yönetici eklenemez.' };
    }

    if (!data.email || !data.password || !data.ad_soyad) {
      throw { status: 400, message: 'Ad soyad, e-posta ve şifre zorunludur.' };
    }

    const password_hash = await argon2.hash(data.password);
    const admin = await prisma.superAdmin.create({
      data: {
        email: data.email.trim().toLowerCase(),
        password_hash,
        ad_soyad: data.ad_soyad.trim(),
      },
    });

    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        ad_soyad: admin.ad_soyad,
        role: 'super_admin',
      },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        ad_soyad: admin.ad_soyad,
      },
    };
  }

  /**
   * Süper Admin girişi
   */
  static async login(email: string, password: string) {
    const admin = await prisma.superAdmin.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!admin) {
      throw { status: 401, message: 'Geçersiz e-posta veya şifre' };
    }

    const isMatch = await argon2.verify(admin.password_hash, password);
    if (!isMatch) {
      throw { status: 401, message: 'Geçersiz e-posta veya şifre' };
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        ad_soyad: admin.ad_soyad,
        role: 'super_admin',
      },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        ad_soyad: admin.ad_soyad,
      },
    };
  }

  /**
   * Platform genel KPI istatistiklerini hesaplar.
   */
  static async getSystemStats() {
    await AdminService.ensureSchema();
    const [totalTenants, activeTenants, totalClients, totalAppointments] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { durum: 'Aktif' } }),
      prisma.client.count(),
      prisma.appointment.count({ where: { deleted_at: null } }),
    ]);

    // Son 30 günde oluşturulan randevular
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentAppointments = await prisma.appointment.count({
      where: {
        deleted_at: null,
        created_at: { gte: thirtyDaysAgo },
      },
    });

    return {
      success: true,
      stats: {
        totalTenants,
        activeTenants,
        passiveTenants: totalTenants - activeTenants,
        totalClients,
        totalAppointments,
        recentAppointments,
      },
    };
  }

  /**
   * İşletmeleri listeleme, arama ve filtreleme
   */
  static async listTenants(search?: string, durum?: string) {
    await AdminService.ensureSchema();
    const where: Prisma.TenantWhereInput = {};

    if (durum && durum !== 'Tümü') {
      where.durum = durum;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { salon_adi: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { whatsapp_phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        salon_adi: true,
        email: true,
        whatsapp_phone: true,
        n8n_webhook_url: true,
        chatwoot_inbox_id: true,
        api_key_hash: true,
        durum: true,
        created_at: true,
        app_settings: true,
        _count: {
          select: {
            clients: true,
            appointments: { where: { deleted_at: null } },
          },
        },
      },
    });

    return {
      success: true,
      tenants: tenants.map(({ api_key_hash, ...t }) => ({
        ...t,
        has_api_key: Boolean(api_key_hash),
        client_count: t._count.clients,
        appointment_count: t._count.appointments,
      })),
    };
  }

  /**
   * Yeni işletme (Tenant) kaydı oluşturma (Sektör, mesai ve hizmet ayarlarıyla)
   */
  static async createTenant(data: {
    salon_adi: string;
    email: string;
    password: string;
    whatsapp_phone?: string;
    n8n_webhook_url?: string;
    chatwoot_inbox_id?: string;
    durum?: string;
    settings?: TenantSettingsInput;
  }) {
    if (!data.salon_adi || !data.email || !data.password) {
      throw { status: 400, message: 'Salon adı, e-posta ve şifre zorunludur' };
    }

    const existing = await prisma.tenant.findUnique({
      where: { email: data.email.trim().toLowerCase() },
    });

    if (existing) {
      throw { status: 400, message: 'Bu e-posta adresiyle zaten kayıtlı bir işletme mevcut' };
    }

    const password_hash = await argon2.hash(data.password);
    const apiKey = 'sk_live_' + crypto.randomBytes(20).toString('hex');

    const settingsPayload: Array<{ setting_key: string; setting_value: Prisma.InputJsonValue }> = [];

    if (data.settings) {
      const settingKeys: Array<keyof TenantSettingsInput> = [
        'calendar',
        'services',
        'sector',
        'terminology',
        'ui_preferences',
      ];
      for (const key of settingKeys) {
        const val = data.settings[key];
        if (val !== undefined) {
          settingsPayload.push({
            setting_key: key,
            setting_value: toInputJsonValue(val, key),
          });
        }
      }
    }

    // Varsayılan ayarlar yedek
    if (!settingsPayload.some(s => s.setting_key === 'calendar')) {
      settingsPayload.push({
        setting_key: 'calendar',
        setting_value: { START_HOUR: 9, END_HOUR: 19, SLOT_MINS: 15, DAYS: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] }
      });
    }
    if (!settingsPayload.some(s => s.setting_key === 'services')) {
      settingsPayload.push({
        setting_key: 'services',
        setting_value: { DEFAULT_MINS: 30, MAP: { 'Standart': 30 }, LIST: ['Standart'] }
      });
    }

    const tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          salon_adi: data.salon_adi.trim(),
          email: data.email.trim().toLowerCase(),
          password_hash,
          whatsapp_phone: data.whatsapp_phone ? data.whatsapp_phone.trim() : null,
          n8n_webhook_url: data.n8n_webhook_url ? data.n8n_webhook_url.trim() : null,
          chatwoot_inbox_id: data.chatwoot_inbox_id ? data.chatwoot_inbox_id.trim() : null,
          api_key: apiKey,
          api_key_hash: hashApiKey(apiKey),
          durum: data.durum || 'Aktif',
        },
      });

      // İşletmenin ayarlarını tohumlama / kaydetme (calendar, services, sector, terminology, ui_preferences)
      for (const item of settingsPayload) {
        await tx.appSetting.upsert({
          where: {
            setting_key_tenant_id: {
              setting_key: item.setting_key,
              tenant_id: createdTenant.id,
            },
          },
          update: { setting_value: item.setting_value },
          create: {
            setting_key: item.setting_key,
            tenant_id: createdTenant.id,
            setting_value: item.setting_value,
          },
        });
      }

      return createdTenant;
    });

    return {
      success: true,
      tenant: {
        id: tenant.id,
        salon_adi: tenant.salon_adi,
        email: tenant.email,
        whatsapp_phone: tenant.whatsapp_phone,
        n8n_webhook_url: tenant.n8n_webhook_url,
        chatwoot_inbox_id: tenant.chatwoot_inbox_id,
        api_key: tenant.api_key,
        durum: tenant.durum,
      },
    };
  }

  /**
   * İşletme bilgilerini ve ayarlarını güncelleme
   */
  static async updateTenant(
    id: string,
    data: {
      salon_adi?: string;
      email?: string;
      password?: string;
      whatsapp_phone?: string;
      n8n_webhook_url?: string;
      chatwoot_inbox_id?: string;
      durum?: string;
      settings?: TenantSettingsInput;
    }
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw { status: 404, message: 'İşletme bulunamadı' };
    }

    const updatePayload: Prisma.TenantUpdateInput = {};
    if (data.salon_adi) updatePayload.salon_adi = data.salon_adi.trim();
    if (data.email) {
      const emailLower = data.email.trim().toLowerCase();
      if (emailLower !== tenant.email) {
        const dup = await prisma.tenant.findUnique({ where: { email: emailLower } });
        if (dup) throw { status: 400, message: 'Bu e-posta adresi başka bir işletme tarafından kullanılıyor' };
        updatePayload.email = emailLower;
      }
    }
    if (data.password && data.password.trim().length > 0) {
      updatePayload.password_hash = await argon2.hash(data.password.trim());
    }
    if (data.whatsapp_phone !== undefined) updatePayload.whatsapp_phone = data.whatsapp_phone ? data.whatsapp_phone.trim() : null;
    if (data.n8n_webhook_url !== undefined) updatePayload.n8n_webhook_url = data.n8n_webhook_url ? data.n8n_webhook_url.trim() : null;
    if (data.chatwoot_inbox_id !== undefined) updatePayload.chatwoot_inbox_id = data.chatwoot_inbox_id ? data.chatwoot_inbox_id.trim() : null;
    if (data.durum !== undefined) updatePayload.durum = data.durum;

    const updated = await prisma.tenant.update({
      where: { id },
      data: updatePayload,
      select: {
        id: true,
        salon_adi: true,
        email: true,
        whatsapp_phone: true,
        n8n_webhook_url: true,
        chatwoot_inbox_id: true,
        api_key_hash: true,
        durum: true,
      },
    });

    // Eğer settings geldiyse app_settings güncelle
    if (data.settings) {
      const settingEntries: Array<[keyof TenantSettingsInput, unknown]> = [
        ['calendar', data.settings.calendar],
        ['services', data.settings.services],
        ['sector', data.settings.sector],
        ['terminology', data.settings.terminology],
        ['ui_preferences', data.settings.ui_preferences],
      ];
      for (const [k, val] of settingEntries) {
        if (val !== undefined) {
          const jsonValue = toInputJsonValue(val, k);
          await prisma.appSetting.upsert({
            where: {
              setting_key_tenant_id: {
                setting_key: k,
                tenant_id: id,
              },
            },
            update: { setting_value: jsonValue },
            create: {
              setting_key: k,
              tenant_id: id,
              setting_value: jsonValue,
            },
          });
        }
      }
    }

    const { api_key_hash, ...updatedTenant } = updated;
    return {
      success: true,
      tenant: {
        ...updatedTenant,
        has_api_key: Boolean(api_key_hash),
      },
    };
  }

  /**
   * İşletmeyi ve tüm bağlı verilerini kalıcı olarak silme
   */
  static async deleteTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw { status: 404, message: 'İşletme bulunamadı' };
    }

    // Varsa konuşma hafızası kayıtlarını sil
    try {
      await prisma.conversationState.deleteMany({
        where: { tenant_id: id },
      });
    } catch (e: unknown) {
      const isMissingTable =
        (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') ||
        (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2021');
      if (isMissingTable) {
        console.warn('Conversation states cleanup note (table missing):', e);
      } else {
        throw e;
      }
    }

    // Cascade ile ilişkili clients, appointments, hasta_notlari, app_settings otomatik silinir
    await prisma.tenant.delete({
      where: { id },
    });

    return {
      success: true,
      message: `"${tenant.salon_adi}" işletmesi ve tüm verileri kalıcı olarak silindi.`,
    };
  }

  /**
   * İşletmeye yeni API Key üretme
   */
  static async regenerateApiKey(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw { status: 404, message: 'İşletme bulunamadı' };

    const newKey = 'sk_live_' + crypto.randomBytes(20).toString('hex');
    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        api_key: newKey,
        api_key_hash: hashApiKey(newKey),
      },
      select: { id: true, api_key: true },
    });

    return { success: true, api_key: updated.api_key };
  }

  /**
   * Tek tıkla salona giriş (Impersonation / Login As Salon)
   */
  static async impersonateTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw { status: 404, message: 'İşletme bulunamadı' };
    }

    const token = jwt.sign(
      {
        id: tenant.id,
        tenant_id: tenant.id,
        email: tenant.email,
        salon_adi: tenant.salon_adi,
        impersonated_by: 'super_admin',
      },
      ENV.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return {
      success: true,
      token,
      tenant_id: tenant.id,
      salon_adi: tenant.salon_adi,
      email: tenant.email,
    };
  }
}
