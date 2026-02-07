# ADA — PR 16-17: OpenAI Optimizations + Promo & Campagne

> **Versione:** 1.0 · **Data:** 08/02/2026 · **Baseline:** ADA v7.2.0  
> **Destinatario:** Claude Code per implementazione  
> **Struttura:** 2 PR indipendenti, eseguibili in qualsiasi ordine

---

## Indice

- **PR 16** — Ottimizzazioni OpenAI (§1-§8)
- **PR 17** — Promo, Campagne e Targeting (§9-§15)
- **Appendice** — Migrazione dati, dipendenze

---

# PR 16 — OTTIMIZZAZIONI OPENAI

**Scope:** Ridurre i costi OpenAI senza degradare le funzionalità core. Toggle super_admin per attivare/disattivare. Quando OFF, comportamento identico a oggi.

**Branch:** `feat/openai-optimizations`

**File coinvolti:**

| Azione | File |
|--------|------|
| CREA | `docs/app-openai-optimizations.js` |
| MODIFICA | `docs/app-recording.js` (bugfix tracking + smart diarization) |
| MODIFICA | `docs/app-core.js` (translateText, sendFullscreenCorrection, init settings UI) |
| MODIFICA | `docs/app-data.js` (generateDiary, QnA, QnA FAQ) |
| MODIFICA | `docs/app-tips.js` (_callTipsLLM) |
| MODIFICA | `docs/app-soap.js` (ownerExplanation, glossary, FAQ, segments compaction) |
| MODIFICA | `docs/index.html` (script tag + settings card) |
| MODIFICA | `backend/src/server.js` (GET policy endpoint) |
| MODIFICA | `backend/src/dashboard.routes.js` (PUT policy endpoint) |
| MODIFICA | `backend/src/documents.routes.js` (explain→mini, read PDF locale) |
| MODIFICA | `backend/package.json` (pdf-parse) |

---

## §1. Bugfix: tracking costi identifySpeakers

**File:** `docs/app-recording.js` ~riga 2082

La funzione usa `model: 'gpt-4o-mini'` (riga ~2053) ma tracka come `gpt-4o`. Correggere:

```javascript
// PRIMA (BUG)
trackChatUsage('gpt-4o', data.usage);
// DOPO
trackChatUsage('gpt-4o-mini', data.usage);
```

Questo fix è indipendente e va applicato comunque.

---

## §2. Policy DB + endpoint backend

### 2.1 Record in `global_policies`

- `policy_key`: `'openai_optimizations'`
- `policy_value` (JSONB): `{ "enabled": false, "smart_diarization": false }`
- Default se assente: `{ enabled: false, smart_diarization: false }`

### 2.2 Endpoint write (super_admin only)

**File:** `backend/src/dashboard.routes.js`, dopo il blocco `superadmin/policies` esistenti (~riga 1195).

