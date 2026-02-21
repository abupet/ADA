// frontend/app-knowledge.js v1
// Veterinary Knowledge Base UI (super_admin only)

var _knowledgeBooks = [];
var _knowledgeCategories = [];
var _knowledgeStats = null;
var _knowledgeActiveTab = 'books';

function initKnowledgePage() {
    var container = document.getElementById('superadmin-knowledge-content');
    if (!container) return;

    container.innerHTML =
        '<div style="display:flex;gap:10px;margin-bottom:16px;">' +
            '<button class="btn btn-primary" onclick="_knowledgeSwitchTab(\'books\')" id="kb-tab-books">Libri</button>' +
            '<button class="btn btn-secondary" onclick="_knowledgeSwitchTab(\'search\')" id="kb-tab-search">Test Ricerca RAG</button>' +
            '<button class="btn btn-secondary" onclick="_knowledgeSwitchTab(\'log\')" id="kb-tab-log">Log Query</button>' +
        '</div>' +
        '<div id="kb-stats-area"></div>' +
        '<div id="kb-content-area"><p style="color:#888;">Caricamento...</p></div>';

    _knowledgeSwitchTab('books');
}

function _knowledgeSwitchTab(tab) {
    _knowledgeActiveTab = tab;
    ['books','search','log'].forEach(function(t) {
        var el = document.getElementById('kb-tab-' + t);
        if (el) el.className = t === tab ? 'btn btn-primary' : 'btn btn-secondary';
    });
    if (tab === 'books') {
        _loadKnowledgeAll();
    } else if (tab === 'search') {
        _renderKnowledgeSearch();
    } else if (tab === 'log') {
        _loadKnowledgeQueryLog();
    }
}

function _loadKnowledgeAll() {
    Promise.all([
        fetchApi('/api/superadmin/knowledge/stats').then(function(r) { return r.ok ? r.json() : null; }),
        fetchApi('/api/superadmin/knowledge/books').then(function(r) { return r.ok ? r.json() : { books: [] }; }),
        fetchApi('/api/superadmin/knowledge/categories').then(function(r) { return r.ok ? r.json() : { categories: [] }; })
    ]).then(function(results) {
        _knowledgeStats = results[0];
        _knowledgeBooks = (results[1] && results[1].books) || [];
        _knowledgeCategories = (results[2] && results[2].categories) || [];
        _renderKnowledgeDashboard();
        _renderKnowledgeBooksTable();
    }).catch(function() {
        var area = document.getElementById('kb-content-area');
        if (area) area.innerHTML = '<p style="color:#e74c3c;">Errore nel caricamento dei dati</p>';
    });
}

function _renderKnowledgeDashboard() {
    var area = document.getElementById('kb-stats-area');
    if (!area || !_knowledgeStats) return;

    var b = _knowledgeStats.books || {};
    var c = _knowledgeStats.chunks || {};
    var q = _knowledgeStats.queries_30d || {};

    area.innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">' +
            _statCard('Libri', b.total_books || 0, 'Attivi: ' + (b.active_books || 0)) +
            _statCard('Ready', b.ready_books || 0, 'In errore: ' + (b.error_books || 0)) +
            _statCard('Chunk', c.total_chunks || 0, 'Avg token: ' + (c.avg_chunk_tokens || 0)) +
            _statCard('Token totali', _formatNum(c.total_tokens || 0), '') +
            _statCard('Query 30gg', q.total_queries || 0, 'Latenza: ' + (q.avg_latency_ms || 0) + 'ms') +
            _statCard('Similarita media', q.avg_top_similarity || '-', '') +
        '</div>';
}

