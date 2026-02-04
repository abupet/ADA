# ADA – AbuPet AI

Repository dell'app ADA (AbuPet AI) — assistente veterinario con AI.

**Versione corrente:** 7.0.0

---

## Prerequisiti

- Node.js (consigliato LTS)
- npm
- Playwright (installato come dev dependency nel repo)
- PostgreSQL (per il backend, opzionale in modalità MOCK)

---

## Installazione

Dalla root del repository:

```bash
npm install
npx playwright install
```

---

## Configurazione ambiente (.env)

I file `.env` contengono configurazioni locali e/o segreti e **non devono essere committati**.

1. Crea il file `.env` partendo dall'esempio:

```bash
cp .env.example .env
```

2. Modifica `.env` secondo le tue esigenze locali.

Variabili principali:
- `ADA_LOGIN_PASSWORD` — password di login
- `JWT_SECRET` — segreto per token JWT
- `FRONTEND_ORIGIN` — URL del frontend (per CORS)
- `DATABASE_URL` — stringa di connessione PostgreSQL
- `DOCUMENT_STORAGE_PATH` — percorso storage documenti (default: `uploads/`)

---

## Architettura

```
docs/           Frontend (vanilla JS SPA, servito da GitHub Pages o http-server)
backend/src/    Backend Express (JWT auth, PostgreSQL, OpenAI proxy)
sql/            Migrazioni SQL (001–005)
tests/          Test E2E Playwright (smoke, regression, policy)
```

**Frontend:** nessun bundler, tutti i file JS caricati via `<script>` in `index.html`, pattern IIFE.

**Backend:** Express 4, autenticazione JWT, PostgreSQL via `pg`, multer per upload, proxy OpenAI.

---

## Avvio

### Frontend (server locale)

```bash
npm run serve
```

L'app sarà disponibile a `http://localhost:4173/index.html`.

### Backend

```bash
cd backend && npm start
```

Richiede `DATABASE_URL` nel `.env` per le funzionalità di sync, documenti e promo.
In modalità MOCK (`MODE=MOCK`), il backend funziona senza database.

---

## Strumenti utili

### Configuratore API Key (tool locale)

Per generare `ENCRYPTED_KEY` e `SALT` da inserire in `config.js`, apri:

```
tools/configuratore.html
```

---

## Test E2E (Playwright)

### Smoke tests

```bash
npm run test:smoke
```

### Smoke tests con STRICT_NETWORK

```bash
npm run test:smoke:strict
```

Allowlist: `cdnjs.cloudflare.com` (Chart.js, jszip, jspdf)

### Regression tests

```bash
npm run test:regression
```

### Suite CI (policy + smoke + regression)

```bash
npm run test:ci
```

### Suite CI con test long

```bash
npm run test:ci:real
```

### Solo test long

```bash
npm run test:ci:long
```

### Smoke su app deployata

```bash
npm run test:deployed
```

---

## Output dei test

Playwright genera automaticamente:

- `test-results/` (screenshot, video e trace per i test falliti)
- `playwright-report/` (report HTML interattivo)

Per aprire l'ultimo report:

```bash
npx playwright show-report
```

---

## Funzionalità principali (v7.0.0)

- **Sistema ruoli**: Veterinario / Proprietario con sidebar e permessi differenziati
- **Documenti**: upload PDF/JPG/PNG/WebP, viewer, AI read/explain
- **Sync engine**: outbox unificato offline-first, push/pull multi-entity
- **Inline Loading**: componente di caricamento unificato con timer e abort
- **Promo**: raccomandazioni personalizzate per pet
- **Registrazione audio**: chunking automatico, trascrizione parallela
- **SOAP**: generazione referto da trascrizione via GPT-4o
- **Q&A**: domande e risposte con AI sul pet
- **Tips & Tricks**: consigli AI personalizzati

---

## Note su Windows

- Evitare cartelle sincronizzate (es. OneDrive) per evitare errori `EPERM`.
- Consigliato: `C:\MyRepo\ada`
