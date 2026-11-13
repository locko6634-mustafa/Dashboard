// ==========================================================================
// SALONZEKA - LANDING PAGE ETKİLEŞİM MOTORU (ES MODULE)
// ==========================================================================

import { isAuthenticated } from '../shared/auth-session.js';

const WHATSAPP_NUMBER = '905510653051';
const WHATSAPP_DEFAULT_MSG = encodeURIComponent(
    'Merhaba, salonum için SalonZeka 14 günlük ücretsiz deneme başlatmak ve detaylı bilgi almak istiyorum.'
);
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_DEFAULT_MSG}`;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- 1. TEMA ANAHTARI (OBSIDIAN <-> PEARL) ---
function initThemeSwitcher() {
    const toggleBtn = document.getElementById('szThemeToggle');
    const rootHtml = document.documentElement;
    const savedTheme = localStorage.getItem('sz_lander_theme');

    if (savedTheme === 'pearl' || savedTheme === 'obsidian') {
        rootHtml.setAttribute('data-lander-theme', savedTheme);
    }

    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const current = rootHtml.getAttribute('data-lander-theme') || 'obsidian';
        const next = current === 'obsidian' ? 'pearl' : 'obsidian';
        rootHtml.setAttribute('data-lander-theme', next);
        localStorage.setItem('sz_lander_theme', next);
    });
}

// --- 2. SCROLL PROGRESS BAR & HEADER DOCK SPY ---
function initHeaderAndScrollSpy() {
    const progressBar = document.querySelector('.sz-scroll-progress');
    const header = document.querySelector('.sz-header');
    const navLinksContainer = document.getElementById('szNavLinks');
    const navPill = document.getElementById('szNavPill');
    const navLinks = document.querySelectorAll('#szNavLinks a[data-nav-target]');
    const sections = ['kontrol', 'sektorler', 'panel', 'fiyatlandirma', 'sss']
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    function movePillToLink(link) {
        if (!navPill || !navLinksContainer || !link) return;
        const containerRect = navLinksContainer.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();
        navPill.style.width = `${linkRect.width}px`;
        navPill.style.transform = `translate3d(${linkRect.left - containerRect.left - 5}px, 0, 0)`;
        navPill.style.opacity = '1';
    }

    navLinks.forEach((link) => {
        link.addEventListener('mouseenter', () => movePillToLink(link), { passive: true });
    });

    if (navLinksContainer) {
        navLinksContainer.addEventListener('mouseleave', () => {
            const activeLink = navLinksContainer.querySelector('a.is-active');
            if (activeLink) {
                movePillToLink(activeLink);
            } else if (navPill) {
                navPill.style.opacity = '0';
            }
        }, { passive: true });
    }

    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (progressBar) {
                const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
                progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
            }

            if (header) {
                header.classList.toggle('is-scrolled', scrollTop > 24);
            }

            let currentSectionId = '';
            const triggerPoint = scrollTop + window.innerHeight * 0.32;
            sections.forEach((sec) => {
                if (sec.offsetTop <= triggerPoint) {
                    currentSectionId = sec.id;
                }
            });

            navLinks.forEach((link) => {
                const isMatch = link.getAttribute('data-nav-target') === currentSectionId;
                link.classList.toggle('is-active', isMatch);
                if (isMatch) movePillToLink(link);
            });

            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// --- 3. SCROLL REVEAL ---
function initScrollReveal() {
    const revealElements = document.querySelectorAll('[data-reveal]');
    if (!revealElements.length) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
        revealElements.forEach((el) => el.classList.add('is-revealed'));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
                    setTimeout(() => {
                        el.classList.add('is-revealed');
                    }, delay);
                    observer.unobserve(el);
                }
            });
        },
        { threshold: 0.12, rootMargin: '0px 0px -24px 0px' }
    );

    revealElements.forEach((el) => observer.observe(el));
}

// --- 4. İNTERAKTİF WHATSAPP & MİNİ TAKVİM SİMÜLASYONU ---
function initLiveSimulation() {
    const chatBody = document.getElementById('simChatBody');
    const msg1 = document.getElementById('simMsg1');
    const typing = document.getElementById('simTyping');
    const msg2 = document.getElementById('simMsg2');
    const msg3 = document.getElementById('simMsg3');
    const msg3Text = document.getElementById('simMsg3Text');
    const msg4 = document.getElementById('simMsg4');
    const msg4Text = document.getElementById('simMsg4Text');
    const choiceBtns = document.querySelectorAll('.sz-sim-choice-btn');

    const slot1430 = document.getElementById('simCalSlot1430');
    const status1430 = document.getElementById('simCalStatus1430');
    const client1430 = document.getElementById('simCalClient1430');
    const meta1430 = document.getElementById('simCalMeta1430');

    const slot1600 = document.getElementById('simCalSlot1600');
    const status1600 = document.getElementById('simCalStatus1600');
    const client1600 = document.getElementById('simCalClient1600');
    const meta1600 = document.getElementById('simCalMeta1600');

    const calKpi = document.getElementById('simCalKpiCount');
    const calOccupancy = document.getElementById('simCalOccupancy');
    const neuralBridge = document.getElementById('simNeuralBridge');
    const replayBtn = document.getElementById('simReplayBtn');
    const pipelineSteps = document.querySelectorAll('.sz-pipeline-step');

    if (!msg1 || !typing || !msg2 || !msg3 || !msg4 || !slot1430 || !slot1600) return;

    let timers = [];
    let hasChosen = false;

    function clearTimers() {
        timers.forEach((t) => clearTimeout(t));
        timers = [];
    }

    function setPipelinePhase(phase) {
        pipelineSteps.forEach((step) => {
            const stepNum = parseInt(step.getAttribute('data-sim-phase') || '0', 10);
            step.classList.toggle('is-active', stepNum === phase);
        });
    }

    function pulseNeuralBridge() {
        if (!neuralBridge) return;
        neuralBridge.classList.add('is-pulsing');
        setTimeout(() => neuralBridge.classList.remove('is-pulsing'), 850);
    }

    function resetSlotUI(slotEl, statusEl, clientEl, metaEl) {
        slotEl.classList.remove('has-booking');
        if (statusEl) {
            statusEl.textContent = 'Müsait';
            statusEl.classList.remove('sz-status-booked');
            statusEl.classList.add('sz-status-open');
        }
        if (clientEl) clientEl.textContent = 'Boş Randevu Aralığı';
        if (metaEl) metaEl.textContent = 'Seçim bekleniyor';
    }

    function lockSlotUI(slotEl, statusEl, clientEl, metaEl) {
        slotEl.classList.add('has-booking');
        if (statusEl) {
            statusEl.textContent = 'Onaylandı';
            statusEl.classList.remove('sz-status-open');
            statusEl.classList.add('sz-status-booked');
        }
        if (clientEl) clientEl.textContent = 'Sevil K.';
        if (metaEl) metaEl.textContent = 'Cilt Bakımı • Kilitlendi';
    }

    function resetSimulation() {
        hasChosen = false;
        msg1.classList.remove('is-visible');
        msg2.classList.remove('is-visible');
        msg3.classList.remove('is-visible');
        msg4.classList.remove('is-visible');
        typing.classList.remove('is-active');
        if (chatBody && msg2) {
            chatBody.insertBefore(typing, msg2);
        }
        choiceBtns.forEach((btn) => {
            btn.classList.remove('is-selected');
            btn.disabled = false;
        });
        resetSlotUI(slot1430, status1430, client1430, meta1430);
        resetSlotUI(slot1600, status1600, client1600, meta1600);
        if (calKpi) calKpi.textContent = '7';
        if (calOccupancy) calOccupancy.textContent = '%84';
        setPipelinePhase(1);
    }

    function selectSlot(slotTime, isAuto = false) {
        if (hasChosen) return;
        hasChosen = true;

        if (!isAuto) {
            clearTimers();
            msg1.classList.add('is-visible');
            msg2.classList.add('is-visible');
            typing.classList.remove('is-active');
        }

        choiceBtns.forEach((btn) => {
            const val = btn.getAttribute('data-slot-choice');
            btn.classList.toggle('is-selected', val === slotTime);
            btn.disabled = true;
        });

        if (msg3Text) msg3Text.textContent = `${slotTime} olsun lütfen.`;
        msg3.classList.add('is-visible');
        setPipelinePhase(3);
        pulseNeuralBridge();

        if (slotTime === '14:30') {
            lockSlotUI(slot1430, status1430, client1430, meta1430);
        } else {
            lockSlotUI(slot1600, status1600, client1600, meta1600);
        }

        if (calKpi) calKpi.textContent = '8';
        if (calOccupancy) calOccupancy.textContent = '%94';

        timers.push(setTimeout(() => {
            if (msg4Text) {
                msg4Text.textContent = `Randevunuz onaylandı! Yarın saat ${slotTime} Cilt Bakımı takvime kilitlendi.`;
            }
            msg4.classList.add('is-visible');
        }, 420));

        timers.push(setTimeout(runSimulation, 7500));
    }

    function runSimulation() {
        clearTimers();
        resetSimulation();

        timers.push(setTimeout(() => {
            msg1.classList.add('is-visible');
            setPipelinePhase(1);
        }, 250));

        timers.push(setTimeout(() => {
            if (chatBody && msg2) chatBody.insertBefore(typing, msg2);
            typing.classList.add('is-active');
            setPipelinePhase(2);
            pulseNeuralBridge();
        }, 1100));

        timers.push(setTimeout(() => {
            typing.classList.remove('is-active');
            msg2.classList.add('is-visible');
        }, 2300));

        timers.push(setTimeout(() => {
            selectSlot('14:30', true);
        }, 4600));
    }

    choiceBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const slot = btn.getAttribute('data-slot-choice');
            if (slot) selectSlot(slot, false);
        });
    });

    if (replayBtn) {
        replayBtn.addEventListener('click', () => {
            runSimulation();
        });
    }

    runSimulation();
}

// --- 5. SEKTÖR SEKMELERİ ---
function initSectorTabs() {
    const tabs = document.querySelectorAll('.sz-sector-tab[data-sector]');
    const panels = document.querySelectorAll('.sz-sector-panel');
    if (!tabs.length || !panels.length) return;

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const targetSector = tab.getAttribute('data-sector');
            tabs.forEach((t) => {
                const isSelected = t === tab;
                t.classList.toggle('is-active', isSelected);
                t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });

            panels.forEach((panel) => {
                const isMatch = panel.id === `sector-${targetSector}`;
                panel.classList.toggle('is-active', isMatch);
                panel.hidden = !isMatch;
            });
        });
    });
}

// --- 6. FİYATLANDIRMA AYLIK / YILLIK TOGGLE ---
function initPricingToggle() {
    const toggleBtn = document.getElementById('billingToggleBtn');
    const monthlyLabel = document.getElementById('billingLabelMonthly');
    const yearlyLabel = document.getElementById('billingLabelYearly');
    const priceValues = document.querySelectorAll('.sz-price-value[data-monthly]');
    if (!toggleBtn || !priceValues.length) return;

    let isYearly = false;

    function updatePricingUI() {
        toggleBtn.setAttribute('aria-checked', isYearly ? 'true' : 'false');
        toggleBtn.classList.toggle('is-yearly', isYearly);
        if (monthlyLabel) monthlyLabel.classList.toggle('is-active', !isYearly);
        if (yearlyLabel) yearlyLabel.classList.toggle('is-active', isYearly);

        priceValues.forEach((el) => {
            const nextPrice = isYearly
                ? el.getAttribute('data-yearly')
                : el.getAttribute('data-monthly');
            if (nextPrice) el.textContent = nextPrice;
        });
    }

    toggleBtn.addEventListener('click', () => {
        isYearly = !isYearly;
        updatePricingUI();
    });
}

// --- 7. BENTO MİNİ UI ETKİLEŞİMLERİ & SAYAÇLAR ---
function initSectionInteractions() {
    const sessionBtn = document.getElementById('bentoSessionStepBtn');
    const fillEl = document.getElementById('bentoSessionFill');
    const ratioEl = document.getElementById('bentoSessionRatio');
    const remainingEl = document.getElementById('bentoSessionRemaining');
    const pctEl = document.getElementById('bentoSessionPct');

    let currentSession = 6;
    const totalSessions = 8;

    if (sessionBtn && fillEl && ratioEl && remainingEl && pctEl) {
        sessionBtn.addEventListener('click', () => {
            currentSession = currentSession >= totalSessions ? 6 : currentSession + 1;
            const pct = Math.round((currentSession / totalSessions) * 100);
            const rem = totalSessions - currentSession;
            const balance = rem * 750;

            fillEl.style.width = `${pct}%`;
            ratioEl.textContent = `${currentSession} / ${totalSessions} Seans`;
            remainingEl.textContent = `Kalan Seans: ${rem}`;
            pctEl.textContent = `%${pct} • Kalan Bakiye: ₺${balance.toLocaleString('tr-TR')}`;
        });
    }

    const counters = document.querySelectorAll('[data-count-target]');
    if (counters.length && !prefersReducedMotion() && typeof IntersectionObserver !== 'undefined') {
        const counterObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-count-target') || '0', 10);
                    const prefix = el.getAttribute('data-count-prefix') || '';
                    const suffix = el.getAttribute('data-count-suffix') || '';
                    const duration = 900;
                    const start = performance.now();

                    function tick(now) {
                        const elapsed = Math.min(1, (now - start) / duration);
                        const eased = 1 - Math.pow(1 - elapsed, 3);
                        const val = Math.round(target * eased);
                        el.textContent = `${prefix}${val.toLocaleString('tr-TR')}${suffix}`;
                        if (elapsed < 1) {
                            requestAnimationFrame(tick);
                        }
                    }

                    requestAnimationFrame(tick);
                    counterObserver.unobserve(el);
                });
            },
            { threshold: 0.4 }
        );

        counters.forEach((c) => counterObserver.observe(c));
    }
}

// --- 8. AUTH KONTROLÜ VE WHATSAPP BAĞLANTILARI ---
function checkAuthNav() {
    if (isAuthenticated()) {
        const loginBtn = document.getElementById('navLoginBtn');
        if (loginBtn) {
            loginBtn.textContent = 'Panele Git';
            loginBtn.href = 'dashboard.html';
        }
        const mobileBottomBtn = document.getElementById('mobileBottomLoginBtn');
        if (mobileBottomBtn) {
            mobileBottomBtn.textContent = 'Panele Git';
            mobileBottomBtn.href = 'dashboard.html';
        }
    }
}

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
    initThemeSwitcher();
    initHeaderAndScrollSpy();
    initScrollReveal();
    initLiveSimulation();
    initSectorTabs();
    initPricingToggle();
    initSectionInteractions();
    checkAuthNav();
    setupWhatsAppLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
