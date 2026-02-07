# ADA — Ottimizzazioni OpenAI API — Specifica Tecnica per Claude Code

**Versione**: 1.0
**Data**: 2025-02-07
**Target version**: ADA v7.3.0
**Branch**: `feat/openai-optimizations`

---

## Obiettivo

Ridurre i costi OpenAI senza degradare le funzionalità core, con toggle super_admin per attivare/disattivare tutte le ottimizzazioni. Quando le ottimizzazioni sono OFF, il comportamento dell'app deve essere **identico** a quello attuale.

---

## Indice delle modifiche

| # | Modifica | File coinvolti | Rischio |
|---|----------|---------------|---------|
| 1 | Bugfix tracking identifySpeakers | `docs/app-recording.js` | Nessuno |
| 2 | Policy DB + endpoint backend | `backend/src/dashboard.routes.js` | Basso |
| 3 | Endpoint lettura policy (auth) | `backend/src/server.js` | Basso |
| 4 | Nuovo file frontend: optimization layer | `docs/app-openai-optimizations.js` | Basso |
| 5 | UI Settings card (super_admin) | `docs/index.html`, `docs/styles.css` | Basso |
| 6 | Init UI settings + salvataggio | `docs/app-core.js` | Basso |
| 7 | Model routing: task secondari → mini | `docs/app-core.js`, `docs/app-data.js`, `docs/app-tips.js`, `docs/app-soap.js` | Medio |
| 8 | SOAP segments compaction (senza troncamento) | `docs/app-soap.js` | Medio |
| 9 | Smart diarization | `docs/app-recording.js` | Medio |
| 10 | Document explain → mini | `backend/src/documents.routes.js` | Basso |
| 11 | Document read: PDF parsing locale | `backend/src/documents.routes.js`, `backend/package.json` | Medio |

---

## 1. Bugfix: tracking costi identifySpeakers

**File**: `docs/app-recording.js`
**Riga**: ~2082

### Problema
La funzione `identifySpeakers()` usa `model: 'gpt-4o-mini'` (riga ~2053) ma tracka i costi come `gpt-4o`:

```javascript
// ATTUALE (riga ~2082) — BUG
trackChatUsage('gpt-4o', data.usage);
```

### Fix

```javascript
// CORRETTO
trackChatUsage('gpt-4o-mini', data.usage);
```

Questo fix è **indipendente** da tutte le altre ottimizzazioni e va applicato comunque.

---

## 2. Policy DB + endpoint backend (super_admin write)

### 2.1 Record in `global_policies`

Usare la tabella `global_policies` esistente con:
- `policy_key`: `'openai_optimizations'`
- `policy_value` (JSONB):
```json
{
  "enabled": false,
  "smart_diarization": false
}
```
- Default se assente: `{ "enabled": false, "smart_diarization": false }`

### 2.2 Endpoint write (super_admin only)

**File**: `backend/src/dashboard.routes.js`

Aggiungere endpoint dedicato **dopo** il blocco degli endpoint `superadmin/policies` esistenti (~riga 1195):

```javascript
// PUT /api/superadmin/openai-optimizations
router.put(
  "/api/superadmin/openai-optimizations",
  requireAuth,
  requireRole(["super_admin"]),
  async (req, res) => {
    try {
      const { enabled, smart_diarization } = req.body || {};
      const value = {
        enabled: !!enabled,
        smart_diarization: !!smart_diarization
      };

      const { rows } = await pool.query(
        `INSERT INTO global_policies (policy_key, policy_value, description, updated_by)
         VALUES ('openai_optimizations', $1, 'OpenAI cost optimizations toggle', $2)
         ON CONFLICT (policy_key) DO UPDATE SET
           policy_value = $1, updated_by = $2, updated_at = NOW()
         RETURNING *`,
        [JSON.stringify(value), req.promoAuth?.userId]
      );

      res.json(rows[0]);
    } catch (e) {
      console.error("PUT /api/superadmin/openai-optimizations error", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
```

---

## 3. Endpoint lettura policy (tutti gli utenti autenticati)

**File**: `backend/src/server.js`

Aggiungere **prima** della riga `app.post("/api/chat", ...)` (riga ~374):

