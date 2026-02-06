# ADA — Sistema Promo 1:1 & Partner Marketing

## Guida di implementazione per Claude Code

> **Versione:** 3.0 · **Data:** 06/02/2026
> **Riferimento funzionale:** `ADA_Promo_Analisi_Funzionale_Partner_Marketing_v2_0.docx`
> **Baseline codebase:** ADA v7.1.0 (ada-v6_12.2)

---

## 0. Contesto del progetto — LO STATO REALE DI ADA

### 0.1 Stack REALE (non ipotizzato)

ADA **non** è un progetto React/TypeScript/Prisma. È:

- **Frontend:** SPA vanilla JavaScript, NO bundler, NO framework. File `.js` caricati via `<script>` in un singolo `docs/index.html` (1135 righe, tutte le pagine inline). Pattern IIFE `(function(global) { ... })(window)`. Ogni modulo espone funzioni su `window`.
- **Backend:** Express 4 (CommonJS), file `.js` (non TypeScript). Singola directory `backend/src/`. Dipendenze minime: express, pg, jsonwebtoken, cors, multer, express-rate-limit.
- **Database:** PostgreSQL via `pg` (Pool diretto, raw SQL). NO ORM. Migrazioni in `sql/` come file `.sql` numerati sequenzialmente (001→006 esistenti).
- **AI:** OpenAI API (GPT-4o, GPT-4o-mini, Whisper, TTS) via proxy backend (`proxyOpenAiRequest()`). Chiave in env var `OPENAI_API_KEY`.
- **Auth:** JWT single-user. Una password unica → token con `sub: "ada-user"`. NON c'è un sistema utenti con email/password individuali. NON c'è multi-user nel DB.
- **Ruoli:** Solo lato client. `localStorage` (`ada_active_role`) con toggle veterinario/proprietario. Il backend NON distingue i ruoli — ogni JWT ha `sub: "ada-user"`.
- **Testing:** Playwright E2E + policy checks. Runner: `@playwright/test`. NO vitest, NO jest.
- **Deploy:** Frontend come static files (`docs/`), backend su Node.js. CI con GitHub Actions.

### 0.2 File chiave esistenti

```
ada/
├── AGENTS.md                          # Regole operative (OBBLIGATORIO seguirlo)
├── docs/                              # Frontend SPA (static files)
│   ├── index.html                     # Tutte le pagine inline, script tags
│   ├── config.js                      # Auth, ruoli, ROLE_PERMISSIONS, API costs, SOAP schema
│   ├── app-core.js                    # navigateToPage(), sidebar, lifecycle app
│   ├── app-data.js                    # Gestione dati pets client-side
│   ├── app-recording.js               # Registrazione audio
│   ├── app-soap.js                    # Generazione referto SOAP
│   ├── app-pets.js                    # CRUD pets frontend
│   ├── app-documents.js               # Upload e AI documenti
│   ├── app-promo.js                   # ⬅ Modulo promo ESISTENTE (v1, mock data)
│   ├── app-loading.js                 # InlineLoader component
│   ├── app-observability.js           # Telemetry frontend
│   ├── app-tips.js, app-tts.js        # Tips, text-to-speech
│   ├── app-testdata.js                # Dati di test
│   ├── sync-engine.js                 # Sync generico IndexedDB → backend
│   ├── pets-sync-*.js                 # Sync pets specifico
│   └── styles.css                     # CSS globale
├── backend/src/
│   ├── server.js                      # Entry point, auth, OpenAI proxy, audit middleware
│   ├── db.js                          # Pool PostgreSQL (getPool)
│   ├── pets.routes.js                 # CRUD pets (pattern da seguire)
│   ├── pets.sync.routes.js            # Sync pets offline
│   ├── sync.routes.js                 # Sync generico
│   ├── documents.routes.js            # Upload documenti + AI read/explain
│   └── promo.routes.js                # ⬅ Routes promo ESISTENTI (v1, mock catalog)
├── sql/                               # Migrazioni (001→006 esistenti)
│   ├── 005_audit_log.sql              # ⬅ audit_log GIÀ esiste
│   └── 006_pets_extra_data.sql
└── tests/
    ├── e2e/                           # Playwright specs
    └── policy/                        # Policy + security checks
```

