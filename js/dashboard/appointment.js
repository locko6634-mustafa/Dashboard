// ==========================================
// APPOINTMENT & CONTEXT MENU ENGINE (Dashboard)
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
import { PatientUI, PatientManager } from './patient.js';

class HoverPopupManager {
    static timer = null;
    static currentApp = null;
    static isVisible = false;

    static handleMouseEnter = (e, app) => {
        if (ThemeUtils.isUiBusy()) return;
        HoverPopupManager.currentApp = app;
        HoverPopupManager.timer = setTimeout(() => {
            HoverPopupManager.showPopup(e);
        }, 500);
    };

    static handleMouseLeave = (e) => {
        clearTimeout(HoverPopupManager.timer);
        if (HoverPopupManager.isVisible) {
            HoverPopupManager.hidePopup();
        }
    };

    static handleMouseMove = (e) => {
        if (HoverPopupManager.isVisible) {
            HoverPopupManager.updatePosition(e);
        }
    };

    static showPopup = (e) => {
        const popup = document.getElementById('aptHoverPopup');
        if (!popup || !HoverPopupManager.currentApp) return;
        
        const app = HoverPopupManager.currentApp;
        const duration = app.sure || Utils.getServiceDuration(app.hizmet);
        const timeText = Utils.getTimeRangeText(app.saat, duration);
        const statusColor = app.durum === CONFIG.STATUS.WAITING ? CONFIG.COLORS.WAITING : app.durum === CONFIG.STATUS.COMPLETED ? CONFIG.COLORS.COMPLETED : CONFIG.COLORS.CANCELED;
        
        const header = Utils.el('div', { className: 'hp-header' },
            Utils.el('div', { className: 'hp-name' }, Utils.formatName(app.ad_soyad) || CONFIG.DEFAULTS.NAME),
            Utils.el('div', { className: 'hp-phone' }, app.telefon || '-')
        );

        const body = Utils.el('div', { className: 'hp-body' },
            Utils.el('div', { className: 'hp-row' },
                Utils.el('span', { className: 'hp-label' }, 'Hizmet: '),
                Utils.el('span', { className: 'hp-val' }, app.hizmet || '-')
            ),
            Utils.el('div', { className: 'hp-row' },
                Utils.el('span', { className: 'hp-label' }, 'Zaman: '),
                Utils.el('span', { className: 'hp-val' }, timeText)
            ),
            Utils.el('div', { className: 'hp-row' },
                Utils.el('span', { className: 'hp-label' }, 'Durum: '),
                Utils.el('span', { className: 'hp-val', style: 'color: ' + statusColor }, app.durum)
            )
        );

        if (app.kronik_rahatsizlik) {
            body.appendChild(
                Utils.el('div', { className: 'hp-row mt-4' },
                    Utils.el('span', { className: 'hp-label text-danger' }, 'Uyarı: '),
                    Utils.el('span', { className: 'hp-val text-danger' }, app.kronik_rahatsizlik)
                )
            );
        }
        
        popup.innerHTML = '';
        popup.appendChild(header);
        popup.appendChild(body);
        HoverPopupManager.updatePosition(e);
        popup.classList.remove('hidden');
        HoverPopupManager.isVisible = true;
    };

    static hidePopup = () => {
        const popup = document.getElementById('aptHoverPopup');
        if (popup) popup.classList.add('hidden');
        HoverPopupManager.isVisible = false;
        HoverPopupManager.currentApp = null;
    };

    static updatePosition = (e) => {
        const popup = document.getElementById('aptHoverPopup');
        if (!popup) return;
        
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        
        const rect = popup.getBoundingClientRect();
        const w = rect.width || 240;
        const h = rect.height || 120;

        if (x + w > window.innerWidth) {
            x = e.clientX - w - 15;
        }
        if (y + h > window.innerHeight) {
            y = e.clientY - h - 15;
        }
        
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';
    };
}


