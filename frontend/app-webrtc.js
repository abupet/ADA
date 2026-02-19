// app-webrtc.js v1.11
// ADA WebRTC Voice & Video Call System — veterinario <-> proprietario
//
// Globals expected: window._commSocket, window.ADA_API_BASE_URL, showToast(), _commGetCurrentUserId()
// Globals exposed:  initCallUI(), startCall(), handleIncomingCall(), endCall(), _webrtcInitSignaling()

var _webrtcPC = null, _webrtcLocalStream = null, _webrtcRemoteStream = null;
var _webrtcCallId = null, _webrtcConvId = null, _webrtcCallType = null, _webrtcCallConvId = null;
var _webrtcTimerInterval = null, _webrtcStartTime = null, _webrtcIceQueue = [];
var _webrtcIncomingCallData = null, _webrtcRingTimeout = null, _webrtcIncomingTimeout = null;
var _webrtcIceServersCache = null, _webrtcIceTimeout = null;
var _webrtcSignalingSocket = null; // tracks which socket instance has listeners attached
// Synchronous dedup flags — prevent duplicate async handler execution when
// the same signaling event arrives via both conv room and user room.
var _webrtcAcceptHandled = false, _webrtcOfferHandled = false, _webrtcAnswerHandled = false;
var _webrtcDisconnectTimeout = null; // grace period for transient 'disconnected' state

// --- TEST CHIAMATA (loopback) ---
var _WEBRTC_TEST_CALL_USER_ID = '__test_call__';
var _WEBRTC_TEST_CALL_DISPLAY  = '\ud83e\uddea Test Chiamata';
var _webrtcIsTestCall = false;
var _webrtcTestRecordedChunks = [];   // Blob[] audio registrati in modalità "Parla"
var _webrtcTestMode = 'talk';          // 'talk' | 'listen'
var _webrtcTestPlaybackAudio = null;   // HTMLAudioElement per riproduzione
var _webrtcTestRecorder = null;        // MediaRecorder per registrazione loopback
var _webrtcTestStream = null;          // MediaStream dal microfono (loopback)