```javascript
// PUT /api/superadmin/openai-optimizations
router.put(
  "/api/superadmin/openai-optimizations",
  requireAuth,
  requireRole(["super_admin"]),
  async (req, res) => {
    try {
      const { enabled, smart_diarization } = req.body || {};
      const value = { enabled: !!enabled, smart_diarization: !!smart_diarization };
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

### 2.3 Endpoint lettura (tutti gli utenti autenticati)

**File:** `backend/src/server.js`, prima di `app.post("/api/chat", ...)` (~riga 374).

```javascript
// GET /api/policies/openai-optimizations
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
        ? JSON.parse(rows[0].policy_value) : rows[0].policy_value;
      res.json({ enabled: !!val.enabled, smart_diarization: !!val.smart_diarization });
    } else {
      res.json(defaults);
    }
  } catch (e) {
    console.error("GET /api/policies/openai-optimizations error", e);
    res.json(defaults); // fail-safe: default OFF
  }
});
```

---

## §3. Frontend optimization layer: `app-openai-optimizations.js`

Creare `docs/app-openai-optimizations.js`. Caricarlo in `index.html` **prima** di `app-core.js`.

### 3.1 Codice completo

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
      if (Date.now() - ts > CACHE_TTL_MS) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function _writeCache(flags) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) { /* quota exceeded */ }
  }

  // ---- Public API ----

  window.getOpenAiOptimizationFlags = function () {
    return _readCache() || { ...DEFAULTS };
  };

  window.refreshOpenAiOptimizationFlags = async function (force) {
    if (!force) {
      const cached = _readCache();
      if (cached) return cached;
    }
    try {
      const resp = await fetchApi('/api/policies/openai-optimizations');
      if (resp.ok) {
        const flags = await resp.json();
        const result = { enabled: !!flags.enabled, smart_diarization: !!flags.smart_diarization };
        _writeCache(result);
        return result;
      }
    } catch (e) { console.warn('refreshOpenAiOptimizationFlags error:', e); }
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

  const TASK_MODEL_MAP = {
    translate:         { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    text_correction:   { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 800 },
    diary_generate:    { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_answer:        { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    qna_faq:           { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    tips_generate:     { model: 'gpt-4o-mini', temperature: 0.6, max_tokens: 3600 },
    owner_explanation: { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1600 },
    glossary_generate: { model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 800 },
    faq_generate:      { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1200 },
    // SOAP generation: NON presente qui → usa sempre il default (gpt-4o)
  };

  window.getAiModelForTask = function (task, defaultModel) {
    defaultModel = defaultModel || 'gpt-4o';
    if (!isOpenAiOptimizationsEnabled()) return defaultModel;
    const entry = TASK_MODEL_MAP[task];
    return entry ? entry.model : defaultModel;
  };

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

### 3.2 Inclusione in `index.html`

```html
<script src="app-openai-optimizations.js"></script>  <!-- PRIMA di app-core.js -->
```

---

## §4. UI Settings (super_admin only)

### 4.1 HTML in `index.html`

Aggiungere **subito prima** della card "Sistema" in `#page-settings`:

```html
<!-- OpenAI Optimizations (super_admin only) -->
<div id="openaiOptCard" class="card" style="display:none;">
    <h3>🤖 OpenAI — Ottimizzazioni</h3>
    <p style="color:#666;font-size:13px;margin-bottom:15px;">
        Quando attive, i task secondari (traduzioni, tips, FAQ, glossario, spiegazione proprietario)
        usano un modello più economico. Il SOAP resta invariato.
    </p>
    <div class="form-group" style="margin-bottom:15px;">
        <label style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="openaiOptEnabled">
            <span>Ottimizzazioni globali attive</span>
        </label>
    </div>
    <div class="form-group" style="margin-bottom:15px;">
        <label style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="openaiOptSmartDiarization">
            <span>Diarizzazione solo quando serve</span>
        </label>
        <p style="font-size:12px;color:#888;margin-top:5px;">
            Se attiva e nessun parlante è configurato, salta la diarizzazione (Whisper diretto, più veloce ed economico).
        </p>
    </div>
    <button class="btn btn-primary" onclick="saveOpenAiOptimizations()">💾 Salva</button>
</div>
```

### 4.2 Init e salvataggio in `app-core.js`

Aggiungere in fondo al file:

```javascript
// ============================================
// OPENAI OPTIMIZATIONS SETTINGS (super_admin)
// ============================================

async function initOpenAiOptimizationsSettingsUI() {
    const card = document.getElementById('openaiOptCard');
    if (!card) return;
    if (getActiveRole() !== 'super_admin') { card.style.display = 'none'; return; }
    card.style.display = '';
    try {
        const flags = await refreshOpenAiOptimizationFlags(true);
        document.getElementById('openaiOptEnabled').checked = !!flags.enabled;
        document.getElementById('openaiOptSmartDiarization').checked = !!flags.smart_diarization;
    } catch (e) { console.warn('initOpenAiOptimizationsSettingsUI error:', e); }
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
        if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error || `HTTP ${resp.status}`); }
        await refreshOpenAiOptimizationFlags(true);
        showToast('✅ Ottimizzazioni salvate', 'success');
    } catch (e) { showToast('Errore: ' + e.message, 'error'); }
}
```

In `navigateToPage()`, aggiungere:

```javascript
if (page === 'settings') { initOpenAiOptimizationsSettingsUI(); }
```

---

## §5. Model routing: collegare i 9 call-site

**Pattern per ogni call-site:**

