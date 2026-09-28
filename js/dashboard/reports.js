import { CONFIG } from '../shared/config.js';
import { Utils, DateUtils } from '../shared/utils.js';
import { showToast } from '../shared/toast.js';
import { ApiService } from '../shared/api-client.js';
import { Store } from './store.js';
import { DOM } from './dom.js';

class ReportsManager {
    static isInitialized = false;

    /**
     * Raporlama sekmesini ilklendirir.
     */
    static initReports() {
        // İlk yüklemede tarih aralığını son 30 güne ayarla
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const toISO = (d) => d.toISOString().split('T')[0];
        if (DOM.reportDateStart) DOM.reportDateStart.value = toISO(startDate);
        if (DOM.reportDateEnd) DOM.reportDateEnd.value = toISO(endDate);

        // Hizmet dropdown'ını CONFIG.SERVICES.LIST'ten doldur (string dizisi)
        if (DOM.reportServiceFilter) {
            DOM.reportServiceFilter.innerHTML = '<option value="all">Tüm Hizmetler</option>';
            CONFIG.SERVICES.LIST.forEach(service => {
                const option = document.createElement('option');
                option.value = service;
                option.textContent = service;
                DOM.reportServiceFilter.appendChild(option);
            });
        }

        this.loadReportData();

        if (!this.isInitialized) {
            this.initEventListeners();
            this.isInitialized = true;
        }
    }

    /**
     * API'den randevu verilerini yükler (Eğer aralık büyükse aylık parçalarla)
     */
    static async loadReportData() {
        const startDateStr = DOM.reportDateStart.value;
        const endDateStr = DOM.reportDateEnd.value;
        
        if (!startDateStr || !endDateStr) {
            showToast('Lütfen geçerli bir tarih aralığı seçin.', 'warning');
            return;
        }

        Store.state.reportDateRange = { start: startDateStr, end: endDateStr };
        
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        // Ayın başını al (verileri o ay için çekmek maksadıyla)
        let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        try {
            if (DOM.reportTableBody) {
                DOM.reportTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-32"><div class="empty-state-wrap"><div class="spinner mb-8"></div><p class="font-12 text-muted">Randevu verileri yükleniyor...</p></div></td></tr>';
            }
            
            let allAppointments = [];

            // Aylar arasında gezinip verileri çekiyoruz
            while (currentDate <= endMonth) {
                const monthStr = currentDate.toISOString().split('T')[0];
                
                const response = await ApiService.call(CONFIG.ENDPOINTS.GET_APTS, {
                    method: 'POST',
                    payload: { tarih: monthStr, gorunum: 'month' }
                });

                // API yanıtı dizi veya {data: [...]} olabilir
                const apts = Array.isArray(response) ? response : (response?.data || []);
                if (apts.length) {
                    allAppointments = [...allAppointments, ...apts];
                }

                currentDate.setMonth(currentDate.getMonth() + 1);
            }

            // Mükerrerleri ID bazında temizle
            const uniqueApts = Array.from(new Map(allAppointments.map(item => [item.id, item])).values());
            
            Store.state.reportData = uniqueApts;
            this.applyFilters();
            
        } catch (error) {
            console.error('Rapor verisi yüklenirken hata oluştu:', error);
            showToast('Rapor verileri yüklenemedi.', 'error');
            if (DOM.reportTableBody) {
                DOM.reportTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-32"><div class="empty-state-wrap"><p class="font-14 font-bold text-rose mb-4">Veri yüklenirken hata oluştu</p><p class="font-11 text-muted">Lütfen ağ bağlantınızı ve API durumunu kontrol edin.</p></div></td></tr>';
            }
        }
    }