class AppointmentManager {
    static switchAddTab = isNew => {
        Store.state.isNewPatientMode = isNew;
        Utils.$('tabNew').classList.toggle('tab-btn-active', isNew);
        Utils.$('tabNew').classList.toggle('tab-btn-inactive', !isNew);
        Utils.$('tabExist').classList.toggle('tab-btn-active', !isNew);
        Utils.$('tabExist').classList.toggle('tab-btn-inactive', isNew);
        Utils.$('addNewFields').classList.toggle('hidden', !isNew);
        Utils.$('addExistFields').classList.toggle('hidden', isNew);
    };

    static clearSelectedPatient = () => {
        Store.state.selectedClientId = null;
        Store.state.selectedClientPhone = null;
        Utils.$('selectedPatientCard').classList.add('hidden');
        Utils.$('addSearchInput').value = '';
        Utils.$('addSearchInput').classList.remove('hidden');
    };

    static selectExistingPatient = (id, name, phone) => {
        Store.state.selectedClientId = id; Store.state.selectedClientPhone = phone; Utils.$('selPatName').textContent = name; Utils.$('selPatPhone').textContent = phone;
        Utils.$('selectedPatientCard').classList.remove('hidden');
        Utils.$('addSearchInput').classList.add('hidden'); Utils.$('addSearchResults').classList.add('hidden');
    };

    static openAddModal = (dateStr, timeStr) => { 
        const todayStr = DateUtils.getTodayLocalISO();
        const viewDate = dateStr || Store.state.currentViewDate || todayStr;
        Utils.$('addDate').min = todayStr;
        Utils.$('addDate').value = viewDate < todayStr ? todayStr : viewDate; 
        Utils.$('addTime').value = timeStr || (CONFIG.CALENDAR.START_HOUR.toString().padStart(2, '0') + ':00');
        
        DOM.addAptModal.classList.remove('hidden'); 
        AppointmentManager.clearSelectedPatient(); 
        AppointmentManager.switchAddTab(true); 
        Utils.$('addName').value = ''; 
        Utils.$('addPhone').value = '';
    };

    static openAddModalWithPatient = (id, name, phone) => {
        AppointmentManager.openAddModal();
        AppointmentManager.switchAddTab(false);
        AppointmentManager.selectExistingPatient(id, name, phone);
    };

    static closeAddModal = () => {
        DOM.addAptModal.classList.add('hidden');
        Utils.$('addName').value = ''; 
        Utils.$('addPhone').value = '';
        if(Utils.$('addSearchInput')) Utils.$('addSearchInput').value = '';
        AppointmentManager.clearSelectedPatient();
    };

    static submitNewAppointment = async () => {
        const hizmet = Utils.$('addService').value;
        const tarih = Utils.$('addDate').value;
        const saat = Utils.$('addTime').value;
        const todayStr = DateUtils.getTodayLocalISO();

        if(!tarih || !saat) return Utils.showToast(CONFIG.UI.MSG_REQUIRED_FIELDS, "warning");
        if (tarih < todayStr) return Utils.showToast(CONFIG.UI.MSG_PAST_DATE_NOT_ALLOWED, "warning");
        
        let payload = { hizmet, tarih, saat, durum: CONFIG.STATUS.WAITING, is_new: Store.state.isNewPatientMode };
        if (Store.state.isNewPatientMode) {
            payload.ad_soyad = Utils.$('addName').value.trim();
            payload.telefon = Utils.$('addPhone').value.trim();
            if(!payload.ad_soyad) return Utils.showToast(CONFIG.UI.MSG_NAME_REQUIRED, "warning");
            if(payload.telefon && !/^[0-9+() -]{10,20}$/.test(payload.telefon)) return Utils.showToast(CONFIG.UI.MSG_PHONE_INVALID, "warning");
        } else {
            if(!Store.state.selectedClientId) return Utils.showToast(CONFIG.UI.MSG_SELECT_PATIENT, "warning");
            payload.hasta_id = Store.state.selectedClientId;
            payload.telefon = Store.state.selectedClientPhone;
        }

        await ApiService.call(CONFIG.ENDPOINTS.ADD, { payload, loadingId: 'addModalLoading', reloadOnSuccess: true });
    };

