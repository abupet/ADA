// frontend/app-teleconsult.js v1
// B2B Phase 2: Teleconsult session viewer

(function(global) {
    'use strict';

    async function loadTeleconsultPage() {
        var page = document.getElementById('page-teleconsult');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento teleconsulti...</p></div>';

        try {
            var resp = await fetch(API_BASE_URL + '/api/teleconsult/sessions', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var sessions = data.sessions || [];

            var isVetExt = typeof getJwtRole === 'function' && getJwtRole() === 'vet_ext';

            var html = '<h2 style="margin:0 0 16px">Teleconsulti Specialistici</h2>';
            if (isVetExt) {
                html += '<button class="btn" onclick="_showRequestTeleconsultModal()" style="background:#4A90D9;color:#fff;margin-bottom:16px">+ Richiedi Teleconsulto</button>';
            }

            if (!sessions.length) {
                html += '<p style="color:#666">Nessun teleconsulto registrato.</p>';
            } else {
                var statusColors = { requested:'#F39C12', scheduled:'#3498DB', in_progress:'#27AE60', completed:'#95A5A6', cancelled:'#E74C3C', no_show:'#8B4513' };
                var statusLabels = { requested:'Richiesto', scheduled:'Programmato', in_progress:'In corso', completed:'Completato', cancelled:'Annullato', no_show:'Non presentato' };

                for (var i = 0; i < sessions.length; i++) {
                    var s = sessions[i];
                    var sColor = statusColors[s.status] || '#95A5A6';
                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px;margin-bottom:8px">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                            '<div>' +
                                '<strong>' + (s.specialty || 'Teleconsulto') + '</strong>' +
                                '<span style="background:' + sColor + ';color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px">' + (statusLabels[s.status] || s.status) + '</span>' +
                                (s.pet_name ? '<div style="color:#666;font-size:13px;margin-top:2px">Paziente: ' + s.pet_name + '</div>' : '') +
                                (s.reason ? '<div style="color:#888;font-size:12px;margin-top:2px">' + s.reason + '</div>' : '') +
                            '</div>' +
                            '<div style="text-align:right;color:#666;font-size:13px">' +
                                (s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('it-IT') : '') +
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

    function _showRequestTeleconsultModal() {
        if (typeof showToast === 'function') showToast('Funzionalità in arrivo', 'info');
    }

    global.loadTeleconsultPage = loadTeleconsultPage;
    global._showRequestTeleconsultModal = _showRequestTeleconsultModal;
})(window);
