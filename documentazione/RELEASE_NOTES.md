# Release Notes (cumulative)

## v9.3.0 — B2B Phase 4: Scalabilità ed Ecosistema

### Nuove funzionalità
- **Test Genetici**: catalogo test DNA (8 test comuni cani/gatti), ordinazione per breeder/vet, tracking risultati, report genetico aggregato allevamento
- **Formazione Continua (ECM)**: catalogo corsi (webinar, on-demand, workshop, case study), iscrizione, tracking progress, crediti ECM, certificati
- **Marketplace**: catalogo unificato prodotti/servizi, carrello in-memory, ordini multi-item con prezzi ruolo-specifici, abbonamenti ricorrenti
- **API Pubbliche**: gestione API key (generazione, revoca), webhook per eventi (referral, risultati, appuntamenti), documentazione scopes
- **Booking Bulk UI**: selezione multipla animali per prenotazioni massive breeder

### Modifiche tecniche
- Migration SQL 035 (genetic_test_catalog, genetic_test_orders), 036 (education_courses, education_enrollments, ecm_credits), 037 (marketplace_products/orders/items/subscriptions), 038 (api_keys, api_webhooks)
- Nuove route: `genetic-tests.routes.js`, `education.routes.js`, `marketplace.routes.js`, `api-keys.routes.js`
- Frontend: `app-genetic-tests.js`, `app-education.js`, `app-marketplace.js`
- RBAC aggiornato: genetic-tests (breeder), education (vet_ext, vet_int), marketplace (tutti), developer (vet_ext)
- Sidebar: nuove voci Test Genetici, Formazione, Marketplace, API & Webhook nei rispettivi gruppi

## v9.2.0 — B2B Phase 3: Crescita e Fidelizzazione

### Nuove funzionalità
- **Calendario Vaccinale + Reminder**: vista calendario aggregata vaccinazioni in scadenza, reminder automatici (30g/7g/1g prima), report compliance vaccinale per allevamenti
- **Dashboard Analytics Referral**: KPI referral per vet_ext (totale, tempo medio, SLA breach rate), breakdown per specialità, trend mensili, export CSV
- **Loyalty & Revenue Sharing**: livelli partnership (Bronze/Silver/Gold), fee referral automatiche, tracking finanziario, bilancio e transazioni
- **Piani Prevenzione AI**: generazione piani prevenzione annuali personalizzati via GPT-4o, timeline 12 mesi, item per categoria con priorità, approvazione vet, tracking completamento
- **Auto-scheduling Programmi Breeder**: scheduling automatico esami quando cuccioli raggiungono età target

### Modifiche tecniche
- Migration SQL 032 (vaccination_reminders, compliance_reports), 033 (partnership_levels, referral_fees, fee_transactions, vet_partnerships), 034 (preventive_care_plans, preventive_care_items)
- Nuove route: `vaccination-reminder.routes.js`, `referral-analytics.routes.js`, `loyalty.routes.js`, `preventive-care.routes.js`
- Breeder auto-schedule endpoint in `breeder.routes.js`
- Frontend: `app-vaccination-calendar.js`, `app-referral-analytics.js`, `app-loyalty.js`, `app-preventive-care.js`
- RBAC aggiornato: vaccination-calendar (owner, breeder), referral-analytics/loyalty (vet_ext), preventive-care (tutti i ruoli clinici)
- Sidebar: nuove voci Calendario Vaccini, Prevenzione, Analytics Referral, Loyalty nei rispettivi gruppi

## v9.1.1 — Sidebar Two-Level Navigation + UX Renames

### Nuove funzionalita
- **Sidebar a due livelli**: navigazione ristrutturata con gruppi collassabili (IL PET, VISITA, SALUTE, CLINICA B2B, SERVIZI) per tutti i ruoli
- **History Accordion**: Archivio Sanitario con sezioni accordion (Referti, Documenti, Nutrizione, Conversazioni) con espandi/comprimi tutto
- **Rinominazioni UX**: "Dati Pet" diventa "Profilo", "Profilo Sanitario" diventa "Diario", "Messaggi" diventa "Comunicazioni", "Descrizione Pet per AI" diventa "Identikit"
- **Rimozione QNA**: pagine Q&A Hub, Q&A Pet e Q&A Report rimosse; Tips & Tricks accessibile direttamente dal gruppo SERVIZI

### Modifiche tecniche
- Sidebar HTML ristrutturata con classi `nav-group`, `nav-group-header`, `nav-group-items`
- CSS: nuove regole per `.nav-group*` e `.history-accordion-*`
- `navigateToPage()` auto-espande il gruppo contenente la pagina target
- Persistenza stato gruppi in `localStorage` (`ada_nav_groups_open`)
- Badge aggregati sui gruppi chiusi (conteggio totale notifiche)
- `renderHistoryAccordion()` sostituisce il rendering monolitico dell'archivio
- Pulsante "Analisi" promo spostato nell'header della card
- `'qna'`, `'qna-pet'`, `'qna-report'` rimossi da `ROLE_PERMISSIONS`

## v9.1.0 — B2B Phase 2: Milestone, Shared Records, Teleconsult, Diagnostica

### Nuove funzionalità
- **Milestone Cucciolate**: template milestone automatici per specie (25 template dog/cat), generazione milestone da data nascita, tracking peso cuccioli, completamento milestone
- **Passaporto Sanitario Potenziato**: generazione passaporto con dati completi (vaccinazioni, pesi, documenti), QR code token, visualizzazione per owner/vet/breeder
- **Documenti Clinici Condivisi**: sistema consensi clinici, upload/download documenti condivisi tra vet con controllo accesso basato su consenso
- **Teleconsulti**: richiesta teleconsulto specialistico, gestione sessioni (scheduled/in_progress/completed), note teleconsulto con condivisione selettiva
- **Diagnostica**: pannelli diagnostici predefiniti (11 pannelli: emocromo, biochimico, urine, ecc.), registrazione risultati con range e valori, notifiche risultati per proprietari/vet referenti

### Modifiche tecniche
- Migration SQL 029 (litter_milestones, puppy_weights, milestone_templates), 030 (clinical_consents, shared_clinical_documents, teleconsult_sessions/notes), 031 (diagnostic_panels, diagnostic_results, result_notifications)
- Nuove route: `shared-records.routes.js`, `teleconsult.routes.js`, `diagnostics.routes.js`
- Route breeder potenziate: 8 nuovi endpoint (milestone CRUD, pesi cuccioli, generazione passaporto)
- Frontend: `app-shared-records.js`, `app-teleconsult.js`, `app-diagnostics.js`, milestone/passaporto in `app-breeder.js`
- RBAC aggiornato per nuove pagine (shared-records, teleconsult, diagnostics) su tutti i ruoli vet/breeder
- Sidebar vet e breeder con nuove voci navigazione
- Tipo conversazione 'teleconsult' aggiunto al sistema messaggistica

## v9.0.0 — B2B Phase 1: Breeder Hub + Referral Workflow + Booking

### Nuove funzionalità
- **Ruolo Breeder**: nuovo ruolo `breeder` con RBAC dedicato, dashboard KPI allevamento, gestione cucciolate (litters), registrazione cuccioli, trasferimento vendita
- **Programmi Sanitari**: breeding programs con iscrizione pet e tracking progress
- **Calendario Vaccinale**: protocolli vaccinali per specie/razza, tracking vaccinazioni con scadenze
- **Passaporto Sanitario Digitale**: struttura per generazione PDF/QR con storia sanitaria cuccioli
- **Referral Workflow Potenziato**: 9 specialità referral (aggiunte neurologia, oftalmologia, oncologia, medicina interna), status tracking end-to-end (submitted→accepted→scheduled→in_progress→report_ready→closed), SLA con deadline configurabili, audit trail completo
- **Booking Online**: catalogo servizi prenotabili con prezzi differenziati per breeder, slot di disponibilità, prenotazione singola e in blocco (breeder), collegamento referral-appuntamento
- **Test users**: aggiunti `breeder_test@adiuvet.it` e `vet_ext_test@adiuvet.it`

### Modifiche tecniche
- Migration SQL 026 (breeder), 027 (referral workflow), 028 (booking)
- Nuove route: `breeder.routes.js`, `referral.routes.js`, `booking.routes.js`
- Frontend: `app-breeder.js`, `app-booking.js`, sidebar breeder
- RBAC aggiornato per ruolo `breeder` (login, middleware, dashboard, config)

## v8.27.1

### Fix: Bug e robustezza nel codice RAG Biblioteca Veterinaria

- **Bug critico**: fix `ReferenceError: message is not defined` in chatbot.routes.js — variabile `message` rinominata correttamente in `content`
- **rag.service.js**: aggiunto timeout 8s (AbortController) sulla fetch embedding, validazione risposta OpenAI (`embData.data[0].embedding`), validazione valori embedding (`Number.isFinite`), guard su `countResult.rows[0]`
- **knowledge.routes.js**: validazione testo PDF (errore specifico per PDF scansionati), validazione UUID su parametro `:bookId`, gestione paragrafi oversize nel chunking, validazione count batch embedding, retry con backoff su rate limit 429, check concorrenza su reprocess
- **app-knowledge.js**: fix URL upload XHR (`API_BASE_URL` al posto di `ADA_BACKEND_URL`), aggiunto `.catch()` su tutte le chiamate `fetchApi` senza handler, cleanup polling interval su navigazione pagina, rimosso optional chaining (`?.`) per compatibilità browser, aggiunto timeout XHR 120s
- **explanation.service.js**: rimossa variabile `openAiKey` inutilizzata (dead code)

## v8.27.0

### Feature: Biblioteca Veterinaria RAG (Knowledge Base)

Sistema completo di RAG (Retrieval-Augmented Generation) per arricchire tutte le risposte AI con conoscenze da testi veterinari di riferimento.

#### Backend
- **Nuovo servizio `rag.service.js`**: funzioni `searchKnowledgeBase()`, `buildVetKnowledgeContext()`, `enrichSystemPrompt()` per ricerca vettoriale e arricchimento prompt
- **Nuovo router `knowledge.routes.js`**: 11 endpoint API sotto `/api/superadmin/knowledge/` (solo super_admin) per gestione libri, upload PDF, ricerca, log query, statistiche
- **Pipeline asincrona PDF**: upload PDF → estrazione testo (`pdf-parse`) → chunking intelligente (600 token, 100 overlap, rispetto paragrafi) → embedding batch (`text-embedding-3-small`) → storage pgvector
- **Integrazione RAG in tutti i servizi AI**: chatbot, communication (2 punti), nutrition, explanation, promo, pets AI description, document explain, tips sources, SOAP proxy — ogni servizio arricchisce il system prompt con contesto dalla knowledge base

#### Frontend
- **Nuovo modulo `app-knowledge.js`**: pagina "Biblioteca Veterinaria" per super_admin con dashboard statistiche, tabella libri con status, upload PDF con progress bar, dettaglio libro con browser chunk, tool di test ricerca RAG, log query
- **Navigazione**: nuovo item sidebar "Biblioteca Vet" e pulsante nel Hub Gestione, visibili solo a super_admin

#### Database
- **Migrazione `025_vet_knowledge_base.sql`**: estensione pgvector, tabelle `vet_knowledge_books`, `vet_knowledge_chunks` (con colonna `vector(1536)`), `vet_knowledge_query_log`, `vet_knowledge_categories` con 18 categorie seed
- **Indici**: IVFFlat su embeddings per ricerca veloce, GIN su metadata JSONB

#### Dipendenze
- Aggiunto `pdf-parse` al backend per estrazione testo da PDF

## v8.26.1

### Fix: Sezione "Piani Nutrizionali" duplicata in Archivio Sanitario

- **Bug**: cliccando più volte su "Archivio Sanitario" nella sidebar, la sezione "Piani Nutrizionali" veniva appesa ripetutamente al DOM senza rimuovere quella precedente
- **Fix**: `_renderNutritionInHistory()` ora rimuove la sezione precedente (via `data-nutrition-history` attribute) prima di appenderne una nuova

## v8.26.0

### Feature: UI/UX Redesign completo

#### Design System (SPEC-DS-01/02/03)
- **Nuova palette teal/amber**: rimpiazzato il navy `#1e3a5f` con palette teal (`#14b8a6` family) e accenti amber (`#d97706`), variabili CSS organizzate in `:root`
- **Tipografia DM Sans**: font Google Fonts con preconnect, sostituisce lo stack di sistema generico
- **Icone Lucide**: tutte le emoji nella sidebar sostituite con icone SVG Lucide (paw-print, mic, clipboard-list, salad, folder-open, etc.)

#### Componenti (SPEC-COMP-01/02/03/04/06)
- **Login redesign**: gradient 3-stop, animazione fade-in, border-radius e shadow-xl
- **Gerarchia bottoni**: `btn-primary` (gradient teal), `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-cta` (amber gradient)
- **Cards**: border + shadow-sm, hover shadow-md, varianti semantiche (.card-info, .card-warning, .card-success)
- **Chip Selector**: `<select multiple>` per "Conviventi" sostituiti con chip toggleable in tutte e 3 le form (petHousehold, newPetHousehold, editPetHousehold)
- **Communication CSS migration**: ~90 regole CSS estratte da `_commInjectStyles()` (JS) e migrate in `styles.css` con variabili design system
- **SOAP buttons hierarchy**: "Salva" promosso a primario, "Correggi"/"Leggi" secondari, "TXT"/"PDF" ghost; tutte le emoji sostituite con icone Lucide