function _statCard(title, value, sub) {
    return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;">' +
        '<div style="font-size:22px;font-weight:700;color:var(--primary,#0f766e);">' + value + '</div>' +
        '<div style="font-size:12px;color:#64748b;font-weight:600;margin-top:2px;">' + title + '</div>' +
        (sub ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">' + sub + '</div>' : '') +
    '</div>';
}

function _formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function _renderKnowledgeBooksTable() {
    var area = document.getElementById('kb-content-area');
    if (!area) return;

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<h3 style="margin:0;font-size:16px;">Libri caricati (' + _knowledgeBooks.length + ')</h3>' +
        '<button class="btn btn-primary" onclick="_showKnowledgeUploadModal()">+ Carica PDF</button>' +
    '</div>';

    if (_knowledgeBooks.length === 0) {
        html += '<div style="text-align:center;padding:40px;color:#94a3b8;">Nessun libro caricato. Clicca "Carica PDF" per iniziare.</div>';
        area.innerHTML = html;
        return;
    }

    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:#f1f5f9;text-align:left;">' +
        '<th style="padding:10px;">Titolo</th>' +
        '<th style="padding:10px;">Autore</th>' +
        '<th style="padding:10px;">Categoria</th>' +
        '<th style="padding:10px;">Status</th>' +
        '<th style="padding:10px;">Chunk</th>' +
        '<th style="padding:10px;">Token</th>' +
        '<th style="padding:10px;">Attivo</th>' +
        '<th style="padding:10px;">Azioni</th>' +
        '</tr></thead><tbody>';

    for (var i = 0; i < _knowledgeBooks.length; i++) {
        var book = _knowledgeBooks[i];
        var catLabel = _getCategoryLabel(book.category);
        var statusBadge = _getStatusBadge(book.processing_status);
        var toggleChecked = book.enabled ? 'checked' : '';

        html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:10px;font-weight:600;">' + _escHtml(book.title) + '</td>' +
            '<td style="padding:10px;">' + _escHtml(book.author || '-') + '</td>' +
            '<td style="padding:10px;">' + catLabel + '</td>' +
            '<td style="padding:10px;">' + statusBadge + '</td>' +
            '<td style="padding:10px;">' + (book.chunk_count || book.total_chunks || 0) + '</td>' +
            '<td style="padding:10px;">' + _formatNum(book.total_tokens || 0) + '</td>' +
            '<td style="padding:10px;"><label class="switch" style="margin:0;"><input type="checkbox" ' + toggleChecked +
                ' onchange="_toggleKnowledgeBook(\'' + book.book_id + '\', this.checked)"><span class="slider"></span></label></td>' +
            '<td style="padding:10px;">' +
                '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="_showKnowledgeBookDetail(\'' + book.book_id + '\')">Dettaglio</button> ' +
                '<button class="btn btn-danger" style="padding:4px 10px;font-size:12px;" onclick="_deleteKnowledgeBook(\'' + book.book_id + '\')">Elimina</button>' +
            '</td>' +
        '</tr>';
    }

    html += '</tbody></table></div>';
    area.innerHTML = html;

    // Poll processing books
    _knowledgeBooks.forEach(function(b) {
        if (['pending','extracting','chunking','embedding'].indexOf(b.processing_status) !== -1) {
            _pollKnowledgeBookStatus(b.book_id);
        }
    });
}

function _getCategoryLabel(cat) {
    for (var i = 0; i < _knowledgeCategories.length; i++) {
        if (_knowledgeCategories[i].category_key === cat) {
            return '<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:8px;font-size:11px;">' +
                (_knowledgeCategories[i].icon || '') + ' ' + _knowledgeCategories[i].label_it + '</span>';
        }
    }
    return cat || 'general';
}

function _getStatusBadge(status) {
    var colors = {
        ready: 'background:#dcfce7;color:#16a34a',
        error: 'background:#fee2e2;color:#dc2626',
        pending: 'background:#f1f5f9;color:#64748b',
        extracting: 'background:#dbeafe;color:#2563eb',
        chunking: 'background:#dbeafe;color:#2563eb',
        embedding: 'background:#dbeafe;color:#2563eb'
    };
    var style = colors[status] || colors.pending;
    var label = status || 'unknown';
    if (['extracting','chunking','embedding'].indexOf(status) !== -1) label += '...';
    return '<span style="' + style + ';padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;">' + label + '</span>';
}

function _escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _showKnowledgeUploadModal() {
    var catOptions = '<option value="general">Medicina Generale</option>';
    for (var i = 0; i < _knowledgeCategories.length; i++) {
        var c = _knowledgeCategories[i];
        if (c.category_key !== 'general') {
            catOptions += '<option value="' + c.category_key + '">' + (c.icon || '') + ' ' + c.label_it + '</option>';
        }
    }

    var html = '<div class="modal active" id="kb-upload-modal" onclick="if(event.target===this)this.classList.remove(\'active\')">' +
        '<div class="modal-content" style="max-width:500px;">' +
        '<h3>Carica PDF Veterinario</h3>' +
        '<div class="form-grid" style="grid-template-columns:1fr;">' +
            '<div class="form-group"><label>File PDF *</label><input type="file" id="kb-upload-file" accept=".pdf"></div>' +
            '<div class="form-group"><label>Titolo *</label><input id="kb-upload-title" placeholder="Es: Medicina Interna del Cane e del Gatto"></div>' +
            '<div class="form-group"><label>Autore</label><input id="kb-upload-author" placeholder="Es: Nelson, Couto"></div>' +
            '<div class="form-group"><label>Categoria</label><select id="kb-upload-category">' + catOptions + '</select></div>' +
            '<div class="form-group"><label>ISBN</label><input id="kb-upload-isbn" placeholder="ISBN-13"></div>' +
            '<div class="form-group"><label>Editore</label><input id="kb-upload-publisher"></div>' +
            '<div class="form-group"><label>Anno</label><input id="kb-upload-year" type="number" placeholder="2024"></div>' +
            '<div class="form-group"><label>Descrizione</label><textarea id="kb-upload-desc" rows="2"></textarea></div>' +
        '</div>' +
        '<div id="kb-upload-progress" style="display:none;margin:12px 0;">' +
            '<div style="background:#e2e8f0;border-radius:4px;height:8px;"><div id="kb-upload-bar" style="background:var(--primary,#0f766e);height:100%;border-radius:4px;width:0%;transition:width 0.3s;"></div></div>' +
            '<p style="font-size:12px;color:#64748b;margin-top:4px;" id="kb-upload-status">Uploading...</p>' +
        '</div>' +
        '<div class="button-row" style="margin-top:16px;">' +
            '<button class="btn btn-primary" onclick="_uploadKnowledgeBook()">Carica</button>' +
            '<button class="btn btn-secondary" onclick="document.getElementById(\'kb-upload-modal\').classList.remove(\'active\')">Annulla</button>' +
        '</div>' +
        '</div></div>';

    var existing = document.getElementById('kb-upload-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

function _uploadKnowledgeBook() {
    var fileInput = document.getElementById('kb-upload-file');
    var title = document.getElementById('kb-upload-title');
    if (!fileInput || !fileInput.files[0]) { showToast('Seleziona un file PDF', 'error'); return; }
    if (!title || !title.value.trim()) { showToast('Il titolo e obbligatorio', 'error'); return; }

    var formData = new FormData();
    formData.append('pdf_file', fileInput.files[0]);
    formData.append('title', title.value.trim());
    formData.append('author', document.getElementById('kb-upload-author')?.value || '');
    formData.append('category', document.getElementById('kb-upload-category')?.value || 'general');
    formData.append('isbn', document.getElementById('kb-upload-isbn')?.value || '');
    formData.append('publisher', document.getElementById('kb-upload-publisher')?.value || '');
    formData.append('year_published', document.getElementById('kb-upload-year')?.value || '');
    formData.append('description', document.getElementById('kb-upload-desc')?.value || '');

    var progArea = document.getElementById('kb-upload-progress');
    if (progArea) progArea.style.display = 'block';
    var bar = document.getElementById('kb-upload-bar');
    var status = document.getElementById('kb-upload-status');

    var token = localStorage.getItem('ada_token');
    var xhr = new XMLHttpRequest();
    xhr.open('POST', (typeof ADA_BACKEND_URL !== 'undefined' ? ADA_BACKEND_URL : '') + '/api/superadmin/knowledge/books/upload');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable && bar) {
            var pct = Math.round((e.loaded / e.total) * 100);
            bar.style.width = pct + '%';
            if (status) status.textContent = 'Upload: ' + pct + '%';
        }
    };

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            showToast('PDF caricato! Elaborazione in corso...', 'success');
            var modal = document.getElementById('kb-upload-modal');
            if (modal) modal.classList.remove('active');
            _loadKnowledgeAll();
        } else {
            var errData = {};
            try { errData = JSON.parse(xhr.responseText); } catch(e) {}
            showToast('Errore: ' + (errData.message || 'Upload fallito'), 'error');
            if (progArea) progArea.style.display = 'none';
        }
    };

    xhr.onerror = function() {
        showToast('Errore di rete', 'error');
        if (progArea) progArea.style.display = 'none';
    };

    xhr.send(formData);
}

