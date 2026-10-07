import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { prisma } from '../config/prisma.js';

export class AdminService {
  /**
   * Sistemde en az bir süper yönetici kayıtlı mı kontrol eder.
   */
  static async checkSetupStatus() {
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
        plan_tipi: true,
        plan_bitis_tarihi: true,
        created_at: true,
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
   * Yeni işletme (Tenant) kaydı oluşturma
   */
  static async createTenant(data: {
    salon_adi: string;
    email: string;
    password: string;
    whatsapp_phone?: string;
    n8n_webhook_url?: string;
    chatwoot_inbox_id?: string;
    plan_tipi?: string;
    plan_bitis_tarihi?: string;
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
        durum: 'Aktif',
        plan_tipi: data.plan_tipi || 'Standart',
        plan_bitis_tarihi: data.plan_bitis_tarihi ? new Date(data.plan_bitis_tarihi) : null,
      },
    });

    // Varsayılan salon ayarları tohumlama (app_settings)
    try {
      await prisma.appSetting.createMany({
        data: [
          {
            setting_key: 'salon_settings',
            tenant_id: tenant.id,
            setting_value: {
              salon_adi: tenant.salon_adi,
              calisma_baslangic: '09:00',
              calisma_bitis: '19:00',
              randevu_araligi: 30,
              para_birimi: '₺',
              hizmetler: ['Cilt Bakımı', 'Lazer Epilasyon', 'Bölgesel İncelme', 'Kalıcı Makyaj'],
            },
          },
        ],
        skipDuplicates: true,
      });
    } catch (e) {
      console.warn('Default settings seeding skipped:', e);
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
        plan_tipi: tenant.plan_tipi,
        plan_bitis_tarihi: tenant.plan_bitis_tarihi,
      },
    };
  }

  /**
   * İşletme bilgilerini güncelleme
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
      plan_tipi?: string;
      plan_bitis_tarihi?: string;
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
    if (data.plan_tipi !== undefined) updatePayload.plan_tipi = data.plan_tipi;
    if (data.plan_bitis_tarihi !== undefined) {
      updatePayload.plan_bitis_tarihi = data.plan_bitis_tarihi ? new Date(data.plan_bitis_tarihi) : null;
    }

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
        plan_tipi: true,
        plan_bitis_tarihi: true,
      },
    });

    return { success: true, tenant: updated };
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
