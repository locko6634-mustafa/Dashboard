import { CONFIG } from '../shared/config.js';
import { Utils, DateUtils } from '../shared/utils.js';
import { showToast } from '../shared/toast.js';
import { ApiService } from '../shared/api-client.js';
import { Store } from './store.js';
import { DOM } from './dom.js';
import { AppointmentManager } from './appointment.js';
import { PatientUI } from './patient.js';

class ReportsManager {
    static isInitialized = false;

    /**
     * Raporlama sekmesini ilklendirir.
     */
    static initReports() {
        const todayStr = DateUtils.getTodayLocalISO();
        
        // Eğer tarihler daha önce seçilmemişse son 30 günü varsayılan yap
        if (DOM.reportDateStart && !DOM.reportDateStart.value) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            const startStr = new Intl.DateTimeFormat('fr-CA', { 
                timeZone: 'Europe/Istanbul', 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit' 
            }).format(startDate);
            DOM.reportDateStart.value = startStr;
        }
        if (DOM.reportDateEnd && !DOM.reportDateEnd.value) {
            DOM.reportDateEnd.value = todayStr;
        }

        // Hizmet dropdown'ını doldur
        this.updateServiceFilterDropdown();

        // Rapor verilerini sunucudan çek
        this.loadReportData();

        if (!this.isInitialized) {
            this.initEventListeners();
            this.isInitialized = true;
        }
    }

    /**
     * Hizmet dropdown'ını hem ayarlardan hem de mevcut randevulardan dinamik doldurur
     */
    static updateServiceFilterDropdown() {
        if (!DOM.reportServiceFilter) return;

        const currentVal = DOM.reportServiceFilter.value || 'all';
        const serviceSet = new Set();

        // 1. CONFIG ve ayarlardaki hizmetler
        (CONFIG.SERVICES.LIST || []).forEach(s => {
            if (s && typeof s === 'string' && s.trim()) serviceSet.add(s.trim());
        });

        // 2. Yüklenmiş rapor verisindeki gerçek hizmetler
        (Store.state.reportData || []).forEach(apt => {
            if (apt.hizmet && typeof apt.hizmet === 'string' && apt.hizmet.trim() && apt.hizmet !== CONFIG.STATUS.WAITING) {
                serviceSet.add(apt.hizmet.trim());
            }
        });

        // 3. Bellekteki randevulardaki hizmetler
        Object.values(Store.state.appointments || {}).forEach(apt => {
            if (apt.hizmet && typeof apt.hizmet === 'string' && apt.hizmet.trim() && apt.hizmet !== CONFIG.STATUS.WAITING) {
                serviceSet.add(apt.hizmet.trim());
            }
        });

        DOM.reportServiceFilter.innerHTML = '<option value="all">Tüm Hizmetler</option>';
        Array.from(serviceSet).sort().forEach(service => {
            const option = document.createElement('option');
            option.value = service;
            option.textContent = service;
            if (service.toLowerCase() === currentVal.toLowerCase()) {
                option.selected = true;
            }
            DOM.reportServiceFilter.appendChild(option);
        });
    }

    /**
     * API'den randevu verilerini yükler (Aylık parçalar ve tarih aralığıyla)
     */
    static async loadReportData() {
        let startDateStr = DOM.reportDateStart?.value || '';
        let endDateStr = DOM.reportDateEnd?.value || '';
        
        if (!startDateStr || !endDateStr) {
            const todayStr = DateUtils.getTodayLocalISO();
            const d = new Date();
            d.setDate(d.getDate() - 30);
            const startStr = new Intl.DateTimeFormat('fr-CA', { 
                timeZone: 'Europe/Istanbul', 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit' 
            }).format(d);
            
            if (!startDateStr && DOM.reportDateStart) {
                DOM.reportDateStart.value = startStr;
                startDateStr = startStr;
            }
            if (!endDateStr && DOM.reportDateEnd) {
                DOM.reportDateEnd.value = todayStr;
                endDateStr = todayStr;
            }
        }

        // Eğer başlangıç tarihi bitişten büyükse ters çevir
        if (startDateStr > endDateStr) {
            const temp = startDateStr;
            startDateStr = endDateStr;
            endDateStr = temp;
            if (DOM.reportDateStart) DOM.reportDateStart.value = startDateStr;
            if (DOM.reportDateEnd) DOM.reportDateEnd.value = endDateStr;
        }

        Store.state.reportDateRange = { start: startDateStr, end: endDateStr };

        try {
            if (DOM.reportTableBody) {
                DOM.reportTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-32"><div class="empty-state-wrap"><div class="spinner mb-8"></div><p class="font-12 text-muted">Randevu verileri yükleniyor...</p></div></td></tr>';
            }
            
            let allAppointments = [];

            // Bellekte takvimden kalan randevuları da dahil et
            const localApts = Object.values(Store.state.appointments || {});
            if (localApts.length) {
                allAppointments.push(...localApts);
            }

            // Yıl ve ay sınırlarını alarak güvenli tam sayı döngüsü kur
            const [sYear, sMonth] = startDateStr.split('-').map(Number);
            const [eYear, eMonth] = endDateStr.split('-').map(Number);
            
            let curY = sYear;
            let curM = sMonth;

            // Aylar arasında gezinip verileri çekiyoruz
            while (curY < eYear || (curY === eYear && curM <= eMonth)) {
                const monthDateStr = `${curY}-${String(curM).padStart(2, '0')}-01`;
                
                const response = await ApiService.call(
                    `${CONFIG.ENDPOINTS.GET_APTS}?date=${monthDateStr}&view=month&startDate=${startDateStr}&endDate=${endDateStr}`, 
                    {
                        method: 'POST',
                        payload: { 
                            date: monthDateStr, 
                            tarih: monthDateStr, 
                            view: 'month', 
                            gorunum: 'month',
                            startDate: startDateStr,
                            endDate: endDateStr,
                            baslangic: startDateStr,
                            bitis: endDateStr
                        },
                        returnData: true
                    }
                );

                // API yanıtı dizi veya {data: [...]} olabilir
                const rawItems = Array.isArray(response) ? response : (response?.data || response?.appointments || []);
                if (Array.isArray(rawItems)) {
                    rawItems.forEach(item => {
                        const j = item.json || item;
                        if (j && (j.id || j.randevu_id)) {
                            allAppointments.push(j);
                        }
                    });
                }

                // Sonraki aya geç
                curM++;
                if (curM > 12) {
                    curM = 1;
                    curY++;
                }
            }

            // Mükerrerleri ID bazında temizle
            const uniqueMap = new Map();
            allAppointments.forEach(item => {
                const key = item.id || item.randevu_id;
                if (key) {
                    uniqueMap.set(String(key), item);
                }
            });

            Store.state.reportData = Array.from(uniqueMap.values());
            this.updateServiceFilterDropdown();
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
            if (!aptDate) return false;
            
            // Tarih aralığı kontrolü (YYYY-MM-DD string karşılaştırması)
            if (startDate && aptDate < startDate) return false;
            if (endDate && aptDate > endDate) return false;

            // Durum kontrolü (küçük/büyük harf duyarsız)
            if (statusFilter && statusFilter !== 'all') {
                if ((apt.durum || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
            }

            // Hizmet kontrolü (küçük/büyük harf duyarsız)
            if (serviceFilter && serviceFilter !== 'all') {
                if ((apt.hizmet || '').toLowerCase() !== serviceFilter.toLowerCase()) return false;
            }

            return true;
        });

        // Tarihe ve saate göre sırala (yeniden eskiye)
        filtered.sort((a, b) => {
            const comp = (b.tarih || '').localeCompare(a.tarih || '');
            if (comp !== 0) return comp;
            const timeA = a.saat || a.baslangic_saati || '00:00';
            const timeB = b.saat || b.baslangic_saati || '00:00';
            return timeB.localeCompare(timeA);
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
            const durum = (apt.durum || '').trim();
            if (durum.toLowerCase() === (CONFIG.STATUS.COMPLETED || 'tamamlandı').toLowerCase()) {
                statusClass = 'status-completed';
                dotClass = 'dot-completed';
            } else if (durum.toLowerCase() === (CONFIG.STATUS.CANCELED || 'iptal').toLowerCase()) {
                statusClass = 'status-canceled';
                dotClass = 'dot-canceled';
            }

            const startH = (apt.saat || apt.baslangic_saati || '').substring(0, 5);
            let endH = (apt.bitis_saati || '').substring(0, 5);
            if (!endH && startH && apt.sure) {
                endH = Utils.calcBitisSaati(startH, apt.sure);
            }
            const timeRange = startH && endH ? `${startH} - ${endH}` : (startH || '-');

            let dateDisplay = apt.tarih || '-';
            if (apt.tarih && apt.tarih.includes('-')) {
                const parts = apt.tarih.split('-');
                if (parts.length === 3) {
                    dateDisplay = `${parts[2]}.${parts[1]}.${parts[0]}`;
                }
            }

            const clientName = Utils.formatName(apt.ad_soyad || CONFIG.DEFAULTS.NAME);
            const clientInitial = (clientName || 'M').charAt(0).toUpperCase();

            tr.innerHTML = `
                <td><span class="font-medium text-main font-12">${dateDisplay}</span></td>
                <td><span class="text-muted font-12">${timeRange}</span></td>
                <td>
                    <div class="crm-client-cell">
                        <div class="crm-client-avatar">${clientInitial}</div>
                        <div class="crm-client-info">
                            <span class="crm-client-name">${clientName}</span>
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

            // Satıra tıklandığında randevu detay/düzenleme modalını aç
            tr.style.cursor = 'pointer';
            tr.title = 'Randevu detayını düzenlemek için tıklayın';
            tr.onclick = () => {
                const rId = apt.randevu_id || apt.id;
                if (!rId) return;

                // Randevunun Store.state.appointments içinde bulunmasını sağla
                if (!Store.state.appointments[rId]) {
                    Store.state.appointments[rId] = {
                        id: rId,
                        randevu_id: rId,
                        hasta_id: apt.hasta_id,
                        ad_soyad: apt.ad_soyad || CONFIG.DEFAULTS.NAME,
                        telefon: apt.telefon || '',
                        hizmet: apt.hizmet || '',
                        durum: apt.durum || CONFIG.STATUS.WAITING,
                        tarih: apt.tarih,
                        saat: (apt.saat || apt.baslangic_saati || '').substring(0, 5),
                        sure: parseInt(apt.sure, 10) || 30,
                        kronik_rahatsizlik: apt.kronik_rahatsizlik || '',
                        paket_adi: apt.paket_adi || CONFIG.DEFAULTS.PACKAGE,
                        toplam_seans: parseInt(apt.toplam_seans, 10) || 0,
                        gelinen_seans: parseInt(apt.gelinen_seans, 10) || 0,
                        toplam_tutar: parseFloat(apt.toplam_tutar) || 0,
                        alinan_odeme: parseFloat(apt.alinan_odeme) || 0
                    };
                }

                const aptMgr = window.AppointmentManager || AppointmentManager;
                if (aptMgr && typeof aptMgr.openAptModal === 'function') {
                    aptMgr.openAptModal(rId);
                }
            };

            // Müşteri kartına tıklandığında doğrudan müşteri profil çekmecesini aç
            const clientCell = tr.querySelector('.crm-client-cell');
            if (clientCell) {
                clientCell.style.cursor = 'pointer';
                clientCell.title = 'Müşteri profili ve geçmişini açmak için tıklayın';
                clientCell.onclick = (e) => {
                    e.stopPropagation();
                    const pUI = window.PatientUI || PatientUI;
                    if (pUI && typeof pUI.openSidebar === 'function') {
                        pUI.openSidebar(apt);
                    }
                };
            }

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
        const completedApts = filtered.filter(a => (a.durum || '').toLowerCase() === (CONFIG.STATUS.COMPLETED || 'tamamlandı').toLowerCase()).length;
        const canceledApts = filtered.filter(a => (a.durum || '').toLowerCase() === (CONFIG.STATUS.CANCELED || 'iptal').toLowerCase()).length;
        
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
            if (apt.tarih && apt.tarih.includes('-')) {
                const parts = apt.tarih.split('-');
                if (parts.length === 3) {
                    dateDisplay = `${parts[2]}.${parts[1]}.${parts[0]}`;
                }
            }

            const startH = (apt.saat || apt.baslangic_saati || '').substring(0, 5);
            let endH = (apt.bitis_saati || '').substring(0, 5);
            if (!endH && startH && apt.sure) {
                endH = Utils.calcBitisSaati(startH, apt.sure);
            }
            const timeStr = startH && endH ? `${startH} - ${endH}` : (startH || '-');
            
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
            DOM.btnApplyReportFilter.addEventListener('click', () => {
                const s = DOM.reportDateStart?.value || '';
                const e = DOM.reportDateEnd?.value || '';
                const currentRange = Store.state.reportDateRange || {};
                
                // Eğer tarihler değişmişse veya hiç veri yüklenmemişse verileri yeniden çek
                if (s !== currentRange.start || e !== currentRange.end || !Store.state.reportData || Store.state.reportData.length === 0) {
                    this.loadReportData();
                } else {
                    this.applyFilters();
                }
            });
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
