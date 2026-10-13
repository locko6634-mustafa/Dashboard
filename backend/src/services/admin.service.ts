import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';

export class AdminService {
  /**
   * Süper Admin ve Multi-tenant tablolarının/kolonlarının varlığını garantiye alır.
   */
  static async ensureSchema() {
    const queries = [
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      `CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        salon_adi VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        whatsapp_phone VARCHAR(50),
        n8n_webhook_url VARCHAR(500),
        chatwoot_inbox_id VARCHAR(100),
        api_key VARCHAR(100) UNIQUE,
        durum VARCHAR(20) DEFAULT 'Aktif',
        plan_tipi VARCHAR(50) DEFAULT 'Standart',
        plan_bitis_tarihi TIMESTAMPTZ(6),
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS public.clients (
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
      `CREATE TABLE IF NOT EXISTS public.appointments (
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
      `CREATE TABLE IF NOT EXISTS public.hasta_notlari (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hasta_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
        not_metni TEXT NOT NULL,
        tarih TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS public.app_settings (
        setting_key VARCHAR(100) NOT NULL,
        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key, tenant_id)
      )`,
      `CREATE TABLE IF NOT EXISTS public.conversation_states (
        conversation_id VARCHAR(255) PRIMARY KEY,
        phone_number VARCHAR(50) NOT NULL,
        current_intent VARCHAR(100),
        current_stage VARCHAR(100),
        context_data JSONB DEFAULT '{}',
        retry_count INT DEFAULT 0,
        tenant_id UUID,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS public.super_admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        ad_soyad VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50)`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS n8n_webhook_url VARCHAR(500)`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS chatwoot_inbox_id VARCHAR(100)`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS api_key VARCHAR(100)`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS durum VARCHAR(20) DEFAULT 'Aktif'`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_tipi VARCHAR(50) DEFAULT 'Standart'`,
      `ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_bitis_tarihi TIMESTAMPTZ(6)`,
      `ALTER TABLE public.conversation_states ADD COLUMN IF NOT EXISTS tenant_id UUID`,
      `CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id)`,
      `CREATE INDEX IF NOT EXISTS idx_clients_tenant_telefon ON public.clients(tenant_id, telefon)`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_tenant_tarih ON public.appointments(tenant_id, tarih)`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_tenant_deleted ON public.appointments(tenant_id, deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_hasta_notlari_tenant_hasta ON public.hasta_notlari(tenant_id, hasta_id)`,
      `CREATE INDEX IF NOT EXISTS idx_conv_phone ON public.conversation_states(phone_number)`,
      `CREATE INDEX IF NOT EXISTS idx_conv_tenant ON public.conversation_states(tenant_id)`
    ];

    for (const sql of queries) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (e) {
        console.warn('SQL execution note:', e);
      }
    }

    // Ensure default super admin exists if no super admin found
    try {
      const superAdminCount = await prisma.superAdmin.count();
      if (superAdminCount === 0) {
        await prisma.superAdmin.create({
          data: {
            email: 'locko6634@gmail.com',
            ad_soyad: 'Mustafa Ayverdi',
            password_hash: '$argon2id$v=19$m=65536,t=3,p=4$lCqpuWWjWNB9SGIwbs6UWg$2Yw9Tf92+oVq2b1yD0d68rNkW26i6vF98/pG5wVHQkQ',
          },
        });
        console.log('[AdminService] Varsayilan super admin hesabi olusturuldu (locko6634@gmail.com)');
      }
    } catch (adminErr) {
      console.warn('[AdminService] Super admin check note:', adminErr);
    }

    // Auto-generate api_key for tenants missing one
    try {
      const tenantsWithoutKey = await prisma.tenant.findMany({
        where: {
          OR: [{ api_key: null }, { api_key: '' }],
        },
      });
      for (const t of tenantsWithoutKey) {
        const generatedKey = 'sk_live_' + crypto.randomBytes(20).toString('hex');
        await prisma.tenant.update({
          where: { id: t.id },
          data: { api_key: generatedKey },
        });
      }
    } catch (keyErr) {
      console.warn('Failed to auto-generate tenant API keys:', keyErr);
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
    const where: any = {};

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
        api_key: true,
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
      tenants: tenants.map((t) => ({
        ...t,
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
    settings?: {
      calendar?: any;
      services?: any;
      sector?: string;
      terminology?: any;
      ui_preferences?: any;
    };
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

    const tenant = await prisma.tenant.create({
      data: {
        salon_adi: data.salon_adi.trim(),
        email: data.email.trim().toLowerCase(),
        password_hash,
        whatsapp_phone: data.whatsapp_phone ? data.whatsapp_phone.trim() : null,
        n8n_webhook_url: data.n8n_webhook_url ? data.n8n_webhook_url.trim() : null,
        chatwoot_inbox_id: data.chatwoot_inbox_id ? data.chatwoot_inbox_id.trim() : null,
        api_key: apiKey,
        durum: data.durum || 'Aktif',
      },
    });

    // İşletmenin ayarlarını tohumlama / kaydetme (calendar, services, sector, terminology, ui_preferences)
    try {
      const settingsPayload: Array<{ setting_key: string; setting_value: any }> = [];

      if (data.settings) {
        if (data.settings.calendar) {
          settingsPayload.push({ setting_key: 'calendar', setting_value: data.settings.calendar });
        }
        if (data.settings.services) {
          settingsPayload.push({ setting_key: 'services', setting_value: data.settings.services });
        }
        if (data.settings.sector) {
          settingsPayload.push({ setting_key: 'sector', setting_value: data.settings.sector });
        }
        if (data.settings.terminology) {
          settingsPayload.push({ setting_key: 'terminology', setting_value: data.settings.terminology });
        }
        if (data.settings.ui_preferences) {
          settingsPayload.push({ setting_key: 'ui_preferences', setting_value: data.settings.ui_preferences });
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

      for (const item of settingsPayload) {
        await prisma.appSetting.upsert({
          where: {
            setting_key_tenant_id: {
              setting_key: item.setting_key,
              tenant_id: tenant.id,
            },
          },
          update: { setting_value: item.setting_value },
          create: {
            setting_key: item.setting_key,
            tenant_id: tenant.id,
            setting_value: item.setting_value,
          },
        });
      }
    } catch (e) {
      console.warn('Tenant settings initialization error:', e);
    }

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
      settings?: {
        calendar?: any;
        services?: any;
        sector?: string;
        terminology?: any;
        ui_preferences?: any;
      };
    }
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw { status: 404, message: 'İşletme bulunamadı' };
    }

    const updatePayload: any = {};
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
        api_key: true,
        durum: true,
      },
    });

    // Eğer settings geldiyse app_settings güncelle
    if (data.settings) {
      const settingKeys = ['calendar', 'services', 'sector', 'terminology', 'ui_preferences'];
      for (const k of settingKeys) {
        const val = (data.settings as any)[k];
        if (val !== undefined) {
          await prisma.appSetting.upsert({
            where: {
              setting_key_tenant_id: {
                setting_key: k,
                tenant_id: id,
              },
            },
            update: { setting_value: val },
            create: {
              setting_key: k,
              tenant_id: id,
              setting_value: val,
            },
          });
        }
      }
    }

    return { success: true, tenant: updated };
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
    } catch (e) {
      console.warn('Conversation states cleanup note:', e);
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
      data: { api_key: newKey },
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
