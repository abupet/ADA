// app-webrtc.js v1.0
// ADA WebRTC Voice & Video Call System — veterinario <-> proprietario
//
// Globals expected: window._commSocket, window.ADA_API_BASE_URL, showToast(), _commGetCurrentUserId()
// Globals exposed:  initCallUI(), startCall(), handleIncomingCall(), endCall()

var _webrtcPC = null, _webrtcLocalStream = null, _webrtcRemoteStream = null;
var _webrtcCallId = null, _webrtcConvId = null, _webrtcCallType = null;
var _webrtcTimerInterval = null, _webrtcStartTime = null, _webrtcIceQueue = [];
var _webrtcIncomingCallData = null, _webrtcRingTimeout = null, _webrtcIncomingTimeout = null;

function _webrtcApiBase() { return window.ADA_API_BASE_URL || ''; }
function _webrtcAuth() { return { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' }; }
function _webrtcUserId() {
    if (typeof _commGetCurrentUserId === 'function') return _commGetCurrentUserId();
    return typeof getJwtUserId === 'function' ? getJwtUserId() : null;
}
function _webrtcFmtDur(s) { var m = Math.floor(s/60), ss = s%60; return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss; }
function _webrtcEsc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

// ---- CSS injection ----
function _webrtcInjectStyles() {
    if (document.querySelector('[data-webrtc-styles]')) return;
    var css =
        '.webrtc-call-controls{display:flex;gap:8px;align-items:center;margin-top:8px}' +
        '.webrtc-btn{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:background .2s;display:inline-flex;align-items:center;gap:6px}' +
        '.webrtc-btn-audio{background:#16a34a;color:#fff}.webrtc-btn-audio:hover{background:#15803d}' +
        '.webrtc-btn-video{background:#2563eb;color:#fff}.webrtc-btn-video:hover{background:#1d4ed8}' +
        '.webrtc-btn-end{background:#ef4444;color:#fff}.webrtc-btn-end:hover{background:#dc2626}' +
        '.webrtc-btn-mute{background:#f1f5f9;color:#1e3a5f;border:1px solid #e2e8f0}.webrtc-btn-mute:hover{background:#e2e8f0}' +
        '.webrtc-btn-mute.active{background:#fbbf24;color:#92400e;border-color:#fbbf24}' +
        '.webrtc-partner-status{font-size:12px;color:#94a3b8;margin-left:8px}.webrtc-partner-online{color:#16a34a}' +
        '.webrtc-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center}' +
        '.webrtc-overlay-header{color:#fff;font-size:16px;font-weight:600;margin-bottom:16px;text-align:center}' +
        '.webrtc-overlay-timer{color:#94a3b8;font-size:14px;margin-bottom:20px;font-variant-numeric:tabular-nums}' +
        '.webrtc-remote-video{width:100%;max-width:640px;max-height:420px;border-radius:12px;background:#000;object-fit:cover}' +
        '.webrtc-local-video{position:absolute;bottom:100px;right:24px;width:160px;height:120px;border-radius:10px;border:2px solid #fff;object-fit:cover;background:#000}' +
        '.webrtc-overlay-controls{display:flex;gap:12px;margin-top:24px}' +
        '.webrtc-incoming{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:10000;background:#fff;border-radius:14px;padding:20px 28px;box-shadow:0 8px 32px rgba(0,0,0,0.25);text-align:center;min-width:280px}' +
        '.webrtc-incoming-title{font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:4px}' +
        '.webrtc-incoming-type{font-size:13px;color:#64748b;margin-bottom:16px}' +
        '.webrtc-incoming-actions{display:flex;gap:10px;justify-content:center}' +
        '.webrtc-incoming-accept{padding:10px 22px;border:none;border-radius:8px;background:#16a34a;color:#fff;font-weight:600;cursor:pointer;font-size:14px}' +
        '.webrtc-incoming-reject{padding:10px 22px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-weight:600;cursor:pointer;font-size:14px}';
    var st = document.createElement('style'); st.setAttribute('data-webrtc-styles','1'); st.textContent = css; document.head.appendChild(st);
}

// ---- Section 1: Call UI controls ----
function initCallUI(containerId, conversationId) {
    _webrtcInjectStyles();
    var c = document.getElementById(containerId); if (!c) return;
    c.innerHTML = '<div class="webrtc-call-controls" data-testid="webrtc-call-controls">' +
        '<button class="webrtc-btn webrtc-btn-audio" data-testid="webrtc-btn-audio" onclick="startCall(\'' + conversationId + '\',\'voice_call\')" title="Chiamata vocale">&#128222; Chiama</button>' +
        '<button class="webrtc-btn webrtc-btn-video" data-testid="webrtc-btn-video" onclick="startCall(\'' + conversationId + '\',\'video_call\')" title="Videochiamata">&#127909; Video</button>' +
        '<span class="webrtc-partner-status" id="webrtc-partner-status" data-testid="webrtc-partner-status"></span></div>';
    _webrtcListenPartnerStatus(conversationId);
}

function _webrtcListenPartnerStatus(convId) {
    var socket = window._commSocket; if (!socket) return;
    var uid = _webrtcUserId();
    socket.emit('request_partner_status', { conversationId: convId });
    socket.on('partner_status', function(d) {
        if (!d || d.conversation_id !== convId || d.user_id === uid) return;
        var el = document.getElementById('webrtc-partner-status'); if (!el) return;
        el.textContent = d.online ? 'Online' : 'Offline';
        el.className = 'webrtc-partner-status' + (d.online ? ' webrtc-partner-online' : '');
    });
}

// ---- Section 2: Start a call ----
async function startCall(conversationId, callType) {
    _webrtcInjectStyles();
    if (_webrtcPC) { if (typeof showToast === 'function') showToast('Chiamata gi\u00e0 in corso','warning'); return; }
    var socket = window._commSocket;
    if (!socket) { if (typeof showToast === 'function') showToast('Connessione non disponibile','error'); return; }
    _webrtcConvId = conversationId; _webrtcCallType = callType;
    try {
        _webrtcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video_call' });
    } catch(e) {
        console.warn('[WebRTC] Impossibile accedere ai dispositivi media:', e.message);
        if (typeof showToast === 'function') showToast('Impossibile accedere al microfono/videocamera','error'); return;
    }
    _webrtcCreatePC();
    _webrtcLocalStream.getTracks().forEach(function(t) { _webrtcPC.addTrack(t, _webrtcLocalStream); });
    _webrtcCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
    socket.emit('initiate_call', { conversationId: conversationId, callType: callType, callId: _webrtcCallId });
    _webrtcShowOverlay(callType, true);
    // 60s no-answer timeout
    _webrtcRingTimeout = setTimeout(function() {
        if (_webrtcPC && !_webrtcStartTime) {
            if (typeof showToast === 'function') showToast('Nessuna risposta', 'warning');
            endCall();
        }
    }, 60000);
}

// ---- Section 3: RTCPeerConnection ----
function _webrtcCreatePC() {
    _webrtcPC = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    _webrtcRemoteStream = new MediaStream();
    _webrtcPC.onicecandidate = function(ev) {
        if (ev.candidate && window._commSocket) window._commSocket.emit('webrtc_ice', { conversationId: _webrtcConvId, callId: _webrtcCallId, candidate: ev.candidate });
    };
    _webrtcPC.ontrack = function(ev) {
        ev.streams[0].getTracks().forEach(function(t) { _webrtcRemoteStream.addTrack(t); });
        var rv = document.getElementById('webrtc-remote-video'); if (rv) rv.srcObject = _webrtcRemoteStream;
    };
    _webrtcPC.onconnectionstatechange = function() {
        var s = _webrtcPC ? _webrtcPC.connectionState : 'unknown';
        if (s === 'disconnected' || s === 'failed' || s === 'closed') endCall();
    };
    _webrtcPC.oniceconnectionstatechange = function() {
        var s = _webrtcPC ? _webrtcPC.iceConnectionState : 'unknown';
        if (s === 'connected' || s === 'completed') _webrtcStartTimer();
    };
}

// ---- Section 4: Handle incoming call ----
function handleIncomingCall(data) {
    _webrtcInjectStyles();
    if (!data || !data.conversationId || !data.callId) return;
    // Deduplicate: event arrives via both conv room and user room
    if (_webrtcIncomingCallData && _webrtcIncomingCallData.callId === data.callId) return;
    if (_webrtcPC) {
        if (window._commSocket) window._commSocket.emit('reject_call', { conversationId: data.conversationId, callId: data.callId, reason: 'busy' });
        return;
    }
    _webrtcIncomingCallData = { conversationId: data.conversationId, callId: data.callId, callType: data.callType };
    var typeLabel = data.callType === 'video_call' ? 'Videochiamata' : 'Chiamata vocale';
    var caller = data.callerName || 'Utente';
    var notif = document.createElement('div');
    notif.className = 'webrtc-incoming'; notif.id = 'webrtc-incoming-notification';
    notif.setAttribute('data-testid','webrtc-incoming-notification');
    notif.innerHTML = '<div class="webrtc-incoming-title" data-testid="webrtc-incoming-caller">' + _webrtcEsc(caller) + '</div>' +
        '<div class="webrtc-incoming-type">' + typeLabel + ' in arrivo</div>' +
        '<div class="webrtc-incoming-actions">' +
        '<button class="webrtc-incoming-accept" data-testid="webrtc-accept-btn" onclick="_webrtcAccept(\'' + data.conversationId + '\',\'' + data.callId + '\',\'' + (data.callType||'voice_call') + '\')">Accetta</button>' +
        '<button class="webrtc-incoming-reject" data-testid="webrtc-reject-btn" onclick="_webrtcReject(\'' + data.conversationId + '\',\'' + data.callId + '\')">Rifiuta</button></div>';
    document.body.appendChild(notif);
    // Auto-dismiss after 60s
    _webrtcIncomingTimeout = setTimeout(function() {
        if (_webrtcIncomingCallData && _webrtcIncomingCallData.callId === data.callId) {
            _webrtcReject(data.conversationId, data.callId);
        }
    }, 60000);
}

async function _webrtcAccept(convId, callId, callType) {
    _webrtcRemoveNotif();
    _webrtcIncomingCallData = null;
    if (_webrtcIncomingTimeout) { clearTimeout(_webrtcIncomingTimeout); _webrtcIncomingTimeout = null; }
    _webrtcConvId = convId; _webrtcCallId = callId; _webrtcCallType = callType;
    try {
        _webrtcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video_call' });
    } catch(e) {
        console.warn('[WebRTC] Impossibile accedere ai dispositivi media:', e.message);
        if (typeof showToast === 'function') showToast('Impossibile accedere al microfono/videocamera','error'); return;
    }
    _webrtcCreatePC();
    _webrtcLocalStream.getTracks().forEach(function(t) { _webrtcPC.addTrack(t, _webrtcLocalStream); });
    // Join conv room before accepting (so signaling messages reach us)
    if (window._commSocket) {
        window._commSocket.emit('join_conversation', { conversationId: convId });
        window._commSocket.emit('accept_call', { conversationId: convId, callId: callId });
    }
    _webrtcShowOverlay(callType, false);
}

function _webrtcReject(convId, callId) {
    _webrtcRemoveNotif();
    _webrtcIncomingCallData = null;
    if (_webrtcIncomingTimeout) { clearTimeout(_webrtcIncomingTimeout); _webrtcIncomingTimeout = null; }
    if (window._commSocket) window._commSocket.emit('reject_call', { conversationId: convId, callId: callId, reason: 'declined' });
}

function _webrtcRemoveNotif() { var n = document.getElementById('webrtc-incoming-notification'); if (n && n.parentNode) n.parentNode.removeChild(n); }

// ---- Section 5: Call overlay UI ----
function _webrtcShowOverlay(callType, isInitiator) {
    var old = document.getElementById('webrtc-call-overlay'); if (old) old.parentNode.removeChild(old);
    var ov = document.createElement('div'); ov.className = 'webrtc-overlay'; ov.id = 'webrtc-call-overlay';
    ov.setAttribute('data-testid','webrtc-call-overlay');
    var h = '<div class="webrtc-overlay-header" data-testid="webrtc-call-status">' + (isInitiator ? 'Chiamata in corso...' : 'Connesso') + '</div>' +
        '<div class="webrtc-overlay-timer" id="webrtc-call-timer" data-testid="webrtc-call-timer">00:00</div>';
    if (callType === 'video_call') {
        h += '<video class="webrtc-remote-video" id="webrtc-remote-video" data-testid="webrtc-remote-video" autoplay playsinline></video>';
        h += '<video class="webrtc-local-video" id="webrtc-local-video" data-testid="webrtc-local-video" autoplay playsinline muted></video>';
    } else {
        h += '<audio id="webrtc-remote-video" data-testid="webrtc-remote-audio" autoplay></audio><div style="font-size:64px;margin:20px 0;">&#128222;</div>';
    }
    h += '<div class="webrtc-overlay-controls">' +
        '<button class="webrtc-btn webrtc-btn-mute" id="webrtc-mute-btn" data-testid="webrtc-mute-btn" onclick="_webrtcToggleMute()">&#128263; Muto</button>' +
        '<button class="webrtc-btn webrtc-btn-end" data-testid="webrtc-end-btn" onclick="endCall()">&#128308; Termina</button></div>';
    ov.innerHTML = h; document.body.appendChild(ov);
    if (callType === 'video_call' && _webrtcLocalStream) { var lv = document.getElementById('webrtc-local-video'); if (lv) lv.srcObject = _webrtcLocalStream; }
    var rv = document.getElementById('webrtc-remote-video'); if (rv && _webrtcRemoteStream) rv.srcObject = _webrtcRemoteStream;
}

// ---- Section 6: Call controls ----
function _webrtcToggleMute() {
    if (!_webrtcLocalStream) return;
    var tracks = _webrtcLocalStream.getAudioTracks(); if (!tracks.length) return;
    var wasMuted = !tracks[0].enabled; tracks[0].enabled = wasMuted;
    var btn = document.getElementById('webrtc-mute-btn'); if (!btn) return;
    btn.innerHTML = wasMuted ? '&#128263; Muto' : '&#128264; Attivo';
    btn.classList.toggle('active', !wasMuted);
}

function _webrtcStartTimer() {
    if (_webrtcTimerInterval) return;
    _webrtcStartTime = Date.now();
    _webrtcTimerInterval = setInterval(function() {
        var el = document.getElementById('webrtc-call-timer');
        if (el) el.textContent = _webrtcFmtDur(Math.floor((Date.now() - _webrtcStartTime) / 1000));
    }, 1000);
    var st = document.querySelector('[data-testid="webrtc-call-status"]'); if (st) st.textContent = 'In chiamata';
    // Start server-side transcription
    _webrtcStartServerTranscription(_webrtcConvId);
}

// Server-side transcription via OpenAI Whisper (replaces Web Speech API)
var _webrtcLocalRecorder = null;
var _webrtcRemoteRecorder = null;
var _webrtcChunkIntervalMs = 15000; // 15 seconds per chunk
var _webrtcChunkTimers = { local: null, remote: null };

function _webrtcStartServerTranscription(conversationId) {
    var socket = window._commSocket;
    if (!socket) return;

    // Capture local audio (MY audio)
    if (_webrtcLocalStream) {
        _webrtcStartAudioCapture('local', _webrtcLocalStream, conversationId);
    }

    // Capture remote audio (OTHER participant's audio)
    if (_webrtcRemoteStream && _webrtcRemoteStream.getAudioTracks().length > 0) {
        _webrtcStartAudioCapture('remote', _webrtcRemoteStream, conversationId);
    }
}

function _webrtcStartAudioCapture(source, stream, conversationId) {
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';

    var recorder;
    try {
        recorder = new MediaRecorder(stream, { mimeType: mimeType });
    } catch(e) {
        console.warn('[WebRTC] MediaRecorder not available for ' + source + ':', e.message);
        return;
    }
    var parts = [];

    recorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) parts.push(e.data);
    };

    recorder.onstop = function() {
        if (parts.length > 0) {
            var blob = new Blob(parts, { type: mimeType });
            _webrtcSendAudioChunk(blob, source, conversationId);
        }
        parts = [];
        // Restart if the call is still active
        if (_webrtcPC && _webrtcChunkTimers[source] !== null) {
            try { recorder.start(); } catch(e) {}
        }
    };

    recorder.start();

    if (source === 'local') _webrtcLocalRecorder = recorder;
    else _webrtcRemoteRecorder = recorder;

    // Every N seconds, stop + restart to create a chunk
    _webrtcChunkTimers[source] = setInterval(function() {
        if (recorder.state === 'recording') {
            try { recorder.stop(); } catch(e) {}
        }
    }, _webrtcChunkIntervalMs);
}

