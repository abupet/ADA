# ADA — Sistema di Debug Logging Avanzato

> **Versione:** 1.0 · **Data:** 07/02/2026  
> **Baseline codebase:** ADA v7.2.0 (ada-v6_12.2)  
> **Destinatario:** Claude Code per implementazione

---

## 0. Obiettivo

Progettare e implementare un sistema di logging strutturato che consenta **root-cause analysis rapida e precisa** per il bug fixing. Il sistema si concentra su tre aree critiche: **sincronizzazione offline/online**, **chiamate API** (backend e OpenAI) e **pipeline audio/AI**. Tutto il logging è condizionato al flag `debugLogEnabled` già esistente (toggle "Debug attivo per i test" nella pagina Impostazioni) per evitare qualsiasi impatto sulle performance in produzione. I log vengono scritti con timestamp nella chiave `ADA_LOG` di localStorage e scaricabili come `ADA.log`.

---

## 1. Stato attuale — Cosa esiste e cosa manca

### 1.1 Cosa esiste

**Frontend:**
- `logError(context, errorMessage)` in `app-core.js` (riga 1400): scrive su `ADA_LOG` in localStorage con timestamp, solo se `debugLogEnabled === true`. Emette anche `console.error`.
- `logDebug(context, message)` in `app-recording.js` (riga 1598): simile, con prefisso `DEBUG`. Serializza oggetti via JSON.stringify.
- ~50 `console.log/warn/error` sparsi in `app-recording.js`, `app-soap.js`, `app-documents.js`, `sync-engine.js` — la maggior parte **non** scrive su `ADA_LOG`, quindi il file esportato non li contiene.
- `ADAObservability` in `app-observability.js`: cattura errori unhandled, misura durata page view, monkey-patcha `fetchApi` per metriche API aggregate (count, avgMs, errori). Accumula in buffer e fluscia ogni 30s al backend. Non scrive su `ADA_LOG`.
- Pagina Debug (`page-debug` in `index.html`): pulsanti "Scarica ADA.log" e "Cancella ADA.log".

**Backend:**
- `console.error` su ogni catch di route (~60 occorrenze in `server.js`, `promo.routes.js`, `admin.routes.js`, `dashboard.routes.js`, `documents.routes.js`, `pets.routes.js`).
- `auditLogMiddleware` in `server.js` (riga 230): logga ogni richiesta mutante (`POST/PATCH/PUT/DELETE`) nella tabella `audit_log` con `who`, `action`, `outcome`, `duration_ms`, `ip`, `user_agent`. Fire-and-forget.
- Nessun correlation ID tra frontend e backend.
- Nessun logging strutturato (è tutto `console.error("route name", e)`).

### 1.2 Cosa manca

| Area | Gap |
|------|-----|
| **Correlation ID** | Frontend e backend non condividono un ID per correlare una richiesta all'azione utente che l'ha generata |
| **Sync engine** | I `console.warn` per conflitti e errori non finiscono in `ADA_LOG`. Non si logga: cosa c'è in outbox, cosa viene pushato/pullato, quante operazioni accepted/rejected, motivi dei reject |
| **API OpenAI** | Non si logga: quale endpoint, latenza, token usati, status code, motivo fallback, retry attempt count, dimensione audio/payload |
| **Recording pipeline** | I `console.log` sono verbosi ma volatili (solo console). Mancano: correlazione chunk → trascrizione → SOAP, tempo per step, motivo di ogni fallback |
| **Documents AI** | Non si logga: quale doc → quale operazione AI → latenza → esito. I fallback (PDF → image_url) non sono tracciati |
| **Promo** | Nessun log client-side dell'intero ciclo: request → eligibility → explanation → render → evento utente |
| **fetchApi** | Il monkey-patch di `ADAObservability` cattura metriche aggregate ma non logga i singoli errori (status, body) su `ADA_LOG` |
| **Dimensione ADA_LOG** | Nessuna rotazione — se debugLogEnabled è on per settimane, localStorage può saturarsi |
| **Backend strutturato** | Nessun format standard. Il `console.error` non include né correlation ID né payload utili per il debug |

---

## 2. Architettura del nuovo sistema

### 2.1 Principi

1. **Tutto condizionato a `debugLogEnabled`.** Se `false`, nessuna riga di log viene scritta, nessun overhead. L'unica eccezione è `logError` per errori critici (che rimane com'è).
2. **Singolo punto di scrittura:** tutte le funzioni di logging convergono su `_writeLog(level, domain, message, data)` che scrive su `ADA_LOG` in localStorage.
3. **Struttura coerente:** ogni riga ha formato fisso leggibile sia da umano che da grep/regex.
4. **Correlation ID:** generato all'inizio di ogni "operazione utente" (click registra, click genera SOAP, sync push, etc.) e propagato come header `X-Correlation-Id` a tutte le chiamate API associate.
5. **Rotazione automatica:** quando `ADA_LOG` supera una soglia (500 KB), troncare dalla testa mantenendo le ultime 400 KB.
6. **Nessun dato sensibile nei log:** mai nomi pazienti, contenuto trascrizioni, token JWT, API key. Solo ID, metriche, errori, nomi di endpoint.

