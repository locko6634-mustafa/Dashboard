# n8n Otonom WhatsApp Chatbot Multi-Tenant Kurulum ve Yönetim Kılavuzu

Bu kılavuz; n8n sisteminizdeki **5 Alt İş Akışının (Sub-Workflow)** ve **Ana Orkestrasyon Akışının (CHATBOT_BASE)** gerçek node parametreleri `n8n-mcp` ile tek tek okunarak hazırlanmıştır.

---

## 🎯 Temel Mantık: Neden Sub-Workflow'lara Sadece 1 Kez Dokunuyoruz?

Sistemimizdeki 5 alt iş akışı (`MUSAIT_SAATLER`, `RANDEVU_KAYDET`, `RANDEVU_SORGULA`, `RANDEVU_GUNCELLE`, `RANDEVU_IPTAL`) **ortak API işçileridir**. 
İçlerinde hiçbir sabit salon adı veya sabit ID barındırmazlar. 

Ana bot akışından kendilerine hangi `tenant_id` gönderilirse, backend veritabanımıza gidip yalnızca o işletmenin randevularını, çalışma saatlerini ve müşterilerini sorgular veya güncellerler.

> **Sonuç:** Bu 5 alt iş akışını şimdi **1 kez** ayarladığınızda, sisteme 100 farklı işletme de eklense bu 5 akışa **bir daha asla dokunmayacaksınız**.

---

## 🛠 BÖLÜM 1: 5 Sub-Workflow'un Güncellenmesi (Adım Adım)

Aşağıdaki adımları n8n panelinize girerek sırasıyla uygulayınız.

---

### 1️⃣ MUSAIT_SAATLER (Workflow ID: `nncCbQuGO3HIyw9p`)

*Bu akış, seçilen tarihte salonun çalışma saatlerine ve dolu randevularına bakarak boş saatleri hesaplar.*

1. **Trigger Node'unu Açın:**
   * Adı: **`When Executed by Another Workflow`**
   * **Workflow Inputs** tablosunun altında yer alan **"Add Field"** (veya Add Input) butonuna tıklayın.
   * Alan adı olarak tam olarak şunu yazın: `tenant_id`
2. **HTTP Request Node'unu Açın:**
   * Adı: **`Backend_Musait_Saatler`**
   * **URL** alanındaki mevcut ifadeyi silip yerine şunu yapıştırın:
     ```text
     =https://randevu.n8n-mustafa.me/api/v1/chatbot/available-slots?date={{ $json.tarih }}&duration={{ $json.hizmet_suresi_dk || 30 }}&tenant_id={{ $json.tenant_id }}
     ```
3. **`Cikti_Formatla` (Code) Node'u:**
   * Dokunmanıza gerek yoktur, gelen saatleri otomatik formatlar.
4. **Kaydet:** Sağ üstteki **"Save"** butonuna basarak iş akışını kaydedin.

---

### 2️⃣ RANDEVU_KAYDET (Workflow ID: `We0Pe4V2ku0FSJlU`)

*Bu akış, müşteri onay verdikten sonra randevuyu veritabanında oluşturur.*

1. **Trigger Node'unu Açın:**
   * Adı: **`When Executed by Another Workflow`**
   * **"Add Field"** butonuna tıklayın.
   * Alan adı: `tenant_id` yazın.
2. **HTTP Request Node'unu Açın:**
   * Adı: **`Backend_Randevu_Kaydet`**
   * **Specify Body:** `Using JSON` seçili olmalı.
   * **JSON Body** kutusunun içindeki mevcut JSON'ı silip şunu yapıştırın:
     ```json
     ={
       "ad_soyad": "{{ $json.ad_soyad }}",
       "telefon": "{{ $json.telefon }}",
       "tarih": "{{ $json.tarih }}",
       "saat": "{{ $json.baslangic_saat }}",
       "hizmet": "{{ $json.hizmet }}",
       "sure": {{ parseInt($json.hizmet_suresi_dk) || 30 }},
       "tenant_id": "{{ $json.tenant_id }}"
     }
     ```
3. **`Sonuc_Kontrol_ve_Yanit1` (Code) Node'u:**
   * Dokunmanıza gerek yoktur.
4. **Kaydet:** Sağ üstteki **"Save"** butonuna basın.

---

### 3️⃣ RANDEVU_SORGULA (Workflow ID: `VvYmk3Kaj1mFJY2r`)

*Bu akış, müşterinin telefon numarasına göre o salondaki aktif ve bekleyen randevularını listeler.*

1. **Trigger Node'unu Açın:**
   * Adı: **`When Executed by Another Workflow`**
   * **"Add Field"** butonuna tıklayın.
   * Alan adı: `tenant_id` yazın.
2. **HTTP Request Node'unu Açın:**
   * Adı: **`Backend_Randevu_Sorgula`**
   * **URL** alanındaki mevcut ifadeyi silip şunu yapıştırın:
     ```text
     =https://randevu.n8n-mustafa.me/api/v1/chatbot/appointments?phone={{ $json.telefon }}&tenant_id={{ $json.tenant_id }}
     ```
