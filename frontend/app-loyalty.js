// frontend/app-loyalty.js v1
// B2B Phase 3: Loyalty dashboard — levels, progress, fees

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Level Colors ──
    var LEVEL_CONFIG = {
        bronze: { color: '#CD7F32', bg: '#fdf4e8', label: 'Bronze' },
        silver: { color: '#A0A0A0', bg: '#f5f5f5', label: 'Silver' },
        gold:   { color: '#FFD700', bg: '#fffbe6', label: 'Gold' }
    };

    // ── Main ──
    async function loadLoyaltyDashboard() {
        var page = document.getElementById('page-loyalty');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento programma fedelt&agrave;...</p></div>';

        try {
            var results = await Promise.all([
                fetchApi('/api/loyalty/dashboard'),
                fetchApi('/api/loyalty/fees')
            ]);

            if (!results[0].ok) throw new Error('Errore dashboard ' + results[0].status);
            if (!results[1].ok) throw new Error('Errore fees ' + results[1].status);

            var dashData = await results[0].json();
            var feesData = await results[1].json();

            var dash = dashData.dashboard || dashData;
            var fees = feesData.fees || feesData.data || [];

            var level = (dash.current_level || dash.level || 'bronze').toLowerCase();
            var lc = LEVEL_CONFIG[level] || LEVEL_CONFIG.bronze;

            var currentReferrals = dash.referrals_count || dash.current_referrals || 0;
            var nextThreshold = dash.next_level_threshold || dash.referrals_for_next || 0;
            var progressPct = nextThreshold > 0 ? Math.min(100, Math.round((currentReferrals / nextThreshold) * 100)) : 100;

            var balance = dash.balance != null ? Number(dash.balance) : 0;
            var totalEarned = dash.total_earned != null ? Number(dash.total_earned) : 0;

            var html = '<h2 style="margin:0 0 20px"><i data-lucide="award" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Programma Fedelt&agrave;</h2>';

            // ── Level Badge ──
            html += '<div style="background:' + lc.bg + ';border:2px solid ' + lc.color + ';border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">' +
                '<div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:' + lc.color + ';color:#fff;font-size:32px;font-weight:700;line-height:72px;margin-bottom:12px">' +
                    '<i data-lucide="award" style="width:36px;height:36px;vertical-align:middle"></i>' +
                '</div>' +
                '<div style="font-size:24px;font-weight:700;color:' + lc.color + '">' + lc.label + '</div>' +
                '<div style="font-size:13px;color:#666;margin-top:6px">Livello attuale</div>' +
                '</div>';

            // ── Progress Bar ──
            if (nextThreshold > 0 && level !== 'gold') {
                var nextLevel = level === 'bronze' ? 'Silver' : 'Gold';
                html += '<div style="margin-bottom:24px">' +
                    '<div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:6px">' +
                        '<span>Referral: ' + currentReferrals + ' / ' + nextThreshold + '</span>' +
                        '<span>Prossimo livello: <strong>' + nextLevel + '</strong></span>' +
                    '</div>' +
                    '<div style="background:#e9ecef;border-radius:8px;height:24px;overflow:hidden">' +
                        '<div style="background:linear-gradient(90deg,' + lc.color + ',' + lc.color + 'cc);height:100%;width:' + progressPct + '%;border-radius:8px;transition:width 0.5s ease;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600">' +
                            (progressPct > 15 ? progressPct + '%' : '') +
                        '</div>' +
                    '</div>' +
                    '</div>';
            } else if (level === 'gold') {
                html += '<div style="text-align:center;margin-bottom:24px;padding:12px;background:#fffbe6;border-radius:10px;color:#b8860b;font-weight:600">' +
                    '<i data-lucide="star" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"></i>Hai raggiunto il livello massimo!</div>';
            }

            // ── Balance & Earnings ──
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px">' +
                _kpiCard('Saldo Attuale', '\u20AC ' + balance.toFixed(2), '#4A90D9') +
                _kpiCard('Totale Guadagnato', '\u20AC ' + totalEarned.toFixed(2), '#27AE60') +
                _kpiCard('Referral Totali', currentReferrals, '#8E44AD') +
                '</div>';

            // ── Fee History Table ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="receipt" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Storico Compensi</h3>';

            if (!fees.length) {
                html += '<p style="color:#888">Nessun compenso registrato.</p>';
            } else {
                html += '<div style="overflow-x:auto">' +
                    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
                    '<thead><tr style="background:#f5f7fa;text-align:left">' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Data</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Descrizione</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:right">Importo</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Stato</th>' +
                    '</tr></thead><tbody>';

                for (var i = 0; i < fees.length; i++) {
                    var f = fees[i];
                    var bgRow = i % 2 === 0 ? '#fff' : '#fafbfc';
                    var amount = f.amount != null ? Number(f.amount) : 0;
                    var statusColor = _feeStatusColor(f.status);
                    html += '<tr style="background:' + bgRow + '">' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;white-space:nowrap">' + _escSafe(f.date || f.created_at || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee">' + _escSafe(f.description || f.referral_name || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#28a745">\u20AC ' + amount.toFixed(2) + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">' +
                            '<span style="background:' + statusColor.bg + ';color:' + statusColor.text + ';font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600">' +
                            _escSafe(_feeStatusLabel(f.status)) + '</span></td>' +
                    '</tr>';
                }

                html += '</tbody></table></div>';
            }

            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento fedelt&agrave;: ' + _escSafe(e.message) + '</div>';
        }
    }

    // ── Helpers ──
    function _kpiCard(label, value, color) {
        return '<div style="background:' + color + ';color:#fff;padding:16px;border-radius:12px;text-align:center">' +
            '<div style="font-size:24px;font-weight:700">' + value + '</div>' +
            '<div style="font-size:11px;opacity:0.9;margin-top:2px">' + label + '</div></div>';
    }

    function _feeStatusColor(status) {
        switch ((status || '').toLowerCase()) {
            case 'paid': case 'pagato': return { bg: '#d4edda', text: '#155724' };
            case 'pending': case 'in_attesa': return { bg: '#fff3cd', text: '#856404' };
            case 'cancelled': case 'annullato': return { bg: '#f8d7da', text: '#721c24' };
            default: return { bg: '#e2e3e5', text: '#383d41' };
        }
    }

    function _feeStatusLabel(status) {
        switch ((status || '').toLowerCase()) {
            case 'paid': return 'Pagato';
            case 'pending': return 'In Attesa';
            case 'cancelled': return 'Annullato';
            case 'pagato': return 'Pagato';
            case 'in_attesa': return 'In Attesa';
            case 'annullato': return 'Annullato';
            default: return status || '—';
        }
    }

    // ── Export ──
    global.loadLoyaltyDashboard = loadLoyaltyDashboard;
})(window);
