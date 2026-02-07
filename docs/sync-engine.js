// sync-engine.js v1.0
//
// Generic sync engine for the ADA veterinary app.
// Provides a unified outbox (IndexedDB), push/pull sync with the server,
// conflict resolution (last-write-wins), automatic triggers, and migration
// from the legacy pets-only outbox.
//
// Depends on globals: fetchApi(path, options), showToast(message, type)
// Loaded via <script> tag. Exposes window.syncEngine.

(function () {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================

  var DB_NAME = 'ada_sync';
  var DB_VERSION = 1;
  var OUTBOX_STORE = 'outbox';
  var META_STORE = 'meta';

  var LEGACY_DB_NAME = 'adaPetsDB';
  var LEGACY_OUTBOX_STORE = 'outbox';

  var PUSH_ENDPOINT = '/api/sync/push';
  var PULL_ENDPOINT = '/api/sync/pull';

  var AUTO_PUSH_INTERVAL_MS = 30000; // 30 seconds
  var MAX_ERRORS_KEPT = 50;

  // ============================================
  // STATE
  // ============================================

  var _db = null;
  var _pushing = false;
  var _intervalId = null;
  var _initialized = false;
  var _lastSyncTime = null;
  var _errors = [];

  // ============================================
  // UUID GENERATION
  // ============================================

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID(); } catch (e) { /* fallback below */ }
    }
    var bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    // Set version 4 and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  }

  // ============================================
  // ERROR TRACKING
  // ============================================

  function recordError(message) {
    _errors.push({ time: new Date().toISOString(), error: message });
    if (_errors.length > MAX_ERRORS_KEPT) {
      _errors = _errors.slice(-MAX_ERRORS_KEPT);
    }
  }

  function safeToast(message, type) {
    try {
      if (typeof showToast === 'function') {
        showToast(message, type);
      }
    } catch (e) {
      // showToast unavailable; silently ignore
    }
  }

  // ============================================
  // DATABASE INITIALIZATION
  // ============================================

  function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise(function (resolve, reject) {
      var request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return reject(new Error('IndexedDB not available: ' + (e.message || e)));
      }

      request.onerror = function () {
        if (typeof ADALog !== 'undefined') {
          ADALog.err('IDB', 'openDB error', {error: String(request.error || 'Failed to open ' + DB_NAME)});
        }
        reject(request.error || new Error('Failed to open ' + DB_NAME));
      };

      request.onsuccess = function () {
        _db = request.result;

        // Handle unexpected close (e.g. storage eviction)
        _db.onclose = function () { _db = null; };

        resolve(_db);
      };

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (typeof ADALog !== 'undefined') {
          ADALog.info('IDB', 'upgrade', {oldVersion: event.oldVersion, newVersion: event.newVersion});
        }

        // Outbox store: keyed by op_id (UUID string)
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          var outboxStore = db.createObjectStore(OUTBOX_STORE, { keyPath: 'op_id' });
          outboxStore.createIndex('by_entity', ['entity_type', 'entity_id'], { unique: false });
          outboxStore.createIndex('by_status', 'status', { unique: false });
        }

        // Meta store: key-value pairs for cursors, flags, etc.
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  // ============================================
  // META STORE HELPERS
  // ============================================

  function metaGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(META_STORE, 'readonly');
          var store = tx.objectStore(META_STORE);
          var req = store.get(key);
          req.onsuccess = function () {
            resolve(req.result ? req.result.value : null);
          };
          req.onerror = function () { reject(req.error); };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function metaSet(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(META_STORE, 'readwrite');
          var store = tx.objectStore(META_STORE);
          var req = store.put({ key: key, value: value });
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { reject(req.error); };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // ============================================
  // OUTBOX — READ HELPERS
  // ============================================

  /**
   * Read all outbox records in a single readonly transaction.
   * Returns a plain array (snapshot) so the IDB transaction can close
   * before any async work happens downstream.
   */
  function readAllOutbox() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var records = [];
          var tx = db.transaction(OUTBOX_STORE, 'readonly');
          var store = tx.objectStore(OUTBOX_STORE);
          var cursorReq = store.openCursor();

          cursorReq.onsuccess = function (e) {
            var cursor = e.target.result;
            if (!cursor) return resolve(records);
            records.push(cursor.value);
            cursor.continue();
          };
          cursorReq.onerror = function () { reject(cursorReq.error); };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Count outbox records by status using the index.
   */
  function countByStatus(status) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(OUTBOX_STORE, 'readonly');
          var store = tx.objectStore(OUTBOX_STORE);
          var index = store.index('by_status');
          var req = index.count(IDBKeyRange.only(status));
          req.onsuccess = function () { resolve(req.result || 0); };
          req.onerror = function () { resolve(0); };
        } catch (e) {
          resolve(0);
        }
      });
    });
  }

  // ============================================
  // OUTBOX — WRITE HELPERS
  // ============================================

  /**
   * Batch-update the status (and optionally last_error / retry_count)
   * of the given op_ids in a single readwrite transaction.
   */
  function updateOutboxStatuses(opIds, status, errorMsg) {
    if (!opIds || opIds.length === 0) return Promise.resolve();

    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(OUTBOX_STORE, 'readwrite');
          var store = tx.objectStore(OUTBOX_STORE);

          opIds.forEach(function (opId) {
            var getReq = store.get(opId);
            getReq.onsuccess = function () {
              var rec = getReq.result;
              if (!rec) return;
              rec.status = status;
              if (errorMsg !== undefined) rec.last_error = errorMsg;
              if (status === 'failed') rec.retry_count = (rec.retry_count || 0) + 1;
              if (status === 'pending') rec.last_error = null;
              try { store.put(rec); } catch (e) { /* silent */ }
            };
          });

          tx.oncomplete = function () { resolve(); };
          tx.onabort = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) {
          resolve();
        }
      });
    });
  }

  /**
   * Remove the given op_ids from the outbox in a single transaction.
   */
  function removeFromOutbox(opIds) {
    if (!opIds || opIds.length === 0) return Promise.resolve();

    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(OUTBOX_STORE, 'readwrite');
          var store = tx.objectStore(OUTBOX_STORE);
          opIds.forEach(function (opId) {
            try { store.delete(opId); } catch (e) { /* silent */ }
          });
          tx.oncomplete = function () { resolve(); };
          tx.onabort = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) {
          resolve();
        }
      });
    });
  }

  // ============================================
  // ENQUEUE
  // ============================================

  /**
   * Add an operation to the unified outbox.
   *
   * @param {string} entityType  - e.g. 'pet', 'document', 'referto', 'visit'
   * @param {string} entityId    - UUID of the target entity
   * @param {string} operationType - 'create' | 'update' | 'delete'
   * @param {object} payload     - data payload or patch object
   * @param {number} baseVersion - server version the client last saw (for conflict detection)
   * @returns {Promise<string>} resolves with the generated op_id
   */
  function enqueue(entityType, entityId, operationType, payload, baseVersion) {
    // --- Validation ---
    if (!entityType || typeof entityType !== 'string') {
      return Promise.reject(new Error('syncEngine.enqueue: entityType is required (string)'));
    }
    if (!entityId || typeof entityId !== 'string') {
      return Promise.reject(new Error('syncEngine.enqueue: entityId is required (string)'));
    }
    if (['create', 'update', 'delete'].indexOf(operationType) === -1) {
      return Promise.reject(
        new Error('syncEngine.enqueue: operationType must be "create", "update", or "delete"')
      );
    }

    var record = {
      op_id: generateUUID(),
      entity_type: entityType,
      entity_id: entityId,
      operation_type: operationType,
      payload: payload && typeof payload === 'object' ? payload : {},
      base_version: typeof baseVersion === 'number' && isFinite(baseVersion) ? baseVersion : 0,
      client_timestamp: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
      last_error: null
    };

    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(OUTBOX_STORE, 'readwrite');
          var store = tx.objectStore(OUTBOX_STORE);
          var addReq = store.add(record);

          addReq.onerror = function () {
            reject(addReq.error || new Error('Failed to enqueue operation'));
          };

          tx.oncomplete = function () {
            if (typeof ADALog !== 'undefined') {
              ADALog.info('SYNC', 'enqueue', {opId: record.op_id, entityType: record.entity_type, entityId: record.entity_id, opType: record.operation_type, baseVersion: record.base_version});
            }
            // Trigger auto-push when online
            triggerAutoPush();
            resolve(record.op_id);
          };
          tx.onabort = function () {
            reject(new Error('Enqueue transaction aborted'));
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // ============================================
  // PUSH
  // ============================================

  /**
   * Push all pending (and retryable failed) outbox items to the server.
   *
   * Endpoint: POST /api/sync/push
   * Request body:  { operations: [ ...outbox records ] }
   * Response body: { accepted: [ ...op_ids ], rejected: [ { op_id, reason } ] }
   *
   * Idempotency: the server skips duplicate op_ids and reports them as 'accepted'.
   *
   * @returns {Promise<object>} summary of the push result
   */
  function pushAll() {
    if (_pushing) {
      return Promise.resolve({ skipped: true, reason: 'push_in_progress' });
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.resolve({ skipped: true, reason: 'offline' });
    }

    _pushing = true;

    return readAllOutbox()
      .then(function (allRecords) {
        // Only push records that are pending or previously failed
        var toPush = allRecords.filter(function (r) {
          return r.status === 'pending' || r.status === 'failed';
        });

        if (toPush.length === 0) {
          _pushing = false;
          return { pushed: 0 };
        }

        var opIds = toPush.map(function (r) { return r.op_id; });

        // Mark as 'pushing' so concurrent calls are aware
        return updateOutboxStatuses(opIds, 'pushing', null)
          .then(function () {
            // Map outbox records to the server-expected format
            var mappedOps = toPush.map(function (r) {
              var changeType = r.operation_type;
              if (changeType === 'create' || changeType === 'update') changeType = 'upsert';
              return {
                op_id: r.op_id,
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                change_type: changeType,
                record: r.payload || null,
                base_version: r.base_version || null,
                client_ts: r.client_timestamp || null
              };
            });
            if (typeof ADALog !== 'undefined') {
              var entityTypeCounts = {};
              toPush.forEach(function (r) {
                entityTypeCounts[r.entity_type] = (entityTypeCounts[r.entity_type] || 0) + 1;
              });
              ADALog.info('SYNC', 'pushAll: sending', {opsCount: toPush.length, entityTypeCounts: entityTypeCounts});
            }
            var deviceId = 'unknown';
            try { deviceId = localStorage.getItem('ada_device_id') || 'unknown'; } catch (e) {}
            return fetchApi(PUSH_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ device_id: deviceId, ops: mappedOps })
            });
          })
          .then(function (response) {
            if (!response || !response.ok) {
              var code = response ? response.status : 'network_error';
              throw new Error('Push failed: HTTP ' + code);
            }
            return response.json();
          })
          .then(function (data) {
            return processPushResponse(data, opIds);
          })
          .catch(function (err) {
            return handlePushError(err, opIds);
          });
      })
      .catch(function (err) {
        _pushing = false;
        var msg = err && err.message ? err.message : 'Unknown push error';
        recordError(msg);
        return { pushed: 0, error: msg };
      });
  }

  /**
   * Process the structured response from POST /api/sync/push.
   */
  function processPushResponse(data, allOpIds) {
    var acceptedIds = [];
    var rejectedMap = {}; // op_id -> reason

    if (Array.isArray(data.accepted)) {
      data.accepted.forEach(function (item) {
        var id = typeof item === 'string' ? item : (item && item.op_id);
        if (id) acceptedIds.push(id);
      });
    }

    if (Array.isArray(data.rejected)) {
      data.rejected.forEach(function (item) {
        if (item && item.op_id) {
          rejectedMap[item.op_id] = item.reason || 'rejected_by_server';
        }
      });
    }

    var rejectedIds = Object.keys(rejectedMap);
    var handledSet = {};
    acceptedIds.forEach(function (id) { handledSet[id] = true; });
    rejectedIds.forEach(function (id) { handledSet[id] = true; });

    // Ops that the server did not mention: revert to pending
    var unhandledIds = allOpIds.filter(function (id) { return !handledSet[id]; });

    var tasks = [];

    // Remove accepted from outbox
    if (acceptedIds.length > 0) {
      tasks.push(removeFromOutbox(acceptedIds));
    }

    // Mark each rejected op as failed with the specific reason
    if (rejectedIds.length > 0) {
      rejectedIds.forEach(function (rId) {
        tasks.push(updateOutboxStatuses([rId], 'failed', rejectedMap[rId]));
      });
    }

    // Revert unhandled ops to pending
    if (unhandledIds.length > 0) {
      tasks.push(updateOutboxStatuses(unhandledIds, 'pending', null));
    }

    return Promise.all(tasks).then(function () {
      _pushing = false;

      if (typeof ADALog !== 'undefined') {
        ADALog.info('SYNC', 'processPushResponse', {total: allOpIds.length, accepted: acceptedIds.length, rejected: rejectedIds.length, unhandled: unhandledIds.length});
      }

      if (rejectedIds.length > 0) {
        safeToast('Sync: ' + rejectedIds.length + ' operazioni rifiutate', 'error');
      }

      return {
        pushed: allOpIds.length,
        accepted: acceptedIds.length,
        rejected: rejectedIds.length
      };
    });
  }

  /**
   * Handle a network or server error during push.
   * All in-flight ops revert to 'failed' so they will be retried.
   */
  function handlePushError(err, opIds) {
    var msg = err && err.message ? err.message : 'Push error';
    recordError(msg);
    if (typeof ADALog !== 'undefined') {
      ADALog.err('SYNC', 'handlePushError', {error: msg, affectedOps: opIds.length});
    }

    return updateOutboxStatuses(opIds, 'failed', msg).then(function () {
      _pushing = false;
      return { pushed: 0, error: msg };
    });
  }

  // ============================================
  // PULL
  // ============================================

  /**
   * Incremental pull from the server.
   *
   * Endpoint: GET /api/sync/pull?since=<cursor>
   * Response: { changes: [...], cursor: <number> }
   *
   * The cursor is the last change_id received; the server returns up to 500
   * newer changes per request.
   *
   * Conflict resolution strategy: LAST-WRITE-WINS
   * -------------------------------------------------
   * When a remote change targets the same entity as a pending local outbox
   * operation, timestamps are compared. The most recent client_timestamp wins;
   * if timestamps are absent or equal, created_at is used as a fallback.
   * Losing local ops are removed from the outbox. Winning local ops are kept
   * and will be pushed on the next cycle.
   * All conflict resolutions are logged via console.warn for observability.
   *
   * @returns {Promise<object>} summary of the pull result
   */
  function pull() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.resolve({ pulled: 0, reason: 'offline' });
    }

    var totalPulled = 0;
    var MAX_PAGES = 10;

    function fetchPage(since) {
      return fetchApi(PULL_ENDPOINT + '?since=' + encodeURIComponent(since))
        .then(function (response) {
          if (!response || !response.ok) {
            var code = response ? response.status : 'network_error';
            throw new Error('Pull failed: HTTP ' + code);
          }
          return response.json();
        });
    }

    function pullLoop(since, page) {
      if (page >= MAX_PAGES) {
        // Safety limit reached; stop paginating
        return Promise.resolve();
      }

      return fetchPage(since).then(function (data) {
        var changes = Array.isArray(data.changes) ? data.changes : [];
        var newCursor = data.next_cursor || data.cursor;

        if (changes.length === 0) {
          return Promise.resolve();
        }

        totalPulled += changes.length;

        return resolveConflictsAndApply(changes).then(function () {
          // Persist new cursor
          var cursorPromise = (newCursor !== undefined && newCursor !== null)
            ? metaSet('pull_cursor', newCursor)
            : Promise.resolve();

          return cursorPromise.then(function () {
            // Check if there may be more pages
            if (data.has_more || changes.length >= 500) {
              var nextSince = (newCursor !== undefined && newCursor !== null) ? newCursor : since;
              return pullLoop(nextSince, page + 1);
            }
          });
        });
      });
    }

    return metaGet('pull_cursor')
      .then(function (cursor) {
        var since = cursor || 0;
        if (typeof ADALog !== 'undefined') {
          ADALog.info('SYNC', 'pull: start', {cursor: since});
        }
        return pullLoop(since, 0);
      })
      .then(function () {
        _lastSyncTime = new Date().toISOString();
        return metaSet('last_sync', _lastSyncTime);
      })
      .then(function () {
        if (typeof ADALog !== 'undefined') {
          ADALog.info('SYNC', 'pull: complete', {totalPulled: totalPulled});
        }
        return { pulled: totalPulled, cursor: null };
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'Pull error';
        recordError(msg);
        if (typeof ADALog !== 'undefined') {
          ADALog.warn('SYNC', 'pull: error', {error: msg});
        }
        return { pulled: 0, error: msg };
      });
  }

  /**
   * Compare timestamps for last-write-wins conflict resolution.
   * Returns a Date for comparison; uses client_ts first, then created_at.
   */
  function resolveTimestamp(clientTs, createdAt) {
    if (clientTs) {
      var d = new Date(clientTs);
      if (!isNaN(d.getTime())) return d;
    }
    if (createdAt) {
      var d2 = new Date(createdAt);
      if (!isNaN(d2.getTime())) return d2;
    }
    return new Date(0); // epoch fallback
  }

  /**
   * For each incoming remote change, check the local outbox for conflicting
   * operations on the same entity. Resolve via last-write-wins.
   * Then dispatch a CustomEvent so entity-specific handlers can react.
   */
  function resolveConflictsAndApply(changes) {
    return readAllOutbox().then(function (localRecords) {
      // Index local records by entity key for fast lookup
      var localByEntity = {};
      localRecords.forEach(function (rec) {
        var key = rec.entity_type + ':' + rec.entity_id;
        if (!localByEntity[key]) localByEntity[key] = [];
        localByEntity[key].push(rec);
      });

      var opsToRemove = [];

      changes.forEach(function (change) {
        if (!change || !change.entity_type || !change.entity_id) return;

        var entityKey = change.entity_type + ':' + change.entity_id;
        var conflicting = localByEntity[entityKey];
        var localWon = false;

        if (conflicting && conflicting.length > 0) {
          var remoteTs = resolveTimestamp(change.client_ts, change.created_at);

          conflicting.forEach(function (local) {
            var localTs = resolveTimestamp(local.client_timestamp, null);

            if (remoteTs.getTime() >= localTs.getTime()) {
              // Remote wins: mark local op for removal
              if (typeof ADALog !== 'undefined') {
                ADALog.warn('SYNC', 'conflict: remote wins', {entityType: change.entity_type, entityId: change.entity_id, remoteTs: remoteTs.toISOString(), localTs: localTs.toISOString(), localOpId: local.op_id});
              }
              opsToRemove.push(local.op_id);
            } else {
              // Local wins: keep local op; it will be pushed on next cycle
              localWon = true;
              if (typeof ADALog !== 'undefined') {
                ADALog.warn('SYNC', 'conflict: local wins', {entityType: change.entity_type, entityId: change.entity_id, remoteTs: remoteTs.toISOString(), localTs: localTs.toISOString(), localOpId: local.op_id});
              }
            }
          });
        }

        // Dispatch event so entity-specific code can apply the change to its own store
        // Skip dispatch when the local operation won the conflict
        if (!localWon) {
          dispatchChangeEvent(change);
        }
      });

      // Remove ops that lost the conflict
      if (opsToRemove.length > 0) {
        return removeFromOutbox(opsToRemove);
      }
      return Promise.resolve();
    });
  }

  /**
   * Dispatch a CustomEvent on window so entity-specific handlers can
   * react to incoming remote changes (e.g. update local pet records).
   */
  function dispatchChangeEvent(change) {
    try {
      var event = new CustomEvent('syncEngine:change', {
        detail: {
          entity_type: change.entity_type,
          entity_id: change.entity_id,
          change_type: change.change_type,
          record: change.record || null,
          version: change.version || null
        }
      });
      window.dispatchEvent(event);
    } catch (e) {
      // CustomEvent may not be supported; degrade silently
    }
  }

  // ============================================
  // STATUS
  // ============================================

  /**
   * Returns the current sync status.
   *
   * @returns {Promise<{ pending: number, pushing: number, lastSync: string|null, errors: Array }>}
   */
  function getStatus() {
    return Promise.all([
      countByStatus('pending'),
      countByStatus('pushing'),
      countByStatus('failed')
    ]).then(function (counts) {
      return {
        pending: counts[0] + counts[2], // pending + failed both count as "not yet synced"
        pushing: counts[1],
        lastSync: _lastSyncTime,
        errors: _errors.slice(-10)
      };
    }).catch(function () {
      return {
        pending: 0,
        pushing: 0,
        lastSync: _lastSyncTime,
        errors: _errors.slice(-10)
      };
    });
  }

  // ============================================
  // MIGRATION FROM LEGACY OUTBOX
  // ============================================

  /**
   * Migrate outbox records from the legacy 'adaPetsDB' IndexedDB to the
   * new unified 'ada_sync' outbox format.
   *
   * Legacy record structure (from ADA_Pets / app-pets.js):
   *   {
   *     id: autoIncrement,
   *     op_type: 'create' | 'update' | 'delete',
   *     payload: { id: petId, patient: {...}, base_version: N, ... },
   *     created_at: ISO string,
   *     op_uuid: string,
   *     pet_local_id: string
   *   }
   *
   * Converts each to the new schema with entity_type = 'pet'.
   * Idempotent: skips if already migrated (flag in meta store).
   *
   * @returns {Promise<{ migrated: boolean, count: number, reason?: string }>}
   */
  function migrateFromLegacy() {
    return metaGet('legacy_migrated').then(function (flag) {
      if (flag) {
        return { migrated: false, count: 0, reason: 'already_migrated' };
      }

      return readLegacyOutbox().then(function (legacyRecords) {
        if (!legacyRecords || legacyRecords.length === 0) {
          return metaSet('legacy_migrated', new Date().toISOString()).then(function () {
            return { migrated: true, count: 0, reason: 'no_legacy_records' };
          });
        }

        return insertConvertedRecords(legacyRecords).then(function (count) {
          return metaSet('legacy_migrated', new Date().toISOString()).then(function () {
            if (typeof ADALog !== 'undefined') {
              ADALog.info('SYNC', 'migrateFromLegacy: complete', {migratedCount: count});
            }
            safeToast('Sync: migrati ' + count + ' record dal vecchio outbox', 'success');
            return { migrated: true, count: count };
          });
        });
      });
    }).catch(function (err) {
      var msg = err && err.message ? err.message : 'Migration error';
      recordError('migrateFromLegacy: ' + msg);
      return { migrated: false, count: 0, reason: msg };
    });
  }

  /**
   * Attempt to open the legacy IndexedDB and read its outbox store.
   * Resolves with an array (possibly empty) even if the DB does not exist.
   */
  function readLegacyOutbox() {
    return new Promise(function (resolve) {
      var legacyReq;
      try {
        legacyReq = indexedDB.open(LEGACY_DB_NAME);
      } catch (e) {
        return resolve([]);
      }

      legacyReq.onerror = function () {
        resolve([]);
      };

      legacyReq.onsuccess = function () {
        var legacyDb = legacyReq.result;

        if (!legacyDb.objectStoreNames.contains(LEGACY_OUTBOX_STORE)) {
          legacyDb.close();
          return resolve([]);
        }

        try {
          var records = [];
          var tx = legacyDb.transaction(LEGACY_OUTBOX_STORE, 'readonly');
          var store = tx.objectStore(LEGACY_OUTBOX_STORE);
          var cursorReq = store.openCursor();

          cursorReq.onsuccess = function (e) {
            var cursor = e.target.result;
            if (!cursor) {
              legacyDb.close();
              return resolve(records);
            }
            records.push(cursor.value);
            cursor.continue();
          };

          cursorReq.onerror = function () {
            legacyDb.close();
            resolve(records);
          };

          tx.onabort = function () {
            legacyDb.close();
            resolve(records);
          };
        } catch (e) {
          legacyDb.close();
          resolve([]);
        }
      };

      // If onupgradeneeded fires, the DB didn't exist; abort to prevent creating a phantom empty DB.
      legacyReq.onupgradeneeded = function (event) {
        event.target.transaction.abort();
      };
    });
  }

  /**
   * Convert legacy outbox records to the new format and insert them.
   */
  function insertConvertedRecords(legacyRecords) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(OUTBOX_STORE, 'readwrite');
          var store = tx.objectStore(OUTBOX_STORE);
          var count = 0;

          legacyRecords.forEach(function (legacy) {
            try {
              // Derive entity_id from payload.id or pet_local_id
              var entityId = '';
              if (legacy.payload && legacy.payload.id) {
                entityId = String(legacy.payload.id);
              } else if (legacy.pet_local_id) {
                entityId = String(legacy.pet_local_id);
              }
              if (!entityId) return; // skip records without identifiable entity

              // Map legacy op_type to new operation_type
              var opType = legacy.op_type;
              if (['create', 'update', 'delete'].indexOf(opType) === -1) {
                opType = 'update'; // safe default
              }

              var newRecord = {
                op_id: legacy.op_uuid || generateUUID(),
                entity_type: 'pet',
                entity_id: entityId,
                operation_type: opType,
                payload: legacy.payload || {},
                base_version: (legacy.payload && typeof legacy.payload.base_version === 'number')
                  ? legacy.payload.base_version : 0,
                client_timestamp: legacy.created_at || new Date().toISOString(),
                status: 'pending',
                retry_count: 0,
                last_error: null
              };

              store.put(newRecord); // put to handle potential duplicate op_ids gracefully
              count++;
            } catch (e) {
              console.warn('[syncEngine] Skipped legacy record during migration:', e);
            }
          });

          tx.oncomplete = function () { resolve(count); };
          tx.onerror = function () { reject(tx.error || new Error('Migration tx error')); };
          tx.onabort = function () { reject(new Error('Migration transaction aborted')); };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // ============================================
  // AUTO-PUSH TRIGGERS
  // ============================================

  /**
   * Called after enqueue: if online and not already pushing, push soon.
   */
  function triggerAutoPush() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (_pushing) return;

    // Small delay to allow batching of rapid enqueue calls
    setTimeout(function () {
      if (_pushing) return;
      pushAll().catch(function () { /* silent */ });
    }, 150);
  }

  /**
   * Check if there are pending items and push if so.
   * Used by the periodic interval and the online handler.
   */
  function checkAndPush() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (_pushing) return;

    readAllOutbox()
      .then(function (records) {
        var hasPending = records.some(function (r) {
          return r.status === 'pending' || r.status === 'failed';
        });
        var pushPromise = hasPending ? pushAll() : Promise.resolve();
        return pushPromise.then(function () {
          return pull();
        });
      })
      .catch(function () { /* silent */ });
  }

  /**
   * Start the periodic auto-push interval and the online event listener.
   */
  function startAutoSync() {
    if (_intervalId) return;

    // Periodic check every 30 seconds
    _intervalId = setInterval(function () {
      checkAndPush();
    }, AUTO_PUSH_INTERVAL_MS);

    // Push immediately when the browser comes back online
    try {
      window.addEventListener('online', function () {
        checkAndPush();
      });
    } catch (e) {
      // addEventListener unavailable; degrade silently
    }
  }

  /**
   * Stop auto-sync (useful for cleanup / testing).
   */
  function stopAutoSync() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    if (_initialized) return Promise.resolve();
    _initialized = true;

    return openDB()
      .then(function () {
        return metaGet('last_sync');
      })
      .then(function (lastSync) {
        _lastSyncTime = lastSync || null;
        startAutoSync();
      })
      .catch(function (err) {
        console.warn('[syncEngine] Initialization error:', err);
      });
  }

  // Auto-initialize on script load
  try {
    if (typeof indexedDB !== 'undefined') {
      init();
    }
  } catch (e) {
    // Fail silently if IndexedDB is completely unavailable
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.syncEngine = {
    /** Add an operation to the outbox. */
    enqueue: enqueue,

    /** Push all pending outbox items to the server. */
    pushAll: pushAll,

    /** Incremental pull from the server. */
    pull: pull,

    /** Get current sync status. */
    getStatus: getStatus,

    /** Migrate from legacy adaPetsDB outbox to the unified format. */
    migrateFromLegacy: migrateFromLegacy,

    /** @internal Re-initialize (e.g. after DB close). */
    _init: init,

    /** @internal Stop the auto-push interval (for testing / cleanup). */
    _stopAutoSync: stopAutoSync
  };

})();
