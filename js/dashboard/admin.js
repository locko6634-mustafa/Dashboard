// ==========================================
// SALONZEKA - SUPER ADMIN DASHBOARD LOGIC
// ==========================================

const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocal 
  ? 'http://localhost:3000/api/v1' 
  : (typeof window !== 'undefined' && window.location.origin.startsWith('http') 
      ? window.location.origin + '/api/v1' 
      : 'https://randevu.n8n-mustafa.me/api/v1');

const STORAGE_KEYS = {
  ADMIN_TOKEN: 'sz_super_admin_token',
  ADMIN_USER: 'sz_super_admin_user',
};

// Global State
let currentTenants = [];

// DOM Elements
const adminSetupSection = document.getElementById('adminSetupSection');
const adminLoginSection = document.getElementById('adminLoginSection');
const adminDashboardSection = document.getElementById('adminDashboardSection');

const formAdminSetup = document.getElementById('formAdminSetup');
const formAdminLogin = document.getElementById('formAdminLogin');
const btnAdminLogout = document.getElementById('btnAdminLogout');

// Dashboard DOM Elements
const adminHeaderName = document.getElementById('adminHeaderName');
const adminHeaderEmail = document.getElementById('adminHeaderEmail');
const kpiTotalTenants = document.getElementById('kpiTotalTenants');
const kpiActiveTenants = document.getElementById('kpiActiveTenants');
const kpiTotalClients = document.getElementById('kpiTotalClients');
const kpiTotalAppointments = document.getElementById('kpiTotalAppointments');
const kpiRecentAppointments = document.getElementById('kpiRecentAppointments');
const tenantsTableBody = document.getElementById('tenantsTableBody');
const inputSearchTenants = document.getElementById('inputSearchTenants');
const selectStatusFilter = document.getElementById('selectStatusFilter');

// Modal DOM Elements
const modalTenant = document.getElementById('modalTenant');
const formTenantModal = document.getElementById('formTenantModal');
const btnOpenNewTenantModal = document.getElementById('btnOpenNewTenantModal');
const btnCloseTenantModal = document.getElementById('btnCloseTenantModal');
const btnCancelTenantModal = document.getElementById('btnCancelTenantModal');
const modalTenantTitle = document.getElementById('modalTenantTitle');
const tenantEditId = document.getElementById('tenantEditId');
const tenantSalonAdi = document.getElementById('tenantSalonAdi');
const tenantEmail = document.getElementById('tenantEmail');
const tenantPassword = document.getElementById('tenantPassword');
const lblTenantPassword = document.getElementById('lblTenantPassword');
const helpPasswordNote = document.getElementById('helpPasswordNote');
const tenantWhatsapp = document.getElementById('tenantWhatsapp');
const tenantWebhook = document.getElementById('tenantWebhook');
const tenantChatwoot = document.getElementById('tenantChatwoot');
const tenantPlan = document.getElementById('tenantPlan');
const tenantDurum = document.getElementById('tenantDurum');
const tenantBitisTarihi = document.getElementById('tenantBitisTarihi');

// Yardımcı: Token Alma
function getAdminToken() {
  return localStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN);
}

// Yardımcı: HTTP Fetch Wrapper
async function adminFetch(endpoint, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      if (token) {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
        showScreen('login');
      }
    }
    throw new Error(data.error || data.message || 'İşlem sırasında sunucu hatası oluştu');
  }

  return data;
}

// Ekran Değiştirici
function showScreen(screen) {
  adminSetupSection.style.display = 'none';
  adminLoginSection.style.display = 'none';
  adminDashboardSection.style.display = 'none';

  if (screen === 'setup') {
    adminSetupSection.style.display = 'flex';
  } else if (screen === 'login') {
    adminLoginSection.style.display = 'flex';
  } else if (screen === 'dashboard') {
    adminDashboardSection.style.display = 'flex';
  }
}

