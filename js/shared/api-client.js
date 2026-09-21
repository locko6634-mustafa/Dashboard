// ==========================================
// API CLIENT (Shared ApiService & Fetch Wrapper)
// ==========================================

import { CONFIG } from './config.js';
import { showToast } from './toast.js';
import { getToken, getTenantId, clearSession } from './auth-session.js';

export class ApiService {
    static call = async (endpoint, options = {}) => {
        const { 
            payload = null, 
            method = 'POST', 
            loadingId = null, 
            reloadOnSuccess = false, 
            returnData = false, 
            isText = false, 
            signal = null, 
            customErrorMsg = CONFIG.UI.MSG_API_ERROR 
        } = options;
        
        const currentToken = getToken();
        const tenantId = getTenantId();
        
        if (!currentToken || !tenantId) {
            showToast('Oturum bulunamadı! Lütfen giriş yapın.', 'error', 8000);
            setTimeout(() => window.location.href = 'login.html', 1000);
            return null;
        }

        if (loadingId) {
            const el = document.getElementById(loadingId);
            if (el) el.classList.remove('hidden');
        }

        const controller = new AbortController();
        const timeoutTime = (CONFIG.TIMERS && CONFIG.TIMERS.API_TIMEOUT) ? CONFIG.TIMERS.API_TIMEOUT : 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutTime);

        try {
            const fetchOpts = { 
                method, 
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-api-key': currentToken, 
                    'Authorization': 'Bearer ' + currentToken,
                    'x-tenant-id': tenantId
                } 
            };
            if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                fetchOpts.body = JSON.stringify(payload);
            }
            
            if (signal && window.AbortSignal && AbortSignal.any) {
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
                    showToast('Oturum süresi doldu! Güvenliğiniz için yönlendiriliyorsunuz.', 'error', 8000);
                    clearSession();
                    setTimeout(() => window.location.href = 'login.html', 1000);
                    return null;
                }
                throw new Error('HTTP_ERROR');
            }
            
            let parsedData = null;
            if (resText) {
                try { parsedData = JSON.parse(resText); } catch(e) {}
            }
            
            if (parsedData && typeof parsedData === 'object' && parsedData.error) {
                console.error('Backend Error:', parsedData.error);
                throw new Error(typeof parsedData.error === 'string' ? parsedData.error : 'Backend Hatası');
            }

            if (reloadOnSuccess) location.reload();
            if (returnData) return isText ? resText : (parsedData || {});
            return true;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                if (loadingId) {
                    const el = document.getElementById(loadingId);
                    if (el) el.classList.add('hidden');
                }
                if (customErrorMsg) showToast('Bağlantı zaman aşımına uğradı. Lütfen internetinizi kontrol edin.', 'error');
                return null;
            }
            if (loadingId) {
                const el = document.getElementById(loadingId);
                if (el) el.classList.add('hidden');
            }
            
            const errorMsg = (e.message && e.message !== 'HTTP_ERROR' && e.message !== 'Failed to fetch') 
                ? e.message 
                : customErrorMsg;
                
            if (errorMsg) showToast(errorMsg, 'error');
            return false;
        }
    };
}

export const apiRequest = ApiService.call;
export default ApiService;
