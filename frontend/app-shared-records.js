// frontend/app-shared-records.js v1
// B2B Phase 2: Shared clinical records viewer

(function(global) {
    'use strict';

    async function loadSharedRecords() {
        var page = document.getElementById('page-shared-records');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento cartella condivisa...</p></div>';

        // Get petId from current pet selector or URL param
        var petId = typeof getCurrentPetId === 'function' ? getCurrentPetId() : null;
        if (!petId) {
            page.innerHTML = '<h2 style="margin:0 0 16px">Cartella Clinica Condivisa</h2><p style="color:#666">Seleziona un paziente per visualizzare i documenti condivisi.</p>';
            return;
        }

        try {
            var resp = await fetch(API_BASE_URL + '/api/shared-records/documents/' + petId, {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var docs = data.documents || [];

            var html = '<h2 style="margin:0 0 16px">Cartella Clinica Condivisa</h2>';

            if (!docs.length) {
                html += '<p style="color:#666">Nessun documento condiviso per questo paziente.</p>';
            } else {
                for (var i = 0; i < docs.length; i++) {
                    var d = docs[i];
                    var typeLabel = { generic:'Generico', lab_result:'Risultato Lab', radiology:'Radiologia', ecg:'ECG', echo:'Ecocardiografia', histology:'Istologia', referral_report:'Report Referral', discharge_summary:'Dimissione', prescription:'Prescrizione', certificate:'Certificato' };
                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px;margin-bottom:8px">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                            '<div>' +
                                '<strong>' + (d.title || 'Documento') + '</strong>' +
                                '<span style="background:#4A90D9;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px">' + (typeLabel[d.document_type] || d.document_type) + '</span>' +
                                (d.description ? '<div style="color:#666;font-size:13px;margin-top:2px">' + d.description + '</div>' : '') +
                                '<div style="color:#888;font-size:12px;margin-top:2px">Caricato da: ' + (d.uploaded_by_name || d.uploaded_by_role || '—') + ' &middot; ' + (d.created_at ? new Date(d.created_at).toLocaleDateString('it-IT') : '') + '</div>' +
                            '</div>' +
                            '<a href="' + API_BASE_URL + '/api/shared-records/documents/download/' + d.shared_doc_id + '" target="_blank" style="background:#4A90D9;color:#fff;padding:6px 14px;border-radius:8px;text-decoration:none;font-size:13px;white-space:nowrap">Scarica</a>' +
                        '</div>' +
                    '</div>';
                }
            }
            page.innerHTML = html;
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore: ' + e.message + '</div>';
        }
    }

    global.loadSharedRecords = loadSharedRecords;
})(window);
