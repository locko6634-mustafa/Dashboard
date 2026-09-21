// ==========================================
// PATIENT CRM & NOTES ENGINE (Dashboard)
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

import { AppointmentManager } from './appointment.js';

class PatientManager {
    static fillPatientForm = (prefix, app) => {
        Utils.$(prefix + 'Name').value = app.ad_soyad || '';
        Utils.$(prefix + 'Phone').value = app.telefon || '';
        Utils.$(prefix + 'Chronic').value = app.kronik_rahatsizlik || '';
        Utils.$(prefix + 'Package').value = app.paket_adi === CONFIG.DEFAULTS.PACKAGE ? '' : (app.paket_adi || '');
        Utils.$(prefix + 'TotalSession').value = app.toplam_seans || 0;
        Utils.$(prefix + 'CurrentSession').value = app.gelinen_seans || 0;
        Utils.$(prefix + 'TotalAmount').value = app.toplam_tutar || 0;
        Utils.$(prefix + 'PaidAmount').value = app.alinan_odeme || 0;
    };

    static getPatientFormData = (prefix, pId) => ({
        hasta_id: pId,
        ad_soyad: Utils.$(prefix + 'Name').value.trim(),
        telefon: Utils.$(prefix + 'Phone').value.trim(),
        kronik_rahatsizlik: Utils.$(prefix + 'Chronic').value.trim(),
        paket_adi: Utils.$(prefix + 'Package').value.trim(),
        toplam_seans: parseInt(Utils.$(prefix + 'TotalSession').value) || 0,
        gelinen_seans: parseInt(Utils.$(prefix + 'CurrentSession').value) || 0,
        toplam_tutar: parseFloat(Utils.$(prefix + 'TotalAmount').value) || 0,
        alinan_odeme: parseFloat(Utils.$(prefix + 'PaidAmount').value) || 0
    });

    static resetPatientForm = (prefix) => {
        [prefix + 'Name', prefix + 'Phone', prefix + 'Chronic', prefix + 'Package', prefix + 'TotalSession', prefix + 'CurrentSession', prefix + 'TotalAmount', prefix + 'PaidAmount'].forEach(id => {
            if (Utils.$(id)) Utils.$(id).value = '';
        });
    }
}


class NotesManager {
    static renderPatientNotes = () => {
        const sbNotes = Utils.$('sbNotes');
        if (!sbNotes) return;
        
        if (Store.state.patientNotes.length > 0) {
            const fragment = document.createDocumentFragment();
            const visibleNotes = Store.state.patientNotes.slice(0, Store.state.visibleNotesCount);
            
            visibleNotes.forEach(n => {
                const metin = n.not_metni || n.not || '';
                const rawTarih = n.tarih || '';
                const noteId = (n.id || '').toString();
                let tarihStr = '';
                if (rawTarih) {
                    const d = new Date(rawTarih);
                    if (!isNaN(d)) tarihStr = d.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString(CONFIG.LOCALE, { hour: '2-digit', minute: '2-digit' });
                }
                
                let deleteBtn = null;
                if (noteId) {
                    deleteBtn = Utils.el('button', { 
                        title: CONFIG.UI.TITLE_DEL_NOTE, 
                        className: 'delete-note-btn', 
                        onclick: function() { NotesManager.deletePatientNote(this, noteId); } 
                    });
                    deleteBtn.appendChild(
                        Utils.el('svg', { width: '13', height: '13' }, 
                            Utils.el('use', { href: '#icon-trash' })
                        )
                    );
                }
                
                const noteCard = Utils.el('div', { id: 'note-card-' + noteId, className: 'card-compact relative mb-8' },
                    Utils.el('div', { className: 'card-compact-header' },
                        Utils.el('span', { className: 'text-emerald font-bold' }, tarihStr),
                        deleteBtn
                    ),
                    Utils.el('div', { className: 'text-main white-space-pre' }, metin)
                );
                fragment.appendChild(noteCard);
            });
            
            if (Store.state.patientNotes.length > Store.state.visibleNotesCount) {
                const loadMoreBtn = Utils.el('button', {
                    className: 'modal-btn btn-secondary-soft w-full font-12 p-8',
                    onclick: () => {
                        Store.state.visibleNotesCount += 3;
                        NotesManager.renderPatientNotes();
                    }
                }, CONFIG.UI.BTN_LOAD_MORE || 'Daha Fazla Yükle');
                fragment.appendChild(loadMoreBtn);
            }
            
            sbNotes.replaceChildren(fragment);
        } else {
            const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.147l-2.825.92a.75.75 0 01-.92-.92l.92-2.825a4.5 4.5 0 011.146-1.89l13.73-13.73zM18 6.75l-1.5-1.5" /></svg>';
            sbNotes.replaceChildren(Utils.createEmptyState('Not Bulunamadı', CONFIG.UI.MSG_NOTES_EMPTY, svg));
        }
    };

