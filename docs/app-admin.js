// app-admin.js v1.0
// PR 4: Admin dashboard, catalog management, CSV wizard

/**
 * Admin dashboard and management UI.
 *
 * Globals expected:
 *   fetchApi(path, options)
 *   showToast(message, type)
 *   getActiveRole()
 *   getJwtTenantId()
 *   getJwtRole()
 */

(function (global) {
    'use strict';

    var ADMIN_CSS_INJECTED = false;
    var _dashboardData = null;

    // Translation maps: internal value → Italian label
    var SPECIES_LABELS = { dog: 'Cane', cat: 'Gatto', rabbit: 'Coniglio', ferret: 'Furetto', bird: 'Uccello', reptile: 'Rettile' };
    var LIFECYCLE_LABELS = { puppy: 'Cucciolo/Kitten', adult: 'Adulto', senior: 'Senior' };
    var CATEGORY_LABELS = { food_general: 'Cibo generico', food_clinical: 'Dieta clinica', supplement: 'Integratore', antiparasitic: 'Antiparassitario', accessory: 'Accessorio', service: 'Servizio' };

    function _translateSpecies(arr) {
        if (!Array.isArray(arr)) return '';
        return arr.map(function (s) { return SPECIES_LABELS[s] || s; }).join(', ');
    }
    function _translateLifecycle(arr) {
        if (!Array.isArray(arr)) return '';
        return arr.map(function (l) { return LIFECYCLE_LABELS[l] || l; }).join(', ');
    }
    function _translateCategory(cat) {
        return CATEGORY_LABELS[cat] || cat || '';
    }

    // =========================================================================
    // CSS injection
    // =========================================================================

    function _injectAdminStyles() {
        if (ADMIN_CSS_INJECTED) return;
        ADMIN_CSS_INJECTED = true;

        var css = [
            '.admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }',
            '.admin-stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }',
            '.admin-stat-value { font-size: 28px; font-weight: 700; color: #1e3a5f; }',
            '.admin-stat-label { font-size: 12px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }',
            '.admin-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }',
            '.admin-table th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }',
            '.admin-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; }',
            '.admin-table tr:hover td { background: #f8fafc; }',
            '.admin-section { margin: 20px 0; }',
            '.admin-section-title { font-size: 16px; font-weight: 600; color: #1e3a5f; margin-bottom: 12px; }',
            '.admin-period-selector { display: flex; gap: 8px; margin-bottom: 16px; }',
            '.admin-period-btn { padding: 6px 16px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }',
            '.admin-period-btn.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }',
            '.wizard-step { margin: 16px 0; padding: 16px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }',
            '.wizard-step h4 { margin: 0 0 8px; color: #1e3a5f; }',
            '.wizard-step p { font-size: 13px; color: #666; margin: 0 0 12px; }',
            '.wizard-preview { max-height: 300px; overflow-y: auto; font-size: 12px; }',
            '.wizard-preview table { width: 100%; border-collapse: collapse; }',
            '.wizard-preview th, .wizard-preview td { padding: 4px 8px; border: 1px solid #ddd; text-align: left; }',
            '.wizard-preview th { background: #f1f5f9; }',
            '.wizard-results { margin-top: 12px; }',
            '.wizard-results .success { color: #16a34a; }',
            '.wizard-results .error { color: #dc2626; }',
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-admin-styles', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================================
    // Dashboard
    // =========================================================================

    var _selectedDashboardTenant = null;

    function loadAdminDashboard(containerId, period) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectAdminStyles();

        var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;

        // super_admin without tenant: show tenant selector
        if (!tenantId && jwtRole === 'super_admin') {
            if (_selectedDashboardTenant) {
                tenantId = _selectedDashboardTenant;
            } else {
                container.innerHTML = '<p style="color:#888;">Caricamento tenant...</p>';
                fetchApi('/api/superadmin/tenants').then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (data) {
                        if (!data || !data.tenants || data.tenants.length === 0) {
                            container.innerHTML = '<p style="color:#888;">Nessun tenant trovato. Creane uno dalla pagina Gestione Tenant.</p>';
                            return;
                        }
                        // Auto-select first tenant
                        _selectedDashboardTenant = data.tenants[0].tenant_id;
                        _renderTenantSelector(container, data.tenants, containerId, period);
                    }).catch(function () {
                        container.innerHTML = '<p style="color:#dc2626;">Errore nel caricamento tenant.</p>';
                    });
                return;
            }
        }

        if (!tenantId) {
            container.innerHTML = '<p style="color:#888;">Dashboard non disponibile. Accesso admin richiesto.</p>';
            return;
        }

        var p = period || '30d';

        container.innerHTML = '<p style="color:#888;">Caricamento dashboard...</p>';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/dashboard?period=' + p, { method: 'GET' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.stats) {
                    container.innerHTML = '<p style="color:#888;">Nessun dato disponibile.</p>';
                    return;
                }
                _dashboardData = data;
                // For super_admin, prepend tenant selector
                if (jwtRole === 'super_admin' && !getJwtTenantId()) {
                    fetchApi('/api/superadmin/tenants').then(function (r) { return r.ok ? r.json() : null; })
                        .then(function (tData) {
                            if (tData && tData.tenants) {
                                var selectorHtml = _buildTenantSelectorHtml(tData.tenants, containerId, p);
                                container.innerHTML = selectorHtml;
                                var dashDiv = document.createElement('div');
                                container.appendChild(dashDiv);
                                _renderDashboard(dashDiv, data, p);
                            } else {
                                _renderDashboard(container, data, p);
                            }
                        }).catch(function () {
                            _renderDashboard(container, data, p);
                        });
                } else {
                    _renderDashboard(container, data, p);
                }
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore nel caricamento della dashboard.</p>';
            });
    }

    function _renderTenantSelector(container, tenants, containerId, period) {
        container.innerHTML = _buildTenantSelectorHtml(tenants, containerId, period);
        // Trigger dashboard load for selected tenant
        loadAdminDashboard(containerId, period);
    }

    function _buildTenantSelectorHtml(tenants, containerId, period) {
        var html = '<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">';
        html += '<label style="font-weight:600;font-size:14px;">Tenant:</label>';
        html += '<select id="dashboard-tenant-select" onchange="selectDashboardTenant(this.value, \'' + containerId + '\', \'' + (period || '30d') + '\')" style="padding:8px;border:1px solid #ddd;border-radius:6px;">';
        tenants.forEach(function (t) {
            var selected = t.tenant_id === _selectedDashboardTenant ? ' selected' : '';
            html += '<option value="' + _escapeHtml(t.tenant_id) + '"' + selected + '>' + _escapeHtml(t.name) + ' [' + _escapeHtml(t.slug) + ']</option>';
        });
        html += '</select></div>';
        return html;
    }

    function selectDashboardTenant(tenantId, containerId, period) {
        _selectedDashboardTenant = tenantId;
        loadAdminDashboard(containerId, period);
    }

    function _renderDashboard(container, data, period) {
        var s = data.stats;

        var html = [];

        // Period selector
        html.push('<div class="admin-period-selector">');
        ['7d', '30d', '90d'].forEach(function (p) {
            html.push('<button class="admin-period-btn' + (p === period ? ' active' : '') +
                '" onclick="loadAdminDashboard(\'admin-dashboard-content\', \'' + p + '\')">' + p + '</button>');
        });
        html.push('</div>');

        // Stats grid
        html.push('<div class="admin-grid">');
        html.push(_statCard(s.impressions, 'Impressioni'));
        html.push(_statCard(s.clicks, 'Click'));
        html.push(_statCard(s.ctr + '%', 'CTR'));
        html.push(_statCard(s.dismissals, 'Dismissal'));
        html.push(_statCard(s.active_campaigns, 'Campagne attive'));
        html.push(_statCard(s.published_items, 'Prodotti pubblicati'));
        html.push(_statCard(s.active_vet_flags, 'Flag veterinari'));
        if (s.budget) {
            html.push(_statCard(s.budget.current_usage + '/' + s.budget.monthly_limit, 'Budget AI'));
        }
        html.push('</div>');

        // Top items
        if (s.top_items && s.top_items.length > 0) {
            html.push('<div class="admin-section">');
            html.push('<div class="admin-section-title">Top Prodotti</div>');
            html.push('<table class="admin-table">');
            html.push('<tr><th>Prodotto</th><th>Impressioni</th><th>Click</th><th>CTR</th><th>Dismissal</th></tr>');
            s.top_items.forEach(function (item) {
                var ctr = item.impressions > 0 ? Math.round((item.clicks / item.impressions) * 100) : 0;
                html.push('<tr>');
                html.push('<td>' + _escapeHtml(item.name || item.promo_item_id) + '</td>');
                html.push('<td>' + item.impressions + '</td>');
                html.push('<td>' + item.clicks + '</td>');
                html.push('<td>' + ctr + '%</td>');
                html.push('<td>' + item.dismissals + '</td>');
                html.push('</tr>');
            });
            html.push('</table>');
            html.push('</div>');
        }

        // Export button
        html.push('<div class="admin-section">');
        html.push('<button class="btn btn-secondary" onclick="exportPromoCsv(\'' + period + '\')">📥 Esporta CSV eventi</button> ');
        html.push('<button class="btn btn-secondary" onclick="exportPromoXlsx(\'' + period + '\')">📥 Esporta XLSX</button>');
        html.push('</div>');

        container.innerHTML = html.join('');
    }

    function _statCard(value, label) {
        return '<div class="admin-stat"><div class="admin-stat-value">' + _escapeHtml(String(value)) +
            '</div><div class="admin-stat-label">' + _escapeHtml(label) + '</div></div>';
    }

    function exportPromoCsv(period) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var p = period || '30d';

        var token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        if (!token) return;

        // Use fetch for authenticated download
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/export/events?period=' + p, { method: 'GET' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.blob();
            })
            .then(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'promo_events_' + tenantId + '_' + p + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            })
            .catch(function () {
                if (typeof showToast === 'function') showToast('Errore nel download CSV.', 'error');
            });
    }

    // =========================================================================
    // CSV Wizard
    // =========================================================================

    var _wizardParsedItems = [];

    var _wizardPreviewIndex = 0;

    function initCsvWizard(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectAdminStyles();

        var html = [
            '<div class="wizard-step">',
            '<h4>Step 1: Carica file</h4>',
            '<p>Formato accettato: CSV o XLSX. Colonne: name, category, species, lifecycle_target, description, image_url, product_url, tags_include, tags_exclude, priority</p>',
            '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">',
            '<div>',
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Tenant</label>',
            '<select id="wizardCsvTenant" style="padding:8px;border:1px solid #ddd;border-radius:6px;min-width:180px;"></select>',
            '</div>',
            '<div>',
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Modalità import</label>',
            '<label style="display:block;font-size:13px;"><input type="radio" name="wizardCsvMode" value="replace"> Sostituisci importazione precedente</label>',
            '<label style="display:block;font-size:13px;"><input type="radio" name="wizardCsvMode" value="append" checked> Aggiungi all\'esistente (append)</label>',
            '</div>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">',
            '<input type="file" id="csvFileInput" accept=".csv,.txt,.xlsx,.xls" onchange="handleCsvUpload(event)">',
            '<button class="btn btn-secondary" onclick="downloadCsvTemplate()" style="font-size:12px;">Scarica template CSV</button>',
            '<button class="btn btn-secondary" onclick="downloadXlsxTemplate()" style="font-size:12px;margin-left:4px;">Scarica template XLSX</button>',
            '</div>',
            '</div>',
            '<div id="wizard-step-2" class="wizard-step" style="display:none;">',
            '<h4>Step 2: Anteprima</h4>',
            '<div id="wizard-preview" class="wizard-preview"></div>',
            '<div id="wizard-card-preview" style="margin-top:12px;"></div>',
            '<div style="margin-top:12px;">',
            '<button class="btn btn-secondary" onclick="wizardDryRun()">Verifica (dry run)</button>',
            '<button class="btn btn-primary" onclick="wizardImport()" style="margin-left:8px;">Importa</button>',
            '</div>',
            '</div>',
            '<div id="wizard-step-3" class="wizard-step" style="display:none;">',
            '<h4>Step 3: Risultati</h4>',
            '<div id="wizard-results" class="wizard-results"></div>',
            '</div>'
        ];

        container.innerHTML = html.join('');

        // Load tenants for the CSV wizard
        _loadWizardTenants('wizardCsvTenant');
    }

    function _loadWizardTenants(selectId) {
        fetchApi('/api/seed/promo/tenants').then(function (r) { return r.ok ? r.json() : { tenants: [] }; })
            .then(function (data) {
                var sel = document.getElementById(selectId);
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

    function downloadCsvTemplate() {
        var csvContent = 'name,category,species,lifecycle_target,description,image_url,product_url,tags_include,tags_exclude,priority\n'
            + '"Royal Canin Maxi Adult",food_general,"dog","adult","Cibo secco per cani adulti taglia grande (26-44 kg). Ricetta con EPA e DHA per pelle e manto sani.",https://example.com/img/rc-maxi.jpg,https://www.royalcanin.com/it/dogs/products/retail-products/maxi-adult,,0\n'
            + '"Hill\'s Prescription Diet k/d",food_clinical,"cat","senior","Dieta clinica per gatti con insufficienza renale. Ridotto contenuto di fosforo e sodio.",https://example.com/img/hills-kd.jpg,https://www.hillspet.it/prodotti-gatto/pd-feline-kd-with-chicken-dry,clinical:renal,,5\n'
            + '"Frontline Tri-Act",antiparasitic,"dog","puppy|adult|senior","Antiparassitario spot-on per cani. Protezione completa contro pulci, zecche e zanzare per 4 settimane.",https://example.com/img/frontline.jpg,https://www.frontlinecombo.it/prodotti/tri-act,,,3\n';
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'promo_items_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleCsvUpload(event) {
        var file = event.target.files[0];
        if (!file) return;

        var ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'xlsx' || ext === 'xls') {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var data = new Uint8Array(e.target.result);
                    var workbook = XLSX.read(data, { type: 'array' });
                    var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    _wizardParsedItems = XLSX.utils.sheet_to_json(firstSheet);
                    if (_wizardParsedItems.length === 0) {
                        if (typeof showToast === 'function') showToast('File vuoto o formato non valido.', 'error');
                        return;
                    }
                    _showCsvPreview();
                } catch (err) {
                    if (typeof showToast === 'function') showToast('Errore nella lettura del file XLSX: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            var text = e.target.result;
            _wizardParsedItems = _parseCsv(text);

            if (_wizardParsedItems.length === 0) {
                if (typeof showToast === 'function') showToast('File vuoto o formato non valido.', 'error');
                return;
            }

            _showCsvPreview();
        };
        reader.readAsText(file);
    }

    function _showCsvPreview() {
        // Show preview
        var step2 = document.getElementById('wizard-step-2');
        if (step2) step2.style.display = '';

        var preview = document.getElementById('wizard-preview');
        if (preview) {
            var html = '<p>' + _wizardParsedItems.length + ' righe trovate.</p>';
            html += '<table>';
            html += '<tr><th>#</th><th>Nome</th><th>Categoria</th><th>Specie</th><th>Lifecycle</th><th>Descrizione</th><th></th></tr>';
            _wizardParsedItems.forEach(function (item, idx) {
                var speciesArr = typeof item.species === 'string' ? item.species.split('|') : (Array.isArray(item.species) ? item.species : []);
                var lcArr = typeof item.lifecycle_target === 'string' ? item.lifecycle_target.split('|') : (Array.isArray(item.lifecycle_target) ? item.lifecycle_target : []);
                html += '<tr><td>' + (idx + 1) + '</td><td>' + _escapeHtml(item.name || '') +
                    '</td><td>' + _escapeHtml(_translateCategory(item.category)) +
                    '</td><td>' + _escapeHtml(_translateSpecies(speciesArr)) +
                    '</td><td>' + _escapeHtml(_translateLifecycle(lcArr)) +
                    '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escapeHtml((item.description || '').slice(0, 80)) +
                    '</td><td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="wizardEditItem(' + idx + ')">Modifica</button></td></tr>';
            });
            html += '</table>';
            preview.innerHTML = html;
        }

        // Show navigable card preview
        _wizardPreviewIndex = 0;
        _renderWizardCardPreview();
    }

    function _renderWizardCardPreview() {
        var container = document.getElementById('wizard-card-preview');
        if (!container || _wizardParsedItems.length === 0) return;
        var idx = _wizardPreviewIndex;
        var p = _wizardParsedItems[idx];
        var speciesArr = typeof p.species === 'string' ? p.species.split('|') : (Array.isArray(p.species) ? p.species : []);
        var lcArr = typeof p.lifecycle_target === 'string' ? p.lifecycle_target.split('|') : (Array.isArray(p.lifecycle_target) ? p.lifecycle_target : []);

        var html = '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#fff;max-width:400px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<button class="btn btn-secondary" style="padding:4px 10px;" onclick="wizardPreviewNav(-1)">&lt;</button>';
        html += '<span style="font-size:12px;color:#888;">Prodotto ' + (idx + 1) + ' di ' + _wizardParsedItems.length + '</span>';
        html += '<button class="btn btn-secondary" style="padding:4px 10px;" onclick="wizardPreviewNav(1)">&gt;</button>';
        html += '</div>';
        html += '<span style="display:inline-block;background:#22c55e;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-bottom:8px;">Consigliato per il tuo pet</span>';
        if (p.image_url) {
            html += '<div style="text-align:center;margin-bottom:8px;"><img src="' + _escapeHtml(p.image_url) + '" style="max-height:120px;max-width:100%;border-radius:8px;" onerror="this.style.display=\'none\'"></div>';
        }
        html += '<div style="font-weight:700;font-size:15px;margin-bottom:4px;">' + _escapeHtml(p.name || '') + '</div>';
        html += '<div style="font-size:12px;color:#666;margin-bottom:6px;">' + _escapeHtml(p.description || '') + '</div>';
        html += '<div style="font-size:11px;color:#888;">Specie: ' + _escapeHtml(_translateSpecies(speciesArr)) + ' | Lifecycle: ' + _escapeHtml(_translateLifecycle(lcArr)) + '</div>';
        html += '<div style="margin-top:8px;"><button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="wizardEditItem(' + idx + ')">Modifica</button></div>';
        html += '</div>';
        container.innerHTML = html;
    }

    function wizardPreviewNav(delta) {
        _wizardPreviewIndex += delta;
        if (_wizardPreviewIndex < 0) _wizardPreviewIndex = _wizardParsedItems.length - 1;
        if (_wizardPreviewIndex >= _wizardParsedItems.length) _wizardPreviewIndex = 0;
        _renderWizardCardPreview();
    }

    function wizardEditItem(idx) {
        var item = _wizardParsedItems[idx];
        if (!item) return;
        var speciesOptions = ['dog', 'cat', 'rabbit', 'ferret', 'bird', 'reptile'];
        var lifecycleOptions = ['puppy', 'adult', 'senior'];
        var categoryOptions = ['food_general', 'food_clinical', 'supplement', 'antiparasitic', 'accessory', 'service'];
        var speciesArr = typeof item.species === 'string' ? item.species.split('|') : (Array.isArray(item.species) ? item.species : []);
        var lcArr = typeof item.lifecycle_target === 'string' ? item.lifecycle_target.split('|') : (Array.isArray(item.lifecycle_target) ? item.lifecycle_target : []);

        _showModal('Modifica Prodotto CSV — Riga ' + (idx + 1), function (container) {
            var html = [];
            html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome</label><input type="text" id="wizEditName" value="' + _escapeHtml(item.name || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Categoria</label><select id="wizEditCategory" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
            categoryOptions.forEach(function (c) {
                html.push('<option value="' + c + '"' + (item.category === c ? ' selected' : '') + '>' + _escapeHtml(CATEGORY_LABELS[c] || c) + '</option>');
            });
            html.push('</select></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="wizEditDesc" value="' + _escapeHtml(item.description || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Prodotto</label><input type="text" id="wizEditUrl" value="' + _escapeHtml(item.product_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Immagine</label><input type="text" id="wizEditImg" value="' + _escapeHtml(item.image_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Priorità</label><input type="number" id="wizEditPriority" value="' + (parseInt(item.priority) || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('</div>');

            html.push('<div style="margin-top:12px;"><label style="font-size:12px;font-weight:600;">Specie target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            speciesOptions.forEach(function (s) {
                var checked = speciesArr.indexOf(s) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="wizEditSpecies" value="' + s + '"' + checked + '>' + _escapeHtml(SPECIES_LABELS[s] || s) + '</label>');
            });
            html.push('</div></div>');

            html.push('<div style="margin-top:8px;"><label style="font-size:12px;font-weight:600;">Lifecycle target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            lifecycleOptions.forEach(function (lc) {
                var checked = lcArr.indexOf(lc) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="wizEditLifecycle" value="' + lc + '"' + checked + '>' + _escapeHtml(LIFECYCLE_LABELS[lc] || lc) + '</label>');
            });
            html.push('</div></div>');

            html.push('<div style="margin-top:16px;"><button class="btn btn-success" onclick="_saveWizardItemEdit(' + idx + ')">Salva</button> <button class="btn btn-secondary" onclick="_closeModal()">Annulla</button></div>');
            container.innerHTML = html.join('');
        });
    }

    function _saveWizardItemEdit(idx) {
        var item = _wizardParsedItems[idx];
        if (!item) return;
        item.name = (document.getElementById('wizEditName') || {}).value || '';
        item.category = (document.getElementById('wizEditCategory') || {}).value || '';
        item.description = (document.getElementById('wizEditDesc') || {}).value || '';
        item.product_url = (document.getElementById('wizEditUrl') || {}).value || '';
        item.image_url = (document.getElementById('wizEditImg') || {}).value || '';
        item.priority = (document.getElementById('wizEditPriority') || {}).value || '0';

        var species = [];
        var boxes = document.querySelectorAll('.wizEditSpecies:checked');
        for (var i = 0; i < boxes.length; i++) species.push(boxes[i].value);
        item.species = species.join('|');

        var lifecycle = [];
        var lcBoxes = document.querySelectorAll('.wizEditLifecycle:checked');
        for (var j = 0; j < lcBoxes.length; j++) lifecycle.push(lcBoxes[j].value);
        item.lifecycle_target = lifecycle.join('|');

        _closeModal();
        // Re-render preview
        handleCsvUpload({ target: { files: [] } }); // fake re-render
        // Manually re-render since no file
        var step2 = document.getElementById('wizard-step-2');
        if (step2) step2.style.display = '';
        var preview = document.getElementById('wizard-preview');
        if (preview) {
            var html = '<p>' + _wizardParsedItems.length + ' righe trovate.</p>';
            html += '<table>';
            html += '<tr><th>#</th><th>Nome</th><th>Categoria</th><th>Specie</th><th>Lifecycle</th><th>Descrizione</th><th></th></tr>';
            _wizardParsedItems.forEach(function (it, i) {
                var speciesArr = typeof it.species === 'string' ? it.species.split('|') : (Array.isArray(it.species) ? it.species : []);
                var lcArr = typeof it.lifecycle_target === 'string' ? it.lifecycle_target.split('|') : (Array.isArray(it.lifecycle_target) ? it.lifecycle_target : []);
                html += '<tr><td>' + (i + 1) + '</td><td>' + _escapeHtml(it.name || '') +
                    '</td><td>' + _escapeHtml(_translateCategory(it.category)) +
                    '</td><td>' + _escapeHtml(_translateSpecies(speciesArr)) +
                    '</td><td>' + _escapeHtml(_translateLifecycle(lcArr)) +
                    '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escapeHtml((it.description || '').slice(0, 80)) +
                    '</td><td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="wizardEditItem(' + i + ')">Modifica</button></td></tr>';
            });
            html += '</table>';
            preview.innerHTML = html;
        }
        _wizardPreviewIndex = idx;
        _renderWizardCardPreview();
        if (typeof showToast === 'function') showToast('Riga ' + (idx + 1) + ' aggiornata.', 'success');
    }

    function _parseCsv(text) {
        var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
        if (lines.length < 2) return [];

        var headers = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
        var items = [];

        for (var i = 1; i < lines.length; i++) {
            var values = _splitCsvLine(lines[i]);
            var item = {};
            headers.forEach(function (h, idx) {
                item[h] = values[idx] || '';
            });
            if (item.name) items.push(item);
        }

        return items;
    }

    function _splitCsvLine(line) {
        var result = [];
        var current = '';
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (c === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += c;
            }
        }
        result.push(current.trim());
        return result;
    }

    function wizardDryRun() {
        _wizardSubmit(true);
    }

    function wizardImport() {
        _wizardSubmit(false);
    }

    function _wizardSubmit(dryRun) {
        if (_wizardParsedItems.length === 0) return;

        // Use wizard tenant selector if available, otherwise JWT tenant
        var wizTenantSel = document.getElementById('wizardCsvTenant');
        var tenantId = wizTenantSel && wizTenantSel.value ? wizTenantSel.value : null;
        if (!tenantId) tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId) {
            if (typeof showToast === 'function') showToast('Tenant non configurato.', 'error');
            return;
        }

        var modeRadio = document.querySelector('input[name="wizardCsvMode"]:checked');
        var mode = modeRadio ? modeRadio.value : 'append';

        var step3 = document.getElementById('wizard-step-3');
        var results = document.getElementById('wizard-results');
        if (step3) step3.style.display = '';
        if (results) results.innerHTML = '<p>Invio in corso...</p>';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/import/promo-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: _wizardParsedItems, dry_run: dryRun, mode: mode })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!results) return;

                var html = [];
                html.push('<p class="success">Importati: ' + (data.imported || 0) + '</p>');
                html.push('<p>Saltati: ' + (data.skipped || 0) + '</p>');
                if (dryRun) {
                    html.push('<p style="color:#666;">(Dry run - nessun dato salvato)</p>');
                }
                if (data.errors && data.errors.length > 0) {
                    html.push('<p class="error">Errori:</p><ul>');
                    data.errors.forEach(function (err) {
                        html.push('<li>Riga ' + err.row + ': ' + _escapeHtml(err.error) + '</li>');
                    });
                    html.push('</ul>');
                }
                results.innerHTML = html.join('');
            })
            .catch(function () {
                if (results) results.innerHTML = '<p class="error">Errore di rete.</p>';
            });
    }

    // =========================================================================
    // Super Admin: Tenant Management
    // =========================================================================

    var _tenantsData = [];

    function loadSuperadminTenants(containerId) {
        var container = document.getElementById(containerId || 'superadmin-tenants-content');
        if (!container) return;

        _injectAdminStyles();
        container.innerHTML = '<p style="color:#888;">Caricamento tenant...</p>';

        // Load tenants and users
        Promise.all([
            fetchApi('/api/superadmin/tenants').then(function (r) { return r.ok ? r.json() : null; }),
            fetchApi('/api/superadmin/users').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        ]).then(function (results) {
            _tenantsData = (results[0] && results[0].tenants) ? results[0].tenants : [];
            var allUsers = (results[1] && results[1].users) ? results[1].users : [];
            _renderTenantsPage(container, allUsers);
        }).catch(function () {
            container.innerHTML = '<p style="color:#dc2626;">Errore nel caricamento tenant.</p>';
        });
    }

    function _renderTenantsPage(container, allUsers) {
        var html = [];

        // Create tenant button
        html.push('<div style="margin-bottom:16px;">');
        html.push('<button class="btn btn-primary" onclick="showCreateTenantForm()">+ Nuovo Tenant</button>');
        html.push('</div>');

        // Create tenant form (hidden)
        html.push('<div id="create-tenant-form" style="display:none; margin-bottom:20px; padding:16px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px; color:#1e3a5f;">Nuovo Tenant</h4>');
        html.push('<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Nome *</label><input type="text" id="newTenantName" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Nome Brand"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Slug *</label><input type="text" id="newTenantSlug" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="nome-brand"></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;">');
        html.push('<button class="btn btn-success" onclick="createTenant()">Crea</button> ');
        html.push('<button class="btn btn-secondary" onclick="hideCreateTenantForm()">Annulla</button>');
        html.push('</div>');
        html.push('</div>');

        // Tenants table
        if (_tenantsData.length === 0) {
            html.push('<p style="color:#888;">Nessun tenant trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Nome</th><th>Slug</th><th>Stato</th><th>Utenti associati</th><th>Azioni</th></tr>');
            _tenantsData.forEach(function (tenant) {
                var statusBadge = tenant.status === 'active'
                    ? '<span style="color:#16a34a;font-weight:600;">attivo</span>'
                    : '<span style="color:#dc2626;font-weight:600;">disabilitato</span>';

                // Find users assigned to this tenant
                var assignedUsers = allUsers.filter(function (u) {
                    return Array.isArray(u.tenants) && u.tenants.some(function (t) { return t.tenant_id === tenant.tenant_id; });
                });
                var usersHtml = assignedUsers.length > 0
                    ? assignedUsers.map(function (u) { return _escapeHtml(u.email); }).join(', ')
                    : '<span style="color:#999;">nessuno</span>';

                html.push('<tr>');
                html.push('<td>' + _escapeHtml(tenant.name) + '</td>');
                html.push('<td><code>' + _escapeHtml(tenant.slug) + '</code></td>');
                html.push('<td>' + statusBadge + '</td>');
                html.push('<td style="font-size:12px;">' + usersHtml + '</td>');
                html.push('<td style="white-space:nowrap;">');

                // Toggle status
                if (tenant.status === 'active') {
                    html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="toggleTenantStatus(\'' + _escapeHtml(tenant.tenant_id) + '\', \'disabled\')">Disabilita</button> ');
                } else {
                    html.push('<button class="btn btn-success" style="padding:4px 8px;font-size:11px;" onclick="toggleTenantStatus(\'' + _escapeHtml(tenant.tenant_id) + '\', \'active\')">Attiva</button> ');
                }

                // Edit name
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="promptEditTenant(\'' + _escapeHtml(tenant.tenant_id) + '\', \'' + _escapeHtml(tenant.name) + '\')">Modifica</button> ');

                // Reset tenant data
                html.push('<button class="btn btn-danger" style="padding:4px 8px;font-size:11px;" onclick="resetTenantData(\'' + _escapeHtml(tenant.tenant_id) + '\', \'' + _escapeHtml(tenant.name) + '\')">🗑️ Azzera dati</button>');

                html.push('</td>');
                html.push('</tr>');
            });
            html.push('</table>');
        }

        container.innerHTML = html.join('');
    }

    function showCreateTenantForm() {
        var form = document.getElementById('create-tenant-form');
        if (form) form.style.display = '';
    }

    function hideCreateTenantForm() {
        var form = document.getElementById('create-tenant-form');
        if (form) form.style.display = 'none';
    }

    function createTenant() {
        var name = (document.getElementById('newTenantName') || {}).value || '';
        var slug = (document.getElementById('newTenantSlug') || {}).value || '';

        if (!name || !slug) {
            if (typeof showToast === 'function') showToast('Nome e slug obbligatori.', 'error');
            return;
        }

        fetchApi('/api/superadmin/tenants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, slug: slug })
        }).then(function (r) {
            if (r.status === 409) {
                if (typeof showToast === 'function') showToast('Slug gia esistente.', 'error');
                return;
            }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            if (!data) return;
            if (typeof showToast === 'function') showToast('Tenant creato: ' + data.name, 'success');
            hideCreateTenantForm();
            loadSuperadminTenants();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore nella creazione tenant.', 'error');
        });
    }

    function toggleTenantStatus(tenantId, newStatus) {
        fetchApi('/api/superadmin/tenants/' + encodeURIComponent(tenantId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Stato tenant aggiornato.', 'success');
            loadSuperadminTenants();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento stato.', 'error');
        });
    }

    function promptEditTenant(tenantId, currentName) {
        var newName = prompt('Nuovo nome per il tenant:', currentName);
        if (!newName || newName === currentName) return;

        fetchApi('/api/superadmin/tenants/' + encodeURIComponent(tenantId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Tenant aggiornato.', 'success');
            loadSuperadminTenants();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento tenant.', 'error');
        });
    }

    function resetTenantData(tenantId, tenantName) {
        if (!confirm('Sei sicuro di voler azzerare tutti i dati del tenant «' + tenantName + '»? Verranno cancellati catalogo, campagne, eventi e statistiche. Le associazioni utente rimarranno attive.')) return;
        if (!confirm('ATTENZIONE: Questa operazione è irreversibile. Confermi di voler procedere?')) return;

        fetchApi('/api/superadmin/tenants/' + encodeURIComponent(tenantId) + '/reset', {
            method: 'POST'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            if (typeof showToast === 'function') showToast('Dati del tenant azzerati con successo', 'success');
            loadSuperadminTenants();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore durante l\'azzeramento: ' + e.message, 'error');
        });
    }

    // =========================================================================
    // Super Admin: User Management
    // =========================================================================

    var _usersData = [];
    var _tenantsCache = [];

    function loadSuperadminUsers(containerId) {
        var container = document.getElementById(containerId || 'superadmin-users-content');
        if (!container) return;

        _injectAdminStyles();

        container.innerHTML = '<p style="color:#888;">Caricamento utenti...</p>';

        // Load users and tenants in parallel
        Promise.all([
            fetchApi('/api/superadmin/users').then(function (r) { return r.ok ? r.json() : null; }),
            fetchApi('/api/superadmin/tenants').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        ]).then(function (results) {
            var usersResp = results[0];
            var tenantsResp = results[1];

            _usersData = (usersResp && usersResp.users) ? usersResp.users : [];
            _tenantsCache = (tenantsResp && tenantsResp.tenants) ? tenantsResp.tenants : [];

            _renderUsersPage(container);
        }).catch(function () {
            container.innerHTML = '<p style="color:#dc2626;">Errore nel caricamento utenti.</p>';
        });
    }

    function _renderUsersPage(container) {
        var html = [];

        // Create user button
        html.push('<div style="margin-bottom:16px;">');
        html.push('<button class="btn btn-primary" onclick="showCreateUserForm()">+ Nuovo Utente</button>');
        html.push('</div>');

        // Create user form (hidden)
        html.push('<div id="create-user-form" style="display:none; margin-bottom:20px; padding:16px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px; color:#1e3a5f;">Nuovo Utente</h4>');
        html.push('<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Email *</label><input type="email" id="newUserEmail" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="email@esempio.com"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Password *</label><input type="text" id="newUserPassword" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Password"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Nome</label><input type="text" id="newUserDisplayName" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Nome completo"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Ruolo</label><select id="newUserRole" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
        html.push('<option value="owner">Owner (Proprietario)</option>');
        html.push('<option value="vet">Vet (Veterinario)</option>');
        html.push('<option value="admin_brand">Admin Brand</option>');
        html.push('<option value="super_admin">Super Admin</option>');
        html.push('</select></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;">');
        html.push('<button class="btn btn-success" onclick="createUser()">Crea</button> ');
        html.push('<button class="btn btn-secondary" onclick="hideCreateUserForm()">Annulla</button>');
        html.push('</div>');
        html.push('</div>');

        // Users table
        if (_usersData.length === 0) {
            html.push('<p style="color:#888;">Nessun utente trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Email</th><th>Nome</th><th>Ruolo</th><th>Stato</th><th>Tenant</th><th>Azioni</th></tr>');
            _usersData.forEach(function (user) {
                var statusBadge = user.status === 'active'
                    ? '<span style="color:#16a34a;font-weight:600;">attivo</span>'
                    : '<span style="color:#dc2626;font-weight:600;">disabilitato</span>';

                var tenantInfo = '';
                if (Array.isArray(user.tenants) && user.tenants.length > 0) {
                    tenantInfo = user.tenants.map(function (t) {
                        var tenantName = _tenantsCache.find(function (tc) { return tc.tenant_id === t.tenant_id; });
                        return _escapeHtml((tenantName ? tenantName.name : t.tenant_id) + ' (' + t.role + ')');
                    }).join(', ');
                } else {
                    tenantInfo = '<span style="color:#999;">-</span>';
                }

                html.push('<tr>');
                html.push('<td>' + _escapeHtml(user.email) + '</td>');
                html.push('<td>' + _escapeHtml(user.display_name || '-') + '</td>');
                html.push('<td>' + _escapeHtml(user.base_role) + '</td>');
                html.push('<td>' + statusBadge + '</td>');
                html.push('<td style="font-size:12px;">' + tenantInfo + '</td>');
                html.push('<td style="white-space:nowrap;">');

                // Toggle status
                if (user.status === 'active') {
                    html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="toggleUserStatus(\'' + _escapeHtml(user.user_id) + '\', \'disabled\')">Disabilita</button> ');
                } else {
                    html.push('<button class="btn btn-success" style="padding:4px 8px;font-size:11px;" onclick="toggleUserStatus(\'' + _escapeHtml(user.user_id) + '\', \'active\')">Attiva</button> ');
                }

                // Reset password
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="promptResetPassword(\'' + _escapeHtml(user.user_id) + '\')">Reset pwd</button> ');

                // Assign tenant
                if (user.base_role === 'admin_brand') {
                    html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="promptAssignTenant(\'' + _escapeHtml(user.user_id) + '\')">Assegna tenant</button>');
                }

                html.push('</td>');
                html.push('</tr>');
            });
            html.push('</table>');
        }

        container.innerHTML = html.join('');
    }

    function showCreateUserForm() {
        var form = document.getElementById('create-user-form');
        if (form) form.style.display = '';
    }

    function hideCreateUserForm() {
        var form = document.getElementById('create-user-form');
        if (form) form.style.display = 'none';
    }

    function createUser() {
        var email = (document.getElementById('newUserEmail') || {}).value || '';
        var password = (document.getElementById('newUserPassword') || {}).value || '';
        var displayName = (document.getElementById('newUserDisplayName') || {}).value || '';
        var baseRole = (document.getElementById('newUserRole') || {}).value || 'owner';

        if (!email || !password) {
            if (typeof showToast === 'function') showToast('Email e password obbligatori.', 'error');
            return;
        }

        fetchApi('/api/superadmin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password, display_name: displayName, base_role: baseRole })
        }).then(function (r) {
            if (r.status === 409) {
                if (typeof showToast === 'function') showToast('Email gia esistente.', 'error');
                return;
            }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            if (!data) return;
            if (typeof showToast === 'function') showToast('Utente creato: ' + data.email, 'success');
            hideCreateUserForm();
            loadSuperadminUsers();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore nella creazione utente.', 'error');
        });
    }

    function toggleUserStatus(userId, newStatus) {
        fetchApi('/api/superadmin/users/' + encodeURIComponent(userId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Stato aggiornato.', 'success');
            loadSuperadminUsers();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento stato.', 'error');
        });
    }

    function promptResetPassword(userId) {
        var newPwd = prompt('Nuova password per l\'utente:');
        if (!newPwd) return;

        fetchApi('/api/superadmin/users/' + encodeURIComponent(userId) + '/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPwd })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Password aggiornata.', 'success');
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore reset password.', 'error');
        });
    }

    function promptAssignTenant(userId) {
        if (_tenantsCache.length === 0) {
            if (typeof showToast === 'function') showToast('Nessun tenant disponibile. Creane uno prima.', 'error');
            return;
        }

        var options = _tenantsCache.map(function (t, i) { return (i + 1) + ') ' + t.name + ' [' + t.slug + ']'; }).join('\n');
        var choice = prompt('Scegli il tenant (numero):\n' + options);
        if (!choice) return;

        var idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= _tenantsCache.length) {
            if (typeof showToast === 'function') showToast('Scelta non valida.', 'error');
            return;
        }

        var tenant = _tenantsCache[idx];
        fetchApi('/api/superadmin/users/' + encodeURIComponent(userId) + '/tenants', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: tenant.tenant_id, role: 'admin_brand' })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Tenant assegnato.', 'success');
            loadSuperadminUsers();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore assegnazione tenant.', 'error');
        });
    }

    // =========================================================================
    // Admin: Catalog Management
    // =========================================================================

    var _catalogItems = [];
    var _catalogPage = 1;
    var _catalogTotal = 0;
    var _catalogStatusFilter = '';

    function loadAdminCatalog(containerId) {
        var container = document.getElementById(containerId || 'admin-catalog-content');
        if (!container) return;

        _injectAdminStyles();

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;

        var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        if (!tenantId && jwtRole === 'super_admin') {
            container.innerHTML = '<p style="color:#888;">Seleziona un tenant dalla Dashboard per gestire il catalogo.</p>';
            return;
        }
        if (!tenantId) {
            container.innerHTML = '<p style="color:#888;">Tenant non configurato.</p>';
            return;
        }

        container.innerHTML = '<p style="color:#888;">Caricamento catalogo...</p>';

        var statusParam = _catalogStatusFilter ? '&status=' + _catalogStatusFilter : '';
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=' + _catalogPage + '&limit=20' + statusParam)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) { container.innerHTML = '<p style="color:#888;">Nessun dato.</p>'; return; }
                _catalogItems = data.items || [];
                _catalogTotal = data.total || 0;
                _renderCatalogPage(container, tenantId);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore caricamento catalogo.</p>';
            });
    }

    function _renderCatalogPage(container, tenantId) {
        var html = [];

        // Actions bar
        html.push('<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">');
        html.push('<button class="btn btn-primary" onclick="showCreateItemForm()">+ Nuovo Prodotto</button>');
        html.push('<button class="btn btn-danger" style="font-size:12px;" onclick="adminDeleteAllCatalogItems()">🗑️ Cancella tutto il catalogo</button>');
        html.push('<select onchange="filterCatalogStatus(this.value)" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;">');
        html.push('<option value=""' + (!_catalogStatusFilter ? ' selected' : '') + '>Tutti</option>');
        ['draft', 'in_review', 'published', 'retired'].forEach(function (s) {
            html.push('<option value="' + s + '"' + (_catalogStatusFilter === s ? ' selected' : '') + '>' + s + '</option>');
        });
        html.push('</select>');
        html.push('<span style="color:#888;font-size:12px;">' + _catalogTotal + ' prodotti</span>');
        html.push('</div>');

        // Create item form (hidden)
        html.push('<div id="create-item-form" style="display:none;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px;color:#1e3a5f;">Nuovo Prodotto</h4>');
        html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Nome *</label><input type="text" id="newItemName" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Nome prodotto"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Categoria *</label><select id="newItemCategory" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
        ['food_general', 'food_clinical', 'supplement', 'antiparasitic', 'accessory', 'service'].forEach(function (c) {
            html.push('<option value="' + c + '">' + _escapeHtml(CATEGORY_LABELS[c] || c) + '</option>');
        });
        html.push('</select></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Specie</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">');
        ['dog', 'cat', 'rabbit', 'ferret', 'bird', 'reptile'].forEach(function (s) {
            html.push('<label style="display:flex;align-items:center;gap:3px;font-size:12px;"><input type="checkbox" class="newItemSpecies" value="' + s + '">' + _escapeHtml(SPECIES_LABELS[s] || s) + '</label>');
        });
        html.push('</div></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Lifecycle</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">');
        ['puppy', 'adult', 'senior'].forEach(function (lc) {
            html.push('<label style="display:flex;align-items:center;gap:3px;font-size:12px;"><input type="checkbox" class="newItemLifecycle" value="' + lc + '">' + _escapeHtml(LIFECYCLE_LABELS[lc] || lc) + '</label>');
        });
        html.push('</div></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="newItemDescription" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Descrizione"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">URL Prodotto</label><input type="text" id="newItemUrl" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="https://..."></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">URL Immagine</label><input type="text" id="newItemImageUrl" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="https://..."></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Priorita</label><input type="number" id="newItemPriority" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" value="0"></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="createPromoItem()">Crea</button> <button class="btn btn-secondary" onclick="hideCreateItemForm()">Annulla</button></div>');
        html.push('</div>');

        // Items table
        if (_catalogItems.length === 0) {
            html.push('<p style="color:#888;">Nessun prodotto trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Nome</th><th>Categoria</th><th>Specie</th><th>Lifecycle</th><th>Stato</th><th>Priorita</th><th>Azioni</th></tr>');
            _catalogItems.forEach(function (item) {
                var statusColor = { draft: '#888', in_review: '#eab308', published: '#16a34a', retired: '#dc2626' }[item.status] || '#888';
                html.push('<tr>');
                html.push('<td>' + _escapeHtml(item.name) + '</td>');
                html.push('<td>' + _escapeHtml(_translateCategory(item.category)) + '</td>');
                html.push('<td>' + _escapeHtml(_translateSpecies(item.species)) + '</td>');
                html.push('<td>' + _escapeHtml(_translateLifecycle(item.lifecycle_target)) + '</td>');
                html.push('<td><span style="color:' + statusColor + ';font-weight:600;">' + _escapeHtml(item.status) + '</span></td>');
                html.push('<td>' + (item.priority || 0) + '</td>');
                html.push('<td style="white-space:nowrap;">');

                // Transition buttons based on current status
                var transitions = { draft: ['in_review'], in_review: ['published', 'draft'], published: ['retired'], retired: ['draft'] };
                var allowed = transitions[item.status] || [];
                allowed.forEach(function (t) {
                    var btnClass = t === 'published' ? 'btn-success' : (t === 'retired' ? 'btn-danger' : 'btn-secondary');
                    html.push('<button class="btn ' + btnClass + '" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="transitionItem(\'' + _escapeHtml(item.promo_item_id) + '\',\'' + t + '\')">' + t + '</button>');
                });
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="editPromoItem(\'' + _escapeHtml(item.promo_item_id) + '\')">Modifica</button>');
                html.push('<button class="btn btn-danger" style="padding:2px 8px;font-size:11px;margin-left:4px;" onclick="adminDeleteCatalogItem(\'' + _escapeHtml(item.promo_item_id) + '\')">🗑️</button>');
                html.push('</td></tr>');
            });
            html.push('</table>');

            // Pagination
            var totalPages = Math.ceil(_catalogTotal / 20);
            if (totalPages > 1) {
                html.push('<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">');
                for (var p = 1; p <= totalPages; p++) {
                    html.push('<button class="admin-period-btn' + (p === _catalogPage ? ' active' : '') + '" onclick="catalogGoToPage(' + p + ')">' + p + '</button>');
                }
                html.push('</div>');
            }
        }

        container.innerHTML = html.join('');
    }

    function showCreateItemForm() { var f = document.getElementById('create-item-form'); if (f) f.style.display = ''; }
    function hideCreateItemForm() { var f = document.getElementById('create-item-form'); if (f) f.style.display = 'none'; }

    function filterCatalogStatus(status) {
        _catalogStatusFilter = status;
        _catalogPage = 1;
        loadAdminCatalog();
    }

    function catalogGoToPage(page) {
        _catalogPage = page;
        loadAdminCatalog();
    }

    function createPromoItem() {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var name = (document.getElementById('newItemName') || {}).value || '';
        var category = (document.getElementById('newItemCategory') || {}).value || '';
        if (!name || !category) {
            if (typeof showToast === 'function') showToast('Nome e categoria obbligatori.', 'error');
            return;
        }

        var species = [];
        var speciesBoxes = document.querySelectorAll('.newItemSpecies:checked');
        for (var si = 0; si < speciesBoxes.length; si++) species.push(speciesBoxes[si].value);
        var lifecycle = [];
        var lcBoxes = document.querySelectorAll('.newItemLifecycle:checked');
        for (var li = 0; li < lcBoxes.length; li++) lifecycle.push(lcBoxes[li].value);

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name, category: category, species: species, lifecycle_target: lifecycle,
                description: (document.getElementById('newItemDescription') || {}).value || null,
                product_url: (document.getElementById('newItemUrl') || {}).value || null,
                image_url: (document.getElementById('newItemImageUrl') || {}).value || null,
                priority: parseInt((document.getElementById('newItemPriority') || {}).value) || 0
            })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Prodotto creato.', 'success');
            hideCreateItemForm();
            loadAdminCatalog();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore creazione prodotto.', 'error');
        });
    }

    function transitionItem(itemId, newStatus) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId) + '/transition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        }).then(function (r) {
            if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Stato aggiornato a ' + newStatus, 'success');
            loadAdminCatalog();
        }).catch(function (err) {
            if (typeof showToast === 'function') showToast('Errore: ' + err.message, 'error');
        });
    }

    function editPromoItem(itemId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        // Find item in cache
        var item = _catalogItems.find(function (i) { return i.promo_item_id === itemId; });
        if (!item) return;

        var speciesOptions = ['dog', 'cat', 'rabbit', 'ferret', 'bird', 'reptile'];
        var lifecycleOptions = ['puppy', 'adult', 'senior'];
        var categoryOptions = ['food_general', 'food_clinical', 'supplement', 'antiparasitic', 'accessory', 'service'];

        _showModal('Modifica Prodotto', function (container) {
            var html = [];
            html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome</label><input type="text" id="editItemName" value="' + _escapeHtml(item.name || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Categoria</label><select id="editItemCategory" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
            categoryOptions.forEach(function (c) {
                html.push('<option value="' + c + '"' + (item.category === c ? ' selected' : '') + '>' + _escapeHtml(CATEGORY_LABELS[c] || c) + '</option>');
            });
            html.push('</select></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="editItemDescription" value="' + _escapeHtml(item.description || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Prodotto</label><input type="text" id="editItemUrl" value="' + _escapeHtml(item.product_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL Immagine</label><input type="text" id="editItemImageUrl" value="' + _escapeHtml(item.image_url || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Priorità</label><input type="number" id="editItemPriority" value="' + (item.priority || 0) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('</div>');

            // Species checkboxes
            var itemSpecies = Array.isArray(item.species) ? item.species : [];
            html.push('<div style="margin-top:12px;"><label style="font-size:12px;font-weight:600;">Specie target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            speciesOptions.forEach(function (s) {
                var checked = itemSpecies.indexOf(s) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="editItemSpecies" value="' + s + '"' + checked + '>' + _escapeHtml(SPECIES_LABELS[s] || s) + '</label>');
            });
            html.push('</div></div>');

            // Lifecycle checkboxes
            var itemLifecycle = Array.isArray(item.lifecycle_target) ? item.lifecycle_target : [];
            html.push('<div style="margin-top:8px;"><label style="font-size:12px;font-weight:600;">Lifecycle target</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            lifecycleOptions.forEach(function (lc) {
                var checked = itemLifecycle.indexOf(lc) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="editItemLifecycle" value="' + lc + '"' + checked + '>' + _escapeHtml(LIFECYCLE_LABELS[lc] || lc) + '</label>');
            });
            html.push('</div></div>');

            html.push('<div style="margin-top:16px;"><button class="btn btn-success" onclick="_savePromoItemEdit(\'' + _escapeHtml(itemId) + '\')">Salva</button> <button class="btn btn-secondary" onclick="_closeModal()">Annulla</button></div>');
            container.innerHTML = html.join('');
        });
    }

    function _savePromoItemEdit(itemId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var species = [];
        var speciesCheckboxes = document.querySelectorAll('.editItemSpecies:checked');
        for (var i = 0; i < speciesCheckboxes.length; i++) species.push(speciesCheckboxes[i].value);

        var lifecycle = [];
        var lcCheckboxes = document.querySelectorAll('.editItemLifecycle:checked');
        for (var j = 0; j < lcCheckboxes.length; j++) lifecycle.push(lcCheckboxes[j].value);

        var patch = {
            name: (document.getElementById('editItemName') || {}).value || '',
            category: (document.getElementById('editItemCategory') || {}).value || '',
            description: (document.getElementById('editItemDescription') || {}).value || null,
            product_url: (document.getElementById('editItemUrl') || {}).value || null,
            image_url: (document.getElementById('editItemImageUrl') || {}).value || null,
            priority: parseInt((document.getElementById('editItemPriority') || {}).value) || 0,
            species: species,
            lifecycle_target: lifecycle
        };

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            _closeModal();
            if (typeof showToast === 'function') showToast('Prodotto aggiornato.', 'success');
            loadAdminCatalog();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento.', 'error');
        });
    }

    // =========================================================================
    // Admin: Campaigns Management
    // =========================================================================

    var _campaignsData = [];

    function loadAdminCampaigns(containerId) {
        var container = document.getElementById(containerId || 'admin-campaigns-content');
        if (!container) return;

        _injectAdminStyles();

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;

        var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        if (!tenantId && jwtRole === 'super_admin') {
            container.innerHTML = '<p style="color:#888;">Seleziona un tenant dalla Dashboard per gestire le campagne.</p>';
            return;
        }
        if (!tenantId) {
            container.innerHTML = '<p style="color:#888;">Tenant non configurato.</p>';
            return;
        }

        container.innerHTML = '<p style="color:#888;">Caricamento campagne...</p>';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                _campaignsData = (data && data.campaigns) ? data.campaigns : [];
                _renderCampaignsPage(container, tenantId);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore caricamento campagne.</p>';
            });
    }

    function _renderCampaignsPage(container, tenantId) {
        var html = [];

        html.push('<div style="margin-bottom:16px;">');
        html.push('<button class="btn btn-primary" onclick="showCreateCampaignForm()">+ Nuova Campagna</button>');
        html.push('<button class="btn btn-danger" style="font-size:12px;margin-left:8px;" onclick="adminDeleteAllCampaigns()">🗑️ Cancella tutte le campagne</button>');
        html.push('</div>');

        // Create campaign form (hidden)
        html.push('<div id="create-campaign-form" style="display:none;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px;color:#1e3a5f;">Nuova Campagna</h4>');
        html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Nome *</label><input type="text" id="newCampaignName" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Nome campagna"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">UTM Campaign</label><input type="text" id="newCampaignUtm" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="utm_campaign_id"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Data inizio</label><input type="date" id="newCampaignStart" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Data fine</label><input type="date" id="newCampaignEnd" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
        html.push('<div class="full-width"><label style="font-size:12px;font-weight:600;">Contesti (comma-sep)</label><input type="text" id="newCampaignContexts" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="home_feed, pet_profile, post_visit"></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="createCampaign()">Crea</button> <button class="btn btn-secondary" onclick="hideCreateCampaignForm()">Annulla</button></div>');
        html.push('</div>');

        if (_campaignsData.length === 0) {
            html.push('<p style="color:#888;">Nessuna campagna trovata.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Nome</th><th>Stato</th><th>Inizio</th><th>Fine</th><th>Contesti</th><th>Azioni</th></tr>');
            _campaignsData.forEach(function (camp) {
                var statusColor = { draft: '#888', active: '#16a34a', paused: '#eab308', ended: '#dc2626' }[camp.status] || '#888';
                html.push('<tr>');
                html.push('<td>' + _escapeHtml(camp.name) + '</td>');
                html.push('<td><span style="color:' + statusColor + ';font-weight:600;">' + _escapeHtml(camp.status) + '</span></td>');
                html.push('<td>' + _escapeHtml(camp.start_date ? camp.start_date.substring(0, 10) : '-') + '</td>');
                html.push('<td>' + _escapeHtml(camp.end_date ? camp.end_date.substring(0, 10) : '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(Array.isArray(camp.contexts) ? camp.contexts.join(', ') : '-') + '</td>');
                html.push('<td style="white-space:nowrap;">');

                // Status toggle buttons
                if (camp.status === 'draft') {
                    html.push('<button class="btn btn-success" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="updateCampaignStatus(\'' + _escapeHtml(camp.campaign_id) + '\',\'active\')">Attiva</button>');
                } else if (camp.status === 'active') {
                    html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="updateCampaignStatus(\'' + _escapeHtml(camp.campaign_id) + '\',\'paused\')">Pausa</button>');
                    html.push('<button class="btn btn-danger" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="updateCampaignStatus(\'' + _escapeHtml(camp.campaign_id) + '\',\'ended\')">Termina</button>');
                } else if (camp.status === 'paused') {
                    html.push('<button class="btn btn-success" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="updateCampaignStatus(\'' + _escapeHtml(camp.campaign_id) + '\',\'active\')">Riprendi</button>');
                }
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="manageCampaignItems(\'' + _escapeHtml(camp.campaign_id) + '\')">Prodotti</button>');
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="editCampaign(\'' + _escapeHtml(camp.campaign_id) + '\')">Modifica</button>');
                html.push('<button class="btn btn-danger" style="padding:2px 8px;font-size:11px;" onclick="adminDeleteCampaign(\'' + _escapeHtml(camp.campaign_id) + '\')">🗑️</button>');
                html.push('</td></tr>');
            });
            html.push('</table>');
        }

        container.innerHTML = html.join('');
    }

    function showCreateCampaignForm() { var f = document.getElementById('create-campaign-form'); if (f) f.style.display = ''; }
    function hideCreateCampaignForm() { var f = document.getElementById('create-campaign-form'); if (f) f.style.display = 'none'; }

    function createCampaign() {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var name = (document.getElementById('newCampaignName') || {}).value || '';
        if (!name) { if (typeof showToast === 'function') showToast('Nome obbligatorio.', 'error'); return; }

        var contextsStr = (document.getElementById('newCampaignContexts') || {}).value || '';
        var contexts = contextsStr ? contextsStr.split(',').map(function (s) { return s.trim(); }) : [];

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                start_date: (document.getElementById('newCampaignStart') || {}).value || null,
                end_date: (document.getElementById('newCampaignEnd') || {}).value || null,
                contexts: contexts,
                utm_campaign: (document.getElementById('newCampaignUtm') || {}).value || null
            })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Campagna creata.', 'success');
            hideCreateCampaignForm();
            loadAdminCampaigns();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore creazione campagna.', 'error');
        });
    }

    function updateCampaignStatus(campaignId, newStatus) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Stato aggiornato.', 'success');
            loadAdminCampaigns();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento.', 'error');
        });
    }

    function editCampaign(campaignId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        // Find campaign in cache
        var camp = _campaignsData.find(function (c) { return c.campaign_id === campaignId; });
        if (!camp) return;

        _showModal('Modifica Campagna', function (container) {
            var html = [];
            html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome</label><input type="text" id="editCampName" value="' + _escapeHtml(camp.name || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">UTM Campaign</label><input type="text" id="editCampUtm" value="' + _escapeHtml(camp.utm_campaign || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Data inizio</label><input type="date" id="editCampStart" value="' + _escapeHtml(camp.start_date ? camp.start_date.substring(0, 10) : '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Data fine</label><input type="date" id="editCampEnd" value="' + _escapeHtml(camp.end_date ? camp.end_date.substring(0, 10) : '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div class="full-width"><label style="font-size:12px;font-weight:600;">Contesti</label><input type="text" id="editCampContexts" value="' + _escapeHtml(Array.isArray(camp.contexts) ? camp.contexts.join(', ') : '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('</div>');
            html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="_saveCampaignEdit(\'' + _escapeHtml(campaignId) + '\')">Salva</button> <button class="btn btn-secondary" onclick="_closeModal()">Annulla</button></div>');
            container.innerHTML = html.join('');
        });
    }

    function _saveCampaignEdit(campaignId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var name = (document.getElementById('editCampName') || {}).value || '';
        var utm_campaign = (document.getElementById('editCampUtm') || {}).value || null;
        var start_date = (document.getElementById('editCampStart') || {}).value || null;
        var end_date = (document.getElementById('editCampEnd') || {}).value || null;
        var contextsStr = (document.getElementById('editCampContexts') || {}).value || '';
        var contexts = contextsStr ? contextsStr.split(',').map(function (s) { return s.trim(); }) : [];

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, utm_campaign: utm_campaign, start_date: start_date, end_date: end_date, contexts: contexts })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            _closeModal();
            if (typeof showToast === 'function') showToast('Campagna aggiornata.', 'success');
            loadAdminCampaigns();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento.', 'error');
        });
    }

    // =========================================================================
    // Campaign <-> Promo Item linking
    // =========================================================================

    function manageCampaignItems(campaignId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        _showModal('Prodotti nella campagna', function (container) {
            container.innerHTML = '<p style="color:#888;">Caricamento...</p>';

            // Load linked items and all available items in parallel
            Promise.all([
                fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId) + '/items').then(function (r) { return r.ok ? r.json() : { items: [] }; }),
                fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?limit=100').then(function (r) { return r.ok ? r.json() : { items: [] }; })
            ]).then(function (results) {
                var linked = results[0].items || [];
                var allItems = results[1].items || [];
                var linkedIds = linked.map(function (i) { return i.promo_item_id; });

                var html = [];
                html.push('<h4 style="margin:0 0 8px;color:#1e3a5f;">Prodotti collegati</h4>');
                if (linked.length === 0) {
                    html.push('<p style="color:#888;">Nessun prodotto collegato.</p>');
                } else {
                    linked.forEach(function (item) {
                        html.push('<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">');
                        html.push('<span>' + _escapeHtml(item.name) + ' <small style="color:#888;">(' + _escapeHtml(item.category) + ')</small></span>');
                        html.push('<button class="btn btn-danger" style="padding:2px 8px;font-size:11px;" onclick="unlinkCampaignItem(\'' + _escapeHtml(campaignId) + '\',\'' + _escapeHtml(item.promo_item_id) + '\')">Rimuovi</button>');
                        html.push('</div>');
                    });
                }

                // Add item selector
                var unlinked = allItems.filter(function (i) { return linkedIds.indexOf(i.promo_item_id) === -1; });
                if (unlinked.length > 0) {
                    html.push('<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">');
                    html.push('<select id="linkItemSelect" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;">');
                    unlinked.forEach(function (item) {
                        html.push('<option value="' + _escapeHtml(item.promo_item_id) + '">' + _escapeHtml(item.name) + ' (' + _escapeHtml(item.category) + ')</option>');
                    });
                    html.push('</select>');
                    html.push('<button class="btn btn-success" onclick="linkCampaignItem(\'' + _escapeHtml(campaignId) + '\')">Aggiungi</button>');
                    html.push('</div>');
                }

                html.push('<div style="margin-top:16px;"><button class="btn btn-secondary" onclick="_closeModal()">Chiudi</button></div>');
                container.innerHTML = html.join('');
            });
        });
    }

    function linkCampaignItem(campaignId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var itemId = (document.getElementById('linkItemSelect') || {}).value;
        if (!itemId) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId) + '/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promo_item_id: itemId })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Prodotto collegato.', 'success');
            manageCampaignItems(campaignId); // refresh
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore collegamento.', 'error');
        });
    }

    function unlinkCampaignItem(campaignId, itemId) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId) + '/items/' + encodeURIComponent(itemId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Prodotto rimosso.', 'success');
            manageCampaignItems(campaignId); // refresh
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore rimozione.', 'error');
        });
    }

    // =========================================================================
    // Super Admin: Policies Management
    // =========================================================================

    function loadSuperadminPolicies(containerId) {
        var container = document.getElementById(containerId || 'superadmin-policies-content');
        if (!container) return;

        _injectAdminStyles();
        container.innerHTML = '<p style="color:#888;">Caricamento policies...</p>';

        fetchApi('/api/superadmin/policies')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                var policies = (data && data.policies) ? data.policies : [];
                _renderPoliciesPage(container, policies);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore caricamento policies.</p>';
            });
    }

    function _renderPoliciesPage(container, policies) {
        var html = [];

        html.push('<div style="margin-bottom:16px;">');
        html.push('<button class="btn btn-primary" onclick="showCreatePolicyForm()">+ Nuova Policy</button>');
        html.push('</div>');

        // Create form
        html.push('<div id="create-policy-form" style="display:none;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px;color:#1e3a5f;">Nuova/Modifica Policy</h4>');
        html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Chiave *</label><input type="text" id="newPolicyKey" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="es: max_impressions_per_day"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Valore *</label><input type="text" id="newPolicyValue" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="es: 10"></div>');
        html.push('<div class="full-width"><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="newPolicyDescription" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Descrizione policy"></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="savePolicy()">Salva</button> <button class="btn btn-secondary" onclick="hidePolicyForm()">Annulla</button></div>');
        html.push('</div>');

        if (policies.length === 0) {
            html.push('<p style="color:#888;">Nessuna policy configurata.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Chiave</th><th>Valore</th><th>Descrizione</th><th>Aggiornato</th><th>Azioni</th></tr>');
            policies.forEach(function (p) {
                var val = p.policy_value;
                try { val = JSON.parse(p.policy_value); val = JSON.stringify(val); } catch (_e) { val = String(p.policy_value); }
                html.push('<tr>');
                html.push('<td><code>' + _escapeHtml(p.policy_key) + '</code></td>');
                html.push('<td>' + _escapeHtml(val) + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(p.description || '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(p.updated_at ? p.updated_at.substring(0, 10) : '-') + '</td>');
                html.push('<td><button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="editPolicy(\'' + _escapeHtml(p.policy_key) + '\')">Modifica</button></td>');
                html.push('</tr>');
            });
            html.push('</table>');
        }

        container.innerHTML = html.join('');
    }

    function showCreatePolicyForm() { var f = document.getElementById('create-policy-form'); if (f) f.style.display = ''; }
    function hidePolicyForm() { var f = document.getElementById('create-policy-form'); if (f) f.style.display = 'none'; }

    function savePolicy() {
        var key = (document.getElementById('newPolicyKey') || {}).value || '';
        var valueStr = (document.getElementById('newPolicyValue') || {}).value || '';
        if (!key) { if (typeof showToast === 'function') showToast('Chiave obbligatoria.', 'error'); return; }

        var value;
        try { value = JSON.parse(valueStr); } catch (_e) { value = valueStr; }

        fetchApi('/api/superadmin/policies/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: value, description: (document.getElementById('newPolicyDescription') || {}).value || null })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Policy salvata.', 'success');
            hidePolicyForm();
            loadSuperadminPolicies();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore salvataggio policy.', 'error');
        });
    }

    function editPolicy(key) {
        var keyEl = document.getElementById('newPolicyKey');
        var valEl = document.getElementById('newPolicyValue');
        if (keyEl) keyEl.value = key;
        if (valEl) valEl.value = '';
        showCreatePolicyForm();
    }

    // =========================================================================
    // Super Admin: Tag Dictionary Management
    // =========================================================================

    function loadSuperadminTags(containerId) {
        var container = document.getElementById(containerId || 'superadmin-tags-content');
        if (!container) return;

        _injectAdminStyles();
        container.innerHTML = '<p style="color:#888;">Caricamento tag dictionary...</p>';

        fetchApi('/api/superadmin/tags')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                var tags = (data && data.tags) ? data.tags : [];
                _renderTagsPage(container, tags);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore caricamento tag.</p>';
            });
    }

    function _renderTagsPage(container, tags) {
        var html = [];

        html.push('<div style="margin-bottom:16px;">');
        html.push('<button class="btn btn-primary" onclick="showCreateTagForm()">+ Nuovo Tag</button>');
        html.push('</div>');

        // Create form
        html.push('<div id="create-tag-form" style="display:none;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">');
        html.push('<h4 style="margin:0 0 12px;color:#1e3a5f;">Nuovo/Modifica Tag</h4>');
        html.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">');
        html.push('<div><label style="font-size:12px;font-weight:600;">Tag ID *</label><input type="text" id="newTagId" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="es: clinical:allergy"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Label *</label><input type="text" id="newTagLabel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Allergia"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Categoria *</label><input type="text" id="newTagCategory" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="clinical, lifecycle, species"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Sensibilita</label><select id="newTagSensitivity" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div>');
        html.push('<div class="full-width"><label style="font-size:12px;font-weight:600;">Descrizione</label><input type="text" id="newTagDescription" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="Descrizione"></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="saveTag()">Salva</button> <button class="btn btn-secondary" onclick="hideTagForm()">Annulla</button></div>');
        html.push('</div>');

        if (tags.length === 0) {
            html.push('<p style="color:#888;">Nessun tag trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Tag</th><th>Label</th><th>Categoria</th><th>Sensibilita</th><th>Descrizione</th><th>Azioni</th></tr>');
            tags.forEach(function (t) {
                var sensColor = { low: '#16a34a', medium: '#eab308', high: '#dc2626' }[t.sensitivity] || '#888';
                html.push('<tr>');
                html.push('<td><code>' + _escapeHtml(t.tag) + '</code></td>');
                html.push('<td>' + _escapeHtml(t.label) + '</td>');
                html.push('<td>' + _escapeHtml(t.category) + '</td>');
                html.push('<td><span style="color:' + sensColor + ';font-weight:600;">' + _escapeHtml(t.sensitivity) + '</span></td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(t.description || '-') + '</td>');
                html.push('<td><button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="editTag(\'' + _escapeHtml(t.tag) + '\',\'' + _escapeHtml(t.label) + '\')">Modifica</button></td>');
                html.push('</tr>');
            });
            html.push('</table>');
        }

        container.innerHTML = html.join('');
    }

    function showCreateTagForm() { var f = document.getElementById('create-tag-form'); if (f) f.style.display = ''; }
    function hideTagForm() { var f = document.getElementById('create-tag-form'); if (f) f.style.display = 'none'; }

    function saveTag() {
        var tag = (document.getElementById('newTagId') || {}).value || '';
        var label = (document.getElementById('newTagLabel') || {}).value || '';
        var category = (document.getElementById('newTagCategory') || {}).value || '';
        if (!tag || !label || !category) { if (typeof showToast === 'function') showToast('Tag, label e categoria obbligatori.', 'error'); return; }

        fetchApi('/api/superadmin/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tag: tag, label: label, category: category,
                sensitivity: (document.getElementById('newTagSensitivity') || {}).value || 'low',
                description: (document.getElementById('newTagDescription') || {}).value || null
            })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Tag salvato.', 'success');
            hideTagForm();
            loadSuperadminTags();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore salvataggio tag.', 'error');
        });
    }

    function editTag(tagId, currentLabel) {
        var tagEl = document.getElementById('newTagId');
        var labelEl = document.getElementById('newTagLabel');
        if (tagEl) tagEl.value = tagId;
        if (labelEl) labelEl.value = currentLabel;
        showCreateTagForm();
    }

    // =========================================================================
    // Super Admin: Audit Log Viewer
    // =========================================================================

    var _auditOffset = 0;

    function loadSuperadminAudit(containerId) {
        var container = document.getElementById(containerId || 'superadmin-audit-content');
        if (!container) return;

        _injectAdminStyles();
        container.innerHTML = '<p style="color:#888;">Caricamento audit log...</p>';

        var actionFilter = (document.getElementById('auditActionFilter') || {}).value || '';
        var params = '?limit=50&offset=' + _auditOffset;
        if (actionFilter) params += '&action=' + encodeURIComponent(actionFilter);

        fetchApi('/api/superadmin/audit' + params)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                var audit = (data && data.audit) ? data.audit : [];
                _renderAuditPage(container, audit);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore caricamento audit log.</p>';
            });
    }

    function _renderAuditPage(container, audit) {
        var html = [];

        // Filter bar
        html.push('<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">');
        html.push('<input type="text" id="auditActionFilter" placeholder="Filtra per azione..." style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;width:200px;">');
        html.push('<button class="btn btn-secondary" onclick="auditApplyFilter()">Filtra</button>');
        html.push('<button class="btn btn-secondary" onclick="auditResetFilter()">Reset</button>');
        html.push('</div>');

        if (audit.length === 0) {
            html.push('<p style="color:#888;">Nessun record trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Data</th><th>Chi</th><th>Azione</th><th>Entita</th><th>Esito</th><th>Ruolo</th><th>Tenant</th></tr>');
            audit.forEach(function (a) {
                var outColor = a.outcome === 'success' ? '#16a34a' : '#dc2626';
                html.push('<tr>');
                html.push('<td style="font-size:11px;white-space:nowrap;">' + _escapeHtml(a.created_at ? a.created_at.substring(0, 19).replace('T', ' ') : '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(a.who || '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(a.action || '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(a.entity_id || '-') + '</td>');
                html.push('<td><span style="color:' + outColor + ';font-weight:600;">' + _escapeHtml(a.outcome || '-') + '</span></td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(a.user_role || '-') + '</td>');
                html.push('<td style="font-size:12px;">' + _escapeHtml(a.tenant_id || '-') + '</td>');
                html.push('</tr>');
            });
            html.push('</table>');

            // Pagination
            html.push('<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">');
            if (_auditOffset > 0) {
                html.push('<button class="btn btn-secondary" onclick="auditPrevPage()">Precedente</button>');
            }
            if (audit.length >= 50) {
                html.push('<button class="btn btn-secondary" onclick="auditNextPage()">Successivo</button>');
            }
            html.push('</div>');
        }

        container.innerHTML = html.join('');
    }

    function auditApplyFilter() { _auditOffset = 0; loadSuperadminAudit(); }
    function auditResetFilter() {
        _auditOffset = 0;
        var f = document.getElementById('auditActionFilter');
        if (f) f.value = '';
        loadSuperadminAudit();
    }
    function auditPrevPage() { _auditOffset = Math.max(0, _auditOffset - 50); loadSuperadminAudit(); }
    function auditNextPage() { _auditOffset += 50; loadSuperadminAudit(); }

    // =========================================================================
    // Modal helper
    // =========================================================================

    function _showModal(title, renderFn) {
        _closeModal(); // close any existing
        var overlay = document.createElement('div');
        overlay.id = 'admin-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = function (e) { if (e.target === overlay) _closeModal(); };

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        var header = document.createElement('h3');
        header.style.cssText = 'margin:0 0 16px;color:#1e3a5f;';
        header.textContent = title;
        modal.appendChild(header);

        var body = document.createElement('div');
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        if (typeof renderFn === 'function') renderFn(body);
    }

    function _closeModal() {
        var overlay = document.getElementById('admin-modal-overlay');
        if (overlay) overlay.remove();
    }

    // =========================================================================
    // XLSX Template + Export
    // =========================================================================

    function downloadXlsxTemplate() {
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('Libreria SheetJS non disponibile.', 'error');
            return;
        }
        var data = [
            { name: 'Royal Canin Maxi Adult', category: 'food_general', species: 'dog', lifecycle_target: 'adult', description: 'Cibo secco per cani adulti taglia grande (26-44 kg). Ricetta con EPA e DHA per pelle e manto sani.', image_url: 'https://example.com/img/rc-maxi.jpg', product_url: 'https://www.royalcanin.com/it/dogs/products/retail-products/maxi-adult', tags_include: '', tags_exclude: '', priority: 0 },
            { name: "Hill's Prescription Diet k/d", category: 'food_clinical', species: 'cat', lifecycle_target: 'senior', description: 'Dieta clinica per gatti con insufficienza renale. Ridotto contenuto di fosforo e sodio.', image_url: 'https://example.com/img/hills-kd.jpg', product_url: 'https://www.hillspet.it/prodotti-gatto/pd-feline-kd-with-chicken-dry', tags_include: 'clinical:renal', tags_exclude: '', priority: 5 },
            { name: 'Frontline Tri-Act', category: 'antiparasitic', species: 'dog', lifecycle_target: 'puppy|adult|senior', description: 'Antiparassitario spot-on per cani. Protezione completa contro pulci, zecche e zanzare per 4 settimane.', image_url: 'https://example.com/img/frontline.jpg', product_url: 'https://www.frontlinecombo.it/prodotti/tri-act', tags_include: '', tags_exclude: '', priority: 3 }
        ];
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Prodotti');
        XLSX.writeFile(wb, 'promo_items_template.xlsx');
    }

    function exportPromoXlsx(period) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var p = period || '30d';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/export/events?period=' + p, { method: 'GET' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (csvText) {
                if (typeof XLSX === 'undefined') {
                    if (typeof showToast === 'function') showToast('Libreria SheetJS non disponibile.', 'error');
                    return;
                }
                var wb = XLSX.read(csvText, { type: 'string' });
                XLSX.writeFile(wb, 'promo_events_' + tenantId + '_' + p + '.xlsx');
            })
            .catch(function () {
                if (typeof showToast === 'function') showToast('Errore nel download XLSX.', 'error');
            });
    }

    // =========================================================================
    // Delete functions: Dashboard, Catalog, Campaigns
    // =========================================================================

    function _getAdminTenantId() {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        return tenantId;
    }

    function adminDeleteAllDashboardData() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) {
            if (typeof showToast === 'function') showToast('Seleziona un tenant prima.', 'error');
            return;
        }
        if (!confirm('Sei sicuro di voler cancellare TUTTI gli eventi promozionali di questo tenant? Questa operazione è irreversibile.')) return;

        fetchApi('/api/admin/promo-events?tenant_id=' + encodeURIComponent(tenantId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Tutti gli eventi cancellati con successo.', 'success');
            loadAdminDashboard('admin-dashboard-content');
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore nella cancellazione: ' + e.message, 'error');
        });
    }

    function adminDeleteAllCatalogItems() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        if (!confirm('Cancellare TUTTI i prodotti dal catalogo?')) return;
        if (!confirm('Operazione irreversibile. Confermi?')) return;

        fetchApi('/api/admin/catalog?tenant_id=' + encodeURIComponent(tenantId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Catalogo cancellato con successo.', 'success');
            loadAdminCatalog();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore nella cancellazione: ' + e.message, 'error');
        });
    }

    function adminDeleteCatalogItem(itemId) {
        if (!confirm('Cancellare questo prodotto dal catalogo?')) return;

        fetchApi('/api/admin/catalog/' + encodeURIComponent(itemId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Prodotto cancellato.', 'success');
            loadAdminCatalog();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore nella cancellazione: ' + e.message, 'error');
        });
    }

    function adminDeleteAllCampaigns() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        if (!confirm('Cancellare TUTTE le campagne di questo tenant?')) return;
        if (!confirm('Operazione irreversibile. Confermi?')) return;

        fetchApi('/api/admin/campaigns?tenant_id=' + encodeURIComponent(tenantId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Tutte le campagne cancellate con successo.', 'success');
            loadAdminCampaigns();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore nella cancellazione: ' + e.message, 'error');
        });
    }

    function adminDeleteCampaign(campaignId) {
        if (!confirm('Cancellare questa campagna?')) return;

        fetchApi('/api/admin/campaigns/' + encodeURIComponent(campaignId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Campagna cancellata.', 'success');
            loadAdminCampaigns();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore nella cancellazione: ' + e.message, 'error');
        });
    }

    // =========================================================================
    // Expose public API
    // =========================================================================

    global.loadAdminDashboard     = loadAdminDashboard;
    global.selectDashboardTenant  = selectDashboardTenant;
    global.exportPromoCsv         = exportPromoCsv;
    global.initCsvWizard          = initCsvWizard;
    global.handleCsvUpload        = handleCsvUpload;
    global.wizardDryRun           = wizardDryRun;
    global.wizardImport           = wizardImport;
    global.downloadCsvTemplate    = downloadCsvTemplate;
    global.wizardPreviewNav       = wizardPreviewNav;
    global.wizardEditItem         = wizardEditItem;
    global._saveWizardItemEdit    = _saveWizardItemEdit;
    // Catalog
    global.loadAdminCatalog       = loadAdminCatalog;
    global.showCreateItemForm     = showCreateItemForm;
    global.hideCreateItemForm     = hideCreateItemForm;
    global.filterCatalogStatus    = filterCatalogStatus;
    global.catalogGoToPage        = catalogGoToPage;
    global.createPromoItem        = createPromoItem;
    global.transitionItem         = transitionItem;
    global.editPromoItem          = editPromoItem;
    // Campaigns
    global.loadAdminCampaigns     = loadAdminCampaigns;
    global.showCreateCampaignForm = showCreateCampaignForm;
    global.hideCreateCampaignForm = hideCreateCampaignForm;
    global.createCampaign         = createCampaign;
    global.updateCampaignStatus   = updateCampaignStatus;
    global.editCampaign           = editCampaign;
    global._saveCampaignEdit      = _saveCampaignEdit;
    // Campaign-Item linking
    global.manageCampaignItems    = manageCampaignItems;
    global.linkCampaignItem       = linkCampaignItem;
    global.unlinkCampaignItem     = unlinkCampaignItem;
    // Promo edit modal
    global._savePromoItemEdit     = _savePromoItemEdit;
    // Modal helpers
    global._closeModal            = _closeModal;
    // Tenants
    global.loadSuperadminTenants  = loadSuperadminTenants;
    global.showCreateTenantForm   = showCreateTenantForm;
    global.hideCreateTenantForm   = hideCreateTenantForm;
    global.createTenant           = createTenant;
    global.toggleTenantStatus     = toggleTenantStatus;
    global.promptEditTenant       = promptEditTenant;
    global.resetTenantData        = resetTenantData;
    // Users
    global.loadSuperadminUsers    = loadSuperadminUsers;
    global.showCreateUserForm     = showCreateUserForm;
    global.hideCreateUserForm     = hideCreateUserForm;
    global.createUser             = createUser;
    global.toggleUserStatus       = toggleUserStatus;
    global.promptResetPassword    = promptResetPassword;
    global.promptAssignTenant     = promptAssignTenant;
    // Policies
    global.loadSuperadminPolicies = loadSuperadminPolicies;
    global.showCreatePolicyForm   = showCreatePolicyForm;
    global.hidePolicyForm         = hidePolicyForm;
    global.savePolicy             = savePolicy;
    global.editPolicy             = editPolicy;
    // Tags
    global.loadSuperadminTags     = loadSuperadminTags;
    global.showCreateTagForm      = showCreateTagForm;
    global.hideTagForm            = hideTagForm;
    global.saveTag                = saveTag;
    global.editTag                = editTag;
    // Audit
    global.loadSuperadminAudit    = loadSuperadminAudit;
    global.auditApplyFilter       = auditApplyFilter;
    global.auditResetFilter       = auditResetFilter;
    global.auditPrevPage          = auditPrevPage;
    global.auditNextPage          = auditNextPage;
    // XLSX
    global.downloadXlsxTemplate   = downloadXlsxTemplate;
    global.exportPromoXlsx        = exportPromoXlsx;
    // Delete functions
    global.adminDeleteAllDashboardData = adminDeleteAllDashboardData;
    global.adminDeleteAllCatalogItems  = adminDeleteAllCatalogItems;
    global.adminDeleteCatalogItem      = adminDeleteCatalogItem;
    global.adminDeleteAllCampaigns     = adminDeleteAllCampaigns;
    global.adminDeleteCampaign         = adminDeleteCampaign;

})(typeof window !== 'undefined' ? window : this);
