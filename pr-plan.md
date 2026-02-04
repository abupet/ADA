# ADA — Piano PR per prompt_8 (v1.1)

**Data:** 2026-02-04
**Base:** `origin/main` (v6.17.9)
**Destinatario:** Claude Code

---

## Note generali per Claude Code

1. Parti **sempre** dall'ultimo commit di `origin/main`.
2. Ogni branch: `feat/<pr-slug>` da main aggiornata.
3. Se la PR risulta indietro rispetto a main, integra main (merge o rebase) prima di finalizzare.
4. Dove **non c'è rischio di errori**, aggiungi un commento nella prima riga dei file modificati con `nomefile.ext vX.Y`.
5. Ogni PR deve passare la CI (`npm run test:ci`) senza regressioni.
6. Se trovi conflitti tra requisiti, documenta la decisione nel codice con un commento.

---

## Panoramica PR

Il prompt_8 originale prevede 8 workstream (A–E + hardening + opzionali). Li ho riorganizzati in **12 PR più piccole**, spezzando le PR più grandi e riordinando le dipendenze. Ogni PR è auto-contenuta e deployabile indipendentemente.

```
PR 1  ─ Inline Loading: utility + hook riusabile
PR 2  ─ Inline Loading: applicazione a login + flussi principali
PR 3  ─ Ridenominazioni menu + rimozione Appuntamento
PR 4  ─ Sistema ruoli (Vet / Proprietario) + switch + persistenza
PR 5  ─ Sidebar per ruoli + route guard + Debug visibility
PR 6  ─ Inventario dati locali + full sync campi Pet
PR 7  ─ Sync engine generico (outbox unificato + push/pull)
PR 8  ─ Documenti: modello dati, upload, storage, UI viewer (no AI)
PR 9  ─ Documenti: AI read + explain (job async)
PR 10 ─ Promo & Consigli: backend + slot UI + analytics
PR 11 ─ Hardening: sicurezza, audit, test, docs
PR 12 ─ (Opzionale) Robustezza & osservabilità
```

---

## PR 1 — Inline Loading: utility e componente riusabile

**Branch:** `feat/inline-loading-core`
**Dipendenze:** nessuna
**File principali:** `docs/app-loading.js` (nuovo), `docs/styles.css`, `docs/index.html`

### Contesto
ADR-007 richiede una policy unificata per tutte le chiamate server user-initiated. Questa PR crea solo l'infrastruttura riusabile, senza ancora applicarla ai flussi.

### Requisiti

**Creare un modulo `app-loading.js`** che esporti una funzione/classe riusabile (es. `InlineLoader`) con:
- `AbortController` integrato: ogni istanza gestisce il proprio controller
- Timer elapsed con soglie di copy:
  - 0–3 s → "In attesa di risposta…"
  - 4–10 s → "Ci stiamo mettendo più del previsto… (Xs)"
  - 11–20 s → "La risposta sta impiegando molto tempo… (Xs)"
  - >20 s → "Problema di comunicazione." + pulsante **Riprova**
- Hard timeout a **45 secondi** (abort automatico)
- Prevenzione doppia richiesta: se parte una nuova richiesta sulla stessa azione, annulla la precedente
- Cleanup su navigazione (hook su `showPage`)
- Retry manuale: callback configurabile, resetta timer e stato, riusa dati originali
- **Nessun retry automatico**

**CSS:**
- Classe `.inline-loader` con spazio riservato (altezza minima fissa, no layout shift)
- Spinner piccolo inline (non overlay, non fullscreen)
- Stato errore con pulsante Riprova stilizzato

**Accessibilità:**
- Container con `aria-live="polite"`
- Spinner non è l'unico indicatore (testo sempre presente)
- Focus tastiera preservato dopo retry

**HTML:**
- Template/frammento HTML riusabile per il loader inline (da clonare o iniettare)

### Criteri di accettazione
- [ ] Il modulo è importabile da qualsiasi altro file JS dell'app
- [ ] Esiste un esempio funzionante nella pagina Debug (se debug ON)
- [ ] AbortController cancella effettivamente la fetch
- [ ] Hard timeout a 45s abort la richiesta
- [ ] No layout shift quando il loader appare/scompare
- [ ] `aria-live="polite"` presente
- [ ] Test unitario per le soglie di copy e il timeout

### NON fare in questa PR
- Non applicare il loader ai flussi esistenti (sarà PR 2)
- Non toccare la logica di login o di generazione SOAP

---

## PR 2 — Inline Loading: applicazione ai flussi principali

