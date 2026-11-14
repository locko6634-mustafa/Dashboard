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

export function getToken() {
    return '';
}

export function getTenantId() {
    return sessionStorage.getItem('tenant_id') || '';
}

export function isAuthenticated() {
    return Boolean(getTenantId());
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
}

export function saveSession(_token, tenantId, salonAdi) {
    setSession({ tenantId, salonAdi });
}

export function clearSession() {
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
    window.location.href = redirectTo;
}

export function requireAuth(redirectTo = 'login.html') {
    if (!isAuthenticated()) {
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

export function redirectIfAuthenticated(redirectTo = 'dashboard.html') {
    if (isAuthenticated()) {
        window.location.href = redirectTo;
        return true;
    }
    return false;
}
