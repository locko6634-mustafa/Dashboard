// ==========================================================================
// SALONZEKA - HOME / LANDING PAGE JAVASCRIPT
// Awwwards-Tier High-Performance Micro-Interactions & Hardware Accelerated FX
// ==========================================================================

import { isAuthenticated } from '../shared/auth-session.js';

// WhatsApp İletişim Sabiti (14 Günlük Ücretsiz Deneme & Bilgi Alma)
const WHATSAPP_NUMBER = '905510653051';
const WHATSAPP_DEFAULT_MSG = encodeURIComponent('Merhaba, salonum için SalonZeka 14 günlük ücretsiz deneme başlatmak ve detaylı bilgi almak istiyorum.');
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_DEFAULT_MSG}`;

// Mobil ve Dokunmatik Cihaz Algılama (Performans ve Pil Tasarrufu İçin)
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- 1. LÜKS SCROLL PROGRESS BAR ---
function initScrollProgressBar() {
    let progressBar = document.querySelector('.sz-scroll-progress');
    const header = document.querySelector('.sz-header');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.className = 'sz-scroll-progress';
        progressBar.setAttribute('aria-hidden', 'true');
        if (header) {
            header.appendChild(progressBar);
        } else {
            document.body.prepend(progressBar);
        }
    } else if (header && progressBar.parentElement !== header) {
        header.appendChild(progressBar);
    }

    let ticking = false;
    let cachedScrollHeight = 0;

    function updateMetrics() {
        cachedScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    }
    window.addEventListener('resize', updateMetrics, { passive: true });
    updateMetrics();

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const progress = cachedScrollHeight > 0 ? (window.scrollY / cachedScrollHeight) * 100 : 0;
                progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// --- 2. PRELOADER & HERO GİRİŞ KOREOGRAFİSİ ---
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

    const triggerHeroReveal = () => {
        preloader.classList.add('is-hidden');
        // Kademeli Hero giriş koreografisi
        const heroReveals = document.querySelectorAll('.sz-hero [data-reveal]');
        heroReveals.forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('is-revealed');
            }, 100 + index * 80);
        });
    };

    Promise.all([fontPromise, domPromise]).then(() => {
        setTimeout(triggerHeroReveal, 200);
    });

    // Emniyet zamanlayıcısı (en geç 1.5 sn)
    setTimeout(() => {
        if (preloader && !preloader.classList.contains('is-hidden')) {
            triggerHeroReveal();
        }
    }, 1500);
}

// --- 3. ATMOSFERİK PARÇACIK CANVAS MOTORU (GPU HIZLANDIRMALI GLOW) ---
function initAtmosphericCanvas() {
    if (prefersReducedMotion()) return;

    let canvas = document.getElementById('sz-ambient-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'sz-ambient-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        const ambientOrbs = document.querySelector('.sz-ambient-orbs');
        if (ambientOrbs && ambientOrbs.parentNode) {
            ambientOrbs.parentNode.insertBefore(canvas, ambientOrbs);
        } else {
            document.body.prepend(canvas);
        }
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles = [];
    let mouse = { x: -9999, y: -9999, targetX: -9999, targetY: -9999 };
    let animationFrameId = null;
    let isVisible = true;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initParticles();
    }

    function initParticles() {
        particles = [];
        // Masaüstünde 30, mobilde 10 hafif parçacık
        const count = isTouchDevice() || width < 768 ? 10 : 30;

        const colors = [
            '212, 175, 55',  // Altın
            '184, 134, 11',  // Derin Altın
            '16, 185, 129',  // Zümrüt
            '229, 190, 84'   // Şampanya
        ];

        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                baseRadius: Math.random() * 2.0 + 0.8,
                radius: 0,
                rgb: colors[Math.floor(Math.random() * colors.length)],
                alpha: Math.random() * 0.45 + 0.15,
                pulseSpeed: Math.random() * 0.02 + 0.01,
                pulseAngle: Math.random() * Math.PI * 2,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3 - 0.12
            });
        }
    }

    function render() {
        if (!isVisible) return;

        ctx.clearRect(0, 0, width, height);

        // Farenin konumunu yumuşat
        if (mouse.targetX !== -9999) {
            mouse.x += (mouse.targetX - mouse.x) * 0.08;
            mouse.y += (mouse.targetY - mouse.y) * 0.08;
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Hareket
            p.x += p.vx;
            p.y += p.vy;

            // Fareden kaçış / mikro rüzgar
            if (mouse.x !== -9999) {
                const dx = p.x - mouse.x;
                const dy = p.y - mouse.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 28000) { // ~167px
                    const dist = Math.sqrt(distSq);
                    const force = (1 - dist / 167) * 1.2;
                    p.x += (dx / dist) * force;
                    p.y += (dy / dist) * force;
                }
            }

            // Ekran sınırlarından döngü
            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
            if (p.y < -10) p.y = height + 10;
            if (p.y > height + 10) p.y = -10;

            // Nefes alma / nabız
            p.pulseAngle += p.pulseSpeed;
            const pulse = (Math.sin(p.pulseAngle) + 1) * 0.5;
            p.radius = p.baseRadius * (0.8 + pulse * 0.4);
            const currentAlpha = p.alpha * (0.6 + pulse * 0.5);

            // GPU Hızlandırmalı Donanım Çizimi (shadowBlur yok, çift halka glow)
            // 1. Dış Yumuşak Parlama Halesi
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * 2.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.rgb}, ${currentAlpha * 0.22})`;
            ctx.fill();

            // 2. İç Parlak Çekirdek
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.rgb}, ${currentAlpha})`;
            ctx.fill();
        }

        animationFrameId = requestAnimationFrame(render);
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
        mouse.targetX = e.clientX;
        mouse.targetY = e.clientY;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
        if (isVisible) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(render);
        } else {
            cancelAnimationFrame(animationFrameId);
        }
    });

    resize();
    render();
}

// --- 4. GELİŞMİŞ KADEMELİ SCROLL REVEAL (STAGGERED CHOREOGRAPHY) ---
function initScrollReveal() {
    const revealElements = document.querySelectorAll('[data-reveal]');
    if (!revealElements.length) return;

    // Otomatik Stagger Hesaplama: Aynı parent container içindeki elemanlara kademeli gecikme ekle
    const containerSelectors = ['.sz-wa-features-grid', '.sz-bento-grid', '.sz-steps-grid', '.sz-vs-grid', '.sz-trial-perks'];
    containerSelectors.forEach(selector => {
        const container = document.querySelector(selector);
        if (container) {
            const children = container.querySelectorAll('[data-reveal]');
            children.forEach((child, idx) => {
                if (!child.hasAttribute('data-delay')) {
                    child.setAttribute('data-delay', (idx * 75 + 50).toString());
                }
            });
        }
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
                setTimeout(() => {
                    el.classList.add('is-revealed');
                }, delay);
                observer.unobserve(el);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -30px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
}

// --- 5. 3D TILT & DİNAMİK SPOTLIGHT IŞILTISI MOTORU (OPTIMIZE) ---
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

    targetCards.forEach(card => {
        card.classList.add('sz-spotlight-card');

        // Dinamik Spotlight ve Luminous Border Katmanlarını Ekle
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

        function updateBounds() {
            bounds = card.getBoundingClientRect();
        }

        function onMouseEnter() {
            updateBounds();
            card.style.setProperty('--spotlight-opacity', '1');
            card.style.transition = 'transform 0.1s ease-out, box-shadow 0.25s ease';
        }

        function onMouseMove(e) {
            if (!bounds) updateBounds();
            const mouseX = e.clientX - bounds.left;
            const mouseY = e.clientY - bounds.top;

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    card.style.setProperty('--spotlight-x', `${mouseX}px`);
                    card.style.setProperty('--spotlight-y', `${mouseY}px`);

                    // 3D Tilt Hesaplama (-6 ile +6 derece)
                    const centerX = bounds.width / 2;
                    const centerY = bounds.height / 2;
                    const rotateX = ((mouseY - centerY) / centerY) * -5.5;
                    const rotateY = ((mouseX - centerX) / centerX) * 5.5;

                    card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(1)}deg) rotateY(${rotateY.toFixed(1)}deg) scale3d(1.012, 1.012, 1.012)`;
                    rafId = null;
                });
            }
        }

        function onMouseLeave() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            bounds = null;
            card.style.setProperty('--spotlight-opacity', '0');
            card.style.transition = 'transform 0.5s var(--sz-ease-spring), box-shadow 0.4s ease';
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        }

        card.addEventListener('mouseenter', onMouseEnter, { passive: true });
        card.addEventListener('mousemove', onMouseMove, { passive: true });
        card.addEventListener('mouseleave', onMouseLeave, { passive: true });
    });
}

