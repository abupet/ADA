// app-chatbot.js v1.0
// ADA AI Chatbot Assistant — triage e assistenza per il proprietario
//
// Globals expected: window.ADA_API_BASE_URL, showToast(), getActiveRole()
// Globals exposed:  initChatbot(containerId, petId), openChatbotSession(sessionId)

// Internal state
var _chatbotCurrentSessionId = null;
var _chatbotCurrentPetId = null;
var _chatbotSending = false;

// Helpers
function _chatbotApiBase() { return window.ADA_API_BASE_URL || ''; }

function _chatbotAuthHeaders() {
    return { 'Authorization': 'Bearer ' + localStorage.getItem('ada_jwt_token'), 'Content-Type': 'application/json' };
}

function _chatbotEscape(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _chatbotFormatDate(iso) {
    if (!iso) return '';
    try {
        var d = new Date(iso);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

// Triage helpers
function _chatbotTriageInfo(level) {
    if (level === 'red') return { bg: '#fee2e2', color: '#991b1b', text: 'EMERGENZA - Contatta il veterinario', badge: '#ef4444' };
    if (level === 'yellow') return { bg: '#fef9c3', color: '#854d0e', text: 'Consigliata visita veterinaria', badge: '#f59e0b' };
    return { bg: '#dcfce7', color: '#166534', text: 'Nessuna urgenza', badge: '#22c55e' };
}

function _chatbotTriageBadgeHtml(level) {
    var info = _chatbotTriageInfo(level);
    return '<span data-testid="chatbot-triage-badge" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + info.badge + ';margin-right:6px;"></span>';
}

function _chatbotTriageBannerHtml(level) {
    var info = _chatbotTriageInfo(level);
    return '<div data-testid="chatbot-triage-banner" style="padding:10px 16px;border-radius:8px;background:' + info.bg + ';color:' + info.color + ';font-size:13px;font-weight:600;margin-bottom:12px;text-align:center;">' +
        _chatbotEscape(info.text) + '</div>';
}

// CSS injection (guarded by data-chatbot-styles attribute)
function _chatbotInjectStyles() {
    if (document.querySelector('[data-chatbot-styles]')) return;
    var css =
        '.chatbot-container{max-width:700px;margin:0 auto}' +
        '.chatbot-disclaimer{padding:10px 16px;border-radius:8px;background:#f0f9ff;color:#1e40af;font-size:12px;margin-bottom:14px;text-align:center;border:1px solid #bfdbfe}' +
        '.chatbot-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}' +
        '.chatbot-header h3{margin:0;font-size:18px;color:#1e3a5f}' +
        '.chatbot-btn{padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:background .2s}' +
        '.chatbot-btn-primary{background:#2563eb;color:#fff}.chatbot-btn-primary:hover{background:#1d4ed8}' +
        '.chatbot-btn-secondary{background:#f1f5f9;color:#1e3a5f;border:1px solid #e2e8f0}.chatbot-btn-secondary:hover{background:#e2e8f0}' +
        '.chatbot-btn-danger{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}.chatbot-btn-danger:hover{background:#fecaca}' +
        '.chatbot-session-list{list-style:none;padding:0;margin:0}' +
        '.chatbot-session-card{display:flex;align-items:center;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:background .15s;background:#fff}' +
        '.chatbot-session-card:hover{background:#f8fafc}' +
        '.chatbot-session-info{flex:1;min-width:0}' +
        '.chatbot-session-summary{font-weight:600;font-size:14px;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.chatbot-session-date{font-size:11px;color:#94a3b8;margin-top:4px}' +
        '.chatbot-messages{max-height:420px;overflow-y:auto;padding:8px 0;display:flex;flex-direction:column;gap:8px}' +
        '.chatbot-msg{max-width:78%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word}' +
        '.chatbot-msg-user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}' +
        '.chatbot-msg-assistant{align-self:flex-start;background:#f1f5f9;color:#1e3a5f;border-bottom-left-radius:4px}' +
        '.chatbot-msg-time{font-size:10px;opacity:.6;margin-top:4px;text-align:right}' +
        '.chatbot-followups{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
        '.chatbot-chip{display:inline-block;padding:6px 12px;border-radius:16px;background:#e0e7ff;color:#3730a3;font-size:12px;cursor:pointer;border:1px solid #c7d2fe;transition:background .15s}' +
        '.chatbot-chip:hover{background:#c7d2fe}' +
        '.chatbot-input-row{display:flex;gap:8px;margin-top:12px}' +
        '.chatbot-input-row textarea{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;resize:none;font-family:inherit;min-height:42px;max-height:120px}' +
        '.chatbot-input-row textarea:focus{outline:none;border-color:#2563eb}' +
        '.chatbot-spinner{display:flex;align-items:center;gap:8px;padding:10px 14px;align-self:flex-start;color:#94a3b8;font-size:13px;font-style:italic}' +
        '.chatbot-spinner-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;animation:chatbot-bounce 1.2s infinite ease-in-out}' +
        '.chatbot-spinner-dot:nth-child(2){animation-delay:0.2s}.chatbot-spinner-dot:nth-child(3){animation-delay:0.4s}' +
        '@keyframes chatbot-bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
        '.chatbot-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px}' +
        '.chatbot-chat-header{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}';
    var style = document.createElement('style');
    style.setAttribute('data-chatbot-styles', '1');
    style.textContent = css;
    document.head.appendChild(style);
}

// EU AI Act disclaimer
function _chatbotDisclaimerHtml() {
    return '<div class="chatbot-disclaimer" data-testid="chatbot-disclaimer">' +
        'Assistente digitale ADA &mdash; le informazioni fornite non sostituiscono il parere del veterinario</div>';
}

// initChatbot(containerId, petId) — entry point: shows session list
async function initChatbot(containerId, petId) {
    _chatbotInjectStyles();
    var container = document.getElementById(containerId);
    if (!container) return;
    _chatbotCurrentPetId = petId || null;
    container.innerHTML =
        '<div class="chatbot-container" data-testid="chatbot-container">' +
        _chatbotDisclaimerHtml() +
        '<div class="chatbot-header"><h3>Assistente ADA</h3>' +
        '<button class="chatbot-btn chatbot-btn-primary" data-testid="chatbot-new-session" onclick="_chatbotCreateSession(\'' + _chatbotEscape(containerId) + '\')">Nuova conversazione</button>' +
        '</div><div data-testid="chatbot-session-list-area"><div class="chatbot-empty">Caricamento sessioni...</div></div></div>';
    try {
        var url = _chatbotApiBase() + '/api/chatbot/sessions' + (petId ? '?pet_id=' + encodeURIComponent(petId) : '');
        var res = await fetch(url, { headers: _chatbotAuthHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var sessions = data.sessions || data || [];
        _chatbotRenderSessionList(container, containerId, sessions);
    } catch (e) {
        var area = container.querySelector('[data-testid="chatbot-session-list-area"]');
        if (area) area.innerHTML = '<div class="chatbot-empty">Impossibile caricare le sessioni</div>';
        if (typeof showToast === 'function') showToast('Errore caricamento sessioni', 'error');
    }
}

// Render session list
function _chatbotRenderSessionList(container, containerId, sessions) {
    var area = container.querySelector('[data-testid="chatbot-session-list-area"]');
    if (!area) return;
    if (!sessions || sessions.length === 0) {
        area.innerHTML = '<div class="chatbot-empty" data-testid="chatbot-no-sessions">Nessuna conversazione. Inizia una nuova sessione!</div>';
        return;
    }
    var html = '<ul class="chatbot-session-list">';
    for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        var triage = s.triage_level || 'green';
        var summary = _chatbotEscape(s.summary || 'Sessione senza riepilogo');
        var date = _chatbotFormatDate(s.created_at || s.updated_at);
        html += '<li class="chatbot-session-card" data-testid="chatbot-session-card" data-session-id="' + _chatbotEscape(s.id) + '" onclick="openChatbotSession(\'' + _chatbotEscape(s.id) + '\')">' +
            '<div class="chatbot-session-info"><div class="chatbot-session-summary">' + _chatbotTriageBadgeHtml(triage) + summary + '</div>' +
            '<div class="chatbot-session-date">' + _chatbotEscape(date) + '</div></div></li>';
    }
    html += '</ul>';
    area.innerHTML = html;
}

// Create new session
async function _chatbotCreateSession(containerId) {
    try {
        var body = {};
        if (_chatbotCurrentPetId) body.pet_id = _chatbotCurrentPetId;
        var res = await fetch(_chatbotApiBase() + '/api/chatbot/sessions', {
            method: 'POST', headers: _chatbotAuthHeaders(), body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var sessionId = data.id || (data.session && data.session.id);
        if (sessionId) { openChatbotSession(sessionId); }
        else { throw new Error('No session id'); }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore creazione sessione', 'error');
    }
}

// openChatbotSession(sessionId) — opens a chat conversation
async function openChatbotSession(sessionId) {
    _chatbotInjectStyles();
    _chatbotCurrentSessionId = sessionId;
    var container = document.querySelector('[data-testid="chatbot-container"]') || document.querySelector('.chatbot-container');
    if (!container) return;
    container.innerHTML =
        _chatbotDisclaimerHtml() +
        '<div class="chatbot-chat-header">' +
        '<button class="chatbot-btn chatbot-btn-secondary" data-testid="chatbot-back" onclick="_chatbotGoBack()">&#8592; Indietro</button>' +
        '<h3 style="flex:1;margin:0;font-size:16px;color:#1e3a5f;">Conversazione</h3>' +
        '<button class="chatbot-btn chatbot-btn-danger" data-testid="chatbot-close-session" onclick="_chatbotCloseSession()">Chiudi sessione</button></div>' +
        '<div data-testid="chatbot-triage-area"></div>' +
        '<div class="chatbot-messages" data-testid="chatbot-messages"><div class="chatbot-empty">Caricamento messaggi...</div></div>' +
        '<div class="chatbot-input-row" data-testid="chatbot-input-row">' +
        '<textarea data-testid="chatbot-input" placeholder="Scrivi un messaggio..." rows="1" onkeydown="_chatbotInputKeydown(event)"></textarea>' +
        '<button class="chatbot-btn chatbot-btn-primary" data-testid="chatbot-send" onclick="_chatbotSendMessage()">Invia</button></div>';
    try {
        var res = await fetch(_chatbotApiBase() + '/api/chatbot/sessions/' + encodeURIComponent(sessionId), { headers: _chatbotAuthHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var session = data.session || data;
        var messages = session.messages || data.messages || [];
        var triageLevel = session.triage_level || 'green';
        var triageArea = container.querySelector('[data-testid="chatbot-triage-area"]');
        if (triageArea) triageArea.innerHTML = _chatbotTriageBannerHtml(triageLevel);
        _chatbotRenderMessages(container, messages);
        if (session.status === 'closed') {
            var inputRow = container.querySelector('[data-testid="chatbot-input-row"]');
            if (inputRow) inputRow.style.display = 'none';
            var closeBtn = container.querySelector('[data-testid="chatbot-close-session"]');
            if (closeBtn) closeBtn.style.display = 'none';
        }
    } catch (e) {
        var msgArea = container.querySelector('[data-testid="chatbot-messages"]');
        if (msgArea) msgArea.innerHTML = '<div class="chatbot-empty">Errore caricamento conversazione</div>';
        if (typeof showToast === 'function') showToast('Errore caricamento conversazione', 'error');
    }
}

// Render messages
function _chatbotRenderMessages(container, messages) {
    var msgArea = container.querySelector('[data-testid="chatbot-messages"]');
    if (!msgArea) return;
    if (!messages || messages.length === 0) {
        msgArea.innerHTML = '<div class="chatbot-empty" data-testid="chatbot-no-messages">Nessun messaggio. Scrivi per iniziare!</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var isUser = m.role === 'user';
        var cssClass = isUser ? 'chatbot-msg chatbot-msg-user' : 'chatbot-msg chatbot-msg-assistant';
        var testId = isUser ? 'chatbot-msg-user' : 'chatbot-msg-assistant';
        var time = _chatbotFormatDate(m.created_at);
        html += '<div class="' + cssClass + '" data-testid="' + testId + '">';
        if (!isUser && m.triage_level) {
            html += '<div style="margin-bottom:6px;">' + _chatbotTriageBadgeHtml(m.triage_level) +
                '<span style="font-size:11px;color:#64748b;">' + _chatbotEscape(_chatbotTriageInfo(m.triage_level).text) + '</span></div>';
        }
        html += '<div>' + _chatbotEscape(m.content || '') + '</div>';
        if (time) html += '<div class="chatbot-msg-time">' + _chatbotEscape(time) + '</div>';
        if (!isUser && m.follow_up_questions && m.follow_up_questions.length > 0) {
            html += '<div class="chatbot-followups" data-testid="chatbot-followups">';
            for (var j = 0; j < m.follow_up_questions.length; j++) {
                var q = m.follow_up_questions[j];
                html += '<span class="chatbot-chip" data-testid="chatbot-chip" onclick="_chatbotSendChip(this)" data-question="' + _chatbotEscape(q) + '">' + _chatbotEscape(q) + '</span>';
            }
            html += '</div>';
        }
        html += '</div>';
    }
    msgArea.innerHTML = html;
    msgArea.scrollTop = msgArea.scrollHeight;
}

// Send message
async function _chatbotSendMessage() {
    if (_chatbotSending) return;
    var container = document.querySelector('[data-testid="chatbot-container"]') || document.querySelector('.chatbot-container');
    if (!container) return;
    var textarea = container.querySelector('[data-testid="chatbot-input"]');
    if (!textarea) return;
    var text = (textarea.value || '').trim();
    if (!text) return;
    _chatbotSending = true;
    textarea.value = '';
    textarea.disabled = true;
    var sendBtn = container.querySelector('[data-testid="chatbot-send"]');
    if (sendBtn) sendBtn.disabled = true;
    var msgArea = container.querySelector('[data-testid="chatbot-messages"]');
    if (msgArea) {
        var empty = msgArea.querySelector('.chatbot-empty');
        if (empty) empty.remove();
        msgArea.innerHTML += '<div class="chatbot-msg chatbot-msg-user" data-testid="chatbot-msg-user"><div>' + _chatbotEscape(text) + '</div></div>';
        msgArea.innerHTML += '<div class="chatbot-spinner" data-testid="chatbot-spinner">' +
            '<span class="chatbot-spinner-dot"></span><span class="chatbot-spinner-dot"></span><span class="chatbot-spinner-dot"></span>' +
            ' ADA sta pensando...</div>';
        msgArea.scrollTop = msgArea.scrollHeight;
    }
    try {
        var res = await fetch(_chatbotApiBase() + '/api/chatbot/sessions/' + encodeURIComponent(_chatbotCurrentSessionId) + '/message', {
            method: 'POST', headers: _chatbotAuthHeaders(), body: JSON.stringify({ content: text })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var spinner = msgArea ? msgArea.querySelector('[data-testid="chatbot-spinner"]') : null;
        if (spinner) spinner.remove();
        var reply = data.message || data.reply || data;
        if (msgArea && reply) {
            var replyContent = reply.content || (typeof reply === 'string' ? reply : '');
            var triageLevel = reply.triage_level || data.triage_level;
            var followUps = reply.follow_up_questions || data.follow_up_questions || [];
            var replyHtml = '<div class="chatbot-msg chatbot-msg-assistant" data-testid="chatbot-msg-assistant">';
            if (triageLevel) {
                replyHtml += '<div style="margin-bottom:6px;">' + _chatbotTriageBadgeHtml(triageLevel) +
                    '<span style="font-size:11px;color:#64748b;">' + _chatbotEscape(_chatbotTriageInfo(triageLevel).text) + '</span></div>';
            }
            replyHtml += '<div>' + _chatbotEscape(replyContent) + '</div>';
            if (followUps.length > 0) {
                replyHtml += '<div class="chatbot-followups" data-testid="chatbot-followups">';
                for (var k = 0; k < followUps.length; k++) {
                    replyHtml += '<span class="chatbot-chip" data-testid="chatbot-chip" onclick="_chatbotSendChip(this)" data-question="' + _chatbotEscape(followUps[k]) + '">' + _chatbotEscape(followUps[k]) + '</span>';
                }
                replyHtml += '</div>';
            }
            replyHtml += '</div>';
            msgArea.innerHTML += replyHtml;
            msgArea.scrollTop = msgArea.scrollHeight;
            if (triageLevel) {
                var triageArea = container.querySelector('[data-testid="chatbot-triage-area"]');
                if (triageArea) triageArea.innerHTML = _chatbotTriageBannerHtml(triageLevel);
            }
        }
    } catch (e) {
        var spinnerEl = msgArea ? msgArea.querySelector('[data-testid="chatbot-spinner"]') : null;
        if (spinnerEl) spinnerEl.remove();
        if (typeof showToast === 'function') showToast('Errore invio messaggio', 'error');
    } finally {
        _chatbotSending = false;
        if (textarea) textarea.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (textarea) textarea.focus();
    }
}

// Send chip (follow-up question click)
function _chatbotSendChip(chipEl) {
    var question = chipEl.getAttribute('data-question');
    if (!question) return;
    var container = document.querySelector('[data-testid="chatbot-container"]') || document.querySelector('.chatbot-container');
    if (!container) return;
    var textarea = container.querySelector('[data-testid="chatbot-input"]');
    if (textarea) { textarea.value = question; _chatbotSendMessage(); }
}

// Keyboard handler (Enter sends, Shift+Enter newline)
function _chatbotInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); _chatbotSendMessage(); }
}

// Close session
async function _chatbotCloseSession() {
    if (!_chatbotCurrentSessionId) return;
    try {
        var res = await fetch(_chatbotApiBase() + '/api/chatbot/sessions/' + encodeURIComponent(_chatbotCurrentSessionId) + '/close', {
            method: 'POST', headers: _chatbotAuthHeaders()
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (typeof showToast === 'function') showToast('Sessione chiusa', 'success');
        var container = document.querySelector('[data-testid="chatbot-container"]') || document.querySelector('.chatbot-container');
        if (container) {
            var inputRow = container.querySelector('[data-testid="chatbot-input-row"]');
            if (inputRow) inputRow.style.display = 'none';
            var closeBtn = container.querySelector('[data-testid="chatbot-close-session"]');
            if (closeBtn) closeBtn.style.display = 'none';
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore chiusura sessione', 'error');
    }
}

// Back to session list
function _chatbotGoBack() {
    _chatbotCurrentSessionId = null;
    var container = document.querySelector('[data-testid="chatbot-container"]');
    if (container && container.parentElement) {
        initChatbot(container.parentElement.id, _chatbotCurrentPetId);
    }
}
