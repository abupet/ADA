// frontend/app-diagnostics.js v1
// B2B Phase 2: Diagnostic results portal

(function(global) {
    'use strict';

    async function loadDiagnosticsPage() {
        var page = document.getElementById('page-diagnostics');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento risultati diagnostici...</p></div>';

        try {
            var results = [];
            var notifications = [];

            try {
                var [resResp, notifResp] = await Promise.all([
                    fetch(API_BASE_URL + '/api/diagnostics/results', { headers: { 'Authorization': 'Bearer ' + getAuthToken() } }),
                    fetch(API_BASE_URL + '/api/diagnostics/notifications', { headers: { 'Authorization': 'Bearer ' + getAuthToken() } })
                ]);
                if (resResp.ok) { var rd = await resResp.json(); results = rd.results || []; }
                if (notifResp.ok) { var nd = await notifResp.json(); notifications = nd.notifications || []; }
            } catch (_) {}

            var html = '<h2 style="margin:0 0 16px">Risultati Diagnostici</h2>';

            // Notifications badge
            if (notifications.length > 0) {
                html += '<div style="background:#FFF3CD;border:1px solid #FFC107;border-radius:10px;padding:12px;margin-bottom:16px">' +
                    '<strong>\u26A0\uFE0F ' + notifications.length + ' nuov' + (notifications.length === 1 ? 'o risultato' : 'i risultati') + '</strong>' +
                    '<ul style="margin:8px 0 0;padding-left:20px">';
                for (var n = 0; n < Math.min(notifications.length, 5); n++) {
                    var notif = notifications[n];
                    html += '<li style="font-size:13px;margin-bottom:4px">' + (notif.pet_name || 'Pet') + ' — ' + (notif.panel_name || notif.notification_type) + '</li>';
                }
                if (notifications.length > 5) html += '<li style="font-size:13px;color:#666">...e altri ' + (notifications.length - 5) + '</li>';
                html += '</ul></div>';
            }

            if (!results.length) {
                html += '<p style="color:#666">Nessun risultato diagnostico disponibile.</p>';
            } else {
                var statusColors = { ordered:'#95A5A6', sample_collected:'#F39C12', processing:'#3498DB', completed:'#27AE60', reviewed:'#2ECC71', shared:'#00BCD4' };
                var statusLabels = { ordered:'Ordinato', sample_collected:'Campione prelevato', processing:'In lavorazione', completed:'Completato', reviewed:'Revisionato', shared:'Condiviso' };

                for (var i = 0; i < results.length; i++) {
                    var r = results[i];
                    var rColor = statusColors[r.result_status] || '#95A5A6';
                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px;margin-bottom:8px">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                            '<div>' +
                                '<strong>' + (r.panel_name || 'Esame') + '</strong>' +
                                '<span style="background:' + rColor + ';color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px">' + (statusLabels[r.result_status] || r.result_status) + '</span>' +
                                (r.pet_name ? '<div style="color:#666;font-size:13px;margin-top:2px">Paziente: ' + r.pet_name + '</div>' : '') +
                                (r.result_summary ? '<div style="color:#888;font-size:12px;margin-top:2px">' + r.result_summary + '</div>' : '') +
                            '</div>' +
                            '<div style="text-align:right;color:#666;font-size:12px">' +
                                (r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '') +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }
            }
            page.innerHTML = html;
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore: ' + e.message + '</div>';
        }
    }

    global.loadDiagnosticsPage = loadDiagnosticsPage;
})(window);
