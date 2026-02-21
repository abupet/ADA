// frontend/app-referral-analytics.js v1
// B2B Phase 3: Referral analytics dashboard with KPIs and specialty breakdown

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Main ──
    async function loadReferralAnalytics() {
        var page = document.getElementById('page-referral-analytics');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento analytics referral...</p></div>';

        try {
            // Fetch both endpoints in parallel
            var results = await Promise.all([
                fetchApi('/api/referral-analytics/summary'),
                fetchApi('/api/referral-analytics/by-specialty')
            ]);

            if (!results[0].ok) throw new Error('Errore summary ' + results[0].status);
            if (!results[1].ok) throw new Error('Errore specialty ' + results[1].status);

            var summaryData = await results[0].json();
            var specialtyData = await results[1].json();

            var summary = summaryData.summary || summaryData;
            var specialties = specialtyData.specialties || specialtyData.data || [];

            var html = '<h2 style="margin:0 0 20px"><i data-lucide="bar-chart-3" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Analytics Referral</h2>';

            // ── KPI Cards ──
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px">';

            html += _kpiCard('Referral Totali', summary.total_referrals || 0, '#4A90D9', 'send');
            html += _kpiCard('Tempo Medio Chiusura', _formatDays(summary.avg_close_time_days), '#27AE60', 'clock');
            html += _kpiCard('Tasso SLA Breach', _formatPercent(summary.sla_breach_rate), _slaColor(summary.sla_breach_rate), 'alert-triangle');
            html += _kpiCard('In Corso', summary.pending_referrals || summary.in_progress || 0, '#E67E22', 'loader');
            html += _kpiCard('Completati', summary.completed_referrals || summary.completed || 0, '#28a745', 'check-circle');
            html += _kpiCard('Rifiutati', summary.rejected_referrals || summary.rejected || 0, '#dc3545', 'x-circle');

            html += '</div>';

            // ── Export CSV Button ──
            html += '<div style="margin-bottom:20px;text-align:right">' +
                '<button onclick="_exportReferralCSV()" style="background:#4A90D9;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">' +
                '<i data-lucide="download" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Esporta CSV</button></div>';

            // ── Specialty Breakdown Table ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="stethoscope" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Dettaglio per Specialit&agrave;</h3>';

            if (!specialties.length) {
                html += '<p style="color:#888">Nessun dato disponibile.</p>';
            } else {
                html += '<div style="overflow-x:auto">' +
                    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
                    '<thead><tr style="background:#f5f7fa;text-align:left">' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Specialit&agrave;</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Totale</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Completati</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">In Corso</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Tempo Medio (gg)</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">SLA Breach</th>' +
                    '</tr></thead><tbody>';

                for (var i = 0; i < specialties.length; i++) {
                    var sp = specialties[i];
                    var bgRow = i % 2 === 0 ? '#fff' : '#fafbfc';
                    html += '<tr style="background:' + bgRow + '">' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:500">' + _escSafe(sp.specialty || sp.name || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:600">' + (sp.total || 0) + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#28a745">' + (sp.completed || 0) + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#E67E22">' + (sp.in_progress || sp.pending || 0) + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">' + _formatDays(sp.avg_close_time_days) + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:' + _slaColor(sp.sla_breach_rate) + ';font-weight:600">' + _formatPercent(sp.sla_breach_rate) + '</td>' +
                    '</tr>';
                }

                html += '</tbody></table></div>';
            }

            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento analytics: ' + _escSafe(e.message) + '</div>';
        }
    }

    // ── Helpers ──
    function _kpiCard(label, value, color, icon) {
        return '<div style="background:' + color + ';color:#fff;padding:16px;border-radius:12px;text-align:center">' +
            '<i data-lucide="' + icon + '" style="width:22px;height:22px;margin-bottom:6px;opacity:0.85"></i>' +
            '<div style="font-size:26px;font-weight:700">' + value + '</div>' +
            '<div style="font-size:11px;opacity:0.9;margin-top:2px">' + label + '</div></div>';
    }

    function _formatDays(val) {
        if (val == null || val === '') return '—';
        var n = Number(val);
        return isNaN(n) ? '—' : n.toFixed(1);
    }

    function _formatPercent(val) {
        if (val == null || val === '') return '—';
        var n = Number(val);
        return isNaN(n) ? '—' : n.toFixed(1) + '%';
    }

    function _slaColor(val) {
        if (val == null) return '#666';
        var n = Number(val);
        if (isNaN(n)) return '#666';
        if (n <= 5) return '#28a745';
        if (n <= 15) return '#fd7e14';
        return '#dc3545';
    }

    // ── CSV Export ──
    async function _exportReferralCSV() {
        try {
            var resp = await fetchApi('/api/referral-analytics/export');
            if (!resp.ok) throw new Error('Errore export ' + resp.status);
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'referral-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') showToast('Export CSV avviato', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore export: ' + e.message, 'error');
        }
    }

    // ── Export ──
    global.loadReferralAnalytics = loadReferralAnalytics;
    global._exportReferralCSV = _exportReferralCSV;
})(window);
