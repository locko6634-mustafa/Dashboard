// ==========================================
// AUTH SESSION MANAGEMENT (Shared)
// ==========================================

export function getToken() {
    return localStorage.getItem('user_token') || '';
}

export function getTenantId() {
    return localStorage.getItem('tenant_id') || '';
}

export function isAuthenticated() {
    return Boolean(getToken() && getTenantId());
}

export function saveSession(token, tenantId) {
    if (token) localStorage.setItem('user_token', token);
    if (tenantId) localStorage.setItem('tenant_id', tenantId);
}

export function clearSession() {
    localStorage.removeItem('user_token');
    localStorage.removeItem('tenant_id');
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
