// ==========================================
// 1. STATE & CONFIG
// ==========================================

// Oturum yönetimi artık tamamen localStorage üzerinden yürütülüyor
CONFIG.SESSION_TOKEN = localStorage.getItem('user_token') || '';

class DateUtils {
    static getTodayLocalISO = () => {
        return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    };

    static getIstanbulUnix = () => {
        const fmt = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Europe/Istanbul',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        const iso = fmt.format(new Date()).replace(' ', 'T') + 'Z';
        return new Date(iso).getTime();
    };

    static getAppFakeUTCUnix = (dateStr, timeStr) => {
        return new Date(`${dateStr}T${timeStr}:00Z`).getTime();
    };
}

const initialApps = window.appData || {};
Object.keys(initialApps).forEach(key => {
    const app = initialApps[key];
    if (app.deleted_at) {
        delete initialApps[key];
        return;
    }
    if (app.saat && app.saat.length > 5) app.saat = app.saat.substring(0, 5);
});

class Store {
    static state = {
        appointments: initialApps,
        isAuthenticated: true,
        activePatientId: null,
        activeAptId: null,
        searchCache: {},
        isNewPatientMode: true,
        selectedClientId: null,
        selectedClientPhone: null,
        isSilentUpdating: false,
        silentUpdateStart: 0,
        activeMainTab: 'calendar',
        overviewData: null,
        currentViewDate: new URLSearchParams(window.location.search).get('date') || DateUtils.getTodayLocalISO(),
        lastSync: null,
        renderedWeekKey: null,
        isLoading: false,
        patientNotes: [],
        visibleNotesCount: 3,
        calendarViewMode: 'week',
        isAgendaCollapsed: false,
        sidebarTab: 'overview',
        pendingDeletes: [],
        activeUndo: null
    };
}

class UndoManager {
    static registerAction = (type, data, performUndo, performCommit) => {
        // If there's an existing undo action, commit it immediately
        UndoManager.commitCurrent();

        const timer = setTimeout(() => {
            performCommit();
            if (Store.state.activeUndo && Store.state.activeUndo.timer === timer) {
                Store.state.activeUndo = null;
            }
        }, 5000);

        let toastMsg = '';
        if (type === 'delete') {
            toastMsg = 'Randevu silindi.';
        } else if (type === 'move') {
            toastMsg = 'Randevu taşındı.';
        } else if (type === 'resize') {
            toastMsg = 'Randevu süresi değiştirildi.';
        }

        const toastObj = Utils.showUndoToast(toastMsg, () => {
            clearTimeout(timer);
            performUndo();
            Store.state.activeUndo = null;
        });

        Store.state.activeUndo = {
            type,
            data,
            timer,
            toastObj,
            commit: () => {
                clearTimeout(timer);
                performCommit();
            }
        };
    };

    static commitCurrent = () => {
        if (Store.state.activeUndo) {
            try {
                Store.state.activeUndo.commit();
            } catch (e) {
                console.error("Error committing undo action:", e);
            }
            if (Store.state.activeUndo.toastObj) {
                Store.state.activeUndo.toastObj.cancel();
            }
            Store.state.activeUndo = null;
        }
    };
}

// ==========================================
// 2. YARDIMCI FONKSİYONLAR (DOM & UI Helpers)
// ==========================================
class Utils {
    static getSafeStatusClass = d => !d ? 'status-bekliyor' : d === CONFIG.STATUS.COMPLETED ? 'status-tamamlandi' : d === CONFIG.STATUS.CANCELED ? 'status-iptal' : 'status-bekliyor';
    
    static calcBitisSaati = (saat, sure) => {
        const [h, m] = (saat || '00:00').split(':').map(Number);
        const total = h * 60 + m + (parseInt(sure) || 30);
        return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    };

    static getServiceDuration = h => {
        if(!h) return CONFIG.SERVICES.DEFAULT_MINS;
        const low = h.toLowerCase();
        for (const [key, duration] of Object.entries(CONFIG.SERVICES.MAP)) {
            if (low.includes(key.toLowerCase())) return duration;
        }
        return CONFIG.SERVICES.DEFAULT_MINS;
    };

    static $ = id => document.getElementById(id);
    
    static scheduleUIWork = callback => requestAnimationFrame(callback);

    static getTimeRangeText = (saat, sure) => {
        if (!saat || !saat.includes(':')) return saat || CONFIG.DEFAULTS.TIME;
        const [h, m] = saat.split(':').map(Number);
        const totalMins = h * 60 + m + (sure || 30);
        const endH = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
        const endM = String(totalMins % 60).padStart(2, '0');
        return `${saat}-${endH}:${endM}`;
    };

    static el = (tag, attrs = {}, ...children) => {
        const isSvg = ['svg', 'use', 'path', 'circle', 'line', 'linearGradient', 'stop', 'defs'].includes(tag);
        const e = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
        for (const k in attrs) {
            if (k === 'className') e.className = attrs[k];
            else if (k === 'style') {
                attrs[k].split(';').forEach(rule => {
                    const parts = rule.split(':');
                    const prop = parts.shift();
                    if (prop && parts.length) e.style[prop.trim()] = parts.join(':').trim();
                });
            }
            else if (k.startsWith('on') && typeof attrs[k] === 'function') e[k.toLowerCase()] = attrs[k];
            else e.setAttribute(k, attrs[k]);
        }
        children.forEach(c => {
            if (c != null) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
        });
        return e;
    };

    static createEmptyState = (title, desc, iconSvgStr) => {
        const wrapper = Utils.el('div', { className: 'empty-state-wrapper' });
        const iconWrap = Utils.el('div', { className: 'empty-state-icon' });
        iconWrap.innerHTML = iconSvgStr || '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>';
        const titleEl = Utils.el('div', { className: 'empty-state-title' }, title);
        const descEl = Utils.el('div', { className: 'empty-state-desc' }, desc);
        wrapper.appendChild(iconWrap);
        wrapper.appendChild(titleEl);
        wrapper.appendChild(descEl);
        return wrapper;
    };

    static showToast = (message, type = 'error', duration = CONFIG.TIMERS.TOAST) => {
        const container = Utils.$('toast-container');
        const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
        const toast = Utils.el('div', { className: 'toast toast-' + type },
            Utils.el('span', {}, icon),
            Utils.el('span', {}, message)
        );

        container.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), CONFIG.TIMERS.UI_ANIM);
        }, duration);
    };

    static showUndoToast = (message, onUndo) => {
        const container = Utils.$('toast-container');
        if (!container) return null;
        
        const undoBtn = Utils.el('button', {
            className: 'btn-toast-undo',
            onclick: (e) => {
                e.stopPropagation();
                onUndo();
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), CONFIG.TIMERS.UI_ANIM);
            }
        }, 'Geri Al');

        const toast = Utils.el('div', { className: 'toast toast-warning' },
            Utils.el('span', {}, '⚠️'),
            Utils.el('span', {}, message),
            undoBtn
        );

        container.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });
        
        const timeoutId = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), CONFIG.TIMERS.UI_ANIM);
        }, 5000);
        
        return {
            el: toast,
            cancel: () => {
                clearTimeout(timeoutId);
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), CONFIG.TIMERS.UI_ANIM);
            }
        };
    };
}

const DOM = {
    statToday: Utils.$('statToday'),
    statSuccess: Utils.$('statSuccess'),
    statWaiting: Utils.$('statWaiting'),
    sbName: Utils.$('sbName'),
    sbPhone: Utils.$('sbPhone'),
    sbWarning: Utils.$('sbWarning'),
    sbWarningText: Utils.$('sbWarningText'),
    btnToggleWarning: Utils.$('btnToggleWarning'),
    sbPackageName: Utils.$('sbPackageName'),
    sbSessionCount: Utils.$('sbSessionCount'),
    sbSessionRing: Utils.$('sbSessionRing'),
    sbSessionRingText: Utils.$('sbSessionRingText'),
    sbTotal: Utils.$('sbTotal'),
    sbPaid: Utils.$('sbPaid'),
    sbDebt: Utils.$('sbDebt'),
    sbHistory: Utils.$('sbHistory'),
    sbNoteInput: Utils.$('sbNoteInput'),
    sidebar: Utils.$('patientSidebar'),
    overlay: Utils.$('sidebarOverlay'),
    modalTitleText: Utils.$('modalTitleText'),
    modalSub: Utils.$('modalSub'),
    newDate: Utils.$('newDate'),
    newTime: Utils.$('newTime'),
    addAptModal: Utils.$('addAptModal'),
    aptModal: Utils.$('aptModal'),
    editPatientModal: Utils.$('editPatientModal'),
    dailySuccessRate: Utils.$('dailySuccessRate'),
    viewCalendar: Utils.$('viewCalendar'),
    viewOverview: Utils.$('viewOverview'),
    viewSettings: Utils.$('viewSettings'),
    tabCalendar: Utils.$('tabCalendar'),
    tabOverview: Utils.$('tabOverview'),
    tabSettings: Utils.$('tabSettings'),
    overviewKpiGrid: Utils.$('overviewKpiGrid'),
    setCalStart: Utils.$('setCalStart'),
    setCalEnd: Utils.$('setCalEnd'),
    setSrvList: Utils.$('setSrvList'),
    setUiTheme: Utils.$('setUiTheme'),
    setUiCurrency: Utils.$('setUiCurrency'),
    setColWaiting: Utils.$('setColWaiting'),
    setColCompleted: Utils.$('setColCompleted'),
    setColCanceled: Utils.$('setColCanceled'),
    btnResetColors: Utils.$('btnResetColors'),
    btnSaveSettings: Utils.$('btnSaveSettings'),
    ovFinanceChart: Utils.$('ovFinanceChart'),
    ovTrendChart: Utils.$('ovTrendChart'),
    ovServiceDist: Utils.$('ovServiceDist'),
    ovRecentPatients: Utils.$('ovRecentPatients')
};

