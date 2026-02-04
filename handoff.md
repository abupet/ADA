# HANDOFF — ADA Development & Automated Testing

Questo documento definisce **come lavorare su ADA**, includendo sviluppo, test locali e test automatizzati via GitHub Actions. È la guida operativa unica e vincolante.

---

## 1. Obiettivi

- Sviluppare feature in modo incrementale e verificabile
- Garantire che **nessuna modifica entri in `main` senza CI verde**
- Usare correttamente i **due livelli di test**:
  - CI (PR) → MOCK, veloce, gate di merge
  - CI (REAL) → rete stretta + OpenAI reale, on-demand e nightly
- Fornire tracciabilità chiara (commit, PR, artifacts, commenti automatici)
- Mantenere il baseline stabile (ADA v7.0.0) e le funzionalità critiche integre

---

## 2. Stato attuale (v7.0.0)

### Nuove funzionalità rispetto a v6.x
- **Sistema ruoli**: Veterinario / Proprietario con sidebar e permessi differenziati
- **Documenti**: upload, viewer (PDF + immagini), AI read/explain
- **Sync engine generico**: outbox unificato, push/pull multi-entity, last-write-wins
- **InlineLoader**: componente di loading unificato (ADR-007)
- **Promo**: raccomandazioni backend + slot UI + analytics
- **Hardening**: security headers, audit log, validazione input
- **Osservabilità**: error capture, page view tracking, API metrics

### Architettura
- **Frontend**: vanilla JS SPA in `docs/`, IIFE pattern, nessun bundler
- **Backend**: Express 4 in `backend/src/`, JWT, PostgreSQL, multer
- **SQL**: migrazioni in `sql/` (001–005)
- **Test**: Playwright E2E in `tests/`

---

## 3. Regole generali di sviluppo

### 3.1 Branching
- Ogni attività → **branch dedicata**
- Naming: `feat/<descrizione>`, `fix/<descrizione>`, `ci/<descrizione>`
- Non lavorare mai direttamente su `main`

### 3.2 Commit
- Commit piccoli e mirati
- Messaggi chiari e descrittivi
- Evitare commit "miscellaneous"

---

## 4. Regole funzionali non negoziabili

### Release notes
- Deve esistere **un solo** file `RELEASE_NOTES.md` (cumulativo)
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

### Sistema ruoli
- Toggle nell'header, due ruoli: `veterinario` / `proprietario`
- Route guard attivo in `navigateToPage()`
- `ROLE_PERMISSIONS` in `config.js` definisce pagine/azioni per ruolo

### Documenti
- Upload max 10 MB, formati PDF/JPG/PNG/WebP
- Validazione MIME magic bytes server-side
- AI: "Leggi" solo vet, "Spiega" solo proprietario

---

## 5. Testing locale (obbligatorio prima della PR)

### 5.1 Setup
```bash
npm ci
```

### 5.2 Avvio applicazione
```bash
npm run serve
```
- L'app gira su `http://localhost:4173`

### 5.3 Test Playwright
- Smoke test:
```bash
npx playwright test --grep "@smoke"
```
- Suite completa:
```bash
npx playwright test
```

### 5.4 Variabili ambiente locali
In locale possono essere usati `.env` (non committati):
- `ADA_TEST_PASSWORD`
- `OPENAI_API_KEY`

---

## 6. CI su GitHub

### 6.1 CI (PR)
- File: `.github/workflows/ci.yml`
- Trigger: ogni Pull Request
- Modalità: `MODE=MOCK`, `STRICT_NETWORK=0`
- È il **gate di merge** (branch protection)

### 6.2 CI (REAL)
Due modalità:
1. **Nightly automatica** (`ci-real.yml`)
2. **On-label su PR** (`real-on-label.yml`, label `run-real`)

Configurazione: `MODE=REAL`, `STRICT_NETWORK=1`, `ALLOW_OPENAI=1`

---

## 7. Diagnostica fallimenti

### 7.1 Artifacts
Su fallimento: `playwright-report`, `test-results`, `server-log`

### 7.2 Commento automatico su PR
Se CI (PR) fallisce, un commento automatico indica: link al run, commit SHA, next steps.

---

## 8. Cosa fare quando CI fallisce

1. Aprire il link del run
2. Identificare il primo errore reale
3. Scaricare artifacts se Playwright fallisce
4. Correggere il codice
5. Push → CI riparte automaticamente

Non aggirare mai i test.

---

## 9. Divieti espliciti

- Non usare `ada-tests.sh` in CI GitHub
- Non disabilitare test per "far passare la build"
- Non committare secrets
- Non mergiare senza CI (PR) verde

---

## 10. Cosa fare per primo

- Leggere `AGENTS.md`
- Leggere `RELEASE_NOTES.md`
- Verificare che i test passino (`npm run test:ci`)
- Segnalare immediatamente eventuali errori

---

## 11. Stato finale atteso

Una versione è considerata **completata** solo quando:
- Tutti i requisiti sono implementati
- CI (PR) è verde
- Eventuali CI (REAL) sono verdi
- `RELEASE_NOTES.md` è aggiornato

---

**Questo file è la fonte di verità operativa.**
