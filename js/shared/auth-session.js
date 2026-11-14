// ==========================================
// AUTH SESSION MANAGEMENT (Shared)
// ==========================================

import { CONFIG } from './config.js';

const SESSION_KEYS = [
    'user_token',
    'tenant_id',
    'salon_adi',
    'auth_token',
    'auth_session',
];

function getApiV1Base() {
    const apiBase = CONFIG?.API_BASE || '';
    if (apiBase.includes('/webhook/')) {
        return apiBase.replace(/\/webhook\/?$/, '/api/v1');
    }
    if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
        const host = window.location.hostname || '';
        if (['localhost', '127.0.0.1', ''].includes(host) && window.location.port !== '3000') {
            return 'http://localhost:3000/api/v1';
        }
        return `${window.location.origin}/api/v1`;
    }
    return '/api/v1';
}

let inFlightVerify = null;
let lastVerifiedAt = 0;
const VERIFY_CACHE_MS = 10000;

function isSamePage(target) {
    if (typeof window === 'undefined' || !window.location?.pathname) return false;
    const current = window.location.pathname.split('/').pop() || '';
    const targetFile = String(target || '').split('/').pop().split('?')[0];
    return Boolean(targetFile) && current === targetFile;
}

export function getToken() {
    return '';
}

export function getTenantId() {
    return sessionStorage.getItem('tenant_id') || '';
}

export function isAuthenticated() {
    return Boolean(getTenantId());
}

/**
 * Yerel tenant_id ile backend HttpOnly cookie oturumunu senkronize doğrular.
 * 401/403 yanıtında yerel oturum bilgisini temizler; geçici ağ hatalarında döngü yaratmamak için mevcut durumu korur.
 */
export async function verifySession({ force = false } = {}) {
    const tenantId = getTenantId();
    if (!tenantId) {
        lastVerifiedAt = 0;
        return false;
    }

    const now = Date.now();
    if (!force && lastVerifiedAt && (now - lastVerifiedAt) < VERIFY_CACHE_MS) {
        return true;
    }

    if (inFlightVerify) {
        return inFlightVerify;
    }

    inFlightVerify = (async () => {
        try {
            const res = await fetch(`${getApiV1Base()}/settings`, {
                method: 'GET',
                credentials: 'include',
                headers: { 'x-tenant-id': tenantId },
            });

            if (res.status === 401 || res.status === 403) {
                clearSession();
                return false;
            }

            if (res.ok) {
                lastVerifiedAt = Date.now();
                return true;
            }

            return Boolean(getTenantId());
        } catch {
            // Ağ hatasında sahte logout / yönlendirme döngüsü oluşturma
            return Boolean(getTenantId());
        } finally {
            inFlightVerify = null;
        }
    })();

    return inFlightVerify;
}

export function setSession({ tenantId, tenant_id, salonAdi, salon_adi } = {}) {
    const resolvedTenantId = tenantId ?? tenant_id;
    const resolvedSalonAdi = salonAdi ?? salon_adi;

    // Eski localStorage token kalıntılarını temizle (JWT yalnızca HttpOnly cookie'de taşınır)
    localStorage.removeItem('user_token');
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_token');
    sessionStorage.removeItem('auth_token');

    if (resolvedTenantId) sessionStorage.setItem('tenant_id', String(resolvedTenantId));
    if (resolvedSalonAdi !== undefined && resolvedSalonAdi !== null) {
        sessionStorage.setItem('salon_adi', String(resolvedSalonAdi));
    }
    lastVerifiedAt = 0;
}

export function saveSession(_token, tenantId, salonAdi) {
    setSession({ tenantId, salonAdi });
}

export function clearSession() {
    lastVerifiedAt = 0;
    SESSION_KEYS.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
}

export async function logoutUser(redirectTo = 'login.html') {
    try {
        await fetch(`${getApiV1Base()}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    } catch {
        // Ağ hatasında da yerel oturum metadata'sı temizlenir
    }
    clearSession();
    if (!isSamePage(redirectTo)) {
        window.location.href = redirectTo;
    }
}

export function requireAuth(redirectTo = 'login.html') {
    if (!isAuthenticated()) {
        if (!isSamePage(redirectTo)) {
            window.location.href = redirectTo;
        }
        return false;
    }

    verifySession().then((valid) => {
        if (!valid && !isSamePage(redirectTo)) {
            window.location.href = redirectTo;
        }
    });

    return true;
}

export function redirectIfAuthenticated(redirectTo = 'dashboard.html') {
    if (!isAuthenticated()) {
        return false;
    }

    verifySession().then((valid) => {
        if (valid && !isSamePage(redirectTo)) {
            window.location.href = redirectTo;
        }
    });

    return true;
}
