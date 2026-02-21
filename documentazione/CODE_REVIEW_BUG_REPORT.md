# Code Review Bug Report (solo analisi, nessuna correzione)

Data: 2026-02-21  
Scope review: `backend/src/` (focus su documenti + trascrizioni), controlli automatici unit/policy.

## Executive summary
Sono stati identificati **4 bug** ad alto/medio impatto che possono causare:
- richieste OpenAI destinate a fallire in produzione,
- stato di trascrizione bloccato su `processing`,
- validazione MIME aggirabile per upload non-WebP,
- possibile escalation logica di ruolo lato frontend tramite valore locale non validato.

---

## BUG-01 (High) — Endpoint trascrizione OpenAI chiamato con payload non conforme

**File:** `backend/src/transcription.routes.js`  
**Evidenza:** la chiamata a `https://api.openai.com/v1/audio/transcriptions` invia `Content-Type: application/json` con body JSON (`file: rec.recording_url`) invece di `multipart/form-data` con file binario.

- Codice osservato: invio JSON con `model`, `file`, `response_format`, `language`.
- L’endpoint Audio Transcriptions richiede normalmente upload file reale (form-data), non URL in JSON.

**Impatto:** trascrizioni reali in ambiente non-mock possono fallire sistematicamente (HTTP 4xx/5xx), rendendo inutilizzabile la feature di trascrizione call recordings.

**Riproduzione (concettuale):**
1. Avviare backend con `MODE=REAL` e chiave OpenAI valida.
2. Salvare una registrazione con `recording_url`.
3. Chiamare `POST /api/communication/transcribe/:recordingId`.
4. Atteso: errore `transcription_failed` per risposta OpenAI non conforme al formato richiesto.

---

## BUG-02 (High) — Stato trascrizione può restare bloccato su `processing` quando manca API key

**File:** `backend/src/transcription.routes.js`  
**Evidenza:** lo stato viene impostato a `processing` **prima** del controllo `!apiKey`; se la key manca, la route ritorna 500 senza rollback/mark `failed`.

**Impatto:** record in stato incoerente (`processing` permanente), UI polling/status potenzialmente bloccati o fuorvianti.

**Riproduzione (concettuale):**
1. Eseguire backend in non-mock senza `OPENAI_API_KEY`.
2. Chiamare `POST /api/communication/transcribe/:recordingId`.
3. Verificare in DB: `transcription_status='processing'` anche dopo errore `openai_key_not_configured`.

---

## BUG-03 (Medium/High) — Rilevamento WebP basato solo su header RIFF (falso positivo)

**File:** `backend/src/documents.routes.js`  
**Evidenza:** `detectMimeFromBuffer()` considera WebP valido se i primi 4 byte sono `RIFF`.

- Problema: molti formati non-WebP possono iniziare con `RIFF` (es. WAV/AVI).
- Mancano i controlli tipici WebP su marker `WEBP` (byte 8..11).

**Impatto:** upload di file non consentiti classificati erroneamente come `image/webp`; possibile bypass parziale delle policy di tipo file.

**Riproduzione (concettuale):**
1. Preparare un file RIFF non-WebP (es. WAV rinominato `.webp`).
2. Inviare `POST /api/documents/upload`.
3. Possibile accettazione come `image/webp` se passa gli attuali controlli magic bytes.

---

## BUG-04 (Medium) — `getActiveRole()` accetta valore localStorage non validato per `super_admin`

**File:** `frontend/config.js`  
**Evidenza:** nel ramo `super_admin`, se `ada_active_role` contiene un valore arbitrario non previsto, il codice fa fallback a `return stored || ROLE_VETERINARIO;` senza whitelist stretta.

**Impatto:** stato ruolo frontend incoerente/non previsto (routing/permessi UI imprevedibili), con rischio di comportamento erratico in navigazione e guardie client-side.

**Riproduzione (concettuale):**
1. Loggarsi come `super_admin`.
2. Settare manualmente `localStorage.setItem('ada_active_role', 'ruolo_non_valido')`.
3. Ricaricare app e osservare ruolo attivo non normalizzato.

---

## Check eseguiti durante la review
- `npm run test:unit` ✅
- `npm run test:policy` ✅

> Nota: questo report è intenzionalmente diagnostico. Non include fix applicati al codice.