function _toggleKnowledgeBook(bookId, enabled) {
    fetchApi('/api/superadmin/knowledge/books/' + bookId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled })
    }).then(function(r) {
        if (r.ok) showToast(enabled ? 'Libro abilitato' : 'Libro disabilitato', 'success');
    });
}

function _deleteKnowledgeBook(bookId) {
    if (!confirm('Eliminare questo libro e tutti i suoi chunk? Azione irreversibile.')) return;
    fetchApi('/api/superadmin/knowledge/books/' + bookId, { method: 'DELETE' })
        .then(function(r) {
            if (r.ok) {
                showToast('Libro eliminato', 'success');
                _loadKnowledgeAll();
            }
        });
}

function _showKnowledgeBookDetail(bookId) {
    fetchApi('/api/superadmin/knowledge/books/' + bookId)
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.book) return;
            var book = data.book;
            var chunks = data.chunks || [];

            var chunkHtml = '';
            for (var i = 0; i < Math.min(chunks.length, 20); i++) {
                var ch = chunks[i];
                chunkHtml += '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:8px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">' +
                        '<span>#' + ch.chunk_index + (ch.chapter_title ? ' | ' + _escHtml(ch.chapter_title) : '') + '</span>' +
                        '<span>' + (ch.chunk_tokens || '?') + ' token</span>' +
                    '</div>' +
                    '<div style="font-size:12px;line-height:1.5;color:#334155;">' + _escHtml(ch.chunk_preview || '') + '...</div>' +
                '</div>';
            }
            if (chunks.length > 20) {
                chunkHtml += '<p style="color:#64748b;font-size:12px;text-align:center;">... e altri ' + (chunks.length - 20) + ' chunk</p>';
            }

            var html = '<div class="modal active" id="kb-detail-modal" onclick="if(event.target===this)this.classList.remove(\'active\')">' +
                '<div class="modal-content" style="max-width:650px;max-height:85vh;overflow-y:auto;">' +
                '<h3>' + _escHtml(book.title) + '</h3>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:16px;">' +
                    '<div><strong>Autore:</strong> ' + _escHtml(book.author || '-') + '</div>' +
                    '<div><strong>Categoria:</strong> ' + (book.category || '-') + '</div>' +
                    '<div><strong>ISBN:</strong> ' + _escHtml(book.isbn || '-') + '</div>' +
                    '<div><strong>Editore:</strong> ' + _escHtml(book.publisher || '-') + '</div>' +
                    '<div><strong>Pagine:</strong> ' + (book.total_pages || '-') + '</div>' +
                    '<div><strong>Chunk:</strong> ' + (book.total_chunks || 0) + '</div>' +
                    '<div><strong>Status:</strong> ' + _getStatusBadge(book.processing_status) + '</div>' +
                    '<div><strong>File:</strong> ' + _escHtml(book.original_filename || '-') + '</div>' +
                '</div>' +
                (book.processing_error ? '<div style="background:#fee2e2;padding:10px;border-radius:8px;font-size:12px;color:#dc2626;margin-bottom:12px;">Errore: ' + _escHtml(book.processing_error) + '</div>' : '') +
                '<h4 style="font-size:14px;margin-bottom:8px;">Chunk (' + chunks.length + ')</h4>' +
                (chunkHtml || '<p style="color:#94a3b8;">Nessun chunk</p>') +
                '<div class="button-row" style="margin-top:16px;">' +
                    '<button class="btn btn-secondary" onclick="_reprocessKnowledgeBook(\'' + book.book_id + '\')">Rigenera Embedding</button>' +
                    '<button class="btn btn-secondary" onclick="document.getElementById(\'kb-detail-modal\').classList.remove(\'active\')">Chiudi</button>' +
                '</div>' +
                '</div></div>';

            var existing = document.getElementById('kb-detail-modal');
            if (existing) existing.remove();
            document.body.insertAdjacentHTML('beforeend', html);
        });
}

