# AGENTS.md v4
# Guida operativa per lo sviluppo di ADA

Questo file è la **fonte di verità operativa** per chiunque lavori su ADA (umano o agente AI).
È **obbligatorio** seguirlo.

---

## 1. Fonti di riferimento

In ordine di priorità:

1. Questo file (`AGENTS.md`)
2. Codebase e test esistenti
3. CI feedback (GitHub Actions)
4. `documentazione/RELEASE_NOTES.md` per storico versioni
5. `documentazione/README.md` per setup e avvio

---

## 2. Architettura

ADA è una SPA vanilla JS con backend Express.

**Frontend** (`frontend/`):
- No moduli/bundler; tutti i file caricati via `<script>` in `index.html`
- Pattern IIFE: `(function(global) { ... })(window)`
- Moduli principali: `config.js`, `app-core.js`, `app-data.js`, `app-recording.js`, `app-soap.js`, `app-pets.js`, `app-loading.js`, `app-documents.js`, `app-promo.js`, `app-observability.js`

**Backend** (`backend/src/`):
- Express 4, JWT auth, PostgreSQL via `pg`, multer per upload
- Route: `pets.routes.js`, `pets.sync.routes.js`, `sync.routes.js`, `documents.routes.js`, `promo.routes.js`

**SQL migrations** (`sql/`): 001–031

**Test** (`tests/`): Playwright E2E (smoke, regression), policy checks

**Versione corrente:** 9.3.0

---

## 3. Ambienti

ADA opera con due ambienti separati:

| | Produzione | Sviluppo |
|---|---|---|
| **Branch** | `main` (protetto, richiede PR) | `dev` (protetto, richiede PR) |
| **Frontend** | GitHub Pages: https://abupet.github.io/ada/ | GitHub Pages: https://abupet.github.io/ada-dev/ |
| **Backend** | Render: https://ada-au40.onrender.com | Render: https://ada-backend-dev.onrender.com |
| **Database** | PostgreSQL su Render (Frankfurt) | PostgreSQL su Neon.tech (Frankfurt) |

### Workflow di sviluppo

1. Crea feature branch da `dev`: `git checkout -b feature/xxx`
2. Lavora e committa
3. Crea PR verso `dev` → CI deve passare → merge
4. Testa su ambiente dev (GitHub Pages ada-dev)
5. Quando stabile: crea PR `dev → main` → CI deve passare → merge → deploy produzione
6. Dopo merge in main, riallinea dev: `git checkout dev && git merge main && git push origin dev`

### Migrazioni database

Le migrazioni NON sono automatiche. Nuovi file SQL in `sql/`:
1. Applicare prima sul DB dev (Neon.tech)
2. Testare su ambiente dev
3. Applicare sul DB prod (Render) prima o durante il merge in main

### Routing frontend dev/prod

Il file `frontend/index.html` contiene un inline script che rileva automaticamente l'ambiente:
- pathname inizia con `/ada-dev` → backend dev
- hostname contiene `github.io` (path `/ada/`) → backend prod
- localhost → backend locale

---

## 4. Regole di sviluppo

### 4.1 Branching
- Non lavorare mai su `main`
- Branch dedicato per ogni attività
- Naming: `feat/<descrizione>`, `fix/<descrizione>`, `ci/<descrizione>`

### 4.2 Commit
- Piccoli e mirati
- Messaggi chiari e descrittivi
- Non includere modifiche non correlate

---

## 5. Sistemi chiave (v7.3.2)

### Sistema ruoli
- Ruoli: `veterinario`, `proprietario`, `breeder`, `vet_int`, `vet_ext`, `admin_brand`, `super_admin`
- `ROLE_PERMISSIONS` in `config.js` definisce pagine/azioni per ruolo
- Toggle nell'header, persistito in `localStorage` (`ada_active_role`)
- Route guard in `navigateToPage()` applica i permessi

### B2B (v9.0.0)
- **Breeder Hub**: dashboard KPI, gestione cucciolate, registrazione cuccioli, vendita, programmi sanitari, protocolli vaccinali
- **Referral Workflow**: 9 specialità, status tracking end-to-end, SLA configurabili, audit trail
- **Booking Online**: catalogo servizi, slot disponibilità, prenotazione singola/bulk, prezzi breeder