class ThemeUtils {
    static applyDynamicTheme = () => {
        let styleEl = document.getElementById('dynamic-theme');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamic-theme';
            const nonceVal = document.getElementById('server-data')?.getAttribute('nonce');
            if (nonceVal) styleEl.setAttribute('nonce', nonceVal);
            document.head.appendChild(styleEl);
        }
        const hexToRgba = (hex, alpha) => {
            hex = hex.replace('#', '');
            if(hex.length === 3) hex = hex.split('').map(c => c+c).join('');
            const r = parseInt(hex.slice(0, 2), 16) || 0;
            const g = parseInt(hex.slice(2, 4), 16) || 0;
            const b = parseInt(hex.slice(4, 6), 16) || 0;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        const prefs = CONFIG.UI_PREFERENCES || {};
        
        if (prefs.theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (prefs.theme === 'light') {
            document.body.classList.remove('dark-theme');
        }
        
        const cols = prefs.colors || CONFIG.COLORS || {};
        const w = cols.WAITING || '#D4AF37';
        const c = cols.COMPLETED || '#728873';
        const x = cols.CANCELED || '#B76E79';
        
        const slotPx = CONFIG.CALENDAR.SLOT_PX || 15;

        styleEl.textContent = `
                /* Light Mode Kart Renkleri */
                .status-bekliyor { background: var(--bg-card) !important; border-left: 3px solid ${w} !important; --status-color: ${w}; }
                .status-tamamlandi { background: var(--bg-card) !important; border-left: 3px solid ${c} !important; --status-color: ${c}; }
                .status-iptal { background: var(--bg-card) !important; border-left: 3px solid ${x} !important; --status-color: ${x}; }

                /* Dark Mode Kart Renkleri - Sleek Floating Style */
                .dark-theme .status-bekliyor { background: var(--bg-card) !important; border-left: 3px solid ${w} !important; --status-color: ${w}; }
                .dark-theme .status-tamamlandi { background: var(--bg-card) !important; border-left: 3px solid ${c} !important; --status-color: ${c}; }
                .dark-theme .status-iptal { background: var(--bg-card) !important; border-left: 3px solid ${x} !important; --status-color: ${x}; }
                
                .dark-theme .status-bekliyor .apt-name, .dark-theme .status-bekliyor .apt-time { color: var(--text-main) !important; }
                .dark-theme .status-tamamlandi .apt-name, .dark-theme .status-tamamlandi .apt-time { color: var(--text-main) !important; }
                .dark-theme .status-iptal .apt-name, .dark-theme .status-iptal .apt-time { color: var(--text-main) !important; }
                
                /* Badges (Service Labels) */
                .dark-theme .status-bekliyor .apt-service { color: ${w}; background: ${hexToRgba(w, 0.15)}; }
                .dark-theme .status-tamamlandi .apt-service { color: ${c}; background: ${hexToRgba(c, 0.15)}; }
                .dark-theme .status-iptal .apt-service { color: ${x}; background: ${hexToRgba(x, 0.15)}; }
                
                /* Glow effects dynamically bound to status colors */
                .apt-card:hover { --glow: 0 0 20px ${hexToRgba(w, 0.0)}; transform: translateY(-2px); z-index: 20; }
                .status-bekliyor:hover { --glow: 0 0 15px ${hexToRgba(w, 0.4)}; border-color: ${hexToRgba(w, 0.5)} !important; border-left-color: ${w} !important; }
                .status-tamamlandi:hover { --glow: 0 0 15px ${hexToRgba(c, 0.4)}; border-color: ${hexToRgba(c, 0.5)} !important; border-left-color: ${c} !important; }
                .status-iptal:hover { --glow: 0 0 15px ${hexToRgba(x, 0.4)}; border-color: ${hexToRgba(x, 0.5)} !important; border-left-color: ${x} !important; }
            `;
    };

    static isUserInteracting = () => {
        const hasDragging = document.querySelector('.is-dragging') !== null;
        const hasResizing = document.body.style.cursor === 'ns-resize';
        const hasDragMode = document.body.classList.contains('drag-mode');
        const isAptModalOpen = !DOM.aptModal.classList.contains('hidden');
        const isAddModalOpen = !DOM.addAptModal.classList.contains('hidden');
        const isEditModalOpen = !DOM.editPatientModal.classList.contains('hidden');
        const isSidebarOpen = document.body.classList.contains('sidebar-active');
        return hasDragging || hasResizing || hasDragMode || isAptModalOpen || isAddModalOpen || isEditModalOpen || isSidebarOpen;
    }
}

// ==========================================
// 2.4 HOVER POPUP (Tooltip)
// ==========================================
class HoverPopupManager {
    static timer = null;
    static currentApp = null;
    static isVisible = false;

