# ADA (AbuPet AI) - Descrizione Completa dell'Applicazione

> Documento di riferimento per valutare la roadmap di prodotto.
> Versione corrente: **v6.17.9** | Data: 2026-02-03

---

## 1. Cos'e ADA

ADA (AbuPet AI) e un'applicazione web per la gestione di uno studio veterinario, con forte componente di intelligenza artificiale. Consente al veterinario di registrare una visita (audio o testo), ottenere una trascrizione automatica via OpenAI Whisper, generare un referto strutturato SOAP tramite GPT-4o, e gestire i dati dei pazienti (animali) con sincronizzazione offline-first.

**Target utente**: veterinario singolo o piccolo studio veterinario.

**Lingua UI**: italiano (con supporto multilingua per i referti: IT, EN, DE, FR, ES).

---

## 2. Architettura Generale

```
+------------------+       HTTPS/JSON       +------------------+       SQL        +------------+
|   Frontend SPA   | <-------------------> |  Backend Node.js  | <-------------> | PostgreSQL |
|   (GitHub Pages) |                        |    (Render.com)   |                 | (Render)   |
+------------------+                        +------------------+                 +------------+
       |                                           |
       | IndexedDB (offline)                       | OpenAI API
       | localStorage (sessione)                   |   - Whisper (trascrizione)
       v                                           |   - GPT-4o (SOAP, Q&A, tips)
  Browser client                                   |   - TTS (text-to-speech)
                                                   |   - Moderation
                                                   v
                                            OpenAI Cloud
```

### Stack tecnologico

| Livello | Tecnologia | Note |
|---------|-----------|------|
| Frontend | Vanilla JavaScript (SPA) | Nessun framework, singolo file HTML |
| Backend | Node.js + Express 4.19 | API REST, proxy OpenAI |
| Database | PostgreSQL | Hosted su Render.com |
| Auth | JWT (jsonwebtoken) | Password singola, token 4 ore |
| AI | OpenAI API | Whisper, GPT-4o, GPT-4o-mini, TTS-1 |
| Hosting frontend | GitHub Pages | https://abupet.github.io/ada/ |
| Hosting backend | Render.com | https://ada-au40.onrender.com |
| CI/CD | GitHub Actions | MOCK + REAL test pipelines |
| Test E2E | Playwright | Chromium, smoke + regression + long |

---

## 3. Struttura del Repository

```
ada/
├── docs/                          # Frontend SPA (deployato su GitHub Pages)
│   ├── index.html                 # Singolo file HTML con 17 pagine (~1.1 MB)
│   ├── app-core.js                # Navigazione, init, sessione (2546 righe)
│   ├── app-recording.js           # Registrazione audio, chunking, trascrizione (2514 righe)
│   ├── app-soap.js                # Generazione referto SOAP (1769 righe)
│   ├── app-pets.js                # Gestione multi-pet, sync offline, IndexedDB (1347 righe)
│   ├── app-tts.js                 # Text-to-Speech (397 righe)
│   ├── app-tips.js                # Tips & tricks (443 righe)
│   ├── app-data.js                # Foto, parametri vitali, diario, farmaci (566 righe)
│   ├── config.js                  # Configurazione, template, costi API (449 righe)
│   ├── runtime-config.js          # Endpoint API runtime (48 righe)
│   ├── styles.css                 # Foglio di stile (~30 KB)
│   ├── pets-sync-step4.js         # Push outbox verso backend (244 righe)
│   ├── pets-sync-merge.js         # Normalizzazione e merge dati pet (136 righe)
│   ├── pets-sync-bootstrap.js     # Auto-trigger sincronizzazione (113 righe)
│   └── decisions/                 # Architecture Decision Records
│
├── backend/
│   └── src/
│       ├── server.js              # Server Express, auth, CORS, proxy OpenAI (306 righe)
│       ├── db.js                  # Pool connessioni PostgreSQL (33 righe)
│       ├── pets.routes.js         # CRUD animali (202 righe)
│       └── pets.sync.routes.js    # Endpoint sync offline push/pull (215 righe)
│
├── sql/
│   └── 001_pets_and_changes.sql   # Schema DB (pets + pet_changes)
│
├── tests/
│   ├── e2e/                       # Test Playwright (9 spec files)
│   ├── unit/                      # Unit test (merge logic)
│   ├── policy/                    # Policy check
│   └── fixtures/                  # File audio/testo di test
│
├── .github/workflows/             # CI/CD pipelines (7 workflow)
├── specs/                         # Specifiche feature (attive + archivio)
├── tools/                         # Utility (configuratore API key)
├── RELEASE_NOTES.md               # Note di rilascio cumulative
├── AGENTS.md                      # Regole operative per sviluppatori
├── handoff.md                     # Guida sviluppo e test
├── NEXT_PROMPT.md                 # Prossimo sprint
└── TEST_PLAN.md                   # Piano di test
```