    /**
     * Yüklenen verileri filtrelere göre daraltır
     */
    static applyFilters() {
        const startDate = DOM.reportDateStart?.value || '';
        const endDate = DOM.reportDateEnd?.value || '';
        const statusFilter = DOM.reportStatusFilter ? DOM.reportStatusFilter.value : 'all';
        const serviceFilter = DOM.reportServiceFilter ? DOM.reportServiceFilter.value : 'all';

        const filtered = (Store.state.reportData || []).filter(apt => {
            const aptDate = apt.tarih;
            
            // Tarih aralığı kontrolü
            if (startDate && aptDate < startDate) return false;
            if (endDate && aptDate > endDate) return false;

            // Durum kontrolü
            if (statusFilter && statusFilter !== 'all' && apt.durum !== statusFilter) return false;

            // Hizmet kontrolü
            if (serviceFilter && serviceFilter !== 'all' && apt.hizmet !== serviceFilter) return false;

            return true;
        });

        // Tarihe göre sırala (yeniden eskiye)
        filtered.sort((a, b) => {
            const dateA = new Date(`${a.tarih}T${a.baslangic_saati || '00:00'}`);
            const dateB = new Date(`${b.tarih}T${b.baslangic_saati || '00:00'}`);
            return dateB - dateA;
        });

        Store.state.reportFiltered = filtered;
        
        this.renderReportTable();
        this.renderReportKPIs();
    }