**Branch:** `feat/inline-loading-apply`
**Dipendenze:** PR 1
**File principali:** `docs/app-core.js`, `docs/app-soap.js`, `docs/app-recording.js`, `docs/index.html`

### Requisiti

Applicare `InlineLoader` (da PR 1) a tutti i flussi user-initiated esistenti:

**Obbligatorio (priorità alta):**
1. **Login** — inline loader sotto il form, no overlay fullscreen
2. **Generazione SOAP** — inline loader sotto il pulsante "Genera Referto"
3. **Trascrizione audio** — inline loader nella sezione trascrizione (il chunking ha già un suo stato, ma il singolo chunk in trascrizione deve seguire ADR-007)
4. **Salvataggio pet** (create/update) — inline loader nel form pet
5. **Sync push/pull manuale** — se esiste un pulsante sync, inline loader lì

**Obbligatorio (priorità media):**
6. **Q&A** — inline loader sotto il campo domanda
7. **Tips & Tricks** — inline loader sotto il pulsante genera
8. **TTS** — inline loader sul pulsante play (solo per la fase di caricamento audio)
9. **Spiegazione proprietario** — inline loader nel pulsante genera
10. **Export PDF** — inline loader nel pulsante export

**Regole per ogni punto:**
- Rimuovere eventuali spinner globali/overlay esistenti per quell'azione
- Sostituire messaggi di errore generici con errori contestuali
- Navigazione via `showPage` deve cancellare richieste pending per la pagina che si lascia

### Criteri di accettazione
- [ ] Login: feedback inline, nessun overlay fullscreen
- [ ] SOAP generation: feedback inline con timer
- [ ] Nessuno spinner globale "infinito" rimasto per submit normali
- [ ] Navigazione cancella richieste pending
- [ ] Doppio click non genera doppie richieste
- [ ] CI verde, nessuna regressione E2E

### NON fare in questa PR
- Non ristrutturare il menu
- Non introdurre ruoli

---

## PR 3 — Ridenominazioni menu + rimozione Appuntamento

**Branch:** `feat/menu-rename-cleanup`
**Dipendenze:** nessuna (può andare in parallelo a PR 1–2)
**File principali:** `docs/index.html`, `docs/app-core.js`, `docs/styles.css`

### Requisiti

**Ridenominazioni:**
- Nella sidebar e in ogni riferimento UI: "Archivio" → **"Archivio Sanitario"**
- Nota: "Registrazione" è già il nome usato nella sidebar (verificare coerenza ovunque nel codice)

**Rimozione completa di "Appuntamento":**
- Rimuovere la voce "Appuntamenti" dalla sidebar
- Rimuovere la sezione/pagina `page-appointment` da `index.html`
- Rimuovere la logica JS associata (in `app-core.js` e/o `app-data.js`)
- Rimuovere le route/navigazione verso appuntamenti
- Se altri punti dell'app linkano ad Appuntamenti (es. profilo pet), rimuovere quei link
- **Non** rimuovere eventuali dati di appuntamenti già salvati in localStorage/IndexedDB (non rompere nulla per utenti esistenti)

**Redirect di sicurezza:**
- Se un utente ha un bookmark o URL diretto a `page-appointment`, fare redirect silenzioso alla home (pagina registrazione)

### Criteri di accettazione
- [ ] "Archivio" rinominato in "Archivio Sanitario" ovunque nell'UI
- [ ] Nessun riferimento a "Appuntamento/i" nella sidebar, nel codice JS dell'UI, o nell'HTML
- [ ] Navigazione a `page-appointment` fa redirect a home
- [ ] CI verde, test E2E aggiornati (rimuovere eventuali test su Appuntamenti)

### NON fare in questa PR
- Non ristrutturare la sidebar per ruoli (sarà PR 4–5)
- Non introdurre nuove pagine

---

## PR 4 — Sistema ruoli (Veterinario / Proprietario) + switch + persistenza

**Branch:** `feat/role-system`
**Dipendenze:** PR 3
**File principali:** `docs/app-core.js`, `docs/config.js`, `docs/index.html`, `docs/styles.css`

### Contesto
L'app attualmente non ha il concetto di ruolo. Questa PR introduce il modello dati e la logica di switching, senza ancora toccare la sidebar (che sarà PR 5).

### Requisiti

**Modello ruoli:**
- Due ruoli: `veterinario` e `proprietario`
- Ruolo attivo memorizzato in `localStorage` (chiave `ada_active_role`)
- Default iniziale: `veterinario`
- Il ruolo si propaga a tutte le funzioni dell'app tramite una funzione globale `getActiveRole()`