### 0.3 Cosa esiste GIÀ del modulo promo

**Backend (`promo.routes.js` v1):**
- `GET /api/promo/recommendation?petId=X` — selezione da catalogo hardcoded di 8 prodotti mock
- `POST /api/promo/recommendation` — variante con body
- `POST /api/promo/event` — tracking eventi (salva in audit_log oppure in-memory)
- Selezione deterministica via hash del petId
- Mock mode senza DATABASE_URL

**Frontend (`app-promo.js` v1):**
- `loadPromoRecommendation(petId)` — fetch con fallback mock locale
- `trackPromoEvent(type, productId, petId, metadata)` — fire-and-forget
- `renderPromoSlot(containerId)` — rendering card con InlineLoader
- Mock products client-side, dismiss via localStorage
- CSS iniettato programmaticamente
- **NON integrato in nessuna pagina** — `renderPromoSlot` non viene mai chiamato

**Database:** `audit_log` esiste (005). Nessuna tabella promo-specifica.

### 0.4 Vincoli architetturali CRITICI

1. **NO import/export ES modules nel frontend.** Tutto è su `window`. Nuovi moduli: pattern IIFE.
2. **NO TypeScript nel backend.** Solo `.js` CommonJS con `require`.
3. **NO ORM.** Raw SQL con `pg`. Migrazioni: file `.sql` in `sql/`.
4. **Auth single-user.** JWT con `sub: "ada-user"`. Il backend NON distingue utenti né ruoli.
5. **Nuove pagine vanno inline in `index.html`** e registrate in `ROLE_PERMISSIONS` di `config.js`.
6. **`AGENTS.md` è legge.** Branching, commit, testing, definition of done.

### 0.5 Principi non negoziabili

1. **Il backend decide cosa mostrare.** Selezione deterministica. Mai delegare a OpenAI.
2. **OpenAI genera solo spiegazioni.** Riceve pet_summary ridotto + UN item + contesto.
3. **Meglio null che sbagliato.** Se non c'è promo pertinente → null.
4. **UX non invasiva.** Frequency cap, dismiss, opt-out.
5. **Separazione medico/commerciale.** Disclaimer fisso.
6. **Tag clinici = governance rafforzata.** Consenso esplicito obbligatorio.
7. **Privacy-by-design.** Bucket, aggregati, soglie anti re-identificazione.

### 0.6 Struttura delle PR

| PR | Nome | Contenuto |
|----|------|-----------|
| 1 | **Auth multi-utente, RBAC, Multi-tenant** | Tabelle users/tenants, login individuale, JWT con ruoli, middleware RBAC, audit log potenziato |
| 2 | **Tag System, Consent, Catalogo, Eligibility** | Tag dictionary, computeTags, consent, CRUD promo_items, eligibility engine |
| 3 | **Explanation Engine, Delivery UX, Tracking, Vet Flag** | OpenAI spiegazioni+caching, riscrittura app-promo.js, integrazione in pagine, eventi, vet_flag |
| 4 | **Dashboard Admin, Report, Wizard CSV** | Pagine admin, dashboard, report aggregati, export, import CSV |

---

## 1. Convenzioni globali

### 1.1 Pattern backend (copiare lo stile di pets.routes.js)

```javascript
const express = require("express");
const { getPool } = require("./db");

function myRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  router.get("/api/my-thing", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT ...", [params]);
      res.json({ data: rows });
    } catch (e) {
      console.error("GET /api/my-thing error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}
module.exports = { myRouter };
```

### 1.2 Pattern frontend (copiare lo stile di app-promo.js)

```javascript
(function(global) {
  'use strict';
  function _privateHelper() { }
  function publicFunction() { }
  global.publicFunction = publicFunction;
})(typeof window !== 'undefined' ? window : this);
```

### 1.3 Naming

