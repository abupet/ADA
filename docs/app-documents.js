// app-documents.js v1.0

/**
 * ADA Veterinary App - Document Upload, Viewer & AI Interpretation (PR 8 + PR 9)
 *
 * Provides:
 *  - Document upload with MIME/size validation (PDF, JPG, PNG, WebP; max 10 MB)
 *  - IndexedDB persistence (store: 'documents') with offline base64 binary fallback
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

    var DB_NAME          = 'ADA_Documents';
    var DB_VERSION       = 2;
    var STORE_NAME       = 'documents';
    var BLOBS_STORE_NAME = 'document_blobs'; // offline binary storage

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

    // Offline upload queue store
    var UPLOAD_QUEUE_STORE = 'upload_queue';

    // =========================================================================
    // State
    // =========================================================================

    var _db                = null;
    var _currentDocumentId = null;
    var _readLoader        = null;
    var _explainLoader     = null;
    var _uploadLoader      = null;

    // =========================================================================
    // IndexedDB helpers
    // =========================================================================

    function _openDB() {
        if (_db) return Promise.resolve(_db);

        return new Promise(function (resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = function () {
                reject(request.error || new Error('IndexedDB open failed'));
            };

            request.onsuccess = function () {
                _db = request.result;
                resolve(_db);
            };

            request.onupgradeneeded = function (event) {
                var db = event.target.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    var store = db.createObjectStore(STORE_NAME, { keyPath: 'document_id' });
                    store.createIndex('pet_id', 'pet_id', { unique: false });
                    store.createIndex('created_at', 'created_at', { unique: false });
                }

                if (!db.objectStoreNames.contains(BLOBS_STORE_NAME)) {
                    db.createObjectStore(BLOBS_STORE_NAME, { keyPath: 'document_id' });
                }

                if (!db.objectStoreNames.contains(UPLOAD_QUEUE_STORE)) {
                    db.createObjectStore(UPLOAD_QUEUE_STORE, { keyPath: 'document_id' });
                }
            };
        });
    }

    function _txStore(storeName, mode) {
        var tx    = _db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        return { tx: tx, store: store };
    }

    function _idbPut(storeName, record) {
        return new Promise(function (resolve, reject) {
            var ref = _txStore(storeName, 'readwrite');
            var req = ref.store.put(record);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror   = function () { reject(req.error); };
        });
    }

    function _idbGet(storeName, key) {
        return new Promise(function (resolve, reject) {
            var ref = _txStore(storeName, 'readonly');
            var req = ref.store.get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror   = function () { reject(req.error); };
        });
    }

    function _idbDelete(storeName, key) {
        return new Promise(function (resolve, reject) {
            var ref = _txStore(storeName, 'readwrite');
            var req = ref.store.delete(key);
            req.onsuccess = function () { resolve(); };
            req.onerror   = function () { reject(req.error); };
        });
    }

    function _idbGetAllByIndex(storeName, indexName, keyValue) {
        return new Promise(function (resolve, reject) {
            var ref   = _txStore(storeName, 'readonly');
            var index = ref.store.index(indexName);
            var req   = index.getAll(keyValue);
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror   = function () { reject(req.error); };
        });
    }

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

    function _readFileAsDataURL(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload  = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('FileReader failed')); };
            reader.readAsDataURL(file);
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

    /**
     * Estimate the number of pages in a PDF from its raw bytes.
     * Counts occurrences of "/Type /Page" (excluding "/Type /Pages") and
     * falls back to the /Count value in the /Pages dictionary.
     */
    function _countPdfPages(arrayBuffer) {
        try {
            var bytes = new Uint8Array(arrayBuffer);
            // Convert a window of bytes to string (PDF internals are ASCII)
            var text = '';
            for (var i = 0; i < bytes.length; i++) {
                text += String.fromCharCode(bytes[i]);
            }
            // Method 1: count "/Type /Page" but not "/Type /Pages"
            var pageMatches = text.match(/\/Type\s*\/Page(?!s)/g);
            if (pageMatches && pageMatches.length > 0) {
                return pageMatches.length;
            }
            // Method 2: look for /Count in /Pages dict
            var countMatch = text.match(/\/Count\s+(\d+)/);
            if (countMatch) {
                return parseInt(countMatch[1], 10) || 0;
            }
        } catch (_) { /* ignore */ }
        return 0; // unknown
    }

    // =========================================================================
    // Offline upload queue
    // =========================================================================

    function _enqueueForUpload(metadata, base64Data, fileName) {
        return _openDB().then(function () {
            return _idbPut(UPLOAD_QUEUE_STORE, {
                document_id: metadata.document_id,
                metadata: metadata,
                base64Data: base64Data,
                fileName: fileName,
                queued_at: new Date().toISOString()
            });
        });
    }

    function _dequeueUpload(documentId) {
        return _openDB().then(function () {
            return new Promise(function (resolve) {
                try {
                    var ref = _txStore(UPLOAD_QUEUE_STORE, 'readwrite');
                    ref.store.delete(documentId);
                    ref.tx.oncomplete = function () { resolve(true); };
                    ref.tx.onerror = function () { resolve(false); };
                } catch (_) { resolve(false); }
            });
        });
    }

    function _getAllPendingUploads() {
        return _openDB().then(function () {
            return new Promise(function (resolve) {
                try {
                    var ref = _txStore(UPLOAD_QUEUE_STORE, 'readonly');
                    var req = ref.store.getAll();
                    req.onsuccess = function () { resolve(req.result || []); };
                    req.onerror = function () { resolve([]); };
                } catch (_) { resolve([]); }
            });
        });
    }

    /**
     * Process the offline upload queue: attempt to upload each queued document.
     * Called on 'online' event and after successful uploads.
     */
    function _flushUploadQueue() {
        if (!navigator.onLine) return;
        if (typeof fetchApi !== 'function') return;

        _getAllPendingUploads().then(function (items) {
            if (!items || items.length === 0) return;

            // Process sequentially to avoid overloading
            var chain = Promise.resolve();
            items.forEach(function (item) {
                chain = chain.then(function () {
                    // Reconstruct a File-like Blob from base64
                    var binaryStr = atob(item.base64Data);
                    var bytes = new Uint8Array(binaryStr.length);
                    for (var i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    var blob = new Blob([bytes], { type: item.metadata.mime_type });

                    var formData = new FormData();
                    formData.append('file', blob, item.fileName || item.metadata.original_filename);
                    formData.append('document_id', item.metadata.document_id);
                    formData.append('pet_id', String(item.metadata.pet_id));
                    formData.append('original_filename', item.metadata.original_filename);
                    formData.append('mime_type', item.metadata.mime_type);
                    formData.append('size_bytes', String(item.metadata.size_bytes));
                    formData.append('hash_sha256', item.metadata.hash_sha256 || '');

                    return fetchApi('/api/documents/upload', {
                        method: 'POST',
                        body: formData
                    }).then(function (response) {
                        if (response && response.ok) {
                            return _dequeueUpload(item.document_id).then(function () {
                                if (typeof showToast === 'function') {
                                    showToast('Documento in coda caricato: ' + _escapeHtml(item.metadata.original_filename), 'success');
                                }
                            });
                        }
                    }).catch(function () {
                        // Still offline or error — keep in queue
                    });
                });
            });
        }).catch(function () { /* silent */ });
    }

    // Listen for online event to flush upload queue
    try {
        window.addEventListener('online', function () {
            setTimeout(_flushUploadQueue, 2000);
        });
    } catch (_) {}

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
    // Upload: process and store
    // =========================================================================

    function _processUpload(file, petId) {
        if (typeof showProgress === 'function') showProgress(true);

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

        var documentId    = _generateUUID();
        var storageKey    = 'doc_' + documentId;
        var now           = new Date().toISOString();
        var arrayBufferRef = null;

        // Read the file as ArrayBuffer for hashing, then as DataURL for storage
        _readFileAsArrayBuffer(file).then(function (arrayBuffer) {
            arrayBufferRef = arrayBuffer;

            // PDF page count validation
            if (file.type === 'application/pdf') {
                var pageCount = _countPdfPages(arrayBuffer);
                if (pageCount > MAX_PDF_PAGES) {
                    throw new Error('Il PDF ha ' + pageCount + ' pagine. Il limite è ' + MAX_PDF_PAGES + ' pagine.');
                }
            }

            return _computeSHA256(arrayBuffer);
        }).then(function (hash) {
            // Build metadata record
            var metadata = {
                document_id:      documentId,
                pet_id:           petId,
                original_filename: file.name || 'documento',
                mime_type:        file.type,
                size_bytes:       file.size,
                page_count:       null,  // set by backend for PDFs
                storage_key:      storageKey,
                hash_sha256:      hash,
                read_text:        null,
                owner_explanation: null,
                ai_status:        'pending',
                ai_error:         null,
                ai_updated_at:    null,
                version:          1,
                created_at:       now,
                created_by:       _getRole()
            };

            var base64Data = _arrayBufferToBase64(arrayBufferRef);

            return _openDB().then(function () {
                // Store metadata
                return _idbPut(STORE_NAME, metadata);
            }).then(function () {
                // Store binary blob for offline access
                return _idbPut(BLOBS_STORE_NAME, {
                    document_id: documentId,
                    mime_type:   file.type,
                    base64:      base64Data,
                    stored_at:   now
                });
            }).then(function () {
                return { metadata: metadata, base64Data: base64Data };
            });
        }).then(function (result) {
            // Attempt backend upload
            return _uploadToBackend(result.metadata, result.base64Data, file).then(function (backendResult) {
                // If the backend returned updated metadata (e.g. page_count), merge it
                if (backendResult && typeof backendResult === 'object') {
                    var updated = Object.assign({}, result.metadata);
                    if (backendResult.page_count != null) updated.page_count = backendResult.page_count;
                    if (backendResult.ai_status)          updated.ai_status  = backendResult.ai_status;
                    if (backendResult.version)             updated.version    = backendResult.version;
                    if (backendResult.document_id)         updated.document_id = backendResult.document_id;
                    return _idbPut(STORE_NAME, updated).then(function () { return updated; });
                }
                return result.metadata;
            }).catch(function () {
                // Offline or error — enqueue for later upload
                return _enqueueForUpload(result.metadata, result.base64Data, file.name || result.metadata.original_filename)
                    .then(function () {
                        if (typeof showToast === 'function') {
                            showToast('Offline: documento salvato in coda. Verrà caricato automaticamente.', 'info');
                        }
                        return result.metadata;
                    })
                    .catch(function () { return result.metadata; });
            });
        }).then(function (metadata) {
            if (typeof showProgress === 'function') showProgress(false);
            if (_uploadLoader) _uploadLoader.stop();
            if (typeof showToast === 'function') {
                showToast('Documento caricato: ' + _escapeHtml(metadata.original_filename), 'success');
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
    // Upload: backend POST
    // =========================================================================

    function _uploadToBackend(metadata, base64Data, file) {
        if (typeof fetchApi !== 'function') {
            return Promise.reject(new Error('fetchApi non disponibile'));
        }

        if (!navigator.onLine) {
            // Offline - skip backend, document is already stored locally
            return Promise.resolve(null);
        }

        var formData = new FormData();
        formData.append('file', file, metadata.original_filename);
        formData.append('document_id', metadata.document_id);
        formData.append('pet_id', String(metadata.pet_id));
        formData.append('original_filename', metadata.original_filename);
        formData.append('mime_type', metadata.mime_type);
        formData.append('size_bytes', String(metadata.size_bytes));
        formData.append('hash_sha256', metadata.hash_sha256 || '');

        return fetchApi('/api/documents/upload', {
            method: 'POST',
            body:   formData
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('Upload HTTP ' + response.status);
            }
            return response.json().catch(function () { return null; });
        });
    }

    // =========================================================================
    // Render documents in History page
    // =========================================================================

    function renderDocumentsInHistory() {
        var petId = _getPetId();
        if (!petId) return;

        var list = document.getElementById('historyList');
        if (!list) return;

        _openDB().then(function () {
            return _idbGetAllByIndex(STORE_NAME, 'pet_id', petId);
        }).then(function (documents) {
            if (!documents || documents.length === 0) return;

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
                if (doc.ai_status === 'completed') aiIcon = '&#x2705;';       // checkmark
                else if (doc.ai_status === 'error')  aiIcon = '&#x26A0;&#xFE0F;'; // warning
                else                                  aiIcon = '&#x1F4C4;';    // page icon

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

            // Append documents after existing history items (do not replace)
            var separator = document.getElementById('documentsSection');
            if (!separator) {
                separator = document.createElement('div');
                separator.id = 'documentsSection';
                list.parentNode.insertBefore(separator, list.nextSibling);
            }
            separator.innerHTML =
                '<h3 style="margin:20px 0 10px; font-size:15px; color:#555;">Documenti Caricati</h3>' +
                html;

            // Update sidebar badge to include document count
            _updateHistoryBadgeWithDocs(documents.length);
        }).catch(function () {
            // Silent failure - documents section simply not shown
        });
    }

    // =========================================================================
    // Delete document
    // =========================================================================

    function _deleteDocument(documentId) {
        if (!documentId) return;
        if (!confirm('Eliminare questo documento?')) return;

        _openDB().then(function () {
            return Promise.all([
                _idbDelete(STORE_NAME, documentId),
                _idbDelete(BLOBS_STORE_NAME, documentId)
            ]);
        }).then(function () {
            if (typeof showToast === 'function') showToast('Documento eliminato', 'success');
            renderDocumentsInHistory();
        }).catch(function () {
            if (typeof showToast === 'function') showToast('Errore eliminazione documento', 'error');
        });
    }

    // =========================================================================
    // Document Viewer: open
    // =========================================================================

    function openDocument(documentId) {
        if (!documentId) return;

        _currentDocumentId = documentId;

        if (typeof navigateToPage === 'function') {
            navigateToPage('document');
        }

        var viewer   = document.getElementById('documentViewer');
        var metaEl   = document.getElementById('documentMeta');
        var titleEl  = document.getElementById('documentTitle');
        var readBtn  = document.getElementById('btnDocRead');
        var explBtn  = document.getElementById('btnDocExplain');
        var readRes  = document.getElementById('documentReadResult');
        var explRes  = document.getElementById('documentExplainResult');

        // Reset UI
        if (viewer)  viewer.innerHTML = '<p style="color:#888;">Caricamento documento&hellip;</p>';
        if (metaEl)  metaEl.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Documento';
        if (readBtn) readBtn.disabled = true;
        if (explBtn) explBtn.disabled = true;
        if (readRes) readRes.style.display = 'none';
        if (explRes) explRes.style.display = 'none';

        _openDB().then(function () {
            return _idbGet(STORE_NAME, documentId);
        }).then(function (doc) {
            if (!doc) {
                if (viewer) viewer.innerHTML = '<p style="color:#c00;">Documento non trovato.</p>';
                return;
            }

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
            _updateAIButtons(doc);

            // Show existing AI results
            _showExistingAIResults(doc);

            // Render the document content
            return _idbGet(BLOBS_STORE_NAME, documentId).then(function (blob) {
                _renderDocumentContent(doc, blob, viewer);
            });
        }).catch(function (err) {
            if (viewer) {
                viewer.innerHTML = '<p style="color:#c00;">Errore caricamento documento.</p>';
            }
        });
    }

    // =========================================================================
    // Document Viewer: render content
    // =========================================================================

    function _renderDocumentContent(doc, blobRecord, container) {
        if (!container) return;

        if (!blobRecord || !blobRecord.base64) {
            container.innerHTML = '<p style="color:#888;">Anteprima non disponibile (documento non memorizzato localmente).</p>';
            return;
        }

        var dataUrl = 'data:' + (doc.mime_type || 'application/octet-stream') + ';base64,' + blobRecord.base64;

        if (doc.mime_type === 'application/pdf') {
            _renderPDF(dataUrl, container);
        } else if (doc.mime_type && doc.mime_type.indexOf('image/') === 0) {
            _renderImage(dataUrl, doc, container);
        } else {
            container.innerHTML = '<p style="color:#888;">Anteprima non disponibile per questo tipo di file.</p>';
        }
    }

    // =========================================================================
    // Document Viewer: render PDF
    // =========================================================================

    function _renderPDF(dataUrl, container) {
        // Try iframe first, with object fallback
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%; min-height:500px; position:relative;';

        var iframe = document.createElement('iframe');
        iframe.src             = dataUrl;
        iframe.style.cssText   = 'width:100%; height:500px; border:1px solid #ddd; border-radius:6px;';
        iframe.setAttribute('title', 'Visualizzatore PDF');
        iframe.setAttribute('loading', 'lazy');

        // Fallback for browsers that block data: URLs in iframes
        iframe.onerror = function () {
            _renderPDFObjectFallback(dataUrl, wrapper);
        };

        wrapper.appendChild(iframe);

        // Also provide a download link
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

        // Zoom state
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

        // ESC key
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
            // Only veterinario can trigger a read
            readBtn.disabled = (role !== ROLE_VET);
            readBtn.style.display = '';
        }

        if (explBtn) {
            // Only proprietario can trigger an explanation
            explBtn.disabled = (role !== ROLE_OWNER);
            explBtn.style.display = '';
        }

        // Both roles can see existing results (handled by _showExistingAIResults)
    }

    // =========================================================================
    // AI: show existing results
    // =========================================================================

    function _showExistingAIResults(doc) {
        var readRes     = document.getElementById('documentReadResult');
        var readContent = document.getElementById('documentReadContent');
        var explRes     = document.getElementById('documentExplainResult');
        var explContent = document.getElementById('documentExplainContent');

        if (doc.read_text && readRes && readContent) {
            readContent.textContent = doc.read_text;
            readRes.style.display   = 'block';
        }

        if (doc.owner_explanation && explRes && explContent) {
            explContent.textContent = doc.owner_explanation;
            explRes.style.display   = 'block';
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

        // Ensure loader
        if (!_readLoader) {
            try {
                _readLoader = new InlineLoader({
                    containerId: 'documentAiContainer',
                    onRetry: function () {
                        readDocument();
                    },
                    onAbort: function () {
                        if (readBtn) readBtn.disabled = false;
                    }
                });
            } catch (_) { /* container may not exist */ }
        }

        var fetchFn = function (signal) {
            if (typeof fetchApi !== 'function') {
                return Promise.reject(new Error('fetchApi non disponibile'));
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

                // Persist result locally
                return _openDB().then(function () {
                    return _idbGet(STORE_NAME, documentId);
                }).then(function (doc) {
                    if (doc) {
                        doc.read_text     = text;
                        doc.ai_status     = 'completed';
                        doc.ai_error      = null;
                        doc.ai_updated_at = new Date().toISOString();
                        return _idbPut(STORE_NAME, doc);
                    }
                }).then(function () {
                    // Update UI
                    if (readCont) readCont.textContent = text;
                    if (readRes)  readRes.style.display = text ? 'block' : 'none';
                    if (readBtn)  readBtn.disabled = false;
                    if (_readLoader) _readLoader.stop();
                    if (typeof showToast === 'function') showToast('Interpretazione completata', 'success');
                });
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;

                // Persist error
                _openDB().then(function () {
                    return _idbGet(STORE_NAME, documentId);
                }).then(function (doc) {
                    if (doc) {
                        doc.ai_status     = 'error';
                        doc.ai_error      = (err && err.message) || 'Errore sconosciuto';
                        doc.ai_updated_at = new Date().toISOString();
                        return _idbPut(STORE_NAME, doc);
                    }
                }).catch(function () { /* silent */ });

                if (readBtn) readBtn.disabled = false;
                if (typeof showToast === 'function') {
                    showToast('Errore lettura: ' + ((err && err.message) || 'sconosciuto'), 'error');
                }
                throw err; // re-throw so InlineLoader shows error state
            });
        };

        if (_readLoader) {
            _readLoader.start(fetchFn);
        } else {
            // Fallback without loader
            fetchFn(undefined);
        }
    }

    // =========================================================================
    // AI: explain document (proprietario)
    // =========================================================================

    function explainDocument() {
        if (!_currentDocumentId) {
            if (typeof showToast === 'function') showToast('Nessun documento selezionato', 'error');
            return;
        }

        var role = _getRole();
        if (role !== ROLE_OWNER) {
            if (typeof showToast === 'function') showToast('Funzione disponibile solo per il proprietario', 'error');
            return;
        }

        var documentId = _currentDocumentId;
        var explBtn    = document.getElementById('btnDocExplain');
        var explRes    = document.getElementById('documentExplainResult');
        var explCont   = document.getElementById('documentExplainContent');

        if (explBtn) explBtn.disabled = true;

        // Ensure loader
        if (!_explainLoader) {
            try {
                _explainLoader = new InlineLoader({
                    containerId: 'documentAiContainer',
                    onRetry: function () {
                        explainDocument();
                    },
                    onAbort: function () {
                        if (explBtn) explBtn.disabled = false;
                    }
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

                // Persist result locally
                return _openDB().then(function () {
                    return _idbGet(STORE_NAME, documentId);
                }).then(function (doc) {
                    if (doc) {
                        doc.owner_explanation = text;
                        doc.ai_status         = 'completed';
                        doc.ai_error          = null;
                        doc.ai_updated_at     = new Date().toISOString();
                        return _idbPut(STORE_NAME, doc);
                    }
                }).then(function () {
                    // Update UI
                    if (explCont) explCont.textContent = text;
                    if (explRes)  explRes.style.display = text ? 'block' : 'none';
                    if (explBtn)  explBtn.disabled = false;
                    if (_explainLoader) _explainLoader.stop();
                    if (typeof showToast === 'function') showToast('Spiegazione generata', 'success');
                });
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;

                // Persist error
                _openDB().then(function () {
                    return _idbGet(STORE_NAME, documentId);
                }).then(function (doc) {
                    if (doc) {
                        doc.ai_status     = 'error';
                        doc.ai_error      = (err && err.message) || 'Errore sconosciuto';
                        doc.ai_updated_at = new Date().toISOString();
                        return _idbPut(STORE_NAME, doc);
                    }
                }).catch(function () { /* silent */ });

                if (explBtn) explBtn.disabled = false;
                if (typeof showToast === 'function') {
                    showToast('Errore spiegazione: ' + ((err && err.message) || 'sconosciuto'), 'error');
                }
                throw err; // re-throw so InlineLoader shows error state
            });
        };

        if (_explainLoader) {
            _explainLoader.start(fetchFn);
        } else {
            // Fallback without loader
            fetchFn(undefined);
        }
    }

    // =========================================================================
    // Get documents for a pet (utility for other modules)
    // =========================================================================

    function getDocumentsForPet(petId) {
        if (!petId) return Promise.resolve([]);

        return _openDB().then(function () {
            return _idbGetAllByIndex(STORE_NAME, 'pet_id', petId);
        }).then(function (docs) {
            // Sort newest first
            docs.sort(function (a, b) {
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });
            return docs;
        });
    }

    // =========================================================================
    // Get a single document by ID (utility)
    // =========================================================================

    function getDocumentById(documentId) {
        if (!documentId) return Promise.resolve(null);

        return _openDB().then(function () {
            return _idbGet(STORE_NAME, documentId);
        });
    }

    // =========================================================================
    // Cleanup loaders on navigation (integrates with InlineLoader.cleanupAll)
    // =========================================================================

    function _cleanupDocumentLoaders() {
        if (_readLoader)    { try { _readLoader.stop(); }    catch (_) { /* ignore */ } }
        if (_explainLoader) { try { _explainLoader.stop(); } catch (_) { /* ignore */ } }
        if (_uploadLoader)  { try { _uploadLoader.stop(); }  catch (_) { /* ignore */ } }
    }

    // =========================================================================
    // Init: ensure DB is ready on load
    // =========================================================================

    function initDocuments() {
        return _openDB().catch(function (err) {
            // Non-fatal: document features will be degraded
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('app-documents: IndexedDB init failed', err);
            }
        });
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

    global.triggerDocumentUpload   = triggerDocumentUpload;
    global.handleDocumentUpload    = handleDocumentUpload;
    global.renderDocumentsInHistory = renderDocumentsInHistory;
    global.openDocument            = openDocument;
    global.readDocument            = readDocument;
    global.explainDocument         = explainDocument;
    global.getDocumentsForPet      = getDocumentsForPet;
    global.getDocumentById         = getDocumentById;
    global.initDocuments           = initDocuments;

    // Expose delete so inline onclick handlers work
    global._deleteDocument         = _deleteDocument;

    // Cleanup hook
    global._cleanupDocumentLoaders = _cleanupDocumentLoaders;

    // Offline upload queue
    global.flushDocumentUploadQueue = _flushUploadQueue;

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initDocuments();
        });
    } else {
        setTimeout(initDocuments, 0);
    }

})(typeof window !== 'undefined' ? window : this);