```javascript
// GET /api/policies/openai-optimizations — any authenticated user
app.get("/api/policies/openai-optimizations", requireAuth, async (_req, res) => {
  const defaults = { enabled: false, smart_diarization: false };
  try {
    const { getPool } = require("./db");
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'openai_optimizations'"
    );
    if (rows.length > 0 && rows[0].policy_value) {
      const val = typeof rows[0].policy_value === 'string'
        ? JSON.parse(rows[0].policy_value)
        : rows[0].policy_value;
      res.json({
        enabled: !!val.enabled,
        smart_diarization: !!val.smart_diarization
      });
    } else {
      res.json(defaults);
    }
  } catch (e) {
    console.error("GET /api/policies/openai-optimizations error", e);
    res.json(defaults); // fail-safe: default OFF
  }
});
```

**Nota**: il fail-safe è fondamentale. Se il DB non risponde, tutto resta OFF.

---

## 4. Nuovo file frontend: `docs/app-openai-optimizations.js`

Creare un nuovo file `docs/app-openai-optimizations.js` che gestisce la lettura, cache e model routing.

### 4.1 Struttura completa

```javascript
// docs/app-openai-optimizations.js v1
// OpenAI optimization layer — model routing + policy cache

(function () {
  'use strict';

  const CACHE_KEY = 'ada_openai_opt_flags';
  const CACHE_TS_KEY = 'ada_openai_opt_fetched_at';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti

  const DEFAULTS = { enabled: false, smart_diarization: false };

  // ---- Cache read/write ----

  function _readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (Date.now() - ts > CACHE_TTL_MS) return null; // expired
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function _writeCache(flags) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  // ---- Public API ----

  /**
   * Returns cached flags synchronously. Never blocks.
   * Returns DEFAULTS if no cache or cache expired.
   */
  window.getOpenAiOptimizationFlags = function () {
    return _readCache() || { ...DEFAULTS };
  };

  /**
   * Fetches flags from backend. Updates cache.
   * @param {boolean} force - if true, ignores cache TTL
   * @returns {Promise<{enabled:boolean, smart_diarization:boolean}>}
   */
  window.refreshOpenAiOptimizationFlags = async function (force) {
    if (!force) {
      const cached = _readCache();
      if (cached) return cached;
    }
    try {
      const resp = await fetchApi('/api/policies/openai-optimizations');
      if (resp.ok) {
        const flags = await resp.json();
        const result = {
          enabled: !!flags.enabled,
          smart_diarization: !!flags.smart_diarization
        };
        _writeCache(result);
        return result;
      }
    } catch (e) {
      console.warn('refreshOpenAiOptimizationFlags error:', e);
    }
    return _readCache() || { ...DEFAULTS };
  };

  window.isOpenAiOptimizationsEnabled = function () {
    return !!(getOpenAiOptimizationFlags().enabled);
  };

  window.isSmartDiarizationEnabled = function () {
    const f = getOpenAiOptimizationFlags();
    return !!(f.enabled && f.smart_diarization);
  };

  // ---- Model routing ----

  /**
   * Mapping dei task ai modelli quando le ottimizzazioni sono attive.
   * Se enabled=false, ritorna sempre il defaultModel.
   *
   * SOAP generation resta SEMPRE su gpt-4o.
   */
  const TASK_MODEL_MAP = {
    // Task che passano a mini quando enabled=true
    translate:            { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    text_correction:      { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    diary_generate:       { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_answer:           { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_faq:              { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    tips_generate:        { model: 'gpt-4o-mini', temperature: 0.6, max_tokens: 3600 },
    owner_explanation:    { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1600 },
    glossary_generate:    { model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 800 },
    faq_generate:         { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },

    // SOAP resta SEMPRE su gpt-4o (non presente qui = usa default)
  };

  /**
   * Ritorna il modello da usare per un dato task.
   * @param {string} task - chiave del task (es. 'translate', 'soap_generate')
   * @param {string} defaultModel - modello di fallback (default 'gpt-4o')
   * @returns {string} nome del modello
   */
  window.getAiModelForTask = function (task, defaultModel) {
    defaultModel = defaultModel || 'gpt-4o';
    if (!isOpenAiOptimizationsEnabled()) return defaultModel;
    const entry = TASK_MODEL_MAP[task];
    return entry ? entry.model : defaultModel;
  };

  /**
   * Ritorna i parametri suggeriti per un task (temperature, max_tokens).
   * Se ottimizzazioni OFF o task non mappato, ritorna oggetto vuoto.
   * Il chiamante usa i valori come override opzionale:
   *   temperature: params.temperature ?? <valore_originale>
   */
  window.getAiParamsForTask = function (task) {
    if (!isOpenAiOptimizationsEnabled()) return {};
    const entry = TASK_MODEL_MAP[task];
    if (!entry) return {};
    const result = {};
    if (entry.temperature !== undefined) result.temperature = entry.temperature;
    if (entry.max_tokens !== undefined) result.max_tokens = entry.max_tokens;
    return result;
  };

})();
```

