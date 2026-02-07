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
        html.push('<button class="btn btn-secondary" onclick="exportPromoCsv(\'' + period + '\')">📥 Esporta CSV eventi</button>');
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

    function initCsvWizard(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectAdminStyles();

        var html = [
            '<div class="wizard-step">',
            '<h4>Step 1: Carica file CSV</h4>',
            '<p>Formato: name, category, species, lifecycle_target, description, image_url, product_url, tags_include, tags_exclude, priority</p>',
            '<input type="file" id="csvFileInput" accept=".csv,.txt" onchange="handleCsvUpload(event)">',
            '</div>',
            '<div id="wizard-step-2" class="wizard-step" style="display:none;">',
            '<h4>Step 2: Anteprima</h4>',
            '<div id="wizard-preview" class="wizard-preview"></div>',
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
    }

    function handleCsvUpload(event) {
        var file = event.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (e) {
            var text = e.target.result;
            _wizardParsedItems = _parseCsv(text);

            if (_wizardParsedItems.length === 0) {
                if (typeof showToast === 'function') showToast('CSV vuoto o formato non valido.', 'error');
                return;
            }

            // Show preview
            var step2 = document.getElementById('wizard-step-2');
            if (step2) step2.style.display = '';

            var preview = document.getElementById('wizard-preview');
            if (preview) {
                var html = '<p>' + _wizardParsedItems.length + ' righe trovate.</p>';
                html += '<table>';
                html += '<tr><th>#</th><th>Nome</th><th>Categoria</th><th>Specie</th></tr>';
                _wizardParsedItems.slice(0, 10).forEach(function (item, idx) {
                    html += '<tr><td>' + (idx + 1) + '</td><td>' + _escapeHtml(item.name || '') +
                        '</td><td>' + _escapeHtml(item.category || '') +
                        '</td><td>' + _escapeHtml(String(item.species || '')) + '</td></tr>';
                });
                if (_wizardParsedItems.length > 10) {
                    html += '<tr><td colspan="4">... e altri ' + (_wizardParsedItems.length - 10) + '</td></tr>';
                }
                html += '</table>';
                preview.innerHTML = html;
            }
        };
        reader.readAsText(file);
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

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId) {
            if (typeof showToast === 'function') showToast('Tenant non configurato.', 'error');
            return;
        }

        var step3 = document.getElementById('wizard-step-3');
        var results = document.getElementById('wizard-results');
        if (step3) step3.style.display = '';
        if (results) results.innerHTML = '<p>Invio in corso...</p>';

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/import/promo-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: _wizardParsedItems, dry_run: dryRun })
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
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="promptEditTenant(\'' + _escapeHtml(tenant.tenant_id) + '\', \'' + _escapeHtml(tenant.name) + '\')">Modifica</button>');

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
    // Expose public API
    // =========================================================================

    global.loadAdminDashboard     = loadAdminDashboard;
    global.selectDashboardTenant  = selectDashboardTenant;
    global.exportPromoCsv         = exportPromoCsv;
    global.initCsvWizard          = initCsvWizard;
    global.handleCsvUpload        = handleCsvUpload;
    global.wizardDryRun           = wizardDryRun;
    global.wizardImport           = wizardImport;
    global.loadSuperadminTenants  = loadSuperadminTenants;
    global.showCreateTenantForm   = showCreateTenantForm;
    global.hideCreateTenantForm   = hideCreateTenantForm;
    global.createTenant           = createTenant;
    global.toggleTenantStatus     = toggleTenantStatus;
    global.promptEditTenant       = promptEditTenant;
    global.loadSuperadminUsers    = loadSuperadminUsers;
    global.showCreateUserForm     = showCreateUserForm;
    global.hideCreateUserForm     = hideCreateUserForm;
    global.createUser             = createUser;
    global.toggleUserStatus       = toggleUserStatus;
    global.promptResetPassword    = promptResetPassword;
    global.promptAssignTenant     = promptAssignTenant;

})(typeof window !== 'undefined' ? window : this);
