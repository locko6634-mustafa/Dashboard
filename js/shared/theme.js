// ==========================================
// THEME & COLOR UTILITIES (Shared)
// ==========================================

import { CONFIG } from './config.js';

export class ThemeUtils {
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
            hex = (hex || '').replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const r = parseInt(hex.slice(0, 2), 16) || 0;
            const g = parseInt(hex.slice(2, 4), 16) || 0;
            const b = parseInt(hex.slice(4, 6), 16) || 0;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        const prefs = CONFIG.UI_PREFERENCES || {};
        const localTheme = (typeof localStorage !== 'undefined') ? localStorage.getItem('theme_preference') : null;
        // Varsayılan tema her zaman açık (light) olmalıdır; kullanıcı isterse kendisi değiştirir
        const currentTheme = localTheme || 'light';
        
        if (currentTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }

        const themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) {
            const isDark = document.body.classList.contains('dark-theme');
            themeBtn.innerHTML = isDark 
                ? '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-sun"></use></svg></span>' 
                : '<span class="theme-icon"><svg width="14" height="14"><use href="#icon-moon"></use></svg></span>';
        }
        const accentPreset = prefs.accent_preset || 'emerald';
        document.body.classList.remove('accent-emerald', 'accent-cobalt', 'accent-amber', 'accent-rose', 'accent-violet', 'accent-slate');
        document.body.classList.add('accent-' + accentPreset);
        document.body.dataset.accentPreset = accentPreset;
        
        const cols = prefs.colors || CONFIG.COLORS || {};
        const w = cols.WAITING || '#D4AF37';
        const c = cols.COMPLETED || '#728873';
        const x = cols.CANCELED || '#B76E79';

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

    static isUiBusy = () => {
        const hasDragging = document.querySelector('.is-dragging') !== null;
        const hasResizing = document.body.style.cursor === 'ns-resize';
        const hasDragMode = document.body.classList.contains('drag-mode');
        const isAptModalOpen = document.getElementById('aptModal') && !document.getElementById('aptModal').classList.contains('hidden');
        const isAddModalOpen = document.getElementById('addAptModal') && !document.getElementById('addAptModal').classList.contains('hidden');
        const isEditModalOpen = document.getElementById('editPatientModal') && !document.getElementById('editPatientModal').classList.contains('hidden');
        const isSidebarOpen = document.body.classList.contains('sidebar-active');
        return hasDragging || hasResizing || hasDragMode || isAptModalOpen || isAddModalOpen || isEditModalOpen || isSidebarOpen;
    };
}

export default ThemeUtils;
