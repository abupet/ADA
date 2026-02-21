// frontend/app-breeder.js v1
// B2B Phase 1: Breeder dashboard + litter management

(function(global) {
    'use strict';

    // ── Dashboard ──
    async function loadBreederDashboard() {
        var page = document.getElementById('page-breeder-dashboard');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento dashboard...</p></div>';

        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/dashboard', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();

            page.innerHTML =
                '<h2 style="margin:0 0 20px">Dashboard Allevamento</h2>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">' +
                    _kpi('Animali', data.pets?.total || 0, '#4A90D9') +
                    _kpi('Disponibili', data.pets?.available || 0, '#27AE60') +
                    _kpi('Venduti', data.pets?.sold || 0, '#8E44AD') +
                    _kpi('Cucciolate', data.litters?.total || 0, '#E67E22') +
                    _kpi('In gravidanza', data.litters?.pregnant || 0, '#E74C3C') +
                    _kpi('Vaccini 30gg', data.vaccinations_due_30d || 0, '#F39C12') +
                    _kpi('Programmi', data.active_program_enrollments || 0, '#16A085') +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                    '<button class="btn" onclick="navigateToPage(\'breeder-litters\')" style="background:#4A90D9;color:#fff">Gestione Cucciolate</button>' +
                    '<button class="btn" onclick="navigateToPage(\'booking\')" style="background:#27AE60;color:#fff">Prenota Servizi</button>' +
                    '<button class="btn" onclick="navigateToPage(\'patient\')" style="background:#8E44AD;color:#fff">I miei Animali</button>' +
                '</div>';
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento: ' + e.message + '</div>';
        }
    }

    function _kpi(label, value, color) {
        return '<div style="background:' + color + ';color:#fff;padding:16px;border-radius:12px;text-align:center">' +
            '<div style="font-size:28px;font-weight:700">' + value + '</div>' +
            '<div style="font-size:12px;opacity:0.9;margin-top:4px">' + label + '</div></div>';
    }

    // ── Litters ──
    async function loadBreederLitters() {
        var page = document.getElementById('page-breeder-litters');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento cucciolate...</p></div>';

        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/litters', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var litters = data.litters || [];

            var html = '<h2 style="margin:0 0 16px">Gestione Cucciolate</h2>' +
                '<button class="btn" onclick="_showNewLitterModal()" style="background:#4A90D9;color:#fff;margin-bottom:16px">+ Nuova Cucciolata</button>';

            if (!litters.length) {
                html += '<p style="color:#666">Nessuna cucciolata registrata.</p>';
            } else {
                for (var i = 0; i < litters.length; i++) {
                    var l = litters[i];
                    html += '<div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin-bottom:12px">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
                            '<div>' +
                                '<strong>' + (l.breed || l.species || 'Cucciolata') + '</strong> ' + _statusBadge(l.status) +
                                '<div style="color:#666;font-size:13px;margin-top:4px">' +
                                    'Madre: ' + (l.mother_name || '—') + ' &middot; Cuccioli: ' + (l.puppy_count || 0) +
                                    ' (Disp: ' + (l.available_count || 0) + ', Venduti: ' + (l.sold_count || 0) + ')' +
                                '</div>' +
                                (l.expected_birth_date ? '<div style="color:#888;font-size:12px">Parto previsto: ' + l.expected_birth_date + '</div>' : '') +
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

    function _statusBadge(status) {
        var m = { planned: ['Pianificata','#95A5A6'], pregnant: ['In gravidanza','#E74C3C'], born: ['Nati','#27AE60'],
                   weaning: ['Svezzamento','#F39C12'], available: ['In vendita','#3498DB'], sold_out: ['Tutto venduto','#8E44AD'], archived: ['Archiviata','#BDC3C7'] };
        var s = m[status] || ['?','#95A5A6'];
        return '<span style="background:' + s[1] + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px">' + s[0] + '</span>';
    }

    function _showNewLitterModal() {
        _closeBreederModal();
        var overlay = document.createElement('div');
        overlay.id = 'breeder-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = function(e) { if (e.target === overlay) _closeBreederModal(); };

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        modal.innerHTML =
            '<h3 style="margin:0 0 16px;color:#1e3a5f">Nuova Cucciolata</h3>' +
            '<div style="display:flex;flex-direction:column;gap:12px">' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Specie *</label>' +
                '<select id="litter-species" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px">' +
                    '<option value="dog">Cane</option><option value="cat">Gatto</option></select></div>' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Razza</label>' +
                '<input id="litter-breed" type="text" placeholder="Es: Labrador Retriever" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box"></div>' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Data accoppiamento</label>' +
                '<input id="litter-mating-date" type="date" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box"></div>' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Data parto prevista</label>' +
                '<input id="litter-expected-birth" type="date" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box"></div>' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Cuccioli previsti</label>' +
                '<input id="litter-expected-puppies" type="number" min="1" max="20" placeholder="Es: 6" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box"></div>' +
                '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Note</label>' +
                '<textarea id="litter-notes" rows="2" placeholder="Note aggiuntive" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box"></textarea></div>' +
                '<div style="display:flex;gap:8px;margin-top:8px">' +
                    '<button onclick="_submitNewLitter()" style="flex:1;padding:10px;background:#4A90D9;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Crea Cucciolata</button>' +
                    '<button onclick="_closeBreederModal()" style="flex:1;padding:10px;background:#e0e0e0;color:#333;border:none;border-radius:8px;cursor:pointer">Annulla</button>' +
                '</div>' +
            '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function _closeBreederModal() {
        var overlay = document.getElementById('breeder-modal-overlay');
        if (overlay) overlay.remove();
    }

    async function _submitNewLitter() {
        var species = document.getElementById('litter-species')?.value || 'dog';
        var breed = document.getElementById('litter-breed')?.value || null;
        var mating_date = document.getElementById('litter-mating-date')?.value || null;
        var expected_birth_date = document.getElementById('litter-expected-birth')?.value || null;
        var expected_puppies = parseInt(document.getElementById('litter-expected-puppies')?.value) || null;
        var notes = document.getElementById('litter-notes')?.value || null;

        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/litters', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ species: species, breed: breed, mating_date: mating_date, expected_birth_date: expected_birth_date, expected_puppies: expected_puppies, notes: notes })
            });
            if (!resp.ok) { var errData = await resp.json().catch(function() { return {}; }); throw new Error(errData.error || 'Errore ' + resp.status); }
            _closeBreederModal();
            if (typeof showToast === 'function') showToast('Cucciolata creata con successo!', 'success');
            loadBreederLitters();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        }
    }

    // ── Phase 2: Litter Milestones ──

    var _currentMilestoneLitterId = null;

    async function loadLitterMilestones(litterId) {
        if (litterId) _currentMilestoneLitterId = litterId;
        var lid = _currentMilestoneLitterId;
        var page = document.getElementById('page-breeder-milestones');
        if (!page) return;
        if (!lid) { page.innerHTML = '<p style="color:#666;padding:16px">Seleziona una cucciolata dalla pagina Cucciolate.</p>'; return; }
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento milestone...</p></div>';

        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/litters/' + lid + '/milestones', {
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var data = await resp.json();
            var milestones = data.milestones || [];

            var html = '<h2 style="margin:0 0 16px">Milestone Cucciolata</h2>' +
                '<button class="btn" onclick="_generateMilestones(\'' + lid + '\')" style="background:#4A90D9;color:#fff;margin-bottom:16px">Genera Milestone da Template</button>';

            if (!milestones.length) {
                html += '<p style="color:#666">Nessuna milestone. Usa il pulsante sopra per generarle automaticamente.</p>';
            } else {
                for (var i = 0; i < milestones.length; i++) {
                    var m = milestones[i];
                    var statusColor = m.status === 'completed' ? '#27AE60' : m.status === 'overdue' ? '#E74C3C' : m.status === 'skipped' ? '#95A5A6' : '#F39C12';
                    html += '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px;border-left:4px solid ' + statusColor + '">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                            '<div><strong>' + (m.title || '') + '</strong>' +
                                '<span style="background:' + statusColor + ';color:#fff;padding:2px 6px;border-radius:8px;font-size:10px;margin-left:8px">' + (m.status || '') + '</span>' +
                            '</div>' +
                            '<div style="font-size:12px;color:#888">' + (m.due_date || '') + '</div>' +
                        '</div>' +
                        (m.description ? '<div style="font-size:13px;color:#666;margin-top:4px">' + m.description + '</div>' : '') +
                        (m.status !== 'completed' && m.status !== 'skipped' ? '<button onclick="_completeMilestone(\'' + m.milestone_id + '\')" style="margin-top:6px;padding:4px 12px;background:#27AE60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">Completa</button>' : '') +
                    '</div>';
                }
            }
            page.innerHTML = html;
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore: ' + e.message + '</div>';
        }
    }

    async function _generateMilestones(litterId) {
        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/litters/' + litterId + '/generate-milestones', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' }
            });
            if (!resp.ok) { var errData = await resp.json().catch(function() { return {}; }); throw new Error(errData.error || 'Errore ' + resp.status); }
            var data = await resp.json();
            if (typeof showToast === 'function') showToast('Generate ' + (data.count || 0) + ' milestone!', 'success');
            loadLitterMilestones(litterId);
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        }
    }

    async function _completeMilestone(milestoneId) {
        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/milestones/' + milestoneId, {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed', completed_date: new Date().toISOString().slice(0, 10) })
            });
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            if (typeof showToast === 'function') showToast('Milestone completata!', 'success');
            loadLitterMilestones();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore: ' + e.message, 'error');
        }
    }

    // ── Phase 2: Health Passport ──

    async function generatePassport(petId) {
        try {
            var resp = await fetch(API_BASE_URL + '/api/breeder/pets/' + petId + '/passport/generate', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' }
            });
            if (!resp.ok) { var errData = await resp.json().catch(function() { return {}; }); throw new Error(errData.error || 'Errore ' + resp.status); }
            var data = await resp.json();
            if (typeof showToast === 'function') showToast('Passaporto sanitario generato!', 'success');
            return data.passport;
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore passaporto: ' + e.message, 'error');
            return null;
        }
    }

    global.loadBreederDashboard = loadBreederDashboard;
    global.loadBreederLitters = loadBreederLitters;
    global._showNewLitterModal = _showNewLitterModal;
    global._closeBreederModal = _closeBreederModal;
    global._submitNewLitter = _submitNewLitter;
    global.loadLitterMilestones = loadLitterMilestones;
    global._generateMilestones = _generateMilestones;
    global._completeMilestone = _completeMilestone;
    global.generatePassport = generatePassport;

})(window);
