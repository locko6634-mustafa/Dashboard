# Randevu Paneli — Proje Bağlamı

Randevu takvimi, müşteri/seans takibi ve finansal özet sunan tek sayfalık web uygulaması ve bağımsız backend servisi.

## Altyapı ve İletişim
- **Frontend:** HTML5, Vanilla ES Modules (`js/shared/`, `js/home/`, `js/login/`, `js/dashboard/`), Geist tipografili modüler CSS (`css/shared/`, `css/home/`, `css/login/`, `css/dashboard/`).
- **API İstemcisi:** Tüm istekler `js/shared/api-client.js` ve `js/shared/config.js` içindeki `CONFIG.API_BASE` üzerinden yapılır.
- **Backend & DB:** `backend/` (Node.js/TypeScript + Express + Prisma), `randevu-api` ve PostgreSQL 17 `randevu-db` konteynerleri, izole `randevu_internal` ağı ve Traefik reverse proxy.
- **Yedekleme:** Her gece 03:00'te `/home/locko-admin/scripts/backup-randevu-db.sh` ile `pg_dump` alınır; `/home/locko-admin/backups/randevu-paneli/` altında 7 gün saklanır.
- **CI/CD:** GitHub'a push edildiğinde otomatik canlıya alınır; manuel deploy yapılmaz.

## Veritabanı Modelleri (Prisma / PostgreSQL — `tenant_id` izolasyonlu)
- **`tenants`:** `id` (UUID, PK), `salon_adi`, `email` (unique), `password_hash` (Argon2), `created_at`
- **`clients`:** `id` (UUID, PK), `ad_soyad`, `telefon`, `kronik_rahatsizlik` (nullable), `paket_adi` (nullable), `toplam_seans` (0), `gelinen_seans` (0), `toplam_tutar` (0), `alinan_odeme` (0), `tenant_id` (FK), `created_at`
- **`appointments`:** `id` (UUID, PK), `hasta_id` (FK -> `clients.id`), `tenant_id` (FK), `tarih` (date), `baslangic_saati` (time), `sure` (30), `bitis_saati` (time), `durum` ('Bekliyor'), `hizmet`, `created_at`, `updated_at`, `deleted_at` (soft-delete)
- **`hasta_notlari`:** `id` (UUID, PK), `hasta_id` (FK -> `clients.id`), `tenant_id` (FK), `not_metni`, `tarih`
- **`app_settings`:** `setting_key`, `tenant_id` (FK), `setting_value` (jsonb)

## Backend API, Auth ve Cron
- **Kimlik Doğrulama:** Korumalı isteklerde `authorization` (`Bearer <JWT>`) ve `x-tenant-id` header'ları zorunludur. Doğrulama `backend/src/middlewares/auth.middleware.ts` (`authMiddleware`) ile yapılır; şifreler Argon2 ile hash'lenir.
- **REST Uç Noktaları (`/api/v1/` ve `/api/`):**
  - Auth: `POST /api/v1/auth/login`
  - İstatistik: `GET /api/v1/stats/overview`
  - Randevular: `GET /api/v1/appointments`, `POST /api/v1/appointments`, `PATCH`/`PUT /api/v1/appointments/:id`, `DELETE /api/v1/appointments/:id` (soft-delete), `POST /api/v1/appointments/batch`
  - Müşteriler: `GET /api/v1/clients/search`, `POST /api/v1/clients`, `GET /api/v1/clients/:id`, `PUT`/`PATCH /api/v1/clients/:id`
  - Notlar: `GET /api/v1/notes`, `POST /api/v1/notes`, `DELETE /api/v1/notes/:id`
  - Ayarlar: `GET /api/v1/settings`, `POST /api/v1/settings`
- **`/webhook/` Alias Katmanı:** `kullanici-girisi`, `genel-istatistik`, `randevulari-getir`, `arama`, `musteriler`, `ekle-dashboard`, `guncelleme`, `randevu-sil`, `notlari-getir`, `not-ekle`, `not-sil`, `hasta-guncelle`, `ayarlar-getir`, `ayarlar-guncelle`, `musteri-ekle`.
- **Cron:** `backend/src/services/cron.service.ts` tarihi/saati geçmiş `'Bekliyor'` randevularını otomatik `'Tamamlandı'` yapar.

## Yerel Sunucu
- Linux/macOS: `./sunucu_baslat.sh` | Windows: `.\sunucu_baslat.ps1` (8000 portunu kontrol eder/açar: `http://localhost:8000/`)