---

## 4. Funzionalita dell'App (stato attuale)

### 4.1 Registrazione e Trascrizione

Il veterinario avvia la registrazione audio durante la visita. Il sistema:

1. **Cattura audio** via MediaRecorder API del browser
2. **Chunking automatico**: per visite lunghe, spezza la registrazione in chunk configurabili
3. **Trascrizione parallela**: ogni chunk viene inviato a OpenAI Whisper in coda, con worker concorrenti
4. **Diarizzazione nativa**: identificazione speaker (veterinario/proprietario) tramite Whisper
5. **Persistenza progressiva**: testo trascritto salvato in IndexedDB (recuperabile dopo refresh)
6. **Profili automatici**: scelta MIME type in base al dispositivo (Windows/Android/iPhone)

Alternative alla registrazione:
- Upload di file audio
- Upload di file di testo
- Incolla testo manuale

Parametri chunking configurabili nelle impostazioni:
- Durata chunk, timeslice, max chunk pendenti, max trascrizioni concorrenti
- Retry count e backoff, soglia hard stop (MB), warning prima dello split

### 4.2 Referto SOAP

Dalla trascrizione, GPT-4o genera un referto strutturato:

- **S** (Soggettivo): anamnesi, sintomi riferiti dal proprietario
- **O** (Oggettivo): esame fisico, parametri misurati
- **A** (Assessment): diagnosi o diagnosi differenziale
- **P** (Piano): terapia, follow-up, raccomandazioni

**5 template disponibili:**
| Template | Uso |
|----------|-----|
| Generale | Visita di routine |
| Vaccinazione | Protocollo vaccinale |
| Emergenza | Pronto soccorso |
| Dermatologia | Visita dermatologica |
| Post-chirurgico | Follow-up chirurgico |

Ogni template aggiunge campi specialistici e una checklist con item tri-stato (si/no/indeterminato).

**Traduzioni**: il referto puo essere tradotto in EN, DE, FR, ES con un click.

**Export**: PDF o TXT con firma veterinario e data.

### 4.3 Spiegazione per il Proprietario

Dalla SOAP, il sistema genera una versione non-tecnica per il proprietario del pet:
- Riassunto in linguaggio semplice
- Glossario dei termini medici
- FAQ automatiche
- Lettura ad alta voce (TTS)
- Export PDF/TXT

### 4.4 Gestione Multi-Pet

Ogni veterinario gestisce piu animali:

- **Creazione**: nome, specie, razza, sesso, data di nascita, peso, note
- **Selettore pet**: cambio rapido tra animali
- **Dati per pet**: ogni pet ha i propri referti, foto, parametri vitali, diario, farmaci
- **Sincronizzazione offline-first**: i dati dei pet si sincronizzano con il server PostgreSQL

Specie supportate: Cane, Gatto, Altro.

### 4.5 Sincronizzazione Offline-First

L'app funziona anche offline. L'architettura di sync e basata su:

**Storage locale (IndexedDB):**
- `pets` — cache locale dei pet
- `outbox` — operazioni in attesa di push
- `meta` — cursore sync, timestamp
- `id_map` — mappatura ID temporanei → ID server