function _webrtcApiBase() { return window.ADA_API_BASE_URL || ''; }
function _webrtcAuth() { return { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' }; }
function _webrtcUserId() {
    if (typeof _commGetCurrentUserId === 'function') return _commGetCurrentUserId();
    return typeof getJwtUserId === 'function' ? getJwtUserId() : null;
}
function _webrtcFmtDur(s) { var m = Math.floor(s/60), ss = s%60; return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss; }
function _webrtcEsc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

// ---- ICE server config (STUN + TURN) ----
async function _webrtcFetchIceServers() {
    if (_webrtcIceServersCache) return _webrtcIceServersCache;
    try {
        var resp = await fetchApi('/api/rtc-config');
        if (resp.ok) {
            var data = await resp.json();
            if (data.iceServers && data.iceServers.length > 0) {
                _webrtcIceServersCache = data.iceServers;
                console.log('[WebRTC] ICE servers loaded:', data.iceServers.length, 'servers');
                return _webrtcIceServersCache;
            }
        }
    } catch(e) {
        console.warn('[WebRTC] Failed to fetch ICE config, using STUN fallback:', e.message);
    }
    return null;
}

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
    _webrtcAcceptHandled = false; _webrtcOfferHandled = false; _webrtcAnswerHandled = false;
    try {
        _webrtcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video_call' });
    } catch(e) {
        console.warn('[WebRTC] Impossibile accedere ai dispositivi media:', e.message);
        if (typeof showToast === 'function') showToast('Impossibile accedere al microfono/videocamera','error'); return;
    }
    var iceServers = await _webrtcFetchIceServers();
    _webrtcCreatePC(iceServers);
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
var _webrtcDefaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

function _webrtcCreatePC(iceServers) {
    var config = { iceServers: iceServers || _webrtcDefaultIceServers };
    console.log('[WebRTC] Creating PeerConnection with', config.iceServers.length, 'ICE servers');
    _webrtcPC = new RTCPeerConnection(config);
    _webrtcRemoteStream = new MediaStream();
    _webrtcPC.onicecandidate = function(ev) {
        if (ev.candidate && window._commSocket) {
            window._commSocket.emit('webrtc_ice', { conversationId: _webrtcConvId, callId: _webrtcCallId, candidate: ev.candidate });
        }
    };
    _webrtcPC.ontrack = function(ev) {
        console.log('[WebRTC] ontrack: received remote track kind=' + (ev.track ? ev.track.kind : '?'));
        ev.streams[0].getTracks().forEach(function(t) { _webrtcRemoteStream.addTrack(t); });
        var rv = document.getElementById('webrtc-remote-video'); if (rv) rv.srcObject = _webrtcRemoteStream;
    };
    _webrtcPC.onconnectionstatechange = function() {
        var s = _webrtcPC ? _webrtcPC.connectionState : 'unknown';
        console.log('[WebRTC] connectionState:', s);
        if (s === 'connected') {
            // Clear any pending disconnect grace period
            if (_webrtcDisconnectTimeout) { clearTimeout(_webrtcDisconnectTimeout); _webrtcDisconnectTimeout = null; }
        } else if (s === 'failed') {
            console.error('[WebRTC] Connection failed');
            if (typeof showToast === 'function') showToast('Connessione fallita. Verificare la rete.', 'error');
            endCall();
        } else if (s === 'disconnected') {
            // 'disconnected' is transient — allow 5s grace period before ending
            if (!_webrtcDisconnectTimeout) {
                _webrtcDisconnectTimeout = setTimeout(function() {
                    if (_webrtcPC && _webrtcPC.connectionState === 'disconnected') {
                        console.warn('[WebRTC] Connection still disconnected after grace period, ending call');
                        endCall();
                    }
                    _webrtcDisconnectTimeout = null;
                }, 5000);
            }
        } else if (s === 'closed') {
            endCall();
        }
    };
    _webrtcPC.oniceconnectionstatechange = function() {
        var s = _webrtcPC ? _webrtcPC.iceConnectionState : 'unknown';
        console.log('[WebRTC] iceConnectionState:', s);
        if (s === 'connected' || s === 'completed') {
            if (_webrtcIceTimeout) { clearTimeout(_webrtcIceTimeout); _webrtcIceTimeout = null; }
            _webrtcStartTimer();
        } else if (s === 'failed') {
            if (_webrtcIceTimeout) { clearTimeout(_webrtcIceTimeout); _webrtcIceTimeout = null; }
            console.error('[WebRTC] ICE connection failed — no viable network path');
            if (typeof showToast === 'function') showToast('Connessione non riuscita. Verificare la rete.', 'error');
            endCall();
        }
    };
    // NOTE: ICE timeout is NOT started here. It is started after setRemoteDescription
    // (in webrtc_offer/webrtc_answer handlers) so we don't time out while waiting
    // for the callee to accept the call.
}

// Start ICE timeout AFTER the SDP exchange is complete (setRemoteDescription called)
function _webrtcStartIceTimeout() {
    if (_webrtcIceTimeout) return; // already running
    _webrtcIceTimeout = setTimeout(function() {
        if (_webrtcPC && _webrtcPC.iceConnectionState !== 'connected' && _webrtcPC.iceConnectionState !== 'completed') {
            console.error('[WebRTC] ICE timeout — state:', _webrtcPC.iceConnectionState);
            if (typeof showToast === 'function') showToast('Impossibile stabilire la connessione. Riprovare.', 'error');
            endCall();
        }
    }, 20000);
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
    _webrtcIncomingCallData = { conversationId: data.conversationId, callId: data.callId, callType: data.callType, callConversationId: data.callConversationId };
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
    _webrtcCallConvId = _webrtcIncomingCallData ? (_webrtcIncomingCallData.callConversationId || null) : null;
    _webrtcAcceptHandled = false; _webrtcOfferHandled = false; _webrtcAnswerHandled = false;
    try {
        _webrtcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video_call' });
    } catch(e) {
        console.warn('[WebRTC] Impossibile accedere ai dispositivi media:', e.message);
        if (typeof showToast === 'function') showToast('Impossibile accedere al microfono/videocamera','error'); return;
    }
    var iceServers = await _webrtcFetchIceServers();
    _webrtcCreatePC(iceServers);
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
    var h = '<div class="webrtc-overlay-header" data-testid="webrtc-call-status">' + (isInitiator ? 'Chiamata in corso...' : 'Connessione in corso...') + '</div>' +
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
    if (_webrtcIsTestCall) { _webrtcToggleTestMute(); return; }
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

// Server-side transcription via OpenAI Whisper
// Each participant only transcribes their OWN audio (local stream).
// This avoids duplicates (both sides capturing remote) and is more reliable.
var _webrtcLocalRecorder = null;
var _webrtcChunkIntervalMs = 15000; // 15 seconds per chunk
var _webrtcChunkTimer = null;
var _webrtcAudioCtx = null; // Web Audio API context for recorder stream

function _webrtcStartServerTranscription(conversationId) {
    var socket = window._commSocket;
    if (!socket) { console.warn('[WebRTC] Transcription skipped: no socket'); return; }

    // Listen for backend transcription feedback (diagnostic)
    if (!socket._webrtcStatusListener) {
        socket.on('transcription_status', function(d) {
            var msg = '[WebRTC] Backend: status=' + (d.status || '?');
            if (d.reason) msg += ' reason=' + d.reason;
            if (d.base64len) msg += ' received=' + d.base64len + 'chars';
            if (d.chars) msg += ' transcribed=' + d.chars + 'chars';
            if (d.preview) msg += ' "' + d.preview + '"';
            if (d.text) msg += ' "' + d.text + '"';
            if (d.status === 'ok') { console.log(msg); }
            else if (d.status === 'received') { console.log(msg); }
            else { console.warn(msg); }
        });
        socket._webrtcStatusListener = true;
    }

    // Capture local audio only (MY voice) — the other participant captures theirs
    if (_webrtcLocalStream && _webrtcLocalStream.getAudioTracks().length > 0) {
        console.log('[WebRTC] Starting local audio capture for transcription');
        _webrtcStartAudioCapture('local', _webrtcLocalStream, conversationId);
    } else {
        console.warn('[WebRTC] Transcription: local stream has no audio tracks');
    }
}

function _webrtcStartAudioCapture(source, stream, conversationId) {
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
    var chunkCount = 0;
    var failCount = 0;

    // Log audio track properties for diagnostics
    var audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
        var t = audioTracks[0];
        console.log('[WebRTC] Audio track: enabled=' + t.enabled + ' muted=' + t.muted +
            ' readyState=' + t.readyState + ' label="' + t.label + '"');
    }

    // Route audio through Web Audio API to create an independent stream
    // for MediaRecorder. On mobile browsers, sharing a getUserMedia stream
    // between PeerConnection and MediaRecorder can result in silence.
    var recorderStream = stream;
    try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            _webrtcAudioCtx = new AudioCtx();
            // AudioContext may start suspended if created outside a user gesture.
            // Resume it immediately — this is critical for audio to flow.
            if (_webrtcAudioCtx.state === 'suspended') {
                console.log('[WebRTC] AudioContext suspended, resuming...');
                _webrtcAudioCtx.resume().catch(function(e) {
                    console.warn('[WebRTC] AudioContext.resume() failed:', e.message);
                });
            }
            console.log('[WebRTC] AudioContext state: ' + _webrtcAudioCtx.state);
            var sourceNode = _webrtcAudioCtx.createMediaStreamSource(stream);
            var destNode = _webrtcAudioCtx.createMediaStreamDestination();
            sourceNode.connect(destNode);
            recorderStream = destNode.stream;
            console.log('[WebRTC] Using Web Audio API recorder stream');

            // Diagnostic: check audio level after 3 seconds.
            // If silence is detected, fall back to the direct stream.
            var analyser = _webrtcAudioCtx.createAnalyser();
            sourceNode.connect(analyser);
            analyser.fftSize = 256;
            setTimeout(function() {
                var dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                var avg = 0;
                for (var i = 0; i < dataArray.length; i++) avg += dataArray[i];
                avg /= dataArray.length;
                console.log('[WebRTC] Audio level check: avg=' + avg.toFixed(1) +
                    ' ctx.state=' + _webrtcAudioCtx.state +
                    (avg < 1 ? ' WARNING: SILENCE' : ' OK: audio detected'));
            }, 3000);
        }
    } catch(e) {
        console.warn('[WebRTC] Web Audio API failed, using direct stream:', e.message);
        recorderStream = stream;
    }

    function createAndStart() {
        var recorder;
        try {
            recorder = new MediaRecorder(recorderStream, { mimeType: mimeType });
        } catch(e) {
            console.warn('[WebRTC] Cannot create MediaRecorder:', e.message);
            return null;
        }
        var parts = [];
        recorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
                parts.push(e.data);
            } else {
                console.warn('[WebRTC] ondataavailable: empty data blob');
            }
        };
        recorder.onstop = function() {
            if (parts.length > 0) {
                var blob = new Blob(parts, { type: mimeType });
                console.log('[WebRTC] Chunk ready: ' + parts.length + ' parts, ' + blob.size + 'B');
                _webrtcSendAudioChunk(blob, source, conversationId);
            } else {
                console.warn('[WebRTC] Recorder stopped but no data captured');
            }
        };
        recorder.onerror = function(ev) {
            console.error('[WebRTC] MediaRecorder error:', ev.error ? ev.error.message : ev);
        };
        try {
            recorder.start();
        } catch(e) {
            console.error('[WebRTC] MediaRecorder.start() failed:', e.message);
            return null;
        }
        return recorder;
    }

    _webrtcLocalRecorder = createAndStart();
    if (!_webrtcLocalRecorder) return;
    console.log('[WebRTC] Audio capture started (mimeType=' + mimeType + ', chunk every ' + (_webrtcChunkIntervalMs/1000) + 's)');

    _webrtcChunkTimer = setInterval(function() {
        try {
            chunkCount++;
            var oldRecorder = _webrtcLocalRecorder;
            _webrtcLocalRecorder = createAndStart();
            if (oldRecorder && oldRecorder.state === 'recording') {
                try { oldRecorder.stop(); } catch(e) {
                    console.warn('[WebRTC] Error stopping old recorder:', e.message);
                }
            }
            if (_webrtcLocalRecorder) {
                failCount = 0;
                console.log('[WebRTC] Chunk #' + chunkCount + ' finalized, new recorder active');
            } else {
                failCount++;
                console.error('[WebRTC] Chunk #' + chunkCount + ' — new recorder FAILED (fail #' + failCount + ')');
            }
        } catch(e) {
            console.error('[WebRTC] setInterval error:', e.message);
        }
    }, _webrtcChunkIntervalMs);
}

