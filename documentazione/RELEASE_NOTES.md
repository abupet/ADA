# Release Notes (cumulative)

## v8.0.0 (2026-02-10)
- Feat: Architettura multi-servizio completa — ADA supporta ora 3 tipi di servizio: promo, nutrizione e assicurazione
- Test: `smoke.multi-service.spec.ts` — 7 test E2E per globals nutrizione/assicurazione, consent center, container DOM, demo mode UI
- Test: `risk-scoring.service.test.js` — 17 test unitari per tutti i sub-score del risk scoring (age, breed, history, meds, weight)
- Test: `nutrition.consent.test.js` — 9 test unitari per `isNutritionAllowed()` e `isInsuranceAllowed()` (global/brand/pending)
- Test: `eligibility.service-type.test.js` — 4 test unitari per verifica contesti `nutrition_review`/`insurance_review` e campo `service_types`
- Test: Tutti i test unitari esistenti continuano a passare (consent, eligibility, rbac, tag, outbox, pets)
- Test: Policy checks e security checks passano tutti
- Version: Bump finale a 8.0.0 — completamento roadmap multi-servizio

## v7.7.0 (2026-02-10)
- Feat: Demo Mode nel Seed Engine — generazione rapida di 3 pet demo complementari con dati multi-servizio
- Backend: `generateDemoCohort()` in `seed.petgen.js` — 3 profili deterministic: healthy_young (Labrador 2 anni), clinical_adult (Persiano 7 anni con patologie), senior_complex (Golden Retriever 12 anni multi-patologico)
- Backend: `startDemoJob()` in `seed.service.js` — fasi demo 10-12: setup cohort + promo events, generazione piani nutrizionali auto-validati, proposte assicurative con risk score
- Backend: `POST /api/seed/start-demo` in `seed.routes.js` — endpoint per avviare il job demo con selezione tenant e servizi
- Frontend: UI Demo Mode in `app-seed.js` — pannello con selettore tenant, checkbox servizi (promo/nutrizione/assicurazione), pulsante avvio
- HTML: Card "Demo Mode" nella pagina Seed Engine con controlli interattivi
- Auto-consent: il demo imposta automaticamente tutti i consensi (promo, nutrition, insurance) per l'utente demo