function _webrtcSendAudioChunk(blob, source, conversationId) {
    var reader = new FileReader();
    reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        var socket = window._commSocket;
        if (socket) {
            socket.emit('call_audio_chunk', {
                conversationId: conversationId,
                callId: _webrtcCallId,
                source: source,
                audioData: base64,
                mimeType: blob.type,
                timestamp: Date.now()
            });
        }
    };
    reader.readAsDataURL(blob);
}

function _webrtcStopServerTranscription() {
    if (_webrtcChunkTimers.local) { clearInterval(_webrtcChunkTimers.local); _webrtcChunkTimers.local = null; }
    if (_webrtcChunkTimers.remote) { clearInterval(_webrtcChunkTimers.remote); _webrtcChunkTimers.remote = null; }
    if (_webrtcLocalRecorder && _webrtcLocalRecorder.state !== 'inactive') {
        try { _webrtcLocalRecorder.stop(); } catch(e) {}
    }
    if (_webrtcRemoteRecorder && _webrtcRemoteRecorder.state !== 'inactive') {
        try { _webrtcRemoteRecorder.stop(); } catch(e) {}
    }
    _webrtcLocalRecorder = null;
    _webrtcRemoteRecorder = null;
}

// ---- Section 7: End call & cleanup ----
function endCall() {
    _webrtcStopServerTranscription();
    if (window._commSocket && _webrtcConvId) window._commSocket.emit('end_call', { conversationId: _webrtcConvId, callId: _webrtcCallId });
    if (_webrtcLocalStream) { _webrtcLocalStream.getTracks().forEach(function(t) { t.stop(); }); _webrtcLocalStream = null; }
    if (_webrtcPC) { _webrtcPC.close(); _webrtcPC = null; }
    _webrtcRemoteStream = null;
    if (_webrtcTimerInterval) { clearInterval(_webrtcTimerInterval); _webrtcTimerInterval = null; }
    if (_webrtcRingTimeout) { clearTimeout(_webrtcRingTimeout); _webrtcRingTimeout = null; }
    if (_webrtcIncomingTimeout) { clearTimeout(_webrtcIncomingTimeout); _webrtcIncomingTimeout = null; }
    _webrtcIncomingCallData = null;
    var ov = document.getElementById('webrtc-call-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    _webrtcRemoveNotif();
    var dur = _webrtcStartTime ? Math.floor((Date.now() - _webrtcStartTime) / 1000) : 0;
    _webrtcCallId = null; _webrtcConvId = null; _webrtcCallType = null; _webrtcStartTime = null; _webrtcIceQueue = [];
    if (dur > 0 && typeof showToast === 'function') showToast('Chiamata terminata (' + _webrtcFmtDur(dur) + ')', 'info');
}

// ---- Section 8: Socket.io signaling listeners ----
function _webrtcInitSignaling() {
    var socket = window._commSocket; if (!socket) return;

    socket.on('incoming_call', function(d) { handleIncomingCall(d); });

    socket.on('call_accepted', async function(d) {
        if (!d || d.callId !== _webrtcCallId || !_webrtcPC) return;
        if (_webrtcRingTimeout) { clearTimeout(_webrtcRingTimeout); _webrtcRingTimeout = null; }
        try {
            var offer = await _webrtcPC.createOffer();
            await _webrtcPC.setLocalDescription(offer);
            socket.emit('webrtc_offer', { conversationId: _webrtcConvId, callId: _webrtcCallId, offer: offer });
        } catch(e) { console.warn('[WebRTC] Errore creazione offerta:', e.message); endCall(); }
    });

    socket.on('call_rejected', function(d) {
        if (!d || d.callId !== _webrtcCallId) return;
        if (typeof showToast === 'function') showToast(d.reason === 'busy' ? 'L\'utente \u00e8 occupato' : 'Chiamata rifiutata', 'warning');
        endCall();
    });

    socket.on('webrtc_offer', async function(d) {
        if (!d || d.callId !== _webrtcCallId || !_webrtcPC) return;
        try {
            await _webrtcPC.setRemoteDescription(new RTCSessionDescription(d.offer));
            for (var i = 0; i < _webrtcIceQueue.length; i++) await _webrtcPC.addIceCandidate(new RTCIceCandidate(_webrtcIceQueue[i]));
            _webrtcIceQueue = [];
            var answer = await _webrtcPC.createAnswer();
            await _webrtcPC.setLocalDescription(answer);
            socket.emit('webrtc_answer', { conversationId: _webrtcConvId, callId: _webrtcCallId, answer: answer });
        } catch(e) { console.warn('[WebRTC] Errore gestione offerta:', e.message); endCall(); }
    });

    socket.on('webrtc_answer', async function(d) {
        if (!d || d.callId !== _webrtcCallId || !_webrtcPC) return;
        try {
            await _webrtcPC.setRemoteDescription(new RTCSessionDescription(d.answer));
            for (var i = 0; i < _webrtcIceQueue.length; i++) await _webrtcPC.addIceCandidate(new RTCIceCandidate(_webrtcIceQueue[i]));
            _webrtcIceQueue = [];
        } catch(e) { console.warn('[WebRTC] Errore gestione risposta:', e.message); endCall(); }
    });

    socket.on('webrtc_ice', async function(d) {
        if (!d || d.callId !== _webrtcCallId) return;
        if (_webrtcPC && _webrtcPC.remoteDescription) {
            try { await _webrtcPC.addIceCandidate(new RTCIceCandidate(d.candidate)); }
            catch(e) { console.warn('[WebRTC] Errore aggiunta candidato ICE:', e.message); }
        } else { _webrtcIceQueue.push(d.candidate); }
    });

    socket.on('call_ended', function(d) {
        if (!d) return;
        // Dismiss pending incoming notification if caller hung up before we answered
        if (_webrtcIncomingCallData && _webrtcIncomingCallData.callId === d.callId) {
            _webrtcRemoveNotif();
            _webrtcIncomingCallData = null;
            if (_webrtcIncomingTimeout) { clearTimeout(_webrtcIncomingTimeout); _webrtcIncomingTimeout = null; }
            if (typeof showToast === 'function') showToast('Chiamata annullata', 'info');
            return;
        }
        if (d.callId !== _webrtcCallId) return;
        if (typeof showToast === 'function') showToast('Chiamata terminata dall\'altro utente', 'info');
        endCall();
    });
}

// ---- Section 9: Auto-init signaling ----
function _webrtcCheckAndInitSignaling() {
    if (window._commSocket) { _webrtcInitSignaling(); return; }
    // Retry multiple times with increasing delay
    var attempts = [500, 1000, 2000, 5000];
    attempts.forEach(function(delay) {
        setTimeout(function() {
            if (window._commSocket && !window._webrtcSignalingReady) {
                _webrtcInitSignaling();
                window._webrtcSignalingReady = true;
            }
        }, delay);
    });
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _webrtcCheckAndInitSignaling);
    else _webrtcCheckAndInitSignaling();
}