### 4.2 Inclusione in index.html

In `docs/index.html`, aggiungere lo script **prima** di `app-core.js`:

```html
<script src="app-openai-optimizations.js"></script>
```

Cercare il tag `<script src="app-core.js">` e inserire la riga appena prima.

---

## 5. UI Settings card (solo super_admin)

### 5.1 HTML

**File**: `docs/index.html`

Aggiungere la seguente card **subito prima** della card "Sistema" nella sezione `#page-settings` (prima di `<div class="card"><h3>Sistema</h3>`):

```html
<!-- OpenAI Optimizations (super_admin only) -->
<div id="openaiOptCard" class="card" style="display:none;">
    <h3>🤖 OpenAI — Ottimizzazioni</h3>
    <p style="color:#666;font-size:13px;margin-bottom:15px;">
        Quando attive, i task secondari (traduzioni, tips, FAQ, glossario, spiegazione proprietario)
        usano un modello più economico. Il SOAP resta invariato.
        Se disattive, tutto torna come prima.
    </p>

    <div class="form-group" style="margin-bottom: 15px;">
        <label style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="openaiOptEnabled">
            <span>Ottimizzazioni globali attive</span>
        </label>
    </div>

    <div class="form-group" style="margin-bottom: 15px;">
        <label style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="openaiOptSmartDiarization">
            <span>Diarizzazione solo quando serve</span>
        </label>
        <p style="font-size: 12px; color: #888; margin-top: 5px;">
            Se attiva e nessun parlante è configurato, salta il tentativo di diarizzazione
            (usa Whisper diretto, più veloce ed economico). Effettiva solo se le ottimizzazioni globali sono attive.
        </p>
    </div>

    <button class="btn btn-primary" id="btnSaveOpenaiOpt" onclick="saveOpenAiOptimizations()">
        💾 Salva
    </button>
</div>
```

### 5.2 CSS (opzionale)

Non servono stili aggiuntivi: la card usa le classi `.card`, `.form-group`, `.btn`, `.btn-primary` già presenti.

---

## 6. Init UI + salvataggio

**File**: `docs/app-core.js`

### 6.1 Funzione di init

