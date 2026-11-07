// ==========================================================================
// SALONZEKA - AWWWARDS ARCHITECTURAL LANDING PAGE ENGINE
// 3D Tilt, Dynamic Spotlight, Magnetic Sheen, Parallax, Live Neural Sim & Bento OS
// ==========================================================================

import { isAuthenticated } from '../shared/auth-session.js';

// WhatsApp İletişim Sabiti (14 Günlük Ücretsiz Deneme & Bilgi Alma)
const WHATSAPP_NUMBER = '905510653051';
const WHATSAPP_DEFAULT_MSG = encodeURIComponent(
    'Merhaba, salonum için SalonZeka 14 günlük ücretsiz deneme başlatmak ve detaylı bilgi almak istiyorum.'
);
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_DEFAULT_MSG}`;

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- 1. LÜKS TEMA ANAHTARI (OBSIDIAN NOIR <-> IVORY PEARL) ---
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

// --- 2. SİNEMATİK PRELOADER & YÜZDE SAYACI ---
function initPreloader() {
    const preloader = document.getElementById('sz-preloader');
    const counterEl = document.getElementById('szPreloaderCount');
    if (!preloader) return;

    let progress = 12;
    const counterInterval = setInterval(() => {
        progress = Math.min(99, progress + Math.floor(Math.random() * 18) + 7);
        if (counterEl) counterEl.textContent = `${progress}%`;
    }, 90);

    const fontPromise = document.fonts ? document.fonts.ready : Promise.resolve();
    const domPromise = new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve, { once: true });
        }
    });

    const triggerHeroReveal = () => {
        clearInterval(counterInterval);
        if (counterEl) counterEl.textContent = '100%';
        preloader.classList.add('is-hidden');

        const heroReveals = document.querySelectorAll('.sz-hero [data-reveal]');
        heroReveals.forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('is-revealed');
            }, 90 + index * 90);
        });
    };

    Promise.all([fontPromise, domPromise]).then(() => {
        setTimeout(triggerHeroReveal, 220);
    });

    setTimeout(() => {
        if (preloader && !preloader.classList.contains('is-hidden')) {
            triggerHeroReveal();
        }
    }, 1400);
}

// --- 3. SCROLL PROGRESS BAR & KAPSÜL HEADER DOCK SPY ---
function initHeaderAndScrollSpy() {
    const progressBar = document.querySelector('.sz-scroll-progress');
    const header = document.querySelector('.sz-header');
    const navLinksContainer = document.getElementById('szNavLinks');
    const navPill = document.getElementById('szNavPill');
    const navLinks = document.querySelectorAll('#szNavLinks a[data-nav-target]');
    const sections = ['asistan', 'panel', 'karsilastirma', 'nasil-calisir', 'ucretsiz-deneme']
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

            // Aktif Bölümü Belirle
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

// --- 4. ATMOSFERİK TAKIMYILDIZ & IŞILTI CANVAS MOTORU ---
function initAtmosphericCanvas() {
    if (prefersReducedMotion()) return;

    let canvas = document.getElementById('sz-ambient-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'sz-ambient-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.prepend(canvas);
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles = [];
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    let rafId = null;
    let isVisible = true;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        const count = isTouchDevice() || width < 768 ? 12 : 34;
        const palette = [
            '212, 175, 55',
            '250, 224, 140',
            '16, 185, 129',
            '52, 211, 153'
        ];

        particles = Array.from({ length: count }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.9 + 0.7,
            rgb: palette[Math.floor(Math.random() * palette.length)],
            alpha: Math.random() * 0.45 + 0.15,
            angle: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.02 + 0.008,
            vx: (Math.random() - 0.5) * 0.28,
            vy: (Math.random() - 0.5) * 0.28 - 0.08
        }));
    }

    function render() {
        if (!isVisible) return;
        ctx.clearRect(0, 0, width, height);

        if (mouse.tx !== -9999) {
            mouse.x += (mouse.tx - mouse.x) * 0.08;
            mouse.y += (mouse.ty - mouse.y) * 0.08;
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (mouse.x !== -9999) {
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const dSq = dx * dx + dy * dy;
                if (dSq < 26000 && dSq > 1) {
                    const d = Math.sqrt(dSq);
                    const f = (1 - d / 161) * 1.1;
                    p.x += (dx / d) * f;
                    p.y += (dy / d) * f;
                }
            }

            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
            if (p.y < -10) p.y = height + 10;
            if (p.y > height + 10) p.y = -10;

            p.angle += p.speed;
            const pulse = (Math.sin(p.angle) + 1) * 0.5;
            const radius = p.r * (0.8 + pulse * 0.45);
            const alpha = p.alpha * (0.55 + pulse * 0.45);

            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.rgb}, ${alpha * 0.2})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.rgb}, ${alpha})`;
            ctx.fill();
        }

        rafId = requestAnimationFrame(render);
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', (e) => {
        mouse.tx = e.clientX;
        mouse.ty = e.clientY;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
        if (isVisible) {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(render);
        } else {
            cancelAnimationFrame(rafId);
        }
    });

    resize();
    render();
}

