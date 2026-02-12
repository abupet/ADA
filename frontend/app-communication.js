// app-communication.js v2.0
// ADA Unified Messaging — human chat + AI chatbot in WhatsApp-like UI
//
// Globals expected: window.io, window.ADA_API_BASE_URL, showToast(), getActiveRole(),
//                   getAuthToken(), getJwtUserId(), getAllPets(), getCurrentPetId()
// Globals exposed:  initCommSocket(), disconnectCommSocket(), initCommunication(),
//                   openConversation(), updateCommUnreadBadge(), loadAiSettingsUI(),
//                   subscribeToPush(), loadPetConversations()

// =========================================================================
// Internal state
// =========================================================================
var _commSocket = null;
var _commCurrentConversationId = null;
var _commCurrentConversationType = null; // 'human' | 'ai'
var _commTypingTimer = null;
var _commCSSInjected = false;
var _commMessagesCursor = null;
var _commAiSending = false;
var _commReplyTo = null; // { message_id, content, sender_name }
var _commContainerId = null;

// =========================================================================
// Helpers
// =========================================================================
function _commApiBase() { return window.ADA_API_BASE_URL || ''; }

function _commAuthHeaders() {
    return { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' };
}

function _commEscape(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _commFormatTime(iso) {
    if (!iso) return '';
    try {
        var d = new Date(iso), now = new Date(), today = d.toDateString() === now.toDateString();
        var t = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        if (today) return t;
        var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + t;
    } catch (e) { return ''; }
}

function _commFormatDateSeparator(iso) {
    if (!iso) return '';
    try {
        var d = new Date(iso), now = new Date();
        if (d.toDateString() === now.toDateString()) return 'Oggi';
        var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
}

function _commGetRole() { return typeof getActiveRole === 'function' ? getActiveRole() : null; }

function _commGetCurrentUserId() {
    try { return typeof getJwtUserId === 'function' ? getJwtUserId() : null; } catch (e) { return null; }
}

function _commTriageInfo(level) {
    if (level === 'red') return { bg: '#fee2e2', color: '#991b1b', text: 'EMERGENZA \u2014 contattare subito il veterinario', badge: '#ef4444' };
    if (level === 'yellow') return { bg: '#fef9c3', color: '#854d0e', text: 'Consigliata visita veterinaria', badge: '#f59e0b' };
    return { bg: '#dcfce7', color: '#166534', text: 'Nessuna urgenza \u2014 monitorare a casa', badge: '#22c55e' };
}

function _commTriageBadgeHtml(level) {
    if (!level) return '';
    var info = _commTriageInfo(level);
    return '<span data-testid="comm-triage-badge" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + info.badge + ';margin-right:6px;"></span>';
}

function _commTriageBannerHtml(level) {
    var info = _commTriageInfo(level || 'green');
    return '<div data-testid="comm-triage-banner" style="padding:10px 16px;border-radius:8px;background:' + info.bg + ';color:' + info.color + ';font-size:13px;font-weight:600;margin-bottom:12px;text-align:center;">' +
        _commEscape(info.text) + '</div>';
}

function _commDeliveryIcon(status) {
    if (status === 'read') return '<span style="color:#2563eb;font-size:11px;" title="Letto">\u2713\u2713</span>';
    if (status === 'delivered') return '<span style="color:#94a3b8;font-size:11px;" title="Consegnato">\u2713\u2713</span>';
    return '<span style="color:#94a3b8;font-size:11px;" title="Inviato">\u2713</span>';
}

// =========================================================================
// CSS injection
// =========================================================================
function _commInjectStyles() {
    if (_commCSSInjected) return;
    _commCSSInjected = true;
    var css =
        '.comm-container{max-width:700px;margin:0 auto}' +
        '.comm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}' +
        '.comm-header h3{margin:0;font-size:18px;color:#1e3a5f}' +
        '.comm-btn{padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:background .2s}' +
        '.comm-btn-primary{background:#2563eb;color:#fff}.comm-btn-primary:hover{background:#1d4ed8}' +
        '.comm-btn-secondary{background:#f1f5f9;color:#1e3a5f;border:1px solid #e2e8f0}.comm-btn-secondary:hover{background:#e2e8f0}' +
        '.comm-btn-danger{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}.comm-btn-danger:hover{background:#fecaca}' +
        '.comm-conv-list{list-style:none;padding:0;margin:0}' +
        '.comm-conv-card{display:flex;align-items:center;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:background .15s;background:#fff}' +
        '.comm-conv-card:hover{background:#f8fafc}' +
        '.comm-conv-avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0;margin-right:12px}' +
        '.comm-conv-avatar-human{background:#e0e7ff;color:#3730a3}' +
        '.comm-conv-avatar-ai{background:#2563eb;color:#fff}' +
        '.comm-conv-info{flex:1;min-width:0}.comm-conv-pet{font-weight:600;font-size:14px;color:#1e3a5f}' +
        '.comm-conv-subject{font-size:12px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.comm-conv-preview{font-size:12px;color:#94a3b8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.comm-conv-meta{text-align:right;flex-shrink:0;margin-left:12px}.comm-conv-time{font-size:11px;color:#94a3b8}' +
        '.comm-badge{display:inline-block;min-width:20px;padding:2px 7px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;text-align:center;margin-top:4px}' +
        '.comm-status-badge{display:inline-block;font-size:10px;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:6px;margin-left:8px}' +
        '.comm-status-open{background:#dcfce7;color:#16a34a}.comm-status-closed{background:#f1f5f9;color:#64748b}' +
        '.comm-chat-header{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}' +
        '.comm-chat-messages{max-height:420px;overflow-y:auto;padding:8px 0;display:flex;flex-direction:column;gap:8px}' +
        '.comm-msg{max-width:78%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word;position:relative}' +
        '.comm-msg-own{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}' +
        '.comm-msg-other{align-self:flex-start;background:#f1f5f9;color:#1e3a5f;border-bottom-left-radius:4px}' +
        '.comm-msg-ai{align-self:flex-start;background:#f0f9ff;color:#1e3a5f;border-bottom-left-radius:4px}' +
        '.comm-msg-system{align-self:center;background:#fef9c3;color:#854d0e;font-size:12px;border-radius:8px}' +
        '.comm-msg-deleted{align-self:flex-start;background:#f8fafc;color:#94a3b8;font-style:italic;font-size:12px}' +
        '.comm-msg-sender{font-size:11px;font-weight:600;margin-bottom:2px;opacity:.8}' +
        '.comm-msg-time{font-size:10px;opacity:.6;margin-top:4px;text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:4px}' +
        '.comm-msg-reply-bar{border-left:3px solid #2563eb;padding:4px 8px;margin-bottom:6px;background:rgba(37,99,235,.08);border-radius:0 6px 6px 0;font-size:11px;color:#64748b;cursor:pointer}' +
        '.comm-typing{font-size:12px;color:#94a3b8;font-style:italic;min-height:20px;margin-top:4px}' +
        '.comm-input-row{display:flex;gap:8px;margin-top:12px;align-items:flex-end}' +
        '.comm-input-row textarea{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;resize:none;font-family:inherit;min-height:42px;max-height:120px}' +
        '.comm-input-row textarea:focus{outline:none;border-color:#2563eb}' +
        '.comm-reply-preview{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f0f9ff;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;margin-top:8px;font-size:12px;color:#64748b}' +
        '.comm-reply-preview-close{cursor:pointer;font-size:16px;color:#94a3b8;margin-left:auto}' +
        '.comm-load-more{text-align:center;margin-bottom:8px}' +
        '.comm-load-more button{background:none;border:1px solid #e2e8f0;border-radius:6px;padding:6px 14px;font-size:12px;color:#64748b;cursor:pointer}' +
        '.comm-load-more button:hover{background:#f1f5f9}' +
        '.comm-new-form{padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px}' +
        '.comm-new-form label{display:block;font-size:13px;font-weight:600;color:#1e3a5f;margin-bottom:4px;margin-top:12px}' +
        '.comm-new-form select,.comm-new-form input{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box}' +
        '.comm-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}' +
        '.comm-date-sep{text-align:center;margin:12px 0;font-size:11px;color:#94a3b8;position:relative}' +
        '.comm-date-sep span{background:#fff;padding:0 12px;position:relative;z-index:1}' +
        '.comm-date-sep::before{content:"";position:absolute;top:50%;left:0;right:0;height:1px;background:#e2e8f0}' +
        '.comm-ai-disclaimer{padding:8px 16px;border-radius:8px;background:#f0f9ff;color:#1e40af;font-size:12px;margin-bottom:12px;text-align:center;border:1px solid #bfdbfe}' +
        '.comm-followups{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
        '.comm-chip{display:inline-block;padding:6px 12px;border-radius:16px;background:#e0e7ff;color:#3730a3;font-size:12px;cursor:pointer;border:1px solid #c7d2fe;transition:background .15s}' +
        '.comm-chip:hover{background:#c7d2fe}' +
        '.comm-spinner{display:flex;align-items:center;gap:8px;padding:10px 14px;align-self:flex-start;color:#94a3b8;font-size:13px;font-style:italic}' +
        '.comm-spinner-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;animation:comm-bounce 1.2s infinite ease-in-out}' +
        '.comm-spinner-dot:nth-child(2){animation-delay:0.2s}.comm-spinner-dot:nth-child(3){animation-delay:0.4s}' +
        '@keyframes comm-bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
        '.comm-search{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:12px;box-sizing:border-box}' +
        '.comm-search:focus{outline:none;border-color:#2563eb}' +
        '.comm-settings-toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f1f5f9}' +
        '.comm-settings-label{font-size:14px;color:#1e3a5f}.comm-settings-desc{font-size:12px;color:#94a3b8;margin-top:2px}' +
        '.comm-switch{position:relative;width:44px;height:24px;flex-shrink:0}.comm-switch input{opacity:0;width:0;height:0}' +
        '.comm-switch-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#cbd5e1;border-radius:24px;transition:.3s}' +
        '.comm-switch-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}' +
        '.comm-switch input:checked+.comm-switch-slider{background:#2563eb}' +
        '.comm-switch input:checked+.comm-switch-slider:before{transform:translateX(20px)}' +
        '.comm-pet-hint{font-size:12px;color:#64748b;margin-top:4px;display:none}';
    var style = document.createElement('style');
    style.setAttribute('data-comm-styles', '1');
    style.textContent = css;
    document.head.appendChild(style);
}

// =========================================================================
// Section 1: Socket.io connection management
// =========================================================================
function initCommSocket() {
    if (_commSocket) return;
    if (typeof window.io !== 'function') { console.warn('[Communication] Socket.io not loaded'); return; }
    var token = getAuthToken();
    if (!token) return;

    try {
        _commSocket = window.io(_commApiBase() + '/communication', {
            path: '/ws', auth: { token: token },
            transports: ['websocket', 'polling'],
            reconnection: true, reconnectionDelay: 2000, reconnectionAttempts: 10
        });
        _commSocket.on('connect', function () { console.log('[Communication] Socket connected'); });
        _commSocket.on('new_message', function (d) { _commHandleNewMessage(d); });
        _commSocket.on('user_typing', function (d) { _commHandleTyping(d); });
        _commSocket.on('messages_read', function (d) { _commHandleMessagesRead(d); });
        _commSocket.on('delivery_update', function (d) { _commHandleDeliveryUpdate(d); });
        _commSocket.on('user_online', function (d) { _commHandleUserOnline(d, true); });
        _commSocket.on('user_offline', function (d) { _commHandleUserOnline(d, false); });
        _commSocket.on('disconnect', function (r) { console.warn('[Communication] Socket disconnected:', r); });
        _commSocket.on('connect_error', function (e) { console.warn('[Communication] Socket error:', e.message); });
    } catch (_) { /* socket init failure is non-critical */ }
}

function disconnectCommSocket() {
    if (_commSocket) {
        if (_commCurrentConversationId) _commSocket.emit('leave_conversation', { conversationId: _commCurrentConversationId });
        _commSocket.disconnect();
        _commSocket = null;
    }
    _commCurrentConversationId = null;
    _commCurrentConversationType = null;
}

// =========================================================================
// Socket event handlers
// =========================================================================
function _commHandleNewMessage(data) {
    updateCommUnreadBadge();
    if (_commCurrentConversationId && data && data.conversation_id === _commCurrentConversationId) {
        var container = document.getElementById('comm-chat-messages');
        if (container) {
            var isOwn = data.sender_id === _commGetCurrentUserId();
            container.innerHTML += _commRenderBubble(data, isOwn);
            container.scrollTop = container.scrollHeight;
            _commMarkAsRead(_commCurrentConversationId);
            // Emit delivered for human chats
            if (_commCurrentConversationType === 'human' && !isOwn && _commSocket) {
                _commSocket.emit('message_delivered', { messageId: data.message_id });
            }
        }
    }
}

function _commHandleTyping(data) {
    if (!data || data.conversation_id !== _commCurrentConversationId) return;
    var el = document.getElementById('comm-typing-indicator');
    if (!el) return;
    el.textContent = (data.display_name || 'Utente') + ' sta scrivendo...';
    clearTimeout(_commTypingTimer);
    _commTypingTimer = setTimeout(function () { if (el) el.textContent = ''; }, 3000);
}

function _commHandleMessagesRead(data) {
    if (!data || data.conversation_id !== _commCurrentConversationId) return;
    // Update delivery indicators to 'read' for own messages
    var msgEls = document.querySelectorAll('[data-delivery-status]');
    msgEls.forEach(function (el) { el.innerHTML = _commDeliveryIcon('read'); });
}

function _commHandleDeliveryUpdate(data) {
    if (!data || !data.messageId) return;
    var el = document.querySelector('[data-msg-id="' + data.messageId + '"] [data-delivery-status]');
    if (el) el.innerHTML = _commDeliveryIcon(data.status);
}

function _commHandleUserOnline(data, isOnline) {
    console.log('[Communication] User', data && data.user_id, isOnline ? 'online' : 'offline');
}

// =========================================================================
// Section 2: Conversation list (unified human + AI)
// =========================================================================
async function initCommunication(containerId) {
    _commInjectStyles();
    _commContainerId = containerId;
    var container = document.getElementById(containerId);
    if (!container) return;

    var existingForm = document.querySelector('[data-testid="comm-new-form"]');
    if (existingForm) return;

    container.innerHTML = '<div class="comm-container" data-testid="comm-container">' +
        '<div class="comm-header"><h3>Messaggi</h3>' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-new-btn">Nuova conversazione</button></div>' +
        '<input type="text" class="comm-search" data-testid="comm-search" placeholder="Cerca conversazione..." oninput="_commFilterList(this.value)" />' +
        '<div id="comm-new-form-area"></div>' +
        '<div id="comm-conv-list-area"><p style="color:#94a3b8;text-align:center;">Caricamento...</p></div></div>';

    var newBtn = container.querySelector('[data-testid="comm-new-btn"]');
    if (newBtn) {
        newBtn.addEventListener('click', function() { _commShowNewForm(containerId); });
    }

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations', { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        _commRenderConvList(data.conversations || data || []);
    } catch (_) {
        var la = document.getElementById('comm-conv-list-area');
        if (la) la.innerHTML = '<div class="comm-empty">Messaggi non disponibili.</div>';
    }
}

var _commAllConversations = [];

function _commRenderConvList(conversations) {
    _commAllConversations = conversations || [];
    var listArea = document.getElementById('comm-conv-list-area');
    if (!listArea) return;
    if (!conversations || conversations.length === 0) {
        listArea.innerHTML = '<div class="comm-empty" data-testid="comm-empty">Nessuna conversazione. Inizia una nuova chat!</div>';
        return;
    }
    listArea.innerHTML = _commBuildConvListHtml(conversations);
}

function _commBuildConvListHtml(conversations) {
    var html = '<ul class="comm-conv-list" data-testid="comm-conv-list">';
    var userId = _commGetCurrentUserId();
    for (var i = 0; i < conversations.length; i++) {
        var c = conversations[i];
        var isAi = c.recipient_type === 'ai' || c.vet_user_id === 'ada-assistant';
        var name, avatarCls, avatarContent;
        if (isAi) {
            name = 'ADA - Assistente';
            avatarCls = 'comm-conv-avatar comm-conv-avatar-ai';
            avatarContent = '\uD83E\uDD16';
        } else {
            var otherName = c.vet_display_name || c.owner_display_name || '';
            if (!otherName) {
                otherName = (userId === c.vet_user_id) ? (c.owner_display_name || 'Proprietario') : (c.vet_display_name || 'Veterinario');
            }
            name = _commEscape(otherName);
            avatarCls = 'comm-conv-avatar comm-conv-avatar-human';
            avatarContent = _commEscape((otherName || 'U').charAt(0).toUpperCase());
        }
        var petName = _commEscape(c.pet_name || 'Generale');
        var preview = _commEscape(c.last_message_text || '');
        if (preview.length > 60) preview = preview.substring(0, 57) + '...';
        var time = _commFormatTime(c.last_message_at || c.updated_at);
        var unread = c.unread_count || 0;
        var stCls = c.status === 'closed' ? 'comm-status-closed' : 'comm-status-open';
        var stLbl = c.status === 'closed' ? 'Chiusa' : 'Aperta';
        var triageHtml = isAi && c.triage_level ? _commTriageBadgeHtml(c.triage_level) : '';

        html += '<li class="comm-conv-card" data-testid="comm-conv-card" data-search="' +
            _commEscape((name + ' ' + petName + ' ' + (c.subject || '') + ' ' + preview).toLowerCase()) +
            '" onclick="openConversation(\'' + c.conversation_id + '\')">' +
            '<div class="' + avatarCls + '">' + avatarContent + '</div>' +
            '<div class="comm-conv-info"><div class="comm-conv-pet">' + triageHtml + name +
            '<span class="comm-status-badge ' + stCls + '">' + stLbl + '</span></div>' +
            '<div class="comm-conv-subject" style="color:#94a3b8;font-size:12px;">' + petName + (c.subject ? ' \u2014 ' + _commEscape(c.subject) : '') + '</div>' +
            (preview ? '<div class="comm-conv-preview">' + preview + '</div>' : '') +
            '</div><div class="comm-conv-meta"><div class="comm-conv-time">' + time + '</div>' +
            (unread > 0 ? '<div class="comm-badge" data-testid="comm-unread-count">' + unread + '</div>' : '') +
            '</div></li>';
    }
    return html + '</ul>';
}

function _commFilterList(query) {
    var q = (query || '').toLowerCase().trim();
    var cards = document.querySelectorAll('[data-testid="comm-conv-card"]');
    cards.forEach(function (card) {
        var search = card.getAttribute('data-search') || '';
        card.style.display = (!q || search.indexOf(q) !== -1) ? '' : 'none';
    });
}

// =========================================================================
// New conversation form (unified: AI + human)
// =========================================================================
async function _commShowNewForm(containerId) {
    var area = document.getElementById('comm-new-form-area');
    if (!area) {
        if (typeof initCommunication === 'function') {
            await initCommunication(containerId);
            area = document.getElementById('comm-new-form-area');
            if (!area) return;
        } else { return; }
    }

    var role = _commGetRole();
    // Build recipient type options
    var recipientOpts = '<option value="ai">\uD83E\uDD16 ADA - Assistente</option>';
    if (role === 'proprietario') {
        recipientOpts += '<option value="vet">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario</option>';
    } else {
        recipientOpts += '<option value="vet">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario</option>';
        recipientOpts += '<option value="owner">\uD83E\uDDD1 Proprietario</option>';
    }

    area.innerHTML = '<div class="comm-new-form" data-testid="comm-new-form">' +
        '<label for="comm-new-dest-type">Destinatario</label>' +
        '<select id="comm-new-dest-type" onchange="_commOnDestTypeChange()">' + recipientOpts + '</select>' +
        '<div id="comm-new-recipient-row" style="display:none;">' +
        '<label for="comm-new-recipient">Seleziona destinatario</label>' +
        '<select id="comm-new-recipient" disabled><option value="">Caricamento...</option></select></div>' +
        '<label for="comm-new-pet">Animale</label>' +
        '<select id="comm-new-pet"><option value="">Caricamento...</option></select>' +
        '<div class="comm-pet-hint" id="comm-pet-hint">\uD83D\uDCA1 Seleziona un animale per ricevere consigli pi\u00f9 precisi</div>' +
        '<label for="comm-new-subject">Oggetto (opzionale)</label>' +
        '<input type="text" id="comm-new-subject" placeholder="Es: Controllo post-operatorio" />' +
        '<div style="margin-top:14px;display:flex;gap:8px;">' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-create-btn" onclick="_commCreateConversation()">Crea</button>' +
        '<button class="comm-btn comm-btn-secondary" onclick="document.getElementById(\'comm-new-form-area\').innerHTML=\'\'">Annulla</button>' +
        '</div></div>';

    // Populate pet dropdown
    var petSelect = document.getElementById('comm-new-pet');
    if (petSelect && typeof getAllPets === 'function') {
        try {
            var pets = await getAllPets();
            if (Array.isArray(pets) && pets.length > 0) {
                var optHtml = '<option value="">\u2014 Nessun animale (conversazione generale) \u2014</option>';
                for (var i = 0; i < pets.length; i++) {
                    var p = pets[i];
                    var label = _commEscape((p.name || 'Pet') + ' (' + (p.species || '') + ')' + (p.breed ? ' - ' + p.breed : ''));
                    optHtml += '<option value="' + _commEscape(p.id) + '">' + label + '</option>';
                }
                petSelect.innerHTML = optHtml;
            } else {
                petSelect.innerHTML = '<option value="">\u2014 Nessun animale \u2014</option>';
            }
        } catch (_) {
            petSelect.innerHTML = '<option value="">Errore caricamento animali</option>';
        }
    }

    // Show pet hint for AI
    _commOnDestTypeChange();
}

function _commOnDestTypeChange() {
    var destType = (document.getElementById('comm-new-dest-type') || {}).value || 'ai';
    var recipientRow = document.getElementById('comm-new-recipient-row');
    var petHint = document.getElementById('comm-pet-hint');
    if (destType === 'ai') {
        if (recipientRow) recipientRow.style.display = 'none';
        if (petHint) petHint.style.display = 'block';
    } else {
        if (recipientRow) recipientRow.style.display = '';
        if (petHint) petHint.style.display = 'none';
        _commLoadRecipients();
    }
}

async function _commLoadRecipients() {
    var destType = (document.getElementById('comm-new-dest-type') || {}).value || '';
    var recipientSelect = document.getElementById('comm-new-recipient');
    if (!recipientSelect || destType === 'ai') return;

    recipientSelect.disabled = true;
    recipientSelect.innerHTML = '<option value="">Caricamento...</option>';

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/users?role=' + encodeURIComponent(destType), { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var users = data.users || [];
        if (users.length === 0) {
            recipientSelect.innerHTML = '<option value="">Nessun destinatario trovato</option>';
            return;
        }
        var optHtml = '<option value="">-- Seleziona --</option>';
        for (var i = 0; i < users.length; i++) {
            var u = users[i];
            optHtml += '<option value="' + _commEscape(u.user_id) + '">' + _commEscape(u.display_name || u.email || u.user_id) + '</option>';
        }
        recipientSelect.innerHTML = optHtml;
        recipientSelect.disabled = false;
    } catch (_) {
        recipientSelect.innerHTML = '<option value="">Errore caricamento</option>';
    }
}

async function _commCreateConversation() {
    var destType = (document.getElementById('comm-new-dest-type') || {}).value || 'ai';
    var recipientId = (document.getElementById('comm-new-recipient') || {}).value || '';
    var petId = (document.getElementById('comm-new-pet') || {}).value || '';
    var subject = (document.getElementById('comm-new-subject') || {}).value || '';
    petId = petId.trim(); subject = subject.trim(); recipientId = recipientId.trim();

    if (destType !== 'ai' && !recipientId) {
        if (typeof showToast === 'function') showToast('Seleziona un destinatario', 'warning');
        return;
    }

    try {
        var body = { recipient_type: destType === 'ai' ? 'ai' : 'human' };
        if (petId) body.pet_id = petId;
        if (subject) body.subject = subject;

        if (destType === 'ai') {
            body.vet_user_id = 'ada-assistant';
        } else if (destType === 'vet') {
            body.vet_user_id = recipientId;
        } else if (destType === 'owner') {
            body.owner_override_id = recipientId;
        }

        var resp = await fetch(_commApiBase() + '/api/communication/conversations', {
            method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        if (typeof showToast === 'function') showToast('Conversazione creata', 'success');
        var fa = document.getElementById('comm-new-form-area');
        if (fa) fa.innerHTML = '';
        // Open the new conversation directly
        var convId = data.conversation_id || (data.conversation && data.conversation.conversation_id);
        if (convId) {
            openConversation(convId);
        } else {
            initCommunication(_commContainerId || 'communication-container');
        }
    } catch (e) {
        console.error('[Communication] Failed to create conversation:', e);
        if (typeof showToast === 'function') showToast('Errore nella creazione della conversazione', 'error');
    }
}

// =========================================================================
// Section 3: Chat view (unified human + AI)
// =========================================================================
async function openConversation(conversationId) {
    _commInjectStyles();
    _commMessagesCursor = null;
    _commReplyTo = null;
    _commAiSending = false;

    if (_commSocket && _commCurrentConversationId) _commSocket.emit('leave_conversation', { conversationId: _commCurrentConversationId });
    _commCurrentConversationId = conversationId;
    if (_commSocket) _commSocket.emit('join_conversation', { conversationId: conversationId });

    // Find the container
    var container = document.getElementById('comm-conv-list-area');
    var formArea = document.getElementById('comm-new-form-area');
    if (formArea) formArea.innerHTML = '';
    if (!container) container = document.querySelector('[data-testid="comm-container"]');
    if (!container) {
        // Fallback: navigate to communication page then open
        container = document.getElementById('communication-container');
    }
    if (!container) return;
    container.innerHTML = '<p style="color:#94a3b8;text-align:center;">Caricamento messaggi...</p>';

    try {
        // Load conversation info + messages
        var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/messages', { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var messages = data.messages || data || [];
        _commMessagesCursor = data.next_cursor || null;

        // Determine conversation type from messages or conversation metadata
        var convType = data.recipient_type || 'human';
        if (!data.recipient_type) {
            // Check if any message has ai_role or sender is ada-assistant
            for (var i = 0; i < messages.length; i++) {
                if (messages[i].ai_role || messages[i].sender_id === 'ada-assistant') {
                    convType = 'ai'; break;
                }
            }
        }
        _commCurrentConversationType = convType;

        var parentContainer = container.closest ? container.closest('[data-testid="comm-container"]') : container;
        if (!parentContainer) parentContainer = container;
        _commRenderChat(parentContainer, conversationId, messages, data);
        _commMarkAsRead(conversationId);
    } catch (e) {
        console.error('[Communication] Failed to load messages:', e);
        container.innerHTML = '<div class="comm-empty">Impossibile caricare i messaggi.</div>';
        if (typeof showToast === 'function') showToast('Errore nel caricamento dei messaggi', 'error');
    }
}

function _commRenderChat(container, convId, messages, meta) {
    var userId = _commGetCurrentUserId();
    var isAi = _commCurrentConversationType === 'ai';
    var convSubject = (meta && meta.subject) || '';
    var convPetName = (meta && meta.pet_name) || 'Generale';
    var convTriageLevel = (meta && meta.triage_level) || 'green';

    // Header
    var headerTitle = isAi ? '\uD83E\uDD16 ADA - Assistente Veterinaria' : _commEscape(convSubject || 'Conversazione');
    var html = '<div class="comm-chat-header" data-testid="comm-chat-header">' +
        '<button class="comm-btn comm-btn-secondary" data-testid="comm-back-btn" onclick="_commGoBack()">\u2190 Indietro</button>' +
        '<div style="flex:1;"><div style="font-weight:600;color:#1e3a5f;font-size:14px;">' + headerTitle + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;">' + _commEscape(convPetName) + '</div></div>';

    if (isAi) {
        html += '<span style="font-size:11px;color:#22c55e;">\u25CF Online</span>';
    }
    html += '</div>';

    // AI disclaimer
    if (isAi) {
        html += '<div class="comm-ai-disclaimer" data-testid="comm-ai-disclaimer">' +
            '\u2695\uFE0F Assistente digitale ADA \u2014 le informazioni non sostituiscono il parere del veterinario</div>';
        html += '<div id="comm-triage-area">' + _commTriageBannerHtml(convTriageLevel) + '</div>';
    }

    // Load more button
    html += '<div class="comm-load-more" id="comm-load-more" style="' + (_commMessagesCursor ? '' : 'display:none;') + '">' +
        '<button data-testid="comm-load-more-btn" onclick="_commLoadMore(\'' + convId + '\')">Carica messaggi precedenti</button></div>';

    // Messages
    html += '<div class="comm-chat-messages" id="comm-chat-messages" data-testid="comm-chat-messages">';
    var lastDate = '';
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        // Date separator
        var msgDate = msg.created_at ? new Date(msg.created_at).toDateString() : '';
        if (msgDate && msgDate !== lastDate) {
            html += '<div class="comm-date-sep"><span>' + _commFormatDateSeparator(msg.created_at) + '</span></div>';
            lastDate = msgDate;
        }
        var isOwn = msg.sender_id === userId;
        html += _commRenderBubble(msg, isOwn);
    }
    html += '</div>';

    // Typing indicator (human only)
    if (!isAi) {
        html += '<div class="comm-typing" id="comm-typing-indicator" data-testid="comm-typing-indicator"></div>';
    }

    // Reply preview bar
    html += '<div id="comm-reply-preview" style="display:none;" class="comm-reply-preview">' +
        '<span id="comm-reply-text"></span>' +
        '<span class="comm-reply-preview-close" onclick="_commCancelReply()">\u00D7</span></div>';

    // Input row
    var isClosed = meta && meta.status === 'closed';
    if (!isClosed) {
        html += '<div class="comm-input-row" data-testid="comm-input-row">' +
            '<textarea id="comm-msg-input" data-testid="comm-msg-input" placeholder="Scrivi un messaggio..." rows="1" ' +
            'onkeydown="_commKeydown(event,\'' + convId + '\')" oninput="_commEmitTyping(\'' + convId + '\')"></textarea>' +
            '<button class="comm-btn comm-btn-primary" data-testid="comm-send-btn" onclick="_commSend(\'' + convId + '\')">Invia</button></div>';
    } else {
        html += '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:12px;">Conversazione chiusa</div>';
    }

    container.innerHTML = html;
    var mc = document.getElementById('comm-chat-messages');
    if (mc) mc.scrollTop = mc.scrollHeight;
}

function _commRenderBubble(msg, isOwn) {
    var isAiConv = _commCurrentConversationType === 'ai';
    var type = msg.type || msg.message_type || 'text';

    // System message
    if (type === 'system') {
        return '<div class="comm-msg comm-msg-system" data-testid="comm-msg-system">' + _commEscape(msg.content || '') + '</div>';
    }

    // Soft-deleted message
    if (msg.deleted_at) {
        return '<div class="comm-msg comm-msg-deleted" data-testid="comm-msg-deleted">\uD83D\uDEAB <em>Questo messaggio \u00e8 stato eliminato</em></div>';
    }

    var isAiMsg = msg.sender_id === 'ada-assistant' || msg.ai_role === 'assistant';
    var cls = isOwn ? 'comm-msg-own' : (isAiMsg ? 'comm-msg-ai' : 'comm-msg-other');
    var sender = '';
    if (!isOwn) {
        var roleLabel = msg.sender_role === 'vet' ? 'Veterinario' : (msg.sender_role === 'owner' ? 'Proprietario' : '');
        sender = isAiMsg ? '\uD83E\uDD16 ADA' : _commEscape((msg.sender_name || 'Utente') + (roleLabel ? ' (' + roleLabel + ')' : ''));
    }

    var html = '<div class="comm-msg ' + cls + '" data-testid="comm-msg" data-msg-id="' + (msg.message_id || '') + '">';

    // Reply-to bar
    if (msg.reply_to_content) {
        html += '<div class="comm-msg-reply-bar">\u21A9 ' + _commEscape(msg.reply_to_content.substring(0, 80)) + '</div>';
    }

    if (sender) html += '<div class="comm-msg-sender">' + sender + '</div>';

    // Triage badge for AI messages
    if (isAiMsg && msg.triage_level) {
        html += '<div style="margin-bottom:4px;">' + _commTriageBadgeHtml(msg.triage_level) +
            '<span style="font-size:11px;color:#64748b;">' + _commEscape(_commTriageInfo(msg.triage_level).text) + '</span></div>';
    }

    html += '<div>' + _commEscape(msg.content || '') + '</div>';

    // Follow-up chips for AI messages
    if (isAiMsg && msg.follow_up_questions && msg.follow_up_questions.length > 0) {
        html += '<div class="comm-followups" data-testid="comm-followups">';
        for (var j = 0; j < msg.follow_up_questions.length; j++) {
            var q = msg.follow_up_questions[j];
            html += '<span class="comm-chip" data-testid="comm-chip" onclick="_commSendChip(this)" data-question="' + _commEscape(q) + '">' + _commEscape(q) + '</span>';
        }
        html += '</div>';
    }

    // Time + delivery status
    html += '<div class="comm-msg-time">' + _commFormatTime(msg.created_at);
    if (isOwn && !isAiConv) {
        html += ' <span data-delivery-status>' + _commDeliveryIcon(msg.delivery_status || 'sent') + '</span>';
    }
    if (isAiMsg && msg.triage_level) {
        html += ' ' + _commTriageBadgeHtml(msg.triage_level);
    }
    html += '</div>';

    // Actions for human chats (reply, delete)
    if (!isAiConv && !isOwn) {
        html += '<span style="position:absolute;top:4px;right:4px;cursor:pointer;font-size:14px;opacity:0.4;display:none;" class="comm-msg-action" ' +
            'onclick="_commSetReplyTo(\'' + (msg.message_id || '') + '\',\'' + _commEscape(msg.content || '').substring(0, 50).replace(/'/g, "\\'") + '\',\'' + _commEscape(sender).replace(/'/g, "\\'") + '\')" title="Rispondi">\u21A9</span>';
    }
    if (!isAiConv && isOwn && msg.message_id) {
        html += '<span style="position:absolute;top:4px;left:4px;cursor:pointer;font-size:12px;opacity:0.4;display:none;" class="comm-msg-action" ' +
            'onclick="_commDeleteMessage(\'' + msg.message_id + '\')" title="Elimina">\uD83D\uDDD1</span>';
    }

    html += '</div>';
    return html;
}

// =========================================================================
// Chat actions
// =========================================================================
async function _commSend(conversationId) {
    var input = document.getElementById('comm-msg-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    if (_commAiSending) return;

    input.value = '';
    var isAi = _commCurrentConversationType === 'ai';
    var userId = _commGetCurrentUserId();

    // Optimistic render for user message
    var container = document.getElementById('comm-chat-messages');
    if (container) {
        var tempMsg = { content: text, sender_id: userId, created_at: new Date().toISOString(), delivery_status: 'sent' };
        if (_commReplyTo) tempMsg.reply_to_content = _commReplyTo.content;
        container.innerHTML += _commRenderBubble(tempMsg, true);
        container.scrollTop = container.scrollHeight;
    }

    // Show spinner for AI
    if (isAi && container) {
        _commAiSending = true;
        container.innerHTML += '<div class="comm-spinner" data-testid="comm-spinner" id="comm-ai-spinner">' +
            '<span class="comm-spinner-dot"></span><span class="comm-spinner-dot"></span><span class="comm-spinner-dot"></span>' +
            ' \uD83E\uDD16 ADA sta pensando...</div>';
        container.scrollTop = container.scrollHeight;
        input.disabled = true;
    }

    var body = { content: text };
    if (_commReplyTo && !isAi) body.reply_to_message_id = _commReplyTo.message_id;
    _commCancelReply();

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/messages', {
            method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
        });
        if (!resp.ok) {
            var errData = null;
            try { errData = await resp.json(); } catch(_){}
            if (errData && errData.error === 'session_limit_reached') {
                if (typeof showToast === 'function') showToast('Limite messaggi raggiunto. Inizia una nuova conversazione.', 'warning');
            } else {
                throw new Error('HTTP ' + resp.status);
            }
            return;
        }
        var data = await resp.json();

        if (isAi) {
            // Remove spinner
            var spinner = document.getElementById('comm-ai-spinner');
            if (spinner) spinner.remove();

            // Render AI response
            if (container && data) {
                var aiMsg = data.ai_message || data.assistant || data;
                if (aiMsg && aiMsg.content) {
                    container.innerHTML += _commRenderBubble(aiMsg, false);
                    container.scrollTop = container.scrollHeight;
                }
                // Update triage banner
                var triageLevel = aiMsg.triage_level || data.triage_level;
                if (triageLevel) {
                    var triageArea = document.getElementById('comm-triage-area');
                    if (triageArea) triageArea.innerHTML = _commTriageBannerHtml(triageLevel);
                }
            }
        }
        // For human chats, the optimistic message stays; socket will confirm
    } catch (e) {
        console.error('[Communication] Failed to send message:', e);
        if (typeof showToast === 'function') showToast("Errore nell'invio del messaggio", 'error');
        var spinnerEl = document.getElementById('comm-ai-spinner');
        if (spinnerEl) spinnerEl.remove();
    } finally {
        _commAiSending = false;
        if (input) { input.disabled = false; input.focus(); }
    }
}

function _commKeydown(event, conversationId) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); _commSend(conversationId); }
}

