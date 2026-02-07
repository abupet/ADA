# ADA — PR 13-14-15: Debug Logging + Seed Engine

> **Versione:** 1.0 · **Data:** 07/02/2026 · **Baseline:** ADA v7.2.0  
> **Destinatario:** Claude Code per implementazione  
> **Struttura:** 3 PR sequenziali, ciascuno indipendentemente deployabile

---

## Indice

- **PR 13** — Debug Logging System (§1-§4)
- **PR 14** — Seed Engine Core: Pet + Clinica (§5-§9)
- **PR 15** — Seed Engine Promo: Web Scraping + Import (§10-§12)
- **Appendici** — Knowledge base patologie, schema entità

---

# PR 13 — DEBUG LOGGING SYSTEM

**Scope:** Sistema di logging strutturato per root-cause analysis. Attivo solo quando `debugLogEnabled === true`. Zero impatto in produzione.

**File coinvolti:**

| Azione | File |
|--------|------|
| CREA | `docs/app-debug-logger.js` |
| MODIFICA | `docs/config.js` (fetchApi) |
| MODIFICA | `docs/app-core.js` (rimuovi vecchio logError, aggiungi nav/sync diagnostics) |
| MODIFICA | `docs/app-recording.js` (rimuovi vecchio logDebug, aggiungi log puntuali) |
| MODIFICA | `docs/app-soap.js` (log fallback chain) |
| MODIFICA | `docs/app-documents.js` (log AI read/explain) |
| MODIFICA | `docs/app-promo.js` (log recommendation cycle) |
| MODIFICA | `docs/app-tts.js` (log request/response) |
| MODIFICA | `docs/sync-engine.js` (log push/pull/conflict/outbox) |
| MODIFICA | `docs/index.html` (script tag + bottoni diagnostica in page-debug) |
| MODIFICA | `backend/src/server.js` (correlation ID middleware, serverLog helper, audit potenziato) |
| MODIFICA | `backend/src/documents.routes.js` (log AI processing) |
| MODIFICA | `backend/src/explanation.service.js` (log cache/budget/fallback) |
| MODIFICA | `backend/src/eligibility.service.js` (log selezione) |

---

## §1. Modulo centrale: `app-debug-logger.js`

Creare `docs/app-debug-logger.js`. Caricarlo in `index.html` **subito dopo `config.js`** e **prima di tutti gli altri `app-*.js`**.

### 1.1 Formato riga di log

```
[07/02/2026, 14:32:05.123] [LEVEL] [DOMAIN] [corrId] message | {json}
```

- **LEVEL:** `ERR` (scrive sempre, anche con debug off), `WARN`, `INFO`, `DBG`, `PERF`
- **DOMAIN:** `CORE`, `API`, `OPENAI`, `SYNC`, `REC`, `SOAP`, `DOC`, `PROMO`, `TTS`, `IDB`
- **corrId:** 8 hex chars, o `--------` se assente
- **json:** oggetto opzionale, serializzato one-line. Mai dati sensibili (no JWT, no API key, no trascrizioni, no nomi pazienti).

### 1.2 Codice completo

```javascript
// app-debug-logger.js v1.0
// Centralized debug logging for ADA — writes to localStorage ADA_LOG
// Active ONLY when debugLogEnabled === true

(function (global) {
    'use strict';

    var LOG_KEY = 'ADA_LOG';
    var MAX_LOG_BYTES = 500 * 1024;
    var TRIM_TO_BYTES = 400 * 1024;
    var _correlationId = null;

    // --- Correlation ID ---

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
        _writeLog('INFO', 'CORE', 'Begin: ' + (label || ''), null);
        return _correlationId;
    }

    function endCorrelation() { _correlationId = null; }
    function getCorrelationId() { return _correlationId; }

    // --- Core writer ---

    function _isEnabled() {
        return (typeof debugLogEnabled !== 'undefined' && debugLogEnabled === true);
    }

    function _writeLog(level, domain, message, data) {
        if (level !== 'ERR' && !_isEnabled()) return;
        try {
            var now = new Date();
            var ts = now.toLocaleString('it-IT', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            var ms = ('00' + now.getMilliseconds()).slice(-3);
            var corrId = _correlationId || '--------';

            var entry = '[' + ts + '.' + ms + '] [' + level + '] [' + domain + '] [' + corrId + '] ' + message;

            if (data !== null && data !== undefined) {
                try {
                    var json = JSON.stringify(data);
                    if (json && json !== '{}') entry += ' | ' + json;
                } catch (e) { entry += ' | [serialize_error]'; }
            }
            entry += '\n';

            var existing = localStorage.getItem(LOG_KEY) || '';

            // Rotation
            if ((existing.length + entry.length) > MAX_LOG_BYTES) {
                var cutPoint = existing.length - TRIM_TO_BYTES;
                if (cutPoint > 0) {
                    var nlPos = existing.indexOf('\n', cutPoint);
                    existing = (nlPos !== -1)
                        ? '[...log troncato...]\n' + existing.substring(nlPos + 1)
                        : '';
                }
            }

            localStorage.setItem(LOG_KEY, existing + entry);

            if (level === 'ERR') console.error('[ADA][' + domain + '] ' + message, data || '');
            else if (level === 'WARN') console.warn('[ADA][' + domain + '] ' + message, data || '');
        } catch (e) { /* localStorage full — drop silently */ }
    }

    // --- Public API ---

    function logErr(domain, msg, data) { _writeLog('ERR', domain, msg, data); }
    function logWarn(domain, msg, data) { _writeLog('WARN', domain, msg, data); }
    function logInfo(domain, msg, data) { _writeLog('INFO', domain, msg, data); }
    function logDbg(domain, msg, data) { _writeLog('DBG', domain, msg, data); }
    function logPerf(domain, msg, data) { _writeLog('PERF', domain, msg, data); }

    // --- Backward compat: replace global logError / logDebug ---

    global.logError = function (context, errorMessage) {
        logErr('CORE', context + ': ' + errorMessage, null);
    };
    global.logDebug = function (context, message) {
        var msg = (typeof message !== 'string') ? JSON.stringify(message) : message;
        logDbg('CORE', context + ': ' + msg, null);
    };

    global.ADALog = {
        err: logErr, warn: logWarn, info: logInfo, dbg: logDbg, perf: logPerf,
        beginCorrelation: beginCorrelation,
        endCorrelation: endCorrelation,
        getCorrelationId: getCorrelationId
    };

})(typeof window !== 'undefined' ? window : this);
```

