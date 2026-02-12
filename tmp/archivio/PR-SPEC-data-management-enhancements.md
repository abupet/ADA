# PR Specification: Data Management & Import/Export Enhancements

**Target version:** v7.2.19 (increment Z)
**Branch name:** `feat/data-management-enhancements`
**Scope:** Frontend (`docs/`) + Backend (`backend/src/`)

> ⚠️ Before starting, read `AGENTS.md` and `TEST_PLAN.md` as per `CLAUDE.md` rules.

---

## Feature 1: Tenant Data Reset ("Azzera Tenant")

### Obiettivo
Nella pagina **Gestione Tenant** (`page-superadmin-tenants`), aggiungere per ogni tenant un pulsante **"🗑️ Azzera dati"** che cancella tutti i contenuti associati al tenant (catalogo, campagne, dashboard promo, eventi, budget, staging, ecc.), riportandolo allo stato "appena creato". L'associazione utenti-tenant (`user_tenants`) **non viene toccata**.

### Implementazione Backend

**File:** `backend/src/admin.routes.js`

Aggiungere endpoint:
```
POST /api/superadmin/tenants/:tenantId/reset
```

**Autenticazione:** richiede ruolo superadmin (come gli altri endpoint superadmin).

**Logica:** Cancellare, in ordine corretto per rispetto delle foreign key, i record con `tenant_id` corrispondente dalle seguenti tabelle:
1. `promo_event_daily_stats` (nessuna FK)
2. `promo_events` (nessuna FK in uscita)
3. `campaign_items` (FK verso `promo_campaigns` e `promo_items`)
4. `promo_campaigns` (FK verso `tenants`)
5. `brand_products_staging` (FK verso `brand_ingest_jobs`)
6. `brand_ingest_jobs` (FK verso `tenants`)
7. `promo_item_versions` (se ha `tenant_id`, altrimenti filtrare via JOIN su `promo_items`)
8. `promo_items` (FK verso `tenants`)
9. `tenant_budgets` (PK = `tenant_id`)

Eseguire il tutto in una singola **transazione SQL** (`BEGIN`/`COMMIT`/`ROLLBACK`).

**Response:**
- `200 OK` con `{ success: true, deleted: { promo_items: N, campaigns: N, events: N, ... } }` — conteggio record cancellati per tabella.
- `404` se tenant non trovato.
- `500` con rollback in caso di errore.

### Implementazione Frontend

**File:** `docs/app-admin.js`

Nella funzione `_renderTenantsPage()`, nella colonna "Azioni" di ogni riga tenant (attorno alla riga 700-710), aggiungere un pulsante:
```html
<button class="btn btn-danger" style="padding:4px 8px;font-size:11px;"
  onclick="resetTenantData('TENANT_ID', 'TENANT_NAME')">🗑️ Azzera dati</button>
```

**Funzione `resetTenantData(tenantId, tenantName)`:**
1. Mostrare un primo `confirm()`: _"Sei sicuro di voler azzerare tutti i dati del tenant «NOME»? Verranno cancellati catalogo, campagne, eventi e statistiche. Le associazioni utente rimarranno attive."_
2. Se confermato, mostrare un secondo `confirm()`: _"ATTENZIONE: Questa operazione è irreversibile. Confermi di voler procedere?"_
3. Se confermato, chiamare `POST /api/superadmin/tenants/:tenantId/reset`.
4. Su successo: `showToast('Dati del tenant azzerati con successo', 'success')` e ricaricare la pagina tenant con `loadSuperadminTenants()`.
5. Su errore: `showToast('Errore durante l\'azzeramento: ...', 'error')`.

**Esporre:** `global.resetTenantData = resetTenantData;` nella sezione delle esposizioni globali (circa riga 1920+).

---

## Feature 2: Importa/Esporta Excel (XLSX) + Rinomina menu

### Obiettivo
Il menu attualmente chiamato **"Importa CSV"** diventa **"Importa file"** e supporta anche il formato **Excel (.xlsx)** sia in import che in export.

### Rinomina menu

**File:** `docs/index.html`

1. **Menu laterale** (riga ~79): Cambiare il testo da `Importa CSV` a `Importa file`.
2. **Header pagina** (riga ~1036): Cambiare `<h2>Importa CSV</h2>` in `<h2>Importa file</h2>`.

### Supporto XLSX in Import

**File:** `docs/app-admin.js`, funzione `initCsvWizard()` (riga ~283)

