// app-seed.js v1.0
// Seed Engine frontend controller — PR 14
// Visible only when debugLogEnabled === true

(function (global) {
    'use strict';

    var _polling = false;
    var _pollTimer = null;
    var _discoveredSites = [];
    var _discoveredProducts = [];
    var _promoPreviewIndex = 0;

    // Translation maps (duplicated from app-admin.js for standalone use)
    var _SPECIES_LABELS = { dog: 'Cane', cat: 'Gatto', rabbit: 'Coniglio', ferret: 'Furetto', bird: 'Uccello', reptile: 'Rettile' };
    var _LIFECYCLE_LABELS = { puppy: 'Cucciolo/Kitten', adult: 'Adulto', senior: 'Senior' };
    var _CATEGORY_LABELS = { food_general: 'Cibo generico', food_clinical: 'Dieta clinica', supplement: 'Integratore', antiparasitic: 'Antiparassitario', accessory: 'Accessorio', service: 'Servizio' };

    function _seedTranslateSpecies(arr) {
        if (!Array.isArray(arr)) return '';
        return arr.map(function (s) { return _SPECIES_LABELS[s] || s; }).join(', ');
    }
    function _seedTranslateLifecycle(arr) {
        if (!Array.isArray(arr)) return '';
        return arr.map(function (l) { return _LIFECYCLE_LABELS[l] || l; }).join(', ');
    }
    function _seedEscapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- Estimate calculation ---
    function _updateEstimate() {
        try {
            var petCount = parseInt(document.getElementById('seedPetCount').value) || 10;
            var soapPerPet = parseInt(document.getElementById('seedSoapPerPet').value) || 3;
            var docsPerPet = parseInt(document.getElementById('seedDocsPerPet').value) || 2;

            var totalSoap = petCount * soapPerPet;
            var totalDocs = petCount * docsPerPet;
            var totalAiCalls = totalSoap + totalDocs;
            var estimatedMinutes = Math.ceil(totalAiCalls * 8 / 60);

            var el = document.getElementById('seedEstimate');
            if (el) {
                el.textContent = '~' + totalSoap + ' referti, ~' + totalDocs + ' documenti — circa ' + estimatedMinutes + ' minuti con OpenAI';
            }
        } catch (e) {}
    }

    // --- Progress update ---
    function _updateProgress(data) {
        try {
            var bar = document.getElementById('seedProgressBar');
            var fill = bar ? bar.querySelector('.progress-fill') : null;
            var phaseText = document.getElementById('seedPhaseText');
            var logEl = document.getElementById('seedLogArea');
            var progressSection = document.getElementById('seedProgressSection');

            if (data.status === 'running' || data.status === 'cancelling') {
                if (progressSection) progressSection.style.display = 'block';
                if (fill) fill.style.width = (data.progressPct || 0) + '%';
                if (phaseText) phaseText.textContent = (data.phaseName || 'In corso...') + ' (' + Math.round(data.progressPct || 0) + '%)';

                // Update log
                if (logEl && data.log && data.log.length > 0) {
                    var last50 = data.log.slice(-50);
                    logEl.textContent = last50.join('\n');
                    logEl.scrollTop = logEl.scrollHeight;
                }

                // Show cancel button, hide start
                var startBtn = document.getElementById('seedStartBtn');
                var cancelBtn = document.getElementById('seedCancelBtn');
                if (startBtn) startBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'inline-block';
            } else {
                // Job finished or idle
                var startBtn2 = document.getElementById('seedStartBtn');
                var cancelBtn2 = document.getElementById('seedCancelBtn');
                if (startBtn2) startBtn2.style.display = 'inline-block';
                if (cancelBtn2) cancelBtn2.style.display = 'none';

                if (data.status === 'completed') {
                    if (fill) fill.style.width = '100%';
                    if (phaseText) phaseText.textContent = 'Completato!';
                    if (typeof showToast === 'function') showToast('Seed completato!', 'success');
                } else if (data.status === 'cancelled') {
                    if (phaseText) phaseText.textContent = 'Annullato';
                    if (typeof showToast === 'function') showToast('Seed annullato', 'error');
                } else if (data.status === 'error') {
                    if (phaseText) phaseText.textContent = 'Errore: ' + (data.error || 'sconosciuto');
                    if (typeof showToast === 'function') showToast('Errore seed: ' + (data.error || ''), 'error');
                }

                _stopPolling();
            }
        } catch (e) {
            console.error('seedUpdateProgress error', e);
        }
    }

    // --- Polling ---
    function _startPolling() {
        if (_polling) return;
        _polling = true;
        _pollTimer = setInterval(async function () {
            try {
                var resp = await fetchApi('/api/seed/status');
                if (resp.ok) {
                    var data = await resp.json();
                    _updateProgress(data);
                }
            } catch (e) {
                console.error('seed poll error', e);
            }
        }, 2000);
    }

    function _stopPolling() {
        _polling = false;
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
    }

    // --- Actions ---
    function seedStart() {
        var config = {
            mode: document.querySelector('input[name="seedMode"]:checked') ? document.querySelector('input[name="seedMode"]:checked').value : 'fresh',
            petCount: parseInt(document.getElementById('seedPetCount').value) || 10,
            soapPerPet: parseInt(document.getElementById('seedSoapPerPet').value) || 3,
            docsPerPet: parseInt(document.getElementById('seedDocsPerPet').value) || 2,
            vitalsPerPet: parseInt(document.getElementById('seedVitalsPerPet').value) || 8,
            medsPerPet: parseInt(document.getElementById('seedMedsPerPet').value) || 3,
            photosPerPet: parseInt(document.getElementById('seedPhotosPerPet').value) || 2,
            promoEventsPerPet: parseInt(document.getElementById('seedPromoEventsPerPet').value) || 5,
            dogPct: parseInt(document.getElementById('seedDogPct').value) || 60,
            catPct: parseInt(document.getElementById('seedCatPct').value) || 30,
            rabbitPct: parseInt(document.getElementById('seedRabbitPct').value) || 10
        };

        fetchApi('/api/seed/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).then(function (resp) {
            if (resp.status === 409) {
                if (typeof showToast === 'function') showToast('Un job di seed è già in esecuzione', 'error');
                return;
            }
            return resp.json();
        }).then(function (data) {
            if (data && data.jobId) {
                if (typeof showToast === 'function') showToast('Seed avviato: ' + data.jobId, 'success');
                _startPolling();
            }
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore avvio seed: ' + e.message, 'error');
        });
    }

    function seedCancel() {
        fetchApi('/api/seed/cancel', { method: 'POST' })
            .then(function () {
                if (typeof showToast === 'function') showToast('Annullamento richiesto...', 'success');
            })
            .catch(function (e) {
                if (typeof showToast === 'function') showToast('Errore annullamento: ' + e.message, 'error');
            });
    }

    function seedWipe() {
        if (!confirm('Sei sicuro di voler cancellare TUTTI i dati seed?')) return;
        if (!confirm('Conferma: questa operazione è irreversibile. Procedere?')) return;

        fetchApi('/api/seed/wipe', { method: 'POST' })
            .then(function (resp) { return resp.json(); })
            .then(function (data) {
                if (typeof showToast === 'function') showToast('Dati seed cancellati', 'success');
            })
            .catch(function (e) {
                if (typeof showToast === 'function') showToast('Errore wipe: ' + e.message, 'error');
            });
    }

    // --- PR 15: Brand search, scrape, import ---

    function seedSearchBrand() {
        var input = document.getElementById('seedBrandInput');
        var brands = input ? input.value.trim() : '';
        if (!brands) {
            if (typeof showToast === 'function') showToast('Inserisci almeno un brand', 'error');
            return;
        }
        fetchApi('/api/seed/promo/search-brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brands: brands })
        }).then(function (resp) { return resp.json(); })
        .then(function (data) {
            _discoveredSites = (data.sites || []).map(function (s, idx) {
                return { url: s.url, name: s.name, description: s.description || '', selected: true, index: idx };
            });
            _renderBrandResults();
            var scrapeBtn = document.getElementById('seedScrapeBtn');
            if (scrapeBtn) scrapeBtn.style.display = 'inline-block';
        })
        .catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore ricerca brand: ' + e.message, 'error');
        });
    }

    function _renderBrandResults() {
        var container = document.getElementById('seedBrandResults');
        if (!container) return;
        container.style.display = 'block';
        var html = '<p style="font-size:12px;color:#666;margin-bottom:6px;">Siti trovati (' + _discoveredSites.length + '):</p>';
        _discoveredSites.forEach(function (s, idx) {
            html += '<label style="display:block;margin-bottom:4px;">'
                + '<input type="checkbox" ' + (s.selected ? 'checked' : '') + ' onchange="seedToggleSite(' + idx + ', this.checked)">'
                + ' <strong>' + (s.name || s.url) + '</strong>'
                + ' <span style="font-size:11px;color:#888;">(' + s.url + ')</span>'
                + '</label>';
        });
        container.innerHTML = html;
    }

    function seedToggleSite(idx, checked) {
        if (_discoveredSites[idx]) _discoveredSites[idx].selected = checked;
    }

    function seedAddExtraSite() {
        var input = document.getElementById('seedExtraSiteInput');
        var url = input ? input.value.trim() : '';
        if (!url) return;
        _discoveredSites.push({ url: url, name: url, description: 'URL manuale', selected: true, index: _discoveredSites.length });
        if (input) input.value = '';
        _renderBrandResults();
        var scrapeBtn = document.getElementById('seedScrapeBtn');
        if (scrapeBtn) scrapeBtn.style.display = 'inline-block';
    }

    function seedScrapeSites() {
        var selectedUrls = _discoveredSites.filter(function (s) { return s.selected; }).map(function (s) { return s.url; });
        if (selectedUrls.length === 0) {
            if (typeof showToast === 'function') showToast('Seleziona almeno un sito', 'error');
            return;
        }
        if (typeof showToast === 'function') showToast('Estrazione prodotti in corso...', 'success');
        fetchApi('/api/seed/promo/scrape-sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteUrls: selectedUrls })
        }).then(function (resp) { return resp.json(); })
        .then(function (data) {
            _discoveredProducts = (data.products || []).map(function (p, idx) {
                return Object.assign({}, p, { selected: true, index: idx });
            });
            _renderScrapeResults();
            // Show options panel and load tenants
            _showPromoOptions();
            // Show navigable preview
            _promoPreviewIndex = 0;
            _renderPromoPreview();
        })
        .catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore scraping: ' + e.message, 'error');
        });
    }

    function _showPromoOptions() {
        var optDiv = document.getElementById('seedPromoOptions');
        if (optDiv) optDiv.style.display = '';
        // Load tenants into dropdown
        fetchApi('/api/seed/promo/tenants').then(function (r) { return r.ok ? r.json() : { tenants: [] }; })
            .then(function (data) {
                var sel = document.getElementById('seedPromoTenant');
                if (!sel) return;
                sel.innerHTML = '';
                (data.tenants || []).forEach(function (t) {
                    var opt = document.createElement('option');
                    opt.value = t.tenant_id;
                    opt.textContent = t.name;
                    sel.appendChild(opt);
                });
            }).catch(function () {});
    }

    function _renderScrapeResults() {
        var container = document.getElementById('seedScrapeResults');
        if (!container) return;
        container.style.display = 'block';
        var html = '<p style="font-size:12px;color:#666;margin:8px 0;">Prodotti trovati (' + _discoveredProducts.length + '):</p>';
        _discoveredProducts.forEach(function (p, idx) {
            var speciesLabel = _seedTranslateSpecies(p.species);
            var catLabel = _CATEGORY_LABELS[p.category] || p.category || '';
            html += '<label style="display:block;margin-bottom:4px;">'
                + '<input type="checkbox" ' + (p.selected ? 'checked' : '') + ' onchange="seedToggleProduct(' + idx + ', this.checked)">'
                + ' <strong>' + _seedEscapeHtml(p.name || 'Prodotto') + '</strong>'
                + ' <span style="font-size:11px;color:#888;">(' + _seedEscapeHtml(catLabel) + ' — ' + _seedEscapeHtml(speciesLabel) + ' — ' + _seedEscapeHtml(p.source_site || '') + ')</span>'
                + '</label>';
        });
        html += '<button class="btn btn-success" onclick="seedConfirmProducts()" style="margin-top:8px;">Importa selezionati</button>';
        container.innerHTML = html;
    }

    function _renderPromoPreview() {
        var container = document.getElementById('seedPromoPreview');
        if (!container || _discoveredProducts.length === 0) return;
        container.style.display = '';
        var idx = _promoPreviewIndex;
        var p = _discoveredProducts[idx];

        var html = '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#fff;max-width:400px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<button class="btn btn-secondary" style="padding:4px 10px;" onclick="seedPreviewNav(-1)">&lt;</button>';
        html += '<span style="font-size:12px;color:#888;">Prodotto ' + (idx + 1) + ' di ' + _discoveredProducts.length + '</span>';
        html += '<button class="btn btn-secondary" style="padding:4px 10px;" onclick="seedPreviewNav(1)">&gt;</button>';
        html += '</div>';
        html += '<span style="display:inline-block;background:#22c55e;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-bottom:8px;">Consigliato per il tuo pet</span>';
        if (p.image_url) {
            html += '<div style="text-align:center;margin-bottom:8px;"><img src="' + _seedEscapeHtml(p.image_url) + '" style="max-height:120px;max-width:100%;border-radius:8px;" onerror="this.style.display=\'none\'"></div>';
        }
        html += '<div style="font-weight:700;font-size:15px;margin-bottom:4px;">' + _seedEscapeHtml(p.name || '') + '</div>';
        html += '<div style="font-size:12px;color:#666;margin-bottom:6px;">' + _seedEscapeHtml(p.description || '') + '</div>';
        html += '<div style="font-size:11px;color:#888;">';
        html += 'Specie: ' + _seedEscapeHtml(_seedTranslateSpecies(p.species)) + ' | Lifecycle: ' + _seedEscapeHtml(_seedTranslateLifecycle(p.lifecycle_target));
        html += '</div>';
        if (p.product_url) {
            html += '<div style="font-size:11px;margin-top:4px;"><a href="' + _seedEscapeHtml(p.product_url) + '" target="_blank" rel="noopener" style="color:#2563eb;">Vedi prodotto</a></div>';
        }
        html += '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;">';
        html += '<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="seedEditProduct(' + idx + ')">Modifica</button>';
        html += '<label style="font-size:12px;"><input type="checkbox" ' + (p.selected ? 'checked' : '') + ' onchange="seedToggleProduct(' + idx + ', this.checked); _renderPromoPreview()"> Includi</label>';
        html += '</div>';
        html += '</div>';
        container.innerHTML = html;
    }

    function seedPreviewNav(delta) {
        _promoPreviewIndex += delta;
        if (_promoPreviewIndex < 0) _promoPreviewIndex = _discoveredProducts.length - 1;
        if (_promoPreviewIndex >= _discoveredProducts.length) _promoPreviewIndex = 0;
        _renderPromoPreview();
    }

    function seedEditProduct(idx) {
        var p = _discoveredProducts[idx];
        if (!p) return;
        var speciesOptions = ['dog', 'cat', 'rabbit', 'ferret', 'bird', 'reptile'];
        var lifecycleOptions = ['puppy', 'adult', 'senior'];
        var categoryOptions = ['food_general', 'food_clinical', 'supplement', 'antiparasitic', 'accessory', 'service'];
        var pSpecies = Array.isArray(p.species) ? p.species : [];
        var pLifecycle = Array.isArray(p.lifecycle_target) ? p.lifecycle_target : [];

        if (typeof _showModal !== 'function') {
            alert('Modal non disponibile. Modifica dalla pagina Admin.');
            return;
        }

        _showModal('Modifica Prodotto Seed — ' + _seedEscapeHtml((p.name || '').slice(0, 40)), function (container) {
            var html = [];
            html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome</label><input type="text" id="seedEditName" value="' + _seedEscapeHtml(p.name || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Categoria</label><select id="seedEditCategory" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
            categoryOptions.forEach(function (c) {
                html.push('<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + _seedEscapeHtml(_CATEGORY_LABELS[c] || c) + '</option>');
            });
            html.push('</select></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="seedEditDesc" value="' + _seedEscapeHtml(p.description || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Prodotto</label><input type="text" id="seedEditUrl" value="' + _seedEscapeHtml(p.product_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Immagine</label><input type="text" id="seedEditImg" value="' + _seedEscapeHtml(p.image_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('</div>');

            html.push('<div style="margin-top:12px;"><label style="font-size:12px;font-weight:600;">Specie target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            speciesOptions.forEach(function (s) {
                var checked = pSpecies.indexOf(s) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="seedEditSpecies" value="' + s + '"' + checked + '>' + _seedEscapeHtml(_SPECIES_LABELS[s] || s) + '</label>');
            });
            html.push('</div></div>');

            html.push('<div style="margin-top:8px;"><label style="font-size:12px;font-weight:600;">Lifecycle target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            lifecycleOptions.forEach(function (lc) {
                var checked = pLifecycle.indexOf(lc) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="seedEditLifecycle" value="' + lc + '"' + checked + '>' + _seedEscapeHtml(_LIFECYCLE_LABELS[lc] || lc) + '</label>');
            });
            html.push('</div></div>');

            html.push('<div style="margin-top:16px;"><button class="btn btn-success" onclick="seedSaveProductEdit(' + idx + ')">Salva</button> <button class="btn btn-secondary" onclick="_closeModal()">Annulla</button></div>');
            container.innerHTML = html.join('');
        });
    }

    function seedSaveProductEdit(idx) {
        var p = _discoveredProducts[idx];
        if (!p) return;
        p.name = (document.getElementById('seedEditName') || {}).value || '';
        p.category = (document.getElementById('seedEditCategory') || {}).value || '';
        p.description = (document.getElementById('seedEditDesc') || {}).value || '';
        p.product_url = (document.getElementById('seedEditUrl') || {}).value || '';
        p.image_url = (document.getElementById('seedEditImg') || {}).value || '';

        var species = [];
        var boxes = document.querySelectorAll('.seedEditSpecies:checked');
        for (var i = 0; i < boxes.length; i++) species.push(boxes[i].value);
        p.species = species;

        var lifecycle = [];
        var lcBoxes = document.querySelectorAll('.seedEditLifecycle:checked');
        for (var j = 0; j < lcBoxes.length; j++) lifecycle.push(lcBoxes[j].value);
        p.lifecycle_target = lifecycle;

        if (typeof _closeModal === 'function') _closeModal();
        _renderScrapeResults();
        _promoPreviewIndex = idx;
        _renderPromoPreview();
        if (typeof showToast === 'function') showToast('Prodotto aggiornato.', 'success');
    }

    function seedToggleProduct(idx, checked) {
        if (_discoveredProducts[idx]) _discoveredProducts[idx].selected = checked;
    }

    function seedConfirmProducts() {
        var selected = _discoveredProducts.filter(function (p) { return p.selected; });
        if (selected.length === 0) {
            if (typeof showToast === 'function') showToast('Seleziona almeno un prodotto', 'error');
            return;
        }
        // Read tenant and mode from the options panel
        var tenantSel = document.getElementById('seedPromoTenant');
        var tenantId = tenantSel && tenantSel.value ? tenantSel.value : null;
        var modeRadio = document.querySelector('input[name="seedPromoMode"]:checked');
        var mode = modeRadio ? modeRadio.value : 'append';

        fetchApi('/api/seed/promo/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: selected, tenantId: tenantId, mode: mode })
        }).then(function (resp) { return resp.json(); })
        .then(function (data) {
            var msg = 'Importati ' + (data.imported || 0) + ' prodotti!';
            if (data.deleted > 0) msg += ' (eliminati ' + data.deleted + ' precedenti)';
            if (typeof showToast === 'function') showToast(msg, 'success');
        })
        .catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore importazione: ' + e.message, 'error');
        });
    }

    // --- Init: attach input listeners for estimate ---
    function _initEstimateListeners() {
        var ids = ['seedPetCount', 'seedSoapPerPet', 'seedDocsPerPet'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', _updateEstimate);
        });
        _updateEstimate();
    }

    // Auto-init when page becomes visible
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(_initEstimateListeners, 500);
        });
    }

    // --- Expose globals ---
    global.seedStart = seedStart;
    global.seedCancel = seedCancel;
    global.seedWipe = seedWipe;
    global.seedSearchBrand = seedSearchBrand;
    global.seedAddExtraSite = seedAddExtraSite;
    global.seedScrapeSites = seedScrapeSites;
    global.seedToggleSite = seedToggleSite;
    global.seedToggleProduct = seedToggleProduct;
    global.seedConfirmProducts = seedConfirmProducts;
    global.seedPreviewNav = seedPreviewNav;
    global.seedEditProduct = seedEditProduct;
    global.seedSaveProductEdit = seedSaveProductEdit;
    global._renderPromoPreview = _renderPromoPreview;

})(typeof window !== 'undefined' ? window : this);
