// ==========================================
// DASHBOARD MAIN BOOTSTRAPPER (Orchestrator)
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

import { Calendar, CalendarNav } from './calendar.js';
import { DragDrop } from './drag-drop.js';
import { HoverPopupManager, AppointmentManager, ContextMenu } from './appointment.js';
import { PatientManager, NotesManager, PatientUI, SearchEngine } from './patient.js';
import { Dashboard, ChartTooltip } from './overview.js';
import { SettingsManager } from './settings.js';

class App {
    static initEventListeners() {
        if (Utils.$('btnLogout')) {
            Utils.$('btnLogout').addEventListener('click', () => {
                localStorage.removeItem('user_token');
                localStorage.removeItem('tenant_id');
                window.location.href = 'login.html';
            });
        }

        // --- ESC ve Dışarı Tıklama ile Kapatma ---
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (document.body.classList.contains('sidebar-active')) PatientUI.closeSidebar();
                if (DOM.addAptModal && !DOM.addAptModal.classList.contains('hidden')) AppointmentManager.closeAddModal();
                if (DOM.aptModal && !DOM.aptModal.classList.contains('hidden')) AppointmentManager.closeModal();
                if (DOM.editPatientModal && !DOM.editPatientModal.classList.contains('hidden')) PatientUI.closeEditPatientModal();
                if (Utils.$('confirmModal') && !Utils.$('confirmModal').classList.contains('hidden')) {
                    const noBtn = Utils.$('confirmNoBtn');
                    if (noBtn) noBtn.click();
                }
                ContextMenu.hide();
                HoverPopupManager.hidePopup();
                const leftSidebar = Utils.$('left-sidebar');
                if (leftSidebar && leftSidebar.classList.contains('mobile-active')) {
                    leftSidebar.classList.remove('mobile-active');
                    if (DOM.overlay) DOM.overlay.classList.remove('active');
                    const menuBtn = Utils.$('btnMobileMenu');
                    if (menuBtn) menuBtn.classList.remove('active');
                }
            }
        });

        document.addEventListener('click', e => {
            if (e.target.id === 'addAptModal') AppointmentManager.closeAddModal();
            else if (e.target.id === 'aptModal') AppointmentManager.closeModal();
            else if (e.target.id === 'editPatientModal') PatientUI.closeEditPatientModal();
            else if (e.target.id === 'confirmModal') {
                const noBtn = Utils.$('confirmNoBtn');
                if (noBtn) noBtn.click();
            }
        });
        // ------------------------------------------

        if (Utils.$('saveBtn')) Utils.$('saveBtn').onclick = AppointmentManager.updateAppointment;
        if (Utils.$('btnEditPatient')) Utils.$('btnEditPatient').onclick = PatientUI.openEditPatientModal;
        if (Utils.$('btnToggleWarning')) {
            Utils.$('btnToggleWarning').onclick = () => {
                DOM.sbWarningText.classList.toggle('revealed');
                const isRevealed = DOM.sbWarningText.classList.contains('revealed');
                Utils.$('btnToggleWarning').querySelector('use').setAttribute('href', isRevealed ? '#icon-eye-off' : '#icon-eye');
            };
        }
        if (Utils.$('btnCloseSidebar')) Utils.$('btnCloseSidebar').onclick = PatientUI.closeSidebar;
        if (Utils.$('sidebarOverlay')) {
            Utils.$('sidebarOverlay').onclick = () => {
                PatientUI.closeSidebar();
                const leftSidebar = Utils.$('left-sidebar');
                if (leftSidebar) leftSidebar.classList.remove('mobile-active');
                if (DOM.overlay) DOM.overlay.classList.remove('active');
                const menuBtn = Utils.$('btnMobileMenu');
                if (menuBtn) menuBtn.classList.remove('active');
            };
        }
        if (DOM.setUiTheme) {
            DOM.setUiTheme.addEventListener('change', e => {
                const isDark = e.target.value === 'dark';
                document.body.classList.toggle('dark-theme', isDark);
                const btn = Utils.$('btnThemeToggle');
                if (btn) btn.innerHTML = isDark ? '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-sun"></use></svg></span>' : '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-moon"></use></svg></span>';
            });
        }
        if (Utils.$('btnSaveNote')) Utils.$('btnSaveNote').onclick = NotesManager.savePatientNote;
        if (Utils.$('tabCalendar')) Utils.$('tabCalendar').onclick = () => {
            Dashboard.switchMainTab('calendar');
            if (window.innerWidth <= 768) closeMobileNav();
        };
        if (Utils.$('tabOverview')) Utils.$('tabOverview').onclick = () => {
            Dashboard.switchMainTab('overview');
            if (window.innerWidth <= 768) closeMobileNav();
        };
        if (Utils.$('tabSettings')) Utils.$('tabSettings').onclick = () => {
            Dashboard.switchMainTab('settings');
            if (window.innerWidth <= 768) closeMobileNav();
        };
        if (Utils.$('btnAddApt')) Utils.$('btnAddApt').onclick = AppointmentManager.openAddModal;
        if (DOM.btnSaveSettings) DOM.btnSaveSettings.onclick = SettingsManager.saveSettings;
        if (DOM.btnAddServiceSetting) {
            DOM.btnAddServiceSetting.onclick = () => SettingsManager.addService(DOM.newServiceName.value, DOM.newServiceDuration.value);
        }
        if (DOM.accentPresetGroup) {
            DOM.accentPresetGroup.addEventListener('click', e => {
                const btn = e.target.closest('.accent-preset-btn');
                if (!btn) return;
                DOM.accentPresetGroup.querySelectorAll('.accent-preset-btn').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
                document.body.classList.remove('accent-emerald', 'accent-cobalt', 'accent-amber', 'accent-rose', 'accent-violet', 'accent-slate');
                document.body.classList.add('accent-' + btn.dataset.accent);
                document.body.dataset.accentPreset = btn.dataset.accent;
            });
        }
        if (DOM.setBrandName) {
            DOM.setBrandName.addEventListener('input', () => {
                CONFIG.UI_PREFERENCES = { ...(CONFIG.UI_PREFERENCES || {}), brand_name: DOM.setBrandName.value.trim() };
                SettingsManager.applyBranding();
            });
        }
        if (DOM.btnResetColors) {
            DOM.btnResetColors.onclick = () => {
                DOM.setColWaiting.value = '#F59E0B';
                DOM.setColCompleted.value = '#10B981';
                DOM.setColCanceled.value = '#F43F5E';
                Utils.showToast('Renkler varsayılana çekildi. Uygulamak için "Tüm Ayarları Kaydet" butonuna basın.', 'warning');
            };
        }
        if (Utils.$('btnPrevWeek')) Utils.$('btnPrevWeek').onclick = () => CalendarNav.navigateCalendar(-1);
        if (Utils.$('btnToday')) Utils.$('btnToday').onclick = CalendarNav.goToday;
        if (Utils.$('btnNextWeek')) Utils.$('btnNextWeek').onclick = () => CalendarNav.navigateCalendar(1);
        if (Utils.$('tabNew')) Utils.$('tabNew').onclick = () => AppointmentManager.switchAddTab(true);
        if (Utils.$('tabExist')) Utils.$('tabExist').onclick = () => AppointmentManager.switchAddTab(false);
        if (Utils.$('btnClearSelectedPatient')) Utils.$('btnClearSelectedPatient').onclick = AppointmentManager.clearSelectedPatient;
        if (Utils.$('btnSubmitNewApt')) Utils.$('btnSubmitNewApt').onclick = AppointmentManager.submitNewAppointment;
        if (Utils.$('btnCancelAddModal')) Utils.$('btnCancelAddModal').onclick = AppointmentManager.closeAddModal;
        if (Utils.$('btnToggleInlineEdit')) Utils.$('btnToggleInlineEdit').onclick = AppointmentManager.toggleInlineEdit;
        if (Utils.$('btnXCloseModal')) Utils.$('btnXCloseModal').onclick = AppointmentManager.closeModal;
        if (Utils.$('btnSaveInlineEdit')) Utils.$('btnSaveInlineEdit').onclick = AppointmentManager.saveInlinePatientEdit;
        if (Utils.$('btnDeleteApt')) Utils.$('btnDeleteApt').onclick = AppointmentManager.deleteAppointment;
        if (Utils.$('btnSubmitEditPatient')) Utils.$('btnSubmitEditPatient').onclick = PatientUI.submitEditPatient;
        if (Utils.$('btnCancelEditPatient')) Utils.$('btnCancelEditPatient').onclick = PatientUI.closeEditPatientModal;
        
        // Mobile Sidebar Controls (Aç/Kapat Toggle Desteği)
        const closeMobileNav = () => {
            const sidebar = Utils.$('left-sidebar');
            if (sidebar) sidebar.classList.remove('mobile-active');
            if (DOM.overlay) DOM.overlay.classList.remove('active');
            const menuBtn = Utils.$('btnMobileMenu');
            if (menuBtn) menuBtn.classList.remove('active');
        };

        if (Utils.$('btnMobileMenu')) {
            Utils.$('btnMobileMenu').onclick = (e) => {
                e.stopPropagation();
                const sidebar = Utils.$('left-sidebar');
                if (!sidebar) return;
                const isOpening = !sidebar.classList.contains('mobile-active');
                sidebar.classList.toggle('mobile-active', isOpening);
                if (DOM.overlay) DOM.overlay.classList.toggle('active', isOpening);
                Utils.$('btnMobileMenu').classList.toggle('active', isOpening);
            };
        }

        // Sol Sidebar genişletme/daraltma
        if (Utils.$('btnSidebarCollapse')) {
            Utils.$('btnSidebarCollapse').onclick = () => {
                if (window.innerWidth <= 768) {
                    closeMobileNav();
                } else {
                    const sidebar = Utils.$('left-sidebar');
                    if (sidebar) sidebar.classList.toggle('expanded');
                }
            };
        }

        // Sidebar Footer Theme Toggle Button
        if (Utils.$('btnThemeToggle')) {
            const syncThemeIcon = () => {
                const isDark = document.body.classList.contains('dark-theme');
                const btn = Utils.$('btnThemeToggle');
                if (btn) btn.innerHTML = isDark ? '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-sun"></use></svg></span>' : '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-moon"></use></svg></span>';
            };
            syncThemeIcon();

            Utils.$('btnThemeToggle').onclick = () => {
                const isDark = document.body.classList.toggle('dark-theme');
                const setSelect = Utils.$('setUiTheme');
                if (setSelect) setSelect.value = isDark ? 'dark' : 'light';
                syncThemeIcon();
            };
        }

        // SVG Chart Tooltip delegation
        const trendChart = DOM.ovTrendChart;
        if (trendChart) {
            trendChart.addEventListener('mouseover', e => {
                const dot = e.target.closest('.chart-dot');
                if (dot) {
                    const count = dot.dataset.count;
                    const label = dot.dataset.label;
                    ChartTooltip.show(e, `${label}: ${count} Randevu`);
                }
            });
            trendChart.addEventListener('mousemove', e => {
                const dot = e.target.closest('.chart-dot');
                if (dot && ChartTooltip.tooltipEl) {
                    ChartTooltip.tooltipEl.style.left = (e.pageX + 10) + 'px';
                    ChartTooltip.tooltipEl.style.top = (e.pageY - 25) + 'px';
                }
            });
            trendChart.addEventListener('mouseout', e => {
                if (e.target.closest('.chart-dot')) {
                    ChartTooltip.hide();
                }
            });
            trendChart.addEventListener('click', async e => {
                const dot = e.target.closest('.chart-dot');
                if (dot) {
                    const targetDate = dot.dataset.date;
                    if (targetDate) {
                        ChartTooltip.hide();
                        await CalendarNav.loadCalendarRange(targetDate);
                        await Dashboard.switchMainTab('calendar');
                    }
                }
            });
        }

        // View Day / Week / Month Controls
        const toggleViewMode = (mode) => {
            Store.state.calendarViewMode = mode;
            ['btnViewDay', 'btnViewWeek', 'btnViewMonth'].forEach(id => {
                const btn = Utils.$(id);
                if (btn) btn.classList.toggle('active', id === 'btnView' + mode.charAt(0).toUpperCase() + mode.slice(1));
            });
            CalendarNav.loadCalendarRange(Store.state.currentViewDate);
        };

        if (Utils.$('btnViewDay')) Utils.$('btnViewDay').onclick = () => toggleViewMode('day');
        if (Utils.$('btnViewWeek')) Utils.$('btnViewWeek').onclick = () => toggleViewMode('week');
        if (Utils.$('btnViewMonth')) Utils.$('btnViewMonth').onclick = () => toggleViewMode('month');

        if (window.innerWidth <= 768) {
            Store.state.calendarViewMode = 'day';
            const btnDay = Utils.$('btnViewDay');
            const btnWeek = Utils.$('btnViewWeek');
            if (btnDay) btnDay.classList.add('active');
            if (btnWeek) btnWeek.classList.remove('active');
        }
        if (Utils.$('btnToggleAgenda')) {
            Utils.$('btnToggleAgenda').onclick = () => {
                Store.state.isAgendaCollapsed = !Store.state.isAgendaCollapsed;
                const panel = Utils.$('agendaPanel');
                if (panel) {
                    panel.classList.toggle('collapsed', Store.state.isAgendaCollapsed);
                }
                const btn = Utils.$('btnToggleAgenda');
                if (btn) {
                    btn.classList.toggle('active', !Store.state.isAgendaCollapsed);
                    btn.textContent = Store.state.isAgendaCollapsed ? '📅 Göster' : 'Ajanda';
                }
            };
        }
        ['sbTabOverview', 'sbTabFinance', 'sbTabNotes'].forEach(id => {
            const btn = Utils.$(id);
            if (btn) {
                btn.onclick = () => {
                    const tabName = id.replace('sbTab', '').toLowerCase();
                    PatientUI.switchSidebarTab(tabName);
                };
            }
        });

        // Takvim boş slotlarına tıklama dinleyicisi
        const calendarGrid = document.querySelector('.calendar-grid');
        if (calendarGrid) {
            calendarGrid.addEventListener('click', e => {
                const dropZone = e.target.closest('.drop-zone');
                if (dropZone && !e.target.closest('.apt-card') && !e.target.closest('.apt-card-actions')) {
                    const dateStr = dropZone.dataset.date;
                    const timeStr = dropZone.dataset.time;
                    
                    if (DateUtils.getAppFakeUTCUnix(dateStr, timeStr) < DateUtils.getIstanbulUnix()) {
                        Utils.showToast(CONFIG.UI.MSG_PAST_DATE_NOT_ALLOWED, 'warning');
                    } else {
                        AppointmentManager.openAddModal(dateStr, timeStr);
                    }
                }
            });
        }

        document.addEventListener('click', e => {
            [Utils.$('searchResults'), Utils.$('addSearchResults')].forEach(res => {
                if (res && !res.classList.contains('hidden') && !e.target.closest('.search-wrap') && !e.target.closest('#addExistFields')) res.classList.add('hidden');
            });
        }, { passive: true });

        window.addEventListener('beforeunload', () => {
            UndoManager.commitCurrent();
        });
    }

    static initSearchEngines() {
        const [searchInput, searchResults] = [Utils.$('searchInput'), Utils.$('searchResults')];
        if (searchInput && searchResults) {
            SearchEngine.initSearch(searchInput, searchResults, 
                i => Utils.el('div', {
                        className: 'search-item',
                        onclick: () => { PatientUI.openSidebar(i); Utils.$('searchResults').classList.add('hidden'); }
                    },
                    Utils.el('div', { className: 'search-item-name' }, Utils.formatName(i.ad_soyad) || CONFIG.DEFAULTS.NAME),
                    Utils.el('div', { className: 'search-item-phone' },
                        Utils.el('svg', { style: 'width:12px;height:12px;margin-right:4px;' }, Utils.el('use', { href: '#icon-phone' })),
                        i.telefon || CONFIG.DEFAULTS.PHONE
                    )
                ),
                data => { Store.state.searchCache = Object.fromEntries(data.map(i => [i.id || i.hasta_id, i])); }
            );
        }

        const [addSearchInput, addSearchResults] = [Utils.$('addSearchInput'), Utils.$('addSearchResults')];
        if (addSearchInput && addSearchResults) {
            SearchEngine.initSearch(addSearchInput, addSearchResults, 
            i => Utils.el('div', {
                        className: 'search-item',
                        onclick: () => AppointmentManager.selectExistingPatient(i.id || i.hasta_id, i.ad_soyad || '', i.telefon || '')
                    },
                    Utils.el('div', { className: 'search-item-name' }, Utils.formatName(i.ad_soyad) || ''),
                    Utils.el('div', { className: 'search-item-phone' }, i.telefon || '')
                )
            );
        }
    }

    static hideLoader() {
        const loader = Utils.$('page-loader');
        if (loader) requestAnimationFrame(() => requestAnimationFrame(() => loader.classList.add('done')));
    }

    static async bootstrap() {
        const token = localStorage.getItem('user_token');
        const tenant = localStorage.getItem('tenant_id');
        if (!token || !tenant) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const settingsData = await ApiService.call(CONFIG.ENDPOINTS.GET_SETTINGS, { method: 'GET', returnData: true });
            if (settingsData && Array.isArray(settingsData)) {
                // n8n/Supabase'den gelen satır tabanlı ayarları güvenle entegre et (Deep Merge)
                settingsData.forEach(item => {
                    const key = item.setting_key;
                    const val = item.setting_value;
                    if (key && val) {
                        if (key === 'ui_preferences') {
                            if (val.currency) CONFIG.DEFAULTS.CURRENCY = val.currency;
                            if (val.colors) CONFIG.COLORS = { ...CONFIG.COLORS, ...val.colors };
                            CONFIG.UI_PREFERENCES = val;
                        } else {
                            const upperKey = key.toUpperCase();
                            if (CONFIG[upperKey] && typeof CONFIG[upperKey] === 'object' && !Array.isArray(CONFIG[upperKey])) {
                                CONFIG[upperKey] = { ...CONFIG[upperKey], ...val };
                            } else {
                                CONFIG[upperKey] = val;
                            }
                        }
                    }
                });
            }

            await CalendarNav.silentUpdate();

            ThemeUtils.applyDynamicTheme();
            Calendar.renderCalendar();
            Dashboard.updateDashboardStats();
            SettingsManager.populateSettingsUI();
            
            App.initEventListeners();
            App.initSearchEngines();
            DragDrop.init();
            ContextMenu.init();

            Store.state.lastSync = new Date().toISOString();
            window['set' + 'Int' + 'erval'](CalendarNav.silentUpdate, CONFIG.REFRESH_RATE);
            window['set' + 'Int' + 'erval'](Calendar.updateNowIndicator, 60000);

            await Promise.all([
                document.fonts ? document.fonts.ready : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Bootstrap error:', error);
        } finally {
            App.hideLoader();
        }
    }
}

// Uygulamayı Başlat
App.bootstrap();


export { App };
if (typeof window !== 'undefined') {
    window.App = App;
}
