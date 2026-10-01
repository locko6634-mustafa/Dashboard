// ==========================================
// SETTINGS MANAGER (Dashboard)
// ==========================================

import { CONFIG } from '../shared/config.js';
import { Utils, DateUtils } from '../shared/utils.js';
import { showToast, showUndoToast } from '../shared/toast.js';
import { ThemeUtils } from '../shared/theme.js';
import { ApiService, apiRequest } from '../shared/api-client.js';
import { getToken, getTenantId, clearSession, logoutUser } from '../shared/auth-session.js';
import { Store } from './store.js';
import { DOM } from './dom.js';
import { UndoManager } from './undo-manager.js';

import { Calendar } from './calendar.js';
import { Terminology, SECTOR_PRESETS } from '../shared/terminology.js';

class SettingsManager {
    static getBrandName = () => {
        const prefs = CONFIG.UI_PREFERENCES || {};
        return (prefs.brand_name || CONFIG.BRAND_NAME || '').trim() || 'Randevu Paneli';
    };

    static applyBranding = () => {
        const brandName = SettingsManager.getBrandName();
        document.title = brandName;
        ['brandNameText', 'mobileBrandText', 'loaderBrandText'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.textContent = brandName;
        });
    };

    static updateServiceSelect = () => {
        const select = Utils.$('addService');
        if (!select) return;
        const selected = select.value;
        select.innerHTML = '';
        (CONFIG.SERVICES.LIST || []).forEach(service => {
            select.appendChild(Utils.el('option', { value: service }, service));
        });
        if (selected && CONFIG.SERVICES.LIST.includes(selected)) select.value = selected;
    };

    static populateSettingsUI = () => {
        if(!DOM.setCalStart) return;
        DOM.setCalStart.value = CONFIG.CALENDAR ? CONFIG.CALENDAR.START_HOUR : 9;
        DOM.setCalEnd.value = CONFIG.CALENDAR ? CONFIG.CALENDAR.END_HOUR : 19;

        const prefs = CONFIG.UI_PREFERENCES || {};
        if (DOM.setBrandName) DOM.setBrandName.value = prefs.brand_name || CONFIG.BRAND_NAME || '';
        DOM.setUiTheme.value = prefs.theme || 'light';
        DOM.setUiCurrency.value = prefs.currency || CONFIG.DEFAULTS.CURRENCY;
        const accentPreset = prefs.accent_preset || 'emerald';
        if (DOM.accentPresetGroup) {
            DOM.accentPresetGroup.querySelectorAll('.accent-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.accent === accentPreset);
            });
        }
        
        const cols = prefs.colors || CONFIG.COLORS || {};
        DOM.setColWaiting.value = cols.WAITING || '#F59E0B';
        DOM.setColCompleted.value = cols.COMPLETED || '#22C55E';
        DOM.setColCanceled.value = cols.CANCELED || '#EF4444';

        // Sektör ve Terminoloji Doldurma
        SettingsManager.populateSectorSettings();

        SettingsManager.applyBranding();
        SettingsManager.renderServiceCards();
        SettingsManager.updateServiceSelect();
    };

    static populateSectorSettings = () => {
        if (!DOM.setSectorSelect) return;
        
        DOM.setSectorSelect.value = CONFIG.SECTOR || 'beauty';
        
        if (DOM.setTermClientSingular) DOM.setTermClientSingular.value = Terminology.t('client_singular');
        if (DOM.setTermClientPlural) DOM.setTermClientPlural.value = Terminology.t('client_plural');
        if (DOM.setTermServiceSingular) DOM.setTermServiceSingular.value = Terminology.t('service_singular');
        if (DOM.setTermSessionSingular) DOM.setTermSessionSingular.value = Terminology.t('session_singular');
        if (DOM.setTermExtraInfo) DOM.setTermExtraInfo.value = Terminology.t('extra_info');

        // Sektör seçici listener (tek seferlik bağlama)
        if (!DOM.setSectorSelect._hasListener) {
            DOM.setSectorSelect.addEventListener('change', (e) => {
                const selectedSector = e.target.value;
                const preset = SECTOR_PRESETS[selectedSector];
                if (preset && preset.terms) {
                    if (DOM.setTermClientSingular) DOM.setTermClientSingular.value = preset.terms.client_singular;
                    if (DOM.setTermClientPlural) DOM.setTermClientPlural.value = preset.terms.client_plural;
                    if (DOM.setTermServiceSingular) DOM.setTermServiceSingular.value = preset.terms.service_singular;
                    if (DOM.setTermSessionSingular) DOM.setTermSessionSingular.value = preset.terms.session_singular;
                    if (DOM.setTermExtraInfo) DOM.setTermExtraInfo.value = preset.terms.extra_info;
                }
            });
            DOM.setSectorSelect._hasListener = true;
        }

        // Örnek Hizmetleri İçe Aktarma Butonu
        if (DOM.btnImportSectorServices && !DOM.btnImportSectorServices._hasListener) {
            DOM.btnImportSectorServices.addEventListener('click', () => {
                const currentSector = DOM.setSectorSelect ? DOM.setSectorSelect.value : (CONFIG.SECTOR || 'beauty');
                const preset = SECTOR_PRESETS[currentSector];
                if (preset && preset.sample_services && preset.sample_services.length > 0) {
                    let addedCount = 0;
                    preset.sample_services.forEach(srv => {
                        if (!CONFIG.SERVICES.LIST.includes(srv.name)) {
                            CONFIG.SERVICES.LIST.push(srv.name);
                            CONFIG.SERVICES.MAP[srv.name] = srv.duration;
                            addedCount++;
                        }
                    });
                    SettingsManager.renderServiceCards();
                    SettingsManager.updateServiceSelect();
                    Utils.showToast(`✅ ${preset.name} için ${addedCount} örnek hizmet listeye eklendi.`, 'success');
                }
            });
            DOM.btnImportSectorServices._hasListener = true;
        }
    };

    static renderServiceCards = () => {
        if (!DOM.serviceCardList) return;
        DOM.serviceCardList.innerHTML = '';
        (CONFIG.SERVICES.LIST || []).forEach(service => {
            const duration = CONFIG.SERVICES.MAP?.[service] || CONFIG.SERVICES.DEFAULT_MINS;
            DOM.serviceCardList.appendChild(Utils.el('div', { className: 'service-setting-card' },
                Utils.el('div', {},
                    Utils.el('strong', {}, service),
                    Utils.el('span', {}, duration + ' dk')
                ),
                Utils.el('button', {
                    type: 'button',
                    className: 'service-delete-btn',
                    title: 'Hizmeti sil',
                    onclick: () => SettingsManager.removeService(service)
                }, '×')
            ));
        });
    };

    static addService = (name, duration) => {
        const serviceName = (name || '').trim();
        const serviceDuration = parseInt(duration) || CONFIG.SERVICES.DEFAULT_MINS;
        if (!serviceName) {
            Utils.showToast('Hizmet adı zorunludur.', 'warning');
            return;
        }
        CONFIG.SERVICES.LIST = CONFIG.SERVICES.LIST || [];
        CONFIG.SERVICES.MAP = CONFIG.SERVICES.MAP || {};
        if (!CONFIG.SERVICES.LIST.includes(serviceName)) CONFIG.SERVICES.LIST.push(serviceName);
        CONFIG.SERVICES.MAP[serviceName] = serviceDuration;
        if (DOM.newServiceName) DOM.newServiceName.value = '';
        if (DOM.newServiceDuration) DOM.newServiceDuration.value = CONFIG.SERVICES.DEFAULT_MINS;
        SettingsManager.renderServiceCards();
        SettingsManager.updateServiceSelect();
    };

    static removeService = (name) => {
        CONFIG.SERVICES.LIST = (CONFIG.SERVICES.LIST || []).filter(service => service !== name);
        if (CONFIG.SERVICES.MAP) delete CONFIG.SERVICES.MAP[name];
        SettingsManager.renderServiceCards();
        SettingsManager.updateServiceSelect();
    };

    static saveSettings = async () => {
        const oldText = DOM.btnSaveSettings.innerHTML;
        DOM.btnSaveSettings.innerHTML = '<div class="spinner spinner-sm" style="border-top-color:white; border-right-color:white; border-bottom-color:transparent; border-left-color:transparent; margin-right:8px;"></div><span>Kaydediliyor...</span>';
        DOM.btnSaveSettings.disabled = true;

        const slotMins = 15;
        const calendarSettings = {
            START_HOUR: parseInt(DOM.setCalStart.value) || 9,
            END_HOUR: parseInt(DOM.setCalEnd.value) || 19,
            SLOT_MINS: slotMins,
            MIN_PX: CONFIG.CALENDAR.MIN_PX || 13,
            SLOT_PX: slotMins,
            DRAG_THRES: CONFIG.CALENDAR.DRAG_THRES || 3,
            DAYS: CONFIG.CALENDAR.DAYS || ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
        };
        
        const servicesSettings = {
            DEFAULT_MINS: 30,
            MAP: CONFIG.SERVICES.MAP || {},
            LIST: CONFIG.SERVICES.LIST || []
        };
        
        const uiPreferences = {
            theme: DOM.setUiTheme.value,
            brand_name: DOM.setBrandName ? DOM.setBrandName.value.trim() : '',
            accent_preset: document.body.dataset.accentPreset || (CONFIG.UI_PREFERENCES?.accent_preset || 'emerald'),
            currency: DOM.setUiCurrency.value.trim() || '₺',
            colors: {
                WAITING: DOM.setColWaiting.value,
                COMPLETED: DOM.setColCompleted.value,
                CANCELED: DOM.setColCanceled.value,
                ERROR: CONFIG.COLORS.ERROR || '#EF4444',
                SUCCESS: CONFIG.COLORS.SUCCESS || '#22C55E',
                WARNING: CONFIG.COLORS.WARNING || '#F59E0B'
            }
        };

        const sector = DOM.setSectorSelect ? DOM.setSectorSelect.value : (CONFIG.SECTOR || 'beauty');
        const terminology = {
            client_singular: (DOM.setTermClientSingular ? DOM.setTermClientSingular.value.trim() : '') || Terminology.t('client_singular'),
            client_plural: (DOM.setTermClientPlural ? DOM.setTermClientPlural.value.trim() : '') || Terminology.t('client_plural'),
            service_singular: (DOM.setTermServiceSingular ? DOM.setTermServiceSingular.value.trim() : '') || Terminology.t('service_singular'),
            service_plural: (DOM.setTermServiceSingular ? (DOM.setTermServiceSingular.value.trim() + 'ler') : '') || Terminology.t('service_plural'),
            session_singular: (DOM.setTermSessionSingular ? DOM.setTermSessionSingular.value.trim() : '') || Terminology.t('session_singular'),
            session_plural: (DOM.setTermSessionSingular ? (DOM.setTermSessionSingular.value.trim() + 'lar') : '') || Terminology.t('session_plural'),
            extra_info: (DOM.setTermExtraInfo ? DOM.setTermExtraInfo.value.trim() : '') || Terminology.t('extra_info'),
            extra_info_placeholder: (SECTOR_PRESETS[sector]?.terms?.extra_info_placeholder) || 'Özel not veya açıklama (opsiyonel)',
            staff_singular: (SECTOR_PRESETS[sector]?.terms?.staff_singular) || 'Personel'
        };

        const payload = [
            { setting_key: 'calendar', setting_value: calendarSettings },
            { setting_key: 'services', setting_value: servicesSettings },
            { setting_key: 'ui_preferences', setting_value: uiPreferences },
            { setting_key: 'sector', setting_value: sector },
            { setting_key: 'terminology', setting_value: terminology }
        ];

        const success = await ApiService.call(CONFIG.ENDPOINTS.UPDATE_SETTINGS, { 
            payload: payload, 
            reloadOnSuccess: false,
            customErrorMsg: 'Ayarlar kaydedilemedi. Ağ bağlantısını veya webhook ayarlarını kontrol edin.' 
        });

        if (success) {
            Utils.showToast('Ayarlar başarıyla kaydedildi. Değişikliklerin uygulanması için sayfa yenileniyor...', 'success');
            setTimeout(() => location.reload(), CONFIG.TIMERS.SYNC_RELOAD);
        } else {
            DOM.btnSaveSettings.innerHTML = oldText;
            DOM.btnSaveSettings.disabled = false;
        }
    }
}


export { SettingsManager };
if (typeof window !== 'undefined') {
    window.SettingsManager = SettingsManager;
}