Aggiungere queste funzioni in fondo al file (prima dell'ultima `}` o alla fine delle funzioni globali):

```javascript
// ============================================
// OPENAI OPTIMIZATIONS SETTINGS (super_admin)
// ============================================

async function initOpenAiOptimizationsSettingsUI() {
    const card = document.getElementById('openaiOptCard');
    if (!card) return;

    // Mostra solo per super_admin
    if (getActiveRole() !== 'super_admin') {
        card.style.display = 'none';
        return;
    }

    card.style.display = '';

    try {
        const flags = await refreshOpenAiOptimizationFlags(true);
        document.getElementById('openaiOptEnabled').checked = !!flags.enabled;
        document.getElementById('openaiOptSmartDiarization').checked = !!flags.smart_diarization;
    } catch (e) {
        console.warn('initOpenAiOptimizationsSettingsUI error:', e);
    }
}

async function saveOpenAiOptimizations() {
    const enabled = document.getElementById('openaiOptEnabled').checked;
    const smart_diarization = document.getElementById('openaiOptSmartDiarization').checked;

    try {
        const resp = await fetchApi('/api/superadmin/openai-optimizations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, smart_diarization })
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => null);
            throw new Error(err?.error || `HTTP ${resp.status}`);
        }

        // Aggiorna cache locale
        await refreshOpenAiOptimizationFlags(true);

        showToast('✅ Ottimizzazioni salvate', 'success');
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
    }
}
```

### 6.2 Chiamata alla init

Nella funzione `navigateToPage(page)` (in `app-core.js`, ~riga 240-340), aggiungere dopo gli altri init condizionali per le pagine:

```javascript
if (page === 'settings') {
    initOpenAiOptimizationsSettingsUI();
}
```

Cercare il punto dove viene gestito `page === 'settings'` (oppure dove ci sono i vari `if (page === 'superadmin-users' && ...)` e aggiungere questa condizione nello stesso blocco.

---

## 7. Model routing: collegare i call-site

Per ogni call-site, il pattern è:

```javascript
// PRIMA (esempio)
model: 'gpt-4o',
temperature: 0.5

// DOPO
model: getAiModelForTask('TASK_NAME', 'gpt-4o'),
temperature: getAiParamsForTask('TASK_NAME').temperature ?? 0.5,
```

E aggiornare il tracking:

```javascript
// PRIMA
trackChatUsage('gpt-4o', data.usage);

// DOPO
const _usedModel = getAiModelForTask('TASK_NAME', 'gpt-4o');
trackChatUsage(_usedModel, data.usage);
```

### 7.1 `docs/app-core.js` — translateText (~riga 1890)

```javascript
// translateText()
const _model = getAiModelForTask('translate', 'gpt-4o');
const _params = getAiParamsForTask('translate');

body: JSON.stringify({
    model: _model,
    messages: [{ role: 'user', content: `Traduci in ${langNames[targetLang]}. Rispondi SOLO con la traduzione:\n\n${text}` }],
    temperature: _params.temperature ?? 0.3
})

// tracking:
trackChatUsage(_model, data.usage);
```

### 7.2 `docs/app-core.js` — sendFullscreenCorrection (~riga 1314)

```javascript
// sendFullscreenCorrection() — applyResponse
const _corrModel = getAiModelForTask('text_correction', 'gpt-4o');
const _corrParams = getAiParamsForTask('text_correction');

body: JSON.stringify({
    model: _corrModel,
    messages: [...],
    temperature: _corrParams.temperature ?? 0.3
})
```

**Nota**: qui non c'è un `trackChatUsage` esplicito per la correction. Se vuoi aggiungerne uno, fallo con `trackChatUsage(_corrModel, applyResult.usage)` — ma solo se `applyResult.usage` esiste.

### 7.3 `docs/app-data.js` — generateDiary (~riga 299)

```javascript
const _diaryModel = getAiModelForTask('diary_generate', 'gpt-4o');
const _diaryParams = getAiParamsForTask('diary_generate');

body: JSON.stringify({
    model: _diaryModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _diaryParams.temperature ?? 0.5
})

// tracking (~riga 314):
trackChatUsage(_diaryModel, data.usage);
```

### 7.4 `docs/app-data.js` — QnA answer (~riga 506)

```javascript
const _qnaModel = getAiModelForTask('qna_answer', 'gpt-4o');
const _qnaParams = getAiParamsForTask('qna_answer');

body: JSON.stringify({
    model: _qnaModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _qnaParams.temperature ?? 0.5
})

// tracking (~riga 524):
trackChatUsage(_qnaModel, data.usage);
```

### 7.5 `docs/app-data.js` — generateQnAFaq (~riga 549)

```javascript
const _faqModel = getAiModelForTask('qna_faq', 'gpt-4o');
const _faqParams = getAiParamsForTask('qna_faq');

body: JSON.stringify({
    model: _faqModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _faqParams.temperature ?? 0.6
})

// tracking (~riga 584):
trackChatUsage(_faqModel, data.usage);
```

### 7.6 `docs/app-tips.js` — _callTipsLLM (~riga 174)

```javascript
const _tipsModel = getAiModelForTask('tips_generate', 'gpt-4o');
const _tipsParams = getAiParamsForTask('tips_generate');

body: JSON.stringify({
    model: _tipsModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _tipsParams.temperature ?? 0.7,
    max_tokens: _tipsParams.max_tokens ?? 3600,
    response_format: { type: 'json_object' }
})

// tracking (~riga 201):
trackChatUsageOrEstimate(_tipsModel, prompt, content, data.usage);
```

### 7.7 `docs/app-soap.js` — generateOwnerExplanation (~riga 1126)

```javascript
const _ownerModel = getAiModelForTask('owner_explanation', 'gpt-4o');
const _ownerParams = getAiParamsForTask('owner_explanation');

body: JSON.stringify({
    model: _ownerModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _ownerParams.temperature ?? 0.5,
})

// tracking (~riga 1147):
trackChatUsageOrEstimate(_ownerModel, prompt, explanation, data.usage);
```

### 7.8 `docs/app-soap.js` — generateGlossary (~riga 1291)

```javascript
const _glossModel = getAiModelForTask('glossary_generate', 'gpt-4o');
const _glossParams = getAiParamsForTask('glossary_generate');

body: JSON.stringify({
    model: _glossModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _glossParams.temperature ?? 0.4,
})

// tracking (~riga 1331):
trackChatUsageOrEstimate(_glossModel, prompt, content, data.usage);
```

### 7.9 `docs/app-soap.js` — generateFAQ (~riga 1373)

```javascript
const _faqSoapModel = getAiModelForTask('faq_generate', 'gpt-4o');
const _faqSoapParams = getAiParamsForTask('faq_generate');

body: JSON.stringify({
    model: _faqSoapModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: _faqSoapParams.temperature ?? 0.5,
})

// tracking (~riga 1401):
trackChatUsageOrEstimate(_faqSoapModel, prompt, content, data.usage);
```

### 7.10 SOAP generation — NESSUNA MODIFICA AL MODELLO

I seguenti punti in `app-soap.js` restano **invariati** su `gpt-4o`:
- `generateSOAPStructured()` (~riga 370, 389)
- `generateSOAPFallback()` (~riga 476)
- `generateSOAPFallbackTextOnly()` (~riga 554)

**Non toccare il modello del SOAP.**

---

## 8. SOAP segments compaction (senza troncamento)

**File**: `docs/app-soap.js`

### 8.1 Modificare `formatSegmentsForPrompt`

Aggiungere un parametro `options` opzionale:

```javascript
function formatSegmentsForPrompt(segments, options) {
    if (!Array.isArray(segments) || segments.length === 0) return '';

    const compact = options && options.compact;

    function fmtNum(x) {
        const n = Number(x);
        if (!Number.isFinite(n)) return '0.0';
        return (Math.round(n * 10) / 10).toFixed(1);
    }

    if (!compact) {
        // Comportamento originale — invariato
        return segments.map(seg => {
            const idx = (seg.segment_index !== undefined && seg.segment_index !== null) ? seg.segment_index : '';
            const start = fmtNum(seg.start);
            const end = fmtNum(seg.end);
            const speaker = (seg.speaker || 'sconosciuto').toString().trim();
            const role = (seg.role || 'unknown').toString().trim();
            const t = (seg.text || '').toString().replace(/\s+/g, ' ').trim();
            return `[SEG ${idx}] (${start}-${end}) ${speaker} [${role}]: ${t}`;
        }).join('\n');
    }

    // --- Compact mode: merge segmenti consecutivi dello stesso speaker ---
    const merged = [];
    let current = null;

    for (const seg of segments) {
        const speaker = (seg.speaker || 'sconosciuto').toString().trim();
        const role = (seg.role || 'unknown').toString().trim();
        const text = (seg.text || '').toString().replace(/\s+/g, ' ').trim();
        const idx = (seg.segment_index !== undefined && seg.segment_index !== null) ? seg.segment_index : null;
        const start = Number(seg.start) || 0;
        const end = Number(seg.end) || 0;

        // Merge se stesso speaker+role e gap <= 1.5s
        if (current && current.speaker === speaker && current.role === role && (start - current.end) <= 1.5) {
            current.ids.push(idx);
            current.texts.push(text);
            current.end = end;
        } else {
            if (current) merged.push(current);
            current = {
                speaker, role, ids: [idx], texts: [text],
                start: start, end: end
            };
        }
    }
    if (current) merged.push(current);

    // Formattare i blocchi merged
    return merged.map(block => {
        const idsStr = block.ids.filter(id => id !== null).join(',');
        const textStr = block.texts.join(' ');
        return `[SEG ${idsStr}] ${block.speaker} [${block.role}]: ${textStr}`;
    }).join('\n');
}
```

**Nota critica**: il testo NON viene troncato. Si rimuovono solo timestamp ridondanti e si uniscono segmenti consecutivi dello stesso speaker. Questo riduce i token del prompt senza perdere contenuto clinico.

### 8.2 Collegare al generateSOAPStructured

In `generateSOAPStructured()` (~riga 335), modificare:

```javascript
// PRIMA
const segmentsText = segmentsSource.length > 0 ? formatSegmentsForPrompt(segmentsSource) : '';

// DOPO
const compactSegments = typeof isOpenAiOptimizationsEnabled === 'function' && isOpenAiOptimizationsEnabled();
const segmentsText = segmentsSource.length > 0
    ? formatSegmentsForPrompt(segmentsSource, { compact: compactSegments })
    : '';
```

### 8.3 Istruzione al modello

Se `compact` è true, il formato `[SEG 12,13,14]` contiene ID multipli. L'istruzione esistente dice già di usare `supporting_segment_ids` con gli id presenti nel tag `[SEG ...]`, quindi non serve modificare `SOAP_SYSTEM_INSTRUCTIONS`. I singoli id presenti nella lista separata da virgole verranno correttamente interpretati dal modello.

---

## 9. Smart diarization

**File**: `docs/app-recording.js`

### 9.1 Modificare `transcribeAudio()`

All'inizio di `transcribeAudio()` (~riga 1607), **dopo** i check su `audioBlob` e **prima** di `showProgress(true)`, inserire:

```javascript
// Smart diarization: skip diarization if no speakers configured and optimization is active
let skipDiarization = false;
try {
    if (typeof isSmartDiarizationEnabled === 'function' && isSmartDiarizationEnabled()) {
        const speakersCheck = await getSavedSpeakersForTranscription();
        if (speakersCheck.length === 0) {
            skipDiarization = true;
        }
    }
} catch (e) {
    console.warn('Smart diarization check failed, proceeding normally:', e);
}

if (skipDiarization) {
    showProgress(true);
    const t0 = performance.now();
    const recordedMinutes = seconds > 0 ? seconds / 60 : 1;
    document.getElementById('recordingStatus').textContent = '⏳ Trascrizione economica (nessun parlante configurato)...';

    if (typeof ADALog !== 'undefined') {
        ADALog.info('OPENAI', 'smart diarization: skipping diarize, using whisper direct', {});
    }

    try {
        await transcribeWithWhisperFallback(recordedMinutes);
    } catch (e) {
        if (isAbortError(e)) throw e;
        showToast('Errore trascrizione: ' + e.message, 'error');
        document.getElementById('recordingStatus').textContent = '❌ Errore trascrizione';
    }

    if (typeof ADALog !== 'undefined') {
        ADALog.info('REC', 'pipeline done (smart diarization)', {
            totalLatencyMs: Math.round(performance.now() - t0),
            transcriptLengthChars: (document.getElementById('transcriptionText')?.value || '').length,
            fallbackUsed: true,
            smartDiarization: true
        });
        ADALog.endCorrelation();
    }

    showProgress(false);
    resetTimer();
    audioBlob = null;
    return; // skip the rest of the normal pipeline
}
```

Questo blocco va inserito **prima** della riga `showProgress(true);` e del `const t0 = performance.now();` della pipeline normale (~riga 1621-1622).

### 9.2 Regola di comportamento

| `enabled` | `smart_diarization` | Speakers configurati | Comportamento |
|-----------|---------------------|---------------------|---------------|
| `false`   | qualsiasi           | qualsiasi           | Come oggi (diarize-first) |
| `true`    | `false`             | qualsiasi           | Come oggi (diarize-first) |
| `true`    | `true`              | ≥ 1                 | Come oggi (diarize-first) |
| `true`    | `true`              | 0                   | **Whisper diretto** (no diarize) |

---

## 10. Document explain → mini (backend)

**File**: `backend/src/documents.routes.js`

### 10.1 Helper per leggere la policy

Aggiungere in cima al file (dopo le require, prima del `module.exports`):

```javascript
// Cache policy optimization flags (TTL 60s)
let _optFlagsCache = null;
let _optFlagsCacheTs = 0;
const OPT_FLAGS_CACHE_TTL = 60_000;

async function getOptimizationFlags(pool) {
  const now = Date.now();
  if (_optFlagsCache && (now - _optFlagsCacheTs) < OPT_FLAGS_CACHE_TTL) {
    return _optFlagsCache;
  }
  const defaults = { enabled: false, smart_diarization: false };
  try {
    const { rows } = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'openai_optimizations'"
    );
    if (rows.length > 0 && rows[0].policy_value) {
      const val = typeof rows[0].policy_value === 'string'
        ? JSON.parse(rows[0].policy_value)
        : rows[0].policy_value;
      _optFlagsCache = { enabled: !!val.enabled, smart_diarization: !!val.smart_diarization };
    } else {
      _optFlagsCache = defaults;
    }
  } catch (e) {
    console.warn('getOptimizationFlags error:', e.message);
    _optFlagsCache = defaults;
  }
  _optFlagsCacheTs = now;
  return _optFlagsCache;
}
```

### 10.2 Modificare processDocumentExplain

In `processDocumentExplain()` (~riga 586), cambiare il modello in base al flag:

```javascript
// PRIMA
const payload = {
  model: "gpt-4o",
  ...
};

// DOPO
const optFlags = await getOptimizationFlags(pool);
const explainModel = optFlags.enabled ? "gpt-4o-mini" : "gpt-4o";
const explainMaxTokens = optFlags.enabled ? 1600 : 2048;

const payload = {
  model: explainModel,
  messages: [
    {
      role: "system",
      content: "Sei il team AbuPet. Spiega il contenuto del documento veterinario al proprietario dell'animale in modo chiaro, empatico e rassicurante. ..." // invariato
    },
    {
      role: "user",
      content: `Spiega questo documento veterinario al proprietario dell'animale:\n\n${doc.read_text}`,
    },
  ],
  max_tokens: explainMaxTokens,
};
```

---

## 11. Document read: PDF parsing locale (backend)

**File**: `backend/src/documents.routes.js`, `backend/package.json`

### 11.1 Dipendenza

Aggiungere a `backend/package.json`:

```json
"pdf-parse": "^1.1.1"
```

E installare: `cd backend && npm install`

### 11.2 Modificare processDocumentRead

In `processDocumentRead()`, **prima** della chiamata OpenAI per documenti PDF, aggiungere un tentativo di estrazione locale:

```javascript
// Dopo aver ottenuto il buffer base64 e verificato che doc.mime_type === 'application/pdf'
// e PRIMA della chiamata OpenAI

