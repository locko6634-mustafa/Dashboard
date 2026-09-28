// ==========================================
// DASHBOARD OVERVIEW & CHARTS (Dashboard)
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

import { PatientUI, PatientManager, PatientCRM } from './patient.js';

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
                    Utils.el('div', { className: 'agenda-name' }, Utils.formatName(app.ad_soyad) || CONFIG.DEFAULTS.NAME),
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
        
        if (DOM.tabCalendar) DOM.tabCalendar.classList.toggle('active', tabName === 'calendar');
        if (DOM.tabPatients) DOM.tabPatients.classList.toggle('active', tabName === 'patients');
        if (DOM.tabOverview) DOM.tabOverview.classList.toggle('active', tabName === 'overview');
        if (DOM.tabSettings) DOM.tabSettings.classList.toggle('active', tabName === 'settings');
        if (DOM.tabReports) DOM.tabReports.classList.toggle('active', tabName === 'reports');
        
        if (DOM.viewCalendar) DOM.viewCalendar.classList.add('hidden');
        if (DOM.viewPatients) DOM.viewPatients.classList.add('hidden');
        if (DOM.viewOverview) DOM.viewOverview.classList.add('hidden');
        if (DOM.viewSettings) DOM.viewSettings.classList.add('hidden');
        if (DOM.viewReports) DOM.viewReports.classList.add('hidden');

        if (tabName === 'calendar') {
            if (DOM.viewCalendar) DOM.viewCalendar.classList.remove('hidden');
        } else if (tabName === 'patients') {
            if (DOM.viewPatients) DOM.viewPatients.classList.remove('hidden');
            await PatientCRM.loadPatients();
        } else if (tabName === 'overview') {
            if (DOM.viewOverview) DOM.viewOverview.classList.remove('hidden');
            if (!Store.state.overviewData) await Dashboard.loadOverviewData();
        } else if (tabName === 'settings') {
            if (DOM.viewSettings) DOM.viewSettings.classList.remove('hidden');
        } else if (tabName === 'reports') {
            if (DOM.viewReports) DOM.viewReports.classList.remove('hidden');
            const { ReportsManager } = await import('./reports.js');
            await ReportsManager.initReports();
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
            pCircle = '<circle class="doughnut-segment" cx="75" cy="75" r="50" stroke="var(--accent)" stroke-dasharray="' + pStroke + ' ' + circ + '" stroke-dashoffset="' + pOffset + '"></circle>';
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
                    '<div class="legend-color" style="background:var(--accent);"></div>' +
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
            return '<circle class="chart-dot" cx="' + p.x + '" cy="' + p.y + '" data-count="' + p.count + '" data-label="' + p.label + '" data-date="' + currentWeek[i].iso + '"></circle>' +
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
            { label: CONFIG.LABELS.OV_TOTAL_PATIENT, rawVal: d.total_clients || 0, prefix: '', suffix: '', icon: '<svg width="20" height="20"><use href="#icon-users"></use></svg>', delta: d.delta_clients },
            { label: CONFIG.LABELS.OV_TOTAL_APT, rawVal: d.total_appointments || 0, prefix: '', suffix: '', icon: '<svg width="20" height="20"><use href="#icon-calendar"></use></svg>', delta: d.delta_appointments },
            { label: CONFIG.LABELS.OV_TOTAL_REV, rawVal: d.total_revenue || 0, prefix: '', suffix: ' ' + CONFIG.DEFAULTS.CURRENCY, icon: '<svg width="20" height="20"><use href="#icon-dollar"></use></svg>', delta: d.delta_revenue },
            { label: CONFIG.LABELS.OV_SUCCESS_RATE, rawVal: d.success_rate || 0, prefix: '%', suffix: '', icon: '<svg width="20" height="20"><use href="#icon-star"></use></svg>', badge: 'success', delta: d.delta_success_rate }
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

            const iconWrapper = Utils.el('div', { className: 'stat-icon-wrapper' });
            iconWrapper.innerHTML = kpi.icon;

            const card = Utils.el('div', { className: 'glass stat-card' + (kpi.badge ? ' card-success-border' : ''), style: 'animation-delay: ' + (i * 0.1) + 's' },
                cardContent,
                iconWrapper
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
                            Utils.el('span', { className: 'font-13 font-bold text-main' }, Utils.formatName(p.ad_soyad) || CONFIG.DEFAULTS.NAME),
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


export { Dashboard, ChartTooltip };
if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
    window.ChartTooltip = ChartTooltip;
}