// --- 5. INTERSECTION OBSERVER KADEMELİ SCROLL-REVEAL ---
function initScrollReveal() {
    const revealElements = document.querySelectorAll('[data-reveal]');
    if (!revealElements.length) return;

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
        { threshold: 0.12, rootMargin: '0px 0px -32px 0px' }
    );

    revealElements.forEach((el) => observer.observe(el));
}

// --- 6. FAREYE DUYARLI 3D TILT VE DİNAMİK SPOTLIGHT IŞILTISI ---
function init3DTiltAndSpotlight() {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const targetCards = document.querySelectorAll(`
        .sz-feature-card,
        .sz-bento-card,
        .sz-vs-card,
        .sz-step-card,
        .sz-trial-card,
        .sz-sim-wrapper
    `);

    targetCards.forEach((card) => {
        card.classList.add('sz-spotlight-card');

        if (!card.querySelector('.sz-spotlight-layer')) {
            const spotlightLayer = document.createElement('div');
            spotlightLayer.className = 'sz-spotlight-layer';
            spotlightLayer.setAttribute('aria-hidden', 'true');
            card.appendChild(spotlightLayer);
        }

        if (!card.querySelector('.sz-spotlight-border')) {
            const spotlightBorder = document.createElement('div');
            spotlightBorder.className = 'sz-spotlight-border';
            spotlightBorder.setAttribute('aria-hidden', 'true');
            card.appendChild(spotlightBorder);
        }

        let bounds = null;
        let rafId = null;
        const maxTilt = card.classList.contains('sz-sim-wrapper') ? 3.5 : 6.0;

        card.addEventListener('mouseenter', () => {
            bounds = card.getBoundingClientRect();
            card.style.setProperty('--spotlight-opacity', '1');
            card.style.transition = 'transform 0.12s ease-out, box-shadow 0.3s ease';
        }, { passive: true });

        card.addEventListener('mousemove', (e) => {
            if (!bounds) bounds = card.getBoundingClientRect();
            const mouseX = e.clientX - bounds.left;
            const mouseY = e.clientY - bounds.top;

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    card.style.setProperty('--spotlight-x', `${mouseX}px`);
                    card.style.setProperty('--spotlight-y', `${mouseY}px`);

                    const centerX = bounds.width / 2;
                    const centerY = bounds.height / 2;
                    const rotateX = ((mouseY - centerY) / centerY) * -maxTilt;
                    const rotateY = ((mouseX - centerX) / centerX) * maxTilt;

                    card.style.transform = `perspective(1100px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.012, 1.012, 1.012)`;
                    rafId = null;
                });
            }
        }, { passive: true });

        card.addEventListener('mouseleave', () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            bounds = null;
            card.style.setProperty('--spotlight-opacity', '0');
            card.style.transition = 'transform 0.55s var(--sz-ease-spring), box-shadow 0.45s ease';
            card.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        }, { passive: true });
    });
}

