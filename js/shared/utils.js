// ==========================================
// UTILITIES & DATE HELPERS (Shared)
// ==========================================

import { CONFIG } from './config.js';
import { showToast, showUndoToast } from './toast.js';

export class DateUtils {
    static getTodayLocalISO = () => {
        return new Intl.DateTimeFormat('fr-CA', { 
            timeZone: 'Europe/Istanbul', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).format(new Date());
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

export class Utils {
    static formatName = (str) => {
        if (!str) return '';
        return str.trim().split(/\s+/)
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(' ');
    };

    static getSafeStatusClass = (d) => {
        if (!d) return 'status-bekliyor';
        if (d === CONFIG.STATUS.COMPLETED) return 'status-tamamlandi';
        if (d === CONFIG.STATUS.CANCELED) return 'status-iptal';
        return 'status-bekliyor';
    };
    
    static calcBitisSaati = (saat, sure) => {
        const [h, m] = (saat || '00:00').split(':').map(Number);
        const total = h * 60 + m + (parseInt(sure, 10) || 30);
        return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    };

    static getServiceDuration = (h) => {
        if (!h) return CONFIG.SERVICES.DEFAULT_MINS;
        const low = h.toLowerCase();
        for (const [key, duration] of Object.entries(CONFIG.SERVICES.MAP)) {
            if (low.includes(key.toLowerCase())) return duration;
        }
        return CONFIG.SERVICES.DEFAULT_MINS;
    };

    static $ = (id) => document.getElementById(id);
    
    static scheduleUIWork = (callback) => requestAnimationFrame(callback);

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

    static showToast = showToast;
    static showUndoToast = showUndoToast;
}

export default Utils;