### 2.2 Formato di una riga di log

```
[2026-02-07 14:32:05.123] [LEVEL] [DOMAIN] [corrId] message | {json_data}
```

- **Timestamp:** ISO locale con millisecondi (`toLocaleString('it-IT')` + `.SSS`)
- **LEVEL:** `ERR`, `WARN`, `INFO`, `DBG`, `PERF`
- **DOMAIN:** identificativo del sottosistema (vedi §2.3)
- **corrId:** correlation ID (8 char hex), oppure `--------` se non presente
- **message:** testo libero, max 200 char
- **json_data:** opzionale, oggetto chiave-valore serializzato su una riga

Esempio reale:
```
[07/02/2026, 14:32:05.123] [PERF] [OPENAI] [a3f8c21b] Whisper transcription completed | {"endpoint":"audio/transcriptions","latencyMs":3420,"audioSizeKb":1240,"status":200,"attempt":1}
[07/02/2026, 14:32:05.456] [ERR] [SYNC] [--------] Push failed: HTTP 409 | {"opsPushed":3,"rejected":1,"reason":"version_conflict","entityType":"pet","entityId":"pet-abc123"}
```

### 2.3 Domini di log

| Dominio | Copertura |
|---------|-----------|
| `CORE` | Navigazione pagine, lifecycle app, ruolo attivo, login/logout |
| `API` | Tutte le chiamate `fetchApi`: path, method, status, durata, errori |
| `OPENAI` | Tutte le interazioni OpenAI: Whisper, Chat, TTS, Document Read/Explain. Latenza, token, status, fallback |
| `SYNC` | Sync engine: push, pull, conflitti, outbox status, migration, auto-sync trigger |
| `REC` | Recording pipeline: start/stop, chunk lifecycle, duration, audio size, pipeline step |
| `SOAP` | Generazione SOAP: structured → fallback → ultra fallback, latenza, esito |
| `DOC` | Documenti: upload, AI read, AI explain, status polling, fallback PDF→image |
| `PROMO` | Promo: recommendation request, eligibility result, explanation source, render, user action |
| `TTS` | Text-to-speech: request, latenza, esito |
| `IDB` | IndexedDB: open, migration, errori transazione |

---

## 3. Implementazione frontend

### 3.1 Nuovo modulo: `docs/app-debug-logger.js`

Creare un nuovo file `app-debug-logger.js` caricato **subito dopo `config.js`** e **prima di tutti gli altri `app-*.js`** in `index.html`. Questo modulo sostituisce e centralizza `logError` e `logDebug`.