// --- 6. MANYETİK BUTONLAR, LIQUID SHEEN & ORGANİK RIPPLE ---
function initMagneticButtons() {
    const buttons = document.querySelectorAll(`
        .sz-btn-hero-wa,
        .sz-cta-btn-huge,
        .sz-btn-trial-action,
        .sz-nav-actions .sz-btn,
        .sz-floating-wa,
        .sz-brand
    `);

    buttons.forEach(btn => {
        btn.classList.add('sz-btn-magnetic');

        // Organik Ripple Tıklama Dalgası
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
            setTimeout(() => ripple.remove(), 700);
        });

        // Masaüstünde Manyetik Çekim
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

                        const innerElements = btn.querySelectorAll('span, svg');
                        innerElements.forEach(el => {
                            el.style.transform = `translate3d(${(deltaX * 0.32).toFixed(1)}px, ${(deltaY * 0.32).toFixed(1)}px, 0)`;
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
                btn.style.transition = 'transform 0.4s var(--sz-ease-spring)';
                btn.style.transform = 'translate3d(0, 0, 0)';

                const innerElements = btn.querySelectorAll('span, svg');
                innerElements.forEach(el => {
                    el.style.transition = 'transform 0.4s var(--sz-ease-spring)';
                    el.style.transform = 'translate3d(0, 0, 0)';
                });

                setTimeout(() => {
                    btn.style.transition = '';
                    innerElements.forEach(el => el.style.transition = '');
                }, 400);
            }, { passive: true });
        }
    });
}

