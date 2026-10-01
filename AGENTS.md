# Randevu Paneli Geliştirme ve Backend Kuralları

Bu dosya, Randevu Paneli projesinde çalışmaya başlamadan önce okunması gereken, projenin güncel mimarisini, veritabanı şemasını ve bağımsız backend API yapısını açıklayan ana kılavuzdur.

---

## 1. Proje Genel Yapısı
Randevu Paneli (Appointment Dashboard); randevu takvimi, müşteri yönetimi, seans takipleri, raporlama ve finansal özet analizlerini sunan tek sayfalık modern bir web uygulamasıdır.
* **Frontend:** HTML5, modüler Vanilla JavaScript (ES Modules: `js/shared/`, `js/home/`, `js/login/`, `js/dashboard/`) ve Geist tipografisine dayalı modüler saf CSS (`css/shared/`, `css/home/`, `css/login/`, `css/dashboard/`).
* **Backend:** Bağımsız Node.js (TypeScript) + Express REST API servisi (`backend/` dizini), Prisma ORM ve PostgreSQL veritabanı. Docker konteyneri (`randevu-api`) ve Traefik ters ters vekil (reverse proxy) üzerinden çalışır.
* **API İletişimi:** Tüm HTTP fetch istekleri `js/shared/api-client.js` ve `js/shared/config.js` içindeki `CONFIG.API_BASE` adresi üzerinden asenkron olarak gerçekleştirilir.

---

## 2. PostgreSQL & Prisma Veritabanı Mimarisi
Veritabanı ilişkisel yapıda olup her işlem `tenant_id` (salon/kullanıcı bazlı) izolasyonu ile yürütülür.

### A. Temel Modeller (Prisma / PostgreSQL)
1. **`tenants`:** Sistemdeki salon/kullanıcı hesapları.
   * `id` (UUID, PK, Default: `gen_random_uuid()`)
   * `salon_adi` (varchar), `email` (varchar, unique), `password_hash` (varchar, Argon2), `created_at` (timestamptz)
2. **`clients`:** Müşteri/hasta bilgileri.
   * `id` (UUID, PK, Default: `gen_random_uuid()`)
   * `ad_soyad` (text), `telefon` (text)
   * `kronik_rahatsizlik` (text, nullable), `paket_adi` (text, nullable)
   * `toplam_seans` (integer, default 0), `gelinen_seans` (integer, default 0)
   * `toplam_tutar` (numeric, default 0), `alinan_odeme` (numeric, default 0)
   * `tenant_id` (UUID, FK -> `tenants.id`), `created_at` (timestamptz)
3. **`appointments`:** Randevu kayıtları.
   * `id` (UUID, PK, Default: `gen_random_uuid()`)
   * `hasta_id` (UUID, FK -> `clients.id`), `tenant_id` (UUID, FK -> `tenants.id`)
   * `tarih` (date), `baslangic_saati` (time), `sure` (integer, default 30), `bitis_saati` (time)
   * `durum` (text, default 'Bekliyor'), `hizmet` (text)
   * `created_at` (timestamptz), `updated_at` (timestamptz), `deleted_at` (timestamptz, soft-delete için)
4. **`hasta_notlari`:** Müşterilere ait geçmiş ve hızlı operasyonel notlar.
   * `id` (UUID, PK), `hasta_id` (UUID, FK -> `clients.id`), `tenant_id` (UUID, FK -> `tenants.id`)
   * `not_metni` (text), `tarih` (timestamptz)
5. **`app_settings`:** Dashboard ayarları (genel marka, çalışma saatleri, hizmetler, durum renkleri).
   * `setting_key` (text), `tenant_id` (UUID, FK -> `tenants.id`), `setting_value` (jsonb)

---

## 3. Bağımsız Backend API Servisi & Endpoint Mimarisi
Backend servisi Express ve TypeScript tabanlı olup iki ana routing katmanı sunar:

### 1. Modern RESTful API Uç Noktaları (`/api/v1/` ve `/api/`)
* **Kimlik Doğrulama:**
  * `POST /api/v1/auth/login`: E-posta ve Argon2 şifre doğrulaması yaparak JWT ve `tenant_id` döner.