```javascript
// app-debug-logger.js v1.0
// Centralized debug logging for ADA — writes to localStorage ADA_LOG
// Active ONLY when debugLogEnabled === true (toggle in Settings page)

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var LOG_KEY = 'ADA_LOG';
    var MAX_LOG_BYTES = 500 * 1024; // 500 KB
    var TRIM_TO_BYTES = 400 * 1024; // Trim to 400 KB keeping tail
    var _correlationId = null;

    // =========================================================================
    // Correlation ID
    // =========================================================================

    /**
     * Generate a new 8-char hex correlation ID.
     * Call at the start of each user-initiated operation.
     * Returns the new ID.
     */
    function beginCorrelation(label) {
        var arr = new Uint8Array(4);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(arr);
        } else {
            for (var i = 0; i < 4; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        _correlationId = Array.from(arr, function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
        _writeLog('INFO', 'CORE', 'Begin operation: ' + (label || 'unnamed'), null);
        return _correlationId;
    }

    function endCorrelation() {
        _correlationId = null;
    }

    function getCorrelationId() {
        return _correlationId;
    }

    // =========================================================================
    // Core write function
    // =========================================================================

    function _isEnabled() {
        return (typeof debugLogEnabled !== 'undefined' && debugLogEnabled === true);
    }

    /**
     * Central log writer.
     * @param {string} level - ERR, WARN, INFO, DBG, PERF
     * @param {string} domain - CORE, API, OPENAI, SYNC, REC, SOAP, DOC, PROMO, TTS, IDB
     * @param {string} message - Human-readable description (max ~200 chars)
     * @param {object|null} data - Optional structured data (will be JSON.stringified)
     */
    function _writeLog(level, domain, message, data) {
        // ERR level always writes (even if debug off) — preserves current logError behavior
        if (level !== 'ERR' && !_isEnabled()) return;

        try {
            var now = new Date();
            var ts = now.toLocaleString('it-IT', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            var ms = ('00' + now.getMilliseconds()).slice(-3);
            var corrId = _correlationId || '--------';

            var entry = '[' + ts + '.' + ms + '] '
                + '[' + level + '] '
                + '[' + domain + '] '
                + '[' + corrId + '] '
                + message;

            if (data !== null && data !== undefined) {
                try {
                    var json = JSON.stringify(data);
                    if (json && json !== '{}') {
                        entry += ' | ' + json;
                    }
                } catch (e) {
                    entry += ' | [serialize_error]';
                }
            }

            entry += '\n';

            var existing = localStorage.getItem(LOG_KEY) || '';

            // Rotation check
            if ((existing.length + entry.length) > MAX_LOG_BYTES) {
                // Trim from head, keep tail
                var cutPoint = existing.length - TRIM_TO_BYTES;
                if (cutPoint > 0) {
                    // Find first newline after cut point to avoid partial lines
                    var nlPos = existing.indexOf('\n', cutPoint);
                    existing = (nlPos !== -1)
                        ? '[...log troncato...]\n' + existing.substring(nlPos + 1)
                        : '';
                }
            }

            localStorage.setItem(LOG_KEY, existing + entry);

            // Mirror to console in dev
            if (level === 'ERR') {
                console.error('[ADA] [' + domain + '] ' + message, data || '');
            } else if (level === 'WARN') {
                console.warn('[ADA] [' + domain + '] ' + message, data || '');
            }
        } catch (e) {
            // localStorage full or other error — silently drop
        }
    }

    // =========================================================================
    // Public logging functions (domain-agnostic)
    // =========================================================================

    function logErr(domain, message, data) { _writeLog('ERR', domain, message, data); }
    function logWarn(domain, message, data) { _writeLog('WARN', domain, message, data); }
    function logInfo(domain, message, data) { _writeLog('INFO', domain, message, data); }
    function logDbg(domain, message, data) { _writeLog('DBG', domain, message, data); }
    function logPerf(domain, message, data) { _writeLog('PERF', domain, message, data); }

    // =========================================================================
    // Backward compat: replace global logError and logDebug
    // =========================================================================

    // These replace the functions in app-core.js and app-recording.js.
    // Since this script loads first, the old definitions will be overwritten.
    // The old functions had the same guard (debugLogEnabled) so behavior is preserved.

    global.logError = function (context, errorMessage) {
        logErr('CORE', context + ': ' + errorMessage, null);
    };

    global.logDebug = function (context, message) {
        var msg = message;
        if (typeof msg !== 'string') {
            try { msg = JSON.stringify(msg); } catch (e) { msg = String(msg); }
        }
        logDbg('CORE', context + ': ' + msg, null);
    };

    // =========================================================================
    // Expose public API
    // =========================================================================

    global.ADALog = {
        err: logErr,
        warn: logWarn,
        info: logInfo,
        dbg: logDbg,
        perf: logPerf,
        beginCorrelation: beginCorrelation,
        endCorrelation: endCorrelation,
        getCorrelationId: getCorrelationId
    };

})(typeof window !== 'undefined' ? window : this);
```

**Registrare in `index.html`:**
```html
<script src="config.js"></script>
<script src="app-debug-logger.js"></script>  <!-- NUOVO: subito dopo config.js -->
<script src="app-core.js"></script>
<!-- ... rest ... -->
```

### 3.2 Rimuovere le vecchie definizioni

- **`app-core.js`:** rimuovere il body della funzione `logError` (righe 1400-1416). Lasciare solo un commento `// Moved to app-debug-logger.js — global.logError is defined there`.
- **`app-recording.js`:** rimuovere il body di `logDebug` (righe 1598-1614). Stesso commento.
- Non cambiare le firme: le chiamate esistenti `logError(context, msg)` e `logDebug(context, msg)` continuano a funzionare identiche.

---

## 4. Strumentazione per area

### 4.1 fetchApi — Logging di ogni chiamata API

**File:** `docs/config.js` — Modificare `fetchApi` per loggare inizio, fine e errori.

```javascript
async function fetchApi(path, options = {}) {
    var headers = new Headers((options || {}).headers || {});
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);

    // Correlation ID propagation
    if (typeof ADALog !== 'undefined' && ADALog.getCorrelationId()) {
        headers.set('X-Correlation-Id', ADALog.getCorrelationId());
    }

    var method = (options.method || 'GET').toUpperCase();
    var startMs = Date.now();

    // Log request start (only non-GET or specific paths to avoid noise)
    if (typeof ADALog !== 'undefined' && method !== 'GET') {
        ADALog.dbg('API', method + ' ' + path + ' started', null);
    }

    try {
        var response = await fetch(API_BASE_URL + path, { ...options, headers: headers });
        var durationMs = Date.now() - startMs;

        if (response.status === 401) {
            clearAuthToken();
            if (typeof handleAuthFailure === 'function') handleAuthFailure();
        }

        // Log response
        if (typeof ADALog !== 'undefined') {
            if (!response.ok) {
                ADALog.warn('API', method + ' ' + path + ' → ' + response.status, {
                    durationMs: durationMs,
                    status: response.status,
                    statusText: response.statusText
                });
            } else if (durationMs > 3000) {
                // Log slow requests
                ADALog.perf('API', method + ' ' + path + ' slow response', {
                    durationMs: durationMs,
                    status: response.status
                });
            }
        }

        return response;
    } catch (err) {
        var durationMs = Date.now() - startMs;
        if (typeof ADALog !== 'undefined') {
            ADALog.err('API', method + ' ' + path + ' network error', {
                durationMs: durationMs,
                error: err.message || 'unknown',
                isAbort: err.name === 'AbortError'
            });
        }
        throw err;
    }
}
```