function _commEmitTyping(conversationId) {
    if (_commCurrentConversationType === 'ai') return; // No typing for AI
    if (_commSocket) _commSocket.emit('typing', { conversationId: conversationId });
}

function _commSendChip(chipEl) {
    var question = chipEl.getAttribute('data-question');
    if (!question || !_commCurrentConversationId) return;
    var input = document.getElementById('comm-msg-input');
    if (input) { input.value = question; _commSend(_commCurrentConversationId); }
}

// Reply-to
function _commSetReplyTo(messageId, content, senderName) {
    _commReplyTo = { message_id: messageId, content: content, sender_name: senderName };
    var preview = document.getElementById('comm-reply-preview');
    var textEl = document.getElementById('comm-reply-text');
    if (preview) preview.style.display = 'flex';
    if (textEl) textEl.textContent = '\u21A9 ' + senderName + ': ' + content;
    var input = document.getElementById('comm-msg-input');
    if (input) input.focus();
}

function _commCancelReply() {
    _commReplyTo = null;
    var preview = document.getElementById('comm-reply-preview');
    if (preview) preview.style.display = 'none';
}

// Soft delete
async function _commDeleteMessage(messageId) {
    if (!messageId) return;
    try {
        var resp = await fetch(_commApiBase() + '/api/communication/messages/' + messageId + '/delete', {
            method: 'PATCH', headers: _commAuthHeaders()
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        // Update UI: find the message bubble and replace content
        var msgEl = document.querySelector('[data-msg-id="' + messageId + '"]');
        if (msgEl) {
            msgEl.className = 'comm-msg comm-msg-deleted';
            msgEl.innerHTML = '\uD83D\uDEAB <em>Questo messaggio \u00e8 stato eliminato</em>';
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore eliminazione messaggio', 'error');
    }
}

// Mark as read
async function _commMarkAsRead(conversationId) {
    try {
        await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/read', {
            method: 'POST', headers: _commAuthHeaders()
        });
        if (_commSocket) _commSocket.emit('conversation_seen', { conversationId: conversationId, lastSeenAt: new Date().toISOString() });
        updateCommUnreadBadge();
    } catch (e) { /* silent */ }
}

// Load more
async function _commLoadMore(conversationId) {
    if (!_commMessagesCursor) return;
    try {
        var url = _commApiBase() + '/api/communication/conversations/' + conversationId + '/messages?cursor=' + encodeURIComponent(_commMessagesCursor);
        var resp = await fetch(url, { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var messages = data.messages || data || [];
        _commMessagesCursor = data.next_cursor || null;
        var lm = document.getElementById('comm-load-more');
        if (!_commMessagesCursor && lm) lm.style.display = 'none';
        var container = document.getElementById('comm-chat-messages');
        if (container && messages.length > 0) {
            var userId = _commGetCurrentUserId(), oldHtml = '', lastDate = '';
            for (var i = 0; i < messages.length; i++) {
                var msgDate = messages[i].created_at ? new Date(messages[i].created_at).toDateString() : '';
                if (msgDate && msgDate !== lastDate) {
                    oldHtml += '<div class="comm-date-sep"><span>' + _commFormatDateSeparator(messages[i].created_at) + '</span></div>';
                    lastDate = msgDate;
                }
                oldHtml += _commRenderBubble(messages[i], messages[i].sender_id === userId);
            }
            container.innerHTML = oldHtml + container.innerHTML;
        }
    } catch (e) {
        console.error('[Communication] Failed to load more messages:', e);
        if (typeof showToast === 'function') showToast('Errore nel caricamento dei messaggi', 'error');
    }
}

// Go back to list
function _commGoBack() {
    if (_commSocket && _commCurrentConversationId) _commSocket.emit('leave_conversation', { conversationId: _commCurrentConversationId });
    _commCurrentConversationId = null;
    _commCurrentConversationType = null;
    _commReplyTo = null;
    initCommunication(_commContainerId || 'communication-container');
}

// =========================================================================
// Section 4: Unread badge
// =========================================================================
async function updateCommUnreadBadge() {
    try {
        var resp = await fetch(_commApiBase() + '/api/communication/unread-count', { headers: _commAuthHeaders() });
        if (!resp.ok) return;
        var data = await resp.json();
        var count = data.unread_count || data.count || 0;
        ['comm-unread-badge-vet', 'comm-unread-badge-owner'].forEach(function(id) {
            var badge = document.getElementById(id);
            if (badge) {
                badge.textContent = count > 0 ? count : '';
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        });
    } catch (e) { /* silent */ }
}

// =========================================================================
// Section 5: AI Settings
// =========================================================================
async function loadAiSettingsUI(containerId) {
    _commInjectStyles();
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p style="color:#94a3b8;text-align:center;">Caricamento impostazioni...</p>';

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/settings', { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var s = await resp.json();
        var cb = !!s.chatbot_enabled, tr = !!s.auto_transcription_enabled;
        container.innerHTML = '<div data-testid="comm-ai-settings">' +
            '<h3 style="font-size:16px;color:#1e3a5f;margin:0 0 16px;">Impostazioni AI Comunicazione</h3>' +
            _commSettingRow('comm-toggle-chatbot', 'Chatbot automatico',
                'Risposte automatiche AI per le domande frequenti dei proprietari',
                'chatbot_enabled', cb) +
            _commSettingRow('comm-toggle-transcription', 'Trascrizione automatica',
                'Trascrivi automaticamente i messaggi vocali in testo',
                'auto_transcription_enabled', tr) +
            '</div>';
    } catch (e) {
        container.innerHTML = '<div class="comm-empty">Impostazioni AI non disponibili.</div>';
    }
}

function _commSettingRow(testId, label, desc, key, checked) {
    return '<div class="comm-settings-toggle" data-testid="' + testId + '">' +
        '<div><div class="comm-settings-label">' + label + '</div>' +
        '<div class="comm-settings-desc">' + desc + '</div></div>' +
        '<label class="comm-switch"><input type="checkbox" ' + (checked ? 'checked' : '') +
        ' onchange="_commToggleSetting(\'' + key + '\',this.checked)" />' +
        '<span class="comm-switch-slider"></span></label></div>';
}

async function _commToggleSetting(key, value) {
    try {
        var body = {};
        body[key] = value;
        var resp = await fetch(_commApiBase() + '/api/communication/settings', {
            method: 'PATCH', headers: _commAuthHeaders(), body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        if (typeof showToast === 'function') showToast('Impostazione aggiornata', 'success');
    } catch (e) {
        if (typeof showToast === 'function') showToast("Errore nell'aggiornamento", 'error');
    }
}

// =========================================================================
// Section 6: Push notification subscription
// =========================================================================
async function subscribeToPush() {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        var reg = await navigator.serviceWorker.ready;
        // Get VAPID key
        var resp = await fetch(_commApiBase() + '/api/push/vapid-key', { headers: _commAuthHeaders() });
        if (!resp.ok) return;
        var data = await resp.json();
        if (!data.publicKey) return;

        // Convert VAPID key
        var rawKey = data.publicKey;
        var padding = '='.repeat((4 - rawKey.length % 4) % 4);
        var base64 = (rawKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);

        var subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray
        });
        var subJson = subscription.toJSON();

        // Send to backend
        await fetch(_commApiBase() + '/api/push/subscribe', {
            method: 'POST', headers: _commAuthHeaders(),
            body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
        });
        console.log('[Push] Subscribed successfully');
    } catch (e) {
        console.warn('[Push] Subscription failed:', e);
    }
}

// =========================================================================
// Section 7: Pet conversations for history page
// =========================================================================
async function loadPetConversations(petId) {
    var listEl = document.getElementById('pet-conversations-list');
    if (!listEl) return;
    if (!petId) { listEl.innerHTML = ''; return; }

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations?pet_id=' + encodeURIComponent(petId), { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var convs = data.conversations || data || [];
        if (convs.length === 0) {
            listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Nessuna conversazione per questo paziente.</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < convs.length; i++) {
            var c = convs[i];
            var isAi = c.recipient_type === 'ai';
            var icon = isAi ? '\uD83E\uDD16' : '\uD83D\uDCAC';
            var name = isAi ? 'ADA' : _commEscape(c.vet_display_name || c.owner_display_name || 'Chat');
            var time = _commFormatTime(c.updated_at || c.created_at);
            var triageHtml = isAi && c.triage_level ? _commTriageBadgeHtml(c.triage_level) : '';
            html += '<div style="display:flex;align-items:center;padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;background:#fff;" ' +
                'onclick="navigateToPage(\'communication\');setTimeout(function(){openConversation(\'' + c.conversation_id + '\')},300);">' +
                '<span style="font-size:20px;margin-right:10px;">' + icon + '</span>' +
                '<div style="flex:1;"><div style="font-weight:600;font-size:13px;color:#1e3a5f;">' + triageHtml + name + '</div>' +
                (c.subject ? '<div style="font-size:12px;color:#94a3b8;">' + _commEscape(c.subject) + '</div>' : '') +
                '</div><div style="font-size:11px;color:#94a3b8;">' + time + '</div></div>';
        }
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '';
    }
}

// Handle push notification navigation
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'navigate_to_conversation' && event.data.conversationId) {
            if (typeof navigateToPage === 'function') navigateToPage('communication');
            setTimeout(function() { openConversation(event.data.conversationId); }, 300);
        }
    });
}
