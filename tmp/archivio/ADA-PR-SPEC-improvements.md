# ADA — Specifiche Miglioramenti UX & Data Quality

**Data:** 2026-02-10
**Versione target:** v6.12.3
**Autore:** Giovanni (via Claude)

> Questo documento contiene le specifiche tecniche complete per Claude Code.
> Ogni PR è indipendente e può essere implementata in qualsiasi ordine.
> I file e le righe di riferimento sono relativi al repository `ada/`.

---

## Indice PR

| PR | Titolo | Complessità | File principali |
|----|--------|-------------|-----------------|
| PR-1 | Catalogo: fix paginazione con filtri + reset completo | Bassa | `frontend/app-admin.js` |
| PR-2 | Catalogo: feedback visivo click su tutta l'app | Bassa | `frontend/styles.css`, `frontend/app-admin.js` |
| PR-3 | Report Validazione URL: fix Draft e Draft tutti | Media | `frontend/app-admin.js` |
| PR-4 | Policy: commento attivazione + descrizione effetti | Bassa | `frontend/app-admin.js` |
| PR-5 | Anteprima Prodotto: spaziatura e colori pulsanti | Bassa | `frontend/app-admin.js`, `frontend/app-promo.js` |
| PR-6 | Tenant selector globale su tutte le pagine admin | Media | `frontend/app-admin.js`, `frontend/index.html` |
| PR-7 | Spaziatura header pagine Catalogo e Campagne | Bassa | `frontend/index.html` |
| PR-8 | Seed Engine: foto placeholder valide per specie | Media | `backend/src/seed.petgen.js` |
| PR-9 | Seed Engine: dati Pet completi e coerenti | Alta | `backend/src/seed.petgen.js`, `backend/src/seed.service.js` |
| PR-10 | Debug: dimensioni dropdown super_admin | Bassa | `frontend/index.html` |
| PR-11 | Import/Export catalogo: dati completi + rinomina pulsanti | Media | `frontend/app-admin.js`, `backend/src/admin.routes.js` |
| PR-12 | CI: test dual-environment (prod + dev) | Alta | `tests/ada-tests.sh`, `.github/workflows/ci-real.yml` |

---

## PR-1 — Catalogo: fix paginazione con filtri + reset completo

### Problema
1. Quando si applicano i filtri client-side (Priorità, Immagine, Ext. Desc, Categoria, Specie) nel Catalogo Prodotti, la paginazione continua a mostrare i pulsanti basati su `_catalogTotal` (totale non filtrato dal server) anziché sul numero di prodotti filtrati.
2. Il pulsante "Reset" (`catalogSearchReset`) resetta solo `_catalogSearchTerm` e non i filtri avanzati.

### Root cause
- **Paginazione:** `_catalogTotal` viene dal server (`data.total`) e non viene aggiornato dopo i filtri client-side applicati da `_getFilteredCatalogItems()`. I filtri Priorità/Immagine/ExtDesc/Categoria/Specie sono client-side, ma la paginazione usa `_catalogTotal` che è il conteggio server-side.
- **Reset:** La funzione `catalogSearchReset()` (riga ~2251) resetta solo `_catalogSearchTerm` e `_catalogPage`, ma non `_catalogPriorityFilter`, `_catalogImageFilter`, `_catalogExtDescFilter`, `_catalogCategoryFilter`, `_catalogSpeciesFilter`.

### Soluzione

#### File: `frontend/app-admin.js`

**1. Fix paginazione (riga ~1258):**

Nella funzione `_renderCatalogPage`, dopo l'applicazione dei filtri e la generazione della tabella, la paginazione deve usare il conteggio filtrato:

```javascript
// PRIMA (riga ~1258):
var totalPages = Math.ceil(_catalogTotal / 20);

// DOPO:
var filteredItems = _getFilteredCatalogItems();
var totalPages = Math.ceil(filteredItems.length / 20);
```

**Nota:** I filtri client-side (Priorità, Immagine, ecc.) filtrano `_catalogItems` che è già paginato dal server (20 items per pagina). Quindi ci sono due approcci possibili:

**Approccio A (consigliato):** Caricare TUTTI gli items dal server quando ci sono filtri client-side attivi, e paginare localmente:
- Se almeno un filtro client-side è attivo, chiamare l'API con `limit=9999` per ottenere tutti i prodotti
- Applicare i filtri client-side
- Paginare localmente il risultato filtrato
- Mostrare i pulsanti pagina corretti

**Approccio B (più semplice, meno preciso):** Quando filtri client-side sono attivi, nascondere la paginazione e mostrare tutti i risultati filtrati della pagina corrente con un messaggio tipo "Filtri attivi — mostrando risultati della pagina corrente".

Scegli **Approccio A** implementandolo così:

In `loadAdminCatalog()` (riga ~1103):
```javascript
// Se filtri client-side attivi, carica tutti i prodotti
var hasClientFilters = _catalogPriorityFilter !== '' || _catalogImageFilter !== '' || 
    _catalogExtDescFilter !== '' || _catalogCategoryFilter !== '' || _catalogSpeciesFilter !== '';
var limit = hasClientFilters ? 9999 : 20;
var page = hasClientFilters ? 1 : _catalogPage;

// Nella URL:
fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=' + page + '&limit=' + limit + statusParam + searchParam)
```

Nella renderizzazione, se filtri attivi, paginare localmente:
```javascript
var displayItems = hasClientFilters ? filteredItems.slice((_catalogPage - 1) * 20, _catalogPage * 20) : filteredItems;
var totalPages = hasClientFilters ? Math.ceil(filteredItems.length / 20) : Math.ceil(_catalogTotal / 20);
```

**2. Reset completo (riga ~2251):**

```javascript
// PRIMA:
function catalogSearchReset() {
    _catalogSearchTerm = '';
    var el = document.getElementById('catalogSearchInput');
    if (el) el.value = '';
    _catalogPage = 1;
    loadAdminCatalog();
}

// DOPO:
function catalogSearchReset() {
    _catalogSearchTerm = '';
    _catalogStatusFilter = '';
    _catalogPriorityFilter = '';
    _catalogImageFilter = '';
    _catalogExtDescFilter = '';
    _catalogCategoryFilter = '';
    _catalogSpeciesFilter = '';
    var el = document.getElementById('catalogSearchInput');
    if (el) el.value = '';
    _catalogPage = 1;
    loadAdminCatalog();
}
```