**Nota critica:** non loggare il body della request (può contenere dati sensibili). Loggare solo path, method, status, durata.

### 4.2 Sync Engine — Logging completo del ciclo push/pull/conflitti

**File:** `docs/sync-engine.js`

Ogni funzione chiave deve emettere log. Di seguito le istruzioni per punto di inserimento.

**4.2.1 `enqueue()` — Quando un'operazione entra in outbox:**
```javascript
// Dopo il successo di addReq (riga ~347):
if (typeof ADALog !== 'undefined') {
    ADALog.info('SYNC', 'Enqueued operation', {
        opId: op.op_id,
        entityType: entityType,
        entityId: entityId,
        opType: operationType,
        baseVersion: baseVersion || 0
    });
}
```

**4.2.2 `pushAll()` — Prima di inviare al server, dopo il conteggio:**
```javascript
// Prima di fetchApi (riga ~407):
if (typeof ADALog !== 'undefined') {
    ADALog.info('SYNC', 'Push starting', {
        opsCount: toPush.length,
        entityTypes: _countByField(toPush, 'entity_type')
    });
}

// Dove _countByField è un helper:
function _countByField(arr, field) {
    var counts = {};
    arr.forEach(function (r) {
        var v = r[field] || 'unknown';
        counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
}
```

**4.2.3 `processPushResponse()` — Dopo aver processato la risposta del server:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('SYNC', 'Push completed', {
        accepted: acceptedIds.length,
        rejected: rejectedIds.length,
        unhandled: unhandledIds.length,
        rejectedReasons: rejectedMap  // { opId: "reason", ... }
    });
}
```

**4.2.4 `handlePushError()` — Quando push fallisce:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.err('SYNC', 'Push error', {
        error: msg,
        affectedOps: opIds.length
    });
}
```

**4.2.5 `pull()` — Inizio e fine pull:**
```javascript
// All'inizio di pullLoop (riga ~569):
if (typeof ADALog !== 'undefined' && page === 0) {
    ADALog.info('SYNC', 'Pull starting', { cursor: since });
}

// Dopo la risoluzione del pull (riga ~615), prima di return:
if (typeof ADALog !== 'undefined') {
    ADALog.info('SYNC', 'Pull completed', {
        totalPulled: totalPulled,
        pages: page + 1
    });
}

// Nel catch (riga ~624):
if (typeof ADALog !== 'undefined') {
    ADALog.err('SYNC', 'Pull error', { error: msg });
}
```

**4.2.6 `resolveConflictsAndApply()` — Conflitti:**

Sostituire i `console.warn` esistenti (righe 669, 679) con logging strutturato:

```javascript
// Dove attualmente c'è console.warn per remote wins (riga ~669):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('SYNC', 'Conflict: remote wins (last-write-wins)', {
        entityType: change.entity_type,
        entityId: change.entity_id,
        remoteTs: remoteTs.toISOString(),
        localTs: localTs.toISOString(),
        localOpId: local.op_id
    });
}

// Dove attualmente c'è console.warn per local wins (riga ~679):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('SYNC', 'Conflict: local wins (last-write-wins)', {
        entityType: change.entity_type,
        entityId: change.entity_id,
        remoteTs: remoteTs.toISOString(),
        localTs: localTs.toISOString(),
        localOpId: local.op_id
    });
}
```

**4.2.7 `getStatus()` — Snapshot outbox diagnostico:**

Dopo `getStatus()` (riga ~734), aggiungere export nel report debug:
```javascript
// Aggiungere alla fine di getStatus().then():
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('SYNC', 'Outbox status', {
        pending: counts[0],
        pushing: counts[1],
        failed: counts[2],
        lastSync: _lastSyncTime || 'never'
    });
}
```

**4.2.8 `openDB()` e migrazioni IndexedDB:**
```javascript
// Nel catch di openDB (riga ~107):
if (typeof ADALog !== 'undefined') {
    ADALog.err('IDB', 'Failed to open database', { error: e.message || e });
}

// In onupgradeneeded (riga ~123):
if (typeof ADALog !== 'undefined') {
    ADALog.info('IDB', 'Database upgrade', {
        oldVersion: event.oldVersion,
        newVersion: event.newVersion
    });
}

// In migrateFromLegacy completion:
if (typeof ADALog !== 'undefined') {
    ADALog.info('SYNC', 'Legacy migration completed', { migratedCount: count });
}
```

### 4.3 OpenAI / Whisper — Trascrizione audio

**File:** `docs/app-recording.js`

