// app-communication.js v2.0
// ADA Unified Messaging — human chat + AI chatbot in WhatsApp-like UI
//
// Globals expected: window.io, window.ADA_API_BASE_URL, showToast(), getActiveRole(),
//                   getAuthToken(), getJwtUserId(), getAllPets(), getCurrentPetId()
// Globals exposed:  initCommSocket(), disconnectCommSocket(), initCommunication(),
//                   openConversation(), updateCommUnreadBadge(), loadAiSettingsUI(),
//                   startCommBadgePolling(), stopCommBadgePolling(),
//                   subscribeToPush(), handlePushNavigation()

// =========================================================================
// Internal state
// =========================================================================
var _commSocket = null;

// v8.21.0: Signed media URL cache (avoids JWT in query strings)
var _commSignedUrlCache = {};

async function _commPreSignUrl(path) {
    try {
        var res = await fetchApi('/api/media/sign?path=' + encodeURIComponent(path));
        if (res.ok) {
            var data = await res.json();
            // Extract query string from signed_url
            var qIdx = (data.signed_url || '').indexOf('?');
            if (qIdx !== -1) {
                var suffix = data.signed_url.substring(qIdx);
                _commSignedUrlCache[path] = { suffix: suffix, expiresAt: Date.now() + 240000 }; // cache 4 min (URL valid 5 min)
                return suffix;
            }
        }
    } catch (_) {}
    return null;
}

function _commGetSignedSuffix(url) {
    // Extract path from full URL
    var path = url;
    try { path = new URL(url).pathname; } catch (_) {}
    var cached = _commSignedUrlCache[path];
    if (cached && cached.expiresAt > Date.now()) return cached.suffix;
    // Pre-sign asynchronously for next render
    _commPreSignUrl(path);
    return null;
}
var _commCurrentConversationId = null;
var _commCurrentConversationType = null; // 'human' | 'ai'
var _commTypingTimer = null;
var _commCSSInjected = false;
var _commMessagesCursor = null;
var _commAiSending = false;
var _commReplyTo = null; // { message_id, content, sender_name }
var _commContainerId = null;
var _commSelectedFiles = []; // File objects for attachment upload (multi-file)
var _commNewFormSelectedFiles = []; // File objects for new conversation form (multi-file)

// Offline queue state
var _commOfflineDb = null;
var _commOfflineDbName = 'ADA_COMM_QUEUE';
var _commFlushingQueue = false;

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
    if (status === 'pending') return '<span style="color:#f59e0b;font-size:11px;" title="In coda">\u23F3</span>';
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
        '.comm-pet-hint{font-size:12px;color:#64748b;margin-top:4px;display:none}' +
        '.comm-input-icons{display:flex;gap:6px;margin-top:12px;align-items:center}' +
        '@media (max-width:600px){' +
        '.comm-container{max-width:100%;padding:0 4px;box-sizing:border-box;overflow-x:hidden}' +
        '.comm-input-row{flex-wrap:wrap;gap:4px}' +
        '.comm-input-row textarea{min-width:0;width:100%}' +
        '.comm-msg{max-width:88%}' +
        '}';
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
        _commSocket.on('connect', function () {
            console.log('[Communication] Socket connected');
            _commFlushOfflineQueue();
            _commHideConnectionBanner();
            // Re-join current conversation room after reconnect
            if (_commCurrentConversationId) {
                _commSocket.emit('join_conversation', { conversationId: _commCurrentConversationId });
            }
        });
        _commSocket.on('new_message', function (d) { _commHandleNewMessage(d); });
        _commSocket.on('message_updated', function (d) { _commHandleMessageUpdated(d); });
        _commSocket.on('user_typing', function (d) { _commHandleTyping(d); });
        _commSocket.on('messages_read', function (d) { _commHandleMessagesRead(d); });
        _commSocket.on('delivery_update', function (d) { _commHandleDeliveryUpdate(d); });
        _commSocket.on('user_online', function (d) { _commHandleUserOnline(d, true); });
        _commSocket.on('user_offline', function (d) { _commHandleUserOnline(d, false); });
        _commSocket.on('disconnect', function (r) {
            console.warn('[Communication] Socket disconnected:', r);
            _commShowConnectionBanner('Connessione persa. Riconnessione in corso\u2026');
        });
        _commSocket.on('connect_error', function (e) {
            console.warn('[Communication] Socket error:', e.message);
            _commShowConnectionBanner('Errore di connessione. Tentativo di riconnessione\u2026');
        });
        // Real-time badge: receive notification when a message arrives in ANY conversation
        _commSocket.on('conversation_status_changed', function (d) {
            if (_commCurrentConversationId && d && d.conversation_id === _commCurrentConversationId) {
                // Reload the conversation to reflect status change
                openConversation(_commCurrentConversationId);
            } else if (!_commCurrentConversationId) {
                initCommunication(_commContainerId || 'communication-container');
            }
        });
        _commSocket.on('new_message_notification', function (d) {
            updateCommUnreadBadge();
            // If user is viewing the conversation list (not inside a chat), refresh it
            if (!_commCurrentConversationId && document.getElementById('comm-conv-list-area')) {
                initCommunication(_commContainerId || 'communication-container');
            }
        });
        _commSocket.on('transcription_ready', function (d) {
            _commUpdateMessageTranscription(d.messageId, d.transcription);
        });
        // Notify WebRTC module to attach signaling listeners to this socket
        if (typeof _webrtcInitSignaling === 'function') _webrtcInitSignaling();
    } catch (_) { /* socket init failure is non-critical */ }
    window.addEventListener('online', _commFlushOfflineQueue);
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

// v8.21.0: Connection status banner
function _commShowConnectionBanner(msg) {
    var existing = document.getElementById('comm-connection-banner');
    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'comm-connection-banner';
        existing.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99998;' +
            'background:#fef3c7;color:#92400e;border-top:2px solid #f59e0b;' +
            'padding:8px 16px;font-size:13px;font-weight:600;text-align:center;' +
            'display:flex;align-items:center;justify-content:center;gap:8px;';
        document.body.appendChild(existing);
    }
    existing.innerHTML = '<span style="animation:ada-pulse 1.2s infinite;">\u26A0</span> ' + _commEscape(msg);
    existing.style.display = 'flex';
}

function _commHideConnectionBanner() {
    var el = document.getElementById('comm-connection-banner');
    if (el) el.style.display = 'none';
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
            // Skip own messages — already rendered optimistically
            // Exception: transcription messages are server-generated, never rendered optimistically
            if (isOwn && data.type !== 'transcription') return;
            // Dedup: skip if this message is already in the DOM
            if (data.message_id && document.querySelector('[data-msg-id="' + data.message_id + '"]')) return;
            container.innerHTML += _commRenderBubble(data, isOwn);
            container.scrollTop = container.scrollHeight;
            _commMarkAsRead(_commCurrentConversationId);
            if (_commCurrentConversationType === 'human' && _commSocket) {
                _commSocket.emit('message_delivered', { messageId: data.message_id });
            }
        }
    }
}

function _commHandleMessageUpdated(data) {
    if (!data || data.conversation_id !== _commCurrentConversationId) return;
    var msgEl = document.querySelector('[data-msg-id="' + (data.message_id || '') + '"]');
    if (!msgEl) return;
    var contentEl = msgEl.querySelector('[data-content]');
    if (contentEl) contentEl.textContent = data.content || '';
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
        '<div style="display:flex;gap:8px;align-items:center;">' +
        '<button class="comm-btn-icon" onclick="_commStartDirectCall(\'voice_call\')" title="Chiamata vocale" style="font-size:20px;background:none;border:none;cursor:pointer;">\uD83D\uDCDE</button>' +
        '<button class="comm-btn-icon" onclick="_commStartDirectCall(\'video_call\')" title="Videochiamata" style="font-size:20px;background:none;border:none;cursor:pointer;">\uD83C\uDFA5</button>' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-new-btn">Nuova conversazione</button></div></div>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<input type="text" class="comm-search" data-testid="comm-search" placeholder="Cerca conversazione..." oninput="_commFilterList()" style="flex:1;margin-bottom:0;" />' +
        '<select id="comm-status-filter" data-testid="comm-status-filter" onchange="_commFilterList()" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:auto;min-width:100px;">' +
        '<option value="">Tutte</option><option value="active">Aperte</option><option value="closed">Chiuse</option>' +
        '</select></div>' +
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
            var isCurrentUserOwner = (userId === c.owner_user_id);
            var otherName, otherRole;
            if (isCurrentUserOwner) {
                otherName = c.vet_display_name || 'Veterinario';
                otherRole = c.vet_role || 'vet_int';
            } else {
                otherName = c.owner_display_name || 'Proprietario';
                otherRole = c.owner_role || 'owner';
            }
            var roleLabels = { 'owner': 'Proprietario', 'vet_int': 'Veterinario', 'vet_ext': 'Vet. Referente', 'admin_brand': 'Admin', 'super_admin': 'Super Admin' };
            var roleLabel = roleLabels[otherRole] || otherRole;
            name = _commEscape(otherName + ' (' + roleLabel + ')');
            avatarCls = 'comm-conv-avatar comm-conv-avatar-human';
            avatarContent = _commEscape((otherName || 'U').charAt(0).toUpperCase());
        }
        var _petLabel = c.pet_name || 'Generale';
        if (c.pet_name && c.pet_species) _petLabel = c.pet_name + ' (' + c.pet_species + ')';
        var petName = _commEscape(_petLabel);
        var preview = _commEscape(c.last_message_text || '');
        if (preview.length > 60) preview = preview.substring(0, 57) + '...';
        var time = _commFormatTime(c.last_message_at || c.updated_at);
        var unread = c.unread_count || 0;
        var stCls = c.status === 'closed' ? 'comm-status-closed' : 'comm-status-open';
        var stLbl = c.status === 'closed' ? 'Chiusa' : 'Aperta';
        var triageHtml = isAi && c.triage_level ? _commTriageBadgeHtml(c.triage_level) : '';

        var isOpen = c.status !== 'closed';
        var toggleBtnHtml = '<button class="comm-status-toggle-btn" data-testid="comm-status-toggle" ' +
            'onclick="event.stopPropagation(); _commToggleConversationStatus(\'' + c.conversation_id + '\', \'' + (isOpen ? 'closed' : 'active') + '\')" ' +
            'style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid ' + (isOpen ? '#f59e0b' : '#22c55e') + ';' +
            'background:' + (isOpen ? '#fffbeb' : '#f0fdf4') + ';color:' + (isOpen ? '#b45309' : '#166534') + ';cursor:pointer;white-space:nowrap;">' +
            (isOpen ? 'Chiudi' : 'Riapri') + '</button>';

        html += '<li class="comm-conv-card" data-testid="comm-conv-card" data-status="' + (c.status || 'active') + '" data-search="' +
            _commEscape((name + ' ' + petName + ' ' + (c.subject || '') + ' ' + preview).toLowerCase()) +
            '" onclick="openConversation(\'' + c.conversation_id + '\')">' +
            '<div class="' + avatarCls + '">' + avatarContent + '</div>' +
            '<div class="comm-conv-info"><div class="comm-conv-pet">' + triageHtml + name +
            '<span class="comm-status-badge ' + stCls + '">' + stLbl + '</span></div>' +
            '<div class="comm-conv-subject" style="color:#94a3b8;font-size:12px;">' + petName + (c.subject ? ' \u2014 ' + _commEscape(c.subject) : '') + '</div>' +
            (preview ? '<div class="comm-conv-preview">' + preview + '</div>' : '') +
            '</div><div class="comm-conv-meta"><div class="comm-conv-time">' + time + '</div>' +
            (unread > 0 ? '<div class="comm-badge" data-testid="comm-unread-count">' + unread + '</div>' : '') +
            (!isAi ? '<div style="margin-top:4px;">' + toggleBtnHtml + '</div>' : '') +
            '</div></li>';
    }
    return html + '</ul>';
}