1. **Step 1 titolo**: Cambiare da `"Step 1: Carica file CSV"` a `"Step 1: Carica file"`.
2. **Descrizione formato**: Aggiornare il testo per indicare che sono accettati CSV e XLSX.
3. **Input file** (riga ~305): Cambiare `accept=".csv,.txt"` in `accept=".csv,.txt,.xlsx,.xls"`.
4. **Pulsante template**: Aggiungere accanto al pulsante "Scarica template CSV" un secondo pulsante **"Scarica template XLSX"** che chiama `downloadXlsxTemplate()`.

**Funzione `handleCsvUpload(event)` (riga ~359):** Aggiungere rilevamento del tipo di file:
- Se il file ha estensione `.xlsx` o `.xls`: leggere come `ArrayBuffer`, parsare con la libreria **SheetJS** (`XLSX`), convertire il primo foglio in array di oggetti, e assegnare a `_wizardParsedItems`.
- Se il file ha estensione `.csv` o `.txt`: comportamento attuale invariato (lettura come testo + `_parseCsv`).

**Libreria SheetJS:** Aggiungere in `docs/index.html` prima degli script applicativi:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

**Funzione `downloadXlsxTemplate()`:** Creare un file XLSX con SheetJS contenente:
- Un foglio chiamato "Prodotti" con le stesse colonne del template CSV: `name, category, species, lifecycle_target, description, image_url, product_url, tags_include, tags_exclude, priority`.
- Le stesse 3 righe di esempio del template CSV esistente.
- Download automatico come `promo_items_template.xlsx`.

### Supporto XLSX in Export

**File:** `docs/app-admin.js`

Ovunque sia presente un pulsante o funzionalità di esportazione CSV (es. nella dashboard promo, riga ~264 con `promo_events_...csv`), aggiungere un pulsante parallelo **"📥 Esporta XLSX"** che:
1. Prende gli stessi dati.
2. Li converte in un foglio XLSX con SheetJS.
3. Scarica il file come `.xlsx`.

**Toast errore CSV** (riga ~369): Aggiornare il messaggio da `'CSV vuoto o formato non valido.'` a `'File vuoto o formato non valido.'`.

**Esporre:** `global.downloadXlsxTemplate = downloadXlsxTemplate;` nelle esposizioni globali.

---

## Feature 3: Import siti web da file TXT nel Seed Engine

### Obiettivo
Nella sezione **"📦 Popolamento Promo — Brand e Prodotti"** della pagina **Seed Engine** (`page-seed`), aggiungere la possibilità di caricare un file `.txt` contenente URL di siti web (uno per riga). Inoltre: uniformare le altezze dei campi input, aggiungere un pulsante di reset della sezione.

### Import da file TXT

**File:** `docs/index.html`, sezione Seed Engine promo (righe ~1261-1295)

Dopo il blocco dell'URL manuale (riga ~1274), aggiungere:

```html
<div style="margin-top:8px;">
    <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">
        Carica siti da file TXT
    </label>
    <p style="font-size:11px;color:#888;margin:0 0 6px;">
        ℹ️ Il file deve contenere un URL per riga, senza intestazioni. Esempio:<br>
        <code style="font-size:10px;">https://www.royalcanin.com<br>https://www.hillspet.it<br>https://www.purina.it</code>
    </p>
    <input type="file" id="seedSitesFileInput" accept=".txt" onchange="seedLoadSitesFromFile(event)">
</div>
```

**File:** `docs/app-seed.js`

**Funzione `seedLoadSitesFromFile(event)`:**
1. Leggere il file come testo.
2. Separare per `\n`, trimmando ogni riga e filtrando le righe vuote.
3. Per ogni URL valido (che inizia con `http://` o `https://`), aggiungerlo a `_discoveredSites` con `name: url, description: 'Da file TXT', selected: true`.
4. Chiamare `_renderBrandResults()` per aggiornare la visualizzazione.
5. Rendere visibile il pulsante `seedScrapeBtn`.
6. Mostrare toast: _"N siti caricati dal file"_.
7. Se nessun URL valido trovato, mostrare toast errore: _"Nessun URL valido trovato nel file. Assicurati che ogni riga contenga un URL completo (es. https://www.esempio.com)"_.

### Uniformare altezze campi input

**File:** `docs/index.html`, sezione Seed Engine promo

I campi `#seedBrandInput` (riga ~1267) e `#seedExtraSiteInput` (riga ~1272) devono avere lo stesso stile. Applicare a entrambi:
```
style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; height:38px; box-sizing:border-box;"
```