* **Genel İstatistik & KPI:**
  * `GET /api/v1/stats/overview`: Toplam müşteri, ciro, alınan ödeme, kalan borç, başarı oranı ve trend verilerini döner.
* **Randevu İşlemleri:**
  * `GET /api/v1/appointments`: Randevu listeleme (tarih ve filtre parametreleriyle).
  * `POST /api/v1/appointments`: Yeni randevu oluşturma (opsiyonel otomatik müşteri kaydıyla).
  * `PATCH / PUT /api/v1/appointments/:id`: Randevu güncelleme (saat, tarih, durum, süre).
  * `DELETE /api/v1/appointments/:id`: Randevu silme (soft-delete).
  * `POST /api/v1/appointments/batch`: Toplu randevu tamamlama/güncelleme.
* **Müşteri İşlemleri:**
  * `GET /api/v1/clients/search`: İsim veya telefona göre canlı müşteri arama / CRM listeleme.
  * `POST /api/v1/clients`: CRM'den doğrudan yeni müşteri oluşturma.
  * `GET /api/v1/clients/:id`: Müşteri detayını ve randevu/not geçmişini getirme.
  * `PUT / PATCH /api/v1/clients/:id`: Müşteri bilgilerini, seans ve finansal verilerini güncelleme.
* **Müşteri Notları:**
  * `GET /api/v1/notes`: Müşteriye ait notları listeleme.
  * `POST /api/v1/notes`: Yeni not ekleme.
  * `DELETE /api/v1/notes/:id`: Not silme.
* **Ayar Yönetimi:**
  * `GET /api/v1/settings`: Tenant ayarlarını getirme.
  * `POST /api/v1/settings`: Tenant ayarlarını kaydetme/güncelleme.

### 2. Geriye Dönük Uyumluluk Katmanı (`/webhook/`)
Eski frontend çağrılarını karşılamak için backend `/webhook/` altında eşdeğer rota takma adları (alias) barındırır (`kullanici-girisi`, `genel-istatistik`, `randevulari-getir`, `arama`, `musteriler`, `ekle-dashboard`, `guncelleme`, `randevu-sil`, `notlari-getir`, `not-ekle`, `not-sil`, `hasta-guncelle`, `ayarlar-getir`, `ayarlar-guncelle`, `musteri-ekle`).

### 3. Arka Plan Zamanlanmış Görevler (Cron Service)
* `backend/src/services/cron.service.ts`: Periyodik olarak çalışarak tarihi ve saati geçmiş, durumu hâlâ 'Bekliyor' olan randevuları otomatik olarak 'Tamamlandı' durumuna çeker.

---

## 4. Güvenlik ve Kimlik Doğrulama Protokolü
* Tüm korumalı isteklere istemci tarafından **`authorization`** (Bearer JWT token) ve **`x-tenant-id`** başlıkları gönderilir.
* `authMiddleware` (`backend/src/middlewares/auth.middleware.ts`) token'ı doğrular ve isteğin yalnızca ilgili `tenant_id` kapsamındaki verilere erişmesine izin verir.
* Şifreler Argon2 algoritması ile güvenli şekilde hash'lenir.
* CORS ve Helmet başlıkları üretim ortamı standartlarına göre yapılandırılmıştır.

---

## 5. Git, GitHub ve Otomatik Dağıtım (Deploy) Kuralları
* **Her Değişiklikten Sonra Commit & Push:** Yapılan her geliştirme, hata düzeltmesi veya güncelleme sonrasında yapılan işi özetleyen, Türkçe ve anlamlı bir commit mesajı ile değişiklikler commit'lenmeli ve GitHub'a push edilmelidir (`git add .`, `git commit -m "..."`, `git push`).
* **Otomatik Dağıtım (CI/CD):** Deploy süreci GitHub üzerinden otomatik olarak yürütülmektedir. Değişiklikler GitHub'a push edildiğinde sistem otomatik olarak canlıya alınır; bu nedenle kesinlikle **manuel deploy işlemi yapılmamalıdır**.

