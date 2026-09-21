import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  const seedFile = path.join(__dirname, 'seedData.json');
  if (!fs.existsSync(seedFile)) {
    console.error('seedData.json not found!');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

  console.log('Seeding tenants...');
  for (const t of data.tenants) {
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

  console.log('Seeding clients...');
  for (const c of data.clients) {
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

  console.log('Seeding appointments...');
  for (const a of data.appointments) {
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

  console.log('Seeding settings...');
  for (const s of data.settings) {
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

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