function _reprocessKnowledgeBook(bookId) {
    fetchApi('/api/superadmin/knowledge/books/' + bookId + '/reprocess', { method: 'POST' })
        .then(function(r) {
            if (r.ok) {
                showToast('Rigenerazione embedding avviata', 'success');
                var modal = document.getElementById('kb-detail-modal');
                if (modal) modal.classList.remove('active');
                _loadKnowledgeAll();
            }
        });
}

function _pollKnowledgeBookStatus(bookId) {
    var interval = setInterval(function() {
        fetchApi('/api/superadmin/knowledge/books/' + bookId)
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !data.book) { clearInterval(interval); return; }
                if (data.book.processing_status === 'ready' || data.book.processing_status === 'error') {
                    clearInterval(interval);
                    if (_knowledgeActiveTab === 'books') _loadKnowledgeAll();
                }
            }).catch(function() { clearInterval(interval); });
    }, 5000);
}

function _renderKnowledgeSearch() {
    var area = document.getElementById('kb-content-area');
    if (!area) return;

    var catOptions = '<option value="">Tutte le categorie</option>';
    for (var i = 0; i < _knowledgeCategories.length; i++) {
        var c = _knowledgeCategories[i];
        catOptions += '<option value="' + c.category_key + '">' + c.label_it + '</option>';
    }

    area.innerHTML =
        '<h3 style="font-size:16px;margin-bottom:12px;">Test Ricerca RAG</h3>' +
        '<div class="form-grid" style="grid-template-columns:1fr;">' +
            '<div class="form-group"><label>Query di ricerca</label><textarea id="kb-search-query" rows="3" placeholder="Es: nutrizione gatto anziano con insufficienza renale"></textarea></div>' +
            '<div class="form-group"><label>Categoria (opzionale)</label><select id="kb-search-category">' + catOptions + '</select></div>' +
            '<div class="form-group" style="display:flex;flex-direction:row;gap:20px;align-items:center;">' +
                '<label>Top K: <input type="number" id="kb-search-topk" value="5" min="1" max="10" style="width:60px;"></label>' +
                '<label>Soglia: <input type="number" id="kb-search-threshold" value="0.3" min="0" max="1" step="0.05" style="width:70px;"></label>' +
            '</div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="_executeKnowledgeSearch()" style="margin-top:10px;">Cerca</button>' +
        '<div id="kb-search-results" style="margin-top:16px;"></div>';

    // Load categories if needed
    if (_knowledgeCategories.length === 0) {
        fetchApi('/api/superadmin/knowledge/categories').then(function(r) { return r.ok ? r.json() : { categories: [] }; })
            .then(function(data) { _knowledgeCategories = data.categories || []; });
    }
}