    static handleMouseEnter = (e, app) => {
        if (ThemeUtils.isUserInteracting()) return;
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
            Utils.el('div', { className: 'hp-name' }, app.ad_soyad || CONFIG.DEFAULTS.NAME),
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

// ==========================================
// 2.5 TAKVİM MOTORU (Calendar Engine)
// ==========================================
class Calendar {
    static getDetailedDatesOfWeek = base => {
        const d = new Date(base);
        const day = d.getDay();
        const mon = new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)));
        return Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(mon);
            dt.setDate(mon.getDate() + i);
            return {
                iso: dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'),
                day: dt.getDate(),
                monthName: dt.toLocaleString(CONFIG.LOCALE, { month: 'long' }),
                year: dt.getFullYear(),
                isToday: new Date().toDateString() === dt.toDateString()
            };
        });
    };

    static getDetailedDatesOfMonth = base => {
        const d = new Date(base);
        const year = d.getFullYear();
        const month = d.getMonth();
        const firstDay = new Date(year, month, 1);
        
        let start = new Date(firstDay);
        const dayOfWeek = start.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        start.setDate(start.getDate() - diff);
        
        return Array.from({ length: 42 }, (_, i) => {
            const dt = new Date(start);
            dt.setDate(start.getDate() + i);
            return {
                iso: dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'),
                day: dt.getDate(),
                monthName: dt.toLocaleString(CONFIG.LOCALE, { month: 'long' }),
                year: dt.getFullYear(),
                isToday: new Date().toDateString() === dt.toDateString(),
                isCurrentMonth: dt.getMonth() === month
            };
        });
    };

    static generateTimeColumn = (startHour, endHour) => {
        const col = Utils.el('div', { className: 'hour-col' }, Utils.el('div', { className: 'hour-col-header' }));
        for (let h = startHour; h <= endHour; h++) {
            col.appendChild(Utils.el('div', { className: 'hour-label' }, h.toString().padStart(2, '0') + ':00'));
        }
        return col;
    };

    static createAppointmentCard = (app) => {
        const duration = app.sure || Utils.getServiceDuration(app.hizmet);
        const slotsCount = duration / CONFIG.CALENDAR.SLOT_MINS;
        const heightStr = `calc(${slotsCount * 100}% - 2px)`;
        const shortClass = duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '';
        const statusClass = Utils.getSafeStatusClass(app.durum);

        let seansText = '';
        if (app.toplam_seans > 0 && duration > 30) {
            seansText = ' (' + (app.gelinen_seans || 0) + '/' + app.toplam_seans + ')';
        }
        const cardName = (app.ad_soyad || CONFIG.DEFAULTS.NAME) + seansText;

        // Seans İlerleme Çubuğu (Mini Progress Bar)
        let cardProgress = null;
        if (app.toplam_seans > 0 && duration > 45) {
            const perc = Math.min(100, Math.round(((app.gelinen_seans || 0) / app.toplam_seans) * 100));
            cardProgress = Utils.el('div', { className: 'apt-card-progress-bar', title: `Seans İlerlemesi: ${app.gelinen_seans || 0}/${app.toplam_seans}` },
                Utils.el('div', { className: 'apt-card-progress-fill', style: 'width: ' + perc + '%;' })
            );
        }

        const card = Utils.el('div', { 
            id: 'card-' + (app.randevu_id || app.id), 
            className: 'apt-card ' + statusClass + shortClass,
            style: 'height:' + heightStr + ';',
            'data-duration': duration,
            ondragstart: () => false,
            onclick: () => AppointmentManager.openAptModal(app.randevu_id || app.id),
            onmouseenter: (e) => HoverPopupManager.handleMouseEnter(e, app),
            onmouseleave: (e) => HoverPopupManager.handleMouseLeave(e),
            onmousemove: (e) => HoverPopupManager.handleMouseMove(e)
        },
            Utils.el('div', { className: 'apt-name' }, cardName),
            Utils.el('div', { className: 'apt-meta' },
                Utils.el('span', { className: 'apt-time' }, Utils.getTimeRangeText(app.saat, duration)),
                Utils.el('span', { className: 'apt-service' }, app.hizmet || CONFIG.DEFAULTS.SERVICE)
            ),
            cardProgress,
            Utils.el('div', { className: 'resize-handle', title: CONFIG.UI.TOOLTIP_RESIZE }, '=')
        );
        Calendar.updateCardActions(card, app.randevu_id || app.id, app.durum);
        return card;
    };

    static updateCardActions = (card, id, durum) => {
        if (!card) return;
        let actions = card.querySelector('.apt-card-actions');
        if (actions) actions.remove();
    };

    static renderCalendarShell = (weekData, selectedStr) => {
        const grid = document.querySelector('.calendar-grid');
        if (!grid) return;
        
        const fragment = document.createDocumentFragment();
        fragment.appendChild(Calendar.generateTimeColumn(CONFIG.CALENDAR.START_HOUR, CONFIG.CALENDAR.END_HOUR));
        
        weekData.forEach(dObj => {
            const jsDay = new Date(dObj.iso).getDay();
            const trIndex = jsDay === 0 ? 6 : jsDay - 1;
            const dayName = CONFIG.CALENDAR.DAYS[trIndex] || '';

            const dayColClass = 'day-col' + (dObj.iso === selectedStr ? ' focus-day' : '');
            const dayCol = Utils.el('div', { className: dayColClass },
                Utils.el('div', { className: 'day-col-header' },
                    Utils.el('div', { className: 'day-name-label' }, dayName),
                    Utils.el('div', { className: 'day-number-label' + (dObj.isToday ? ' today' : '') }, dObj.day)
                )
            );

            for (let h = CONFIG.CALENDAR.START_HOUR; h <= CONFIG.CALENDAR.END_HOUR; h++) {
                for (let m = 0; m < 60; m += CONFIG.CALENDAR.SLOT_MINS) {
                    const timeStr = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
                    dayCol.appendChild(Utils.el('div', { 
                        className: 'drop-zone' + (m === 0 ? ' hour-top' : ''), 
                        'data-date': dObj.iso, 
                        'data-time': timeStr 
                    }));
                }
            }
            fragment.appendChild(dayCol);
        });
        grid.replaceChildren(fragment);
    };

    static renderMonthCalendar = (grid, apps, selectedStr) => {
        const monthDates = Calendar.getDetailedDatesOfMonth(selectedStr);
        const fragment = document.createDocumentFragment();
        
        const container = Utils.el('div', { className: 'month-grid' });
        
        CONFIG.CALENDAR.DAYS.forEach(d => {
            container.appendChild(Utils.el('div', { className: 'month-day-header-cell' }, d));
        });
        
        monthDates.forEach(dObj => {
            const cellClass = 'month-day-cell' + (!dObj.isCurrentMonth ? ' other-month' : '') + (dObj.isToday ? ' is-today' : '');
            
            const cellApps = apps.filter(a => a.tarih === dObj.iso);
            let countEl = null;
            let dotsEl = null;
            
            if (cellApps.length > 0) {
                countEl = Utils.el('div', { className: 'month-density-count' }, cellApps.length + ' Randevu');
                dotsEl = Utils.el('div', { className: 'month-density-dots' });
                
                cellApps.slice(0, 8).forEach(a => {
                    let stClass = 'wait';
                    if (a.durum === CONFIG.STATUS.COMPLETED) stClass = 'comp';
                    if (a.durum === CONFIG.STATUS.CANCELED) stClass = 'canc';
                    dotsEl.appendChild(Utils.el('div', { className: 'density-dot ' + stClass }));
                });
                if (cellApps.length > 8) {
                    dotsEl.appendChild(Utils.el('div', { className: 'density-dot', style: 'background: transparent; font-size: 8px; line-height: 8px; width: auto;' }, '+' + (cellApps.length - 8)));
                }
            }
            
            const densityContainer = Utils.el('div', { className: 'month-density-container' }, countEl, dotsEl);
            
            const cell = Utils.el('div', { 
                className: cellClass,
                onclick: () => {
                    Store.state.calendarViewMode = 'day';
                    const activeBtn = document.querySelector('.view-toggle-btn.active');
                    if (activeBtn) activeBtn.classList.remove('active');
                    if (Utils.$('btnViewDay')) Utils.$('btnViewDay').classList.add('active');
                    CalendarNav.loadCalendarRange(dObj.iso);
                }
            },
                Utils.el('div', { className: 'month-day-number' }, dObj.day),
                densityContainer
            );
            container.appendChild(cell);
        });
        
        fragment.appendChild(container);
        grid.replaceChildren(fragment);
        
        Store.state.renderedWeekKey = monthDates[0].iso + '_' + selectedStr + '_month';
        
        const subtitle = document.querySelector('.header-brand .subtitle');
        if (subtitle) {
            const d = new Date(selectedStr);
            subtitle.textContent = d.toLocaleString(CONFIG.LOCALE, { month: 'long', year: 'numeric' });
        }
    };

    static renderCalendar = () => {
        const grid = document.querySelector('.calendar-grid');
        if (!grid) return;
        
        const apps = Object.values(Store.state.appointments);
        const selectedStr = Store.state.currentViewDate;
        const viewMode = Store.state.calendarViewMode || 'week';
        
        grid.className = 'calendar-grid' + (viewMode === 'day' ? ' day-view-mode' : '') + (viewMode === 'month' ? ' month-view-mode' : '');
        
        if (viewMode === 'month') {
            Calendar.renderMonthCalendar(grid, apps, selectedStr);
            return;
        }

        const currentWeek = Calendar.getDetailedDatesOfWeek(selectedStr);
        const weekKey = currentWeek[0].iso + '_' + selectedStr + '_' + viewMode;

        if (Store.state.renderedWeekKey !== weekKey) {
            const dataToRender = viewMode === 'day' 
                ? currentWeek.filter(d => d.iso === selectedStr) 
                : currentWeek;
            Calendar.renderCalendarShell(dataToRender, selectedStr);
            Store.state.renderedWeekKey = weekKey;
            const subtitle = document.querySelector('.header-brand .subtitle');
            if (subtitle) {
                if (viewMode === 'day') {
                    const activeDay = currentWeek.find(d => d.iso === selectedStr);
                    subtitle.textContent = activeDay.day + ' ' + activeDay.monthName + ' ' + activeDay.year;
                } else {
                    const start = currentWeek[0], end = currentWeek[6];
                    let dateText = start.day + ' - ' + end.day + ' ' + end.monthName + ' ' + end.year;
                    if (start.year !== end.year) {
                        dateText = start.day + ' ' + start.monthName + ' ' + start.year + ' - ' + end.day + ' ' + end.monthName + ' ' + end.year;
                    } else if (start.monthName !== end.monthName) {
                        dateText = start.day + ' ' + start.monthName + ' - ' + end.day + ' ' + end.monthName + ' ' + end.year;
                    }
                    subtitle.textContent = dateText;
                }
            }
        }

        const zones = grid.querySelectorAll('.drop-zone');
        zones.forEach(z => z.replaceChildren());

        let cardIndex = 0;
        apps.forEach(app => {
            const zone = grid.querySelector('.drop-zone[data-date="' + app.tarih + '"][data-time="' + app.saat + '"]');
            if (zone) {
                const card = Calendar.createAppointmentCard(app);
                card.style.animation = 'slideUpFadeIn 0.4s ease-out ' + (cardIndex * 0.05) + 's both';
                card.addEventListener('animationend', () => {
                    card.style.animation = '';
                }, { once: true });
                zone.appendChild(card);
                cardIndex++;
            }
        });

        Calendar.adjustOverlapPositions();
        Calendar.updateNowIndicator();
    }

    static adjustOverlapPositions = () => {
        const grid = document.querySelector('.calendar-grid');
        if (!grid) return;

        const appsByDate = {};
        Object.values(Store.state.appointments).forEach(app => {
            if (!app.tarih) return;
            if (!appsByDate[app.tarih]) appsByDate[app.tarih] = [];
            appsByDate[app.tarih].push(app);
        });

        Object.keys(appsByDate).forEach(dateStr => {
            const dayApps = appsByDate[dateStr];
            
            dayApps.sort((a, b) => {
                const aStart = a.saat || '00:00';
                const bStart = b.saat || '00:00';
                if (aStart !== bStart) return aStart.localeCompare(bStart);
                const aDur = a.sure || Utils.getServiceDuration(a.hizmet);
                const bDur = b.sure || Utils.getServiceDuration(b.hizmet);
                return bDur - aDur;
            });

            const parsed = dayApps.map(app => {
                const duration = app.sure || Utils.getServiceDuration(app.hizmet);
                const [h, m] = (app.saat || '00:00').split(':').map(Number);
                const start = h * 60 + m;
                const end = start + duration;
                return { app, start, end, col: -1, totalCols: 1 };
            });

            const clusters = [];
            parsed.forEach(item => {
                let targetCluster = null;
                for (let i = 0; i < clusters.length; i++) {
                    const cluster = clusters[i];
                    const maxEnd = Math.max(...cluster.map(c => c.end));
                    if (item.start < maxEnd) {
                        targetCluster = cluster;
                        break;
                    }
                }
                if (targetCluster) {
                    targetCluster.push(item);
                } else {
                    clusters.push([item]);
                }
            });

            clusters.forEach(cluster => {
                const columns = [];
                cluster.forEach(item => {
                    let placed = false;
                    for (let i = 0; i < columns.length; i++) {
                        if (columns[i] <= item.start) {
                            item.col = i;
                            columns[i] = item.end;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        item.col = columns.length;
                        columns.push(item.end);
                    }
                });

                cluster.forEach(item => {
                    item.totalCols = columns.length;
                });
            });

            parsed.forEach(item => {
                const cardId = 'card-' + (item.app.randevu_id || item.app.id);
                const card = document.getElementById(cardId);
                if (card) {
                    if (item.totalCols > 1) {
                        card.style.left = 'calc((100% / ' + item.totalCols + ') * ' + item.col + ' + 2px)';
                        card.style.width = 'calc((100% / ' + item.totalCols + ') - 4px)';
                        card.style.right = 'auto';
                    } else {
                        card.style.left = '';
                        card.style.width = '';
                        card.style.right = '';
                    }
                }
            });
        });
    };

    static updateNowIndicator = () => {
        const grid = document.querySelector('.calendar-grid');
        if (!grid) return;
        grid.querySelectorAll('.now-indicator').forEach(el => el.remove());
        const todayStr = DateUtils.getTodayLocalISO();
        const todayZone = grid.querySelector('.drop-zone[data-date="' + todayStr + '"]');
        if (!todayZone) return;
        const todayCol = todayZone.closest('.day-col');
        if (!todayCol) return;
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMins = hours * 60 + minutes;
        const startMins = CONFIG.CALENDAR.START_HOUR * 60;
        const endMins = (CONFIG.CALENDAR.END_HOUR + 1) * 60;
        if (totalMins >= startMins && totalMins < endMins) {
            const ratio = (totalMins - startMins) / (endMins - startMins);
            const indicator = Utils.el('div', { className: 'now-indicator' });
            indicator.style.top = 'calc(40px + (100% - 40px) * ' + ratio + ')';
            todayCol.appendChild(indicator);
        }
    };
}

// ==========================================
// 3. API YÖNETİMİ (API Handlers)
// ==========================================
class ApiService {
    static call = async (endpoint, options = {}) => {
        const { payload = null, method = 'POST', loadingId = null, reloadOnSuccess = false, returnData = false, isText = false, signal = null, customErrorMsg = CONFIG.UI.MSG_API_ERROR } = options;
        
        const currentToken = localStorage.getItem('user_token');
        const tenantId = localStorage.getItem('tenant_id');
        
        if (!currentToken || !tenantId) {
            Store.state.isAuthenticated = false;
            Utils.showToast('Oturum bulunamadı! Lütfen giriş yapın.', 'error', 8000);
            setTimeout(() => window.location.href = 'login.html', 1000);
            return null;
        }

        if (loadingId) Utils.$(loadingId).classList.remove('hidden');

        const controller = new AbortController();
        const timeoutTime = (CONFIG.TIMERS && CONFIG.TIMERS.API_TIMEOUT) ? CONFIG.TIMERS.API_TIMEOUT : 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutTime);

