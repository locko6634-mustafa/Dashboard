// ==========================================
// TERMINOLOGY & SECTOR PRESETS MODULE
// ==========================================

import { CONFIG } from './config.js';

export const SECTOR_PRESETS = {
    beauty: {
        id: 'beauty',
        name: 'Güzellik, Berber & Kişisel Bakım',
        icon: '✂️',
        terms: {
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
        sample_services: [
            { name: 'Saç Kesimi & Yıkama', duration: 30 },
            { name: 'Sakal Tıraşı & Bakımı', duration: 20 },
            { name: 'Cilt Bakımı', duration: 45 },
            { name: 'Fön & Şekillendirme', duration: 30 },
            { name: 'Manikür & Pedikür', duration: 45 },
            { name: 'Boya & Renklendirme', duration: 90 }
        ]
    },
    healthcare: {
        id: 'healthcare',
        name: 'Klinik, Sağlık & Terapi',
        icon: '🩺',
        terms: {
            client_singular: 'Hasta / Danışan',
            client_plural: 'Hastalar',
            service_singular: 'Tedavi / Muayene',
            service_plural: 'Tedaviler',
            session_singular: 'Seans',
            session_plural: 'Seanslar',
            extra_info: 'Kronik Rahatsızlık / Anamnez',
            extra_info_placeholder: 'Kronik rahatsızlık, alerji veya anamnez notu (opsiyonel)',
            staff_singular: 'Hekim / Terapist'
        },
        sample_services: [
            { name: 'İlk Muayene & Değerlendirme', duration: 45 },
            { name: 'Kontrol Seansı', duration: 20 },
            { name: 'Fizyoterapi / Rehabilitasyon', duration: 45 },
            { name: 'Psikolojik Danışmanlık', duration: 50 },
            { name: 'Diyet / Beslenme Takibi', duration: 30 }
        ]
    },
    consulting: {
        id: 'consulting',
        name: 'Hukuk & Profesyonel Danışmanlık',
        icon: '⚖️',
        terms: {
            client_singular: 'Müvekkil / Danışan',
            client_plural: 'Müvekkiller',
            service_singular: 'Görüşme / Danışmanlık',
            service_plural: 'Danışmanlıklar',
            session_singular: 'Görüşme',
            session_plural: 'Görüşmeler',
            extra_info: 'Dava / Dosya No & Konu',
            extra_info_placeholder: 'Dava / dosya no, hukuki konu veya referans bilgisi (opsiyonel)',
            staff_singular: 'Avukat / Danışman'
        },
        sample_services: [
            { name: 'Hukuki Danışmanlık', duration: 45 },
            { name: 'Dava Ön Görüşmesi', duration: 60 },
            { name: 'Sözleşme İnceleme & Hazırlık', duration: 60 },
            { name: 'Mali / Vergi Değerlendirmesi', duration: 45 },
            { name: 'Rutin Durum Değerlendirmesi', duration: 30 }
        ]
    },
    education: {
        id: 'education',
        name: 'Eğitim, Özel Ders & Koçluk',
        icon: '🎓',
        terms: {
            client_singular: 'Öğrenci / Kursiyer',
            client_plural: 'Öğrenciler',
            service_singular: 'Ders / Çalışma',
            service_plural: 'Dersler',
            session_singular: 'Ders',
            session_plural: 'Dersler',
            extra_info: 'Seviye / Hedef / Alan',
            extra_info_placeholder: 'Öğrenci seviyesi, hedef sınav veya çalışma alanı (opsiyonel)',
            staff_singular: 'Eğitmen / Koç'
        },
        sample_services: [
            { name: 'Birebir Özel Ders (60 dk)', duration: 60 },
            { name: 'Birebir Özel Ders (45 dk)', duration: 45 },
            { name: 'Deneme Sınavı Analizi', duration: 40 },
            { name: 'Ödev & Soru Çözümü', duration: 30 },
            { name: 'Hedef & Motivasyon Koçluğu', duration: 45 }
        ]
    },
    automotive: {
        id: 'automotive',
        name: 'Oto Servis, Ekspertiz & Bakım',
        icon: '🚗',
        terms: {
            client_singular: 'Müşteri / Araç Sahibi',
            client_plural: 'Müşteriler',
            service_singular: 'Servis / İşlem',
            service_plural: 'İşlemler',
            session_singular: 'İşlem',
            session_plural: 'İşlemler',
            extra_info: 'Plaka, Marka / Model & Şasi',
            extra_info_placeholder: 'Örn: 34 ABC 123 - Ford Focus 2020 / Şasi no (opsiyonel)',
            staff_singular: 'Usta / Teknisyen'
        },
        sample_services: [
            { name: 'Periyodik Bakım', duration: 60 },
            { name: 'Oto Ekspertiz / Kontrol', duration: 45 },
            { name: 'Detaylı Yıkama & İç Temizlik', duration: 60 },
            { name: 'Fren & Balata Kontrolü', duration: 30 },
            { name: 'Lastik Değişimi & Balans', duration: 30 },
            { name: 'Arıza Tespiti & Diyagnostik', duration: 30 }
        ]
    },
    custom: {
        id: 'custom',
        name: 'Özel / Kendi Terimlerini Belirle',
        icon: '⚙️',
        terms: {
            client_singular: 'Müşteri',
            client_plural: 'Müşteriler',
            service_singular: 'Hizmet',
            service_plural: 'Hizmetler',
            session_singular: 'Seans',
            session_plural: 'Seanslar',
            extra_info: 'Ek Bilgi / Not',
            extra_info_placeholder: 'Özel not veya açıklama (opsiyonel)',
            staff_singular: 'Personel'
        },
        sample_services: [
            { name: 'Standart Randevu', duration: 30 },
            { name: 'Kapsamlı Randevu', duration: 60 }
        ]
    }
};

export class Terminology {
    static currentSector = 'beauty';
    static currentTerms = { ...SECTOR_PRESETS.beauty.terms };

    /**
     * Terminoloji motorunu başlatır ve ayarları birleştirir.
     */
    static init(sectorKey, customTerms = null) {
        Terminology.setSector(sectorKey || 'beauty', customTerms);
        Terminology.syncConfigGlobals();
    }

    /**
     * Sektör ve terim sözlüğünü belirler.
     */
    static setSector(sectorKey, customTerms = null) {
        if (SECTOR_PRESETS[sectorKey]) {
            Terminology.currentSector = sectorKey;
            Terminology.currentTerms = { ...SECTOR_PRESETS[sectorKey].terms };
        } else {
            Terminology.currentSector = 'custom';
            Terminology.currentTerms = { ...SECTOR_PRESETS.custom.terms };
        }

        if (customTerms && typeof customTerms === 'object') {
            Terminology.currentTerms = { ...Terminology.currentTerms, ...customTerms };
        }

        CONFIG.SECTOR = Terminology.currentSector;
        CONFIG.TERMINOLOGY = { ...Terminology.currentTerms };
    }

    /**
     * Anahtar adına göre güncel terimi döner.
     */
    static t(key, fallback = '') {
        return Terminology.currentTerms[key] || fallback || key;
    }

    /**
     * Şablon dizgelerindeki {client}, {clients}, {service}, {session}, {extra_info} değişkenlerini çözer.
     */
    static format(templateStr) {
        if (!templateStr || typeof templateStr !== 'string') return '';
        return templateStr
            .replace(/\{client\}/gi, Terminology.t('client_singular'))
            .replace(/\{clients\}/gi, Terminology.t('client_plural'))
            .replace(/\{service\}/gi, Terminology.t('service_singular'))
            .replace(/\{services\}/gi, Terminology.t('service_plural'))
            .replace(/\{session\}/gi, Terminology.t('session_singular'))
            .replace(/\{sessions\}/gi, Terminology.t('session_plural'))
            .replace(/\{extra_info\}/gi, Terminology.t('extra_info'))
            .replace(/\{staff\}/gi, Terminology.t('staff_singular'));
    }

    /**
     * CONFIG.UI ve CONFIG.LABELS metinlerini dinamik olarak günceller.
     */
    static syncConfigGlobals() {
        const client = Terminology.t('client_singular');
        const clients = Terminology.t('client_plural');
        const session = Terminology.t('session_singular');

        if (CONFIG.UI) {
            CONFIG.UI.SEARCH_PLACEHOLDER = `${client} Arama... (Ad Soyad, Telefon)`;
            CONFIG.UI.MSG_PATIENT_NOT_FOUND = `${client} bilgisi bulunamadı.`;
            CONFIG.UI.MSG_SELECT_PATIENT = `Lütfen arama yaparak kayıtlı bir ${client.toLowerCase()} seçiniz.`;
        }

        if (CONFIG.LABELS) {
            CONFIG.LABELS.PACKAGE_STATUS = `Paket / ${session} Durumu`;
            CONFIG.LABELS.NOTE_PLACEHOLDER = `Randevu esnasında ${client.toLowerCase()} için not alın...`;
        }
    }

    /**
     * DOM üzerindeki deklaratif data-t etiketlerini günceller.
     */
    static applyToDOM(root = document) {
        Terminology.syncConfigGlobals();

        // 1. Text Content: data-t="key"
        const textElements = root.querySelectorAll('[data-t]');
        textElements.forEach(el => {
            const key = el.getAttribute('data-t');
            if (key) {
                el.textContent = Terminology.t(key, el.textContent);
            }
        });

        // 2. Formatlı Text Content: data-t-format="Yeni {client} Ekle"
        const formatElements = root.querySelectorAll('[data-t-format]');
        formatElements.forEach(el => {
            const template = el.getAttribute('data-t-format');
            if (template) {
                el.textContent = Terminology.format(template);
            }
        });

        // 3. Placeholder: data-t-placeholder="{client} Ara..." veya direct key
        const placeholderElements = root.querySelectorAll('[data-t-placeholder]');
        placeholderElements.forEach(el => {
            const ph = el.getAttribute('data-t-placeholder');
            if (ph.includes('{')) {
                el.placeholder = Terminology.format(ph);
            } else {
                el.placeholder = Terminology.t(ph, el.placeholder);
            }
        });

        // 4. Title / Tooltip: data-t-title="Yeni {client} Ekle"
        const titleElements = root.querySelectorAll('[data-t-title]');
        titleElements.forEach(el => {
            const title = el.getAttribute('data-t-title');
            if (title.includes('{')) {
                el.title = Terminology.format(title);
            } else {
                el.title = Terminology.t(title, el.title);
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.Terminology = Terminology;
    window.SECTOR_PRESETS = SECTOR_PRESETS;
}