### 1.3 Registrazione in `index.html`

```html
<script src="config.js"></script>
<script src="app-debug-logger.js"></script>  <!-- NUOVO -->
<script src="app-core.js"></script>
```

### 1.4 Rimozione vecchie definizioni

- **`app-core.js` (~riga 1400):** eliminare il body di `function logError(...)`. Sostituire con commento: `// Moved to app-debug-logger.js`
- **`app-recording.js` (~riga 1598):** eliminare il body di `function logDebug(...)`. Stesso commento.

---

## §2. Strumentazione frontend

In ogni punto indicato, wrappare con `if (typeof ADALog !== 'undefined')` per sicurezza.

### 2.1 `config.js` → `fetchApi`

Riscrivere `fetchApi` per: propagare `X-Correlation-Id`, loggare errori (status non-ok) e request lente (>3s).

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

        if (typeof ADALog !== 'undefined') {
            if (!response.ok) {
                ADALog.warn('API', method + ' ' + path + ' → ' + response.status, {
                    durationMs: durationMs, status: response.status
                });
            } else if (durationMs > 3000) {
                ADALog.perf('API', method + ' ' + path + ' slow', { durationMs: durationMs });
            }
        }
        return response;
    } catch (err) {
        if (typeof ADALog !== 'undefined') {
            ADALog.err('API', method + ' ' + path + ' network error', {
                durationMs: Date.now() - startMs,
                error: err.message || 'unknown',
                isAbort: err.name === 'AbortError'
            });
        }
        throw err;
    }
}
```

### 2.2 `sync-engine.js`

Sostituire i `console.warn` esistenti e aggiungere log nei punti seguenti. Per ogni punto indico la funzione e il dato da loggare.

| Funzione | Punto | Dominio | Livello | Dati |
|----------|-------|---------|---------|------|
| `enqueue()` | dopo `addReq` success | SYNC | INFO | `{opId, entityType, entityId, opType, baseVersion}` |
| `pushAll()` | prima di fetchApi | SYNC | INFO | `{opsCount, entityTypes: {pet: N, ...}}` |
| `processPushResponse()` | dopo processing | SYNC | INFO | `{accepted: N, rejected: N, rejectedReasons: {...}}` |
| `handlePushError()` | on error | SYNC | ERR | `{error, affectedOps: N}` |
| `pull()` / `pullLoop` page=0 | inizio | SYNC | INFO | `{cursor}` |
| `pull()` | dopo resolve | SYNC | INFO | `{totalPulled, pages}` |
| `pull()` | catch | SYNC | ERR | `{error}` |
| `resolveConflictsAndApply()` | remote wins (~riga 669) | SYNC | WARN | `{entityType, entityId, remoteTs, localTs, localOpId}` |
| `resolveConflictsAndApply()` | local wins (~riga 679) | SYNC | WARN | `{entityType, entityId, remoteTs, localTs}` |
| `openDB()` | error (~riga 107) | IDB | ERR | `{error}` |
| `openDB()` | onupgradeneeded | IDB | INFO | `{oldVersion, newVersion}` |
| `migrateFromLegacy()` | completion | SYNC | INFO | `{migratedCount}` |

**Importante:** rimuovere i `console.warn` esistenti per conflitti (righe ~669, ~679) e sostituirli con le chiamate `ADALog.warn(...)`.

### 2.3 `app-recording.js`

| Punto | Dominio | Livello | Dati |
|-------|---------|---------|------|
| Inizio `transcribeAudio()` | OPENAI | INFO | `{audioSizeBytes, audioType}` + `beginCorrelation('transcribe')` |
| Ogni tentativo Whisper (~riga 1725) | OPENAI | DBG | `{attempt, fileName, mimeType, fileSizeBytes}` |
| Whisper success | OPENAI | PERF | `{attempt, latencyMs, status, resultLengthChars, segmentsCount}` |
| Whisper error (~riga 1786) | OPENAI | ERR | `{attempt, status, errorSnippet (max 200 chars), willRetry}` |
| Diarization fallback (~righe 1667,1696) | OPENAI | WARN | `{attempt, error}` |
| Audio normalization start (~riga 1835) | REC | DBG | `{inputSizeBytes, inputType}` |
| Audio normalization done (~riga 1848) | REC | PERF | `{outputSizeBytes, latencyMs}` |
| Fine pipeline | REC | INFO | `{totalLatencyMs, transcriptLengthChars, fallbackUsed}` + `endCorrelation()` |

### 2.4 `app-soap.js`

| Punto | Dominio | Livello | Dati |
|-------|---------|---------|------|
| Inizio `generateSOAP()` | SOAP | INFO | `{auto, transcriptLength}` + `beginCorrelation('soap')` |
| Structured attempt (~riga 397) | SOAP | DBG | `{model, maxTokens}` |
| Structured response | SOAP | PERF | `{latencyMs, status, hasS, hasO, hasA, hasP}` |
| Ogni fallback (righe 245, 419, 443, 499) | SOAP | WARN | `{fallbackLevel: 'robust'/'ultra'/'text-only', reason}` |
| Fine generazione | SOAP | INFO | `{totalLatencyMs, fallbackLevel, resultValid}` + `endCorrelation()` |

### 2.5 `app-documents.js`

| Punto | Dominio | Livello | Dati |
|-------|---------|---------|------|
| Upload start | DOC | INFO | `{mimeType, sizeBytes, petId}` |
| AI read start | DOC | INFO | `{documentId, mimeType}` |
| AI read done | DOC | PERF | `{documentId, latencyMs, status}` |
| Status polling | DOC | DBG | `{documentId, currentStatus, pollCount}` |

### 2.6 `app-promo.js`, `app-tts.js`, `app-core.js`

**Promo:** loggare `loadPromoRecommendation` (DBG prima, INFO dopo con productId/source/confidence), render card (DBG), user actions impression/click/dismiss (INFO).

**TTS:** loggare request start (INFO con textLength, voice), done (PERF con latencyMs, audioSizeBytes), error (ERR).

**Core:** loggare `navigateToPage` (INFO con from/to/role), role change (INFO con from/to).

### 2.7 Bottoni diagnostica in `page-debug`

Aggiungere nel card "Strumenti di sistema" di `page-debug`:

```html
<button class="btn btn-secondary" onclick="showSyncDiagnostics()">🔄 Diagnostica Sync</button>
<button class="btn btn-secondary" onclick="showApiMetrics()">📡 Metriche API</button>
```

Implementare `showSyncDiagnostics()` (chiama `syncEngine.getStatus()`, mostra pending/pushing/failed/lastSync/errors) e `showApiMetrics()` (chiama `ADAObservability.getReport()`, mostra per-endpoint count/errors/avgMs).

---

## §3. Strumentazione backend

### 3.1 Correlation ID middleware

In `server.js`, **subito dopo bodyParser, prima delle route:**

```javascript
app.use(function (req, res, next) {
    req.correlationId = req.headers['x-correlation-id'] || null;
    if (req.correlationId) res.setHeader('X-Correlation-Id', req.correlationId);
    next();
});
```

### 3.2 Helper `serverLog()`

In `server.js`, condizionato a `process.env.ADA_DEBUG_LOG === 'true'`:

```javascript
function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    var entry = {
        ts: new Date().toISOString(),
        level: level,
        domain: domain,
        corrId: (req && req.correlationId) || '--------',
        msg: message
    };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}