**4.3.1 Inizio trascrizione — nella funzione `transcribeAudio()` (riga ~1621):**
```javascript
var corrId = (typeof ADALog !== 'undefined') ? ADALog.beginCorrelation('transcribe') : null;
if (typeof ADALog !== 'undefined') {
    ADALog.info('OPENAI', 'Whisper transcription starting', {
        audioSizeBytes: audioBlob ? audioBlob.size : 0,
        audioType: audioBlob ? audioBlob.type : 'unknown',
        diarizationEnabled: true
    });
}
```

**4.3.2 Ogni tentativo di chiamata Whisper — in `transcribeWithDiarization()` (riga ~1725):**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('OPENAI', 'Whisper attempt ' + attemptNum, {
        fileName: fileName,
        mimeType: mimeType,
        fileSizeBytes: file ? file.size : 0
    });
}
```

**4.3.3 Risposta Whisper — successo:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.perf('OPENAI', 'Whisper transcription completed', {
        attempt: attemptNum,
        latencyMs: Date.now() - startTime,
        status: response.status,
        resultLengthChars: (result.text || '').length,
        segmentsCount: (result.segments || []).length
    });
}
```

**4.3.4 Risposta Whisper — errore (riga ~1786):**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.err('OPENAI', 'Whisper error', {
        attempt: attemptNum,
        status: response.status,
        errorSnippet: (responseText || '').substring(0, 200),
        willRetry: attemptNum < maxAttempts
    });
}
```

**4.3.5 Normalizzazione audio (riga ~1835):**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('REC', 'Audio normalization to WAV', {
        inputSizeBytes: audioBlob.size,
        inputType: audioBlob.type
    });
}
// Al successo (riga ~1848):
if (typeof ADALog !== 'undefined') {
    ADALog.perf('REC', 'Audio normalization completed', {
        outputSizeBytes: normalizedWav.size,
        latencyMs: Date.now() - normStartTime
    });
}
```

**4.3.6 Diarization fallback (righe ~1667, 1696):**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.warn('OPENAI', 'Diarization attempt failed, trying fallback', {
        attempt: attemptNumber,
        error: error.message || 'unknown'
    });
}
```

**4.3.7 Fine pipeline trascrizione:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('REC', 'Transcription pipeline completed', {
        totalLatencyMs: Date.now() - pipelineStartTime,
        transcriptLengthChars: (result || '').length,
        fallbackUsed: usedFallback
    });
    ADALog.endCorrelation();
}
```

### 4.4 Generazione SOAP

**File:** `docs/app-soap.js`

**4.4.1 Inizio generazione (nella funzione `generateSOAP()`):**
```javascript
var corrId = (typeof ADALog !== 'undefined') ? ADALog.beginCorrelation('soap') : null;
if (typeof ADALog !== 'undefined') {
    ADALog.info('SOAP', 'SOAP generation starting', {
        auto: !!options.auto,
        transcriptLength: (transcription || '').length,
        model: soapModel || 'default'
    });
}
```

**4.4.2 Structured attempt (riga ~397, in `generateSOAPStructured`):**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('SOAP', 'Structured schema attempt', {
        model: model,
        maxTokens: maxTokens
    });
}
// Dopo risposta:
if (typeof ADALog !== 'undefined') {
    ADALog.perf('SOAP', 'Structured schema response', {
        latencyMs: Date.now() - soapStartTime,
        status: response.status,
        hasS: !!soap.S,
        hasO: !!soap.O,
        hasA: !!soap.A,
        hasP: !!soap.P
    });
}
```

**4.4.3 Fallback chain — ogni livello (righe ~245, 419, 443, 482, 499):**
```javascript
// Dove attualmente c'è console.warn('SOAP missing S/O/A; retrying...'):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('SOAP', 'Structured schema incomplete, falling back', {
        fallbackLevel: 'text-only',
        reason: 'missing_sections',
        missingSections: missingSections
    });
}

// Dove attualmente c'è console.log('Using SOAP fallback without strict schema'):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('SOAP', 'Falling back to non-strict schema', {
        fallbackLevel: 'robust',
        attempt: 2
    });
}

// Dove attualmente c'è console.log('Using SOAP ultra fallback (text-only)'):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('SOAP', 'Falling back to text-only extraction', {
        fallbackLevel: 'ultra',
        attempt: 3
    });
}
```

**4.4.4 Fine generazione:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('SOAP', 'SOAP generation completed', {
        totalLatencyMs: Date.now() - soapStartTime,
        fallbackLevel: usedFallbackLevel || 'none',
        resultValid: !!(soap && soap.S)
    });
    ADALog.endCorrelation();
}
```

### 4.5 Documenti AI

**File:** `docs/app-documents.js`

