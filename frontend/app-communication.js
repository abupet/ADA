// app-communication.js v1.0
// ADA Chat Communication System — veterinario <-> proprietario messaging
//
// Globals expected: window.io, window.ADA_API_BASE_URL, showToast(), getActiveRole()
// Globals exposed:  initCommSocket(), disconnectCommSocket(), initCommunication(),
//                   openConversation(), updateCommUnreadBadge(), loadAiSettingsUI()

// =========================================================================
// Internal state
// =========================================================================
var _commSocket = null;
var _commCurrentConversationId = null;
var _commTypingTimer = null;
var _commCSSInjected = false;
var _commMessagesCursor = null;

// =========================================================================
// Helpers
// =========================================================================
function _commApiBase() { return window.ADA_API_BASE_URL || ''; }

function _commAuthHeaders() {
    return { 'Authorization': 'Bearer ' + localStorage.getItem('ada_jwt_token'), 'Content-Type': 'application/json' };
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
        return today ? t : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + t;
    } catch (e) { return ''; }
}

function _commGetRole() { return typeof getActiveRole === 'function' ? getActiveRole() : null; }

function _commGetCurrentUserId() {
    try {
        var token = localStorage.getItem('ada_jwt_token');
        if (!token) return null;
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.sub || payload.userId || null;
    } catch (e) { return null; }
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
        '.comm-conv-list{list-style:none;padding:0;margin:0}' +
        '.comm-conv-card{display:flex;align-items:center;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:background .15s;background:#fff}' +
        '.comm-conv-card:hover{background:#f8fafc}' +
        '.comm-conv-info{flex:1;min-width:0}.comm-conv-pet{font-weight:600;font-size:14px;color:#1e3a5f}' +
        '.comm-conv-subject{font-size:12px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.comm-conv-preview{font-size:12px;color:#94a3b8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.comm-conv-meta{text-align:right;flex-shrink:0;margin-left:12px}.comm-conv-time{font-size:11px;color:#94a3b8}' +
        '.comm-badge{display:inline-block;min-width:20px;padding:2px 7px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;text-align:center;margin-top:4px}' +
        '.comm-status-badge{display:inline-block;font-size:10px;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:6px;margin-left:8px}' +
        '.comm-status-open{background:#dcfce7;color:#16a34a}.comm-status-closed{background:#f1f5f9;color:#64748b}' +
        '.comm-chat-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}' +
        '.comm-chat-messages{max-height:420px;overflow-y:auto;padding:8px 0;display:flex;flex-direction:column;gap:8px}' +
        '.comm-msg{max-width:78%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word}' +
        '.comm-msg-own{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}' +
        '.comm-msg-other{align-self:flex-start;background:#f1f5f9;color:#1e3a5f;border-bottom-left-radius:4px}' +
        '.comm-msg-system{align-self:center;background:#fef9c3;color:#854d0e;font-size:12px;border-radius:8px}' +
        '.comm-msg-sender{font-size:11px;font-weight:600;margin-bottom:2px;opacity:.8}' +
        '.comm-msg-time{font-size:10px;opacity:.6;margin-top:4px;text-align:right}' +
        '.comm-typing{font-size:12px;color:#94a3b8;font-style:italic;min-height:20px;margin-top:4px}' +
        '.comm-input-row{display:flex;gap:8px;margin-top:12px}' +
        '.comm-input-row textarea{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;resize:none;font-family:inherit;min-height:42px;max-height:120px}' +
        '.comm-input-row textarea:focus{outline:none;border-color:#2563eb}' +
        '.comm-load-more{text-align:center;margin-bottom:8px}' +
        '.comm-load-more button{background:none;border:1px solid #e2e8f0;border-radius:6px;padding:6px 14px;font-size:12px;color:#64748b;cursor:pointer}' +
        '.comm-load-more button:hover{background:#f1f5f9}' +
        '.comm-new-form{padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px}' +
        '.comm-new-form label{display:block;font-size:13px;font-weight:600;color:#1e3a5f;margin-bottom:4px;margin-top:12px}' +
        '.comm-new-form input,.comm-new-form select{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box}' +
        '.comm-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}' +
        '.comm-settings-toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f1f5f9}' +
        '.comm-settings-label{font-size:14px;color:#1e3a5f}.comm-settings-desc{font-size:12px;color:#94a3b8;margin-top:2px}' +
        '.comm-switch{position:relative;width:44px;height:24px;flex-shrink:0}.comm-switch input{opacity:0;width:0;height:0}' +
        '.comm-switch-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#cbd5e1;border-radius:24px;transition:.3s}' +
        '.comm-switch-slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}' +
        '.comm-switch input:checked+.comm-switch-slider{background:#2563eb}' +
        '.comm-switch input:checked+.comm-switch-slider:before{transform:translateX(20px)}';
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
    var token = localStorage.getItem('ada_jwt_token');
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
    // Could update read receipts; minimal for now
}

function _commHandleUserOnline(data, isOnline) {
    console.log('[Communication] User', data && data.user_id, isOnline ? 'online' : 'offline');
}