### Verifica
1. Importare un catalogo con 30+ prodotti di cui solo 5 con priorità 3
2. Filtrare per priorità 3 → devono apparire esattamente i pulsanti pagina corretti (probabilmente solo pagina 1)
3. Premere Reset → tutti i filtri tornano a "Tutte", search input vuoto, paginazione ripristinata

---

## PR-2 — Feedback visivo click su tutta l'app

### Problema
Quando l'utente clicca un pulsante (es. "Verifica URL", "Cerca", qualsiasi btn), non c'è feedback visivo immediato. L'utente non sa se il click è stato registrato fino a che non appare un risultato (toast, popup, etc.).

### Soluzione
Aggiungere un'animazione CSS "flash" globale su tutti i `.btn` e i pulsanti dell'app.

#### File: `frontend/styles.css`

Aggiungere alla fine del file:

```css
/* === Button click feedback (global) === */
@keyframes btn-click-flash {
    0%   { opacity: 1; }
    50%  { opacity: 0.5; }
    100% { opacity: 1; }
}

.btn:active,
.admin-period-btn:active,
.promo-btn:active,
button:active {
    animation: btn-click-flash 0.25s ease-out;
    transform: scale(0.97);
}

/* Per pulsanti che avviano operazioni lunghe, classe aggiunta via JS */
.btn--loading {
    position: relative;
    pointer-events: none;
    opacity: 0.7;
}
.btn--loading::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 8px;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}
@keyframes spin {
    to { transform: rotate(360deg); }
}
```

#### File: `frontend/app-admin.js`

Per i pulsanti che avviano operazioni asincrone (es. "Verifica URL"), aggiungere loading state:

**`validateAllCatalogUrls` (riga ~2306):**
```javascript
function validateAllCatalogUrls() {
    var tenantId = _getAdminTenantId();
    if (!tenantId || _catalogItems.length === 0) return;
    
    // Feedback immediato: trova il pulsante e aggiungi loading state
    var btns = document.querySelectorAll('button');
    var verifyBtn = null;
    btns.forEach(function(b) { if (b.textContent.includes('Verifica URL')) verifyBtn = b; });
    if (verifyBtn) verifyBtn.classList.add('btn--loading');
    
    if (typeof showToast === 'function') showToast('Verifica URL in corso per ' + _catalogItems.length + ' prodotti...', 'info');
    
    // ... rest della funzione ...
    
    // Nel .then e .catch, rimuovere loading:
    // if (verifyBtn) verifyBtn.classList.remove('btn--loading');
}
```

Applicare lo stesso pattern a tutti i pulsanti che avviano operazioni async: `bulkPublishDraft`, `adminDeleteAllCatalogItems`, `wizardImport`, `savePolicy`.

### Verifica
1. Cliccare qualsiasi pulsante → deve apparire un breve flash (0.25s) + leggero scale down
2. Cliccare "Verifica URL" → il pulsante deve mostrare un indicatore di caricamento fino al completamento
3. L'animazione non deve interferire con la funzionalità

---

## PR-3 — Report Validazione URL: fix Draft e Draft tutti

### Problema
1. Nel "Report Validazione URL", premere "→ Draft" su un prodotto genera il toast "Errore nel cambio stato"
2. Non esiste un pulsante "Draft tutti" per i prodotti con URL rotti
3. Non c'è feedback visivo che il cambio stato sia avvenuto (il pulsante non cambia)

### Root cause
La funzione `setItemStatusFromReport` (riga ~2359) usa `PUT` con `{ status: 'draft' }`, ma il backend:
- **Non ha un endpoint PUT** per `/api/admin/:tenantId/promo-items/:itemId`
- Ha solo **PATCH** (che non accetta `status` — i campi allowed sono: name, category, species, ecc.)
- Ha **POST `/transition`** che è il modo corretto per cambiare stato

Inoltre, `setItemStatusFromReport` non gestisce errori (manca `.catch`) e non ha il flusso di errore nel `.then`.

### Soluzione

#### File: `frontend/app-admin.js`

**1. Fix `setItemStatusFromReport` (riga ~2359):**

```javascript
// PRIMA:
function setItemStatusFromReport(itemId) {
    var tenantId = _getAdminTenantId();
    if (!tenantId) return;
    fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' })
    }).then(function(r) {
        if (r.ok) {
            showToast('Prodotto spostato a draft', 'success');
            loadAdminCatalog();
        }
    });
}

// DOPO:
function setItemStatusFromReport(itemId) {
    var tenantId = _getAdminTenantId();
    if (!tenantId) return;
    
    // Feedback visivo immediato: cambia il pulsante
    var btn = event && event.target ? event.target : null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    
    fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId) + '/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' })
    }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'HTTP ' + r.status); });
        return r.json();
    }).then(function() {
        if (btn) { btn.textContent = '✅ Draft'; btn.style.background = '#16a34a'; btn.style.color = '#fff'; }
        showToast('Prodotto spostato a draft', 'success');
        loadAdminCatalog();
    }).catch(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = '→ Draft'; }
        showToast('Errore: ' + err.message, 'error');
    });
}
```

**Nota importante:** La transizione `published → draft` non è valida nel backend! Le transizioni consentite sono:
```
draft → in_review
in_review → published | draft
published → retired
retired → draft
```

Quindi per prodotti `published` con URL rotti, il flusso corretto è: `published → retired → draft` (2 step), oppure aggiungere una transizione diretta `published → draft` nel backend.

**Raccomandazione:** Aggiungere la transizione `published → draft` nel backend per questo use case specifico (admin che corregge URL rotti):

#### File: `backend/src/admin.routes.js` (riga ~235)

```javascript
// PRIMA:
const validTransitions = {
    draft: ["in_review"],
    in_review: ["published", "draft"],
    published: ["retired"],
    retired: ["draft"],
};

// DOPO:
const validTransitions = {
    draft: ["in_review"],
    in_review: ["published", "draft"],
    published: ["retired", "draft"],  // Aggiunto draft per fix URL rotti
    retired: ["draft"],
};
```

**2. Aggiungere pulsante "Draft tutti" nel report:**

In `_showUrlValidationReport` (riga ~2341), aggiungere un pulsante "Draft tutti" sopra la tabella:

```javascript
function _showUrlValidationReport(results) {
    var broken = results.filter(function (r) {
        return (r.image_url_status !== 'ok' && r.image_url_status !== 'missing') ||
               (r.product_url_status !== 'ok' && r.product_url_status !== 'missing');
    });
    _showModal('Report Validazione URL — ' + broken.length + ' problemi su ' + results.length + ' prodotti', function (container) {
        var html = [];
        
        // Pulsante "Draft tutti" in cima
        html.push('<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">');
        html.push('<button class="btn btn-danger" style="font-size:12px;" onclick="bulkDraftBrokenItems()">⚠️ Draft tutti i ' + broken.length + ' prodotti con URL rotti</button>');
        html.push('<span id="bulk-draft-status" style="font-size:12px;color:#888;"></span>');
        html.push('</div>');
        
        html.push('<table class="admin-table">');
        html.push('<tr><th>Prodotto</th><th>Stato</th><th>Immagine</th><th>URL Prodotto</th><th>Azione</th></tr>');
        broken.forEach(function (r) {
            html.push('<tr id="url-row-' + _escapeHtml(r.promo_item_id) + '">');
            html.push('<td>' + _escapeHtml(r.name || r.promo_item_id) + '</td>');
            // Aggiungere colonna stato corrente
            var item = _catalogItems.find(function(i) { return i.promo_item_id === r.promo_item_id; });
            html.push('<td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#f1f5f9;">' + _escapeHtml(item ? item.status : '?') + '</span></td>');
            html.push('<td>' + _urlStatusIcon(r.image_url_status) + '</td>');
            html.push('<td>' + _urlStatusIcon(r.product_url_status) + '</td>');
            html.push('<td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="setItemStatusFromReport(\'' + _escapeHtml(r.promo_item_id) + '\')">→ Draft</button></td>');
            html.push('</tr>');
        });
        html.push('</table>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-secondary" onclick="_closeModal()">Chiudi</button></div>');
        container.innerHTML = html.join('');
    });
    
    // Salva i broken items per il bulk draft
    window._brokenUrlItems = broken;
}
```

**3. Aggiungere funzione `bulkDraftBrokenItems`:**

```javascript
function bulkDraftBrokenItems() {
    var items = window._brokenUrlItems || [];
    if (items.length === 0) return;
    if (!confirm('Spostare ' + items.length + ' prodotti con URL rotti a "draft"?')) return;
    
    var tenantId = _getAdminTenantId();
    if (!tenantId) return;
    
    var statusEl = document.getElementById('bulk-draft-status');
    var done = 0, errors = 0;
    
    function updateStatus() {
        if (statusEl) statusEl.textContent = done + '/' + items.length + ' completati' + (errors > 0 ? ' (' + errors + ' errori)' : '');
    }
    
    var promises = items.map(function(r) {
        return fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(r.promo_item_id) + '/transition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'draft' })
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            done++;
            // Feedback visivo sulla riga
            var row = document.getElementById('url-row-' + r.promo_item_id);
            if (row) row.style.background = '#dcfce7';
            updateStatus();
        }).catch(function() {
            errors++;
            var row = document.getElementById('url-row-' + r.promo_item_id);
            if (row) row.style.background = '#fee2e2';
            updateStatus();
        });
    });
    
    Promise.all(promises).then(function() {
        showToast(done + ' prodotti spostati a draft' + (errors > 0 ? ', ' + errors + ' errori' : ''), errors > 0 ? 'warning' : 'success');
        loadAdminCatalog();
    });
}
```

**4. Esporre le nuove funzioni (riga ~2990+):**

```javascript
global.bulkDraftBrokenItems = bulkDraftBrokenItems;
```

### Verifica
1. Creare prodotti con URL immagine rotti (es. `https://example.invalid/img.jpg`)
2. Cliccare "Verifica URL" → nel report, cliccare "→ Draft" → deve funzionare senza errori, il pulsante diventa verde "✅ Draft"
3. Cliccare "Draft tutti" → tutti i prodotti con URL rotti vengono spostati a draft, le righe diventano verdi
4. Il contatore mostra il progresso in tempo reale

---

## PR-4 — Policy: commento attivazione e descrizione effetti

### Problema
Quando si seleziona una policy key dalla dropdown, l'utente non sa se la voce è "attiva" (se cambia effettivamente qualcosa nel comportamento di ADA) e cosa cambia.

### Soluzione
Aggiungere un campo `activeDescription` all'array `POLICY_KEYS` e mostrare un commento contestuale sotto la dropdown quando viene selezionata una voce.

#### File: `frontend/app-admin.js`

**1. Estendere `POLICY_KEYS` (riga ~1779):**

```javascript
var POLICY_KEYS = [
    { key: 'max_impressions_per_week', label: 'Max impressioni/settimana', 
      active: true,
      desc: '✅ ATTIVA — Limita il numero massimo di impressioni promozionali mostrate a ciascun proprietario per settimana. Valore: intero (es: 10). Se superato, il sistema promo non mostra più card fino alla settimana successiva.' },
    { key: 'max_impressions_per_day', label: 'Max impressioni/giorno', 
      active: true,
      desc: '✅ ATTIVA — Limita le impressioni promozionali giornaliere per proprietario. Valore: intero (es: 3). Funziona in combinazione con il limite settimanale.' },
    { key: 'debug_mode_enabled', label: 'Debug mode attivo', 
      active: true,
      desc: '✅ ATTIVA — Abilita la pagina 🛠 Debug nella navigazione per tutti gli utenti del tenant. Valore: true/false. Mostra strumenti di diagnostica, log, metriche API e test audio.' },
    { key: 'openai_optimizations', label: 'Ottimizzazioni OpenAI (JSON)', 
      active: true,
      desc: '✅ ATTIVA — Configurazione JSON per le ottimizzazioni delle chiamate OpenAI (cache prompt, batching, modello). Valore: oggetto JSON (es: {"model":"gpt-4o-mini","cache":true}). Modifica il comportamento di trascrizione e generazione SOAP.' },
    { key: 'promo_cooldown_hours', label: 'Cooldown promo (ore)', 
      active: true,
      desc: '✅ ATTIVA — Ore di attesa tra una impressione e l\'altra per lo stesso prodotto allo stesso utente. Valore: intero (es: 24). Previene la ripetizione eccessiva dello stesso suggerimento.' },
    { key: 'maintenance_mode', label: 'Modalità manutenzione', 
      active: true,
      desc: '✅ ATTIVA — Quando abilitata (true), l\'app mostra un banner di manutenzione e disabilita le operazioni di scrittura. Valore: true/false.' },
];
```

