// app-documents.js v2.0 — Online-only mode (no IndexedDB, no sync)

/**
 * ADA Veterinary App - Document Upload, Viewer & AI Interpretation
 *
 * v2.0: Online-only — all data via API REST, no IndexedDB.
 *
 * Provides:
 *  - Document upload with MIME/size validation (PDF, JPG, PNG, WebP; max 10 MB)
 *  - Document list from server (GET /api/documents?pet_id=X)
 *  - Document viewer (image zoom, PDF iframe/object with fallback)
 *  - AI interpretation (read) and owner explanation (explain)
 *  - Role-based permissions via getActiveRole()
 *  - InlineLoader integration for async operations
 *
 * Globals expected:
 *   fetchApi, showToast, showProgress, navigateToPage,
 *   InlineLoader, getActiveRole, getCurrentPetId
 */

(function (global) {
    'use strict';

    // =========================================================================
    // Constants
    // =========================================================================

    var ALLOWED_MIME_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    var MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    var MAX_PDF_PAGES      = 5;

    var ROLE_VET   = 'veterinario';
    var ROLE_OWNER = 'proprietario';

    // =========================================================================
    // State
    // =========================================================================

    var _currentDocumentId = null;
    var _readLoader        = null;
    var _explainLoader     = null;
    var _uploadLoader      = null;

    // =========================================================================
    // UUID helper
    // =========================================================================

    function _generateUUID() {
        try {
            if (crypto && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
        } catch (_) { /* ignore */ }

        // Fallback UUID v4
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // =========================================================================
    // SHA-256 hash helper
    // =========================================================================

    function _computeSHA256(arrayBuffer) {
        if (crypto && typeof crypto.subtle !== 'undefined' && typeof crypto.subtle.digest === 'function') {
            return crypto.subtle.digest('SHA-256', arrayBuffer).then(function (hashBuffer) {
                var bytes = new Uint8Array(hashBuffer);
                var hex   = '';
                for (var i = 0; i < bytes.length; i++) {
                    hex += bytes[i].toString(16).padStart(2, '0');
                }
                return hex;
            });
        }
        // Fallback: return empty string when SubtleCrypto is unavailable
        return Promise.resolve('');
    }

    // =========================================================================
    // File reading helpers
    // =========================================================================

    function _readFileAsArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload  = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('FileReader failed')); };
            reader.readAsArrayBuffer(file);
        });
    }

    function _arrayBufferToBase64(buffer) {
        var bytes  = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // =========================================================================
    // PDF page count (lightweight, no external library)
    // =========================================================================

    function _countPdfPages(arrayBuffer) {
        try {
            var bytes = new Uint8Array(arrayBuffer);
            var text = '';
            for (var i = 0; i < bytes.length; i++) {
                text += String.fromCharCode(bytes[i]);
            }
            var pageMatches = text.match(/\/Type\s*\/Page(?!s)/g);
            if (pageMatches && pageMatches.length > 0) {
                return pageMatches.length;
            }
            var countMatch = text.match(/\/Count\s+(\d+)/);
            if (countMatch) {
                return parseInt(countMatch[1], 10) || 0;
            }
        } catch (_) { /* ignore */ }
        return 0;
    }

    // =========================================================================
    // HTML escape (matches _escapeHtml in app-core.js)
    // =========================================================================

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // Format helpers
    // =========================================================================

    function _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i     = Math.floor(Math.log(bytes) / Math.log(1024));
        var value = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
        return value + ' ' + units[i];
    }

    function _formatDate(isoString) {
        if (!isoString) return 'N/D';
        try {
            return new Date(isoString).toLocaleString('it-IT', {
                day:    '2-digit',
                month:  '2-digit',
                year:   'numeric',
                hour:   '2-digit',
                minute: '2-digit'
            });
        } catch (_) {
            return isoString;
        }
    }

    function _mimeLabel(mime) {
        if (!mime) return 'Sconosciuto';
        if (mime === 'application/pdf') return 'PDF';
        if (mime.indexOf('jpeg') !== -1 || mime.indexOf('jpg') !== -1) return 'JPEG';
        if (mime.indexOf('png') !== -1) return 'PNG';
        if (mime.indexOf('webp') !== -1) return 'WebP';
        return mime;
    }

    // =========================================================================
    // Role helpers
    // =========================================================================

    function _getRole() {
        if (typeof getActiveRole === 'function') {
            try { return getActiveRole(); } catch (_) { /* ignore */ }
        }
        return ROLE_VET; // default
    }

    function _getPetId() {
        if (typeof getCurrentPetId === 'function') {
            try { return getCurrentPetId(); } catch (_) { /* ignore */ }
        }
        return null;
    }

    // =========================================================================
    // Upload: trigger file input
    // =========================================================================

    function triggerDocumentUpload() {
        var petId = _getPetId();
        if (!petId) {
            if (typeof showToast === 'function') showToast('Seleziona un pet prima di caricare un documento', 'error');
            return;
        }

        var input = document.getElementById('documentFileInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    // =========================================================================
    // Upload: handle file selection
    // =========================================================================

    function handleDocumentUpload(event) {
        var files = event && event.target && event.target.files;
        if (!files || files.length === 0) return;

        var file = files[0];

        // Reset the input so the same file can be re-selected
        try { event.target.value = ''; } catch (_) { /* ignore */ }

        // --- Validate MIME type ---
        if (ALLOWED_MIME_TYPES.indexOf(file.type) === -1) {
            if (typeof showToast === 'function') {
                showToast('Tipo file non supportato. Usa PDF, JPG, PNG o WebP.', 'error');
            }
            return;
        }

        // --- Validate file size ---
        if (file.size > MAX_FILE_SIZE_BYTES) {
            if (typeof showToast === 'function') {
                showToast('Il file supera il limite di 10 MB.', 'error');
            }
            return;
        }

        var petId = _getPetId();
        if (!petId) {
            if (typeof showToast === 'function') showToast('Seleziona un pet prima di caricare un documento', 'error');
            return;
        }

        _processUpload(file, petId);
    }

    // =========================================================================
    // Upload: process and send to server
    // =========================================================================

    function _processUpload(file, petId) {
        if (typeof showProgress === 'function') showProgress(true);

        if (typeof ADALog !== 'undefined') {
            ADALog.info('DOC', 'upload start', {mimeType: file.type, sizeBytes: file.size, petId: petId});
        }

        // Ensure upload loader
        if (!_uploadLoader) {
            try {
                _uploadLoader = new InlineLoader({
                    containerId: 'documentUploadLoader',
                    onAbort: function () {
                        if (typeof showProgress === 'function') showProgress(false);
                    }
                });
            } catch (_) { /* container may not exist yet */ }
        }

        var documentId = _generateUUID();

        // Read file for validation (PDF page count) and hashing
        _readFileAsArrayBuffer(file).then(function (arrayBuffer) {
            // PDF page count validation
            if (file.type === 'application/pdf') {
                var pageCount = _countPdfPages(arrayBuffer);
                if (pageCount > MAX_PDF_PAGES) {
                    throw new Error('Il PDF ha ' + pageCount + ' pagine. Il limite è ' + MAX_PDF_PAGES + ' pagine.');
                }
            }

            return _computeSHA256(arrayBuffer);
        }).then(function (hash) {
            // Upload to backend
            if (typeof fetchApi !== 'function') {
                throw new Error('fetchApi non disponibile');
            }

            var formData = new FormData();
            formData.append('file', file, file.name || 'documento');
            formData.append('document_id', documentId);
            formData.append('pet_id', String(petId));
            formData.append('original_filename', file.name || 'documento');
            formData.append('mime_type', file.type);
            formData.append('size_bytes', String(file.size));
            formData.append('hash_sha256', hash || '');

            return fetchApi('/api/documents/upload', {
                method: 'POST',
                body: formData
            });
        }).then(function (response) {
            if (!response || !response.ok) {
                throw new Error('Upload HTTP ' + (response ? response.status : 'failed'));
            }
            return response.json().catch(function () { return null; });
        }).then(function () {
            if (typeof showProgress === 'function') showProgress(false);
            if (_uploadLoader) _uploadLoader.stop();
            if (typeof showToast === 'function') {
                showToast('Documento caricato: ' + _escapeHtml(file.name || 'documento'), 'success');
            }
            renderDocumentsInHistory();
        }).catch(function (err) {
            if (typeof showProgress === 'function') showProgress(false);
            if (_uploadLoader) _uploadLoader.stop();
            var msg = (err && err.message) ? err.message : 'Errore durante il caricamento';
            if (typeof showToast === 'function') showToast('Errore: ' + msg, 'error');
        });
    }

    // =========================================================================
    // Render documents in History page (fetched from server)
    // =========================================================================

    function renderDocumentsInHistory() {
        var petId = _getPetId();
        if (!petId) return;

        var list = document.getElementById('historyList');
        if (!list) return;

        if (typeof fetchApi !== 'function') return;

        fetchApi('/api/documents?pet_id=' + encodeURIComponent(petId)).then(function (response) {
            if (!response || !response.ok) return [];
            return response.json().then(function (data) {
                return (data && Array.isArray(data.documents)) ? data.documents : [];
            });
        }).then(function (documents) {
            if (!documents || documents.length === 0) {
                var existing = document.getElementById('documentsSection');
                if (existing) existing.innerHTML = '';
                _updateHistoryBadgeWithDocs(0);
                return;
            }

            // Sort documents newest first
            documents.sort(function (a, b) {
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });

            var months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

            var html = documents.map(function (doc) {
                var date  = new Date(doc.created_at || Date.now());
                var label = _mimeLabel(doc.mime_type);
                var size  = _formatBytes(doc.size_bytes || 0);
                var name  = _escapeHtml(doc.original_filename || 'Documento');

                var aiIcon = '';
                if (doc.ai_status === 'complete' || doc.ai_status === 'completed') aiIcon = '&#x2705;';
                else if (doc.ai_status === 'error')  aiIcon = '&#x26A0;&#xFE0F;';
                else                                  aiIcon = '&#x1F4C4;';

                return '<div class="history-item" onclick="openDocument(\'' + _escapeHtml(doc.document_id) + '\')">' +
                    '<div class="history-date">' +
                        '<div class="day">' + date.getDate() + '</div>' +
                        '<div class="month">' + months[date.getMonth()] + '</div>' +
                    '</div>' +
                    '<div class="history-info">' +
                        '<h4>' + aiIcon + ' ' + name + '</h4>' +
                        '<p>' + label + ' &middot; ' + size + '</p>' +
                    '</div>' +
                    '<button class="history-delete" onclick="event.stopPropagation(); _deleteDocument(\'' + _escapeHtml(doc.document_id) + '\')" aria-label="Elimina documento">&times;</button>' +
                '</div>';
            }).join('');

            var separator = document.getElementById('documentsSection');
            if (!separator) {
                separator = document.createElement('div');
                separator.id = 'documentsSection';
                list.parentNode.insertBefore(separator, list.nextSibling);
            }
            separator.innerHTML =
                '<h3 style="margin:20px 0 10px; font-size:15px; color:#555;">Documenti Caricati</h3>' +
                html;

            _updateHistoryBadgeWithDocs(documents.length);
        }).catch(function () {
            // Silent failure - documents section simply not shown
        });
    }

    // =========================================================================
    // Delete document (server only)
    // =========================================================================

    function _deleteDocument(documentId) {
        if (!documentId) return;
        if (!confirm('Eliminare questo documento?')) return;

        if (typeof fetchApi !== 'function') {
            if (typeof showToast === 'function') showToast('Errore eliminazione documento', 'error');
            return;
        }

        fetchApi('/api/documents/' + encodeURIComponent(documentId), { method: 'DELETE' })
            .then(function (res) {
                if (res && (res.ok || res.status === 204)) {
                    if (typeof showToast === 'function') showToast('Documento eliminato', 'success');
                    renderDocumentsInHistory();
                } else {
                    if (typeof showToast === 'function') showToast('Errore eliminazione documento', 'error');
                }
            })
            .catch(function () {
                if (typeof showToast === 'function') showToast('Errore di rete: impossibile eliminare', 'error');
            });
    }

    // =========================================================================
    // Document Viewer: open (fetch metadata from server)
    // =========================================================================

    function openDocument(documentId) {
        if (!documentId) return;

        _currentDocumentId = documentId;
        if (typeof logDebug === 'function') logDebug('openDocument', 'Opening document: ' + documentId);

        if (typeof navigateToPage === 'function') {
            navigateToPage('document');
        }

        var viewer   = document.getElementById('documentViewer');
        var metaEl   = document.getElementById('documentMeta');
        var titleEl  = document.getElementById('documentTitle');
        var readBtn  = document.getElementById('btnDocRead');
        var explBtn  = document.getElementById('btnDocExplain');
        var readRes  = document.getElementById('documentReadResult');

        // Reset UI
        if (viewer)  viewer.innerHTML = '<p style="color:#888;">Caricamento documento&hellip;</p>';
        if (metaEl)  metaEl.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Documento';
        if (readBtn) readBtn.disabled = true;
        if (explBtn) explBtn.disabled = true;
        if (readRes) readRes.style.display = 'none';

        if (typeof fetchApi !== 'function') {
            if (viewer) viewer.innerHTML = '<p style="color:#c00;">Errore: fetchApi non disponibile.</p>';
            return;
        }

        // Fetch document metadata from server
        fetchApi('/api/documents/' + encodeURIComponent(documentId)).then(function (response) {
            if (!response || !response.ok) {
                if (viewer) viewer.innerHTML = '<p style="color:#c00;">Documento non trovato.</p>';
                return null;
            }
            return response.json();
        }).then(function (doc) {
            if (!doc) return;

            // Title
            if (titleEl) titleEl.textContent = '\uD83D\uDCC4 ' + (doc.original_filename || 'Documento');

            // Metadata
            if (metaEl) {
                metaEl.innerHTML =
                    '<strong>Tipo:</strong> ' + _escapeHtml(_mimeLabel(doc.mime_type)) +
                    ' &middot; <strong>Dimensione:</strong> ' + _formatBytes(doc.size_bytes || 0) +
                    ' &middot; <strong>Caricato:</strong> ' + _escapeHtml(_formatDate(doc.created_at)) +
                    (doc.page_count ? ' &middot; <strong>Pagine:</strong> ' + doc.page_count : '');
            }

            // AI buttons - role-based
            if (typeof ADALog !== 'undefined') {
                ADALog.dbg('DOC', 'status poll', {documentId: documentId, currentStatus: doc.ai_status || 'none', pollCount: 1});
            }
            _updateAIButtons(doc);

            // Show existing AI results
            _showExistingAIResults(doc);

            // Fetch and render the document content from server
            _fetchAndRenderBlob(doc, viewer);
        }).catch(function () {
            if (viewer) {
                viewer.innerHTML = '<p style="color:#c00;">Errore caricamento documento.</p>';
            }
        });
    }

    // =========================================================================
    // Document Viewer: fetch blob from server and render
    // =========================================================================

    function _fetchAndRenderBlob(doc, container) {
        if (!container) return;
        if (!doc || !doc.document_id) {
            container.innerHTML = '<p style="color:#888;">Anteprima non disponibile.</p>';
            return;
        }

        container.innerHTML = '<p style="color:#888;"><span class="spinner-border spinner-border-sm"></span> Scaricamento documento dal server\u2026</p>';

        fetchApi('/api/documents/' + encodeURIComponent(doc.document_id) + '/download')
            .then(function (resp) {
                if (!resp || !resp.ok) return null;
                return resp.arrayBuffer();
            })
            .then(function (ab) {
                if (!ab) {
                    container.innerHTML = '<p style="color:#888;">Anteprima non disponibile.</p>';
                    return;
                }
                var base64 = _arrayBufferToBase64(ab);
                var dataUrl = 'data:' + (doc.mime_type || 'application/octet-stream') + ';base64,' + base64;

                if (doc.mime_type === 'application/pdf') {
                    _renderPDF(dataUrl, container);
                } else if (doc.mime_type && doc.mime_type.indexOf('image/') === 0) {
                    _renderImage(dataUrl, doc, container);
                } else {
                    container.innerHTML = '<p style="color:#888;">Anteprima non disponibile per questo tipo di file.</p>';
                }
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#888;">Errore scaricamento documento.</p>';
            });
    }

    // =========================================================================
    // Document Viewer: render PDF
    // =========================================================================

    function _renderPDF(dataUrl, container) {
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%; min-height:500px; position:relative;';

        var iframe = document.createElement('iframe');
        iframe.src             = dataUrl;
        iframe.style.cssText   = 'width:100%; height:500px; border:1px solid #ddd; border-radius:6px;';
        iframe.setAttribute('title', 'Visualizzatore PDF');
        iframe.setAttribute('loading', 'lazy');

        iframe.onerror = function () {
            _renderPDFObjectFallback(dataUrl, wrapper);
        };

        wrapper.appendChild(iframe);

        var downloadLink = document.createElement('a');
        downloadLink.href            = dataUrl;
        downloadLink.download        = 'documento.pdf';
        downloadLink.textContent     = 'Scarica PDF';
        downloadLink.style.cssText   = 'display:inline-block; margin-top:10px; color:#1976d2; text-decoration:underline; font-size:14px;';
        downloadLink.setAttribute('rel', 'noopener');

        container.innerHTML = '';
        container.appendChild(wrapper);
        container.appendChild(downloadLink);
    }

    function _renderPDFObjectFallback(dataUrl, wrapper) {
        wrapper.innerHTML = '';

        var obj = document.createElement('object');
        obj.data           = dataUrl;
        obj.type           = 'application/pdf';
        obj.style.cssText  = 'width:100%; height:500px; border:1px solid #ddd; border-radius:6px;';

        var fallbackMsg    = document.createElement('p');
        fallbackMsg.style.cssText = 'padding:20px; color:#888; text-align:center;';
        fallbackMsg.textContent   = 'Il browser non supporta la visualizzazione PDF inline. Usa il link per scaricare.';
        obj.appendChild(fallbackMsg);

        wrapper.appendChild(obj);
    }

    // =========================================================================
    // Document Viewer: render image with zoom
    // =========================================================================

    function _renderImage(dataUrl, doc, container) {
        container.innerHTML = '';

        var imgWrapper = document.createElement('div');
        imgWrapper.style.cssText = 'text-align:center; cursor:zoom-in;';

        var img = document.createElement('img');
        img.src           = dataUrl;
        img.alt           = doc.original_filename || 'Documento';
        img.style.cssText = 'max-width:100%; max-height:600px; border:1px solid #ddd; border-radius:6px; object-fit:contain;';

        img.addEventListener('click', function () {
            _openImageFullscreen(dataUrl, doc.original_filename || 'Documento');
        });

        imgWrapper.appendChild(img);
        container.appendChild(imgWrapper);
    }

    function _openImageFullscreen(dataUrl, altText) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; ' +
            'background:rgba(0,0,0,0.95); z-index:10000; display:flex; ' +
            'align-items:center; justify-content:center; cursor:pointer;';

        var img = document.createElement('img');
        img.src           = dataUrl;
        img.alt           = altText;
        img.style.cssText = 'max-width:95%; max-height:95%; object-fit:contain; ' +
            'transition:transform 0.3s ease;';

        var zoomed = false;
        img.addEventListener('click', function (e) {
            e.stopPropagation();
            zoomed = !zoomed;
            img.style.transform = zoomed ? 'scale(2)' : 'scale(1)';
            img.style.cursor    = zoomed ? 'zoom-out' : 'zoom-in';
        });
        img.style.cursor = 'zoom-in';

        var closeBtn = document.createElement('button');
        closeBtn.textContent = '\u00D7';
        closeBtn.style.cssText = 'position:absolute; top:20px; right:20px; background:white; ' +
            'border:none; font-size:30px; width:50px; height:50px; border-radius:50%; ' +
            'cursor:pointer; line-height:50px; text-align:center;';
        closeBtn.setAttribute('aria-label', 'Chiudi');

        function closeOverlay() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', closeOverlay);
        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeOverlay(); });

        function onKey(e) {
            if (e.key === 'Escape') {
                closeOverlay();
                document.removeEventListener('keydown', onKey);
            }
        }
        document.addEventListener('keydown', onKey);

        overlay.appendChild(img);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);
    }

    // =========================================================================
    // AI Buttons: role-based visibility
    // =========================================================================

    function _updateAIButtons(doc) {
        var readBtn = document.getElementById('btnDocRead');
        var explBtn = document.getElementById('btnDocExplain');
        var role    = _getRole();

        if (readBtn) {
            readBtn.disabled = false;
            readBtn.style.display = (role === ROLE_VET) ? '' : 'none';
        }

        if (explBtn) {
            explBtn.disabled = false;
            explBtn.style.display = (role === ROLE_OWNER) ? '' : 'none';
        }
    }

    // =========================================================================
    // AI: show existing results
    // =========================================================================

    function _showExistingAIResults(doc) {
        var readRes     = document.getElementById('documentReadResult');
        var readContent = document.getElementById('documentReadContent');

        if (doc.read_text && readRes && readContent) {
            readContent.textContent = doc.read_text;
            readRes.style.display   = 'block';
        }
    }

    // =========================================================================
    // AI: read document (veterinario)
    // =========================================================================

    function readDocument() {
        if (!_currentDocumentId) {
            if (typeof showToast === 'function') showToast('Nessun documento selezionato', 'error');
            return;
        }

        var role = _getRole();
        if (role !== ROLE_VET) {
            if (typeof showToast === 'function') showToast('Funzione disponibile solo per il veterinario', 'error');
            return;
        }

        var documentId = _currentDocumentId;
        var readBtn    = document.getElementById('btnDocRead');
        var readRes    = document.getElementById('documentReadResult');
        var readCont   = document.getElementById('documentReadContent');

        if (readBtn) readBtn.disabled = true;

        if (!_readLoader) {
            try {
                _readLoader = new InlineLoader({
                    containerId: 'documentAiContainer',
                    onRetry: function () { readDocument(); },
                    onAbort: function () { if (readBtn) readBtn.disabled = false; }
                });
            } catch (_) { /* container may not exist */ }
        }

        var _readT0 = performance.now();

        var fetchFn = function (signal) {
            if (typeof fetchApi !== 'function') {
                return Promise.reject(new Error('fetchApi non disponibile'));
            }

            if (typeof ADALog !== 'undefined') {
                ADALog.info('DOC', 'AI read start', {documentId: documentId, mimeType: 'unknown'});
            }

            return fetchApi('/api/documents/' + encodeURIComponent(documentId) + '/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: documentId }),
                signal: signal
            }).then(function (response) {
                if (!response.ok) {
                    return response.json().catch(function () { return {}; }).then(function (errBody) {
                        throw new Error((errBody && errBody.error) || 'HTTP ' + response.status);
                    });
                }
                return response.json();
            }).then(function (data) {
                var text = (data && (data.read_text || data.text || data.result)) || '';

                if (typeof ADALog !== 'undefined') {
                    ADALog.perf('DOC', 'AI read done', {documentId: documentId, latencyMs: Math.round(performance.now() - _readT0), status: 'success'});
                }

                // Update UI
                if (readCont) readCont.textContent = text;
                if (readRes)  readRes.style.display = text ? 'block' : 'none';
                if (readBtn)  readBtn.disabled = false;
                if (_readLoader) _readLoader.stop();
                if (typeof showToast === 'function') showToast('Interpretazione completata', 'success');
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;

                if (readBtn) readBtn.disabled = false;
                if (typeof showToast === 'function') {
                    showToast('Errore lettura: ' + ((err && err.message) || 'sconosciuto'), 'error');
                }
                throw err;
            });
        };

        if (_readLoader) {
            _readLoader.start(fetchFn);
        } else {
            fetchFn(undefined);
        }
    }

    // =========================================================================
    // AI: explain document (proprietario)
    // =========================================================================

    function explainDocument() {
        if (!_currentDocumentId) {
            if (typeof logDebug === 'function') logDebug('explainDocument', 'No document selected');
            if (typeof showToast === 'function') showToast('Nessun documento selezionato', 'error');
            return;
        }

        var role = _getRole();
        if (typeof logDebug === 'function') logDebug('explainDocument', 'documentId=' + _currentDocumentId + ', role=' + role);
        if (role !== ROLE_OWNER) {
            if (typeof logDebug === 'function') logDebug('explainDocument', 'Blocked: role is not owner');
            if (typeof showToast === 'function') showToast('Funzione disponibile solo per il proprietario', 'error');
            return;
        }

        // Always call API (no local cache for AI results)
        _explainDocumentGenerate(_currentDocumentId);
    }

    function _explainDocumentGenerate(documentId) {
        var explBtn = document.getElementById('btnDocExplain');

        if (explBtn) explBtn.disabled = true;

        if (!_explainLoader) {
            try {
                _explainLoader = new InlineLoader({
                    containerId: 'documentAiContainer',
                    onRetry: function () { explainDocument(); },
                    onAbort: function () { if (explBtn) explBtn.disabled = false; }
                });
            } catch (_) { /* container may not exist */ }
        }

        var fetchFn = function (signal) {
            if (typeof fetchApi !== 'function') {
                return Promise.reject(new Error('fetchApi non disponibile'));
            }

            return fetchApi('/api/documents/' + encodeURIComponent(documentId) + '/explain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: documentId }),
                signal: signal
            }).then(function (response) {
                if (!response.ok) {
                    return response.json().catch(function () { return {}; }).then(function (errBody) {
                        throw new Error((errBody && errBody.error) || 'HTTP ' + response.status);
                    });
                }
                return response.json();
            }).then(function (data) {
                var text = (data && (data.owner_explanation || data.explanation || data.result)) || '';
                if (typeof logDebug === 'function') logDebug('explainDocument', 'Success, text length=' + text.length);

                if (explBtn) explBtn.disabled = false;
                if (_explainLoader) _explainLoader.stop();
                try {
                    var oe = document.getElementById('ownerExplanation');
                    if (oe) oe.value = text;
                } catch (_) {}
                if (typeof navigateToPage === 'function') navigateToPage('owner');
                if (typeof showToast === 'function') showToast('Spiegazione generata', 'success');
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;
                if (typeof logError === 'function') logError('explainDocument', 'Error: ' + ((err && err.message) || 'sconosciuto'));

                if (explBtn) explBtn.disabled = false;
                if (typeof showToast === 'function') {
                    showToast('Errore spiegazione: ' + ((err && err.message) || 'sconosciuto'), 'error');
                }
                throw err;
            });
        };

        if (_explainLoader) {
            _explainLoader.start(fetchFn);
        } else {
            fetchFn(undefined);
        }
    }

    // =========================================================================
    // Get documents for a pet (utility for other modules — fetches from server)
    // =========================================================================

    function getDocumentsForPet(petId) {
        if (!petId) return Promise.resolve([]);
        if (typeof fetchApi !== 'function') return Promise.resolve([]);

        return fetchApi('/api/documents?pet_id=' + encodeURIComponent(petId))
            .then(function (response) {
                if (!response || !response.ok) return [];
                return response.json().then(function (data) {
                    var docs = (data && Array.isArray(data.documents)) ? data.documents : [];
                    docs.sort(function (a, b) {
                        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                    });
                    return docs;
                });
            })
            .catch(function () { return []; });
    }

    // =========================================================================
    // Get a single document by ID (utility — fetches from server)
    // =========================================================================

    function getDocumentById(documentId) {
        if (!documentId) return Promise.resolve(null);
        if (typeof fetchApi !== 'function') return Promise.resolve(null);

        return fetchApi('/api/documents/' + encodeURIComponent(documentId))
            .then(function (response) {
                if (!response || !response.ok) return null;
                return response.json();
            })
            .catch(function () { return null; });
    }

    // =========================================================================
    // Cleanup loaders on navigation
    // =========================================================================

    function _cleanupDocumentLoaders() {
        if (_readLoader)    { try { _readLoader.stop(); }    catch (_) { /* ignore */ } }
        if (_explainLoader) { try { _explainLoader.stop(); } catch (_) { /* ignore */ } }
        if (_uploadLoader)  { try { _uploadLoader.stop(); }  catch (_) { /* ignore */ } }
    }

    // =========================================================================
    // Init (no-op — no IndexedDB to open)
    // =========================================================================

    function initDocuments() {
        // Online-only mode: nothing to initialize
        return Promise.resolve();
    }

    // =========================================================================
    // Badge helper: update sidebar count = SOAP reports + documents
    // =========================================================================

    function _updateHistoryBadgeWithDocs(docCount) {
        var soapCount = 0;
        try { soapCount = (typeof historyData !== 'undefined' && Array.isArray(historyData)) ? historyData.length : 0; } catch (e) {}
        var total = soapCount + (docCount || 0);
        try {
            var badge = document.getElementById('historyBadge');
            if (badge) badge.textContent = String(total);
            var badgeOwner = document.getElementById('historyBadgeOwner');
            if (badgeOwner) badgeOwner.textContent = String(total);
        } catch (e) {}
    }

    // =========================================================================
    // Expose public API on global scope (vanilla JS, no modules)
    // =========================================================================

    global.triggerDocumentUpload    = triggerDocumentUpload;
    global.handleDocumentUpload     = handleDocumentUpload;
    global.renderDocumentsInHistory  = renderDocumentsInHistory;
    global.openDocument             = openDocument;
    global.readDocument             = readDocument;
    global.explainDocument          = explainDocument;
    global.getDocumentsForPet       = getDocumentsForPet;
    global.getDocumentById          = getDocumentById;
    global.initDocuments            = initDocuments;
    global._deleteDocument          = _deleteDocument;
    global._cleanupDocumentLoaders  = _cleanupDocumentLoaders;

})(typeof window !== 'undefined' ? window : this);