// --- 7. MANYETİK BUTONLAR, SHEEN & RIPPLE ---
function initMagneticButtons() {
    const buttons = document.querySelectorAll(`
        .sz-btn-hero-wa,
        .sz-btn-hero-alt,
        .sz-cta-btn-huge,
        .sz-btn-trial-action,
        .sz-nav-actions .sz-btn,
        .sz-floating-wa,
        .sz-brand
    `);

    buttons.forEach((btn) => {
        btn.classList.add('sz-btn-magnetic');

        btn.addEventListener('click', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const size = Math.max(rect.width, rect.height) * 2;

            const ripple = document.createElement('span');
            ripple.className = 'sz-ripple-wave';
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.left = `${x - size / 2}px`;
            ripple.style.top = `${y - size / 2}px`;

            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 750);
        });

        if (!isTouchDevice() && !prefersReducedMotion()) {
            let rafId = null;

            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const deltaX = (e.clientX - centerX) * 0.28;
                const deltaY = (e.clientY - centerY) * 0.28;

                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        btn.style.transform = `translate3d(${deltaX.toFixed(1)}px, ${deltaY.toFixed(1)}px, 0)`;
                        const innerEls = btn.querySelectorAll('span, svg');
                        innerEls.forEach((el) => {
                            el.style.transform = `translate3d(${(deltaX * 0.3).toFixed(1)}px, ${(deltaY * 0.3).toFixed(1)}px, 0)`;
                        });
                        rafId = null;
                    });
                }
            }, { passive: true });

            btn.addEventListener('mouseleave', () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                btn.style.transition = 'transform 0.45s var(--sz-ease-spring)';
                btn.style.transform = 'translate3d(0, 0, 0)';

                const innerEls = btn.querySelectorAll('span, svg');
                innerEls.forEach((el) => {
                    el.style.transition = 'transform 0.45s var(--sz-ease-spring)';
                    el.style.transform = 'translate3d(0, 0, 0)';
                });
            }, { passive: true });
        }
    });
}

// --- 8. HERO ÇOK KATMANLI PARALAKS DERİNLİĞİ ---
function initHeroParallax() {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const hero = document.querySelector('.sz-hero');
    const heroContent = document.querySelector('.sz-hero-content');
    const heroStage = document.querySelector('.sz-sim-stage');
    const orbs = document.querySelectorAll('.sz-ambient-orb');

    if (!hero || !heroContent || !heroStage) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = null;
    let isHovering = false;

    function renderParallax() {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;

        heroContent.style.transform = `translate3d(${(-currentX * 10).toFixed(1)}px, ${(-currentY * 10).toFixed(1)}px, 0)`;
        heroStage.style.transform = `translate3d(${(currentX * 14).toFixed(1)}px, ${(currentY * 14).toFixed(1)}px, 0)`;

        if (orbs.length) {
            orbs[0].style.transform = `translate3d(${(currentX * 32).toFixed(1)}px, ${(currentY * 32).toFixed(1)}px, 0)`;
            if (orbs[1]) orbs[1].style.transform = `translate3d(${(-currentX * 26).toFixed(1)}px, ${(-currentY * 26).toFixed(1)}px, 0)`;
            if (orbs[2]) orbs[2].style.transform = `translate3d(${(currentX * 18).toFixed(1)}px, ${(currentY * 18).toFixed(1)}px, 0)`;
        }

        if (isHovering || Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
            rafId = requestAnimationFrame(renderParallax);
        } else {
            rafId = null;
        }
    }

    hero.addEventListener('mouseenter', () => {
        isHovering = true;
        if (!rafId) rafId = requestAnimationFrame(renderParallax);
    }, { passive: true });

    hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        targetX = Math.max(-1, Math.min(1, x));
        targetY = Math.max(-1, Math.min(1, y));
        if (!rafId) rafId = requestAnimationFrame(renderParallax);
    }, { passive: true });

    hero.addEventListener('mouseleave', () => {
        isHovering = false;
        targetX = 0;
        targetY = 0;
    }, { passive: true });
}