function _webrtcSendAudioChunk(blob, source, conversationId) {
    var reader = new FileReader();
    reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        var socket = window._commSocket;
        if (socket) {
            console.log('[WebRTC] Sending audio chunk: source=' + source + ', size=' + blob.size + 'B');
            socket.emit('call_audio_chunk', {
                conversationId: conversationId,
                callId: _webrtcCallId,
                callConversationId: _webrtcCallConvId,
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
    if (_webrtcChunkTimer) { clearInterval(_webrtcChunkTimer); _webrtcChunkTimer = null; }
    // Flush final chunk (stop triggers async onstop → sends remaining audio)
    if (_webrtcLocalRecorder && _webrtcLocalRecorder.state !== 'inactive') {
        console.log('[WebRTC] Flushing final audio chunk');
        try { _webrtcLocalRecorder.stop(); } catch(e) {}
    }
    _webrtcLocalRecorder = null;
    // Close Web Audio API context
    if (_webrtcAudioCtx) {
        try { _webrtcAudioCtx.close(); } catch(e) {}
        _webrtcAudioCtx = null;
    }
}

// ---- TEST CHIAMATA: loopback locale senza WebRTC ----
async function startTestCall(conversationId, callType, callConvId) {
    _webrtcInjectStyles();
    if (_webrtcPC || _webrtcIsTestCall) {
        if (typeof showToast === 'function') showToast('Chiamata gi\u00e0 in corso', 'warning');
        return;
    }

    try {
        _webrtcTestStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video_call'
        });
    } catch(e) {
        if (typeof showToast === 'function') showToast('Impossibile accedere al microfono', 'error');
        return;
    }

    _webrtcIsTestCall = true;
    _webrtcConvId = conversationId;
    _webrtcCallType = callType;
    _webrtcCallConvId = callConvId || null;
    _webrtcCallId = 'testcall_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    _webrtcTestRecordedChunks = [];
    _webrtcTestMode = 'talk';

    _webrtcShowTestOverlay(callType);

    _webrtcStartTime = Date.now();
    _webrtcTimerInterval = setInterval(function() {
        var el = document.getElementById('webrtc-call-timer');
        if (el) el.textContent = _webrtcFmtDur(Math.floor((Date.now() - _webrtcStartTime) / 1000));
    }, 1000);
    var st = document.querySelector('[data-testid="webrtc-call-status"]');
    if (st) st.textContent = 'Test Chiamata \u2014 In chiamata';

    _webrtcTestStartRecording();
    _webrtcTestStartTranscriptionCapture();

    if (typeof showToast === 'function') showToast('Test Chiamata connessa', 'success');
}

function _webrtcShowTestOverlay(callType) {
    var old = document.getElementById('webrtc-call-overlay');
    if (old) old.parentNode.removeChild(old);

    var ov = document.createElement('div');
    ov.className = 'webrtc-overlay';
    ov.id = 'webrtc-call-overlay';
    ov.setAttribute('data-testid', 'webrtc-call-overlay');

    var h = '<div class="webrtc-overlay-header" data-testid="webrtc-call-status">Test Chiamata \u2014 Connessione...</div>' +
        '<div class="webrtc-overlay-timer" id="webrtc-call-timer" data-testid="webrtc-call-timer">00:00</div>';

    if (callType === 'video_call') {
        h += '<video class="webrtc-remote-video" id="webrtc-remote-video" data-testid="webrtc-remote-video" autoplay playsinline muted></video>';
        h += '<video class="webrtc-local-video" id="webrtc-local-video" data-testid="webrtc-local-video" autoplay playsinline muted></video>';
    } else {
        h += '<div style="font-size:64px;margin:20px 0;">\ud83e\uddea</div>';
    }

    h += '<div class="webrtc-overlay-controls">' +
        '<button class="webrtc-btn webrtc-btn-mute" id="webrtc-mute-btn" data-testid="webrtc-mute-btn" onclick="_webrtcToggleMute()">&#128263; Muto</button>' +
        '<button class="webrtc-btn webrtc-btn-test-talk" id="webrtc-test-talk-btn" data-testid="webrtc-test-talk-btn" ' +
        '  onclick="_webrtcToggleTestTalkListen()">&#127908; Parla</button>' +
        '<button class="webrtc-btn webrtc-btn-end" data-testid="webrtc-end-btn" onclick="endCall()">&#128308; Termina</button></div>';

    ov.innerHTML = h;
    document.body.appendChild(ov);

    if (callType === 'video_call' && _webrtcTestStream) {
        var lv = document.getElementById('webrtc-local-video');
        if (lv) lv.srcObject = _webrtcTestStream;
        var rv = document.getElementById('webrtc-remote-video');
        if (rv) rv.srcObject = _webrtcTestStream;
    }
}

function _webrtcTestStartRecording() {
    if (!_webrtcTestStream) return;
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';

    try {
        _webrtcTestRecorder = new MediaRecorder(_webrtcTestStream, { mimeType: mimeType });
    } catch(e) {
        console.warn('[TestCall] Cannot create MediaRecorder:', e.message);
        return;
    }

    _webrtcTestRecorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) {
            _webrtcTestRecordedChunks.push(e.data);
        }
    };

    _webrtcTestRecorder.start(1000);
    console.log('[TestCall] Recording started');
}