function _commFilterList() {
    var searchInput = document.querySelector('[data-testid="comm-search"]');
    var statusFilter = document.getElementById('comm-status-filter');
    var q = (searchInput ? searchInput.value : '').toLowerCase().trim();
    var statusVal = statusFilter ? statusFilter.value : '';
    var cards = document.querySelectorAll('[data-testid="comm-conv-card"]');
    cards.forEach(function (card) {
        var search = card.getAttribute('data-search') || '';
        var cardStatus = card.getAttribute('data-status') || '';
        var matchSearch = !q || search.indexOf(q) !== -1;
        var matchStatus = !statusVal || cardStatus === statusVal;
        card.style.display = (matchSearch && matchStatus) ? '' : 'none';
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
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';
    var isVetExtUser = jwtRole === 'vet_ext';

    // Build recipient type options
    var recipientOpts = '<option value="ai">\uD83E\uDD16 ADA - Assistente</option>';
    if (isVetExtUser) {
        // vet_ext can only message vet_int
        recipientOpts = '<option value="vet_int">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Interno</option>';
    } else if (role === 'proprietario') {
        recipientOpts += '<option value="vet_int">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Interno</option>';
    } else {
        recipientOpts += '<option value="vet_int">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Interno</option>';
        recipientOpts += '<option value="vet_ext">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Esterno</option>';
        recipientOpts += '<option value="owner">\uD83E\uDDD1 Proprietario</option>';
    }

    var subjectHtml = isVetExtUser ? '' :
        '<label for="comm-new-subject">Oggetto (opzionale)</label>' +
        '<input type="text" id="comm-new-subject" placeholder="Es: Controllo post-operatorio" />';

    var referralFormHtml = isVetExtUser ?
        '<label for="comm-referral-type">Tipo form clinico</label>' +
        '<select id="comm-referral-type" onchange="_commOnReferralTypeChange()"><option value="">-- Seleziona tipo --</option>' +
        '<option value="diagnostica_immagini">\uD83D\uDD0D Diagnostica per Immagini</option>' +
        '<option value="chirurgia_ortopedia">\uD83E\uDDB4 Chirurgia / Ortopedia</option>' +
        '<option value="cardiologia">\u2764\uFE0F Cardiologia</option>' +
        '<option value="endoscopia_gastro">\uD83D\uDD2C Endoscopia / Gastroenterologia</option>' +
        '<option value="dermatologia">\uD83E\uDE79 Dermatologia / Citologia avanzata</option></select>' +
        '<div id="comm-referral-fields"></div>' : '';

    area.innerHTML = '<div class="comm-new-form" data-testid="comm-new-form">' +
        '<label for="comm-new-dest-type">Destinatario</label>' +
        '<select id="comm-new-dest-type" onchange="_commOnDestTypeChange()">' + recipientOpts + '</select>' +
        '<div id="comm-new-recipient-row" style="display:none;">' +
        '<label for="comm-new-recipient">Seleziona destinatario</label>' +
        '<select id="comm-new-recipient" disabled><option value="">Caricamento...</option></select></div>' +
        subjectHtml +
        referralFormHtml +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<label for="comm-new-first-message" style="flex:1;">Primo messaggio</label>' +
        '<label style="cursor:pointer;font-size:18px;color:#64748b;flex-shrink:0;" title="Allega file">' +
        '📎<input type="file" id="comm-new-file-input" style="display:none" multiple accept="image/*,application/pdf,audio/*,video/*" onchange="_commHandleNewFormFileSelect(this)"></label>' +
        '<button type="button" style="font-size:18px;background:none;border:none;cursor:pointer;color:#64748b;padding:0;" title="Scatta foto" onclick="_commCaptureCameraPhoto(\'new\')">📷</button>' +
        '</div>' +
        '<textarea id="comm-new-first-message" placeholder="Scrivi il primo messaggio della conversazione..." rows="3" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:inherit;"></textarea>' +
        '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">' +
        '<span id="comm-new-file-preview" style="font-size:12px;color:#64748b;"></span>' +
        '<span id="comm-new-file-clear" style="display:none;cursor:pointer;font-size:16px;color:#94a3b8;" onclick="_commClearNewFormFile()">×</span>' +
        '</div>' +
        '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;">' +
        '<button class="comm-btn comm-btn-primary" data-testid="comm-create-btn" onclick="_commCreateConversation()">Crea</button>' +
        '<button class="comm-btn comm-btn-secondary" onclick="document.getElementById(\'comm-new-form-area\').innerHTML=\'\'">Annulla</button>' +
        ((typeof debugLogEnabled !== 'undefined' && debugLogEnabled && isVetExtUser) ? '<button type="button" class="comm-btn comm-btn-secondary" onclick="_commFillTestForm()">Test</button>' : '') +
        '</div></div>';

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
            var _rl = typeof formatUserNameWithRole === 'function' ? formatUserNameWithRole(u.display_name || u.email || u.user_id, u.base_role || u.role) : (u.display_name || u.email || u.user_id);
            optHtml += '<option value="' + _commEscape(u.user_id) + '">' + _commEscape(_rl) + '</option>';
        }
        recipientSelect.innerHTML = optHtml;
        recipientSelect.disabled = false;
        if (typeof makeFilterableSelect === 'function') makeFilterableSelect('comm-new-recipient');
    } catch (_) {
        recipientSelect.innerHTML = '<option value="">Errore caricamento</option>';
    }
}