**UI di switch:**
- Aggiungere nell'header (barra superiore) un toggle/selettore di ruolo ben visibile
- Stile: compatto, non invasivo, chiaramente distinguibile (es. icona + label "Veterinario" / "Proprietario")
- Al cambio ruolo: aggiornamento immediato di menu, permessi, stato UI
- Mai due ruoli attivi contemporaneamente

**Permessi per ruolo (definizione logica):**
- Creare un oggetto/mappa `ROLE_PERMISSIONS` in `config.js` che definisca per ogni ruolo:
  - Pagine accessibili
  - Azioni consentite
- Veterinario può: Registrazione, Referto, Archivio Sanitario, Dati Pet, Impostazioni, Debug
- Proprietario può: Dati Pet, Profilo Sanitario, Parametri Vitali, Farmaci, Archivio Sanitario, Q&A, Foto, Impostazioni, Debug

**Profilo Sanitario — regole specifiche:**
- Generabile **solo** dal proprietario
- Può essere creato da: Archivio Sanitario (selezionando un referto) oppure dal flusso Q&A
- Deve mostrare: fonti dati usate, data ultimo aggiornamento
- Veterinario: visualizzazione read-only (se un profilo sanitario esiste, lo vede ma non lo genera/modifica)

**Vincolo Referto:**
- "Referto" non utilizzabile se non c'è una Registrazione attiva (trascrizione completata)
- Mostrare messaggio chiaro se si tenta di accedere senza registrazione

### Criteri di accettazione
- [ ] Toggle ruolo visibile nell'header
- [ ] Ruolo persiste tra sessioni (localStorage)
- [ ] `getActiveRole()` restituisce il ruolo attivo correttamente
- [ ] `ROLE_PERMISSIONS` definisce le pagine/azioni per ciascun ruolo
- [ ] Cambio ruolo non perde dati in corso (es. trascrizione attiva)
- [ ] CI verde

### NON fare in questa PR
- Non ristrutturare la sidebar (sarà PR 5)
- Non implementare RBAC backend (sarà PR 11)

---

## PR 5 — Sidebar per ruoli + route guard + Debug visibility

**Branch:** `feat/role-sidebar-guards`
**Dipendenze:** PR 3 + PR 4
**File principali:** `docs/index.html`, `docs/app-core.js`, `docs/styles.css`

### Requisiti

**Sidebar Veterinario (queste voci esatte):**
```
VISITA
  ├── Dati Pet
  ├── Registrazione
  ├── Referto
  └── Archivio Sanitario

SISTEMA
  ├── Impostazioni
  ├── Debug (solo se abilitato)
  └── Esci
```

**Sidebar Proprietario (queste voci esatte):**
```
I MIEI AMICI ANIMALI
  ├── Dati Pet
  ├── Profilo Sanitario
  ├── Parametri Vitali
  ├── Farmaci
  ├── Archivio Sanitario
  ├── Domande & Risposte
  └── Foto

SISTEMA
  ├── Impostazioni
  ├── Debug (solo se abilitato)
  └── Esci
```

**Route guard:**
- `showPage(pageId)` deve controllare `ROLE_PERMISSIONS` (da PR 4)
- Se l'utente (per qualsiasi motivo) tenta di navigare a una pagina fuori dal suo ruolo → redirect alla prima pagina del ruolo attivo
- Messaggio flash opzionale: "Pagina non disponibile per il ruolo attuale"

**Debug visibility:**
- La voce "Debug" nella sidebar è visibile solo se in Impostazioni → Avanzate → "Mostra strumenti di debug" è ON
- In produzione: toggle OFF di default
- Il toggle si salva in localStorage (`ada_debug_enabled`)

**Linguaggio:**
- Sidebar Proprietario: usare linguaggio non-clinico (i nomi delle voci sono già definiti sopra)
- Nessuna azione clinica diretta nella sidebar Proprietario (Registrazione e Referto non compaiono)

### Criteri di accettazione
- [ ] Sidebar cambia dinamicamente al cambio ruolo
- [ ] Nessuna pagina fuori ruolo è accessibile (route guard attivo)
- [ ] Debug visibile solo se toggle ON in Impostazioni
- [ ] Toggle Debug OFF di default in produzione
- [ ] Redirect coerente per pagine fuori ruolo
- [ ] Test E2E aggiornati per la navigazione con ruoli
- [ ] CI verde

### NON fare in questa PR
- Non toccare la logica di sync
- Non implementare i documenti

---

## PR 6 — Inventario dati locali + full sync campi Pet