        try {
            const fetchOpts = { 
                method, 
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-api-key': currentToken, 
                    'Authorization': 'Bearer ' + currentToken,
                    'x-tenant-id': tenantId
                } 
            };
            if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) fetchOpts.body = JSON.stringify(payload);
            
            if (signal && window.AbortSignal && AbortSignal.any) {
                fetchOpts.signal = AbortSignal.any([signal, controller.signal]);
            } else if (signal) {
                fetchOpts.signal = signal;
            } else {
                fetchOpts.signal = controller.signal;
            }

            const res = await fetch(CONFIG.API_BASE + endpoint, fetchOpts);
            clearTimeout(timeoutId);

            const resText = await res.text().catch(() => '');

            if (!res.ok) {
                if (res.status === 401 || res.status === 403 || resText.includes('API Token geçersiz') || resText.includes('Yetkisiz')) {
                    Store.state.isAuthenticated = false;
                    Utils.showToast('Oturum süresi doldu! Güvenliğiniz için yönlendiriliyorsunuz.', 'error', 8000);
                    localStorage.removeItem('user_token');
                    localStorage.removeItem('tenant_id');
                    setTimeout(() => window.location.href = 'login.html', 1000);
                    return null;
                }
                throw new Error('HTTP_ERROR');
            }
            
            let parsedData = null;
            if (resText) {
                try { parsedData = JSON.parse(resText); } catch(e) {}
            }
            
            if (parsedData && typeof parsedData === 'object' && parsedData.error) {
                console.error('Backend Error:', parsedData.error);
                throw new Error(typeof parsedData.error === 'string' ? parsedData.error : 'Backend Hatası');
            }

            if (reloadOnSuccess) location.reload();
            if (returnData) return isText ? resText : (parsedData || {});
            return true;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                if (loadingId) Utils.$(loadingId).classList.add('hidden');
                if (customErrorMsg) Utils.showToast('Bağlantı zaman aşımına uğradı. Lütfen internetinizi kontrol edin.', 'error');
                return null;
            }
            if (loadingId) Utils.$(loadingId).classList.add('hidden');
            
            const errorMsg = (e.message && e.message !== 'HTTP_ERROR' && e.message !== 'Failed to fetch') 
                ? e.message 
                : customErrorMsg;
                
            if (errorMsg) Utils.showToast(errorMsg, 'error');
            return false;
        }
    }
}

// ==========================================
// 4. FORM VE MODAL MANTIĞI (Form & Modal Handlers)
// ==========================================
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

// ==========================================
// 5. GÜNLÜK AJANDA VE İSTATİSTİKLER (Dashboard Panel)
// ==========================================
class Dashboard {
    static renderDailyAgenda = () => {
        const agendaList = Utils.$('dailyAgendaList');
        if (!agendaList) return;

        const todayStr = DateUtils.getTodayLocalISO();
        const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
        const [iHour, iMin] = fmt.format(new Date()).split(':').map(Number);
        const currentMinutes = iHour * 60 + iMin;

        const todaysApps = Object.values(Store.state.appointments)
            .filter(a => a.tarih === todayStr)
            .sort((a, b) => (a.saat || '00:00').localeCompare(b.saat || '00:00'));

        if (todaysApps.length === 0) {
            const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>';
            agendaList.replaceChildren(Utils.createEmptyState('Harika!', CONFIG.UI.MSG_AGENDA_EMPTY, svg));
            return;
        }

        let nextFound = false;
        const agendaFragment = document.createDocumentFragment();
        todaysApps.forEach(app => {
            const [hours, minutes] = (app.saat || '00:00').split(':').map(Number);
            const appMinutes = hours * 60 + minutes;

            let statusClass = '';
            if (app.durum === CONFIG.STATUS.COMPLETED || app.durum === CONFIG.STATUS.CANCELED) {
                statusClass = 'is-past';
            } else if (!nextFound && appMinutes >= currentMinutes - CONFIG.CALENDAR.SLOT_MINS) {
                statusClass = 'is-next';
                nextFound = true;
            } else if (appMinutes < currentMinutes) {
                statusClass = 'is-past';
            }
            const statusColor = app.durum === CONFIG.STATUS.WAITING ? CONFIG.COLORS.WAITING : app.durum === CONFIG.STATUS.COMPLETED ? CONFIG.COLORS.COMPLETED : CONFIG.COLORS.CANCELED;
            const duration = app.sure || Utils.getServiceDuration(app.hizmet);
            const item = Utils.el('div', { className: 'agenda-item ' + statusClass, onclick: () => AppointmentManager.openAptModal(app.randevu_id) },
                Utils.el('div', { className: 'agenda-time' }, Utils.getTimeRangeText(app.saat, duration)),
                Utils.el('div', { className: 'agenda-details' },
                    Utils.el('div', { className: 'agenda-name' }, app.ad_soyad || CONFIG.DEFAULTS.NAME),
                    Utils.el('div', { className: 'agenda-service' },
                        (app.hizmet || CONFIG.DEFAULTS.SERVICE) + ' • ',
                        Utils.el('span', { style: 'color:' + statusColor }, app.durum)
                    )
                )
            );
            agendaFragment.appendChild(item);
        });
        agendaList.replaceChildren(agendaFragment);
    };

    static switchMainTab = async (tabName) => {
        if (Store.state.activeMainTab === tabName) return;
        Store.state.activeMainTab = tabName;
        
        DOM.tabCalendar.classList.toggle('active', tabName === 'calendar');
        DOM.tabOverview.classList.toggle('active', tabName === 'overview');
        DOM.tabSettings.classList.toggle('active', tabName === 'settings');
        
        DOM.viewCalendar.classList.add('hidden');
        DOM.viewOverview.classList.add('hidden');
        DOM.viewSettings.classList.add('hidden');

        if (tabName === 'calendar') {
            DOM.viewCalendar.classList.remove('hidden');
        } else if (tabName === 'overview') {
            DOM.viewOverview.classList.remove('hidden');
            if (!Store.state.overviewData) await Dashboard.loadOverviewData();
        } else if (tabName === 'settings') {
            DOM.viewSettings.classList.remove('hidden');
        }
    };

    static drawFinanceChart = (paid, debt, total) => {
        if (total <= 0) return '<div class="text-empty-state">Finansal veri bulunmamaktadır.</div>';
        const pRatio = paid / total;
        const dRatio = debt / total;
        const circ = 2 * Math.PI * 50; // ~314.16
        const pStroke = pRatio * circ;
        const dStroke = dRatio * circ;
        const pOffset = 0;
        const dOffset = -pStroke;
        const pPerc = Math.round(pRatio * 100);
        
        let pCircle = '';
        if (pStroke > 0) {
            pCircle = '<circle class="doughnut-segment" cx="75" cy="75" r="50" stroke="var(--sage)" stroke-dasharray="' + pStroke + ' ' + circ + '" stroke-dashoffset="' + pOffset + '"></circle>';
        }
        let dCircle = '';
        if (dStroke > 0) {
            dCircle = '<circle class="doughnut-segment" cx="75" cy="75" r="50" stroke="var(--rose)" stroke-dasharray="' + dStroke + ' ' + circ + '" stroke-dashoffset="' + dOffset + '"></circle>';
        }
        
        return '<div class="doughnut-container">' +
            '<div style="position:relative; display:flex; align-items:center; justify-content:center;">' +
                '<svg class="svg-doughnut" viewBox="0 0 150 150">' +
                    '<circle class="doughnut-bg" cx="75" cy="75" r="50"></circle>' +
                    pCircle +
                    dCircle +
                '</svg>' +
                '<div class="doughnut-center-text">%' + pPerc + '</div>' +
            '</div>' +
            '<div class="chart-legend">' +
                '<div class="legend-item">' +
                    '<div class="legend-color" style="background:var(--sage);"></div>' +
                    '<div class="flex-1">' +
                        '<div class="font-bold">' + CONFIG.LABELS.PAID_AMOUNT + '</div>' +
                        '<div class="text-muted">' + paid + ' ' + CONFIG.DEFAULTS.CURRENCY + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="legend-item">' +
                    '<div class="legend-color" style="background:var(--rose);"></div>' +
                    '<div class="flex-1">' +
                        '<div class="font-bold">' + CONFIG.LABELS.REMAINING_DEBT + '</div>' +
                        '<div class="text-muted">' + debt + ' ' + CONFIG.DEFAULTS.CURRENCY + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    };

    static drawTrendChart = () => {
        const selectedStr = Store.state.currentViewDate;
        const currentWeek = Calendar.getDetailedDatesOfWeek(selectedStr);
        const apps = Object.values(Store.state.appointments);
        
        const counts = currentWeek.map(day => apps.filter(a => a.tarih === day.iso).length);
        
        const maxVal = Math.max(...counts, 4);
        const width = 450, height = 150;
        const paddingLeft = 30, paddingRight = 15, paddingTop = 20, paddingBottom = 25;
        
        const plotWidth = width - paddingLeft - paddingRight;
        const plotHeight = height - paddingTop - paddingBottom;
        
        const points = counts.map((c, i) => {
            const x = paddingLeft + (i / 6) * plotWidth;
            const y = height - paddingBottom - (c / maxVal) * plotHeight;
            return { x, y, count: c, label: currentWeek[i].day + ' ' + CONFIG.CALENDAR.DAYS[i] };
        });
        
        // Pürüzsüz Bezier Eğrisi (Smooth Cubic Spline)
        let linePath = 'M ' + points[0].x + ' ' + points[0].y;
        for (let i = 0; i < points.length - 1; i++) {
            const pStart = points[i];
            const pEnd = points[i+1];
            const cp1x = pStart.x + (pEnd.x - pStart.x) / 2;
            const cp1y = pStart.y;
            const cp2x = pStart.x + (pEnd.x - pStart.x) / 2;
            const cp2y = pEnd.y;
            linePath += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + pEnd.x + ' ' + pEnd.y;
        }
        
        const areaPath = linePath + ' L ' + points[6].x + ' ' + (height - paddingBottom) + ' L ' + points[0].x + ' ' + (height - paddingBottom) + ' Z';
        
        const gridLines = Array.from({ length: 4 }, (_, i) => {
            const y = paddingTop + (i / 3) * plotHeight;
            const val = Math.round(maxVal - (i / 3) * maxVal);
            return '<line class="chart-grid" x1="' + paddingLeft + '" y1="' + y + '" x2="' + (width - paddingRight) + '" y2="' + y + '"></line>' +
                '<text class="chart-text" x="' + (paddingLeft - 10) + '" y="' + (y + 3) + '" style="text-anchor: end; font-size: 8px;">' + val + '</text>';
        }).join('');
        
        const dotsAndLabels = points.map((p, i) => {
            const countText = p.count > 0 ? p.count : '';
            return '<circle class="chart-dot" cx="' + p.x + '" cy="' + p.y + '" data-count="' + p.count + '" data-label="' + p.label + '"></circle>' +
                '<text class="chart-text" x="' + p.x + '" y="' + (height - 5) + '">' + CONFIG.CALENDAR.DAYS[i] + '</text>' +
                '<text class="chart-text font-bold" x="' + p.x + '" y="' + (p.y - 8) + '" style="font-size: 9px; fill: var(--accent-hover);">' + countText + '</text>';
        }).join('');
        
        return '<svg class="svg-chart" viewBox="0 0 ' + width + ' ' + height + '">' +
            '<defs>' +
                '<linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">' +
                    '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"></stop>' +
                    '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"></stop>' +
                '</linearGradient>' +
            '</defs>' +
            gridLines +
            '<path class="chart-area" d="' + areaPath + '"></path>' +
            '<path class="chart-line" d="' + linePath + '"></path>' +
            dotsAndLabels +
        '</svg>';
    };

