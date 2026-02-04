// app-promo.js v1.0

/**
 * ADA Promo / Recommendation System
 *
 * Displays non-invasive, AI-personalised product recommendations for pet owners.
 * Integrates with the backend promo API and falls back to mock data when the
 * backend is unavailable or running in MOCK mode.
 *
 * Globals expected:
 *   fetchApi(path, options)   - authenticated fetch wrapper (config.js)
 *   showToast(message, type)  - toast notification (app-core.js)
 *   InlineLoader              - loading UI component (app-loading.js)
 *   getActiveRole()           - returns 'veterinario' | 'proprietario'
 *   getCurrentPetId()         - current pet id (app-pets.js)
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var PROMO_CSS_INJECTED = false;
    var PROMO_DISMISSED_KEY = 'ada_promo_dismissed';

    // =========================================================================
    // Mock data - used when backend is unreachable or returns MOCK flag
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

    /**
     * Read the list of dismissed product IDs from localStorage.
     */
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

    /**
     * Persist a dismissed product ID.
     */
    function _addDismissedId(productId) {
        try {
            var ids = _getDismissedIds();
            if (ids.indexOf(productId) === -1) {
                ids.push(productId);
                // Keep at most 200 entries to avoid unbounded growth
                if (ids.length > 200) ids = ids.slice(-200);
                localStorage.setItem(PROMO_DISMISSED_KEY, JSON.stringify(ids));
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Pick a random mock product that has not been dismissed.
     */
    function _pickMockProduct(petId) {
        var dismissed = _getDismissedIds();
        var candidates = MOCK_PRODUCTS.filter(function (p) {
            return dismissed.indexOf(p.productId) === -1;
        });
        if (candidates.length === 0) return null;
        // Simple deterministic selection based on petId for consistency
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

    /**
     * Safely check whether a given function exists on window.
     */
    function _fnExists(name) {
        return typeof global[name] === 'function';
    }

    // =========================================================================
    // CSS injection (once)
    // =========================================================================

    function _injectPromoStyles() {
        if (PROMO_CSS_INJECTED) return;
        PROMO_CSS_INJECTED = true;

        var css = [
            /* Card container */
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

            '.promo-card--hidden {',
            '  display: none;',
            '}',

            /* Badge */
            '.promo-badge {',
            '  display: inline-block;',
            '  font-size: 10px;',
            '  font-weight: 700;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.5px;',
            '  color: #b45309;',
            '  background: #fef3c7;',
            '  padding: 2px 8px;',
            '  border-radius: 6px;',
            '  margin-bottom: 10px;',
            '}',

            /* Product name */
            '.promo-name {',
            '  font-size: 15px;',
            '  font-weight: 600;',
            '  color: #1e3a5f;',
            '  margin-bottom: 8px;',
            '  line-height: 1.4;',
            '}',

            /* Explanation */
            '.promo-explanation {',
            '  font-size: 13px;',
            '  color: #555;',
            '  line-height: 1.6;',
            '  margin-bottom: 14px;',
            '}',

            /* Action row */
            '.promo-actions {',
            '  display: flex;',
            '  gap: 10px;',
            '  flex-wrap: wrap;',
            '  align-items: center;',
            '}',

            '.promo-btn {',
            '  display: inline-block;',
            '  padding: 8px 18px;',
            '  font-size: 13px;',
            '  font-weight: 600;',
            '  border: none;',
            '  border-radius: 8px;',
            '  cursor: pointer;',
            '  transition: background 0.15s, color 0.15s;',
            '}',

            '.promo-btn--info {',
            '  background: #1e3a5f;',
            '  color: #fff;',
            '}',
            '.promo-btn--info:hover {',
            '  background: #2d5a87;',
            '}',
            '.promo-btn--info:focus-visible {',
            '  outline: 2px solid #1e3a5f;',
            '  outline-offset: 2px;',
            '}',

            '.promo-btn--dismiss {',
            '  background: transparent;',
            '  color: #888;',
            '  border: 1px solid #ddd;',
            '}',
            '.promo-btn--dismiss:hover {',
            '  background: #f5f5f5;',
            '  color: #555;',
            '}',
            '.promo-btn--dismiss:focus-visible {',
            '  outline: 2px solid #888;',
            '  outline-offset: 2px;',
            '}',

            /* InlineLoader slot inside promo container */
            '.promo-loader-slot {',
            '  min-height: 40px;',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-promo-styles', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // =========================================================================
    // Backend integration
    // =========================================================================

    /**
     * Load a promo recommendation for the given pet from the backend.
     * Returns a product object or null.
     *
     * @param {string|number} petId
     * @returns {Promise<Object|null>}
     */
    function loadPromoRecommendation(petId) {
        var path = '/api/promo/recommendation';
        if (petId !== undefined && petId !== null) {
            path += '?petId=' + encodeURIComponent(String(petId));
        }

        return fetchApi(path, { method: 'GET' })
            .then(function (response) {
                if (!response.ok) {
                    // Non-200 response - fall back to mock
                    return null;
                }
                return response.json();
            })
            .then(function (data) {
                if (!data) return null;

                // Backend MOCK mode flag
                if (data.mock === true || data.mode === 'MOCK') {
                    return _pickMockProduct(petId);
                }

                // Valid recommendation
                if (data.productId && data.name) {
                    return data;
                }

                // No recommendation available
                return null;
            })
            .catch(function () {
                // Network error or fetchApi unavailable - use mock
                return _pickMockProduct(petId);
            });
    }

    /**
     * Track a promo event (fire-and-forget). No loading indicator.
     *
     * @param {string} eventType - 'impression' | 'info_click' | 'buy_click' | 'dismissed'
     * @param {string} productId
     * @param {string|number} petId
     * @param {Object}  [metadata]
     */
    function trackPromoEvent(eventType, productId, petId, metadata) {
        var validTypes = ['impression', 'info_click', 'buy_click', 'dismissed'];
        if (validTypes.indexOf(eventType) === -1) return;

        var payload = {
            eventType: eventType,
            productId: productId || null,
            petId: petId !== undefined && petId !== null ? String(petId) : null,
            metadata: metadata || {},
            timestamp: new Date().toISOString()
        };

        try {
            fetchApi('/api/promo/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(function () {
                // Fire-and-forget: swallow errors silently
            });
        } catch (_) {
            // fetchApi might not be available in edge cases
        }
    }

    // =========================================================================
    // UI rendering
    // =========================================================================

    /**
     * Render a promo slot inside the given container.
     * Fetches a recommendation using InlineLoader, then builds a card.
     * The card is hidden by default and only shown when data is available.
     *
     * @param {string} containerId - DOM id of the parent element
     */
    function renderPromoSlot(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectPromoStyles();

        // Determine pet context
        var petId = null;
        if (_fnExists('getCurrentPetId')) {
            try { petId = getCurrentPetId(); } catch (_) { /* ignore */ }
        }

        // Determine role - promos are primarily for pet owners
        var role = null;
        if (_fnExists('getActiveRole')) {
            try { role = getActiveRole(); } catch (_) { /* ignore */ }
        }

        // Build slot skeleton
        var slotId = containerId + '-promo-slot';
        var loaderId = containerId + '-promo-loader';
        var cardId = containerId + '-promo-card';

        // Avoid duplicate rendering
        var existingSlot = document.getElementById(slotId);
        if (existingSlot) {
            existingSlot.parentNode.removeChild(existingSlot);
        }

        var slot = document.createElement('div');
        slot.id = slotId;
        slot.className = 'promo-slot';

        // Loader target
        var loaderTarget = document.createElement('div');
        loaderTarget.id = loaderId;
        loaderTarget.className = 'promo-loader-slot';
        slot.appendChild(loaderTarget);

        // Card placeholder (hidden initially)
        var cardEl = document.createElement('div');
        cardEl.id = cardId;
        cardEl.className = 'promo-card promo-card--hidden';
        slot.appendChild(cardEl);

        container.appendChild(slot);

        // Set up InlineLoader for the recommendation fetch
        var loader = null;
        if (typeof InlineLoader === 'function') {
            loader = new InlineLoader({
                containerId: loaderId,
                onRetry: function () {
                    _fetchAndRender(loader, cardEl, petId, role);
                }
            });
        }

        _fetchAndRender(loader, cardEl, petId, role);
    }

    /**
     * Internal: fetch recommendation and render the card.
     */
    function _fetchAndRender(loader, cardEl, petId, role) {
        var fetchFn = function (signal) {
            // Build a wrapper promise that respects the abort signal
            return new Promise(function (resolve, reject) {
                if (signal && signal.aborted) {
                    return reject(new DOMException('Aborted', 'AbortError'));
                }

                var onAbort = function () {
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                if (signal) {
                    signal.addEventListener('abort', onAbort, { once: true });
                }

                loadPromoRecommendation(petId)
                    .then(function (product) {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        _renderCard(cardEl, product, petId, role);
                        resolve();
                    })
                    .catch(function (err) {
                        if (signal) signal.removeEventListener('abort', onAbort);
                        // On error, try mock fallback silently
                        var mockProduct = _pickMockProduct(petId);
                        _renderCard(cardEl, mockProduct, petId, role);
                        resolve();
                    });
            });
        };

        if (loader) {
            loader.start(fetchFn);
        } else {
            // InlineLoader not available - call directly without loading UI
            fetchFn(null);
        }
    }

    /**
     * Internal: populate card DOM with product data.
     */
    function _renderCard(cardEl, product, petId, role) {
        if (!cardEl) return;

        // Nothing to show
        if (!product || !product.name) {
            cardEl.classList.add('promo-card--hidden');
            cardEl.innerHTML = '';
            return;
        }

        // Check if this product was previously dismissed
        var dismissed = _getDismissedIds();
        if (product.productId && dismissed.indexOf(product.productId) !== -1) {
            cardEl.classList.add('promo-card--hidden');
            cardEl.innerHTML = '';
            return;
        }

        // Build card content
        var html = [
            '<span class="promo-badge">Consigliato per il tuo pet</span>',
            '<div class="promo-name">' + _escapeHtml(product.name) + '</div>',
            '<div class="promo-explanation">' + _escapeHtml(product.explanation || '') + '</div>',
            '<div class="promo-actions">',
            '  <button type="button" class="promo-btn promo-btn--info" data-promo-action="info">Maggiori info</button>',
            '  <button type="button" class="promo-btn promo-btn--dismiss" data-promo-action="dismiss">Non mi interessa</button>',
            '</div>'
        ].join('\n');

        cardEl.innerHTML = html;
        cardEl.classList.remove('promo-card--hidden');

        // Track impression
        trackPromoEvent('impression', product.productId, petId, {
            name: product.name,
            category: product.category || null,
            role: role || null
        });

        // Bind button events
        var infoBtn = cardEl.querySelector('[data-promo-action="info"]');
        var dismissBtn = cardEl.querySelector('[data-promo-action="dismiss"]');

        if (infoBtn) {
            infoBtn.addEventListener('click', function () {
                trackPromoEvent('info_click', product.productId, petId, {
                    name: product.name,
                    role: role || null
                });

                // Open info URL if available
                if (product.infoUrl) {
                    try {
                        window.open(product.infoUrl, '_blank', 'noopener,noreferrer');
                    } catch (_) {
                        // Popup blocked - try direct navigation in same context
                        window.location.href = product.infoUrl;
                    }
                } else {
                    if (_fnExists('showToast')) {
                        showToast('Informazioni prodotto non disponibili al momento.', 'info');
                    }
                }
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                trackPromoEvent('dismissed', product.productId, petId, {
                    name: product.name,
                    role: role || null
                });

                // Remember dismissal
                if (product.productId) {
                    _addDismissedId(product.productId);
                }

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
     * Minimal HTML entity escaping for safe text insertion.
     */
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
    // Expose public API on window
    // =========================================================================

    global.loadPromoRecommendation = loadPromoRecommendation;
    global.trackPromoEvent         = trackPromoEvent;
    global.renderPromoSlot         = renderPromoSlot;

})(typeof window !== 'undefined' ? window : this);