**2. Mostrare il commento sotto la dropdown:**

Nella funzione `_renderPoliciesPage`, dopo la select `newPolicyKey` (riga ~1812), aggiungere un div per il commento:

```javascript
html.push('</select>');
html.push('<input type="text" id="newPolicyKeyCustom" ...');
// AGGIUNGERE:
html.push('<div id="policyKeyDescription" style="display:none;margin-top:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;line-height:1.5;color:#166534;"></div>');
```

**3. Aggiornare `onPolicyKeyChange` (riga ~1788):**

```javascript
function onPolicyKeyChange() {
    var sel = document.getElementById('newPolicyKey');
    var custom = document.getElementById('newPolicyKeyCustom');
    var descEl = document.getElementById('policyKeyDescription');
    
    if (custom) custom.style.display = (sel && sel.value === '__custom__') ? '' : 'none';
    
    if (descEl) {
        var pk = POLICY_KEYS.find(function(p) { return p.key === (sel ? sel.value : ''); });
        if (pk && pk.desc) {
            descEl.textContent = pk.desc;
            descEl.style.display = '';
            // Colore diverso se non attiva
            if (!pk.active) {
                descEl.style.background = '#fef9c3';
                descEl.style.borderColor = '#fde047';
                descEl.style.color = '#854d0e';
            } else {
                descEl.style.background = '#f0fdf4';
                descEl.style.borderColor = '#bbf7d0';
                descEl.style.color = '#166534';
            }
        } else {
            descEl.style.display = 'none';
        }
    }
}
```

### Verifica
1. Pagina Policy → Cliccare "+ Nuova Policy"
2. Selezionare "Max impressioni/settimana" → deve apparire il box verde con la descrizione "✅ ATTIVA — Limita il numero..."
3. Selezionare "Altro (personalizzato)" → il box sparisce, appare l'input personalizzato

---

## PR-5 — Anteprima Prodotto: spaziatura e colori pulsanti

### Problema
Nella preview "Anteprima Prodotto — come appare al cliente", i tre pulsanti (Acquista, Perché vedi questo?, Non mi interessa) sono troppo attaccati tra loro e poco distinguibili visivamente.

### Soluzione

#### File: `frontend/app-admin.js`

Modificare la riga ~2419 dove vengono generati i pulsanti nella preview card:

```javascript
// PRIMA (riga ~2419):
html.push('<div class="promo-actions">');

// DOPO:
html.push('<div class="promo-actions" style="display:flex;justify-content:space-between;gap:12px;margin-top:12px;">');
```

#### File: `frontend/app-promo.js`

Modificare gli stili dei pulsanti (riga ~152) per dare colori più distinti nella preview:

```javascript
// Aggiornare .promo-actions e i pulsanti:
'.promo-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-top: 12px; }',
```

I pulsanti hanno già colori distinti (verde per CTA, blu scuro per info, grigio per dismiss) ma sono poco spaziati. Il cambio principale è `justify-content: space-between` e `gap: 12px` (da 10px) e `margin-top: 12px`.

Inoltre, nella preview dentro `_renderPreviewModal`, i pulsanti devono avere stili inline più pronunciati per distinguerli meglio:

```javascript
// PRIMA (righe ~2420-2422):
if (item.product_url) html.push('<button type="button" class="promo-btn promo-btn--cta" onclick="...">Acquista</button>');
html.push('<button type="button" class="promo-btn promo-btn--info" onclick="...">Perché vedi questo?</button>');
html.push('<button type="button" class="promo-btn promo-btn--dismiss" onclick="...">Non mi interessa</button>');

// DOPO:
if (item.product_url) html.push('<button type="button" class="promo-btn promo-btn--cta" style="flex:1;text-align:center;padding:10px 16px;" onclick="...">🛒 Acquista</button>');
html.push('<button type="button" class="promo-btn promo-btn--info" style="flex:1;text-align:center;padding:10px 16px;" onclick="...">❓ Perché vedi questo?</button>');
html.push('<button type="button" class="promo-btn promo-btn--dismiss" style="flex:1;text-align:center;padding:10px 16px;" onclick="...">✕ Non mi interessa</button>');
```

### Verifica
1. Catalogo → Cliccare 👁️ su un prodotto con URL
2. I tre pulsanti devono essere distribuiti uniformemente sulla riga con gap adeguato
3. Ogni pulsante deve avere un'icona che lo distingue visivamente
4. I colori restano: verde (Acquista), blu scuro (Perché vedi questo?), grigio outline (Non mi interessa)

---

## PR-6 — Tenant selector globale su pagine admin

### Problema
Il tenant selector è disponibile solo nella Dashboard. In pagine come Catalogo e Campagne, il super_admin deve prima andare alla Dashboard per selezionare il tenant, poi tornare alla pagina desiderata.

### Soluzione
Estrarre il tenant selector in una funzione riutilizzabile e inserirlo in cima a tutte le pagine admin dove serve.

#### File: `frontend/app-admin.js`

**1. Creare funzione helper:**

```javascript
function _renderTenantSelector(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
    var jwtTenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
    
    // Solo per super_admin senza tenant fisso
    if (jwtRole !== 'super_admin') {
        if (jwtTenantId) {
            container.innerHTML = '<span style="font-size:12px;color:#888;">Tenant: <strong>' + _escapeHtml(jwtTenantId) + '</strong></span>';
        }
        return;
    }
    
    // Per admin_brand, mostra il tenant attuale
    if (jwtRole === 'admin_brand' && jwtTenantId) {
        container.innerHTML = '<span style="font-size:12px;color:#888;">Tenant: <strong>' + _escapeHtml(jwtTenantId) + '</strong></span>';
        return;
    }
    
    // Fetch tenants e mostra dropdown
    fetchApi('/api/seed/promo/tenants')
        .then(function(r) { return r.ok ? r.json() : { tenants: [] }; })
        .then(function(data) {
            var tenants = data.tenants || [];
            if (tenants.length === 0) {
                container.innerHTML = '<span style="font-size:12px;color:#888;">Nessun tenant configurato</span>';
                return;
            }
            var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">';
            html += '<span style="font-size:12px;font-weight:600;color:#1e3a5f;">🏢 Tenant:</span>';
            html += '<select onchange="switchDashboardTenant(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">';
            tenants.forEach(function(t) {
                var selected = t.tenant_id === _selectedDashboardTenant ? ' selected' : '';
                html += '<option value="' + _escapeHtml(t.tenant_id) + '"' + selected + '>' + _escapeHtml(t.name) + '</option>';
            });
            html += '</select></div>';
            container.innerHTML = html;
        })
        .catch(function() {});
}
```