```javascript
// PRIMA:    model: 'gpt-4o', temperature: 0.5
// DOPO:     model: getAiModelForTask('TASK', 'gpt-4o'),
//           temperature: getAiParamsForTask('TASK').temperature ?? 0.5
// TRACKING: trackChatUsage(getAiModelForTask('TASK', 'gpt-4o'), data.usage)
```

| # | File | Funzione (~riga) | Task key | Note |
|---|------|------------------|----------|------|
| 1 | `app-core.js` | `translateText` (~1890) | `translate` | |
| 2 | `app-core.js` | `sendFullscreenCorrection` (~1314) | `text_correction` | no trackChatUsage esistente — aggiungere se `usage` presente |
| 3 | `app-data.js` | `generateDiary` (~299) | `diary_generate` | |
| 4 | `app-data.js` | QnA answer (~506) | `qna_answer` | |
| 5 | `app-data.js` | `generateQnAFaq` (~549) | `qna_faq` | |
| 6 | `app-tips.js` | `_callTipsLLM` (~174) | `tips_generate` | Anche `max_tokens` override |
| 7 | `app-soap.js` | `generateOwnerExplanation` (~1126) | `owner_explanation` | |
| 8 | `app-soap.js` | `generateGlossary` (~1291) | `glossary_generate` | |
| 9 | `app-soap.js` | `generateFAQ` (~1373) | `faq_generate` | |

**SOAP generation (generateSOAPStructured, generateSOAPFallback, generateSOAPFallbackTextOnly): NESSUNA modifica al modello. Resta gpt-4o.**

---

## §6. SOAP segments compaction

**File:** `docs/app-soap.js`

### 6.1 Modificare `formatSegmentsForPrompt`

Aggiungere parametro `options` opzionale con modalità `compact`:

- **Non compact (default):** comportamento attuale invariato
- **Compact:** merge segmenti consecutivi dello stesso speaker con gap ≤ 1.5s. Rimuove timestamp ridondanti. Il testo NON viene troncato — si riducono solo i token di formattazione.

Formato compact: `[SEG 12,13,14] Speaker [role]: testo unito`

### 6.2 Collegare a `generateSOAPStructured`

In `generateSOAPStructured()` (~riga 335):

```javascript
const compactSegments = typeof isOpenAiOptimizationsEnabled === 'function' && isOpenAiOptimizationsEnabled();
const segmentsText = segmentsSource.length > 0
    ? formatSegmentsForPrompt(segmentsSource, { compact: compactSegments })
    : '';
```

### 6.3 Codice completo di formatSegmentsForPrompt

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
        // Originale — invariato
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

    // Compact: merge segmenti consecutivi stesso speaker
    const merged = [];
    let current = null;
    for (const seg of segments) {
        const speaker = (seg.speaker || 'sconosciuto').toString().trim();
        const role = (seg.role || 'unknown').toString().trim();
        const text = (seg.text || '').toString().replace(/\s+/g, ' ').trim();
        const idx = (seg.segment_index !== undefined && seg.segment_index !== null) ? seg.segment_index : null;
        const start = Number(seg.start) || 0;
        const end = Number(seg.end) || 0;

        if (current && current.speaker === speaker && current.role === role && (start - current.end) <= 1.5) {
            current.ids.push(idx);
            current.texts.push(text);
            current.end = end;
        } else {
            if (current) merged.push(current);
            current = { speaker, role, ids: [idx], texts: [text], start, end };
        }
    }
    if (current) merged.push(current);

    return merged.map(block => {
        const idsStr = block.ids.filter(id => id !== null).join(',');
        return `[SEG ${idsStr}] ${block.speaker} [${block.role}]: ${block.texts.join(' ')}`;
    }).join('\n');
}
```

---

## §7. Smart diarization

**File:** `docs/app-recording.js`

All'inizio di `transcribeAudio()` (~riga 1607), **dopo** i check su `audioBlob` e **prima** di `showProgress(true)`:

```javascript
// Smart diarization: skip diarization if no speakers configured and opt is active
let skipDiarization = false;
try {
    if (typeof isSmartDiarizationEnabled === 'function' && isSmartDiarizationEnabled()) {
        const speakersCheck = await getSavedSpeakersForTranscription();
        if (speakersCheck.length === 0) skipDiarization = true;
    }
} catch (e) { console.warn('Smart diarization check failed:', e); }

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
            smartDiarization: true
        });
        ADALog.endCorrelation();
    }

    showProgress(false);
    resetTimer();
    audioBlob = null;
    return;
}
```

**Regola di comportamento:**

| `enabled` | `smart_diarization` | Speakers | Risultato |
|-----------|---------------------|----------|-----------|
| false | qualsiasi | qualsiasi | Come oggi |
| true | false | qualsiasi | Come oggi |
| true | true | ≥ 1 | Come oggi (diarize-first) |
| true | true | 0 | **Whisper diretto** (no diarize) |

---

## §8. Document optimizations (backend)

**File:** `backend/src/documents.routes.js`, `backend/package.json`

### 8.1 Helper lettura policy

Aggiungere in cima al file (dopo require, prima di module.exports):

```javascript
let _optFlagsCache = null;
let _optFlagsCacheTs = 0;
const OPT_FLAGS_CACHE_TTL = 60_000;

