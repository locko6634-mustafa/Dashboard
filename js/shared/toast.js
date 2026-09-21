// ==========================================
// TOAST NOTIFICATIONS (Shared Toast Component)
// ==========================================

import { CONFIG } from './config.js';

export function showToast(message, type = 'error', duration = (CONFIG?.TIMERS?.TOAST || 3000)) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icon;

    const msgEl = document.createElement('span');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    const animDuration = CONFIG?.TIMERS?.UI_ANIM || 300;
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), animDuration);
    }, duration);
}

export function showUndoToast(message, onUndo) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const animDuration = CONFIG?.TIMERS?.UI_ANIM || 300;
    const toast = document.createElement('div');
    toast.className = 'toast toast-warning';

    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    iconEl.textContent = '⚠️';

    const msgEl = document.createElement('span');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn-toast-undo';
    undoBtn.textContent = 'Geri Al';
    undoBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof onUndo === 'function') onUndo();
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), animDuration);
    };

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    toast.appendChild(undoBtn);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    const timeoutId = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), animDuration);
    }, 5000);

    return {
        el: toast,
        cancel: () => {
            clearTimeout(timeoutId);
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), animDuration);
        }
    };
}
