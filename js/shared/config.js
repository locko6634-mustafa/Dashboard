function resolveApiBase() {
    if (typeof window === 'undefined') {
        return 'http://localhost:3000/webhook/';
    }
    // Geliştirici ortamı için özel override imkanı
    try {
        const customApi = window.localStorage ? window.localStorage.getItem('SZ_API_URL') : null;
        if (customApi && customApi.startsWith('http')) {
            return customApi.endsWith('/') ? customApi : `${customApi}/`;
        }
    } catch {
        // localStorage erişim kısıtlaması koruması
    }

    const host = window.location.hostname || '';
    const isLocal = ['localhost', '127.0.0.1', ''].includes(host);

    if (isLocal) {
        // Yerelde doğrudan backend portunda (3000) çalışıyorsa
        if (window.location.port === '3000') {
            return `${window.location.origin}/webhook/`;
        }
        // Yerelde statik sunucu (8000 vb.) üzerinden çalışıyorsa yerel backend'e yönlen
        return 'http://localhost:3000/webhook/';
    }

    // Canlı ortam: Sayfanın çalıştığı origin üzerinden göreli bağlan
    return window.location.origin ? `${window.location.origin}/webhook/` : '/webhook/';
}

export const CONFIG = {
    API_BASE: resolveApiBase(),
    REFRESH_RATE: 60000,
    CALENDAR: {
        START_HOUR: 9, END_HOUR: 19, SLOT_MINS: 15, SLOT_PX: 15, MIN_PX: 13, DRAG_THRES: 3, DAYS: ['Pzt', 'Sal',
            'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    },
    SERVICES: {
        DEFAULT_MINS: 30,
        MAP: { 'Danışma': 30, 'Standart': 45, 'Premium': 60, 'Diğer': 30 },
        LIST: ['Danışma', 'Standart', 'Premium', 'Diğer']
    },
    STATUS: { WAITING: 'Bekliyor', COMPLETED: 'Tamamlandı', CANCELED: 'İptal' },
    COLORS: {
        WAITING: '#F59E0B', COMPLETED: '#22C55E', CANCELED: '#EF4444', ERROR: '#EF4444', SUCCESS: '#22C55E', WARNING:
            '#F59E0B'
    },
    DEFAULTS: {
        NAME: 'İsimsiz', PACKAGE: 'Paket Seçilmedi', SERVICE: 'Belirtilmedi', PHONE: 'Belirtilmemiş', CURRENCY: '₺',
        TIME: 'Belirsiz'
    },
    LOCALE: 'tr-TR',
    SECTOR: 'beauty',
    TERMINOLOGY: {
        client_singular: 'Müşteri',
        client_plural: 'Müşteriler',
        service_singular: 'Hizmet',
        service_plural: 'Hizmetler',
        session_singular: 'Seans',
        session_plural: 'Seanslar',
        extra_info: 'Özel İstek / Alerji Notu',
        extra_info_placeholder: 'Özel istek, alerji durumu veya işlem notu (opsiyonel)',
        staff_singular: 'Uzman / Stilist'
    },
    TIMERS: {
        TOAST: 3000, SEARCH_DEBOUNCE: 400, SYNC_RELOAD: 1500, DRAG_BLOCK: 50, UI_ANIM: 300,
        NOTE_LOAD: 800, BTN_RESET: 2000, NOTE_DEL: 260
    },
    SEARCH: { MIN_CHAR: 3 },
    ENDPOINTS: {
        ACTION: 'guncelleme', ADD: 'ekle-dashboard', UPDATE_PATIENT: 'hasta-guncelle', SEARCH: 'arama', GET_NOTES: 'notlari-getir',
        ADD_NOTE: 'not-ekle', DEL_NOTE: 'not-sil', DEL_APT: 'randevu-sil', GET_OVERVIEW: 'genel-istatistik', GET_APTS: 'randevulari-getir',
        UPDATE_SETTINGS: 'ayarlar-guncelle',
        GET_SETTINGS: 'ayarlar-getir',
        LOGIN: 'kullanici-girisi',
        GET_PATIENTS: 'musteriler',
        CLIENT_APTS: 'musteri-randevulari',
        ADD_PATIENT: 'musteri-ekle'
    },
    UI: {
        LOADER: 'Yükleniyor...',
        SAVING: 'Kaydediliyor...',
        PROCESSING: 'İşleniyor...',
        SEARCHING: 'Aranıyor...',
        SEARCH_PLACEHOLDER: 'Müşteri Arama... (Ad Soyad, Telefon)',
        SEARCH_RESULTS_EMPTY: 'Kayıt bulunamadı.',
        SEARCH_ERROR: 'Sorgu başarısız!',
        CONFIRM_DELETE: 'Bu randevuyu kalıcı olarak silmek istediğinize emin misiniz?',
        CONFIRM_TITLE: 'Emin misiniz?',
        CONFIRM_MSG: 'Bu işlemi onaylıyor musunuz?',
        BTN_DELETE: 'Sil',
        BTN_YES: 'Evet, Sil',
        BTN_NO: 'Vazgeç',
        BTN_ADD_NEW: 'Yeni Ekle',
        BTN_TODAY: 'Bugün',
        BTN_SAVE_NOTE: 'Notu Kaydet',
        BTN_SAVED: '✅ Kaydedildi!',
        BTN_LOAD_MORE: 'Daha Fazla Yükle',
        MSG_API_ERROR: 'İşlem başarısız! Sunucu yanıt vermiyor veya ağ bağlantısı yok.',
        MSG_DELETE_ERROR: 'Silme işlemi başarısız oldu.',
        MSG_NOTE_EMPTY: 'Lütfen bir not yazın.',
        MSG_PATIENT_NOT_FOUND: 'Müşteri bilgisi bulunamadı.',
        MSG_NOTE_ERROR: 'Hata! Not ekleme servisine ulaşılamıyor veya sunucu yanıt vermiyor.',
        MSG_NOTE_DEL_ERROR: 'Not silinemedi. Lütfen tekrar deneyin.',
        MSG_AGENDA_EMPTY: 'Bugün için randevu bulunmuyor.',
        MSG_NOTES_EMPTY: 'Henüz not eklenmemiş.',
        MSG_NOTES_ERROR: 'Notlar yüklenemedi.',
        MSG_REQUIRED_FIELDS: 'Lütfen zorunlu alanları doldurun.',
        MSG_PAST_DATE_NOT_ALLOWED: 'Geçmiş bir tarihe randevu oluşturamaz veya taşıyamazsınız.',
        MSG_SELECT_PATIENT: 'Lütfen arama yaparak kayıtlı bir müşteri seçiniz.',
        MSG_NAME_REQUIRED: 'Ad Soyad zorunludur!',
        MSG_PHONE_INVALID: 'Geçerli bir telefon numarası giriniz.',
        MSG_NEGATIVE_VALUE: 'Finansal veya seans değerleri negatif olamaz.',
        BTN_SAVE_CHANGES: '💾 Değişiklikleri Kaydet',
        BTN_SAVE_INFO: '💾 Bilgileri Kaydet',
        BTN_SAVE_ADD: '🚀 Kaydet ve Ekle',
        LABEL_RECORD: 'Kayıt',
        TITLE_MAIN: 'Randevu Paneli',
        TITLE_EDIT_INFO: 'Bilgileri Düzenle',
        TITLE_CLOSE: 'Kapat',
        TITLE_DEL_NOTE: 'Notu Sil',
        MSG_SYNC_ERROR: 'Sessiz güncelleme başarısız (Ağ bağlantısı koptu).',
        TOOLTIP_RESIZE: 'Süreyi Değiştir'
    },
    LABELS: {
        PACKAGE_STATUS: 'Paket / Seans Durumu',
        FINANCIAL_SUMMARY: 'Finansal Özet',
        TOTAL_AMOUNT: 'Toplam Tutar',
        PAID_AMOUNT: 'Alınan Ödeme',
        REMAINING_DEBT: 'Kalan Bakiye',
        LAST_TRANSACTIONS: 'Son 3 İşlem',
        PAST_NOTES: 'Geçmiş Notlar',
        ADD_NOTE_FAST: 'Hızlı Not Ekle',
        NOTE_PLACEHOLDER: 'Randevu esnasında müşteri için not alın...',
        DAILY_AGENDA: 'Bugünün Akışı',
        DAILY_SUCCESS: 'Günlük Başarı',
        MODAL_NEW_APT: 'Yeni Randevu',
        MODAL_TAB_NEW: 'Yeni Müşteri',
        MODAL_TAB_EXIST: 'Kayıtlı Müşteri (Ara)',
        PATIENT_INFO: 'Müşteri Bilgileri',
        APT_DETAIL: 'Detay',
        STATUS_TIME: 'Durum ve Zaman Ayarı',
        MODAL_EDIT_PATIENT: 'Müşteri Bilgilerini Düzenle',
        PH_NAME: 'Ad Soyad',
        PH_PHONE: 'Telefon',
        PH_CHRONIC: 'Ek Bilgi / Not',
        PH_PACKAGE: 'Paket Adı',
        PH_TOTAL_SESSION: 'Toplam Seans',
        PH_CURRENT_SESSION: 'Gelinen',
        PH_TOTAL_AMOUNT: 'Toplam Tutar (₺)',
        PH_PAID_AMOUNT: 'Alınan (₺)',
        LBL_SEARCH_EXISTING: 'Kayıtlı Müşteri Ara',
        LBL_SERVICE: 'Hizmet',
        LBL_DATETIME: 'Tarih & Saat Ayarı',
        LBL_PERSONAL_INFO: 'Kişisel Bilgiler',
        LBL_PACKAGE_INFO: 'Paket ve Seans',
        LBL_FINANCE_INFO: 'Finansal Bilgiler',
        TAB_CALENDAR: 'Takvim',
        TAB_OVERVIEW: 'Genel Görünüm',
        TAB_SETTINGS: 'Ayarlar',
        OV_TOTAL_PATIENT: 'Toplam Müşteri',
        OV_TOTAL_APT: 'Toplam Randevu',
        OV_TOTAL_REV: 'Toplam Ciro',
        OV_SUCCESS_RATE: 'Başarı Oranı',
        OV_FINANCE_SUMMARY: 'Finansal Durum',
        OV_SERVICE_DIST: 'Hizmet Dağılımı',
        OV_RECENT_PATIENTS: 'Son Kayıtlar',
        OV_NO_DATA: 'Veri bulunamadı.'
    }
};

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
export default CONFIG;
