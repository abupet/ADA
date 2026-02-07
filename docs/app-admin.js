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
            html.push('<option value="' + c + '">' + c + '</option>');
        });
        html.push('</select></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Specie</label><input type="text" id="newItemSpecies" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="dog, cat"></div>');
        html.push('<div><label style="font-size:12px;font-weight:600;">Lifecycle</label><input type="text" id="newItemLifecycle" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;" placeholder="puppy, adult, senior"></div>');
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
            html.push('<tr><th>Nome</th><th>Categoria</th><th>Specie</th><th>Stato</th><th>Priorita</th><th>Azioni</th></tr>');
            _catalogItems.forEach(function (item) {
                var statusColor = { draft: '#888', in_review: '#eab308', published: '#16a34a', retired: '#dc2626' }[item.status] || '#888';
                html.push('<tr>');
                html.push('<td>' + _escapeHtml(item.name) + '</td>');
                html.push('<td>' + _escapeHtml(item.category) + '</td>');
                html.push('<td>' + _escapeHtml(Array.isArray(item.species) ? item.species.join(', ') : '') + '</td>');
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

        var speciesStr = (document.getElementById('newItemSpecies') || {}).value || '';
        var lifecycleStr = (document.getElementById('newItemLifecycle') || {}).value || '';
        var species = speciesStr ? speciesStr.split(',').map(function (s) { return s.trim(); }) : [];
        var lifecycle = lifecycleStr ? lifecycleStr.split(',').map(function (s) { return s.trim(); }) : [];

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

        var newName = prompt('Nuovo nome prodotto:');
        if (!newName) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/promo-items/' + encodeURIComponent(itemId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
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
                html.push('<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="editCampaign(\'' + _escapeHtml(camp.campaign_id) + '\',\'' + _escapeHtml(camp.name) + '\')">Modifica</button>');
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

    function editCampaign(campaignId, currentName) {
        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
        if (!tenantId && _selectedDashboardTenant) tenantId = _selectedDashboardTenant;
        if (!tenantId) return;

        var newName = prompt('Nuovo nome campagna:', currentName);
        if (!newName || newName === currentName) return;

        fetchApi('/api/admin/' + encodeURIComponent(tenantId) + '/campaigns/' + encodeURIComponent(campaignId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function () {
            if (typeof showToast === 'function') showToast('Campagna aggiornata.', 'success');
            loadAdminCampaigns();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore aggiornamento.', 'error');
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
    // Expose public API
    // =========================================================================

    global.loadAdminDashboard     = loadAdminDashboard;
    global.selectDashboardTenant  = selectDashboardTenant;
    global.exportPromoCsv         = exportPromoCsv;
    global.initCsvWizard          = initCsvWizard;
    global.handleCsvUpload        = handleCsvUpload;
    global.wizardDryRun           = wizardDryRun;
    global.wizardImport           = wizardImport;
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
    // Tenants
    global.loadSuperadminTenants  = loadSuperadminTenants;
    global.showCreateTenantForm   = showCreateTenantForm;
    global.hideCreateTenantForm   = hideCreateTenantForm;
    global.createTenant           = createTenant;
    global.toggleTenantStatus     = toggleTenantStatus;
    global.promptEditTenant       = promptEditTenant;
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

})(typeof window !== 'undefined' ? window : this);
