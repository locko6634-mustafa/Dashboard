// ==========================================
// CALENDAR & NAVIGATION ENGINE (Dashboard)
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

import { DragDrop } from './drag-drop.js';
import { HoverPopupManager, ContextMenu, AppointmentManager } from './appointment.js';
import { Dashboard } from './overview.js';

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
        const cardName = (Utils.formatName(app.ad_soyad) || CONFIG.DEFAULTS.NAME) + seansText;

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
        if (ThemeUtils.isUiBusy()) return;
        
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


export { Calendar, CalendarNav };
if (typeof window !== 'undefined') {
    window.Calendar = Calendar;
    window.CalendarNav = CalendarNav;
}
