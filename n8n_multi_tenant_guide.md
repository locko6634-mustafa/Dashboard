# n8n Otonom WhatsApp Chatbot Multi-Tenant Entegrasyon Kılavuzu

Bu kılavuz, SalonZeka platformundaki WhatsApp AI Chatbot iş akışlarının birden fazla işletme (Multi-Tenant) için nasıl çalıştırılacağını, parametre aktarımlarını ve alt iş akışlarının (Sub-Workflow) ortak kullanım mimarisini adım adım açıklamaktadır.

---

## 1. Mimari Genel Bakış

Sistem iki katmandan oluşur:
1. **İşletmeye Özel Ana Orkestrasyon (`CHATBOT_GUZELLIK_[SALON_ADI]`):**
   * Her yeni salon için bir adet kopyalanır.
   * O salonun WhatsApp hattını veya Chatwoot gelen kutusunu (inbox) dinler.
   * İçerisinde salonun adı, botun hitap dili, karşılama mesajları ve salonun `tenant_id` değeri sabit (değişken) olarak yer alır.
2. **Ortak Merkezi Alt İş Akışları (Sub-Workflows - 5 Adet):**
   * Tüm salonlar için **yalnızca 1'er adet** bulunur.
   * `Execute Workflow Trigger` ile tetiklenir.
   * Girdi olarak aldıkları `tenant_id` parametresi ile backend REST API'sine istek atar.
   * İş mantığı (müsait saat algoritması, çakışma kontrolü, randevu kaydı/iptali) tek bir yerde toplanmıştır.

```
[Müşteri WhatsApp] 
       │
       ▼
[CHATBOT_GUZELLIK_INCI_GUZELLIK]  (Ana Bot: Salon A)
       │ (Execute Workflow + { tenant_id: "...", ... })
       ├──► [CHATBOT_MUSAIT_SAATLER]  ──► Backend API (x-tenant-id: Salon A)
       ├──► [CHATBOT_RANDEVU_KAYDET]  ──► Backend API (x-tenant-id: Salon A)
       ├──► [CHATBOT_RANDEVU_SORGULA] ──► Backend API (x-tenant-id: Salon A)
       ├──► [CHATBOT_RANDEVU_GUNCELLE]──► Backend API (x-tenant-id: Salon A)
       └──► [CHATBOT_RANDEVU_IPTAL]   ──► Backend API (x-tenant-id: Salon A)
```

---

## 2. Ortak 5 Sub-Workflow'un Parametrik Hale Getirilmesi

Merkezi 5 workflow'unuzun girdi ve HTTP istek ayarları şu şekilde yapılandırılmalıdır:

### Adım 1: Tetikleyici (Trigger Node)
* Her sub-workflow'un başlangıç node'u: **`Execute Workflow Trigger`**
* Bu node, ana botun gönderdiği şu JSON nesnesini karşılar:
```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "telefon": "905321234567",
  "tarih": "2026-10-15",
  "saat": "14:30",
  "sure": 30,
  "hizmet": "Cilt Bakımı"
}
```

### Adım 2: HTTP Request Node Başlıkları (Headers)
Sub-workflow'ların backend API'sine attığı tüm HTTP Request node'larında şu başlık tanımlanmalıdır:
* **Header Name:** `x-tenant-id`
* **Header Value:** `{{ $json.tenant_id }}`

*(Opsiyonel olarak işletmenin API Key'i ile güvenlik sağlamak için: `x-api-key: {{ $json.api_key }}`)*

---

## 3. Sub-Workflow API Uç Noktaları ve Parametreleri

### 1. `CHATBOT_MUSAIT_SAATLER`
* **İstek:** `GET https://randevu.n8n-mustafa.me/api/v1/chatbot/available-slots`
* **Query Parametreleri:**
  * `date`: `{{ $json.tarih }}` (YYYY-MM-DD)
  * `duration`: `{{ $json.sure || 30 }}`
* **Header:**
  * `x-tenant-id`: `{{ $json.tenant_id }}`
* **Dönüş:** Uygun 15 dakikalık boş saat dilimleri dizisi.

### 2. `CHATBOT_RANDEVU_KAYDET`
* **İstek:** `POST https://randevu.n8n-mustafa.me/api/v1/chatbot/appointments`
* **Header:**
  * `x-tenant-id`: `{{ $json.tenant_id }}`
* **JSON Body:**
```json
{
  "ad_soyad": "{{ $json.ad_soyad }}",
  "telefon": "{{ $json.telefon }}",
  "tarih": "{{ $json.tarih }}",
  "saat": "{{ $json.saat }}",
  "sure": {{ $json.sure || 30 }},
  "hizmet": "{{ $json.hizmet }}"
}
```

### 3. `CHATBOT_RANDEVU_SORGULA`
* **İstek:** `GET https://randevu.n8n-mustafa.me/api/v1/chatbot/appointments`
* **Query Parametreleri:**
  * `phone`: `{{ $json.telefon }}`
  * `active`: `true`
* **Header:**
  * `x-tenant-id`: `{{ $json.tenant_id }}`

### 4. `CHATBOT_RANDEVU_GUNCELLE`
* **İstek:** `POST https://randevu.n8n-mustafa.me/api/v1/chatbot/reschedule`
* **Header:**
  * `x-tenant-id`: `{{ $json.tenant_id }}`
* **JSON Body:**
```json
{
  "telefon": "{{ $json.telefon }}",
  "appointment_id": "{{ $json.appointment_id }}",
  "yeni_tarih": "{{ $json.yeni_tarih }}",
  "yeni_saat": "{{ $json.yeni_saat }}"
}
```

### 5. `CHATBOT_RANDEVU_IPTAL`
* **İstek:** `POST https://randevu.n8n-mustafa.me/api/v1/chatbot/cancel`
* **Header:**
  * `x-tenant-id`: `{{ $json.tenant_id }}`
* **JSON Body:**
```json
{
  "telefon": "{{ $json.telefon }}",
  "appointment_id": "{{ $json.appointment_id }}"
}
```

---

## 4. Yeni Bir İşletme Katıldığında Yapılacaklar (3 Adım)

1. **Süper Admin Panelinden Salonu Ekleyin:**
   * `/admin.html` sayfasına gidin.
   * "+ Yeni İşletme Kaydet" butonuna basarak salon adını, e-posta, WhatsApp numarası ve paketini girin.
   * Sistem size salonun benzersiz **`tenant_id`** ve **`API Key`** değerini verir.

2. **n8n'de Ana Botu Klonlayın:**
   * Mevcut `CHATBOT_GUZELLIK` workflow'unu kopyalayın ve adını `CHATBOT_GUZELLIK_[SALON_ADI]` yapın.
   * Workflow'un en başındaki "Set / Değişken Tanımla" node'unda:
     * `tenant_id` değerine Süper Admin panelinden aldığınız ID'yi yapıştırın.
     * `salon_adi` alanına salonun adını yazın.

3. **WhatsApp / Chatwoot Webhook Bağlantısını Yapın:**
   * Yeni açılan botun WhatsApp webhook tetikleyicisini o salonun WhatsApp numarasına bağlayın.
   * **İşlem tamam!** Bot artık otomatik olarak sadece o salona ait randevuları alacak, sorgulayacak ve yönetecek.
