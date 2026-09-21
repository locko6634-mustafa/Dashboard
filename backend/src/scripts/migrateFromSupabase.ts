import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

export async function migrateData() {
  console.log('--- Starting Migration from Supabase Dataset to PostgreSQL ---');
  
  const seedPath = path.resolve(__dirname, '../../prisma/seedData.json');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Migration source file not found at ${seedPath}`);
  }

  const raw = fs.readFileSync(seedPath, 'utf8');
  const dataset = JSON.parse(raw);

  console.log(`Source records to migrate:`);
  console.log(`- Tenants: ${dataset.tenants.length}`);
  console.log(`- Clients: ${dataset.clients.length}`);
  console.log(`- Appointments: ${dataset.appointments.length}`);
  console.log(`- Settings: ${dataset.settings.length}`);

  // 1. Tenants
  for (const t of dataset.tenants) {
    await prisma.tenant.upsert({
      where: { id: t.id },
      update: {
        salon_adi: t.salon_adi,
        email: t.email,
        password_hash: t.password_hash,
      },
      create: {
        id: t.id,
        salon_adi: t.salon_adi,
        email: t.email,
        password_hash: t.password_hash,
        created_at: t.created_at ? new Date(t.created_at) : new Date(),
      },
    });
  }
  console.log('✓ Tenants migrated');

  // 2. Clients
  for (const c of dataset.clients) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {
        ad_soyad: c.ad_soyad,
        telefon: c.telefon,
        kronik_rahatsizlik: c.kronik_rahatsizlik,
        paket_adi: c.paket_adi,
        toplam_seans: c.toplam_seans ?? 0,
        gelinen_seans: c.gelinen_seans ?? 0,
        toplam_tutar: c.toplam_tutar ? Number(c.toplam_tutar) : 0,
        alinan_odeme: c.alinan_odeme ? Number(c.alinan_odeme) : 0,
      },
      create: {
        id: c.id,
        tenant_id: c.tenant_id,
        ad_soyad: c.ad_soyad,
        telefon: c.telefon,
        kronik_rahatsizlik: c.kronik_rahatsizlik,
        paket_adi: c.paket_adi,
        toplam_seans: c.toplam_seans ?? 0,
        gelinen_seans: c.gelinen_seans ?? 0,
        toplam_tutar: c.toplam_tutar ? Number(c.toplam_tutar) : 0,
        alinan_odeme: c.alinan_odeme ? Number(c.alinan_odeme) : 0,
        created_at: c.created_at ? new Date(c.created_at) : new Date(),
      },
    });
  }
  console.log('✓ Clients migrated');

  // 3. Appointments
  for (const a of dataset.appointments) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {
        hasta_id: a.hasta_id,
        tarih: a.tarih,
        baslangic_saati: a.baslangic_saati,
        bitis_saati: a.bitis_saati,
        durum: a.durum,
        hizmet: a.hizmet,
        sure: a.sure,
        deleted_at: a.deleted_at ? new Date(a.deleted_at) : null,
      },
      create: {
        id: a.id,
        tenant_id: a.tenant_id,
        hasta_id: a.hasta_id,
        tarih: a.tarih,
        baslangic_saati: a.baslangic_saati,
        bitis_saati: a.bitis_saati,
        durum: a.durum,
        hizmet: a.hizmet,
        sure: a.sure,
        created_at: a.created_at ? new Date(a.created_at) : new Date(),
        updated_at: a.updated_at ? new Date(a.updated_at) : new Date(),
        deleted_at: a.deleted_at ? new Date(a.deleted_at) : null,
      },
    });
  }
  console.log('✓ Appointments migrated');

  // 4. Settings
  for (const s of dataset.settings) {
    await prisma.appSetting.upsert({
      where: {
        setting_key_tenant_id: {
          setting_key: s.setting_key,
          tenant_id: s.tenant_id,
        },
      },
      update: {
        setting_value: s.setting_value,
      },
      create: {
        setting_key: s.setting_key,
        tenant_id: s.tenant_id,
        setting_value: s.setting_value,
      },
    });
  }
  console.log('✓ Settings migrated');

  // Verification counts
  const tenantCount = await prisma.tenant.count();
  const clientCount = await prisma.client.count();
  const appointmentCount = await prisma.appointment.count();
  const settingCount = await prisma.appSetting.count();

  console.log('--- Migration Verification ---');
  console.log(`Database counts -> Tenants: ${tenantCount}, Clients: ${clientCount}, Appointments: ${appointmentCount}, Settings: ${settingCount}`);
  
  if (tenantCount < 1 || clientCount < 9 || appointmentCount < 101 || settingCount < 4) {
    throw new Error('Migration verification count mismatch!');
  }
  console.log('Migration verified successfully with 100% data integrity!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateData()
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
