// app-promo.js v2.0
// PR 3: Full promo delivery system with explanation, consent, vet flag, batch events

/**
 * ADA Promo / Recommendation System v2
 *
 * Globals expected:
 *   fetchApi(path, options)   - authenticated fetch wrapper (config.js)
 *   showToast(message, type)  - toast notification (app-core.js)
 *   InlineLoader              - loading UI component (app-loading.js)
 *   getActiveRole()           - returns 'veterinario' | 'proprietario'
 *   getCurrentPetId()         - current pet id (app-pets.js)
 *
 * Globals exposed (backward compatible):
 *   loadPromoRecommendation(petId, context)  -> Promise<recommendation|null>
 *   trackPromoEvent(type, productId, petId, metadata) -> void
 *   renderPromoSlot(containerId, context)    -> void
 *
 * New globals:
 *   renderPromoDetail(containerId, recommendation) -> void
 *   renderConsentBanner(containerId) -> void
 *   renderConsentCenter(containerId) -> void
 *   renderVetFlagButton(containerId, petId) -> void
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var PROMO_CSS_INJECTED = false;
    var PROMO_DISMISSED_KEY = 'ada_promo_dismissed';
    var _eventBuffer = [];
    var _flushTimer = null;
    var _sessionImpressions = {}; // { "context:petId": count }
    var _lastRenderedPromoItemId = null; // tracks last rendered promo for vet flag

    // =========================================================================
    // Mock data (backward compat)
    // =========================================================================

    var MOCK_PRODUCTS = [
        {
            productId: 'mock-001',
            name: 'NutriPet Balance - Integratore Articolazioni',
            category: 'integratore',
            explanation: 'Basandoci sul profilo del tuo pet, questo integratore a base di glucosamina e condroitina potrebbe supportare la salute articolare, specialmente durante la crescita o in soggetti di taglia medio-grande.',
            infoUrl: 'https://example.com/nutripet-balance',
            imageUrl: null
        },
        {
            productId: 'mock-002',
            name: 'DermaShield - Shampoo Dermatologico Lenitivo',
            category: 'dermatologia',
            explanation: 'Uno shampoo formulato con avena colloidale e aloe vera, ideale per pelli sensibili o soggette a irritazioni stagionali. Consigliato dal veterinario per il mantenimento della cute sana.',
            infoUrl: 'https://example.com/dermashield',
            imageUrl: null
        }
    ];

    // =========================================================================
    // Helpers
    // =========================================================================

    function _getDismissedIds() {
        try {
            var raw = localStorage.getItem(PROMO_DISMISSED_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (_) { /* ignore */ }
        return [];
    }

    function _addDismissedId(productId) {
        try {
            var ids = _getDismissedIds();
            if (ids.indexOf(productId) === -1) {
                ids.push(productId);
                if (ids.length > 200) ids = ids.slice(-200);
                localStorage.setItem(PROMO_DISMISSED_KEY, JSON.stringify(ids));
            }
        } catch (_) { /* ignore */ }
    }

    function _pickMockProduct(petId) {
        var dismissed = _getDismissedIds();
        var candidates = MOCK_PRODUCTS.filter(function (p) {
            return dismissed.indexOf(p.productId) === -1;
        });
        if (candidates.length === 0) return null;
        var index = 0;
        if (petId) {
            var hash = 0;
            var s = String(petId);
            for (var i = 0; i < s.length; i++) {
                hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
            }
            index = Math.abs(hash) % candidates.length;
        }
        return candidates[index];
    }

    function _fnExists(name) {
        return typeof global[name] === 'function';
    }

    function _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // CSS injection
    // =========================================================================

    function _injectPromoStyles() {
        if (PROMO_CSS_INJECTED) return;
        PROMO_CSS_INJECTED = true;

        var css = [
            '.promo-slot { margin: 16px 0; }',
            '.promo-card {',
            '  background: #fffbf0;',
            '  border: 1px solid #f0e4c8;',
            '  border-radius: 12px;',
            '  padding: 18px 20px;',
            '  box-shadow: 0 2px 8px rgba(0,0,0,0.06);',
            '  position: relative;',
            '  transition: opacity 0.3s ease, max-height 0.3s ease;',
            '}',
            '.promo-card--hidden { display: none; }',
            '.promo-badge {',
            '  display: inline-block; font-size: 10px; font-weight: 700;',
            '  text-transform: uppercase; letter-spacing: 0.5px;',
            '  color: #b45309; background: #fef3c7;',
            '  padding: 2px 8px; border-radius: 6px; margin-bottom: 10px;',
            '}',
            '.promo-name { font-size: 15px; font-weight: 600; color: #1e3a5f; margin-bottom: 8px; line-height: 1.4; }',
            '.promo-explanation { font-size: 13px; color: #555; line-height: 1.6; margin-bottom: 14px; }',
            '.promo-detail { font-size: 12px; color: #666; line-height: 1.5; margin-bottom: 10px; }',
            '.promo-detail-section { margin-bottom: 8px; }',
            '.promo-detail-label { font-weight: 600; color: #444; }',
            '.promo-disclaimer { font-size: 11px; color: #999; font-style: italic; margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee; }',
            '.promo-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-top: 12px; }',
            '.promo-btn {',
            '  display: inline-block; padding: 8px 18px; font-size: 13px;',
            '  font-weight: 600; border: none; border-radius: 8px;',
            '  cursor: pointer; transition: background 0.15s, color 0.15s;',
            '}',
            '.promo-btn--info { background: #1e3a5f; color: #fff; }',
            '.promo-btn--info:hover { background: #2d5a87; }',
            '.promo-btn--info:focus-visible { outline: 2px solid #1e3a5f; outline-offset: 2px; }',
            '.promo-btn--cta { background: #16a34a; color: #fff; }',
            '.promo-btn--cta:hover { background: #15803d; }',
            '.promo-btn--cta:focus-visible { outline: 2px solid #16a34a; outline-offset: 2px; }',
            '.promo-btn--dismiss { background: transparent; color: #888; border: 1px solid #ddd; }',
            '.promo-btn--dismiss:hover { background: #f5f5f5; color: #555; }',
            '.promo-btn--dismiss:focus-visible { outline: 2px solid #888; outline-offset: 2px; }',
            '.promo-btn--vet-flag { background: #fef3c7; color: #1e1e1e; font-size: 12px; padding: 8px 16px; margin: 12px 0; border: 1px solid #d4a017; }',
            '.promo-btn--vet-flag:hover { background: #fde68a; }',
            '.promo-consent-banner { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px; margin: 12px 0; font-size: 13px; }',
            '.promo-consent-actions { margin-top: 10px; display: flex; gap: 8px; }',
            '.promo-loader-slot { min-height: 40px; }',
            '.consent-center-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin: 16px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }',
            '.consent-center-title { font-size: 18px; font-weight: 700; color: #1e3a5f; margin-bottom: 4px; }',
            '.consent-center-subtitle { font-size: 13px; color: #888; margin-bottom: 18px; }',
            '.consent-service-block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 14px; }',
            '.consent-service-header { display: flex; align-items: center; justify-content: space-between; }',
            '.consent-service-info { display: flex; align-items: center; gap: 10px; flex: 1; }',
            '.consent-service-icon { font-size: 22px; }',
            '.consent-service-label { font-size: 15px; font-weight: 600; color: #1e3a5f; }',
            '.consent-service-desc { font-size: 12px; color: #666; margin-top: 2px; }',
            '.consent-toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }',
            '.consent-toggle input { opacity: 0; width: 0; height: 0; }',
            '.consent-toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; border-radius: 24px; transition: background 0.2s; }',
            '.consent-toggle-slider:before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: transform 0.2s; }',
            '.consent-toggle input:checked + .consent-toggle-slider { background: #16a34a; }',
            '.consent-toggle input:checked + .consent-toggle-slider:before { transform: translateX(20px); }',
            '.consent-toggle input:focus-visible + .consent-toggle-slider { outline: 2px solid #1e3a5f; outline-offset: 2px; }',
            '.consent-tenant-list { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0f0f0; }',
            '.consent-tenant-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 6px 34px; }',
            '.consent-tenant-name { font-size: 13px; color: #444; }',
            '.consent-warning { font-size: 11px; color: #b45309; font-style: italic; margin-top: 6px; padding-left: 34px; display: none; }'
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-promo-styles', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // =========================================================================
    // Batch event system
    // =========================================================================

    function _bufferEvent(evt) {
        _eventBuffer.push(evt);
        if (!_flushTimer) {
            _flushTimer = setTimeout(_flushEvents, 5000);
        }
    }

    function _flushEvents() {
        _flushTimer = null;
        if (_eventBuffer.length === 0) return;
        var batch = _eventBuffer.splice(0, 50);
        try {
            var payload = JSON.stringify({ events: batch });
            fetchApi('/api/promo/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            }).catch(function () { /* fire and forget */ });
        } catch (_) { /* ignore */ }
    }

    // Flush on page unload
    if (typeof addEventListener === 'function') {
        addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') _flushEvents();
        });
        addEventListener('pagehide', _flushEvents);
    }

    // =========================================================================
    // Backend integration
    // =========================================================================

    /**
     * Load a promo recommendation for the given pet.
     * Returns a recommendation object or null.
     */
    function loadPromoRecommendation(petId, context) {
        var path = '/api/promo/recommendation';
        var params = [];
        if (petId !== undefined && petId !== null) {
            params.push('petId=' + encodeURIComponent(String(petId)));
        }
        if (context) {
            params.push('context=' + encodeURIComponent(context));
        }
        if (typeof isDebugForceMultiService === 'function' && isDebugForceMultiService()) {
            params.push('force=1');
        }
        // Read rotation index for this pet from localStorage (round-robin)
        var rotKey = 'ada_promo_rotation';
        var rotData = {};
        try { rotData = JSON.parse(localStorage.getItem(rotKey) || '{}'); } catch(_) {}
        var rotIdx = (rotData[petId] || 0);
        params.push('rotationIndex=' + rotIdx);
        if (params.length > 0) path += '?' + params.join('&');

        if (typeof ADALog !== 'undefined') {
            ADALog.dbg('PROMO', 'loadPromoRecommendation start', {petId: petId, context: context, path: path});
        }

        return fetchApi(path, { method: 'GET' })
            .then(function (response) {
                if (!response.ok) return null;
                return response.json();
            })
            .then(function (data) {
                if (!data) return null;

                // V2 response: { pet_id, recommendation: {...} | null }
                if (data.recommendation !== undefined) {
                    if (typeof ADALog !== 'undefined') {
                        ADALog.info('PROMO', 'loadPromoRecommendation done', {productId: data.recommendation ? (data.recommendation.promoItemId || data.recommendation.productId || null) : null, source: 'v2', confidence: null});
                    }
                    return data.recommendation;
                }

                // V1/mock response: { pet_id, recommendations: [...] }
                if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
                    var rec = data.recommendations[0];
                    if (rec.productId && rec.name) return rec;
                    // Map v1 backend fields
                    if (rec.product_id && rec.name) {
                        return {
                            productId: rec.product_id,
                            name: rec.name,
                            category: rec.category,
                            explanation: rec.description,
                            infoUrl: null,
                            imageUrl: rec.image_url
                        };
                    }
                }
                return null;
            })
            .catch(function () {
                return _pickMockProduct(petId);
            });
    }

    /**
     * Track a promo event (fire-and-forget with batching).
     */
    function trackPromoEvent(eventType, productId, petId, metadata) {
        var validTypes = ['impression', 'info_click', 'buy_click', 'dismissed', 'cta_click', 'detail_view'];
        if (validTypes.indexOf(eventType) === -1) return;

        var evt = {
            event_type: eventType,
            product_id: productId || null,
            pet_id: petId !== undefined && petId !== null ? String(petId) : null,
            context: (metadata && metadata.context) || null,
            metadata: metadata || {},
            timestamp: new Date().toISOString()
        };

        _bufferEvent(evt);
    }

    // =========================================================================
    // UI rendering
    // =========================================================================

    /**
     * Render a promo slot inside the given container.
     */
    function renderPromoSlot(containerId, context) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _lastRenderedPromoItemId = null;
        _injectPromoStyles();

        var petId = null;
        if (_fnExists('getCurrentPetId')) {
            try { petId = getCurrentPetId(); } catch (_) { /* ignore */ }
        }

        var role = null;
        if (_fnExists('getActiveRole')) {
            try { role = getActiveRole(); } catch (_) { /* ignore */ }
        }

        var ctx = context || 'home_feed';

        // Anti-flicker: check session impression count (skip when forceMultiService is ON)
        var forceMulti = (typeof isDebugForceMultiService === 'function' && isDebugForceMultiService());
        if (!forceMulti) {
            var sessionKey = ctx + ':' + (petId || 'none');
            var count = _sessionImpressions[sessionKey] || 0;
            var maxPerSession = { home_feed: 2, pet_profile: 1, post_visit: 1, faq_view: 1 };
            if (maxPerSession[ctx] && count >= maxPerSession[ctx]) return;
        }

        var slotId = containerId + '-promo-slot';
        var loaderId = containerId + '-promo-loader';
        var cardId = containerId + '-promo-card';

        // Remove existing
        var existingSlot = document.getElementById(slotId);
        if (existingSlot) existingSlot.parentNode.removeChild(existingSlot);

        var slot = document.createElement('div');
        slot.id = slotId;
        slot.className = 'promo-slot';

        var loaderTarget = document.createElement('div');
        loaderTarget.id = loaderId;
        loaderTarget.className = 'promo-loader-slot';
        slot.appendChild(loaderTarget);

        var cardEl = document.createElement('div');
        cardEl.id = cardId;
        cardEl.className = 'promo-card promo-card--hidden';
        slot.appendChild(cardEl);

        container.appendChild(slot);

        var loader = null;
        if (typeof InlineLoader === 'function') {
            loader = new InlineLoader({
                containerId: loaderId,
                onRetry: function () {
                    _fetchAndRender(loader, cardEl, petId, role, ctx);
                }
            });
        }

        _fetchAndRender(loader, cardEl, petId, role, ctx);
    }

    function _fetchAndRender(loader, cardEl, petId, role, context) {
        var fetchFn = function (signal) {
            return new Promise(function (resolve, reject) {
                if (signal && signal.aborted) {
                    return reject(new DOMException('Aborted', 'AbortError'));
                }

                var onAbort = function () {
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                if (signal) signal.addEventListener('abort', onAbort, { once: true });

                loadPromoRecommendation(petId, context)
                    .then(function (rec) {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        _renderCard(cardEl, rec, petId, role, context);
                        resolve();
                    })
                    .catch(function () {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        var mockProduct = _pickMockProduct(petId);
                        _renderCard(cardEl, mockProduct, petId, role, context);
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

    function _renderCard(cardEl, rec, petId, role, context) {
        if (!cardEl) return;

        if (typeof ADALog !== 'undefined') {
            ADALog.dbg('PROMO', 'render card', {productId: rec ? (rec.promoItemId || rec.productId || null) : null, name: rec ? rec.name : null, context: context});
        }

        // Nothing to show
        if (!rec || !rec.name) {
            cardEl.classList.add('promo-card--hidden');
            cardEl.innerHTML = '';
            return;
        }

        // Guard: skip if serviceType doesn't match the promo slot (e.g. insurance/nutrition leaked)
        if (rec.serviceType && rec.serviceType !== 'promo') {
            cardEl.classList.add('promo-card--hidden');
            cardEl.innerHTML = '';
            return;
        }

        var productId = rec.promoItemId || rec.productId || null;

        // Check dismissed
        var dismissed = _getDismissedIds();
        if (productId && dismissed.indexOf(productId) !== -1) {
            cardEl.classList.add('promo-card--hidden');
            cardEl.innerHTML = '';
            return;
        }

        // Extract explanation fields
        var expl = rec.explanation || {};
        var whyText = '';
        if (typeof expl === 'object' && expl.why_you_see_this) {
            whyText = expl.why_you_see_this;
        } else if (typeof expl === 'string') {
            whyText = expl;
        } else if (typeof rec.explanation === 'string') {
            whyText = rec.explanation;
        }

        // Show full text (no truncation)

        // CTA logic
        var ctaEnabled = rec.ctaEnabled !== undefined ? rec.ctaEnabled : false;
        var ctaLabel = rec.ctaLabel || (ctaEnabled ? 'Acquista' : 'Scopri di più');
        var ctaUrl = rec.ctaUrl || rec.infoUrl || null;

        // Build card HTML
        var imageUrl = rec.promo_item_id
            ? getProductImageUrl(rec)
            : (rec.imageUrl || rec.image_url || getProductImageUrl(null));
        var description = rec.description || null;

        var html = [
            '<span class="promo-badge">Consigliato per il tuo amico pet</span>'
        ];

        html.push('<img src="' + _escapeHtml(imageUrl) + '" alt="' + _escapeHtml(rec.name) + '" class="promo-card-img" style="width:100%;max-height:250px;object-fit:contain;border-radius:8px;margin:8px 0;" onerror="if(!this.dataset.fallback){this.dataset.fallback=1;var i=String(Math.floor(Math.random()*45)+1).padStart(2,\'0\');this.src=(typeof API_BASE_URL!==\'undefined\'?API_BASE_URL:\'\')+\'/api/seed-assets/placeholder-prodotti/Prodotto_\'+i+\'.png\';}">');

        html.push('<div class="promo-name">' + _escapeHtml(rec.name) + '</div>');

        if (description) {
            html.push('<div class="promo-description" style="font-size:13px;color:#555;margin:4px 0 8px;">' + _escapeHtml(description) + '</div>');
        }

        if (whyText) {
            html.push('<div class="promo-explanation">' + _escapeHtml(whyText) + '</div>');
        }

        // Benefit for pet
        var benefit = (typeof expl === 'object' && expl.benefit_for_pet) ? expl.benefit_for_pet : null;
        if (benefit) {
            html.push('<div class="promo-detail-section" style="margin:6px 0;font-size:13px;">');
            html.push('<span class="promo-detail-label" style="font-weight:600;">Beneficio: </span>');
            html.push(_escapeHtml(benefit));
            html.push('</div>');
        }

        // Clinical fit
        var clinicalFit = (typeof expl === 'object' && expl.clinical_fit) ? expl.clinical_fit : null;
        if (clinicalFit) {
            html.push('<div class="promo-detail-section" style="margin:6px 0;font-size:13px;">');
            html.push('<span class="promo-detail-label" style="font-weight:600;">Correlazione clinica: </span>');
            html.push(_escapeHtml(clinicalFit));
            html.push('</div>');
        }

        // Disclaimer
        var disclaimer = (typeof expl === 'object' && expl.disclaimer) ? expl.disclaimer : null;
        if (disclaimer) {
            html.push('<div class="promo-disclaimer">' + _escapeHtml(disclaimer) + '</div>');
        }

        html.push('<div class="promo-actions">');
        if (ctaUrl) {
            html.push('  <button type="button" class="promo-btn promo-btn--cta" data-promo-action="cta">Acquista</button>');
        }
        html.push('  <button type="button" class="promo-btn promo-btn--info" data-promo-action="close">Chiudi il suggerimento</button>');
        html.push('  <button type="button" class="promo-btn promo-btn--dismiss" data-promo-action="dismiss">Non mi interessa</button>');
        html.push('</div>');
        // PR1: Debug-only analysis button
        if (typeof debugLogEnabled !== 'undefined' && debugLogEnabled) {
            html.push('<div style="margin-top:8px;text-align:center;">');
            html.push('  <button type="button" class="promo-btn promo-btn--info" data-promo-action="analysis" style="font-size:11px;padding:4px 12px;">🔍 Analisi raccomandazione</button>');
            html.push('</div>');
        }

        cardEl.innerHTML = html.join('\n');
        cardEl.classList.remove('promo-card--hidden');

        // Store promo item id for vet flag integration
        if (productId) {
            cardEl.setAttribute('data-promo-item-id', productId);
            _lastRenderedPromoItemId = productId;
            // Also propagate to any vet-flag containers on the page
            try {
                var vetFlagContainers = document.querySelectorAll('[id$="-vet-flag-container"]');
                for (var vi = 0; vi < vetFlagContainers.length; vi++) {
                    vetFlagContainers[vi].setAttribute('data-promo-item-id', productId);
                }
            } catch (_) { /* ignore */ }
        }

        // Advance rotation for next load (round-robin through top 5)
        if (petId) {
            var rotKey = 'ada_promo_rotation';
            var rotData = {};
            try { rotData = JSON.parse(localStorage.getItem(rotKey) || '{}'); } catch(_) {}
            rotData[petId] = ((rotData[petId] || 0) + 1) % 5;
            try { localStorage.setItem(rotKey, JSON.stringify(rotData)); } catch(_) {}
        }

        // Track impression with IntersectionObserver (visible >50% for >1s)
        _trackImpressionWithObserver(cardEl, productId, petId, rec, role, context);

        // Bind events
        var ctaBtn = cardEl.querySelector('[data-promo-action="cta"]');
        var closeBtn = cardEl.querySelector('[data-promo-action="close"]');
        var dismissBtn = cardEl.querySelector('[data-promo-action="dismiss"]');

        if (ctaBtn && ctaUrl) {
            ctaBtn.addEventListener('click', function () {
                if (typeof ADALog !== 'undefined') {
                    ADALog.info('PROMO', 'click tracked', {productId: productId, action: 'cta_click', context: context});
                }
                trackPromoEvent('cta_click', productId, petId, {
                    name: rec.name, role: role, context: context, ctaLabel: ctaLabel
                });
                // Show simulated purchase page
                _showPromoPurchasePage(rec, productId);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                // Simply close/hide the promo without tracking dismiss
                cardEl.style.opacity = '0';
                setTimeout(function () {
                    cardEl.classList.add('promo-card--hidden');
                    cardEl.removeAttribute('style');
                    cardEl.innerHTML = '';
                }, 300);
            });
        }

        // PR1: Bind analysis button
        var analysisBtn = cardEl.querySelector('[data-promo-action="analysis"]');
        if (analysisBtn) {
            analysisBtn.addEventListener('click', function () {
                _showPromoAnalysis(productId, petId);
            });
        }
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                if (typeof ADALog !== 'undefined') {
                    ADALog.info('PROMO', 'dismiss tracked', {productId: productId, action: 'dismissed', context: context});
                }
                trackPromoEvent('dismissed', productId, petId, {
                    name: rec.name, role: role, context: context
                });
                if (productId) _addDismissedId(productId);

                // Show feedback popup, then close promo card
                if (typeof _showModal === 'function') {
                    _showModal('Feedback ricevuto', function(container) {
                        container.innerHTML = '<div style="text-align:center;padding:30px;">' +
                            '<h3>Grazie per il tuo feedback!</h3>' +
                            '<p style="font-size:16px;color:#555;margin:16px 0;">' +
                            'Abbiamo preso nota della tua preferenza.<br>Non ti mostreremo più questo prodotto.</p>' +
                            '<p style="font-size:13px;color:#888;">Continuiamo a migliorare i suggerimenti per te e il tuo pet.</p>' +
                            '<button class="btn btn-primary" style="margin-top:20px;" id="dismiss-close-btn">Chiudi</button></div>';
                        var closeEl = document.getElementById('dismiss-close-btn');
                        if (closeEl) {
                            closeEl.addEventListener('click', function() {
                                if (typeof _closeModal === 'function') _closeModal();
                                cardEl.style.opacity = '0';
                                setTimeout(function () {
                                    cardEl.classList.add('promo-card--hidden');
                                    cardEl.removeAttribute('style');
                                    cardEl.innerHTML = '';
                                }, 300);
                            });
                        }
                    });
                } else {
                    // Fallback: just hide the card
                    cardEl.style.opacity = '0';
                    setTimeout(function () {
                        cardEl.classList.add('promo-card--hidden');
                        cardEl.removeAttribute('style');
                        cardEl.innerHTML = '';
                    }, 300);
                }
            });
        }
    }

    /**
     * Show simulated purchase page for a promo product.
     */
    function _showPromoPurchasePage(rec, productId) {
        if (typeof _showModal !== 'function') {
            // Fallback: open URL directly
            var url = rec.ctaUrl || rec.infoUrl;
            if (url) { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) { window.location.href = url; } }
            return;
        }
        var imgUrl = rec.promo_item_id ? getProductImageUrl(rec) : (rec.imageUrl || rec.image_url || '');
        _showModal('Acquisto Prodotto', function(container) {
            var h = [];
            h.push('<div style="max-width:480px;margin:0 auto;">');
            // Simulated banner
            h.push('<div style="background:#fef3c7;color:#92400e;font-size:12px;text-align:center;padding:6px 12px;border-radius:6px;margin-bottom:16px;">Pagina simulata — nessun acquisto reale verrà effettuato</div>');
            // Product image
            if (imgUrl) {
                h.push('<div style="text-align:center;margin-bottom:16px;"><img src="' + _escapeHtml(imgUrl) + '" style="max-width:100%;max-height:280px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);object-fit:contain;" onerror="this.style.display=\'none\'"></div>');
            }
            // Product name
            h.push('<h3 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1e293b;text-align:center;">' + _escapeHtml(rec.name || '') + '</h3>');
            // Description card
            if (rec.description) {
                h.push('<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:16px;font-size:14px;color:#475569;line-height:1.5;">' + _escapeHtml(rec.description) + '</div>');
            }
            // Price & quantity
            h.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:12px 16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">');
            h.push('<span style="font-size:18px;font-weight:700;color:#16a34a;">€XX,XX</span>');
            h.push('<label style="font-size:13px;color:#555;">Quantità: <input type="number" value="1" min="1" max="10" style="width:54px;padding:6px;border:1px solid #d1d5db;border-radius:6px;text-align:center;"></label>');
            h.push('</div>');
            // Shipping
            h.push('<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:14px;color:#334155;margin-bottom:8px;">📦 Spedizione</div>');
            h.push('<input placeholder="Nome e Cognome" style="width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">');
            h.push('<input placeholder="Indirizzo" style="width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">');
            h.push('<div style="display:flex;gap:8px;"><input placeholder="CAP" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">');
            h.push('<input placeholder="Città" style="flex:2;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;"></div></div>');
            // Payment
            h.push('<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:14px;color:#334155;margin-bottom:8px;">💳 Pagamento</div>');
            h.push('<input placeholder="Numero carta" style="width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">');
            h.push('<div style="display:flex;gap:8px;">');
            h.push('<input placeholder="MM/AA" style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">');
            h.push('<input placeholder="CVV" style="width:80px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;"></div></div>');
            // Buttons
            h.push('<button class="btn btn-success" style="width:100%;padding:14px;font-size:15px;font-weight:600;border-radius:10px;opacity:0.6;cursor:not-allowed;" disabled>Conferma Acquisto (simulato)</button>');
            h.push('<button class="btn btn-secondary" style="width:100%;margin-top:8px;padding:10px;border-radius:10px;" onclick="_closeModal()">Chiudi</button>');
            h.push('</div>');
            container.innerHTML = h.join('');
        });
    }

    /**
     * Track impression via IntersectionObserver (visible >50% for >1s).
     */
    function _trackImpressionWithObserver(el, productId, petId, rec, role, context) {
        if (typeof IntersectionObserver === 'undefined') {
            // Fallback: immediate tracking
            _recordImpression(productId, petId, rec, role, context);
            return;
        }

        var timer = null;
        var observer = new IntersectionObserver(function (entries) {
            var entry = entries[0];
            if (entry && entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                if (!timer) {
                    timer = setTimeout(function () {
                        _recordImpression(productId, petId, rec, role, context);
                        observer.disconnect();
                    }, 1000);
                }
            } else {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            }
        }, { threshold: 0.5 });

        observer.observe(el);
    }

    function _recordImpression(productId, petId, rec, role, context) {
        var sessionKey = (context || 'home_feed') + ':' + (petId || 'none');
        _sessionImpressions[sessionKey] = (_sessionImpressions[sessionKey] || 0) + 1;

        if (typeof ADALog !== 'undefined') {
            ADALog.info('PROMO', 'impression tracked', {productId: productId, petId: petId, context: context});
        }

        trackPromoEvent('impression', productId, petId, {
            name: rec ? rec.name : null,
            category: rec ? rec.category : null,
            role: role,
            context: context,
            source: rec ? rec.source : null
        });
    }

    /**
     * Render detailed explanation inside a container.
     */
    function renderPromoDetail(container, recommendation) {
        if (!container || !recommendation) return;

        var expl = recommendation.explanation || {};
        if (typeof expl === 'string') {
            expl = { why_you_see_this: expl };
        }

        var html = ['<div class="promo-detail">'];

        if (expl.why_you_see_this) {
            html.push('<div class="promo-detail-section">');
            html.push('<span class="promo-detail-label">Perché vedi questo: </span>');
            html.push(_escapeHtml(expl.why_you_see_this));
            html.push('</div>');
        }

        if (expl.benefit_for_pet) {
            html.push('<div class="promo-detail-section">');
            html.push('<span class="promo-detail-label">Beneficio: </span>');
            html.push(_escapeHtml(expl.benefit_for_pet));
            html.push('</div>');
        }

        if (expl.clinical_fit) {
            html.push('<div class="promo-detail-section">');
            html.push('<span class="promo-detail-label">Correlazione clinica: </span>');
            html.push(_escapeHtml(expl.clinical_fit));
            html.push('</div>');
        }

        if (expl.disclaimer) {
            html.push('<div class="promo-disclaimer">' + _escapeHtml(expl.disclaimer) + '</div>');
        }

        html.push('</div>');
        container.innerHTML = html.join('');
    }

    /**
     * Render consent banner for marketing opt-in/out.
     */
    function renderConsentBanner(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectPromoStyles();

        fetchApi('/api/promo/consent/pending', { method: 'GET' })
            .then(function (r) { return r.ok ? r.json() : { pending: [] }; })
            .then(function (data) {
                if (!data.pending || data.pending.length === 0) return;

                var html = [
                    '<div class="promo-consent-banner">',
                    '<strong>Consenso marketing</strong><br>',
                    'Nuovi partner vogliono inviarti suggerimenti personalizzati per il tuo pet. ',
                    'Puoi accettare o rifiutare.',
                    '<div class="promo-consent-actions">',
                    '  <button type="button" class="promo-btn promo-btn--info" data-consent-action="accept">Accetta</button>',
                    '  <button type="button" class="promo-btn promo-btn--dismiss" data-consent-action="decline">Rifiuta</button>',
                    '</div>',
                    '</div>'
                ];

                container.innerHTML = html.join('');

                var acceptBtn = container.querySelector('[data-consent-action="accept"]');
                var declineBtn = container.querySelector('[data-consent-action="decline"]');

                if (acceptBtn) {
                    acceptBtn.addEventListener('click', function () {
                        data.pending.forEach(function (p) {
                            fetchApi('/api/promo/consent/ack', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ consent_type: p.consent_type, scope: p.scope, status: 'opted_in' })
                            }).catch(function () { /* ignore */ });
                        });
                        container.innerHTML = '<div class="promo-consent-banner">Grazie! Preferenze aggiornate.</div>';
                        setTimeout(function () { container.innerHTML = ''; }, 3000);
                    });
                }

                if (declineBtn) {
                    declineBtn.addEventListener('click', function () {
                        data.pending.forEach(function (p) {
                            fetchApi('/api/promo/consent/ack', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ consent_type: p.consent_type, scope: p.scope, status: 'opted_out' })
                            }).catch(function () { /* ignore */ });
                        });
                        container.innerHTML = '<div class="promo-consent-banner">Preferenze aggiornate. Non riceverai suggerimenti da questi partner.</div>';
                        setTimeout(function () { container.innerHTML = ''; }, 3000);
                    });
                }
            })
            .catch(function () { /* ignore */ });
    }

    /**
     * Render vet flag button (for veterinario role).
     */
    function renderVetFlagButton(containerId, petId) {
        var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;

        _injectPromoStyles();

        var html = '<button type="button" class="promo-btn promo-btn--vet-flag" data-vet-flag="true">' +
            'Segnala consiglio inappropriato</button>';
        container.innerHTML = html;

        var btn = container.querySelector('[data-vet-flag="true"]');
        if (btn) {
            btn.addEventListener('click', function () {
                var reason = prompt('Motivo della segnalazione (opzionale):');
                if (reason === null) return; // cancelled

                // Get current promo item id from container attribute or last rendered card
                var promoItemId = container.getAttribute('data-promo-item-id') || _lastRenderedPromoItemId;
                if (!promoItemId) {
                    if (_fnExists('showToast')) showToast('Nessun consiglio attivo da segnalare.', 'info');
                    return;
                }

                fetchApi('/api/promo/vet-flag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Ada-Role': 'vet_int' },
                    body: JSON.stringify({ pet_id: String(petId), promo_item_id: promoItemId, reason: reason || null })
                }).then(function (r) {
                    if (r.ok) {
                        if (_fnExists('showToast')) showToast('Consiglio segnalato. Non verrà più mostrato per questo pet.', 'success');
                        btn.disabled = true;
                        btn.textContent = 'Segnalata';
                    } else {
                        if (_fnExists('showToast')) showToast('Errore nella segnalazione.', 'error');
                    }
                }).catch(function () {
                    if (_fnExists('showToast')) showToast('Errore di rete.', 'error');
                });
            });
        }
    }

    // =========================================================================
    // Consent Center
    // =========================================================================

    function renderConsentCenter(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectPromoStyles();

        var SERVICE_TYPES = {
            promo: { icon: '\uD83C\uDFAF', label: 'Promozioni', description: 'Suggerimenti prodotti personalizzati per il tuo pet', consent_type: 'marketing_global', warning: 'Disattivando le promozioni non riceverai pi\u00F9 suggerimenti personalizzati.' },
            nutrition: { icon: '\uD83E\uDD57', label: 'Nutrizione', description: 'Piani nutrizionali personalizzati generati dall\'AI e validati dal veterinario', consent_type: 'nutrition_plan', warning: 'Disattivando la nutrizione non verranno generati piani nutrizionali.' },
            insurance: { icon: '\uD83D\uDEE1\uFE0F', label: 'Assicurazione', description: 'Copertura assicurativa con valutazione del rischio basata sui dati clinici', consent_type: 'insurance_data_sharing', warning: 'Disattivando l\'assicurazione i tuoi dati non verranno condivisi con partner assicurativi.' }
        };

        container.innerHTML = '<div class="promo-loader-slot" style="text-align:center;padding:20px;color:#888;">Caricamento preferenze...</div>';

        Promise.all([
            fetchApi('/api/promo/consent', { method: 'GET' }).then(function (r) { return r.ok ? r.json() : { consents: [] }; }),
            fetchApi('/api/promo/consent/services', { method: 'GET' }).then(function (r) { return r.ok ? r.json() : { services: [] }; })
        ]).then(function (results) {
            var consentData = results[0];
            var servicesData = results[1];

            var services = servicesData.services || [];

            // Build consentMap from backend response (flat object or array)
            var consentMap = {};
            if (consentData.consents && Array.isArray(consentData.consents)) {
                consentData.consents.forEach(function (c) {
                    var key = c.consent_type + ':' + (c.scope || 'global');
                    consentMap[key] = c.status === 'opted_in';
                });
            } else {
                if (consentData.marketing_global !== undefined) {
                    consentMap['marketing_global:global'] = consentData.marketing_global === 'opted_in';
                }
                if (consentData.nutrition_plan !== undefined) {
                    consentMap['nutrition_plan:global'] = consentData.nutrition_plan === 'opted_in';
                }
                if (consentData.insurance_data_sharing !== undefined) {
                    consentMap['insurance_data_sharing:global'] = consentData.insurance_data_sharing === 'opted_in';
                }
                if (consentData.clinical_tags !== undefined) {
                    consentMap['clinical_tags:global'] = consentData.clinical_tags === 'opted_in';
                }
                var brandMaps = {
                    marketing_brand: consentData.brand_consents || {},
                    nutrition_brand: consentData.nutrition_brand_consents || {},
                    insurance_brand: consentData.insurance_brand_consents || {}
                };
                Object.keys(brandMaps).forEach(function (type) {
                    Object.keys(brandMaps[type]).forEach(function (scope) {
                        consentMap[type + ':' + scope] = brandMaps[type][scope] === 'opted_in';
                    });
                });
            }

            var tenantsByType = {};
            services.forEach(function (svc) {
                var svcType = svc.service_type || svc.type;
                if (!svcType) return;
                if (!tenantsByType[svcType]) tenantsByType[svcType] = [];
                // Fix §13: flatten tenants from each service object
                if (Array.isArray(svc.tenants)) {
                    svc.tenants.forEach(function(t) {
                        tenantsByType[svcType].push({
                            tenant_id: t.tenant_id,
                            tenant_name: t.name || t.tenant_name || t.brand_name,
                            name: t.name || t.tenant_name || t.brand_name
                        });
                    });
                } else {
                    tenantsByType[svcType].push(svc);
                }
            });

            var html = [
                '<div class="consent-center-card">',
                '<div class="consent-center-title">Centro Privacy</div>',
                '<div class="consent-center-subtitle">Gestisci i consensi per i servizi ADA</div>'
            ];

            var serviceKeys = Object.keys(SERVICE_TYPES);
            for (var si = 0; si < serviceKeys.length; si++) {
                var sKey = serviceKeys[si];
                var sType = SERVICE_TYPES[sKey];
                var globalKey = sType.consent_type + ':global';
                var isGlobalOn = consentMap[globalKey] !== undefined ? consentMap[globalKey] : false;
                var toggleId = 'consent-toggle-' + sKey;
                var warningId = 'consent-warning-' + sKey;
                var tenantBlockId = 'consent-tenants-' + sKey;

                html.push('<div class="consent-service-block" data-service-key="' + _escapeHtml(sKey) + '">');
                html.push('  <div class="consent-service-header">');
                html.push('    <div class="consent-service-info">');
                html.push('      <span class="consent-service-icon">' + sType.icon + '</span>');
                html.push('      <div>');
                html.push('        <div class="consent-service-label">' + _escapeHtml(sType.label) + '</div>');
                html.push('        <div class="consent-service-desc">' + _escapeHtml(sType.description) + '</div>');
                html.push('      </div>');
                html.push('    </div>');
                html.push('    <label class="consent-toggle">');
                html.push('      <input type="checkbox" id="' + toggleId + '" data-consent-type="' + _escapeHtml(sType.consent_type) + '" data-scope="global"' + (isGlobalOn ? ' checked' : '') + '>');
                html.push('      <span class="consent-toggle-slider"></span>');
                html.push('    </label>');
                html.push('  </div>');
                html.push('  <div class="consent-warning" id="' + warningId + '">' + _escapeHtml(sType.warning) + '</div>');

                var tenants = tenantsByType[sKey] || [];
                if (tenants.length > 0) {
                    html.push('  <div class="consent-tenant-list" id="' + tenantBlockId + '" style="' + (isGlobalOn ? '' : 'display:none;') + '">');
                    for (var ti = 0; ti < tenants.length; ti++) {
                        var tenant = tenants[ti];
                        var tenantName = tenant.tenant_name || tenant.brand_name || tenant.name || 'Partner';
                        var tenantScope = tenant.tenant_id || tenant.scope || tenantName;
                        var tenantKey = sType.consent_type + ':' + tenantScope;
                        var isTenantOn = consentMap[tenantKey] !== undefined ? consentMap[tenantKey] : isGlobalOn;
                        var tenantToggleId = 'consent-toggle-' + sKey + '-' + ti;

                        html.push('    <div class="consent-tenant-row">');
                        html.push('      <span class="consent-tenant-name">' + _escapeHtml(tenantName) + '</span>');
                        html.push('      <label class="consent-toggle">');
                        html.push('        <input type="checkbox" id="' + tenantToggleId + '" data-consent-type="' + _escapeHtml(sType.consent_type) + '" data-scope="' + _escapeHtml(tenantScope) + '"' + (isTenantOn ? ' checked' : '') + '>');
                        html.push('        <span class="consent-toggle-slider"></span>');
                        html.push('      </label>');
                        html.push('    </div>');
                    }
                    html.push('  </div>');
                }

                html.push('</div>');
            }

            html.push('</div>');
            container.innerHTML = html.join('\n');

            var allToggles = container.querySelectorAll('input[data-consent-type]');
            for (var idx = 0; idx < allToggles.length; idx++) {
                (function (toggle) {
                    toggle.addEventListener('change', function () {
                        var consentType = toggle.getAttribute('data-consent-type');
                        var scope = toggle.getAttribute('data-scope');
                        var newStatus = toggle.checked ? 'opted_in' : 'opted_out';

                        fetchApi('/api/promo/consent', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ consent_type: consentType, scope: scope, status: newStatus })
                        }).then(function (r) {
                            if (r.ok) {
                                if (_fnExists('showToast')) showToast('Preferenza aggiornata.', 'success');
                            } else {
                                toggle.checked = !toggle.checked;
                                if (_fnExists('showToast')) showToast('Errore nell\'aggiornamento.', 'error');
                            }
                        }).catch(function () {
                            toggle.checked = !toggle.checked;
                            if (_fnExists('showToast')) showToast('Errore di rete.', 'error');
                        });

                        if (scope === 'global') {
                            var sBlock = toggle.closest('.consent-service-block');
                            if (sBlock) {
                                var svcKey = sBlock.getAttribute('data-service-key');
                                var warningEl = document.getElementById('consent-warning-' + svcKey);
                                var tenantListEl = document.getElementById('consent-tenants-' + svcKey);

                                if (warningEl) {
                                    warningEl.style.display = toggle.checked ? 'none' : 'block';
                                }
                                if (tenantListEl) {
                                    tenantListEl.style.display = toggle.checked ? '' : 'none';
                                    if (!toggle.checked) {
                                        var tenantToggles = tenantListEl.querySelectorAll('input[data-consent-type]');
                                        for (var t = 0; t < tenantToggles.length; t++) {
                                            if (tenantToggles[t].checked) {
                                                tenantToggles[t].checked = false;
                                                var tConsentType = tenantToggles[t].getAttribute('data-consent-type');
                                                var tScope = tenantToggles[t].getAttribute('data-scope');
                                                fetchApi('/api/promo/consent', {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ consent_type: tConsentType, scope: tScope, status: 'opted_out' })
                                                }).catch(function () { /* ignore */ });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                })(allToggles[idx]);
            }

        }).catch(function () {
            container.innerHTML = '<div class="consent-center-card" style="text-align:center;color:#888;">Impossibile caricare le preferenze. Riprova pi\u00F9 tardi.</div>';
        });
    }

    // =========================================================================
    // Expose public API
    // =========================================================================

    global.loadPromoRecommendation = loadPromoRecommendation;
    global.trackPromoEvent         = trackPromoEvent;
    global.renderPromoSlot         = renderPromoSlot;
    global.renderPromoDetail       = renderPromoDetail;
    global.renderConsentBanner     = renderConsentBanner;
    global.renderConsentCenter     = renderConsentCenter;
    global.renderVetFlagButton     = renderVetFlagButton;

// PR1: Debug analysis for promo recommendation
// PR1: Enhanced analysis - pet vs ALL eligible products
async function _showPromoAnalysis(productId, petId, productDescOverride) {
    if (!petId && typeof getCurrentPetId === 'function') petId = getCurrentPetId();
    if (!petId) {
        if (typeof showToast === 'function') showToast('Nessun pet selezionato', 'warning');
        return;
    }

    // Check pet AI description exists
    var petDesc = null;
    if (typeof _aiPetDescCache !== 'undefined' && _aiPetDescCache[petId]) {
        petDesc = _aiPetDescCache[petId].description;
    }
    if (!petDesc) {
        // Load existing description from DB (read-only, no regeneration)
        try {
            var petResp = await fetchApi('/api/pets/' + petId);
            if (petResp && petResp.ok) {
                var petData = await petResp.json();
                if (petData.ai_description) {
                    petDesc = petData.ai_description;
                    // Populate in-memory cache for next time
                    if (typeof _aiPetDescCache !== 'undefined') {
                        _aiPetDescCache[petId] = {
                            description: petData.ai_description,
                            sourcesHash: petData.ai_description_sources_hash || '',
                            generatedAt: petData.ai_description_generated_at || new Date().toISOString(),
                            sourcesUsed: []
                        };
                    }
                }
            }
        } catch (_e) {}
    }
    if (!petDesc && typeof generateAiPetDescription === 'function') {
        // Only generate if truly missing from DB
        var result = await generateAiPetDescription(petId);
        petDesc = result ? result.description : null;
    }
    if (!petDesc) {
        if (typeof showToast === 'function') showToast('Descrizione pet non disponibile — generare prima la descrizione AI', 'warning');
        return;
    }

    // Show loading modal
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:650px;width:90%;max-height:85vh;overflow-y:auto;';
    modal.innerHTML = '<div style="text-align:center;padding:40px;">' +
        '<div style="font-size:32px;margin-bottom:16px;">&#128269;</div>' +
        '<h3 style="color:#1e3a5f;margin-bottom:8px;">Analisi in corso...</h3>' +
        '<p style="color:#64748b;font-size:13px;">Confronto del profilo del pet con tutti i prodotti compatibili</p>' +
        '<div style="margin-top:16px;width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#1e3a5f;border-radius:50%;animation:spin 1s linear infinite;margin:16px auto;"></div>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    try {
        var resp = await fetchApi('/api/promo/analyze-match-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ petId: petId })
        });

        if (!resp || !resp.ok) {
            overlay.remove();
            var errData = null;
            try { errData = await resp.json(); } catch(_e) {}
            if (errData && errData.error === 'pet_ai_description_missing') {
                if (typeof showToast === 'function') showToast('Descrizione AI del pet non disponibile — generarla prima', 'warning');
            } else {
                if (typeof showToast === 'function') showToast('Errore analisi: ' + ((errData && errData.error) || 'sconosciuto'), 'error');
            }
            return;
        }

        var analysis = await resp.json();
        _showEnhancedAnalysisModal(modal, analysis, productId);

    } catch(e) {
        overlay.remove();
        if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
    }
}

function _showEnhancedAnalysisModal(modal, analysis, currentProductId) {
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="color:#1e3a5f;margin:0;">&#128269; Analisi Raccomandazione</h3>';

    if (analysis.fromCache) {
        html += '<span style="font-size:10px;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:10px;">&#9889; cached</span>';
    }
    html += '</div>';

    if (analysis.petName) {
        html += '<p style="color:#64748b;font-size:12px;margin-bottom:16px;">Analisi per <strong>' + _escapeHtml(analysis.petName) + '</strong> — ' +
            analysis.candidatesCount + ' prodotti compatibili valutati</p>';
    }

    if (analysis.matches && analysis.matches.length > 0) {
        analysis.matches.forEach(function(match, idx) {
            var isCurrentProduct = currentProductId && match.promo_item_id === currentProductId;
            var borderColor = match.score >= 70 ? '#16a34a' : match.score >= 40 ? '#f59e0b' : '#94a3b8';
            var bgColor = isCurrentProduct ? '#f0fdf4' : '#f8fafc';
            var badge = match.score >= 70 ? '&#x1f7e2;' : match.score >= 40 ? '&#x1f7e1;' : '&#x26aa;';

            html += '<div style="padding:12px;margin:8px 0;background:' + bgColor + ';border-radius:10px;border-left:4px solid ' + borderColor + ';' +
                (isCurrentProduct ? 'box-shadow:0 0 0 2px #16a34a33;' : '') + '">';

            // Header: rank + name + score
            html += '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-weight:700;font-size:14px;color:#1e3a5f;">' + badge + ' #' + (idx+1) + ' ' + _escapeHtml(match.product_name || '') + '</div>' +
                '<div style="background:' + borderColor + ';color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + match.score + '/100</div></div>';

            // Current product indicator
            if (isCurrentProduct) {
                html += '<div style="font-size:10px;color:#16a34a;font-weight:600;margin-top:4px;">&#8592; Prodotto attualmente raccomandato</div>';
            }

            // Category
            if (match.category) {
                html += '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Categoria: ' + _escapeHtml(match.category) + '</div>';
            }

            // Key matches as chips
            if (match.key_matches && match.key_matches.length > 0) {
                html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">';
                match.key_matches.forEach(function(km) {
                    html += '<span style="background:#e0f2fe;color:#0369a1;font-size:10px;padding:2px 8px;border-radius:10px;">' + _escapeHtml(km) + '</span>';
                });
                html += '</div>';
            }

            // Reasoning
            if (match.reasoning) {
                html += '<p style="font-size:12px;color:#475569;margin:8px 0 0;line-height:1.5;">' + _escapeHtml(match.reasoning) + '</p>';
            }

            // CTA link
            if (match.product_url) {
                html += '<a href="' + _escapeHtml(match.product_url) + '" target="_blank" rel="noopener" ' +
                    'style="display:inline-block;margin-top:8px;font-size:11px;color:#1e3a5f;text-decoration:underline;">Scopri di pi&#249; &#8594;</a>';
            }

            html += '</div>';
        });
    } else {
        html += '<p style="color:#94a3b8;text-align:center;padding:20px;">Nessun prodotto sufficientemente compatibile trovato.</p>';
    }

    // Footer with metadata
    html += '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">';
    html += '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:8px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Chiudi</button>';

    if (analysis.latencyMs) {
        html += '<span style="font-size:10px;color:#cbd5e1;">' + (analysis.latencyMs / 1000).toFixed(1) + 's</span>';
    }
    html += '</div>';

    modal.innerHTML = html;
}

function _showAnalysisModal(analysis) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;';

    var html = '<h3 style="color:#1e3a5f;margin-bottom:16px;">🔍 Analisi Raccomandazione</h3>';

    if (analysis.matches && analysis.matches.length > 0) {
        analysis.matches.forEach(function(match, idx) {
            var borderColor = idx === 0 ? '#16a34a' : idx < 3 ? '#f59e0b' : '#94a3b8';
            html += '<div style="padding:10px;margin:8px 0;background:#f8fafc;border-radius:8px;border-left:3px solid ' + borderColor + ';">' +
                '<div style="font-weight:600;font-size:13px;color:#1e3a5f;">' + (idx+1) + '. ' + _escapeHtml(match.aspect) + '</div>' +
                '<div style="font-size:12px;color:#64748b;margin-top:4px;">Pet: ' + _escapeHtml(match.pet_detail) + '</div>' +
                '<div style="font-size:12px;color:#64748b;">Prodotto: ' + _escapeHtml(match.product_detail) + '</div>' +
                '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Rilevanza: ' + _escapeHtml(match.relevance) + '</div></div>';
        });
    } else {
        html += '<p style="color:#94a3b8;">Nessuna corrispondenza trovata.</p>';
    }

    html += '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;padding:8px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;cursor:pointer;">Chiudi</button>';
    modal.innerHTML = html;
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

})(typeof window !== 'undefined' ? window : this);
