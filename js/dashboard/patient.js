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
import { Terminology } from '../shared/terminology.js';

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
        
        ['sbTabOverview', 'sbTabAppointments', 'sbTabFinance', 'sbTabNotes'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.classList.toggle('active', id === 'sbTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
        });

        ['sbPanelOverview', 'sbPanelAppointments', 'sbPanelFinance', 'sbPanelNotes'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.classList.toggle('active', id === 'sbPanel' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
        });

        if (tabName === 'appointments') {
            PatientUI.renderPatientAppointments();
        }
    };

    static updateOverviewAptLink = () => {
        const btn = Utils.$('btnViewAllAppointments');
        if (!btn) return;
        const count = (Store.state.patientAppointments || []).length;
        btn.textContent = count > 0 ? `Tümünü Gör (${count}) →` : 'Randevular →';
    };

    static loadPatientAppointments = async (pId) => {
        if (!pId) return;
        
        // 1. Yerel Store'daki randevulardan anında doldur
        const localApps = Object.values(Store.state.appointments).filter(a => (a.hasta_id === pId || a.id === pId));
        Store.state.patientAppointments = [...localApps];
        PatientUI.renderPatientAppointments();
        PatientUI.updateOverviewAptLink();

        // 2. API'den tüm randevuları asenkron getir
        try {
            const endpoint = (CONFIG.ENDPOINTS.CLIENT_APTS || 'musteri-randevulari') + '?id=' + pId;
            const data = await ApiService.call(endpoint, {
                method: 'GET',
                returnData: true,
                customErrorMsg: null
            });

            if (Array.isArray(data)) {
                const mergedMap = new Map();
                data.forEach(a => {
                    const id = a.id || a.randevu_id;
                    if (id) mergedMap.set(id, a);
                });
                localApps.forEach(a => {
                    const id = a.id || a.randevu_id;
                    if (id && !mergedMap.has(id)) {
                        mergedMap.set(id, a);
                    }
                });
                Store.state.patientAppointments = Array.from(mergedMap.values());
                PatientUI.renderPatientAppointments();
                PatientUI.updateOverviewAptLink();
            }
        } catch (e) {
            console.warn('Müşteri tüm randevuları API üzerinden çekilemedi, yerel veriler kullanılıyor:', e);
        }
    };

    static renderPatientAppointments = () => {
        const listEl = Utils.$('sbAppointmentsList');
        if (!listEl) return;

        const allApps = Store.state.patientAppointments || [];
        const filter = Store.state.patientAppointmentsFilter || 'all';
        const todayStr = DateUtils.getTodayLocalISO();

        // 1. Özet Sayaç ve Başarı Oranı
        const totalCount = allApps.length;
        const completedCount = allApps.filter(a => a.durum === CONFIG.STATUS.COMPLETED).length;
        const canceledCount = allApps.filter(a => a.durum === CONFIG.STATUS.CANCELED).length;
        const successDenom = completedCount + canceledCount;
        const successRate = successDenom > 0 ? Math.round((completedCount / successDenom) * 100) : 0;

        const summaryEl = Utils.$('sbAptSummaryText');
        if (summaryEl) summaryEl.textContent = `${totalCount} Randevu Kaydı`;

        const badgeEl = Utils.$('sbAptSuccessBadge');
        if (badgeEl) {
            badgeEl.textContent = `%${successRate} Başarı`;
            badgeEl.className = successRate >= 70 ? 'sb-apt-pill-badge' : 'sb-apt-pill-badge text-amber';
        }

        // 2. Filtreleme
        let filtered = allApps.filter(a => {
            if (filter === 'upcoming') {
                return a.tarih && a.tarih >= todayStr && a.durum !== CONFIG.STATUS.CANCELED;
            }
            if (filter === 'completed') {
                return a.durum === CONFIG.STATUS.COMPLETED;
            }
            if (filter === 'canceled') {
                return a.durum === CONFIG.STATUS.CANCELED;
            }
            return true;
        });

        // 3. Sıralama: En yeniden eskiye (Tarih ve Saat)
        filtered.sort((a, b) => {
            const dateCmp = (b.tarih || '').localeCompare(a.tarih || '');
            if (dateCmp !== 0) return dateCmp;
            return (b.saat || '').localeCompare(a.saat || '');
        });

        // 4. Render
        if (filtered.length === 0) {
            const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>';
            listEl.replaceChildren(Utils.createEmptyState('Randevu Bulunamadı', 'Bu filtreye uygun randevu kaydı bulunmamaktadır.', svg));
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach(a => {
            const isUpcoming = a.tarih && a.tarih >= todayStr && a.durum === CONFIG.STATUS.WAITING;
            const fDate = new Date(a.tarih).toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
            const duration = a.sure || Utils.getServiceDuration(a.hizmet) || 30;
            const timeRange = Utils.getTimeRangeText(a.saat, duration);

            let statusClass = 'sb-status-waiting';
            if (a.durum === CONFIG.STATUS.COMPLETED) statusClass = 'sb-status-completed';
            else if (a.durum === CONFIG.STATUS.CANCELED) statusClass = 'sb-status-canceled';

            const headerLeft = Utils.el('div', { className: 'sb-apt-date-wrap' },
                isUpcoming ? Utils.el('span', { className: 'sb-apt-upcoming-tag' }, 'Yaklaşan') : null,
                Utils.el('span', { className: 'sb-apt-date' }, fDate)
            );

            const statusBadge = Utils.el('span', { className: `sb-apt-status ${statusClass}` }, a.durum || CONFIG.STATUS.WAITING);

            const cardHeader = Utils.el('div', { className: 'sb-apt-card-header' }, headerLeft, statusBadge);

            const metaLeft = Utils.el('div', { className: 'sb-apt-meta' },
                Utils.el('span', { className: 'font-bold text-main' }, a.hizmet || CONFIG.DEFAULTS.SERVICE),
                Utils.el('span', {}, '•'),
                Utils.el('span', {}, timeRange)
            );

            const cardBody = Utils.el('div', { className: 'sb-apt-card-body' }, metaLeft);

            const card = Utils.el('div', {
                className: `sb-apt-card ${isUpcoming ? 'is-upcoming' : 'is-past'}`,
                title: 'Randevu detayını açmak için tıklayın',
                onclick: () => {
                    const aptId = a.id || a.randevu_id;
                    if (aptId) AppointmentManager.openAptModal(aptId);
                }
            }, cardHeader, cardBody);

            fragment.appendChild(card);
        });

        listEl.replaceChildren(fragment);
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
                (a.hasta_id === pId || a.id === pId) &&
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

            // Filtreyi sıfırla ve tüm randevuları çek
            Store.state.patientAppointmentsFilter = 'all';
            const filterChips = document.querySelectorAll('#sbAptFilterChips .sb-filter-chip');
            filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
            PatientUI.loadPatientAppointments(pId);
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

class PatientCRM {
    static loadPatients = async (forceRefresh = false) => {
        const tableBody = Utils.$('patientsTableBody');
        if (tableBody && (!Store.state.patientsList || Store.state.patientsList.length === 0)) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-24"><div class="spinner spinner-center-sm mb-8"></div><span class="text-muted font-12">${CONFIG.UI.LOADER}</span></td></tr>`;
        }

        // 1. Mevcut randevulardan bilinen hastaları topla (Cache / Fallback)
        const apps = Object.values(Store.state.appointments);
        const map = new Map();

        apps.forEach(a => {
            const id = a.hasta_id || a.id;
            if (id && a.ad_soyad && !map.has(id)) {
                map.set(id, {
                    id: id,
                    hasta_id: id,
                    ad_soyad: a.ad_soyad,
                    telefon: a.telefon || '',
                    kronik_rahatsizlik: a.kronik_rahatsizlik || '',
                    paket_adi: a.paket_adi || '',
                    toplam_seans: a.toplam_seans || 0,
                    gelinen_seans: a.gelinen_seans || 0,
                    toplam_tutar: Number(a.toplam_tutar) || 0,
                    alinan_odeme: Number(a.alinan_odeme) || 0
                });
            }
        });

        // 2. API'den (musteriler / arama) tüm müşteri tablosunu çek
        try {
            const apiRes = await ApiService.call(CONFIG.ENDPOINTS.GET_PATIENTS || 'musteriler', { 
                method: 'GET', 
                returnData: true, 
                customErrorMsg: null 
            });

            if (apiRes) {
                let clients = Array.isArray(apiRes) ? apiRes : (apiRes.data || []);
                clients.forEach(c => {
                    const id = c.id || c.hasta_id;
                    if (id && c.ad_soyad) {
                        map.set(id, {
                            id: id,
                            hasta_id: id,
                            ad_soyad: c.ad_soyad,
                            telefon: c.telefon || '',
                            kronik_rahatsizlik: c.kronik_rahatsizlik || '',
                            paket_adi: c.paket_adi || '',
                            toplam_seans: c.toplam_seans || 0,
                            gelinen_seans: c.gelinen_seans || 0,
                            toplam_tutar: Number(c.toplam_tutar) || 0,
                            alinan_odeme: Number(c.alinan_odeme) || 0
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('API musteriler listesi alinamadi, yerel randevu verisi kullaniliyor:', e);
        }

        const patientList = Array.from(map.values()).sort((a, b) => (a.ad_soyad || '').localeCompare(b.ad_soyad || '', CONFIG.LOCALE));
        Store.state.patientsList = patientList;
        PatientCRM.renderCRM();
    };

    static getFilteredPatients = () => {
        const list = Store.state.patientsList || [];
        const filter = Store.state.patientsFilter || { status: 'all', query: '' };
        
        return list.filter(c => {
            // Arama filtresi
            if (filter.query) {
                const q = filter.query.toLowerCase();
                const name = (c.ad_soyad || '').toLowerCase();
                const phone = (c.telefon || '').toLowerCase();
                if (!name.includes(q) && !phone.includes(q)) return false;
            }

            // Durum / Kategori filtresi
            if (filter.status === 'debt') {
                const debt = (c.toplam_tutar || 0) - (c.alinan_odeme || 0);
                if (debt <= 0) return false;
            } else if (filter.status === 'has_package') {
                const hasPkg = c.paket_adi && c.paket_adi !== CONFIG.DEFAULTS.PACKAGE && (c.toplam_seans > 0);
                if (!hasPkg) return false;
            } else if (filter.status === 'completed_package') {
                const isFinished = (c.toplam_seans > 0) && (c.gelinen_seans >= c.toplam_seans);
                if (!isFinished) return false;
            }

            return true;
        });
    };

    static renderCRM = () => {
        const allList = Store.state.patientsList || [];
        const filteredList = PatientCRM.getFilteredPatients();

        // 1. KPI Kartlarını Hesapla & Güncelle
        let totalDebt = 0;
        let debtCount = 0;
        let packageCount = 0;

        allList.forEach(c => {
            const debt = (c.toplam_tutar || 0) - (c.alinan_odeme || 0);
            if (debt > 0) {
                debtCount++;
                totalDebt += debt;
            }
            if (c.paket_adi && c.paket_adi !== CONFIG.DEFAULTS.PACKAGE && c.toplam_seans > 0) {
                packageCount++;
            }
        });

        const totalEl = Utils.$('crmStatTotal');
        const debtCountEl = Utils.$('crmStatDebtCount');
        const totalDebtEl = Utils.$('crmStatTotalDebt');
        const packageCountEl = Utils.$('crmStatPackageCount');
        const countBadge = Utils.$('patientsCountBadge');

        if (totalEl) totalEl.textContent = allList.length;
        if (debtCountEl) debtCountEl.textContent = debtCount;
        if (totalDebtEl) totalDebtEl.textContent = totalDebt.toLocaleString('tr-TR') + ' ' + CONFIG.DEFAULTS.CURRENCY;
        if (packageCountEl) packageCountEl.textContent = packageCount;

        if (countBadge) {
            const clientLabel = Terminology.t('client_singular');
            countBadge.textContent = filteredList.length === allList.length
                ? `${allList.length} ${clientLabel}`
                : `${filteredList.length} / ${allList.length} ${clientLabel}`;
        }

        // 2. Tabloyu Doldur
        const tableBody = Utils.$('patientsTableBody');
        if (!tableBody) return;

        if (filteredList.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center p-32">
                        <div class="empty-state-wrap">
                            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" class="text-muted mb-8">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                            <p class="font-14 font-bold text-main">${Terminology.format('{client} Kaydı Bulunamadı')}</p>
                            <p class="font-11 text-muted">Arama kriterlerinize veya seçilen filtreye uygun kayıt yok.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const frag = document.createDocumentFragment();
        filteredList.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = 'crm-table-row';

            const debt = (c.toplam_tutar || 0) - (c.alinan_odeme || 0);
            const totalS = c.toplam_seans || 0;
            const currentS = c.gelinen_seans || 0;
            const sessionPerc = totalS > 0 ? Math.min(100, Math.round((currentS / totalS) * 100)) : 0;

            tr.innerHTML = `
                <td>
                    <div class="crm-client-cell">
                        <div class="crm-client-avatar">${(c.ad_soyad || 'M').charAt(0).toUpperCase()}</div>
                        <div class="crm-client-info">
                            <span class="crm-client-name">${Utils.formatName(c.ad_soyad)}</span>
                            <span class="crm-client-phone">${c.telefon || 'Telefon Yok'}</span>
                            ${c.kronik_rahatsizlik ? `<span class="crm-chronic-badge" title="${c.kronik_rahatsizlik}">⚠️ ${c.kronik_rahatsizlik}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="crm-package-cell">
                        <span class="crm-package-name">${c.paket_adi && c.paket_adi !== CONFIG.DEFAULTS.PACKAGE ? c.paket_adi : 'Paketsiz'}</span>
                        ${totalS > 0 ? `
                            <div class="crm-progress-wrap" title="${currentS} / ${totalS} Seans">
                                <div class="crm-progress-bar">
                                    <div class="crm-progress-fill" style="width: ${sessionPerc}%;"></div>
                                </div>
                                <span class="crm-progress-text">${currentS}/${totalS} (%${sessionPerc})</span>
                            </div>
                        ` : '<span class="text-muted font-11">-</span>'}
                    </div>
                </td>
                <td>
                    <span class="crm-amount font-bold text-main">${(c.toplam_tutar || 0).toLocaleString('tr-TR')} ₺</span>
                </td>
                <td>
                    <span class="crm-amount text-emerald font-bold">${(c.alinan_odeme || 0).toLocaleString('tr-TR')} ₺</span>
                </td>
                <td>
                    ${debt > 0 
                        ? `<span class="crm-debt-badge badge-debt">${debt.toLocaleString('tr-TR')} ₺ Kalan</span>`
                        : `<span class="crm-debt-badge badge-paid">Ödendi</span>`
                    }
                </td>
                <td style="text-align: right;">
                    <div class="crm-actions-group">
                        <button type="button" class="crm-action-btn btn-view-profile" title="Detayları ve Notları Gör">
                            <svg width="14" height="14"><use href="#icon-edit"></use></svg>
                            <span>Detay</span>
                        </button>
                    </div>
                </td>
            `;

            // Satıra tıklandığında sağ çekmeceyi (hasta detay) aç
            tr.onclick = () => {
                PatientUI.openSidebar(c);
            };

            const viewBtn = tr.querySelector('.btn-view-profile');
            if (viewBtn) {
                viewBtn.onclick = (e) => {
                    e.stopPropagation();
                    PatientUI.openSidebar(c);
                };
            }

            frag.appendChild(tr);
        });

        tableBody.replaceChildren(frag);
    };

    static exportToCSV = () => {
        const list = PatientCRM.getFilteredPatients();
        if (list.length === 0) {
            Utils.showToast(Terminology.format('Dışa aktarılacak {client} bulunamadı.'), 'warning');
            return;
        }

        const clientLabel = Terminology.t('client_singular');
        const sessionLabel = Terminology.t('session_singular');
        const extraLabel = Terminology.t('extra_info');
        const headers = [`${clientLabel} Adı`, 'Telefon', extraLabel, 'Paket Adı', `Toplam ${sessionLabel}`, `Gelinen ${sessionLabel}`, 'Toplam Tutar (TL)', 'Tahsil Edilen (TL)', 'Kalan Borç (TL)'];
        
        const rows = list.map(c => [
            `"${(c.ad_soyad || '').replace(/"/g, '""')}"`,
            `"${(c.telefon || '').replace(/"/g, '""')}"`,
            `"${(c.kronik_rahatsizlik || '').replace(/"/g, '""')}"`,
            `"${(c.paket_adi || '').replace(/"/g, '""')}"`,
            c.toplam_seans || 0,
            c.gelinen_seans || 0,
            c.toplam_tutar || 0,
            c.alinan_odeme || 0,
            (c.toplam_tutar || 0) - (c.alinan_odeme || 0)
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `${clientLabel.toLowerCase()}_listesi_${today}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.showToast(Terminology.format(`${list.length} {client} CSV olarak dışa aktarıldı.`), 'success');
    };

    static openAddPatientModal = () => {
        const modal = DOM.addPatientModal;
        if (!modal) return;
        // Formu sıfırla
        ['addPtName','addPtPhone','addPtChronic','addPtPackage','addPtTotalSession','addPtCurrentSession','addPtTotalAmount','addPtPaidAmount'].forEach(id => {
            const el = Utils.$(id);
            if (el) el.value = '';
        });
        modal.classList.remove('hidden');
    };

    static closeAddPatientModal = () => {
        const modal = DOM.addPatientModal;
        if (modal) modal.classList.add('hidden');
    };

    static submitNewPatient = async () => {
        const name = Utils.$('addPtName')?.value?.trim();
        const phone = Utils.$('addPtPhone')?.value?.trim();
        if (!name) { showToast(CONFIG.UI.MSG_NAME_REQUIRED, 'error'); return; }
        if (!phone || phone.length < 10) { showToast(CONFIG.UI.MSG_PHONE_INVALID, 'error'); return; }

        const payload = {
            ad_soyad: name,
            telefon: phone,
            kronik_rahatsizlik: Utils.$('addPtChronic')?.value?.trim() || null,
            paket_adi: Utils.$('addPtPackage')?.value?.trim() || null,
            toplam_seans: parseInt(Utils.$('addPtTotalSession')?.value) || 0,
            gelinen_seans: parseInt(Utils.$('addPtCurrentSession')?.value) || 0,
            toplam_tutar: parseFloat(Utils.$('addPtTotalAmount')?.value) || 0,
            alinan_odeme: parseFloat(Utils.$('addPtPaidAmount')?.value) || 0
        };

        // Negatif değer kontrolü
        if (payload.toplam_seans < 0 || payload.gelinen_seans < 0 || payload.toplam_tutar < 0 || payload.alinan_odeme < 0) {
            showToast(CONFIG.UI.MSG_NEGATIVE_VALUE, 'error');
            return;
        }

        const loader = Utils.$('addPatientLoading');
        if (loader) loader.classList.remove('hidden');

        try {
            const res = await ApiService.call(CONFIG.ENDPOINTS.ADD_PATIENT, { method: 'POST', payload });
            if (res && !res.error) {
                showToast(Terminology.format('✅ {client} başarıyla eklendi!'), 'success');
                PatientCRM.closeAddPatientModal();
                await PatientCRM.loadPatients(true);
            } else {
                showToast(res?.message || CONFIG.UI.MSG_API_ERROR, 'error');
            }
        } catch (err) {
            showToast(CONFIG.UI.MSG_API_ERROR, 'error');
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    };

    static initEventListeners = () => {
        // Filtre chip'leri
        const chips = document.querySelectorAll('.crm-filter-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                chips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                Store.state.patientsFilter.status = chip.getAttribute('data-filter') || 'all';
                PatientCRM.renderCRM();
            });
        });

        // Arama input'u
        const searchInput = Utils.$('patientsSearchInput');
        const clearBtn = Utils.$('btnClearPatientSearch');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const val = e.target.value.trim();
                if (clearBtn) clearBtn.classList.toggle('hidden', !val);
                debounceTimer = setTimeout(() => {
                    Store.state.patientsFilter.query = val;
                    PatientCRM.renderCRM();
                }, 200);
            });
        }

        if (clearBtn && searchInput) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.classList.add('hidden');
                Store.state.patientsFilter.query = '';
                PatientCRM.renderCRM();
                searchInput.focus();
            });
        }

        // CSV Export butonu
        const exportBtn = Utils.$('btnExportPatients');
        if (exportBtn) {
            exportBtn.addEventListener('click', PatientCRM.exportToCSV);
        }

        // CRM Müşteri Ekleme butonları
        const addPatientBtn = Utils.$('btnAddPatientCRM');
        if (addPatientBtn) addPatientBtn.addEventListener('click', PatientCRM.openAddPatientModal);

        const cancelAddPatient = Utils.$('btnCancelAddPatient');
        if (cancelAddPatient) cancelAddPatient.addEventListener('click', PatientCRM.closeAddPatientModal);

        const submitAddPatient = Utils.$('btnSubmitAddPatient');
        if (submitAddPatient) submitAddPatient.addEventListener('click', PatientCRM.submitNewPatient);
    };
}

export { PatientManager, NotesManager, PatientUI, SearchEngine, PatientCRM };
if (typeof window !== 'undefined') {
    window.PatientManager = PatientManager;
    window.NotesManager = NotesManager;
    window.PatientUI = PatientUI;
    window.SearchEngine = SearchEngine;
    window.PatientCRM = PatientCRM;
}
