// ==========================================
// AUTH SESSION MANAGEMENT (Shared)
// ==========================================

const SESSION_KEYS = [
    'user_token',
    'tenant_id',
    'salon_adi',
    'auth_token',
    'auth_session',
];

export function getToken() {
    return localStorage.getItem('user_token') || '';
}

export function getTenantId() {
    return localStorage.getItem('tenant_id') || '';
}

export function isAuthenticated() {
    return Boolean(getToken() && getTenantId());
}

export function setSession({ token, tenantId, tenant_id, salonAdi, salon_adi } = {}) {
    const resolvedTenantId = tenantId ?? tenant_id;
    const resolvedSalonAdi = salonAdi ?? salon_adi;

    if (token) localStorage.setItem('user_token', token);
    if (resolvedTenantId) localStorage.setItem('tenant_id', resolvedTenantId);
    if (resolvedSalonAdi !== undefined && resolvedSalonAdi !== null) {
        localStorage.setItem('salon_adi', String(resolvedSalonAdi));
    }
}

export function saveSession(token, tenantId, salonAdi) {
    setSession({ token, tenantId, salonAdi });
}

export function clearSession() {
    SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function logoutUser(redirectTo = 'login.html') {
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