function _executeKnowledgeSearch() {
    var query = document.getElementById('kb-search-query')?.value;
    if (!query || !query.trim()) { showToast('Inserisci una query', 'error'); return; }

    var resultsArea = document.getElementById('kb-search-results');
    if (resultsArea) resultsArea.innerHTML = '<p style="color:#64748b;">Ricerca in corso...</p>';

    fetchApi('/api/superadmin/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: query.trim(),
            top_k: parseInt(document.getElementById('kb-search-topk')?.value) || 5,
            similarity_threshold: parseFloat(document.getElementById('kb-search-threshold')?.value) || 0.3,
            category: document.getElementById('kb-search-category')?.value || null
        })
    }).then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
        if (!data || !resultsArea) return;
        var chunks = data.chunks || [];

        if (chunks.length === 0) {
            resultsArea.innerHTML = '<p style="color:#94a3b8;">Nessun risultato trovato. Prova a ridurre la soglia di similarita.</p>';
            return;
        }

        var html = '<p style="font-size:12px;color:#64748b;margin-bottom:8px;">' + chunks.length + ' risultati in ' + (data.queryLatencyMs || 0) + 'ms (embedding: ' + (data.embeddingLatencyMs || 0) + 'ms)</p>';

        for (var i = 0; i < chunks.length; i++) {
            var ch = chunks[i];
            var sim = (parseFloat(ch.similarity) * 100).toFixed(1);
            var barWidth = Math.round(parseFloat(ch.similarity) * 100);
            var barColor = barWidth > 70 ? '#16a34a' : barWidth > 50 ? '#d97706' : '#dc2626';

            html += '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:10px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                    '<span style="font-size:12px;font-weight:600;color:#334155;">' + _escHtml(ch.book_title || '') +
                        (ch.chapter_title ? ' > ' + _escHtml(ch.chapter_title) : '') +
                        (ch.page_start ? ' (p.' + ch.page_start + ')' : '') + '</span>' +
                    '<span style="font-size:12px;font-weight:700;color:' + barColor + ';">' + sim + '%</span>' +
                '</div>' +
                '<div style="background:#e2e8f0;border-radius:3px;height:4px;margin-bottom:8px;">' +
                    '<div style="background:' + barColor + ';height:100%;border-radius:3px;width:' + barWidth + '%;"></div>' +
                '</div>' +
                '<div style="font-size:12px;line-height:1.6;color:#475569;white-space:pre-wrap;">' + _escHtml(ch.chunk_text || '') + '</div>' +
            '</div>';
        }

        resultsArea.innerHTML = html;
    }).catch(function() {
        if (resultsArea) resultsArea.innerHTML = '<p style="color:#dc2626;">Errore nella ricerca</p>';
    });
}