- Tabelle DB: snake_case plurale. Colonne: snake_case.
- File backend: `[modulo].routes.js` per routes, `[modulo].service.js` per logica.
- File frontend: `app-[modulo].js` in `docs/`.
- Migrazioni: `sql/NNN_descrizione.sql` (prossima: 007).
- API: `/api/promo/*` owner, `/api/admin/*` admin_brand, `/api/superadmin/*` super_admin.

### 1.4 Testing e CI

- Playwright E2E in `tests/e2e/`, file: `[tipo].[feature].spec.ts`
- Policy checks in `tests/policy/policy-checks.js`
- **PRIMA DI OGNI PR:** `npm run test:smoke` deve passare
- **MAI** rompere backward compatibility sulle route API esistenti

---

## PR 1 — Auth multi-utente, RBAC, Multi-tenant

### Obiettivo

Il sistema auth attuale (password singola, JWT `sub: "ada-user"`) è inadeguato per multi-tenant. Questa PR introduce login individuale con email/password, 4 ruoli, isolamento tenant e audit potenziato. **Nessuna promo visibile ancora** — solo fondamenta.

### 1A. Migrazione: `sql/007_users_tenants_rbac.sql`

```sql
-- Dipendenza nuova backend: npm install bcryptjs (puro JS, no native)

CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    base_role       TEXT NOT NULL DEFAULT 'owner',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    config      JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tenants (
    user_id     TEXT NOT NULL REFERENCES users(user_id),
    tenant_id   TEXT NOT NULL REFERENCES tenants(tenant_id),
    role        TEXT NOT NULL DEFAULT 'admin_brand',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- Potenziare audit_log con tenant awareness
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_role TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at);
```

### 1B. Backend: auth refactor in `server.js`

- Aggiungere `require("bcryptjs")` alle dipendenze.
- **Mantenere** `POST /auth/login` legacy (password singola) invariato per backward compatibility.
- Aggiungere `POST /auth/login/v2`:
  - Body: `{ email, password }`
  - Lookup in tabella `users`, bcrypt compare.
  - Se admin_brand: lookup in `user_tenants` per trovare il tenantId.
  - JWT payload v2: `{ sub: user_id, email, role, tenantId }`.
- Il middleware `requireJwt` già esistente decodifica entrambi i formati.

### 1C. Creare `backend/src/rbac.middleware.js`

```javascript
/**
 * LOGICA:
 * - req.user.sub === "ada-user" (JWT legacy) → role "owner" o "vet" da header X-Ada-Role
 * - req.user.role presente (JWT v2) → verificare nella lista allowedRoles
 * - Se route ha :tenantId → verificare che admin_brand.tenantId corrisponda
 * - Super admin: accesso cross-tenant, ma loggato
 * - Iniettare req.promoAuth = { userId, role, tenantId }
 *
 * USO nelle route:
 *   router.get("/api/admin/:tenantId/items", requireAuth, requireRole(['admin_brand','super_admin']), handler);
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "unauthorized" });

    // Legacy JWT
    if (user.sub === "ada-user") {
      const legacyRole = req.headers["x-ada-role"] === "vet" ? "vet" : "owner";
      if (!allowedRoles.includes(legacyRole)) return res.status(403).json({ error: "forbidden" });
      req.promoAuth = { userId: "ada-user", role: legacyRole, tenantId: null };
      return next();
    }

    // V2 JWT
    if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "forbidden" });
    const paramTenant = req.params.tenantId;
    if (paramTenant && user.role === "admin_brand" && user.tenantId !== paramTenant) {
      return res.status(403).json({ error: "forbidden_cross_tenant" });
    }
    req.promoAuth = { userId: user.sub, role: user.role, tenantId: user.role === "super_admin" ? paramTenant : user.tenantId };
    return next();
  };
}
module.exports = { requireRole };
```

### 1D. Frontend: aggiornare `config.js`