**Branch:** `feat/full-pet-sync`
**Dipendenze:** nessuna (può andare in parallelo a PR 3–5)
**File principali:** `docs/app-pets.js`, `docs/pets-sync-*.js`, `backend/src/pets.routes.js`, `backend/src/pets.sync.routes.js`, `sql/`

### Requisiti

**Step 1 — Inventario dati locali (documentare nel codebase):**
- Creare un file `docs/decisions/ADR-008-local-data-inventory.md`
- Elencare TUTTI i dati in IndexedDB e localStorage
- Classificare ciascuno come:
  - **Persistente** → da sincronizzare (ora o in futuro)
  - **Cache/temporaneo** → escluso dal sync
  - **Configurazione utente** → locale only (es. preferenze UI)

**Step 2 — Full sync campi Pet:**
- Attualmente il backend sincronizza solo l'anagrafica base dei pet
- Estendere per sincronizzare **tutti** i campi "Dati Pet":
  - Parametri vitali (temperatura, FC, FR, PA, peso, data/ora)
  - Diario clinico (note + data)
  - Farmaci (nome, dose, frequenza, via somministrazione)
  - Foto (metadata; il binario delle foto è una complessità separata, per ora solo metadata: filename, timestamp, dimensione)
- Backend: aggiungere campo `profile_json` (JSONB) alla tabella `pets` che contenga l'intero profilo pet
- Mantenere le colonne core esistenti (name, species, breed, sex, birthdate, weight_kg, notes) per retrocompatibilità
- `profile_json` contiene: vitals[], diary[], medications[], photo_metadata[]

**Step 3 — Migrazione dati:**
- Al primo sync dopo l'update, il client deve:
  1. Leggere i dati locali (vitals, diary, medications, photo metadata) da localStorage/IndexedDB
  2. Comporre il `profile_json`
  3. Pushare verso il server
- Il server salva il `profile_json` e lo rende disponibile nel pull
- In caso di pull, il client idrata i dati locali dal `profile_json`

**SQL migration:**
- Nuovo file `sql/002_pet_profile_json.sql`:
  ```sql
  ALTER TABLE pets ADD COLUMN profile_json JSONB DEFAULT '{}';
  ```

### Criteri di accettazione
- [ ] ADR-008 creato con inventario completo
- [ ] Tutti i dati pet (vitals, diary, medications, photo metadata) sincronizzati
- [ ] `profile_json` presente nel DB
- [ ] Nessuna perdita di dati offline durante la migrazione
- [ ] Pull reidrata correttamente i dati locali
- [ ] Test regressione base per il flusso sync
- [ ] CI verde

### NON fare in questa PR
- Non creare il sync engine generico (sarà PR 7)
- Non sincronizzare i referti o i documenti
- Non sincronizzare i binari delle foto (solo metadata)

---

## PR 7 — Sync engine generico (outbox unificato + push/pull)

**Branch:** `feat/generic-sync-engine`
**Dipendenze:** PR 6
**File principali:** `docs/sync-engine.js` (nuovo), `docs/app-pets.js`, `backend/src/sync.routes.js` (nuovo), `sql/`

### Requisiti

**Outbox locale unificato (IndexedDB):**
- Struttura record outbox:
  ```
  {
    op_id: UUID,
    entity_type: "pet" | "document" | "referto" | "visit" | ...,
    entity_id: UUID,
    operation_type: "create" | "update" | "delete",
    payload: { ... },         // dati completi o patch
    base_version: number,
    client_timestamp: ISO string,
    status: "pending" | "pushing" | "failed",
    retry_count: number,
    last_error: string | null
  }
  ```
- Migrazione dall'outbox attuale (`pets` only) al nuovo formato

**Backend — endpoint unificati:**
- `POST /api/sync/push` — accetta array di operazioni multi-entity
  - Valida `entity_type`, `op_id` (UUID), `base_version`
  - Idempotenza: `op_id` duplicati → skip con `accepted`
  - Conflitto versione → risposta `conflict` per quell'operazione
  - Risposta: `{ accepted: [...], rejected: [...] }`
- `GET /api/sync/pull?since=cursor` — restituisce changes multi-entity
  - Tabella `changes` centralizzata (estensione di `pet_changes`)
  - Ogni record: `change_id` (BIGSERIAL), `entity_type`, `entity_id`, `change_type`, `record` (JSONB), `version`, `op_id`, `created_at`
  - Max 500 record per pull
- Mantenere retrocompatibilità con gli endpoint esistenti (`/api/sync/pets/push` e `/api/sync/pets/pull`) per un periodo di transizione (deprecati)

