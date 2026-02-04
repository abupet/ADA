# AGENTS.md v2
# Operational rules for AI agents on ADA

This file defines **how AI agents must operate** when developing ADA.
It is aligned with `handoff.md` and is **mandatory**.

---

## 1. Source of truth

Agents must follow, in this order:

1. `handoff.md` (primary operational guide)
2. Existing codebase and tests
3. CI feedback (GitHub Actions)
4. `RELEASE_NOTES.md` for version history

---

## 2. Architecture overview

ADA is a vanilla JS single-page application with an Express backend.

**Frontend** (`docs/`):
- No modules/bundlers; all files loaded via `<script>` tags in `index.html`
- IIFE pattern: `(function(global) { ... })(window)`
- Key modules: `config.js`, `app-core.js`, `app-data.js`, `app-recording.js`, `app-soap.js`, `app-pets.js`, `app-loading.js`, `app-documents.js`, `sync-engine.js`, `app-promo.js`, `app-observability.js`

**Backend** (`backend/src/`):
- Express 4, JWT auth, PostgreSQL via `pg`, multer for uploads
- Routes: `pets.routes.js`, `pets.sync.routes.js`, `sync.routes.js`, `documents.routes.js`, `promo.routes.js`

**SQL migrations** (`sql/`): 001–005

**Tests** (`tests/`): Playwright E2E (smoke, regression), policy checks

**Current version**: 7.0.0

---

## 3. Development rules

### 3.1 Branching
- Never work on `main`
- Always create a dedicated branch
- Naming:
  - `feat/<short-description>`
  - `fix/<short-description>`
  - `ci/<short-description>`

### 3.2 Commits
- Small, focused commits
- Clear messages
- No unrelated changes

---

## 4. Key systems (v7.0.0)

### Role system
- Two roles: `veterinario`, `proprietario`
- `ROLE_PERMISSIONS` in `config.js` defines pages/actions per role
- Toggle in header, persisted in `localStorage` (`ada_active_role`)
- Route guard in `navigateToPage()` enforces permissions

### Sync engine
- Unified outbox in IndexedDB (`ada_sync`)
- Multi-entity push/pull via `/api/sync/push` and `/api/sync/pull`
- Conflict resolution: last-write-wins with logging
- Idempotency via `op_id` (UUID, UNIQUE index in DB)

### Document management
- Upload: PDF, JPG, PNG, WebP (max 10 MB)
- MIME validation via magic bytes (server-side)
- AI: "Read" (vet only, GPT-4o vision) and "Explain" (owner only)
- IndexedDB offline storage with sync

### InlineLoader
- Reusable loading component with AbortController
- Timer thresholds, hard timeout 45s, retry
- Applied to async operations app-wide

---

## 5. Local testing (required)

```bash
npm ci
npm run serve          # http://localhost:4173
npx playwright test --grep "@smoke"
```

Full suite if needed:
```bash
npx playwright test
```

Local `.env` may be used but never committed.

---

## 6. CI on GitHub

### 6.1 CI (PR) — mandatory
- Runs on every PR
- MODE=MOCK
- STRICT_NETWORK=0
- Must be green to merge

### 6.2 CI (REAL)
Triggered by:
- Nightly schedule
- Label `run-real`
- Automatic labeling for risky paths

REAL configuration:
- MODE=REAL
- STRICT_NETWORK=1
- ALLOW_OPENAI=1
- STRICT_ALLOW_HOSTS=cdnjs.cloudflare.com

---

## 7. Handling CI failures

When CI (PR) fails:
1. Read the automatic PR comment
2. Open the linked run
3. Identify root cause
4. Use artifacts if Playwright failed
5. Fix and push

Never bypass tests.

---

## 8. Explicit prohibitions

- Do not use `ada-tests.sh` in GitHub CI
- Do not disable or skip tests
- Do not commit secrets
- Do not merge without CI (PR) green
- Do not change workflows without understanding impact

---

## 9. Definition of done

A change is complete only when:
- Requirements are implemented
- CI (PR) is green
- Any triggered CI (REAL) is green
- `RELEASE_NOTES.md` is updated

---

Agents must operate as if CI enforcement were absolute.