Aggiungere a `ROLE_PERMISSIONS`:
```javascript
admin_brand: {
    pages: ['admin-dashboard','admin-catalog','admin-campaigns','admin-wizard','settings'],
    actions: ['manage_catalog','manage_campaigns','view_dashboard','export_reports','run_wizard']
},
super_admin: {
    pages: ['admin-dashboard','admin-catalog','admin-campaigns','admin-wizard',
            'superadmin-tenants','superadmin-policies','superadmin-tags','superadmin-audit','settings'],
    actions: ['manage_catalog','manage_campaigns','view_dashboard','export_reports',
              'run_wizard','manage_tenants','manage_policies','manage_tags','view_audit']
}
```

Modificare la logica di login per supportare `/auth/login/v2` e decodificare il ruolo dal JWT payload (base64 decode senza verifica — la verifica è server-side).

### 1E. Checklist PR1

- [ ] Migrazioni SQL eseguite senza errori
- [ ] Login legacy invariato (backward compatible)
- [ ] Login v2 funzionante con email/password
- [ ] JWT v2 contiene role e tenantId
- [ ] requireRole blocca accessi non autorizzati
- [ ] Admin_brand non può accedere a tenant altrui (test 403)
- [ ] Audit log scrive tenant_id e user_role
- [ ] ROLE_PERMISSIONS aggiornato con 4 ruoli
- [ ] Smoke test esistenti passano invariati

---

## PR 2 — Tag System, Consent, Catalogo, Eligibility Engine

### Obiettivo

Implementare tag dictionary, computeTags, consenso marketing, CRUD catalogo prodotti con workflow approvazione, e il motore di selezione deterministico. Alla fine di questa PR il backend può calcolare una raccomandazione reale.

### 2A. Migrazione: `sql/008_promo_core.sql`

Creare le seguenti tabelle (vedi schema completo nella sezione tecnica sotto):
- `tag_dictionary` — con campo `sensitivity` (low/medium/high). Seed con 18 tag predefiniti.
- `tag_dictionary_versions` — versionamento modifiche.
- `pet_tags` — tag calcolati per pet (PK: pet_id + tag).
- `consents` — stato consenso per owner (PK: owner_user_id + consent_type + scope).
- `consent_versions` — audit trail delle modifiche consenso.
- `promo_items` — catalogo (species e lifecycle_target come TEXT[]).
- `promo_item_versions` — snapshot + workflow.
- `promo_campaigns` — con frequency_cap JSONB, UTM.
- `campaign_items` — M:N campagne↔items.
- `global_policies` — policy Super Admin.
- `explanation_cache` — caching spiegazioni OpenAI.
- `tenant_budgets` — budget mensile chiamate OpenAI per tenant.
- `promo_events` — tracking eventi (indici per frequency capping).
- `vet_flags` — segnalazioni vet (unique index su pet+item attivi).

### 2B. Creare `backend/src/tag.service.js`

```javascript
/**
 * computeTags(pool, petId, ownerUserId) → { tags: [...], errors: [...] }
 *
 * Regole deterministiche (NO AI, NO random):
 *
 * Lifecycle (low): da pets.birthdate + pets.species + pets.weight_kg
 *   Cane: puppy<1, senior dipende da taglia (small>10, medium>8, large>6, default>7)
 *   Gatto: puppy<1, senior>10
 *
 * Specie/taglia (low): da pets.species e pets.weight_kg
 *
 * Clinici (HIGH): cercare keyword nelle colonne SOAP archiviate.
 *   Usare la tabella changes (entity_type='soap') o pets.extra_data.
 *   Keyword mapping nel tag_dictionary.derivation_rule.
 *   NOTA: richiedono consent clinical_tags per il matching.
 *
 * Engagement/Spend: SKIP per ora (mancano dati). Saranno calcolabili in futuro.
 *
 * Salvataggio: UPSERT in pet_tags (INSERT ... ON CONFLICT (pet_id, tag) DO UPDATE).
 * Se una regola fallisce: loggare, saltare, continuare. Mai crashare.
 */
```

### 2C. Creare `backend/src/consent.service.js`