const optFlags = await getOptimizationFlags(pool);

if (optFlags.enabled && doc.mime_type === 'application/pdf') {
  try {
    const pdfParse = require('pdf-parse');
    const pdfBuffer = Buffer.from(base64, 'base64');
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = (pdfData.text || '').trim();

    // Soglia: testo "abbastanza ricco" = >= 500 char e almeno 5 char per pagina
    const minChars = 500;
    const charsPerPage = pdfData.numpages > 0 ? extractedText.length / pdfData.numpages : 0;

    if (extractedText.length >= minChars && charsPerPage >= 50) {
      console.log(`processDocumentRead: PDF text extraction OK (${extractedText.length} chars, ${pdfData.numpages} pages)`);

      await pool.query(
        "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, extractedText]
      );

      serverLog('INFO', 'DOC', 'PDF text extraction (local, no API)', {
        documentId: doc.document_id,
        textLength: extractedText.length,
        pages: pdfData.numpages
      });

      return { text: extractedText };
    } else {
      console.log(`processDocumentRead: PDF text too sparse (${extractedText.length} chars, ${charsPerPage.toFixed(0)} chars/page), falling through to OpenAI`);
    }
  } catch (pdfErr) {
    console.warn('processDocumentRead: pdf-parse failed, falling through to OpenAI:', pdfErr.message);
  }
}