**SQL migration:**
- Nuovo file `sql/003_generic_changes.sql`:
  ```sql
  CREATE TABLE changes (
    change_id     BIGSERIAL PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    change_type   TEXT NOT NULL,
    record        JSONB,
    version       INTEGER,
    client_ts     TIMESTAMPTZ,
    device_id     TEXT,
    op_id         UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_changes_owner_cursor ON changes(owner_user_id, change_id);
  CREATE INDEX idx_changes_entity ON changes(entity_type, entity_id);
  ```

**Conflitti:**
- Ogni record ha `version` server-side
- Client invia `base_version`
- In caso di mismatch: **last-write-wins** (basato su `client_ts`, con fallback su `created_at`)
- Documentare la scelta nel codice con un commento chiaro
- Loggare i conflitti risolti automaticamente

**Client:**
- Il sync engine espone API interna:
  - `syncEngine.enqueue(entityType, entityId, operationType, payload, baseVersion)`
  - `syncEngine.pushAll()` — pusha tutto l'outbox
  - `syncEngine.pull()` — pull incrementale
  - `syncEngine.getStatus()` → { pending, pushing, lastSync, errors }
- Trigger automatico: quando online + outbox non vuoto
- Trigger manuale: pulsante "Forza sync" (opzionale, utile per debug)

### Criteri di accettazione
- [ ] Outbox unificato funzionante con multi-entity
- [ ] Endpoint push/pull unificati funzionanti
- [ ] Idempotenza garantita (test con `op_id` duplicati)
- [ ] Conflitti gestiti con last-write-wins (documentato)
- [ ] Retrocompatibilità con endpoint pets esistenti
- [ ] Migrazione outbox da formato vecchio a nuovo senza perdita
- [ ] CI verde

### NON fare in questa PR
- Non implementare i documenti (sarà PR 8)
- Non implementare promo
- Non rimuovere ancora i vecchi endpoint pets (deprecare solo)

---

## PR 8 — Documenti: modello dati, upload, storage, UI viewer (senza AI)

**Branch:** `feat/documents-upload-viewer`
**Dipendenze:** PR 7 (sync engine), PR 5 (ruoli per UI)
**File principali:** `docs/app-documents.js` (nuovo), `docs/index.html`, `backend/src/documents.routes.js` (nuovo), `sql/`

### Requisiti

**Formati supportati:**
- PDF, JPG, PNG, WebP
- HEIC: solo se il browser lo supporta nativamente (non forzare)
- Allowlist rigorosa (rifiutare tutto il resto)

**Vincoli configurabili (con default):**
- `MAX_DOCUMENT_MB`: 10 (default)
- `MAX_DOCUMENT_PAGES`: 5 (default, solo PDF)
- Configurabili nella pagina Debug (quando abilitata)
- Enforcement **server-side** prima di qualsiasi elaborazione

**Modello dati backend:**
- Nuovo file `sql/004_documents.sql`:
  ```sql
  CREATE TABLE documents (
    document_id     UUID PRIMARY KEY,
    pet_id          UUID NOT NULL REFERENCES pets(pet_id),
    owner_user_id   TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    page_count      INTEGER,
    storage_key     TEXT NOT NULL,
    hash_sha256     TEXT NOT NULL,
    read_text       TEXT,
    owner_explanation TEXT,
    ai_status       TEXT DEFAULT 'none',
    ai_error        TEXT,
    ai_updated_at   TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT NOT NULL
  );
  ```
- I documenti sono entità nel sync engine (metadata via `changes` table)
- Binari: upload dedicato via `POST /api/documents/upload` (multipart, max 10 MB)

**Upload:**
- Validazione MIME reale server-side (magic bytes, non solo estensione)
- Storage: filesystem locale su Render (directory configurabile via env var `DOCUMENT_STORAGE_PATH`)
- Hash SHA-256 calcolato server-side
- Se offline: metadata salvata localmente, binario in coda per upload quando torna la rete

**UI — Archivio Sanitario:**
- I documenti appaiono nella lista dell'Archivio Sanitario insieme ai referti
- Distinguibili tramite icona diversa (📄 per documento, 📋 per referto)
- Ordine cronologico (data creazione, più recente in alto)
- Pulsante "Carica Documento" ben visibile nell'Archivio