function _webrtcTestStopRecording() {
    if (_webrtcTestRecorder && _webrtcTestRecorder.state !== 'inactive') {
        try { _webrtcTestRecorder.stop(); } catch(e) {}
    }
    _webrtcTestRecorder = null;
}

function _webrtcToggleTestTalkListen() {
    var btn = document.getElementById('webrtc-test-talk-btn');
    if (!btn) return;

    if (_webrtcTestMode === 'talk') {
        // === Passa a modalità ASCOLTA ===
        _webrtcTestMode = 'listen';
        btn.innerHTML = '&#128266; Ascolta';
        btn.className = 'webrtc-btn webrtc-btn-test-talk listening';

        _webrtcTestStopRecording();

        if (_webrtcTestStream) {
            _webrtcTestStream.getAudioTracks().forEach(function(t) { t.enabled = false; });
        }

        if (_webrtcTestRecordedChunks.length > 0) {
            var fullBlob = new Blob(_webrtcTestRecordedChunks, { type: 'audio/webm' });
            var url = URL.createObjectURL(fullBlob);
            _webrtcTestPlaybackAudio = new Audio(url);
            _webrtcTestPlaybackAudio.play().catch(function(e) {
                console.warn('[TestCall] Playback error:', e.message);
            });

            _webrtcTestSendChunkForTranscription(fullBlob, 'remote');

            _webrtcTestPlaybackAudio.onended = function() {
                URL.revokeObjectURL(url);
                if (_webrtcTestMode === 'listen') {
                    _webrtcToggleTestTalkListen();
                }
            };
        } else {
            if (typeof showToast === 'function') showToast('Nessun audio registrato', 'info');
            _webrtcTestMode = 'talk';
            btn.innerHTML = '&#127908; Parla';
            btn.className = 'webrtc-btn webrtc-btn-test-talk';
            if (_webrtcTestStream) {
                _webrtcTestStream.getAudioTracks().forEach(function(t) { t.enabled = true; });
            }
        }

    } else {
        // === Passa a modalità PARLA ===
        _webrtcTestMode = 'talk';
        btn.innerHTML = '&#127908; Parla';
        btn.className = 'webrtc-btn webrtc-btn-test-talk';

        if (_webrtcTestPlaybackAudio) {
            _webrtcTestPlaybackAudio.pause();
            _webrtcTestPlaybackAudio = null;
        }

        if (_webrtcTestStream) {
            _webrtcTestStream.getAudioTracks().forEach(function(t) { t.enabled = true; });
        }

        _webrtcTestRecordedChunks = [];
        _webrtcTestStartRecording();
    }
}