// ... continua con la chiamata OpenAI esistente
```

**Posizionamento**: questo blocco va inserito nella funzione `processDocumentRead()` **dopo** aver recuperato il `base64` del documento e **prima** di costruire il `contentParts` / `payload` per OpenAI.

### 11.3 Model routing per read (quando il PDF non è testuale)

Se le ottimizzazioni sono attive e il parsing locale fallisce, si tenta prima con `gpt-4o-mini`, poi fallback a `gpt-4o`:

```javascript
// Dopo il blocco pdf-parse, PRIMA della chiamata OpenAI attuale:
const readModel = optFlags.enabled ? "gpt-4o-mini" : "gpt-4o";

// Nella costruzione del payload:
const payload = {
  model: readModel,  // era "gpt-4o"
  messages: [...],
  max_tokens: 4096,
};
```

Se la risposta con `gpt-4o-mini` è sospettamente corta (< 100 caratteri) o ritorna errore 400, fare retry con `gpt-4o`:

```javascript
const readText = data.choices?.[0]?.message?.content || "";

// Se mini ha dato risultato troppo corto e stavamo usando mini, retry con 4o
if (optFlags.enabled && readModel === "gpt-4o-mini" && readText.length < 100) {
  console.log("processDocumentRead: mini result too short, retrying with gpt-4o");
  // Ripetere la chiamata con model: "gpt-4o"
  // (ristrutturare in un helper interno per evitare duplicazione)
}
```

**Suggerimento implementativo**: estrarre la logica di chiamata OpenAI in un helper `_callOpenAiForRead(pool, doc, oaKey, base64, contentParts, model)` per evitare duplicazione quando si fa il retry.

---

## Criteri di accettazione

1. **Bugfix tracking**: `identifySpeakers` tracka come `gpt-4o-mini` (non `gpt-4o`).

2. **Policy endpoints**:
   - `GET /api/policies/openai-optimizations` ritorna `{ enabled, smart_diarization }` (default `false/false`).
   - `PUT /api/superadmin/openai-optimizations` richiede ruolo `super_admin`, persiste in DB.
   - Se DB non risponde, il GET ritorna `{ enabled: false, smart_diarization: false }`.

3. **UI Settings**:
   - Con `super_admin`: card visibile, toggle funzionanti, salvataggio persistente.
   - Con altri ruoli: card non visibile.

4. **Con ottimizzazioni OFF**: comportamento identico ad oggi. Nessun modello cambia, nessuna pipeline cambia.

5. **Con ottimizzazioni ON**:
   - Model routing: translate, correction, diary, qna, tips, owner_explanation, glossary, faq → `gpt-4o-mini`.
   - SOAP generation → resta `gpt-4o` (invariato).
   - SOAP segments → compaction attiva (merge speaker consecutivi, nessun troncamento testo).
   - Document explain → `gpt-4o-mini`.
   - Document read PDF → tenta parsing locale, poi `gpt-4o-mini`, poi fallback `gpt-4o`.

6. **Smart diarization**:
   - `smart_diarization=false` (o `enabled=false`): pipeline trascrizione identica ad oggi.
   - `smart_diarization=true` + `enabled=true` + nessun parlante configurato → Whisper diretto.
   - `smart_diarization=true` + `enabled=true` + parlanti configurati → diarized come oggi.

7. **Fail-safe ovunque**: se `refreshOpenAiOptimizationFlags` fallisce, `isOpenAiOptimizationsEnabled()` ritorna `false`. Nessun crash.

---

## Note per Claude Code

- Parti da `origin/main` aggiornato e crea branch `feat/openai-optimizations`.
- Mantieni lo stile esistente del codice (try/catch, showToast, fetchApi, logging con ADALog).
- Aggiorna il commento di versione in prima riga dei file toccati.
- Minimizza le modifiche: se `enabled=false` non deve cambiare nulla.
- I numeri di riga indicati sono approssimativi (basati su v7.2.0). Usa grep/search per trovare i punti esatti.
- Non implementare: silence removal backend, caching trascrizioni IndexedDB. Sono stati rimandati.
- Installa `pdf-parse` nel backend: `cd backend && npm install pdf-parse`.
- Testa che l'app funzioni normalmente con le ottimizzazioni OFF prima di testare con ON.
