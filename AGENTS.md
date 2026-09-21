# Randevu Paneli Geliştirme ve Backend Kuralları

Bu dosya, Randevu Paneli projesinde çalışmaya başlamadan önce okunması gereken, projenin mimarisini, veritabanı şemasını ve n8n otomasyon iş akışlarını açıklayan ana kılavuzdur.

---

## 1. Yetenek ve Tasarım Referansları
Bu projede frontend veya tasarım çalışması yapmadan önce aşağıdaki global kural dosyaları KESİNLİKLE okunmalıdır:
* Tasarım İlkeleri: [design-taste-frontend RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/design-taste-frontend/RULES.md)
* Yeniden Tasarım Kuralları: [redesign-existing-projects RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/redesign-existing-projects/RULES.md)
* Görsel Doğrulama ve Playwright Kuralı: [playwright-visual-verification RULES.md](file:///C:/Users/Mustafa/.gemini/antigravity/skills/playwright-visual-verification/RULES.md)

---

## 2. Proje Genel Yapısı
Randevu Paneli (Appointment Dashboard); randevu takvimi, müşteri yönetimi, seans takipleri ve finansal özet raporlarını sunan tek sayfalık modern bir web uygulamasıdır.
* **Frontend:** HTML5, modüler Vanilla JavaScript (ES Modules: `js/shared/`, `js/home/`, `js/login/`, `js/dashboard/`) ve Geist tipografisine dayalı modüler saf CSS (`css/shared/`, `css/home/`, `css/login/`, `css/dashboard/`).
* **Backend:** n8n Webhook API uç noktaları üzerinden yönetilir ve Supabase Postgres veritabanını kullanır.
* **API İletişimi:** Tüm HTTP fetch istekleri `js/shared/api-client.js` ve `js/shared/config.js` içindeki `CONFIG.API_BASE` temel adresi ve tanımlı uç noktalar (endpoints) kullanılarak asenkron olarak gerçekleştirilir.

---

## 3. Supabase Veritabanı Mimarisi
Veritabanı ilişkisel yapıda olup her işlem `tenant_id` (salon/kullanıcı bazlı) izolasyonu ile yürütülür.

### A. Temel Tablolar
1. **`tenants`:** Sistemdeki salon/kullanıcı hesapları.
   * `id` (UUID, PK, Default: `gen_random_uuid()`)
   * `salon_adi` (varchar), `email` (varchar, unique), `password_hash` (varchar), `created_at` (timestamptz)
2. **`clients`:** Müşteri/hasta bilgileri.
   * `id` (UUID, PK, Default: `uuid_generate_v4()`)
   * `ad_soyad` (text), `telefon` (text)
   * `kronik_rahatsizlik` (text, nullable), `paket_adi` (text, nullable)
   * `toplam_seans` (integer, default 0), `gelinen_seans` (integer, default 0)
   * `toplam_tutar` (numeric, default 0), `alinan_odeme` (numeric, default 0)
   * `tenant_id` (UUID, FK -> `tenants.id`), `created_at` (timestamptz)
3. **`appointments`:** Randevu kayıtları.
   * `id` (UUID, PK, Default: `uuid_generate_v4()`)
   * `hasta_id` (UUID, FK -> `clients.id`), `tenant_id` (UUID, FK -> `tenants.id`)
   * `tarih` (date), `baslangic_saati` (time), `sure` (integer, default 30), `bitis_saati` (time)
   * `durum` (text, default 'Bekliyor'), `hizmet` (text)
   * `created_at` (timestamptz), `updated_at` (timestamptz), `deleted_at` (timestamptz, soft-delete için)
4. **`hasta_notlari`:** Müşterilere ait geçmiş ve hızlı notlar.
   * `id` (UUID, PK), `hasta_id` (UUID, FK -> `clients.id`), `tenant_id` (UUID, FK -> `tenants.id`)
   * `not_metni` (text), `tarih` (timestamptz)
5. **`app_settings`:** Dashboard ayarları.
   * `setting_key` (text, PK), `tenant_id` (UUID, PK, FK -> `tenants.id`), `setting_value` (jsonb)

### B. SQL View Yapıları (Görünümler)
1. **`appointment_details`:** Silinmemiş aktif randevuları (`deleted_at IS NULL`) hastaların kişisel, seans ve ödeme bilgileriyle JOIN ederek sunar.
2. **`dashboard_stats_overview`:** Toplam müşteri, ciro, alınan ödeme, kalan borç, toplam randevu, randevu başarı oranı (Tamamlanan / (Tamamlanan + İptal)), son 5 müşteri ve son 7/14 gün bazındaki yüzdelik değişimleri (delta) tek bir JSON objesi halinde döner.

---

## 4. n8n İş Akışları (Workflows) ve Webhook API Uç Noktaları
Sistem n8n üzerinde çalışan 3 ana iş akışı üzerinden Supabase ile haberleşir:

### 1. DASHBOARD İş Akışı (ID: `RWGmnIB3m0wLPnjT`)
* **GET `/webhook/genel-istatistik`:** `dashboard_stats_overview` görünümünden genel özet kartları ve istatistik verilerini getirir.
* **POST `/webhook/randevulari-getir`:** İstekte gelen tarih ve görünüm moduna (`week` veya `month`) göre asenkron tarih aralığını hesaplar. `appointment_details` görünümünden randevuları çeker ve mükerrer verileri temizleyerek Whitelist kolonlar ile döndürür.
* **GET `/webhook/ayarlar-getir`:** `app_settings` tablosundan tenant'a ait ayarları döner.
* **POST `/webhook/ayarlar-guncelle`:** Gelen ayar dizisini tekil objelere dönüştürerek `app_settings` tablosunda günceller.

### 2. DASHBOARD_RANDEVU_KAYDET İş Akışı (ID: `0uBEu0iMyqBdHdw7`)
* **GET `/webhook/arama`:** `clients` tablosunda `ad_soyad` kolonuna göre canlı müşteri araması yapar.
* **POST `/webhook/ekle-dashboard`:** Yeni randevu ekler. `is_new` true ise `clients` tablosunda yeni müşteri kaydı oluşturup ID'sini randevuya bağlar. `is_new` false ise doğrudan `appointments` tablosuna randevuyu kaydeder.
* **POST `/webhook/randevu-sil`:** Belirtilen randevunun `deleted_at` alanını `$now` ile güncelleyerek soft-delete yapar.
* **POST `/webhook/guncelleme`:** Bir randevunun durumunu, tarihini, başlagıç/bitiş saatini ve süresini günceller.
* **POST `/webhook/guncelleme-toplu`:** Çoklu randevu ID listesini alıp durumlarını topluca 'Tamamlandı' olarak günceller.
* **POST `/webhook/kullanici-girisi`:** `tenants` tablosunda e-posta ve şifre doğrulaması yaparak `tenant_id` ve oturum tokenı döner.

### 3. DASHBOARD_EKSTRA_İŞLEMLER İş Akışı (ID: `w2muGYCXKWCUyPta`)
* **POST `/webhook/not-ekle`:** Müşteriye hızlı randevu notu ekler.
* **GET `/webhook/notlari-getir`:** Müşteriye ait not listesini çeker.
* **POST `/webhook/not-sil`:** İlgili not ID'sine ait kaydı siler.
* **POST `/webhook/hasta-guncelle`:** Müşteri kartındaki kişisel bilgileri, seans durumlarını ve finansal detayları günceller.
* **Zamanlanmış Görev (Cron - `Gecmis_Randevuları_Guncelle`):** Her 15 dakikada bir otomatik çalışarak, tarihi/saati geçmiş ve durumu 'Bekliyor' olan randevuları tarar; bitiş saati şimdiki zamandan küçük olanları otomatik olarak 'Tamamlandı' durumuna çeker.

---

## 5. Güvenlik ve Kimlik Doğrulama Protokolü
* Tüm webhook istekleri, istemciden (app.js) gönderilen HTTP başlıklarını (headers) kontrol eden güvenlik filtrelerinden (`API_Guvenlik_Filtresi_*`) geçer.
* İsteklerde **`x-tenant-id`** ve **`authorization`** (veya `x-api-key`) başlıklarının gönderilmesi zorunludur.
* Bu filtreler sayesinde hiçbir tenant, başka bir salonun verilerine erişemez veya değişiklik yapamaz.
