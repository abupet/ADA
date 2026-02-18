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
        tenants = tenants.filter(function(t) { return t.status === 'active'; });
        tenants.forEach(function (t) {
            var selected = t.tenant_id === _selectedDashboardTenant ? ' selected' : '';
            html += '<option value="' + _escapeHtml(t.tenant_id) + '"' + selected + '>' + _escapeHtml(t.name) + ' [' + _escapeHtml(t.slug) + ']</option>';
        });
        html += '</select></div>';
        return html;
    }

    function selectDashboardTenant(tenantId, containerId, period) {
        _selectedDashboardTenant = tenantId;
        try { sessionStorage.setItem('ada_selected_tenant', tenantId); } catch (e) {}
        loadAdminDashboard(containerId, period);
    }

    function _renderPageTenantSelector(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        var jwtTenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (jwtRole !== 'super_admin') {
            if (jwtTenantId) container.innerHTML = '<span style="font-size:12px;color:#888;">Tenant: <strong>' + _escapeHtml(jwtTenantId) + '</strong></span>';
            return;
        }
        fetchApi('/api/superadmin/tenants')
            .then(function(r) { return r.ok ? r.json() : { tenants: [] }; })
            .then(function(data) {
                var tenants = (data.tenants || []).filter(function(t) { return t.status === 'active'; });
                if (tenants.length === 0) { container.innerHTML = '<span style="font-size:12px;color:#888;">Nessun tenant configurato</span>'; return; }
                if (!_selectedDashboardTenant) _selectedDashboardTenant = tenants[0].tenant_id;
                var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">';
                html += '<span style="font-size:12px;font-weight:600;color:#1e3a5f;">Tenant:</span>';
                html += '<select onchange="switchPageTenant(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">';
                tenants.forEach(function(t) {
                    var selected = t.tenant_id === _selectedDashboardTenant ? ' selected' : '';
                    html += '<option value="' + _escapeHtml(t.tenant_id) + '"' + selected + '>' + _escapeHtml(t.name) + '</option>';
                });
                html += '</select></div>';
                container.innerHTML = html;
            })
            .catch(function() {});
    }

    function switchPageTenant(tenantId) {
        _selectedDashboardTenant = tenantId;
        try { sessionStorage.setItem('ada_selected_tenant', tenantId); } catch (e) {}
        var activePage = document.querySelector('.page[style*="display: block"], .page[style*="display:block"]');
        if (activePage) {
            var pageId = activePage.id;
            if (pageId === 'page-admin-catalog') loadAdminCatalog();
            else if (pageId === 'page-admin-campaigns') loadAdminCampaigns();
            else if (pageId === 'page-admin-dashboard') loadAdminDashboard('admin-dashboard-content');
        }
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

        // Catalog health section
        if (s.items_without_image !== undefined || s.items_without_ext_desc !== undefined || s.broken_urls !== undefined) {
            html.push('<div class="admin-section">');
            html.push('<div class="admin-section-title">Salute Catalogo</div>');
            html.push('<div class="admin-grid">');
            if (s.items_without_image !== undefined)
                html.push(_statCard(s.items_without_image, 'Senza immagine'));
            if (s.items_without_ext_desc !== undefined)
                html.push(_statCard(s.items_without_ext_desc, 'Senza ext. desc.'));
            if (s.broken_urls !== undefined)
                html.push(_statCard(s.broken_urls, 'URL non validi'));
            html.push('</div></div>');
        }

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
            '<p>Formato accettato: CSV o XLSX. Colonne: name, category, species, lifecycle_target, description, image_url, product_url, tags_include, tags_exclude, priority, service_type</p>',
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
            '<button class="btn btn-secondary" onclick="downloadCatalogCsv()" style="font-size:12px;">Scarica file CSV</button>',
            '<button class="btn btn-secondary" onclick="downloadCatalogXlsx()" style="font-size:12px;margin-left:4px;">Scarica file XLSX</button>',
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
        var csvContent = 'name,category,species,lifecycle_target,description,extended_description,image_url,product_url,tags_include,tags_exclude,priority,service_type\n'
            + '"Royal Canin Maxi Adult",food_general,"dog","adult","Cibo secco per cani adulti taglia grande","Alimento completo per cani adulti di taglia grande (26-44 kg). Formula con EPA e DHA per pelle e manto sani. Crocchette adattate alla mascella dei cani grandi.",https://example.com/img/rc-maxi.jpg,https://www.royalcanin.com/it/dogs/products/retail-products/maxi-adult,,0,promo\n'
            + '"Hill\'s Prescription Diet k/d",food_clinical,"cat","senior","Dieta clinica per gatti con insufficienza renale","Alimento dietetico completo per gatti adulti. Formulato per il supporto della funzione renale in caso di insufficienza renale cronica. Ridotto contenuto di fosforo e sodio. Elevato contenuto di acidi grassi omega-3.",https://example.com/img/hills-kd.jpg,https://www.hillspet.it/prodotti-gatto/pd-feline-kd-with-chicken-dry,clinical:renal,,5,promo\n'
            + '"Frontline Tri-Act",antiparasitic,"dog","puppy|adult|senior","Antiparassitario spot-on per cani","Soluzione spot-on per cani. Protezione completa contro pulci, zecche, zanzare, pappataci e mosche cavalline per 4 settimane. Azione repellente e insetticida.",https://example.com/img/frontline.jpg,https://www.frontlinecombo.it/prodotti/tri-act,,,3,promo\n';
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'promo_items_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    function _csvEscape(str) {
        if (!str) return '';
        if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function _csvArrayField(val) {
        if (Array.isArray(val)) return '"' + val.join('|') + '"';
        if (typeof val === 'string' && val.indexOf(',') !== -1) return '"' + val + '"';
        return val || '';
    }

    function _getWizardTenantId() {
        var sel = document.getElementById('wizardCsvTenant');
        if (sel && sel.value) return sel.value;
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        return tenantId;
    }

    function downloadCatalogCsv() {
        var tenantId = _getWizardTenantId();
        if (!tenantId) { downloadCsvTemplate(); return; }
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=1&limit=9999')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !data.items || data.items.length === 0) {
                    if (typeof showToast === 'function') showToast('Nessun prodotto da esportare. Scarico il template vuoto.', 'info');
                    downloadCsvTemplate();
                    return;
                }
                var headers = 'name,category,species,lifecycle_target,description,extended_description,image_url,product_url,tags_include,tags_exclude,priority,status,service_type';
                var lines = [headers];
                data.items.forEach(function(item) {
                    var row = [
                        _csvEscape(item.name || ''),
                        item.category || '',
                        _csvArrayField(item.species),
                        _csvArrayField(item.lifecycle_target),
                        _csvEscape(item.description || ''),
                        _csvEscape(item.extended_description || ''),
                        item.image_url || '',
                        item.product_url || '',
                        _csvArrayField(item.tags_include),
                        _csvArrayField(item.tags_exclude),
                        item.priority || 0,
                        item.status || 'draft',
                        (Array.isArray(item.service_type) ? item.service_type.join('|') : (item.service_type || 'promo')),
                    ].join(',');
                    lines.push(row);
                });
                var csvContent = lines.join('\n');
                var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'catalogo_' + tenantId + '.csv';
                a.click();
                URL.revokeObjectURL(url);
                if (typeof showToast === 'function') showToast(data.items.length + ' prodotti esportati in CSV', 'success');
            })
            .catch(function() {
                if (typeof showToast === 'function') showToast('Errore nel download. Scarico il template.', 'error');
                downloadCsvTemplate();
            });
    }

    function downloadCatalogXlsx() {
        var tenantId = _getWizardTenantId();
        if (!tenantId) { downloadXlsxTemplate(); return; }
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('Libreria SheetJS non disponibile.', 'error');
            return;
        }
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=1&limit=9999')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !data.items || data.items.length === 0) {
                    if (typeof showToast === 'function') showToast('Nessun prodotto. Scarico template vuoto.', 'info');
                    downloadXlsxTemplate();
                    return;
                }
                var sheetData = data.items.map(function(item) {
                    return {
                        name: item.name || '',
                        category: item.category || '',
                        species: Array.isArray(item.species) ? item.species.join('|') : (item.species || ''),
                        lifecycle_target: Array.isArray(item.lifecycle_target) ? item.lifecycle_target.join('|') : (item.lifecycle_target || ''),
                        description: item.description || '',
                        extended_description: item.extended_description || '',
                        image_url: item.image_url || '',
                        product_url: item.product_url || '',
                        tags_include: Array.isArray(item.tags_include) ? item.tags_include.join('|') : (item.tags_include || ''),
                        tags_exclude: Array.isArray(item.tags_exclude) ? item.tags_exclude.join('|') : (item.tags_exclude || ''),
                        priority: item.priority || 0,
                        status: item.status || 'draft',
                        service_type: item.service_type ? String(item.service_type).split('|') : ['promo'],
                    };
                });
                var ws = XLSX.utils.json_to_sheet(sheetData);
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Prodotti');
                XLSX.writeFile(wb, 'catalogo_' + tenantId + '.xlsx');
                if (typeof showToast === 'function') showToast(data.items.length + ' prodotti esportati in XLSX', 'success');
            })
            .catch(function() {
                if (typeof showToast === 'function') showToast('Errore download XLSX.', 'error');
                downloadXlsxTemplate();
            });
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
            html += '<tr><th>#</th><th>Nome</th><th>Categoria</th><th>Specie</th><th>Lifecycle</th><th>Descrizione</th><th>Ext.Desc.</th><th></th></tr>';
            _wizardParsedItems.forEach(function (item, idx) {
                var speciesArr = typeof item.species === 'string' ? item.species.split('|') : (Array.isArray(item.species) ? item.species : []);
                var lcArr = typeof item.lifecycle_target === 'string' ? item.lifecycle_target.split('|') : (Array.isArray(item.lifecycle_target) ? item.lifecycle_target : []);
                html += '<tr><td>' + (idx + 1) + '</td><td>' + _escapeHtml(item.name || '') +
                    '</td><td>' + _escapeHtml(_translateCategory(item.category)) +
                    '</td><td>' + _escapeHtml(_translateSpecies(speciesArr)) +
                    '</td><td>' + _escapeHtml(_translateLifecycle(lcArr)) +
                    '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escapeHtml((item.description || '').slice(0, 80)) +
                    '</td><td>' + (item.extended_description ? '✅' : '<span style="color:#dc2626;">❌</span>') +
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
        html += '<span style="display:inline-block;background:#22c55e;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-bottom:8px;">Consigliato per il tuo amico pet</span>';
        var _previewImgUrl = getProductImageUrl(p);
        html += '<div style="text-align:center;margin-bottom:8px;"><img src="' + _escapeHtml(_previewImgUrl) + '" style="max-height:120px;max-width:100%;border-radius:8px;" onerror="this.style.display=\'none\'"></div>';
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
            html.push('<div style="grid-column:1/-1;margin-top:10px;">');
            html.push('<label style="font-size:12px;font-weight:600;">Descrizione Prodotto (per AI matching)</label>');
            html.push('<textarea id="wizEditExtDesc" rows="4" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;resize:vertical;">' + _escapeHtml(item.extended_description || '') + '</textarea>');
            html.push('<small style="color:#888;">Max 2000 char. Usata dal motore AI per matching prodotto-paziente. Non visibile al cliente.</small>');
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
        item.extended_description = (document.getElementById('wizEditExtDesc') || {}).value || '';

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
            html += '<tr><th>#</th><th>Nome</th><th>Categoria</th><th>Specie</th><th>Lifecycle</th><th>Descrizione</th><th>Ext.Desc.</th><th></th></tr>';
            _wizardParsedItems.forEach(function (it, i) {
                var speciesArr = typeof it.species === 'string' ? it.species.split('|') : (Array.isArray(it.species) ? it.species : []);
                var lcArr = typeof it.lifecycle_target === 'string' ? it.lifecycle_target.split('|') : (Array.isArray(it.lifecycle_target) ? it.lifecycle_target : []);
                html += '<tr><td>' + (i + 1) + '</td><td>' + _escapeHtml(it.name || '') +
                    '</td><td>' + _escapeHtml(_translateCategory(it.category)) +
                    '</td><td>' + _escapeHtml(_translateSpecies(speciesArr)) +
                    '</td><td>' + _escapeHtml(_translateLifecycle(lcArr)) +
                    '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escapeHtml((it.description || '').slice(0, 80)) +
                    '</td><td>' + (it.extended_description ? '✅' : '<span style="color:#dc2626;">❌</span>') +
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
    var _usersFilterText = '';
    var _usersFilterRole = '';

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

    function _getFilteredUsers() {
        var text = _usersFilterText.toLowerCase().trim();
        var role = _usersFilterRole;
        return _usersData.filter(function (u) {
            if (role && u.base_role !== role) return false;
            if (text) {
                var haystack = ((u.email || '') + ' ' + (u.display_name || '')).toLowerCase();
                if (haystack.indexOf(text) === -1) return false;
            }
            return true;
        });
    }

    function _onUsersFilterChange() {
        _usersFilterText = (document.getElementById('usersFilterText') || {}).value || '';
        _usersFilterRole = (document.getElementById('usersFilterRole') || {}).value || '';
        var tableContainer = document.getElementById('users-table-container');
        if (tableContainer) {
            _renderUsersTable(tableContainer);
        } else {
            var container = document.getElementById('superadmin-users-content');
            if (container) _renderUsersPage(container);
        }
    }

    function _renderUsersPage(container) {
        var html = [];

        // Filters row
        html.push('<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">');
        html.push('<input type="text" id="usersFilterText" placeholder="Cerca per nome o email..." value="' + _escapeHtml(_usersFilterText) + '" oninput="_onUsersFilterChange()" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;">');
        html.push('<select id="usersFilterRole" onchange="_onUsersFilterChange()" style="padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;">');
        html.push('<option value=""' + (!_usersFilterRole ? ' selected' : '') + '>Tutti i ruoli</option>');
        html.push('<option value="owner"' + (_usersFilterRole === 'owner' ? ' selected' : '') + '>Owner</option>');
        html.push('<option value="vet_int"' + (_usersFilterRole === 'vet_int' ? ' selected' : '') + '>Vet Int</option>');
        html.push('<option value="vet_ext"' + (_usersFilterRole === 'vet_ext' ? ' selected' : '') + '>Vet Ext</option>');
        html.push('<option value="admin_brand"' + (_usersFilterRole === 'admin_brand' ? ' selected' : '') + '>Admin Brand</option>');
        html.push('<option value="super_admin"' + (_usersFilterRole === 'super_admin' ? ' selected' : '') + '>Super Admin</option>');
        html.push('</select>');
        html.push('</div>');

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
        html.push('<option value="vet_int">Vet Int (Veterinario Interno)</option>');
        html.push('<option value="vet_ext">Vet Ext (Veterinario Esterno)</option>');
        html.push('<option value="admin_brand">Admin Brand</option>');
        html.push('<option value="super_admin">Super Admin</option>');
        html.push('</select></div>');
        html.push('</div>');
        html.push('<div style="margin-top:12px;">');
        html.push('<button class="btn btn-success" onclick="createUser()">Crea</button> ');
        html.push('<button class="btn btn-secondary" onclick="hideCreateUserForm()">Annulla</button>');
        html.push('</div>');
        html.push('</div>');

        // Users table container (updated separately for filter changes)
        html.push('<div id="users-table-container"></div>');

        container.innerHTML = html.join('');
        // Render table into its container
        var tableContainer = document.getElementById('users-table-container');
        if (tableContainer) _renderUsersTable(tableContainer);
    }

    function _renderUsersTable(container) {
        var html = [];
        var filteredUsers = _getFilteredUsers();
        if (filteredUsers.length === 0) {
            html.push('<p style="color:#888;">Nessun utente trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Email</th><th>Nome</th><th>Ruolo</th><th>Stato</th><th>Tenant</th><th>Azioni</th></tr>');
            filteredUsers.forEach(function (user) {
                var statusBadge = user.status === 'active'
                    ? '<span style="color:#16a34a;font-weight:600;">attivo</span>'
                    : '<span style="color:#dc2626;font-weight:600;">disabilitato</span>';

                var tenantInfo = '';
                if (Array.isArray(user.tenants) && user.tenants.length > 0) {
                    tenantInfo = user.tenants.map(function (t) {
                        var tenantName = _tenantsCache.find(function (tc) { return tc.tenant_id === t.tenant_id; });
                        var displayName = _escapeHtml((tenantName ? tenantName.name : t.tenant_id) + ' (' + t.role + ')');
                        return displayName + ' <button class="btn btn-danger" style="padding:2px 6px;font-size:10px;margin-left:4px;" ' +
                            'onclick="removeTenantFromUser(\'' + _escapeHtml(user.user_id) + '\',\'' + _escapeHtml(t.tenant_id) + '\')">&times;</button>';
                    }).join('<br>');
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
        var activeTenants = _tenantsCache.filter(function(t) { return t.status === 'active'; });
        if (activeTenants.length === 0) {
            if (typeof showToast === 'function') showToast('Nessun tenant disponibile. Creane uno prima.', 'error');
            return;
        }

        var options = activeTenants.map(function (t, i) { return (i + 1) + ') ' + t.name + ' [' + t.slug + ']'; }).join('\n');
        var choice = prompt('Scegli il tenant (numero):\n' + options);
        if (!choice) return;

        var idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= activeTenants.length) {
            if (typeof showToast === 'function') showToast('Scelta non valida.', 'error');
            return;
        }

        var tenant = activeTenants[idx];
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

    function removeTenantFromUser(userId, tenantId) {
        if (!confirm('Rimuovere il tenant dall\'utente?')) return;
        fetchApi('/api/superadmin/users/' + encodeURIComponent(userId) + '/tenants/' + encodeURIComponent(tenantId), {
            method: 'DELETE'
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (typeof showToast === 'function') showToast('Tenant rimosso.', 'success');
            loadSuperadminUsers();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore rimozione tenant.', 'error');
        });
    }

    // =========================================================================
    // Admin: Catalog Management
    // =========================================================================

    var _catalogItems = [];
    var _catalogPage = 1;
    var _catalogTotal = 0;
    var _catalogStatusFilter = '';
    var _catalogSearchTerm = '';
    var _catalogPriorityFilter = '';
    var _catalogServiceTypeFilter = '';
    var _catalogImageFilter = '';
    var _catalogExtDescFilter = '';
    var _catalogCategoryFilter = '';
    var _catalogSpeciesFilter = '';
    var _filteredPreviewItems = [];

    function loadAdminCatalog(containerId) {
        var container = document.getElementById(containerId || 'admin-catalog-content');
        if (!container) return;

        _injectAdminStyles();
        _renderPageTenantSelector('catalog-tenant-selector');

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) {
            try { var stored = sessionStorage.getItem('ada_selected_tenant'); if (stored) { _selectedDashboardTenant = stored; tenantId = stored; } } catch (e) {}
        }

        var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : null;
        if (!tenantId && jwtRole === 'super_admin') {
            // Auto-select first tenant instead of showing error
            container.innerHTML = '<p style="color:#888;">Caricamento tenant...</p>';
            fetchApi('/api/superadmin/tenants').then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    var activeTenants = (data && data.tenants || []).filter(function(t) { return t.status === 'active'; });
                    if (activeTenants.length === 0) {
                        container.innerHTML = '<p style="color:#888;">Nessun tenant trovato. Creane uno dalla pagina Gestione Tenant.</p>';
                        return;
                    }
                    _selectedDashboardTenant = activeTenants[0].tenant_id;
                    try { sessionStorage.setItem('ada_selected_tenant', _selectedDashboardTenant); } catch (e) {}
                    loadAdminCatalog(containerId);
                })
                .catch(function() {
                    container.innerHTML = '<p style="color:#888;">Errore caricamento tenant.</p>';
                });
            return;
        }
        if (!tenantId) {
            container.innerHTML = '<p style="color:#888;">Tenant non configurato.</p>';
            return;
        }

        container.innerHTML = '<p style="color:#888;">Caricamento catalogo...</p>';

        var hasClientFilters = _catalogPriorityFilter !== '' || _catalogServiceTypeFilter !== '' || _catalogImageFilter !== '' || _catalogExtDescFilter !== '' || _catalogCategoryFilter !== '' || _catalogSpeciesFilter !== '';
        var limit = hasClientFilters ? 9999 : 20;
        var page = hasClientFilters ? 1 : _catalogPage;
        var statusParam = _catalogStatusFilter ? '&status=' + _catalogStatusFilter : '';
        var searchParam = _catalogSearchTerm ? '&search=' + encodeURIComponent(_catalogSearchTerm) : '';
        var serviceTypeParam = _catalogServiceTypeFilter ? '&service_type=' + encodeURIComponent(_catalogServiceTypeFilter) : '';
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=' + page + '&limit=' + limit + statusParam + searchParam + serviceTypeParam)
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
        html.push('<input type="text" id="catalogSearchInput" placeholder="Cerca per nome..." value="' + _escapeHtml(_catalogSearchTerm || '') + '" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;width:200px;" onkeyup="if(event.key===\'Enter\')catalogSearch()">');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="catalogSearch()">Cerca</button>');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="catalogSearchReset()">Reset</button>');
        html.push('<button class="btn btn-success" style="font-size:12px;" onclick="bulkPublishDraft()">Pubblica tutti i draft</button>');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="previewPromoItem()" title="Anteprima sequenziale prodotti filtrati">👁️ Anteprima</button>');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="openImageManagement()" title="Gestione immagini prodotti filtrati">🖼️ Gestione Immagini</button>');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="validateAllCatalogUrls()">Verifica URL</button>');
        html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="bulkAiAnalysis()">&#129302; Bulk AI Analysis</button>');
        html.push('<span style="color:#888;font-size:12px;">' + _catalogTotal + ' prodotti</span>');
        html.push('</div>');

        // Advanced filters row
        html.push('<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">');
        html.push('<select onchange="filterCatalogServiceType(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Servizio: Tutti</option>');
        ['promo','nutrition','insurance'].forEach(function(st) {
            var stLabels = {promo:'Promo',nutrition:'Nutrizione',insurance:'Assicurazione'};
            html.push('<option value="' + st + '"' + (_catalogServiceTypeFilter === st ? ' selected' : '') + '>' + (stLabels[st]||st) + '</option>');
        });
        html.push('</select>');
        html.push('<select onchange="filterCatalogPriority(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Priorità: Tutte</option>');
        [0,1,2,3,4,5,6,7,8,9].forEach(function(p) {
            html.push('<option value="' + p + '"' + (_catalogPriorityFilter === String(p) ? ' selected' : '') + '>' + p + '</option>');
        });
        html.push('</select>');
        html.push('<select onchange="filterCatalogImage(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Immagine: Tutte</option>');
        html.push('<option value="with"' + (_catalogImageFilter === 'with' ? ' selected' : '') + '>Con immagine</option>');
        html.push('<option value="without"' + (_catalogImageFilter === 'without' ? ' selected' : '') + '>Senza immagine</option>');
        html.push('<option value="cached"' + (_catalogImageFilter === 'cached' ? ' selected' : '') + '>In cache</option>');
        html.push('<option value="online_only"' + (_catalogImageFilter === 'online_only' ? ' selected' : '') + '>Solo online</option>');
        html.push('</select>');
        html.push('<select onchange="filterCatalogExtDesc(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Ext. Desc: Tutte</option>');
        html.push('<option value="with"' + (_catalogExtDescFilter === 'with' ? ' selected' : '') + '>Con Extended</option>');
        html.push('<option value="without"' + (_catalogExtDescFilter === 'without' ? ' selected' : '') + '>Senza Extended</option>');
        html.push('</select>');
        html.push('<select onchange="filterCatalogCategory(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Categoria: Tutte</option>');
        ['food_general','food_clinical','supplement','antiparasitic','accessory','service'].forEach(function(c) {
            html.push('<option value="' + c + '"' + (_catalogCategoryFilter === c ? ' selected' : '') + '>' + _translateCategory(c) + '</option>');
        });
        html.push('</select>');
        html.push('<select onchange="filterCatalogSpecies(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value="">Specie: Tutte</option>');
        ['dog','cat','rabbit','ferret','bird','reptile','all'].forEach(function(s) {
            var label = s === 'all' ? 'Tutte' : (SPECIES_LABELS[s] || s);
            html.push('<option value="' + s + '"' + (_catalogSpeciesFilter === s ? ' selected' : '') + '>' + label + '</option>');
        });
        html.push('</select>');
        var _hasAdvancedFilter = _catalogPriorityFilter !== '' || _catalogServiceTypeFilter !== '' || _catalogImageFilter !== '' || _catalogExtDescFilter !== '' || _catalogCategoryFilter !== '' || _catalogSpeciesFilter !== '';
        if (_hasAdvancedFilter) {
            var _filteredCount = _getFilteredCatalogItems().length;
            html.push('<span style="color:#1d4ed8;font-size:12px;font-weight:600;">' + _filteredCount + '/' + _catalogItems.length + ' visibili</span>');
        }
        html.push('</div>');

        // Bulk service type actions
        html.push('<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;">');
        html.push('<span style="font-size:12px;font-weight:600;color:#0369a1;">Bulk Tipo Servizio:</span>');
        [{v:'promo',l:'Promo'},{v:'nutrition',l:'Nutrizione'},{v:'insurance',l:'Assicurazione'}].forEach(function(st) {
            html.push('<label style="display:flex;align-items:center;gap:3px;font-size:12px;"><input type="checkbox" class="bulkServiceType" value="' + st.v + '">' + st.l + '</label>');
        });
        html.push('<button class="btn btn-success" style="font-size:11px;padding:4px 10px;" onclick="bulkAddServiceType()">+ Aggiungi ai filtrati</button>');
        html.push('<button class="btn btn-danger" style="font-size:11px;padding:4px 10px;" onclick="bulkRemoveServiceType()">− Rimuovi dai filtrati</button>');
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
        html.push('<div><label style="font-size:12px;font-weight:600;">Tipo Servizio</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">');
        [{v:'promo',l:'Promo'},{v:'nutrition',l:'Nutrizione'},{v:'insurance',l:'Assicurazione'}].forEach(function(st) {
            html.push('<label style="display:flex;align-items:center;gap:3px;font-size:12px;"><input type="checkbox" class="newItemServiceType" value="' + st.v + '"' + (st.v === 'promo' ? ' checked' : '') + '>' + st.l + '</label>');
        });
        html.push('</div></div>');
        html.push('</div>');
        html.push('<div style="margin-top:10px;"><label style="font-size:12px;font-weight:600;">Descrizione Prodotto (per AI matching)</label>');
        html.push('<textarea id="newItemExtDesc" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;resize:vertical;"></textarea>');
        html.push('<small style="color:#888;">Max 2000 char. Usata dal motore AI per matching. Non visibile al cliente.</small></div>');
        html.push('<div style="margin-top:12px;"><button class="btn btn-success" onclick="createPromoItem()">Crea</button> <button class="btn btn-secondary" onclick="hideCreateItemForm()">Annulla</button></div>');
        html.push('</div>');

        // Items table (apply advanced filters)
        var _hasClientFilters = _catalogPriorityFilter !== '' || _catalogServiceTypeFilter !== '' || _catalogImageFilter !== '' || _catalogExtDescFilter !== '' || _catalogCategoryFilter !== '' || _catalogSpeciesFilter !== '';
        var allFilteredItems = _getFilteredCatalogItems();
        var displayItems = _hasClientFilters ? allFilteredItems.slice((_catalogPage - 1) * 20, _catalogPage * 20) : allFilteredItems;
        if (displayItems.length === 0) {
            html.push('<p style="color:#888;">Nessun prodotto trovato.</p>');
        } else {
            html.push('<table class="admin-table">');
            html.push('<tr><th>Nome</th><th>Categoria</th><th>Lifecycle</th><th>Stato</th><th>Pr.</th><th>Img</th><th>Ext.</th><th>Azioni</th></tr>');
            displayItems.forEach(function (item) {
                var statusColor = { draft: '#888', in_review: '#eab308', published: '#16a34a', retired: '#dc2626' }[item.status] || '#888';
                html.push('<tr>');
                var _stBadge = '';
                var _stColors = {nutrition:'#0d9488',insurance:'#7c3aed'};
                var _stLabels = {nutrition:'Nutrizione',insurance:'Assicurazione'};
                var _stArr = Array.isArray(item.service_type) ? item.service_type : [item.service_type || 'promo'];
                _stArr.forEach(function(st) {
                    if (st && st !== 'promo') {
                        _stBadge += ' <span style="display:inline-block;background:' + (_stColors[st]||'#888') + ';color:#fff;font-size:9px;padding:1px 6px;border-radius:8px;vertical-align:middle;">' + (_stLabels[st]||st) + '</span>';
                    }
                });
                html.push('<td>' + _escapeHtml(item.name) + _stBadge + ' <small style="color:#888;">(' + _escapeHtml(_translateSpecies(item.species)) + ')</small></td>');
                html.push('<td>' + _escapeHtml(_translateCategory(item.category)) + '</td>');
                html.push('<td>' + _escapeHtml(_translateLifecycle(item.lifecycle_target)) + '</td>');
                html.push('<td><span style="color:' + statusColor + ';font-weight:600;">' + _escapeHtml(item.status) + '</span></td>');
                html.push('<td>' + (item.priority || 0) + '</td>');
                var imgIcon = item.image_cached_at
                    ? '<span title="Immagine salvata nel DB" style="color:#059669;">🖼️</span>'
                    : (item.image_url
                        ? '<span title="Solo URL esterno" style="color:#f59e0b;">🔗</span>'
                        : '<span style="color:#ccc;" title="Nessuna immagine">—</span>');
                html.push('<td>' + imgIcon + '</td>');
                html.push('<td>' + (item.extended_description ? '✅' : '<span style="color:#dc2626;">❌</span>') + '</td>');
                html.push('<td style="white-space:nowrap;">');

                // Preview button
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin-right:4px;" onclick="previewPromoItem(\'' + _escapeHtml(item.promo_item_id) + '\')" title="Anteprima">👁️</button>');

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
            var totalPages = _hasClientFilters ? Math.ceil(allFilteredItems.length / 20) : Math.ceil(_catalogTotal / 20);
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

    function _getFilteredCatalogItems() {
        return _catalogItems.filter(function(item) {
            if (_catalogPriorityFilter !== '' && String(item.priority || 0) !== _catalogPriorityFilter) return false;
            if (_catalogServiceTypeFilter !== '') {
                var _stArr = Array.isArray(item.service_type) ? item.service_type : [item.service_type || 'promo'];
                if (_stArr.indexOf(_catalogServiceTypeFilter) === -1) return false;
            }
            var hasImage = !!(item.image_url || item.image_cached_at);
            if (_catalogImageFilter === 'with' && !hasImage) return false;
            if (_catalogImageFilter === 'without' && hasImage) return false;
            if (_catalogImageFilter === 'cached' && !item.image_cached_at) return false;
            if (_catalogImageFilter === 'online_only' && !(item.image_url && !item.image_cached_at)) return false;
            if (_catalogExtDescFilter === 'with' && !item.extended_description) return false;
            if (_catalogExtDescFilter === 'without' && item.extended_description) return false;
            if (_catalogCategoryFilter && item.category !== _catalogCategoryFilter) return false;
            if (_catalogSpeciesFilter && item.species !== _catalogSpeciesFilter) return false;
            return true;
        });
    }

    function _rerenderCatalog() {
        var container = document.getElementById('admin-catalog-content');
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (container && tenantId) _renderCatalogPage(container, tenantId);
    }
    function filterCatalogServiceType(val) { _catalogServiceTypeFilter = val; loadAdminCatalog(); }
    function filterCatalogPriority(val) { _catalogPriorityFilter = val; _catalogPage = 1; loadAdminCatalog(); }
    function filterCatalogImage(val) { _catalogImageFilter = val; _catalogPage = 1; loadAdminCatalog(); }
    function filterCatalogExtDesc(val) { _catalogExtDescFilter = val; _catalogPage = 1; loadAdminCatalog(); }
    function filterCatalogCategory(val) { _catalogCategoryFilter = val; _catalogPage = 1; loadAdminCatalog(); }
    function filterCatalogSpecies(val) { _catalogSpeciesFilter = val; _catalogPage = 1; loadAdminCatalog(); }

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
                extended_description: (document.getElementById('newItemExtDesc') || {}).value || null,
                product_url: (document.getElementById('newItemUrl') || {}).value || null,
                image_url: (document.getElementById('newItemImageUrl') || {}).value || null,
                priority: parseInt((document.getElementById('newItemPriority') || {}).value) || 0,
                service_type: (function() { var st = []; var stBoxes = document.querySelectorAll('.newItemServiceType:checked'); for (var sti = 0; sti < stBoxes.length; sti++) st.push(stBoxes[sti].value); return st.length ? st : ['promo']; })()
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

            html.push('<div style="margin-top:10px;"><label style="font-size:12px;font-weight:600;">Descrizione Prodotto (per AI matching)</label>');
            html.push('<textarea id="editItemExtDesc" rows="4" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;resize:vertical;">' + _escapeHtml(item.extended_description || '') + '</textarea>');
            html.push('<small style="color:#888;">Max 2000 char. Usata dal motore AI per matching. Non visibile al cliente.</small></div>');

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

            // Service type checkboxes
            var itemServiceType = Array.isArray(item.service_type) ? item.service_type : [item.service_type || 'promo'];
            var serviceTypeOptions = [{v:'promo',l:'Promo'},{v:'nutrition',l:'Nutrizione'},{v:'insurance',l:'Assicurazione'}];
            html.push('<div style="margin-top:8px;"><label style="font-size:12px;font-weight:600;">Tipo Servizio</label><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">');
            serviceTypeOptions.forEach(function (st) {
                var checked = itemServiceType.indexOf(st.v) !== -1 ? ' checked' : '';
                html.push('<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="editItemServiceType" value="' + st.v + '"' + checked + '>' + st.l + '</label>');
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

        var serviceType = [];
        var stCheckboxes = document.querySelectorAll('.editItemServiceType:checked');
        for (var k = 0; k < stCheckboxes.length; k++) serviceType.push(stCheckboxes[k].value);

        var patch = {
            name: (document.getElementById('editItemName') || {}).value || '',
            category: (document.getElementById('editItemCategory') || {}).value || '',
            description: (document.getElementById('editItemDescription') || {}).value || null,
            extended_description: (document.getElementById('editItemExtDesc') || {}).value || null,
            product_url: (document.getElementById('editItemUrl') || {}).value || null,
            image_url: (document.getElementById('editItemImageUrl') || {}).value || null,
            priority: parseInt((document.getElementById('editItemPriority') || {}).value) || 0,
            species: species,
            lifecycle_target: lifecycle,
            service_type: serviceType.length ? serviceType : ['promo']
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
        _renderPageTenantSelector('campaigns-tenant-selector');

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

    var POLICY_KEYS = [
        { key: 'max_impressions_per_week', label: 'Max impressioni/settimana', active: true, desc: 'ATTIVA \u2014 Limita il numero massimo di impressioni promozionali mostrate a ciascun proprietario per settimana. Valore: intero (es: 10). Se superato, il sistema promo non mostra pi\u00f9 card fino alla settimana successiva.' },
        { key: 'max_impressions_per_day', label: 'Max impressioni/giorno', active: true, desc: 'ATTIVA \u2014 Limita le impressioni promozionali giornaliere per proprietario. Valore: intero (es: 3). Funziona in combinazione con il limite settimanale.' },
        { key: 'debug_mode_enabled', label: 'Debug mode attivo', active: true, desc: 'ATTIVA \u2014 Abilita la pagina Debug nella navigazione per tutti gli utenti del tenant. Valore: true/false. Mostra strumenti di diagnostica, log, metriche API e test audio.' },
        { key: 'openai_optimizations', label: 'Ottimizzazioni OpenAI (JSON)', active: true, desc: 'ATTIVA \u2014 Configurazione JSON per le ottimizzazioni delle chiamate OpenAI (cache prompt, batching, modello). Valore: oggetto JSON (es: {"model":"gpt-4o-mini","cache":true}). Modifica il comportamento di trascrizione e generazione SOAP.' },
        { key: 'promo_cooldown_hours', label: 'Cooldown promo (ore)', active: true, desc: 'ATTIVA \u2014 Ore di attesa tra una impressione e l\'altra per lo stesso prodotto allo stesso utente. Valore: intero (es: 24). Previene la ripetizione eccessiva dello stesso suggerimento.' },
        { key: 'maintenance_mode', label: 'Modalit\u00e0 manutenzione', active: true, desc: 'ATTIVA \u2014 Quando abilitata (true), l\'app mostra un banner di manutenzione e disabilita le operazioni di scrittura. Valore: true/false.' },
    ];

    function onPolicyKeyChange() {
        var sel = document.getElementById('newPolicyKey');
        var custom = document.getElementById('newPolicyKeyCustom');
        var descEl = document.getElementById('policyKeyDescription');
        if (custom) custom.style.display = (sel && sel.value === '__custom__') ? '' : 'none';
        if (descEl) {
            var pk = POLICY_KEYS.find(function(p) { return p.key === (sel ? sel.value : ''); });
            if (pk && pk.desc) {
                descEl.textContent = pk.desc;
                descEl.style.display = '';
                if (!pk.active) {
                    descEl.style.background = '#fef9c3'; descEl.style.borderColor = '#fde047'; descEl.style.color = '#854d0e';
                } else {
                    descEl.style.background = '#f0fdf4'; descEl.style.borderColor = '#bbf7d0'; descEl.style.color = '#166534';
                }
            } else {
                descEl.style.display = 'none';
            }
        }
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
        html.push('<div><label style="font-size:12px;font-weight:600;">Chiave *</label>');
        html.push('<select id="newPolicyKey" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" onchange="onPolicyKeyChange()">');
        html.push('<option value="">-- Seleziona --</option>');
        POLICY_KEYS.forEach(function(pk) {
            html.push('<option value="' + pk.key + '">' + _escapeHtml(pk.label + ' (' + pk.key + ')') + '</option>');
        });
        html.push('<option value="__custom__">Altro (personalizzato)...</option>');
        html.push('</select>');
        html.push('<input type="text" id="newPolicyKeyCustom" style="display:none;width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:6px;" placeholder="Chiave personalizzata">');
        html.push('<div id="policyKeyDescription" style="display:none;margin-top:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;line-height:1.5;color:#166534;"></div>');
        html.push('</div>');
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
        var keyEl = document.getElementById('newPolicyKey');
        var key = (keyEl && keyEl.value === '__custom__')
            ? (document.getElementById('newPolicyKeyCustom') || {}).value || ''
            : (keyEl || {}).value || '';
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
            { name: 'Royal Canin Maxi Adult', category: 'food_general', species: 'dog', lifecycle_target: 'adult', description: 'Cibo secco per cani adulti taglia grande', extended_description: 'Alimento completo per cani adulti di taglia grande (26-44 kg). Formula con EPA e DHA per pelle e manto sani.', image_url: 'https://example.com/img/rc-maxi.jpg', product_url: 'https://www.royalcanin.com/it/dogs/products/retail-products/maxi-adult', tags_include: '', tags_exclude: '', priority: 0, service_type: ['promo'] },
            { name: "Hill's Prescription Diet k/d", category: 'food_clinical', species: 'cat', lifecycle_target: 'senior', description: 'Dieta clinica per gatti con insufficienza renale', extended_description: 'Alimento dietetico completo per gatti adulti. Supporto della funzione renale. Ridotto contenuto di fosforo e sodio.', image_url: 'https://example.com/img/hills-kd.jpg', product_url: 'https://www.hillspet.it/prodotti-gatto/pd-feline-kd-with-chicken-dry', tags_include: 'clinical:renal', tags_exclude: '', priority: 5, service_type: ['promo'] },
            { name: 'Frontline Tri-Act', category: 'antiparasitic', species: 'dog', lifecycle_target: 'puppy|adult|senior', description: 'Antiparassitario spot-on per cani', extended_description: 'Soluzione spot-on. Protezione completa contro pulci, zecche, zanzare, pappataci e mosche cavalline per 4 settimane.', image_url: 'https://example.com/img/frontline.jpg', product_url: 'https://www.frontlinecombo.it/prodotti/tri-act', tags_include: '', tags_exclude: '', priority: 3, service_type: ['promo'] }
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
    // Catalog: Search, Bulk Publish, URL Validation, Preview
    // =========================================================================

    function catalogSearch() {
        _catalogSearchTerm = (document.getElementById('catalogSearchInput') || {}).value || '';
        _catalogPage = 1;
        loadAdminCatalog();
    }

    function catalogSearchReset() {
        _catalogSearchTerm = '';
        _catalogStatusFilter = '';
        _catalogPriorityFilter = '';
        _catalogServiceTypeFilter = '';
        _catalogImageFilter = '';
        _catalogExtDescFilter = '';
        _catalogCategoryFilter = '';
        _catalogSpeciesFilter = '';
        var el = document.getElementById('catalogSearchInput');
        if (el) el.value = '';
        _catalogPage = 1;
        loadAdminCatalog();
    }

    function bulkPublishDraft() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        if (!confirm('Pubblicare TUTTI i prodotti in stato "draft"? Verranno resi visibili ai clienti.')) return;
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/bulk-publish', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_status: 'published' })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            if (typeof showToast === 'function') showToast('' + (data.updated || 0) + ' prodotti pubblicati!', 'success');
            loadAdminCatalog();
        }).catch(function (e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        });
    }

    function bulkAddServiceType() {
        _bulkServiceTypeAction('add');
    }

    function bulkRemoveServiceType() {
        _bulkServiceTypeAction('remove');
    }

    function _bulkServiceTypeAction(action) {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;

        var selected = [];
        var boxes = document.querySelectorAll('.bulkServiceType:checked');
        for (var i = 0; i < boxes.length; i++) selected.push(boxes[i].value);
        if (!selected.length) {
            if (typeof showToast === 'function') showToast('Seleziona almeno un tipo servizio.', 'error');
            return;
        }

        var filtered = _getFilteredCatalogItems();
        if (!filtered.length) {
            if (typeof showToast === 'function') showToast('Nessun prodotto filtrato.', 'error');
            return;
        }

        var actionLabel = action === 'add' ? 'AGGIUNGERE' : 'RIMUOVERE';
        if (!confirm(actionLabel + ' servizio [' + selected.join(', ') + '] a ' + filtered.length + ' prodotti filtrati?')) return;

        var itemIds = filtered.map(function(item) { return item.promo_item_id; });
        var payload = { item_ids: itemIds, add: [], remove: [] };
        if (action === 'add') payload.add = selected;
        else payload.remove = selected;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/bulk/service-type', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            if (typeof showToast === 'function') showToast((data.updated || 0) + ' prodotti aggiornati.', 'success');
            loadAdminCatalog();
        }).catch(function(e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        });
    }

    function validateItemUrls(itemId) {
        var item = _catalogItems.find(function (i) { return i.promo_item_id === itemId; });
        if (!item) return;
        var resultEl = document.getElementById('url-validation-result');
        if (resultEl) resultEl.innerHTML = '<span style="color:#888;">Verifica in corso...</span>';
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/validate-urls', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ promo_item_id: itemId, name: item.name, image_url: item.image_url, product_url: item.product_url }] })
        }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.results || !data.results[0]) {
                if (resultEl) resultEl.innerHTML = '<span style="color:#dc2626;">Errore verifica</span>';
                return;
            }
            var r = data.results[0];
            if (resultEl) resultEl.innerHTML = 'Immagine: ' + _urlStatusIcon(r.image_url_status) + ' &nbsp;|&nbsp; Prodotto: ' + _urlStatusIcon(r.product_url_status);
        }).catch(function () {
            if (resultEl) resultEl.innerHTML = '<span style="color:#dc2626;">Errore di rete</span>';
        });
    }

    function _urlStatusIcon(status) {
        if (status === 'ok') return '<span style="color:#16a34a;">OK</span>';
        if (status === 'missing') return '<span style="color:#888;">Non configurato</span>';
        return '<span style="color:#dc2626;">' + _escapeHtml(status) + '</span>';
    }

    // =========================================================================
    // IMAGE MANAGEMENT WIZARD
    // =========================================================================
    var _scrapeResults = [];
    var _scrapeResultsTenantId = '';

    function openImageManagement() {
        _showModal('Gestione Immagini', function(container) {
            var h = [];
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">');

            // Card 1: Cache images from URL
            h.push('<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#f8fafc;">');
            h.push('<h4 style="margin:0 0 8px;font-size:15px;">Cache Immagini da URL</h4>');
            h.push('<p style="font-size:12px;color:#666;margin:0 0 12px;">Scarica e salva nel DB le immagini dai URL esterni dei prodotti filtrati.</p>');
            h.push('<button class="btn btn-primary" style="width:100%;font-size:13px;" onclick="batchCacheImagesFiltered()">Avvia Cache</button>');
            h.push('</div>');

            // Card 2: Scrape images from websites
            h.push('<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#f8fafc;">');
            h.push('<h4 style="margin:0 0 8px;font-size:15px;">Cerca Immagini dai Siti Web</h4>');
            h.push('<p style="font-size:12px;color:#666;margin:0 0 12px;">Analizza i siti web dei prodotti filtrati per trovare immagini migliori.</p>');
            h.push('<button class="btn btn-success" style="width:100%;font-size:13px;" onclick="batchScrapeImagesFiltered()">Avvia Ricerca</button>');
            h.push('</div>');

            h.push('</div>');
            h.push('<div id="image-mgmt-progress" style="margin-top:16px;"></div>');
            container.innerHTML = h.join('');
        });
    }

    function batchCacheImagesFiltered() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        var items = _getFilteredCatalogItems();
        if (items.length === 0) {
            if (typeof showToast === 'function') showToast('Nessun prodotto filtrato.', 'error');
            return;
        }
        var itemIds = items.map(function(it) { return it.promo_item_id; });
        var progressEl = document.getElementById('image-mgmt-progress');
        if (progressEl) progressEl.innerHTML = '<div style="text-align:center;padding:16px;"><div style="font-size:14px;color:#1d4ed8;font-weight:600;">Cache in corso...</div><div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;"><div id="cache-progress-bar" style="width:0%;height:100%;background:#3b82f6;transition:width 0.3s;"></div></div><div id="cache-progress-text" style="font-size:12px;color:#888;margin-top:4px;">Invio richiesta...</div></div>';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/cache-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_ids: itemIds, force: false })
        }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data) {
                if (progressEl) progressEl.innerHTML = '<div style="color:#dc2626;padding:8px;">Errore durante il caching.</div>';
                return;
            }
            var bar = document.getElementById('cache-progress-bar');
            if (bar) bar.style.width = '100%';
            var cached = data.cached || 0;
            var errors = data.errors || 0;
            var total = data.total || 0;
            var h = '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#f0fdf4;">';
            h += '<h4 style="margin:0 0 8px;color:#059669;">Cache completata!</h4>';
            h += '<div style="font-size:13px;"><strong>' + cached + '</strong> salvate, <strong>' + errors + '</strong> errori, <strong>' + total + '</strong> totale</div>';
            if (data.results && data.results.length > 0) {
                h += '<div style="max-height:200px;overflow-y:auto;margin-top:8px;font-size:11px;">';
                data.results.forEach(function(r) {
                    var color = r.status === 'cached' ? '#059669' : (r.status === 'unchanged' ? '#888' : '#dc2626');
                    h += '<div style="color:' + color + ';">' + _escapeHtml(r.id) + ': ' + r.status + (r.error ? ' (' + _escapeHtml(r.error) + ')' : '') + '</div>';
                });
                h += '</div>';
            }
            h += '</div>';
            if (progressEl) progressEl.innerHTML = h;
            loadAdminCatalog();
        }).catch(function(e) {
            if (progressEl) progressEl.innerHTML = '<div style="color:#dc2626;padding:8px;">Errore: ' + _escapeHtml(e.message) + '</div>';
        });
    }

    function batchScrapeImagesFiltered() {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        var items = _getFilteredCatalogItems();
        if (items.length === 0) {
            if (typeof showToast === 'function') showToast('Nessun prodotto filtrato.', 'error');
            return;
        }
        var itemIds = items.map(function(it) { return it.promo_item_id; });
        if (itemIds.length > 500) {
            if (typeof showToast === 'function') showToast('Troppi prodotti (max 500). Filtra meglio.', 'error');
            return;
        }
        var progressEl = document.getElementById('image-mgmt-progress');
        if (progressEl) progressEl.innerHTML = '<div style="text-align:center;padding:16px;"><div style="font-size:14px;color:#1d4ed8;font-weight:600;">Ricerca immagini in corso...</div><div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;"><div id="scrape-progress-bar" style="width:10%;height:100%;background:#22c55e;transition:width 0.3s;"></div></div><div id="scrape-progress-text" style="font-size:12px;color:#888;margin-top:4px;">Analisi di ' + itemIds.length + ' prodotti...</div></div>';

        _scrapeResultsTenantId = tenantId;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/scrape-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_ids: itemIds })
        }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data) {
                if (progressEl) progressEl.innerHTML = '<div style="color:#dc2626;padding:8px;">Errore durante lo scraping.</div>';
                return;
            }
            var bar = document.getElementById('scrape-progress-bar');
            if (bar) bar.style.width = '100%';

            _scrapeResults = (data.results || []).filter(function(r) { return r.status === 'found'; });
            var noUrl = (data.results || []).filter(function(r) { return r.status === 'no_product_url'; }).length;
            var noImg = (data.results || []).filter(function(r) { return r.status === 'no_image_found'; }).length;
            var errors = (data.results || []).filter(function(r) { return r.status === 'fetch_error'; }).length;

            if (_scrapeResults.length === 0) {
                if (progressEl) progressEl.innerHTML = '<div style="padding:16px;border:1px solid #e2e8f0;border-radius:10px;"><h4 style="margin:0 0 8px;color:#888;">Nessuna nuova immagine trovata</h4><div style="font-size:12px;color:#888;">' + noUrl + ' senza URL prodotto, ' + noImg + ' senza immagine trovata, ' + errors + ' errori</div></div>';
                return;
            }

            _openScrapeWizard(0, { accepted: 0, skipped: 0 });
        }).catch(function(e) {
            if (progressEl) progressEl.innerHTML = '<div style="color:#dc2626;padding:8px;">Errore: ' + _escapeHtml(e.message) + '</div>';
        });
    }

    function _openScrapeWizard(index, stats) {
        if (index >= _scrapeResults.length) {
            _showScrapeWizardSummary(stats);
            return;
        }
        var item = _scrapeResults[index];
        _showModal('Confronto Immagini (' + (index + 1) + '/' + _scrapeResults.length + ')', function(container) {
            var h = [];
            // Progress bar
            var pct = Math.round(((index) / _scrapeResults.length) * 100);
            h.push('<div style="background:#e2e8f0;border-radius:6px;height:6px;overflow:hidden;margin-bottom:12px;">');
            h.push('<div style="width:' + pct + '%;height:100%;background:#3b82f6;transition:width 0.3s;"></div>');
            h.push('</div>');

            h.push('<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' + _escapeHtml(item.name) + '</div>');
            h.push('<div style="font-size:11px;color:#888;margin-bottom:12px;">ID: ' + _escapeHtml(item.id) + '</div>');

            // Side by side comparison
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">');

            // Old image
            h.push('<div style="text-align:center;">');
            h.push('<div style="font-size:11px;color:#888;margin-bottom:4px;font-weight:600;">Immagine attuale</div>');
            if (item.current_image_url || item.has_cached) {
                var oldSrc = item.has_cached
                    ? ((typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '') + '/api/promo-items/' + item.id + '/image')
                    : item.current_image_url;
                h.push('<img src="' + _escapeHtml(oldSrc) + '" style="max-height:180px;max-width:100%;border-radius:8px;border:2px solid #e2e8f0;object-fit:contain;" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"><div style="display:none;color:#ccc;font-size:12px;">Errore caricamento</div>');
            } else {
                h.push('<div style="height:180px;display:flex;align-items:center;justify-content:center;background:#f5f5f5;border-radius:8px;border:2px dashed #ddd;color:#ccc;font-size:12px;">Nessuna immagine</div>');
            }
            h.push('</div>');

            // New (scraped) image
            h.push('<div style="text-align:center;">');
            h.push('<div style="font-size:11px;color:#059669;margin-bottom:4px;font-weight:600;">Nuova immagine trovata</div>');
            h.push('<img id="scraped-preview-img" src="' + _escapeHtml(item.scraped_image_url) + '" style="max-height:180px;max-width:100%;border-radius:8px;border:2px solid #059669;object-fit:contain;" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"><div style="display:none;color:#dc2626;font-size:12px;">Errore caricamento</div>');
            h.push('</div>');

            h.push('</div>');

            // URL display
            h.push('<div style="font-size:11px;color:#888;word-break:break-all;margin-bottom:8px;">URL: ' + _escapeHtml(item.scraped_image_url || '') + '</div>');

            // Manual URL input
            h.push('<div style="margin-bottom:16px;">');
            h.push('<div style="font-size:11px;color:#888;margin-bottom:4px;">Oppure inserisci un URL manuale:</div>');
            h.push('<div style="display:flex;gap:4px;">');
            h.push('<input id="manual-image-url" type="text" placeholder="https://..." style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;" value="' + _escapeHtml(item.scraped_image_url || '') + '">');
            h.push('<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="scrapeWizardPreviewManual()">Anteprima</button>');
            h.push('</div>');
            h.push('</div>');

            // Action buttons
            h.push('<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">');
            h.push('<button class="btn btn-success" style="font-size:13px;padding:8px 16px;" onclick="scrapeWizardAccept(' + index + ')">Usa questa immagine</button>');
            h.push('<button class="btn btn-secondary" style="font-size:13px;padding:8px 16px;" onclick="scrapeWizardSkip(' + index + ')">Mantieni la vecchia</button>');
            h.push('<button class="btn btn-danger" style="font-size:12px;padding:6px 12px;" onclick="scrapeWizardSkipAll(' + index + ')">Salta tutti &rarr;</button>');
            h.push('</div>');

            // Stats so far
            h.push('<div style="margin-top:12px;text-align:center;font-size:11px;color:#888;">Accettate: ' + stats.accepted + ' | Saltate: ' + stats.skipped + ' | Rimanenti: ' + (_scrapeResults.length - index) + '</div>');

            container.innerHTML = h.join('');
        });

        // Store current state in data attributes for the action functions
        var overlay = document.getElementById('admin-modal-overlay');
        if (overlay) {
            overlay.dataset.wizardIndex = index;
            overlay.dataset.wizardAccepted = stats.accepted;
            overlay.dataset.wizardSkipped = stats.skipped;
        }
    }

    function scrapeWizardPreviewManual() {
        var input = document.getElementById('manual-image-url');
        var img = document.getElementById('scraped-preview-img');
        if (input && img) {
            img.src = input.value;
            img.style.display = '';
            if (img.nextSibling) img.nextSibling.style.display = 'none';
        }
    }

    function _getScrapeWizardState() {
        var overlay = document.getElementById('admin-modal-overlay');
        if (!overlay) return null;
        return {
            index: parseInt(overlay.dataset.wizardIndex || '0', 10),
            accepted: parseInt(overlay.dataset.wizardAccepted || '0', 10),
            skipped: parseInt(overlay.dataset.wizardSkipped || '0', 10)
        };
    }

    function scrapeWizardAccept(index) {
        var state = _getScrapeWizardState();
        if (!state) return;
        var item = _scrapeResults[index];
        if (!item) return;
        var url = (document.getElementById('manual-image-url') || {}).value || item.scraped_image_url;
        if (!url) {
            if (typeof showToast === 'function') showToast('Nessun URL immagine', 'error');
            return;
        }

        // Disable buttons during save
        var btns = document.querySelectorAll('#admin-modal-overlay button');
        btns.forEach(function(b) { b.disabled = true; });

        fetchApi('/api/admin/' + encodeURIComponent(_scrapeResultsTenantId) + '/promo-items/' + encodeURIComponent(item.id) + '/cache-from-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, update_image_url: true })
        }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (data && data.status === 'ok') {
                if (typeof showToast === 'function') showToast('Immagine salvata per ' + item.name, 'success');
                _openScrapeWizard(index + 1, { accepted: state.accepted + 1, skipped: state.skipped });
            } else {
                if (typeof showToast === 'function') showToast('Errore salvataggio immagine', 'error');
                btns.forEach(function(b) { b.disabled = false; });
            }
        }).catch(function(e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
            btns.forEach(function(b) { b.disabled = false; });
        });
    }

    function scrapeWizardSkip(index) {
        var state = _getScrapeWizardState();
        if (!state) return;
        _openScrapeWizard(index + 1, { accepted: state.accepted, skipped: state.skipped + 1 });
    }

    function scrapeWizardSkipAll(index) {
        var state = _getScrapeWizardState();
        if (!state) return;
        var remaining = _scrapeResults.length - index;
        _showScrapeWizardSummary({ accepted: state.accepted, skipped: state.skipped + remaining });
    }

    function _showScrapeWizardSummary(stats) {
        _showModal('Ricerca Immagini Completata', function(container) {
            var h = [];
            h.push('<div style="text-align:center;padding:16px;">');
            h.push('<div style="font-size:48px;margin-bottom:12px;">&#10004;</div>');
            h.push('<h3 style="margin:0 0 16px;color:#059669;">Operazione completata</h3>');
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;max-width:360px;margin:0 auto 16px;">');
            h.push('<div style="background:#f0fdf4;border-radius:8px;padding:12px;"><div style="font-size:24px;font-weight:700;color:#059669;">' + stats.accepted + '</div><div style="font-size:11px;color:#888;">Accettate</div></div>');
            h.push('<div style="background:#fef3c7;border-radius:8px;padding:12px;"><div style="font-size:24px;font-weight:700;color:#f59e0b;">' + stats.skipped + '</div><div style="font-size:11px;color:#888;">Saltate</div></div>');
            h.push('<div style="background:#f0f9ff;border-radius:8px;padding:12px;"><div style="font-size:24px;font-weight:700;color:#3b82f6;">' + _scrapeResults.length + '</div><div style="font-size:11px;color:#888;">Totale</div></div>');
            h.push('</div>');
            h.push('<button class="btn btn-primary" style="padding:10px 24px;" onclick="_closeModal();loadAdminCatalog();">Chiudi</button>');
            h.push('</div>');
            container.innerHTML = h.join('');
        });
    }

    function validateAllCatalogUrls() {
        var tenantId = _getAdminTenantId();
        if (!tenantId || _catalogItems.length === 0) return;
        var btns = document.querySelectorAll('button');
        var verifyBtn = null;
        btns.forEach(function(b) { if (b.textContent.includes('Verifica URL')) verifyBtn = b; });
        if (verifyBtn) verifyBtn.classList.add('btn--loading');
        if (typeof showToast === 'function') showToast('Verifica URL in corso per ' + _catalogItems.length + ' prodotti...', 'info');
        var batch = _catalogItems.map(function (i) {
            return { promo_item_id: i.promo_item_id, name: i.name, image_url: i.image_url, product_url: i.product_url };
        });
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/validate-urls', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batch })
        }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (verifyBtn) verifyBtn.classList.remove('btn--loading');
            if (!data || !data.results) {
                if (typeof showToast === 'function') showToast('Errore nella verifica.', 'error');
                return;
            }
            var broken = data.results.filter(function (r) {
                return (r.image_url_status !== 'ok' && r.image_url_status !== 'missing') ||
                       (r.product_url_status !== 'ok' && r.product_url_status !== 'missing');
            });
            if (broken.length === 0) {
                if (typeof showToast === 'function') showToast('Tutti gli URL sono validi!', 'success');
            } else {
                _showUrlValidationReport(data.results);
            }
        }).catch(function () {
            if (verifyBtn) verifyBtn.classList.remove('btn--loading');
            if (typeof showToast === 'function') showToast('Errore di rete.', 'error');
        });
    }

    function _showUrlValidationReport(results) {
        var broken = results.filter(function (r) {
            return (r.image_url_status !== 'ok' && r.image_url_status !== 'missing') ||
                   (r.product_url_status !== 'ok' && r.product_url_status !== 'missing');
        });
        _showModal('Report Validazione URL \u2014 ' + broken.length + ' problemi su ' + results.length + ' prodotti', function (container) {
            var html = [];
            html.push('<table class="admin-table">');
            html.push('<tr><th>Prodotto</th><th>Stato</th><th>Immagine</th><th>URL Prodotto</th><th>Azione</th></tr>');
            broken.forEach(function (r) {
                var item = _catalogItems.find(function(i) { return i.promo_item_id === r.promo_item_id; });
                html.push('<tr id="url-row-' + _escapeHtml(r.promo_item_id) + '">');
                html.push('<td>' + _escapeHtml(r.name || r.promo_item_id) + '</td>');
                html.push('<td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#f1f5f9;">' + _escapeHtml(item ? item.status : '?') + '</span></td>');
                html.push('<td>' + _urlStatusIcon(r.image_url_status) + '</td>');
                html.push('<td>' + _urlStatusIcon(r.product_url_status) + '</td>');
                html.push('<td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="setItemStatusFromReport(\'' + _escapeHtml(r.promo_item_id) + '\', this)">\u2192 Draft</button></td>');
                html.push('</tr>');
            });
            html.push('</table>');
            html.push('<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">');
            html.push('<span style="flex:1;"></span>');
            html.push('<button class="btn btn-secondary" onclick="_closeModal()">Chiudi</button>');
            html.push('</div>');
            container.innerHTML = html.join('');
        });
    }

    function setItemStatusFromReport(itemId, btnEl) {
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId) + '/transition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'draft' })
        }).then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'HTTP ' + r.status); });
            return r.json();
        }).then(function() {
            if (btnEl) {
                btnEl.textContent = '\u2713 Draft';
                btnEl.style.background = '#16a34a';
                btnEl.style.color = '#fff';
                btnEl.style.borderColor = '#16a34a';
            }
            showToast('Prodotto spostato a draft', 'success');
            loadAdminCatalog();
        }).catch(function(err) {
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = '\u2192 Draft'; }
            showToast('Errore: ' + err.message, 'error');
        });
    }


    // =========================================================================
    // Preview Card Prodotto
    // =========================================================================

    var _previewIndex = 0;
    var _previewTotalBeforeCap = 0;

    async function previewPromoItem(itemId) {
        var originalItems = _catalogItems;

        // Load all items if paginated (§11)
        if (_catalogItems.length < _catalogTotal) {
            try {
                var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
                if (tenantId) {
                    var statusParam = _catalogStatusFilter ? '&status=' + _catalogStatusFilter : '';
                    var searchParam = _catalogSearchTerm ? '&search=' + encodeURIComponent(_catalogSearchTerm) : '';
                    var resp = await fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items?page=1&limit=9999' + statusParam + searchParam);
                    if (resp && resp.ok) {
                        var data = await resp.json();
                        _catalogItems = data.items || [];
                    }
                }
            } catch (e) { console.error('Preview load all error:', e); }
        }

        _filteredPreviewItems = _getFilteredCatalogItems();
        _previewTotalBeforeCap = _filteredPreviewItems.length;
        if (_filteredPreviewItems.length > 1000) _filteredPreviewItems = _filteredPreviewItems.slice(0, 1000);

        // Restore original items for table paging
        _catalogItems = originalItems;

        if (itemId) {
            var idx = _filteredPreviewItems.findIndex(function (i) { return i.promo_item_id === itemId; });
            if (idx >= 0) _previewIndex = idx;
        } else {
            _previewIndex = 0;
        }
        _renderPreviewModal();
    }

    function _renderPreviewModal() {
        var item = _filteredPreviewItems[_previewIndex];
        if (!item) return;

        _showModal('Anteprima Prodotto — come appare al cliente', function (container) {
            var html = [];

            // Navigation
            html.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">');
            html.push('<button class="btn btn-secondary" onclick="_previewNav(-1)" style="padding:6px 14px;">Precedente</button>');
            var _countLabel = (typeof _previewTotalBeforeCap !== 'undefined' && _previewTotalBeforeCap > _filteredPreviewItems.length)
                ? _filteredPreviewItems.length + ' (primi 1000 di ' + _previewTotalBeforeCap + ')'
                : '' + _filteredPreviewItems.length;
            html.push('<span style="font-size:12px;color:#888;">Prodotto ' + (_previewIndex + 1) + ' di ' + _countLabel + '</span>');
            html.push('<button class="btn btn-secondary" onclick="_previewNav(1)" style="padding:6px 14px;">Successivo</button>');
            html.push('</div>');

            // CARD PREVIEW
            html.push('<div style="max-width:400px;margin:0 auto;">');
            html.push('<div class="promo-card" style="opacity:1;display:block;">');
            html.push('<span class="promo-badge">Consigliato per il tuo amico pet</span>');

            if (item.image_url) {
                html.push('<img src="' + _escapeHtml(item.image_url) + '" alt="' + _escapeHtml(item.name) + '" style="width:100%;max-height:250px;object-fit:contain;border-radius:8px;margin:8px 0;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">');
                html.push('<div style="display:none;padding:20px;background:#fee2e2;border-radius:8px;margin:8px 0;text-align:center;color:#dc2626;font-size:12px;">Immagine non caricabile</div>');
            } else {
                html.push('<div style="padding:20px;background:#f1f5f9;border-radius:8px;margin:8px 0;text-align:center;color:#888;font-size:12px;">Nessuna immagine configurata</div>');
            }

            html.push('<div class="promo-name">' + _escapeHtml(item.name) + '</div>');
            if (item.description) html.push('<div style="font-size:13px;color:#555;margin:4px 0 8px;">' + _escapeHtml(item.description) + '</div>');
            html.push('<div class="promo-explanation" style="font-style:italic;color:#888;">[Spiegazione AI personalizzata — generata in base al profilo del paziente]</div>');

            html.push('<div class="promo-actions" style="display:flex;justify-content:space-between;gap:12px;margin-top:12px;">');
            if (item.product_url) html.push('<button type="button" class="promo-btn promo-btn--cta" style="flex:1;text-align:center;padding:10px 16px;" onclick="showPurchasePlaceholder(\'' + _escapeHtml(item.promo_item_id) + '\')">Acquista</button>');
            html.push('<button type="button" class="promo-btn promo-btn--info" style="flex:1;text-align:center;padding:10px 16px;" onclick="_closeModal()">Chiudi il suggerimento</button>');
            html.push('<button type="button" class="promo-btn promo-btn--dismiss" style="flex:1;text-align:center;padding:10px 16px;" onclick="showDismissPlaceholder()">Non mi interessa</button>');
            html.push('</div>');

            // AI explanation — between card content and technical details
            html.push('<div id="ai-explanation-preview" style="margin-top:8px;"></div>');

            html.push('</div></div>');

            // TECHNICAL DETAILS
            html.push('<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">');
            html.push('<h4 style="margin:0 0 8px;color:#1e3a5f;font-size:14px;">Dettagli tecnici</h4>');
            html.push('<table style="width:100%;font-size:12px;">');
            html.push('<tr><td style="font-weight:600;width:140px;padding:4px 0;">Categoria:</td><td>' + _escapeHtml(_translateCategory(item.category)) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Specie:</td><td>' + _escapeHtml(_translateSpecies(item.species)) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Lifecycle:</td><td>' + _escapeHtml(_translateLifecycle(item.lifecycle_target)) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Priorità:</td><td>' + (item.priority || 0) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Stato:</td><td>' + _escapeHtml(item.status) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Tags include:</td><td style="word-break:break-all;">' + _escapeHtml(Array.isArray(item.tags_include) ? item.tags_include.join(', ') : (item.tags_include || '-')) + '</td></tr>');
            html.push('<tr><td style="font-weight:600;padding:4px 0;">Tags exclude:</td><td style="word-break:break-all;">' + _escapeHtml(Array.isArray(item.tags_exclude) ? item.tags_exclude.join(', ') : (item.tags_exclude || '-')) + '</td></tr>');
            html.push('</table>');

            if (item.extended_description) {
                html.push('<details style="margin-top:12px;"><summary style="font-weight:600;font-size:12px;cursor:pointer;color:#1e3a5f;">Descrizione Prodotto (per AI matching) — ' + item.extended_description.length + ' char</summary>');
                html.push('<div style="margin-top:8px;font-size:12px;color:#555;line-height:1.6;white-space:pre-wrap;">' + _escapeHtml(item.extended_description) + '</div></details>');
            } else {
                html.push('<div style="margin-top:8px;font-size:12px;color:#dc2626;">Extended description mancante — il motore AI genererà spiegazioni meno precise</div>');
            }
            html.push('</div>');

            // ACTIONS — Verifica URL + Chiudi on same row
            html.push('<div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">');
            html.push('<button class="btn btn-secondary" style="font-size:12px;" onclick="validateItemUrls(\'' + _escapeHtml(item.promo_item_id) + '\')">Verifica URL</button>');
            html.push('<span id="url-validation-result" style="font-size:12px;"></span>');
            html.push('<span style="flex:1;"></span>');
            html.push('<button class="btn btn-secondary" onclick="_closeModal()">Chiudi</button>');
            html.push('</div>');
            container.innerHTML = html.join('');
        });
    }

    function _previewNav(delta) {
        _previewIndex += delta;
        if (_previewIndex < 0) _previewIndex = _filteredPreviewItems.length - 1;
        if (_previewIndex >= _filteredPreviewItems.length) _previewIndex = 0;
        _renderPreviewModal();
    }

    function showPurchasePlaceholder(itemId) {
        var item = _catalogItems.find(function(i) { return i.promo_item_id === itemId; }) || {};
        _showModal('Acquisto Prodotto', function(container) {
            var h = [];
            h.push('<div style="max-width:480px;margin:0 auto;">');
            // Simulated banner
            h.push('<div style="background:#fef3c7;color:#92400e;font-size:12px;text-align:center;padding:6px 12px;border-radius:6px;margin-bottom:16px;">Pagina simulata — nessun acquisto reale verrà effettuato</div>');
            // Product image
            if (item.image_url) {
                h.push('<div style="text-align:center;margin-bottom:16px;"><img src="' + _escapeHtml(item.image_url) + '" style="max-width:100%;max-height:280px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);object-fit:contain;" onerror="this.style.display=\'none\'"></div>');
            }
            // Product name
            h.push('<h3 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1e293b;text-align:center;">' + _escapeHtml(item.name || '') + '</h3>');
            // Description card
            if (item.description) {
                h.push('<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:16px;font-size:14px;color:#475569;line-height:1.5;">' + _escapeHtml(item.description) + '</div>');
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
            h.push('<button class="btn btn-secondary" style="width:100%;margin-top:8px;padding:10px;border-radius:10px;" onclick="previewPromoItem(\'' + _escapeHtml(item.promo_item_id) + '\')">← Torna all\'anteprima</button>');
            h.push('</div>');
            container.innerHTML = h.join('');
        });
    }

    function showWhyYouSeeThis(itemId) {
        var container = document.getElementById('ai-explanation-preview');
        if (!container) return;
        container.innerHTML = '<div style="padding:12px;background:#fef3c7;border-radius:8px;border:1px solid #f59e0b;margin-bottom:8px;">' +
            '<strong>Spiegazione solo per test</strong> — generata con un pet di prova, non riflette un utente reale.</div>';
        if (typeof previewExplanation === 'function') previewExplanation(itemId);
    }

    function showDismissPlaceholder() {
        _showModal('Feedback ricevuto', function(container) {
            container.innerHTML = '<div style="text-align:center;padding:30px;">' +
                '<h3>Grazie per il tuo feedback!</h3>' +
                '<p style="font-size:16px;color:#555;margin:16px 0;">' +
                'Abbiamo preso nota della tua preferenza.<br>Non ti mostreremo più questo prodotto.</p>' +
                '<p style="font-size:13px;color:#888;">Continuiamo a migliorare i suggerimenti per te e il tuo pet.</p>' +
                '<button class="btn btn-primary" style="margin-top:20px;" onclick="_closeModal()">Chiudi</button></div>';
        });
    }

    function previewExplanation(itemId) {
        var container = document.getElementById('ai-explanation-preview');
        if (!container) return;
        var tenantId = _getAdminTenantId();
        if (!tenantId) return;
        container.innerHTML = '<div style="padding:12px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;"><span style="color:#888;font-size:12px;">Generazione spiegazione in corso (pet di test: Luna, meticcio, 4 anni, 15 kg)...</span></div>';
        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/preview-explanation', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promo_item_id: itemId })
        }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.explanation) {
                container.innerHTML = '<div style="padding:12px;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;font-size:12px;color:#dc2626;">Errore nella generazione. Verificare che la chiave OpenAI sia configurata.</div>';
                return;
            }
            var expl = data.explanation;
            var html = [];
            html.push('<div style="padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">');
            html.push('<div style="font-size:11px;color:#888;margin-bottom:6px;">Spiegazione generata (fonte: ' + _escapeHtml(data.source || '?') + ', ' + (data.latencyMs || '?') + 'ms) — Pet: ' + _escapeHtml(data.test_pet ? data.test_pet.name : 'Luna') + '</div>');
            if (typeof expl === 'string') {
                html.push('<div style="font-size:13px;">' + _escapeHtml(expl) + '</div>');
            } else {
                if (expl.why_you_see_this) html.push('<div style="font-size:13px;margin-bottom:4px;"><b>Perché lo vedi:</b> ' + _escapeHtml(expl.why_you_see_this) + '</div>');
                if (expl.benefit_for_pet) html.push('<div style="font-size:13px;margin-bottom:4px;"><b>Beneficio:</b> ' + _escapeHtml(expl.benefit_for_pet) + '</div>');
                if (expl.clinical_fit) html.push('<div style="font-size:13px;margin-bottom:4px;"><b>Correlazione clinica:</b> ' + _escapeHtml(expl.clinical_fit) + '</div>');
                if (expl.disclaimer) html.push('<div style="font-size:11px;color:#888;margin-top:4px;font-style:italic;">' + _escapeHtml(expl.disclaimer) + '</div>');
            }
            html.push('</div>');
            container.innerHTML = html.join('');
        }).catch(function () {
            container.innerHTML = '<div style="padding:12px;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;font-size:12px;color:#dc2626;">Errore di rete.</div>';
        });
    }

    // =========================================================================
    // Tips Sources Management (super_admin)
    // =========================================================================

    var _sourcesData = [];
    var _sourcesFilter = ''; // '', 'active', 'inactive'
    var _sourcesSearch = '';

    function loadSuperadminSources(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '<p>Caricamento fonti...</p>';

        fetchApi('/api/tips-sources?limit=100').then(function(resp) {
            if (resp.status === 403) {
                container.innerHTML = '<p style="color:#dc2626;">Accesso negato \u2014 questa sezione richiede il ruolo super_admin.</p>';
                return null;
            }
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(data) {
            if (!data) return;
            _sourcesData = data.sources || [];
            _renderSourcesPage(container);
        }).catch(function(err) {
            container.innerHTML = '<p style="color:#dc2626;">Errore caricamento fonti: ' + _escapeHtml(err.message) + '</p>' +
                '<p style="font-size:12px;color:#888;margin-top:8px;">Possibili cause: migrazione 011_tips_sources_cache.sql non applicata, oppure database non raggiungibile.</p>';
        });
    }

    function _renderSourcesPage(container) {
        var html = [];
        // Toolbar
        html.push('<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">');
        html.push('<button class="btn btn-success" style="font-size:13px;" onclick="showCreateSourceForm()">+ Aggiungi Fonte</button>');
        html.push('<button class="btn btn-primary" style="font-size:13px;" onclick="crawlAllSources()">Crawl Tutte</button>');
        html.push('<button class="btn btn-secondary" style="font-size:13px;" onclick="validateAllSources()">Valida Tutte</button>');
        html.push('<select onchange="_sourcesFilterChange(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">');
        html.push('<option value=""' + (_sourcesFilter === '' ? ' selected' : '') + '>Tutte</option>');
        html.push('<option value="active"' + (_sourcesFilter === 'active' ? ' selected' : '') + '>Solo attive</option>');
        html.push('<option value="inactive"' + (_sourcesFilter === 'inactive' ? ' selected' : '') + '>Disattivate</option>');
        html.push('</select>');
        html.push('<input type="text" placeholder="Cerca..." value="' + _escapeHtml(_sourcesSearch) + '" oninput="_sourcesSearchChange(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;width:160px;">');
        html.push('</div>');

        // Filter sources
        var filtered = _sourcesData.filter(function(s) {
            if (_sourcesFilter === 'active' && !s.is_active) return false;
            if (_sourcesFilter === 'inactive' && s.is_active) return false;
            if (_sourcesSearch) {
                var q = _sourcesSearch.toLowerCase();
                return (s.display_name || '').toLowerCase().indexOf(q) >= 0 ||
                       (s.domain || '').toLowerCase().indexOf(q) >= 0 ||
                       (s.url || '').toLowerCase().indexOf(q) >= 0;
            }
            return true;
        });

        // Summary
        var totalCount = _sourcesData.length;
        var availCount = _sourcesData.filter(function(s) { return s.is_available && s.is_active; }).length;
        var offlineCount = _sourcesData.filter(function(s) { return !s.is_available && s.is_active; }).length;
        html.push('<div class="sources-summary">');
        html.push('<span><strong>' + totalCount + '</strong> fonti totali</span>');
        html.push('<span><strong>' + availCount + '</strong> disponibili</span>');
        html.push('<span><strong>' + offlineCount + '</strong> non raggiungibili</span>');
        html.push('<span><strong>' + filtered.length + '</strong> visualizzate</span>');
        html.push('</div>');

        // Cards
        if (filtered.length === 0) {
            html.push('<p style="color:#6b7280;text-align:center;padding:20px;">Nessuna fonte trovata.</p>');
        }
        filtered.forEach(function(s) {
            var statusClass = 'unknown';
            var statusLabel = 'Mai crawlato';
            if (!s.is_active) { statusClass = 'disabled'; statusLabel = 'Disattivata'; }
            else if (s.last_crawled_at && s.is_available) { statusClass = 'online'; statusLabel = 'Online'; }
            else if (s.last_crawled_at && !s.is_available) { statusClass = 'offline'; statusLabel = 'Offline'; }

            html.push('<div class="source-card">');
            html.push('<div class="source-card-header">');
            html.push('<div><span class="source-card-name">' + _escapeHtml(s.display_name || s.domain) + '</span> ');
            html.push('<span class="source-card-domain">' + _escapeHtml(s.domain) + '</span></div>');
            html.push('<span class="source-status-badge ' + statusClass + '">' + statusLabel + '</span>');
            html.push('</div>');

            // Meta
            html.push('<div class="source-card-meta">');
            if (s.last_crawled_at) {
                html.push('Crawl: ' + new Date(s.last_crawled_at).toLocaleDateString('it-IT') + ' | ');
            }
            if (s.content_changed_at) {
                html.push('Ultimo agg. contenuto: ' + new Date(s.content_changed_at).toLocaleDateString('it-IT') + ' | ');
            }
            html.push('Freq: ' + _escapeHtml(s.crawl_frequency || 'monthly'));
            if (s.language) html.push(' | Lingua: ' + _escapeHtml(s.language));
            if (s.http_status) html.push(' | HTTP ' + s.http_status);
            html.push('</div>');

            // Topics
            if (s.key_topics && s.key_topics.length > 0) {
                html.push('<div class="source-card-topics">');
                s.key_topics.slice(0, 8).forEach(function(t) {
                    html.push('<span class="source-topic-tag">' + _escapeHtml(t) + '</span>');
                });
                html.push('</div>');
            }

            // Summary snippet
            if (s.summary_it) {
                html.push('<div style="font-size:12px;color:#555;margin-bottom:8px;max-height:40px;overflow:hidden;text-overflow:ellipsis;">' +
                    _escapeHtml(s.summary_it.substring(0, 150)) + (s.summary_it.length > 150 ? '...' : '') + '</div>');
            }

            // Actions
            var sid = _escapeHtml(s.source_id);
            html.push('<div class="source-card-actions">');
            html.push('<button class="btn-crawl" onclick="crawlSource(\'' + sid + '\')">Crawl</button>');
            html.push('<button onclick="validateSource(\'' + sid + '\')">Valida</button>');
            html.push('<button onclick="showEditSourceModal(\'' + sid + '\')">Modifica</button>');
            html.push('<button onclick="showSourceDetailModal(\'' + sid + '\')">Dettaglio</button>');
            html.push('<button style="color:#dc2626;border-color:#fca5a5;" onclick="deleteSource(\'' + sid + '\')">Elimina</button>');
            html.push('</div>');

            html.push('</div>');
        });

        container.innerHTML = html.join('');
    }

    function _sourcesFilterChange(val) {
        _sourcesFilter = val;
        var c = document.getElementById('superadmin-sources-content');
        if (c) _renderSourcesPage(c);
    }

    function _sourcesSearchChange(val) {
        _sourcesSearch = val;
        var c = document.getElementById('superadmin-sources-content');
        if (c) _renderSourcesPage(c);
    }

    function showSourceDetailModal(sourceId) {
        fetchApi('/api/tips-sources/' + encodeURIComponent(sourceId)).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(data) {
            var s = data.source || {};
            var logs = data.crawl_logs || [];
            _showModal('Dettaglio: ' + (s.display_name || s.domain), function(container) {
                var html = [];
                html.push('<div style="font-size:13px;">');
                html.push('<p><strong>URL:</strong> <a href="' + _escapeHtml(s.url) + '" target="_blank">' + _escapeHtml(s.url) + '</a></p>');
                html.push('<p><strong>Dominio:</strong> ' + _escapeHtml(s.domain) + '</p>');
                html.push('<p><strong>Lingua:</strong> ' + _escapeHtml(s.language || 'N/D') + '</p>');
                html.push('<p><strong>HTTP Status:</strong> ' + (s.http_status || 'N/D') + '</p>');
                html.push('<p><strong>Disponibile:</strong> ' + (s.is_available ? 'Si' : 'No') + '</p>');
                html.push('<p><strong>Attiva:</strong> ' + (s.is_active ? 'Si' : 'No') + '</p>');
                html.push('<p><strong>Frequenza crawl:</strong> ' + _escapeHtml(s.crawl_frequency || 'monthly') + '</p>');
                html.push('<p><strong>Ultimo crawl:</strong> ' + (s.last_crawled_at ? new Date(s.last_crawled_at).toLocaleString('it-IT') : 'Mai') + '</p>');
                html.push('<p><strong>Ultima validazione:</strong> ' + (s.last_validated_at ? new Date(s.last_validated_at).toLocaleString('it-IT') : 'Mai') + '</p>');
                html.push('<p><strong>Contenuto cambiato:</strong> ' + (s.content_changed_at ? new Date(s.content_changed_at).toLocaleString('it-IT') : 'Mai') + '</p>');
                if (s.crawl_error) html.push('<p style="color:#dc2626;"><strong>Errore:</strong> ' + _escapeHtml(s.crawl_error) + '</p>');
                if (s.notes) html.push('<p><strong>Note:</strong> ' + _escapeHtml(s.notes) + '</p>');

                // Topics
                if (s.key_topics && s.key_topics.length > 0) {
                    html.push('<p><strong>Argomenti:</strong></p><div class="source-card-topics" style="margin-bottom:8px;">');
                    s.key_topics.forEach(function(t) { html.push('<span class="source-topic-tag">' + _escapeHtml(t) + '</span>'); });
                    html.push('</div>');
                }

                // Summary
                if (s.summary_it) {
                    html.push('<div style="background:#f8fafc;padding:12px;border-radius:8px;margin:8px 0;">');
                    html.push('<strong>Riassunto IT:</strong><br>' + _escapeHtml(s.summary_it));
                    html.push('</div>');
                }

                // Crawl Logs
                if (logs.length > 0) {
                    html.push('<h4 style="margin-top:16px;">Ultimi Crawl Log</h4>');
                    html.push('<table class="crawl-log-table"><tr><th>Data</th><th>Tipo</th><th>HTTP</th><th>Durata</th><th>Cambiamento</th><th>Errore</th></tr>');
                    logs.forEach(function(l) {
                        html.push('<tr>');
                        html.push('<td>' + new Date(l.created_at).toLocaleString('it-IT') + '</td>');
                        html.push('<td>' + _escapeHtml(l.crawl_type) + '</td>');
                        html.push('<td>' + (l.http_status || '-') + '</td>');
                        html.push('<td>' + (l.duration_ms ? l.duration_ms + 'ms' : '-') + '</td>');
                        html.push('<td>' + (l.content_changed ? 'Si' : 'No') + '</td>');
                        html.push('<td style="color:#dc2626;">' + _escapeHtml(l.error || '') + '</td>');
                        html.push('</tr>');
                    });
                    html.push('</table>');
                }

                html.push('</div>');
                container.innerHTML = html.join('');
            });
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore: ' + err.message, 'error');
        });
    }

    function showEditSourceModal(sourceId) {
        var s = _sourcesData.find(function(x) { return x.source_id === sourceId; });
        if (!s) return;
        _showModal('Modifica: ' + (s.display_name || s.domain), function(container) {
            var html = [];
            html.push('<div style="display:flex;flex-direction:column;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL *</label>');
            html.push('<input type="text" id="editSourceUrl" value="' + _escapeHtml(s.url) + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome display *</label>');
            html.push('<input type="text" id="editSourceName" value="' + _escapeHtml(s.display_name || '') + '" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Frequenza crawl</label>');
            html.push('<select id="editSourceFreq" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
            ['monthly', 'weekly', 'quarterly', 'manual'].forEach(function(f) {
                html.push('<option value="' + f + '"' + (s.crawl_frequency === f ? ' selected' : '') + '>' + f + '</option>');
            });
            html.push('</select></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;"><input type="checkbox" id="editSourceActive"' + (s.is_active ? ' checked' : '') + '> Attiva</label></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Note</label>');
            html.push('<textarea id="editSourceNotes" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">' + _escapeHtml(s.notes || '') + '</textarea></div>');
            html.push('<button class="btn btn-primary" onclick="saveSource(\'' + _escapeHtml(sourceId) + '\')">Salva</button>');
            html.push('</div>');
            container.innerHTML = html.join('');
        });
    }

    function showCreateSourceForm() {
        _showModal('Aggiungi Fonte', function(container) {
            var html = [];
            html.push('<div style="display:flex;flex-direction:column;gap:10px;">');
            html.push('<div><label style="font-size:12px;font-weight:600;">URL * (https://...)</label>');
            html.push('<input type="text" id="editSourceUrl" placeholder="https://www.example.com" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Nome display *</label>');
            html.push('<input type="text" id="editSourceName" placeholder="Nome fonte" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Frequenza crawl</label>');
            html.push('<select id="editSourceFreq" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">');
            ['monthly', 'weekly', 'quarterly', 'manual'].forEach(function(f) {
                html.push('<option value="' + f + '">' + f + '</option>');
            });
            html.push('</select></div>');
            html.push('<div><label style="font-size:12px;font-weight:600;">Note</label>');
            html.push('<textarea id="editSourceNotes" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"></textarea></div>');
            html.push('<button class="btn btn-success" onclick="saveSource()">Crea Fonte</button>');
            html.push('</div>');
            container.innerHTML = html.join('');
        });
    }

    function saveSource(sourceId) {
        var url = (document.getElementById('editSourceUrl') || {}).value || '';
        var name = (document.getElementById('editSourceName') || {}).value || '';
        var freq = (document.getElementById('editSourceFreq') || {}).value || 'monthly';
        var notes = (document.getElementById('editSourceNotes') || {}).value || '';

        if (!url || !name) {
            if (typeof showToast === 'function') showToast('URL e Nome sono obbligatori', 'error');
            return;
        }

        var body = { url: url, display_name: name, crawl_frequency: freq, notes: notes };

        if (sourceId) {
            // Edit
            var activeEl = document.getElementById('editSourceActive');
            body.is_active = activeEl ? activeEl.checked : true;
            fetchApi('/api/tips-sources/' + encodeURIComponent(sourceId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function(r) {
                if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Errore'); });
                if (typeof showToast === 'function') showToast('Fonte aggiornata', 'success');
                _closeModal();
                loadSuperadminSources('superadmin-sources-content');
            }).catch(function(err) {
                if (typeof showToast === 'function') showToast('Errore: ' + err.message, 'error');
            });
        } else {
            // Create
            fetchApi('/api/tips-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function(r) {
                if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Errore'); });
                if (typeof showToast === 'function') showToast('Fonte creata', 'success');
                _closeModal();
                loadSuperadminSources('superadmin-sources-content');
            }).catch(function(err) {
                if (typeof showToast === 'function') showToast('Errore: ' + err.message, 'error');
            });
        }
    }

    function deleteSource(sourceId) {
        if (!confirm('Eliminare questa fonte? L\'azione non è reversibile.')) return;
        fetchApi('/api/tips-sources/' + encodeURIComponent(sourceId), { method: 'DELETE' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (typeof showToast === 'function') showToast('Fonte eliminata', 'success');
            loadSuperadminSources('superadmin-sources-content');
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore: ' + err.message, 'error');
        });
    }

    function crawlSource(sourceId) {
        if (typeof showToast === 'function') showToast('Crawl in corso...', 'info');
        fetchApi('/api/tips-sources/' + encodeURIComponent(sourceId) + '/crawl', { method: 'POST' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            var msg = 'Crawl completato';
            if (data.content_changed) msg += ' (contenuto aggiornato)';
            if (typeof showToast === 'function') showToast(msg, 'success');
            loadSuperadminSources('superadmin-sources-content');
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore crawl: ' + err.message, 'error');
        });
    }

    function validateSource(sourceId) {
        fetchApi('/api/tips-sources/' + encodeURIComponent(sourceId) + '/validate', { method: 'POST' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            var msg = 'Validazione: ' + (data.is_available ? 'Online' : 'Offline') + ' (HTTP ' + (data.http_status || '?') + ')';
            if (typeof showToast === 'function') showToast(msg, data.is_available ? 'success' : 'error');
            loadSuperadminSources('superadmin-sources-content');
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore validazione: ' + err.message, 'error');
        });
    }

    function crawlAllSources() {
        if (!confirm('Avviare il crawl di tutte le fonti attive? Potrebbe richiedere diversi minuti.')) return;
        if (typeof showToast === 'function') showToast('Crawl batch avviato...', 'info');
        fetchApi('/api/tips-sources/crawl-all', { method: 'POST' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            var msg = 'Crawl completato: ' + (data.results || []).length + ' fonti processate';
            if (typeof showToast === 'function') showToast(msg, 'success');
            loadSuperadminSources('superadmin-sources-content');
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore crawl batch: ' + err.message, 'error');
        });
    }

    function validateAllSources() {
        if (typeof showToast === 'function') showToast('Validazione batch avviata...', 'info');
        fetchApi('/api/tips-sources/validate-all', { method: 'POST' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(data) {
            var msg = 'Validazione completata: ' + (data.results || []).length + ' fonti verificate';
            if (typeof showToast === 'function') showToast(msg, 'success');
            loadSuperadminSources('superadmin-sources-content');
        }).catch(function(err) {
            if (typeof showToast === 'function') showToast('Errore validazione batch: ' + err.message, 'error');
        });
    }

    // =========================================================================
    // Bulk AI Analysis
    // =========================================================================

    async function bulkAiAnalysis() {
        if (!confirm('Avviare l\'analisi AI per tutti i pet?\n\nQuesto processo:\n- Genera la descrizione AI per i pet che ne sono privi\n- Esegue l\'analisi raccomandazione per ogni pet\n- Può richiedere diversi minuti')) return;

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) {
            if (typeof showToast === 'function') showToast('Selezionare un tenant', 'warning');
            return;
        }

        // Create non-dismissable overlay (no click-outside close during processing)
        _closeModal();
        var overlay = document.createElement('div');
        overlay.id = 'admin-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        // No onclick on overlay during processing

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        var body = document.createElement('div');
        body.id = 'bulk-ai-body';
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Initial loading state
        body.innerHTML = '<div style="text-align:center;padding:40px;">' +
            '<div style="font-size:32px;margin-bottom:16px;">&#129302;</div>' +
            '<h3 style="color:#1e3a5f;margin-bottom:8px;">Bulk AI Analysis</h3>' +
            '<p style="color:#64748b;font-size:13px;">Connessione in corso...</p>' +
            '<div style="margin-top:16px;width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#1e3a5f;border-radius:50%;animation:spin 1s linear infinite;margin:16px auto;"></div>' +
            '<style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';

        // Elapsed timer
        var startTime = Date.now();
        var timerInterval = null;
        function formatElapsed(ms) {
            var secs = Math.floor(ms / 1000);
            if (secs < 60) return secs + 's';
            var mins = Math.floor(secs / 60);
            var remSecs = secs % 60;
            return mins + 'm ' + (remSecs < 10 ? '0' : '') + remSecs + 's';
        }

        // Track running totals
        var state = { total: 0, current: 0, petName: '', descs: 0, analyses: 0, cached: 0, errors: 0 };

        function renderProgress() {
            var pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
            var elapsed = formatElapsed(Date.now() - startTime);
            var h = [];
            h.push('<div style="padding:20px;">');
            h.push('<h3 style="color:#1e3a5f;margin:0 0 16px;">&#129302; Bulk AI Analysis</h3>');
            // Progress bar
            h.push('<div style="background:#e2e8f0;border-radius:8px;height:24px;overflow:hidden;margin-bottom:8px;">');
            h.push('<div style="background:linear-gradient(90deg,#2563eb,#3b82f6);height:100%;width:' + pct + '%;transition:width 0.3s;border-radius:8px;display:flex;align-items:center;justify-content:center;">');
            if (pct > 15) h.push('<span style="color:#fff;font-size:11px;font-weight:700;">' + pct + '%</span>');
            h.push('</div></div>');
            // Status line
            h.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">');
            h.push('<span style="font-size:14px;font-weight:600;color:#1e3a5f;">' + state.current + '/' + state.total + '</span>');
            h.push('<span style="font-size:13px;color:#64748b;">&#9201; ' + elapsed + '</span>');
            h.push('</div>');
            // Current pet
            if (state.petName) {
                h.push('<div style="background:#eff6ff;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#1e40af;">');
                h.push('Elaborazione: <strong>' + _escapeHtml(state.petName) + '</strong>...');
                h.push('</div>');
            }
            // Running counters
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">');
            if (state.descs > 0) h.push('<div style="background:#f0fdf4;padding:8px;border-radius:6px;text-align:center;font-size:12px;"><div style="font-weight:700;color:#16a34a;">' + state.descs + '</div>Descrizioni</div>');
            if (state.analyses > 0) h.push('<div style="background:#fefce8;padding:8px;border-radius:6px;text-align:center;font-size:12px;"><div style="font-weight:700;color:#ca8a04;">' + state.analyses + '</div>Analisi</div>');
            if (state.cached > 0) h.push('<div style="background:#f0f9ff;padding:8px;border-radius:6px;text-align:center;font-size:12px;"><div style="font-weight:700;color:#0369a1;">' + state.cached + '</div>Da cache</div>');
            h.push('</div>');
            h.push('</div>');
            body.innerHTML = h.join('');
        }

        function renderResults(result) {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            var elapsed = formatElapsed(Date.now() - startTime);
            var h = [];
            h.push('<div style="padding:20px;">');
            h.push('<h3 style="color:#1e3a5f;margin:0 0 16px;">&#129302; Bulk AI Analysis completata</h3>');
            h.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">');
            h.push('<div style="background:#f0fdf4;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#16a34a;">' + (result.total || 0) + '</div><div style="font-size:12px;color:#666;">Pet totali</div></div>');
            h.push('<div style="background:#eff6ff;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#2563eb;">' + (result.descriptionsGenerated || 0) + '</div><div style="font-size:12px;color:#666;">Descrizioni generate</div></div>');
            h.push('<div style="background:#fefce8;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#ca8a04;">' + (result.analysesRun || 0) + '</div><div style="font-size:12px;color:#666;">Analisi eseguite</div></div>');
            h.push('<div style="background:#f0f9ff;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#0369a1;">' + (result.analysesCached || 0) + '</div><div style="font-size:12px;color:#666;">Analisi da cache</div></div>');
            h.push('</div>');
            // Elapsed
            h.push('<div style="text-align:center;margin-bottom:16px;font-size:13px;color:#64748b;">&#9201; Tempo totale: ' + elapsed + '</div>');
            // Errors
            if (result.errors && result.errors.length > 0) {
                h.push('<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;">');
                h.push('<div style="font-weight:600;color:#dc2626;margin-bottom:8px;">' + result.errors.length + ' errori:</div>');
                result.errors.slice(0, 10).forEach(function(err) {
                    h.push('<div style="font-size:12px;color:#991b1b;margin:4px 0;">' + _escapeHtml((err.petName || err.petId) + ' (' + err.phase + '): ' + err.error) + '</div>');
                });
                if (result.errors.length > 10) {
                    h.push('<div style="font-size:11px;color:#888;margin-top:4px;">...e altri ' + (result.errors.length - 10) + ' errori</div>');
                }
                h.push('</div>');
            }
            h.push('<div style="text-align:center;"><button class="btn btn-primary" onclick="_closeModal()">Chiudi</button></div>');
            h.push('</div>');
            body.innerHTML = h.join('');
            // Now allow click-outside to close
            overlay.onclick = function(e) { if (e.target === overlay) _closeModal(); };
        }

        try {
            var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            var headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;

            var resp = await fetch(API_BASE_URL + '/api/admin/' + encodeURIComponent(tenantId) + '/bulk-ai-analysis', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({})
            });

            if (!resp || !resp.ok) {
                if (typeof _closeModal === 'function') _closeModal();
                var errData = null;
                try { errData = await resp.json(); } catch(_) {}
                if (typeof showToast === 'function') showToast('Errore: ' + ((errData && errData.error) || resp.status), 'error');
                return;
            }

            // Guard: if browser blocked the body (e.g. CORS), give a clear error
            if (!resp.body) {
                if (typeof _closeModal === 'function') _closeModal();
                if (typeof showToast === 'function') showToast('Errore: risposta streaming non disponibile', 'error');
                return;
            }

            // Start elapsed timer
            timerInterval = setInterval(function() {
                if (state.total > 0 && state.current < state.total) renderProgress();
            }, 1000);

            // Read SSE stream
            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                buffer += decoder.decode(chunk.value, { stream: true });

                var lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (var li = 0; li < lines.length; li++) {
                    var line = lines[li];
                    if (line.indexOf('data: ') !== 0) continue;
                    var jsonStr = line.substring(6);
                    var evt;
                    try { evt = JSON.parse(jsonStr); } catch(_) { continue; }

                    if (evt.type === 'start') {
                        state.total = evt.total;
                        renderProgress();
                    } else if (evt.type === 'progress') {
                        state.current = evt.current;
                        state.petName = evt.petName || '';
                        renderProgress();
                    } else if (evt.type === 'pet_done') {
                        state.current = evt.current;
                        if (evt.descGenerated) state.descs++;
                        if (evt.analysisRun) state.analyses++;
                        if (evt.cached) state.cached++;
                        if (evt.error) state.errors++;
                        renderProgress();
                    } else if (evt.type === 'done') {
                        renderResults(evt);
                    }
                }
            }

            // If stream ended without a 'done' event, show what we have
            if (state.current > 0 && state.current >= state.total && !body.querySelector('.btn-primary')) {
                renderResults({ total: state.total, descriptionsGenerated: state.descs, analysesRun: state.analyses, analysesCached: state.cached, errors: [] });
            }

        } catch(e) {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            if (typeof _closeModal === 'function') _closeModal();
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        }
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
    global.downloadCatalogCsv     = downloadCatalogCsv;
    global.downloadCatalogXlsx    = downloadCatalogXlsx;
    global.switchPageTenant       = switchPageTenant;
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
    global._showModal             = _showModal;
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
    global.removeTenantFromUser   = removeTenantFromUser;
    global._onUsersFilterChange   = _onUsersFilterChange;
    // Policies
    global.loadSuperadminPolicies = loadSuperadminPolicies;
    global.showCreatePolicyForm   = showCreatePolicyForm;
    global.hidePolicyForm         = hidePolicyForm;
    global.savePolicy             = savePolicy;
    global.editPolicy             = editPolicy;
    global.onPolicyKeyChange      = onPolicyKeyChange;
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
    // Catalog extras: search, bulk, preview, URL validation
    global.previewPromoItem       = previewPromoItem;
    global._previewNav            = _previewNav;
    global.validateItemUrls       = validateItemUrls;
    global.validateAllCatalogUrls = validateAllCatalogUrls;
    global.previewExplanation     = previewExplanation;
    global.bulkPublishDraft       = bulkPublishDraft;
    global.bulkAddServiceType     = bulkAddServiceType;
    global.bulkRemoveServiceType  = bulkRemoveServiceType;
    global.catalogSearch          = catalogSearch;
    global.catalogSearchReset     = catalogSearchReset;
    // Image management wizard
    global.openImageManagement       = openImageManagement;
    global.batchCacheImagesFiltered  = batchCacheImagesFiltered;
    global.batchScrapeImagesFiltered = batchScrapeImagesFiltered;
    global.scrapeWizardAccept        = scrapeWizardAccept;
    global.scrapeWizardSkip          = scrapeWizardSkip;
    global.scrapeWizardSkipAll       = scrapeWizardSkipAll;
    global.scrapeWizardPreviewManual = scrapeWizardPreviewManual;
    // PR 2: Advanced filters + preview actions
    global.filterCatalogServiceType = filterCatalogServiceType;
    global.filterCatalogPriority   = filterCatalogPriority;
    global.filterCatalogImage      = filterCatalogImage;
    global.filterCatalogExtDesc    = filterCatalogExtDesc;
    global.filterCatalogCategory   = filterCatalogCategory;
    global.filterCatalogSpecies    = filterCatalogSpecies;
    global.setItemStatusFromReport = setItemStatusFromReport;
    global.showPurchasePlaceholder = showPurchasePlaceholder;
    global.showWhyYouSeeThis       = showWhyYouSeeThis;
    global.showDismissPlaceholder  = showDismissPlaceholder;
    // Tips Sources
    global.loadSuperadminSources  = loadSuperadminSources;
    global.showCreateSourceForm   = showCreateSourceForm;
    global.showEditSourceModal    = showEditSourceModal;
    global.showSourceDetailModal  = showSourceDetailModal;
    global.deleteSource           = deleteSource;
    global.crawlSource            = crawlSource;
    global.validateSource         = validateSource;
    global.crawlAllSources        = crawlAllSources;
    global.validateAllSources     = validateAllSources;
    global.saveSource             = saveSource;
    global._sourcesFilterChange   = _sourcesFilterChange;
    global._sourcesSearchChange   = _sourcesSearchChange;
    // Bulk AI Analysis
    global.bulkAiAnalysis         = bulkAiAnalysis;

})(typeof window !== 'undefined' ? window : this);
