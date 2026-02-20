// app-nutrition.js v2.0
// Multi-service: Nutrition plan cards for pet owner and vet validation
// v2: Deep data model integration, generation modal with pre-filled data, meals structure

/**
 * ADA Nutrition Module v2
 *
 * Globals expected:
 *   fetchApi(path, options)   - authenticated fetch wrapper (config.js)
 *   showToast(message, type)  - toast notification (app-core.js)
 *   InlineLoader              - loading UI component (app-loading.js)
 *   getActiveRole()           - returns 'veterinario' | 'proprietario'
 *   getCurrentPetId()         - current pet id (app-pets.js)
 *   petsCache                 - in-memory array of pet objects
 *   vitalsData                - array of vitals entries
 *   saveData()                - persist data
 *   getJwtTenantId()          - tenant id from JWT
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
        content.style.maxHeight = '90vh';
        content.style.overflowY = 'auto';

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
    // Nutrition input data collection (v2)
    // =========================================================================

    /**
     * Raccoglie tutti i dati necessari per il piano nutrizionale
     * dal profilo pet attivo. Ritorna un oggetto con:
     *   - data: tutti i campi
     *   - missing: array di campi mancanti critici
     *   - warnings: array di campi opzionali mancanti
     */
    function _collectNutritionInputs(pet) {
        if (!pet) return { data: null, missing: ['pet'], warnings: [] };

        var patient = pet.patient || {};
        var lifestyle = pet.lifestyle || {};
        var vitals = pet.vitalsData || [];
        var missing = [];
        var warnings = [];

        // --- Dati anagrafici ---
        var species = patient.petSpecies || pet.species || '';
        if (!species) missing.push('species');

        var breed = patient.petBreed || pet.breed || '';
        if (!breed) warnings.push('breed');

        var sex = patient.petSex || pet.sex || '';
        var isSterilized = false;
        if (sex) {
            var sexLower = sex.toLowerCase();
            isSterilized = sexLower.includes('castrat') || sexLower.includes('sterilizzat');
        } else {
            warnings.push('sex');
        }

        // --- Eta ---
        var birthdate = patient.petBirthdate || pet.birthdate || '';
        var ageMonths = null;
        var lifecycle = 'adult';
        if (birthdate) {
            var bd = new Date(birthdate);
            if (!isNaN(bd.getTime())) {
                var now = new Date();
                ageMonths = Math.round((now - bd) / (30.44 * 24 * 60 * 60 * 1000));
                if (ageMonths < 12) lifecycle = 'puppy';
                else if (ageMonths > 84) lifecycle = 'senior';
            }
        } else {
            missing.push('birthdate');
        }

        // --- Peso (dall'ultimo vitale, fallback su peso anagrafico) ---
        var latestWeight = null;
        var weightDate = null;
        var sortedVitals = vitals
            .filter(function(v) { return v.weight && v.weight > 0; })
            .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
        if (sortedVitals.length > 0) {
            latestWeight = sortedVitals[0].weight;
            weightDate = sortedVitals[0].date;
        } else if (patient.petWeightKg || pet.weight_kg) {
            latestWeight = parseFloat(patient.petWeightKg || pet.weight_kg);
            weightDate = pet.updatedAt || null;
        }
        if (!latestWeight) missing.push('weight');

        // --- BCS (dall'ultimo vitale con BCS) ---
        var latestBCS = null;
        var bcsDate = null;
        var bcsVitals = vitals
            .filter(function(v) { return v.bcs && v.bcs > 0; })
            .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
        if (bcsVitals.length > 0) {
            latestBCS = bcsVitals[0].bcs;
            bcsDate = bcsVitals[0].date;
        }
        if (!latestBCS) warnings.push('bcs');

        // --- Lifestyle ---
        var activityLevel = lifestyle.activityLevel || '';
        if (!activityLevel) warnings.push('activityLevel');

        var dietType = lifestyle.dietType || '';
        if (!dietType) warnings.push('dietType');

        var dietPreferences = lifestyle.dietPreferences || '';
        var knownConditions = lifestyle.knownConditions || '';
        var currentMeds = lifestyle.currentMeds || '';
        var foodAllergies = lifestyle.foodAllergies || [];
        var idealWeightKg = lifestyle.idealWeightKg || null;
        var mealsPerDay = lifestyle.mealsPerDay || null;

        return {
            data: {
                pet_id: pet.id || pet.pet_id,
                name: patient.petName || pet.name || '',
                species: species,
                breed: breed,
                sex: sex,
                is_sterilized: isSterilized,
                birthdate: birthdate,
                age_months: ageMonths,
                lifecycle: lifecycle,
                weight_kg: latestWeight,
                weight_date: weightDate,
                bcs: latestBCS,
                bcs_date: bcsDate,
                ideal_weight_kg: idealWeightKg,
                activity_level: activityLevel,
                diet_type: dietType,
                diet_preferences: dietPreferences,
                known_conditions: knownConditions,
                current_meds: currentMeds,
                food_allergies: foodAllergies,
                meals_per_day: mealsPerDay,
                environment: lifestyle.lifestyle || '',
                household: lifestyle.household || []
            },
            missing: missing,
            warnings: warnings
        };
    }

    // =========================================================================
    // Weight sync helper (v2)
    // =========================================================================

    function _syncWeightToVitals(newWeightKg, petId) {
        if (!newWeightKg || !petId) return;

        var pet = null;
        if (typeof petsCache !== 'undefined' && Array.isArray(petsCache)) {
            pet = petsCache.find(function(p) {
                return (p.id === petId || p.pet_id === petId);
            });
        }

        // Check if last weight is different
        var vData = (typeof vitalsData !== 'undefined') ? vitalsData : [];
        var lastWeightEntry = vData
            .filter(function(v) { return v.weight && v.weight > 0; })
            .sort(function(a, b) { return new Date(b.date) - new Date(a.date); })[0];

        if (lastWeightEntry && Math.abs(lastWeightEntry.weight - newWeightKg) < 0.05) {
            return; // Negligible difference
        }

        // Add new vitals entry with only weight
        var newVitalEntry = {
            date: new Date().toISOString(),
            weight: newWeightKg,
            temp: null,
            hr: null,
            rr: null,
            bcs: null
        };

        if (typeof vitalsData !== 'undefined') {
            vitalsData.push(newVitalEntry);
        }

        if (typeof saveData === 'function') {
            saveData();
        }

        // Update weight_kg in pets table
        fetchApi('/api/pets/' + encodeURIComponent(petId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight_kg: newWeightKg })
        }).catch(function() { /* silent */ });

        if (_fnExists('showToast')) showToast('Peso aggiornato anche nei parametri vitali.', 'info');
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
                        if (data && data.plan) {
                            var plan = data.plan;
                            var planData = (typeof plan.plan_data === 'string')
                                ? JSON.parse(plan.plan_data) : (plan.plan_data || {});
                            var flat = {
                                plan_id: plan.plan_id,
                                daily_kcal: planData.daily_kcal,
                                rer: planData.rer,
                                mer: planData.mer,
                                k_factor: planData.k_factor,
                                k_factor_reason: planData.k_factor_reason,
                                meals_per_day: planData.meals_per_day,
                                meals: planData.meals || [],
                                products: planData.products || [],
                                clinical_notes: planData.clinical_notes || '',
                                restrictions: planData.restrictions || [],
                                supplements: planData.supplements || [],
                                macros_target: planData.macros_target || {},
                                monitoring_plan: planData.monitoring_plan || {},
                                transition_plan: planData.transition_plan || {},
                                input_snapshot: planData.input_snapshot || {},
                                status: plan.status,
                                validation_status: plan.status
                            };
                            _renderNutritionCard(cardEl, flat, petId);
                        } else {
                            _renderNutritionEmpty(cardEl);
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

        // Daily kcal with RER/MER
        var kcalInfo = _escapeHtml(String(plan.daily_kcal)) + ' kcal/giorno';
        if (plan.k_factor) {
            kcalInfo += ' (K=' + _escapeHtml(String(plan.k_factor)) + ')';
        }
        html.push('<div class="nutrition-kcal">Fabbisogno giornaliero: ' + kcalInfo + '</div>');

        // Meals (v2 format)
        var meals = plan.meals || [];
        if (meals.length > 0) {
            html.push('<div class="nutrition-products">');
            for (var m = 0; m < meals.length; m++) {
                var meal = meals[m];
                html.push('<div class="nutrition-product-item">');
                html.push('<span class="nutrition-product-name">' + _escapeHtml(meal.label || 'Pasto') + '</span>');
                html.push('<span class="nutrition-product-dose">' + (meal.kcal || 0) + ' kcal');
                if (meal.time_suggestion) html.push(' (' + _escapeHtml(meal.time_suggestion) + ')');
                html.push('</span>');
                html.push('</div>');
            }
            html.push('</div>');
        } else {
            // Fallback: old products format
            var products = plan.products || [];
            if (products.length > 0) {
                html.push('<div class="nutrition-products">');
                for (var i = 0; i < products.length; i++) {
                    var p = products[i];
                    html.push('<div class="nutrition-product-item">');
                    html.push('  <span class="nutrition-product-name">' + _escapeHtml(p.name || 'Prodotto') + '</span>');
                    if (p.daily_dose || p.dose) {
                        html.push('  <span class="nutrition-product-dose">' + _escapeHtml(p.daily_dose || p.dose) + '</span>');
                    }
                    html.push('</div>');
                }
                html.push('</div>');
            }
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
            var _prods = plan.products || [];
            if (_prods.length > 0) { _nutDescParts.push('Prodotti: ' + _prods.map(function(p) { return (p.name || 'Prodotto') + (p.dose ? ' (' + p.dose + ')' : ''); }).join(', ') + '.'); }
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
                // Collect all items from meals
                var orderItems = [];
                var pMeals = plan.meals || [];
                for (var mi = 0; mi < pMeals.length; mi++) {
                    var mItems = pMeals[mi].items || [];
                    for (var ii = 0; ii < mItems.length; ii++) {
                        if (mItems[ii].source === 'catalog') orderItems.push(mItems[ii]);
                    }
                }
                // Fallback: old products
                if (orderItems.length === 0) {
                    orderItems = (plan.products || []).map(function(p) { return { name: p.name, grams: null, kcal: null, notes: p.daily_dose || p.dose || '' }; });
                }
                if (orderItems.length === 0) {
                    if (_fnExists('showToast')) showToast('Nessun prodotto nel piano nutrizionale.', 'warning');
                    return;
                }
                _nutritionShowModal('Ordina Prodotti', function(body) {
                    var h = [];
                    h.push('<div style="background:#fef3c7;color:#92400e;font-size:12px;text-align:center;padding:6px 12px;border-radius:6px;margin-bottom:16px;">Pagina simulata — nessun acquisto reale</div>');
                    h.push('<div style="margin-bottom:16px;">');
                    for (var oi = 0; oi < orderItems.length; oi++) {
                        var oItem = orderItems[oi];
                        h.push('<div style="display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:8px;">');
                        h.push('<div>');
                        h.push('<div style="font-weight:600;color:#1e3a5f;">' + _escapeHtml(oItem.name || 'Prodotto') + '</div>');
                        if (oItem.grams) h.push('<div style="font-size:12px;color:#888;">' + oItem.grams + 'g/pasto</div>');
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

                    // Header: kcal + RER/MER/K
                    h.push('<div style="margin-bottom:16px;">');
                    h.push('<div style="font-size:24px;font-weight:700;color:' + NUTRITION_COLOR + ';margin-bottom:4px;">' + _escapeHtml(String(plan.daily_kcal || 0)) + ' kcal/giorno</div>');
                    if (plan.rer || plan.mer) {
                        h.push('<div style="font-size:13px;color:#666;">');
                        if (plan.rer) h.push('RER: ' + plan.rer + ' kcal');
                        if (plan.mer) h.push(' | MER: ' + plan.mer + ' kcal');
                        if (plan.k_factor) h.push(' | K=' + plan.k_factor);
                        h.push('</div>');
                        if (plan.k_factor_reason) {
                            h.push('<div style="font-size:11px;color:#999;font-style:italic;">' + _escapeHtml(plan.k_factor_reason) + '</div>');
                        }
                    }
                    if (plan.meals_per_day) {
                        h.push('<div style="font-size:14px;color:#666;margin-top:4px;">Pasti consigliati: ' + _escapeHtml(String(plan.meals_per_day)) + ' al giorno</div>');
                    }
                    h.push('</div>');

                    // Meals (v2)
                    var dMeals = plan.meals || [];
                    if (dMeals.length > 0) {
                        h.push('<div style="margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Pasti giornalieri</div>');
                        for (var dm = 0; dm < dMeals.length; dm++) {
                            var dMeal = dMeals[dm];
                            h.push('<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:8px;">');
                            h.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">');
                            h.push('<div style="font-weight:700;color:#1e3a5f;">' + _escapeHtml(dMeal.label || 'Pasto') + '</div>');
                            h.push('<div style="font-size:12px;color:' + NUTRITION_COLOR + ';font-weight:600;">' + (dMeal.kcal || 0) + ' kcal (' + (dMeal.percentage || 0) + '%)</div>');
                            h.push('</div>');
                            if (dMeal.time_suggestion) {
                                h.push('<div style="font-size:11px;color:#888;margin-bottom:6px;">Orario suggerito: ' + _escapeHtml(dMeal.time_suggestion) + '</div>');
                            }
                            var dItems = dMeal.items || [];
                            for (var dit = 0; dit < dItems.length; dit++) {
                                var dItem = dItems[dit];
                                h.push('<div style="font-size:13px;color:#444;padding:3px 0;border-top:1px solid #e5e7eb;">');
                                h.push('<span style="font-weight:600;">' + _escapeHtml(dItem.name || '') + '</span>');
                                h.push(' — ' + (dItem.grams || '?') + 'g');
                                h.push(' (' + (dItem.kcal || '?') + ' kcal)');
                                if (dItem.notes) h.push('<div style="font-size:11px;color:#888;font-style:italic;">' + _escapeHtml(dItem.notes) + '</div>');
                                h.push('</div>');
                            }
                            h.push('</div>');
                        }
                        h.push('</div>');
                    } else {
                        // Fallback: old products
                        var dProducts = plan.products || [];
                        if (dProducts.length > 0) {
                            h.push('<div style="margin-bottom:16px;">');
                            h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Prodotti consigliati</div>');
                            for (var dp = 0; dp < dProducts.length; dp++) {
                                var dProd = dProducts[dp];
                                h.push('<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">');
                                h.push('<div style="font-weight:600;color:#1e3a5f;">' + _escapeHtml(dProd.name || 'Prodotto') + '</div>');
                                if (dProd.daily_dose || dProd.dose) h.push('<div style="font-size:13px;color:#555;margin-top:2px;">Dose: ' + _escapeHtml(dProd.daily_dose || dProd.dose) + '</div>');
                                if (dProd.notes) h.push('<div style="font-size:12px;color:#888;margin-top:2px;font-style:italic;">' + _escapeHtml(dProd.notes) + '</div>');
                                h.push('</div>');
                            }
                            h.push('</div>');
                        }
                    }

                    // Macronutrients target
                    var macros = plan.macros_target || {};
                    if (macros.protein_pct || macros.fat_pct) {
                        h.push('<div style="margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Obiettivi macronutrienti</div>');
                        h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">');
                        if (macros.protein_pct) h.push('<div style="background:#eff6ff;border-radius:6px;padding:8px;font-size:13px;text-align:center;">Proteine: <b>' + macros.protein_pct + '%</b></div>');
                        if (macros.fat_pct) h.push('<div style="background:#eff6ff;border-radius:6px;padding:8px;font-size:13px;text-align:center;">Grassi: <b>' + macros.fat_pct + '%</b></div>');
                        if (macros.carb_pct) h.push('<div style="background:#eff6ff;border-radius:6px;padding:8px;font-size:13px;text-align:center;">Carboidrati: <b>' + macros.carb_pct + '%</b></div>');
                        if (macros.fiber_pct) h.push('<div style="background:#eff6ff;border-radius:6px;padding:8px;font-size:13px;text-align:center;">Fibre: <b>' + macros.fiber_pct + '%</b></div>');
                        h.push('</div></div>');
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

                    // Monitoring plan
                    var monitoring = plan.monitoring_plan || {};
                    if (monitoring.weigh_frequency_days || monitoring.next_review_date) {
                        h.push('<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:12px 14px;margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:13px;color:#5b21b6;margin-bottom:4px;">Piano di monitoraggio</div>');
                        if (monitoring.weigh_frequency_days) h.push('<div style="font-size:12px;color:#555;">Pesata ogni ' + monitoring.weigh_frequency_days + ' giorni</div>');
                        if (monitoring.bcs_check_frequency_days) h.push('<div style="font-size:12px;color:#555;">Controllo BCS ogni ' + monitoring.bcs_check_frequency_days + ' giorni</div>');
                        if (monitoring.next_review_date) h.push('<div style="font-size:12px;color:#555;">Prossima revisione: ' + _escapeHtml(monitoring.next_review_date) + '</div>');
                        var adjRules = monitoring.adjustment_rules || [];
                        for (var ar = 0; ar < adjRules.length; ar++) {
                            h.push('<div style="font-size:11px;color:#888;font-style:italic;margin-top:2px;">' + _escapeHtml(adjRules[ar]) + '</div>');
                        }
                        h.push('</div>');
                    }

                    // Transition plan
                    var transition = plan.transition_plan || {};
                    if (transition.days && transition.schedule) {
                        h.push('<div style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:12px 14px;margin-bottom:16px;">');
                        h.push('<div style="font-weight:600;font-size:13px;color:#854d0e;margin-bottom:4px;">Piano di transizione (' + transition.days + ' giorni)</div>');
                        var sched = transition.schedule || [];
                        for (var ts = 0; ts < sched.length; ts++) {
                            var step = sched[ts];
                            h.push('<div style="font-size:12px;color:#555;">Giorno ' + _escapeHtml(step.day) + ': vecchio ' + step.old_pct + '% / nuovo ' + step.new_pct + '%</div>');
                        }
                        h.push('</div>');
                    }

                    // Input snapshot (collapsible)
                    var snap = plan.input_snapshot || {};
                    if (snap.species || snap.weight_kg) {
                        h.push('<details style="margin-bottom:16px;">');
                        h.push('<summary style="font-size:12px;color:#888;cursor:pointer;font-weight:600;">Dati usati per la generazione</summary>');
                        h.push('<div style="margin-top:8px;font-size:12px;color:#666;background:#f9fafb;border-radius:6px;padding:10px;">');
                        if (snap.species) h.push('Specie: ' + _escapeHtml(snap.species) + '<br>');
                        if (snap.breed) h.push('Razza: ' + _escapeHtml(snap.breed) + '<br>');
                        if (snap.sex) h.push('Sesso: ' + _escapeHtml(snap.sex) + (snap.is_sterilized ? ' (sterilizzato)' : '') + '<br>');
                        if (snap.age_months != null) h.push('Età: ' + snap.age_months + ' mesi (' + (snap.lifecycle || '') + ')<br>');
                        if (snap.weight_kg) h.push('Peso: ' + snap.weight_kg + ' kg<br>');
                        if (snap.bcs) h.push('BCS: ' + snap.bcs + '/9<br>');
                        if (snap.ideal_weight_kg) h.push('Peso ideale: ' + snap.ideal_weight_kg + ' kg<br>');
                        if (snap.activity_level) h.push('Attività: ' + _escapeHtml(snap.activity_level) + '<br>');
                        if (snap.diet_type) h.push('Alimentazione: ' + _escapeHtml(snap.diet_type) + '<br>');
                        if (snap.food_allergies && snap.food_allergies.length > 0) h.push('Allergie: ' + _escapeHtml(snap.food_allergies.join(', ')) + '<br>');
                        if (snap.generated_at) h.push('Generato: ' + new Date(snap.generated_at).toLocaleString('it-IT') + '<br>');
                        h.push('</div></details>');
                    }

                    // Status
                    var dStatus = plan.validation_status || plan.status || 'pending';
                    var dStatusLabel = dStatus === 'validated' ? 'Validato dal veterinario' : dStatus === 'rejected' ? 'Rifiutato' : 'In attesa di validazione';
                    h.push('<div style="text-align:center;font-size:13px;font-weight:600;color:#666;padding:8px 0;">' + dStatusLabel + '</div>');

                    h.push('<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" ' +
                        'style="width:100%;margin-top:12px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Chiudi</button>');

                    body.innerHTML = h.join('');
                });
            });
        }

        if (askVetBtn) {
            askVetBtn.addEventListener('click', function () {
                if (typeof navigateToPage === 'function') {
                    window._nutritionCommContext = {
                        petId: petId,
                        subject: 'Piano Nutrizionale',
                        message: 'Vorrei discutere del piano nutrizionale' +
                            (plan.daily_kcal ? ' (' + plan.daily_kcal + ' kcal/giorno)' : '') +
                            ' per il mio pet. ' +
                            (plan.clinical_notes ? 'Note: ' + plan.clinical_notes : '')
                    };
                    navigateToPage('communication');
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
    // renderNutritionValidation — Vet validation card (v2 with generation modal)
    // =========================================================================

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
                var plan = (data && data.plan) ? data.plan : null;
                if (!plan || !plan.plan_id) {
                    // No pending plan — offer generate button (v2: with modal)
                    validationEl.innerHTML = '<div class="nutrition-validation-card" style="text-align:center;">' +
                        '<div class="nutrition-validation-title" style="color:#1e3a5f;font-size:14px;">Nessun piano nutrizionale pending</div>' +
                        '<button type="button" class="nutrition-btn nutrition-btn--primary" id="nutrition-generate-btn-' + petId + '" style="margin-top:10px;">Genera piano AI</button>' +
                        '</div>';
                    var genBtn = document.getElementById('nutrition-generate-btn-' + petId);
                    if (genBtn) {
                        genBtn.addEventListener('click', function() {
                            // v2: Open generation modal with pre-filled data
                            var pet = null;
                            if (typeof petsCache !== 'undefined' && Array.isArray(petsCache)) {
                                pet = petsCache.find(function(p) {
                                    return (p.id === petId || p.pet_id === petId);
                                });
                            }
                            var inputs = _collectNutritionInputs(pet);

                            if (!inputs.data) {
                                if (_fnExists('showToast')) showToast('Impossibile raccogliere dati del pet.', 'error');
                                return;
                            }

                            _nutritionShowModal('Genera Piano Nutrizionale AI', function(body) {
                                var d = inputs.data;
                                var h = [];

                                // Header with pet name
                                h.push('<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px;">');
                                h.push('<div style="font-weight:700;color:#1e3a5f;font-size:16px;margin-bottom:4px;">');
                                h.push(_escapeHtml(d.name || 'Pet') + ' — ' + _escapeHtml(d.species));
                                h.push('</div>');
                                h.push('<div style="font-size:12px;color:#666;">');
                                h.push(_escapeHtml(d.breed || 'Razza non specificata'));
                                h.push(' &middot; ' + _escapeHtml(d.sex || 'Sesso N/D'));
                                if (d.age_months !== null) {
                                    h.push(' &middot; ' + (d.age_months < 12 ? d.age_months + ' mesi' : Math.floor(d.age_months / 12) + ' anni'));
                                }
                                h.push('</div>');
                                h.push('</div>');

                                // Missing critical fields alert
                                if (inputs.missing.length > 0) {
                                    h.push('<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px;margin-bottom:12px;">');
                                    h.push('<div style="font-weight:600;font-size:13px;color:#dc2626;margin-bottom:4px;">Dati mancanti (obbligatori)</div>');
                                    h.push('<div style="font-size:12px;color:#7f1d1d;">');
                                    var missingLabels = {
                                        species: 'Specie', birthdate: 'Data di nascita',
                                        weight: 'Peso (registrare in Parametri Vitali)', pet: 'Pet non selezionato'
                                    };
                                    h.push(inputs.missing.map(function(m) { return missingLabels[m] || m; }).join(', '));
                                    h.push('</div></div>');
                                }

                                // Optional missing fields alert
                                if (inputs.warnings.length > 0) {
                                    h.push('<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:12px;">');
                                    h.push('<div style="font-weight:600;font-size:13px;color:#92400e;margin-bottom:4px;">Dati opzionali non compilati</div>');
                                    h.push('<div style="font-size:12px;color:#78350f;">');
                                    var warnLabels = {
                                        breed: 'Razza', sex: 'Sesso', bcs: 'BCS (registrare in Parametri Vitali)',
                                        activityLevel: 'Livello attività (Stile di Vita)', dietType: 'Tipo alimentazione (Stile di Vita)'
                                    };
                                    h.push(inputs.warnings.map(function(w) { return warnLabels[w] || w; }).join(', '));
                                    h.push('</div></div>');
                                }

                                // Parameters grid
                                h.push('<div style="font-weight:600;font-size:14px;color:#1e3a5f;margin-bottom:8px;">Parametri per la generazione</div>');
                                h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">');

                                // Weight
                                var weightStyle = d.weight_kg ? '' : 'border-color:#dc2626;';
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Peso (kg)</label>');
                                h.push('<input type="number" id="nut-gen-weight" value="' + (d.weight_kg || '') + '" step="0.1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;' + weightStyle + '">');
                                if (d.weight_date) {
                                    h.push('<div style="font-size:10px;color:#999;margin-top:2px;">da Vitali: ' + new Date(d.weight_date).toLocaleDateString('it-IT') + '</div>');
                                }
                                h.push('</div>');

                                // BCS
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">BCS (1-9)</label>');
                                h.push('<select id="nut-gen-bcs" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('<option value="">Non specificato</option>');
                                var bcsLabelsMap = {1:'Emaciato',2:'Molto magro',3:'Magro',4:'Sottopeso',5:'Ideale',6:'Sovrappeso',7:'Pesante',8:'Obeso',9:'Gravemente obeso'};
                                for (var b = 1; b <= 9; b++) {
                                    h.push('<option value="' + b + '"' + (d.bcs === b ? ' selected' : '') + '>' + b + ' - ' + bcsLabelsMap[b] + '</option>');
                                }
                                h.push('</select>');
                                if (d.bcs_date) {
                                    h.push('<div style="font-size:10px;color:#999;margin-top:2px;">da Vitali: ' + new Date(d.bcs_date).toLocaleDateString('it-IT') + '</div>');
                                }
                                h.push('</div>');

                                // Ideal weight
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Peso ideale (kg)</label>');
                                h.push('<input type="number" id="nut-gen-ideal-weight" value="' + (d.ideal_weight_kg || '') + '" step="0.1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('</div>');

                                // Activity
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Attività</label>');
                                h.push('<select id="nut-gen-activity" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('<option value="">Non specificato</option>');
                                ['basso', 'medio', 'alto', 'sportivo'].forEach(function(v) {
                                    h.push('<option value="' + v + '"' + (d.activity_level === v ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>');
                                });
                                h.push('</select>');
                                h.push('</div>');

                                // Diet type
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Tipo alimentazione</label>');
                                h.push('<select id="nut-gen-diet-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('<option value="">Non specificato</option>');
                                ['secco', 'umido', 'barf', 'misto', 'casalingo'].forEach(function(v) {
                                    h.push('<option value="' + v + '"' + (d.diet_type === v ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>');
                                });
                                h.push('</select>');
                                h.push('</div>');

                                // Meals per day
                                h.push('<div>');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Pasti/giorno</label>');
                                h.push('<select id="nut-gen-meals" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('<option value="">Auto (AI decide)</option>');
                                [1, 2, 3, 4].forEach(function(v) {
                                    h.push('<option value="' + v + '"' + (d.meals_per_day === v ? ' selected' : '') + '>' + v + '</option>');
                                });
                                h.push('</select>');
                                h.push('</div>');

                                h.push('</div>'); // end grid

                                // Allergies
                                h.push('<div style="margin-bottom:12px;">');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Allergie alimentari</label>');
                                h.push('<input type="text" id="nut-gen-allergies" value="' + _escapeHtml((d.food_allergies || []).join(', ')) + '" placeholder="pollo, mais, glutine..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('</div>');

                                // Known conditions reminder
                                if (d.known_conditions) {
                                    h.push('<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px;margin-bottom:12px;">');
                                    h.push('<div style="font-size:11px;font-weight:600;color:#1e40af;">Condizioni note (da Stile di Vita):</div>');
                                    h.push('<div style="font-size:12px;color:#1e3a5f;">' + _escapeHtml(d.known_conditions) + '</div>');
                                    h.push('</div>');
                                }

                                // Current meds reminder
                                if (d.current_meds) {
                                    h.push('<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px;margin-bottom:12px;">');
                                    h.push('<div style="font-size:11px;font-weight:600;color:#92400e;">Farmaci in corso (da Stile di Vita):</div>');
                                    h.push('<div style="font-size:12px;color:#78350f;">' + _escapeHtml(d.current_meds) + '</div>');
                                    h.push('</div>');
                                }

                                // Budget (transient)
                                h.push('<div style="margin-bottom:16px;">');
                                h.push('<label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:2px;">Budget indicativo</label>');
                                h.push('<select id="nut-gen-budget" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">');
                                h.push('<option value="">Nessun vincolo</option>');
                                h.push('<option value="basso">Basso (economia)</option>');
                                h.push('<option value="medio">Medio</option>');
                                h.push('<option value="alto">Alto (premium)</option>');
                                h.push('</select>');
                                h.push('</div>');

                                // Generate button
                                h.push('<button type="button" id="nut-gen-submit" class="nutrition-btn nutrition-btn--primary" style="width:100%;padding:12px;font-size:15px;">');
                                h.push('Genera Piano Nutrizionale');
                                h.push('</button>');

                                // Cancel button
                                h.push('<button type="button" onclick="document.getElementById(\'nutrition-modal-overlay\').classList.remove(\'active\')" style="width:100%;margin-top:8px;padding:10px;background:#e5e7eb;color:#333;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Annulla</button>');

                                body.innerHTML = h.join('');

                                // Bind submit
                                var submitBtn = document.getElementById('nut-gen-submit');
                                if (submitBtn) {
                                    submitBtn.addEventListener('click', function() {
                                        var weightVal = parseFloat(document.getElementById('nut-gen-weight').value);
                                        if (!weightVal || weightVal <= 0) {
                                            if (_fnExists('showToast')) showToast('Il peso è obbligatorio per generare il piano.', 'error');
                                            return;
                                        }

                                        submitBtn.disabled = true;
                                        submitBtn.textContent = 'Generazione in corso...';

                                        var payload = {
                                            pet_id: d.pet_id,
                                            overrides: {
                                                weight_kg: weightVal,
                                                bcs: parseInt(document.getElementById('nut-gen-bcs').value) || null,
                                                ideal_weight_kg: parseFloat(document.getElementById('nut-gen-ideal-weight').value) || null,
                                                activity_level: document.getElementById('nut-gen-activity').value || null,
                                                diet_type: document.getElementById('nut-gen-diet-type').value || null,
                                                meals_per_day: parseInt(document.getElementById('nut-gen-meals').value) || null,
                                                food_allergies: (document.getElementById('nut-gen-allergies').value || '')
                                                    .split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }),
                                                budget: document.getElementById('nut-gen-budget').value || null
                                            }
                                        };

                                        var tenantId = (typeof getJwtTenantId === 'function') ? getJwtTenantId() : null;
                                        if (tenantId) payload.tenant_id = tenantId;

                                        fetchApi('/api/nutrition/plan/' + encodeURIComponent(String(d.pet_id)) + '/generate', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(payload)
                                        }).then(function(r) {
                                            if (r.ok) return r.json();
                                            throw new Error('generate failed');
                                        }).then(function(result) {
                                            _nutritionCloseModal();
                                            if (_fnExists('showToast')) showToast('Piano nutrizionale generato!', 'success');

                                            // SYNC: If weight was changed in modal, update vitals
                                            if (weightVal !== d.weight_kg) {
                                                _syncWeightToVitals(weightVal, d.pet_id);
                                            }

                                            // Re-render
                                            renderNutritionValidation(containerId, petId);
                                        }).catch(function(err) {
                                            if (_fnExists('showToast')) showToast('Errore nella generazione: ' + (err.message || 'errore'), 'error');
                                            submitBtn.disabled = false;
                                            submitBtn.textContent = 'Genera Piano Nutrizionale';
                                        });
                                    });
                                }
                            });
                        });
                    }
                    return;
                }
                // Flatten plan_data
                var planData = (typeof plan.plan_data === 'string')
                    ? JSON.parse(plan.plan_data) : (plan.plan_data || {});
                var flat = {
                    plan_id: plan.plan_id,
                    daily_kcal: planData.daily_kcal,
                    rer: planData.rer,
                    mer: planData.mer,
                    k_factor: planData.k_factor,
                    k_factor_reason: planData.k_factor_reason,
                    meals_per_day: planData.meals_per_day,
                    meals: planData.meals || [],
                    products: planData.products || [],
                    clinical_notes: planData.clinical_notes || '',
                    restrictions: planData.restrictions || [],
                    supplements: planData.supplements || [],
                    macros_target: planData.macros_target || {},
                    monitoring_plan: planData.monitoring_plan || {},
                    transition_plan: planData.transition_plan || {},
                    input_snapshot: planData.input_snapshot || {},
                    status: plan.status
                };
                _renderValidationCard(validationEl, flat, petId, containerId);
            })
            .catch(function () {
                validationEl.innerHTML = '';
            });
    }

    function _renderValidationCard(el, plan, petId, containerId) {
        if (!el || !plan) return;

        var planId = plan.plan_id || plan.id;

        var html = [];
        html.push('<div class="nutrition-validation-card">');
        html.push('  <div class="nutrition-validation-title">Piano nutrizionale in attesa di validazione</div>');

        // Daily kcal with K factor
        if (plan.daily_kcal) {
            var kcalStr = _escapeHtml(String(plan.daily_kcal)) + ' kcal/giorno';
            if (plan.k_factor) kcalStr += ' (K=' + plan.k_factor + ')';
            html.push('  <div class="nutrition-kcal">Fabbisogno: ' + kcalStr + '</div>');
        }

        // Meals (v2)
        var vMeals = plan.meals || [];
        if (vMeals.length > 0) {
            html.push('  <div class="nutrition-products">');
            for (var vm = 0; vm < vMeals.length; vm++) {
                var vMeal = vMeals[vm];
                html.push('    <div class="nutrition-product-item">');
                html.push('      <span class="nutrition-product-name">' + _escapeHtml(vMeal.label || 'Pasto') + '</span>');
                html.push('      <span class="nutrition-product-dose">' + (vMeal.kcal || 0) + ' kcal (' + (vMeal.percentage || 0) + '%)');
                if (vMeal.time_suggestion) html.push(' ' + _escapeHtml(vMeal.time_suggestion));
                html.push('</span>');
                html.push('    </div>');
            }
            html.push('  </div>');
        } else {
            // Fallback: old products
            var vProducts = plan.products || [];
            if (vProducts.length > 0) {
                html.push('  <div class="nutrition-products">');
                for (var vi = 0; vi < vProducts.length; vi++) {
                    var vp = vProducts[vi];
                    html.push('    <div class="nutrition-product-item">');
                    html.push('      <span class="nutrition-product-name">' + _escapeHtml(vp.name || 'Prodotto') + '</span>');
                    if (vp.daily_dose || vp.dose) html.push('      <span class="nutrition-product-dose">' + _escapeHtml(vp.daily_dose || vp.dose) + '</span>');
                    html.push('    </div>');
                }
                html.push('  </div>');
            }
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
                                    if (containerId) renderNutritionValidation(containerId, petId);
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
