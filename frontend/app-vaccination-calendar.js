// frontend/app-vaccination-calendar.js v1
// B2B Phase 3: Vaccination calendar with urgency color coding

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Main ──
    async function loadVaccinationCalendar() {
        var page = document.getElementById('page-vaccination-calendar');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento calendario vaccinazioni...</p></div>';

        try {
            var resp = await fetchApi('/api/vaccinations/calendar?days=90');
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var vaccinations = data.vaccinations || data.items || [];

            var html = '<h2 style="margin:0 0 20px"><i data-lucide="syringe" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Calendario Vaccinazioni</h2>';

            if (!vaccinations.length) {
                html += '<div style="text-align:center;padding:40px 20px;color:#888">' +
                    '<i data-lucide="calendar-check" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5"></i>' +
                    '<p style="font-size:16px;margin:0">Nessuna vaccinazione prevista nei prossimi 90 giorni.</p>' +
                    '<p style="font-size:13px;margin-top:8px;color:#aaa">Ottimo! I tuoi animali sono in regola.</p>' +
                    '</div>';
                page.innerHTML = html;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // Sort by days remaining ascending
            vaccinations.sort(function(a, b) {
                return (a.days_remaining || 0) - (b.days_remaining || 0);
            });

            // Summary counts
            var urgent = 0, soon = 0, scheduled = 0;
            for (var k = 0; k < vaccinations.length; k++) {
                var dr = vaccinations[k].days_remaining;
                if (dr != null && dr <= 7) urgent++;
                else if (dr != null && dr <= 30) soon++;
                else scheduled++;
            }

            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:24px">' +
                _kpiCard('Urgenti', urgent, '#dc3545') +
                _kpiCard('Entro 30gg', soon, '#fd7e14') +
                _kpiCard('Programmati', scheduled, '#28a745') +
                '</div>';

            // Cards
            for (var i = 0; i < vaccinations.length; i++) {
                var v = vaccinations[i];
                var days = v.days_remaining != null ? v.days_remaining : 999;
                var color, bgColor, label;
                if (days <= 7) {
                    color = '#dc3545'; bgColor = '#fff5f5'; label = 'Urgente';
                } else if (days <= 30) {
                    color = '#fd7e14'; bgColor = '#fff8f0'; label = 'Prossimo';
                } else {
                    color = '#28a745'; bgColor = '#f0fff4'; label = 'Programmato';
                }

                var dueDate = v.due_date || v.scheduled_date || '—';
                var daysText = days === 0 ? 'Oggi' : days === 1 ? 'Domani' : days + ' giorni';

                html += '<div style="border:1px solid ' + color + '33;border-left:4px solid ' + color + ';border-radius:10px;padding:14px 16px;margin-bottom:10px;background:' + bgColor + '">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
                        '<div>' +
                            '<div style="font-weight:600;font-size:15px;color:#333">' +
                                '<i data-lucide="syringe" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;color:' + color + '"></i>' +
                                _escSafe(v.vaccine_name || v.name || 'Vaccinazione') +
                            '</div>' +
                            '<div style="font-size:13px;color:#666;margin-top:4px">' +
                                '<i data-lucide="paw-print" style="width:13px;height:13px;vertical-align:middle;margin-right:3px"></i>' +
                                _escSafe(v.pet_name || '—') +
                            '</div>' +
                        '</div>' +
                        '<div style="text-align:right">' +
                            '<span style="background:' + color + ';color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;text-transform:uppercase">' + label + '</span>' +
                            '<div style="font-size:13px;color:#666;margin-top:6px">' +
                                '<i data-lucide="calendar" style="width:13px;height:13px;vertical-align:middle;margin-right:3px"></i>' +
                                _escSafe(dueDate) +
                            '</div>' +
                            '<div style="font-size:14px;font-weight:600;color:' + color + ';margin-top:2px">' + daysText + '</div>' +
                        '</div>' +
                    '</div>' +
                    (v.notes ? '<div style="font-size:12px;color:#888;margin-top:8px;border-top:1px solid #eee;padding-top:8px">' + _escSafe(v.notes) + '</div>' : '') +
                    '</div>';
            }

            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento calendario: ' + _escSafe(e.message) + '</div>';
        }
    }

    function _kpiCard(label, value, color) {
        return '<div style="background:' + color + ';color:#fff;padding:14px;border-radius:10px;text-align:center">' +
            '<div style="font-size:26px;font-weight:700">' + value + '</div>' +
            '<div style="font-size:11px;opacity:0.9;margin-top:2px">' + label + '</div></div>';
    }

    // ── Export ──
    global.loadVaccinationCalendar = loadVaccinationCalendar;
})(window);