Anche il campo `#seedExtraSiteInput` attualmente ha `style="width:70%"` — cambiare il layout del suo container div in `display:flex;gap:8px;align-items:center;` e dare al campo `style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; height:38px; box-sizing:border-box;"`.

### Pulsante Reset sezione promo

**File:** `docs/index.html`, nella card promo del Seed Engine (dopo il div `seedPromoPreview`, riga ~1294)

Aggiungere:
```html
<div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0;">
    <button class="btn btn-danger" onclick="seedResetPromoSection()">
        🗑️ Azzera siti e prodotti proposti
    </button>
</div>
```

**File:** `docs/app-seed.js`

**Funzione `seedResetPromoSection()`:**
1. `confirm('Vuoi azzerare tutti i siti web trovati e i prodotti proposti in questa sezione?')`.
2. Se confermato:
   - Svuotare `_discoveredSites = []` e `_discoveredProducts = []`.
   - Nascondere `seedBrandResults`, `seedScrapeResults`, `seedPromoOptions`, `seedPromoPreview`.
   - Nascondere `seedScrapeBtn`.
   - Svuotare i campi input `seedBrandInput` e `seedExtraSiteInput`.
   - Reset del file input `seedSitesFileInput` (impostare `value = ''`).
   - `showToast('Sezione promo azzerata', 'success')`.

**Esporre:** `global.seedLoadSitesFromFile = seedLoadSitesFromFile;` e `global.seedResetPromoSection = seedResetPromoSection;` nelle esposizioni globali (fine file `app-seed.js`).

---

## Feature 4: Cancellazione dati nelle pagine Dashboard Promo, Catalogo Prodotti, Campagne

### Obiettivo
In ciascuna delle tre pagine amministrative — **Dashboard Promo**, **Catalogo Prodotti**, **Campagne** — aggiungere pulsanti per cancellare i dati: tutti insieme oppure il singolo record selezionato.

### 4A: Dashboard Promo (`page-admin-dashboard`)

**File:** `docs/index.html` (riga ~1004-1008)

Aggiungere nell'header della pagina, accanto al titolo:
```html
<button class="btn btn-danger" style="font-size:12px;" onclick="adminDeleteAllDashboardData()">
    🗑️ Cancella tutti gli eventi
</button>
```

**File:** `docs/app-admin.js`

**Funzione `adminDeleteAllDashboardData()`:**
1. Determinare il tenant corrente (dal selettore tenant nella dashboard, se presente, oppure dal contesto globale).
2. `confirm('Sei sicuro di voler cancellare TUTTI gli eventi promozionali di questo tenant? Questa operazione è irreversibile.')`.
3. Chiamare `DELETE /api/admin/promo-events?tenant_id=TENANT_ID` (nuovo endpoint).
4. Su successo: `showToast`, ricaricare dashboard.

**Backend** (`backend/src/admin.routes.js`): Aggiungere endpoint:
```
DELETE /api/admin/promo-events?tenant_id=...
```
Cancella tutti i record da `promo_events` e `promo_event_daily_stats` per il tenant indicato. Richiede autenticazione admin.

### 4B: Catalogo Prodotti (`page-admin-catalog`)

**File:** `docs/app-admin.js`, funzione `loadAdminCatalog()` (riga ~1025)

1. **Cancella tutti:** Aggiungere in cima alla lista prodotti un pulsante:
   ```html
   <button class="btn btn-danger" style="font-size:12px;" onclick="adminDeleteAllCatalogItems()">
       🗑️ Cancella tutto il catalogo
   </button>
   ```

2. **Cancella singolo:** Per ogni riga prodotto nella tabella, aggiungere un pulsante:
   ```html
   <button class="btn btn-danger" style="padding:2px 8px;font-size:11px;"
     onclick="adminDeleteCatalogItem('ITEM_ID')">🗑️</button>
   ```

**Funzione `adminDeleteAllCatalogItems()`:**
1. Determinare il tenant corrente.
2. Doppio `confirm()`: _"Cancellare TUTTI i prodotti dal catalogo?"_ poi _"Operazione irreversibile. Confermi?"_.
3. Chiamare `DELETE /api/admin/catalog?tenant_id=TENANT_ID` (nuovo endpoint).
4. Su successo: `showToast`, ricaricare catalogo.

**Funzione `adminDeleteCatalogItem(itemId)`:**
1. `confirm('Cancellare questo prodotto dal catalogo?')`.
2. Chiamare `DELETE /api/admin/catalog/:itemId` (nuovo endpoint).
3. Su successo: `showToast`, ricaricare catalogo.