// 1. BAŞLANGIÇ KONTROLÜ (INIT)
async function init() {
  try {
    const statusData = await adminFetch('/admin/setup-status');
    if (statusData.needsSetup) {
      showScreen('setup');
      return;
    }

    const token = getAdminToken();
    if (!token) {
      showScreen('login');
      return;
    }

    // Admin oturumu var, kullanıcı bilgilerini güncelle
    const savedUser = JSON.parse(localStorage.getItem(STORAGE_KEYS.ADMIN_USER) || '{}');
    if (adminHeaderName && savedUser.ad_soyad) adminHeaderName.textContent = savedUser.ad_soyad;
    if (adminHeaderEmail && savedUser.email) adminHeaderEmail.textContent = savedUser.email;

    showScreen('dashboard');
    await loadDashboardData();
  } catch (err) {
    console.error('Init error:', err);
    showScreen('login');
  }
}

// 2. DASHBOARD VERİLERİNİ YÜKLE
async function loadDashboardData() {
  await Promise.all([loadStats(), loadTenants()]);
}

async function loadStats() {
  try {
    const data = await adminFetch('/admin/stats');
    if (data.success && data.stats) {
      const s = data.stats;
      kpiTotalTenants.textContent = s.totalTenants ?? 0;
      kpiActiveTenants.textContent = s.activeTenants ?? 0;
      kpiTotalClients.textContent = s.totalClients ?? 0;
      kpiTotalAppointments.textContent = s.totalAppointments ?? 0;
      kpiRecentAppointments.textContent = `Son 30 günde: ${s.recentAppointments ?? 0} randevu`;
    }
  } catch (err) {
    console.warn('Stats fetch error:', err);
  }
}

async function loadTenants() {
  try {
    const search = inputSearchTenants?.value.trim() || '';
    const durum = selectStatusFilter?.value || 'Tümü';
    
    let url = `/admin/tenants?durum=${encodeURIComponent(durum)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const data = await adminFetch(url);
    if (data.success) {
      currentTenants = data.tenants || [];
      renderTenantsTable(currentTenants);
    }
  } catch (err) {
    console.error('Tenants fetch error:', err);
    tenantsTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">İşletmeler yüklenirken hata oluştu: ${err.message}</td></tr>`;
  }
}

