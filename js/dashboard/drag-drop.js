// ==========================================
// DRAG & DROP AND RESIZE ENGINE (Dashboard)
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


export { DragDrop };
if (typeof window !== 'undefined') {
    window.DragDrop = DragDrop;
}