// --- 7. HERO ÇOK KATMANLI PARALAKS DERİNLİĞİ (UYKU MODU DESTEKLİ) ---
function initHeroParallax() {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const hero = document.querySelector('.sz-hero');
    const heroContent = document.querySelector('.sz-hero-content');
    const heroSim = document.querySelector('.sz-sim-wrapper');
    const orbs = document.querySelectorAll('.sz-ambient-orb');

    if (!hero || !heroContent || !heroSim) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = null;
    let isHoveringHero = false;

    function renderParallax() {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;

        // Metin sol bloğu (Ters yönde süzülme)
        heroContent.style.transform = `translate3d(${(-currentX * 10).toFixed(1)}px, ${(-currentY * 10).toFixed(1)}px, 0)`;

        // Simülasyon paneli (Derinlikli yönde süzülme + mikro açı)
        heroSim.style.transform = `translate3d(${(currentX * 14).toFixed(1)}px, ${(currentY * 14).toFixed(1)}px, 0) rotateY(${(currentX * 3.0).toFixed(1)}deg) rotateX(${(-currentY * 3.0).toFixed(1)}deg)`;

        // Arka plan ışık orbları (Geniş açı paralaksı)
        if (orbs.length) {
            orbs[0].style.transform = `translate3d(${(currentX * 30).toFixed(1)}px, ${(currentY * 30).toFixed(1)}px, 0)`;
            if (orbs[1]) orbs[1].style.transform = `translate3d(${(-currentX * 24).toFixed(1)}px, ${(-currentY * 24).toFixed(1)}px, 0)`;
            if (orbs[2]) orbs[2].style.transform = `translate3d(${(currentX * 18).toFixed(1)}px, ${(currentY * 18).toFixed(1)}px, 0)`;
        }

        // AKILLI UYKU KONTROLÜ: Fare ayrıldıktan sonra merkeze oturunca döngüyü DURDUR!
        if (isHoveringHero || Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
            rafId = requestAnimationFrame(renderParallax);
        } else {
            rafId = null;
        }
    }

    hero.addEventListener('mouseenter', () => {
        isHoveringHero = true;
        if (!rafId) rafId = requestAnimationFrame(renderParallax);
    }, { passive: true });

    hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        targetX = Math.max(-1, Math.min(1, x));
        targetY = Math.max(-1, Math.min(1, y));

        if (!rafId) {
            rafId = requestAnimationFrame(renderParallax);
        }
    }, { passive: true });

    hero.addEventListener('mouseleave', () => {
        isHoveringHero = false;
        targetX = 0;
        targetY = 0;
        // renderParallax merkeze dönene kadar bir süre daha çalışıp otomatik kapanacak
    }, { passive: true });
}