    static loadPatientNotes = (pId) => {
        const sbNotes = Utils.$('sbNotes');
        if (!sbNotes || !pId) return;
        sbNotes.replaceChildren(Utils.el('div', { className: 'spinner spinner-center-sm' }));
        ApiService.call(CONFIG.ENDPOINTS.GET_NOTES + '?id=' + pId, { method: 'GET', returnData: true, isText: true, customErrorMsg: null })
            .then(text => {
                if (text === false) { sbNotes.replaceChildren(Utils.el('div', { className: 'text-danger font-11' }, CONFIG.UI.MSG_NOTES_ERROR)); return; }
                let data = [];
                try { data = text ? JSON.parse(text) : []; } catch (e) { }
                if (data && !Array.isArray(data) && data.data) data = data.data;
                if (data && !Array.isArray(data)) data = [data];
                if (data && data.length > 0 && data[0].json) data = data.map(i => i.json);

                data = data.filter(n => n && (n.not_metni || n.not || n.tarih));

                if (data.length > 0) {
                    data.sort((a, b) => new Date(b.tarih || 0) - new Date(a.tarih || 0));
                }
                
                Store.state.patientNotes = data;
                Store.state.visibleNotesCount = 3;
                NotesManager.renderPatientNotes();
            });
    };

    static savePatientNote = async (event) => {
        const note = Utils.$('sbNoteInput').value.trim();
        const pId = Store.state.activePatientId;
        if (!note) return Utils.showToast(CONFIG.UI.MSG_NOTE_EMPTY, 'warning');
        if (!pId) return Utils.showToast(CONFIG.UI.MSG_PATIENT_NOT_FOUND, 'error');

        const btn = event.target;
        const oldText = btn.textContent;
        btn.textContent = CONFIG.UI.SAVING;
        btn.disabled = true;

        const success = await ApiService.call(CONFIG.ENDPOINTS.ADD_NOTE, { payload: { hasta_id: pId, not: note, tarih: new Date().toISOString() }, customErrorMsg: CONFIG.UI.MSG_NOTE_ERROR });
        if (success) {
            btn.textContent = CONFIG.UI.BTN_SAVED;
            Utils.$('sbNoteInput').value = '';
            setTimeout(() => NotesManager.loadPatientNotes(pId), CONFIG.TIMERS.NOTE_LOAD);
        }
        setTimeout(() => { btn.textContent = oldText; btn.disabled = false; }, success ? CONFIG.TIMERS.BTN_RESET : 0);
    };

    static deletePatientNote = async (btn, noteId) => {
        if (!noteId) return;
        const noteCard = Utils.$('note-card-' + noteId);
        const originalOpacity = noteCard ? noteCard.style.opacity : '1';

        btn.disabled = true;
        btn.style.opacity = '0.4';
        if (noteCard) noteCard.style.opacity = '0.4';

        const success = await ApiService.call(CONFIG.ENDPOINTS.DEL_NOTE, { payload: { note_id: noteId }, customErrorMsg: CONFIG.UI.MSG_NOTE_DEL_ERROR });
        if (success) {
            Store.state.patientNotes = Store.state.patientNotes.filter(n => (n.id || '').toString() !== noteId);
            if (noteCard) {
                noteCard.style.transition = 'opacity 0.25s, transform 0.25s';
                noteCard.style.opacity = '0';
                noteCard.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    NotesManager.renderPatientNotes();
                }, CONFIG.TIMERS.NOTE_DEL);
            }
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            if (noteCard) noteCard.style.opacity = originalOpacity;
        }
    }
}