    static openAptModal = id => { 
        if (typeof DragDrop.dragGlobalBlock !== 'undefined' && DragDrop.dragGlobalBlock) return;
        const app = Store.state.appointments[id]; if(!app) return; 
        const todayStr = DateUtils.getTodayLocalISO();
        Store.state.activeAptId = id;
        DOM.modalTitleText.textContent = Utils.formatName(app.ad_soyad); 
        DOM.modalSub.textContent = (app.hizmet || '') + ' | ' + app.telefon; 
        DOM.newDate.min = (app.tarih && app.tarih < todayStr) ? app.tarih : todayStr;
        DOM.newDate.value = app.tarih; 
        DOM.newTime.value = app.saat;
        DOM.newDuration.value = app.sure || Utils.getServiceDuration(app.hizmet) || 30;
        Utils.$('newStatus').value = app.durum || CONFIG.STATUS.WAITING;
        Utils.$('inlineEditSection').classList.add('hidden');
        PatientManager.fillPatientForm('inlineEdit', app);
        DOM.aptModal.classList.remove('hidden'); 
    };

    static closeModal = () => {
        DOM.aptModal.classList.add('hidden');
        if (Utils.$('inlineEditSection')) Utils.$('inlineEditSection').classList.add('hidden');
        PatientManager.resetPatientForm('inlineEdit');
    };

    static toggleInlineEdit = () => {
        Utils.$('inlineEditSection').classList.toggle('hidden');
    };

    static saveInlinePatientEdit = async () => {
        const app = Store.state.appointments[Store.state.activeAptId];
        if(!app) return;
        const pId = app.hasta_id || app.id || app.randevu_id;

        const payload = PatientManager.getPatientFormData('inlineEdit', pId);

        if(!payload.ad_soyad) return Utils.showToast(CONFIG.UI.MSG_NAME_REQUIRED, "warning");
        if(payload.telefon && !/^[0-9+() -]{10,20}$/.test(payload.telefon)) return Utils.showToast(CONFIG.UI.MSG_PHONE_INVALID, "warning");
        if(payload.toplam_seans < 0 || payload.gelinen_seans < 0 || payload.toplam_tutar < 0 || payload.alinan_odeme < 0) return Utils.showToast(CONFIG.UI.MSG_NEGATIVE_VALUE, "warning");

        await ApiService.call(CONFIG.ENDPOINTS.UPDATE_PATIENT, { payload, loadingId: 'modalLoading', reloadOnSuccess: true });
    };

    static updateAppointment = async () => {
        const dVal = Utils.$('newDate').value;
        const tVal = Utils.$('newTime').value;
        const durationVal = parseInt(DOM.newDuration.value) || 30;
        const statusVal = Utils.$('newStatus').value;
        const todayStr = DateUtils.getTodayLocalISO();
        const app = Store.state.appointments[Store.state.activeAptId], card = Utils.$('card-' + Store.state.activeAptId);
        if (dVal < todayStr && dVal !== app?.tarih) return Utils.showToast(CONFIG.UI.MSG_PAST_DATE_NOT_ALLOWED, "warning");
        Utils.$('modalLoading').classList.remove('hidden');
        if (await AppointmentManager.silentSync(Store.state.activeAptId, statusVal, dVal, tVal, card, durationVal)) {
            if (app) {
                app.tarih = dVal; app.saat = tVal; app.durum = statusVal; app.sure = durationVal;
            }
            if (card) {
                const heightPx = Math.max((durationVal / CONFIG.CALENDAR.SLOT_MINS) * CONFIG.CALENDAR.SLOT_PX - 2, CONFIG.CALENDAR.MIN_PX);
                card.style.height = heightPx + 'px';
                card.dataset.duration = durationVal;
                const durationClass = durationVal <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : (durationVal === 45 ? ' medium-apt' : '');
                card.className = 'apt-card ' + Utils.getSafeStatusClass(statusVal) + durationClass;
                Calendar.updateCardActions(card, Store.state.activeAptId, statusVal);
                const tSpan = card.querySelector('.apt-time'); if(tSpan) tSpan.textContent = Utils.getTimeRangeText(tVal, durationVal);
                const targetZone = document.querySelector('.drop-zone[data-date="' + dVal + '"][data-time="' + tVal + '"]');
                targetZone ? targetZone.appendChild(card) : card.style.display = 'none';
                Calendar.adjustOverlapPositions();
            }
            Dashboard.updateDashboardStats();
            if (window.ReportsManager && typeof window.ReportsManager.loadReportData === 'function' && DOM.viewReports && !DOM.viewReports.classList.contains('hidden')) {
                window.ReportsManager.loadReportData();
            }
            Utils.$('modalLoading').classList.add('hidden'); 
            AppointmentManager.closeModal();
            Utils.showToast('Randevu başarıyla güncellendi.', 'success');
        }
    };