**UI — Pagina Documento:**
- Nuova pagina `page-document` con layout simile alla pagina Referto:
  1. Nome file originale (header)
  2. Viewer:
     - Immagini: `<img>` con zoom/pinch
     - PDF: viewer integrato (usare `<iframe>` o `<object>` con fallback; pdf.js se necessario per controllo paginazione)
  3. Pulsanti: **Leggi** e **Genera spiegazione Proprietario** (disabilitati in questa PR, saranno attivati in PR 9)
  4. Metadata: data upload, dimensione file, tipo

**Sicurezza:**
- Validazione MIME reale (magic bytes)
- `Content-Disposition: attachment` per download
- Isolamento tenant: un utente vede solo i propri documenti
- CSP appropriato per il viewer

### Criteri di accettazione
- [ ] Upload di PDF, JPG, PNG, WebP funzionante
- [ ] Limiti dimensione e pagine applicati server-side
- [ ] Documenti visibili nell'Archivio Sanitario con icona distinta
- [ ] Pagina Documento con viewer funzionante (immagini + PDF)
- [ ] Metadata documenti nel sync engine
- [ ] Validazione MIME server-side
- [ ] Pulsanti AI presenti ma disabilitati
- [ ] Inline loading (ADR-007) sull'upload
- [ ] CI verde

### NON fare in questa PR
- Non implementare l'interpretazione AI (sarà PR 9)
- Non implementare URL firmate temporanee (sarà PR 11)

---

## PR 9 — Documenti: AI read + explain (job async)

**Branch:** `feat/documents-ai`
**Dipendenze:** PR 8
**File principali:** `docs/app-documents.js`, `backend/src/documents.routes.js`, `backend/src/server.js`

### Requisiti

**Endpoint:**
- `POST /api/documents/:id/read` — avvia job "Leggi"
- `POST /api/documents/:id/explain` — avvia job "Genera spiegazione Proprietario"
- `GET /api/documents/:id/status` — polling status del job