    /**
     * Rapor tablosunu render eder
     */
    static renderReportTable() {
        if (!DOM.reportTableBody) return;

        const filtered = Store.state.reportFiltered || [];
        
        // Badge güncellemesi
        if (DOM.reportCountBadge) {
            DOM.reportCountBadge.textContent = `${filtered.length} Randevu`;
        }

        if (filtered.length === 0) {
            DOM.reportTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center p-32">
                        <div class="empty-state-wrap">
                            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" class="text-muted mb-8">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <p class="font-14 font-bold text-main">Randevu Bulunamadı</p>
                            <p class="font-11 text-muted">Seçili tarih aralığı ve filtrelere uygun kayıt yok.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const frag = document.createDocumentFragment();

        filtered.forEach(apt => {
            const tr = document.createElement('tr');
            tr.className = 'crm-table-row';

            let statusClass = 'status-waiting';
            let dotClass = 'dot-waiting';
            if (apt.durum === CONFIG.STATUS.COMPLETED) {
                statusClass = 'status-completed';
                dotClass = 'dot-completed';
            } else if (apt.durum === CONFIG.STATUS.CANCELED) {
                statusClass = 'status-canceled';
                dotClass = 'dot-canceled';
            }

            const timeRange = apt.baslangic_saati && apt.bitis_saati 
                ? `${apt.baslangic_saati.substring(0,5)} - ${apt.bitis_saati.substring(0,5)}` 
                : (apt.baslangic_saati ? apt.baslangic_saati.substring(0,5) : '-');

            let dateDisplay = apt.tarih || '-';
            try {
                if (apt.tarih) {
                    const d = new Date(apt.tarih);
                    if (!isNaN(d)) {
                        dateDisplay = d.toLocaleDateString(CONFIG.LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }
                }
            } catch (e) {}

            tr.innerHTML = `
                <td><span class="font-medium text-main font-12">${dateDisplay}</span></td>
                <td><span class="text-muted font-12">${timeRange}</span></td>
                <td>
                    <div class="crm-client-cell">
                        <div class="crm-client-avatar">${(apt.ad_soyad || 'M').charAt(0).toUpperCase()}</div>
                        <div class="crm-client-info">
                            <span class="crm-client-name">${Utils.formatName(apt.ad_soyad || 'Bilinmiyor')}</span>
                            <span class="crm-client-phone">${apt.telefon || '-'}</span>
                        </div>
                    </div>
                </td>
                <td><span class="crm-package-name">${apt.hizmet || '-'}</span></td>
                <td><span class="font-12">${apt.sure || 0} dk</span></td>
                <td>
                    <span class="report-status-badge ${statusClass}">
                        <span class="status-dot ${dotClass}"></span>
                        ${apt.durum || '-'}
                    </span>
                </td>
            `;

            frag.appendChild(tr);
        });

        DOM.reportTableBody.replaceChildren(frag);
    }

    /**
     * KPI kartlarını günceller
     */
    static renderReportKPIs() {
        if (!DOM.reportKpiGrid) return;

        const filtered = Store.state.reportFiltered || [];
        
        const totalApts = filtered.length;
        const completedApts = filtered.filter(a => a.durum === CONFIG.STATUS.COMPLETED).length;
        const canceledApts = filtered.filter(a => a.durum === CONFIG.STATUS.CANCELED).length;
        
        const totalDuration = filtered.reduce((acc, curr) => acc + (parseInt(curr.sure, 10) || 0), 0);
        const avgDuration = totalApts > 0 ? Math.round(totalDuration / totalApts) : 0;

        DOM.reportKpiGrid.innerHTML = `
            <div class="glass stat-card">
                <div class="flex-1 flex-col">
                    <div class="stat-label">Toplam Randevu</div>
                    <div class="stat-value flex-align-center gap-8">
                        <span>${totalApts}</span>
                    </div>
                </div>
                <div class="stat-icon-wrapper">
                    <svg width="20" height="20"><use href="#icon-calendar"></use></svg>
                </div>
            </div>
            <div class="glass stat-card">
                <div class="flex-1 flex-col">
                    <div class="stat-label">Tamamlanan</div>
                    <div class="stat-value flex-align-center gap-8">
                        <span class="text-emerald">${completedApts}</span>
                    </div>
                </div>
                <div class="stat-icon-wrapper text-emerald">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    </svg>
                </div>
            </div>
            <div class="glass stat-card">
                <div class="flex-1 flex-col">
                    <div class="stat-label">İptal Edilen</div>
                    <div class="stat-value flex-align-center gap-8">
                        <span class="text-rose">${canceledApts}</span>
                    </div>
                </div>
                <div class="stat-icon-wrapper text-rose">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </div>
            </div>
            <div class="glass stat-card">
                <div class="flex-1 flex-col">
                    <div class="stat-label">Ortalama Süre</div>
                    <div class="stat-value flex-align-center gap-8">
                        <span class="text-cobalt">${avgDuration} dk</span>
                    </div>
                </div>
                <div class="stat-icon-wrapper text-cobalt">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
            </div>
        `;
    }

    /**
     * Verileri CSV'ye dışa aktarır
     */
    static exportReportCSV() {
        const data = Store.state.reportFiltered;
        
        if (!data || data.length === 0) {
            showToast('Dışa aktarılacak veri bulunamadı.', 'warning');
            return;
        }

        const headers = ['Tarih', 'Saat', 'Müşteri Adı', 'Telefon', 'Hizmet', 'Süre (dk)', 'Durum'];
        
        const rows = data.map(apt => {
            let dateDisplay = apt.tarih || '';
            try {
                if (apt.tarih) {
                    const d = new Date(apt.tarih);
                    if (!isNaN(d)) {
                        dateDisplay = d.toLocaleDateString(CONFIG.LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }
                }
            } catch (e) {}

            const timeStr = apt.baslangic_saati && apt.bitis_saati 
                ? `${apt.baslangic_saati.substring(0,5)} - ${apt.bitis_saati.substring(0,5)}` 
                : (apt.baslangic_saati ? apt.baslangic_saati.substring(0,5) : '-');
            
            const customer = (apt.ad_soyad || '').replace(/"/g, '""');
            const phone = (apt.telefon || '').replace(/"/g, '""');
            const service = (apt.hizmet || '').replace(/"/g, '""');
            const duration = apt.sure || 0;
            const status = apt.durum || '';
            
            return [
                `"${dateDisplay}"`,
                `"${timeStr}"`,
                `"${customer}"`,
                `"${phone}"`,
                `"${service}"`,
                duration,
                `"${status}"`
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const today = new Date().toISOString().slice(0, 10);
        const fileName = `randevu-raporu-${today}.csv`;
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast(`${data.length} randevu CSV olarak dışa aktarıldı.`, 'success');
    }

    /**
     * Olay dinleyicilerini tanımlar
     */
    static initEventListeners() {
        if (DOM.btnApplyReportFilter) {
            DOM.btnApplyReportFilter.addEventListener('click', () => this.applyFilters());
        }

        const exportBtn = Utils.$('btnExportReport');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportReportCSV());
        }

        if (DOM.reportDateStart) {
            DOM.reportDateStart.addEventListener('change', () => this.loadReportData());
        }

        if (DOM.reportDateEnd) {
            DOM.reportDateEnd.addEventListener('change', () => this.loadReportData());
        }

        if (DOM.reportStatusFilter) {
            DOM.reportStatusFilter.addEventListener('change', () => this.applyFilters());
        }

        if (DOM.reportServiceFilter) {
            DOM.reportServiceFilter.addEventListener('change', () => this.applyFilters());
        }
    }
}

export { ReportsManager };
if (typeof window !== 'undefined') {
    window.ReportsManager = ReportsManager;
}
