// ==========================================
// LOGIN PAGE SCRIPT - SALONZEKA
// ==========================================

import { CONFIG } from '../shared/config.js';
import { showToast } from '../shared/toast.js';
import { saveSession, redirectIfAuthenticated } from '../shared/auth-session.js';

// Eğer kullanıcı zaten giriş yapmışsa doğrudan dashboard'a yönlendir
redirectIfAuthenticated('dashboard.html');

function initPreloader() {
    const preloader = document.getElementById('sz-preloader');
    if (!preloader) return;

    const fontPromise = document.fonts ? document.fonts.ready : Promise.resolve();
    const domPromise = new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve, { once: true });
        }
    });

    Promise.all([fontPromise, domPromise]).then(() => {
        setTimeout(() => {
            preloader.classList.add('is-hidden');
        }, 200);
    });

    setTimeout(() => {
        if (preloader && !preloader.classList.contains('is-hidden')) {
            preloader.classList.add('is-hidden');
        }
    }, 1500);
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
    initPreloader();
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
