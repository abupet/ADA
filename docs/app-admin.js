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
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =========================================================================
    // Dashboard
    // =========================================================================

    function loadAdminDashboard(containerId, period) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _injectAdminStyles();

        var tenantId = typeof getJwtTenantId === 'function' ? getJwtTenantId() : null;
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
                _renderDashboard(container, data, p);
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#dc2626;">Errore nel caricamento della dashboard.</p>';
            });
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
    // Expose public API
    // =========================================================================

    global.loadAdminDashboard = loadAdminDashboard;
    global.exportPromoCsv     = exportPromoCsv;
    global.initCsvWizard      = initCsvWizard;
    global.handleCsvUpload    = handleCsvUpload;
    global.wizardDryRun       = wizardDryRun;
    global.wizardImport       = wizardImport;

})(typeof window !== 'undefined' ? window : this);
