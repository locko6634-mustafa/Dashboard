// ==========================================================================
// SALONZEKA - HOME / LANDING PAGE JAVASCRIPT
// ==========================================================================

import { isAuthenticated } from '../shared/auth-session.js';

// WhatsApp İletişim Sabiti
const WHATSAPP_NUMBER = '905510653051';
const WHATSAPP_DEFAULT_MSG = encodeURIComponent('Merhaba, salonum için SalonZeka Yapay Zeka Asistanı ve Yönetim Paneli hakkında bilgi almak istiyorum.');
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_DEFAULT_MSG}`;

// --- 1. AUTH KONTROLÜ (GİRİŞ YAPMIŞSA PANELE YÖNLENDİR) ---
function checkAuthNav() {
    if (isAuthenticated()) {
        const loginBtn = document.getElementById('navLoginBtn');
        if (loginBtn) {
            loginBtn.textContent = 'Panele Git';
            loginBtn.href = 'dashboard.html';
        }
    }
}

// --- 2. HEADER SCROLL ETKİSİ ---
function initHeaderScroll() {
    const header = document.querySelector('.sz-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            header.classList.add('is-scrolled');
        } else {
            header.classList.remove('is-scrolled');
        }
    }, { passive: true });
}

// --- 3. CANLI WHATSAPP & TAKVİM SİMÜLASYONU MOTORU ---
function initLiveSimulation() {
    const msg1 = document.getElementById('simMsg1'); // Müşteri: Merhaba, yarın cilt bakımı...
    const typing = document.getElementById('simTyping'); // Bot yazıyor...
    const msg2 = document.getElementById('simMsg2'); // Bot: Merhaba Sevil Hanım! Yarın için 14:00...
    const msg3 = document.getElementById('simMsg3'); // Müşteri: 14:00 olsun lütfen.
    const msg4 = document.getElementById('simMsg4'); // Bot: ✅ Randevunuz onaylandı...
    const calSlot = document.getElementById('simCalSlot'); // Takvimdeki slot
    const calKpi = document.getElementById('simCalKpiCount');

    if (!msg1 || !typing || !msg2 || !msg3 || !msg4 || !calSlot) return;

    function resetSimulation() {
        msg1.classList.remove('is-visible');
        msg2.classList.remove('is-visible');
        msg3.classList.remove('is-visible');
        msg4.classList.remove('is-visible');
        typing.classList.remove('is-active');
        calSlot.classList.remove('has-booking');
        calSlot.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; color:var(--sz-gold);">14:00 - 15:00</span>
                <span style="color:var(--sz-ink-muted); font-size:0.7rem;">Müsait</span>
            </div>
            <span style="font-style:italic;">Boş Randevu Aralığı</span>
        `;
        if (calKpi) calKpi.textContent = '7';
    }

    function runSimulationStep() {
        resetSimulation();

        // Adım 1: Müşteri sorusu görünür
        setTimeout(() => {
            msg1.classList.add('is-visible');
        }, 500);

        // Adım 2: Bot yazıyor...
        setTimeout(() => {
            typing.classList.add('is-active');
        }, 1600);

        // Adım 3: Bot müsait saatleri sunar
        setTimeout(() => {
            typing.classList.remove('is-active');
            msg2.classList.add('is-visible');
        }, 3000);

        // Adım 4: Müşteri saat seçer
        setTimeout(() => {
            msg3.classList.add('is-visible');
        }, 4600);

        // Adım 5: Bot yazıyor... (Onay için)
        setTimeout(() => {
            typing.classList.add('is-active');
        }, 5500);

        // Adım 6: Bot onay şablonunu gönderir
        setTimeout(() => {
            typing.classList.remove('is-active');
            msg4.classList.add('is-visible');

            // Takvime canlı işlenir!
            calSlot.classList.add('has-booking');
            calSlot.innerHTML = `
                <div class="sz-slot-client">
                    <span>14:00 - 15:00</span>
                    <span style="background:var(--sz-emerald); color:#fff; font-size:0.65rem; padding:1px 6px; border-radius:999px;">Onaylandı</span>
                </div>
                <div style="font-weight:700; color:var(--sz-ink-primary);">Sevil K. (0532 *** **)</div>
                <div class="sz-slot-service">Cilt Bakımı • Seans 3/8</div>
            `;
            if (calKpi) calKpi.textContent = '8';
        }, 6800);

        // Adım 7: 12 saniye sonra tekrar başa sarar
        setTimeout(runSimulationStep, 13000);
    }

    // İlk çalıştırma
    runSimulationStep();
}

// --- 4. TÜM WHATSAPP DÜĞMELERİNİ YÖNLENDİRME ---
function setupWhatsAppLinks() {
    const waButtons = document.querySelectorAll('.sz-wa-link');
    waButtons.forEach((btn) => {
        btn.href = WHATSAPP_URL;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
    });
}

// --- BAŞLATMA ---
function init() {
    checkAuthNav();
    initHeaderScroll();
    initLiveSimulation();
    setupWhatsAppLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