async function getOptimizationFlags(pool) {
  const now = Date.now();
  if (_optFlagsCache && (now - _optFlagsCacheTs) < OPT_FLAGS_CACHE_TTL) return _optFlagsCache;
  const defaults = { enabled: false, smart_diarization: false };
  try {
    const { rows } = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'openai_optimizations'"
    );
    if (rows.length > 0 && rows[0].policy_value) {
      const val = typeof rows[0].policy_value === 'string'
        ? JSON.parse(rows[0].policy_value) : rows[0].policy_value;
      _optFlagsCache = { enabled: !!val.enabled, smart_diarization: !!val.smart_diarization };
    } else { _optFlagsCache = defaults; }
  } catch (e) { _optFlagsCache = defaults; }
  _optFlagsCacheTs = now;
  return _optFlagsCache;
}
```

### 8.2 Document explain → mini

In `processDocumentExplain()` (~riga 586):

```javascript
const optFlags = await getOptimizationFlags(pool);
const explainModel = optFlags.enabled ? "gpt-4o-mini" : "gpt-4o";
const explainMaxTokens = optFlags.enabled ? 1600 : 2048;
// Usare explainModel e explainMaxTokens nel payload
```

### 8.3 Document read: PDF parsing locale

**Dipendenza:** aggiungere `"pdf-parse": "^1.1.1"` a `backend/package.json`. Installare: `cd backend && npm install`.

In `processDocumentRead()`, **dopo** aver ottenuto il base64 e **prima** della chiamata OpenAI:

```javascript
const optFlags = await getOptimizationFlags(pool);