    static silentSync = async (id, status, dVal, tVal, card, sure) => {
        if (card) card.style.opacity = '0.5';
        const success = await ApiService.call(CONFIG.ENDPOINTS.ACTION, { payload: { id, durum: status, tarih: dVal, saat: tVal, sure, bitis_saati: Utils.calcBitisSaati(tVal, sure) }, customErrorMsg: null });
        if (success) {
            if (card) card.style.opacity = '1'; 
            return true;
        } else {
            if (card) {
                card.style.opacity = '1'; 
                card.style.borderLeftColor = CONFIG.COLORS.ERROR; 
            }
            Utils.$('modalLoading').classList.add('hidden'); 
            Utils.showToast(CONFIG.UI.MSG_SYNC_ERROR, 'error'); 
            return false;
        }
    };



    static customConfirm = (message) => {
        return new Promise((resolve) => {
            const modal = Utils.$('confirmModal');
            Utils.$('confirmMessage').textContent = message;
            modal.classList.remove('hidden');

            const closeAndResolve = (result) => {
                modal.classList.add('hidden');
                Utils.$('confirmYesBtn').onclick = null;
                Utils.$('confirmNoBtn').onclick = null;
                resolve(result);
            };

            Utils.$('confirmYesBtn').onclick = () => closeAndResolve(true);
            Utils.$('confirmNoBtn').onclick = () => closeAndResolve(false);
        });
    };

    static deleteAppointment = async () => {
        const isConfirmed = await AppointmentManager.customConfirm(CONFIG.UI.CONFIRM_DELETE);
        if(!isConfirmed) return;
        
        const rId = Store.state.activeAptId;
        const app = Store.state.appointments[rId];
        if(!app) return;
        
        const card = Utils.$('card-' + rId);
        if(card) card.style.display = 'none';
        
        AppointmentManager.closeModal();
        
        if (!Store.state.pendingDeletes) Store.state.pendingDeletes = [];
        Store.state.pendingDeletes.push(rId);
        
        const appCopy = { ...app };
        delete Store.state.appointments[rId];
        
        Dashboard.updateDashboardStats(); 
        Calendar.adjustOverlapPositions();
        if (window.ReportsManager && typeof window.ReportsManager.loadReportData === 'function' && DOM.viewReports && !DOM.viewReports.classList.contains('hidden')) {
            window.ReportsManager.loadReportData();
        }
        
        UndoManager.registerAction('delete', { id: rId, app: appCopy, card }, 
            // Geri Al fonksiyonu
            () => {
                Store.state.appointments[rId] = appCopy;
                if (card) card.style.display = '';
                Store.state.pendingDeletes = Store.state.pendingDeletes.filter(id => id !== rId);
                Dashboard.updateDashboardStats();
                Calendar.adjustOverlapPositions();
                if (window.ReportsManager && typeof window.ReportsManager.loadReportData === 'function' && DOM.viewReports && !DOM.viewReports.classList.contains('hidden')) {
                    window.ReportsManager.loadReportData();
                }
                Utils.showToast("Silme işlemi geri alındı.", "success");
            },
            // Onayla (Veritabanından sil) fonksiyonu
            async () => {
                Store.state.pendingDeletes = Store.state.pendingDeletes.filter(id => id !== rId);
                const success = await ApiService.call(CONFIG.ENDPOINTS.DEL_APT, { payload: { randevu_id: appCopy.randevu_id }, customErrorMsg: CONFIG.UI.MSG_DELETE_ERROR });
                if (!success) {
                    // Hata durumunda randevuyu geri yüklemek isterseniz:
                    console.error("Server deletion failed for: " + rId);
                }
            }
        );
    };
}