```javascript
/**
 * Gerarchia consenso:
 *   marketing_global OFF → tutto disabilitato
 *   marketing_global ON + marketing_brand OFF per tenant X → no promo da X
 *   clinical_tags OFF → tag high-sensitivity esclusi dal matching
 *
 * Default nuovi owner: marketing_global=opted_in, clinical_tags=opted_out (prudente).
 *
 * Re-consent (FR-014): quando si aggiunge un tenant → creare consent 'pending'
 * per owner con marketing_global=opted_in. Promo non erogate fino ad ack.
 *
 * API: GET/PUT /api/promo/consent, GET /api/promo/consent/pending, POST /api/promo/consent/ack
 */
```

### 2D. Creare `backend/src/eligibility.service.js`

```javascript
/**
 * selectPromo(pool, { petId, ownerUserId, context }) → result | null
 *
 * 1. Tags: leggere pet_tags. Se vuoto → computeTags() prima.
 * 2. Consent: marketing_global, brand-specific, clinical_tags.
 * 3. Candidati: query promo_items con filtri specie, lifecycle, contesto, policies, vet_flags.
 * 4. Tag matching: include (OR), exclude (AND NOT), sensitivity+consent check.
 * 5. Frequency capping: query promo_events con window temporale.
 * 6. Ranking: priority DESC → match_score DESC → updated_at DESC. LIMIT 1.
 * 7. Rotazione tie-break: hash(petId + CURRENT_DATE) % count.
 *
 * CONTEXT_RULES:
 *   post_visit       → food_clinical, supplement          | 1/visita
 *   post_vaccination → antiparasitic, accessory           | 1/evento
 *   home_feed        → food_general, accessory, service   | 2/sessione, 4/settimana
 *   pet_profile      → food_general, accessory            | 1/sessione
 *   faq_view         → any correlato                      | 1/sessione
 *   milestone        → food_general, service              | 1/evento
 *
 * Tag high-sensitivity: usabili nel matching SOLO in post_visit, post_vaccination.
 */
```

### 2E. Creare `backend/src/admin.routes.js`

```javascript
/**
 * CRUD catalogo + campagne per Admin Brand.
 * Tutte richiedono requireRole(['admin_brand','super_admin']).
 *
 * CRUD /api/admin/:tenantId/promo-items     → draft→in_review→published→retired
 * CRUD /api/admin/:tenantId/campaigns
 * Ogni mutazione → audit_log con diff.
 *
 * Registrare in server.js: app.use(adminRouter({ requireAuth }));
 */
```

### 2F. Checklist PR2

- [ ] Tag dictionary con 18 tag seed e campo sensitivity
- [ ] computeTags corretto per specie/età/peso
- [ ] Consent CRUD con versionamento
- [ ] CRUD promo_items con workflow
- [ ] Eligibility: selezione deterministica e riproducibile
- [ ] Eligibility: consent + sensitivity rispettati
- [ ] Eligibility: frequency capping e vet_flag funzionanti
- [ ] Admin routes protette da RBAC + tenant isolation
- [ ] Smoke test invariati

---

## PR 3 — Explanation Engine, Delivery UX, Tracking, Vet Flag

### Obiettivo

Integrare OpenAI per spiegazioni, riscrivere l'UI promo, integrarla nelle pagine, implementare tracking completo e segnalazione vet. **Alla fine di questa PR il proprietario vede promo reali nell'app.**

### 3A. Creare `backend/src/explanation.service.js`

