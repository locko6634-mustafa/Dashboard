# Randevu Paneli

Modern, hızlı ve işlevsel bir genel randevu yönetim paneli. Bu proje; randevu yönetimi, müşteri takibi, seans kontrolleri ve finansal özet raporlarını tek bir ekrandan yönetebilmeniz için tasarlanmıştır.

## 🚀 Özellikler

- **Dinamik Randevu Takvimi:** Günlük randevuları listeleyen, durumlarına göre renklendirilen ve sürükle-bırak veya yeniden boyutlandırma desteği sunan gelişmiş takvim görünümü.
- **Gelişmiş Müşteri Yönetimi:** Kayıtlı müşteriler arasında hızlı arama yapabilme, yeni müşteri ekleme ve mevcut müşteri bilgilerini (finansal durum, seans bilgisi, kişisel bilgiler) düzenleme.
- **Finansal & Operasyonel Özet (Overview):** Toplam müşteri sayısı, toplam randevu adedi, ciro ve başarı oranını gösteren özet kartları ile hizmet dağılımını gösteren görsel grafikler.
- **Yüksek Hızlı REST API:** Node.js, Express ve PostgreSQL tabanlı güvenli, kiracı (tenant) izolasyonlu API iletişimi.
- **Not Yönetimi:** Her müşteri randevusu için özel operasyonel ve geçmişe dönük notlar ekleme, silme ve düzenleme.
- **Duyarlı Tasarım (Responsive):** Mobil, tablet ve masaüstü ekranlar için optimize edilmiş modern, premium arayüz.

## 🛠️ Teknoloji Yığını

- **Arayüz (Frontend):** HTML5, Modüler Vanilla JavaScript (ES Modules: `js/shared/`, `js/dashboard/`, `js/home/`, `js/login/`)
- **Tasarım (CSS):** Nötr renk paleti, Geist tipografi ve akıcı mikro animasyonlar içeren saf CSS.
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL
- **Veri Entegrasyonu:** Asenkron REST API fetch istekleri (`js/shared/api-client.js`)

## 📦 Kurulum ve Yapılandırma

1. **API Ayarları:**
   Proje kök dizininde bulunan [config.js](file:///home/mustafaayverdi/Masaüstü/Randevu-Paneli/js/shared/config.js) dosyasını açarak `API_BASE` değerini kendi backend API adresinizle güncelleyin:
   ```javascript
   export const CONFIG = {
       API_BASE: 'https://randevu.n8n-mustafa.me/webhook/', // veya /api/v1/
       // ... diğer ayarlar
   };
   ```

2. **Çalıştırma:**
   Herhangi bir build veya derleme adımına gerek yoktur. Projeyi bir HTTP sunucusu yardımıyla (örneğin VS Code Live Server eklentisiyle) doğrudan çalıştırabilirsiniz:
   - Tarayıcınızda `index.html` dosyasını açarak paneli kullanmaya başlayabilirsiniz.
   - Giriş ekranı için `login.html` dosyasını kullanabilirsiniz.

## 📁 Proje Yapısı

```text
├── index.html          # Ana Dashboard Arayüzü
├── login.html          # Kullanıcı Giriş Ekranı
├── style.css           # Tasarım ve Arayüz Stilleri (Vanilla CSS)
├── app.js              # Uygulama Mantığı ve API İstekleri (Vanilla JS)
├── config.js           # Sistem ve UI Yapılandırma Ayarları
├── rules.md            # Geliştirici Çalışma ve Tasarım Kuralları
├── .gitignore          # Git Tarafından Yoksayılacak Dosyalar
└── .gitattributes      # Satır Sonu Normalizasyon Ayarları
```

## 📄 Lisans

Bu proje kişisel kullanım ve özelleştirme amacıyla geliştirilmiştir. Tüm hakları saklıdır.