#### Accessibilità (SPEC-A11Y-01/02/03/04)
- **Viewport zoom**: rimosso `maximum-scale=1.0, user-scalable=no` — gli utenti possono ora zoomare
- **Focus ring**: focus-visible globale con ring teal 2px offset 2px
- **Contrasto label**: colore label aggiornato da `#666` a `var(--gray-600)` (#475569, ratio 5.74:1 conforme WCAG AA)
- **ARIA labels**: aggiunti `aria-label` su hamburger menu e tutti i bottoni expand

#### Mobile UX (SPEC-MOB-01/02/03)
- **Bottom navigation bar**: nav mobile a 4 tab (Registra, Messaggi, Pet, Archivio) con icone Lucide, visibilità basata su ruolo
- **Breakpoints aggiuntivi**: media query per tablet (801-1024px) e small phones (<374px)
- **Touch targets**: `.btn-small` min-height 44px conforme Apple HIG

#### Polish (SPEC-COMP-05/07, SPEC-POL-01)
- **Animazioni**: page-enter e skeleton-pulse
- **Language selector**: trasformato in segmented control pill-style
- **Empty states**: archivio, messaggi e foto con icone Lucide, titoli e descrizioni al posto del testo grigio generico

## v8.25.2

### Fix: Service Worker cache impediva visualizzazione menu Nutrizione

- **Service Worker version bump**: `ADA_SW_VERSION` aggiornata da `8.23.1` a `8.25.2` — forza invalidazione cache nei browser degli utenti
- La cache del SW era ferma alla v8.23.1 (pre-nutrizione), servendo file vecchi senza il menu Nutrizione nella sidebar

## v8.25.1

### Fix: Menu Nutrizione mancante per proprietario

- **Sidebar owner**: aggiunta voce "🥗 Nutrizione" nel menu proprietario (`sidebar-owner`) — prima era presente solo nel sidebar veterinario
- **Pagina vuota owner**: quando non esiste un piano nutrizionale, il proprietario ora vede il messaggio "Nessun piano nutrizionale disponibile per questo pet" invece di una pagina vuota

## v8.25.0

### Feature: Nutrizione v3 — Pagina Dedicata, UX Completa, Razze, Archivio, Metodo

#### Pagina Nutrizione dedicata
- **Nuova voce sidebar** "🥗 Nutrizione" per vet (dopo Referto) con pagina dedicata
- Piano corrente (validato) visualizzato con `_buildFullPlanHTML()` — dettaglio completo pasti, items, macros, integratori, restrizioni, monitoraggio, transizione
- Piano pending con pulsanti Valida/Modifica/Duplica/Rifiuta e vista completa inline
- Storico piani con click per dettaglio in modal
- Pagina abilitata per veterinario, vet_int, proprietario, super_admin in ROLE_PERMISSIONS

#### Owner: nascondere sezione vuota
- Se non c'è piano validato, la sezione nutrizione in Dati Pet è completamente nascosta (no "Nessun piano disponibile")
- Slot reso visibile automaticamente quando un piano esiste

#### Rinomina "Genera piano AI" → "Genera piano nutrizionale"
- Tutte le occorrenze aggiornate nel frontend

#### Card validazione arricchita + Modal modifica completo
- **`_buildFullPlanHTML()`**: helper riutilizzabile per visualizzare un piano completo (fabbisogno, RER/K, date, pasti con items/grammi/kcal, macronutrienti, integratori, restrizioni, note cliniche, monitoraggio, transizione, input snapshot)
- **`_openFullEditModal()`**: modal di modifica completo con form per kcal, pasti/giorno, date inizio/fine, pasti editabili (nome/orario/percentuale/kcal con items aggiungi/rimuovi), macronutrienti target, integratori, restrizioni, note cliniche
- Flag `isDuplicate` per duplicare piano come nuovo record

#### Date inizio/fine piano
- Campi data inizio/fine nel modal di generazione (pre-compilato con data odierna)
- Campi data nel modal di modifica
- Date visualizzate nella card piano e nello storico
- Salvate in `plan_data` JSONB (nessuna migrazione SQL)

#### Duplica piano
- **Backend**: nuovo endpoint `POST /api/nutrition/plan/:petId/duplicate` — crea piano pending da dati modificati
- **Backend**: nuovo endpoint `GET /api/nutrition/plans/:petId/all` — storico completo piani per pet
- **Frontend**: pulsante "📋 Duplica" nella pagina nutrizione, apre modal modifica con flag isDuplicate

#### Breed dropdown con autocomplete
- **`frontend/breed-data.js`**: database razze per Cane (100+), Gatto (50+), Coniglio (25+) con "Meticcio"
- `<input>` + `<datalist>` HTML5 nativo per tutti e 3 i form (pet, newPet, editPet)
- `_updateBreedDatalist()`: popola datalist al cambio specie, al caricamento pet, e apertura modal modifica

#### Integrazione Archivio Sanitario, Profilo Sanitario, Descrizione Pet AI
- **Archivio Sanitario**: piani nutrizionali validati mostrati come "documenti virtuali" con icona 🥗, click per dettaglio
- **Profilo Sanitario**: sezione `PIANO NUTRIZIONALE` aggiunta al prompt `generateDiary()` con kcal, pasti, note, restrizioni
- **Descrizione Pet AI**: fonte `piano_nutrizionale` aggiunta a `_collectPetDataForAI()` con kcal, pasti, note, restrizioni, integratori, data validazione

#### Pulsante "Metodo" — calcoli per il pet specifico
- **`_renderMethodButton()`** e **`_showMethodModal()`**: modal con 3 step didattici
- Step 1: Calcolo RER (70 × peso^0.75), fattore K per specie/lifecycle/sterilizzazione/attività, MER finale
- Step 2: Target macronutrienti per specie (tabelle cane vs gatto)
- Step 3: Composizione piano con conversioni grammi (crocchette ~350 kcal/100g, umido ~80 kcal/100g)

#### File modificati
- `frontend/breed-data.js` (nuovo)
- `frontend/index.html` — sidebar, page-nutrition, breed datalist, script tag
- `frontend/config.js` — ROLE_PERMISSIONS, versione
- `frontend/app-core.js` — navigateToPage (nutrition page, history integration, breed datalist in edit modal)
- `frontend/app-nutrition.js` — v3 completo
- `frontend/app-pets.js` — _updateBreedDatalist, species change binding
- `frontend/app-data.js` — generateDiary nutrition, setPatientData breed datalist
- `frontend/app-ai-petdesc.js` — _collectPetDataForAI nutrition source
- `backend/src/nutrition.routes.js` — duplicate + all-plans endpoints
- `AGENTS.md` — versione

## v8.24.0

### Feature: Piano Nutrizionale AI v2 — Integrazione Profonda nel Modello Dati

#### Parametri Vitali — BCS (Body Condition Score)
- **Nuovo campo BCS (1-9)** nella pagina Parametri Vitali: select con scala da "1 - Emaciato" a "9 - Gravemente obeso"
- BCS registrato insieme a peso, temperatura, FC, FR nell'array `vitals_data[]`
- Storico vitali mostra BCS nella riga di ogni rilevazione
- Reset parametri vitali include pulizia campo BCS

#### Stile di Vita — Nuovi campi nutrizionali
- **Peso ideale (kg)**: campo numerico per il target di peso impostato dal veterinario
- **Pasti al giorno**: select 1-4 (con label "cuccioli" per 4)
- **Allergie alimentari**: campo testo separato da virgola, salvato come array
- Campi aggiunti in tutti e tre i form: profilo paziente, nuovo pet, modifica pet
- Funzioni `getLifestyleData()` / `setLifestyleData()` aggiornate per leggere/scrivere i nuovi campi
- Edit pet modal mapping aggiornato per sincronizzare i nuovi campi

#### Backend — Nutrition Service v2
- **`buildNutritionPrompt()`** completamente riscritto: prompt veterinario dettagliato con regole RER/MER, fattori K per specie/lifecycle/sterilizzazione, allergie tassativamente escluse, formato JSON strutturato con pasti
- **`generateNutritionPlan()`** accetta `overrides` dal modal frontend: weight, BCS, ideal weight, activity, diet type, allergies, meals, budget
- Logica di estrazione automatica: peso da `vitals_data[]`, BCS da vitali, sterilizzazione derivata da `sex`, età calcolata da `birthdate`
- **`input_snapshot`** aggiunto a ogni piano generato: congela tutti i dati usati dall'AI per trasparenza
- Mock plan migliorato: calcolo RER/MER reale, struttura `meals[]` con items, macros, monitoring, transition plan
- Nuovo endpoint **`GET /api/nutrition/plan/:petId/inputs`**: preview di tutti i dati nutrizionali per un pet
- Endpoint generate aggiornato per passare overrides al service

#### Frontend — Modal di Generazione AI (v2)
- **`_collectNutritionInputs(pet)`**: raccoglie automaticamente tutti i dati dal profilo pet (anagrafici, vitali, lifestyle, tag)
- **Modal pre-compilato**: griglia editabile con peso, BCS, peso ideale, attività, alimentazione, pasti/giorno, allergie, budget
- **Indicatori visivi**: campi mancanti critici in rosso, opzionali in giallo
- **Reminder**: condizioni note e farmaci in corso mostrati come badge read-only
- **Budget**: campo transiente (non persistito) per calibrare la generazione

#### Sincronizzazione bidirezionale peso
- **Peso dal modal nutrizione → vitali**: se il vet modifica il peso nel modal, viene creata automaticamente una nuova entry vitali + PATCH `pets.weight_kg`
- **Peso dai vitali → profilo pet**: `recordVitals()` ora aggiorna `pets.weight_kg` via PATCH quando viene registrato un peso

#### Visualizzazione piano (v2)
- **Pasti giornalieri**: card per ogni pasto con label, orario suggerito, items con grammature esatte e kcal
- **Macronutrienti target**: griglia con proteine, grassi, carboidrati, fibre (%)
- **Piano di monitoraggio**: frequenza pesata, controllo BCS, prossima revisione, regole di aggiustamento
- **Piano di transizione**: schedule giorno per giorno vecchio/nuovo alimento
- **Input snapshot collapsibile**: sezione "Dati usati per la generazione" nel modal dettagli
- **Retrocompatibilità**: piani vecchi con formato `products[]` continuano a renderizzare correttamente

#### Files modificati
`frontend/index.html`, `frontend/app-core.js`, `frontend/app-data.js`, `frontend/app-pets.js`, `frontend/app-nutrition.js`, `frontend/config.js`, `backend/src/nutrition.service.js`, `backend/src/nutrition.routes.js`, `AGENTS.md`

## v8.23.5

### Fix: Nutrition "Genera piano AI" — errore 500 per vet_int
- **SQL** (`024_nutrition_nullable_tenant.sql`): `nutrition_plans.tenant_id` ora nullable — il vincolo NOT NULL causava un 500 quando `vet_int` (senza tenant nel JWT) generava un piano.
- **Backend** (`nutrition.routes.js`): rimosso il fallback single-tenant che selezionava un tenant arbitrario. Il `tenant_id` viene ora passato solo se presente nel client (es. `admin_brand`). Per `vet_int` resta `null`, coerente con la query cross-tenant già usata dal service layer.
- **Files**: `sql/024_nutrition_nullable_tenant.sql`, `backend/src/nutrition.routes.js`, `frontend/config.js`

## v8.23.4

### Fix: vet_int può generare piano nutrizionale senza tenant nel JWT
- **Backend** (`nutrition.routes.js`): `tenant_id` ora opzionale in `POST /api/nutrition/plan/:petId/generate`. Se non fornito, il backend seleziona automaticamente il primo tenant attivo con prodotti nutrition pubblicati.
- **Frontend** (`app-nutrition.js`): rimosso il guard bloccante che mostrava "Tenant ID non disponibile" quando `getJwtTenantId()` restituiva `null`. La richiesta viene ora inviata anche senza `tenant_id`, delegando il fallback al backend.
- **Files**: `backend/src/nutrition.routes.js`, `frontend/app-nutrition.js`, `frontend/config.js`

## v8.23.3

### Fix: Servizi Assicurazione e Nutrizione + Sistema Tag completo

#### Bug Fix
- **Assicurazione: owner senza tenant** — `tenantId` ora opzionale in `GET /api/insurance/plans` (ritorna piani da tutti i tenant attivi se omesso). `POST /api/insurance/quote` deriva il `tenant_id` dal `promo_item_id` selezionato. Frontend rimuove il blocco "Impossibile determinare il tenant". Ogni card piano mostra il nome del provider/brand. `data-plan-tenant-id` nel bottone "Seleziona" passa il tenant corretto.
- **Nutrizione: data unwrapping rotto** — L'API ritorna `{ plan: { plan_data: {...} } }` ma il frontend leggeva `data.daily_kcal` direttamente. Ora owner e vet fanno correttamente unwrap di `data.plan` e flatten di `plan_data` prima di passare ai renderer.
- **Nutrizione: cross-tenant** — `nutrition.service.js` e `GET /api/nutrition/products` ora cercano prodotti da TUTTI i tenant attivi (JOIN su `tenants.status = 'active'`), non solo dal tenant del vet.

#### Feature
- **Tag picker nel form prodotto** — Nuovo endpoint `GET /api/admin/tag-dictionary` (admin_brand + super_admin). Form di creazione e modifica prodotto ora includono tag picker con checkbox raggruppati per categoria e colorati per sensitivity. Helper `_populateTagPicker()` per riuso.
- **Tag nella AI Description** — I prompt di generazione descrizione pet (bulk e singolo) ora includono il tag dictionary e richiedono all'AI di produrre sezioni `TAGS APPLICABILI` e `TAGS NON APPLICABILI`. I tag estratti vengono upsertati in `pet_tags` con `source='ai'`. I tag `computed` non vengono sovrascritti.
- **Tag matching nell'Analisi Raccomandazione** — Il prompt di analisi ora include i tag del pet e i tag include/exclude di ogni prodotto candidato. Pre-filtering ordina i candidati per `_tagMatchScore` (desc) poi `priority` (desc). Il system prompt include regole esplicite di matching tag.

#### Files modificati
`insurance.routes.js`, `app-insurance.js`, `app-nutrition.js`, `nutrition.service.js`, `nutrition.routes.js`, `dashboard.routes.js`, `app-admin.js`, `promo.routes.js`, `pets.routes.js`, `config.js`

## v8.23.2

### Fix: Seed tenant creato come disabled
- Il tenant "Seed Test Brand" (`seed-tenant`) usato dal seed service ora viene creato con `status = 'disabled'` anziché il default `'active'`.
- Questo impedisce che appaia nei dropdown admin (selettore brand, selettore dashboard, lista tenant), evitando confusione con i tenant reali.
- Il seeding continua a funzionare normalmente: nessuna query del seed filtra per `status = 'active'` sul tenant.
- Se il tenant esisteva già come `active`, viene aggiornato a `disabled` al prossimo seed (`ON CONFLICT DO UPDATE`).
- **Files**: `backend/src/seed.service.js`, `frontend/config.js`

## v8.23.1

### Feature: Web Push Notifications per chiamate in arrivo
- **Attivazione push**: `subscribeToPush()` ora richiede il permesso `Notification.requestPermission()`, verifica subscription esistenti, e viene chiamata automaticamente alla connessione socket.
- **Service Worker migliorato**: `notificationclick` gestisce il rifiuto chiamata con fetch al server. Nuovo handler `DISMISS_CALL_NOTIFICATION` per chiudere la notifica se la chiamata è gestita in-app.
- **Frontend incoming_call handler**: il message listener SW ora gestisce `incoming_call` dal push, attivando la UI chiamata anche se l'app era in background.
- **WebRTC dismiss**: `_webrtcAccept()` e `_webrtcReject()` inviano `DISMISS_CALL_NOTIFICATION` al SW per chiudere eventuali notifiche push pendenti.
- **Backend**: nuovo endpoint `POST /api/communication/conversations/:id/calls/:callId/reject` per rifiuto chiamata da notifica push.
- **VAPID keys**: generate e configurate in `setup-ada-env.sh`.
- **Files**: `frontend/app-communication.js`, `frontend/sw.js`, `frontend/app-webrtc.js`, `backend/src/communication.routes.js`, `setup-ada-env.sh`, `frontend/config.js`

## v8.23.0

### Feature: UX completa Nutrizione & Assicurazione
- **Backend**: 3 nuovi endpoint — `GET /api/insurance/plans` (piani assicurativi con pricing personalizzato), `POST /api/insurance/policy/:policyId/activate` (attivazione polizza), `GET /api/nutrition/products` (prodotti nutrizione per tenant)
- **Nutrizione (proprietario)**: bottone "Dettagli" apre modal con prodotti, integratori, restrizioni, note cliniche e status validazione. "Ordina prodotti" apre modal simulato con lista prodotti e quantità. "Ne parlo col vet" naviga alla sezione Comunicazione con form precompilato.
- **Nutrizione (veterinario)**: se non c'è piano pending, compare bottone "Genera piano AI" che chiama l'endpoint generate. "Modifica" apre modal con campi kcal, pasti/giorno e note cliniche editabili.
- **Assicurazione (senza polizza)**: "Richiedi preventivo" apre modal con profilo rischio, lista piani Santevet con prezzi personalizzati, selezione piano, conferma preventivo e attivazione polizza.
- **Assicurazione (con polizza attiva)**: "Dettagli" apre modal con dati copertura completi (rimborso %, massimale, franchigia, prevenzione, servizi coperti, add-on) e accesso allo storico rimborsi.
- **SOAP → Claim**: dopo salvataggio referto, se il pet è assicurato compare modal per richiedere rimborso con importo visita e riepilogo SOAP.
- **Files**: `backend/src/insurance.routes.js`, `backend/src/nutrition.routes.js`, `frontend/app-nutrition.js`, `frontend/app-insurance.js`, `frontend/app-soap.js`, `frontend/config.js`, `frontend/sw.js`

## v8.22.53

### Fix: Navigate to parent conversation after call ends
- **Root cause**: `endCall()` in `app-webrtc.js` removed the WebRTC overlay and reset all global variables (`_webrtcConvId = null`, `_webrtcCallConvId = null`) but did not navigate anywhere. After overlay removal, the user was left on the messages list instead of returning to the parent conversation from which the call was initiated.
- **Fix**: save `_webrtcConvId` (the parent conversation ID) into a local variable before the global reset, then call `openConversation(parentConvId)` after cleanup. Applied to both real calls and test calls paths in `endCall()`.
- **Files**: `frontend/app-webrtc.js`, `frontend/config.js`, `frontend/sw.js`

## v8.22.52

### Fix: Call conversations appear as separate items in conversation list
- **Root cause**: `GET /api/communication/conversations` did not filter out child call conversations (those with `parent_conversation_id IS NOT NULL`), causing users to see two entries — the parent chat and the call conversation — instead of one.
- **Backend fix** (`communication.routes.js`): added `AND c.parent_conversation_id IS NULL` filter to the conversations list query, hiding child call conversations from the list. Also added `parent_conversation_id` to the messages endpoint response so the frontend can render navigation buttons.
- **Frontend fix** (`app-communication.js`): system messages with `call_conversation_id` in metadata now show a "Vedi trascrizione" link to open the call conversation. Call conversation headers show a "Torna alla chat" button to navigate back to the parent conversation.
- **Files**: `backend/src/communication.routes.js`, `frontend/app-communication.js`, `frontend/config.js`, `frontend/sw.js`

## v8.22.51

### Fix: Late transcription chunks go to parent conversation instead of call conversation
- **Root cause**: race condition in `endCall()` — `recorder.stop()` triggers async `onstop` callback, but `endCall()` immediately resets `_webrtcCallConvId` and `_webrtcCallId` to `null`. When `onstop` fires, the chunk is sent with `callConversationId: null`, causing the backend to write the transcription to the parent conversation instead of the dedicated call conversation.
- **Frontend fix** (`app-webrtc.js`): snapshot `_webrtcCallConvId` and `_webrtcCallId` in closures at recorder creation time, so async `onstop` callbacks always use the correct IDs even after `endCall()` resets globals. Applied to both real calls (`createAndStart`) and test calls (`createAndStartRecorder`, `_webrtcTestSendChunkForTranscription`).
- **Backend safety net** (`websocket.js`): if `call_audio_chunk` arrives with no `callConversationId` and no `callId`, the backend now looks up the most recent call conversation from the parent conversation as a fallback.
- **Files**: `frontend/app-webrtc.js`, `backend/src/websocket.js`, `frontend/config.js`, `frontend/sw.js`

## v8.22.50

### Fix: Test Chiamata non creava conversazione e non trascriveva audio
- **Root cause**: `startTestCall()` usava un `fakeConvId` inesistente nel DB (`'test_call_' + Date.now()`). Il backend rifiutava i chunk audio con `not_participant` perche' la conversazione non esisteva. Nessuna trascrizione veniva eseguita.
- **Fix**: ora `_commInitiateDirectCall` crea prima una conversazione reale via `POST /api/communication/conversations`, poi una call conversation dedicata via `POST /api/communication/conversations/call`. Entrambi gli ID vengono passati a `startTestCall()` che li usa per inviare i chunk audio al backend.
- **Cleanup**: a fine test call, la call conversation viene chiusa via `POST /api/communication/conversations/:id/end-call` con la durata corretta
- **Files**: `frontend/app-webrtc.js` (parametro `callConvId` in `startTestCall`, reset `_webrtcCallConvId`), `frontend/app-communication.js` (creazione conversazioni reali per test call)

## v8.22.49

### Feature: Trascrizione chiamate in conversazioni dedicate + Responsive Messages

**Parte A — Call Transcription**
- **Nuova conversazione per chiamata**: quando un utente avvia una chiamata (voce o video), ADA crea automaticamente una conversazione dedicata di tipo `voice_call` / `video_call` collegata alla chat originale via `parent_conversation_id`
- **Messaggio di sistema**: nella chat originale viene inserito un messaggio di sistema ("Chiamata vocale in corso..." / "Videochiamata in corso...") che si aggiorna con la durata a fine chiamata
- **Trascrizione separata**: i chunk audio vengono trascritti nella conversazione dedicata, non nella chat originale, evitando di mischiare messaggi di testo e trascrizioni
- **Bug fix updated_at**: aggiunta colonna `updated_at` a `comm_messages` (mancava nello schema), risolvendo il fallimento silenzioso della merge logic che causava messaggi separati per ogni chunk dello stesso speaker
- **Nuovi endpoint REST**: `POST /api/communication/conversations/call` (crea call conversation) e `POST /api/communication/conversations/:id/end-call` (chiude con durata)
- **Frontend**: `callConversationId` propagato in tutti gli eventi socket (`initiate_call`, `call_accepted`, `call_audio_chunk`, `end_call`), avatar dedicato per call conversations nella lista, bottoni chiamata nascosti nell'header delle call conversations
- **Migrazione SQL**: `sql/023_call_conversations.sql` (parent_conversation_id, updated_at, call_id)

**Parte B — Responsive Messages**
- `.comm-container` ora ha `width:100%;box-sizing:border-box;padding:0 12px` per evitare overflow laterale
- `.comm-chat-messages` usa `max-height:min(420px,60vh)` per altezza dinamica
- `.comm-msg` ha `overflow-wrap:break-word` per testi lunghi senza spazi
- Breakpoint mobile alzato da 600px a 768px per coprire tablet e telefoni landscape
- Aggiunte regole responsive: `flex-wrap` su header/input, `max-height:60vh` su mobile, contenimento media (`img`, `audio`, `video`)

**Files**: `backend/src/websocket.js`, `backend/src/communication.routes.js`, `backend/src/server.js`, `frontend/app-webrtc.js`, `frontend/app-communication.js`, `sql/023_call_conversations.sql`

## v8.22.48

### Feature: "Test Chiamata" — interlocutore loopback per debug
- **Prerequisito**: flag "Debug attivo (per i test)" (`debugLogEnabled === true`)
- **Destinatario virtuale**: quando il debug e' attivo, tutte le liste destinatari (messaggi e chiamate) mostrano "Test Chiamata" come opzione
- **Loopback audio**: la chiamata si auto-connette senza WebRTC reale. In modalità "Parla" il microfono registra; premendo il tasto diventa "Ascolta" e riproduce tutto ciò che l'utente ha detto. A fine riproduzione torna automaticamente a "Parla"
- **Trascrizione**: i chunk audio vengono inviati al backend via `call_audio_chunk` (source=local per la voce dell'utente, source=remote per la riproduzione) per la pipeline Whisper esistente
- **Videochiamata test**: il video locale viene mostrato sia come "local" che come "remote" (mirror)
- **Cleanup**: `endCall()` gestisce correttamente il test call senza errori WebRTC
- **Files**: `app-webrtc.js` (nuove funzioni `startTestCall`, overlay, registrazione, toggle Parla/Ascolta, trascrizione), `app-communication.js` (iniezione opzione, intercettazione), `styles.css` (stili tasto)

## v8.22.47

### Fix: force=1 bypassava AI cached path — "Satiety Weight Management" invece dei match personalizzati
- **Root cause**: il flag `force=1` (debug "Multi-servizio forzato") bypassava ENTRAMBI i path AI (cached in `promo.routes.js` e AI matches in `selectPromo`). Se `localStorage.ada_debug_force_multi_service === 'true'` era rimasto attivo da sessioni di debug precedenti, il frontend inviava sempre `force=1`, facendo cadere nel fallback standard con 138 candidati e selezione hash-deterministica → "Satiety Weight Management" per Charlie
- **Diagnostica**: l'unico log `[PROMO-DIAG]` era `using STANDARD algorithm` — nessun log dal cached path o dal selectPromo AI path, confermando che il guard `if (!force)` li saltava
- **Fix**: rimosso il guard `!force` dal cached AI path in `promo.routes.js` e dal AI matches path in `selectPromo` (`eligibility.service.js`). I match AI personalizzati vengono ora sempre utilizzati quando presenti, indipendentemente dal flag force. Il flag `force=1` continua a rilassare i filtri solo sull'algoritmo standard di fallback
- **Logging**: aggiunto log del valore `force` all'ingresso dell'handler per diagnostica futura

## v8.22.46

### Fix: Cached AI path bypassed — logging diagnostico per "Satiety Weight Management" sempre visibile
- **Problema**: per Charlie (andrea.colombo) il banner mostra sempre "Satiety Weight Management" che NON e' nei suoi 5 AI match. La risposta API ha `source: "cache"` (da generateExplanation) invece di `source: "ai_cached_match"` (dal cached path della route), indicando che il cached path viene bypassato e si cade nel fallback `selectPromo` che usa l'algoritmo standard hash-deterministico
- **Causa probabile**: il backend Render dev potrebbe non aver deployato il codice aggiornato dei PR #360-363
- **Fix**: aggiunto logging diagnostico `[PROMO-DIAG]` nel cached path di `promo.routes.js` e in `selectPromo` di `eligibility.service.js` per tracciare esattamente dove e perche' il cached path fallisce
- **Debug**: aggiunto campo `_debug` nella risposta API (solo quando `ADA_DEBUG_LOG=true`) con `pathTaken` e `cachePathSkipped`
- **Prossimi passi**: dopo deploy su Render, i log mostreranno il path preso. Se il cached path funziona dopo re-deploy, la causa era il backend non aggiornato

## v8.22.45

### Fix: Service worker serve file JS vecchi — cache invalidation
- **Root cause**: `sw.js` aveva `ADA_SW_VERSION = '8.22.2'` — mai aggiornato da 40+ versioni. La strategia Stale-While-Revalidate serviva i file JS cachati dalla v8.22.2, ignorando tutti i fix successivi (rotation, service_type filter, API_BASE_URL prefix, ecc.)
- **Effetto**: gli utenti vedevano codice vecchio nonostante i deploy: banner promo con prodotto sbagliato, nessuna rotation, immagini 404, versione mostrata non corrispondente al deploy
- **Fix**: `ADA_SW_VERSION` aggiornato a `8.22.45` → forza reinstallazione del service worker, cancellazione cache `ada-cache-8.22.2`, e ri-caching di tutti i file aggiornati

## v8.22.44

### Fix: Santevet Premium domina ranking + immagini placeholder 404
- **Root cause 1 (priority non normalizzata)**: Santevet Premium Cane/Gatto avevano `priority=10` con `service_type={promo}` e `category=service` — il fix v8.22.42 normalizzava solo `food_clinical`, non `service`. Santevet dominava il ranking standard in tutti i contesti che ammettono "service" (es. home_feed)
- **Root cause 2 (immagini 404)**: il backend restituiva `imageUrl: "/api/seed-assets/..."` (path relativo) nei match senza immagine. Il frontend su GitHub Pages risolveva il path come `https://abupet.github.io/api/...` → 404
- **Fix 1 (DB)**: normalizzato priority di TUTTI i prodotti published a <= 5 (inclusi Santevet service_type={promo})
- **Fix 2 (app-core.js)**: `getProductImageUrl()` ora prepone `API_BASE_URL` quando `image_url` è un path relativo (inizia con `/`)
- **Fix 3 (DB)**: invalidati ai_recommendation_matches contaminati (rigenerati dal codice pre-v8.22.43 senza filtro service_type)

## v8.22.43

### Fix: Promo mostra sempre Santevet Premium (3 bug concatenati)
- **Root cause 1 (AI analysis non filtrata)**: `_runAnalysisForPet` in `promo.routes.js` recuperava TUTTI i prodotti published, inclusi insurance/nutrition. I prodotti Santevet con `extended_description` dettagliate dominavano la top 5 AI
- **Root cause 2 (serving non filtrato)**: il loop di serving dei match cached non verificava `service_type` → prodotti insurance venivano restituiti al frontend come promo
- **Root cause 3 (rotation bloccata)**: nel frontend, la guardia `serviceType !== 'promo'` faceva `return` PRIMA dell'incremento rotation → deadlock a rotation=0, stesso prodotto insurance servito ad ogni caricamento
- **Fix 1 (promo.routes.js)**: aggiunto `AND 'promo' = ANY(service_type)` alla query di `_runAnalysisForPet` per escludere insurance/nutrition dall'analisi AI
- **Fix 2 (promo.routes.js)**: nel loop di serving cached, skip dei prodotti con `service_type` che non include 'promo'
- **Fix 3 (app-promo.js)**: spostato incremento rotation PRIMA della guardia serviceType per evitare deadlock
- **DB**: invalidati tutti i `ai_recommendation_matches` cached (contaminati da insurance/nutrition), da rieseguire Bulk AI Analysis

## v8.22.42

### Fix: Promos non visibili (pet_profile/home_feed) + Cardiac+Renal dominanza
- **Root cause 1 (contesti troppo restrittivi)**: `CONTEXT_RULES` in `eligibility.service.js` escludeva `food_clinical` dai contesti `pet_profile` e `home_feed`. Poiché il 93% dei prodotti pubblicati sono food_clinical, l'algoritmo standard non aveva candidati in quei contesti → banner vuoto
- **Root cause 2 (priority sbilanciata)**: il prodotto "Cardiac + Renal" (`pi_71cc08f7`) aveva `priority=10`, pari ai prodotti assicurativi premium. Dominava il ranking standard in tutti i contesti che ammettevano food_clinical (es. `faq_view`)
- **Root cause 3 (AI matches mancanti)**: alcuni pet (es. chiara.romano) avevano `ai_recommendation_matches = NULL` → l'AI cached path non scattava, e il fallback standard aveva 0 candidati nei contesti restrittivi
- **Fix 1 (eligibility.service.js)**: aggiunto `food_clinical` alle categories di `pet_profile` e `home_feed` in CONTEXT_RULES
- **Fix 2 (DB Neon dev)**: normalizzato priority di tutti i food_clinical a <= 5 (`UPDATE promo_items SET priority = LEAST(priority, 5) WHERE category = 'food_clinical' AND priority > 5`)
- **Fix 3 (DB Neon dev)**: triggherato bulk AI analysis per pet senza match

## v8.22.41

### Fix: "Non mi interessa" blocca tutte le promo + Cardiac+Renal persiste
- **Root cause 1 (backend ignora dismissed)**: `promo.routes.js` aveva `const dismissed = [];` hardcoded — il backend restituiva sempre lo stesso prodotto dismissato, il frontend lo nascondeva client-side e ritornava senza richiedere un'alternativa → banner vuoto per sempre
- **Root cause 2 (localStorage non scoped)**: la chiave `ada_promo_dismissed` era condivisa tra tutti gli utenti sullo stesso browser → un dismiss di utente A nascondeva il prodotto anche per utente B
- **Fix 1 (frontend/app-promo.js)**: nuova helper `_getDismissedKey()` che scopa la chiave localStorage per userId (`ada_promo_dismissed_<userId>`). Migrazione automatica dalla vecchia chiave non-scoped
- **Fix 2 (frontend/app-promo.js)**: `loadPromoRecommendation()` ora passa `dismissed=id1,id2,...` come query param al backend
- **Fix 3 (backend/src/promo.routes.js)**: parse `req.query.dismissed` con validazione UUID, rimozione di `const dismissed = []` hardcoded, passaggio a `selectPromo`
- **Fix 4 (backend/src/eligibility.service.js)**: `selectPromo` accetta `dismissed` nel destructuring, filtra i dismissed sia nel path AI cached che nell'algoritmo standard
- **Test**: 2 nuovi unit test — `testDismissedSkipped` (singolo candidato dismissed → null) e `testDismissedOnlyAffectsDismissed` (2 candidati, 1 dismissed ad alta priorità → seleziona l'altro)

## v8.22.40

### Fix: Prodotto "Cardiac + Renal" mostrato sempre — pulizia match fantasma
- **Root cause**: quando il seed viene rieseguito in modalità `replace`, crea nuovi `promo_item_id` (`seed-<randomUUID>`) ma non invalida `ai_recommendation_matches` sui pet → gli ID cachati puntano a prodotti cancellati → tutti i lookup falliscono → fallback all'algoritmo standard → "Cardiac + Renal" (priority 10) vince sempre
- **Fix 1 (seed.promogen.js)**: dopo il `DELETE FROM promo_items` in modalità replace, esegue `UPDATE pets SET ai_recommendation_matches = NULL` per invalidare i match stantii
- **Fix 2a (promo.routes.js)**: se TUTTI i match cachati sono fantasma (nessun `promo_item_id` trovato in `promo_items`), pulisce automaticamente `ai_recommendation_matches` sul pet per evitare fallback ripetuti
- **Fix 2b (eligibility.service.js)**: stessa auto-pulizia nel path AI di `selectPromo` con log di warning
- **Fix 3 (eligibility.service.js)**: aggiunto filtro `!item.description && !item.extended_description` nell'algoritmo standard, allineato con il filtro già presente in `_runAnalysisForPet` — prodotti senza descrizione non vengono più selezionati come fallback

## v8.22.39

### Fix: Banner promo mostra sempre "Cardiac + Renal" invece dei prodotti AI
- **Root cause**: il path cached in `GET /api/promo/recommendation` provava UN solo match dall'indice di rotazione. Se il `promo_item_id` era "fantasma" (generato da OpenAI con ID inesistente, es. `pi_21cc08f7` vs il reale `pi_71cc08f7`), abbandonava l'intero path cached e cadeva nell'algoritmo standard → "Cardiac + Renal" (priority 10, la più alta) vinceva sempre
- **Fix 1 (promo.routes.js)**: il path cached ora cicla su TUTTI i match in ordine rotazione. Se il match all'indice corrente ha un `promo_item_id` inesistente, prova il successivo fino a trovarne uno valido
- **Fix 2 (eligibility.service.js)**: il fallback `selectPromo` AI path usava `Math.random()` per la selezione — sostituito con hash deterministico `hash(petId + date)` (stesso pattern dell'algoritmo standard) per coerenza e riproducibilità

## v8.22.38

### Promo: Rotazione sequenziale Top 5 + evidenzia prodotto attivo
- **Problema**: il banner "Consigliato per il tuo amico pet" sceglieva casualmente (`Math.random()`) tra i top 5 match, causando ripetizioni non deterministiche — lo stesso prodotto poteva apparire più volte di seguito, altri mai
- **Soluzione**: rotazione round-robin gestita con indice di rotazione. Il frontend mantiene un contatore per pet in `localStorage` (`ada_promo_rotation`) e lo passa al backend via query param `rotationIndex`. Il backend usa `eligible[rotationIndex % eligible.length]` invece di `Math.random()`
- **Comportamento**: ad ogni caricamento della pagina pet il banner mostra il prodotto successivo nella sequenza (1→2→3→4→5→1→2→...). L'highlight verde "← Prodotto attualmente raccomandato" nella modale "Analisi Raccomandazione" continua a funzionare correttamente

## v8.22.37

### Fix: "Analisi Raccomandazione" rigenera descrizione e invalida cache
- **Root cause**: dopo il Bulk AI Analysis ("Tutti i pet"), Phase 2 salvava correttamente i match nella pet row e nella `explanation_cache`. Ma quando l'utente premeva "Analisi Raccomandazione" su un pet, `_showPromoAnalysis()` chiamava `generateAiPetDescription()` (che rigenera la descrizione con `ai_description_generated_at = NOW()`), invalidando sia la cache pet row (`ai_description_generated_at` > `ai_recommendation_matches_generated_at`) sia la `explanation_cache` (SHA-256 key diverso per testo descrizione diverso)
- **Fix**: sostituita la chiamata a `generateAiPetDescription()` con un fetch read-only da `GET /api/pets/:petId` che legge `ai_description` dal DB senza rigenerarla. La descrizione viene anche salvata in `_aiPetDescCache` per le chiamate successive. Solo se il DB non ha alcuna descrizione, viene generata come fallback

## v8.22.36

### Fix: Bulk Phase 2 timeout + force bypass completo
- **Root cause (timeout)**: `_runAnalysisForPet` aveva un timeout OpenAI di 25s, insufficiente per pet con molti candidati (fino a 77) durante il bulk Phase 2. Risultato: 3/13 pet fallivano con "This operation was aborted", nessun match veniva salvato, e "Analisi Raccomandazione" doveva ricalcolare da zero
- **Fix timeout**: timeout aumentato da 25s a 45s (default), configurabile via `opts.timeoutMs`
- **Fix force**: `{ force: true }` ora bypassa ENTRAMBE le cache (pet row + `explanation_cache` SHA-256). Prima bypassava solo la pet row cache, il SHA-256 cache restituiva ancora `fromCache: true`

## v8.22.35

### Fix: "Analisi Raccomandazione" ignora cache dal Bulk Phase 2
- **Root cause**: `POST /api/promo/analyze-match-all` chiamava direttamente `_runAnalysisForPet()` senza consultare i match già salvati nella riga del pet (`ai_recommendation_matches`) dal Bulk AI Phase 2. La cache in-memory `explanation_cache` (SHA-256) poteva avere key diverse tra bulk e invocazione individuale → cache miss → ricalcolo completo con OpenAI
- **Fix**: prima di chiamare `_runAnalysisForPet`, l'endpoint ora controlla `pets.ai_recommendation_matches` e `ai_recommendation_matches_generated_at`. Se i match esistono e sono più recenti della descrizione AI (`ai_description_generated_at`), restituisce i match cached immediatamente con `fromCache: true`
- **Force recalc**: supporto per `{ petId, force: true }` nel body per forzare il ricalcolo (bypass cache pet row)

## v8.22.34

### Bulk AI Analysis a 2 fasi + Cache Promo
- **Processo a 2 fasi**: il Bulk AI Analysis ora esegue prima la Fase 1 (genera/aggiorna descrizioni AI per tutti i pet) e poi la Fase 2 (esegue analisi raccomandazione e salva i top 5 match nella tabella `pets`)
- **Selezione fase 2 intelligente**: in modalità "changed", la Fase 2 viene eseguita solo per pet senza match cached, con descrizione appena aggiornata, o con match più vecchi della descrizione
- **Promo da cache AI**: `GET /api/promo/recommendation` ora controlla prima i `ai_recommendation_matches` cached sul pet; se presenti, sceglie casualmente uno dei top 5 match (verificando che sia ancora `published`) — risposta istantanea senza chiamate OpenAI
- **Salvataggio timestamp match**: nuova colonna `ai_recommendation_matches_generated_at` (migrazione 022) per tracciare quando i match sono stati generati
- **Salvataggio match in analyze-match-all**: l'endpoint `POST /api/promo/analyze-match-all` ora salva anche i match + timestamp nella riga del pet
- **UI stepper a 2 fasi**: il popup mostra uno stepper visuale (Fase 1 blu → Fase 2 verde) con barra progresso colorata per fase e contatori separati
- **Risultati separati**: la schermata risultati mostra statistiche per fase — Fase 1 (descrizioni generate, invariati) e Fase 2 (analisi eseguite, da cache, già in cache)
- **Timeout esteso**: timeout richiesta aumentato da 10 a 15 minuti per supportare le 2 fasi
- **SSE eventi fase**: nuovi tipi evento `phase` per comunicare il cambio di fase al frontend

## v8.22.33

### Fix: Bulk AI Analysis descrizioni vuote + timeout + rate limit
- **Fix critico (colonne SQL inesistenti)**: `_collectPetSourcesFromDB` usava `SELECT ... neutered, lifestyle ...` ma queste colonne non esistono nella tabella `pets` (sono dentro `extra_data` JSONB). PostgreSQL restituiva errore, catturato dal `catch` silenzioso → `sources.dati_pet` mai impostato → OpenAI riceveva solo nome/specie/razza dal fallback. Fix: rimosso `neutered`/`lifestyle` dalla SELECT, estratti da `extra_data` come fa il frontend
- **Fix timeout**: aumentato timeout OpenAI nel bulk da 25s a 45s per evitare abort su pet con molti dati
- **Fix rate limit 429**: aumentato default `RATE_LIMIT_PER_MIN` da 60 a 120 richieste/minuto
- **Fix debounce navigazione**: aggiunto debounce 300ms sulle chiamate API (promo/insurance/nutrition) al cambio pet per evitare flood quando si naviga rapidamente tra pet

## v8.22.32

### Miglioramento: Bulk AI Analysis + Promo Selection da Top 5 AI Matches
- **Fix prompt "[fonte]"**: il system prompt dell'endpoint `POST /api/pets/:petId/ai-description` ora specifica i nomi esatti delle fonti (`[Dati Pet]`, `[Documento: <nome>]`, `[Farmaci]`, `[Parametri Vitali]`, `[Storico Sanitario]`, `[Conversazioni]`) — GPT non scrive più `[fonte]` generico
- **Arricchimento fonti dati**: `_collectPetSourcesFromDB` ora legge anche `parametri_vitali`, `farmaci`, `storico_sanitario` e `microchip` dalla colonna `extra_data` JSONB della tabella `pets`
- **Bulk AI riscritto**: il body accetta `{ mode: "changed" | "all" }` al posto di `{ force: true }`. Modalità "changed" confronta un hash content-based delle fonti con `ai_description_sources_hash` e salta i pet invariati. Tutte le descrizioni usano lo stesso prompt strutturato dell'endpoint individuale (sezioni ANAGRAFICA, CONDIZIONI MEDICHE, ecc.)
- **Hash content-based**: sostituito `JSON.stringify(sources).length + "_" + Date.now()` con un hash deterministico basato sul contenuto (stesso algoritmo del frontend)
- **Salvataggio top 5 match**: quando la descrizione cambia, il bulk esegue `_runAnalysisForPet` e salva i top 5 match nella nuova colonna `ai_recommendation_matches` (JSONB) sulla riga del pet
- **Promo selection da AI**: `selectPromo()` ora prova prima a usare `ai_recommendation_matches` — sceglie casualmente tra i match validi (filtrati per consent, vet flags, freq cap). Se non ci sono match validi o la colonna è NULL, usa l'algoritmo classico (tag matching + priority + tie-break) come fallback
- **UI admin migliorata**: rimosso pulsante "Rigenera Desc.", il pulsante "Bulk AI Analysis" ora apre un popup con scelta tra "Solo pet con fonti modificate" (default) e "Tutti i pet (rigenera tutto)". I pet skippati sono mostrati come "Invariati" durante il progresso
- **Nuova migrazione SQL**: `sql/021_ai_recommendation_matches.sql` aggiunge la colonna JSONB
- **Rimosso**: `_isBadAiDescription()` non più necessaria con il prompt strutturato

## v8.22.31

### Fix: Bulk AI Analysis — descrizioni generiche "non ci sono dati" per pet con dati minimi
- **Root cause 1 (prompt debole)**: il prompt OpenAI chiedeva "genera una descrizione basata sui dati forniti" — quando un pet aveva solo nome e specie (altri campi null), GPT-4o-mini rispondeva con "non ci sono dati, per favore fornisci..." invece di generare una descrizione con i dati disponibili
- **Root cause 2 (nessuna validazione)**: la risposta generica veniva salvata nel DB come `ai_description` valida, e il check `if (!pet.ai_description)` impediva la rigenerazione nei run successivi
- **Root cause 3 (dati non passati)**: se `_collectPetSourcesFromDB` falliva silenziosamente (catch vuoto), i dati base del pet (nome, specie, razza) dalla query principale non venivano inclusi nel prompt
- **Fix 1 (prompt robusto)**: riscritto il system prompt per istruire l'AI a usare SOLO i dati disponibili, MAI chiedere informazioni aggiuntive, e generare una descrizione anche con dati minimi
- **Fix 2 (validazione)**: aggiunto `_isBadAiDescription()` che rileva pattern generici ("non ci sono dati", "avrei bisogno di", ecc.) e scarta le descrizioni invalide — le bad descriptions esistenti vengono cancellate dal DB
- **Fix 3 (fallback dati base)**: nome, specie e razza dal query principale vengono sempre iniettati nei sources, anche se `_collectPetSourcesFromDB` restituisce dati vuoti
- **Fix 4 (force-regenerate)**: nuovo pulsante "Rigenera Desc." che invia `{ force: true }` per rigenerare tutte le descrizioni, non solo quelle mancanti — utile per correggere descrizioni errate da run precedenti
- **Fix 5 (rate limiting)**: aggiunto delay di 500ms tra ogni pet nel loop seriale per evitare sovraccarico API

## v8.22.30

### Fix: chiamata WebRTC cade immediatamente dopo l'accettazione (race condition dedup)
- **Root cause**: la dual-emission introdotta in v8.22.29 (conv room + user room) causa la ricezione duplicata degli eventi `webrtc_offer` e `webrtc_answer`. I guard anti-duplicati usavano proprietà asincrone (`remoteDescription`) che non sono ancora impostate quando il secondo evento arriva, permettendo a entrambi di entrare nell'handler. Il secondo `setRemoteDescription` fallisce → catch chiama `endCall()` → il server notifica l'altro peer → entrambi chiudono la chiamata
- **Fix**: sostituiti i check asincroni con flag booleani sincroni (`_webrtcOfferHandled`, `_webrtcAnswerHandled`, `_webrtcAcceptHandled`) impostati immediatamente all'ingresso dell'handler, prima di qualsiasi operazione async
- **Fix**: lo stato `disconnected` del PeerConnection ora ha un grace period di 5s invece di terminare immediatamente la chiamata (lo stato `disconnected` è transitorio e può risolversi da solo)
- **Miglioramento**: aggiunto logging in `endCall()` per facilitare il debug di chiusure inattese

## v8.22.29

### Fix: chiamate WebRTC non si connettono (signaling + ICE timeout)
- Fix critico: i listener di signaling WebRTC (`call_accepted`, `webrtc_offer`, `webrtc_answer`, ecc.) non venivano mai registrati se l'utente faceva login manuale (non auto-login). Il polling con timeout fissi (500ms–5s) dopo DOMContentLoaded scadeva prima della creazione del socket. Ora `initCommSocket()` invoca direttamente `_webrtcInitSignaling()` al momento della creazione del socket, con guard anti-duplicati
- Fix: gli eventi di signaling (`call_accepted`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice`) ora vengono emessi anche sulla user room del destinatario (oltre alla conv room), come fallback per garantire la consegna anche se un socket non è nella conv room
- Fix: il timeout ICE (20s) partiva alla creazione del PeerConnection (prima ancora che il callee accettasse la chiamata), causando timeout prematuri. Ora il timeout ICE parte solo dopo `setRemoteDescription` (completamento scambio SDP)
- Fix: l'overlay del callee mostrava "Connesso" immediatamente all'accettazione — ora mostra "Connessione in corso..." fino alla connessione ICE effettiva
- Dedup: aggiunta protezione contro eventi duplicati che arrivano via conv room + user room (check su `localDescription`/`remoteDescription` già impostate)

## v8.22.28

### Fix: Promo non visibile con forceMultiService ON (crash silenzioso)
- **Root cause 1 (crash)**: in `eligibility.service.js`, quando `force=true` il consent fetch viene saltato (`consent = null`), ma riga 156 chiama `isClinicalTagsAllowed(null)` che accede a `null.clinical_tags` → **TypeError** → il catch esterno ritorna `null` silenziosamente, mascherando il problema reale
- **Root cause 2 (filtri non bypassati)**: anche senza il crash, i filtri species, lifecycle e context/category NON erano bypassati da `force=true` — se i promo_items avevano categorie non previste dal contesto (es. `food_clinical` in `pet_profile`), venivano tutti esclusi
- **Fix 1**: null-guard su `isClinicalTagsAllowed(consent)` → `consent ? isClinicalTagsAllowed(consent) : false`
- **Fix 2**: quando `force=true`, bypassare anche species, lifecycle e context/category filters — coerente con l'intento "bypass tutti i gate"

## v8.22.27

### Fix: Promo non visibile in Dati Pet con forceMultiService ON
- **Root cause**: in `app-pets.js`, il refresh promo al cambio pet controllava solo `promoRole === 'proprietario'`, ignorando il flag `forceMultiService` — il promo non appariva per veterinari con "Visualizza sempre multi-servizio" attivo
- **Fix**: aggiunto check `forceMultiService` identico a quello già presente in `app-core.js`

## v8.22.26

### Fix: Bulk AI Analysis — _currentTenantId non definito
- **Root cause**: `bulkAiAnalysis()` referenziava `_currentTenantId` che non esiste — la variabile corretta è `_selectedDashboardTenant` con fallback a `getJwtTenantId()`
- **Fix**: sostituito con lo stesso pattern usato in tutte le altre funzioni admin: `getJwtTenantId()` + fallback `_selectedDashboardTenant`

## v8.22.25

### Fix: Bulk AI Analysis SSE — CORS headers mancanti
- **Root cause**: `res.writeHead(200, {...})` nel backend sovrascriveva gli header CORS impostati dal middleware `cors()` di Express — il browser bloccava il body della risposta SSE, `resp.body` era `null`, `.getReader()` lanciava TypeError e il catch chiudeva la modal silenziosamente
- **Backend fix**: sostituito `res.writeHead()` con `res.setHeader()` individuali + `res.flushHeaders()` per preservare gli header CORS già impostati dal middleware
- **Frontend fix**: aggiunto null-check su `resp.body` prima di `.getReader()` con messaggio di errore chiaro via toast

## v8.22.24

### Fix: Bulk AI Analysis — feedback progresso real-time (SSE)
- **Root cause**: premendo "Bulk AI Analysis" l'utente non vedeva feedback — `fetchApi` abortiva dopo 30s (troppo poco per un'operazione multi-minuto) e la modal si chiudeva cliccando fuori
- **Backend SSE stream**: l'endpoint `POST /api/admin/:tenant_id/bulk-ai-analysis` ora risponde con Server-Sent Events, inviando eventi `start`, `progress`, `pet_done` e `done` per ogni pet processato
- **Frontend stream reader**: `bulkAiAnalysis()` usa `fetch()` diretto (bypassa il timeout 30s di `fetchApi`) con stream reader che legge gli eventi SSE in tempo reale
- **Modal non chiudibile**: durante l'elaborazione il click fuori dalla modal non la chiude; diventa chiudibile solo a completamento
- **Barra progresso live**: mostra "3/11" con percentuale, nome del pet corrente ("Elaborazione: Fido..."), contatori incrementali (descrizioni, analisi, cache), e timer trascorso
- **Report finale**: a completamento la modal mostra i totali (pet, descrizioni generate, analisi eseguite, da cache) con tempo totale e pulsante Chiudi
- Timeout esteso a 10 minuti lato server

## v8.22.23

### Feature: Bulk AI Analysis in Catalogo
- **Nuovo pulsante** "Bulk AI Analysis" nella pagina admin Catalogo (solo super_admin / admin_brand)
- Per ogni pet nel database: genera la "Descrizione Pet per AI" se assente, poi esegue "Analisi raccomandazione"
- Pre-calcola e cacha i risultati in `explanation_cache` (TTL 24h) per presentazione promo istantanea
- **Nuovo endpoint** `POST /api/admin/:tenant_id/bulk-ai-analysis` con timeout 5 minuti
- **Helper server-side** `_collectPetSourcesFromDB()`: raccoglie dati pet, documenti e conversazioni dal DB
- **Refactor** `_runAnalysisForPet()`: logica core estratta dall'endpoint `analyze-match-all` per riuso
- Modal UI con spinner durante l'elaborazione e report finale con conteggi (pet totali, descrizioni generate, analisi eseguite, analisi da cache, errori)

### Feature: forceMultiService bypass totale
- Quando "Visualizza sempre multi-servizio" è ON, tutti i gate vengono bypassati:
  - **Frontend**: skip session impression limit in `renderPromoSlot()` — nessun cap per sessione
  - **Frontend**: `loadPromoRecommendation()` aggiunge `force=1` alla query string
  - **Backend**: `GET /api/promo/recommendation` passa il flag `force` a `selectPromo()`
  - **Backend**: `selectPromo()` in `eligibility.service.js` quando `force=true` salta: consent check globale, brand consent per item, vet flag check, frequency capping intero
- Risultato: navigando tra pagine con forceMultiService ON, Promo + Nutrizione + Assicurazione sono sempre visibili

### Bug Fix: vet_ext conversazione senza pet_id
- **Root cause**: il check `getAllPets()` per vet_ext in `app-communication.js` falliva se il cache era vuoto (navigazione diretta a Messaggi)
- **Fix**: rimosso il check ridondante — il backend (`communication.routes.js`) già verifica `referring_vet_user_id`
- Le conversazioni create da vet_ext ora includono sempre il `pet_id` e sono visibili in Archivio Sanitario

## v8.22.22

### Feature: Analisi Raccomandazione Potenziata
- **Nuovo endpoint** `POST /api/promo/analyze-match-all`: analizza il profilo del pet contro TUTTI i prodotti eligibili con pre-filtering (specie, lifecycle, consent, tags) e ranking AI top 5
- **Pre-filtering server-side**: i ~133 prodotti vengono filtrati a ~10-25 candidati usando la stessa logica di eligibility esistente prima dell'invio a OpenAI
- **Ranking AI dettagliato**: ogni prodotto riceve score (0-100), reasoning personalizzato per il pet, key_matches e relevance level
- **Cache 24h**: risultati salvati in `explanation_cache` con chiave basata su SHA256(ai_description + candidateIds) — secondo click istantaneo
- **UI rinnovata**: modal con loading spinner, badge score colorati (verde/giallo/grigio), chip key_matches, link "Scopri di più", indicatore cache
- **Backward compatibility**: il vecchio endpoint `analyze-match` e la vecchia modal rimangono intatti

## v8.22.21

### Fix: Chatbot AI — invio secondo messaggio fallisce con 500
- **Root cause**: la query di recupero storico messaggi in `POST /api/communication/conversations/:id/messages` (ramo AI) referenziava colonne inesistenti `file_url`, `file_name`, `file_type` — i nomi corretti nella tabella `comm_messages` sono `media_url` e `media_type`
- Il primo messaggio funzionava perché la creazione della conversazione costruisce lo storico manualmente senza query DB
- Fix: corretti i nomi colonna nella SELECT e nei riferimenti nel codice di processing

## v8.22.20

### Fix: Attachment 401, AI description timeout, promo analysis
- **BUG 1 — Attachment 401**: Fix path mismatch nella verifica signed URL — `req.path` (strippato del prefisso `/api` dal middleware mount) sostituito con `req.originalUrl.split('?')[0]` sia in `requireJwt` che in `verifyMediaSignature`. Le signed URL ora verificano correttamente dopo navigazione tra pagine
- **BUG 1 — Download endpoint role-based**: Gli endpoint attachment metadata e download (`comm-upload.routes.js`) ora supportano accesso role-based come `getConversationIfAllowed` in `communication.routes.js` — utenti con accesso al pet possono scaricare attachment anche se non partecipanti diretti alla conversazione
- **BUG 2 — AI Description 504**: Timeout OpenAI per `POST /api/pets/:id/ai-description` aumentato da 15s a 25s — evita `504 generation_timeout` con 5s di margine prima del frontend timeout (30s)
- **BUG 3 — Analisi raccomandazione vuota**: Risolto automaticamente dal fix BUG 2 — la descrizione pet ora viene generata con successo e l'analisi promo non viene più saltata

## v8.22.19

### Fix: Conversazioni vet_ext non visibili nell'archivio pet
- Fix: la query `GET /api/communication/conversations?pet_id=X` ora mostra TUTTE le conversazioni associate al pet quando l'utente ha accesso al pet, non solo quelle in cui è partecipante diretto
- Fix: `getConversationIfAllowed` estesa con logica role-based — utenti con accesso al pet possono ora aprire e leggere conversazioni visibili nell'archivio (prima ricevevano 404)
- **Ruoli con accesso globale** (`vet_int`, `vet`, `super_admin`): vedono tutte le conversazioni di ogni pet
- **`vet_ext`**: vede le conversazioni dei pet a cui è assegnato come `referring_vet_user_id`
- **`owner`**: vede le conversazioni dei propri pet (`owner_user_id`)
- Fix copre anche telefonate (`voice_call`) e videochiamate (`video_call`) che usano la stessa tabella `conversations`

## v8.22.18

### Fix: Diagnostica errori AI Description e Analisi Raccomandazione
- Fix: `generateAiPetDescription` ora logga in console lo status HTTP e il body dell'errore backend (503/502/504) — prima tornava `null` silenziosamente senza alcuna indicazione della causa
- Fix: messaggio errore UI per "Descrizione Pet per AI" ora mostra "Verificare la configurazione OpenAI nel backend" invece del generico "Errore nella generazione della descrizione"
- Fix: toast "Analisi raccomandazione" migliorato — ora dice "Descrizione pet non disponibile — generare prima la descrizione AI" con log `console.warn` per debugging

## v8.22.17

### Bug Fix: "Descrizione Pet per AI" genera dati vuoti (BUG-1)
- Fix critico: aggiunto `await` mancante alla chiamata `getPetById()` — restituiva una Promise invece dell'oggetto pet, causando tutti i campi "Nessuna informazione disponibile"
- Fix: rimossi i fetch a endpoint API inesistenti (`/api/pets/{id}/vitals`, `/api/pets/{id}/medications`) — vitali e farmaci vengono ora letti direttamente da `pet.vitalsData` e `pet.medications` (già normalizzati da `extra_data`)
- Fix: corretto campo microchip (`pet.patient?.petMicrochip`) e aggiunti fallback per tutti i campi anagrafici via `pet.patient`
- Fix: aggiunto recupero dello storico sanitario (`pet.historyData`) come fonte dati per la descrizione AI

### Bug Fix: "Analisi Raccomandazione" risultato generico (BUG-2)
- Risolto automaticamente dal fix BUG-1 — i dati pet ora arrivano correttamente al matching AI

### Bug Fix: Promo non visibile con "Visualizza sempre multi-servizio" ON (BUG-3)
- Fix: il toggle `forceMultiService` ora influenza anche la visibilità del promo slot, non solo dell'assicurazione — dichiarazione spostata prima di entrambi i blocchi di rendering

### Feature: Selezione destinatario role-based per chiamate (FEAT-1)
- Refactor del form di chiamata diretta dalla pagina Messaggi con selezione destinatario role-based:
  - `vet_int`: dropdown tipo destinatario (Veterinario Interno / Esterno / Proprietario) + select destinatario dinamico
  - `vet_ext` / `owner`: mostra direttamente solo i destinatari `vet_int`
- I destinatari si caricano dinamicamente al cambio tipo via `GET /api/communication/users?role={tipo}`
- Supporto `makeFilterableSelect` per ricerca nel dropdown

### Feature: Pulsante "Inizia" a sinistra di "Annulla" (FEAT-2)
- I pulsanti "Inizia" e "Annulla" sono ora nella stessa riga flex, con "Inizia" a sinistra (appare solo dopo selezione destinatario)

## v8.22.16

### Feature: Multi-select Tipo Servizio + Azione bulk su catalogo
- **Nuovo Prodotto**: il campo "Tipo Servizio" ora usa checkboxes multi-select (Promo / Nutrizione / Assicurazione) invece di un singolo `<select>`, permettendo di assegnare più servizi contemporaneamente
- **Modifica Prodotto**: aggiunto campo "Tipo Servizio" con checkboxes pre-selezionati in base ai valori correnti del prodotto — era impossibile modificare il tipo servizio dopo la creazione
- **Bulk Tipo Servizio**: aggiunta barra azioni bulk nella vista catalogo con checkboxes servizio + bottoni "Aggiungi ai filtrati" / "Rimuovi dai filtrati" — opera su tutti i prodotti visibili dopo i filtri
- **Backend**: nuovo endpoint `PATCH /api/admin/:tenantId/promo-items/bulk/service-type` con supporto add/remove array, tenant isolation e audit log

## v8.22.15

### Fix: Pulsante chiamata dalla pagina Messaggi sembra non funzionare
- Fix UX: il form di selezione destinatario (chiamata dalla pagina principale Messaggi) appariva senza feedback visivo — se fuori vista, l'utente pensava che il pulsante non funzionasse
- Aggiunto scroll automatico (`scrollIntoView`) verso il form dopo la sua creazione
- Aggiunto auto-focus sull'input di ricerca destinatario dopo un breve delay (350ms) per garantire che lo scroll sia completato

## v8.22.14

### Fix: AudioContext suspended — trascrizione cattura silenzio
- Fix: l'`AudioContext` creato nel callback ICE (non un gesto utente) partiva in stato `suspended` — nessun audio fluiva nel pipeline Web Audio API, il `MediaRecorder` registrava silenzio e Whisper produceva allucinazioni per ogni chunk
- Fix: aggiunto `audioCtx.resume()` immediato con log dello stato (`suspended` → `running`)
- Miglioramento: il log del livello audio ora include anche lo stato dell'AudioContext per diagnosi rapida

## v8.22.13

### Fix: MediaRecorder cattura silenzio su mobile — Web Audio API
- Fix critico: su Chrome mobile, quando un `getUserMedia` stream viene usato contemporaneamente da `RTCPeerConnection` e `MediaRecorder`, quest'ultimo cattura silenzio anziché l'audio del microfono. L'interlocutore sente la voce (via WebRTC), ma la trascrizione riceve audio vuoto → Whisper produce allucinazioni ("Sottotitoli creati dalla comunità Amara.org") per ogni chunk
- Fix: l'audio per il `MediaRecorder` viene ora instradato attraverso la **Web Audio API** (`AudioContext → MediaStreamSource → MediaStreamDestination`), creando uno stream audio indipendente che bypassa il conflitto con il PeerConnection
- Aggiunta diagnostica: log del livello audio 3 secondi dopo l'inizio della cattura (`Audio level check: avg=X`) per verificare se il microfono produce effettivamente segnale
- Aggiunta diagnostica: log delle proprietà dell'audio track (enabled, muted, readyState, label)
- Cleanup: l'AudioContext viene chiuso correttamente quando la trascrizione termina

## v8.22.12

### Fix: Trascrizione chiamate — socket disconnect e rendering
- Fix critico: lo speaker non vedeva MAI la propria trascrizione — `_commHandleNewMessage` saltava tutti i messaggi "propri" (`isOwn`) inclusi quelli di tipo `transcription` che sono generati dal server e mai renderizzati in anticipo dal client. Ora i messaggi `transcription` vengono sempre renderizzati
- Fix: aggiunto deduplica messaggi per `message_id` in `_commHandleNewMessage` — previene duplicati se lo stesso evento arriva sia dalla conv room che dal user room
- Fix: aumentato `pingTimeout` Socket.io da 20s (default) a 60s — i chunk audio da ~320KB congestionavano il WebSocket causando timeout del ping a ~45s dalla connessione, provocando un `transport close` che faceva perdere i chunk in elaborazione

## v8.22.11

### Diagnostica backend trascrizione chiamate
- Il backend ora invia feedback in tempo reale al frontend per ogni chunk audio: `received`, `empty`, `hallucination`, `ok`, `error` — visibile nella console browser come `[WebRTC] Backend: status=...`
- Permette di diagnosticare esattamente dove la pipeline di trascrizione si blocca senza bisogno di accesso ai log del server Render

## v8.22.10

### Fix: Robustezza chunking trascrizione chiamate + logging diagnostico
- Fix critico: `MediaRecorder.start()` era fuori dal try/catch in `createAndStart()` — se falliva (comune su browser mobile), il callback di `setInterval` lanciava un'eccezione non catturata, il vecchio recorder non veniva mai stoppato, e la trascrizione si fermava silenziosamente dopo il primo/secondo chunk
- Fix: aggiunto `onerror` handler su `MediaRecorder` per catturare errori del media pipeline (prima venivano ignorati silenziosamente)
- Fix: nel callback `setInterval`, il vecchio recorder viene ora stoppato SEMPRE, anche se la creazione del nuovo recorder fallisce (prima veniva lasciato a registrare indefinitamente)
- Fix: aggiunto `AbortController` con timeout 30s alla chiamata API OpenAI Whisper — se l'API non risponde, il chunk viene scartato anziché bloccare la pipeline
- Miglioramento: logging diagnostico completo su frontend e backend — dimensione chunk, parti accumulate, errori di start/stop, transcription OK/empty/hallucination — per diagnosi rapida in caso di ulteriori problemi

## v8.22.9

### Miglioramento qualità trascrizione chiamate
- Fix: messaggi multipli per lo stesso speaker — il merge ora è basato su "stesso speaker" anziché una finestra temporale di 30s; finché lo speaker non cambia, tutto il testo viene appeso allo stesso messaggio
- Fix: parole perse tra chunk — il nuovo `MediaRecorder` viene avviato PRIMA di stoppare il precedente, garantendo zero gap audio tra un chunk e l'altro (i due recorder registrano in parallelo per un istante)
- Fix: filtro allucinazioni Whisper — audio silenzioso/ambientale produceva testi fantasma ("Sottotitoli creati dalla comunità Amara.org", "Grazie per la visione", ecc.); aggiunto filtro regex nel backend che scarta questi output noti

## v8.22.8

### Fix: Trascrizione chiamate si interrompe dopo il primo chunk
- Fix critico: il `MediaRecorder` non si riavviava dopo il primo `stop()` — chiamare `start()` sulla stessa istanza dopo `stop()` è inaffidabile su molti browser. Ora viene creato un **nuovo MediaRecorder** per ogni finestra di 15 secondi, garantendo che ogni chunk sia un file audio indipendente e il recording continui per tutta la durata della chiamata
- Fix: aggiunto flush esplicito dell'ultimo chunk audio quando la chiamata viene terminata (log `Flushing final audio chunk`)
- Miglioramento: logging dettagliato del ciclo di chunking (`Audio capture started`, `Chunk #N finalized`, `Flushing final audio chunk`) per facilitare il debug

## v8.22.7

### Fix: Trascrizione chiamate non funzionante (FormData incompatibile)
- Fix critico: la funzione `transcribeAudioChunk` in `websocket.js` usava il pacchetto npm `form-data` con il `fetch` nativo di Node.js 20, che sono incompatibili — ogni chiamata a OpenAI Whisper falliva silenziosamente. Corretto usando il `FormData` nativo + `Blob`, allineandosi al pattern usato con successo in `comm-upload.routes.js` e `server.js`
- Fix: rimossa la cattura audio remota (solo `local`) — ogni partecipante ora trascrive solo la propria voce, eliminando le trascrizioni duplicate (prima entrambi i lati catturavano sia audio locale che remoto, creando fino a 4 trascrizioni per ogni 15 secondi)
- Fix: aggiunto listener `message_updated` in `app-communication.js` per aggiornare in tempo reale i messaggi di trascrizione quando il backend appende testo a un messaggio esistente (merge chunk <30s)
- Fix: aggiunto attributo `data-content` al div del contenuto nel rendering dei messaggi per facilitare aggiornamenti DOM mirati
- Miglioramento: log di errore più dettagliati nella trascrizione Whisper (body errore incluso)

## v8.22.6

### Integrazione TURN server Metered.ca per chiamate WebRTC
- Backend: endpoint `GET /api/rtc-config` ora supporta Metered.ca REST API (env vars `METERED_API_KEY` + `METERED_APP_NAME`) con auto geo-routing e credenziali dinamiche
- Backend: cache 5 minuti delle credenziali TURN per ridurre chiamate API
- Backend: fallback a config statica (`TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`) o STUN-only se Metered non configurato

## v8.22.5

### Fix: Chiamate WebRTC non funzionanti (timer bloccato 00:00, nessun audio)
- Fix critico: le chiamate tra owner e vet_int (e qualsiasi coppia) restavano bloccate su "Connesso 00:00" senza audio — la connessione ICE non si stabiliva mai perché mancava il supporto TURN server per NAT traversal
- Backend: nuovo endpoint `GET /api/rtc-config` che restituisce la configurazione ICE servers (STUN + TURN opzionale via env vars `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, `TURN_URL_TLS`)
- Frontend: `_webrtcCreatePC()` ora carica la configurazione ICE dal backend prima di creare la PeerConnection, con fallback ai soli STUN servers di Google
- Frontend: aggiunto ICE connection timeout (20s) — se la connessione non si stabilisce, la chiamata viene terminata con messaggio utente "Impossibile stabilire la connessione"
- Frontend: aggiunto logging diagnostico completo per tutto il flusso signaling (offer/answer/ICE state) e connection state
- Frontend: gestione esplicita dello stato ICE `failed` con messaggio utente "Connessione fallita. Verificare la rete."

## v8.22.4

### Fix: Trascrizione chiamate non funzionante
- Fix critico: race condition nella cattura audio remoto durante le chiamate WebRTC — `_webrtcRemoteStream` era vuoto al momento dell'avvio della trascrizione perché le tracce audio remote arrivano via `ontrack` dopo l'evento ICE `connected`
- Fix: aggiunto avvio cattura audio remota nel callback `ontrack` quando la trascrizione è già attiva ma lo stream remoto non era ancora disponibile
- Fix: aggiunta validazione tracce audio locali prima di avviare la cattura (`getAudioTracks().length > 0`)
- Miglioramento: log diagnostici in `_webrtcStartServerTranscription` e `_webrtcSendAudioChunk` per facilitare il debug della trascrizione live

## v8.22.3

### Bug Fix & Live Call Transcription + UI Improvements
- Fix: pagina "Descrizione Pet per AI" bianca — inline `style="display:none"` sovrastava `.page.active`; aggiunto gestione display nel toggle debug + chiamata `updateAiPetDescriptionUI()` in `navigateToPage`
- Fix: tipo conversazione (voice_call/video_call) non salvato — frontend ora invia campo `type` nella POST, backend lo valida e lo inserisce nella tabella conversations
- Fix: "Analisi Raccomandazione" restituiva sempre "Nessuna corrispondenza" — frontend ora recupera `extended_description` dal backend via nuovo endpoint GET `/api/promo/items/:id`, insurance/nutrition passano descrizione servizio; prompt backend migliorato per garantire almeno corrispondenze generiche
- Fix: testo pulsante "Iniziare" → "Inizia" nella dialog chiamata diretta
- Feature: dropdown destinatario filtrable nella dialog chiamata — sostituito `<select>` con input text + dropdown custom con ricerca per sottostringa
- Feature: trascrizione live chiamate via OpenAI Whisper (server-side) — audio locale/remoto catturato in chunk da 15s via `MediaRecorder`, inviato al backend via WebSocket `call_audio_chunk`, trascritto con Whisper e salvato come messaggio `transcription` nella conversazione con attribuzione speaker; merge automatico chunk consecutivi stesso speaker (<30s)
- Miglioramento: pagina "Descrizione Pet per AI" carica prima dal DB (cache persistente), poi rigenera solo se necessario
- Icone conversazione in Archivio Sanitario (📞/🎥/💬) funzionanti automaticamente grazie al fix del tipo conversazione

## v8.22.2

### Bug Fix & UI Improvements (9 issues)
- Fix: pagina "Descrizione Pet per AI" bloccata per ruolo — aggiunto `ai-petdesc` ai permessi di veterinario, proprietario, vet_int e super_admin
- Fix: dopo salvataggio pet, i dropdown Proprietario e Vet Esterno non si aggiornavano — aggiunto refresh dropdown post-save
- Fix: tasto "Test" in Aggiungi Pet non compilava Proprietario e Vet Esterno — dispatch evento `change` dopo selezione nel filterable select
- Fix: vet_ext vedeva il tasto "Aggiungi" pet — aggiunto `id="addPetBtn"` al bottone in index.html per il guard CSS
- Fix: slot "Consigliato per il tuo amico pet" non si aggiornava al cambio pet — refresh di tutti gli slot (promo + insurance + nutrition) e reset stale promo ID
- Fix: messaggi ad ADA non consideravano allegati — query AI context include `file_url/file_name/file_type`, immagini inviate con vision (gpt-4o), PDF/file con nota testuale
- Fix: slot promo mostrava suggerimenti assicurazione — aggiunto filtro `serviceType` frontend e `effectiveServiceType` nel backend response
- Fix: finestra messaggi più larga dello schermo su mobile — aggiunto CSS responsive con `max-width:100%`, `flex-wrap`, `overflow-x:hidden`
- Miglioramento: icone messaggi (emoji, allegato, foto, mic) riposizionate sopra il campo testo per layout più pulito e textarea più ampio

## v8.22.1

### Fix WebRTC Call Answering Flow
- Fix critico: le chiamate vocali/video non arrivavano al destinatario — l'evento `incoming_call` veniva emesso solo nella conv room a cui nessuno era ancora joinato
- Backend: i 7 handler di signaling WebRTC ora auto-joinano il socket alla conv room (con verifica partecipante) prima di emettere eventi
- Backend: `incoming_call` emesso sia nella conv room che nella `user:${recipientId}` room per raggiungere il destinatario anche se non ha la conversazione aperta
- Backend: `end_call` emesso anche nella user room del destinatario per dimettere la notifica se il chiamante annulla
- Backend: push notification "Chiamata in arrivo" inviata al destinatario offline (nuovo parametro `notificationType` in `sendPushToUser`)
- Frontend: deduplicazione `incoming_call` per `callId` (l'evento arriva da entrambe le room)
- Frontend: timeout 60s "Nessuna risposta" lato chiamante se nessuno risponde
- Frontend: auto-dismiss notifica incoming dopo 60s lato ricevente
- Frontend: `_webrtcAccept` joina la conv room prima di emettere `accept_call`
- Frontend: `call_ended` dismette correttamente la notifica incoming pendente
- Service Worker: push notification per chiamate con `requireInteraction: true`, vibrazione prolungata, e routing `notificationclick` dedicato

## v8.22.0

### Bug Fix Critici
- Fix: pulsanti chiamata vocale e videochiamata non funzionavano — corretti da `initCallUI`/`startVideoCall` a `startCall(convId, type)` con retry signaling migliorato
- Fix: pet selector si svuotava dopo disconnect backend — aggiunto retry con backoff esponenziale (3 tentativi), refresh automatico su `visibilitychange` e refresh periodico ogni 60s

### Nuove Feature AI
- **Descrizione Pet per AI**: nuova pagina (visibile in debug) che genera automaticamente una descrizione strutturata del pet da tutte le fonti dati (anagrafica, documenti, vitali, farmaci, conversazioni) tramite OpenAI GPT-4o-mini. Usata per AI matching con prodotti
- **AI matching servizi**: nuovo endpoint `/api/promo/ai-match` che confronta la descrizione AI del pet con le descrizioni prodotto per ranking intelligente
- **Analisi raccomandazione**: pulsante debug su card promo/assicurazione/nutrizione che mostra le corrispondenze AI tra pet e prodotto tramite `/api/promo/analyze-match`

### Trascrizione Vocale
- Trascrizione messaggi vocali via OpenAI Whisper: dopo l'invio di un messaggio vocale, viene automaticamente trascritto e la trascrizione appare sotto il player audio per entrambi gli interlocutori
- Trascrizione in tempo reale durante chiamate WebRTC via Web Speech API (browser), con invio automatico dei segmenti trascritti nella conversazione
- Notifica WebSocket `transcription_ready` per aggiornamento real-time della UI

### Comunicazione & UI
- Pulsanti 📞 e 🎥 per chiamata diretta dalla pagina principale Messaggi con selezione destinatario
- Riordinamento input chat: `[😊] [textarea] [📎] [📷] [🎤] [Invia]` — aggiunto pulsante 📷 per scatto foto (usa `capture=environment` per fotocamera mobile)
- Pulsanti 📎 e 📷 spostati sulla riga "Primo messaggio" nella nuova conversazione
- Label "Descrizione estesa (per AI matching)" rinominata in "Descrizione Prodotto (per AI matching)" nell'admin
- Testo "paziente" → "pet" in Archivio Sanitario e conversazioni
- Trascrizioni (video)telefonate visibili nell'Archivio Sanitario con icone tipo conversazione

### Backend
- Disclaimer insurance differenziato: le proposte assicurative non suggeriscono più di "consultare il veterinario" ma usano un disclaimer specifico sulle condizioni del piano
- Endpoint `/api/pets/:petId/ai-description` per generazione descrizione AI pet con cache in DB
- Endpoint `/api/communication/messages/:messageId/transcribe` per trascrizione vocale via Whisper
- Migrazione SQL `020_ai_pet_description.sql`: colonne `ai_description`, `ai_description_sources_hash`, `ai_description_generated_at` su tabella `pets`; colonna `transcription` su `comm_messages`

## v8.21.0

### Security Critical
- WebSocket authorization: `join_conversation` ora verifica che l'utente sia partecipante alla conversazione (owner o vet). Tutti gli eventi WS (typing, delivery, call signaling) protetti da room membership check
- Content-Security-Policy header aggiunto a tutte le risposte backend (default-src 'self', script/style inline permessi, CDN cloudflare, OpenAI API, WebSocket)
- Protezione brute-force login: max 5 tentativi falliti in 15 minuti, lockout 30 minuti (HTTP 429). Nuova tabella `login_attempts` (migrazione `sql/019_login_security.sql`)
- Password policy rafforzata: lunghezza minima 10 caratteri (da 6), blocco password comuni e contenenti "ada"

### Backend Security & Robustness
- Graceful shutdown: gestione SIGTERM/SIGINT con chiusura ordinata HTTP server e pool DB (timeout forzato 10s)
- Database SSL: supporto certificato CA via env `PG_CA_CERT` per verifica server certificate in produzione. Pool default aumentato a 10, monitoring eventi error/connect
- Signed media URLs: endpoint `/api/media/sign` genera URL HMAC firmati con scadenza 5 minuti per accesso media senza esporre JWT in query string. Fallback `?token=` mantenuto per retrocompatibilita
- Referrer-Policy `no-referrer` e `Cache-Control: private, no-store` per download allegati comunicazione
- Permissions-Policy header: camera e microfono solo self, geolocation disabilitato

### Frontend Robustness
- Global error handlers: `window.onerror` e `window.onunhandledrejection` loggano errori non gestiti via ADALog
- WebSocket reconnection UI: banner giallo fisso in basso "Connessione persa" / "Errore di connessione" con auto-hide al riconnessione. Auto-rejoin conversation room dopo reconnect
- Service Worker cache versioning: cache name include versione app (`ada-cache-8.21.0`), strategia Stale-While-Revalidate per JS/CSS/HTML, endpoint `GET_VERSION` per notifica aggiornamenti
- Signed media URL cache nel frontend con pre-sign asincrono e fallback token

## v8.20.1

### Bugfix da code review
- Fix: voice upload usa raw `fetch` invece di `fetchApi` (evita auto-abort 30s del global spinner)
- Fix: `_commRemoveFile` aggiorna correttamente l'hint AI allegato quando si rimuovono file
- Fix: emoji picker inserisce alla posizione 0 del cursore (prima falliva perche 0 e falsy)
- Fix: cancellazione registrazione vocale ora rilascia correttamente il microfono (stop media stream tracks)
- Fix: stringa `ADA_RELEASE_NOTES` aggiornata al contenuto v8.20.0
- Cleanup: rimosso codice morto `SUPPORTED_AI_MIMES` / `isAiSupportedMime` dal backend (mai utilizzato)

## v8.20.0

### Bug Fix Rapidi (PR 1)
- Filtro catalogo: nuove opzioni "In cache" e "Solo online" per filtrare prodotti per stato immagine
- Promo refresh: al cambio pet nella pagina Dati Pet la card promo si aggiorna automaticamente
- Pulsante "Analisi raccomandazione" in modalita debug per verificare dati pet usati nel matching promo

### Pet Owner/Vet Fix (PR 2)
- Il proprietario puo ora modificare il Vet Esterno (referral) dal form modifica pet
- I dropdown Proprietario e Vet Esterno si aggiornano correttamente dopo il salvataggio
- Il generatore dati test usa polling con retry per attendere il caricamento asincrono dei dropdown

### Global Spinner (PR 3)
- Banner animato "Il server sta rispondendo..." dopo 5 secondi di attesa API
- Auto-abort dopo 30 secondi con banner di errore "Il server non risponde"
- Banner errore di connessione per problemi di rete
- Skip automatico per chiamate che gestiscono il proprio timeout

### ADA Chatbot Contesto Completo (PR 4)
- Backend: cronologia conversazione estesa a 50 messaggi (da 10) per contesto AI piu ricco
- Backend: oggetto della conversazione incluso nel system prompt OpenAI
- Backend: dati stile di vita del pet (ambiente, attivita, dieta, patologie, farmaci) inclusi nel contesto AI
- Frontend: hint visivo "ADA analizzerà questo documento" / "ADA potrebbe non riuscire..." per allegati in chat AI

### Emoji Picker (PR 5)
- Pulsante emoji nella barra di input messaggi
- Popover nativo con 6 categorie: Animali, Faccine, Gesti, Salute, Cibo, Altro
- Inserimento emoji alla posizione del cursore nella textarea
- Chiusura automatica al click esterno

### Messaggi Vocali e Chiamate (PR 6)
- Pulsante microfono per registrazione messaggi vocali (webm/opus, max 3 minuti)
- Timer visivo durante la registrazione con feedback nella textarea
- Invio automatico del messaggio vocale al termine della registrazione
- Pulsanti chiamata audio e videochiamata nell'header delle conversazioni umane

## v8.19.0

### Gestione Immagini Catalogo (FEATURE 1)
- Backend: nuovo endpoint `POST /api/admin/:tenantId/promo-items/scrape-images` — scraping multi-strategia (Open Graph, Twitter card, Schema.org, euristica immagini, fallback AI con GPT-4o-mini)
- Backend: nuovo endpoint `POST /api/admin/:tenantId/promo-items/:itemId/cache-from-url` — cache immagine da URL con validazione MIME e hash SHA-256
- Backend: endpoint `cache-images` ora accetta filtro opzionale `item_ids`
- Frontend: helper centralizzato `getProductImageUrl(item)` per risoluzione immagine (cached > URL > placeholder)
- Frontend: pulsante "Gestione Immagini" nella toolbar catalogo con due modalita:
  - Cache batch da URL per prodotti filtrati con progress
  - Scraping + wizard di confronto side-by-side vecchia/nuova immagine con accetta/salta/URL manuale
- UI: icone stato immagine nel catalogo (verde = cached, arancione = solo URL, grigio = nessuna)
- Filtro immagini aggiornato per considerare anche immagini cached

### Flag Debug Multi-Servizio (FEATURE 2)
- Nuovo toggle "Visualizza sempre multi-servizio" nella pagina Debug
- Quando attivo, mostra Nutrizione e Assicurazione per tutti i ruoli (bypass role check)
- Persistenza in localStorage

### Allegati Multipli nei Messaggi (FEATURE 3)
- Supporto selezione multipla file nel pannello messaggi e nel form nuova conversazione
- Preview multi-file con possibilita di rimuovere singoli file
- Upload sequenziale: ogni file diventa un messaggio separato (pattern WhatsApp)
- Placeholder dinamico con conteggio allegati

### Dropdown Seed Engine (FEATURE 4)
- Le dropdown Proprietario e Vet Esterno nel Seed Engine ora si popolano automaticamente alla navigazione
- Applicato `makeFilterableSelect` per ricerca a sottostringa

### Revisione UI/UX Pet Owner/Vet Ext (FEATURE 5)
- Fix `makeFilterableSelect`: l'input di ricerca ora rispetta lo stato `disabled` della select tramite MutationObserver
- Auto-assegnazione proprietario per ruolo owner nella creazione pet
- Refresh automatico dati pet dopo modifica per garantire consistenza tra le tre viste
- Icone lucchetto sui label Proprietario e Vet Esterno nella vista Dati Pet (sola lettura)

## v8.18.0

### CI: Nightly/Weekly test infrastructure upgrade
- CI: **Nightly deep tests** (`nightly-deep.yml`) — esegue ogni notte i test `@smoke` + `@nightly` + `@stress` su main e dev con server locale, notifica Telegram e gestione issue automatica
- CI: **Weekly full tests** (`weekly-full.yml`) — ogni domenica esegue TUTTI i test (`@deep`, `@stress`, `@long`) su main e dev, con tracking promozione automatica dei test stabili
- CI: **Auto-fix con Claude Code** (`nightly-autofix.yml`) — se il nightly deep fallisce su dev, Claude Code analizza i fallimenti e crea una PR di fix automatica con notifica Telegram
- CI: **Test promotion tracking** — sistema automatico che traccia la stabilita dei test `@deep` e propone la promozione a `@nightly` dopo 4 pass consecutivi settimanali
- CI: `run-tests.js` evoluto con flag `--nightly` e `--weekly`; nuovi script npm `test:ci:nightly` e `test:ci:weekly`
- Test: 10 test file `@deep` stabili taggati con `@nightly` (77 test aggiuntivi nel nightly)

### Feat: Seed Engine — dropdown Proprietario e Vet Esterno
- Feat: **Dropdown Owner/Vet Ext opzionali nel Seed Engine** — permettono di forzare l'assegnazione dei pet generati a un proprietario e/o vet esterno specifico; se "Casuale", assegnazione random
- Backend: `seed.service.js` accetta `targetOwnerUserId` e `targetVetExtUserId` con fallback random

### Feat/Fix: Messaggistica
- Feat: **Allegato nel primo messaggio di una nuova conversazione** — aggiunto input file con anteprima nella form "Nuova conversazione"
- Fix: **Pulsante Test nascosto per non-vet_ext** — il pulsante Test nella nuova conversazione appare solo per vet_ext che hanno il form referral
- Fix: **Allegato visibile al mittente dopo upload** — il bubble ottimistico viene re-renderizzato con i dati server (media_url) dopo l'upload
- Feat: **Placeholder dinamico** — dopo selezione allegato il placeholder cambia in "Allegato pronto per l'invio"

### Fix: Pet management
- Fix: **Dropdown Proprietario e Vet Esterno in sola lettura nella pagina Dati Pet** per tutti i ruoli; modificabili solo dalla finestra Modifica Pet per vet_int e super_admin
- Fix: Owner non forza piu `referring_vet_user_id` a null in creazione/modifica pet

### Refactor: rimozione ruolo deprecato "vet"
- Refactor: tutte le occorrenze di `"vet"` come ruolo sostituite con `"vet_int"` in backend e frontend (pets, nutrition, promo, communication, seed, config)
- Il middleware RBAC mantiene il fallback legacy `"vet"` → `"vet_int"` per token esistenti

## v8.17.5

### Fix: allegati non visibili nei messaggi
- Fix: **Allegati invisibili per il destinatario** — i tag HTML `<img>`, `<audio>`, `<video>` e `<a>` non possono inviare l'header `Authorization: Bearer`; il download endpoint restituiva 401 e `onerror` nascondeva l'elemento. Ora il token JWT viene aggiunto come query parameter `?token=` all'URL di download, e il backend accetta l'autenticazione anche da query string

## v8.17.4

### Fix messaggistica: referto, vet_ext, destinatari
- Fix: **Referto vuoto per destinatario** — il download URL del referto ora estrae correttamente l'attachment_id (secondo UUID nel media_url, non il primo che era il conversation_id); il messaggio di testo viene mostrato separatamente dal link del file
- Fix: **vet_ext non riesce a creare conversazione** — il pet_id viene ora incluso solo se il pet è nella lista del vet_ext; se il backend rifiuta il pet, la creazione viene ritentata senza pet_id; messaggi di errore specifici per `pet_not_assigned_to_you` e `referral_form_required`
- Feat: **vet_int può messaggiare vet_ext** — aggiunta opzione "Veterinario Esterno" nel menu destinatari per vet_int e super_admin, che permette di selezionare e inviare messaggi ai vet_ext

## v8.17.3

### Bugfix batch 2 (8 issues from v8.17.0 audit)
- Fix: **Ruoli vet_int/vet_ext non attivabili** — aggiunto vet_int/vet_ext a validRoles in setActiveRoles e ROLE_PERMISSIONS con pagine/azioni appropriate; showVet in applyRoleUI ora riconosce vet_int e vet_ext (BUG 2 CRITICO)
- Fix: **Referto vuoto e sender "Utente"** — l'upload referto ora usa il contenuto del messaggio (non il filename) come testo; aggiunto sender_name, sender_role e attachment_id al messaggio WebSocket; notifica al destinatario via new_message_notification (BUG 5 CRITICO)
- Fix: **Pet Proprietario/Vet inconsistente** — label "Proprietario *" diventa "Proprietario" (non obbligatorio), "Veterinario referente" diventa "Vet Esterno (referral)"; dropdown sempre read-only in Dati Pet; vet_ext non puo creare/modificare/eliminare pet (BUG 1 ALTO)
- Fix: **super_admin "Elimina TUTTI i miei pet"** — wipeAllUserPets ora accetta callerRole; super_admin cancella TUTTI i pet, altri ruoli solo i propri (BUG 8 ALTO)
- Fix: **Promo un solo tenant** — Centro Privacy ora mostra tutti i tenant attivi in tutti i service type (promo, nutrition, insurance), non solo quelli con prodotti pubblicati (BUG 4 MEDIO)
- Fix: **Tenant non de-assegnabile** — aggiunto pulsante × per rimuovere un tenant da un utente nella Gestione Utenti con chiamata DELETE API (BUG 3 MEDIO)
- Fix: **Test button posizione e auto-fill** — pulsante TEST spostato nella riga Crea/Annulla; auto-fill "Primo messaggio" con testo specifico per tipo di form (BUG 6 BASSO)
- Feat: **Pet species nei messaggi** — nome e specie del pet visibili nella lista conversazioni e nell'header chat; backend restituisce pet_species nelle query GET conversations e GET messages (BUG 7 BASSO)

## v8.17.2

### Bugfix batch (20 issues from v8.17.0 audit)
- Fix: **Messaggio doppio** — il WebSocket handler ora ignora i propri messaggi (già renderizzati ottimisticamente), eliminando la duplicazione (BUG 8)
- Fix: **Ruoli vet_int/vet_ext non validi** — aggiunto vet_int e vet_ext a validRoles in dashboard.routes.js per creazione/modifica utenti (BUG 3)
- Fix: **debugEnabled → debugLogEnabled** — il pulsante TEST ora appare correttamente quando Debug è attivo (BUG 13)
- Fix: **ADA non risponde al primo messaggio** — quando si crea una conversazione AI con messaggio iniziale, ADA genera subito una risposta (BUG 17)
- Fix: **Conversazione chiusa appare aperta** — il backend GET messages ora restituisce status, subject, referral_form, pet_name e triage_level (BUG 12)
- Fix: **Form referral non visibile** — il referral_form viene ora parsato da stringa JSON e visualizzato correttamente (BUG 14)
- Fix: **Referto non apribile dal destinatario** — le query di accesso documenti ora verificano owner_user_id, pet owner e referring_vet (BUG 11)
- Fix: **Filtro utenti perde focus** — separato rendering tabella da rendering pagina in Gestione Utenti (BUG 4)
- Fix: **Dropdown Proprietario/Vet vuoti in Dati Pet** — loadPetIntoMainFields ora carica i dropdown (BUG 2)
- Fix: **Owner non può eliminare pet** — nascosti dropdown owner/vet per ruolo owner, forzato ownerUserId=null (BUG 1)
- Fix: **Input conversazione chiusa** — textarea disabilitata con placeholder informativo (BUG 9)
- Fix: **Badge Messaggi non appare** — socket e polling inizializzati all'avvio app, polling ridotto a 30s (BUG 10)
- Fix: **Super admin role selector** — rimosso checkbox Veterinario, aggiornato cbMap per vet_int/vet_ext, roleToggle nascosto per tutti (BUG 5)
- Fix: **Account prima sezione** — spostato consent banner dopo Account card in Impostazioni (BUG 6)
- Feat: **Dropdown filtrabili** — nuova utility makeFilterableSelect per dropdown utenti con ricerca testuale (BUG 16)
- Feat: **Label ruolo nelle liste** — formatUserNameWithRole mostra "(Vet. interno)" o "(Vet. esterno)" accanto ai nomi (BUG 18)
- Fix: **Campo Animale rimosso** — il form nuova conversazione usa automaticamente il pet selezionato (BUG 15)
- Nota: BUG 7 (consent flags) è un problema di dati DB (solo un tenant con prodotti), non un bug del codice
- Nota: BUG 19 (preview limit) e BUG 20 (form obbligatorio vet_ext) erano già risolti

## v8.17.1

### Bugfix pet CRUD per vet, edit pet dropdown, gestione utenti migliorata
- Fix: **DELETE/PATCH pets per ruoli vet** — le operazioni di modifica e cancellazione pet ora funzionano correttamente per vet_int, vet_ext e super_admin (prima il backend filtrava solo per owner_user_id, causando 404 per i vet)
- Fix: **Modifica Pet — Proprietario dropdown** — il campo Proprietario nel modal "Modifica Pet" ora è una dropdown list (era un campo testo), con aggiunta della dropdown "Vet Esterno (referral)"
- Fix: **Gestione Utenti — ruoli vet_int/vet_ext** — nel form "Nuovo Utente", la voce "Vet (Veterinario)" è stata sostituita con "Vet Int (Veterinario Interno)" e "Vet Ext (Veterinario Esterno)"
- Feat: **Gestione Utenti — filtri** — aggiunta ricerca per testo (nome/email) e filtro per ruolo nella pagina Gestione Utenti

## v8.17.0

### Ruoli vet_int/vet_ext, form sintetici referenti, UX messaggi
- Feat: **Ruoli vet_int e vet_ext** — il ruolo `vet` viene sostituito da `vet_int` (veterinario interno) e `vet_ext` (veterinario esterno/referente); SQL migration 018 migra automaticamente i vet esistenti a vet_int; RBAC middleware aggiornato per backward compatibility
- Feat: **Form sintetici per vet_ext** — 5 tipologie di form clinici (diagnostica immagini, chirurgia ortopedica, cardiologia, endoscopia/gastro, dermatologia) obbligatori alla creazione di una conversazione da parte di un vet_ext; il form compilato e visibile in cima alla conversazione per entrambi gli interlocutori
- Feat: **Filtro stato conversazioni** — nuovo dropdown Tutte/Aperte/Chiuse nella lista conversazioni; ogni card mostra attributo data-status
- Feat: **Chiudi/Riapri conversazione** — pulsanti nella lista e nell'header della conversazione; backend emette evento WebSocket `conversation_status_changed`; invio messaggi bloccato su conversazioni chiuse
- Feat: **Primo messaggio obbligatorio** — la creazione di una conversazione umana richiede un messaggio iniziale; il backend lo inserisce come primo messaggio della conversazione
- Feat: **Nome completo nella lista conversazioni** — formato "Nome Cognome (Ruolo)" con JOINs lato backend per display_name
- Feat: **Follow-up chips AI intelligenti** — domande chiuse (si/no) mostrano pulsanti "Si"/"No", domande aperte pre-popolano l'input con la domanda
- Feat: **Proprietario e Vet referente nei Dati Pet** — campi Proprietario e Veterinario referente diventano dropdown; nuove API `/api/communication/owners` e `/api/communication/vet-exts`
- Feat: **Anteprima prodotto completa** — la preview ora carica tutti i prodotti (non solo i 20 della pagina corrente) prima della navigazione
- Feat: **Novita versione dinamiche** — le release notes nella pagina Info sono ora dinamiche da config.js
- Feat: **Super admin role selector** — aggiunti checkbox vet_int e vet_ext; ruolo attivo nascosto per tutti tranne super_admin
- Fix: **Tenant flag nel Centro Privacy** — corretto bug che mostrava "Partner" invece del nome del tenant; il parsing ora flattena correttamente svc.tenants[]
- Fix: **Sender name/role nei messaggi real-time** — i messaggi via Socket.io ora includono sender_name e sender_role dal DB
- Fix: **ADA prompt rafforzato** — regole piu forti per non menzionare il veterinario nei triage verdi
- Feat: **Seed engine aggiornato** — i pet seed vengono ora assegnati a owner e vet_ext random dal DB
- SQL: Migration `018_vet_roles_and_referral.sql` — migra vet->vet_int, aggiunge referring_vet_user_id a pets, referral_form JSONB a conversations

## v8.16.2

### Cleanup pet nei test e2e
- Fix: **I test deep/stress/long ora puliscono i pet creati** — aggiunta helper `deleteAllUserPets(page)` che, al termine di ogni test, elimina via API tutti i pet dell'utente di test corrente; previene l'accumulo di centinaia di pet orfani nei DB deployed (dev/prod) dopo i nightly run
- Aggiunto `test.afterEach` con cleanup in: `deep.pet-lifecycle`, `deep.performance`, `deep.security`, `long.full-visit-workflow`, `stress.large-data`, `stress.rapid-navigation`

## v8.16.1

### Nightly CI (REAL) stabilizzazione
- Fix: **Rate limiting su backend deployed** — Playwright ora usa 1 worker in modalità deployed (era 2) per evitare di superare il rate limit di 60 req/min del backend; il login helper ha retry con backoff esponenziale (2s→4s→8s) fino a 3 tentativi in modalità deployed
- Fix: **Audio upload skip in deployed mode** — I test di regressione audio (`regression.audio-upload-20s`, `regression.audio-upload-100s`) vengono ora saltati in modalità DEPLOYED perché richiedono la trascrizione OpenAI disponibile solo in MOCK mode
- Fix: **Browser crash flaky** — La riduzione a 1 worker elimina la contesa di risorse che causava "browser has been closed" e "browserContext.close: Test ended" sui test super_admin

## v8.16.0

### Badge messaggi non letti in tempo reale
- Il socket WebSocket viene ora connesso all'avvio dell'app (non solo quando si entra nella pagina Messaggi)
- Nuovo evento `new_message_notification` emesso alla room `user:{recipientId}` per raggiungere il destinatario ovunque si trovi nell'app
- Il client ascolta `new_message_notification` e aggiorna il badge nel menu laterale in tempo reale
- Polling obbligatorio ogni 60 secondi come fallback per garantire l'aggiornamento del badge anche con socket instabili
- Il badge si aggiorna immediatamente al primo caricamento dell'app

### service_type multi-servizio (TEXT → TEXT[])
- Migration 017: `service_type` convertito da `TEXT` a `TEXT[]` (array PostgreSQL)
- Un prodotto può ora appartenere a più servizi (es. `{promo, nutrition}`)
- I prodotti food/supplement pubblicati vengono automaticamente migrati con `{promo, nutrition}`
- Backend: tutte le query aggiornate per usare `ANY()` e `unnest()` dove necessario
- Frontend: badge multipli nella tabella catalogo, filtro compatibile con array, CSV import/export con separatore `|`
- Seed e insurance: query aggiornate per array

## v8.15.12 (2026-02-12)
- Feat: **Image cache BYTEA su promo_items** — nuove colonne `image_cached`, `image_cached_mime`, `image_cached_at`, `image_cached_hash` per resilienza URL esterni; endpoint pubblico `GET /api/promo-items/:id/image` serve da cache DB o redirect a URL
- Feat: **Upload/delete/bulk-cache immagini** — 3 route admin per caricare, eliminare e cachare in bulk le immagini dei prodotti da URL esterni
- Feat: **Premio assicurativo dinamico** — `POST /api/insurance/quote/:petId` ora legge `base_premium_monthly` e dati piano dal `promo_item` selezionato; `coverage_data` include provider, tier, prevenzione, addons
- Feat: **Seed demo con piano dal catalogo** — Phase 12 del seed engine ora cerca il miglior piano insurance pubblicato e usa il suo premio base invece del valore hardcoded
- Feat: **Seed Santevet** — 5 piani assicurativi reali (Light, Confort, Premium Cane, Premium Gatto, Cat Indoor) in `santevet-insurance-seed.json`; script `seed-insurance.js` e route `POST /api/seed/insurance/load-plans`
- Feat: **Auto-cache immagini** — durante URL validation e seed import, le immagini vengono automaticamente scaricate e cachate nel DB
- Fix: **SELECT * su promo_items eliminato** — dopo l'aggiunta della colonna BYTEA, tutte le query di lista usano colonne esplicite per evitare di caricare blob in memoria
- Feat: **Frontend usa endpoint immagine resiliente** — `app-promo.js` ora usa `/api/promo-items/:id/image` per le immagini dei prodotti, con fallback a placeholder
- SQL: Migration `016_promo_image_cache.sql` — aggiunge colonne BYTEA + metadata per image cache su `promo_items`

## v8.15.11 (2026-02-12)
- Fix: **Risposta ADA non visibile** — il frontend cercava `data.ai_message` ma il backend restituisce `data.assistant_message`; aggiunto al fallback chain, ora la risposta AI appare immediatamente nella chat
- Fix: **Centro Privacy flag non persistenti** — i toggle Promozioni/Nutrizione/Assicurazione erano sempre OFF perché il frontend si aspettava un array `consents[]` ma il backend restituisce un oggetto piatto; aggiunto parsing per entrambi i formati (flat + array)
- Fix: **Filtro catalogo con paginazione** — il server troncava a 100 item max, impedendo al filtro client-side di operare sull'intero catalogo; limite aumentato a 5000
- Fix: **Pulsante Audit Log nella sezione Debug** — spostato dal card separato al gruppo pulsanti sistema, nell'ordine: Consumo API, Metriche API, Audit Log, Scarica/Cancella ADA.log
- Fix: **Identificazione mittente nei messaggi** — ora tutti i messaggi (anche i propri) mostrano "Nome (Ruolo)" es. "Paolo Esposito (Veterinario)"; aggiunto sender_name e sender_role anche nel render ottimistico
- Fix: **ADA troppo insistente nel suggerire il veterinario** — rimossa regola "Raccomanda SEMPRE la consultazione veterinaria"; ADA ora suggerisce la visita SOLO con triage giallo/rosso; per triage verde il disclaimer permanente è sufficiente

## v8.15.10 (2026-02-12)
- Feat: **WebSocket delivery events con persistenza DB** — gli eventi `message_delivered`, `conversation_seen` e `message_read` ora aggiornano il database (`comm_messages.delivery_status`, `conversation_seen` table) invece di essere solo broadcast; lo stato di consegna (✓/✓✓/✓✓ blu) riflette lo stato reale persistito
- Feat: **Aggiornamento `last_seen_at` su disconnect** — quando un utente si disconnette dal WebSocket, `users.last_seen_at` viene aggiornato per tracciare l'ultimo accesso
- Feat: **Coda messaggi offline** — se l'utente è offline durante l'invio di un messaggio, il messaggio viene salvato in IndexedDB (`ADA_COMM_QUEUE`) e inviato automaticamente al ritorno della connessione; icona ⏳ per messaggi in coda
- Feat: **Allegati file inline** — pulsante 📎 nella chat per inviare immagini, PDF, audio e video (max 10 MB); preview file prima dell'invio; rendering inline nelle bolle (img, audio player, video player, link download per PDF/file)
- Feat: **Download allegati da DB** — nuovo endpoint `GET /api/communication/attachments/:id/download` che serve il file binario dalla colonna `file_data BYTEA` (Render ha FS effimero); upload ora salva anche `file_data` nel DB
- SQL: Migration `015_comm_attachments_data.sql` — aggiunge colonna `file_data BYTEA` a `comm_attachments`

## v8.15.9 (2026-02-12)
- Fix: Creazione conversazione ADA falliva con 403 — `INSERT INTO communication_settings` ora imposta `chatbot_enabled = true` di default, evitando che `requireAiEnabled()` blocchi la creazione AI dopo la visita alle Impostazioni
- Fix: Badge non letti non si azzerava — aggiunta route `POST /api/communication/conversations/:id/read` che marca tutti i messaggi della conversazione come letti e aggiorna `conversation_seen`
- Fix: Nome mittente generico "Utente" nei messaggi — `GET /conversations/:id/messages` ora fa JOIN con tabella `users` per restituire `sender_name` e `sender_role`; frontend formatta come "Nome (Veterinario)" o "Nome (Proprietario)"
- Fix: Conversazione owner→vet senza pet falliva con errore 400 — rimosso il check `pet_id_required_for_human` che bloccava conversazioni umane senza pet associato (il DB accetta NULL)
- Fix: Pet non visibili a vet/owner — `GET /api/pets` e `GET /api/pets/:pet_id` ora restituiscono tutti i pet per `vet` e `super_admin`, filtrano per `owner_user_id` solo per `owner`

## v8.15.8 (2026-02-12)
- Feat: **Messaging v2 Unified** — sistema messaggistica unificato WhatsApp-like che fonde chat umana (vet↔owner) e chatbot AI ADA in un'unica interfaccia
- Feat: Nuova pagina conversazione unificata con lista mista (AI + umano), avatar, badge triage, stato consegna (✓/✓✓/✓✓ blu)
- Feat: ADA come utente virtuale (`ada-assistant`) — conversazioni AI con triage (green/yellow/red), follow-up chips, banner EU AI Act, spinner "ADA sta pensando..."
- Feat: Form "Nuova conversazione" unificato con selettore destinatario (🤖 ADA, 👨‍⚕️ Veterinario, 🧑 Proprietario), pet opzionale, oggetto
- Feat: Separatori data tra messaggi (Oggi/Ieri/data completa), ricerca conversazioni client-side
- Feat: Reply-to per chat umane con barra preview e riferimento nel messaggio
- Feat: Soft delete messaggi propri (human chat) con UI "Questo messaggio è stato eliminato"
- Feat: Web Push notifications con VAPID — subscribe/unsubscribe, preferenze notifica, quiet hours, handler push/notificationclick nel service worker
- Feat: Sezione "Conversazioni relative a questo paziente" nella pagina Archivio Sanitario
- SQL: Migration 014_messaging_v2 — ALTER conversations (pet_id nullable, recipient_type, triage_level, message_count), ALTER comm_messages (delivery_status, reply_to, soft delete, ai_role, triage, follow_up_questions), nuove tabelle push_subscriptions/notification_preferences/conversation_seen, migrazione dati da chat_sessions/chat_messages
- Backend: `push.routes.js` nuovo — VAPID key, subscribe, unsubscribe, preferences, sendPushToUser()
- Backend: `communication.routes.js` riscritto v2 — integrata logica AI chatbot (OpenAI, triage parsing, model upgrade), supporto recipient_type ai/human, soft delete, delivery status, backward-compatible chatbot endpoints
- Rimosso: pagina chatbot separata (`page-chatbot`), nav item "La tua assistente ADA", `app-chatbot.js` script tag
- Rimosso: 'chatbot' da pagine proprietario e super_admin (ora integrato in communication)

## v8.15.7 (2026-02-12)
- UI: Rimosso bottone "Ricarica" dalla sidebar (tutte le role)
- Feat: Nuova pagina hub "Gestione" per super_admin — consolida 5 voci sidebar (Gestione Utenti, Gestione Tenant, Policies, Tag Dictionary, Fonti Tips) in una pagina con pulsanti
- UI: Audit Log spostato nella pagina Debug (visibile solo a super_admin)
- Fix: Filtri catalogo (priority, image, ext_desc, category, species) ora forzano reload completo da API invece di re-render parziale — risolve bug con dati incompleti quando si era su pagina 2+
- Fix: Preview catalogo capped a 1000 prodotti con indicatore conteggio totale
- Fix: Chatbot "Nuova conversazione" — aggiunto fallback `getCurrentPetId()` se nessun pet selezionato, e fix parsing `session_id` dalla risposta backend
- UI: Pagina acquisto simulata ridisegnata con layout e-commerce moderno (immagine hero, card descrizione, banner disclaimer discreto)
- Text: "Consigliato per il tuo pet" rinominato in "Consigliato per il tuo amico pet" (4 file)

## v8.15.6 (2026-02-12)
- Fix: Test login token caching — cached JWT tokens in-memory per email so only the first login per role hits the API; subsequent logins inject the token via `addInitScript` (zero API calls), avoiding production rate limiter (60 req/min) failures when running the full 216-test suite

## v8.15.5 (2026-02-12)
- Feat: Eliminati 8 file test sync obsoleti: `smoke.coalescing`, `smoke.data-sync`, `smoke.pets-sync`, `smoke.pull-sync`, `smoke.sync-conflict`, `stress.concurrent-sync`, `deep.pwa-offline`, `smoke.pet-crud`
- Fix: Helpers test (`api-mocks`, `pages`, `test-data`) — sync functions convertite in no-op per compatibilità con test `@deep`/`@stress`
- Fix: Rimosso script `test:sync` da `package.json`, rimosso policy check POL-06 (già non necessario)
- Rimozione sync offline completata (PR 6/6)

## v8.15.4 (2026-02-12)
- Feat: Rimossi file route sync backend: `sync.routes.js` (196 righe) e `pets.sync.routes.js` (232 righe)
- Fix: `server.js` — rimossi import e mounting delle route sync, rimosso JSON limit 50MB per sync push
- Rimozione sync offline (PR 5/6)

## v8.15.3 (2026-02-12)
- Feat: Eliminati 5 file sync obsoleti: `sync-engine.js` (1094 righe), `pets-sync-step4.js` (266), `pets-sync-bootstrap.js` (113), `pets-sync-merge.js` (136), `pets-coalesce.js` (102) — totale ~1711 righe rimosse
- Fix: `index.html` — rimossi 5 script tag sync, rinominato "Sincronizza" → "Ricarica" nella sidebar, rimosso bottone "Diagnostica Sync" dalle impostazioni
- Fix: `app-core.js` — rimossa funzione `showSyncDiagnostics()` e variabile `_editPetSyncPaused`
- Fix: `sw.js` — rimossi 5 file sync da `STATIC_ASSETS`
- Fix: `AGENTS.md` — aggiornata sezione architettura (rimosso sync-engine da moduli, aggiornata sezione Sync pets e Documenti)
- Rimozione sync offline (PR 4/6)

## v8.15.2 (2026-02-12)
- Feat: `app-documents.js` riscritto in modalità online-only — rimosso completamente IndexedDB (`ADA_Documents`), offline upload queue, delete outbox, pull sync; documenti ora letti/scritti esclusivamente via API REST (`GET/POST/DELETE /api/documents`); `renderDocumentsInHistory()` e `openDocument()` ora fetch da server; `getDocumentsForPet()` e `getDocumentById()` ora fetch API; upload diretto senza cache locale; delete senza outbox; AI read/explain senza persistenza locale dei risultati
- Riduzione codice: da 1633 a 958 righe (-41%)
- Rimozione sync offline documenti (PR 3/6)

## v8.15.1 (2026-02-12)
- Feat: `app-pets.js` riscritto in modalità online-only — rimosso completamente IndexedDB (`ADA_Pets`), outbox, push/pull sync; tutti i CRUD ora via API REST dirette (`GET/POST/PATCH/DELETE /api/pets`); pets mantenuti in-memory (`petsCache`) con normalizzazione `_normalizePetForUI()` da formato server (SQL + extra_data JSONB) a formato UI; `getAllPets()` e `getPetById()` mantenuti async per retrocompatibilità; `saveCurrentPet()`, `saveNewPet()`, `deleteCurrentPet()`, `saveData()`, `saveDiary()` riscritti per chiamare API REST; `initMultiPetSystem()` semplificato (fetch + rebuild UI); `refreshPetsFromServer()` sostituisce push+pull con semplice re-fetch; `ADA_PetsSync` mantenuto come shim di compatibilità per `app-seed.js`
- Riduzione codice: da 1664 a 736 righe (-56%)
- Rimozione sync offline (PR 2/6)

## v8.15.0 (2026-02-12)
- Feat: Backend `pets.routes.js` — `POST /api/pets` e `PATCH /api/pets/:pet_id` ora supportano `extra_data` JSONB per campi rich (vitals_data, medications, history_data, lifestyle, photos, photos_count, owner_name, owner_phone, microchip, visit_date, owner_diary); il PATCH esegue merge incrementale (non sovrascrittura totale) dei campi rich esistenti
- Preparazione alla rimozione sync offline (PR 1/6)

## v8.14.3 (2026-02-12)
- Fix (critico): Messaggi — vet crea conversazione con owner ma l'owner non la vede; `owner_override_id` veniva ignorato perché il backend validava con `isValidUuid()` ma gli user ID sono stringhe TEXT (es. `test-owner-001`), non UUID; rimosso il check UUID e usato validazione stringa generica

## v8.14.2 (2026-02-12)
- Fix (critico): Messaggi — invio messaggio falliva sempre con errore 400; il frontend inviava `{ body: text }` ma il backend richiede `{ content: text }`
- Fix: Messaggi — bolle chat vuote; `_commRenderBubble` leggeva `msg.body` ma il DB restituisce `msg.content`; aggiunto fallback `msg.content || msg.body || msg.text`
- Fix: Messaggi — tipo messaggio non riconosciuto; `_commRenderBubble` leggeva `msg.message_type` ma il DB restituisce `msg.type`
- Fix: Messaggi — lista conversazioni arricchita; la query backend ora include JOIN con pets (pet_name), ultimo messaggio (last_message_text, last_message_at) e conteggio non letti (unread_count) via LATERAL subquery

## v8.14.1 (2026-02-12)
- Fix: Tenant disabilitati non più visibili nei dropdown — filtro `status === 'active'` applicato in 4 punti: selettore dashboard, selettore pagina, prompt assegnazione tenant utente, auto-select catalogo
- Fix: Conversazioni — "Impossibile caricare i messaggi" risolto; la lista conversazioni usava `c.id` invece di `c.conversation_id` (nome colonna DB), causando `onclick="openConversation('undefined')"`

## v8.14.0 (2026-02-12)
- Feat: Test suite expansion — da ~57 a ~278 test E2E (221 nuovi), organizzati in 5 tier: smoke, regression, deep, stress, long
- Feat: 24 nuovi file `deep.*.spec.ts` coprono navigazione, pet lifecycle, SOAP workflow, recording, documenti, owner flows, admin dashboard, settings, communication, chatbot, nutrition, insurance, consent center, super admin, seed engine, diary/Q&A, foto/vitali/farmaci, tips, security, error handling, performance, PWA/offline, responsive UI, accessibilità
- Feat: 3 nuovi file `stress.*.spec.ts` — sync concorrente, dati grandi, navigazione rapida
- Feat: 1 nuovo file `long.full-visit-workflow.spec.ts` — workflow visita completo E2E (24 step)
- Feat: 4 nuovi helper centralizzati: `api-mocks.ts`, `pages.ts`, `test-data.ts`, `perf.ts`
- Feat: Fixture test: SOAP sample JSON, trascrizione 10k parole, PDF/JPG/PNG/EXE test, CSV valido e malformato, PDF oversized 15MB
- Feat: `run-tests.js` aggiornato — tier `@deep` e `@stress` nel nightly (con `--long`); regression grep esclude i nuovi tag
- Feat: `playwright.config.ts` — nuovo progetto `chromium-deep` con timeout 180s per deep/stress
- Feat: `package.json` — nuovi script `test:deep`, `test:stress`, `test:nightly`, `test:full`
- Costo OpenAI: ZERO — tutti i nuovi test usano mock (blockOpenAI + api-mocks centralizzati)

## v8.13.0 (2026-02-11)
- Fix: Rimosso pulsante "Draft Tutti" dal Report Validazione URL in admin (non funzionante); i singoli pulsanti "Draft" per prodotto restano attivi
- Fix: Seed Engine — "Preferenze alimentari" non copia più le patologie da "Condizioni note"; inizializzazione a stringa vuota, estesa la mappatura patologia→dieta con enteropatie, EPI, epatopatie, diabete, allergie alimentari, cardiopatie, dermatiti
- Fix: Promo card — immagine prodotto ora `object-fit:contain` (non tagliata), testo esplicativo completo (rimosso troncamento 200 char), beneficio e correlazione clinica visibili direttamente nella card, pulsante "Perché vedi questo?" sostituito con "Chiudi il suggerimento", pulsante "Acquista" mostra pagina simulata d'acquisto, pulsante "Non mi interessa" mostra popup feedback prima di chiudere
- Fix (critico): Messaggi — endpoint `GET /api/communication/users` usava `base_role='veterinario'/'proprietario'` ma il DB contiene `'vet'/'owner'`, causando "Nessun destinatario trovato" sempre; corretto mapping diretto, aggiunto filtro esclusione utente corrente
- Fix: Messaggi — vet ora può selezionare sia "Veterinario" sia "Proprietario" come tipo destinatario; owner non vede più il campo tipo e carica automaticamente i veterinari
- Fix: Rinominato "Assistente AI" → "La tua assistente ADA" in 3 punti dell'interfaccia (sidebar, impostazioni, header chatbot)
- Fix: Pulsante "Nuova conversazione" — `navigateToPage` ora è async con `await` su `initCommunication`; aggiunto guard contro re-inizializzazione se il form è aperto; recovery automatico se `comm-new-form-area` non esiste nel DOM; binding click via `addEventListener` invece di `onclick` inline

## v8.12.1 (2026-02-11)
- Fix: Foto pet da Seed Engine non visibili su GitHub Pages — `_photoSrc()` ora prepone `API_BASE_URL` agli URL relativi `/api/...` che il backend Seed Engine salva nelle foto; su GitHub Pages il browser risolveva questi path contro il dominio frontend invece che contro il backend Render

## v8.12.0 (2026-02-11)
- Feat: Placeholder immagini animali — Seed Engine ora assegna foto PNG cartoon variegate (15 varianti per specie: Cane, Gatto, Coniglio) invece del singolo SVG deterministico; ogni pet riceve foto diverse senza duplicati
- Feat: Placeholder immagini prodotti — promo senza `image_url` mostrano ora un placeholder cartoon sacchetto pet food casuale (45 varianti); fallback a triplo livello: backend eligibility, backend mock, frontend `onerror`
- Feat: 90 immagini PNG placeholder aggiunte in `backend/src/seed-assets/placeholder-animali/` (45) e `placeholder-prodotti/` (45), servite via route statica `/api/seed-assets/` già esistente

## v8.11.0 (2026-02-11)
- Feat: Messaggi — "Nuova conversazione" ora mostra dropdown animale (da IndexedDB), tipo destinatario (Veterinario/Proprietario in base al ruolo) e destinatario (caricato dinamicamente da `GET /api/communication/users?role=vet|owner`); rimosso campo testo UUID
- Feat: Messaggi Backend — nuovo endpoint `GET /api/communication/users?role=vet|owner` per elencare utenti attivi per ruolo; `POST /api/communication/conversations` ora supporta `owner_override_id` per conversazioni avviate dal vet verso un proprietario
- Feat: Tips auto-refresh endpoint — `POST /api/tips-sources/auto-refresh` protetto da header `x-cron-secret`; rispetta `crawl_frequency` (weekly/monthly/quarterly/manual) per determinare le fonti scadute
- Feat: Tips — fonti senza `summary_it` (pre-elaborato) ora vengono escluse dalla generazione tips; indicatore visivo "Fonti pre-elaborate: X/Y" nel div `#tipsMeta`
- Feat: Tips — vincolo prompt 11 rafforzato: "Basa i consigli ESCLUSIVAMENTE sui contenuti pre-elaborati [...] NON inventare informazioni non presenti nei riassunti"
- Feat: Admin fonti — colonna "Ultimo agg. contenuto" (`content_changed_at`) visibile nella card di ogni fonte

## v8.10.4 (2026-02-11)
- Fix (grave): SOAP generazione referto — il backend (`server.js`) rimuoveva `response_format` dal payload OpenAI; senza direttiva `json_object`, GPT-4o restituiva JSON dentro code fences markdown (```json ... ```), causando `JSON.parse` error. Aggiunto `response_format` alla whitelist del sanitizedPayload
- Fix: Frontend SOAP — aggiunta funzione `stripMarkdownFences()` come safety net per rimuovere code fences markdown prima del `JSON.parse` in tutti e 3 i livelli di generazione (strict, fallback, ultra-fallback)
- Fix: Seed Engine — campo "Sesso" generato come "M"/"F" ma il frontend richiede "Maschio"/"Femmina"/"Maschio castrato"/"Femmina sterilizzata"; corretto in `seed.petgen.js` per generare valori italiani compatibili con il dropdown
- Fix: Seed Engine — campi "Stile di vita" vuoti dopo seed: chiave `environment` rinominata in `lifestyle` per matchare `setLifestyleData()`; valori attività ("moderato"→"medio"), dieta ("commerciale secco"→"secco"), ambiente ("appartamento"→"indoor") allineati ai `<select>` del frontend; `behaviorNotes`, `knownConditions`, `currentMeds`, `dietPreferences` convertiti da array a stringhe comma-separated come atteso dai campi `<input type="text">`
- Fix: "Segnala promo inappropriata" rinominato in "Segnala consiglio inappropriato" con stile aggiornato (sfondo giallo paglierino, font nero, spaziatura)

## v8.10.3 (2026-02-11)
- Fix (grave): Pull sync "pet fantasma" — `unwrapPetsPullResponse` ora usa deduplicazione "last wins": per ogni `pet_id`, solo l'ultima operazione cronologica viene applicata. Prima, upserts e deletes venivano separati in array distinti perdendo l'ordine cronologico; il frontend processava deletes prima di upserts, causando la riapparizione di pet già cancellati (118 changes → 10 phantom pets invece di 1)

## v8.10.2 (2026-02-11)
- Fix: Pet delete ora esegue push immediato al server (`pushOutboxIfOnline`) — prima il delete restava nell'outbox e non veniva inviato fino al sync manuale, causando "pet fantasma" che riapparivano dopo re-login
- Fix: `unwrapPetsPullResponse` — aggiunto recovery `JSON.parse` per record `pet_changes` doppio-serializzati (stringa JSON invece di oggetto JSONB); gestisce dati corrotti da seed engine pre-v8.10.0
- Feat: Wipe totale pet utente — nuovo endpoint `POST /api/seed/wipe` con `mode: 'all'` che elimina TUTTI i pet dell'utente autenticato (non solo quelli marcati `[seed]`), con insert `pet.delete` in `pet_changes` per sync frontend
- Feat: Pulsante "Elimina TUTTI i miei pet" nel pannello Seed Engine admin — con doppia conferma e pull sync automatico post-wipe
- Fix: Wipe seed ora esegue pull sync dopo completamento per aggiornare la UI

## v8.10.1 (2026-02-11)
- Fix: Foto seed `[object Object]` — `renderPhotos()` e `openPhotoFullscreen()` ora gestiscono sia stringhe URL (foto utente) che oggetti `{dataUrl, caption}` (foto seed) tramite helper `_photoSrc()`
- Fix: Seed Engine Phase 9 — rimosso `JSON.stringify(extraData)` nell'UPDATE `pets.extra_data`: il driver `pg` serializza automaticamente oggetti JS come JSONB, coerente col pattern usato in `pets.routes.js`

## v8.10.0 (2026-02-11)
- Fix (grave): Seed Engine — doppia serializzazione JSONB in `pet_changes.record`: rimosso `JSON.stringify()` su `ins.rows[0]` (Phase 3, riga 394), `upd.rows[0]` (Phase 9, riga 785) e Demo Mode (riga 1001). Il driver `pg` serializza automaticamente oggetti JS come JSONB; il `JSON.stringify` manuale causava una stringa dentro JSONB, che il frontend (`app-pets.js:35` `typeof ch.record === 'object'`) scartava silenziosamente con `continue`, risultando in `changesCount:0, upserts:0` dopo pull sync
- Feat: Seed Engine — contatori errori `petChangeErrors` (Phase 3) e `phase9ChangeErrors` (Phase 9) per tracciare insert falliti in `pet_changes`
- Feat: Seed Engine — query di verifica post-completamento: `COUNT pet_changes` per `seed-engine/ownerUserId` con log risultato
- Feat: Seed Engine — `job.stats` con `petsInserted`, `petChangeErrors`, `petChangesVerified` esposto in `getJobStatus()`
- Feat: Frontend Seed Engine — messaggio completamento mostra statistiche: "Completato! X pet creati, Y record sync verificati"

## v8.9.0 (2026-02-11)
- Fix (grave): Seed Engine — pet ora appaiono dopo completamento: delay 1.5s + await pull + retry dopo 3s + refresh esplicito UI (rebuildPetSelector, updateSelectedPetHeaders)
- Fix: "Draft Tutti" nel Report Validazione URL — parsing robusto via row ID (`tr[id^="url-row-"]`) invece di regex su onclick; toast di errore se tenantId e' null
- Fix: Upload audio lungo — timeout backpressure aumentato da 90s a 300s (5 min) per file 40+ minuti
- Feat: Tips auto-refresh — `scheduleTipsRefresh()` controlla ogni 6h fonti con last_crawled > 7 giorni e le ri-crawla automaticamente; `_crawlSource` refactored fuori dalla closure del router
- Feat: Tips prompt usa riassunti pre-elaborati — `_buildTipsPrompt()` include `summary_it` sotto ogni URL nelle fonti autorizzate; nuovo vincolo prompt "Basa i consigli sui contenuti pre-elaborati"
- Feat: Multi-ruolo super admin — checkboxes (vet/owner/admin/SA) al posto del dropdown nel Debug; `getActiveRoles()` e `setActiveRoles()` in config.js; `applyRoleUI()` mostra sidebar sections per TUTTI i ruoli attivi; `isPageAllowedForRole`/`isActionAllowedForRole` controllano tutti i ruoli; backward-compat completa per utenti non-super_admin

## v8.8.0 (2026-02-11)
- Fix: Filtro Priorita nel Catalogo Prodotti ora mostra tutti i valori 0-9 (prima solo 0-5)
- Fix: Filtro Specie nel Catalogo ora mostra tutte le specie (Cane, Gatto, Coniglio, Furetto, Uccello, Rettile, Tutte) — prima mostrava solo "Tutte" a causa di `_translateSpecies` chiamata con stringa invece di array
- Fix: Pulsante "Draft Tutti" nel Report Validazione URL ora funziona correttamente — chiamate API sequenziali con feedback progresso reale, `loadAdminCatalog()` chiamato una sola volta alla fine
- Fix: Navigazione diretta a Catalogo Prodotti per super_admin ora auto-seleziona il primo tenant se nessuno e stato scelto dalla Dashboard — tenant persistito in `sessionStorage`
- Fix (grave): Seed Engine — dopo "Avvia popolamento", i nuovi pet ora appaiono immediatamente grazie a `pullPetsIfOnline({ force: true })` al completamento
- Fix: Seed Engine — errore inserimento `pet_changes` (Phase 3) ora rilancia l'eccezione all'outer catch, evitando pet orfani non visibili al pull sync
- Fix: Seed Engine — log `pet_changes` Phase 9 promosso da warning a error per migliore visibilita diagnostica

## v8.7.0 (2026-02-11)
- Fix: BUG-01 Token key mismatch — `ada_jwt_token` sostituito con `getAuthToken()` in communication, chatbot, webrtc
- Fix: BUG-02 Badge non letti — aggiornamento corretto di entrambi i badge (vet + owner)
- Fix: BUG-03 `setActiveLangButton()` — aggiunta classe `active` al pulsante selezionato
- Fix: BUG-04 XSS in `renderMedications()` — sanitizzazione con `_escapeHtml()`
- Fix: BUG-05 XSS in `renderVitalsList()` — sanitizzazione con `_escapeHtml()`
- Fix: BUG-06 `handleAuthFailure()` — uso `getComputedStyle` per check login screen
- Fix: BUG-07 `initRoleSystem()` — `admin_brand` mappato correttamente al proprio ruolo
- Fix: BUG-08 Commento versione `app-core.js` aggiornato a v8.7.0
- Fix: BUG-09 Deduplicazione JWT decode — uso di `getJwtUserId()` globale
- Fix: BUG-10 Warning CORS se `FRONTEND_ORIGIN` non configurato
- Feat: PWA — Progressive Web App installabile con manifest, service worker, caching offline
- Feat: Offline indicator — banner visivo quando l'app perde connessione
- PWA: `manifest.json` con icone 192x192 e 512x512
- PWA: `sw.js` — Cache First per risorse statiche, Network First per API
- PWA: Meta tags Apple per iOS home screen
- PWA: Integrazione cache-bust con aggiornamento versione SW

## v8.6.0 (2026-02-11)
- Feat: WebRTC voice & video calls — chiamate audio/video tra proprietario e veterinario
- Feat: Post-call transcription — trascrizione automatica chiamate con OpenAI Whisper
- Frontend: `app-webrtc.js` — UI chiamata con overlay full-screen, timer, mute, STUN servers
- Frontend: Signaling WebRTC via Socket.io — offer/answer/ICE candidate exchange
- Backend: `transcription.routes.js` — 3 endpoint REST (save recording, transcribe, list recordings)
- Backend: `websocket.js` — implementazione completa signaling WebRTC (initiate/accept/reject/offer/answer/ICE/end + partner status)
- Test: `smoke.communication.spec.ts` — 8 test E2E smoke per pagine comunicazione/chatbot, nav items, AI settings, Socket.io CDN

## v8.5.0 (2026-02-11)
- Feat: Upload allegati nelle conversazioni — file immagini, audio, video, PDF fino a 10MB
- Feat: Chatbot AI assistente veterinario — triage automatico (verde/giallo/rosso) con escalation modello
- Backend: `comm-upload.routes.js` — upload con validazione MIME, SHA-256 checksum, metadata in comm_attachments
- Backend: `chatbot.routes.js` — sessioni chatbot con GPT-4o-mini (green) → GPT-4o (yellow/red), prompt veterinario italiano, EU AI Act disclaimer
- Frontend: `app-chatbot.js` — UI sessioni chatbot, bolle messaggi, follow-up chips, banner triage, disclaimer AI
- HTML: Pagina `page-chatbot` con nav item proprietario, container chatbot
- Config: `chatbot` aggiunta a ROLE_PERMISSIONS per proprietario e super_admin
- Wiring: `app-core.js` chiama `initChatbot()` su navigazione

## v8.4.0 (2026-02-11)
- Feat: Frontend comunicazione owner↔vet — pagina Messaggi con chat real-time
- Frontend: `app-communication.js` — gestione Socket.io, lista conversazioni, chat view con bolle, typing indicator, mark-as-read, paginazione cursor-based
- Frontend: Badge non letti nella sidebar per vet e proprietario
- Frontend: AI Settings nella pagina Impostazioni — toggle chatbot e trascrizione automatica
- HTML: Pagina `page-communication` con container, nav items sidebar per entrambi i ruoli
- HTML: Socket.io CDN (cdnjs.cloudflare.com/socket.io/4.7.5)
- Config: `communication` aggiunta a ROLE_PERMISSIONS per vet, proprietario, super_admin
- Wiring: `app-core.js` chiama `initCommunication()` e `loadAiSettingsUI()` su navigazione

## v8.3.0 (2026-02-11)
- Feat: API REST comunicazione owner↔vet — conversazioni, messaggi, conteggio non letti
- Backend: `communication.routes.js` — 10 endpoint REST (CRUD conversazioni, messaggi con paginazione cursor-based, mark-as-read, unread count)
- Backend: AI settings endpoint — GET/PATCH `/api/communication/settings` per toggle chatbot e trascrizione
- Backend: Broadcast Socket.io sui nuovi messaggi via `commNs`
- Backend: Gestione graceful `42P01` per tabelle mancanti in CI

## v8.2.0 (2026-02-11)
- Feat: WebSocket server con Socket.io per comunicazione real-time
- Backend: `websocket.js` — namespace `/communication` con autenticazione JWT, presence tracking, rate limiting (30 msg/60s)
- Backend: Eventi Socket.io — join/leave conversation, typing indicators, message read receipts
- Backend: Placeholder eventi WebRTC call signaling (per PR-G)
- Backend: `server.js` — integrazione httpServer + Socket.io (skip in CI/mock mode)
- Dep: socket.io aggiunto alle dipendenze backend

## v8.1.0 (2026-02-11)
- Feat: Schema database comunicazione — `sql/013_communication.sql` con 7 tabelle
- DB: `communication_settings` — toggle AI per utente (chatbot, trascrizione)
- DB: `conversations` — chat, voice_call, video_call tra owner e vet, legata a pet
- DB: `comm_messages` — messaggi con supporto testo, media, system, transcription
- DB: `call_recordings` — registrazioni chiamate con stato trascrizione
- DB: `comm_attachments` — allegati ai messaggi con metadata file
- DB: `chat_sessions` — sessioni chatbot AI con triage e timeout 30min
- DB: `chat_messages` — messaggi chatbot con livello triage e azioni suggerite

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