// 3. İŞLETMELER TABLOSUNU ÇİZ
function renderTenantsTable(tenants) {
  if (!tenants || tenants.length === 0) {
    tenantsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #9ca3af;">Kayıtlı işletme bulunamadı.</td></tr>`;
    return;
  }

  tenantsTableBody.innerHTML = tenants.map(t => {
    const isActive = t.durum === 'Aktif';
    const badgeClass = isActive ? 'admin-badge-active' : 'admin-badge-suspended';
    const bitisStr = t.plan_bitis_tarihi 
      ? new Date(t.plan_bitis_tarihi).toLocaleDateString('tr-TR') 
      : 'Süresiz';

    const apiKeyShort = t.api_key ? (t.api_key.substring(0, 12) + '...') : '-';

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(t.salon_adi)}</div>
          <small style="color: #9ca3af; font-size: 0.76rem;">ID: ${t.id}</small>
        </td>
        <td>
          <div>${escapeHtml(t.email)}</div>
        </td>
        <td>
          <span style="font-family: var(--font-mono, monospace); font-size: 0.85rem;">
            ${t.whatsapp_phone ? escapeHtml(t.whatsapp_phone) : '<span style="color:#6b7280;">Tanımsız</span>'}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <code style="font-size: 0.78rem; background: rgba(255,255,255,0.06); padding: 3px 6px; border-radius: 6px;">${apiKeyShort}</code>
            ${t.api_key ? `<button class="admin-action-btn" style="padding: 2px 6px; font-size: 0.72rem;" onclick="copyApiKey('${t.api_key}')" title="Kopyala">Kopyala</button>` : ''}
          </div>
        </td>
        <td>
          <span class="admin-badge admin-badge-plan">${escapeHtml(t.plan_tipi || 'Standart')}</span>
          <div style="font-size: 0.74rem; color: #9ca3af; margin-top: 4px;">Bitiş: ${bitisStr}</div>
        </td>
        <td>
          <div style="font-size: 0.82rem;">👥 <strong>${t.client_count ?? 0}</strong> müşteri</div>
          <div style="font-size: 0.82rem; color: #9ca3af;">📅 <strong>${t.appointment_count ?? 0}</strong> randevu</div>
        </td>
        <td>
          <span class="admin-badge ${badgeClass}">${escapeHtml(t.durum || 'Aktif')}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
            <button class="admin-action-btn admin-action-impersonate" onclick="impersonateTenant('${t.id}')" title="İşletmenin Paneline Giriş Yap">
              ⚡ Giriş Yap
            </button>
            <button class="admin-action-btn" onclick="openEditTenantModal('${t.id}')" title="Düzenle">
              Düzenle
            </button>
            <button class="admin-action-btn" onclick="toggleTenantStatus('${t.id}', '${t.durum}')" title="Durum Değiştir">
              ${isActive ? 'Dondur' : 'Aktif Et'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 4. FORMLAR & ETKİLEŞİMLER
// İlk Kurulum
formAdminSetup?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ad_soyad = document.getElementById('setupName')?.value.trim();
  const email = document.getElementById('setupEmail')?.value.trim();
  const password = document.getElementById('setupPassword')?.value;
  const btn = document.getElementById('btnSubmitSetup');

  if (!ad_soyad || !email || !password) return;

  btn.disabled = true;
  btn.textContent = 'Kuruluyor...';

  try {
    const res = await fetch(`${API_BASE}/admin/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_soyad, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Kurulum başarısız');

    localStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, data.token);
    localStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify(data.admin));

    alert('Süper Admin hesabı başarıyla oluşturuldu!');
    showScreen('dashboard');
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sistemi Başlat & Hesabı Oluştur';
  }
});

// Admin Login
formAdminLogin?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  const btn = document.getElementById('btnSubmitLogin');

  if (!email || !password) return;

  btn.disabled = true;
  btn.textContent = 'Giriş Yapılıyor...';

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Giriş yapılamadı');

    localStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, data.token);
    localStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify(data.admin));

    showScreen('dashboard');
    if (adminHeaderName && data.admin.ad_soyad) adminHeaderName.textContent = data.admin.ad_soyad;
    if (adminHeaderEmail && data.admin.email) adminHeaderEmail.textContent = data.admin.email;
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Yönetim Konsoluna Giriş Yap';
  }
});

// Çıkış Yap
btnAdminLogout?.addEventListener('click', () => {
  if (confirm('Süper Admin oturumunu kapatmak istediğinize emin misiniz?')) {
    localStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
    showScreen('login');
  }
});

// Arama & Filtreleme Dinleyicileri
let searchDebounceTimeout = null;
inputSearchTenants?.addEventListener('input', () => {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(loadTenants, 300);
});

selectStatusFilter?.addEventListener('change', loadTenants);

// 5. MODAL İŞLEMLERİ
function openNewTenantModal() {
  modalTenantTitle.textContent = 'Yeni İşletme Kaydet';
  tenantEditId.value = '';
  formTenantModal.reset();
  tenantPassword.required = true;
  lblTenantPassword.textContent = 'Giriş Şifresi *';
  helpPasswordNote.textContent = 'Yeni oluştururken zorunludur.';
  modalTenant.classList.remove('hidden');
}

window.openEditTenantModal = function(id) {
  const tenant = currentTenants.find(t => t.id === id);
  if (!tenant) return;

  modalTenantTitle.textContent = 'İşletmeyi Düzenle: ' + tenant.salon_adi;
  tenantEditId.value = tenant.id;
  tenantSalonAdi.value = tenant.salon_adi || '';
  tenantEmail.value = tenant.email || '';
  tenantPassword.value = '';
  tenantPassword.required = false;
  lblTenantPassword.textContent = 'Yeni Şifre (Boş bırakılabilir)';
  helpPasswordNote.textContent = 'Yalnızca şifreyi güncellemek istiyorsanız doldurun.';
  tenantWhatsapp.value = tenant.whatsapp_phone || '';
  tenantWebhook.value = tenant.n8n_webhook_url || '';
  tenantChatwoot.value = tenant.chatwoot_inbox_id || '';
  tenantPlan.value = tenant.plan_tipi || 'Standart';
  tenantDurum.value = tenant.durum || 'Aktif';
  
  if (tenant.plan_bitis_tarihi) {
    tenantBitisTarihi.value = new Date(tenant.plan_bitis_tarihi).toISOString().split('T')[0];
  } else {
    tenantBitisTarihi.value = '';
  }

  modalTenant.classList.remove('hidden');
};

function closeTenantModal() {
  modalTenant.classList.add('hidden');
}

btnOpenNewTenantModal?.addEventListener('click', openNewTenantModal);
btnCloseTenantModal?.addEventListener('click', closeTenantModal);
btnCancelTenantModal?.addEventListener('click', closeTenantModal);

// Modal Submit (Oluştur veya Güncelle)
formTenantModal?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = tenantEditId.value;
  const isEdit = Boolean(id);

  const payload = {
    salon_adi: tenantSalonAdi.value.trim(),
    email: tenantEmail.value.trim(),
    whatsapp_phone: tenantWhatsapp.value.trim() || undefined,
    n8n_webhook_url: tenantWebhook.value.trim() || undefined,
    chatwoot_inbox_id: tenantChatwoot.value.trim() || undefined,
    plan_tipi: tenantPlan.value,
    durum: tenantDurum.value,
    plan_bitis_tarihi: tenantBitisTarihi.value || undefined,
  };

  if (tenantPassword.value) {
    payload.password = tenantPassword.value;
  }

  const btn = document.getElementById('btnSaveTenant');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';

  try {
    if (isEdit) {
      await adminFetch(`/admin/tenants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      alert('İşletme başarıyla güncellendi.');
    } else {
      if (!payload.password) throw new Error('Yeni işletme için şifre zorunludur');
      await adminFetch('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      alert('Yeni işletme başarıyla kaydedildi.');
    }

    closeTenantModal();
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'İşletmeyi Kaydet';
  }
});

// 6. TEK TIKLA GİRİŞ (IMPERSONATION)
window.impersonateTenant = async function(id) {
  const tenant = currentTenants.find(t => t.id === id);
  const confirmMsg = `"${tenant?.salon_adi || 'Bu işletme'}" paneline yönetici olarak geçiş yapmak istediğinize emin misiniz?`;
  if (!confirm(confirmMsg)) return;

  try {
    const data = await adminFetch(`/admin/tenants/${id}/impersonate`, { method: 'POST' });
    if (data.success && data.token) {
      // Normal salon oturumu olarak kaydet (auth-session.js tam uyumlu)
      localStorage.setItem('user_token', data.token);
      localStorage.setItem('tenant_id', data.tenant_id);
      localStorage.setItem('salon_adi', data.salon_adi || '');
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_session', JSON.stringify({
        token: data.token,
        tenant_id: data.tenant_id,
        salon_adi: data.salon_adi,
        email: data.email,
        login_time: new Date().toISOString(),
      }));

      // Yeni sekmede salon dashboard'unu aç
      window.open('dashboard.html', '_blank');
    }
  } catch (err) {
    alert('İşletme paneline bağlanırken hata oluştu: ' + err.message);
  }
};

// 7. DURUM DEĞİŞTİRME (AKTİF / DONDUR)
window.toggleTenantStatus = async function(id, currentStatus) {
  const newStatus = currentStatus === 'Aktif' ? 'Askıda' : 'Aktif';
  const msg = `Bu işletmeyi "${newStatus}" durumuna getirmek istediğinize emin misiniz?`;
  if (!confirm(msg)) return;

  try {
    await adminFetch(`/admin/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ durum: newStatus }),
    });
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
};

// 8. API KEY KOPYALAMA
window.copyApiKey = function(apiKey) {
  navigator.clipboard.writeText(apiKey).then(() => {
    alert('API Key panoya kopyalandı:\n' + apiKey);
  }).catch(() => {
    prompt('API Key:', apiKey);
  });
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Uygulamayı Başlat
document.addEventListener('DOMContentLoaded', init);