// --- 8. SÜRPRİZ MİKRO-ETKİLEŞİMLER (BENTO, GÜVEN ROZETLERİ, SİMGELER) ---
function initMicroInteractions() {
    // 1. Güven ve Avantaj İkonlarına Hover Etkileşimi
    const trustItems = document.querySelectorAll('.sz-trust-item, .sz-trial-perk-item');
    trustItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const icon = item.querySelector('svg, .sz-trial-perk-icon');
            if (icon) {
                icon.style.transition = 'transform 0.35s var(--sz-ease-bounce)';
                icon.style.transform = 'scale(1.22) rotate(6deg)';
            }
        });
        item.addEventListener('mouseleave', () => {
            const icon = item.querySelector('svg, .sz-trial-perk-icon');
            if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
            }
        });
    });

    // 2. Bento Grid Dairesel İlerleme (Circle Progress) Etkileşimi
    const circleProgress = document.querySelector('.sz-circle-progress');
    if (circleProgress) {
        circleProgress.addEventListener('mouseenter', () => {
            circleProgress.style.transition = 'transform 0.45s var(--sz-ease-bounce), box-shadow 0.45s ease';
            circleProgress.style.transform = 'scale(1.08) rotate(10deg)';
            circleProgress.style.boxShadow = '0 0 20px rgba(184, 134, 11, 0.35)';
        });
        circleProgress.addEventListener('mouseleave', () => {
            circleProgress.style.transform = 'scale(1) rotate(0deg)';
            circleProgress.style.boxShadow = '';
        });
    }

    // 3. Bento Grid Finans Sayıları Parlaması
    const finStats = document.querySelectorAll('.sz-fin-stat');
    finStats.forEach(stat => {
        stat.addEventListener('mouseenter', () => {
            const strong = stat.querySelector('strong');
            if (strong) {
                strong.style.transition = 'transform 0.25s var(--sz-ease-bounce), text-shadow 0.25s ease';
                strong.style.transform = 'scale(1.06)';
                strong.style.textShadow = '0 0 10px rgba(184, 134, 11, 0.25)';
            }
        });
        stat.addEventListener('mouseleave', () => {
            const strong = stat.querySelector('strong');
            if (strong) {
                strong.style.transform = 'scale(1)';
                strong.style.textShadow = '';
            }
        });
    });
}

// --- 9. AUTH KONTROLÜ (GİRİŞ YAPMIŞSA PANELE YÖNLENDİR) ---
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

// --- 10. HEADER SCROLL ETKİSİ ---
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

// --- 11. CANLI WHATSAPP & TAKVİM SİMÜLASYONU MOTORU ---
function initLiveSimulation() {
    const chatBody = document.querySelector('.sz-wa-chat-body');
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
        if (chatBody && msg2) {
            chatBody.insertBefore(typing, msg2);
        }
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

        // Adım 2: Bot yazıyor... (Müsait saatleri önermek için)
        setTimeout(() => {
            if (chatBody && msg2) {
                chatBody.insertBefore(typing, msg2);
            }
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

        // Adım 5: Bot yazıyor... (Randevu onayı için en altta)
        setTimeout(() => {
            if (chatBody && msg4) {
                chatBody.insertBefore(typing, msg4);
            }
            typing.classList.add('is-active');
        }, 5500);

        // Adım 6: Bot onay şablonunu gönderir
        setTimeout(() => {
            typing.classList.remove('is-active');
            msg4.classList.add('is-visible');

            // Takvime canlı işlenir & Işıltı patlaması
            calSlot.classList.add('has-booking');
            calSlot.innerHTML = `
                <div class="sz-slot-client">
                    <span>14:00 - 15:00</span>
                    <span style="background:var(--sz-emerald); color:#fff; font-size:0.65rem; padding:1px 6px; border-radius:999px;">Onaylandı</span>
                </div>
                <div style="font-weight:700; color:var(--sz-ink-primary);">Sevil K. (0532 *** **)</div>
                <div class="sz-slot-service">Cilt Bakımı • Seans 3/8</div>
            `;
            if (calKpi) {
                calKpi.textContent = '8';
                calKpi.style.animation = 'pulse 0.6s ease';
                setTimeout(() => {
                    if (calKpi) calKpi.style.animation = '';
                }, 600);
            }
        }, 6800);

        // Adım 7: 13 saniye sonra tekrar başa sarar
        setTimeout(runSimulationStep, 13000);
    }

    // İlk çalıştırma
    runSimulationStep();
}

// --- 12. TÜM WHATSAPP DÜĞMELERİNİ YÖNLENDİRME ---
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
    initScrollProgressBar();
    initPreloader();
    initAtmosphericCanvas();
    initScrollReveal();
    init3DTiltAndSpotlight();
    initMagneticButtons();
    initHeroParallax();
    initMicroInteractions();
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