**2. Aggiungere `switchDashboardTenant`** che aggiorna e ricarica la pagina corrente:

```javascript
function switchDashboardTenant(tenantId) {
    _selectedDashboardTenant = tenantId;
    // Ricarica la pagina admin corrente
    var activePage = document.querySelector('.page[style*="display: block"], .page[style*="display:block"]');
    if (activePage) {
        var pageId = activePage.id;
        if (pageId === 'page-admin-catalog') loadAdminCatalog();
        else if (pageId === 'page-admin-campaigns') { if (typeof loadAdminCampaigns === 'function') loadAdminCampaigns(); }
        else if (pageId === 'page-admin-dashboard') loadDashboard();
    }
}
```

#### File: `frontend/index.html`

Aggiungere un contenitore per il tenant selector in ogni pagina admin:

**Catalogo (riga ~1021):**
```html
<p style="color:#666;">Gestisci i prodotti promozionali dal pannello admin.</p>
<div id="catalog-tenant-selector"></div>  <!-- AGGIUNGERE -->
<div id="admin-catalog-content"></div>
```

**Campagne (riga ~1033):**
```html
<p style="color:#666;">Gestisci le campagne promozionali.</p>
<div id="campaigns-tenant-selector"></div>  <!-- AGGIUNGERE -->
<div id="admin-campaigns-content"></div>
```

**3. Chiamare `_renderTenantSelector` quando si carica ogni pagina:**

Nella funzione `loadAdminCatalog()`, aggiungere all'inizio:
```javascript
_renderTenantSelector('catalog-tenant-selector');
```

Analogamente per `loadAdminCampaigns()`.

**4. Esporre le funzioni:**
```javascript
global.switchDashboardTenant = switchDashboardTenant;
```

### Verifica
1. Login come super_admin → Catalogo → deve apparire il tenant selector in cima
2. Cambiare tenant dal selector → il catalogo si ricarica con i prodotti del nuovo tenant
3. Per admin_brand, deve mostrare il nome del tenant corrente (non editabile)

---

## PR-7 — Spaziatura header pagine Catalogo e Campagne

### Problema
Nelle pagine "Catalogo Prodotti" e "Campagne", la descrizione (es. "Gestisci i prodotti promozionali dal pannello admin.") è troppo vicina alla fila di bottoni sottostante.

### Soluzione

#### File: `frontend/index.html`

**Catalogo (riga ~1022):**
```html
<!-- PRIMA: -->
<p style="color:#666;">Gestisci i prodotti promozionali dal pannello admin.</p>

<!-- DOPO: -->
<p style="color:#666;margin-bottom:20px;">Gestisci i prodotti promozionali dal pannello admin.</p>
```

**Campagne (riga ~1033):**
```html
<!-- PRIMA: -->
<p style="color:#666;">Gestisci le campagne promozionali.</p>

<!-- DOPO: -->
<p style="color:#666;margin-bottom:20px;">Gestisci le campagne promozionali.</p>
```

### Verifica
Visuale: ci deve essere uno spazio di ~20px tra la descrizione e i pulsanti d'azione sottostanti.

---

## PR-8 — Seed Engine: foto placeholder valide per specie

### Problema
Le foto placeholder create dal seed engine usano SVG embedded (data URI base64) che vengono generate dalla funzione `getPhotoPlaceholder` in `seed.petgen.js`. Queste sono SVG inline che funzionano localmente ma possono apparire come link "rotti" in certi contesti perché sono stringhe SVG molto lunghe nei data URL.

### Soluzione
Creare file immagini placeholder statici (PNG o SVG) nel backend, serviti via un endpoint statico, e usare URL stabili al posto di data URI.

#### File: `backend/src/seed-assets/`

Creare 4 file SVG placeholder (uno per specie + fallback):

- `placeholder-dog.svg`
- `placeholder-cat.svg`
- `placeholder-rabbit.svg`
- `placeholder-pet.svg`

Ogni SVG deve essere un'immagine semplice 200x200 con l'emoji della specie e un colore di sfondo diverso. Esempio per dog:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A90D9"/>
      <stop offset="100%" style="stop-color:#2C5F9E"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="16" fill="url(#bg)"/>
  <text x="100" y="95" text-anchor="middle" font-size="72">🐶</text>
  <text x="100" y="140" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="white" font-weight="600">Cane</text>
  <text x="100" y="162" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.7)">Foto placeholder</text>