// --- 9. CANLI WHATSAPP & TAKVİM NÖRAL SİMÜLASYON MOTORU ---
function initLiveSimulation() {
    const chatBody = document.querySelector('.sz-wa-chat-body');
    const msg1 = document.getElementById('simMsg1');
    const typing = document.getElementById('simTyping');
    const msg2 = document.getElementById('simMsg2');
    const msg3 = document.getElementById('simMsg3');
    const msg4 = document.getElementById('simMsg4');
    const calSlot = document.getElementById('simCalSlot');
    const calKpi = document.getElementById('simCalKpiCount');
    const calOccupancy = document.getElementById('simCalOccupancy');
    const neuralBridge = document.getElementById('simNeuralBridge');
    const replayBtn = document.getElementById('simReplayBtn');
    const pipelineSteps = document.querySelectorAll('.sz-pipeline-step');

    if (!msg1 || !typing || !msg2 || !msg3 || !msg4 || !calSlot) return;

    let timers = [];

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
        setTimeout(() => neuralBridge.classList.remove('is-pulsing'), 950);
    }

    function resetSimulation() {
        msg1.classList.remove('is-visible');
        msg2.classList.remove('is-visible');
        msg3.classList.remove('is-visible');
        msg4.classList.remove('is-visible');
        typing.classList.remove('is-active');
        if (chatBody && msg2) {
            chatBody.insertBefore(typing, msg2);
        }
        calSlot.classList.remove('has-booking');
        calSlot.innerHTML = `
            <div class="sz-cal-slot-top">
                <span class="sz-cal-time sz-cal-time-gold">14:00 - 15:00</span>
                <span class="sz-cal-status sz-status-open">Müsait</span>
            </div>
            <span class="sz-cal-empty-label">Boş Randevu Aralığı</span>
        `;
        if (calKpi) calKpi.textContent = '7';
        if (calOccupancy) calOccupancy.textContent = '%88';
        setPipelinePhase(1);
    }

    function runSimulationStep() {
        clearTimers();
        resetSimulation();

        timers.push(setTimeout(() => {
            msg1.classList.add('is-visible');
            setPipelinePhase(1);
        }, 450));

        timers.push(setTimeout(() => {
            if (chatBody && msg2) chatBody.insertBefore(typing, msg2);
            typing.classList.add('is-active');
            setPipelinePhase(2);
            pulseNeuralBridge();
        }, 1500));

        timers.push(setTimeout(() => {
            typing.classList.remove('is-active');
            msg2.classList.add('is-visible');
        }, 2900));

        timers.push(setTimeout(() => {
            msg3.classList.add('is-visible');
        }, 4400));

        timers.push(setTimeout(() => {
            if (chatBody && msg4) chatBody.insertBefore(typing, msg4);
            typing.classList.add('is-active');
            pulseNeuralBridge();
        }, 5300));

        timers.push(setTimeout(() => {
            typing.classList.remove('is-active');
            msg4.classList.add('is-visible');
            setPipelinePhase(3);
            pulseNeuralBridge();

            calSlot.classList.add('has-booking');
            calSlot.innerHTML = `
                <div class="sz-slot-client">
                    <span class="sz-cal-time">14:00 - 15:00</span>
                    <span style="background:var(--sz-emerald); color:#fff; font-size:0.65rem; padding:2px 8px; border-radius:999px; font-weight:800;">Onaylandı</span>
                </div>
                <div style="font-weight:800; color:var(--sz-ink-primary);">Sevil K. (0532 *** **)</div>
                <div class="sz-slot-service">Cilt Bakımı • Seans 3/8</div>
            `;
            if (calKpi) calKpi.textContent = '8';
            if (calOccupancy) calOccupancy.textContent = '%96';
        }, 6600));

        timers.push(setTimeout(runSimulationStep, 12800));
    }

    if (replayBtn) {
        replayBtn.addEventListener('click', () => {
            runSimulationStep();
        });
    }

    runSimulationStep();
}