// =========================================================================
// Section 2: Conversation list
// =========================================================================
async function initCommunication(containerId) {
    _commInjectStyles();
    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div class="comm-container" data-testid="comm-container">' +
        '<div class="comm-header"><h3>Messaggi</h3>' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-new-btn" onclick="_commShowNewForm(\'' + containerId + '\')">Nuova conversazione</button></div>' +
        '<div id="comm-new-form-area"></div>' +
        '<div id="comm-conv-list-area"><p style="color:#94a3b8;text-align:center;">Caricamento...</p></div></div>';

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

function _commRenderConvList(conversations) {
    var listArea = document.getElementById('comm-conv-list-area');
    if (!listArea) return;
    if (!conversations || conversations.length === 0) {
        listArea.innerHTML = '<div class="comm-empty" data-testid="comm-empty">Nessuna conversazione. Inizia una nuova chat!</div>';
        return;
    }
    var html = '<ul class="comm-conv-list" data-testid="comm-conv-list">';
    for (var i = 0; i < conversations.length; i++) {
        var c = conversations[i];
        var pet = _commEscape(c.pet_name || 'Paziente'), subj = _commEscape(c.subject || '');
        var preview = _commEscape(c.last_message_text || ''), time = _commFormatTime(c.last_message_at || c.updated_at);
        var unread = c.unread_count || 0;
        var stCls = c.status === 'closed' ? 'comm-status-closed' : 'comm-status-open';
        var stLbl = c.status === 'closed' ? 'Chiusa' : 'Aperta';
        html += '<li class="comm-conv-card" data-testid="comm-conv-card" onclick="openConversation(\'' + c.id + '\')">' +
            '<div class="comm-conv-info"><div class="comm-conv-pet">' + pet +
            '<span class="comm-status-badge ' + stCls + '">' + stLbl + '</span></div>' +
            (subj ? '<div class="comm-conv-subject">' + subj + '</div>' : '') +
            (preview ? '<div class="comm-conv-preview">' + preview + '</div>' : '') +
            '</div><div class="comm-conv-meta"><div class="comm-conv-time">' + time + '</div>' +
            (unread > 0 ? '<div class="comm-badge" data-testid="comm-unread-count">' + unread + '</div>' : '') +
            '</div></li>';
    }
    listArea.innerHTML = html + '</ul>';
}

// =========================================================================
// New conversation form
// =========================================================================
function _commShowNewForm(containerId) {
    var area = document.getElementById('comm-new-form-area');
    if (!area) return;
    area.innerHTML = '<div class="comm-new-form" data-testid="comm-new-form">' +
        '<label for="comm-new-pet">Animale (ID pet)</label>' +
        '<input type="text" id="comm-new-pet" placeholder="ID del paziente" />' +
        '<label for="comm-new-subject">Oggetto (opzionale)</label>' +
        '<input type="text" id="comm-new-subject" placeholder="Es: Controllo post-operatorio" />' +
        '<div style="margin-top:14px;display:flex;gap:8px;">' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-create-btn" onclick="_commCreateConversation(\'' + containerId + '\')">Crea</button>' +
        '<button class="comm-btn comm-btn-secondary" onclick="document.getElementById(\'comm-new-form-area\').innerHTML=\'\'">Annulla</button>' +
        '</div></div>';
}

async function _commCreateConversation(containerId) {
    var petId = (document.getElementById('comm-new-pet') || {}).value || '';
    var subject = (document.getElementById('comm-new-subject') || {}).value || '';
    petId = petId.trim(); subject = subject.trim();
    if (!petId) { if (typeof showToast === 'function') showToast('Inserisci l\'ID del paziente', 'warning'); return; }

    try {
        var body = { pet_id: petId };
        if (subject) body.subject = subject;
        var resp = await fetch(_commApiBase() + '/api/communication/conversations', {
            method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        await resp.json();
        if (typeof showToast === 'function') showToast('Conversazione creata', 'success');
        var fa = document.getElementById('comm-new-form-area');
        if (fa) fa.innerHTML = '';
        initCommunication(containerId);
    } catch (e) {
        console.error('[Communication] Failed to create conversation:', e);
        if (typeof showToast === 'function') showToast('Errore nella creazione della conversazione', 'error');
    }
}

// =========================================================================
// Section 3: Chat view
// =========================================================================
async function openConversation(conversationId) {
    _commInjectStyles();
    _commMessagesCursor = null;

    // Leave previous room, join new one
    if (_commSocket && _commCurrentConversationId) _commSocket.emit('leave_conversation', { conversationId: _commCurrentConversationId });
    _commCurrentConversationId = conversationId;
    if (_commSocket) _commSocket.emit('join_conversation', { conversationId: conversationId });

    var container = document.getElementById('comm-conv-list-area');
    var formArea = document.getElementById('comm-new-form-area');
    if (formArea) formArea.innerHTML = '';
    if (!container) container = document.querySelector('[data-testid="comm-container"]');
    if (!container) return;
    container.innerHTML = '<p style="color:#94a3b8;text-align:center;">Caricamento messaggi...</p>';

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/messages', { headers: _commAuthHeaders() });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var messages = data.messages || data || [];
        _commMessagesCursor = data.next_cursor || null;
        _commRenderChat(container, conversationId, messages);
        _commMarkAsRead(conversationId);
    } catch (e) {
        console.error('[Communication] Failed to load messages:', e);
        container.innerHTML = '<div class="comm-empty">Impossibile caricare i messaggi.</div>';
        if (typeof showToast === 'function') showToast('Errore nel caricamento dei messaggi', 'error');
    }
}

function _commRenderChat(container, convId, messages) {
    var userId = _commGetCurrentUserId();
    var html = '<div class="comm-chat-header" data-testid="comm-chat-header">' +
        '<button class="comm-btn comm-btn-secondary" data-testid="comm-back-btn" onclick="_commGoBack()">&#8592; Indietro</button>' +
        '<span style="font-weight:600;color:#1e3a5f;">Conversazione</span></div>';

    html += '<div class="comm-load-more" id="comm-load-more" style="' + (_commMessagesCursor ? '' : 'display:none;') + '">' +
        '<button data-testid="comm-load-more-btn" onclick="_commLoadMore(\'' + convId + '\')">Carica messaggi precedenti</button></div>';

    html += '<div class="comm-chat-messages" id="comm-chat-messages" data-testid="comm-chat-messages">';
    for (var i = 0; i < messages.length; i++) {
        html += _commRenderBubble(messages[i], messages[i].sender_id === userId);
    }
    html += '</div>';
    html += '<div class="comm-typing" id="comm-typing-indicator" data-testid="comm-typing-indicator"></div>';
    html += '<div class="comm-input-row" data-testid="comm-input-row">' +
        '<textarea id="comm-msg-input" data-testid="comm-msg-input" placeholder="Scrivi un messaggio..." rows="1" ' +
        'onkeydown="_commKeydown(event,\'' + convId + '\')" oninput="_commEmitTyping(\'' + convId + '\')"></textarea>' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-send-btn" onclick="_commSend(\'' + convId + '\')">Invia</button></div>';

    container.innerHTML = html;
    var mc = document.getElementById('comm-chat-messages');
    if (mc) mc.scrollTop = mc.scrollHeight;
}

function _commRenderBubble(msg, isOwn) {
    var type = msg.message_type || 'text';
    if (type === 'system') {
        return '<div class="comm-msg comm-msg-system" data-testid="comm-msg-system">' + _commEscape(msg.body || msg.text || '') + '</div>';
    }
    var cls = isOwn ? 'comm-msg-own' : 'comm-msg-other';
    var sender = isOwn ? '' : _commEscape(msg.sender_name || msg.display_name || 'Utente');
    return '<div class="comm-msg ' + cls + '" data-testid="comm-msg">' +
        (sender ? '<div class="comm-msg-sender">' + sender + '</div>' : '') +
        '<div>' + _commEscape(msg.body || msg.text || '') + '</div>' +
        '<div class="comm-msg-time">' + _commFormatTime(msg.created_at) + '</div></div>';
}

// =========================================================================
// Chat actions
// =========================================================================
async function _commSend(conversationId) {
    var input = document.getElementById('comm-msg-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/messages', {
            method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify({ body: text })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var container = document.getElementById('comm-chat-messages');
        if (container && data) {
            container.innerHTML += _commRenderBubble(data, true);
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error('[Communication] Failed to send message:', e);
        if (typeof showToast === 'function') showToast('Errore nell\'invio del messaggio', 'error');
        if (input) input.value = text;
    }
}

function _commKeydown(event, conversationId) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); _commSend(conversationId); }
}

function _commEmitTyping(conversationId) {
    if (_commSocket) _commSocket.emit('typing', { conversationId: conversationId });
}

async function _commMarkAsRead(conversationId) {
    try {
        await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/read', {
            method: 'POST', headers: _commAuthHeaders()
        });
        updateCommUnreadBadge();
    } catch (e) { /* silent */ }
}

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
            var userId = _commGetCurrentUserId(), oldHtml = '';
            for (var i = 0; i < messages.length; i++) oldHtml += _commRenderBubble(messages[i], messages[i].sender_id === userId);
            container.innerHTML = oldHtml + container.innerHTML;
        }
    } catch (e) {
        console.error('[Communication] Failed to load more messages:', e);
        if (typeof showToast === 'function') showToast('Errore nel caricamento dei messaggi', 'error');
    }
}

function _commGoBack() {
    if (_commSocket && _commCurrentConversationId) _commSocket.emit('leave_conversation', { conversationId: _commCurrentConversationId });
    _commCurrentConversationId = null;
    var cc = document.querySelector('[data-testid="comm-container"]');
    if (cc) {
        var parentId = cc.parentElement ? cc.parentElement.id : null;
        if (parentId) initCommunication(parentId);
    }
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
        var badge = document.getElementById('comm-unread-badge');
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
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
        // Silently handle 404/network errors (table may not exist in CI/mock)
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
        // Silent in CI/mock mode
        if (typeof showToast === 'function') showToast('Errore nell\'aggiornamento', 'error');
    }
}