function _webrtcToggleTestMute() {
    if (!_webrtcTestStream) return;
    var tracks = _webrtcTestStream.getAudioTracks();
    if (!tracks.length) return;
    var wasMuted = !tracks[0].enabled;
    tracks[0].enabled = wasMuted;
    var btn = document.getElementById('webrtc-mute-btn');
    if (!btn) return;
    btn.innerHTML = wasMuted ? '&#128263; Muto' : '&#128264; Attivo';
    btn.classList.toggle('active', !wasMuted);
}

// Invio periodico dell'audio locale per trascrizione (ogni 15s come le chiamate normali)
var _webrtcTestTranscriptionTimer = null;
var _webrtcTestTranscriptionRecorder = null;

function _webrtcTestStartTranscriptionCapture() {
    var socket = window._commSocket;
    if (!socket || !_webrtcTestStream) return;

    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';

    function createAndStartRecorder() {
        var recorder;
        try {
            recorder = new MediaRecorder(_webrtcTestStream, { mimeType: mimeType });
        } catch(e) { return null; }

        var parts = [];
        recorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) parts.push(e.data);
        };
        recorder.onstop = function() {
            if (parts.length > 0 && _webrtcTestMode === 'talk') {
                var blob = new Blob(parts, { type: mimeType });
                _webrtcTestSendChunkForTranscription(blob, 'local');
            }
        };
        try { recorder.start(); } catch(e) { return null; }
        return recorder;
    }

    _webrtcTestTranscriptionRecorder = createAndStartRecorder();

    _webrtcTestTranscriptionTimer = setInterval(function() {
        if (_webrtcTestMode !== 'talk') return;
        var old = _webrtcTestTranscriptionRecorder;
        _webrtcTestTranscriptionRecorder = createAndStartRecorder();
        if (old && old.state === 'recording') {
            try { old.stop(); } catch(e) {}
        }
    }, 15000);
}