3. **`Sonuc_Kontrol_ve_Yanit1` (Code) Node'u:**
   * Dokunmanıza gerek yoktur.
4. **Kaydet:** Sağ üstteki **"Save"** butonuna basın.

---

### 4️⃣ RANDEVU_GUNCELLE (Workflow ID: `jsrcdTPIPpOTOsqe`)

*Bu akış, müşterinin mevcut randevusunun tarih ve saatini günceller.*

1. **Trigger Node'unu Açın:**
   * Adı: **`When Executed by Another Workflow`**
   * **"Add Field"** butonuna tıklayın.
   * Alan adı: `tenant_id` yazın.
2. **HTTP Request Node'unu Açın:**
   * Adı: **`Backend_Randevu_Guncelle`**
   * **JSON Body** kutusuna şunu yapıştırın:
     ```json
     ={
       "appointment_id": "{{ $json.randevu_id }}",
       "tarih": "{{ $json.yeni_tarih }}",
       "saat": "{{ $json.yeni_saat }}",
       "tenant_id": "{{ $json.tenant_id }}"
     }
     ```
3. **`Basari_Yaniti` (Code) Node'u:**
   * Dokunmanıza gerek yoktur.
4. **Kaydet:** Sağ üstteki **"Save"** butonuna basın.

---

### 5️⃣ RANDEVU_IPTAL (Workflow ID: `cE0luVu4siel3Tf9`)

*Bu akış, müşterinin randevusunu iptal eder.*

1. **Trigger Node'unu Açın:**
   * Adı: **`When Executed by Another Workflow`**
   * **"Add Field"** butonuna tıklayın.
   * Alan adı: `tenant_id` yazın.
2. **HTTP Request Node'unu Açın:**
   * Adı: **`Backend_Randevu_Iptal`**
   * **JSON Body** kutusuna şunu yapıştırın:
     ```json
     ={
       "appointment_id": "{{ $json.randevu_id }}",
       "telefon": "{{ $json.telefon }}",
       "tenant_id": "{{ $json.tenant_id }}"
     }
     ```
3. **`Sonuc_Kontrol_ve_Yanit` (Code) Node'u:**
   * Dokunmanıza gerek yoktur.
4. **Kaydet:** Sağ üstteki **"Save"** butonuna basın.

---

## 🚀 BÖLÜM 2: İleride Yeni Bir İşletme Kaydedildiğinde Ne Yapacaksınız?

Süper Admin panelinizden yeni bir işletme oluşturduğunuzda (örneğin *Lumina Beauty* veya *İnci Klinik*):

### Adım 1: Süper Admin Paneline Girin
1. İşletmeler listesinde yeni oluşturduğunuz işletmenin kartını bulun.
2. Karttaki **Tenant ID** değerini kopyalayın (Örnek: `a3f81e22-83b4-4e20-91ab-6bdf03f19101`).

### Adım 2: n8n'de Ana Akışı Klonlayın (Duplicate)
1. n8n menüsünden **`CHATBOT_BASE`** iş akışını açın.
2. Sağ üstteki üç nokta menüsünden **"Duplicate"** (Kopyala) deyin.
3. Akışın adını yeni salona göre adlandırın: örn. `CHATBOT_LUMINA`.

### Adım 3: Klonlanan Akıştaki 6 Noktaya `tenant_id` Değerini Verin
Sub-workflow'ların trigger'larına `tenant_id` eklediğiniz için, kopyalanan ana akıştaki Tool node'larının içinde otomatik olarak `tenant_id` kutucuğu belirecektir. Klonladığınız akışta sadece şu 6 node'a işletmenin ID'sini yapıştırın:

1. **`Ayarları_Getir` (HTTP Request Node):**
   * URL'in sonuna `?tenant_id=SALON_UUID` ekleyin:
   * `=https://randevu.n8n-mustafa.me/api/v1/settings?tenant_id=SALON_UUID`
   *(Böylece bot, o salona özel mesai saatlerini ve hizmet listesini çeker)*
2. **`Musait_Saat_Sorgula` (Tool Node):**
   * `tenant_id`: `SALON_UUID`
3. **`Randevu_Kaydet` (Tool Node):**
   * `tenant_id`: `SALON_UUID`
4. **`Randevu_Sorgula` (Tool Node):**
   * `tenant_id`: `SALON_UUID`
5. **`Randevu_Degistir` (Tool Node):**
   * `tenant_id`: `SALON_UUID`
6. **`Randevu_İptal` (Tool Node):**
   * `tenant_id`: `SALON_UUID`

### Adım 4: Tetikleyiciyi (Webhook / WhatsApp) Bağlayın
* En baştaki `Whatsapp trigerr` node'undaki webhook yolunu yeni işletmenin WhatsApp numarasına veya Chatwoot gelen kutusuna bağlayın.
* Sağ üstten akışı **Active** konuma getirin.

✅ **Sistem Hazır!** 
Yeni salon artık kendi WhatsApp hattından gelen mesajları cevaplar, sadece kendi müşterilerini görür, kendi çalışma saatlerine göre randevu verir ve diğer işletmelerle en ufak bir veri karışıklığı yaşanmaz.
