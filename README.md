# Lumina Beauty Dashboard

Modern, hızlı ve işlevsel bir güzellik merkezi / salon yönetim paneli. Bu proje; randevu yönetimi, hasta takibi, seans kontrolleri ve finansal özet raporlarını tek bir ekrandan yönetebilmeniz için tasarlanmıştır.

## 🚀 Özellikler

- **Dinamik Randevu Takvimi:** Günlük randevuları listeleyen, durumlarına göre renklendirilen ve sürükle-bırak veya yeniden boyutlandırma desteği sunan gelişmiş takvim görünümü.
- **Gelişmiş Hasta Yönetimi:** Kayıtlı hastalar arasında hızlı arama yapabilme, yeni hasta ekleme ve mevcut hasta bilgilerini (finansal durum, seans bilgisi, kişisel bilgiler) düzenleme.
- **Finansal & Operasyonel Özet (Overview):** Toplam hasta sayısı, toplam randevu adedi, ciro ve başarı oranını gösteren özet kartları ile hizmet dağılımını gösteren görsel grafikler.
- **n8n Webhook Entegrasyonu:** Tamamen n8n otomasyonu ile entegre çalışacak şekilde tasarlanmış webhook tabanlı API iletişimi.
- **Not Yönetimi:** Her hasta randevusu için özel operasyonel ve geçmişe dönük notlar ekleme, silme ve düzenleme.
- **Duyarlı Tasarım (Responsive):** Mobil, tablet ve masaüstü ekranlar için optimize edilmiş modern, premium arayüz.

## 🛠️ Teknoloji Yığını

- **Arayüz (Frontend):** HTML5, Vanilla Javascript (Modern ES6+)
- **Tasarım (CSS):** Özel HSL renk paletleri, modern tipografi (Inter font ailesi) ve akıcı mikro animasyonlar içeren saf CSS.
- **Veri Entegrasyonu:** n8n Webhook API (asenkron fetch istekleri)

## 📦 Kurulum ve Yapılandırma

1. **API Ayarları:**
   Proje kök dizininde bulunan [config.js](file:///c:/Users/Mustafa/Desktop/dashboard/config.js) dosyasını açarak `API_BASE` değerini kendi n8n webhook veya API sunucu adresinizle güncelleyin:
   ```javascript
   const CONFIG = {
       API_BASE: 'https://kendi-n8n-sunucunuz.me/webhook/',
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