**Flusso di sincronizzazione (6 step):**
1. L'utente crea/modifica/elimina un pet → operazione salvata in `outbox`
2. Quando online, il client fa `push` (POST /api/sync/pets/push) con le operazioni pendenti
3. Il server accetta/rifiuta ogni operazione (conflict detection, UUID validation)
4. Il client fa `pull` (GET /api/sync/pets/pull?since=cursor) per ricevere le modifiche
5. Le modifiche remote vengono normalizzate e fuse (merge non-distruttivo)
6. Il cursore locale viene aggiornato solo dopo merge riuscito

**Controllo concorrenza ottimistico**: campo `version` sul record pet. Se `base_version` non corrisponde, il server rifiuta con `conflict` (409).

**Idempotenza**: ogni operazione ha un `op_id` UUID univoco per evitare duplicazioni.

### 4.6 Dati Clinici del Paziente

Per ogni pet:

- **Foto**: galleria con upload, cattura da fotocamera, visualizzazione fullscreen
- **Parametri vitali**: temperatura, frequenza cardiaca/respiratoria, pressione, peso — con grafici (Chart.js)
- **Diario clinico (Profilo sanitario)**: note cliniche con data
- **Farmaci**: nome, dose, frequenza, via di somministrazione
- **Appuntamenti**: data/ora, note

### 4.7 Domande & Risposte

- **Domande sul pet**: l'utente puo fare domande su qualunque argomento veterinario
- **Domande su un referto**: seleziona un referto dall'archivio e chiedi chiarimenti
- **Moderazione**: le domande e risposte passano per l'API di moderazione OpenAI (solo argomenti veterinari)

### 4.8 Tips & Tricks

- Generazione di consigli veterinari contestuali
- Persistenza per pet
- Contatore "mostrati finora"
- Possibilita di ricominciare

### 4.9 Archivio

- Lista storica di tutte le visite/referti
- Ricerca e filtro
- Apertura per modifica
- Eliminazione con pressione prolungata
- Ripristino di checklist e campi extra

### 4.10 Text-to-Speech (TTS)

- Espansione automatica delle abbreviazioni mediche
- Formattazione numeri per pronuncia corretta
- Chunking del testo (limite 4000 char per chiamata API)
- Riproduzione sequenziale
- Modello OpenAI TTS-1

### 4.11 Tracking Costi API

Monitoraggio in tempo reale dell'utilizzo:
- Token input/output GPT-4o e GPT-4o-mini
- Minuti di trascrizione Whisper
- Caratteri TTS
- Calcolo costi in USD basato su prezzi ufficiali OpenAI

---

## 5. Backend - Dettaglio

### 5.1 Endpoint API

#### Autenticazione
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | /auth/login | Login con password → JWT |

#### CRUD Animali (tutti richiedono JWT)
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | /api/pets | Lista animali dell'utente |
| GET | /api/pets/:pet_id | Dettaglio singolo animale |
| POST | /api/pets | Crea nuovo animale |
| PATCH | /api/pets/:pet_id | Aggiorna animale (concorrenza ottimistica) |
| DELETE | /api/pets/:pet_id | Elimina animale |

#### Sincronizzazione Offline
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | /api/sync/pets/pull | Pull modifiche dal cursore (max 500) |
| POST | /api/sync/pets/push | Push operazioni pendenti |

#### Proxy OpenAI (tutti richiedono JWT)
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | /api/chat | Proxy chat/completions (GPT-4o) |
| POST | /api/moderate | Proxy moderations API |
| POST | /api/transcribe | Proxy Whisper (upload multipart, max 25MB) |
| POST | /api/tts | Proxy audio/speech (TTS-1) |

#### Sistema
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | /api/health | Health check |

### 5.2 Schema Database PostgreSQL