### Pets (online-only, v8.15.1+)
- Nessun IndexedDB, nessun sync offline — tutti i CRUD via API REST dirette (`GET/POST/PATCH/DELETE /api/pets`)
- In-memory `petsCache` con `_normalizePetForUI()` per mappare formato server → formato UI
- `refreshPetsFromServer()` per ricaricare lista dal server

### Documenti (online-only, v8.15.2+)
- Nessun IndexedDB — tutti i CRUD via API REST (`GET/POST/DELETE /api/documents`)
- Upload: PDF, JPG, PNG, WebP (max 10 MB)
- Validazione MIME magic bytes server-side
- AI: "Leggi" (solo vet, GPT-4o vision), "Spiegami il documento" (solo proprietario)
- Storage offline IndexedDB con sync

### SOAP
- Generazione referto da trascrizione via GPT-4o
- Campi: S, O, A, P + "Note interne (non stampate)" (solo vet, non esportate)
- Read-only view per proprietario (`page-soap-readonly`)
- Esportazione PDF/TXT (note interne escluse)
- Spiegazione owner: tono "il team Abupet"

### InlineLoader
- Componente di loading riutilizzabile con AbortController
- Timer thresholds, hard timeout 45s, retry
- Applicato a tutte le operazioni async

---

## 6. Regole funzionali non negoziabili

### Versionamento (regola vincolante)
- La versione dell'applicazione segue il formato **`vX.Y.Z`**
- **Ogni volta** che una qualunque modifica del codice viene mergata in GitHub, la versione **deve** cambiare
- Solo il proprietario del progetto può decidere quando e come modificare **X** o **Y**; in quel caso **Z = 0**
- Se non viene data indicazione diversa, si incrementa **Z di 1**
- La versione corrente è indicata in questo file (sezione 2) e in `documentazione/RELEASE_NOTES.md`

### Release notes
- Deve esistere **un solo** file `documentazione/RELEASE_NOTES.md` (cumulativo)
- Ogni release aggiunge una nuova sezione `## vX.Y.Z`
- Non creare file di release notes separati

### Pagina Registrazione — pulsanti obbligatori
Devono funzionare sempre:
- Microfono (`toggleRecording`)
- Carica audio
- Carica audio lungo (test chunking)
- Carica testo lungo (test append)
- Carica testo

### Caricamento script
- `app-recording.js` deve caricarsi senza errori di sintassi
- Se fallisce, i pulsanti Registrazione non funzionano

---

## 7. Testing

### 7.1 Test locali (obbligatori prima della PR)
```bash
npm ci
npm run serve          # http://localhost:4173
npx playwright test --grep "@smoke"
```

Suite completa:
```bash
npx playwright test
```

`.env` locali ammessi ma mai committati.

### 7.2 Piano test manuale
Vedi `documentazione/TEST_PLAN.md` per test step-by-step.

---

## 8. CI su GitHub

### 8.1 CI (PR) — obbligatoria
- Trigger: ogni Pull Request
- MODE=MOCK, STRICT_NETWORK=0
- **Gate di merge** (branch protection)

### 8.2 CI (REAL)
Trigger:
- Nightly automatica
- Label `run-real` su PR
- Auto-labeling per path rischiosi

Configurazione: MODE=REAL, STRICT_NETWORK=1, ALLOW_OPENAI=1, STRICT_ALLOW_HOSTS=cdnjs.cloudflare.com

### 8.3 Gestione fallimenti CI
1. Leggere il commento automatico sulla PR
2. Aprire il run linkato
3. Identificare la causa (primo errore reale)
4. Scaricare artifacts se Playwright fallisce
5. Correggere e pushare

Non aggirare mai i test.

---

## 9. Divieti espliciti

- Non usare `ada-tests.sh` in CI GitHub
- Non disabilitare o saltare test per "far passare la build"
- Non committare secrets
- Non mergiare senza CI (PR) verde
- Non modificare workflow senza capirne l'impatto

---

## 10. Definition of done

Un cambiamento è completo solo quando:
- Requisiti implementati
- CI (PR) verde
- Eventuali CI (REAL) verdi
- `documentazione/RELEASE_NOTES.md` aggiornato (se cambiamento user-facing)
- **Test automatici verificati e aggiornati** (se cambiamento user-facing o comportamentale): controllare che i test E2E esistenti in `tests/` coprano il nuovo comportamento; aggiungere o aggiornare i test se necessario

---

Questo file è la fonte di verità operativa.