**Pipeline AI:**
- PDF testuale: estrazione testo diretta (es. `pdf-parse` o equivalente), poi invio a GPT-4o
- PDF scansionato (immagini): conversione pagine in immagini, invio a GPT-4o con vision
- Immagini: invio diretto a GPT-4o con vision
- Usare le **API OpenAI** (come il resto dell'app)

**"Leggi" (output strutturato per veterinario):**
- Prompt vincolato: usare SOLO informazioni presenti nel documento
- Output strutturato (preferibilmente JSON):
  - Tipo documento (esame sangue, radiografia, lettera referente, ecc.)
  - Dati chiave estratti
  - Valori fuori range evidenziati
  - Note/incertezze
- Temperature bassa (0.2)
- Evidenziare parti illeggibili/incerte

**"Genera spiegazione Proprietario" (linguaggio semplice):**
- Prompt: spiegare il contenuto del documento in linguaggio semplice, non clinico
- Glossario termini tecnici
- Cosa significano i risultati in pratica
- Temperature bassa (0.3)

**Permessi per ruolo:**
- Veterinario: può usare "Leggi" (output clinico)
- Proprietario: può usare "Genera spiegazione" (output divulgativo)
- Veterinario può anche generare la spiegazione per il proprietario (per condividerla)
- Proprietario **non** può usare "Leggi" (output troppo tecnico)

**UX:**
- Pulsanti abilitati (erano disabilitati in PR 8)
- Inline loading ADR-007 su entrambe le azioni
- Stati:
  - Caricato, non interpretato
  - Interpretazione in corso (inline loader con timer)
  - Risultato disponibile (mostrare sotto il viewer)
  - Errore AI (messaggio chiaro + retry manuale)
- Risultati salvati nel record documento (`read_text`, `owner_explanation`)
- Rigenerazione possibile (sovrascrive, ma salva `ai_updated_at`)

**Qualità:**
- Prompt: non inventare informazioni non presenti nel documento
- Prompt: segnalare esplicitamente se parti sono illeggibili
- Limiti: rispettare `MAX_DOCUMENT_PAGES` prima di elaborare

### Criteri di accettazione
- [ ] "Leggi" produce output strutturato da PDF testuale
- [ ] "Leggi" produce output strutturato da immagine (vision)
- [ ] "Spiegazione" produce testo semplice comprensibile
- [ ] Permessi ruolo rispettati (Proprietario non accede a "Leggi")
- [ ] Inline loading ADR-007 applicato
- [ ] Errori AI mostrati chiaramente con retry manuale
- [ ] Risultati salvati nel record documento
- [ ] CI verde

### NON fare in questa PR
- Non implementare promo
- Non implementare OCR avanzato (usare vision di OpenAI)

---

## PR 10 — Promo & Consigli One-to-One: backend + slot UI + analytics

**Branch:** `feat/promo-consigli`
**Dipendenze:** PR 2 (inline loading), PR 5 (ruoli)
**File principali:** `docs/app-promo.js` (nuovo), `docs/index.html`, `docs/styles.css`, `backend/src/promo.routes.js` (nuovo)

### Contesto
Il sistema promo è guidato dal backend. OpenAI genera solo spiegazioni testuali, non decide quale prodotto consigliare. L'UX deve essere non invasiva.

### Requisiti

**Backend:**
- `GET /api/promo/recommendation?petId=X` — restituisce prodotto raccomandato
  - Logica di selezione **deterministica** (basata su specie, razza, età, condizioni note)
  - Se non c'è prodotto pertinente clinicamente → risposta vuota (nessuna promo)
  - Risposta include: productId, productName, category, confidence, relevance_reason
- `POST /api/promo/recommendation` — alternativa con body per dati pet più completi
- `POST /api/promo/event` — tracking eventi promo
  - Payload: `{ eventType, productId, petId, timestamp, metadata }`
  - eventType: `impression` | `info_click` | `buy_click` | `dismissed`
- Fallback: se nessun `DATABASE_URL` (test/mock), restituire risposte mock predefinite

**OpenAI — solo spiegazione:**
- Una volta che il backend ha selezionato il prodotto, chiamare GPT-4o-mini per generare una spiegazione personalizzata:
  - Perché quel prodotto è rilevante per quel pet specifico
  - Linguaggio adatto al ruolo attivo (clinico per vet, semplice per proprietario)
- Temperature bassa (0.3)
- **Il modello AI non sceglie il prodotto** — lo riceve come input

**Frontend:**
- Slot promo: area nascosta di default nella pagina Dati Pet o Profilo Sanitario
- Si mostra solo quando il backend restituisce una raccomandazione
- Layout: card compatta con:
  - Nome prodotto
  - Breve spiegazione AI
  - Pulsante "Maggiori info" → overlay/modale con dettagli
  - Pulsante "Non mi interessa" → dismiss + evento `dismissed`
  - (Opzionale) Link "Acquista" → evento `buy_click` + apertura URL esterna
- Non invasivo: non blocca la navigazione, non copre contenuto critico

**Analytics:**
- Eventi tracciati: `impression`, `info_click`, `buy_click`, `dismissed`
- Inviati al backend con `POST /api/promo/event`
- Inline loading ADR-007 su recommendation (non sull'invio eventi, che può essere fire-and-forget)

**Modalità MOCK:**
- Per E2E e CI: il backend in modalità MOCK restituisce prodotti e spiegazioni predefinite
- Il frontend deve poter funzionare con risposte mock senza errori

### Criteri di accettazione
- [ ] Backend restituisce raccomandazione deterministica (o vuota se non pertinente)
- [ ] OpenAI genera solo la spiegazione, non sceglie il prodotto
- [ ] Nessuna promo se non clinicamente pertinente
- [ ] Slot promo non invasivo, dismissibile
- [ ] Eventi tracciati correttamente
- [ ] Modalità MOCK funzionante per CI
- [ ] Inline loading sulla recommendation
- [ ] CI verde

### NON fare in questa PR
- Non implementare il consenso analytics GDPR (sarà PR 12)
- Non fare logica promo nel client

---

## PR 11 — Hardening: sicurezza, audit, test, docs

**Branch:** `feat/hardening`
**Dipendenze:** tutte le PR precedenti
**File principali:** backend + test + docs

### Requisiti

**Sicurezza:**
- Controlli accesso backend per ruoli/tenant su tutti gli endpoint sensibili:
  - Documenti: solo owner può accedere ai propri
  - Sync: isolamento per `owner_user_id`
  - Promo: eventi legati all'utente corretto
- Validazione input su tutti i nuovi endpoint (documenti, promo, sync generico)
- URL firmate temporanee per accesso ai binari documenti (se non già implementato)

**Audit trail minimo:**
- Tabella `audit_log` o aggiunta alla tabella `changes`:
  - `who` (user_id), `when` (timestamp), `what` (action), `entity_id`, `outcome` (success/fail)
- Azioni logate:
  - Sync push/pull (batch + errori)
  - Upload/download documento
  - Generazioni AI (read/explain)
  - Promo eventi
  - Cambio ruolo attivo

**Test:**
- Aggiornare tutti i test E2E per i nuovi flussi:
  - Navigazione con ruoli
  - Upload documento
  - Inline loading visibile
- Test di regressione: tutti i flussi esistenti devono continuare a funzionare
- Test unitari: sync engine (idempotenza, conflitti)

**Documentazione:**
- Aggiornare `RELEASE_NOTES.md`
- Aggiornare `descrizione.md` con le nuove funzionalità
- Aggiornare `AGENTS.md` se necessario
- Aggiornare `TEST_PLAN.md`

### Criteri di accettazione
- [ ] Nessun endpoint sensibile accessibile senza autorizzazione corretta
- [ ] Audit log minimo funzionante
- [ ] Tutti i test E2E passano (vecchi + nuovi)
- [ ] Nessuna regressione UX
- [ ] Documentazione aggiornata
- [ ] CI verde su tutti i workflow

---

## PR 12 — (Opzionale) Robustezza & Osservabilità

**Branch:** `feat/observability`
**Dipendenze:** PR 11
**File principali:** backend + frontend

### Contesto
Queste voci sono raccomandate ma non core. Implementare solo se non creano conflitti o regressioni.

### Requisiti (pick & choose)

**12.1 — RBAC backend esteso:**
- Enforcement lato backend su tutti gli endpoint (non solo UI)
- Log rifiuti (403/404) con correlation ID

**12.2 — Stato Sync user-friendly:**
- Indicatore visivo: "In sync" / "In attesa" / "Errori" con timestamp ultimo sync
- Pulsanti: "Riprova sync", "Vedi dettagli" (lista errori outbox)
- In Debug: pannello Outbox (count, ultimi N op, errori, reset controllato)

**12.3 — Conflitti migliorati:**
- Se last-write-wins: mostrare evento informativo ("dato aggiornato da un altro dispositivo")
- Traccia di `base_version`, `server_version`, `resolved_by`

**12.4 — Lifecycle documenti:**
- Retention configurabile
- Versioning risultati AI (`ai_updated_at` + `ai_model`)
- Soft-delete con audit, purge solo admin

**12.5 — Consenso analytics promo (GDPR):**
- Toggle "Consenti analytics promo" per utente
- Se disabilitato: niente tracking eventi promo
- Microcopy in UI che spiega cosa viene tracciato

**12.6 — Correlation ID + logging:**
- `X-Correlation-Id` propagato frontend → backend → job async
- Logging standardizzato per timeout/abort, errori sync, errori viewer/upload

### Criteri di accettazione
- [ ] Funzionalità scelte implementate senza regressioni
- [ ] Nessun leak dati nei log
- [ ] CI verde
- [ ] Test mirati per le funzionalità aggiunte

---

## Diagramma dipendenze

```
PR 1 (Inline Loading core)
  └── PR 2 (Inline Loading apply)

PR 3 (Ridenominazioni + rimuovi Appuntamento)
  └── PR 4 (Sistema ruoli)
       └── PR 5 (Sidebar ruoli + guards)

PR 6 (Full pet sync)
  └── PR 7 (Sync engine generico)
       └── PR 8 (Documenti: upload + viewer)
            └── PR 9 (Documenti: AI)

PR 2 + PR 5 ──► PR 10 (Promo)

Tutte ──► PR 11 (Hardening)
            └── PR 12 (Opzionale: Osservabilità)
```

**Parallelismo possibile:**
- PR 1–2 e PR 3–5 possono procedere in parallelo
- PR 6–7 può procedere in parallelo a PR 3–5
- PR 10 necessita PR 2 e PR 5

---

## Modifiche rispetto al prompt_8 originale

1. **PR spezzate:** Le PR 1–2 (inline loading) e 3–4–5 (menu+ruoli) erano unite nel prompt originale. Le ho divise per ridurre la dimensione e il rischio di merge.
2. **Ordine rivisto:** L'inventario dati locali (PR 6) può partire in parallelo con la ristrutturazione menu, accelerando il piano.
3. **Documenti in 2 PR:** Upload+viewer (PR 8) separato dall'AI (PR 9) per avere un viewer funzionante e testabile prima di aggiungere la complessità AI.
4. **Appuntamento:** Confermata la rimozione completa, aggiunto redirect di sicurezza per bookmark esistenti.
5. **Profilo Sanitario:** Chiarita la regola "solo proprietario genera, veterinario read-only" con flussi specifici (da Archivio o da Q&A).
6. **Conflitti sync:** Scelta esplicita last-write-wins (anziché lasciare l'opzione aperta), con obbligo di logging e documentazione.
7. **Storage documenti:** Filesystem locale su Render per semplicità iniziale (no S3), con path configurabile.
8. **Sezione 12 (opzionale):** Raccolta in una singola PR opzionale per non diluire il focus delle PR core.