    static animateCount = (el, start, end, duration, prefix = '', suffix = '') => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3); // cubic ease out
            const current = Math.floor(easeProgress * (end - start) + start);
            el.textContent = prefix + current.toLocaleString('tr-TR') + suffix;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                el.textContent = prefix + end.toLocaleString('tr-TR') + suffix;
            }
        };
        window.requestAnimationFrame(step);
    };

    static renderOverview = () => {
        const d = Store.state.overviewData;
        if (!d) return;

        const kpiFrag = document.createDocumentFragment();
        const kpis = [
            { label: CONFIG.LABELS.OV_TOTAL_PATIENT, rawVal: d.total_clients || 0, prefix: '', suffix: '', icon: '👥', delta: d.delta_clients },
            { label: CONFIG.LABELS.OV_TOTAL_APT, rawVal: d.total_appointments || 0, prefix: '', suffix: '', icon: '📅', delta: d.delta_appointments },
            { label: CONFIG.LABELS.OV_TOTAL_REV, rawVal: d.total_revenue || 0, prefix: '', suffix: ' ' + CONFIG.DEFAULTS.CURRENCY, icon: '💰', delta: d.delta_revenue },
            { label: CONFIG.LABELS.OV_SUCCESS_RATE, rawVal: d.success_rate || 0, prefix: '%', suffix: '', icon: '⭐', badge: 'success', delta: d.delta_success_rate }
        ];
        
        kpis.forEach((kpi, i) => {
            const valEl = Utils.el('span', {}, kpi.prefix + '0' + kpi.suffix);
            
            let deltaEl = null;
            if (kpi.delta !== undefined && kpi.delta !== null) {
                const isPos = kpi.delta >= 0;
                const sign = isPos ? '+' : '';
                const deltaClass = isPos ? 'delta-badge delta-pos' : 'delta-badge delta-neg';
                const deltaIcon = isPos ? '↑' : '↓';
                deltaEl = Utils.el('span', { className: deltaClass }, deltaIcon + ' ' + sign + kpi.delta + '%');
            }
            
            const valContainer = Utils.el('div', { className: 'stat-value flex-align-center gap-8' }, valEl);
            if (deltaEl) valContainer.appendChild(deltaEl);

            const cardContent = Utils.el('div', { className: 'flex-1 flex-col' },
                Utils.el('div', { className: 'stat-label' }, kpi.label),
                valContainer
            );

            const card = Utils.el('div', { className: 'glass stat-card' + (kpi.badge ? ' card-success-border' : ''), style: 'animation-delay: ' + (i * 0.1) + 's' },
                cardContent,
                Utils.el('div', { className: 'stat-icon-wrapper' }, kpi.icon)
            );
            kpiFrag.appendChild(card);
            
            // Sayma animasyonunu tetikle
            setTimeout(() => {
                Dashboard.animateCount(valEl, 0, kpi.rawVal, 1200, kpi.prefix, kpi.suffix);
            }, 50 + i * 80);
        });
        DOM.overviewKpiGrid.replaceChildren(kpiFrag);

        const totalRev = d.total_revenue || 0;
        const totalPaid = d.total_paid || 0;
        const debt = d.total_debt || 0;
        
        const financeChartContainer = Utils.$('ovFinanceChart');
        if (financeChartContainer) {
            financeChartContainer.innerHTML = Dashboard.drawFinanceChart(totalPaid, debt, totalRev);
        }
        
        const trendChartContainer = DOM.ovTrendChart;
        if (trendChartContainer) {
            trendChartContainer.innerHTML = Dashboard.drawTrendChart();
        }

        if (d.service_distribution && d.service_distribution.length > 0) {
            const maxCount = Math.max(...d.service_distribution.map(s => s.count));
            const distFrag = document.createDocumentFragment();
            d.service_distribution.forEach(s => {
                const perc = (s.count / maxCount) * 100;
                distFrag.appendChild(
                    Utils.el('div', {},
                        Utils.el('div', { className: 'flex-between font-11 font-bold' },
                            Utils.el('span', {}, s.hizmet),
                            Utils.el('span', {}, s.count + ' Adet')
                        ),
                        Utils.el('div', { className: 'progress-track', style: 'margin-top:4px;' },
                            Utils.el('div', { className: 'progress-fill', style: 'width: ' + perc + '%; background: var(--accent-hover);' })
                        )
                    )
                );
            });
            DOM.ovServiceDist.replaceChildren(distFrag);
        } else {
            const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>';
            DOM.ovServiceDist.replaceChildren(Utils.createEmptyState('Grafik Hazırlanıyor', CONFIG.LABELS.OV_NO_DATA, svg));
        }

        if (d.recent_patients && d.recent_patients.length > 0) {
            const patFrag = document.createDocumentFragment();
            d.recent_patients.forEach(p => {
                const dateStr = new Date(p.created_at).toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short' });
                patFrag.appendChild(
                    Utils.el('div', { className: 'ov-recent-item' },
                        Utils.el('div', { className: 'flex-col-gap-8', style: 'gap:2px;' },
                            Utils.el('span', { className: 'font-13 font-bold text-main' }, p.ad_soyad || CONFIG.DEFAULTS.NAME),
                            Utils.el('span', { className: 'font-10 text-muted' }, p.telefon || '')
                        ),
                        Utils.el('span', { className: 'font-11 text-pink font-bold' }, dateStr)
                    )
                );
            });
            DOM.ovRecentPatients.replaceChildren(patFrag);
        } else {
            const svg = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>';
            DOM.ovRecentPatients.replaceChildren(Utils.createEmptyState('Yeni Kayıt Yok', CONFIG.LABELS.OV_NO_DATA, svg));
        }
    };

    static loadOverviewData = async () => {
        try {
            DOM.overviewKpiGrid.replaceChildren(Utils.el('div', { className: 'search-item search-loading-state' }, Utils.el('div', { className: 'spinner spinner-sm' }), CONFIG.UI.LOADER));
            const data = await ApiService.call(CONFIG.ENDPOINTS.GET_OVERVIEW, { method: 'GET', returnData: true, customErrorMsg: null });
            if (!data) throw new Error();
            Store.state.overviewData = Array.isArray(data) ? data[0] : data;
            Dashboard.renderOverview();
        } catch {
            DOM.overviewKpiGrid.replaceChildren(Utils.el('div', { className: 'text-danger p-12' }, CONFIG.UI.MSG_API_ERROR));
        }
    };

    static updateDashboardStats = () => {
        const apps = Object.values(Store.state.appointments);
        
        const todayStr = DateUtils.getTodayLocalISO();
        
        const currentViewDate = new URLSearchParams(window.location.search).get('date') || todayStr;
        const weekDates = Calendar.getDetailedDatesOfWeek(currentViewDate).map(d => d.iso);
        
        let todayCount = 0, waitingCount = 0;
        let weekTotal = 0, weekCompleted = 0;
        let dailyTotal = 0, dailyCompleted = 0;
        
        for (let a of apps) {
            if (a.durum === CONFIG.STATUS.WAITING) waitingCount++;
            
            if (weekDates.includes(a.tarih)) {
                weekTotal++;
                if (a.durum === CONFIG.STATUS.COMPLETED) weekCompleted++;
            }
            
            if (a.tarih === todayStr) {
                todayCount++;
                dailyTotal++;
                if (a.durum === CONFIG.STATUS.COMPLETED) dailyCompleted++;
            }
        }
        
        const weeklyRate = Math.round((weekCompleted / (weekTotal || 1)) * 100);
        const dailyRate = Math.round((dailyCompleted / (dailyTotal || 1)) * 100);

        if (DOM.statToday) DOM.statToday.textContent = todayCount;
        if (DOM.statSuccess) DOM.statSuccess.textContent = '%' + weeklyRate;
        if (DOM.statWaiting) DOM.statWaiting.textContent = waitingCount;
        if (DOM.dailySuccessRate) DOM.dailySuccessRate.textContent = '%' + dailyRate;
        
        const sidebarRecordBadge = document.getElementById('sidebarRecordBadge');
        if (sidebarRecordBadge) sidebarRecordBadge.textContent = apps.length + ' ' + CONFIG.UI.LABEL_RECORD;

        Dashboard.renderDailyAgenda();
    }
}

class SettingsManager {
    static populateSettingsUI = () => {
        if(!DOM.setCalStart) return;
        DOM.setCalStart.value = CONFIG.CALENDAR ? CONFIG.CALENDAR.START_HOUR : 9;
        DOM.setCalEnd.value = CONFIG.CALENDAR ? CONFIG.CALENDAR.END_HOUR : 19;
        
        DOM.setSrvList.value = (CONFIG.SERVICES && CONFIG.SERVICES.LIST) ? CONFIG.SERVICES.LIST.join(', ') : '';
        
        const prefs = CONFIG.UI_PREFERENCES || {};
        DOM.setUiTheme.value = prefs.theme || 'light';
        DOM.setUiCurrency.value = prefs.currency || CONFIG.DEFAULTS.CURRENCY;
        
        const cols = prefs.colors || CONFIG.COLORS || {};
        DOM.setColWaiting.value = cols.WAITING || '#D7B797';
        DOM.setColCompleted.value = cols.COMPLETED || '#829481';
        DOM.setColCanceled.value = cols.CANCELED || '#D38C8C';
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
            MAP: CONFIG.SERVICES.MAP || { 'lazer': 45, 'cilt': 60, 'protez': 90 },
            LIST: DOM.setSrvList.value.split(',').map(s => s.trim()).filter(s => s)
        };
        
        const uiPreferences = {
            theme: DOM.setUiTheme.value,
            currency: DOM.setUiCurrency.value.trim() || '₺',
            colors: {
                WAITING: DOM.setColWaiting.value,
                COMPLETED: DOM.setColCompleted.value,
                CANCELED: DOM.setColCanceled.value,
                ERROR: CONFIG.COLORS.ERROR || '#D38C8C',
                SUCCESS: CONFIG.COLORS.SUCCESS || '#829481',
                WARNING: CONFIG.COLORS.WARNING || '#D7B797'
            }
        };