</svg>
```

Colori per specie: dog=#4A90D9, cat=#D9864A, rabbit=#6DC94A, pet=#D94A8F.

#### File: `backend/src/server.js`

Servire la cartella `seed-assets` come statica:

```javascript
app.use('/api/seed-assets', express.static(path.join(__dirname, 'seed-assets')));
```

#### File: `backend/src/seed.petgen.js`

Modificare `getPhotoPlaceholder` (riga ~1848) per usare URL relativi:

```javascript
function getPhotoPlaceholder(species) {
    // Usa URL stabili al backend che servono i file SVG
    var file = {
        dog: 'placeholder-dog.svg',
        cat: 'placeholder-cat.svg',
        rabbit: 'placeholder-rabbit.svg',
    }[species] || 'placeholder-pet.svg';
    
    // In contesto seed, usa l'URL relativo al backend
    // Il backend url viene determinato dall'environment
    return '/api/seed-assets/' + file;
}
```

#### File: `backend/src/seed.service.js`

Nella fase di salvataggio delle foto (riga ~622), assicurarsi che l'URL sia assoluto usando il `BACKEND_URL` o un path relativo che il frontend può risolvere:

```javascript
// La funzione generatePhotosForPet già usa getPhotoPlaceholder
// che ora restituisce path relativi (/api/seed-assets/placeholder-dog.svg)
// Il frontend dovrà preporre il base URL del backend
```

### Verifica
1. Eseguire il Seed Engine
2. I pet generati devono avere foto con URL funzionanti (non data URI base64)
3. Le foto devono apparire correttamente nel frontend per cani, gatti e conigli
4. Controllare nella scheda paziente che le immagini non appaiano "rotte"

---

## PR-9 — Seed Engine: dati Pet completi e coerenti

### Problema
Quando si usa il Seed Engine, alcuni campi dei dati Pet risultano vuoti:
1. **Campi fondamentali** come Sesso a volte vuoti
2. **Stile di Vita** spesso incompleto
3. Mancanza di coerenza tra dati pet e documenti generati (es. referti SOAP)

### Root cause
La funzione `generatePetCohort` in `seed.petgen.js` genera correttamente `sex`, `lifestyle`, ecc. ma il problema potrebbe essere nel salvataggio in `seed.service.js` dove `extra_data` viene salvato come JSON. I campi del pet base (sex, birthdate, etc.) sono salvati nella tabella `pets` (riga ~381-384) ma il frontend potrebbe leggere da `extra_data` che non contiene tutti i campi.

### Soluzione

#### File: `backend/src/seed.petgen.js`

**1. Garantire che tutti i campi lifestyle siano sempre compilati (riga ~1485):**

```javascript
const lifestyle = {
    environment: pick(ENVIRONMENTS, rng),
    household: pick(HOUSEHOLDS, rng),
    activityLevel: pick(activityLevels, rng),
    dietType: pick(dietTypes, rng),
    dietPreferences: [],
    knownConditions,
    currentMeds: medications.map(m => m.name),
    behaviorNotes,
    location: pick(LOCATIONS, rng),
    // AGGIUNGERE campi mancanti:
    sterilized: rng() > 0.3,  // 70% sterilizzati
    outdoorAccess: species === 'cat' ? (rng() > 0.4 ? 'indoor/outdoor' : 'indoor only') 
                 : species === 'dog' ? 'outdoor con passeggiate'
                 : 'indoor con recinto',
    cohabitants: _generateCohabitants(species, rng),
    feedingSchedule: pick(['2 pasti/giorno', '3 pasti/giorno', 'alimentazione libera', '2 pasti + snack'], rng),
    waterSource: pick(['ciotola', 'fontanella', 'ciotola + fontanella'], rng),
    lastVaccination: _randomRecentDate(rng),
    insuranceActive: rng() > 0.7,
};
```

**2. Aggiungere funzioni helper:**

```javascript
function _generateCohabitants(species, rng) {
    var animals = [];
    if (rng() > 0.5) {
        var count = Math.floor(rng() * 3) + 1;
        var options = species === 'dog' 
            ? ['altro cane', 'gatto', 'coniglio']
            : species === 'cat'
            ? ['altro gatto', 'cane']
            : ['altro coniglio', 'cavia'];
        for (var i = 0; i < count; i++) {
            animals.push(pick(options, rng));
        }
    }
    return animals;
}

function _randomRecentDate(rng) {
    var daysAgo = Math.floor(rng() * 365);
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}
```

**3. Assicurare coerenza con SOAP (nel prompt template, riga ~1557):**

Nella funzione `buildSoapPrompt`, aggiungere i dati lifestyle al contesto:

```javascript
const lifestyleContext = pet.lifestyle ? [
    `Ambiente: ${pet.lifestyle.environment}`,
    `Attività: ${pet.lifestyle.activityLevel}`,
    `Dieta: ${pet.lifestyle.dietType}`,
    pet.lifestyle.sterilized !== undefined ? `Sterilizzato: ${pet.lifestyle.sterilized ? 'sì' : 'no'}` : '',
    pet.lifestyle.outdoorAccess ? `Accesso esterno: ${pet.lifestyle.outdoorAccess}` : '',
].filter(Boolean).join(', ') : 'Non specificato';

// Aggiungere al prompt:
lines.push(`Stile di vita: ${lifestyleContext}`);
```

#### File: `backend/src/seed.service.js`

**4. Includere i campi base anche in extra_data per completezza (riga ~753):**

```javascript
const extraData = {
    vitals_data: vitalsArray,
    medications: medsArray,
    history_data: historyArray,
    lifestyle: pet.lifestyle,
    photos: photosArray,
    owner_diary: pet.ownerDiary,
    owner_name: pet.ownerName,
    owner_phone: pet.ownerPhone,
    microchip: pet.microchip,
    visit_date: lastVisitDate,
    // AGGIUNGERE campi base per ridondanza (il frontend potrebbe leggerli da qui):
    sex: pet.sex,
    birthdate: pet.birthdate,
    species: pet.species,
    breed: pet.breed,
    weightKg: pet.weightKg,
};
```

### Verifica
1. Eseguire Seed Engine con 5 pets
2. Per ogni pet generato, verificare che:
   - Sesso sia compilato (M o F)
   - Tutti i campi Stile di Vita siano compilati
   - I dati siano coerenti (es. un gatto indoor non ha "passeggiate 3 volte al giorno")
3. Aprire un referto SOAP generato → i dati del pet nel referto devono corrispondere al profilo

---

## PR-10 — Debug: dimensioni dropdown super_admin

### Problema
Nella finestra 🛠 Debug, la dropdown per la selezione ruolo super_admin ha `width:100%` (a tutta pagina) che è eccessivo. Inoltre, l'altezza della lista è troppo piccola.

### Soluzione

#### File: `frontend/index.html`

Modificare la select (riga ~1125):

```html
<!-- PRIMA: -->
<select id="superAdminRoleSelect" onchange="onSuperAdminRoleChange(this.value)" style="width:100%;">