class ContextMenu {
    static activeAppId = null;

    static init() {
        document.addEventListener('contextmenu', ContextMenu.handleRightClick);
        document.addEventListener('click', ContextMenu.hide);
        document.addEventListener('scroll', ContextMenu.hide, true);

        if (Utils.$('ctxEdit')) Utils.$('ctxEdit').onclick = () => { AppointmentManager.openAptModal(ContextMenu.activeAppId); ContextMenu.hide(); };
        if (Utils.$('ctxPatient')) Utils.$('ctxPatient').onclick = () => { 
            const app = Store.state.appointments[ContextMenu.activeAppId];
            if(app) PatientUI.openSidebar(app);
            ContextMenu.hide();
        };
        if (Utils.$('ctxStatusWait')) Utils.$('ctxStatusWait').onclick = () => { ContextMenu.changeStatus(CONFIG.STATUS.WAITING); };
        if (Utils.$('ctxStatusComp')) Utils.$('ctxStatusComp').onclick = () => { ContextMenu.changeStatus(CONFIG.STATUS.COMPLETED); };
        if (Utils.$('ctxStatusCanc')) Utils.$('ctxStatusCanc').onclick = () => { ContextMenu.changeStatus(CONFIG.STATUS.CANCELED); };
        if (Utils.$('ctxDelete')) Utils.$('ctxDelete').onclick = () => { 
            Store.state.activeAptId = ContextMenu.activeAppId; 
            AppointmentManager.deleteAppointment(); 
            ContextMenu.hide();
        };
    }

    static handleRightClick(e) {
        const card = e.target.closest('.apt-card');
        if (!card) {
            ContextMenu.hide();
            return;
        }

        e.preventDefault();
        const id = card.id.replace('card-', '');
        ContextMenu.activeAppId = id;

        const menu = Utils.$('aptContextMenu');
        menu.classList.remove('hidden');

        let x = e.clientX;
        let y = e.clientY;

        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x -= rect.width;
        if (y + rect.height > window.innerHeight) y -= rect.height;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    }

    static hide(e) {
        const menu = Utils.$('aptContextMenu');
        if (menu && !menu.classList.contains('hidden')) {
            if (e && e.type === 'click' && e.target.closest('.context-menu')) return;
            menu.classList.add('hidden');
        }
    }

    static async changeStatus(newStatus) {
        const id = ContextMenu.activeAppId;
        const app = Store.state.appointments[id];
        if (!app) return;
        
        const card = Utils.$('card-' + id);
        if (!card) return;

        const duration = app.sure || Utils.getServiceDuration(app.hizmet);
        const success = await AppointmentManager.silentSync(id, newStatus, app.tarih, app.saat, card, duration);
        if (success) {
            app.durum = newStatus;
            const durationClass = duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : (duration === 45 ? ' medium-apt' : '');
            card.className = 'apt-card ' + Utils.getSafeStatusClass(newStatus) + durationClass;
            Calendar.updateCardActions(card, id, newStatus);
            Dashboard.updateDashboardStats();
            Utils.showToast('Durum güncellendi.', 'success');
        }
        ContextMenu.hide();
    }
}

export { HoverPopupManager, AppointmentManager, ContextMenu };
if (typeof window !== 'undefined') {
    window.HoverPopupManager = HoverPopupManager;
    window.AppointmentManager = AppointmentManager;
    window.ContextMenu = ContextMenu;
}