        const payload = [
            { setting_key: 'calendar', setting_value: calendarSettings },
            { setting_key: 'services', setting_value: servicesSettings },
            { setting_key: 'ui_preferences', setting_value: uiPreferences }
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

// ==========================================
// 6. NOTLAR SİSTEMİ (Notes Engine)
// ==========================================
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

// ==========================================
// 6.5 HASTA DETAY SIDEBAR / DRAWER
// ==========================================
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

        DOM.sbName.textContent = hasta.ad_soyad || CONFIG.DEFAULTS.NAME;
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

// ==========================================
// 6.7 CHART TOOLTIP ENGINE
// ==========================================
class ChartTooltip {
    static tooltipEl = null;
    
    static show = (e, text) => {
        if (!ChartTooltip.tooltipEl) {
            ChartTooltip.tooltipEl = Utils.el('div', { className: 'chart-tooltip' });
            document.body.appendChild(ChartTooltip.tooltipEl);
        }
        ChartTooltip.tooltipEl.textContent = text;
        ChartTooltip.tooltipEl.style.display = 'block';
        ChartTooltip.tooltipEl.style.left = (e.pageX + 10) + 'px';
        ChartTooltip.tooltipEl.style.top = (e.pageY - 25) + 'px';
    };
    
    static hide = () => {
        if (ChartTooltip.tooltipEl) ChartTooltip.tooltipEl.style.display = 'none';
    };
}

// ==========================================
// 7. TAKVİM NAVİGASYONU (Calendar Navigation)
// ==========================================
class CalendarNav {
    static loadCalendarRange = async (targetDate) => {
        if (Store.state.isLoading) return;
        Store.state.isLoading = true;
        
        const navBtns = [Utils.$('btnPrevWeek'), Utils.$('btnToday'), Utils.$('btnNextWeek')];
        navBtns.forEach(btn => { if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; } });
        
        try {
            Store.state.currentViewDate = targetDate;
            Store.state.lastSync = null;
            Store.state.isSilentUpdating = false;
            Store.state.appointments = {};
            Store.state.renderedWeekKey = null;
            
            const grid = document.querySelector('.calendar-grid');
            if (grid) grid.style.opacity = '0.5';
            
            const newUrl = window.location.pathname + '?date=' + targetDate;
            window.history.pushState({ date: targetDate }, '', newUrl);
            await CalendarNav.silentUpdate();
            
            if (grid) grid.style.opacity = '1';
        } finally {
            Store.state.isLoading = false;
            navBtns.forEach(btn => { if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; } });
        }
    };

    static navigateCalendar = dir => {
        const d = new Date(Store.state.currentViewDate);
        const viewMode = Store.state.calendarViewMode || 'week';
        if (viewMode === 'month') {
            d.setMonth(d.getMonth() + dir);
        } else if (viewMode === 'day') {
            d.setDate(d.getDate() + dir);
        } else {
            d.setDate(d.getDate() + (window.innerWidth <= 1024 ? dir : dir * 7));
        }
        CalendarNav.loadCalendarRange(d.toISOString().split('T')[0]);
    };
    
    static goToday = () => CalendarNav.loadCalendarRange(DateUtils.getTodayLocalISO());
    
    static silentUpdate = async () => {
        if (!Store.state.isAuthenticated) return;
        if (document.visibilityState !== 'visible') return;
        if (Store.state.isSilentUpdating) {
            if (Date.now() - Store.state.silentUpdateStart > 15000) {
                Store.state.isSilentUpdating = false; 
            } else {
                return;
            }
        }
        if (ThemeUtils.isUserInteracting()) return;
        
        Store.state.isSilentUpdating = true;
        Store.state.silentUpdateStart = Date.now();
        
        const syncTime = new Date().toISOString();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); 
        try {
            const endpoint = CONFIG.ENDPOINTS.GET_APTS + '?date=' + Store.state.currentViewDate + '&view=' + (Store.state.calendarViewMode || 'week');
            
            const rawData = await ApiService.call(endpoint, {
                payload: { last_sync: Store.state.lastSync },
                signal: controller.signal,
                returnData: true,
                customErrorMsg: null
            });
            clearTimeout(timeoutId);
            
            if (!rawData) throw new Error('Sync failed or aborted');
            
            let hasChanges = false;
            const isDeltaSync = !!Store.state.lastSync;
            
            if (!isDeltaSync) hasChanges = true;

            if (rawData && rawData.length > 0) {
                rawData.forEach(item => {
                    const j = item.json || item;
                    const rId = j.randevu_id || j.id;
                    if (!rId) return;
                    
                    if (Store.state.pendingDeletes && Store.state.pendingDeletes.includes(rId)) {
                        return;
                    }
                    
                    if (j.deleted_at) {
                        if (Store.state.appointments[rId]) {
                            delete Store.state.appointments[rId];
                            const cardEl = document.getElementById('card-' + rId);
                            if (cardEl) cardEl.remove();
                            hasChanges = true;
                        }
                        return;
                    }

                    const oldApp = Store.state.appointments[rId] ? { ...Store.state.appointments[rId] } : null;

                    Store.state.appointments[rId] = {
                        randevu_id: rId,
                        hasta_id: j.hasta_id,
                        ad_soyad: j.ad_soyad || CONFIG.DEFAULTS.NAME,
                        telefon: j.telefon || '',
                        hizmet: (j.hizmet && j.hizmet !== CONFIG.STATUS.WAITING) ? j.hizmet : '',
                        durum: j.durum || CONFIG.STATUS.WAITING,
                        tarih: j.tarih,
                        saat: j.saat ? j.saat.substring(0, 5) : '',
                        sure: parseInt(j.sure) || null,
                        kronik_rahatsizlik: j.kronik_rahatsizlik || '',
                        paket_adi: j.paket_adi || CONFIG.DEFAULTS.PACKAGE,
                        toplam_seans: parseInt(j.toplam_seans) || 0,
                        gelinen_seans: parseInt(j.gelinen_seans) || 0,
                        toplam_tutar: parseFloat(j.toplam_tutar) || 0,
                        alinan_odeme: parseFloat(j.alinan_odeme) || 0
                    };
                    const newApp = Store.state.appointments[rId];

                    if (isDeltaSync) {
                        Utils.scheduleUIWork(() => {
                            const grid = document.querySelector('.calendar-grid');
                            if (!grid) return;
                            const targetZone = grid.querySelector('.drop-zone[data-date="' + newApp.tarih + '"][data-time="' + newApp.saat + '"]');
                            if (!targetZone) return;
                            
                            let cardEl = document.getElementById('card-' + rId);
                            if (!cardEl) {
                                targetZone.appendChild(Calendar.createAppointmentCard(newApp));
                            } else {
                                const isDrag = cardEl.classList.contains('is-dragging');
                                if (!isDrag && (!oldApp || oldApp.tarih !== newApp.tarih || oldApp.saat !== newApp.saat)) {
                                    targetZone.appendChild(cardEl);
                                }
                                const duration = newApp.sure || Utils.getServiceDuration(newApp.hizmet);
                                const heightPx = Math.max((duration / CONFIG.CALENDAR.SLOT_MINS) * CONFIG.CALENDAR.SLOT_PX - 2, CONFIG.CALENDAR.MIN_PX);
                                cardEl.className = 'apt-card ' + Utils.getSafeStatusClass(newApp.durum) + (duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '') + (isDrag ? ' is-dragging' : '');
                                cardEl.style.height = heightPx + 'px';
                                cardEl.dataset.duration = duration;
                                
                                const nameEl = cardEl.querySelector('.apt-name'); 
                                if(nameEl) {
                                    let seansText = '';
                                    if (newApp.toplam_seans > 0 && duration > 30) {
                                        seansText = ' (' + (newApp.gelinen_seans || 0) + '/' + newApp.toplam_seans + ')';
                                    }
                                    nameEl.textContent = newApp.ad_soyad + seansText;
                                }
                                const timeEl = cardEl.querySelector('.apt-time'); if(timeEl) timeEl.textContent = Utils.getTimeRangeText(newApp.saat, duration);
                                const srvEl = cardEl.querySelector('.apt-service'); if(srvEl) srvEl.textContent = newApp.hizmet || CONFIG.DEFAULTS.SERVICE;
                                
                                // Mini progress bar güncelleme
                                let pBar = cardEl.querySelector('.apt-card-progress-bar');
                                if (newApp.toplam_seans > 0 && duration > 45) {
                                    const perc = Math.min(100, Math.round(((newApp.gelinen_seans || 0) / newApp.toplam_seans) * 100));
                                    if (!pBar) {
                                        pBar = Utils.el('div', { className: 'apt-card-progress-bar', title: `Seans İlerlemesi: ${newApp.gelinen_seans || 0}/${newApp.toplam_seans}` },
                                            Utils.el('div', { className: 'apt-card-progress-fill', style: 'width: ' + perc + '%;' })
                                        );
                                        // resize-handle ve action'ların önüne ekle
                                        const resH = cardEl.querySelector('.resize-handle');
                                        cardEl.insertBefore(pBar, resH);
                                    } else {
                                        const fill = pBar.querySelector('.apt-card-progress-fill');
                                        if (fill) fill.style.width = perc + '%';
                                        pBar.title = `Seans İlerlemesi: ${newApp.gelinen_seans || 0}/${newApp.toplam_seans}`;
                                    }
                                } else if (pBar) {
                                    pBar.remove();
                                }
                                
                                // Quick action buttons güncelleme
                                Calendar.updateCardActions(cardEl, rId, newApp.durum);
                            }
                        });
                    }

                    hasChanges = true;
                });
            }

            if (hasChanges) {
                Utils.scheduleUIWork(() => {
                    if (!isDeltaSync) Calendar.renderCalendar();
                    else Calendar.adjustOverlapPositions();
                    Dashboard.updateDashboardStats();
                });
            }
            
            Store.state.lastSync = syncTime;
        } catch (e) {
            console.warn("Veri güncelleme hatası:", e);
        } finally {
            Store.state.isSilentUpdating = false;
        }
    }
}

// ==========================================
// 8. ARAMA MOTORU (Search Engine)
// ==========================================
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

// ==========================================
// 9. SÜRÜKLE & BIRAK VE BOYUTLANDIRMA (Drag & Drop, Resize Engine)
// ==========================================
class DragDrop {
    static activeDragCard = null;
    static originalParent = null;
    static isDragging = false;
    static dragGlobalBlock = false;
    static initialY = 0;
    static startX = 0;
    static startY = 0;
    static lastHoveredZone = null;
    static activeResizeCard = null;
    static initialResizeY = 0;
    static initialHeight = 0;
    static isResizingFramePending = false;

    static init() {
        document.addEventListener('mousedown', DragDrop.onMouseDown);
    }

