// ==========================================
// SALONZEKA 2 PANELLİ WHATSAPP AI İZLEME & DEVRALMA KUTUSU
// ==========================================

import { Utils } from '../shared/utils.js';
import { ApiService } from '../shared/api-client.js';
import { getTenantId } from '../shared/auth-session.js';
import { Store } from './store.js';

const DEFAULT_CONVERSATIONS = [
    {
        id: 'wa-1',
        name: 'Selin Kaya',
        phone: '+90 532 418 22 10',
        aiPaused: false,
        unread: 1,
        messages: [
            { sender: 'customer', text: 'Merhaba, yarın 14:30 için cilt bakımı randevusu alabilir miyim?', time: '10:12' },
            { sender: 'ai', text: 'Merhaba Selin Hanım, yarın 14:30 Uzm. Elif Yılmaz ile Cilt Bakımı uygun. Onaylıyor musunuz?', time: '10:12' },
            { sender: 'customer', text: 'Evet lütfen, onaylıyorum.', time: '10:14' },
            { sender: 'ai', text: 'Randevunuz WhatsApp Teyitli olarak oluşturuldu. Yarın görüşmek üzere!', time: '10:14' }
        ]
    },
    {
        id: 'wa-2',
        name: 'Mert Demirtaş',
        phone: '+90 544 892 31 04',
        aiPaused: true,
        unread: 0,
        messages: [
            { sender: 'customer', text: 'Paketimdeki kalan seans sayısını öğrenebilir miyim?', time: '09:40' },
            { sender: 'ai', text: 'Merhaba Mert Bey, sistemde 8 seanslık paketinizden 3 seans kaldığı görünüyor.', time: '09:40' },
            { sender: 'customer', text: 'Teşekkürler, bu hafta sonu için özel bir indirim talebim olacaktı.', time: '09:42' },
            { sender: 'manual', text: 'Merhaba Mert Bey, yönetici olarak devraldım. Hafta sonu için %10 sadakat indirimi tanımlıyorum.', time: '09:45' }
        ]
    },
    {
        id: 'wa-3',
        name: 'Zeynep Aksoy',
        phone: '+90 555 210 77 89',
        aiPaused: false,
        unread: 0,
        messages: [
            { sender: 'ai', text: 'Hatırlatma: Bugün 16:00 randevunuzu teyit etmek için "Evet" yazabilirsiniz.', time: '08:30' },
            { sender: 'customer', text: 'Evet geleceğim, 10 dk gecikebilirim sorun olur mu?', time: '08:48' },
            { sender: 'ai', text: 'Bilginiz için teşekkürler Zeynep Hanım, uzmanımıza not iletildi.', time: '08:48' }
        ]
    }
];

export class WhatsappAiInbox {
    static filterMode = 'all';
    static searchQuery = '';
    static initialized = false;

    static getStorageKey() {
        const tenantId = getTenantId() || 'default';
        return 'sz_wa_inbox_' + tenantId;
    }

