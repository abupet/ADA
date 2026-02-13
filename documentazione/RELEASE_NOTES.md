# Release Notes (cumulative)

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