    static onMouseDown = (e) => {
        if (DragDrop.activeDragCard || DragDrop.activeResizeCard) {
            document.body.style.userSelect = ''; document.body.style.cursor = ''; document.body.classList.remove('drag-mode');
            if (DragDrop.activeDragCard) {
                DragDrop.activeDragCard.classList.remove('is-dragging');
                DragDrop.activeDragCard.style.width = '';
                const duration = parseInt(DragDrop.activeDragCard.dataset.duration) || 30;
                const slotsCount = duration / CONFIG.CALENDAR.SLOT_MINS;
                DragDrop.activeDragCard.style.height = 'calc(' + (slotsCount * 100) + '% - 2px)';
                DragDrop.activeDragCard.style.left = ''; DragDrop.activeDragCard.style.top = '';
                if (DragDrop.originalParent) DragDrop.originalParent.appendChild(DragDrop.activeDragCard);
            }
            DragDrop.activeDragCard = null; DragDrop.originalParent = null; DragDrop.isDragging = false; DragDrop.dragGlobalBlock = false; DragDrop.activeResizeCard = null;
            document.removeEventListener('mousemove', DragDrop.onDragMove); document.removeEventListener('mouseup', DragDrop.onDragEnd);
            document.removeEventListener('mousemove', DragDrop.onResizeMove); document.removeEventListener('mouseup', DragDrop.onResizeEnd);
        }
        const card = e.target.closest('.apt-card');
        if (!card || e.button !== 0) return;
        if (e.target.closest('.resize-handle')) {
            e.preventDefault(); e.stopPropagation();
            DragDrop.activeResizeCard = card; DragDrop.initialResizeY = e.clientY; DragDrop.initialHeight = card.offsetHeight;
            document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
            document.body.classList.add('drag-mode');
            document.addEventListener('mousemove', DragDrop.onResizeMove); document.addEventListener('mouseup', DragDrop.onResizeEnd);
            return;
        }
        
        // Eğer kart aksiyon butonlarından biriyse mousedown başlama
        if (e.target.closest('.apt-card-actions')) return;

        DragDrop.activeDragCard = card; DragDrop.originalParent = card.parentElement;
        const rect = card.getBoundingClientRect();
        DragDrop.initialY = e.clientY - rect.top;
        DragDrop.startX = e.clientX; DragDrop.startY = e.clientY; DragDrop.isDragging = false;
        document.body.style.userSelect = 'none';
        document.body.classList.add('drag-mode');
        document.addEventListener('mousemove', DragDrop.onDragMove);
        document.addEventListener('mouseup', DragDrop.onDragEnd);
    }

    static onResizeMove = e => {
        if (!DragDrop.activeResizeCard) return;
        DragDrop.dragGlobalBlock = true;
        if (!DragDrop.isResizingFramePending) {
            DragDrop.isResizingFramePending = true;
            requestAnimationFrame(() => {
                const deltaY = e.clientY - DragDrop.initialResizeY;
                let newHeight = DragDrop.initialHeight + deltaY;
                if (newHeight < CONFIG.CALENDAR.MIN_PX) newHeight = CONFIG.CALENDAR.MIN_PX;
                
                const blocks = Math.round((newHeight + 2) / CONFIG.CALENDAR.SLOT_PX);
                const snappedHeight = Math.max(1, blocks) * CONFIG.CALENDAR.SLOT_PX - 2;
                DragDrop.activeResizeCard.style.height = snappedHeight + 'px';
                DragDrop.isResizingFramePending = false;
            });
        }
    };

