// ==========================================
// HOME / LANDING PAGE SCRIPTS
// ==========================================

import { isAuthenticated } from '../shared/auth-session.js';
import { showToast } from '../shared/toast.js';

// --- 1. AUTH CHECK & NAV UPDATE ---
function checkAuthNav() {
    if (isAuthenticated()) {
        const loginBtn = document.getElementById('navLoginBtn');
        if (loginBtn) {
            loginBtn.textContent = 'Panele Git';
            loginBtn.href = 'dashboard.html';
        }
    }
}

// --- 2. REVEAL ENGINE (IntersectionObserver) ---
function initReveal() {
    const revealItems = document.querySelectorAll('[data-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        revealItems.forEach((item) => item.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.16 }
    );
    revealItems.forEach((item) => observer.observe(item));
}

// --- 3. 3D HERO MOTION ---
function initHeroMotion() {
    const hero = document.querySelector('.hero');
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }
    function updateDepth() {
        const rect = hero.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, Math.abs(rect.top) / Math.max(1, rect.height)));
        document.documentElement.style.setProperty('--scroll-depth', progress.toFixed(3));
    }
    updateDepth();
    window.addEventListener('scroll', updateDepth, { passive: true });
}

// --- 4. FORM HANDLER ---
export function handleApply(e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = document.getElementById('leadForm');
    const name = document.getElementById('name')?.value.trim();
    const company = document.getElementById('company')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const phone = document.getElementById('phone')?.value.trim();
    const need = document.getElementById('need')?.value;
    const btnText = document.getElementById('applyBtnText');
    const btnSubmit = document.getElementById('btnSubmitApply');

    // Hata mesajlarını sıfırla
    document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));

    let hasError = false;

    if (!name) {
        const errEl = document.querySelector('[data-error-for="name"]');
        if (errEl) errEl.textContent = 'Ad Soyad zorunludur.';
        hasError = true;
    }
    if (!company) {
        const errEl = document.querySelector('[data-error-for="company"]');
        if (errEl) errEl.textContent = 'Salon adı zorunludur.';
        hasError = true;
    }
    if (!email) {
        const errEl = document.querySelector('[data-error-for="email"]');
        if (errEl) errEl.textContent = 'E-posta zorunludur.';
        hasError = true;
    }
    if (!phone) {
        const errEl = document.querySelector('[data-error-for="phone"]');
        if (errEl) errEl.textContent = 'Telefon zorunludur.';
        hasError = true;
    }
    if (!need) {
        const errEl = document.querySelector('[data-error-for="need"]');
        if (errEl) errEl.textContent = 'Bu alan zorunludur.';
        hasError = true;
    }

    if (hasError) {
        showToast('Lütfen formdaki hataları düzeltin.', 'error');
        return;
    }

    if (btnText) btnText.style.opacity = '0.5';
    if (btnSubmit) btnSubmit.disabled = true;

    setTimeout(() => {
        showToast('Başvurunuz başarıyla alındı! En kısa sürede sizinle iletişime geçeceğiz.', 'success', 5000);
        if (form) form.reset();
        if (btnText) btnText.style.opacity = '1';
        if (btnSubmit) btnSubmit.disabled = false;
    }, 1200);
}

// Window scope'a da ekle (HTML onsubmit="handleApply(event)" için)
window.handleApply = handleApply;

// --- INITIALIZATION ---
function init() {
    checkAuthNav();
    initReveal();
    initHeroMotion();
    
    const leadForm = document.getElementById('leadForm');
    if (leadForm) {
        leadForm.addEventListener('submit', handleApply);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
