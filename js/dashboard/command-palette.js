// ==========================================
// SALONZEKA CTRL+K / CMD+K HIZLI ARAMA KOMUT PALETİ
// ==========================================

import { CONFIG } from '../shared/config.js';
import { Utils } from '../shared/utils.js';
import { ApiService } from '../shared/api-client.js';
import { Store } from './store.js';
import { PatientUI } from './patient.js';

export class CommandPalette {
    static results = [];
    static selectedIndex = 0;
    static debounceTimer = null;

    static init() {
        const triggerBtn = Utils.$('btnCommandPalette');
        if (triggerBtn) {
            triggerBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                CommandPalette.open();
            });
        }

        const closeBtn = Utils.$('btnCloseCmdPalette');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => CommandPalette.close());
        }

        const backdrop = Utils.$('commandPaletteModal');
        if (backdrop) {
            backdrop.addEventListener('click', e => {
                if (e.target === backdrop) CommandPalette.close();
            });
        }

        const input = Utils.$('cmdPaletteInput');
        if (input) {
            input.addEventListener('input', e => {
                clearTimeout(CommandPalette.debounceTimer);
                const q = (e.target.value || '').trim();
                CommandPalette.debounceTimer = setTimeout(() => {
                    CommandPalette.search(q);
                }, 140);
            });

            input.addEventListener('keydown', e => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (CommandPalette.results.length > 0) {
                        CommandPalette.selectedIndex = (CommandPalette.selectedIndex + 1) % CommandPalette.results.length;
                        CommandPalette.renderResults();
                        CommandPalette.renderPreview();
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (CommandPalette.results.length > 0) {
                        CommandPalette.selectedIndex = (CommandPalette.selectedIndex - 1 + CommandPalette.results.length) % CommandPalette.results.length;
                        CommandPalette.renderResults();
                        CommandPalette.renderPreview();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const active = CommandPalette.results[CommandPalette.selectedIndex];
                    if (active) CommandPalette.openPatient(active);
                }
            });
        }

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const modal = Utils.$('commandPaletteModal');
                if (modal && !modal.classList.contains('hidden')) {
                    CommandPalette.close();
                } else {
                    CommandPalette.open();
                }
            } else if (e.key === 'Escape') {
                const modal = Utils.$('commandPaletteModal');
                if (modal && !modal.classList.contains('hidden')) {
                    CommandPalette.close();
                }
            }
        });
    }

    static open() {
        const modal = Utils.$('commandPaletteModal');
        const input = Utils.$('cmdPaletteInput');
        if (!modal) return;
        modal.classList.remove('hidden');
        if (input) {
            input.value = '';
            input.focus();
        }
        CommandPalette.search('');
    }

    static close() {
        const modal = Utils.$('commandPaletteModal');
        if (modal) modal.classList.add('hidden');
    }

    static collectLocalPatients() {
        const map = new Map();
        const mergeRecord = rec => {
            if (!rec) return;
            const id = rec.hasta_id || rec.id || rec.telefon || rec.ad_soyad;
            if (!id || !rec.ad_soyad) return;
            const existing = map.get(String(id)) || {};
            map.set(String(id), {
                id: rec.hasta_id || rec.id || id,
                hasta_id: rec.hasta_id || rec.id || id,
                ad_soyad: rec.ad_soyad || existing.ad_soyad || '',
                telefon: rec.telefon || existing.telefon || '',
                paket_adi: rec.paket_adi || existing.paket_adi || '',
                toplam_seans: Number(rec.toplam_seans ?? existing.toplam_seans) || 0,
                gelinen_seans: Number(rec.gelinen_seans ?? existing.gelinen_seans) || 0,
                toplam_tutar: Number(rec.toplam_tutar ?? existing.toplam_tutar) || 0,
                alinan_odeme: Number(rec.alinan_odeme ?? existing.alinan_odeme) || 0
            });
        };

        (Store.state.patientsList || []).forEach(mergeRecord);
        Object.values(Store.state.searchCache || {}).forEach(mergeRecord);
        Object.values(Store.state.appointments || {}).forEach(mergeRecord);
        return Array.from(map.values());
    }

    static async search(query) {
        const q = (query || '').toLowerCase();
        const local = CommandPalette.collectLocalPatients();
        let matched = local.filter(p => {
            if (!q) return true;
            return (p.ad_soyad || '').toLowerCase().includes(q) || (p.telefon || '').toLowerCase().includes(q);
        });

        if (q.length >= 2 && matched.length < 5) {
            try {
                const apiRes = await ApiService.call(CONFIG.ENDPOINTS.SEARCH + '?q=' + encodeURIComponent(query), {
                    method: 'GET',
                    returnData: true,
                    customErrorMsg: null
                });
                if (Array.isArray(apiRes)) {
                    const existingIds = new Set(matched.map(m => String(m.hasta_id || m.id)));
                    apiRes.forEach(item => {
                        const key = String(item.hasta_id || item.id || '');
                        if (key && !existingIds.has(key)) {
                            matched.push(item);
                            existingIds.add(key);
                        }
                    });
                }
            } catch { /* yerel sonuçlarla devam */ }
        }

        CommandPalette.results = matched.slice(0, 12);
        CommandPalette.selectedIndex = 0;
        CommandPalette.renderResults();
        CommandPalette.renderPreview();
    }

    static renderResults() {
        const listEl = Utils.$('cmdPaletteResults');
        if (!listEl) return;

        const frag = document.createDocumentFragment();
        if (CommandPalette.results.length === 0) {
            frag.appendChild(Utils.el('div', { className: 'text-muted font-12 p-12' }, 'Eşleşen müşteri bulunamadı.'));
            listEl.replaceChildren(frag);
            return;
        }

        CommandPalette.results.forEach((p, idx) => {
            const btn = Utils.el('button', {
                type: 'button',
                className: 'cmd-result-item' + (idx === CommandPalette.selectedIndex ? ' is-selected' : ''),
                onclick: () => {
                    CommandPalette.selectedIndex = idx;
                    CommandPalette.renderResults();
                    CommandPalette.renderPreview();
                },
                ondblclick: () => CommandPalette.openPatient(p)
            },
                Utils.el('div', { className: 'cmd-result-name' }, Utils.formatName(p.ad_soyad) || 'İsimsiz Müşteri'),
                Utils.el('div', { className: 'cmd-result-phone' }, p.telefon || 'Telefon yok')
            );
            frag.appendChild(btn);
        });

        listEl.replaceChildren(frag);
    }

    static renderPreview() {
        const previewEl = Utils.$('cmdPalettePreview');
        if (!previewEl) return;

        const patient = CommandPalette.results[CommandPalette.selectedIndex];
        if (!patient) {
            previewEl.replaceChildren(Utils.el('div', { className: 'text-muted font-12' }, 'Önizleme için müşteri arayın veya seçin.'));
            return;
        }

        const totalSeans = Number(patient.toplam_seans) || 0;
        const usedSeans = Number(patient.gelinen_seans) || 0;
        const remainingSeans = Math.max(0, totalSeans - usedSeans);
        const currency = (CONFIG.DEFAULTS && CONFIG.DEFAULTS.CURRENCY) ? CONFIG.DEFAULTS.CURRENCY : '₺';
        const balance = Math.max(0, (Number(patient.toplam_tutar) || 0) - (Number(patient.alinan_odeme) || 0));

        const pId = String(patient.hasta_id || patient.id || '');
        const pPhone = patient.telefon || '';
        const pName = (patient.ad_soyad || '').toLowerCase();

        const recentApts = Object.values(Store.state.appointments || {})
            .filter(a => {
                const aId = String(a.hasta_id || '');
                if (pId && aId && aId === pId) return true;
                if (pPhone && a.telefon && a.telefon === pPhone) return true;
                return pName && (a.ad_soyad || '').toLowerCase() === pName;
            })
            .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.saat || '').localeCompare(a.saat || ''))
            .slice(0, 4);

        const frag = document.createDocumentFragment();

        const card = Utils.el('div', { className: 'cmd-preview-card' },
            Utils.el('div', { className: 'cmd-preview-title' }, Utils.formatName(patient.ad_soyad) || 'Müşteri'),
            Utils.el('div', { className: 'cmd-preview-sub' }, (patient.telefon || '-') + (patient.paket_adi ? ' • ' + patient.paket_adi : '')),
            Utils.el('div', { className: 'cmd-session-grid' },
                Utils.el('div', { className: 'cmd-stat-box' },
                    Utils.el('div', { className: 'cmd-stat-label' }, 'Kalan Seans'),
                    Utils.el('div', { className: 'cmd-stat-val' }, totalSeans > 0 ? `${remainingSeans} / ${totalSeans}` : 'Paket Yok')
                ),
                Utils.el('div', { className: 'cmd-stat-box' },
                    Utils.el('div', { className: 'cmd-stat-label' }, 'Kalan Bakiye'),
                    Utils.el('div', { className: 'cmd-stat-val' }, balance.toLocaleString('tr-TR') + ' ' + currency)
                )
            )
        );
        frag.appendChild(card);

        const recentWrap = Utils.el('div', { className: 'cmd-recent-list' },
            Utils.el('div', { className: 'sz-kpi-label' }, 'Son Randevular')
        );
        if (recentApts.length === 0) {
            recentWrap.appendChild(Utils.el('div', { className: 'text-muted font-11' }, 'Kayıtlı randevu bulunamadı.'));
        } else {
            recentApts.forEach(a => {
                recentWrap.appendChild(
                    Utils.el('div', { className: 'cmd-recent-item' },
                        Utils.el('span', {}, `${a.tarih || '-'} ${a.saat || ''}`),
                        Utils.el('span', {}, a.hizmet || 'Hizmet'),
                        Utils.el('span', { className: 'font-bold' }, a.durum || 'Bekliyor')
                    )
                );
            });
        }
        frag.appendChild(recentWrap);

        const openBtn = Utils.el('button', {
            type: 'button',
            className: 'cmd-open-btn',
            onclick: () => CommandPalette.openPatient(patient)
        }, 'Müşteri Kartını Aç');
        frag.appendChild(openBtn);

        previewEl.replaceChildren(frag);
    }

    static openPatient(patient) {
        CommandPalette.close();
        if (patient && typeof PatientUI !== 'undefined' && PatientUI.openSidebar) {
            PatientUI.openSidebar(patient);
        }
    }
}

export default CommandPalette;
