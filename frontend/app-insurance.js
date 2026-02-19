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
    // Generic modal helper (re-usable within insurance module)
    // =========================================================================

    function _insuranceShowModal(title, renderFn) {
        var existing = document.getElementById('insurance-modal-overlay');
        if (existing) existing.parentNode.removeChild(existing);

        var overlay = document.createElement('div');
        overlay.id = 'insurance-modal-overlay';
        overlay.className = 'modal active';
        overlay.style.zIndex = '3100';

        var content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '640px';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
        header.innerHTML = '<h3 style="margin:0;color:#1e3a5f;font-size:18px;">' + _escapeHtml(title) + '</h3>' +
            '<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" ' +
            'style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;padding:4px 8px;">✕</button>';
        content.appendChild(header);

        var body = document.createElement('div');
        body.id = 'insurance-modal-body';
        content.appendChild(body);

        overlay.appendChild(content);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.classList.remove('active');
        });
        document.body.appendChild(overlay);

        if (typeof renderFn === 'function') renderFn(body);
    }

    function _insuranceCloseModal() {
        var overlay = document.getElementById('insurance-modal-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    // =========================================================================
    // Plan selector: fetch plans, show comparison, request quote
    // =========================================================================

    function _showPlanSelector(petId) {
        var tenantId = (typeof getJwtTenantId === 'function') ? getJwtTenantId() : null;
        if (!tenantId) {
            if (_fnExists('showToast')) global.showToast('Impossibile determinare il tenant.', 'error');
            return;
        }

        _insuranceShowModal('Scegli il tuo piano assicurativo', function(body) {
            body.innerHTML = '<div style="text-align:center;padding:24px;color:#64748b;">Caricamento piani disponibili...</div>';

            global.fetchApi('/api/insurance/plans?petId=' + encodeURIComponent(petId) + '&tenantId=' + encodeURIComponent(tenantId))
                .then(function(res) { return res.ok ? res.json() : Promise.reject('fetch_error'); })
                .then(function(data) {
                    var plans = data.plans || [];
                    var risk = data.risk_score || {};

                    if (plans.length === 0) {
                        body.innerHTML = '<div style="text-align:center;padding:24px;color:#888;">Nessun piano assicurativo disponibile per questo pet.</div>' +
                            '<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>';
                        return;
                    }

                    var h = [];

                    // Risk score summary bar
                    var riskPct = Math.min(Math.max(risk.total_score || 0, 0), 100);
                    var riskColor = riskPct > 66 ? '#ef4444' : (riskPct > 33 ? '#f59e0b' : '#22c55e');
                    var riskLabels = { low: 'Basso', medium: 'Medio', high: 'Alto', very_high: 'Molto alto' };
                    h.push('<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:16px;">');
                    h.push('<div style="font-size:13px;color:#64748b;margin-bottom:6px;">Profilo rischio del tuo pet</div>');
                    h.push('<div style="display:flex;align-items:center;gap:10px;">');
                    h.push('<span style="font-weight:700;color:' + riskColor + ';">' + _escapeHtml(riskLabels[risk.risk_class] || risk.risk_class || '?') + '</span>');
                    h.push('<div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">');
                    h.push('<div style="height:100%;width:' + riskPct + '%;background:' + riskColor + ';border-radius:4px;"></div>');
                    h.push('</div>');
                    h.push('<span style="font-size:12px;color:#888;">' + riskPct + '/100</span>');
                    h.push('</div>');
                    if (risk.price_multiplier && risk.price_multiplier > 1) {
                        h.push('<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Coefficiente premio: x' + risk.price_multiplier.toFixed(1) + '</div>');
                    }
                    h.push('</div>');

                    // Plan cards
                    for (var i = 0; i < plans.length; i++) {
                        var p = plans[i];
                        var ins = p.insurance_data || {};
                        var isPopular = (ins.plan_tier === 'confort');

                        h.push('<div style="border:2px solid ' + (isPopular ? INSURANCE_COLOR : '#e2e8f0') + ';border-radius:12px;padding:16px;margin-bottom:12px;position:relative;' + (isPopular ? 'background:#eff6ff;' : '') + '">');

                        if (isPopular) {
                            h.push('<div style="position:absolute;top:-10px;right:16px;background:' + INSURANCE_COLOR + ';color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:10px;text-transform:uppercase;">Più scelto</div>');
                        }

                        // Plan header
                        h.push('<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">');
                        h.push('<div>');
                        h.push('<div style="font-size:16px;font-weight:700;color:#1e3a5f;">' + _escapeHtml(p.name) + '</div>');
                        h.push('<div style="font-size:12px;color:#64748b;">' + _escapeHtml(ins.plan_label_it || '') + '</div>');
                        h.push('</div>');
                        h.push('<div style="text-align:right;">');
                        h.push('<div style="font-size:22px;font-weight:800;color:' + INSURANCE_COLOR + ';">' + (p.personalized_premium || '?') + '&euro;</div>');
                        h.push('<div style="font-size:11px;color:#94a3b8;">/mese</div>');
                        if (p.personalized_premium !== p.base_premium) {
                            h.push('<div style="font-size:11px;color:#94a3b8;text-decoration:line-through;">' + (p.base_premium || '') + '&euro; base</div>');
                        }
                        h.push('</div>');
                        h.push('</div>');

                        // Key features row
                        h.push('<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">');
                        h.push('<span style="background:#dbeafe;color:' + INSURANCE_COLOR + ';font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">Rimborso ' + (ins.coverage_pct || '?') + '%</span>');
                        h.push('<span style="background:#dbeafe;color:' + INSURANCE_COLOR + ';font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">Max ' + (ins.annual_limit || '?') + '&euro;/anno</span>');
                        h.push('<span style="background:#dbeafe;color:' + INSURANCE_COLOR + ';font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">Franchigia ' + (ins.deductible || '?') + '&euro;</span>');
                        if (ins.prevention_budget) {
                            h.push('<span style="background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">Prevenzione ' + ins.prevention_budget + '&euro;/anno</span>');
                        }
                        if (ins.therapeutic_food_max_annual) {
                            h.push('<span style="background:#fef3c7;color:#b45309;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">Alimento terap. ' + ins.therapeutic_food_max_annual + '&euro;/anno</span>');
                        }
                        h.push('</div>');

                        // Description
                        if (p.description) {
                            h.push('<div style="font-size:13px;color:#555;line-height:1.5;margin-bottom:12px;">' + _escapeHtml(p.description) + '</div>');
                        }

                        // Select button
                        h.push('<button type="button" class="insurance-btn insurance-btn--primary ins-select-plan-btn" data-plan-id="' + _escapeHtml(p.promo_item_id) + '" data-plan-name="' + _escapeHtml(p.name) + '" data-plan-premium="' + (p.personalized_premium || 0) + '" style="width:100%;padding:10px;">Seleziona ' + _escapeHtml(p.name) + '</button>');

                        h.push('</div>');
                    }

                    // Provider info
                    var providerInfo = (plans[0] && plans[0].insurance_data) ? plans[0].insurance_data.provider_info : null;
                    if (providerInfo) {
                        h.push('<div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:8px;line-height:1.5;">');
                        h.push(_escapeHtml(providerInfo.company_name || '') + ' — ' + _escapeHtml(providerInfo.legal_entity || ''));
                        if (providerInfo.phone_italy) h.push('<br>Tel: ' + _escapeHtml(providerInfo.phone_italy));
                        h.push('</div>');
                    }

                    body.innerHTML = h.join('');

                    // Bind select buttons
                    var selectBtns = body.querySelectorAll('.ins-select-plan-btn');
                    for (var b = 0; b < selectBtns.length; b++) {
                        selectBtns[b].addEventListener('click', function() {
                            var btn = this;
                            var planItemId = btn.getAttribute('data-plan-id');
                            var planName = btn.getAttribute('data-plan-name');
                            var planPremium = btn.getAttribute('data-plan-premium');
                            _requestInsuranceQuote(petId, tenantId, planItemId, planName, planPremium, body);
                        });
                    }
                })
                .catch(function() {
                    body.innerHTML = '<div style="text-align:center;padding:24px;color:#dc2626;">Errore nel caricamento dei piani.</div>' +
                        '<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>';
                });
        });
    }

    // =========================================================================
    // Request insurance quote and show confirmation
    // =========================================================================

    function _requestInsuranceQuote(petId, tenantId, promoItemId, planName, planPremium, containerBody) {
        // Replace body with loading
        containerBody.innerHTML = '<div style="text-align:center;padding:32px;">' +
            '<div style="font-size:16px;font-weight:600;color:#1e3a5f;margin-bottom:8px;">Calcolo preventivo in corso...</div>' +
            '<div style="font-size:13px;color:#64748b;">' + _escapeHtml(planName) + '</div>' +
            '</div>';

        global.fetchApi('/api/insurance/quote/' + encodeURIComponent(petId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: tenantId, promo_item_id: promoItemId })
        })
        .then(function(res) { return res.ok ? res.json() : Promise.reject('quote_error'); })
        .then(function(data) {
            var policy = data.policy || {};
            var coverageData = (typeof policy.coverage_data === 'string') ? JSON.parse(policy.coverage_data) : (policy.coverage_data || {});

            var h = [];
            h.push('<div style="text-align:center;margin-bottom:20px;">');
            h.push('<div style="font-size:20px;font-weight:700;color:#1e3a5f;">Preventivo pronto!</div>');
            h.push('<div style="font-size:14px;color:#64748b;">' + _escapeHtml(planName) + '</div>');
            h.push('</div>');

            // Premium highlight
            h.push('<div style="background:' + INSURANCE_COLOR_LIGHT + ';border:2px solid ' + INSURANCE_COLOR + ';border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">');
            h.push('<div style="font-size:32px;font-weight:800;color:' + INSURANCE_COLOR + ';">' + _escapeHtml(String(policy.monthly_premium || planPremium)) + '&euro;</div>');
            h.push('<div style="font-size:13px;color:#64748b;">al mese</div>');
            h.push('</div>');

            // Coverage summary
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:18px;font-weight:700;color:' + INSURANCE_COLOR + ';">' + (coverageData.coverage_pct || '?') + '%</div>');
            h.push('<div style="font-size:11px;color:#888;">Rimborso</div></div>');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:18px;font-weight:700;color:' + INSURANCE_COLOR + ';">' + (coverageData.annual_limit || '?') + '&euro;</div>');
            h.push('<div style="font-size:11px;color:#888;">Limite annuo</div></div>');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:18px;font-weight:700;color:' + INSURANCE_COLOR + ';">' + (coverageData.deductible || '?') + '&euro;</div>');
            h.push('<div style="font-size:11px;color:#888;">Franchigia</div></div>');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:18px;font-weight:700;color:' + INSURANCE_COLOR + ';">' + (coverageData.prevention_budget || 0) + '&euro;</div>');
            h.push('<div style="font-size:11px;color:#888;">Prevenzione/anno</div></div>');
            h.push('</div>');

            // Activation buttons
            h.push('<button type="button" id="ins-activate-policy-btn" data-policy-id="' + _escapeHtml(policy.policy_id || '') + '" style="width:100%;padding:14px;background:' + INSURANCE_COLOR + ';color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">Attiva polizza</button>');
            h.push('<div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:6px;">Puoi annullare entro 14 giorni dalla sottoscrizione</div>');
            h.push('<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:8px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Ci penso</button>');

            containerBody.innerHTML = h.join('');

            // Bind activate button
            var activateBtn = document.getElementById('ins-activate-policy-btn');
            if (activateBtn) {
                activateBtn.addEventListener('click', function() {
                    var policyId = activateBtn.getAttribute('data-policy-id');
                    activateBtn.disabled = true;
                    activateBtn.textContent = 'Attivazione in corso...';

                    global.fetchApi('/api/insurance/policy/' + encodeURIComponent(policyId) + '/activate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    })
                    .then(function(r) { return r.ok ? r.json() : Promise.reject('activate_error'); })
                    .then(function(result) {
                        if (_fnExists('showToast')) global.showToast('Polizza attivata con successo!', 'success');
                        _insuranceCloseModal();
                        // Refresh insurance slot
                        renderInsuranceSlot('patient-insurance-container', petId);
                    })
                    .catch(function() {
                        if (_fnExists('showToast')) global.showToast('Errore nell\'attivazione. Riprova.', 'error');
                        activateBtn.disabled = false;
                        activateBtn.textContent = 'Attiva polizza';
                    });
                });
            }
        })
        .catch(function() {
            containerBody.innerHTML = '<div style="text-align:center;padding:24px;color:#dc2626;">Errore nella generazione del preventivo.</div>' +
                '<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>';
        });
    }

    // =========================================================================
    // Policy details modal
    // =========================================================================

    function _showPolicyDetails(policy, petId) {
        var coverageData = (typeof policy.coverage_data === 'string') ? JSON.parse(policy.coverage_data) : (policy.coverage_data || {});

        _insuranceShowModal('Dettagli Polizza', function(body) {
            var h = [];

            // Header
            h.push('<div style="text-align:center;margin-bottom:16px;">');
            h.push('<div style="display:inline-block;background:#dcfce7;color:#16a34a;font-size:12px;font-weight:700;padding:4px 12px;border-radius:8px;margin-bottom:8px;">POLIZZA ATTIVA</div>');
            h.push('<div style="font-size:18px;font-weight:700;color:#1e3a5f;">' + _escapeHtml(coverageData.plan_label_it || 'Piano') + ' — ' + _escapeHtml(coverageData.provider || '') + '</div>');
            h.push('<div style="font-size:13px;color:#888;">ID: ' + _escapeHtml(policy.policy_id || '') + '</div>');
            h.push('</div>');

            // Premium & dates
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">');
            h.push('<div style="background:' + INSURANCE_COLOR_LIGHT + ';border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:20px;font-weight:700;color:' + INSURANCE_COLOR + ';">' + _escapeHtml(String(policy.monthly_premium || '?')) + '&euro;</div>');
            h.push('<div style="font-size:11px;color:#888;">Premio/mese</div></div>');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:14px;font-weight:600;color:#334155;">' + _escapeHtml(policy.start_date ? new Date(policy.start_date).toLocaleDateString('it-IT') : '?') + '</div>');
            h.push('<div style="font-size:11px;color:#888;">Inizio</div></div>');
            h.push('<div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">');
            h.push('<div style="font-size:14px;font-weight:600;color:#334155;">' + _escapeHtml(policy.end_date ? new Date(policy.end_date).toLocaleDateString('it-IT') : '?') + '</div>');
            h.push('<div style="font-size:11px;color:#888;">Scadenza</div></div>');
            h.push('</div>');

            // Coverage details
            h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Copertura</div>');
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">');

            var coverageItems = [
                ['Rimborso', (coverageData.coverage_pct || '?') + '%'],
                ['Massimale annuo', (coverageData.annual_limit || '?') + '&euro;'],
                ['Franchigia', (coverageData.deductible || '?') + '&euro;'],
                ['Prevenzione', (coverageData.prevention_budget || 0) + '&euro;/anno'],
            ];
            if (coverageData.therapeutic_food_max_annual) {
                coverageItems.push(['Alimento terapeutico', coverageData.therapeutic_food_max_annual + '&euro;/anno']);
            }
            for (var ci = 0; ci < coverageItems.length; ci++) {
                h.push('<div style="background:#f8fafc;border-radius:6px;padding:8px 10px;">');
                h.push('<div style="font-size:11px;color:#888;">' + coverageItems[ci][0] + '</div>');
                h.push('<div style="font-size:14px;font-weight:600;color:#1e3a5f;">' + coverageItems[ci][1] + '</div>');
                h.push('</div>');
            }
            h.push('</div>');

            // Covered services
            var services = coverageData.covered_services || {};
            var serviceLabels = {
                emergency: 'Emergenze', specialist_consultations: 'Visite specialistiche', surgery: 'Chirurgia',
                anesthesia: 'Anestesia', hospitalization: 'Ricovero', day_hospital: 'Day hospital',
                diagnostics_xray: 'Radiografia', diagnostics_ultrasound: 'Ecografia',
                diagnostics_ct: 'TAC', diagnostics_mri: 'Risonanza', diagnostics_lab: 'Analisi laboratorio',
                medications: 'Farmaci', alternative_osteopathy: 'Osteopatia', alternative_physiotherapy: 'Fisioterapia',
                alternative_acupuncture: 'Agopuntura', dental_cleaning: 'Igiene dentale',
                ambulance: 'Ambulanza', radiotherapy: 'Radioterapia'
            };
            var coveredList = [];
            for (var sKey in services) {
                if (services[sKey]) coveredList.push(serviceLabels[sKey] || sKey);
            }
            if (coveredList.length > 0) {
                h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:6px;">Servizi coperti</div>');
                h.push('<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px;">');
                for (var cl = 0; cl < coveredList.length; cl++) {
                    h.push('<span style="background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;">' + _escapeHtml(coveredList[cl]) + '</span>');
                }
                h.push('</div>');
            }

            // Add-ons
            var addons = coverageData.addons || [];
            if (addons.length > 0) {
                h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:6px;">Opzioni aggiuntive</div>');
                for (var ai = 0; ai < addons.length; ai++) {
                    var addon = addons[ai];
                    h.push('<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:6px;">');
                    h.push('<div style="font-weight:600;font-size:13px;color:#92400e;">' + _escapeHtml(addon.name || '') + ' — ' + (addon.monthly_eur || '?') + '&euro;/mese</div>');
                    if (addon.services) {
                        h.push('<div style="font-size:12px;color:#78350f;margin-top:2px;">' + _escapeHtml(addon.services.join(', ')) + '</div>');
                    }
                    h.push('</div>');
                }
            }

            // Claims history button
            h.push('<div style="margin-top:16px;display:flex;gap:8px;">');
            h.push('<button type="button" class="insurance-btn insurance-btn--secondary" id="ins-view-claims-btn" style="flex:1;padding:10px;">Storico rimborsi</button>');
            h.push('<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" class="insurance-btn insurance-btn--primary" style="flex:1;padding:10px;">Chiudi</button>');
            h.push('</div>');

            body.innerHTML = h.join('');

            // Bind claims button
            var claimsBtn = document.getElementById('ins-view-claims-btn');
            if (claimsBtn) {
                claimsBtn.addEventListener('click', function() {
                    _showClaimsHistory(petId, body);
                });
            }
        });
    }

    // =========================================================================
    // Claims history
    // =========================================================================

    function _showClaimsHistory(petId, containerBody) {
        containerBody.innerHTML = '<div style="text-align:center;padding:16px;color:#64748b;">Caricamento storico rimborsi...</div>';

        global.fetchApi('/api/insurance/claims/' + encodeURIComponent(petId))
            .then(function(res) { return res.ok ? res.json() : Promise.reject('fetch_error'); })
            .then(function(data) {
                var claims = data.claims || [];
                var h = [];
                h.push('<div style="font-weight:600;font-size:15px;color:#1e3a5f;margin-bottom:12px;">Storico rimborsi</div>');

                if (claims.length === 0) {
                    h.push('<div style="text-align:center;color:#888;padding:20px;font-size:13px;">Nessun rimborso richiesto</div>');
                } else {
                    var statusColors = { draft: '#94a3b8', submitted: '#f59e0b', approved: '#16a34a', rejected: '#dc2626' };
                    var statusLabels = { draft: 'Bozza', submitted: 'Inviato', approved: 'Approvato', rejected: 'Rifiutato' };
                    for (var i = 0; i < claims.length; i++) {
                        var c = claims[i];
                        var sColor = statusColors[c.status] || '#888';
                        var sLabel = statusLabels[c.status] || c.status;
                        h.push('<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;">');
                        h.push('<div style="display:flex;justify-content:space-between;align-items:center;">');
                        h.push('<div>');
                        h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;">Rimborso #' + _escapeHtml(c.claim_id ? c.claim_id.slice(-6) : '?') + '</div>');
                        h.push('<div style="font-size:12px;color:#888;">' + _escapeHtml(c.created_at ? new Date(c.created_at).toLocaleDateString('it-IT') : '?') + '</div>');
                        h.push('</div>');
                        h.push('<div style="text-align:right;">');
                        h.push('<div style="font-size:16px;font-weight:700;color:#1e3a5f;">' + _escapeHtml(String(c.amount || 0)) + '&euro;</div>');
                        h.push('<span style="background:' + sColor + '22;color:' + sColor + ';font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;">' + _escapeHtml(sLabel) + '</span>');
                        h.push('</div>');
                        h.push('</div>');
                        h.push('</div>');
                    }
                }

                h.push('<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>');
                containerBody.innerHTML = h.join('');
            })
            .catch(function() {
                containerBody.innerHTML = '<div style="text-align:center;color:#dc2626;padding:16px;">Errore nel caricamento.</div>' +
                    '<button type="button" onclick="document.getElementById(\'insurance-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>';
            });
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
                _showPolicyDetails(policy, petId);
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
            (typeof debugLogEnabled !== 'undefined' && debugLogEnabled ?
                '<div style="margin-top:8px;text-align:center;">' +
                '<button type="button" class="insurance-btn insurance-btn--secondary" style="font-size:11px;padding:4px 12px;" onclick="if(typeof _showPromoAnalysis===\'function\')_showPromoAnalysis(null,\'' + _escapeHtml(petId) + '\',\'Assicurazione Pet - Servizio assicurativo per animali domestici. Livello rischio: ' + _escapeHtml(level) + ', score: ' + pct + '%. Copertura veterinaria, emergenze, interventi chirurgici.\')">🔍 Analisi raccomandazione</button>' +
                '</div>' : '') +
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
                var petId = quoteBtn.getAttribute('data-pet-id');
                _showPlanSelector(petId);
            });
        }

        if (detailsBtn) {
            detailsBtn.addEventListener('click', function () {
                var petId = detailsBtn.getAttribute('data-pet-id');
                _showPlanSelector(petId);
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                var card = container.querySelector('.insurance-card');
                if (card) {
                    card.style.transition = 'opacity 0.3s ease';
                    card.style.opacity = '0';
                    setTimeout(function() { card.style.display = 'none'; }, 300);
                }
                if (_fnExists('showToast')) global.showToast('Suggerimento nascosto per questa sessione.', 'info');
            });
        }
    }

    // =========================================================================
    // Expose globals
    // =========================================================================

    global.renderInsuranceSlot = renderInsuranceSlot;
    global.checkInsuranceCoverage = checkInsuranceCoverage;
    global._showPlanSelector = _showPlanSelector;
    global._showPolicyDetails = _showPolicyDetails;
    global._showClaimsHistory = _showClaimsHistory;
    global._insuranceShowModal = _insuranceShowModal;
    global._insuranceCloseModal = _insuranceCloseModal;

})(window);