**4.5.1 Upload documento:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('DOC', 'Document upload starting', {
        mimeType: file.type,
        sizeBytes: file.size,
        petId: petId
    });
}
```

**4.5.2 AI Read/Explain — inizio e fine:**
```javascript
// Inizio lettura AI:
if (typeof ADALog !== 'undefined') {
    ADALog.info('DOC', 'AI read starting', {
        documentId: docId,
        mimeType: mimeType
    });
}
// Fine lettura AI:
if (typeof ADALog !== 'undefined') {
    ADALog.perf('DOC', 'AI read completed', {
        documentId: docId,
        latencyMs: duration,
        status: aiStatus // 'completed' | 'error'
    });
}
```

**4.5.3 Fallback PDF → image_url (backend `documents.routes.js` riga ~457):**
Questo è lato backend, ma il frontend deve loggare il polling status:
```javascript
// In status polling loop:
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('DOC', 'Polling AI status', {
        documentId: docId,
        currentStatus: status,
        pollCount: pollCount
    });
}
```

### 4.6 Promo

**File:** `docs/app-promo.js`

**4.6.1 Richiesta raccomandazione:**
```javascript
// In loadPromoRecommendation, prima della fetch:
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('PROMO', 'Loading recommendation', {
        petId: petId,
        context: context
    });
}
// Dopo la risposta:
if (typeof ADALog !== 'undefined') {
    ADALog.info('PROMO', 'Recommendation received', {
        petId: petId,
        productId: rec ? (rec.promoItemId || rec.productId) : null,
        productName: rec ? rec.name : null,
        source: rec ? rec.source : 'null',
        confidence: rec && rec.explanation ? rec.explanation.confidence : null
    });
}
// In catch (mock fallback):
if (typeof ADALog !== 'undefined') {
    ADALog.warn('PROMO', 'Backend unavailable, using mock', {
        petId: petId,
        error: 'fetch_failed'
    });
}
```

**4.6.2 Rendering card:**
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.dbg('PROMO', 'Card rendered', {
        productId: productId,
        context: context,
        ctaEnabled: ctaEnabled,
        role: role
    });
}
```

**4.6.3 Azioni utente (dismiss, info_click, cta_click):**
```javascript
// Già tracciate via trackPromoEvent, aggiungere log:
if (typeof ADALog !== 'undefined') {
    ADALog.info('PROMO', 'User action: ' + eventType, {
        productId: productId,
        petId: petId,
        context: context
    });
}
```

### 4.7 TTS

**File:** `docs/app-tts.js`

```javascript
// Inizio richiesta TTS:
if (typeof ADALog !== 'undefined') {
    ADALog.info('TTS', 'TTS request starting', {
        textLength: (text || '').length,
        voice: voice
    });
}
// Fine TTS:
if (typeof ADALog !== 'undefined') {
    ADALog.perf('TTS', 'TTS completed', {
        latencyMs: Date.now() - ttsStartTime,
        audioSizeBytes: audioBlob ? audioBlob.size : 0
    });
}
// Errore TTS (riga ~245):
if (typeof ADALog !== 'undefined') {
    ADALog.err('TTS', 'TTS failed', {
        error: error.message || 'unknown',
        latencyMs: Date.now() - ttsStartTime
    });
}
```

### 4.8 Navigazione e lifecycle

**File:** `docs/app-core.js`

In `navigateToPage()` (o equivalente), aggiungere:
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('CORE', 'Page navigation', {
        from: previousPage,
        to: page,
        role: getActiveRole()
    });
}
```

In cambio ruolo:
```javascript
if (typeof ADALog !== 'undefined') {
    ADALog.info('CORE', 'Role changed', {
        from: oldRole,
        to: newRole
    });
}
```

---

## 5. Strumentazione backend

### 5.1 Correlation ID — Propagazione

**File:** `backend/src/server.js`

Aggiungere middleware (prima delle route) che legge l'header e lo inietta in `req`:

```javascript
// Correlation ID middleware — subito dopo bodyParser
app.use(function (req, res, next) {
    req.correlationId = req.headers['x-correlation-id'] || null;
    // Propagare nella risposta per debug
    if (req.correlationId) {
        res.setHeader('X-Correlation-Id', req.correlationId);
    }
    next();
});
```

### 5.2 Logging strutturato backend

**File:** `backend/src/server.js` — Aggiungere helper:

```javascript
function serverLog(level, domain, message, data, req) {
    // Solo se ADA_DEBUG_LOG env è 'true'
    if (process.env.ADA_DEBUG_LOG !== 'true') return;

    var now = new Date().toISOString();
    var corrId = (req && req.correlationId) ? req.correlationId : '--------';
    var entry = {
        ts: now,
        level: level,
        domain: domain,
        corrId: corrId,
        msg: message
    };
    if (data) entry.data = data;

    // Scrivere come JSON one-line per facile parsing
    console.log(JSON.stringify(entry));
}
```

**Nota:** Il backend non scrive su `ADA_LOG` (che è localStorage del browser). Il backend logga su stdout in formato JSON strutturato, attivabile via env var `ADA_DEBUG_LOG=true`. Questo consente di correlare le righe usando il `corrId` condiviso.

### 5.3 Punti di inserimento backend

**5.3.1 `proxyOpenAiRequest()` in `server.js` (riga ~311):**
```javascript
// Prima della fetch:
serverLog('INFO', 'OPENAI', 'Proxy request to ' + endpoint, {
    model: (payload && payload.model) || null,
    maxTokens: (payload && payload.max_tokens) || null
}, req);