## v7.6.0 (2026-02-10)
- Feat: Modulo Assicurazione — valutazione rischio, preventivi e gestione sinistri per pet
- Backend: `risk-scoring.service.js` — calcolo punteggio rischio 0-100 con breakdown (età, razza, storia clinica, farmaci, peso) e classi di rischio (low/medium/high/very_high)
- Backend: `insurance.routes.js` — API complete: GET risk-score, GET coverage, POST quote, POST claim, GET claims
- Frontend: `app-insurance.js` — card assicurazione per proprietario con tema blu (#1e40af), visualizzazione copertura o punteggio rischio
- Frontend: Hook SOAP — dopo il salvataggio di un referto, notifica se il pet è assicurato per generare un rimborso
- HTML: Container `patient-insurance-container` nella pagina Dati Pet
- Wiring: rendering automatico slot assicurazione in `app-core.js` `navigateToPage()`

## v7.5.0 (2026-02-10)
- Feat: Modulo Nutrizione — piani nutrizionali personalizzati generati dall'AI e validati dal veterinario
- Backend: `nutrition.service.js` — generazione piani con OpenAI (GPT-4o-mini), calcolo fabbisogno calorico, suggerimento prodotti dal catalogo
- Backend: `nutrition.routes.js` — API complete: GET piano attivo/pending, POST genera/valida/rifiuta, PATCH modifica piano
- Frontend: `app-nutrition.js` — card piano nutrizionale per proprietario (kcal, prodotti, dosi, note cliniche) con tema verde (#16a34a)
- Frontend: Card validazione nutrizionale per veterinario con pulsanti Valida/Modifica/Rifiuta
- HTML: Container `patient-nutrition-container` nella pagina Dati Pet
- Wiring: rendering automatico slot nutrizione in `app-core.js` `navigateToPage()`

## v7.4.0 (2026-02-10)
- Feat: Architettura multi-servizio — infrastruttura per tre tipi di servizio: `promo`, `nutrition`, `insurance`
- DB: Migration `sql/012_services_nutrition_insurance.sql` — aggiunge `service_type`, `nutrition_data`, `insurance_data` a `promo_items`; aggiunge `service_type` a `promo_events`; crea tabelle `nutrition_plans`, `insurance_risk_scores`, `insurance_policies`, `insurance_claims`
- Feat: Eligibility Engine v2 — supporto parametro `serviceType` in `selectPromo()`, nuovi contesti `nutrition_review` e `insurance_review`, campo `service_types` nelle context rules
- Feat: Consent v2 — nuovi tipi di consenso: `nutrition_plan`, `nutrition_brand`, `insurance_data_sharing`, `insurance_brand` con helpers `isNutritionAllowed()` e `isInsuranceAllowed()`
- Feat: Nuovo endpoint `GET /api/promo/consent/services` — restituisce i tipi di servizio con i tenant attivi (da prodotti pubblicati)
- Feat: Centro Privacy (Consent Center) — nuova sezione in Impostazioni con toggle per servizio (Promozioni/Nutrizione/Assicurazione) e toggle per singolo brand/tenant
- Feat: Catalogo Admin — filtro per `service_type` (dropdown Promo/Nutrizione/Assicurazione), badge colorato per tipo servizio nella tabella, supporto `service_type` in creazione/modifica prodotti
- Feat: Import/Export — colonna `service_type` in CSV e XLSX (template e export)
- **MIGRAZIONE PENDENTE**: prima del merge `dev -> main`, applicare `sql/012_services_nutrition_insurance.sql` sul DB prod

## v7.3.5 (2026-02-10)
- Infra: Migrazione frontend dev da Netlify a GitHub Pages (`abupet.github.io/ada-dev/`) tramite repo dedicato `abupet/ada-dev`
- Infra: Aggiunto workflow `sync-dev-frontend.yml` per sincronizzazione automatica frontend dev → repo `ada-dev` ad ogni push su `dev`
- Fix: Env detection in `index.html` e `runtime-config.js` — da `hostname.includes("netlify.app")` a `pathname.startsWith("/ada-dev")`
- Fix: `ada-tests.sh` — aggiornato DEV_DEPLOY_URL a GitHub Pages
- Docs: Aggiornato `AGENTS.md` con nuovi URL ambiente dev

## v7.3.4 (2026-02-10)
- Fix: Catalogo — paginazione corretta con filtri avanzati client-side (priorita, immagine, ext desc, categoria, specie). Quando i filtri sono attivi il server carica tutti i prodotti e la paginazione avviene localmente
- Fix: Catalogo — il pulsante "Reset" ora resetta anche tutti i filtri avanzati (priorita, immagine, ext desc, categoria, specie), non solo la ricerca testuale
- Fix: Report validazione URL — il pulsante "Draft" ora usa correttamente POST `/transition` invece di PUT (risolveva "Errore nel cambio stato")
- Fix: Backend — aggiunta transizione `published -> draft` per consentire agli admin di riportare in bozza prodotti con URL rotti
- Feat: Report validazione URL — aggiunta colonna "Stato" nella tabella per mostrare lo stato corrente di ogni prodotto
- Feat: Feedback visivo click — animazione CSS flash (0.25s + scale 0.97) su tutti i pulsanti dell'app, con classe `.btn--loading` per operazioni asincrone
- Feat: Pulsante "Verifica URL" mostra spinner di caricamento durante la verifica
- Feat: Policy — descrizione contestuale: selezionando una policy key dalla dropdown appare un box con spiegazione dell'effetto e formato valore atteso
- Feat: Anteprima prodotto — pulsanti Acquista/Perche vedi questo?/Non mi interessa ora con spaziatura uniforme (flex, gap 12px, justify space-between)
- Feat: Tenant selector globale — dropdown selezione tenant disponibile direttamente nelle pagine Catalogo e Campagne per super_admin (non serve piu' passare dalla Dashboard)
- Feat: Export catalogo dati reali — i pulsanti "Scarica file CSV/XLSX" ora esportano i prodotti effettivi del tenant selezionato (con colonne status e extended_description). Fallback al template vuoto se il tenant non ha prodotti
- Feat: Seed Engine — foto placeholder ora servite come file SVG statici via `/api/seed-assets/` invece di data URI base64 inline
- Feat: Seed Engine — dati lifestyle Pet arricchiti: sterilizzato, accesso esterno, coinquilini animali, piano alimentare, fonte acqua, ultima vaccinazione, assicurazione
- Feat: Seed Engine — campi base (sex, birthdate, species, breed, weightKg) inclusi in extra_data per ridondanza frontend
- UX: Spaziatura header pagine Catalogo e Campagne (margin-bottom 20px)
- UX: Debug dropdown super_admin — dimensioni ridotte (auto width, min 220px, max 350px) invece di width 100%
- CI: Test dual-environment — `ada-tests.sh` supporta toggle ambiente prod/dev (tasto `e`), mostra URL e ambiente nello status
- CI: `ci-real.yml` v9 — matrix strategy per testare prod e dev in parallelo con secrets separati (`DATABASE_URL_DEV`, `DEPLOY_URL_DEV`), artifact names univoci per ambiente, titolo issue con ambiente

## v7.3.3 (2026-02-10)
- Security: RBAC su tutte le 9 route di seed.routes.js — solo `super_admin` può avviare seed job, wipe, config, promo search/scrape/import/tenants
- Security: Rimosso leak di `e.message` verso il client in seed.routes.js (6 occorrenze) e tips-sources.routes.js (11 occorrenze) — ora restituisce `"server_error"` con log server-side
- Security: Validazione input su `/api/chat` — whitelist modelli (`gpt-4o-mini`, `gpt-4o`), cap `max_tokens` a 4096, sanitizzazione `temperature`, validazione `messages` obbligatorie
- Security: Validazione input su `/api/tts` — whitelist modelli e voci, limite input 4096 caratteri, sanitizzazione payload
- Security: 3 nuovi test automatici (SEC-10 RBAC seed, SEC-11 no e.message leaks, SEC-12 AI endpoint validation)
- Fix: Debug mode globale — il toggle OFF nasconde il menu Debug per TUTTI gli utenti incluso super_admin (prima super_admin vedeva sempre il menu)
  - Rimosso bypass `_saAccess` da `updateDebugToolsVisibility()`, navigation guard e `restoreLastPage()`
  - Settings > Sistema card resta visibile e modificabile per super_admin (invariato)
- UX: Pagina Acquisto (simulata) — aggiunto pulsante "← Torna all'anteprima" per tornare alla preview del prodotto
- UX: Preview prodotto — "Verifica URL" e "Chiudi" sulla stessa riga con flexbox
- UX: Preview prodotto — spiegazione AI "Perché vedi questo?" ora appare tra la card prodotto e i dettagli tecnici (prima era in fondo)
- UX: Catalogo — nuovo pulsante "👁️ Anteprima" nella toolbar per preview sequenziale di tutti i prodotti filtrati
- UX: Report validazione URL — pulsante "→ Draft" ora mostra feedback visivo (✓ Draft verde) con gestione errori
- UX: Report validazione URL — nuovo pulsante "Draft Tutti" per spostare tutti i prodotti problematici a draft in batch con indicatore progresso
- UX: Fonti Tips — errore 403 mostra messaggio "Accesso negato — ruolo super_admin richiesto" anziché errore generico; errore 500 mostra hint migrazione SQL

## v7.3.2 (2026-02-09)
- Feat: Tips Sources — sistema di pre-elaborazione, caching e gestione delle fonti esterne per Tips & Tricks
  - Nuova tabella `tips_sources` con campi URL, dominio, summary IT, key_topics, crawl status, e validazione
  - Nuova tabella `tips_sources_crawl_log` per tracciare ogni crawl con durata, errori e cambiamenti contenuto
  - Seed iniziale con 16 fonti veterinarie (AVMA, AAHA, ASPCA, RSPCA, AKC, iCatCare, Cornell Vet, etc.)
  - DB: Migration `sql/011_tips_sources_cache.sql`
- Feat: Backend routes per gestione fonti (`tips-sources.routes.js`)
  - CRUD completo per super_admin (GET lista paginata, GET dettaglio, POST crea, PUT modifica, DELETE elimina)
  - Crawl singolo e batch: fetch URL, estrazione testo HTML, hash SHA-256, summary GPT-4o-mini se contenuto cambiato
  - Validazione singola e batch: HEAD check rapido con aggiornamento stato
  - Route pubblica `GET /api/tips-sources/active-urls` per frontend tips (any auth)
  - Route pubblica `GET /api/tips-sources/:id/check-live` per validazione on-demand click utente
- Feat: Frontend tips dinamiche (`app-tips.js`)
  - Fonti caricate dal DB con fallback all'array hardcoded se DB non disponibile
  - `openTipSource()`: click su link verifica disponibilita' fonte; se offline, mostra riassunto e chiede conferma
  - Context fonti con summary incluso nel prompt per tips piu' accurati
- Feat: Pagina admin "Fonti Tips" per super_admin (`app-admin.js`)
  - Lista fonti con card (stato online/offline/disattivata/mai crawlato, dominio, frequenza, topics, summary)
  - Filtri per stato (tutte/attive/disattivate) e ricerca testuale
  - Riepilogo contatori: totali, disponibili, non raggiungibili
  - Modal dettaglio con tutti i campi + ultimi crawl log in tabella
  - Modal crea/modifica fonte con form (URL, nome, frequenza, attiva, note)
  - Azioni: Crawl singolo, Valida singolo, Crawl batch, Valida batch, Elimina
  - Nuova voce nav "Fonti Tips" visibile solo per super_admin
- CSS: Stili dedicati per source-card, status badge, topic tags, crawl-log-table, sources-summary
- **MIGRAZIONI PROD PENDENTI** (da applicare sul DB prod Render/Frankfurt prima del merge `dev -> main`):
  1. `sql/010_extended_desc_url_check.sql` (da v7.2.21 — aggiunge `extended_description`, `url_check_status`, `url_last_checked_at` a `promo_items`)
  2. `sql/011_tips_sources_cache.sql` (da v7.3.2 — crea tabelle `tips_sources` e `tips_sources_crawl_log`, seed 16 fonti)

## v7.3.1 (2026-02-09)
- Feat: Catalogo — filtri avanzati per priorità, immagine, extended description, categoria e specie con dropdown nella barra filtri
- Feat: Catalogo — preview navigabile ora opera sulla lista filtrata (navigazione solo tra prodotti visibili)
- Feat: Report validazione URL — pulsante "→ Draft" per spostare rapidamente prodotti con URL rotti a stato draft
- Feat: Preview — pulsante "Acquista" ora apre una pagina e-commerce simulata (placeholder) con form spedizione e pagamento
- Feat: Preview — pulsante "Perché vedi questo?" ora attiva la generazione della spiegazione AI con banner di avviso test
- Feat: Preview — pulsante "Non mi interessa" ora mostra pagina feedback placeholder con conferma
- Rimosso pulsante "Testa spiegazione AI" dai dettagli tecnici (integrato in "Perché vedi questo?")

## v7.3.0 (2026-02-09)
- Fix: Profilo Sanitario — auto-save immediato dopo generazione per evitare perdita del testo se l'utente naviga altrove prima del salvataggio manuale
- Fix: Profilo Sanitario — fallback ownerName dal pet object in IndexedDB per pet creati via seed engine (risolveva "Proprietario: N/D")
- Feat: Profilo Sanitario (vet) — fonti numerate con riferimenti [1], [2] e sezione "Fonti:" a piè di pagina al posto delle citazioni inline ripetute
- Feat: Debug flag globale — il flag "Debug attivo" viene ora salvato in `global_policies` dal super_admin e letto da tutti gli utenti al login, rendendolo globale anziché locale al browser
  - Nuovo endpoint `GET /api/settings/debug-mode` accessibile a tutti gli utenti autenticati
  - `toggleDebugLog()` del super_admin persiste automaticamente via `PUT /api/superadmin/policies/debug_mode_enabled`
  - `loadGlobalDebugMode()` chiamata all'avvio dell'app dopo il login
- Fix: Coda chunk piena con file grandi — in modalità upload file, la coda aspetta che si liberi spazio (backpressure con timeout 90s) anziché fermare la registrazione
- Fix: Foto placeholder seed engine — SVG deterministici per specie con emoji e gradiente, identici tra backend (`seed.petgen.js`) e frontend (`app-testdata.js`), che producono `data:image/svg+xml;base64` validi
- Feat: Policies admin — chiave policy ora selezionabile da dropdown con 6 chiavi predefinite + opzione "Altro" per chiavi personalizzate

## v7.2.21 (2026-02-09)
- Feat: Campo `extended_description` per prodotti promozionali — descrizione dettagliata usata dal motore AI per generare spiegazioni personalizzate migliori (non visibile al cliente)
  - Nuova colonna `extended_description TEXT` in `promo_items`
  - Supporto in tutti gli endpoint di import (CSV, XLSX, wizard, csv-confirm), create e update
  - `explanation.service.js` ora usa `extended_description` quando disponibile per il prompt OpenAI
  - Textarea per extended_description nei modal di creazione, modifica e wizard import
  - Indicatore ✅/❌ nella tabella catalogo e nell'anteprima CSV
  - Template CSV e XLSX aggiornati con colonna `extended_description`
- Feat: Preview catalogo — anteprima card prodotto come appare al cliente
  - Modal navigabile con card identica alla vista cliente (immagine, nome, descrizione, spiegazione AI placeholder)
  - Dettagli tecnici collapsibili (categoria, specie, lifecycle, tags, extended description)
  - Pulsante "Testa spiegazione AI" per generare una spiegazione con pet di test
  - Pulsante "Verifica URL" per validare immagine e product_url
- Feat: Validazione URL — verifica on-demand e batch di `image_url` e `product_url`
  - Nuovo endpoint `POST /api/admin/:tenantId/validate-urls` con HEAD request e timeout 5s
  - Nuovo endpoint `POST /api/admin/cron/validate-urls` (super_admin) per validazione settimanale
  - Colonne `url_check_status JSONB` e `url_last_checked_at` in `promo_items`
  - Verifica singola nel modal preview e verifica bulk nel catalogo
  - Report URL rotti in modal dedicato
- Feat: Catalog UX migliorata
  - Ricerca per nome nella tabella catalogo
  - Bulk publish: pubblica tutti i prodotti draft con un click
  - Specie mostrata accanto al nome per distinguere prodotti con nome simile
  - Colonne Img e Ext. con indicatori visivi
  - Contatore "Salute Catalogo" nella dashboard (senza immagine, senza ext. desc., URL rotti)
- Fix: Parser import — supporto separatore `|` (pipe) oltre a `,` nei campi multi-valore (species, lifecycle_target, tags_include, tags_exclude) con nuovo helper `_splitMultiValue()`
- DB: 3 nuovi tag clinici nel Tag Dictionary: `clinical:cardiac`, `clinical:endocrine`, `clinical:hepatic`
- DB: Migration `010_extended_desc_url_check.sql`
- ⚠️ **MIGRAZIONE PROD PENDENTE**: prima del merge `dev → main`, applicare `sql/010_extended_desc_url_check.sql` sul DB prod (Render/Frankfurt)

## v7.2.20 (2026-02-09)
- Refactor: rinominata directory `docs/` → `frontend/` per chiarezza (era la SPA, non documentazione)
- Refactor: spostata documentazione utente (README, RELEASE_NOTES, TEST_PLAN, VERIFY_TOKEN) in `documentazione/`
- Nuovo `README.md` minimale nella root con link a documentazione e guide agente
- AGENTS.md v4: aggiunta sezione "Ambienti" con tabella dev/prod, workflow di sviluppo, migrazioni DB, routing frontend
- CLAUDE.md: aggiornato target branch PR a `dev`, aggiornati tutti i path a `frontend/` e `documentazione/`
- Aggiornati tutti i riferimenti a `docs/` in: workflows CI, labeler, package.json, cache-bust, test unit, PR template

## v7.2.19 (2026-02-09)
- Feat: Tenant Data Reset — pulsante "Azzera dati" nella pagina Gestione Tenant per cancellare tutti i contenuti di un tenant (catalogo, campagne, eventi, statistiche) mantenendo le associazioni utente
  - Nuovo endpoint `POST /api/superadmin/tenants/:tenantId/reset` con transazione SQL
  - Doppia conferma di sicurezza nel frontend
- Feat: Importa/Esporta XLSX — il menu "Importa CSV" diventa "Importa file" e supporta sia CSV che Excel (.xlsx/.xls)
  - Aggiunta libreria SheetJS per parsing e generazione file Excel
  - Nuovo pulsante "Scarica template XLSX" nel wizard di importazione
  - Nuovo pulsante "Esporta XLSX" nella dashboard promo accanto all'export CSV esistente
- Feat: Import siti web da file TXT nel Seed Engine — possibilità di caricare un file .txt con URL di siti web (uno per riga)
  - Altezze campi input uniformate nella sezione promo del Seed Engine
  - Nuovo pulsante "Azzera siti e prodotti proposti" per reset della sezione
- Feat: Cancellazione dati nelle pagine Dashboard Promo, Catalogo Prodotti e Campagne
  - Dashboard: pulsante "Cancella tutti gli eventi" con endpoint `DELETE /api/admin/promo-events`
  - Catalogo: pulsanti "Cancella tutto il catalogo" e "Cancella singolo prodotto" con endpoint `DELETE /api/admin/catalog`
  - Campagne: pulsanti "Cancella tutte le campagne" e "Cancella singola campagna" con endpoint `DELETE /api/admin/campaigns`
  - Tutte le operazioni di cancellazione multi-tabella usano transazioni SQL

## v7.2.18 (2026-02-09)
- UX: Spinner di caricamento durante il login per feedback visivo (cold start backend Render)
  - Bottone "Accedi" disabilitato durante la richiesta per evitare doppi click
  - Con Debug attivo: messaggi progressivi con contatore secondi ("In attesa della risposta del server", "Il server si sta avviando", "Avvio del server in corso")
  - Senza Debug: solo spinner animato senza testo

## v7.2.17 (2026-02-09)
- Fix: Rimosso `GH_TOKEN` env da `ci-real.yml`, sostituito con `GITHUB_TOKEN` per evitare interferenze con Claude Code CLI

## v7.2.16 (2026-02-09)
- Feat: Seed Promo Wizard — selezione tenant e modalità import (replace/append)
  - Nuovo endpoint `GET /api/seed/promo/tenants` per lista tenant disponibili
  - `importProductsToCatalog()` ora accetta `options.tenantId` e `options.mode`
  - Modalità `replace`: cancella `promo_items` con `promo_item_id LIKE 'seed-%'` prima dell'inserimento
  - `/api/seed/promo/import` ora accetta `tenantId` e `mode` dal body
- Feat: Seed Promo Wizard — preview navigabile prodotti come li vedrebbe il cliente
  - Card preview con badge "Consigliato per il tuo pet", immagine, nome, descrizione
  - Navigazione `< >` tra prodotti con contatore "Prodotto N di M"
  - Pulsante "Modifica" per ogni prodotto: apre modal con form in italiano
  - Checkbox includi/escludi per ogni prodotto nella preview
- Feat: Traduzioni italiano — specie, lifecycle e categoria in tutti i form e tabelle
  - Nuove mappe `SPECIES_LABELS`, `LIFECYCLE_LABELS`, `CATEGORY_LABELS` in app-admin.js
  - Form creazione/modifica prodotto: label italiani su checkbox e select
  - Tabella catalogo: colonne Specie, Lifecycle, Categoria tradotte in italiano
- Feat: CSV Import Wizard — miglioramenti completi
  - Step 1: selettore tenant, modalità import, pulsante "Scarica template CSV"
  - Step 2: tabella anteprima con tutte le colonne + preview navigabile stile cliente
  - Pulsante "Modifica" per ogni riga CSV con modal form pre-compilato in italiano
  - Step 3: passa `tenantId` e `mode` al backend
  - Template CSV con 3 prodotti demo veterinari in italiano

## v7.2.15 (2026-02-09)
- Feat: Seed Engine Promo — crawling ricorsivo pagine figlie prima dell'estrazione prodotti
  - Nuova funzione `_discoverChildUrls()`: estrae link figli dalla pagina madre (URL che iniziano con l'URL madre)
  - Nuova funzione `_crawlChildPages()`: BFS fino a 2 livelli di profondità, max 50 pagine per URL madre
  - Nuova funzione `_safeFetchHtml()`: fetch SSRF-safe riutilizzabile (estratta dalla logica esistente)
  - Nuova funzione `_extractProductsFromPage()`: estrazione prodotti (JSON-LD, Open Graph, HTML selectors) estratta in helper riutilizzabile
  - `scrapeProductsFromSites()` ora crawla ricorsivamente le pagine figlie prima di estrarre i prodotti, trovando prodotti individuali dalle pagine di dettaglio
  - Fetch sequenziale per rispettare i server ed evitare ban

## v7.2.12 (2026-02-08)
- Fix: Seed Engine — documenti ora usano file placeholder reali (PDF e PNG) anziché text/plain, visualizzabili correttamente nell'app
- Fix: Document viewer — aggiunto download automatico dal server quando il blob non è in IndexedDB (funzione `_fetchAndCacheBlob`), risolvendo "Anteprima non disponibile"
- Fix: Wipe "Da zero" — ora inserisce record `pet.delete` in `pet_changes` dopo la cancellazione, così il pull sync del frontend rimuove i pet dall'IndexedDB. Anche i file su disco vengono cancellati

## v7.2.11 (2026-02-08)
- Ristrutturazione test: rimosso Login V1 (solo Login V2 con email + password)
- Backend: rimosso endpoint `POST /auth/login` e variabili `ADA_LOGIN_PASSWORD`/`ADA_TEST_PASSWORD` dal destructuring
- Frontend: `login()` in `app-core.js` ora richiede email obbligatoria, rimosso fallback V1
- Frontend: `getJwtRole()` in `config.js` rimosso check legacy token `ada-user`
- Nuovo seed script `backend/src/seed.test-users.js` per creare 4 utenti test (super_admin, admin_brand, vet, owner) + tenant
- Test E2E: `login.ts` helper accetta `{ email, password, retries }` per login per ruolo
- Nuovo test `smoke.login-roles.spec.ts` con 4 test per ruolo (vet, owner, admin_brand, super_admin)
- Test `smoke.role-access.spec.ts` riscritto per usare login reali per ruolo (rimossi mock `isSuperAdmin`)
- Test `deployed.smoke.spec.ts` aggiornato per Login V2 only
- `ada-tests.sh` v5: secrets da `.env` (non piu' file esterno), log in `test-results/ada-tests-XXX/`, integrazione Claude Code
- CI workflows (ci.yml, ci-real.yml, real-on-label.yml, long-tests.yml): aggiunte variabili email test + DATABASE_URL + step seed users

## v7.2.10 (2026-02-08)
- Fix: Seed Engine — specie ora in italiano (Cane/Gatto/Coniglio) anziché inglese (dog/cat/rabbit)
- Fix: Seed Engine — referti SOAP: campi ora in formato `soapData { s, o, a, p }` + back-compat lowercase, allineati al frontend `_getSoapFromRecord()`
- Fix: Seed Engine — parametri vitali: campi rinominati da `temperature_c/heart_rate_bpm/respiratory_rate/weight_kg` a `temp/hr/rr/weight`, allineati al grafico frontend

## v7.2.9 (2026-02-08)
- Fix: Seed Engine — i pet ora appartengono all'utente loggato (`req.user.sub`) anziché al fallback hardcoded `'ada-user'`. Questo era il motivo per cui il pull sync non restituiva i pet seedati: l'utente V2/super_admin ha un `user_id` diverso da `'ada-user'`

## v7.2.8 (2026-02-08)
- Fix: Seed Engine — i pet generati ora appaiono nel frontend grazie alla creazione di record `pet_changes` con `change_type='pet.upsert'` (Phase 3 e Phase 9), necessari per il meccanismo di pull sync
- Fix: Seed Engine — corretto errore wipe `pet_tags`: cast `pet_id::text` per compatibilità UUID↔TEXT
- Fix: Seed Engine — rimossi inserimenti invalidi `pet_changes` con `change_type='soap.seed'` (violazione CHECK constraint)

## v7.2.7 (2026-02-08)
- Fix: Seed Engine — le chiamate OpenAI per generazione SOAP e documenti ora inviano `messages` come array di oggetti (anziché un oggetto singolo), risolvendo l'errore 400 "Invalid type for 'messages'"

## v7.2.6 (2026-02-08)
- Test ciclo completo commit → PR → cancellazione branch (nessuna modifica funzionale)

## v7.2.5 (2026-02-08)
- Aggiunta regola vincolante: per ogni release user-facing/comportamentale, verificare e aggiornare i test automatici E2E
- Regola aggiunta in `AGENTS.md` (Definition of done) e `CLAUDE.md`

## v7.2.4 (2026-02-08)
- Fix: `ada-tests.sh` ora avvia automaticamente il backend (porta 3000) prima dei test e2e, allineandosi alla CI
- Fix: `login.ts` helper usa `locator.or()` per attendere correttamente il risultato del login asincrono, evitando race condition tra appContainer e loginError
- Status mostra ora lo stato di backend e frontend separatamente
- Impostazioni / Sistema: solo super_admin vede e modifica il flag "Debug attivo"; altri ruoli vedono la sezione in sola lettura solo se debug ON, nascosta se OFF
- Debug: per super_admin nascosto il pulsante toggle ruolo, visibile solo il dropdown con titolo "Ruolo attivo (super admin)"
- Seed Engine: appare solo quando super_admin sceglie il ruolo attivo super_admin, spostato nella nuova sezione sidebar "TEST & DEMO" prima di "ADMIN PROMO"

## v7.2.3 (2026-02-08)
- Aggiunta sezione "Mandatory Reads Before Coding" a `CLAUDE.md`
- Lettura obbligatoria di `AGENTS.md`, `TEST_PLAN.md` prima di ogni modifica
- Lettura condizionale di ADR e PR template in base all'area modificata
- Esclusa directory `tmp/` dal lavoro autonomo

## v7.2.2 (2026-02-08)
- Aggiunto cleanup automatico branch dopo merge PR
- Aggiunta lettura e valutazione automatica review Codex/bot sulle PR
- Aggiornato `CLAUDE.md` con workflow completo

## v7.2.1 (2026-02-08)
- Aggiunto `CLAUDE.md` con istruzioni per CI feedback automatico e workflow PR/merge
- Allineata versione in tutti i file (config.js, AGENTS.md, RELEASE_NOTES.md)
- Aggiunto riferimento obbligatorio a `AGENTS.md` come fonte di verità in `CLAUDE.md`

## v7.0.0 (2026-02-04)

Major release: role system, document management, sync engine, promo, hardening, observability.

### Nuove funzionalità

**Sistema ruoli (Veterinario / Proprietario):**
- Toggle ruolo nell'header con persistenza in localStorage
- Sidebar dinamica per ruolo (Visita per vet, I Miei Amici Animali per proprietario)
- Route guard: pagine fuori ruolo redirect alla home del ruolo attivo
- Permessi per ruolo definiti in `ROLE_PERMISSIONS` (config.js)

**Documenti (upload, viewer, AI):**
- Upload documenti PDF, JPG, PNG, WebP (max 10 MB) con validazione MIME magic bytes
- Viewer integrato: PDF via iframe/object, immagini con zoom e fullscreen
- AI "Leggi" (veterinario): estrazione testo strutturato via GPT-4o vision
- AI "Spiega" (proprietario): spiegazione in linguaggio semplice
- Storage offline in IndexedDB con sync backend

**Sync engine generico:**
- Outbox unificato multi-entity (IndexedDB `ada_sync`)
- Push/pull incrementale con cursor, paginazione (max 500 per pull)
- Conflitti gestiti con last-write-wins + logging
- Idempotenza garantita via `op_id` (UNIQUE index)
- Migrazione automatica da outbox legacy

**Inline Loading (ADR-007):**
- `InlineLoader`: spinner inline con AbortController, timer elapsed, hard timeout 45s
- Soglie copy italiane (0–3s, 4–10s, 11–20s, >20s)
- Retry manuale, cleanup su navigazione, prevenzione doppia richiesta

**Promo & Consigli:**
- Backend: raccomandazioni deterministiche per pet + spiegazione AI
- Frontend: slot promo non invasivo con impression/click/dismiss tracking
- Mock mode per CI/test

**Hardening (PR 11):**
- Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, ecc.)
- Audit log su richieste mutanti (`audit_log` table)
- Validazione path traversal su upload documenti
- Content-Disposition sanitizzazione filename
- Policy test: scan per API key hardcoded, eval(), innerHTML, CORS wildcard

**Osservabilità (PR 12):**
- Error capture (window.onerror, unhandledrejection)
- Page view tracking, API metrics via fetchApi monkey-patch
- Timing performance per operazioni chiave

### Ridenominazioni e rimozioni
- "Archivio" → "Archivio Sanitario" in tutta l'app
- Pagina "Appuntamento" rimossa con redirect di sicurezza
- Nuova pagina "Documento" (`page-document`)

### Migrazioni SQL
- `002_pet_profile_json.sql`: colonna `profile_json JSONB` su pets
- `003_generic_changes.sql`: tabella `changes` con UNIQUE index su `op_id`
- `004_documents.sql`: tabella `documents`
- `005_audit_log.sql`: tabella `audit_log`

### Backend
- Nuove route: `/api/sync/push`, `/api/sync/pull`, `/api/documents/*`, `/api/promo/*`
- JSON body parser limit 2 MB, multer limit 10 MB
- CORS con credentials, rate limiting invariato

### File nuovi
- `docs/app-loading.js`, `docs/app-documents.js`, `docs/sync-engine.js`, `docs/app-promo.js`, `docs/app-observability.js`
- `backend/src/sync.routes.js`, `backend/src/documents.routes.js`, `backend/src/promo.routes.js`
- `tests/policy/security-checks.js`

---

## v6.17.10 (2026-01-28)
- **UI**: la pagina "Visita" è stata rinominata in "Registrazione".

## v6.17.9 (2026-01-28)
- **UX**: aggiunto pulsante di chiusura sidebar e nota in archivio per eliminare i referti con pressione prolungata.
- **Referti**: correzioni vocali e traduzioni ora includono dati clinici specialistici e checklist; deduplica degli extra rispetto a S/O/A/P.
- **Registrazione**: messaggi di trascrizione/generazione aggiornati, avvio automatico del referto e informazioni chunking nascoste quando il debug è disattivo.
- **Profilo sanitario**: rinominato il Diario clinico, firma con nome veterinario e data di generazione, file export aggiornati.
- **Domande & Risposte**: moderazione su domande/risposte e gestione robusta delle spiegazioni proprietario.
- **Impostazioni**: API Key spostata in Debug e nuova sezione Informazioni clinica con logo collassabile.
- **UI**: bottoni lingua senza stato attivo, versione login sincronizzata e chiusura logo clinica ripristinata; spiegazione proprietario ripulita quando si cambia referto.

## v6.17.8 (2026-01-28)
- Aggiornato il numero di versione visibile nell'app e nei tool di supporto.
- Archiviato il file di specifica completata e ripristinato il template vuoto.

## v6.17.7 (2026-01-22)
- **Fix**: aggiunta intestazione con versione in `specs/README.md`.
- **Behavior**: nessuna modifica funzionale.
- **Limitazioni**: nessuna nuova limitazione.

## v6.17.6 (2026-01-22)
- **Fix**: aggiunti `data-testid` ai pulsanti e alle aree di stato/log per facilitare i test automatici.
- **Behavior**: nessuna modifica funzionale.
- **Limitazioni**: nessuna nuova limitazione.

## v6.17.5 (2026-01-22)
Fix/Behavior/Limitazione: aggiunta pagina Debug con strumenti test e cache spostati fuori dalle pagine normali, voce Debug visibile solo con Debug attivo e ritorno automatico a Visita quando disattivato; gli strumenti debug restano disponibili solo con toggle ON.

## v6.17.4 (2026-01-22) — Fix CSP / handler click + logging
- **Fix**: aggiunto fallback CSP-safe per i pulsanti (binding eventi via `addEventListener`) per evitare casi in cui alcuni `onclick` inline vengano ignorati.
- **Debug**: se un handler genera eccezione, viene loggato in `ADA.log` e mostrato un toast di errore.

## v6.17.2 (2026-01-22)

### Fix principali
- Debug tool "Carica file lungo audio": invio del file completo (no slicing byte-level) per evitare errori 400 "Audio file might be corrupted or unsupported" su WebM/MP4 troncati.
- Aggiunto controllo dimensione upload (25MB) con messaggio chiaro.
- Warning best-effort se durata > 1500s (possibile limite modello).

## v6.17.1 (2026-01-21)
### Fix principali
- **Chunking: nessun blocco a fine registrazione** se un chunk fallisce la trascrizione: ora viene inserito un placeholder e l'append prosegue.
- **Chunking: protezione anti-stallo** durante il drain: se la coda è vuota e l'append resta fermo, viene inserito un placeholder "mancante" per sbloccare la chiusura.
- **Timer**: reset coerente nelle sessioni chunking e su "Annulla".

### Fix minori
- `generateSOAPFromPaste()` ora è **retro-compatibile**: se non esiste `#pasteText`, usa `#transcriptionText` (evita bug latente su DOM mancante).

### Note
- Nessuna modifica alle API o ai prompt: hotfix solo di robustezza UI/pipeline.

## v6.17.0 (2026-01-21)
### Highlights
- **Registrazione lunga a chunk**: registrazione continua con spezzettamento automatico e **trascrizione in parallelo** (coda + worker), per evitare blocchi su visite lunghe.
- **Profili automatici**: scelta automatica del profilo in base al dispositivo (Windows / Android / iPhone) e selezione robusta del **mimeType**.
- **UI runtime**: badge e stato live durante la registrazione (profilo, durata chunk, mimeType, timer chunk, coda/in-flight, warning split).
- **Persistenza progressiva**: testo trascritto e segmenti diarizzati salvati in IndexedDB (ripristino dopo refresh; la registrazione non può riprendere).
- **Debug avanzato**: toggle "Debug attivo (per i test)" abilita strumenti test (audio/text lunghi) + cache locale dei chunk audio (IndexedDB) con export ZIP.

### Chunk recording — parametri configurabili (Impostazioni)
- `chunkDurationSec`, `timesliceMs`, `maxPendingChunks`, `maxConcurrentTranscriptions`, `uploadRetryCount`, `uploadRetryBackoffMs`, `hardStopAtMb`, `warnBeforeSplitSec`, `autoSplitGraceMs`.

### Note
- La cache audio di test usa **IndexedDB** (non filesystem) e viene esportata come ZIP tramite JSZip (CDN).
- In caso di refresh, ADA ripristina testo/segmenti salvati ma **non** può riprendere la registrazione.

## v6.16.4 (2026-01-21)
### Fix & miglioramenti
- **Checklist modificabile**: fix dei click sugli item della checklist (es. "Otoscopia") che prima non cambiavano stato.
- **Domande su un referto → Apri/Genera spiegazione**: ridotta la possibilità di vedere una spiegazione "stale" (pulizia dell'area spiegazione e generazione glossario coerente col referto).
- **Tips & Tricks**
  - Mostra il contatore "Mostrati finora".
  - Messaggio chiaro: i tips generati sono sempre nuovi; per ripartire usare "⟲ Ricomincia".
  - I tips già generati restano visibili anche se la pagina perde focus (persistenza per pet).
- **Carica testo → SOAP**: prompt text-only più forte + retry automatico se S/O/A escono vuoti; in "Follow-up" ora visualizza correttamente `descrizione` (niente JSON grezzo).

### Note
- Versioning: incremento patch (Z) a **6.16.4**.

## v6.16.2 (2026-01-21)
Questa versione corregge bug individuati in analisi del codice relativi a tracking costi, annullamento generazione SOAP, multi-pet e Q&A/Archivio.

### Correzioni principali

#### Costi API / Token tracking
- Corretto il tracking: rimossi incrementi "a forfait" su chiavi errate (`gpt4o_input`, `gpt4o_output`) e sostituiti con tracking basato su `usage` (prompt/completion tokens) tramite `trackChatUsage('gpt-4o', data.usage)`.

#### Annullamento generazione SOAP
- Propagato il `signal` anche nel fallback "text-only" (`generateSOAPFallbackTextOnly(..., { signal })`) così il tasto Annulla funziona anche nei casi di fallback.

#### Multi-pet: persistenza pet (robustezza)
- Aggiunto backup/restore in LocalStorage dei pet come fallback se IndexedDB risulta vuoto.

#### Archivio: dati specialistici (extras)
- In apertura di un referto dall'Archivio, ora vengono ripristinati anche i campi extra e la checklist associati al referto.

#### Multi-pet: migrazione Archivio
- Resettato il flag di migrazione storico al cambio pet, per evitare che pet successivi con storico legacy restino non normalizzati.

#### Parametri vitali
- La lista parametri viene renderizzata anche se il grafico non è ancora inizializzato; in apertura pagina, se necessario, il grafico viene reinizializzato.

#### Q&A: diagnosi "più recente"
- "Ultima diagnosi / Diagnosi recente" ora deriva dal referto più recente per data (usa `_getHistorySortedForUI()` quando disponibile).

#### Checklist template
- Ripristinate/aggiunte funzioni mancanti per aprire/chiudere la checklist, resettarla e gestire il toggle tri-state sugli item.

#### Robustezza parsing JSON da output modello
- Introdotte funzioni globali `_extractJsonObject()` / `_extractJsonArray()` e utilizzate nei punti critici (FAQ, speaker assignment) per ridurre crash su output con testo extra.

#### Gestione errori HTTP
- Aggiunto controllo `response.ok` (con messaggio di errore utile) nei fetch principali che chiamano OpenAI.

### File interessati
- `app-core.js`, `app-data.js`, `app-recording.js`, `app-soap.js`, `app-pets.js`, `config.js`, `index.html`.
