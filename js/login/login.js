// ==========================================
// LOGIN PAGE SCRIPT
// ==========================================

import { CONFIG } from '../shared/config.js';
import { showToast } from '../shared/toast.js';
import { saveSession, redirectIfAuthenticated } from '../shared/auth-session.js';

// Eğer kullanıcı zaten giriş yapmışsa doğrudan dashboard'a yönlendir
redirectIfAuthenticated('dashboard.html');

function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

export async function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnLogin = document.getElementById('btnLogin');

    if (!email || !password) return;

    if (btnText) btnText.style.opacity = '0';
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnLogin) btnLogin.disabled = true;

    try {
        const endpoint = (CONFIG?.ENDPOINTS?.LOGIN) ? CONFIG.ENDPOINTS.LOGIN : 'kullanici-girisi';
        const url = (CONFIG?.API_BASE || '') + endpoint;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            throw new Error('Geçersiz kimlik bilgileri veya sunucu hatası.');
        }

        const data = await res.json();
        
        if (data.success && data.token && data.tenant_id) {
            saveSession(data.token, data.tenant_id);
            showToast('Giriş başarılı, yönlendiriliyor...', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } else {
            throw new Error(data.message || 'Giriş başarısız');
        }

    } catch (error) {
        showToast(error.message || 'Bağlantı hatası veya yetkisiz erişim.', 'error');
    } finally {
        if (btnText) btnText.style.opacity = '1';
        if (btnSpinner) btnSpinner.classList.add('hidden');
        if (btnLogin) btnLogin.disabled = false;
    }
}

// Window scope'a ekle (HTML formu için)
window.handleLogin = handleLogin;

function init() {
    applyTheme();
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', handleLogin);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