async function _commCreateConversation() {
    var destType = (document.getElementById('comm-new-dest-type') || {}).value || 'ai';
    var recipientId = (document.getElementById('comm-new-recipient') || {}).value || '';
    var petId = typeof getCurrentPetId === 'function' ? (getCurrentPetId() || '') : '';
    var subject = (document.getElementById('comm-new-subject') || {}).value || '';
    petId = petId.trim(); subject = subject.trim(); recipientId = recipientId.trim();

    if (destType !== 'ai' && !recipientId) {
        if (typeof showToast === 'function') showToast('Seleziona un destinatario', 'warning');
        return;
    }

    // Validate first message (required for human conversations)
    var firstMessage = (document.getElementById('comm-new-first-message') || {}).value || '';
    if (destType !== 'ai' && !firstMessage.trim() && _commNewFormSelectedFiles.length === 0) {
        if (typeof showToast === 'function') showToast('Inserisci il primo messaggio o allega un file', 'warning');
        return;
    }

    // Validate referral form for vet_ext
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';
    var referralForm = null;
    if (jwtRole === 'vet_ext' && destType !== 'ai') {
        var formType = (document.getElementById('comm-referral-type') || {}).value || '';
        if (!formType) {
            if (typeof showToast === 'function') showToast('Seleziona il tipo di form clinico', 'warning');
            return;
        }
        var formDef = typeof REFERRAL_FORMS !== 'undefined' ? REFERRAL_FORMS[formType] : null;
        if (formDef) {
            var fields = {};
            var missingRequired = [];
            for (var fi = 0; fi < formDef.fields.length; fi++) {
                var fd = formDef.fields[fi];
                var el = document.getElementById('ref-field-' + fd.id);
                var val = el ? el.value.trim() : '';
                if (fd.required && !val) missingRequired.push(fd.label);
                if (val) fields[fd.id] = val;
            }
            if (missingRequired.length > 0) {
                if (typeof showToast === 'function') showToast('Campi obbligatori: ' + missingRequired.join(', '), 'warning');
                return;
            }
            referralForm = { form_type: formType, form_label: formDef.label, fields: fields, compiled_at: new Date().toISOString() };
        }
    }

    try {
        var body = { recipient_type: destType === 'ai' ? 'ai' : 'human' };
        // Always include pet_id — backend validates vet_ext access via referring_vet_user_id
        if (petId) {
            body.pet_id = petId;
        }
        if (subject) body.subject = subject;
        if (firstMessage.trim()) body.initial_message = firstMessage.trim();
        if (referralForm) body.referral_form = referralForm;

        if (destType === 'ai') {
            body.vet_user_id = 'ada-assistant';
        } else if (destType === 'vet_int' || destType === 'vet_ext') {
            body.vet_user_id = recipientId;
        } else if (destType === 'owner') {
            body.owner_override_id = recipientId;
        }

        var resp = await fetch(_commApiBase() + '/api/communication/conversations', {
            method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
        });
        if (!resp.ok) {
            var _errBody;
            try { _errBody = await resp.json(); } catch(_){}
            if (_errBody && _errBody.error === 'pet_not_assigned_to_you') {
                if (typeof showToast === 'function') showToast('Il pet selezionato non \u00e8 assegnato a te. Riprovo senza pet...', 'warning');
                delete body.pet_id;
                resp = await fetch(_commApiBase() + '/api/communication/conversations', {
                    method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
            } else if (_errBody && _errBody.error === 'referral_form_required') {
                if (typeof showToast === 'function') showToast('Form clinico obbligatorio per vet esterni', 'warning');
                return;
            } else {
                throw new Error('HTTP ' + resp.status);
            }
        }
        var data = await resp.json();
        if (typeof showToast === 'function') showToast('Conversazione creata', 'success');
        var fa = document.getElementById('comm-new-form-area');
        if (fa) fa.innerHTML = '';
        // Open the new conversation directly
        var convId = data.conversation_id || (data.conversation && data.conversation.conversation_id);
        // After successful conversation creation, send attachment if present
        if (_commNewFormSelectedFiles.length > 0 && convId) {
            var _newFormFiles = _commNewFormSelectedFiles.slice();
            _commClearNewFormFile();
            for (var _nfi = 0; _nfi < _newFormFiles.length; _nfi++) {
                try {
                    var _nfFormData = new FormData();
                    _nfFormData.append('file', _newFormFiles[_nfi]);
                    await fetch(_commApiBase() + '/api/communication/conversations/' + convId + '/messages/upload', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + getAuthToken() },
                        body: _nfFormData
                    });
                } catch(e) {
                    console.error('[Communication] Failed to upload attachment ' + _nfi + ' for new conversation:', e);
                }
            }
        }
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
    if (meta && meta.pet_name && meta.pet_species) convPetName = meta.pet_name + ' (' + meta.pet_species + ')';
    var convTriageLevel = (meta && meta.triage_level) || 'green';

    // Header
    var headerTitle = isAi ? '\uD83E\uDD16 ADA - Assistente Veterinaria' : _commEscape(convSubject || 'Conversazione');
    var html = '<div class="comm-chat-header" data-testid="comm-chat-header">' +
        '<button class="comm-btn comm-btn-secondary" data-testid="comm-back-btn" onclick="_commGoBack()">\u2190 Indietro</button>' +
        '<div style="flex:1;"><div style="font-weight:600;color:#1e3a5f;font-size:14px;">' + headerTitle + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;">' + _commEscape(convPetName) + '</div></div>';

    if (isAi) {
        html += '<span style="font-size:11px;color:#22c55e;">\u25CF Online</span>';
    } else {
        // PR6: Call buttons for human conversations
        html += '<div id="comm-call-controls" style="display:flex;gap:8px;margin-left:auto;">';
        html += '<button type="button" class="comm-btn-icon" onclick="if(typeof startCall===\'function\')startCall(\'' + convId + '\',\'voice_call\')" title="Chiamata audio" style="font-size:18px;background:none;border:none;cursor:pointer;">\uD83D\uDCDE</button>';
        html += '<button type="button" class="comm-btn-icon" onclick="if(typeof startCall===\'function\')startCall(\'' + convId + '\',\'video_call\')" title="Videochiamata" style="font-size:18px;background:none;border:none;cursor:pointer;">\uD83C\uDFA5</button>';
        html += '</div>';
    }
    html += '</div>';

    // Conversation status bar (for human chats)
    if (!isAi) {
        var convStatus = meta && meta.status || 'active';
        var isConvOpen = convStatus !== 'closed';
        html += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0 12px;">';
        html += '<span class="comm-status-badge ' + (isConvOpen ? 'comm-status-open' : 'comm-status-closed') + '">' + (isConvOpen ? 'Aperta' : 'Chiusa') + '</span>';
        html += '<button id="comm-conv-status-btn" onclick="_commToggleConversationStatus(\'' + convId + '\', \'' + (isConvOpen ? 'closed' : 'active') + '\')" ' +
            'style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid ' + (isConvOpen ? '#f59e0b' : '#22c55e') + ';' +
            'background:' + (isConvOpen ? '#fffbeb' : '#f0fdf4') + ';color:' + (isConvOpen ? '#b45309' : '#166534') + ';cursor:pointer;">' +
            (isConvOpen ? 'Chiudi' : 'Riapri') + '</button>';
        html += '</div>';
    }

    // Referral form banner (for vet_ext conversations)
    var _rawReferralForm = meta && meta.referral_form;
    if (typeof _rawReferralForm === 'string') { try { _rawReferralForm = JSON.parse(_rawReferralForm); } catch(_) { _rawReferralForm = null; } }
    if (_rawReferralForm && _rawReferralForm.form_type) {
        var form = _rawReferralForm;
        var formDef = typeof REFERRAL_FORMS !== 'undefined' ? REFERRAL_FORMS[form.form_type] : null;
        var formLabel = formDef ? formDef.label : form.form_label || 'Form clinico';
        html += '<div class="comm-referral-form-banner" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin:8px 0;padding:12px 16px;">';
        html += '<div style="font-weight:700;color:#0369a1;margin-bottom:8px;font-size:14px;">\uD83D\uDCCB ' + _commEscape(formLabel) + '</div>';
        if (formDef && formDef.fields && form.fields) {
            for (var fi = 0; fi < formDef.fields.length; fi++) {
                var fieldDef = formDef.fields[fi];
                var fval = form.fields[fieldDef.id];
                if (fval && (typeof fval === 'string' ? fval.trim() : fval)) {
                    var displayVal = fval;
                    if (fieldDef.type === 'select' && fieldDef.options) {
                        for (var oi = 0; oi < fieldDef.options.length; oi++) {
                            if (fieldDef.options[oi].value === fval) { displayVal = fieldDef.options[oi].label; break; }
                        }
                    }
                    html += '<div style="margin-bottom:4px;"><span style="font-weight:600;color:#334155;font-size:12px;">' +
                        _commEscape(fieldDef.label) + ':</span> <span style="color:#475569;font-size:13px;">' +
                        _commEscape(displayVal) + '</span></div>';
                }
            }
        }
        html += '</div>';
    }

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

    // Input area: icons row + file preview + text row
    var isClosed = meta && meta.status === 'closed';
    if (!isClosed) {
        html += '<div class="comm-input-icons" data-testid="comm-input-icons">' +
            '<button type="button" class="comm-btn-icon" id="comm-emoji-btn" title="Emoji" style="font-size:20px;background:none;border:none;cursor:pointer;padding:4px 6px;">\uD83D\uDE0A</button>' +
            '<label style="cursor:pointer;font-size:20px;padding:4px 6px;color:#64748b;flex-shrink:0;" title="Allega file">' +
            '\uD83D\uDCCE<input type="file" id="comm-file-input" style="display:none" multiple ' +
            'accept="image/*,application/pdf,audio/*,video/*" onchange="_commHandleFileSelect(this)"></label>' +
            '<button type="button" class="comm-btn-icon" style="font-size:20px;background:none;border:none;cursor:pointer;padding:4px 6px;color:#64748b;" title="Scatta foto" onclick="_commCaptureCameraPhoto(\'conv\')">\uD83D\uDCF7</button>' +
            '<button type="button" class="comm-btn-icon" id="comm-voice-btn" title="Messaggio vocale" style="font-size:20px;background:none;border:none;cursor:pointer;padding:4px 6px;">\uD83C\uDFA4</button>' +
            '</div>';
        html += '<div id="comm-file-preview" style="display:none;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;font-size:12px;color:#1e3a5f;align-items:center;gap:8px;">' +
            '<span id="comm-file-preview-name"></span>' +
            '<span style="cursor:pointer;font-size:16px;color:#94a3b8;" onclick="_commClearFile()" title="Rimuovi">\u00D7</span></div>';
        html += '<div class="comm-input-row" data-testid="comm-input-row">' +
            '<textarea id="comm-msg-input" data-testid="comm-msg-input" placeholder="Scrivi un messaggio..." rows="1" ' +
            'onkeydown="_commKeydown(event,\'' + convId + '\')" oninput="_commEmitTyping(\'' + convId + '\')"></textarea>' +
            '<button class="comm-btn comm-btn-primary" data-testid="comm-send-btn" onclick="_commSend(\'' + convId + '\')">Invia</button></div>';
    } else {
        html += '<div class="comm-input-row" data-testid="comm-input-row">' +
            '<textarea disabled style="flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;resize:none;font-family:inherit;min-height:42px;background:#f1f5f9;color:#94a3b8;cursor:not-allowed;" ' +
            'placeholder="La conversazione è chiusa. Se vuoi scrivere un messaggio riaprila."></textarea></div>';
    }

    container.innerHTML = html;
    var mc = document.getElementById('comm-chat-messages');
    if (mc) mc.scrollTop = mc.scrollHeight;

    // PR5: Bind emoji button
    var emojiBtn = document.getElementById('comm-emoji-btn');
    if (emojiBtn) emojiBtn.addEventListener('click', _commToggleEmojiPicker);

    // PR6: Bind voice button
    var voiceBtn = document.getElementById('comm-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', function() {
            if (_commVoiceRecording) { _commStopVoiceRecord(); } else { _commStartVoiceRecord(); }
        });
    }
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
    if (isAiMsg) {
        sender = '\uD83E\uDD16 ADA';
    } else {
        var roleMap = { owner: 'Proprietario', vet: 'Veterinario', vet_int: 'Veterinario', vet_ext: 'Vet. Referente', admin_brand: 'Admin', super_admin: 'Super Admin' };
        var roleLabel = roleMap[msg.sender_role] || '';
        var senderName = msg.sender_name || (isOwn ? (typeof getJwtDisplayName === 'function' ? getJwtDisplayName() : null) || 'Tu' : 'Utente');
        sender = _commEscape(senderName + (roleLabel ? ' (' + roleLabel + ')' : ''));
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

    // Render attachment content based on message type
    var msgType = msg.type || msg.message_type || 'text';
    if ((msgType === 'image' || msgType === 'audio' || msgType === 'video' || msgType === 'file') && msg.media_url) {
        var dlUrl = _commApiBase() + '/api/communication/attachments/' + (msg.attachment_id || '') + '/download';
        // Extract attachment_id from media_url: /uploads/comm/{convId}/{attachmentId}_{filename}
        // Must use the SECOND UUID (attachment_id), not the first (conversation_id)
        var allUuids = (msg.media_url || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
        if (allUuids.length >= 2) dlUrl = _commApiBase() + '/api/communication/attachments/' + allUuids[1] + '/download';
        else if (allUuids.length === 1) dlUrl = _commApiBase() + '/api/communication/attachments/' + allUuids[0] + '/download';
        // Use signed URL instead of exposing JWT in query string (v8.21.0)
        // Synchronously append a cached signed suffix; if not available, fall back to token
        if (typeof _commGetSignedSuffix === 'function') {
            var _signedSuffix = _commGetSignedSuffix(dlUrl);
            if (_signedSuffix) {
                dlUrl += _signedSuffix;
            } else {
                // Fallback: still use token while signed URL is being fetched
                var _dlToken = typeof getAuthToken === 'function' ? getAuthToken() : '';
                if (_dlToken) dlUrl += '?token=' + encodeURIComponent(_dlToken);
            }
        } else {
            var _dlToken = typeof getAuthToken === 'function' ? getAuthToken() : '';
            if (_dlToken) dlUrl += '?token=' + encodeURIComponent(_dlToken);
        }
        // Extract filename from media_url path (after attachmentId_ prefix)
        var _urlParts = (msg.media_url || '').split('/');
        var _lastPart = _urlParts[_urlParts.length - 1] || '';
        var _uidx = _lastPart.indexOf('_');
        var fname = _uidx !== -1 ? _lastPart.substring(_uidx + 1) : (_lastPart || 'File');
        fname = decodeURIComponent(fname);
        var fsize = msg.media_size_bytes ? ' (' + _commFormatFileSize(msg.media_size_bytes) + ')' : '';
        // Show text content separately if present (user's message alongside the attachment)
        if (msg.content && msg.content.trim() && msg.content.trim() !== fname) {
            html += '<div>' + _commEscape(msg.content) + '</div>';
        }
        if (msgType === 'image') {
            html += '<div><img src="' + dlUrl + '" alt="' + _commEscape(fname) + '" style="max-width:280px;max-height:280px;border-radius:8px;cursor:pointer;" ' +
                'onclick="window.open(this.src,\'_blank\')" onerror="this.style.display=\'none\'" loading="lazy" /></div>';
        } else if (msgType === 'audio') {
            html += '<div><audio controls preload="none" style="max-width:260px;"><source src="' + dlUrl + '" type="' + _commEscape(msg.media_type || 'audio/mpeg') + '"></audio></div>';
            if (msg.transcription) {
                html += '<div style="font-size:12px;color:#64748b;margin-top:6px;padding:6px 10px;background:#f8fafc;border-radius:6px;font-style:italic;">' +
                    '\uD83D\uDCDD ' + _commEscape(msg.transcription) + '</div>';
            }
        } else if (msgType === 'video') {
            html += '<div><video controls preload="none" style="max-width:280px;border-radius:8px;"><source src="' + dlUrl + '" type="' + _commEscape(msg.media_type || 'video/mp4') + '"></video></div>';
        } else {
            html += '<div><a href="' + dlUrl + '" target="_blank" style="color:inherit;text-decoration:underline;">\uD83D\uDCC4 ' + _commEscape(fname) + fsize + '</a></div>';
        }
    } else {
        html += '<div data-content>' + _commEscape(msg.content || '') + '</div>';
    }

    // Follow-up chips for AI messages — intelligent yes/no vs open question
    if (isAiMsg && msg.follow_up_questions && msg.follow_up_questions.length > 0) {
        html += '<div class="comm-followups" data-testid="comm-followups">';
        for (var j = 0; j < msg.follow_up_questions.length; j++) {
            var q = msg.follow_up_questions[j];
            if (_commIsYesNoQuestion(q)) {
                // Yes/No closed question — show question + two answer chips
                html += '<div class="comm-chip-group" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:4px;">';
                html += '<span style="font-size:13px;color:#475569;flex:1 1 100%;margin-bottom:2px;">' + _commEscape(q) + '</span>';
                html += '<span class="comm-chip" data-testid="comm-chip" onclick="_commSendChipAnswer(\'' + _commEscapeAttr(q) + '\',\'Sì\')" style="background:#dcfce7;border-color:#86efac;">Sì</span>';
                html += '<span class="comm-chip" data-testid="comm-chip" onclick="_commSendChipAnswer(\'' + _commEscapeAttr(q) + '\',\'No\')" style="background:#fee2e2;border-color:#fca5a5;">No</span>';
                html += '</div>';
            } else {
                // Open question — click pre-fills input for custom answer
                html += '<span class="comm-chip" data-testid="comm-chip" onclick="_commPrepareOpenAnswer(\'' + _commEscapeAttr(q) + '\')">' + _commEscape(q) + '</span>';
            }
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
    var hasFiles = _commSelectedFiles.length > 0;
    if (!text && !hasFiles) return;
    if (_commAiSending) return;

    input.value = '';
    var isAi = _commCurrentConversationType === 'ai';
    var userId = _commGetCurrentUserId();
    var filesToSend = _commSelectedFiles.slice(); // copy
    _commSelectedFiles = [];
    _commClearFile();

    // Optimistic render for user message
    var container = document.getElementById('comm-chat-messages');
    if (container) {
        var _ownName = typeof getJwtDisplayName === 'function' ? getJwtDisplayName() : null;
        var _ownRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        var tempMsg = { content: text || (filesToSend.length > 0 ? filesToSend.map(function(f){return f.name;}).join(', ') : ''), sender_id: userId, sender_name: _ownName || 'Tu', sender_role: _ownRole || '', created_at: new Date().toISOString(), delivery_status: 'sent' };
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

    var replyToId = (_commReplyTo && !isAi) ? _commReplyTo.message_id : null;
    _commCancelReply();

    try {
        // Multi-file upload path
        if (hasFiles && filesToSend.length > 0) {
            for (var fi = 0; fi < filesToSend.length; fi++) {
                var formData = new FormData();
                formData.append('file', filesToSend[fi]);
                if (fi === 0 && text) formData.append('content', text);
                try {
                    var uploadResp = await fetch(
                        _commApiBase() + '/api/communication/conversations/' + conversationId + '/messages/upload',
                        { method: 'POST', headers: { 'Authorization': 'Bearer ' + getAuthToken() }, body: formData }
                    );
                    if (!uploadResp.ok) throw new Error('HTTP ' + uploadResp.status);
                    var uploadData = await uploadResp.json();
                    if (uploadData && uploadData.message) {
                        var serverMsg = uploadData.message;
                        serverMsg.sender_id = userId;
                        serverMsg.sender_name = typeof getJwtDisplayName === 'function' ? getJwtDisplayName() : 'Tu';
                        serverMsg.sender_role = typeof getJwtRole === 'function' ? getJwtRole() : '';
                        if (container) {
                            container.insertAdjacentHTML('beforeend', _commRenderBubble(serverMsg, true));
                            container.scrollTop = container.scrollHeight;
                        }
                    }
                } catch(uploadErr) {
                    console.error('[Communication] Upload file ' + fi + ' failed:', uploadErr);
                    if (typeof showToast === 'function') showToast('Errore upload file: ' + filesToSend[fi].name, 'error');
                }
            }
            if (input) { input.disabled = false; input.value = ''; }
            return;
        }

        var resp;
        var body = { content: text };
        if (replyToId) body.reply_to_message_id = replyToId;
        resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId + '/messages', {
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
                var aiMsg = data.assistant_message || data.ai_message || data.assistant || data;
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
        // Offline queue: if network error on text message, queue it
        if (!hasFiles && !isAi && (e instanceof TypeError || !navigator.onLine)) {
            _commQueueOfflineMessage(conversationId, text, replyToId);
            // Update optimistic bubble to show pending icon
            var lastBubble = container ? container.querySelector('[data-msg-id=""]:last-child [data-delivery-status], .comm-msg:last-child [data-delivery-status]') : null;
            if (lastBubble) lastBubble.innerHTML = _commDeliveryIcon('pending');
            console.warn('[Communication] Message queued offline');
            return;
        }
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

// Toggle conversation status (close/reopen)
async function _commToggleConversationStatus(conversationId, newStatus) {
    try {
        var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + conversationId, {
            method: 'PATCH',
            headers: _commAuthHeaders(),
            body: JSON.stringify({ status: newStatus })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        if (typeof showToast === 'function') {
            showToast('Conversazione ' + (newStatus === 'closed' ? 'chiusa' : 'riaperta'), 'success');
        }
        // If inside the conversation, reload it; otherwise reload the list
        if (_commCurrentConversationId === conversationId) {
            openConversation(conversationId);
        } else {
            initCommunication(_commContainerId || 'communication-container');
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore nel cambio stato', 'error');
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

// Polling for unread badge (every 60 seconds, fallback for unreliable socket)
var _commBadgePollingInterval = null;

function startCommBadgePolling() {
    if (_commBadgePollingInterval) return;
    _commBadgePollingInterval = setInterval(function() {
        if (typeof getAuthToken === 'function' && getAuthToken()) {
            try { updateCommUnreadBadge(); } catch(_) {}
        }
    }, 30000);
}

function stopCommBadgePolling() {
    if (_commBadgePollingInterval) {
        clearInterval(_commBadgePollingInterval);
        _commBadgePollingInterval = null;
    }
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
            listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Nessuna conversazione per questo pet.</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < convs.length; i++) {
            var c = convs[i];
            var isAi = c.recipient_type === 'ai';
            var isVoiceCall = c.type === 'voice_call';
            var isVideoCall = c.type === 'video_call';
            var icon = isAi ? '\uD83E\uDD16' : (isVoiceCall ? '\uD83D\uDCDE' : (isVideoCall ? '\uD83C\uDFA5' : '\uD83D\uDCAC'));
            var typeLabel = isVoiceCall ? 'Telefonata' : (isVideoCall ? 'Videotelefonata' : '');
            var name = isAi ? 'ADA' : _commEscape(c.vet_display_name || c.owner_display_name || 'Chat');
            var time = _commFormatTime(c.updated_at || c.created_at);
            var triageHtml = isAi && c.triage_level ? _commTriageBadgeHtml(c.triage_level) : '';
            html += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;background:#fff;" ' +
                'onclick="navigateToPage(\'communication\');setTimeout(function(){openConversation(\'' + c.conversation_id + '\')},300);">' +
                '<div style="display:flex;align-items:center;">' +
                '<span style="font-size:20px;margin-right:10px;">' + icon + '</span>' +
                '<div style="flex:1;"><div style="font-weight:600;font-size:13px;color:#1e3a5f;">' + triageHtml + (typeLabel ? typeLabel + ' — ' : '') + name + '</div>' +
                (c.subject ? '<div style="font-size:12px;color:#94a3b8;">' + _commEscape(c.subject) + '</div>' : '') +
                '</div><div style="font-size:11px;color:#94a3b8;">' + time + '</div></div>';
            // Show transcription messages for voice/video calls
            if ((isVoiceCall || isVideoCall) && c.transcription_messages && c.transcription_messages.length > 0) {
                html += '<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:6px;font-size:12px;">';
                html += '<div style="font-weight:600;color:#1e3a5f;margin-bottom:4px;">Trascrizione:</div>';
                for (var j = 0; j < c.transcription_messages.length; j++) {
                    var tm = c.transcription_messages[j];
                    html += '<div style="margin:2px 0;"><span style="font-weight:600;color:#2563eb;">' +
                        _commEscape(tm.sender_name || 'Utente') + ':</span> ' + _commEscape(tm.content) + '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        listEl.innerHTML = html;
    } catch (e) {
        listEl.innerHTML = '';
    }
}

// =========================================================================
// Section 8: File attachment helpers
// =========================================================================
function _commHandleFileSelect(input) {
    if (!input || !input.files || input.files.length === 0) return;
    var MAX_SIZE = 10 * 1024 * 1024;
    var newFiles = Array.from(input.files);
    var rejected = [];
    newFiles.forEach(function(f) {
        if (f.size > MAX_SIZE) {
            rejected.push(f.name);
        } else {
            _commSelectedFiles.push(f);
        }
    });
    if (rejected.length > 0) {
        if (typeof showToast === 'function')
            showToast(rejected.length + ' file troppo grandi (max 10 MB): ' + rejected.join(', '), 'warning');
    }
    _commRenderFilePreview();
    var msgInput = document.getElementById('comm-msg-input');
    if (msgInput && _commSelectedFiles.length > 0)
        msgInput.placeholder = _commSelectedFiles.length + ' allegat' + (_commSelectedFiles.length === 1 ? 'o' : 'i') + ' pront' + (_commSelectedFiles.length === 1 ? 'o' : 'i') + '. Scrivi un messaggio...';

    // PR4: AI attachment hint — show whether ADA can analyze the file
    _commUpdateAiAttachmentHint();
}

function _commUpdateAiAttachmentHint() {
    var hint = document.getElementById('comm-ai-attachment-hint');
    if (_commCurrentConversationType !== 'ai' || _commSelectedFiles.length === 0) {
        if (hint) hint.style.display = 'none';
        return;
    }
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'comm-ai-attachment-hint';
        hint.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:4px;margin-top:4px;';
        var filePreview = document.getElementById('comm-file-preview');
        if (filePreview && filePreview.parentNode) {
            filePreview.parentNode.insertBefore(hint, filePreview.nextSibling);
        }
    }
    var lastFile = _commSelectedFiles[_commSelectedFiles.length - 1];
    var mimeType = lastFile ? (lastFile.type || '') : '';
    var supportedPrefixes = ['image/', 'audio/', 'text/', 'application/pdf'];
    var isSupported = supportedPrefixes.some(function(p) { return mimeType.startsWith(p); });
    if (isSupported) {
        hint.style.background = '#eff6ff';
        hint.style.color = '#1e40af';
        hint.textContent = '\uD83E\uDD16 ADA analizzer\u00e0 questo documento';
    } else {
        hint.style.background = '#fef2f2';
        hint.style.color = '#991b1b';
        hint.textContent = '\u26A0\uFE0F ADA potrebbe non riuscire ad analizzare questo tipo di file';
    }
    hint.style.display = 'block';
}

function _commRenderFilePreview() {
    var previewEl = document.getElementById('comm-file-preview');
    if (!previewEl) return;
    if (_commSelectedFiles.length === 0) {
        previewEl.style.display = 'none';
        previewEl.innerHTML = '';
        return;
    }
    previewEl.style.display = 'flex';
    previewEl.style.flexDirection = 'column';
    previewEl.style.gap = '4px';
    var html = '';
    _commSelectedFiles.forEach(function(f, idx) {
        html += '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:12px;">\uD83D\uDCCE ' + _commEscape(f.name) + ' (' + _commFormatFileSize(f.size) + ')</span>' +
            '<span style="cursor:pointer;font-size:14px;color:#94a3b8;" onclick="_commRemoveFile(' + idx + ')" title="Rimuovi">\u00D7</span>' +
            '</div>';
    });
    previewEl.innerHTML = html;
}

function _commRemoveFile(index) {
    _commSelectedFiles.splice(index, 1);
    _commRenderFilePreview();
    _commUpdateAiAttachmentHint();
    if (_commSelectedFiles.length === 0) {
        var fileInput = document.getElementById('comm-file-input');
        if (fileInput) fileInput.value = '';
        var msgInput = document.getElementById('comm-msg-input');
        if (msgInput) msgInput.placeholder = 'Scrivi un messaggio...';
    }
}

function _commClearFile() {
    _commSelectedFiles = [];
    _commRenderFilePreview();
    var fileInput = document.getElementById('comm-file-input');
    if (fileInput) fileInput.value = '';
    var msgInput = document.getElementById('comm-msg-input');
    if (msgInput) msgInput.placeholder = 'Scrivi un messaggio...';
    // PR4: Hide AI hint
    var hint = document.getElementById('comm-ai-attachment-hint');
    if (hint) hint.style.display = 'none';
}

function _commFormatFileSize(bytes) {
    if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── New conversation form file attachment helpers ──
function _commCaptureCameraPhoto(context) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = function() {
        if (input.files && input.files.length > 0) {
            if (context === 'new') {
                _commHandleNewFormFileSelect(input);
            } else {
                _commHandleFileSelect(input);
            }
        }
    };
    input.click();
}

function _commHandleNewFormFileSelect(input) {
    if (!input || !input.files || input.files.length === 0) return;
    var MAX_SIZE = 10 * 1024 * 1024;
    var newFiles = Array.from(input.files);
    var rejected = [];
    newFiles.forEach(function(f) {
        if (f.size > MAX_SIZE) {
            rejected.push(f.name);
        } else {
            _commNewFormSelectedFiles.push(f);
        }
    });
    if (rejected.length > 0) {
        if (typeof showToast === 'function')
            showToast(rejected.length + ' file troppo grandi (max 10 MB): ' + rejected.join(', '), 'warning');
    }
    var previewEl = document.getElementById('comm-new-file-preview');
    var clearEl = document.getElementById('comm-new-file-clear');
    if (previewEl) {
        previewEl.textContent = '\uD83D\uDCCE ' + _commNewFormSelectedFiles.length + ' file selezionat' + (_commNewFormSelectedFiles.length === 1 ? 'o' : 'i');
    }
    if (clearEl) clearEl.style.display = 'inline';
}

function _commClearNewFormFile() {
    _commNewFormSelectedFiles = [];
    var previewEl = document.getElementById('comm-new-file-preview');
    var clearEl = document.getElementById('comm-new-file-clear');
    var fileInput = document.getElementById('comm-new-file-input');
    if (previewEl) previewEl.textContent = '';
    if (clearEl) clearEl.style.display = 'none';
    if (fileInput) fileInput.value = '';
}

// =========================================================================
// Section 9: Offline message queue (IndexedDB)
// =========================================================================
function _commOpenOfflineDb() {
    return new Promise(function (resolve, reject) {
        if (_commOfflineDb) { resolve(_commOfflineDb); return; }
        if (!window.indexedDB) { reject(new Error('No IndexedDB')); return; }
        var req = indexedDB.open(_commOfflineDbName, 1);
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('pending_messages')) {
                db.createObjectStore('pending_messages', { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = function (e) { _commOfflineDb = e.target.result; resolve(_commOfflineDb); };
        req.onerror = function () { reject(req.error); };
    });
}

function _commQueueOfflineMessage(conversationId, content, replyToId) {
    _commOpenOfflineDb().then(function (db) {
        var tx = db.transaction('pending_messages', 'readwrite');
        tx.objectStore('pending_messages').add({
            conversationId: conversationId,
            content: content,
            replyToId: replyToId || null,
            timestamp: new Date().toISOString()
        });
    }).catch(function (e) { console.error('[Communication] Offline queue save failed:', e); });
}

async function _commFlushOfflineQueue() {
    if (_commFlushingQueue || !navigator.onLine) return;
    _commFlushingQueue = true;
    try {
        var db = await _commOpenOfflineDb();
        var tx = db.transaction('pending_messages', 'readonly');
        var store = tx.objectStore('pending_messages');
        var all = await new Promise(function (resolve, reject) {
            var req = store.getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
        for (var i = 0; i < all.length; i++) {
            var msg = all[i];
            try {
                var body = { content: msg.content };
                if (msg.replyToId) body.reply_to_message_id = msg.replyToId;
                var resp = await fetch(_commApiBase() + '/api/communication/conversations/' + msg.conversationId + '/messages', {
                    method: 'POST', headers: _commAuthHeaders(), body: JSON.stringify(body)
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                // Delete from store on success
                var dtx = db.transaction('pending_messages', 'readwrite');
                dtx.objectStore('pending_messages').delete(msg.id);
            } catch (e) {
                console.warn('[Communication] Offline flush failed for message, will retry:', e.message);
                break; // Stop on first failure, retry later
            }
        }
    } catch (e) { console.error('[Communication] Offline flush error:', e); }
    _commFlushingQueue = false;
}

// =========================================================================
// Section 10: Referral forms for vet_ext
// =========================================================================
var REFERRAL_FORMS = {
    diagnostica_immagini: {
        label: '\uD83D\uDD0D Diagnostica per Immagini (Rx / Eco / TC)',
        fields: [
            { id: 'tipo_esame', label: 'Tipo esame richiesto', type: 'text', placeholder: 'Es: Rx torace 2 proiezioni, Eco addome, TC cranio', required: true },
            { id: 'sospetto_diagnostico', label: 'Sospetto diagnostico', type: 'textarea', placeholder: 'Es: Versamento pleurico? Massa mediastinica?', required: true },
            { id: 'sintomi_principali', label: 'Sintomi principali', type: 'textarea', placeholder: 'Es: Dispnea da 3 gg, tachipnea', required: true },
            { id: 'terapie_in_corso', label: 'Terapie in corso', type: 'textarea', placeholder: 'Es: Furosemide 2mg/kg BID', required: false },
            { id: 'esami_gia_eseguiti', label: 'Esami gi\u00e0 eseguiti', type: 'textarea', placeholder: 'Es: Emocromo, eco FAST', required: false },
            { id: 'sedazione', label: 'Note sedazione', type: 'text', placeholder: 'Es: Paziente aggressivo, preferibile sedazione', required: false },
            { id: 'urgenza', label: 'Urgenza', type: 'select', options: [
                { value: 'entro_24h', label: '\uD83D\uDD34 Entro 24h' },
                { value: 'entro_1_settimana', label: '\uD83D\uDFE1 Entro 1 settimana' },
                { value: 'programmabile', label: '\uD83D\uDFE2 Programmabile' }
            ], required: true },
            { id: 'note', label: 'Note per il collega', type: 'textarea', placeholder: 'Es: Proprietaria ansiosa...', required: false }
        ]
    },
    chirurgia_ortopedia: {
        label: '\uD83E\uDDB4 Chirurgia / Ortopedia',
        fields: [
            { id: 'intervento_richiesto', label: 'Intervento / Valutazione richiesta', type: 'textarea', placeholder: 'Es: Valutazione rottura LCA ginocchio sx', required: true },
            { id: 'dinamica_anamnesi', label: 'Dinamica / Anamnesi', type: 'textarea', placeholder: 'Es: Zoppia acuta post-corsa, 5 gg fa', required: true },
            { id: 'esami_preoperatori', label: 'Esami pre-operatori eseguiti', type: 'textarea', placeholder: 'Es: Emocromo + biochimico OK', required: false },
            { id: 'rx_gia_fatte', label: 'Rx gi\u00e0 eseguite', type: 'text', placeholder: 'Es: S\u00ec, 2 proiezioni ginocchio', required: false },
            { id: 'patologie_pregresse', label: 'Patologie pregresse', type: 'textarea', placeholder: 'Es: Displasia anca lieve bilaterale', required: false },
            { id: 'farmaci_in_corso', label: 'Farmaci in corso', type: 'textarea', placeholder: 'Es: Robenacoxib 1mg/kg SID da 3 gg', required: false },
            { id: 'allergie', label: 'Allergie note', type: 'text', placeholder: 'Es: Nessuna', required: false },
            { id: 'urgenza', label: 'Urgenza', type: 'select', options: [
                { value: 'entro_24h', label: '\uD83D\uDD34 Entro 24h' },
                { value: 'entro_1_settimana', label: '\uD83D\uDFE1 Entro 1 settimana' },
                { value: 'programmabile', label: '\uD83D\uDFE2 Programmabile' }
            ], required: true },
            { id: 'note', label: 'Note / Disponibilit\u00e0 proprietario', type: 'textarea', placeholder: 'Es: Flessibile, preferisce inizio settimana', required: false }
        ]
    },
    cardiologia: {
        label: '\u2764\uFE0F Cardiologia',
        fields: [
            { id: 'motivo_consulenza', label: 'Motivo della consulenza', type: 'textarea', placeholder: 'Es: Soffio cardiaco grado IV/VI, peggiorato', required: true },
            { id: 'sintomi_attuali', label: 'Sintomi attuali', type: 'textarea', placeholder: 'Es: Tosse notturna, intolleranza esercizio, sincope', required: true },
            { id: 'ultima_ecocardiografia', label: 'Ultima ecocardiografia', type: 'textarea', placeholder: 'Es: 8 mesi fa: rigurgito mitralico moderato', required: false },
            { id: 'terapia_cardiologica', label: 'Terapia cardiologica in corso', type: 'textarea', placeholder: 'Es: Pimobendan 0.25mg/kg BID, Benazepril...', required: false },
            { id: 'esami_recenti', label: 'Esami recenti', type: 'textarea', placeholder: 'Es: Rx torace, creatinina 1.4', required: false },
            { id: 'richiesta_specifica', label: 'Cosa chiedo', type: 'textarea', placeholder: 'Es: Rivalutazione stadio ACVIM + adeguamento terapia', required: true },
            { id: 'urgenza', label: 'Urgenza', type: 'select', options: [
                { value: 'entro_24h', label: '\uD83D\uDD34 Entro 24h' },
                { value: 'entro_1_settimana', label: '\uD83D\uDFE1 Entro 1 settimana' },
                { value: 'programmabile', label: '\uD83D\uDFE2 Programmabile' }
            ], required: true },
            { id: 'note', label: 'Note per il collega', type: 'textarea', placeholder: '', required: false }
        ]
    },
    endoscopia_gastro: {
        label: '\uD83D\uDD2C Endoscopia / Gastroenterologia',
        fields: [
            { id: 'esame_richiesto', label: 'Esame richiesto', type: 'text', placeholder: 'Es: Gastroscopia + biopsie', required: true },
            { id: 'problema_principale', label: 'Problema principale', type: 'textarea', placeholder: 'Es: Vomito cronico intermittente da 3 mesi', required: true },
            { id: 'frequenza_sintomi', label: 'Frequenza sintomi', type: 'text', placeholder: 'Es: 3-4 episodi/settimana, a digiuno', required: true },
            { id: 'iter_diagnostico', label: 'Iter diagnostico gi\u00e0 fatto', type: 'textarea', placeholder: 'Es: Emocromo, biochimico, cPLI, eco addome...', required: false },
            { id: 'risposta_terapie', label: 'Risposta a terapie', type: 'textarea', placeholder: 'Es: Omeprazolo parziale risposta...', required: false },
            { id: 'sospetto', label: 'Sospetto diagnostico', type: 'textarea', placeholder: 'Es: IBD? Gastropatia cronica?', required: true },
            { id: 'urgenza', label: 'Urgenza', type: 'select', options: [
                { value: 'entro_24h', label: '\uD83D\uDD34 Entro 24h' },
                { value: 'entro_1_settimana', label: '\uD83D\uDFE1 Entro 1 settimana' },
                { value: 'programmabile', label: '\uD83D\uDFE2 Programmabile' }
            ], required: true },
            { id: 'note', label: 'Note (es. digiuno pre-esame)', type: 'textarea', placeholder: 'Es: Informo proprietario io o lo fate voi?', required: false }
        ]
    },
    dermatologia: {
        label: '\uD83E\uDE79 Dermatologia / Citologia avanzata',
        fields: [
            { id: 'motivo_consulenza', label: 'Motivo consulenza', type: 'textarea', placeholder: 'Es: Dermatite cronica recidivante', required: true },
            { id: 'localizzazione_lesioni', label: 'Localizzazione lesioni', type: 'textarea', placeholder: 'Es: Interdigitale, periauricolare, piega labiale', required: true },
            { id: 'durata', label: 'Durata', type: 'text', placeholder: 'Es: Da oltre 1 anno, peggiora in estate', required: true },
            { id: 'esami_gia_fatti', label: 'Esami gi\u00e0 fatti', type: 'textarea', placeholder: 'Es: Raschiato negativo, citologia: cocchi++', required: false },
            { id: 'terapie_tentate', label: 'Terapie tentate', type: 'textarea', placeholder: 'Es: Cefalessina 6 sett, Oclacitinib...', required: false },
            { id: 'richiesta_specifica', label: 'Cosa chiedo', type: 'textarea', placeholder: 'Es: Test allergologici intradermici + piano immunoterapia?', required: true },
            { id: 'allergie_farmaci', label: 'Allergie a farmaci', type: 'text', placeholder: 'Es: Reazione GI a metronidazolo', required: false },
            { id: 'urgenza', label: 'Urgenza', type: 'select', options: [
                { value: 'entro_24h', label: '\uD83D\uDD34 Entro 24h' },
                { value: 'entro_1_settimana', label: '\uD83D\uDFE1 Entro 1 settimana' },
                { value: 'programmabile', label: '\uD83D\uDFE2 Programmabile' }
            ], required: true },
            { id: 'note', label: 'Note per il collega', type: 'textarea', placeholder: '', required: false }
        ]
    }
};

function _commOnReferralTypeChange() {
    var formType = (document.getElementById('comm-referral-type') || {}).value || '';
    var container = document.getElementById('comm-referral-fields');
    if (!container) return;
    if (!formType || !REFERRAL_FORMS[formType]) { container.innerHTML = ''; return; }
    var formDef = REFERRAL_FORMS[formType];
    var html = '';
    for (var i = 0; i < formDef.fields.length; i++) {
        var f = formDef.fields[i];
        var reqMark = f.required ? ' *' : '';
        html += '<label for="ref-field-' + f.id + '" style="margin-top:10px;">' + _commEscape(f.label) + reqMark + '</label>';
        if (f.type === 'select') {
            html += '<select id="ref-field-' + f.id + '" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;">';
            html += '<option value="">-- Seleziona --</option>';
            for (var j = 0; j < f.options.length; j++) {
                html += '<option value="' + f.options[j].value + '">' + _commEscape(f.options[j].label) + '</option>';
            }
            html += '</select>';
        } else if (f.type === 'textarea') {
            html += '<textarea id="ref-field-' + f.id + '" placeholder="' + _commEscape(f.placeholder || '') + '" rows="2" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:inherit;"></textarea>';
        } else {
            html += '<input type="text" id="ref-field-' + f.id + '" placeholder="' + _commEscape(f.placeholder || '') + '" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;" />';
        }
    }
    container.innerHTML = html;
}

function _commFillTestForm() {
    var formType = (document.getElementById('comm-referral-type') || {}).value || '';
    if (!formType) { if (typeof showToast === 'function') showToast('Seleziona prima il tipo di form', 'warning'); return; }
    var testData = _commGetTestFormData(formType);
    var formDef = REFERRAL_FORMS[formType];
    if (!formDef) return;
    for (var i = 0; i < formDef.fields.length; i++) {
        var f = formDef.fields[i];
        var el = document.getElementById('ref-field-' + f.id);
        if (el && testData[f.id]) el.value = testData[f.id];
    }
    // Auto-fill primo messaggio
    var firstMsgField = document.getElementById('comm-new-first-message');
    if (firstMsgField) {
        var testMessages = {
            diagnostica_immagini: 'Buongiorno collega, richiedo consulto per Rx torace su paziente dispnoico da 3 giorni. Trovate i dettagli nel form allegato.',
            chirurgia_ortopedia: 'Buongiorno collega, invio per valutazione rottura LCA ginocchio sinistro. Zoppia acuta post-corsa, 5 giorni fa.',
            cardiologia: 'Buongiorno collega, richiedo rivalutazione cardiologica urgente. Soffio peggiorato con episodi sincopali.',
            endoscopia_gastro: 'Buongiorno collega, richiedo gastroscopia con biopsie per vomito cronico intermittente da 3 mesi non responsivo a terapia.',
            dermatologia: 'Buongiorno collega, invio per consulto dermatologico. Dermatite cronica recidivante da oltre 1 anno, peggiora in estate.'
        };
        firstMsgField.value = testMessages[formType] || 'Messaggio di test per verifica funzionalità.';
    }
}

function _commGetTestFormData(formType) {
    var data = {
        diagnostica_immagini: { tipo_esame: 'Rx torace 2 proiezioni', sospetto_diagnostico: 'Versamento pleurico? Massa mediastinica?', sintomi_principali: 'Dispnea da 3 gg, tachipnea, abbattimento', terapie_in_corso: 'Furosemide 2mg/kg BID da ieri', esami_gia_eseguiti: 'Emocromo nella norma', sedazione: 'Paziente aggressivo, preferibile sedazione', urgenza: 'entro_1_settimana', note: 'Proprietario disponibile qualsiasi giorno' },
        chirurgia_ortopedia: { intervento_richiesto: 'Valutazione rottura LCA ginocchio sx', dinamica_anamnesi: 'Zoppia acuta post-corsa al parco, 5 gg fa', esami_preoperatori: 'Emocromo + biochimico nella norma', rx_gia_fatte: 'S\u00ec, 2 proiezioni', patologie_pregresse: 'Nessuna rilevante', farmaci_in_corso: 'Robenacoxib 1mg/kg SID da 3 gg', allergie: 'Nessuna nota', urgenza: 'entro_24h', note: 'Proprietario molto preoccupato' },
        cardiologia: { motivo_consulenza: 'Soffio cardiaco grado IV/VI, peggiorato', sintomi_attuali: 'Tosse notturna, intolleranza esercizio, 2 episodi sincopali', ultima_ecocardiografia: '8 mesi fa: rigurgito mitralico moderato', terapia_cardiologica: 'Pimobendan 0.25mg/kg BID, Benazepril 0.5mg/kg SID', esami_recenti: 'Rx torace in allegato, creatinina 1.4', richiesta_specifica: 'Rivalutazione stadio ACVIM + adeguamento terapia', urgenza: 'entro_1_settimana', note: '' },
        endoscopia_gastro: { esame_richiesto: 'Gastroscopia + biopsie', problema_principale: 'Vomito cronico intermittente da 3 mesi', frequenza_sintomi: '3-4 episodi/settimana, a digiuno', iter_diagnostico: 'Emocromo, biochimico, cPLI, eco addome: tutto nella norma', risposta_terapie: 'Omeprazolo parziale risposta', sospetto: 'IBD? Linfoma intestinale low-grade?', urgenza: 'entro_1_settimana', note: 'Informo io il proprietario sul digiuno pre-esame' },
        dermatologia: { motivo_consulenza: 'Dermatite cronica recidivante', localizzazione_lesioni: 'Interdigitale 4 arti, periauricolare, piega labiale', durata: 'Da oltre 1 anno, peggiora in estate', esami_gia_fatti: 'Raschiato negativo, citologia: cocchi ++', terapie_tentate: 'Cefalessina 6 sett, Oclacitinib', richiesta_specifica: 'Test allergologici intradermici + piano immunoterapia', allergie_farmaci: 'Nessuna nota', urgenza: 'programmabile', note: '' }
    };
    return data[formType] || {};
}

// =========================================================================
// Section 11: Follow-up chips — intelligent yes/no and open questions
// =========================================================================
function _commIsYesNoQuestion(question) {
    if (!question || typeof question !== 'string') return false;
    var q = question.toLowerCase().trim();
    var yesNoPatterns = [
        /\bregolarmente\b/, /\bnormalmente\b/,
        /\bha (avuto|fatto|mostrato|presentato)\b/,
        /\b\u00e8 (cambiato|peggiorato|migliorato|successo|accaduto|presente|comparso)\b/,
        /\bci sono (stati|state)\b/, /\bhai notato\b/,
        /\bsta (mangiando|bevendo|dormendo)\b/, /\bpresenta\b/,
        /\bsoffre di\b/, /\b\u00e8 (vaccinato|sterilizzat|castrat|microchippat)\b/,
        /\bassume\b.*farmac/, /\bprende\b.*medicinali/,
        /\bmangia\b.*regolar/, /\bbeve\b.*regolar/
    ];
    for (var i = 0; i < yesNoPatterns.length; i++) {
        if (yesNoPatterns[i].test(q)) return true;
    }
    return false;
}

function _commEscapeAttr(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function _commSendChipAnswer(question, answer) {
    if (!_commCurrentConversationId) return;
    var input = document.getElementById('comm-msg-input');
    if (input) {
        input.value = question + ' \u2192 ' + answer;
        _commSend(_commCurrentConversationId);
    }
}

function _commPrepareOpenAnswer(question) {
    if (!_commCurrentConversationId) return;
    var input = document.getElementById('comm-msg-input');
    if (input) {
        input.value = question + ' Risposta: ';
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        if (typeof showToast === 'function') showToast('Completa la risposta e premi Invio', 'info');
    }
}

// =========================================================================
// Section 12: Emoji Picker (PR5)
// =========================================================================
var _emojiCategories = {
    '\uD83D\uDC3E Animali': ['\uD83D\uDC36','\uD83D\uDC31','\uD83D\uDC30','\uD83D\uDC39','\uD83D\uDC26','\uD83D\uDC22','\uD83D\uDC0D','\uD83D\uDC20','\uD83E\uDD8E','\uD83D\uDC34','\uD83D\uDC3E','\uD83E\uDDB4','\uD83D\uDC15','\uD83D\uDC08','\uD83D\uDC07','\uD83E\uDD9C','\uD83D\uDC3F\uFE0F','\uD83E\uDD8A','\uD83D\uDC3B','\uD83E\uDD81'],
    '\uD83D\uDE00 Faccine': ['\uD83D\uDE00','\uD83D\uDE02','\uD83E\uDD23','\uD83D\uDE0A','\uD83D\uDE0D','\uD83E\uDD70','\uD83D\uDE18','\uD83D\uDE0E','\uD83E\uDD14','\uD83D\uDE22','\uD83D\uDE2D','\uD83D\uDE21','\uD83E\uDD7A','\uD83D\uDE31','\uD83E\uDD17','\uD83D\uDE34','\uD83E\uDD12','\uD83E\uDD15','\u2764\uFE0F','\uD83D\uDC95'],
    '\uD83D\uDC4D Gesti': ['\uD83D\uDC4D','\uD83D\uDC4E','\uD83D\uDC4F','\uD83D\uDE4F','\uD83D\uDCAA','\uD83E\uDD1D','\uD83D\uDC4B','\u270C\uFE0F','\uD83E\uDD1E','\uD83E\uDEF6'],
    '\u2695\uFE0F Salute': ['\uD83D\uDC8A','\uD83D\uDC89','\uD83E\uDE7A','\uD83C\uDFE5','\uD83C\uDF21\uFE0F','\uD83E\uDE79','\u2764\uFE0F\u200D\uD83E\uDE79','\u2695\uFE0F','\uD83E\uDDEC','\uD83D\uDD2C'],
    '\uD83C\uDF56 Cibo': ['\uD83C\uDF56','\uD83E\uDD69','\uD83D\uDC1F','\uD83E\uDD55','\uD83C\uDF57','\uD83E\uDD5B','\uD83E\uDDB4','\uD83E\uDDC0','\uD83E\uDD5A','\uD83C\uDF4E'],
    '\u2705 Altro': ['\u2705','\u274C','\u26A0\uFE0F','\u2753','\uD83D\uDCAC','\uD83D\uDCCE','\uD83D\uDCF7','\uD83C\uDF89','\u2B50','\uD83D\uDD14']
};

function _commToggleEmojiPicker() {
    var existing = document.getElementById('comm-emoji-popover');
    if (existing) { existing.remove(); return; }

    var btn = document.getElementById('comm-emoji-btn');
    if (!btn) return;

    var popover = document.createElement('div');
    popover.id = 'comm-emoji-popover';
    popover.style.cssText = 'position:absolute;bottom:100%;left:0;background:#fff;border:1px solid #e2e8f0;' +
        'border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:8px;width:280px;max-height:300px;' +
        'overflow-y:auto;z-index:1000;';

    var html = '';
    Object.keys(_emojiCategories).forEach(function(cat) {
        html += '<div style="font-size:11px;font-weight:600;color:#64748b;padding:4px 4px 2px;margin-top:4px;">' + cat + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:2px;">';
        _emojiCategories[cat].forEach(function(e) {
            html += '<button type="button" style="font-size:22px;background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:6px;' +
                'transition:background 0.1s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'" ' +
                'data-emoji="' + e + '">' + e + '</button>';
        });
        html += '</div>';
    });
    popover.innerHTML = html;

    popover.addEventListener('click', function(ev) {
        var emoji = ev.target.getAttribute('data-emoji');
        if (emoji) {
            var textarea = document.getElementById('comm-msg-input');
            if (textarea) {
                var start = textarea.selectionStart != null ? textarea.selectionStart : textarea.value.length;
                var end = textarea.selectionEnd != null ? textarea.selectionEnd : start;
                textarea.value = textarea.value.slice(0, start) + emoji + textarea.value.slice(end);
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
            }
            popover.remove();
        }
    });

    var inputRow = btn.closest('.comm-input-row') || btn.parentElement;
    if (inputRow) inputRow.style.position = 'relative';
    (inputRow || btn.parentElement).appendChild(popover);

    setTimeout(function() {
        document.addEventListener('click', function _closeEmoji(ev) {
            if (!popover.contains(ev.target) && ev.target !== btn) {
                popover.remove();
                document.removeEventListener('click', _closeEmoji);
            }
        });
    }, 10);
}

// =========================================================================
// Section 13: Voice Messages (PR6)
// =========================================================================
var _commVoiceRecorder = null;
var _commVoiceChunks = [];
var _commVoiceRecording = false;
var _commVoiceTimer = null;
var _commVoiceSeconds = 0;
var _commVoiceStream = null;

function _commStartVoiceRecord() {
    if (_commVoiceRecording) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        _commVoiceStream = stream;
        var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        _commVoiceRecorder = new MediaRecorder(stream, { mimeType: mimeType });
        _commVoiceChunks = [];
        _commVoiceRecording = true;
        _commVoiceSeconds = 0;

        _commVoiceRecorder.ondataavailable = function(e) { if (e.data.size > 0) _commVoiceChunks.push(e.data); };
        _commVoiceRecorder.onstop = function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
            var blob = new Blob(_commVoiceChunks, { type: mimeType });
            _commSendVoiceMessage(blob);
            _commVoiceRecording = false;
            clearInterval(_commVoiceTimer);
            _commUpdateVoiceUI(false);
        };
        _commVoiceRecorder.start(250);

        _commVoiceTimer = setInterval(function() {
            _commVoiceSeconds++;
            _commUpdateVoiceUI(true);
            if (_commVoiceSeconds >= 180) _commStopVoiceRecord();
        }, 1000);
        _commUpdateVoiceUI(true);
    }).catch(function(err) {
        if (typeof showToast === 'function') showToast('Microfono non disponibile: ' + err.message, 'error');
    });
}

function _commStopVoiceRecord() {
    if (_commVoiceRecorder && _commVoiceRecorder.state === 'recording') {
        _commVoiceRecorder.stop();
    }
}

function _commCancelVoiceRecord() {
    if (_commVoiceRecorder && _commVoiceRecorder.state === 'recording') {
        _commVoiceRecorder.ondataavailable = null;
        _commVoiceRecorder.onstop = function() {
            _commVoiceRecording = false;
            clearInterval(_commVoiceTimer);
            _commUpdateVoiceUI(false);
            if (_commVoiceStream) { _commVoiceStream.getTracks().forEach(function(t) { t.stop(); }); _commVoiceStream = null; }
        };
        _commVoiceRecorder.stop();
    }
}

function _commUpdateVoiceUI(isRecording) {
    var voiceBtn = document.getElementById('comm-voice-btn');
    var inputArea = document.getElementById('comm-msg-input');
    if (isRecording) {
        if (voiceBtn) { voiceBtn.textContent = '\u23F9\uFE0F'; voiceBtn.title = 'Stop registrazione'; }
        if (inputArea) inputArea.placeholder = '\uD83D\uDD34 Registrazione\u2026 ' + _commVoiceSeconds + 's';
    } else {
        if (voiceBtn) { voiceBtn.textContent = '\uD83C\uDFA4'; voiceBtn.title = 'Messaggio vocale'; }
        if (inputArea) inputArea.placeholder = 'Scrivi un messaggio\u2026';
    }
}

async function _commSendVoiceMessage(blob) {
    if (!_commCurrentConversationId) return;
    var formData = new FormData();
    var filename = 'voice_' + Date.now() + '.webm';
    formData.append('file', blob, filename);
    formData.append('type', 'audio');
    try {
        var res = await fetch(
            _commApiBase() + '/api/communication/conversations/' + _commCurrentConversationId + '/messages/upload',
            { method: 'POST', headers: { 'Authorization': 'Bearer ' + getAuthToken() }, body: formData }
        );
        if (res.ok) {
            var msgData = await res.json();
            _commLoadMessages(_commCurrentConversationId);
            // Trigger transcription in background (non-blocking)
            var mid = (msgData.message && msgData.message.message_id) || msgData.message_id;
            if (mid) {
                _commTranscribeVoiceMessage(mid);
            }
        } else {
            if (typeof showToast === 'function') showToast('Errore invio messaggio vocale', 'error');
        }
    } catch(err) {
        if (typeof showToast === 'function') showToast('Errore invio: ' + err.message, 'error');
    }
}

async function _commTranscribeVoiceMessage(messageId) {
    try {
        var resp = await fetchApi('/api/communication/messages/' + messageId + '/transcribe', {
            method: 'POST', _skipGlobalSpinner: true
        });
        if (resp && resp.ok) {
            // Transcription will be received via WebSocket and update the UI
        }
    } catch(e) {
        console.warn('[Communication] Transcription error:', e.message);
    }
}

function _commUpdateMessageTranscription(messageId, transcription) {
    // Update the transcription inline if the message bubble is visible
    var msgEl = document.querySelector('[data-msg-id="' + messageId + '"]');
    if (msgEl) {
        var audioEl = msgEl.querySelector('audio');
        if (audioEl && !msgEl.querySelector('.comm-transcription')) {
            var div = document.createElement('div');
            div.className = 'comm-transcription';
            div.style.cssText = 'font-size:12px;color:#64748b;margin-top:6px;padding:6px 10px;background:#f8fafc;border-radius:6px;font-style:italic;';
            div.textContent = '\uD83D\uDCDD ' + transcription;
            audioEl.parentElement.parentElement.insertBefore(div, audioEl.parentElement.nextSibling);
        }
    } else if (_commCurrentConversationId) {
        // Message not visible, reload conversation
        _commLoadMessages(_commCurrentConversationId);
    }
}

// Reload messages for voice message display
function _commLoadMessages(conversationId) {
    if (conversationId) openConversation(conversationId);
}

// Direct call from messages page (MOD 11) — role-based recipient selection (v8.22.17)
function _commStartDirectCall(callType) {
    var area = document.getElementById('comm-new-form-area');
    if (!area) return;

    var role = _commGetRole();
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';
    var isVetInt = (jwtRole === 'vet_int' || (role !== 'proprietario' && jwtRole !== 'vet_ext'));

    var destTypeHtml = '';
    if (isVetInt) {
        destTypeHtml =
            '<label>Destinatario</label>' +
            '<select id="comm-call-dest-type" onchange="_commOnCallDestTypeChange(\'' + callType + '\')" ' +
            '  style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:8px;">' +
            '<option value="vet_int">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Interno</option>' +
            '<option value="vet_ext">\uD83D\uDC68\u200D\u2695\uFE0F Veterinario Esterno</option>' +
            '<option value="owner">\uD83E\uDDD1 Proprietario</option>' +
            '</select>';
    }

    area.innerHTML = '<div class="comm-new-form" data-testid="comm-call-form">' +
        destTypeHtml +
        '<label>Seleziona destinatario</label>' +
        '<select id="comm-call-recipient" disabled ' +
        '  style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;">' +
        '<option value="">Caricamento...</option></select>' +
        '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;">' +
        '<button class="comm-btn comm-btn-primary" id="comm-call-start-btn" style="display:none;" ' +
        '  onclick="_commInitiateDirectCall(\'' + callType + '\')">Inizia</button>' +
        '<button class="comm-btn comm-btn-secondary" onclick="document.getElementById(\'comm-new-form-area\').innerHTML=\'\'">Annulla</button>' +
        '</div></div>';

    // Scroll to form so it's visible (v8.22.15)
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Load recipients based on initial type
    _commLoadCallRecipientsForType('vet_int');
}

function _commOnCallDestTypeChange(callType) {
    var destType = (document.getElementById('comm-call-dest-type') || {}).value || 'vet_int';
    _commLoadCallRecipientsForType(destType);
    var startBtn = document.getElementById('comm-call-start-btn');
    if (startBtn) startBtn.style.display = 'none';
}

async function _commLoadCallRecipientsForType(destType) {
    var recipientSelect = document.getElementById('comm-call-recipient');
    if (!recipientSelect) return;

    recipientSelect.disabled = true;
    recipientSelect.innerHTML = '<option value="">Caricamento...</option>';

    try {
        var resp = await fetch(_commApiBase() + '/api/communication/users?role=' + encodeURIComponent(destType), {
            headers: _commAuthHeaders()
        });
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
            var displayName = typeof formatUserNameWithRole === 'function'
                ? formatUserNameWithRole(u.display_name || u.email || u.user_id, u.base_role || u.role)
                : (u.display_name || u.email || u.user_id);
            optHtml += '<option value="' + _commEscape(u.user_id) + '">' + _commEscape(displayName) + '</option>';
        }
        recipientSelect.innerHTML = optHtml;
        recipientSelect.disabled = false;

        recipientSelect.onchange = function() {
            var startBtn = document.getElementById('comm-call-start-btn');
            if (startBtn) startBtn.style.display = this.value ? '' : 'none';
        };

        if (typeof makeFilterableSelect === 'function') makeFilterableSelect('comm-call-recipient');
    } catch (e) {
        recipientSelect.innerHTML = '<option value="">Errore caricamento</option>';
        console.warn('[Communication] Load call recipients error:', e.message);
    }
}

async function _commInitiateDirectCall(callType) {
    var recipientId = (document.getElementById('comm-call-recipient') || {}).value;
    if (!recipientId) return;
    var petId = (typeof getCurrentPetId === 'function') ? getCurrentPetId() : null;
    if (!petId) {
        if (typeof showToast === 'function') showToast('Seleziona un pet', 'warning');
        return;
    }

    try {
        var callSubject = callType === 'video_call' ? 'Videotelefonata' : 'Telefonata';
        var resp = await fetchApi('/api/communication/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pet_id: petId,
                vet_user_id: recipientId,
                subject: callSubject,
                recipient_type: 'human',
                type: callType,
                initial_message: callSubject + ' avviata'
            })
        });

        if (resp && resp.ok) {
            var conv = await resp.json();
            var convId = conv.conversation_id || (conv.conversation && conv.conversation.conversation_id);
            if (convId && typeof startCall === 'function') {
                startCall(convId, callType);
            }
        } else {
            if (typeof showToast === 'function') showToast('Errore creazione chiamata', 'error');
        }
    } catch(e) {
        if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
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