<!-- DOPO: -->
<select id="superAdminRoleSelect" onchange="onSuperAdminRoleChange(this.value)" style="width:auto;min-width:200px;max-width:320px;padding:8px 12px;font-size:14px;" size="4">
```

L'attributo `size="4"` mostra tutte e 4 le opzioni contemporaneamente senza dover aprire il dropdown. Se si preferisce mantenere il dropdown classico (click to open), usare solo lo stile senza `size`:

```html
<select id="superAdminRoleSelect" onchange="onSuperAdminRoleChange(this.value)" style="width:auto;min-width:220px;max-width:350px;padding:8px 12px;font-size:14px;">
```

### Verifica
1. Login come super_admin → 🛠 Debug
2. La dropdown "Ruolo attivo (super admin)" deve avere larghezza adeguata al contenuto (~220-350px)
3. Non deve estendersi a tutta la larghezza della pagina

---

## PR-11 — Import/Export catalogo: dati completi + rinomina pulsanti

### Problema
1. I pulsanti "Scarica template CSV" e "Scarica template XLSX" scaricano solo un template con dati di esempio, non i dati reali del tenant selezionato
2. Mancano colonne per `status` e `extended_description` nel download
3. I pulsanti si chiamano "template" anche quando dovrebbero scaricare dati reali

### Soluzione

#### File: `frontend/app-admin.js`

**1. Rinominare i pulsanti (riga ~321-322):**

```javascript
// PRIMA:
'<button class="btn btn-secondary" onclick="downloadCsvTemplate()" style="font-size:12px;">Scarica template CSV</button>',
'<button class="btn btn-secondary" onclick="downloadXlsxTemplate()" style="font-size:12px;margin-left:4px;">Scarica template XLSX</button>',

// DOPO:
'<button class="btn btn-secondary" onclick="downloadCatalogCsv()" style="font-size:12px;">Scarica file CSV</button>',
'<button class="btn btn-secondary" onclick="downloadCatalogXlsx()" style="font-size:12px;margin-left:4px;">Scarica file XLSX</button>',
```

**2. Creare nuove funzioni che scaricano i dati reali del tenant:**

```javascript
function downloadCatalogCsv() {
    var tenantId = _getWizardTenantId();
    if (!tenantId) { 
        // Fallback: scarica template vuoto
        downloadCsvTemplate(); 
        return; 
    }
    
    // Carica tutti i prodotti del tenant
    fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=1&limit=9999')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.items || data.items.length === 0) {
                showToast('Nessun prodotto da esportare. Scarico il template vuoto.', 'info');
                downloadCsvTemplate();
                return;
            }
            
            var headers = 'name,category,species,lifecycle_target,description,extended_description,image_url,product_url,tags_include,tags_exclude,priority,status';
            var lines = [headers];
            
            data.items.forEach(function(item) {
                var row = [
                    _csvEscape(item.name || ''),
                    item.category || '',
                    _csvArrayField(item.species),
                    _csvArrayField(item.lifecycle_target),
                    _csvEscape(item.description || ''),
                    _csvEscape(item.extended_description || ''),
                    item.image_url || '',
                    item.product_url || '',
                    _csvArrayField(item.tags_include),
                    _csvArrayField(item.tags_exclude),
                    item.priority || 0,
                    item.status || 'draft',
                ].join(',');
                lines.push(row);
            });
            
            var csvContent = lines.join('\n');
            var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });  // BOM per Excel
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'catalogo_' + tenantId + '.csv';
            a.click();
            URL.revokeObjectURL(url);
            showToast(data.items.length + ' prodotti esportati in CSV', 'success');
        })
        .catch(function() {
            showToast('Errore nel download. Scarico il template.', 'error');
            downloadCsvTemplate();
        });
}

function _csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function _csvArrayField(val) {
    if (Array.isArray(val)) return '"' + val.join('|') + '"';
    if (typeof val === 'string' && val.includes(',')) return '"' + val + '"';
    return val || '';
}

function downloadCatalogXlsx() {
    var tenantId = _getWizardTenantId();
    if (!tenantId) {
        downloadXlsxTemplate();
        return;
    }
    
    if (typeof XLSX === 'undefined') {
        showToast('Libreria SheetJS non disponibile.', 'error');
        return;
    }
    
    fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=1&limit=9999')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.items || data.items.length === 0) {
                showToast('Nessun prodotto. Scarico template vuoto.', 'info');
                downloadXlsxTemplate();
                return;
            }
            
            var sheetData = data.items.map(function(item) {
                return {
                    name: item.name || '',
                    category: item.category || '',
                    species: Array.isArray(item.species) ? item.species.join('|') : (item.species || ''),
                    lifecycle_target: Array.isArray(item.lifecycle_target) ? item.lifecycle_target.join('|') : (item.lifecycle_target || ''),
                    description: item.description || '',
                    extended_description: item.extended_description || '',
                    image_url: item.image_url || '',
                    product_url: item.product_url || '',
                    tags_include: Array.isArray(item.tags_include) ? item.tags_include.join('|') : (item.tags_include || ''),
                    tags_exclude: Array.isArray(item.tags_exclude) ? item.tags_exclude.join('|') : (item.tags_exclude || ''),
                    priority: item.priority || 0,
                    status: item.status || 'draft',
                };
            });
            
            var ws = XLSX.utils.json_to_sheet(sheetData);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Prodotti');
            XLSX.writeFile(wb, 'catalogo_' + tenantId + '.xlsx');
            showToast(data.items.length + ' prodotti esportati in XLSX', 'success');
        })
        .catch(function() {
            showToast('Errore download XLSX.', 'error');
            downloadXlsxTemplate();
        });
}