```javascript
/**
 * generateExplanation(pool, { pet, promoItem, context, matchedTags, getOpenAiKey })
 *   → { explanation, source, tokensCost, latencyMs }
 *
 * 1. Cache key: sha256(JSON(petSummary) + promoItem.promo_item_id + promoItem.version + context)
 * 2. Check explanation_cache → hit non scaduto: return source='cache'
 * 3. Check tenant_budgets → esaurito: return fallback source='fallback'
 * 4. Chiamare OpenAI GPT-4o-mini con timeout 5s:
 *    - Usare fetch diretto (come proxyOpenAiRequest in server.js) con getOpenAiKey()
 *    - System prompt: assistente vet informativo, rispondi SOLO JSON
 *    - Schema: { why_you_see_this, benefit_for_pet, clinical_fit, disclaimer, confidence }
 * 5. Parsare + validare → fallback se fallisce
 * 6. Salvare in cache (expires_at = now + 7 giorni)
 * 7. Incrementare tenant_budgets.current_usage
 *
 * pet_summary: nome, specie, razza, età, peso, taglia, tag (solo quelli con consenso).
 * MAI includere: note cliniche libere, nome proprietario, dati economici grezzi.
 *
 * Fallback: { why_you_see_this: "Selezionato in base al profilo di {nome}.",
 *   benefit_for_pet: null, clinical_fit: null,
 *   disclaimer: "Suggerimento informativo, non consiglio medico...",
 *   confidence: "low" }
 */
```

### 3B. Aggiornare `backend/src/promo.routes.js`

```javascript
/**
 * RISCRIVERE le route esistenti mantenendo backward compatibility:
 *
 * GET /api/promo/recommendation?petId=X&context=home_feed
 *   → orchestrare: computeTags → selectPromo → generateExplanation
 *   → ritornare { pet_id, recommendation: PromoRecommendation | null }
 *   → Se DATABASE_URL assente: mock mode come ora (invariato)
 *   → Se errore qualsiasi: return { pet_id, recommendation: null } (NFR-001)
 *
 * POST /api/promo/events (BATCH array)
 *   → validare, bulk insert in promo_events
 *   → Mantenere anche POST /api/promo/event singolo per compat
 *
 * POST /api/promo/vet-flag   → requireRole(['vet']), crea vet_flag
 * DELETE /api/promo/vet-flag/:flagId → requireRole(['vet']), risolve flag
 * GET/PUT /api/promo/consent  → requireRole(['owner'])
 * GET /api/promo/consent/pending → requireRole(['owner'])
 * POST /api/promo/consent/ack → requireRole(['owner'])
 *
 * PromoRecommendation shape:
 *   { promoItemId, tenantId, name, category, imageUrl, explanation, ctaEnabled, ctaLabel, ctaUrl, context, source }
 *   ctaEnabled = confidence >= 'medium'
 *   ctaLabel = ctaEnabled ? 'Acquista' : 'Scopri di più'
 *   ctaUrl = productUrl + UTM params (utm_source=ada, utm_medium=promo, utm_campaign=..., utm_content=itemId)
 */
```

### 3C. Riscrivere `docs/app-promo.js`

```javascript
/**
 * Mantenere le stesse funzioni globali (backward compat):
 *   loadPromoRecommendation(petId, context) → Promise<recommendation|null>
 *   trackPromoEvent(type, productId, petId, metadata) → void
 *   renderPromoSlot(containerId, context) → void
 *
 * NUOVE funzioni globali:
 *   renderPromoDetail(containerId, recommendation) → void
 *   renderConsentBanner(containerId) → void
 *   renderVetFlagButton(containerId, petId) → void
 *
 * Cambiamenti chiave:
 * - loadPromoRecommendation passa ?context= come query param
 * - Card mostra: badge, nome, why_you_see_this (troncato), CTA condizionato, dismiss
 * - CTA condizionata: confidence >= medium → "Acquista", altrimenti → "Scopri di più"
 * - Dettaglio: mappa 1:1 campi JSON (why, benefit, clinical_fit, disclaimer)
 * - Fallback UX: null→niente, source=fallback→card generica no CTA, confidence=low→"Scopri di più"
 * - Anti-flicker: contatore locale per sessione/contesto
 * - Batch eventi: accumula in array, flush ogni 5s o page unload (sendBeacon)
 * - Impression: IntersectionObserver (visibile >50% per >1s)
 */
```

### 3D. Integrazione nelle pagine