// Dopo la risposta:
serverLog('PERF', 'OPENAI', 'Proxy response from ' + endpoint, {
    status: response.status,
    latencyMs: Date.now() - startMs,
    tokensUsed: (data && data.usage) ? data.usage.total_tokens : null
}, req);

// In caso di errore:
serverLog('ERR', 'OPENAI', 'Proxy error for ' + endpoint, {
    error: error.message || 'unknown',
    latencyMs: Date.now() - startMs
}, req);
```

**5.3.2 Whisper endpoint (riga ~420):**
```javascript
serverLog('INFO', 'OPENAI', 'Whisper transcription request', {
    audioSizeBytes: req.file ? req.file.size : 0,
    audioMime: req.file ? req.file.mimetype : null
}, req);

// Dopo risposta:
serverLog('PERF', 'OPENAI', 'Whisper response', {
    status: response.status,
    latencyMs: Date.now() - startMs
}, req);
```

**5.3.3 TTS endpoint (riga ~452):**
```javascript
serverLog('INFO', 'OPENAI', 'TTS request', {
    voice: req.body.voice,
    inputLength: (req.body.input || '').length
}, req);
```

**5.3.4 `explanation.service.js` — Ogni step del flow:**
```javascript
// Cache hit:
// (aggiungere req al parametro della funzione, o passare un logger callback)
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'INFO', domain: 'OPENAI',
    msg: 'Explanation cache hit', data: { cacheKey: cacheKey.substring(0, 12) + '...', latencyMs: Date.now() - startMs }}));

// Budget exceeded:
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', domain: 'OPENAI',
    msg: 'Explanation budget exceeded', data: { tenantId: tenantId, usage: b.current_usage, limit: b.monthly_limit }}));

// OpenAI call:
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'PERF', domain: 'OPENAI',
    msg: 'Explanation generated', data: { source: 'openai', latencyMs: Date.now() - startMs, tokensUsed: tokensUsed, confidence: explanation.confidence }}));

// Parse error:
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', domain: 'OPENAI',
    msg: 'Explanation parse failed, using fallback', data: { error: _parseErr.message }}));

// Timeout/network:
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'ERR', domain: 'OPENAI',
    msg: 'Explanation OpenAI timeout/error', data: { error: e.message, isAbort: e.name === 'AbortError', latencyMs: Date.now() - startMs }}));
```

**5.3.5 `eligibility.service.js` — Logging della selezione:**
```javascript
// Dopo selectPromo completa (riga ~337):
console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'INFO', domain: 'PROMO',
    msg: 'Eligibility result', data: {
        petId: petId,
        candidatesFound: candidates.length,
        selectedItemId: result ? result.promo_item_id : null,
        matchScore: result ? result._matchScore : 0,
        consentStatus: consentStatus,
        vetFlagsActive: vetFlagCount
    }}));
```

**5.3.6 `sync.routes.js` — Push/Pull:**
```javascript
// In POST /api/sync/push handler:
serverLog('INFO', 'SYNC', 'Push received', {
    opsCount: (req.body.operations || []).length,
    userId: req.user ? req.user.sub : 'unknown'
}, req);

// Dopo processing:
serverLog('INFO', 'SYNC', 'Push processed', {
    accepted: accepted.length,
    rejected: rejected.length
}, req);
```

**5.3.7 `documents.routes.js` — AI processing:**
```javascript
// In processDocumentRead (riga ~438):
serverLog('INFO', 'DOC', 'processDocumentRead starting', {
    documentId: doc.document_id,
    mimeType: doc.mime_type
}, null);

// Dopo OpenAI response (riga ~448):
serverLog('PERF', 'DOC', 'processDocumentRead OpenAI response', {
    documentId: doc.document_id,
    status: response.status,
    latencyMs: Date.now() - startMs
}, null);