class PatientUI {
    static switchSidebarTab = (tabName) => {
        Store.state.sidebarTab = tabName;
        
        ['sbTabOverview', 'sbTabFinance', 'sbTabNotes'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.classList.toggle('active', id === 'sbTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
        });

        ['sbPanelOverview', 'sbPanelFinance', 'sbPanelNotes'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.classList.toggle('active', id === 'sbPanel' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
        });
    };

    static openSidebar = hasta => {
        const pId = hasta.hasta_id || hasta.id || hasta.randevu_id;
        Store.state.activePatientId = pId;

        PatientUI.switchSidebarTab('overview');

        DOM.sbName.textContent = Utils.formatName(hasta.ad_soyad) || CONFIG.DEFAULTS.NAME;
        DOM.sbPhone.textContent = hasta.telefon || CONFIG.DEFAULTS.PHONE;

        if (hasta.kronik_rahatsizlik) {
            DOM.sbWarning.classList.remove('hidden');
            DOM.sbWarningText.textContent = hasta.kronik_rahatsizlik;
            DOM.sbWarningText.classList.remove('revealed');
            if(DOM.btnToggleWarning) DOM.btnToggleWarning.querySelector('use').setAttribute('href', '#icon-eye');
        } else DOM.sbWarning.classList.add('hidden');

        DOM.sbPackageName.textContent = hasta.paket_adi ?? CONFIG.DEFAULTS.PACKAGE;
        const totalS = hasta.toplam_seans ?? 0, currentS = hasta.gelinen_seans ?? 0;
        DOM.sbSessionCount.textContent = currentS + ' / ' + totalS;
        const percentage = totalS > 0 ? Math.min(100, Math.round((currentS / totalS) * 100)) : 0;
        if (DOM.sbSessionRing) {
            const offset = 163.36 - (percentage / 100) * 163.36;
            DOM.sbSessionRing.style.strokeDashoffset = offset;
        }
        if (DOM.sbSessionRingText) {
            DOM.sbSessionRingText.textContent = percentage + '%';
        }

        const totalF = hasta.toplam_tutar ?? 0, paidF = hasta.alinan_odeme ?? 0;
        DOM.sbTotal.textContent = totalF + ' ' + CONFIG.DEFAULTS.CURRENCY;
        DOM.sbPaid.textContent = paidF + ' ' + CONFIG.DEFAULTS.CURRENCY;
        DOM.sbDebt.textContent = (totalF - paidF) + ' ' + CONFIG.DEFAULTS.CURRENCY;

        if(pId) {
            const todayStr = DateUtils.getTodayLocalISO();
            const pApps = Object.values(Store.state.appointments).filter(a =>
                a.hasta_id === pId &&
                a.tarih &&
                a.tarih < todayStr
            );
            pApps.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
            const last3 = pApps.slice(0,3);
            DOM.sbHistory.replaceChildren(); 
            if(last3.length > 0) {
                last3.forEach(a => {
                    const fDate = new Date(a.tarih).toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
                    DOM.sbHistory.appendChild(Utils.el('div', { className: 'card-history-item' },
                        Utils.el('div', { className: 'flex-between mb-4' },
                            Utils.el('span', { className: 'font-bold text-pink' }, fDate),
                            Utils.el('span', { className: 'text-muted font-10' }, a.durum)
                        ),
                        Utils.el('div', { className: 'text-main' }, a.hizmet || CONFIG.DEFAULTS.SERVICE)
                    ));
                });
            } else {
                const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
                DOM.sbHistory.appendChild(Utils.createEmptyState('İşlem Geçmişi Yok', CONFIG.UI.SEARCH_RESULTS_EMPTY, svg));
            }
        }
        if(DOM.sbNoteInput) DOM.sbNoteInput.value = '';

        requestAnimationFrame(() => {
            document.body.classList.add('sidebar-active');
            DOM.sidebar.classList.add('active');
            DOM.overlay.classList.add('active');
            setTimeout(() => NotesManager.loadPatientNotes(pId), 400);
        });
    };
    