if (optFlags.enabled && doc.mime_type === 'application/pdf') {
  try {
    const pdfParse = require('pdf-parse');
    const pdfBuffer = Buffer.from(base64, 'base64');
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = (pdfData.text || '').trim();
    const charsPerPage = pdfData.numpages > 0 ? extractedText.length / pdfData.numpages : 0;

    if (extractedText.length >= 500 && charsPerPage >= 50) {
      await pool.query(
        "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, extractedText]
      );
      return { text: extractedText };
    }
    // else: testo troppo sparso → fall through a OpenAI
  } catch (pdfErr) {
    console.warn('pdf-parse failed, falling through to OpenAI:', pdfErr.message);
  }
}
```

### 8.4 Model routing per read (fallback)

Se parsing locale fallisce e ottimizzazioni attive: provare `gpt-4o-mini`, poi fallback `gpt-4o` se risultato < 100 chars.

**Suggerimento:** estrarre la chiamata OpenAI in un helper `_callOpenAiForRead(pool, doc, oaKey, base64, contentParts, model)` per evitare duplicazione.

---

## §8bis. Checklist PR 16

**Backend:**
- [ ] `PUT /api/superadmin/openai-optimizations` (§2.2)
- [ ] `GET /api/policies/openai-optimizations` con fail-safe (§2.3)
- [ ] Helper `getOptimizationFlags()` in documents.routes.js (§8.1)
- [ ] Document explain → mini condizionale (§8.2)
- [ ] PDF parsing locale con pdf-parse (§8.3)
- [ ] Model routing read con fallback (§8.4)
- [ ] Installare `pdf-parse` (§8.3)

**Frontend:**
- [ ] Creare `app-openai-optimizations.js` (§3)
- [ ] Script tag in index.html prima di app-core.js (§3.2)
- [ ] Settings card HTML (§4.1)
- [ ] Init + save functions in app-core.js (§4.2)
- [ ] Bugfix tracking identifySpeakers (§1)
- [ ] 9 call-site model routing (§5)
- [ ] SOAP segments compaction (§6)
- [ ] Smart diarization (§7)

**Verifica:**
- [ ] Con ottimizzazioni OFF: nessun cambiamento di comportamento
- [ ] Con ottimizzazioni ON: task secondari usano gpt-4o-mini; SOAP resta gpt-4o
- [ ] Smart diarization ON + 0 speakers → Whisper diretto
- [ ] Smart diarization ON + 1+ speakers → diarize come oggi
- [ ] PDF testuale → estrazione locale (no API call)
- [ ] PDF scan (immagine) → gpt-4o-mini, poi fallback gpt-4o se risultato corto
- [ ] Settings card visibile solo per super_admin
- [ ] Fail-safe: se DB non risponde, tutto resta OFF

---

# PR 17 — PROMO, CAMPAGNE E TARGETING

**Scope:** Normalizzazione specie/lifecycle in italiano, filtro lifecycle nell'eligibility, card promo con immagine e descrizione, modifica completa promo e campagne, gestione promo↔campagna, targeting visivo con checkbox.

**Branch:** `feat/promo-improvements`

**File coinvolti:**

| Azione | File |
|--------|------|
| MODIFICA | `docs/app-admin.js` (form catalogo, campagne, targeting checkbox, modali complete) |
| MODIFICA | `docs/app-promo.js` (card con immagine + descrizione) |
| MODIFICA | `backend/src/eligibility.service.js` (specie IT, filtro lifecycle, coniglio) |
| MODIFICA | `backend/src/admin.routes.js` (normalizzazione input, endpoint campaign_items) |
| MODIFICA | `backend/src/promo.routes.js` (description nella recommendation response) |
| MODIFICA | `backend/src/tag.service.js` (tag lifecycle in italiano, coniglio) |

---

## §9. Normalizzazione specie e lifecycle in italiano

### 9.1 Mappa di normalizzazione (backend)

Aggiungere in `admin.routes.js` (o utility condiviso):

```javascript
const SPECIES_NORMALIZE = {
    'cane': 'cane', 'cani': 'cane', 'dog': 'cane', 'dogs': 'cane',
    'gatto': 'gatto', 'gatti': 'gatto', 'cat': 'gatto', 'cats': 'gatto',
    'coniglio': 'coniglio', 'conigli': 'coniglio', 'rabbit': 'coniglio', 'rabbits': 'coniglio',
    'tutti': 'tutti', 'all': 'tutti'
};

const LIFECYCLE_NORMALIZE = {
    'cucciolo': 'cucciolo', 'puppy': 'cucciolo', 'kitten': 'cucciolo', 'gattino': 'cucciolo', 'baby': 'cucciolo',
    'adulto': 'adulto', 'adult': 'adulto',
    'senior': 'senior', 'anziano': 'senior'
};

function normalizeSpecies(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(s => SPECIES_NORMALIZE[(s || '').toLowerCase().trim()] || s.toLowerCase().trim())
              .filter(Boolean);
}

function normalizeLifecycle(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(s => LIFECYCLE_NORMALIZE[(s || '').toLowerCase().trim()] || s.toLowerCase().trim())
              .filter(Boolean);
}
```

### 9.2 Applicare in POST e PATCH promo_items

In entrambi gli endpoint, prima dell'INSERT/UPDATE:

```javascript
const speciesNorm = normalizeSpecies(species);
const lifecycleNorm = normalizeLifecycle(lifecycle_target);
```

### 9.3 Eligibility engine: normalizzare petSpecies

In `eligibility.service.js` ~riga 98, cambiare:

```javascript
// PRIMA:
if (s === "cane" || s === "dog") petSpecies = "dog";
else if (s === "gatto" || s === "cat") petSpecies = "cat";