**In `docs/index.html`** — aggiungere div container:
```html
<!-- In page-soap, dopo contenuto SOAP -->      <div id="soap-promo-container"></div>
<!-- In page-patient, in fondo -->               <div id="patient-promo-container"></div>
<!-- In page-owner (home), in fondo -->          <div id="owner-promo-container"></div>
<!-- In page-qna, in fondo -->                   <div id="qna-promo-container"></div>
```

**In `app-soap.js`** — dopo generazione SOAP:
```javascript
if (typeof renderPromoSlot === 'function' && getActiveRole() === 'proprietario') {
    renderPromoSlot('soap-promo-container', 'post_visit');
}
```

**In `app-pets.js`** — quando si carica pagina patient (proprietario):
```javascript
if (typeof renderPromoSlot === 'function' && getActiveRole() === 'proprietario') {
    renderPromoSlot('patient-promo-container', 'pet_profile');
}
```

**In `app-core.js`** — quando si naviga a page-owner (proprietario):
```javascript
if (typeof renderPromoSlot === 'function' && getActiveRole() === 'proprietario') {
    renderPromoSlot('owner-promo-container', 'home_feed');
}
```

**Per il vet** — in pagina patient aggiungere:
```html
<div id="patient-vet-flag-container"></div>
```
```javascript
if (typeof renderVetFlagButton === 'function' && getActiveRole() === 'veterinario') {
    renderVetFlagButton('patient-vet-flag-container', currentPetId);
}
```

### 3E. Checklist PR3

- [ ] Promo card visibile in page-patient, page-owner, post-SOAP (solo proprietario)
- [ ] recommendation=null → nessuna card (spazio collassa)
- [ ] Fallback UX: errore → card generica o nascosta
- [ ] CTA condizionata da confidence
- [ ] "Perché vedi questo?" mostra spiegazione
- [ ] Dismiss con animazione e tracking
- [ ] Impression con IntersectionObserver
- [ ] Batch eventi funzionante con sendBeacon
- [ ] Vet flag: creazione, effetto immediato su eligibility, risoluzione
- [ ] Re-consent banner funzionante
- [ ] Explanation caching: cache hit su seconda chiamata
- [ ] Budget: alert a 80%, fallback a 100%
- [ ] Tutti i smoke test passano
- [ ] app-promo.js si carica senza errori di sintassi

---

## PR 4 — Dashboard Admin, Report, Wizard CSV

### Obiettivo

Pagine admin (vanilla JS), dashboard con report aggregati, export CSV, e wizard import catalogo da CSV. Ultima PR.

### 4A. Migrazione: `sql/009_admin_features.sql`

```sql
-- Brand ingest jobs (wizard)
CREATE TABLE IF NOT EXISTS brand_ingest_jobs ( ... );
CREATE TABLE IF NOT EXISTS brand_products_staging ( ... );

-- Materializzazione daily stats per dashboard veloci
CREATE TABLE IF NOT EXISTS promo_event_daily_stats (
    tenant_id TEXT, promo_item_id TEXT, context TEXT,
    event_type TEXT, event_date DATE, event_count INT, unique_pets INT,
    PRIMARY KEY (tenant_id, promo_item_id, context, event_type, event_date)
);
```

### 4B. Nuove pagine in `index.html`

Aggiungere inline (stesso pattern delle pagine esistenti):
```html
<!-- Page: Admin Dashboard -->
<div id="page-admin-dashboard" class="page">
    <div class="page-header"><h2>📊 Dashboard Brand</h2></div>
    <div id="admin-dashboard-content"></div>
</div>
<!-- Page: Admin Catalog -->
<div id="page-admin-catalog" class="page"> ... </div>
<!-- Page: Admin Campaigns -->
<div id="page-admin-campaigns" class="page"> ... </div>
<!-- Page: Admin Wizard -->
<div id="page-admin-wizard" class="page"> ... </div>
<!-- Super Admin pages (tenants, policies, tags, audit) -->
```

Aggiungere nella sidebar voci per admin_brand e super_admin (condizionate dal ruolo).

### 4C. Creare `docs/app-admin.js`