#### Tabella `pets`
```sql
CREATE TABLE pets (
  pet_id       UUID PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  species      TEXT NOT NULL,
  breed        TEXT,
  sex          TEXT,
  birthdate    DATE,
  weight_kg    NUMERIC(6,2),
  notes        TEXT,
  version      INTEGER NOT NULL DEFAULT 1,    -- concorrenza ottimistica
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Tabella `pet_changes` (change log per sync)
```sql
CREATE TABLE pet_changes (
  change_id     BIGSERIAL PRIMARY KEY,        -- cursore monotonico
  owner_user_id TEXT NOT NULL,
  pet_id        UUID NOT NULL,
  change_type   TEXT NOT NULL CHECK (change_type IN ('pet.upsert','pet.delete')),
  record        JSONB,                         -- snapshot completo del pet (per upsert)
  version       INTEGER,
  client_ts     TIMESTAMPTZ,                   -- timestamp dal client
  device_id     TEXT,                          -- identificativo dispositivo
  op_id         UUID,                          -- idempotenza operazione
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indici: `(owner_user_id, change_id)` per query pull, `(pet_id)` per lookup.

### 5.3 Autenticazione

- Login con password singola (configurata via env var `ADA_LOGIN_PASSWORD`)
- Il server restituisce un JWT con claim `{ sub: "ada-user" }`
- TTL configurabile (default 4 ore, env var `TOKEN_TTL_SECONDS`)
- Il JWT viene inviato come `Authorization: Bearer <token>` su ogni richiesta
- Middleware `requireJwt` valida il token su tutti gli endpoint `/api/*`
- Tutti i dati sono isolati per `owner_user_id` (attualmente utente singolo: "ada-user")

### 5.4 Sicurezza

- **CORS**: validazione Origin obbligatoria in produzione (deve corrispondere a `FRONTEND_ORIGIN`)
- **Rate limiting**: 60 richieste/minuto globale (configurabile)
- **Validazione UUID**: tutti i `pet_id` e `op_id` sono validati come UUID v4 prima dell'inserimento in DB
- **Dimensione richieste**: limite 1MB per JSON, 25MB per upload multipart
- **ROLLBACK sicuro**: le transazioni DB gestiscono errori di connessione senza crash
- **Error handler globale**: middleware Express per errori non gestiti

### 5.5 Variabili d'Ambiente (Backend)

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| ADA_LOGIN_PASSWORD | - | Password di login |
| JWT_SECRET | - | Chiave firma JWT (obbligatorio in produzione) |
| FRONTEND_ORIGIN | - | Origin CORS consentito |
| DATABASE_URL | - | Stringa connessione PostgreSQL |
| OPENAI_API_KEY | - | Chiave API OpenAI |
| TOKEN_TTL_SECONDS | 14400 | Durata JWT (4 ore) |
| RATE_LIMIT_PER_MIN | 60 | Limite richieste/minuto |
| PORT | 3000 | Porta server |
| PG_POOL_MAX | 5 | Dimensione pool connessioni |
| MODE | (auto) | MOCK per test, REAL per produzione |

---

## 6. Frontend - Dettaglio

### 6.1 Architettura SPA

L'intera app e contenuta in un singolo file `index.html` (~1.1 MB) con 17 pagine gestite tramite show/hide di `<section>`. La navigazione e implementata in `app-core.js` tramite funzione `showPage(pageId)`.

**Nessun framework** (React, Vue, Angular): tutto e Vanilla JavaScript con manipolazione diretta del DOM.

### 6.2 Pagine dell'App

| # | ID Pagina | Nome UI | Funzione |
|---|-----------|---------|----------|
| 1 | page-recording | Registrazione | Cattura audio/testo della visita |
| 2 | page-soap | Referto | Referto SOAP strutturato |
| 3 | page-owner | Per il Proprietario | Spiegazione non-tecnica |
| 4 | page-patient | Profilo Sanitario | Profilo del pet |
| 5 | page-addpet | Aggiungi Pet | Creazione/modifica pet |
| 6 | page-photos | Foto | Galleria fotografica |
| 7 | page-vitals | Dati Vitali | Parametri vitali con grafici |
| 8 | page-diary | Diario Clinico | Note cliniche |
| 9 | page-qna | Q&A | Domande & Risposte |
| 10 | page-tips | Tips & Tricks | Consigli veterinari |
| 11 | page-history | Archivio | Storico visite/referti |
| 12 | page-medications | Terapie | Gestione farmaci |
| 13 | page-appointment | Appuntamenti | Calendario visite |
| 14 | page-settings | Impostazioni | Configurazione app |
| 15 | page-costs | Costi | Monitoraggio costi API |
| 16 | page-debug | Debug | Strumenti di test (nascosto se debug OFF) |

### 6.3 Navigazione Sidebar

```
ADA Logo
├── REGISTRAZIONE
│   └── Registrazione
├── REFERTI
│   ├── Referto (SOAP)
│   └── Per il Proprietario
├── PAZIENTE
│   ├── Profilo Sanitario
│   ├── Foto
│   ├── Dati Vitali
│   ├── Diario Clinico
│   └── Terapie
├── CLINICA
│   ├── Q&A
│   ├── Tips & Tricks
│   ├── Appuntamenti
│   └── Costi
├── DATI
│   └── Archivio
└── SISTEMA
    ├── Impostazioni
    ├── Debug (condizionale)
    └── Logout
```

### 6.4 Storage Locale

- **IndexedDB** (database `ada-pets-db`):
  - Store `pets`: cache locale dei pet
  - Store `outbox`: operazioni pendenti di sync
  - Store `meta`: cursori e metadati
  - Store `id_map`: mappatura ID temporanei → server
- **localStorage**:
  - `ada_auth_token`: JWT di sessione
  - `ada_device_id`: ID dispositivo
  - `ada_session`: marker di sessione
  - Preferenze varie (lingua, template, impostazioni)
- **sessionStorage**: stato temporaneo di sessione

### 6.5 Dipendenze Frontend (CDN)

- **Chart.js**: grafici parametri vitali
- **jsZip**: export cache audio come ZIP
- **jsPDF**: export referti in PDF

---

## 7. Ambiente di Installazione

### 7.1 Produzione (attuale)

| Componente | Servizio | URL |
|-----------|----------|-----|
| Frontend | GitHub Pages | https://abupet.github.io/ada/ |
| Backend | Render.com | https://ada-au40.onrender.com |
| Database | Render PostgreSQL | dpg-d5ui7ht6ubrc73bov9sg-a.frankfurt-postgres.render.com |

**Note Render.com**:
- Piano gratuito: il server va in "sleep" dopo inattivita (~15 minuti)
- Cold start: fino a 60 secondi al primo accesso dopo lo sleep
- SSL automatico
- Deploy automatico dal branch main (collegato al repo GitHub)

### 7.2 Sviluppo Locale

```bash
# Prerequisiti: Node.js LTS + npm

# Root del progetto
npm install
npx playwright install      # per i test E2E

# Avvia frontend (porta 4173)
npm run serve

# Avvia backend (porta 3000, richiede .env)
cd backend && npm start
```

File `.env` necessario per il backend:
```
ADA_LOGIN_PASSWORD=...
JWT_SECRET=...
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
FRONTEND_ORIGIN=http://localhost:4173
```

### 7.3 Configurazione Runtime Frontend

L'endpoint API del backend e configurabile a runtime in 3 modi (in ordine di priorita):
1. Query parameter: `?apiBaseUrl=https://...`
2. localStorage: chiave `ADA_API_BASE_URL`
3. Default: `https://ada-au40.onrender.com`

---

## 8. CI/CD e Testing

### 8.1 Pipeline CI/CD

| Workflow | Trigger | Modalita | Scopo |
|----------|---------|----------|-------|
| ci.yml | Ogni PR | MOCK | Gate di merge (obbligatorio) |
| ci-real.yml | Nightly + manuale | REAL + OpenAI | Test completi con API reale |
| real-on-label.yml | Label `run-real` | REAL + OpenAI | Test su PR rischiose |
| pages-cachebust.yml | Push su main | - | Deploy frontend su GitHub Pages |
| labeler.yml | Ogni PR | - | Auto-label in base ai file |
| ci-pr-failure-comment.yml | Fallimento CI | - | Commento automatico sulla PR |

### 8.2 Test Automatici

**Smoke test** (@smoke): login, navigazione, CRUD pet, upload file, sync base.

**Regression test**: audio 20s e 100s, elaborazione testo, generazione SOAP, flussi multi-pagina.

**Long test**: audio 40 minuti, validazione chunking, trascrizione parallela.

**Unit test**: logica di merge offline (normalizePetFromServer, mergePetLocalWithRemote).

**Policy check**: conformita codice, audit pacchetti.

```bash
npm run test:smoke        # Smoke test rapidi
npm run test:regression   # Suite completa
npm run test:ci           # Suite CI (policy + smoke + regression)
npm run test:ci:real      # Con API OpenAI reale
```

---

## 9. Modello Dati Concettuale

```
Utente (ada-user)
  └── Pet (0..N)
       ├── Anagrafica: nome, specie, razza, sesso, data nascita, peso, note
       ├── Visite/Referti (Archivio) (0..N)
       │    ├── Trascrizione audio
       │    ├── SOAP (S, O, A, P)
       │    ├── Dati specialistici + checklist
       │    ├── Spiegazione proprietario
       │    └── Traduzioni (EN, DE, FR, ES)
       ├── Foto (0..N)
       ├── Parametri Vitali (0..N)
       │    └── temperatura, FC, FR, PA, peso, data/ora
       ├── Diario Clinico (0..N)
       │    └── nota testuale + data
       ├── Farmaci (0..N)
       │    └── nome, dose, frequenza, via somministrazione
       ├── Appuntamenti (0..N)
       │    └── data/ora, note
       └── Tips generati (0..N)
```

**Nota**: attualmente solo i dati dei Pet (anagrafica) sono sincronizzati con il backend PostgreSQL. Tutti gli altri dati (referti, foto, parametri, farmaci, appuntamenti) sono salvati esclusivamente in localStorage/IndexedDB nel browser.

---

## 10. Limitazioni Attuali e Debito Tecnico

### 10.1 Architettura

| Area | Limitazione | Impatto |
|------|------------|---------|
| Utente singolo | Un solo utente ("ada-user"), nessun multi-tenant | Non scalabile per piu studi |
| Dati solo locali | Referti, foto, vitali, farmaci, appuntamenti in localStorage | Persi al cambio browser/dispositivo |
| SPA monolitica | Singolo HTML da 1.1 MB, 10K+ righe JS | Manutenzione complessa |
| Nessun framework | Vanilla JS con DOM manipulation | Refactoring costoso |
| Cold start Render | Backend in sleep, 60s di avvio | UX degradata al primo accesso |

### 10.2 Sicurezza

| Area | Limitazione | Rischio |
|------|------------|---------|
| JWT in localStorage | Vulnerabile a XSS | Token rubabile da script iniettato |
| Password singola | Nessun multi-utente, nessun ruolo | Non adatto a studi con piu veterinari |
| Rate limit globale | Non per-utente | Un utente puo saturare il limite |
| OpenAI key nel backend | Hex-encoded, non cifrata | Se il server e compromesso, la chiave e esposta |

### 10.3 Dati

| Area | Limitazione | Impatto |
|------|------------|---------|
| Sync solo pet | Solo anagrafica pet sincronizzata | Referti e altri dati non recuperabili |
| Nessun backup | localStorage/IDB non hanno backup server | Perdita dati su clear browser |
| Nessun export completo | Ogni referto esportabile singolarmente | Nessun export bulk dei dati |

### 10.4 Bug Noti Corretti (sessione corrente)

Durante l'analisi del codice sono stati identificati e corretti:

1. **Race condition** in `pullPetsIfOnline` — flag `__petsPullInFlight` non resettato in caso di errore
2. **base_version sempre null** — non passato nelle operazioni update/delete dell'outbox
3. **Validazione UUID mancante** — SQL injection possibile via pet_id e op_id
4. **op_id non UUID** — il campo `pet_changes.op_id` e tipo UUID, ma il backend non validava il formato, causando `server_error` opaco
5. **accepted.push prematura** — nel path delete idempotente, l'op_id poteva finire sia in accepted che rejected
6. **Error handling mancante** — route async senza try-catch, pool.connect fuori da try-catch
7. **CORS permissivo** — richieste senza Origin accettate in produzione
8. **Formattazione peso** — `petWeight` e `weight_kg` non formattati con 2 decimali
9. **Retry mancante** — nessun retry con backoff sulle chiamate push
10. **generateTmpPetId** — fallback generava ID non-UUID

---

## 11. Flusso Utente Tipico

```
1. Login (password) ──────────────────────────────────────────────────────┐
                                                                          │
2. Seleziona Pet (o creane uno nuovo)                                     │
                                                                          │
3. REGISTRAZIONE                                                          │
   ├── Avvia registrazione audio (o carica file/testo)                    │
   ├── Il sistema trascrive in tempo reale (chunking + Whisper)           │
   └── Trascrizione completata → genera referto SOAP automaticamente      │
                                                                          │
4. REFERTO SOAP                                                           │
   ├── Revisiona e modifica S/O/A/P + checklist                          │
   ├── (Opzionale) Traduci in altra lingua                                │
   ├── (Opzionale) Genera spiegazione per proprietario                    │
   ├── (Opzionale) Leggi ad alta voce (TTS)                              │
   ├── Salva in archivio                                                  │
   └── Esporta PDF/TXT                                                    │
                                                                          │
5. DATI PAZIENTE (durante o dopo la visita)                               │
   ├── Aggiorna parametri vitali                                          │
   ├── Scatta/carica foto                                                 │
   ├── Aggiorna farmaci                                                   │
   └── Fissa prossimo appuntamento                                        │
                                                                          │
6. (Background) Sync automatica dei dati pet con il server ───────────────┘
```

---

## 12. Prossimi Passi (da NEXT_PROMPT.md)

Attualmente in backlog:

1. **Sidebar close control** — chiusura sidebar senza selezionare una voce
2. **Tips & Tricks "Leggi"** — pulsante disabilitato quando non ci sono tips

Queste sono le prossime feature UX pianificate in `specs/PROMPT.md`.

---

## 13. Metriche del Codice

| Componente | File | Righe totali |
|-----------|------|-------------|
| Frontend JS | 13 file in docs/ | ~10,600 |
| Frontend HTML | index.html | ~17,000 (stima) |
| Frontend CSS | styles.css | ~900 |
| Backend | 4 file in backend/src/ | ~760 |
| Schema SQL | 1 file | 37 |
| Test E2E | 9 spec files | ~1,500 (stima) |
| Test Unit | 1 file | 151 |
| **Totale stimato** | | **~31,000 righe** |

---

## 14. Glossario

| Termine | Significato |
|---------|------------|
| SOAP | Subjective, Objective, Assessment, Plan — formato referto medico |
| IndexedDB | Database browser-side per storage offline |
| Outbox | Coda locale di operazioni pendenti da inviare al server |
| Cursor | Puntatore monotonicamente crescente per sync incrementale |
| Chunk | Segmento di registrazione audio per trascrizione parallela |
| TTS | Text-to-Speech — sintesi vocale |
| Whisper | Modello OpenAI per trascrizione audio → testo |
| GPT-4o | Modello OpenAI per generazione testo/ragionamento |
| Cold start | Tempo di avvio del backend su Render dopo periodo di inattivita |
| Diarizzazione | Identificazione dei diversi speaker in una registrazione |
| base_version | Versione del record al momento della modifica locale (controllo concorrenza) |