```

### 3.3 Punti di inserimento backend

| File | Funzione | Dominio | Dati |
|------|----------|---------|------|
| `server.js` | `proxyOpenAiRequest()` prima fetch | OPENAI | `{endpoint, model, maxTokens}` |
| `server.js` | `proxyOpenAiRequest()` dopo risposta | OPENAI | `{endpoint, status, latencyMs, tokensUsed}` |
| `server.js` | `proxyOpenAiRequest()` catch | OPENAI | `{endpoint, error, latencyMs}` |
| `server.js` | Whisper endpoint (~riga 420) | OPENAI | `{audioSizeBytes, audioMime}` → `{status, latencyMs}` |
| `server.js` | TTS endpoint (~riga 452) | OPENAI | `{voice, inputLength}` |
| `documents.routes.js` | `processDocumentRead` start/done | DOC | `{documentId, mimeType}` → `{status, latencyMs}` |
| `documents.routes.js` | PDF→image fallback (~riga 457) | DOC | `{documentId, originalError (100 chars)}` |
| `explanation.service.js` | cache hit | OPENAI | `{cacheKey (12 chars), latencyMs}` |
| `explanation.service.js` | budget exceeded | OPENAI | `{tenantId, usage, limit}` |
| `explanation.service.js` | OpenAI done | OPENAI | `{source, latencyMs, tokensUsed, confidence}` |
| `explanation.service.js` | parse fail | OPENAI | `{error}` |
| `explanation.service.js` | timeout | OPENAI | `{error, isAbort, latencyMs}` |
| `eligibility.service.js` | after selectPromo | PROMO | `{petId, candidatesFound, selectedItemId, matchScore}` |

### 3.4 Audit middleware potenziato

In `auditLogMiddleware` (server.js ~riga 230), aggiungere al `details` object:

```javascript
correlation_id: req.correlationId || null,
content_length: req.headers['content-length'] || null
```

---

## §4. Checklist PR 13

**Frontend:**
- [ ] Crea `docs/app-debug-logger.js` (§1.2)
- [ ] Registra in `index.html` subito dopo `config.js` (§1.3)
- [ ] Rimuovi vecchi body di `logError`/`logDebug` (§1.4)
- [ ] Riscrivi `fetchApi` in `config.js` (§2.1)
- [ ] Strumenta `sync-engine.js` — 12 punti (§2.2)
- [ ] Strumenta `app-recording.js` — 8 punti (§2.3)
- [ ] Strumenta `app-soap.js` — 5 punti (§2.4)
- [ ] Strumenta `app-documents.js` — 4 punti (§2.5)
- [ ] Strumenta promo/tts/core (§2.6)
- [ ] Aggiungi bottoni diagnostica in page-debug (§2.7)

**Backend:**
- [ ] Correlation ID middleware (§3.1)
- [ ] Helper `serverLog()` (§3.2)
- [ ] 13 punti di inserimento backend (§3.3)
- [ ] Audit potenziato (§3.4)

**Verifica:**
- [ ] Con `debugLogEnabled = false`: nessuna riga in ADA_LOG (tranne ERR)
- [ ] Pipeline completa registra→trascrivi→SOAP: log coerente con correlation ID
- [ ] Rotazione a 500 KB funziona
- [ ] Sync conflict produce log WARN con entrambi i timestamp
- [ ] Backend con `ADA_DEBUG_LOG=true`: output JSON strutturato su stdout
- [ ] Tutti gli smoke test Playwright passano

---

# PR 14 — SEED ENGINE CORE: PET + CLINICA

**Scope:** Pagina frontend per configurare il popolamento + backend per generare pet con storia clinica coerente (referti SOAP, documenti, vitali, farmaci, foto, diary). I referti e documenti sono generati da OpenAI.

**Dipendenza:** PR 13 (il seed beneficia del logging, ma funziona anche senza).

**File coinvolti:**

| Azione | File |
|--------|------|
| CREA | `docs/app-seed.js` |
| CREA | `backend/src/seed.routes.js` |
| CREA | `backend/src/seed.service.js` |
| CREA | `backend/src/seed.petgen.js` |
| MODIFICA | `docs/index.html` (page-seed HTML + script tag + sidebar) |
| MODIFICA | `backend/src/server.js` (registrazione route) |

---

## §5. Pagina frontend

### 5.1 HTML: `page-seed`

Aggiungere in `index.html`, visibile solo quando `debugLogEnabled === true`.

**Contenuto della pagina:**

1. **Card Modalità** — radio: "Da zero (cancella tutto prima)" / "Aggiungi all'esistente"
2. **Card Quantità** — 7 input numerici:
   - Numero pet (default 10, min 1, max 100)
   - Referti SOAP per pet (default 3, min 1, max 10)
   - Documenti caricati per pet (default 2, min 0, max 5)
   - Rilevazioni parametri vitali per pet (default 8, min 0, max 30)
   - Farmaci attivi per pet (default 3, min 0, max 8)
   - Foto per pet (default 2, min 0, max 6)
   - Eventi promo per pet (default 5, min 0, max 20)
   - *Sotto i campi:* stima in tempo reale ("~30 referti, ~20 documenti — circa 5 minuti con OpenAI")
3. **Card Distribuzione specie** — 3 input percentuali: Cani (60), Gatti (30), Conigli (10)
4. **Card Azioni** — bottoni:
   - 🚀 Avvia popolamento (chiama `POST /api/seed/start`)
   - ⏹ Annulla (visibile durante esecuzione, chiama `POST /api/seed/cancel`)
   - 🗑 Cancella tutto il seed (chiama `POST /api/seed/wipe`, doppio confirm)
5. **Barra progresso** — (visibile durante esecuzione): progress bar, testo fase, log scorrevole (ultime 50 righe)

### 5.2 Sidebar

Aggiungere in sidebar-vet e sidebar-owner:
```html
<div class="nav-item seed-nav-item" data-page="seed" style="display:none;">🌱 Seed Engine</div>
```

Visibilità gestita dallo stesso meccanismo di `app-testdata.js` (`updateTestButtonVisibility`): aggiungere la classe `.seed-nav-item` ai selettori.

### 5.3 `docs/app-seed.js`

Controller frontend IIFE che espone le funzioni richiamate dai bottoni HTML. **Tutta la logica pesante è nel backend** — il frontend fa solo: POST config → poll status → aggiorna UI.

Funzioni principali:
- `seedStart()` → POST `/api/seed/start` con config, poi avvia polling ogni 2s su `GET /api/seed/status`
- `seedCancel()` → POST `/api/seed/cancel`
- `seedWipe()` → POST `/api/seed/wipe` (con doppio confirm)
- `_updateEstimate()` → calcolo in tempo reale: `totalAiCalls × 8s / 60 = minuti`
- `_updateProgress(data)` → aggiorna progress bar, testo fase, log

**Nota:** la sezione PROMO (brand search, scraping) è in PR 15. In questa PR il card promo non è ancora presente nella pagina.

---

## §6. Backend: `seed.routes.js`

5 endpoint (la parte promo si aggiunge in PR 15):

```
POST /api/seed/start     — Avvia job asincrono di popolamento
GET  /api/seed/status    — Poll stato del job corrente
POST /api/seed/cancel    — Annulla job in corso
POST /api/seed/wipe      — Cancella TUTTI i dati con marker [seed]
GET  /api/seed/config     — Ritorna i default di configurazione
```

**Job state** mantenuto in-memory (variabile `currentJob`). Un solo job alla volta (409 se già running).

Il job object ha: `{ jobId, status, config, phase, progressPct, currentItem, log[], cancelled, startedAt }`.

**Wipe SQL** — cancella in ordine FK-safe:

```sql
DELETE FROM promo_events WHERE metadata->>'seeded' = 'true'
DELETE FROM vet_flags WHERE reason LIKE '%[seed]%'
DELETE FROM campaign_items WHERE campaign_id IN (SELECT campaign_id FROM promo_campaigns WHERE utm_campaign LIKE 'seed_%')
DELETE FROM promo_campaigns WHERE utm_campaign LIKE 'seed_%'
DELETE FROM explanation_cache WHERE cache_key LIKE 'seed_%'
DELETE FROM promo_items WHERE promo_item_id LIKE 'seed-%'
DELETE FROM pet_tags WHERE pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')
DELETE FROM consents WHERE owner_user_id LIKE 'seed-%'
DELETE FROM documents WHERE pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')
DELETE FROM changes WHERE entity_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')
DELETE FROM pet_changes WHERE pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')
DELETE FROM pets WHERE notes LIKE '%[seed]%'
```

Ogni DELETE è in try/catch (la tabella potrebbe non esistere).

**Registrare in `server.js`:**
```javascript
// Dentro if (process.env.DATABASE_URL), dopo le altre route:
const { seedRouter } = require("./seed.routes");
app.use(seedRouter({ requireAuth }));
```

---

## §7. Backend: `seed.service.js` — Orchestratore

Esegue il seed in **9 fasi sequenziali**. Controlla `job.cancelled` prima di ogni operazione costosa.

| Fase | %   | Descrizione |
|------|-----|-------------|
| 0 | 0-2 | Se mode="fresh": cancella seed precedente |
| 1 | 2-5 | Garantisce infrastruttura (tenant, consent, budget) |
| 2 | 5-8 | Genera N profili pet deterministici (`seed.petgen.js`) |
| 3 | 8-15 | Inserisce pet nel DB |
| 4 | 15-55 | Genera referti SOAP via OpenAI (il blocco più lungo) |
| 5 | 55-75 | Genera documenti clinici via OpenAI |
| 6 | 75-85 | Genera vitali, farmaci, foto, diary (deterministico, no OpenAI) |
| 7 | 85-90 | Calcola pet_tags (`computeTags()`) |
| 8 | 90-95 | Genera eventi promo simulati |
| 9 | 95-100 | Aggiorna extra_data, finalizza |

### 7.1 Fase 1: Infrastruttura

Crea/assicura:
- Tenant `seed-tenant` (name: "Seed Test Brand", slug: "seed-brand")
- Consensi per `ownerUserId` = "ada-user": marketing_global, clinical_tags, marketing_brand per seed-tenant → tutti `opted_in`
- Budget: tenant_budgets per seed-tenant con monthly_limit=10000
- Global policies: max_impressions_per_week (se non esiste)

### 7.2 Fase 3: Insert pet

Per ogni pet profilo generato da `seed.petgen.js`:

```javascript
await pool.query(
    `INSERT INTO pets (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
    [pet.petId, ownerUserId, pet.name, pet.species, pet.breed, pet.sex, pet.birthdate, pet.weightKg, pet.diary + ' [seed]']
);
```

Il marker `[seed]` in `notes` è fondamentale per il wipe.

### 7.3 Fase 4: SOAP via OpenAI

Per ogni pet × `soapPerPet`:
1. Seleziona tipo visita coerente con le patologie del pet
2. Chiama OpenAI `gpt-4o-mini` con prompt specialistico (vedi §8)
3. Parse JSON risposta → estrai S, O, A, P
4. Salva in `history_data` dell'extra_data del pet

### 7.4 Fase 5: Documenti via OpenAI

Per ogni pet × `docsPerPet`:
1. Seleziona tipo documento coerente con patologie (esami sangue, eco, rx, citologico, urine, tiroideo, ecocardio)
2. Chiama OpenAI con prompt specialistico (vedi §8)
3. Salva testo su disco + inserisci in tabella `documents` con `ai_status='completed'`, `read_text` pre-compilato

### 7.5 Fase 6: Vitali, Farmaci, Foto, Diary (no OpenAI)

**Vitali:** `vitalsPerPet` rilevazioni distribuite nel tempo (ogni 7-20 giorni). Range per specie (cane/gatto/coniglio). Influenzati dalle patologie (pet obeso → peso alto; IRC → peso in calo). Trend realistici (variazioni graduali).

**Farmaci:** derivati ESCLUSIVAMENTE dalle patologie assegnate (da `BREED_PATHOLOGIES[breed][pathology].typicalMeds`). Nessun farmaco random.

**Foto:** placeholder SVG (come `app-testdata.js`). `photosPerPet` foto.

**Diary (vet):** testo generato combinando: anamnesi remota, patologie note con date, note comportamentali. Es: _"Labrador maschio castrato, vaccinazioni complete (ultimo richiamo 03/2025). Displasia anca bilaterale dal 2024, Meloxicam cronico. BCS 7/9, programma dietetico in corso."_

**Owner diary:** versione semplificata in linguaggio non tecnico.

### 7.6 Fase 7: Tag

Chiama `computeTags(pool, petId, ownerUserId)` per ogni pet. Se il modulo non è disponibile, skip con warning nel log.

### 7.7 Fase 8: Eventi promo

Per ogni pet × `promoEventsPerPet`: genera eventi con tipo casuale (60% impression, 20% info_click, 10% cta_click, 10% dismissed), contesto casuale (home_feed/pet_profile/post_visit/faq_view), distribuiti nelle ultime 4 settimane. Metadata: `{ seeded: "true" }`.

### 7.8 Salvataggio `extra_data`

Alla fine, per ogni pet aggiorna il campo `extra_data` JSONB:

```javascript
const extraData = {
    vitals_data: vitalsArray,
    medications: medsArray,
    history_data: historyArray,
    lifestyle: lifestyleObj,
    photos: photosArray,
    owner_diary: ownerDiaryText,
    owner_name: pet.ownerName,
    owner_phone: pet.ownerPhone,
    microchip: pet.microchip,
    visit_date: lastVisitDate
};
await pool.query("UPDATE pets SET extra_data = $1 WHERE pet_id = $2",
    [JSON.stringify(extraData), pet.petId]);
```

---

## §8. Backend: `seed.petgen.js` — Profili e knowledge base

### 8.1 `generatePetCohort(count, { dogPct, catPct, rabbitPct })`

Genera array di N profili. Ogni profilo contiene: `petId`, anagrafica, proprietario, lifestyle, 0-3 patologie, farmaci derivati, diary, ownerDiary.

**Distribuzione patologie:**
- 20% sani (0 patologie)
- 40% con 1 patologia
- 30% con 2 patologie
- 10% con 3 patologie

### 8.2 Prompt OpenAI per referti SOAP

```
System: Sei un veterinario esperto italiano. Scrivi referti SOAP dettagliati.

REGOLE:
- Ogni sezione (S, O, A, P) DEVE avere almeno 800 caratteri, massimo 1500
- Terminologia medica veterinaria specialistica italiana
- Includi valori numerici specifici (esami, parametri)
- Coerente con profilo e storia clinica del paziente
- Rispondi SOLO in JSON: {"s":"...","o":"...","a":"...","p":"..."}

User: PAZIENTE: {name}, {species} {breed}, {sex}, {age}, {weightKg} kg
PATOLOGIE NOTE: {patologie}
FARMACI IN CORSO: {farmaci}
TIPO VISITA: {tipoVisita}
MOTIVO: {motivo}
VISITA #{n}: {nota follow-up se n>1}
```

Modello: `gpt-4o-mini`. Timeout: 30s. Temperature: 0.7 (per variabilità).

### 8.3 Prompt OpenAI per documenti clinici

```
System: Sei un laboratorio di analisi veterinarie italiano. Scrivi referti diagnostici.

User: Genera un {tipoDocumento} veterinario per:
Paziente: {name}, {species} {breed}, {age}, {weightKg} kg
Patologie note: {patologie}
Data esame: {dataEsame}

Il referto DEVE:
- Essere lungo almeno 3000 caratteri (1-2 pagine A4)
- Linguaggio medico veterinario specialistico italiano
- Valori numerici con range di riferimento tra parentesi
- Coerente con le patologie note
- Intestazione, dati paziente, corpo referto, conclusioni, firma
```

Tipi documento (scelti in base alla patologia):
- Emocromocitometrico + profilo biochimico (tutti)
- Referto ecografico (patologie addominali/renali)
- Referto radiografico (patologie osteoarticolari)
- Esame citologico (lesioni cutanee)
- Esame urine (patologie renali/cistite)
- Profilo tiroideo (ipertiroidismo felino)
- Ecocardiografia (soffi/cardiopatie)

### 8.4 Knowledge base `BREED_PATHOLOGIES`

**Requisito critico:** coprire TUTTE le 27 razze (10 cane + 10 gatto + 7 coniglio) con 3-5 patologie ciascuna.

Struttura per ogni patologia:
```javascript
{
    name: "Displasia dell'anca",
    clinicalKeywords: ["displasia", "anca", "zoppia"],
    typicalMeds: [
        { name: "Meloxicam", dosage: "0.1 mg/kg", frequency: "SID",
          duration: "cronico", instructions: "FANS. Con il pasto." }
    ],
    vitalAnomalies: { weight: "tendency_high" },
    promoTags: ["clinical:joint_issues"],
    soapContext: "zoppia posteriore, difficoltà nell'alzarsi",
    docTypes: ["rx", "emocromocitometrico"]
}
```

**Razze da coprire** (da `app-testdata.js`):
- **Cani:** Labrador Retriever, Pastore Tedesco, Golden Retriever, Bulldog Francese, Beagle, Setter Irlandese, Jack Russell Terrier, Border Collie, Cocker Spaniel, Bassotto
- **Gatti:** Europeo, Persiano, Siamese, Maine Coon, British Shorthair, Ragdoll, Bengala, Sphynx, Norvegese, Certosino
- **Conigli:** Ariete Nano, Testa di Leone, Rex, Angora, Olandese Nano, Hotot, Californiano

---

## §9. Checklist PR 14

**Frontend:**
- [ ] Crea `docs/app-seed.js`
- [ ] Aggiungi `page-seed` in `index.html` (visibile solo debug)
- [ ] Aggiungi `.seed-nav-item` in sidebar (visibile solo debug)
- [ ] Registra script + pagina in `ROLE_PERMISSIONS`

**Backend:**
- [ ] Crea `backend/src/seed.routes.js` (5 endpoint: start, status, cancel, wipe, config)
- [ ] Crea `backend/src/seed.service.js` (orchestratore 9 fasi)
- [ ] Crea `backend/src/seed.petgen.js` (profili + `BREED_PATHOLOGIES` per 27 razze)
- [ ] Registra `seedRouter` in `server.js`

**Verifica:**
- [ ] 10 pet, 3 SOAP/pet, 2 doc/pet → coerenza clinica (patologia→farmaci→referti→documenti)
- [ ] Tag calcolati dopo seed
- [ ] Progress bar e polling funzionano
- [ ] Annullamento a metà job
- [ ] Wipe rimuove tutto con marker `[seed]`
- [ ] Modalità "append" non tocca dati esistenti
- [ ] Tutti gli smoke test Playwright passano

---

# PR 15 — SEED ENGINE PROMO: WEB SCRAPING + IMPORT

**Scope:** Estende il Seed Engine con la parte promo: ricerca siti brand, web scraping prodotti, import nel catalogo, generazione campagne.

**Dipendenza:** PR 14 (usa infrastruttura seed + seed.routes.js).

**File coinvolti:**

| Azione | File |
|--------|------|
| CREA | `backend/src/seed.promogen.js` |
| MODIFICA | `backend/src/seed.routes.js` (3 endpoint promo aggiuntivi) |
| MODIFICA | `docs/app-seed.js` (sezione brand search/scrape/import) |
| MODIFICA | `docs/index.html` (card promo nella page-seed) |
| MODIFICA | `backend/package.json` (aggiungere `cheerio`) |

---

## §10. Flusso utente

```
1. Utente inserisce brand ("Royal Canin, Hill's")
2. Click "🔍 Cerca siti" → POST /api/seed/promo/search-brand
3. ADA mostra lista siti con checkbox (tutti selezionati di default)
4. Utente può deselezionare o aggiungere URL manuali
5. Click "📥 Estrai prodotti" → POST /api/seed/promo/scrape-sites
6. ADA mostra prodotti estratti con checkbox
7. Utente conferma selezione → POST /api/seed/promo/import
8. Prodotti inseriti in promo_items con status='published'
```

### 10.1 Card HTML promo (da aggiungere in `page-seed`)

```html
<div class="card" style="margin-bottom:15px;">
    <label style="font-weight:600;display:block;margin-bottom:8px;">📦 Popolamento Promo — Brand e Prodotti</label>
    <p style="font-size:12px;color:#666;margin-bottom:10px;">
        Inserisci brand. ADA cercherà i siti ufficiali e ti proporrà i prodotti da importare.
    </p>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" id="seedBrandInput" placeholder="es. Royal Canin, Hill's, Purina..." style="flex:1;">
        <button class="btn btn-primary" onclick="seedSearchBrand()">🔍 Cerca siti</button>
    </div>
    <div id="seedBrandResults" style="display:none;"></div>
    <div style="margin-top:8px;">
        <input type="text" id="seedExtraSiteInput" placeholder="Aggiungi URL manualmente..." style="width:70%;">
        <button class="btn btn-secondary" onclick="seedAddExtraSite()">➕ Aggiungi</button>
    </div>
    <button class="btn btn-primary" id="seedScrapeBtn" onclick="seedScrapeSites()" style="display:none;margin-top:10px;">
        📥 Estrai prodotti dai siti selezionati
    </button>
    <div id="seedScrapeResults" style="display:none;"></div>
</div>
```

### 10.2 Funzioni frontend aggiuntive in `app-seed.js`

- `seedSearchBrand()` → POST `/api/seed/promo/search-brand` → renderizza siti con checkbox
- `seedToggleSite(idx, checked)` → toggle selezione sito
- `seedAddExtraSite()` → aggiunge URL dalla input manuale
- `seedScrapeSites()` → POST `/api/seed/promo/scrape-sites` → renderizza prodotti con checkbox
- `seedToggleProduct(idx, checked)` → toggle selezione prodotto
- `seedConfirmProducts()` → POST `/api/seed/promo/import` → toast conferma

---

## §11. Backend: `seed.promogen.js`

### 11.1 `searchBrandSites(brands, openAiKey)`

**Strategia a due livelli:**

**Livello 1 — URL noti (istantaneo, no API):**
```javascript
const KNOWN_BRAND_URLS = {
    "royal canin": [
        { url: "https://www.royalcanin.com/it/dogs/products", name: "Royal Canin IT — Cani" },
        { url: "https://www.royalcanin.com/it/cats/products", name: "Royal Canin IT — Gatti" }
    ],
    "hill's": [
        { url: "https://www.hillspet.it/prodotti-cane", name: "Hill's IT — Cani" },
        { url: "https://www.hillspet.it/prodotti-gatto", name: "Hill's IT — Gatti" }
    ],
    "purina": [
        { url: "https://www.purina.it/cane/prodotti", name: "Purina IT — Cani" },
        { url: "https://www.purina.it/gatto/prodotti", name: "Purina IT — Gatti" }
    ],
    "monge": [
        { url: "https://www.monge.it/prodotti/cane", name: "Monge — Cani" },
        { url: "https://www.monge.it/prodotti/gatto", name: "Monge — Gatti" }
    ],
    "farmina": [
        { url: "https://www.farmina.com/it/cane/", name: "Farmina — Cani" },
        { url: "https://www.farmina.com/it/gatto/", name: "Farmina — Gatti" }
    ],
    "virbac": [
        { url: "https://it.virbac.com/prodotti", name: "Virbac IT — Prodotti" }
    ],
    "bayer": [
        { url: "https://www.bfriendsanimalhealth.it/prodotti", name: "Bayer Animal Health IT" }
    ]
};
```

**Livello 2 — OpenAI (se il brand non è in lista):**

Chiede a OpenAI: _"Quali sono i siti web ufficiali italiani per i prodotti veterinari/pet food del brand {brand}? Rispondi in JSON: [{url, name, description}]."_

Ritorna: `{ sites: [{url, name, description}] }`.

### 11.2 `scrapeProductsFromSites(siteUrls, openAiKey)`

Per ogni URL:
1. `fetch(url)` → HTML
2. Parse con `cheerio` per estrarre link prodotto e dati strutturati
3. Se structured data (JSON-LD, Open Graph) trovato → estrai direttamente
4. Se non sufficiente e `openAiKey` disponibile → manda un riassunto dell'HTML a OpenAI per interpretazione

**Schema prodotto estratto:**
```javascript
{
    name: "Royal Canin Maxi Adult",
    category: "food_general",       // food_general | food_clinical | supplement | antiparasitic | accessory | service
    species: ["dog"],               // dog | cat | rabbit | all
    lifecycle_target: ["adult"],    // puppy | adult | senior
    description: "Alimento completo per cani adulti di taglia grande...",
    product_url: "https://...",
    image_url: "https://...",
    price_range: "€25-45",
    tags_include: ["size:large", "lifecycle:adult"],
    tags_exclude: [],
    source_site: "royalcanin.com"
}
```

### 11.3 `importProductsToCatalog(pool, products)`

Per ogni prodotto confermato:
1. `promo_item_id` = `"seed-" + randomUUID().slice(0, 8)`
2. `tenant_id` = primo tenant esistente, oppure `"seed-tenant"`
3. INSERT in `promo_items` con `status = 'published'`
4. Crea/aggiorna campagna `promo_campaigns` con `utm_campaign = 'seed_import_YYYYMMDD'`
5. Collega via `campaign_items`

---

## §12. Checklist PR 15

**Backend:**
- [ ] Crea `backend/src/seed.promogen.js` con searchBrandSites, scrapeProductsFromSites, importProductsToCatalog
- [ ] Aggiungi `cheerio` a `backend/package.json`
- [ ] Aggiungi 3 endpoint promo in `seed.routes.js`: search-brand, scrape-sites, import

**Frontend:**
- [ ] Aggiungi card promo in page-seed (§10.1)
- [ ] Aggiungi funzioni brand/scrape/import in app-seed.js (§10.2)

**Verifica:**
- [ ] Cerca "Royal Canin" → mostra siti con checkbox
- [ ] Aggiungi URL manuale → appare in lista
- [ ] Scraping estrae almeno 5+ prodotti reali
- [ ] Import inserisce in promo_items con status published
- [ ] Dashboard admin mostra i prodotti importati
- [ ] Eligibility engine seleziona prodotti seed per pet seed
- [ ] Tutti gli smoke test Playwright passano

---

# APPENDICE A — Riepilogo entità popolate (19 totali)

| # | Entità | Tabella/Campo | Marker seed | PR |
|---|--------|---------------|-------------|-----|
| 1 | Pet anagrafica | `pets` | `notes LIKE '%[seed]%'` | 14 |
| 2 | Stile di vita | `pets.extra_data.lifestyle` | (nel pet) | 14 |
| 3 | Referti SOAP | `pets.extra_data.history_data` | (nel pet) | 14 |
| 4 | Documenti caricati | `documents` | FK pet seed | 14 |
| 5 | Parametri vitali | `pets.extra_data.vitals_data` | (nel pet) | 14 |
| 6 | Farmaci | `pets.extra_data.medications` | (nel pet) | 14 |
| 7 | Foto | `pets.extra_data.photos` | (nel pet) | 14 |
| 8 | Profilo sanitario vet | `pets.notes` (diary) | `[seed]` | 14 |
| 9 | Profilo sanitario owner | `pets.extra_data.owner_diary` | (nel pet) | 14 |
| 10 | Tag calcolati | `pet_tags` | FK pet seed | 14 |
| 11 | Consensi | `consents` | owner_user_id | 14 |
| 12 | Tenant | `tenants` | `seed-tenant` | 14 |
| 13 | Budget | `tenant_budgets` | `seed-tenant` | 14 |
| 14 | Pet changes | `pet_changes` | FK pet seed | 14 |
| 15 | Changes generic | `changes` | FK pet seed | 14 |
| 16 | Catalogo promo | `promo_items` | `promo_item_id LIKE 'seed-%'` | 15 |
| 17 | Campagne | `promo_campaigns` | `utm_campaign LIKE 'seed_%'` | 15 |
| 18 | Campaign items | `campaign_items` | FK campagna seed | 15 |
| 19 | Eventi promo | `promo_events` | `metadata.seeded = 'true'` | 14 |

---

# APPENDICE B — Dipendenze tra PR

```
PR 13 (Debug Logging)
  ↓ beneficio (non bloccante)
PR 14 (Seed Core)
  ↓ dipendenza (seed.routes + infrastruttura)
PR 15 (Seed Promo)
```

PR 13 è completamente indipendente. PR 14 e PR 15 condividono `seed.routes.js` — PR 15 aggiunge endpoint. Se si vuole, PR 14 e 15 possono essere fusi in un unico PR, ma la separazione riduce la dimensione del codice da revisionare e isola il rischio web-scraping (che dipende da siti esterni).
