// app-seed.js v1.0
// Seed Engine frontend controller — PR 14
// Visible only when debugLogEnabled === true

(function (global) {
    'use strict';

    var _polling = false;
    var _pollTimer = null;
    var _discoveredSites = [];
    var _discoveredProducts = [];

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
        })
        .catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore scraping: ' + e.message, 'error');
        });
    }

    function _renderScrapeResults() {
        var container = document.getElementById('seedScrapeResults');
        if (!container) return;
        container.style.display = 'block';
        var html = '<p style="font-size:12px;color:#666;margin:8px 0;">Prodotti trovati (' + _discoveredProducts.length + '):</p>';
        _discoveredProducts.forEach(function (p, idx) {
            html += '<label style="display:block;margin-bottom:4px;">'
                + '<input type="checkbox" ' + (p.selected ? 'checked' : '') + ' onchange="seedToggleProduct(' + idx + ', this.checked)">'
                + ' <strong>' + (p.name || 'Prodotto') + '</strong>'
                + ' <span style="font-size:11px;color:#888;">(' + (p.category || '') + ' — ' + (p.source_site || '') + ')</span>'
                + '</label>';
        });
        html += '<button class="btn btn-success" onclick="seedConfirmProducts()" style="margin-top:8px;">✅ Importa selezionati</button>';
        container.innerHTML = html;
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
        fetchApi('/api/seed/promo/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: selected })
        }).then(function (resp) { return resp.json(); })
        .then(function (data) {
            if (typeof showToast === 'function') showToast('Importati ' + (data.imported || 0) + ' prodotti!', 'success');
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

})(typeof window !== 'undefined' ? window : this);