// DOPO:
if (s === "cane" || s === "dog") petSpecies = "cane";
else if (s === "gatto" || s === "cat") petSpecies = "gatto";
else if (s === "coniglio" || s === "rabbit") petSpecies = "coniglio";
else petSpecies = s;
```

### 9.4 Tag lifecycle in italiano

In `tag.service.js` ~righe 64-81:

```javascript
// PRIMA:   tags.push("lifecycle:puppy")   → DOPO: tags.push("lifecycle:cucciolo")
// PRIMA:   tags.push("lifecycle:adult")   → DOPO: tags.push("lifecycle:adulto")
// PRIMA:   tags.push("lifecycle:senior")  → DOPO: tags.push("lifecycle:senior")  // invariato
```

Aggiungere anche il **coniglio** nel calcolo lifecycle:

```javascript
// Dopo il blocco cane/gatto, aggiungere:
if (species === 'coniglio' || species === 'rabbit') {
    if (ageYears < 1) tags.push('lifecycle:cucciolo');
    else if (ageYears >= 5) tags.push('lifecycle:senior');
    else tags.push('lifecycle:adulto');
}
```

---

## §10. Filtro lifecycle nell'eligibility engine

In `eligibility.service.js`, sezione filtering (~riga 146), **dopo** il filtro specie:

```javascript
// Lifecycle filter
if (item.lifecycle_target && item.lifecycle_target.length > 0
    && !item.lifecycle_target.includes('tutti')) {
    const petLifecycleTag = petTagNames.find(t => t.startsWith('lifecycle:'));
    const petLifecycle = petLifecycleTag ? petLifecycleTag.split(':')[1] : null;
    if (petLifecycle && !item.lifecycle_target.includes(petLifecycle)) {
        continue; // lifecycle mismatch
    }
}
```

---

## §11. Card promo con immagine e descrizione

### 11.1 Rendering in `app-promo.js`

Nella funzione di rendering della card (~riga 430), dopo il badge, aggiungere:

```javascript
// Immagine (se disponibile)
if (rec.imageUrl) {
    html.push('<div class="promo-image-container">');
    html.push('<img class="promo-image" src="' + _escapeHtml(rec.imageUrl)
        + '" alt="' + _escapeHtml(rec.name)
        + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'">');
    html.push('</div>');
}

html.push('<div class="promo-name">' + _escapeHtml(rec.name) + '</div>');

// Descrizione breve (se disponibile, max 150 chars)
if (rec.description) {
    var shortDesc = rec.description.length > 150
        ? rec.description.substring(0, 147) + '...' : rec.description;
    html.push('<div class="promo-description">' + _escapeHtml(shortDesc) + '</div>');
}
```

### 11.2 CSS (in `_injectPromoStyles`)

```css
.promo-image-container {
    width: 100%; max-height: 160px; overflow: hidden;
    border-radius: 8px; margin-bottom: 10px; background: #f0f4f8;
}
.promo-image {
    width: 100%; height: auto; max-height: 160px;
    object-fit: cover; display: block;
}
.promo-description {
    font-size: 13px; color: #555; margin-bottom: 8px; line-height: 1.4;
}
```

### 11.3 Propagazione description

Verificare che `promo.routes.js` (~riga 242) includa `description` nella recommendation:

```javascript
const recommendation = {
    promoItemId: promoResult.promoItemId,
    // ... altri campi esistenti ...
    description: promoResult.description,  // ← verificare che ci sia
};
```

Nel mock response (V1 compat), aggiungere:

```javascript
imageUrl: product.image_url,
description: product.description,
```

---

## §12. Gestione promo ↔ campagna

### 12.1 Nuovi endpoint backend

In `admin.routes.js`:

```javascript
// GET /api/admin/:tenantId/campaigns/:campaignId/items
router.get("/api/admin/:tenantId/campaigns/:campaignId/items",
    requireAuth, requireRole(adminRoles), async (req, res) => {
    try {
        const { tenantId, campaignId } = req.params;
        const { rows } = await pool.query(
            `SELECT pi.* FROM promo_items pi
             JOIN campaign_items ci ON ci.promo_item_id = pi.promo_item_id
             WHERE ci.campaign_id = $1 AND pi.tenant_id = $2 ORDER BY pi.name`,
            [campaignId, tenantId]
        );
        res.json({ items: rows });
    } catch (e) {
        res.status(500).json({ error: "server_error" });
    }
});