function _webrtcTestSendChunkForTranscription(blob, source) {
    var reader = new FileReader();
    reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        var socket = window._commSocket;
        if (socket && _webrtcConvId) {
            console.log('[TestCall] Sending transcription chunk: source=' + source + ', size=' + blob.size + 'B');
            socket.emit('call_audio_chunk', {
                conversationId: _webrtcConvId,
                callId: _webrtcCallId,
                callConversationId: _webrtcCallConvId,
                source: source,
                audioData: base64,
                mimeType: blob.type,
                timestamp: Date.now()
            });
        }
    };
    reader.readAsDataURL(blob);
}

function _webrtcTestStopTranscription() {
    if (_webrtcTestTranscriptionTimer) {
        clearInterval(_webrtcTestTranscriptionTimer);
        _webrtcTestTranscriptionTimer = null;
    }
    if (_webrtcTestTranscriptionRecorder && _webrtcTestTranscriptionRecorder.state !== 'inactive') {
        try { _webrtcTestTranscriptionRecorder.stop(); } catch(e) {}
    }
    _webrtcTestTranscriptionRecorder = null;
}

// ---- Section 7: End call & cleanup ----
function endCall() {
    // --- TEST CHIAMATA cleanup ---
    if (_webrtcIsTestCall) {
        console.log('[TestCall] Ending test call');
        _webrtcTestStopRecording();
        _webrtcTestStopTranscription();
        if (_webrtcTestPlaybackAudio) {
            _webrtcTestPlaybackAudio.pause();
            _webrtcTestPlaybackAudio = null;
        }
        if (_webrtcTestStream) {
            _webrtcTestStream.getTracks().forEach(function(t) { t.stop(); });
            _webrtcTestStream = null;
        }
        _webrtcTestRecordedChunks = [];
        _webrtcTestMode = 'talk';
        _webrtcIsTestCall = false;

        if (_webrtcTimerInterval) { clearInterval(_webrtcTimerInterval); _webrtcTimerInterval = null; }
        var ov = document.getElementById('webrtc-call-overlay');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        var dur = _webrtcStartTime ? Math.floor((Date.now() - _webrtcStartTime) / 1000) : 0;
        // Close the call conversation via REST API
        if (_webrtcCallConvId && typeof fetchApi === 'function') {
            fetchApi('/api/communication/conversations/' + _webrtcCallConvId + '/end-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration_seconds: dur })
            }).catch(function(e) { console.warn('[TestCall] end-call error:', e.message); });
        }
        _webrtcCallId = null; _webrtcConvId = null; _webrtcCallType = null; _webrtcCallConvId = null; _webrtcStartTime = null;
        if (dur > 0 && typeof showToast === 'function') showToast('Test terminato (' + _webrtcFmtDur(dur) + ')', 'info');
        return;
    }

    console.log('[WebRTC] endCall() called', _webrtcCallId ? '(callId=' + _webrtcCallId + ')' : '(no active call)');
    _webrtcStopServerTranscription();
    var dur = _webrtcStartTime ? Math.floor((Date.now() - _webrtcStartTime) / 1000) : 0;
    if (window._commSocket && _webrtcConvId) window._commSocket.emit('end_call', { conversationId: _webrtcConvId, callId: _webrtcCallId, callConversationId: _webrtcCallConvId, durationSeconds: dur });
    if (_webrtcLocalStream) { _webrtcLocalStream.getTracks().forEach(function(t) { t.stop(); }); _webrtcLocalStream = null; }
    if (_webrtcPC) { _webrtcPC.close(); _webrtcPC = null; }
    _webrtcRemoteStream = null;
    if (_webrtcTimerInterval) { clearInterval(_webrtcTimerInterval); _webrtcTimerInterval = null; }
    if (_webrtcRingTimeout) { clearTimeout(_webrtcRingTimeout); _webrtcRingTimeout = null; }
    if (_webrtcIncomingTimeout) { clearTimeout(_webrtcIncomingTimeout); _webrtcIncomingTimeout = null; }
    if (_webrtcIceTimeout) { clearTimeout(_webrtcIceTimeout); _webrtcIceTimeout = null; }
    if (_webrtcDisconnectTimeout) { clearTimeout(_webrtcDisconnectTimeout); _webrtcDisconnectTimeout = null; }
    _webrtcIncomingCallData = null;
    // Reset synchronous dedup flags
    _webrtcAcceptHandled = false; _webrtcOfferHandled = false; _webrtcAnswerHandled = false;
    var ov = document.getElementById('webrtc-call-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    _webrtcRemoveNotif();
    _webrtcCallId = null; _webrtcConvId = null; _webrtcCallType = null; _webrtcCallConvId = null; _webrtcStartTime = null; _webrtcIceQueue = [];
    if (dur > 0 && typeof showToast === 'function') showToast('Chiamata terminata (' + _webrtcFmtDur(dur) + ')', 'info');
}