function _loadKnowledgeQueryLog() {
    var area = document.getElementById('kb-content-area');
    if (!area) { area = document.getElementById('kb-content-area'); }
    if (!area) return;
    area.innerHTML = '<p style="color:#64748b;">Caricamento log...</p>';

    fetchApi('/api/superadmin/knowledge/query-log?limit=50')
        .then(function(r) { return r.ok ? r.json() : { queries: [] }; })
        .then(function(data) {
            var queries = data.queries || [];

            if (queries.length === 0) {
                area.innerHTML = '<h3 style="font-size:16px;margin-bottom:8px;">Log Query RAG</h3>' +
                    '<p style="color:#94a3b8;">Nessuna query registrata.</p>';
                return;
            }

            var html = '<h3 style="font-size:16px;margin-bottom:12px;">Log Query RAG (ultime ' + queries.length + ')</h3>' +
                '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">' +
                '<thead><tr style="background:#f1f5f9;text-align:left;">' +
                    '<th style="padding:8px;">Data</th>' +
                    '<th style="padding:8px;">Servizio</th>' +
                    '<th style="padding:8px;">Query</th>' +
                    '<th style="padding:8px;">Chunk</th>' +
                    '<th style="padding:8px;">Sim. top</th>' +
                    '<th style="padding:8px;">Latenza</th>' +
                '</tr></thead><tbody>';

            for (var i = 0; i < queries.length; i++) {
                var q = queries[i];
                var date = q.created_at ? new Date(q.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                var sim = q.top_chunk_similarity ? (parseFloat(q.top_chunk_similarity) * 100).toFixed(0) + '%' : '-';
                html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
                    '<td style="padding:8px;white-space:nowrap;">' + date + '</td>' +
                    '<td style="padding:8px;"><span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:6px;font-size:10px;">' + _escHtml(q.source_service) + '</span></td>' +
                    '<td style="padding:8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escHtml(q.query_preview || '') + '</td>' +
                    '<td style="padding:8px;">' + (q.chunks_returned || 0) + '</td>' +
                    '<td style="padding:8px;">' + sim + '</td>' +
                    '<td style="padding:8px;">' + (q.latency_ms || 0) + 'ms</td>' +
                '</tr>';
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        });
}