function _getWizardTenantId() {
    var sel = document.getElementById('wizardCsvTenant');
    if (sel && sel.value) return sel.value;
    var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
    if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
    return tenantId;
}
```

**3. Aggiornare anche il template CSV/XLSX per includere le colonne `status` e `extended_description`:**

Le funzioni `downloadCsvTemplate` e `downloadXlsxTemplate` originali restano come fallback, ma devono includere la colonna `status`:

In `downloadCsvTemplate` (riga ~361), aggiungere `,status` all'header e `,draft` ai record esempio.

In `downloadXlsxTemplate` (riga ~2099), aggiungere `status: 'draft'` agli oggetti esempio.

**4. Aggiornare l'import per accettare la colonna `status`:**

Nel backend, la funzione di import CSV (`/api/admin/:tenantId/wizard/csv-confirm`, riga ~968) deve accettare la colonna `status` nell'import, usandola come stato iniziale se presente (default: `draft`).

**5. Esporre le nuove funzioni:**

```javascript
global.downloadCatalogCsv = downloadCatalogCsv;
global.downloadCatalogXlsx = downloadCatalogXlsx;
```

**6. Altre colonne utili da considerare per import/export:**

- `brand` — marca del prodotto (se presente nello schema)
- `created_at` / `updated_at` — solo in export, non in import
- `promo_item_id` — solo in export, utile per matching in upsert
- `url_check_status` — solo in export, mostra lo stato dell'ultima verifica URL
- `version` — solo in export, per tracking

### Verifica
1. Wizard Importa → i pulsanti dicono "Scarica file CSV" / "Scarica file XLSX"
2. Selezionare un tenant con prodotti → cliccare "Scarica file CSV" → il file contiene tutti i prodotti del tenant con colonne status e extended_description
3. Selezionare un tenant vuoto → cliccare "Scarica file CSV" → scarica il template con dati di esempio
4. Modificare il CSV e reimportarlo → i dati vengono importati correttamente

---

## PR-12 — CI: test dual-environment (prod + dev)

### Problema
`ada-tests.sh` e tutti i workflow GitHub Actions (ci.yml, ci-real.yml, long-tests.yml) testano solo un ambiente alla volta. Non esiste un meccanismo per testare entrambi gli ambienti (produzione e sviluppo) come richiesto dalla struttura dual-environment di ADA.

### Stato attuale
- `ada-tests.sh`: `DEPLOY_URL` hardcoded a `https://abupet.github.io/ada/` (solo prod)
- `ci-real.yml` (nightly): singolo `DATABASE_URL`, singolo `DEPLOY_URL`
- Nessun workflow testa l'ambiente dev (Netlify + Render dev + Neon.tech)

### Soluzione

#### File: `tests/ada-tests.sh`

**1. Aggiungere toggle ambiente:**

Dopo la riga `MODE="${MODE:-MOCK}"` (~137), aggiungere:

```bash
# Environment: prod | dev
ADA_ENV="${ADA_ENV:-prod}"

# URLs per ambiente
if [[ "${ADA_ENV}" == "dev" ]]; then
    DEPLOY_URL="${DEV_DEPLOY_URL:-https://dev--ada-app.netlify.app/}"
    BACKEND_DEPLOY_URL="${DEV_BACKEND_URL:-https://ada-backend-dev.onrender.com}"
else
    DEPLOY_URL="${DEPLOY_URL:-$DEFAULT_DEPLOY_URL}"
    BACKEND_DEPLOY_URL="${PROD_BACKEND_URL:-https://ada-au40.onrender.com}"
fi
```

**2. Aggiornare il menu per mostrare l'ambiente:**

In `print_header()`, aggiungere la riga:
```bash
echo -e "ENV: ${CLR_BOLD}${ADA_ENV}${CLR_RESET}  |  MODE: ..."
```

E aggiungere tasto per switch:
```bash
if [[ "$choice" == "e" || "$choice" == "E" ]]; then
    if [[ "${ADA_ENV}" == "prod" ]]; then ADA_ENV=dev; else ADA_ENV=prod; fi
    clear_screen; continue
fi
```

**3. Aggiornare `status()` per mostrare l'ambiente:**

```bash
echo "Environment:      $ADA_ENV"
echo "Deploy URL:       $DEPLOY_URL"
echo "Backend URL:      $BACKEND_DEPLOY_URL"
```

#### File: `.github/workflows/ci-real.yml`

**4. Aggiungere matrix strategy per testare entrambi gli ambienti:**

```yaml
jobs:
  test_real:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        environment: [prod, dev]
        include:
          - environment: prod
            database_url_secret: DATABASE_URL
            deploy_url_secret: DEPLOY_URL
          - environment: dev
            database_url_secret: DATABASE_URL_DEV
            deploy_url_secret: DEPLOY_URL_DEV

    env:
      MODE: REAL
      STRICT_NETWORK: "1"
      ADA_ENV: ${{ matrix.environment }}
      DATABASE_URL: ${{ secrets[matrix.database_url_secret] }}
      DEPLOY_URL: ${{ secrets[matrix.deploy_url_secret] }}
      # ... rest of env vars ...
```

**Nota:** Richiede la creazione dei seguenti secrets in GitHub:
- `DATABASE_URL_DEV` — connection string per Neon.tech dev
- `DEPLOY_URL_DEV` — URL del frontend Netlify dev

**5. Aggiornare le issue nightly per indicare l'ambiente:**

Nel step "Notify nightly failure", includere l'ambiente nel titolo:
```bash
gh issue create \
    --title "Nightly CI (REAL/${{ matrix.environment }}) failed — $DATE" \
```

### Prerequisiti
- Creare i secrets `DATABASE_URL_DEV` e `DEPLOY_URL_DEV` in GitHub Settings → Secrets
- Assicurarsi che il backend dev su Render sia attivo per i test nightly
- Verificare che le credenziali test (`TEST_VET_EMAIL`, `TEST_PASSWORD`, ecc.) funzionino su entrambi gli ambienti

### Verifica
1. `ada-tests.sh` → premere `e` per switchare a dev → lo status mostra l'URL Netlify
2. Eseguire test deployed in env dev → i test puntano al frontend Netlify
3. Il workflow nightly crea 2 job paralleli (prod e dev)
4. Se un ambiente fallisce, l'issue indica quale ambiente

---

## Note generali per l'implementazione

### Ordine di implementazione consigliato
1. **PR-7** (spaziatura header) — 5 min, zero rischio
2. **PR-10** (debug dropdown) — 5 min, zero rischio
3. **PR-5** (preview pulsanti) — 10 min, basso rischio
4. **PR-2** (feedback click) — 15 min, basso rischio
5. **PR-4** (policy commenti) — 15 min, basso rischio
6. **PR-1** (paginazione + reset) — 30 min, medio rischio
7. **PR-3** (fix draft report) — 45 min, medio rischio (tocca backend)
8. **PR-11** (import/export) — 45 min, medio rischio
9. **PR-6** (tenant selector) — 30 min, medio rischio
10. **PR-8** (foto placeholder) — 30 min, medio rischio (tocca backend)
11. **PR-9** (dati pet completi) — 60 min, alto rischio (seed engine)
12. **PR-12** (CI dual-env) — 60 min, alto rischio (infrastruttura)

### Pattern da seguire
- **Ogni PR** su un branch separato da `dev`
- **Testare manualmente** prima di merge
- **Non rompere** funzionalità esistenti
- **Commit message** formato: `fix(catalogo): reset filtri avanzati — PR-1`
