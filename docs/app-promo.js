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
            '.promo-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }',
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
            '.promo-btn--vet-flag { background: #dc2626; color: #fff; font-size: 12px; padding: 6px 14px; }',
            '.promo-btn--vet-flag:hover { background: #b91c1c; }',
            '.promo-consent-banner { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px; margin: 12px 0; font-size: 13px; }',
            '.promo-consent-actions { margin-top: 10px; display: flex; gap: 8px; }',
            '.promo-loader-slot { min-height: 40px; }'
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

        // Anti-flicker: check session impression count
        var sessionKey = ctx + ':' + (petId || 'none');
        var count = _sessionImpressions[sessionKey] || 0;
        var maxPerSession = { home_feed: 2, pet_profile: 1, post_visit: 1, faq_view: 1 };
        if (maxPerSession[ctx] && count >= maxPerSession[ctx]) return;

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

        // Truncate why text
        if (whyText.length > 200) whyText = whyText.substring(0, 197) + '...';

        // CTA logic
        var ctaEnabled = rec.ctaEnabled !== undefined ? rec.ctaEnabled : false;
        var ctaLabel = rec.ctaLabel || (ctaEnabled ? 'Acquista' : 'Scopri di più');
        var ctaUrl = rec.ctaUrl || rec.infoUrl || null;

        // Build card HTML
        var html = [
            '<span class="promo-badge">Consigliato per il tuo pet</span>',
            '<div class="promo-name">' + _escapeHtml(rec.name) + '</div>'
        ];

        if (whyText) {
            html.push('<div class="promo-explanation">' + _escapeHtml(whyText) + '</div>');
        }

        // Disclaimer
        var disclaimer = (typeof expl === 'object' && expl.disclaimer) ? expl.disclaimer : null;
        if (disclaimer) {
            html.push('<div class="promo-disclaimer">' + _escapeHtml(disclaimer) + '</div>');
        }

        html.push('<div class="promo-actions">');
        if (ctaUrl) {
            html.push('  <button type="button" class="promo-btn promo-btn--cta" data-promo-action="cta">' + _escapeHtml(ctaLabel) + '</button>');
        }
        html.push('  <button type="button" class="promo-btn promo-btn--info" data-promo-action="info">Perché vedi questo?</button>');
        html.push('  <button type="button" class="promo-btn promo-btn--dismiss" data-promo-action="dismiss">Non mi interessa</button>');
        html.push('</div>');

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

        // Track impression with IntersectionObserver (visible >50% for >1s)
        _trackImpressionWithObserver(cardEl, productId, petId, rec, role, context);

        // Bind events
        var ctaBtn = cardEl.querySelector('[data-promo-action="cta"]');
        var infoBtn = cardEl.querySelector('[data-promo-action="info"]');
        var dismissBtn = cardEl.querySelector('[data-promo-action="dismiss"]');

        if (ctaBtn && ctaUrl) {
            ctaBtn.addEventListener('click', function () {
                if (typeof ADALog !== 'undefined') {
                    ADALog.info('PROMO', 'click tracked', {productId: productId, action: 'cta_click', context: context});
                }
                trackPromoEvent('cta_click', productId, petId, {
                    name: rec.name, role: role, context: context, ctaLabel: ctaLabel
                });
                try {
                    window.open(ctaUrl, '_blank', 'noopener,noreferrer');
                } catch (_) {
                    window.location.href = ctaUrl;
                }
            });
        }

        if (infoBtn) {
            infoBtn.addEventListener('click', function () {
                trackPromoEvent('info_click', productId, petId, {
                    name: rec.name, role: role, context: context
                });
                // Toggle detail view
                var detailId = cardEl.id + '-detail';
                var existing = document.getElementById(detailId);
                if (existing) {
                    existing.parentNode.removeChild(existing);
                    return;
                }
                var detailEl = document.createElement('div');
                detailEl.id = detailId;
                renderPromoDetail(detailEl, rec);
                cardEl.appendChild(detailEl);
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

                // Smooth hide
                cardEl.style.opacity = '0';
                cardEl.style.maxHeight = cardEl.scrollHeight + 'px';
                cardEl.style.overflow = 'hidden';
                setTimeout(function () {
                    cardEl.style.maxHeight = '0';
                    cardEl.style.padding = '0';
                    cardEl.style.margin = '0';
                    cardEl.style.border = 'none';
                }, 50);
                setTimeout(function () {
                    cardEl.classList.add('promo-card--hidden');
                    cardEl.removeAttribute('style');
                    cardEl.innerHTML = '';
                }, 400);
            });
        }
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
            'Segnala promo inappropriata</button>';
        container.innerHTML = html;

        var btn = container.querySelector('[data-vet-flag="true"]');
        if (btn) {
            btn.addEventListener('click', function () {
                var reason = prompt('Motivo della segnalazione (opzionale):');
                if (reason === null) return; // cancelled

                // Get current promo item id from container attribute or last rendered card
                var promoItemId = container.getAttribute('data-promo-item-id') || _lastRenderedPromoItemId;
                if (!promoItemId) {
                    if (_fnExists('showToast')) showToast('Nessuna promo attiva da segnalare.', 'info');
                    return;
                }

                fetchApi('/api/promo/vet-flag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Ada-Role': 'vet' },
                    body: JSON.stringify({ pet_id: String(petId), promo_item_id: promoItemId, reason: reason || null })
                }).then(function (r) {
                    if (r.ok) {
                        if (_fnExists('showToast')) showToast('Promo segnalata. Non verrà più mostrata per questo pet.', 'success');
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
    // Expose public API
    // =========================================================================

    global.loadPromoRecommendation = loadPromoRecommendation;
    global.trackPromoEvent         = trackPromoEvent;
    global.renderPromoSlot         = renderPromoSlot;
    global.renderPromoDetail       = renderPromoDetail;
    global.renderConsentBanner     = renderConsentBanner;
    global.renderVetFlagButton     = renderVetFlagButton;

})(typeof window !== 'undefined' ? window : this);
