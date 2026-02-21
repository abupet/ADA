// frontend/app-booking.js v1
// B2B Phase 1: Online booking page

(function(global) {
    'use strict';

    async function loadBookingPage() {
        var page = document.getElementById('page-booking');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento servizi...</p></div>';

        try {
            var resp = await fetch(API_BASE_URL + '/api/booking/services', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var services = data.services || [];

            var html = '<h2 style="margin:0 0 16px">Prenota un Servizio</h2>';

            // Group by category
            var categories = {};
            for (var i = 0; i < services.length; i++) {
                var s = services[i];
                var cat = s.category || 'other';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(s);
            }

            var catLabels = { visit: 'Visite', diagnostic: 'Diagnostica', surgery: 'Chirurgia', vaccination: 'Vaccinazioni', screening: 'Screening', teleconsult: 'Teleconsulto', other: 'Altro' };
            var catOrder = ['visit', 'vaccination', 'screening', 'diagnostic', 'surgery', 'teleconsult', 'other'];

            for (var ci = 0; ci < catOrder.length; ci++) {
                var catKey = catOrder[ci];
                var items = categories[catKey];
                if (!items || !items.length) continue;
                html += '<h3 style="margin:20px 0 8px;color:#555">' + (catLabels[catKey] || catKey) + '</h3>';
                for (var j = 0; j < items.length; j++) {
                    var svc = items[j];
                    var priceStr = svc.display_price != null ? ('\u20AC ' + Number(svc.display_price).toFixed(2)) : 'Da definire';
                    var durStr = svc.duration_minutes ? svc.duration_minutes + ' min' : '';
                    var refTag = svc.requires_referral ? '<span style="background:#E74C3C;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px">Richiede referral</span>' : '';
                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                        '<div>' +
                            '<strong>' + svc.name + '</strong>' + refTag +
                            (svc.description ? '<div style="color:#666;font-size:13px;margin-top:2px">' + svc.description + '</div>' : '') +
                        '</div>' +
                        '<div style="text-align:right;white-space:nowrap">' +
                            '<div style="font-weight:600;color:#4A90D9">' + priceStr + '</div>' +
                            '<div style="font-size:12px;color:#888">' + durStr + '</div>' +
                        '</div>' +
                    '</div>';
                }
            }

            if (!services.length) html += '<p style="color:#666">Nessun servizio disponibile.</p>';

            // My appointments section
            html += '<h2 style="margin:32px 0 12px">I miei Appuntamenti</h2><div id="booking-appointments-list"></div>';
            page.innerHTML = html;

            // Load appointments
            _loadMyAppointments();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore: ' + e.message + '</div>';
        }
    }

    async function _loadMyAppointments() {
        var container = document.getElementById('booking-appointments-list');
        if (!container) return;
        try {
            var resp = await fetch(API_BASE_URL + '/api/booking/appointments', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) { container.innerHTML = '<p style="color:#999">Impossibile caricare appuntamenti.</p>'; return; }
            var data = await resp.json();
            var appts = data.appointments || [];
            if (!appts.length) { container.innerHTML = '<p style="color:#999">Nessun appuntamento.</p>'; return; }

            var html = '';
            for (var i = 0; i < appts.length; i++) {
                var a = appts[i];
                var statusColors = { confirmed: '#27AE60', pending: '#F39C12', completed: '#4A90D9', cancelled: '#E74C3C', no_show: '#95A5A6' };
                var statusColor = statusColors[a.status] || '#95A5A6';
                html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:12px;margin-bottom:8px">' +
                    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">' +
                        '<div><strong>' + (a.service_name || 'Servizio') + '</strong> \u2014 ' + (a.pet_name || '') +
                            '<span style="background:' + statusColor + ';color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px">' + a.status + '</span></div>' +
                        '<div style="color:#666;font-size:13px">' + (a.appointment_date || '') + ' ' + (a.appointment_time || '') + '</div>' +
                    '</div>' +
                '</div>';
            }
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<p style="color:#999">Errore: ' + e.message + '</p>';
        }
    }

    global.loadBookingPage = loadBookingPage;

})(window);
