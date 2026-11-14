// ==========================================
// API CLIENT (Shared ApiService & Fetch Wrapper)
// ==========================================

import { CONFIG } from './config.js';
import { showToast } from './toast.js';
import { getTenantId, clearSession } from './auth-session.js';

let isRedirectingToLogin = false;

function hideLoadingElement(loadingId) {
    if (!loadingId || typeof document === 'undefined') return;
    const el = document.getElementById(loadingId);
    if (el) el.classList.add('hidden');
}

function redirectToLoginOnce(message, shouldClearSession = false) {
    if (isRedirectingToLogin) return;
    isRedirectingToLogin = true;
    if (shouldClearSession) {
        clearSession();
    }
    showToast(message, 'error', 8000);
    setTimeout(() => {
        if (typeof window !== 'undefined') {
            window.location.href = 'login.html';
        }
    }, 1000);
}

export class ApiService {
    /**
     * Merkezi API istemcisi.
     * Sözleşme:
     * - `returnData: true` iken başarıda `string` (`isText: true`) veya JSON `object|Array|null` (boş gövde) döner.
     * - `returnData: false` iken başarıda `true` döner.
     * - Tüm hata, zaman aşımı, iptal ve yetkisiz (401/403) durumlarında tutarlı olarak `null` döner.
     */
    static call = async (endpoint, options = {}) => {
        if (isRedirectingToLogin) {
            return null;
        }

        const {
            payload = null,
            method = 'POST',
            loadingId = null,
            reloadOnSuccess = false,
            returnData = false,
            isText = false,
            signal = null,
            apiKey = null,
            customErrorMsg = CONFIG.UI.MSG_API_ERROR
        } = options;

        const tenantId = getTenantId();

        if (!tenantId) {
            redirectToLoginOnce('Oturum bulunamadı! Lütfen giriş yapın.');
            return null;
        }

        if (loadingId && typeof document !== 'undefined') {
            const el = document.getElementById(loadingId);
            if (el) el.classList.remove('hidden');
        }

        const controller = new AbortController();
        const timeoutTime = (CONFIG.TIMERS && CONFIG.TIMERS.API_TIMEOUT) ? CONFIG.TIMERS.API_TIMEOUT : 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutTime);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'x-tenant-id': tenantId
            };
            if (apiKey) {
                headers['x-api-key'] = apiKey;
            }

            const fetchOpts = {
                method,
                headers,
                credentials: 'include'
            };
            if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                fetchOpts.body = JSON.stringify(payload);
            }

            if (signal && typeof AbortSignal !== 'undefined' && AbortSignal.any) {
                fetchOpts.signal = AbortSignal.any([signal, controller.signal]);
            } else if (signal) {
                fetchOpts.signal = signal;
            } else {
                fetchOpts.signal = controller.signal;
            }

            const res = await fetch(CONFIG.API_BASE + endpoint, fetchOpts);
            clearTimeout(timeoutId);

            const resText = await res.text().catch(() => '');

            if (!res.ok) {
                if (res.status === 401 || res.status === 403 || resText.includes('API Token geçersiz') || resText.includes('Yetkisiz')) {
                    hideLoadingElement(loadingId);
                    redirectToLoginOnce('Oturum süresi doldu! Güvenliğiniz için yönlendiriliyorsunuz.', true);
                    return null;
                }
                let serverMsg = '';
                if (resText) {
                    try {
                        const parsedErr = JSON.parse(resText);
                        serverMsg = parsedErr?.error || parsedErr?.message || '';
                    } catch {
                        serverMsg = resText.trim();
                    }
                }
                const err = new Error(serverMsg || `HTTP ${res.status}`);
                err.status = res.status;
                throw err;
            }

            let parsedData = null;
            if (resText) {
                try {
                    parsedData = JSON.parse(resText);
                } catch (e) {
                    console.error('JSON Parse Error:', e);
                    if (!isText) {
                        throw new Error('Sunucudan geçersiz JSON yanıtı alındı.');
                    }
                }
            }

            if (parsedData && typeof parsedData === 'object' && parsedData.error) {
                console.error('Backend Error:', parsedData.error);
                throw new Error(typeof parsedData.error === 'string' ? parsedData.error : 'Backend Hatası');
            }

            hideLoadingElement(loadingId);
            if (reloadOnSuccess) location.reload();
            if (returnData) return isText ? resText : parsedData;
            return true;
        } catch (e) {
            clearTimeout(timeoutId);
            hideLoadingElement(loadingId);

            if (isRedirectingToLogin) {
                return null;
            }

            if (e.name === 'AbortError') {
                if (customErrorMsg) showToast('Bağlantı zaman aşımına uğradı. Lütfen internetinizi kontrol edin.', 'error');
                return null;
            }

            const errorMsg = (e.message && e.message !== 'Failed to fetch')
                ? e.message
                : customErrorMsg;

            if (errorMsg) showToast(errorMsg, 'error');
            return null;
        }
    };
}

export const apiRequest = ApiService.call;
export default ApiService;