    static onResizeEnd = async e => {
        if (!DragDrop.activeResizeCard) return;
        document.removeEventListener('mousemove', DragDrop.onResizeMove);
        document.removeEventListener('mouseup', DragDrop.onResizeEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.body.classList.remove('drag-mode');
        
        const finalHeight = DragDrop.activeResizeCard.offsetHeight;
        const newDuration = Math.round((finalHeight + 2) / CONFIG.CALENDAR.SLOT_PX) * CONFIG.CALENDAR.SLOT_MINS;
        const rId = DragDrop.activeResizeCard.id.replace('card-', '');
        const app = Store.state.appointments[rId];
        
        const oldSure = app.sure || Utils.getServiceDuration(app.hizmet);
        const oldDate = app.tarih;
        const oldTime = app.saat;
        const oldDurum = app.durum;

        DragDrop.activeResizeCard.dataset.duration = newDuration;
        const tSpan = DragDrop.activeResizeCard.querySelector('.apt-time');
        if (tSpan) tSpan.textContent = Utils.getTimeRangeText(app.saat, newDuration);
        
        if (newDuration <= CONFIG.SERVICES.DEFAULT_MINS) {
            DragDrop.activeResizeCard.classList.add('short-apt');
        } else {
            DragDrop.activeResizeCard.classList.remove('short-apt');
        }
        
        app.sure = newDuration;
        Calendar.adjustOverlapPositions();
        
        const success = await ApiService.call(CONFIG.ENDPOINTS.ACTION, { payload: { id: rId, durum: app.durum, tarih: app.tarih, saat: app.saat, sure: newDuration, bitis_saati: Utils.calcBitisSaati(app.saat, newDuration) }, customErrorMsg: null });
        
        if (success) {
            // Register Undo for resize:
            UndoManager.registerAction('resize', { id: rId, oldDate, oldTime, oldSure, oldDurum },
                // Geri Al
                async () => {
                    const card = document.getElementById('card-' + rId);
                    if (card && app) {
                        card.style.opacity = '0.5';
                        const revertSuccess = await ApiService.call(CONFIG.ENDPOINTS.ACTION, { 
                            payload: { id: rId, durum: oldDurum, tarih: oldDate, saat: oldTime, sure: oldSure, bitis_saati: Utils.calcBitisSaati(oldTime, oldSure) },
                            customErrorMsg: null
                        });
                        if (revertSuccess) {
                            card.style.opacity = '1';
                            app.sure = oldSure;
                            card.dataset.duration = oldSure;
                            card.className = 'apt-card ' + Utils.getSafeStatusClass(oldDurum) + (oldSure <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '');
                            const tSpan = card.querySelector('.apt-time');
                            if (tSpan) tSpan.textContent = Utils.getTimeRangeText(oldTime, oldSure);
                            const slotsCount = oldSure / CONFIG.CALENDAR.SLOT_MINS;
                            card.style.height = 'calc(' + (slotsCount * 100) + '% - 2px)';
                            Calendar.adjustOverlapPositions();
                            Dashboard.updateDashboardStats();
                            Utils.showToast("Süre değişikliği geri alındı.", "success");
                        } else {
                            card.style.opacity = '1';
                            Utils.showToast("Geri alma işlemi başarısız.", "error");
                        }
                    }
                },
                // Onayla
                () => {}
            );
        } else {
            app.sure = oldSure;
            const slotsCount = oldSure / CONFIG.CALENDAR.SLOT_MINS;
            DragDrop.activeResizeCard.style.height = 'calc(' + (slotsCount * 100) + '% - 2px)';
            DragDrop.activeResizeCard.dataset.duration = oldSure;
            if (tSpan) tSpan.textContent = Utils.getTimeRangeText(app.saat, oldSure);
            if (oldSure <= CONFIG.SERVICES.DEFAULT_MINS) {
                DragDrop.activeResizeCard.classList.add('short-apt');
            } else {
                DragDrop.activeResizeCard.classList.remove('short-apt');
            }
            Calendar.adjustOverlapPositions();
        }
        
        DragDrop.activeResizeCard = null;
        setTimeout(() => { DragDrop.dragGlobalBlock = false; }, CONFIG.TIMERS.DRAG_BLOCK);
    };

    static onDragMove = e => {
        if (!DragDrop.activeDragCard) return;
        if (!DragDrop.isDragging) {
            if (Math.abs(e.clientX - DragDrop.startX) > CONFIG.CALENDAR.DRAG_THRES || Math.abs(e.clientY - DragDrop.startY) > CONFIG.CALENDAR.DRAG_THRES) {
                DragDrop.isDragging = true; DragDrop.dragGlobalBlock = true;
                const rect = DragDrop.activeDragCard.getBoundingClientRect();
                DragDrop.activeDragCard.style.width = rect.width + 'px';
                DragDrop.activeDragCard.style.height = rect.height + 'px';
                document.body.appendChild(DragDrop.activeDragCard);
                DragDrop.activeDragCard.classList.add('is-dragging');
            } else return;
        }
        e.preventDefault(); 
        const dayCol = e.target.closest('.day-col');
        if (dayCol) {
            const colRect = dayCol.getBoundingClientRect();
            DragDrop.activeDragCard.style.left = (colRect.left + 2) + 'px'; 
            DragDrop.activeDragCard.style.width = (colRect.width - 4) + 'px'; 
        } else {
            DragDrop.activeDragCard.style.left = (e.clientX - (DragDrop.activeDragCard.offsetWidth / 2)) + 'px';
        }
        DragDrop.activeDragCard.style.top = (e.clientY - DragDrop.initialY) + 'px';
        const rect = DragDrop.activeDragCard.getBoundingClientRect();
        const elemBelowTop = document.elementFromPoint(rect.left + (rect.width / 2), Math.max(1, rect.top));
        const dropZone = elemBelowTop ? elemBelowTop.closest('.drop-zone') : null;
        if (DragDrop.lastHoveredZone && DragDrop.lastHoveredZone !== dropZone) DragDrop.lastHoveredZone.classList.remove('drag-over');
        if (dropZone) { dropZone.classList.add('drag-over'); DragDrop.lastHoveredZone = dropZone; }
    };

    static onDragEnd = async e => {
        if (!DragDrop.activeDragCard) return;
        document.removeEventListener('mousemove', DragDrop.onDragMove); document.removeEventListener('mouseup', DragDrop.onDragEnd);
        document.body.style.userSelect = '';
        document.body.classList.remove('drag-mode');
        if (!DragDrop.isDragging) { DragDrop.activeDragCard = null; return; } 
        DragDrop.activeDragCard.classList.remove('is-dragging');
        DragDrop.activeDragCard.style.width = '';
        const duration = parseInt(DragDrop.activeDragCard.dataset.duration) || 30;
        const slotsCount = duration / CONFIG.CALENDAR.SLOT_MINS;
        DragDrop.activeDragCard.style.height = 'calc(' + (slotsCount * 100) + '% - 2px)';
        DragDrop.activeDragCard.style.left = ''; DragDrop.activeDragCard.style.top = '';
        let dropZone = DragDrop.lastHoveredZone;
        if (DragDrop.lastHoveredZone) { DragDrop.lastHoveredZone.classList.remove('drag-over'); DragDrop.lastHoveredZone = null; }
        if (dropZone && dropZone !== DragDrop.originalParent) {
            const nDate = dropZone.dataset.date, nTime = dropZone.dataset.time;
            if (DateUtils.getAppFakeUTCUnix(nDate, nTime) < DateUtils.getIstanbulUnix()) {
                DragDrop.originalParent.appendChild(DragDrop.activeDragCard);
                Utils.showToast(CONFIG.UI.MSG_PAST_DATE_NOT_ALLOWED, 'warning');
            } else {
                const rId = DragDrop.activeDragCard.id.replace('card-', '');
                const app = Store.state.appointments[rId];
                const oldDate = app.tarih;
                const oldTime = app.saat;
                const oldSure = app.sure || Utils.getServiceDuration(app.hizmet);
                const oldDurum = app.durum;
                
                dropZone.appendChild(DragDrop.activeDragCard);
                app.tarih = nDate; app.saat = nTime;
                const duration = app.sure || Utils.getServiceDuration(app.hizmet);
                const tSpan = DragDrop.activeDragCard.querySelector('.apt-time'); if(tSpan) tSpan.textContent = Utils.getTimeRangeText(nTime, duration);
                Calendar.adjustOverlapPositions();
                
                const isSuccess = await AppointmentManager.silentSync(rId, app.durum, nDate, nTime, DragDrop.activeDragCard, app.sure || Utils.getServiceDuration(app.hizmet));
                
                if (isSuccess) {
                    Dashboard.updateDashboardStats();
                    Calendar.adjustOverlapPositions();
                    
                    UndoManager.registerAction('move', { id: rId, oldDate, oldTime, oldSure, oldDurum },
                        // Geri Al
                        async () => {
                            const card = document.getElementById('card-' + rId);
                            if (card && app) {
                                card.style.opacity = '0.5';
                                const revertSuccess = await AppointmentManager.silentSync(rId, oldDurum, oldDate, oldTime, card, oldSure);
                                if (revertSuccess) {
                                    app.tarih = oldDate;
                                    app.saat = oldTime;
                                    app.sure = oldSure;
                                    app.durum = oldDurum;
                                    card.className = 'apt-card ' + Utils.getSafeStatusClass(oldDurum) + (oldSure <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '');
                                    const tSpan = card.querySelector('.apt-time');
                                    if (tSpan) tSpan.textContent = Utils.getTimeRangeText(oldTime, oldSure);
                                    const targetZone = document.querySelector('.drop-zone[data-date="' + oldDate + '"][data-time="' + oldTime + '"]');
                                    if (targetZone) targetZone.appendChild(card);
                                    Calendar.adjustOverlapPositions();
                                    Dashboard.updateDashboardStats();
                                    Utils.showToast("Taşıma işlemi geri alındı.", "success");
                                } else {
                                    Utils.showToast("Geri alma işlemi başarısız.", "error");
                                }
                            }
                        },
                        // Onayla
                        () => {}
                    );
                } else {
                    app.tarih = oldDate; app.saat = oldTime;
                    if(tSpan) tSpan.textContent = Utils.getTimeRangeText(oldTime, duration);
                    DragDrop.originalParent.appendChild(DragDrop.activeDragCard);
                    Calendar.adjustOverlapPositions();
                }
            }
        } else if (DragDrop.originalParent) DragDrop.originalParent.appendChild(DragDrop.activeDragCard);
        DragDrop.activeDragCard = null; DragDrop.originalParent = null;
        setTimeout(() => { DragDrop.dragGlobalBlock = false; }, 50); 
    };
}

// ==========================================
// 10. RANDEVU YÖNETİCİSİ (Appointment Manager)
// ==========================================
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
        DOM.modalTitleText.textContent = app.ad_soyad; 
        DOM.modalSub.textContent = (app.hizmet || '') + ' | ' + app.telefon; 
        DOM.newDate.min = todayStr;
        DOM.newDate.value = app.tarih; 
        DOM.newTime.value = app.saat;
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
        const statusVal = Utils.$('newStatus').value;
        const todayStr = DateUtils.getTodayLocalISO();
        const app = Store.state.appointments[Store.state.activeAptId], card = Utils.$('card-' + Store.state.activeAptId);
        if (dVal < todayStr) return Utils.showToast(CONFIG.UI.MSG_PAST_DATE_NOT_ALLOWED, "warning");
        Utils.$('modalLoading').classList.remove('hidden');
        if (await AppointmentManager.silentSync(Store.state.activeAptId, statusVal, dVal, tVal, card, app.sure || Utils.getServiceDuration(app.hizmet))) {
            app.tarih = dVal; app.saat = tVal; app.durum = statusVal;
            const duration = app.sure || Utils.getServiceDuration(app.hizmet);
            card.className = 'apt-card ' + Utils.getSafeStatusClass(statusVal) + (duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '');
            Calendar.updateCardActions(card, Store.state.activeAptId, statusVal);
            const tSpan = card.querySelector('.apt-time'); if(tSpan) tSpan.textContent = Utils.getTimeRangeText(tVal, duration);
            const targetZone = document.querySelector('.drop-zone[data-date="' + dVal + '"][data-time="' + tVal + '"]');
            targetZone ? targetZone.appendChild(card) : card.style.display = 'none';
            Dashboard.updateDashboardStats();
            Calendar.adjustOverlapPositions();
            Utils.$('modalLoading').classList.add('hidden'); AppointmentManager.closeModal();
        }
    };

    static silentSync = async (id, status, dVal, tVal, card, sure) => {
        if (!card) return false;
        card.style.opacity = '0.5';
        const success = await ApiService.call(CONFIG.ENDPOINTS.ACTION, { payload: { id, durum: status, tarih: dVal, saat: tVal, bitis_saati: Utils.calcBitisSaati(tVal, sure) }, customErrorMsg: null });
        if (success) {
            card.style.opacity = '1'; return true;
        } else {
            card.style.opacity = '1'; card.style.borderLeftColor = CONFIG.COLORS.ERROR; Utils.$('modalLoading').classList.add('hidden'); Utils.showToast(CONFIG.UI.MSG_SYNC_ERROR, 'error'); return false;
        }
    };

    static quickComplete = async (id) => {
        const app = Store.state.appointments[id];
        if (!app) return;
        const card = Utils.$('card-' + id);
        if (!card) return;
        
        const duration = app.sure || Utils.getServiceDuration(app.hizmet);
        const success = await AppointmentManager.silentSync(id, CONFIG.STATUS.COMPLETED, app.tarih, app.saat, card, duration);
        if (success) {
            app.durum = CONFIG.STATUS.COMPLETED;
            card.className = 'apt-card ' + Utils.getSafeStatusClass(CONFIG.STATUS.COMPLETED) + (duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '');
            Calendar.updateCardActions(card, id, CONFIG.STATUS.COMPLETED);
            Dashboard.updateDashboardStats();
            Utils.showToast('Randevu başarıyla tamamlandı.', 'success');
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
        
        UndoManager.registerAction('delete', { id: rId, app: appCopy, card }, 
            // Geri Al fonksiyonu
            () => {
                Store.state.appointments[rId] = appCopy;
                if (card) card.style.display = '';
                Store.state.pendingDeletes = Store.state.pendingDeletes.filter(id => id !== rId);
                Dashboard.updateDashboardStats();
                Calendar.adjustOverlapPositions();
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

// ==========================================
// 11. UYGULAMA BAŞLATICI (Bootstrapper)
// ==========================================
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
            card.className = 'apt-card ' + Utils.getSafeStatusClass(newStatus) + (duration <= CONFIG.SERVICES.DEFAULT_MINS ? ' short-apt' : '');
            Calendar.updateCardActions(card, id, newStatus);
            Dashboard.updateDashboardStats();
            Utils.showToast('Durum güncellendi.', 'success');
        }
        ContextMenu.hide();
    }
}

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
            };
        }
        if (DOM.setUiTheme) {
            DOM.setUiTheme.addEventListener('change', e => {
                const isDark = e.target.value === 'dark';
                document.body.classList.toggle('dark-theme', isDark);
                const btn = Utils.$('btnThemeToggle');
                if (btn) btn.innerHTML = isDark ? '<span class="theme-icon">☀️</span>' : '<span class="theme-icon">🌙</span>';
            });
        }
        if (Utils.$('btnSaveNote')) Utils.$('btnSaveNote').onclick = NotesManager.savePatientNote;
        if (Utils.$('tabCalendar')) Utils.$('tabCalendar').onclick = () => Dashboard.switchMainTab('calendar');
        if (Utils.$('tabOverview')) Utils.$('tabOverview').onclick = () => Dashboard.switchMainTab('overview');
        if (Utils.$('tabSettings')) Utils.$('tabSettings').onclick = () => Dashboard.switchMainTab('settings');
        if (Utils.$('btnAddApt')) Utils.$('btnAddApt').onclick = AppointmentManager.openAddModal;
        if (DOM.btnSaveSettings) DOM.btnSaveSettings.onclick = SettingsManager.saveSettings;
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
        
        // Mobile Sidebar Controls
        if (Utils.$('btnMobileMenu')) {
            Utils.$('btnMobileMenu').onclick = () => {
                const sidebar = Utils.$('left-sidebar');
                if (sidebar) sidebar.classList.add('mobile-active');
                if (DOM.overlay) DOM.overlay.classList.add('active');
            };
        }

        // Sol Sidebar genişletme/daraltma
        if (Utils.$('btnSidebarCollapse')) {
            Utils.$('btnSidebarCollapse').onclick = () => {
                const sidebar = Utils.$('left-sidebar');
                if (sidebar) sidebar.classList.toggle('expanded');
            };
        }

        // Sidebar Footer Theme Toggle Button
        if (Utils.$('btnThemeToggle')) {
            const syncThemeIcon = () => {
                const isDark = document.body.classList.contains('dark-theme');
                const btn = Utils.$('btnThemeToggle');
                if (btn) btn.innerHTML = isDark ? '<span class="theme-icon">☀️</span>' : '<span class="theme-icon">🌙</span>';
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
                    Utils.el('div', { className: 'search-item-name' }, i.ad_soyad || CONFIG.DEFAULTS.NAME),
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
                    Utils.el('div', { className: 'search-item-name' }, i.ad_soyad || ''),
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
            setInterval(CalendarNav.silentUpdate, CONFIG.REFRESH_RATE);
            setInterval(Calendar.updateNowIndicator, 60000);

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