    static loadState() {
        const key = WhatsappAiInbox.getStorageKey();

        // Eski kalıcı localStorage kaydı varsa temizle (hassas veriyi oturumla sınırla)
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (err) {
            console.warn('Eski WhatsApp AI localStorage verisi temizlenemedi:', err);
        }

        try {
            const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    Store.state.whatsappAi.conversations = parsed;
                    if (!Store.state.whatsappAi.activeId) {
                        Store.state.whatsappAi.activeId = parsed[0].id;
                    }
                    return;
                }
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem(key);
                }
            }
        } catch (err) {
            console.warn('WhatsApp AI konuşma geçmişi okunamadı, bozuk veri temizleniyor:', err);
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem(key);
                }
            } catch (removeErr) {
                console.warn('Bozuk WhatsApp AI oturum verisi silinemedi:', removeErr);
            }
        }

        const cloned = JSON.parse(JSON.stringify(DEFAULT_CONVERSATIONS));
        Store.state.whatsappAi.conversations = cloned;
        Store.state.whatsappAi.activeId = cloned[0]?.id || null;
        WhatsappAiInbox.saveState();
    }

    static saveState() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(
                    WhatsappAiInbox.getStorageKey(),
                    JSON.stringify(Store.state.whatsappAi.conversations || [])
                );
            }
        } catch (err) {
            console.warn('WhatsApp AI konuşma geçmişi kaydedilemedi:', err);
        }
    }

    static async init() {
        WhatsappAiInbox.loadState();

        if (!WhatsappAiInbox.initialized) {
            WhatsappAiInbox.initialized = true;
            WhatsappAiInbox.bindEvents();
        }

        // Opsiyonel API senkronizasyonu (endpoint yoksa sessizce yerel veriyle devam eder)
        try {
            const res = await ApiService.call('whatsapp-conversations', {
                method: 'GET',
                returnData: true,
                customErrorMsg: null
            });
            if (Array.isArray(res) && res.length > 0) {
                Store.state.whatsappAi.conversations = res;
                Store.state.whatsappAi.activeId = res[0].id;
                WhatsappAiInbox.saveState();
            }
        } catch (err) {
            console.warn('WhatsApp AI konuşmaları senkronize edilemedi, yerel durum korunuyor:', err);
        }

        WhatsappAiInbox.render();
    }

    static bindEvents() {
        const searchInput = Utils.$('waSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                WhatsappAiInbox.searchQuery = (e.target.value || '').trim().toLowerCase();
                WhatsappAiInbox.renderConversationList();
            });
        }

        const filterTabs = document.querySelectorAll('#waFilterTabs .wa-filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                WhatsappAiInbox.filterMode = tab.dataset.waFilter || 'all';
                WhatsappAiInbox.renderConversationList();
            });
        });

        const toggleInput = Utils.$('waTakeoverToggle');
        if (toggleInput) {
            toggleInput.addEventListener('change', () => {
                WhatsappAiInbox.setTakeover(toggleInput.checked);
            });
        }

        const takeoverBtn = Utils.$('btnWaTakeover');
        if (takeoverBtn) {
            takeoverBtn.addEventListener('click', () => {
                const active = WhatsappAiInbox.getActiveConversation();
                if (!active) return;
                WhatsappAiInbox.setTakeover(!active.aiPaused);
            });
        }

        const backBtn = Utils.$('btnWaBackToList');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const shell = document.querySelector('.wa-inbox-shell');
                if (shell) shell.classList.remove('mobile-chat-open');
            });
        }

        const replyForm = Utils.$('waReplyForm');
        if (replyForm) {
            replyForm.addEventListener('submit', async e => {
                e.preventDefault();
                await WhatsappAiInbox.sendManualReply();
            });
        }
    }

    static getActiveConversation() {
        const list = Store.state.whatsappAi.conversations || [];
        return list.find(c => c.id === Store.state.whatsappAi.activeId) || list[0] || null;
    }

    static async setTakeover(paused) {
        const conv = WhatsappAiInbox.getActiveConversation();
        if (!conv) return;
        const nextPaused = Boolean(paused);

        try {
            const res = await ApiService.call('whatsapp-takeover', {
                method: 'POST',
                payload: { conversation_id: conv.id, ai_paused: nextPaused },
                returnData: true,
                customErrorMsg: null
            });

            if (!res || res === false) {
                WhatsappAiInbox.render();
                Utils.showToast('AI durumu güncellenemedi. Lütfen tekrar deneyin.', 'error');
                return;
            }

            conv.aiPaused = nextPaused;
            WhatsappAiInbox.saveState();
            WhatsappAiInbox.render();

            Utils.showToast(
                conv.aiPaused ? 'AI durduruldu — Manuel yanıt modundasınız' : 'AI Asistan yeniden devrede',
                conv.aiPaused ? 'warning' : 'success'
            );
        } catch {
            WhatsappAiInbox.render();
            Utils.showToast('AI durumu güncellenemedi. Lütfen tekrar deneyin.', 'error');
        }
    }

    static async sendManualReply() {
        const input = Utils.$('waReplyInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const conv = WhatsappAiInbox.getActiveConversation();
        if (!conv) return;

        try {
            const res = await ApiService.call('whatsapp-reply', {
                method: 'POST',
                payload: { conversation_id: conv.id, message: text },
                returnData: true,
                customErrorMsg: null
            });

            if (!res || res === false) {
                Utils.showToast('Mesaj gönderilemedi. Lütfen tekrar deneyin.', 'error');
                return;
            }

            if (!conv.aiPaused) {
                conv.aiPaused = true;
            }

            const now = new Date();
            const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            conv.messages.push({ sender: 'manual', text, time: timeStr });
            input.value = '';
            WhatsappAiInbox.saveState();
            WhatsappAiInbox.render();
        } catch {
            Utils.showToast('Mesaj gönderilemedi. Lütfen tekrar deneyin.', 'error');
        }
    }

    static render() {
        WhatsappAiInbox.renderConversationList();
        WhatsappAiInbox.renderChatPane();
        WhatsappAiInbox.updateBadges();
    }

    static updateBadges() {
        const list = Store.state.whatsappAi.conversations || [];
        const aiActiveCount = list.filter(c => !c.aiPaused).length;
        const unreadTotal = list.reduce((sum, c) => sum + (c.unread || 0), 0);

        const aiCountEl = Utils.$('waActiveAiCount');
        if (aiCountEl) aiCountEl.textContent = aiActiveCount + ' AI Aktif';

        const unreadEl = Utils.$('waUnreadBadge');
        if (unreadEl) {
            unreadEl.textContent = String(unreadTotal);
            unreadEl.classList.toggle('hidden', unreadTotal <= 0);
        }
    }

    static renderConversationList() {
        const container = Utils.$('waConversationList');
        if (!container) return;

        const list = (Store.state.whatsappAi.conversations || []).filter(conv => {
            if (WhatsappAiInbox.filterMode === 'ai' && conv.aiPaused) return false;
            if (WhatsappAiInbox.filterMode === 'manual' && !conv.aiPaused) return false;
            if (WhatsappAiInbox.searchQuery) {
                const q = WhatsappAiInbox.searchQuery;
                const hay = ((conv.name || '') + ' ' + (conv.phone || '')).toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const frag = document.createDocumentFragment();
        if (list.length === 0) {
            frag.appendChild(Utils.el('div', { className: 'text-muted font-12 p-12' }, 'Eşleşen konuşma bulunamadı.'));
            container.replaceChildren(frag);
            return;
        }

        list.forEach(conv => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const isActive = conv.id === Store.state.whatsappAi.activeId;
            const item = Utils.el('button', {
                type: 'button',
                className: 'wa-conv-item' + (isActive ? ' active' : ''),
                onclick: () => {
                    Store.state.whatsappAi.activeId = conv.id;
                    conv.unread = 0;
                    WhatsappAiInbox.saveState();
                    WhatsappAiInbox.render();
                    const shell = document.querySelector('.wa-inbox-shell');
                    if (shell && window.innerWidth <= 768) shell.classList.add('mobile-chat-open');
                }
            },
                Utils.el('div', { className: 'wa-conv-top' },
                    Utils.el('span', { className: 'wa-conv-name' }, conv.name || 'Müşteri'),
                    Utils.el('span', { className: 'wa-conv-time' }, lastMsg ? lastMsg.time : '')
                ),
                Utils.el('div', { className: 'wa-conv-preview' }, lastMsg ? lastMsg.text : 'Mesaj yok'),
                Utils.el('div', { className: 'wa-conv-tags' },
                    Utils.el('span', { className: 'wa-state-tag ' + (conv.aiPaused ? 'is-manual' : 'is-ai') },
                        conv.aiPaused ? 'Manuel Devralındı' : 'AI Yönetiyor'
                    ),
                    conv.unread > 0 ? Utils.el('span', { className: 'menu-badge' }, String(conv.unread)) : null
                )
            );
            frag.appendChild(item);
        });

        container.replaceChildren(frag);
    }

    static renderChatPane() {
        const conv = WhatsappAiInbox.getActiveConversation();
        const nameEl = Utils.$('waChatName');
        const phoneEl = Utils.$('waChatPhone');
        const avatarEl = Utils.$('waChatAvatar');
        const modeBadge = Utils.$('waModeBadge');
        const toggleEl = Utils.$('waTakeoverToggle');
        const takeoverBtn = Utils.$('btnWaTakeover');
        const streamEl = Utils.$('waMessageStream');
        if (!streamEl) return;

        if (!conv) {
            if (nameEl) nameEl.textContent = 'Konuşma seçilmedi';
            if (phoneEl) phoneEl.textContent = '-';
            streamEl.replaceChildren(Utils.el('div', { className: 'text-muted font-12' }, 'Soldan bir konuşma seçin.'));
            return;
        }

        const initials = (conv.name || 'SZ')
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(p => p[0].toUpperCase())
            .join('');

        if (nameEl) nameEl.textContent = conv.name || 'Müşteri';
        if (phoneEl) phoneEl.textContent = conv.phone || '-';
        if (avatarEl) avatarEl.textContent = initials || 'SZ';

        if (modeBadge) {
            modeBadge.textContent = conv.aiPaused ? 'AI Durduruldu (Manuel)' : 'AI Asistan Aktif';
            modeBadge.className = 'wa-mode-badge ' + (conv.aiPaused ? 'is-manual' : 'is-ai');
        }
        if (toggleEl) toggleEl.checked = Boolean(conv.aiPaused);
        if (takeoverBtn) {
            takeoverBtn.textContent = conv.aiPaused ? 'AI Asistanı Devreye Al' : "AI'ı Durdur / Manuel Yanıtla";
            takeoverBtn.classList.toggle('is-manual', Boolean(conv.aiPaused));
        }

        const frag = document.createDocumentFragment();
        (conv.messages || []).forEach(msg => {
            const isIncoming = msg.sender === 'customer';
            const isAi = msg.sender === 'ai';
            const rowClass = 'wa-msg-row ' + (isIncoming ? 'is-incoming' : 'is-outgoing ' + (isAi ? 'is-ai' : 'is-manual'));

            let senderBadge = null;
            if (isAi) {
                senderBadge = Utils.el('span', { className: 'wa-ai-badge' }, 'AI Asistan');
            } else if (!isIncoming) {
                senderBadge = Utils.el('span', { className: 'wa-manual-badge' }, 'Yönetici');
            }

            const row = Utils.el('div', { className: rowClass },
                Utils.el('div', { className: 'wa-msg-bubble' }, msg.text || ''),
                Utils.el('div', { className: 'wa-msg-meta' },
                    senderBadge,
                    Utils.el('span', {}, msg.time || '')
                )
            );
            frag.appendChild(row);
        });

        streamEl.replaceChildren(frag);
        streamEl.scrollTop = streamEl.scrollHeight;
    }
}

export default WhatsappAiInbox;
