/**
 * app-developer.js — API Keys & Webhooks management (vet_ext)
 * ADA v9.3.2 — B2B Phase 4
 */
(function(global) {
    'use strict';

    function loadDeveloperPage() {
        var container = document.getElementById('page-developer');
        if (!container) return;

        container.innerHTML =
            '<div class="page-header"><h2 style="font-size:18px;color:#1e3a5f;">🔑 API & Webhook</h2></div>' +
            '<div class="card" style="margin-bottom:16px;">' +
            '  <h3 style="font-size:15px;margin-bottom:12px;">Le mie API Key</h3>' +
            '  <div id="developer-keys-list">Caricamento...</div>' +
            '  <button class="btn btn-primary" style="margin-top:12px;" onclick="_developerCreateKey()">+ Genera nuova key</button>' +
            '</div>' +
            '<div class="card">' +
            '  <h3 style="font-size:15px;margin-bottom:12px;">Webhook</h3>' +
            '  <div id="developer-webhooks-list">Caricamento...</div>' +
            '  <button class="btn btn-primary" style="margin-top:12px;" onclick="_developerCreateWebhook()">+ Registra webhook</button>' +
            '</div>';

        _loadKeys();
        _loadWebhooks();
    }

    function _loadKeys() {
        var el = document.getElementById('developer-keys-list');
        if (!el || typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/keys').then(function(r) { return r.ok ? r.json() : { keys: [] }; })
            .then(function(data) {
                var keys = data.keys || [];
                if (keys.length === 0) {
                    el.innerHTML = '<p style="color:#888;">Nessuna API key generata.</p>';
                    return;
                }
                var html = '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
                html += '<tr style="border-bottom:2px solid #e8e8e8;"><th style="text-align:left;padding:8px;">Prefisso</th><th>Stato</th><th>Creata</th><th></th></tr>';
                keys.forEach(function(k) {
                    html += '<tr style="border-bottom:1px solid #f0f0f0;">';
                    html += '<td style="padding:8px;font-family:monospace;">' + _escapeHtml(k.api_key_prefix || '***') + '...</td>';
                    html += '<td style="padding:8px;text-align:center;">' + (k.status === 'active' ? '🟢' : '🔴') + ' ' + _escapeHtml(k.status || '') + '</td>';
                    html += '<td style="padding:8px;">' + (k.created_at ? new Date(k.created_at).toLocaleDateString('it-IT') : '') + '</td>';
                    html += '<td style="padding:8px;"><button class="btn btn-ghost" style="font-size:11px;color:#d32f2f;" onclick="_developerRevokeKey(\'' + k.key_id + '\')">Revoca</button></td>';
                    html += '</tr>';
                });
                html += '</table>';
                el.innerHTML = html;
            })
            .catch(function() { el.innerHTML = '<p style="color:#d32f2f;">Errore nel caricamento delle API key.</p>'; });
    }

    function _loadWebhooks() {
        var el = document.getElementById('developer-webhooks-list');
        if (!el || typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/webhooks').then(function(r) { return r.ok ? r.json() : { webhooks: [] }; })
            .then(function(data) {
                var hooks = data.webhooks || [];
                if (hooks.length === 0) {
                    el.innerHTML = '<p style="color:#888;">Nessun webhook registrato.</p>';
                    return;
                }
                var html = '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
                html += '<tr style="border-bottom:2px solid #e8e8e8;"><th style="text-align:left;padding:8px;">URL</th><th>Stato</th><th>Eventi</th><th></th></tr>';
                hooks.forEach(function(h) {
                    var events = Array.isArray(h.events) ? h.events.join(', ') : (h.events || '');
                    html += '<tr style="border-bottom:1px solid #f0f0f0;">';
                    html += '<td style="padding:8px;font-size:12px;word-break:break-all;">' + _escapeHtml(h.url || '') + '</td>';
                    html += '<td style="padding:8px;text-align:center;">' + (h.status === 'active' ? '🟢' : '🔴') + '</td>';
                    html += '<td style="padding:8px;font-size:11px;">' + _escapeHtml(events) + '</td>';
                    html += '<td style="padding:8px;"><button class="btn btn-ghost" style="font-size:11px;color:#d32f2f;" onclick="_developerDeleteWebhook(\'' + h.webhook_id + '\')">Rimuovi</button></td>';
                    html += '</tr>';
                });
                html += '</table>';
                el.innerHTML = html;
            })
            .catch(function() { el.innerHTML = '<p style="color:#d32f2f;">Errore nel caricamento webhook.</p>'; });
    }

    function _developerCreateKey() {
        var name = prompt('Nome per la nuova API key (opzionale):');
        if (name === null) return; // cancelled
        if (typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name || 'default' })
        }).then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
              if (data && data.api_key) {
                  alert('API Key generata (salvala ora, non sarà più visibile):\n\n' + data.api_key);
              }
              _loadKeys();
          })
          .catch(function() { if (typeof showToast === 'function') showToast('Errore nella generazione della key', 'error'); });
    }

    function _developerRevokeKey(keyId) {
        if (!confirm('Revocare questa API key? L\'operazione è irreversibile.')) return;
        if (typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/keys/' + encodeURIComponent(keyId) + '/revoke', { method: 'DELETE' })
            .then(function(r) {
                if (r.ok) { if (typeof showToast === 'function') showToast('API key revocata', 'success'); }
                _loadKeys();
            })
            .catch(function() { if (typeof showToast === 'function') showToast('Errore nella revoca', 'error'); });
    }

    function _developerCreateWebhook() {
        var url = prompt('URL del webhook (https://...):');
        if (!url) return;
        if (typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, events: ['referral.status_changed', 'result.ready', 'appointment.confirmed'] })
        }).then(function(r) {
            if (r.ok) { if (typeof showToast === 'function') showToast('Webhook registrato', 'success'); }
            else { if (typeof showToast === 'function') showToast('Errore nella registrazione', 'error'); }
            _loadWebhooks();
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Errore nella registrazione webhook', 'error'); });
    }

    function _developerDeleteWebhook(webhookId) {
        if (!confirm('Rimuovere questo webhook?')) return;
        if (typeof fetchApi !== 'function') return;
        fetchApi('/api/developer/webhooks/' + encodeURIComponent(webhookId), { method: 'DELETE' })
            .then(function(r) {
                if (r.ok) { if (typeof showToast === 'function') showToast('Webhook rimosso', 'success'); }
                _loadWebhooks();
            })
            .catch(function() { if (typeof showToast === 'function') showToast('Errore nella rimozione', 'error'); });
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Expose
    global.loadDeveloperPage = loadDeveloperPage;
    global._developerCreateKey = _developerCreateKey;
    global._developerRevokeKey = _developerRevokeKey;
    global._developerCreateWebhook = _developerCreateWebhook;
    global._developerDeleteWebhook = _developerDeleteWebhook;

})(typeof window !== 'undefined' ? window : this);