// Fallback PDF → image_url (riga ~457):
serverLog('WARN', 'DOC', 'PDF text extraction failed, retrying as image', {
    documentId: doc.document_id,
    originalError: errMsg.substring(0, 100)
}, null);
```

---

## 6. Audit middleware potenziato

**File:** `backend/src/server.js` — `auditLogMiddleware` (riga ~230)

Aggiungere correlation ID e request body size all'audit:

```javascript
// Nella sezione details:
var details = {
    status: res.statusCode,
    duration_ms: Date.now() - startTime,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    correlation_id: req.correlationId || null,     // NUOVO
    content_length: req.headers['content-length'] || null  // NUOVO
};
```

---

## 7. Pagina Debug — Miglioramenti UI

**File:** `docs/index.html`, sezione `page-debug`

Aggiungere nel card "Strumenti di sistema":

```html
<!-- Dopo i bottoni esistenti ADA.log -->
<button class="btn btn-secondary" onclick="showSyncDiagnostics()" data-testid="sync-diagnostics-button">🔄 Diagnostica Sync</button>
<button class="btn btn-secondary" onclick="showApiMetrics()" data-testid="api-metrics-button">📡 Metriche API</button>
```

**File:** `docs/app-core.js` — Aggiungere le funzioni:

```javascript
function showSyncDiagnostics() {
    if (typeof syncEngine === 'undefined' || !syncEngine.getStatus) {
        showToast('Sync engine non disponibile', 'info');
        return;
    }
    syncEngine.getStatus().then(function (status) {
        var msg = '--- SYNC DIAGNOSTICS ---\n'
            + 'Pending: ' + (status.pending || 0) + '\n'
            + 'Pushing: ' + (status.pushing || 0) + '\n'
            + 'Failed: ' + (status.failed || 0) + '\n'
            + 'Last sync: ' + (status.lastSync || 'mai') + '\n'
            + 'Errors: ' + JSON.stringify(status.errors || [], null, 2);
        alert(msg); // oppure renderizzare in un div dedicato nella page-debug
    });
}

function showApiMetrics() {
    if (typeof ADAObservability === 'undefined') {
        showToast('Observability non disponibile', 'info');
        return;
    }
    var report = ADAObservability.getReport();
    var lines = ['--- API METRICS ---',
        'Total calls: ' + report.api.totalCalls,
        'Total errors: ' + report.api.totalErrors,
        ''
    ];
    var endpoints = Object.keys(report.api.byEndpoint);
    endpoints.sort(function (a, b) {
        return report.api.byEndpoint[b].count - report.api.byEndpoint[a].count;
    });
    endpoints.forEach(function (ep) {
        var m = report.api.byEndpoint[ep];
        lines.push(ep + ': ' + m.count + ' calls, '
            + m.errors + ' err, avg ' + m.avgMs + 'ms'
            + ' (min ' + m.minMs + ' / max ' + m.maxMs + ')');
    });
    alert(lines.join('\n'));
}
```

---

## 8. Checklist di implementazione

### Frontend

- [ ] Creare `docs/app-debug-logger.js` con `ADALog` (§3.1)
- [ ] Registrare lo script in `index.html` subito dopo `config.js`
- [ ] Rimuovere i body di `logError` e `logDebug` da `app-core.js` e `app-recording.js` (§3.2)
- [ ] Modificare `fetchApi` in `config.js` per propagare correlation ID e loggare errori/slow (§4.1)
- [ ] Strumentare `sync-engine.js`: enqueue, push, pull, conflitti, outbox status, IDB (§4.2)
- [ ] Strumentare `app-recording.js`: trascrizione Whisper, normalizzazione, diarization, pipeline (§4.3)
- [ ] Strumentare `app-soap.js`: generazione SOAP, fallback chain (§4.4)
- [ ] Strumentare `app-documents.js`: upload, AI read/explain, polling (§4.5)
- [ ] Strumentare `app-promo.js`: recommendation, render, user actions (§4.6)
- [ ] Strumentare `app-tts.js`: request, response, errori (§4.7)
- [ ] Aggiungere log navigazione e cambio ruolo in `app-core.js` (§4.8)
- [ ] Aggiungere bottoni "Diagnostica Sync" e "Metriche API" in page-debug (§7)

### Backend

- [ ] Aggiungere middleware correlation ID in `server.js` (§5.1)
- [ ] Aggiungere helper `serverLog()` in `server.js` condizionato a `ADA_DEBUG_LOG=true` (§5.2)
- [ ] Strumentare `proxyOpenAiRequest`, Whisper endpoint, TTS endpoint (§5.3.1–5.3.3)
- [ ] Strumentare `explanation.service.js`: cache, budget, OpenAI call, parse, fallback (§5.3.4)
- [ ] Strumentare `eligibility.service.js`: risultato selezione (§5.3.5)
- [ ] Strumentare `sync.routes.js`: push received/processed (§5.3.6)
- [ ] Strumentare `documents.routes.js`: AI processing, fallback (§5.3.7)
- [ ] Potenziare `auditLogMiddleware` con correlation ID (§6)

### Verifica

- [ ] Con `debugLogEnabled = false`: nessuna riga scritta in ADA_LOG (tranne ERR), nessun overhead misurabile
- [ ] Con `debugLogEnabled = true`: un'operazione completa (registra → trascrivi → genera SOAP) produce un log leggibile con correlation ID coerente
- [ ] Rotazione: dopo 500 KB il log tronca dalla testa con marker `[...log troncato...]`
- [ ] Scarica `ADA.log` dal pulsante Debug e verificare leggibilità
- [ ] Sync conflict: simulare un conflitto e verificare che i log SYNC mostrino le due timestamp e il vincitore
- [ ] API error: simulare un errore 500 e verificare che appaia in ADA_LOG con status e durata
- [ ] Tutti gli smoke test Playwright passano senza modifiche