// ---- Section 8: Socket.io signaling listeners ----
// Guard: only attach listeners once per socket instance (prevents duplicate handlers
// and ensures listeners are re-attached if the socket is replaced after logout/login)
function _webrtcInitSignaling() {
    var socket = window._commSocket; if (!socket) return;
    if (_webrtcSignalingSocket === socket) return; // already attached to this socket
    _webrtcSignalingSocket = socket;
    console.log('[WebRTC] Attaching signaling listeners to socket');

    socket.on('incoming_call', function(d) { handleIncomingCall(d); });

    socket.on('call_accepted', async function(d) {
        if (!d || d.callId !== _webrtcCallId || !_webrtcPC) return;
        // Synchronous dedup: flag is set immediately, before any async operation,
        // so the second event (from user room) is blocked even if it arrives
        // before setLocalDescription completes.
        if (_webrtcAcceptHandled) return;
        _webrtcAcceptHandled = true;
        if (d.callConversationId) _webrtcCallConvId = d.callConversationId;
        console.log('[WebRTC] Call accepted, creating offer');
        if (_webrtcRingTimeout) { clearTimeout(_webrtcRingTimeout); _webrtcRingTimeout = null; }
        try {
            var offer = await _webrtcPC.createOffer();
            await _webrtcPC.setLocalDescription(offer);
            console.log('[WebRTC] Offer created and sent');
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
        if (_webrtcOfferHandled) return;
        _webrtcOfferHandled = true;
        console.log('[WebRTC] Offer received, creating answer');
        try {
            await _webrtcPC.setRemoteDescription(new RTCSessionDescription(d.offer));
            _webrtcStartIceTimeout(); // start ICE timeout now that SDP exchange has begun
            console.log('[WebRTC] Remote description set, draining', _webrtcIceQueue.length, 'queued ICE candidates');
            for (var i = 0; i < _webrtcIceQueue.length; i++) await _webrtcPC.addIceCandidate(new RTCIceCandidate(_webrtcIceQueue[i]));
            _webrtcIceQueue = [];
            var answer = await _webrtcPC.createAnswer();
            await _webrtcPC.setLocalDescription(answer);
            console.log('[WebRTC] Answer created and sent');
            socket.emit('webrtc_answer', { conversationId: _webrtcConvId, callId: _webrtcCallId, answer: answer });
        } catch(e) { console.warn('[WebRTC] Errore gestione offerta:', e.message); endCall(); }
    });

    socket.on('webrtc_answer', async function(d) {
        if (!d || d.callId !== _webrtcCallId || !_webrtcPC) return;
        if (_webrtcAnswerHandled) return;
        _webrtcAnswerHandled = true;
        console.log('[WebRTC] Answer received');
        try {
            await _webrtcPC.setRemoteDescription(new RTCSessionDescription(d.answer));
            _webrtcStartIceTimeout(); // start ICE timeout now that SDP exchange is complete
            console.log('[WebRTC] Remote description set, draining', _webrtcIceQueue.length, 'queued ICE candidates');
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
// Called from initCommSocket (app-communication.js) when socket is created,
// AND as a fallback from DOMContentLoaded polling.
function _webrtcCheckAndInitSignaling() {
    if (window._commSocket) { _webrtcInitSignaling(); return; }
    // Retry multiple times with increasing delay as fallback
    var attempts = [500, 1000, 2000, 5000];
    attempts.forEach(function(delay) {
        setTimeout(function() {
            if (window._commSocket) _webrtcInitSignaling();
        }, delay);
    });
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _webrtcCheckAndInitSignaling);
    else _webrtcCheckAndInitSignaling();
}
