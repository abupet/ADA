// app-nutrition.js v1.0
// Multi-service: Nutrition plan cards for pet owner and vet validation

/**
 * ADA Nutrition Module v1
 *
 * Globals expected:
 *   fetchApi(path, options)   - authenticated fetch wrapper (config.js)
 *   showToast(message, type)  - toast notification (app-core.js)
 *   InlineLoader              - loading UI component (app-loading.js)
 *   getActiveRole()           - returns 'veterinario' | 'proprietario'
 *   getCurrentPetId()         - current pet id (app-pets.js)
 *
 * Globals exposed:
 *   renderNutritionSlot(containerId, petId)       -> void
 *   renderNutritionValidation(containerId, petId)  -> void
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var NUTRITION_CSS_INJECTED = false;
    var NUTRITION_COLOR = '#16a34a';
    var NUTRITION_COLOR_HOVER = '#15803d';
    var NUTRITION_COLOR_LIGHT = '#f0fdf4';
    var NUTRITION_BORDER = '#bbf7d0';

    // =========================================================================
    // Generic modal helper (re-usable within nutrition module)
    // =========================================================================

    function _nutritionShowModal(title, renderFn) {
        var existing = document.getElementById('nutrition-modal-overlay');
        if (existing) existing.parentNode.removeChild(existing);

        var overlay = document.createElement('div');
        overlay.id = 'nutrition-modal-overlay';
        overlay.className = 'modal active';
        overlay.style.zIndex = '3100';

        var content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '600px';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
        header.innerHTML = '<h3 style="margin:0;color:#1e3a5f;font-size:18px;">' + _escapeHtml(title) + '</h3>' +
            '<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" ' +
            'style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;padding:4px 8px;">✕</button>';
        content.appendChild(header);

        var body = document.createElement('div');
        body.id = 'nutrition-modal-body';
        content.appendChild(body);

        overlay.appendChild(content);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.classList.remove('active');
        });
        document.body.appendChild(overlay);

        if (typeof renderFn === 'function') renderFn(body);
    }

    function _nutritionCloseModal() {
        var overlay = document.getElementById('nutrition-modal-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function _fnExists(name) {
        return typeof global[name] === 'function';
    }

    // =========================================================================
    // CSS injection
    // =========================================================================

    function _injectNutritionStyles() {
        if (NUTRITION_CSS_INJECTED) return;
        NUTRITION_CSS_INJECTED = true;

        var css = [
            '.nutrition-slot { margin: 16px 0; }',
            '.nutrition-card {',
            '  background: ' + NUTRITION_COLOR_LIGHT + ';',
            '  border: 1px solid ' + NUTRITION_BORDER + ';',
            '  border-radius: 12px;',
            '  padding: 18px 20px;',
            '  box-shadow: 0 2px 8px rgba(0,0,0,0.06);',
            '  position: relative;',
            '  transition: opacity 0.3s ease;',
            '}',
            '.nutrition-card--hidden { display: none; }',
            '.nutrition-badge {',
            '  display: inline-block; font-size: 10px; font-weight: 700;',
            '  text-transform: uppercase; letter-spacing: 0.5px;',
            '  color: ' + NUTRITION_COLOR + '; background: #dcfce7;',
            '  padding: 2px 8px; border-radius: 6px; margin-bottom: 10px;',
            '}',
            '.nutrition-title {',
            '  font-size: 16px; font-weight: 700; color: #1e3a5f;',
            '  margin-bottom: 12px; display: flex; align-items: center; gap: 8px;',
            '}',
            '.nutrition-kcal {',
            '  font-size: 14px; font-weight: 600; color: ' + NUTRITION_COLOR + ';',
            '  margin-bottom: 10px;',
            '}',
            '.nutrition-products { margin-bottom: 12px; }',
            '.nutrition-product-item {',
            '  font-size: 13px; color: #444; padding: 4px 0;',
            '  border-bottom: 1px solid #e5e7eb;',
            '}',
            '.nutrition-product-item:last-child { border-bottom: none; }',
            '.nutrition-product-name { font-weight: 600; color: #1e3a5f; }',
            '.nutrition-product-dose { color: #666; margin-left: 8px; }',
            '.nutrition-notes {',
            '  font-size: 13px; color: #555; line-height: 1.6;',
            '  margin-bottom: 12px; font-style: italic;',
            '}',
            '.nutrition-status {',
            '  display: inline-block; font-size: 11px; font-weight: 600;',
            '  padding: 3px 10px; border-radius: 6px; margin-bottom: 12px;',
            '}',
            '.nutrition-status--validated { background: #dcfce7; color: ' + NUTRITION_COLOR + '; }',
            '.nutrition-status--pending { background: #fef3c7; color: #b45309; }',
            '.nutrition-status--rejected { background: #fee2e2; color: #dc2626; }',
            '.nutrition-actions {',
            '  display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px;',
            '}',
            '.nutrition-btn {',
            '  display: inline-block; padding: 8px 18px; font-size: 13px;',
            '  font-weight: 600; border: none; border-radius: 8px;',
            '  cursor: pointer; transition: background 0.15s, color 0.15s;',
            '}',
            '.nutrition-btn--primary { background: ' + NUTRITION_COLOR + '; color: #fff; }',
            '.nutrition-btn--primary:hover { background: ' + NUTRITION_COLOR_HOVER + '; }',
            '.nutrition-btn--primary:focus-visible { outline: 2px solid ' + NUTRITION_COLOR + '; outline-offset: 2px; }',
            '.nutrition-btn--secondary { background: #1e3a5f; color: #fff; }',
            '.nutrition-btn--secondary:hover { background: #2d5a87; }',
            '.nutrition-btn--secondary:focus-visible { outline: 2px solid #1e3a5f; outline-offset: 2px; }',
            '.nutrition-btn--outline { background: transparent; color: #555; border: 1px solid #d1d5db; }',
            '.nutrition-btn--outline:hover { background: #f9fafb; color: #333; }',
            '.nutrition-btn--outline:focus-visible { outline: 2px solid #888; outline-offset: 2px; }',
            '.nutrition-btn--danger { background: #dc2626; color: #fff; }',
            '.nutrition-btn--danger:hover { background: #b91c1c; }',
            '.nutrition-btn--danger:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }',
            '.nutrition-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
            '.nutrition-empty {',
            '  font-size: 13px; color: #888; text-align: center; padding: 16px;',
            '}',
            '.nutrition-loader-slot { min-height: 40px; }',
            '.nutrition-validation-card {',
            '  background: #fffbeb; border: 1px solid #fde68a;',
            '  border-radius: 12px; padding: 18px 20px;',
            '  box-shadow: 0 2px 8px rgba(0,0,0,0.06);',
            '  margin-top: 12px;',
            '}',
            '.nutrition-validation-title {',
            '  font-size: 15px; font-weight: 700; color: #92400e;',
            '  margin-bottom: 10px;',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-nutrition-styles', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // =========================================================================
    // renderNutritionSlot — Pet owner card
    // =========================================================================

    /**
     * Render a nutrition plan card for the pet owner.
     * Fetches from /api/nutrition/plan/<petId>
     */
    function renderNutritionSlot(containerId, petId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectNutritionStyles();

        if (!petId) {
            container.innerHTML = '';
            return;
        }

        var slotId = containerId + '-nutrition-slot';
        var loaderId = containerId + '-nutrition-loader';
        var cardId = containerId + '-nutrition-card';

        // Remove existing
        var existingSlot = document.getElementById(slotId);
        if (existingSlot) existingSlot.parentNode.removeChild(existingSlot);

        var slot = document.createElement('div');
        slot.id = slotId;
        slot.className = 'nutrition-slot';

        var loaderTarget = document.createElement('div');
        loaderTarget.id = loaderId;
        loaderTarget.className = 'nutrition-loader-slot';
        slot.appendChild(loaderTarget);

        var cardEl = document.createElement('div');
        cardEl.id = cardId;
        cardEl.className = 'nutrition-card nutrition-card--hidden';
        slot.appendChild(cardEl);

        container.appendChild(slot);

        var loader = null;
        if (typeof InlineLoader === 'function') {
            loader = new InlineLoader({
                containerId: loaderId,
                onRetry: function () {
                    _fetchNutritionPlan(loader, cardEl, petId);
                }
            });
        }

        _fetchNutritionPlan(loader, cardEl, petId);
    }

    function _fetchNutritionPlan(loader, cardEl, petId) {
        var fetchFn = function (signal) {
            return new Promise(function (resolve, reject) {
                if (signal && signal.aborted) {
                    return reject(new DOMException('Aborted', 'AbortError'));
                }

                var onAbort = function () {
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                if (signal) signal.addEventListener('abort', onAbort, { once: true });

                fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(petId)), { method: 'GET' })
                    .then(function (response) {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        if (!response.ok) {
                            _renderNutritionEmpty(cardEl);
                            resolve();
                            return;
                        }
                        return response.json();
                    })
                    .then(function (data) {
                        if (data) {
                            _renderNutritionCard(cardEl, data, petId);
                        }
                        resolve();
                    })
                    .catch(function (err) {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        if (err && err.name === 'AbortError') {
                            reject(err);
                            return;
                        }
                        _renderNutritionEmpty(cardEl);
                        resolve();
                    });
            });
        };

        if (loader) {
            loader.start(fetchFn);
        } else {
            fetchFn(null);
        }
    }

    function _renderNutritionEmpty(cardEl) {
        if (!cardEl) return;
        cardEl.innerHTML = '<div class="nutrition-empty">Nessun piano nutrizionale disponibile</div>';
        cardEl.classList.remove('nutrition-card--hidden');
    }

    function _renderNutritionCard(cardEl, plan, petId) {
        if (!cardEl) return;

        if (!plan || !plan.daily_kcal) {
            _renderNutritionEmpty(cardEl);
            return;
        }

        var html = [];

        // Badge
        html.push('<span class="nutrition-badge">Piano Nutrizionale</span>');

        // Title
        html.push('<div class="nutrition-title">Piano Nutrizionale</div>');

        // Daily kcal
        html.push('<div class="nutrition-kcal">Fabbisogno giornaliero: ' + _escapeHtml(String(plan.daily_kcal)) + ' kcal</div>');

        // Product list with doses
        var products = plan.products || [];
        if (products.length > 0) {
            html.push('<div class="nutrition-products">');
            for (var i = 0; i < products.length; i++) {
                var p = products[i];
                html.push('<div class="nutrition-product-item">');
                html.push('  <span class="nutrition-product-name">' + _escapeHtml(p.name || 'Prodotto') + '</span>');
                if (p.dose) {
                    html.push('  <span class="nutrition-product-dose">' + _escapeHtml(p.dose) + '</span>');
                }
                html.push('</div>');
            }
            html.push('</div>');
        }

        // Clinical notes
        if (plan.clinical_notes) {
            html.push('<div class="nutrition-notes">' + _escapeHtml(plan.clinical_notes) + '</div>');
        }

        // Validation status
        var status = plan.validation_status || plan.status || 'pending';
        var statusLabel = status === 'validated' ? 'Validato dal veterinario'
            : status === 'rejected' ? 'Rifiutato'
            : 'In attesa di validazione';
        var statusClass = status === 'validated' ? 'nutrition-status--validated'
            : status === 'rejected' ? 'nutrition-status--rejected'
            : 'nutrition-status--pending';
        html.push('<div class="nutrition-status ' + statusClass + '">' + _escapeHtml(statusLabel) + '</div>');

        // Action buttons
        html.push('<div class="nutrition-actions">');
        html.push('  <button type="button" class="nutrition-btn nutrition-btn--primary" data-nutrition-action="order">Ordina prodotti</button>');
        html.push('  <button type="button" class="nutrition-btn nutrition-btn--secondary" data-nutrition-action="details">Dettagli</button>');
        html.push('  <button type="button" class="nutrition-btn nutrition-btn--outline" data-nutrition-action="ask-vet">Ne parlo col vet</button>');
        html.push('</div>');
        if (typeof debugLogEnabled !== 'undefined' && debugLogEnabled) {
            var _nutDescParts = ['Piano Nutrizionale - Fabbisogno giornaliero: ' + plan.daily_kcal + ' kcal.'];
            if (products.length > 0) { _nutDescParts.push('Prodotti: ' + products.map(function(p) { return (p.name || 'Prodotto') + (p.dose ? ' (' + p.dose + ')' : ''); }).join(', ') + '.'); }
            if (plan.clinical_notes) { _nutDescParts.push('Note: ' + plan.clinical_notes); }
            var _nutDesc = _nutDescParts.join(' ').replace(/'/g, "\\'");
            html.push('<div style="margin-top:8px;text-align:center;">');
            html.push('  <button type="button" class="nutrition-btn nutrition-btn--secondary" style="font-size:11px;padding:4px 12px;" onclick="if(typeof _showPromoAnalysis===\'function\')_showPromoAnalysis(null,\'' + _escapeHtml(petId) + '\',\'' + _nutDesc + '\')">🔍 Analisi raccomandazione</button>');
            html.push('</div>');
        }

        cardEl.innerHTML = html.join('\n');
        cardEl.classList.remove('nutrition-card--hidden');

        // Bind button events
        var orderBtn = cardEl.querySelector('[data-nutrition-action="order"]');
        var detailsBtn = cardEl.querySelector('[data-nutrition-action="details"]');
        var askVetBtn = cardEl.querySelector('[data-nutrition-action="ask-vet"]');

        if (orderBtn) {
            orderBtn.addEventListener('click', function () {
                var products = plan.products || [];
                if (products.length === 0) {
                    if (_fnExists('showToast')) showToast('Nessun prodotto nel piano nutrizionale.', 'warning');
                    return;
                }
                _nutritionShowModal('Ordina Prodotti', function(body) {
                    var h = [];
                    h.push('<div style="background:#fef3c7;color:#92400e;font-size:12px;text-align:center;padding:6px 12px;border-radius:6px;margin-bottom:16px;">Pagina simulata — nessun acquisto reale verrà effettuato</div>');
                    h.push('<div style="margin-bottom:16px;">');
                    for (var i = 0; i < products.length; i++) {
                        var p = products[i];
                        h.push('<div style="display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:8px;">');
                        h.push('<div>');
                        h.push('<div style="font-weight:600;color:#1e3a5f;">' + _escapeHtml(p.name || 'Prodotto') + '</div>');
                        if (p.daily_dose || p.dose) {
                            h.push('<div style="font-size:12px;color:#888;">Dose: ' + _escapeHtml(p.daily_dose || p.dose) + '</div>');
                        }
                        h.push('</div>');
                        h.push('<label style="font-size:13px;color:#555;">Qtà: <input type="number" value="1" min="1" max="10" style="width:50px;padding:4px;border:1px solid #d1d5db;border-radius:6px;text-align:center;"></label>');
                        h.push('</div>');
                    }
                    h.push('</div>');
                    h.push('<button type="button" style="width:100%;padding:12px;background:' + NUTRITION_COLOR + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.6;cursor:not-allowed;" disabled>Conferma Ordine (simulato)</button>');
                    h.push('<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" ' +
                        'style="width:100%;margin-top:8px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>');
                    body.innerHTML = h.join('');
                });
            });
        }

        if (detailsBtn) {
            detailsBtn.addEventListener('click', function () {
                _nutritionShowModal('Dettagli Piano Nutrizionale', function(body) {
                    var h = [];
                    h.push('<div style="margin-bottom:16px;">');
                    h.push('<div style="font-size:24px;font-weight:700;color:' + NUTRITION_COLOR + ';margin-bottom:4px;">' + _escapeHtml(String(plan.daily_kcal || 0)) + ' kcal/giorno</div>');
                    if (plan.meals_per_day) {
                        h.push('<div style="font-size:14px;color:#666;">Pasti consigliati: ' + _escapeHtml(String(plan.meals_per_day)) + ' al giorno</div>');
                    }
                    h.push('</div>');

                    // Products with doses
                    var products = plan.products || [];
                    if (products.length > 0) {
                        h.push('<div style="margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Prodotti consigliati</div>');
                        for (var i = 0; i < products.length; i++) {
                            var p = products[i];
                            h.push('<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">');
                            h.push('<div style="font-weight:600;color:#1e3a5f;">' + _escapeHtml(p.name || 'Prodotto') + '</div>');
                            if (p.daily_dose || p.dose) {
                                h.push('<div style="font-size:13px;color:#555;margin-top:2px;">Dose: ' + _escapeHtml(p.daily_dose || p.dose) + '</div>');
                            }
                            if (p.notes) {
                                h.push('<div style="font-size:12px;color:#888;margin-top:2px;font-style:italic;">' + _escapeHtml(p.notes) + '</div>');
                            }
                            h.push('</div>');
                        }
                        h.push('</div>');
                    }

                    // Supplements
                    var supplements = plan.supplements || [];
                    if (supplements.length > 0) {
                        h.push('<div style="margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Integratori</div>');
                        for (var s = 0; s < supplements.length; s++) {
                            var sup = supplements[s];
                            h.push('<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:6px;">');
                            h.push('<div style="font-weight:600;color:#1e3a5f;">' + _escapeHtml(sup.name || '') + '</div>');
                            if (sup.dose) h.push('<div style="font-size:13px;color:#555;">Dose: ' + _escapeHtml(sup.dose) + '</div>');
                            if (sup.reason) h.push('<div style="font-size:12px;color:#888;font-style:italic;">' + _escapeHtml(sup.reason) + '</div>');
                            h.push('</div>');
                        }
                        h.push('</div>');
                    }

                    // Restrictions
                    var restrictions = plan.restrictions || [];
                    if (restrictions.length > 0) {
                        h.push('<div style="margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:14px;color:#dc2626;margin-bottom:8px;">Restrizioni</div>');
                        for (var r = 0; r < restrictions.length; r++) {
                            h.push('<div style="font-size:13px;color:#555;padding:4px 0;">' + _escapeHtml(restrictions[r]) + '</div>');
                        }
                        h.push('</div>');
                    }

                    // Clinical notes
                    if (plan.clinical_notes) {
                        h.push('<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:13px;color:#92400e;margin-bottom:4px;">Note cliniche</div>');
                        h.push('<div style="font-size:13px;color:#78350f;line-height:1.5;">' + _escapeHtml(plan.clinical_notes) + '</div>');
                        h.push('</div>');
                    }

                    // Status
                    var status = plan.validation_status || plan.status || 'pending';
                    var statusLabel = status === 'validated' ? 'Validato dal veterinario' : status === 'rejected' ? 'Rifiutato' : 'In attesa di validazione';
                    h.push('<div style="text-align:center;font-size:13px;font-weight:600;color:#666;padding:8px 0;">' + statusLabel + '</div>');

                    h.push('<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" ' +
                        'style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>');

                    body.innerHTML = h.join('');
                });
            });
        }

        if (askVetBtn) {
            askVetBtn.addEventListener('click', function () {
                // Navigate to communication page and pre-fill subject
                if (typeof navigateToPage === 'function') {
                    // Store context for communication pre-fill
                    window._nutritionCommContext = {
                        petId: petId,
                        subject: 'Piano Nutrizionale',
                        message: 'Vorrei discutere del piano nutrizionale' +
                            (plan.daily_kcal ? ' (' + plan.daily_kcal + ' kcal/giorno)' : '') +
                            ' per il mio pet. ' +
                            (plan.clinical_notes ? 'Note: ' + plan.clinical_notes : '')
                    };
                    navigateToPage('communication');
                    // Try to trigger new conversation form after navigation
                    setTimeout(function() {
                        var newBtn = document.querySelector('[data-comm-action="new"]');
                        if (newBtn) newBtn.click();
                        setTimeout(function() {
                            var subjectEl = document.getElementById('comm-new-subject');
                            var msgEl = document.getElementById('comm-new-first-message');
                            if (subjectEl && window._nutritionCommContext) subjectEl.value = window._nutritionCommContext.subject;
                            if (msgEl && window._nutritionCommContext) msgEl.value = window._nutritionCommContext.message;
                            window._nutritionCommContext = null;
                        }, 400);
                    }, 300);
                } else {
                    if (_fnExists('showToast')) showToast('Naviga alla sezione Comunicazione per contattare il veterinario.', 'info');
                }
            });
        }
    }

    // =========================================================================
    // renderNutritionValidation — Vet validation card
    // =========================================================================

    /**
     * Render a pending nutrition plan validation card for the veterinario.
     * Fetches from /api/nutrition/plan/<petId>/pending
     */
    function renderNutritionValidation(containerId, petId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectNutritionStyles();

        // Only for veterinario role
        if (_fnExists('getActiveRole')) {
            try {
                if (getActiveRole() !== 'veterinario') return;
            } catch (_) { return; }
        } else {
            return;
        }

        if (!petId) return;

        var validationId = containerId + '-nutrition-validation';

        // Remove existing validation card
        var existing = document.getElementById(validationId);
        if (existing) existing.parentNode.removeChild(existing);

        var validationEl = document.createElement('div');
        validationEl.id = validationId;

        container.appendChild(validationEl);

        fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(petId)) + '/pending', { method: 'GET' })
            .then(function (response) {
                if (!response.ok) {
                    validationEl.innerHTML = '';
                    return null;
                }
                return response.json();
            })
            .then(function (data) {
                if (!data || !data.plan_id) {
                    // No pending plan — offer generate button
                    validationEl.innerHTML = '<div class="nutrition-validation-card" style="text-align:center;">' +
                        '<div class="nutrition-validation-title" style="color:#1e3a5f;font-size:14px;">Nessun piano nutrizionale pending</div>' +
                        '<button type="button" class="nutrition-btn nutrition-btn--primary" id="nutrition-generate-btn-' + petId + '" style="margin-top:10px;">Genera piano AI</button>' +
                        '</div>';
                    var genBtn = document.getElementById('nutrition-generate-btn-' + petId);
                    if (genBtn) {
                        genBtn.addEventListener('click', function() {
                            genBtn.disabled = true;
                            genBtn.textContent = 'Generazione in corso...';
                            var tenantId = (typeof getJwtTenantId === 'function') ? getJwtTenantId() : null;
                            if (!tenantId) {
                                if (_fnExists('showToast')) showToast('Tenant ID non disponibile', 'error');
                                genBtn.disabled = false;
                                genBtn.textContent = 'Genera piano AI';
                                return;
                            }
                            fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(petId)) + '/generate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tenant_id: tenantId })
                            }).then(function(r) {
                                if (r.ok) return r.json();
                                throw new Error('generate failed');
                            }).then(function(result) {
                                if (_fnExists('showToast')) showToast('Piano nutrizionale generato! In attesa di validazione.', 'success');
                                // Re-render validation card with the new pending plan
                                renderNutritionValidation(containerId, petId);
                            }).catch(function(err) {
                                if (_fnExists('showToast')) showToast('Errore nella generazione del piano.', 'error');
                                genBtn.disabled = false;
                                genBtn.textContent = 'Genera piano AI';
                            });
                        });
                    }
                    return;
                }
                _renderValidationCard(validationEl, data, petId);
            })
            .catch(function () {
                validationEl.innerHTML = '';
            });
    }

    function _renderValidationCard(el, plan, petId) {
        if (!el || !plan) return;

        var planId = plan.plan_id || plan.id;

        var html = [];
        html.push('<div class="nutrition-validation-card">');
        html.push('  <div class="nutrition-validation-title">Piano nutrizionale in attesa di validazione</div>');

        // Daily kcal
        if (plan.daily_kcal) {
            html.push('  <div class="nutrition-kcal">Fabbisogno: ' + _escapeHtml(String(plan.daily_kcal)) + ' kcal/giorno</div>');
        }

        // Product list
        var products = plan.products || [];
        if (products.length > 0) {
            html.push('  <div class="nutrition-products">');
            for (var i = 0; i < products.length; i++) {
                var p = products[i];
                html.push('    <div class="nutrition-product-item">');
                html.push('      <span class="nutrition-product-name">' + _escapeHtml(p.name || 'Prodotto') + '</span>');
                if (p.dose) {
                    html.push('      <span class="nutrition-product-dose">' + _escapeHtml(p.dose) + '</span>');
                }
                html.push('    </div>');
            }
            html.push('  </div>');
        }

        // Clinical notes
        if (plan.clinical_notes) {
            html.push('  <div class="nutrition-notes">' + _escapeHtml(plan.clinical_notes) + '</div>');
        }

        // Validation actions
        html.push('  <div class="nutrition-actions">');
        html.push('    <button type="button" class="nutrition-btn nutrition-btn--primary" data-validation-action="validate">Valida</button>');
        html.push('    <button type="button" class="nutrition-btn nutrition-btn--secondary" data-validation-action="modify">Modifica</button>');
        html.push('    <button type="button" class="nutrition-btn nutrition-btn--danger" data-validation-action="reject">Rifiuta</button>');
        html.push('  </div>');
        html.push('</div>');

        el.innerHTML = html.join('\n');

        // Bind validation events
        var validateBtn = el.querySelector('[data-validation-action="validate"]');
        var modifyBtn = el.querySelector('[data-validation-action="modify"]');
        var rejectBtn = el.querySelector('[data-validation-action="reject"]');

        if (validateBtn) {
            validateBtn.addEventListener('click', function () {
                validateBtn.disabled = true;
                fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(planId)) + '/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pet_id: String(petId) })
                }).then(function (r) {
                    if (r.ok) {
                        if (_fnExists('showToast')) showToast('Piano nutrizionale validato.', 'success');
                        el.innerHTML = '<div class="nutrition-validation-card" style="text-align:center;color:' + NUTRITION_COLOR + ';font-weight:600;padding:16px;">Piano validato con successo.</div>';
                    } else {
                        validateBtn.disabled = false;
                        if (_fnExists('showToast')) showToast('Errore nella validazione.', 'error');
                    }
                }).catch(function () {
                    validateBtn.disabled = false;
                    if (_fnExists('showToast')) showToast('Errore di rete.', 'error');
                });
            });
        }

        if (modifyBtn) {
            modifyBtn.addEventListener('click', function () {
                var planData = plan.plan_data || plan;
                var dailyKcal = planData.daily_kcal || plan.daily_kcal || '';
                var mealsPerDay = planData.meals_per_day || plan.meals_per_day || 2;
                var clinicalNotes = planData.clinical_notes || plan.clinical_notes || '';

                _nutritionShowModal('Modifica Piano Nutrizionale', function(body) {
                    var h = [];
                    h.push('<div style="margin-bottom:14px;">');
                    h.push('<label style="font-weight:600;font-size:13px;color:#1e3a5f;display:block;margin-bottom:4px;">Kcal giornaliere</label>');
                    h.push('<input type="number" id="nut-edit-kcal" value="' + _escapeHtml(String(dailyKcal)) + '" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;">');
                    h.push('</div>');

                    h.push('<div style="margin-bottom:14px;">');
                    h.push('<label style="font-weight:600;font-size:13px;color:#1e3a5f;display:block;margin-bottom:4px;">Pasti al giorno</label>');
                    h.push('<input type="number" id="nut-edit-meals" value="' + _escapeHtml(String(mealsPerDay)) + '" min="1" max="6" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;">');
                    h.push('</div>');

                    h.push('<div style="margin-bottom:14px;">');
                    h.push('<label style="font-weight:600;font-size:13px;color:#1e3a5f;display:block;margin-bottom:4px;">Note cliniche</label>');
                    h.push('<textarea id="nut-edit-notes" rows="4" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;resize:vertical;">' + _escapeHtml(clinicalNotes) + '</textarea>');
                    h.push('</div>');

                    h.push('<div style="display:flex;gap:8px;">');
                    h.push('<button type="button" id="nut-edit-save" class="nutrition-btn nutrition-btn--primary" style="flex:1;padding:10px;">Salva modifiche</button>');
                    h.push('<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" class="nutrition-btn nutrition-btn--outline" style="flex:1;padding:10px;">Annulla</button>');
                    h.push('</div>');

                    body.innerHTML = h.join('');

                    var saveBtn = document.getElementById('nut-edit-save');
                    if (saveBtn) {
                        saveBtn.addEventListener('click', function() {
                            saveBtn.disabled = true;
                            saveBtn.textContent = 'Salvataggio...';
                            var updatedData = Object.assign({}, planData, {
                                daily_kcal: Number(document.getElementById('nut-edit-kcal').value) || 0,
                                meals_per_day: Number(document.getElementById('nut-edit-meals').value) || 2,
                                clinical_notes: (document.getElementById('nut-edit-notes').value || '').trim(),
                            });
                            fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(planId)), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ plan_data: updatedData })
                            }).then(function(r) {
                                if (r.ok) {
                                    if (_fnExists('showToast')) showToast('Piano nutrizionale aggiornato.', 'success');
                                    _nutritionCloseModal();
                                    // Re-render the validation card
                                    if (typeof renderNutritionValidation === 'function' && el && el.parentNode) {
                                        var parentId = el.parentNode.id || (el.closest && el.closest('[id]') ? el.closest('[id]').id : null);
                                        if (parentId) renderNutritionValidation(parentId, petId);
                                    }
                                } else {
                                    if (_fnExists('showToast')) showToast('Errore nel salvataggio.', 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = 'Salva modifiche';
                                }
                            }).catch(function() {
                                if (_fnExists('showToast')) showToast('Errore di rete.', 'error');
                                saveBtn.disabled = false;
                                saveBtn.textContent = 'Salva modifiche';
                            });
                        });
                    }
                });
            });
        }

        if (rejectBtn) {
            rejectBtn.addEventListener('click', function () {
                rejectBtn.disabled = true;
                fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(planId)) + '/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pet_id: String(petId) })
                }).then(function (r) {
                    if (r.ok) {
                        if (_fnExists('showToast')) showToast('Piano nutrizionale rifiutato.', 'success');
                        el.innerHTML = '<div class="nutrition-validation-card" style="text-align:center;color:#dc2626;font-weight:600;padding:16px;">Piano rifiutato.</div>';
                    } else {
                        rejectBtn.disabled = false;
                        if (_fnExists('showToast')) showToast('Errore nel rifiuto.', 'error');
                    }
                }).catch(function () {
                    rejectBtn.disabled = false;
                    if (_fnExists('showToast')) showToast('Errore di rete.', 'error');
                });
            });
        }
    }

    // =========================================================================
    // Expose public API
    // =========================================================================

    global.renderNutritionSlot       = renderNutritionSlot;
    global.renderNutritionValidation = renderNutritionValidation;
    global._nutritionShowModal       = _nutritionShowModal;
    global._nutritionCloseModal      = _nutritionCloseModal;

})(typeof window !== 'undefined' ? window : this);
