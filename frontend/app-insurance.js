// app-insurance.js v1.0
// Multi-service: Insurance coverage cards for pet owner

/**
 * ADA Insurance Module v1
 *
 * Globals expected:
 *   fetchApi(path, options)   - authenticated fetch wrapper (config.js)
 *   showToast(message, type)  - toast notification (app-core.js)
 *   InlineLoader              - loading UI component (app-loading.js)
 *   getActiveRole()           - returns 'veterinario' | 'proprietario'
 *   getCurrentPetId()         - current pet id (app-pets.js)
 *
 * Globals exposed:
 *   renderInsuranceSlot(containerId, petId)       -> void
 *   checkInsuranceCoverage(petId)                  -> Promise<{covered, policy}>
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var INSURANCE_CSS_INJECTED = false;
    var INSURANCE_COLOR = '#1e40af';
    var INSURANCE_COLOR_HOVER = '#1e3a8a';
    var INSURANCE_COLOR_LIGHT = '#eff6ff';
    var INSURANCE_BORDER = '#bfdbfe';

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

    function _injectInsuranceStyles() {
        if (INSURANCE_CSS_INJECTED) return;
        INSURANCE_CSS_INJECTED = true;

        var css = [
            '.insurance-slot { margin: 16px 0; }',
            '.insurance-card {',
            '  background: ' + INSURANCE_COLOR_LIGHT + ';',
            '  border: 1px solid ' + INSURANCE_BORDER + ';',
            '  border-radius: 12px;',
            '  padding: 18px 20px;',
            '  box-shadow: 0 2px 8px rgba(0,0,0,0.06);',
            '  position: relative;',
            '  transition: opacity 0.3s ease;',
            '}',
            '.insurance-card--hidden { display: none; }',
            '.insurance-badge {',
            '  display: inline-block; font-size: 10px; font-weight: 700;',
            '  text-transform: uppercase; letter-spacing: 0.5px;',
            '  color: ' + INSURANCE_COLOR + '; background: #dbeafe;',
            '  padding: 2px 8px; border-radius: 6px; margin-bottom: 10px;',
            '}',
            '.insurance-title {',
            '  font-size: 16px; font-weight: 700; color: #1e3a5f;',
            '  margin-bottom: 12px; display: flex; align-items: center; gap: 8px;',
            '}',
            '.insurance-detail {',
            '  font-size: 14px; color: #334155; margin-bottom: 6px;',
            '}',
            '.insurance-detail strong { color: ' + INSURANCE_COLOR + '; }',
            '.insurance-risk {',
            '  display: flex; align-items: center; gap: 10px;',
            '  margin: 10px 0; font-size: 14px; color: #334155;',
            '}',
            '.insurance-risk-bar {',
            '  flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;',
            '}',
            '.insurance-risk-fill {',
            '  height: 100%; border-radius: 4px; transition: width 0.5s ease;',
            '}',
            '.insurance-actions {',
            '  display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;',
            '}',
            '.insurance-btn {',
            '  padding: 8px 16px; border-radius: 8px; font-size: 13px;',
            '  font-weight: 600; cursor: pointer; border: none;',
            '  transition: background 0.2s, opacity 0.2s;',
            '}',
            '.insurance-btn--primary {',
            '  background: ' + INSURANCE_COLOR + '; color: #fff;',
            '}',
            '.insurance-btn--primary:hover { background: ' + INSURANCE_COLOR_HOVER + '; }',
            '.insurance-btn--secondary {',
            '  background: #fff; color: ' + INSURANCE_COLOR + '; border: 1px solid ' + INSURANCE_BORDER + ';',
            '}',
            '.insurance-btn--secondary:hover { background: #dbeafe; }',
            '.insurance-btn--ghost {',
            '  background: transparent; color: #64748b;',
            '}',
            '.insurance-btn--ghost:hover { color: #334155; }'
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-insurance-styles', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // =========================================================================
    // checkInsuranceCoverage(petId) -> Promise<{covered, policy}>
    // =========================================================================

    function checkInsuranceCoverage(petId) {
        if (!petId || !_fnExists('fetchApi')) {
            return Promise.resolve({ covered: false, policy: null });
        }

        return global.fetchApi('/api/insurance/coverage/' + encodeURIComponent(petId))
            .then(function (res) {
                if (!res.ok) return { covered: false, policy: null };
                return res.json();
            })
            .then(function (data) {
                if (data && data.policy && data.policy.status === 'active') {
                    return { covered: true, policy: data.policy };
                }
                return { covered: false, policy: null };
            })
            .catch(function () {
                return { covered: false, policy: null };
            });
    }

    // =========================================================================
    // renderInsuranceSlot(containerId, petId)
    // =========================================================================

    function renderInsuranceSlot(containerId, petId) {
        _injectInsuranceStyles();

        var container = document.getElementById(containerId);
        if (!container) return;

        // Only show for proprietario (unless debug force multi-service is ON)
        var forceShow = (typeof isDebugForceMultiService === 'function' && isDebugForceMultiService());
        if (!forceShow && _fnExists('getActiveRole') && global.getActiveRole() !== 'proprietario') {
            container.innerHTML = '';
            return;
        }

        if (!petId) {
            container.innerHTML = '';
            return;
        }

        // Show loading state
        container.innerHTML = '<div class="insurance-slot"><div class="insurance-card">' +
            '<div class="insurance-badge">Assicurazione</div>' +
            '<div class="insurance-title">Assicurazione Pet</div>' +
            '<div style="color:#64748b;font-size:13px;">Caricamento...</div>' +
            '</div></div>';

        // Try to fetch coverage first
        global.fetchApi('/api/insurance/coverage/' + encodeURIComponent(petId))
            .then(function (res) {
                if (!res.ok) throw new Error('no coverage');
                return res.json();
            })
            .then(function (data) {
                if (data && data.policy && data.policy.status === 'active') {
                    _renderCoveredCard(container, data.policy, petId);
                } else {
                    // No active policy — fetch risk score
                    return _fetchAndRenderRisk(container, petId);
                }
            })
            .catch(function () {
                // Coverage endpoint failed — try risk score
                _fetchAndRenderRisk(container, petId);
            });
    }

    // =========================================================================
    // Internal renderers
    // =========================================================================

    function _renderCoveredCard(container, policy, petId) {
        var premium = policy.monthly_premium != null ? _escapeHtml(String(policy.monthly_premium)) : '--';
        var coverage = policy.coverage_pct != null ? _escapeHtml(String(policy.coverage_pct)) : '--';
        var limit = policy.annual_limit != null ? _escapeHtml(String(policy.annual_limit)) : '--';

        var html = '<div class="insurance-slot">' +
            '<div class="insurance-card">' +
            '<div class="insurance-badge">Assicurazione</div>' +
            '<div class="insurance-title">Assicurazione Pet</div>' +
            '<div class="insurance-detail"><strong>Premio mensile:</strong> ' + premium + ' &euro;</div>' +
            '<div class="insurance-detail"><strong>Copertura:</strong> ' + coverage + '%</div>' +
            '<div class="insurance-detail"><strong>Limite annuo:</strong> ' + limit + ' &euro;</div>' +
            '<div class="insurance-actions">' +
            '<button class="insurance-btn insurance-btn--primary" data-insurance-action="details" data-pet-id="' + _escapeHtml(petId) + '">Dettagli</button>' +
            '</div>' +
            '</div></div>';

        container.innerHTML = html;

        // Bind button
        var detailsBtn = container.querySelector('[data-insurance-action="details"]');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', function () {
                if (_fnExists('showToast')) global.showToast('Dettagli polizza in arrivo', 'info');
            });
        }
    }

    function _fetchAndRenderRisk(container, petId) {
        return global.fetchApi('/api/insurance/risk-score/' + encodeURIComponent(petId))
            .then(function (res) {
                if (!res.ok) throw new Error('risk score unavailable');
                return res.json();
            })
            .then(function (data) {
                _renderRiskCard(container, data, petId);
            })
            .catch(function () {
                _renderNoPolicyCard(container, petId);
            });
    }

    function _renderRiskCard(container, riskData, petId) {
        var score = (riskData && riskData.risk_score != null) ? Number(riskData.risk_score) : 0;
        var level = (riskData && riskData.risk_level) ? _escapeHtml(String(riskData.risk_level)) : 'sconosciuto';
        var pct = Math.min(Math.max(Math.round(score), 0), 100);

        // Color based on score
        var fillColor = '#22c55e'; // green
        if (pct > 66) fillColor = '#ef4444'; // red
        else if (pct > 33) fillColor = '#f59e0b'; // amber

        var html = '<div class="insurance-slot">' +
            '<div class="insurance-card">' +
            '<div class="insurance-badge">Assicurazione</div>' +
            '<div class="insurance-title">Assicurazione Pet</div>' +
            '<div class="insurance-detail">Nessuna polizza attiva</div>' +
            '<div class="insurance-risk">' +
            '<span>Rischio: <strong>' + _escapeHtml(level) + '</strong></span>' +
            '<div class="insurance-risk-bar">' +
            '<div class="insurance-risk-fill" style="width:' + pct + '%;background:' + fillColor + ';"></div>' +
            '</div>' +
            '<span>' + pct + '</span>' +
            '</div>' +
            '<div class="insurance-actions">' +
            '<button class="insurance-btn insurance-btn--primary" data-insurance-action="quote" data-pet-id="' + _escapeHtml(petId) + '">Richiedi preventivo</button>' +
            '<button class="insurance-btn insurance-btn--secondary" data-insurance-action="details" data-pet-id="' + _escapeHtml(petId) + '">Dettagli</button>' +
            '<button class="insurance-btn insurance-btn--ghost" data-insurance-action="dismiss" data-pet-id="' + _escapeHtml(petId) + '">No grazie</button>' +
            '</div>' +
            '</div></div>';

        container.innerHTML = html;
        _bindCardButtons(container);
    }

    function _renderNoPolicyCard(container, petId) {
        var html = '<div class="insurance-slot">' +
            '<div class="insurance-card">' +
            '<div class="insurance-badge">Assicurazione</div>' +
            '<div class="insurance-title">Assicurazione Pet</div>' +
            '<div class="insurance-detail">Nessuna polizza attiva. Proteggi il tuo amico a quattro zampe!</div>' +
            '<div class="insurance-actions">' +
            '<button class="insurance-btn insurance-btn--primary" data-insurance-action="quote" data-pet-id="' + _escapeHtml(petId) + '">Richiedi preventivo</button>' +
            '<button class="insurance-btn insurance-btn--secondary" data-insurance-action="details" data-pet-id="' + _escapeHtml(petId) + '">Dettagli</button>' +
            '<button class="insurance-btn insurance-btn--ghost" data-insurance-action="dismiss" data-pet-id="' + _escapeHtml(petId) + '">No grazie</button>' +
            '</div>' +
            '</div></div>';

        container.innerHTML = html;
        _bindCardButtons(container);
    }

    function _bindCardButtons(container) {
        var quoteBtn = container.querySelector('[data-insurance-action="quote"]');
        var detailsBtn = container.querySelector('[data-insurance-action="details"]');
        var dismissBtn = container.querySelector('[data-insurance-action="dismiss"]');

        if (quoteBtn) {
            quoteBtn.addEventListener('click', function () {
                if (_fnExists('showToast')) global.showToast('Richiesta preventivo inviata', 'info');
            });
        }

        if (detailsBtn) {
            detailsBtn.addEventListener('click', function () {
                if (_fnExists('showToast')) global.showToast('Dettagli assicurazione in arrivo', 'info');
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                var card = container.querySelector('.insurance-card');
                if (card) card.classList.add('insurance-card--hidden');
                if (_fnExists('showToast')) global.showToast('Suggerimento nascosto', 'info');
            });
        }
    }

    // =========================================================================
    // Expose globals
    // =========================================================================

    global.renderInsuranceSlot = renderInsuranceSlot;
    global.checkInsuranceCoverage = checkInsuranceCoverage;

})(window);