// PUT /api/admin/:tenantId/campaigns/:campaignId/items — replace all
router.put("/api/admin/:tenantId/campaigns/:campaignId/items",
    requireAuth, requireRole(adminRoles), async (req, res) => {
    try {
        const { tenantId, campaignId } = req.params;
        const { item_ids } = req.body || {};
        if (!Array.isArray(item_ids)) return res.status(400).json({ error: "item_ids_required" });

        const camp = await pool.query(
            "SELECT 1 FROM promo_campaigns WHERE campaign_id = $1 AND tenant_id = $2", [campaignId, tenantId]
        );
        if (!camp.rows[0]) return res.status(404).json({ error: "campaign_not_found" });

        await pool.query("DELETE FROM campaign_items WHERE campaign_id = $1", [campaignId]);
        for (const itemId of item_ids) {
            await pool.query(
                "INSERT INTO campaign_items (campaign_id, promo_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                [campaignId, itemId]
            );
        }

        await _auditLog(pool, req.promoAuth, "campaign.items_updated", campaignId, "campaign", { itemCount: item_ids.length });
        res.json({ updated: item_ids.length });
    } catch (e) {
        res.status(500).json({ error: "server_error" });
    }
});
```

### 12.2 UI: multi-select promo in creazione campagna

In `_renderCampaignsPage`, nel form "Nuova Campagna", dopo il campo contesti aggiungere un `<div id="campaignItemsSelect">` con checkbox di tutti i promo_items disponibili. Popolare via fetch a `/api/admin/{tenantId}/promo-items`.

In `createCampaign()`, raccogliere i checkbox selezionati e passare `item_ids` nel POST body.

---

## §13. Form modifica completi

### 13.1 Modifica Promo Item

Sostituire l'attuale `editPromoItem()` (che usa `prompt()` e cambia solo il nome) con una **modale** pre-popolata con tutti i campi:

- Nome, Categoria (select), Descrizione, Priorità (number)
- URL Prodotto, URL Immagine
- Specie (checkbox: 🐕 Cane, 🐈 Gatto, 🐇 Coniglio, 🌐 Tutti)
- Fase di vita (checkbox: 🍼 Cucciolo, 🐾 Adulto, 👴 Senior)
- Tag inclusione, Tag esclusione (input testo comma-separated)

La modale fetcha i dati correnti via GET, li pre-popola, e salva via PATCH.

### 13.2 Modifica Campagna

Sostituire l'attuale `editCampaign()` (che usa `prompt()` e cambia solo il nome) con una **modale** pre-popolata con:

- Nome, UTM Campaign, Data inizio, Data fine, Contesti
- **Promo incluse** (multi-select checkbox, con indicazione dello stato di ogni promo)

La modale fa due request in parallelo: PATCH campagna + PUT campaign_items.

---

## §14. Targeting visivo con checkbox

### 14.1 Constanti

```javascript
var ADA_SPECIES = [
    { value: 'cane', label: '🐕 Cane' },
    { value: 'gatto', label: '🐈 Gatto' },
    { value: 'coniglio', label: '🐇 Coniglio' },
    { value: 'tutti', label: '🌐 Tutti' }
];
var ADA_LIFECYCLE = [
    { value: 'cucciolo', label: '🍼 Cucciolo' },
    { value: 'adulto', label: '🐾 Adulto' },
    { value: 'senior', label: '👴 Senior' }
];
```

### 14.2 Helper functions

`_speciesCheckboxes(prefix, selectedArr)` → HTML con checkbox
`_lifecycleCheckboxes(prefix, selectedArr)` → HTML con checkbox
`_getCheckedSpecies(prefix)` → array di valori selezionati
`_getCheckedLifecycle(prefix)` → array di valori selezionati

### 14.3 Applicare nei form

**Creazione promo:** sostituire input testo "Specie" e "Lifecycle" con checkbox. Label "Fase di vita" al posto di "Lifecycle".

**Modifica promo:** i checkbox nella modale §13.1 sono pre-selezionati dai dati correnti.

**Tabella catalogo:** aggiungere colonna "Fase di vita" con emoji. Specie in emoji anziché testo raw.

### 14.4 Helper UI condivisi

```javascript
function _formField(id, label, value, type) { /* input con label */ }
function _formSelect(id, label, value, options) { /* select con label */ }
function _splitCommaSep(inputId) { /* split comma-separated input */ }
function _getActiveTenantId() { /* return JWT or selected tenant */ }
function _loadCampaignItemsSelector(tenantId, selectedIds, containerId) { /* fetch + render checkbox */ }
```

---

## §15. Checklist PR 17

**Backend:**
- [ ] Mappe `SPECIES_NORMALIZE` + `LIFECYCLE_NORMALIZE` (§9.1)
- [ ] Normalizzazione in POST e PATCH promo_items (§9.2)
- [ ] Eligibility: petSpecies in italiano + coniglio (§9.3)
- [ ] Eligibility: filtro lifecycle (§10)
- [ ] Tag service: lifecycle in italiano + coniglio (§9.4)
- [ ] GET + PUT campaign_items (§12.1)
- [ ] Verificare description nella recommendation response (§11.3)

**Frontend:**
- [ ] Card promo: immagine + descrizione + CSS (§11)
- [ ] Label "Fase di vita", placeholder italiano (§9)
- [ ] Helper checkbox specie/lifecycle (§14.2)
- [ ] Form creazione promo: checkbox (§14.3)
- [ ] editPromoItem → modale completa (§13.1)
- [ ] editCampaign → modale completa con multi-select promo (§13.2)
- [ ] Creazione campagna: selettore promo (§12.2)
- [ ] Tabella catalogo: colonna Fase di vita, emoji specie (§14.3)
- [ ] Helper UI condivisi (§14.4)

**Migrazione dati:**
- [ ] Script SQL one-shot:
```sql
UPDATE promo_items SET species = array_replace(species, 'dog', 'cane');
UPDATE promo_items SET species = array_replace(species, 'cat', 'gatto');
UPDATE promo_items SET species = array_replace(species, 'all', 'tutti');
UPDATE promo_items SET lifecycle_target = array_replace(lifecycle_target, 'puppy', 'cucciolo');
UPDATE promo_items SET lifecycle_target = array_replace(lifecycle_target, 'adult', 'adulto');
UPDATE pet_tags SET tag = replace(tag, 'lifecycle:puppy', 'lifecycle:cucciolo') WHERE tag = 'lifecycle:puppy';
UPDATE pet_tags SET tag = replace(tag, 'lifecycle:adult', 'lifecycle:adulto') WHERE tag = 'lifecycle:adult';
```

**Verifica:**
- [ ] Creare promo "cane" + "cucciolo" → visibile solo per cuccioli cane
- [ ] Creare promo "tutti" → visibile per tutte le specie
- [ ] Modifica promo: tutti i campi salvati correttamente
- [ ] Campagna: associare 3 promo, salvare, riaprire → le 3 sono selezionate
- [ ] Card proprietario: immagine visibile, descrizione visibile
- [ ] Card senza immagine: layout non rotto
- [ ] API con "dog" → normalizzato in "cane" nel DB
- [ ] Prodotto "gatto/cucciolo" NON proposto a cane adulto
- [ ] Coniglio senior (6 anni) → tag lifecycle:senior corretto
- [ ] Smoke test Playwright passano

---

# APPENDICE — Dipendenze e ordine

```
PR 16 (OpenAI Optimizations)     PR 17 (Promo Improvements)
         │                                  │
         │  indipendenti tra loro           │
         │  (nessun file in comune)          │
         └──────────────┬───────────────────┘
                        │
              possono essere eseguiti
              in qualsiasi ordine o
              in parallelo
```

**Dipendenze esterne:**
- PR 16 richiede `pdf-parse` nel backend
- PR 17 non ha dipendenze aggiuntive
- Entrambi beneficiano di PR 13 (Debug Logging) ma non lo richiedono