    static closeSidebar = () => { document.body.classList.remove('sidebar-active'); DOM.sidebar.classList.remove('active'); DOM.overlay.classList.remove('active'); };

    static openEditPatientModal = () => {
        const pId = Store.state.activePatientId;
        if(!pId) return;
        const app = Object.values(Store.state.appointments).find(a => a.hasta_id === pId || a.id === pId || a.randevu_id === pId);
        if(!app) return;

        PatientManager.fillPatientForm('edit', app);

        DOM.editPatientModal.classList.remove('hidden');
        PatientUI.closeSidebar();
    };

    static closeEditPatientModal = () => {
        DOM.editPatientModal.classList.add('hidden');
        PatientManager.resetPatientForm('edit');
    };  

    static submitEditPatient = async () => {
        const pId = Store.state.activePatientId;
        if(!pId) return;

        const payload = PatientManager.getPatientFormData('edit', pId);

        if(!payload.ad_soyad) return Utils.showToast(CONFIG.UI.MSG_NAME_REQUIRED, "warning");
        if(payload.telefon && !/^[0-9+() -]{10,20}$/.test(payload.telefon)) return Utils.showToast(CONFIG.UI.MSG_PHONE_INVALID, "warning");
        if(payload.toplam_seans < 0 || payload.gelinen_seans < 0 || payload.toplam_tutar < 0 || payload.alinan_odeme < 0) return Utils.showToast(CONFIG.UI.MSG_NEGATIVE_VALUE, "warning");

        await ApiService.call(CONFIG.ENDPOINTS.UPDATE_PATIENT, { payload, loadingId: 'editModalLoading', reloadOnSuccess: true });
    }
}


class SearchEngine {
    static initSearch = (inputEl, resultsEl, createItemNode, onSelectData) => {
        let timeout;
        inputEl.addEventListener('input', e => {
            const query = e.target.value.trim(); clearTimeout(timeout);
            if (query.length < CONFIG.SEARCH.MIN_CHAR) return resultsEl.classList.add('hidden');
            timeout = setTimeout(async () => {
                resultsEl.classList.remove('hidden'); 
                resultsEl.replaceChildren(Utils.el('div', { className: 'search-item search-loading-state' }, Utils.el('div', { className: 'spinner spinner-sm' }), CONFIG.UI.SEARCHING));
                try {
                    let data = await ApiService.call(CONFIG.ENDPOINTS.SEARCH + '?q=' + encodeURIComponent(query), { method: 'GET', returnData: true, customErrorMsg: null });
                    if (!data) throw new Error();
                    data = Array.isArray(data) ? data.filter(i => i && (i.id || i.hasta_id)) : [];
                    if(onSelectData) onSelectData(data);
                    if (data.length) {
                        const frag = document.createDocumentFragment();
                        data.forEach(i => frag.appendChild(createItemNode(i)));
                        resultsEl.replaceChildren(frag);
                    } else {
                        const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>';
                        resultsEl.replaceChildren(Utils.createEmptyState('Sonuç Bulunamadı', CONFIG.UI.SEARCH_RESULTS_EMPTY, svg));
                    }
                } catch { resultsEl.replaceChildren(Utils.el('div', { className: 'search-item search-error-state' }, CONFIG.UI.SEARCH_ERROR)); }
            }, CONFIG.TIMERS.SEARCH_DEBOUNCE);
        });
    }
}


export { PatientManager, NotesManager, PatientUI, SearchEngine };
if (typeof window !== 'undefined') {
    window.PatientManager = PatientManager;
    window.NotesManager = NotesManager;
    window.PatientUI = PatientUI;
    window.SearchEngine = SearchEngine;
}