```javascript
/**
 * Pattern IIFE. Globals:
 *   renderAdminDashboard(containerId)  → KPI, funnel, top prodotti, costi, alert
 *   renderAdminCatalog(containerId)    → CRUD prodotti con workflow
 *   renderAdminCampaigns(containerId)  → CRUD campagne
 *   renderAdminWizard(containerId)     → wizard CSV import
 *
 * Dashboard:
 *   Fetch da /api/admin/:tenantId/dashboard/* (overview, funnel, products, costs, alerts)
 *   Renderizzare con HTML dinamico (createElement, innerHTML escaped)
 *   Tabelle paginate (fetch con ?page=&limit=)
 *   Soglia anti re-id (k=10) applicata server-side
 *
 * Wizard CSV:
 *   1. Bottone download template → GET /api/admin/:tenantId/wizard/csv-template
 *   2. Input file upload → POST /api/admin/:tenantId/wizard/csv-upload
 *   3. Mostra preview: righe valide + errori
 *   4. Scelta operazione: Append | Upsert | Reset (conferma forte per Reset)
 *   5. Conferma → POST /api/admin/:tenantId/wizard/csv-confirm
 *   6. Mostra risultato
 */
```

### 4D. Backend routes

**Creare `backend/src/admin-dashboard.routes.js`:**
```javascript
/**
 * GET /api/admin/:tenantId/dashboard/overview  → KPI aggregati (da promo_event_daily_stats)
 * GET /api/admin/:tenantId/dashboard/funnel    → impression→click→buy breakdown
 * GET /api/admin/:tenantId/dashboard/products  → top prodotti paginati
 * GET /api/admin/:tenantId/dashboard/costs     → budget, costo/impression
 * GET /api/admin/:tenantId/dashboard/alerts    → anomalie CTR, dismissed alto, vet_flags
 * POST /api/admin/:tenantId/reports/export     → genera CSV aggregato
 */
```

**Creare `backend/src/wizard.routes.js`:**
```javascript
/**
 * Dipendenza nuova: npm install csv-parse
 *
 * GET  /api/admin/:tenantId/wizard/csv-template → CSV template con headers
 * POST /api/admin/:tenantId/wizard/csv-upload   → valida, ritorna preview
 * POST /api/admin/:tenantId/wizard/csv-confirm  → importa in staging
 * GET  /api/admin/:tenantId/wizard/staging      → lista prodotti staging
 * POST /api/admin/:tenantId/wizard/staging/:id/approve
 * POST /api/admin/:tenantId/wizard/staging/:id/reject
 * POST /api/admin/:tenantId/wizard/publish      → staging approvati → promo_items draft
 *
 * CSV colonne: name* | category* | species* | lifecycle_target | description | image_url | product_url
 * Operazioni: append (default), upsert (match per nome), reset (conferma forte + audit)
 */
```

Registrare tutte le nuove route in `server.js`.

### 4E. Checklist PR4

- [ ] Pagine admin visibili solo per admin_brand/super_admin
- [ ] Dashboard con KPI, funnel, top prodotti, costi
- [ ] Catalogo: CRUD dalla UI con workflow approvazione
- [ ] Wizard CSV: template, upload, preview, import
- [ ] Export CSV aggregato funzionante
- [ ] Soglia anti re-id applicata nei report per segmento
- [ ] Sidebar mostra voci corrette per ruolo
- [ ] Tutti i test passano

---

## Appendice: Dipendenze da aggiungere

**Backend (`backend/package.json`):**
```
bcryptjs    → hashing password
csv-parse   → parsing CSV wizard
```

**Nessuna dipendenza frontend.** Tutto vanilla JS.

---

## Appendice: Backward compatibility (OGNI PR)

1. Login legacy (password singola) continua a funzionare
2. `app-promo.js` mantiene le stesse 3 funzioni globali
3. Mock mode senza DATABASE_URL continua a funzionare
4. Route API esistenti (`/api/pets`, `/api/chat`, etc.) invariate
5. Tutti gli smoke test Playwright passano senza modifiche
6. CSS non rompe layout esistente