// --- 10. BÖLÜMLERE ÖZEL SÜRPRİZ MİKRO-ETKİLEŞİMLER ---
function initSectionSurpriseInteractions() {
    // A. Karşılaştırma Bölümü: Senkronize Satır Vurgusu
    const pairItems = document.querySelectorAll('.sz-vs-item[data-pair-index]');
    pairItems.forEach((item) => {
        const pairIdx = item.getAttribute('data-pair-index');
        item.addEventListener('mouseenter', () => {
            document.querySelectorAll(`.sz-vs-item[data-pair-index="${pairIdx}"]`).forEach((el) => {
                el.classList.add('is-pair-highlighted');
            });
        }, { passive: true });

        item.addEventListener('mouseleave', () => {
            document.querySelectorAll(`.sz-vs-item[data-pair-index="${pairIdx}"]`).forEach((el) => {
                el.classList.remove('is-pair-highlighted');
            });
        }, { passive: true });
    });

    // B. Bento 1: Sürükle-Bırak Takvim Canlı Hizalama Simülasyonu
    const shuffleBtn = document.getElementById('bentoShuffleCalendarBtn');
    const calendarContainer = document.getElementById('bentoCalendarPreview');
    if (shuffleBtn && calendarContainer) {
        shuffleBtn.addEventListener('click', () => {
            const slots = Array.from(calendarContainer.children);
            if (slots.length > 1) {
                slots.forEach((s) => {
                    s.style.transform = 'scale(0.94) translateY(6px)';
                });
                setTimeout(() => {
                    const first = slots[0];
                    calendarContainer.appendChild(first);
                    slots.forEach((s) => {
                        s.style.transform = '';
                    });
                }, 180);
            }
        });
    }

    // C. Bento 2: İnteraktif Seans Halkası (+1 Seans İşle)
    const sessionBtn = document.getElementById('bentoSessionStepBtn');
    const circleProgress = document.getElementById('bentoCircleProgress');
    const ratioEl = document.getElementById('bentoSessionRatio');
    const remainingEl = document.getElementById('bentoSessionRemaining');
    const pctEl = document.getElementById('bentoSessionPct');

    let currentSession = 6;
    const totalSessions = 8;

    if (sessionBtn && circleProgress && ratioEl && remainingEl && pctEl) {
        sessionBtn.addEventListener('click', () => {
            currentSession = currentSession >= totalSessions ? 6 : currentSession + 1;
            const pct = Math.round((currentSession / totalSessions) * 100);
            const rem = totalSessions - currentSession;

            circleProgress.style.setProperty('--session-pct', `${pct}%`);
            circleProgress.style.transform = 'scale(1.1) rotate(8deg)';
            ratioEl.textContent = `${currentSession} / ${totalSessions}`;
            remainingEl.textContent = `Kalan Seans: ${rem}`;
            pctEl.textContent = `%${pct} Tamamlandı`;

            setTimeout(() => {
                circleProgress.style.transform = '';
            }, 350);
        });
    }

    // D. Bento 3: Finansal Sayaç Animasyonu (Görünür Olduğunda)
    const counters = document.querySelectorAll('[data-count-target]');
    if (counters.length) {
        const counterObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-count-target') || '0', 10);
                    const prefix = el.getAttribute('data-count-prefix') || '';
                    const suffix = el.getAttribute('data-count-suffix') || '';
                    const duration = 1100;
                    const start = performance.now();

                    function tick(now) {
                        const elapsed = Math.min(1, (now - start) / duration);
                        const eased = 1 - Math.pow(1 - elapsed, 3);
                        const val = Math.round(target * eased);
                        const formatted = val.toLocaleString('tr-TR');
                        el.textContent = `${prefix}${formatted}${suffix}`;
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

// --- 11. AUTH KONTROLÜ VE WHATSAPP BAĞLANTILARI ---
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
    initPreloader();
    initHeaderAndScrollSpy();
    initAtmosphericCanvas();
    initScrollReveal();
    init3DTiltAndSpotlight();
    initMagneticButtons();
    initHeroParallax();
    initLiveSimulation();
    initSectionSurpriseInteractions();
    checkAuthNav();
    setupWhatsAppLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