**Backend** (`backend/src/admin.routes.js`): Aggiungere endpoint:
```
DELETE /api/admin/catalog?tenant_id=...
```
Cancella tutti i `promo_items` del tenant (prima cancellare `campaign_items` e `promo_item_versions` collegati). Transazione SQL.

```
DELETE /api/admin/catalog/:itemId
```
Cancella un singolo `promo_items` (prima cancellare `campaign_items` e `promo_item_versions` collegati). Transazione SQL.

### 4C: Campagne (`page-admin-campaigns`)

**File:** `docs/app-admin.js`, funzione `loadAdminCampaigns()` (riga ~1318)

1. **Cancella tutte:** Aggiungere in cima alla lista campagne un pulsante:
   ```html
   <button class="btn btn-danger" style="font-size:12px;" onclick="adminDeleteAllCampaigns()">
       🗑️ Cancella tutte le campagne
   </button>
   ```

2. **Cancella singola:** Per ogni riga campagna, aggiungere un pulsante:
   ```html
   <button class="btn btn-danger" style="padding:2px 8px;font-size:11px;"
     onclick="adminDeleteCampaign('CAMPAIGN_ID')">🗑️</button>
   ```

**Funzione `adminDeleteAllCampaigns()`:**
1. Determinare il tenant corrente.
2. Doppio `confirm()`.
3. Chiamare `DELETE /api/admin/campaigns?tenant_id=TENANT_ID` (nuovo endpoint).
4. Su successo: `showToast`, ricaricare campagne.

**Funzione `adminDeleteCampaign(campaignId)`:**
1. `confirm('Cancellare questa campagna?')`.
2. Chiamare `DELETE /api/admin/campaigns/:campaignId` (nuovo endpoint).
3. Su successo: `showToast`, ricaricare campagne.

**Backend** (`backend/src/admin.routes.js`): Aggiungere endpoint:
```
DELETE /api/admin/campaigns?tenant_id=...
```
Cancella tutte le `promo_campaigns` del tenant (prima cancellare `campaign_items` collegati). Transazione SQL.

```
DELETE /api/admin/campaigns/:campaignId
```
Cancella una singola `promo_campaigns` (prima cancellare `campaign_items` collegati). Transazione SQL.

**Esporre tutte le nuove funzioni:** Nella sezione esposizioni globali di `app-admin.js`:
```javascript
global.adminDeleteAllDashboardData = adminDeleteAllDashboardData;
global.adminDeleteAllCatalogItems  = adminDeleteAllCatalogItems;
global.adminDeleteCatalogItem      = adminDeleteCatalogItem;
global.adminDeleteAllCampaigns     = adminDeleteAllCampaigns;
global.adminDeleteCampaign         = adminDeleteCampaign;
```

---

## Riepilogo file coinvolti

| File | Feature |
|------|---------|
| `docs/index.html` | 1, 2, 3 |
| `docs/app-admin.js` | 1, 2, 4 |
| `docs/app-seed.js` | 3 |
| `backend/src/admin.routes.js` | 1, 4 |

### Dipendenze esterne da aggiungere
- **SheetJS** (XLSX): CDN `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` — aggiungere in `index.html`.

---

## Checklist di completamento

- [ ] **Feature 1:** Endpoint `POST /api/superadmin/tenants/:tenantId/reset` + pulsante + doppia conferma
- [ ] **Feature 2:** Menu rinominato + import XLSX + export XLSX + template XLSX + SheetJS caricato
- [ ] **Feature 3:** Upload file TXT + nota formato + altezze uniformi + pulsante reset sezione
- [ ] **Feature 4A:** Cancellazione eventi dashboard (tutti) + endpoint backend
- [ ] **Feature 4B:** Cancellazione catalogo (tutti + singolo) + endpoint backend
- [ ] **Feature 4C:** Cancellazione campagne (tutte + singola) + endpoint backend
- [ ] Tutti i toast in italiano
- [ ] Tutte le nuove funzioni esposte su `global`
- [ ] Transazioni SQL con `BEGIN`/`COMMIT`/`ROLLBACK` per tutte le operazioni di cancellazione multi-tabella
- [ ] Test E2E aggiornati/aggiunti se necessario (verificare `tests/` per copertura esistente)
- [ ] `RELEASE_NOTES.md` aggiornato
- [ ] Versione incrementata in `docs/config.js`, `AGENTS.md`, `RELEASE_NOTES.md`
