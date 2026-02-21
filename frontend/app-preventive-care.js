// frontend/app-preventive-care.js v1
// B2B Phase 3: Preventive care plans — timeline, AI generation, completion

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Priority Config ──
    var PRIORITY_CONFIG = {
        essential:   { color: '#dc3545', bg: '#fff5f5', label: 'Essenziale', icon: 'alert-circle' },
        recommended: { color: '#fd7e14', bg: '#fff8f0', label: 'Raccomandato', icon: 'alert-triangle' },
        optional:    { color: '#28a745', bg: '#f0fff4', label: 'Opzionale', icon: 'info' }
    };

    // ── Main ──
    async function loadPreventiveCarePage() {
        var page = document.getElementById('page-preventive-care');
        if (!page) return;

        var petId = typeof getCurrentPetId === 'function' ? getCurrentPetId() : null;
        if (!petId) {
            page.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#888">' +
                '<i data-lucide="paw-print" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5"></i>' +
                '<p style="font-size:16px;margin:0">Seleziona un animale per visualizzare il piano di cure preventive.</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento piano preventivo...</p></div>';

        try {
            var resp = await fetchApi('/api/preventive-care/plans/' + encodeURIComponent(petId));
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var plans = data.plans || data.items || [];
            // Flatten items from all plans
            var allItems = [];
            if (plans.length && plans[0].items) {
                for (var p = 0; p < plans.length; p++) {
                    var planItems = plans[p].items || [];
                    for (var q = 0; q < planItems.length; q++) {
                        allItems.push(planItems[q]);
                    }
                }
            } else {
                allItems = plans;
            }

            _renderPreventiveCare(page, petId, allItems);
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento piano preventivo: ' + _escSafe(e.message) + '</div>';
        }
    }

    function _renderPreventiveCare(page, petId, items) {
        var html = '<h2 style="margin:0 0 8px"><i data-lucide="shield-check" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Piano Cure Preventive</h2>';

        // ── Generate AI Plan Button ──
        html += '<div style="margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
            '<button id="btn-generate-ai-plan" onclick="_generatePreventivePlanAI(\'' + _escSafe(petId) + '\')" ' +
            'style="background:#4A90D9;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">' +
            '<i data-lucide="sparkles" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Genera Piano AI</button>' +
            '<span id="ai-plan-status" style="font-size:13px;color:#888"></span>' +
            '</div>';

        if (!items.length) {
            html += '<div style="text-align:center;padding:40px 20px;color:#888">' +
                '<i data-lucide="clipboard-list" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5"></i>' +
                '<p style="font-size:16px;margin:0">Nessun piano preventivo disponibile.</p>' +
                '<p style="font-size:13px;margin-top:8px;color:#aaa">Usa il pulsante "Genera Piano AI" per crearne uno.</p>' +
                '</div>';
            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // ── Group by month ──
        var months = {};
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var dateStr = item.due_date || item.scheduled_date || item.date || '';
            var monthKey = dateStr ? dateStr.substring(0, 7) : 'non-programmato';
            if (!months[monthKey]) months[monthKey] = [];
            months[monthKey].push(item);
        }

        // Sort month keys
        var monthKeys = Object.keys(months).sort();

        // ── Timeline ──
        for (var m = 0; m < monthKeys.length; m++) {
            var mk = monthKeys[m];
            var monthLabel = mk === 'non-programmato' ? 'Non Programmato' : _formatMonth(mk);
            var monthItems = months[mk];

            html += '<div style="margin-bottom:24px">' +
                '<h3 style="margin:0 0 10px;color:#555;font-size:15px;display:flex;align-items:center;gap:8px">' +
                '<i data-lucide="calendar" style="width:16px;height:16px"></i>' + _escSafe(monthLabel) +
                '<span style="font-size:12px;color:#aaa;font-weight:400">(' + monthItems.length + ' elementi)</span></h3>';

            for (var j = 0; j < monthItems.length; j++) {
                var ci = monthItems[j];
                var priority = (ci.priority || 'optional').toLowerCase();
                var pc = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.optional;
                var completed = ci.completed || ci.status === 'completed';
                var opacity = completed ? '0.6' : '1';
                var textDecor = completed ? 'line-through' : 'none';

                html += '<div style="border:1px solid ' + pc.color + '33;border-left:4px solid ' + pc.color + ';border-radius:10px;padding:12px 16px;margin-bottom:8px;background:' + pc.bg + ';opacity:' + opacity + '">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                        '<div style="flex:1;min-width:200px">' +
                            '<div style="font-weight:600;font-size:14px;color:#333;text-decoration:' + textDecor + '">' +
                                '<i data-lucide="' + pc.icon + '" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;color:' + pc.color + '"></i>' +
                                _escSafe(ci.name || ci.title || 'Intervento') +
                            '</div>' +
                            (ci.description ? '<div style="font-size:12px;color:#666;margin-top:3px;text-decoration:' + textDecor + '">' + _escSafe(ci.description) + '</div>' : '') +
                            '<div style="font-size:11px;color:#999;margin-top:4px">' +
                                '<span style="background:' + pc.color + ';color:#fff;font-size:10px;padding:1px 6px;border-radius:6px;margin-right:6px">' + pc.label + '</span>' +
                                (ci.due_date || ci.scheduled_date ? _escSafe(ci.due_date || ci.scheduled_date) : '') +
                            '</div>' +
                        '</div>' +
                        '<div>' +
                            (completed
                                ? '<span style="color:#28a745;font-size:13px;font-weight:600"><i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"></i>Completato</span>'
                                : '<button onclick="_completePreventiveItem(\'' + _escSafe(ci.id) + '\')" style="background:#28a745;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">' +
                                  '<i data-lucide="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Completato</button>') +
                        '</div>' +
                    '</div>' +
                    '</div>';
            }

            html += '</div>';
        }

        page.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── AI Plan Generation ──
    async function _generatePreventivePlanAI(petId) {
        var btn = document.getElementById('btn-generate-ai-plan');
        var status = document.getElementById('ai-plan-status');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
        if (status) status.textContent = 'Generazione in corso...';

        try {
            var resp = await fetchApi('/api/preventive-care/plans/' + encodeURIComponent(petId) + '/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!resp.ok) throw new Error('Errore generazione ' + resp.status);
            if (typeof showToast === 'function') showToast('Piano preventivo generato con successo!', 'success');
            // Reload the page
            loadPreventiveCarePage();
        } catch (e) {
            if (status) status.textContent = 'Errore: ' + e.message;
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
            if (typeof showToast === 'function') showToast('Errore generazione piano: ' + e.message, 'error');
        }
    }

    // ── Complete Item ──
    async function _completePreventiveItem(itemId) {
        try {
            var resp = await fetchApi('/api/preventive-care/items/' + encodeURIComponent(itemId) + '/complete', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true })
            });
            if (!resp.ok) throw new Error('Errore aggiornamento ' + resp.status);
            if (typeof showToast === 'function') showToast('Intervento segnato come completato', 'success');
            // Reload the page
            loadPreventiveCarePage();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        }
    }

    // ── Helpers ──
    function _formatMonth(yyyymm) {
        var parts = yyyymm.split('-');
        var monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        var mi = parseInt(parts[1], 10) - 1;
        return (monthNames[mi] || parts[1]) + ' ' + parts[0];
    }

    // ── Export ──
    global.loadPreventiveCarePage = loadPreventiveCarePage;
    global._generatePreventivePlanAI = _generatePreventivePlanAI;
    global._completePreventiveItem = _completePreventiveItem;
})(window);
