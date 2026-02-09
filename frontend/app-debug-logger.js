// app-debug-logger.js v1.0
// Centralized debug logging for ADA — writes to localStorage ADA_LOG
// Active ONLY when debugLogEnabled === true

(function (global) {
    'use strict';

    var LOG_KEY = 'ADA_LOG';
    var MAX_LOG_BYTES = 500 * 1024;
    var TRIM_TO_BYTES = 400 * 1024;
    var _correlationId = null;

    // --- Correlation ID ---

    function beginCorrelation(label) {
        var arr = new Uint8Array(4);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(arr);
        } else {
            for (var i = 0; i < 4; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        _correlationId = Array.from(arr, function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
        _writeLog('INFO', 'CORE', 'Begin: ' + (label || ''), null);
        return _correlationId;
    }

    function endCorrelation() { _correlationId = null; }
    function getCorrelationId() { return _correlationId; }

    // --- Core writer ---

    function _isEnabled() {
        return (typeof debugLogEnabled !== 'undefined' && debugLogEnabled === true);
    }

    function _writeLog(level, domain, message, data) {
        if (level !== 'ERR' && !_isEnabled()) return;
        try {
            var now = new Date();
            var ts = now.toLocaleString('it-IT', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            var ms = ('00' + now.getMilliseconds()).slice(-3);
            var corrId = _correlationId || '--------';

            var entry = '[' + ts + '.' + ms + '] [' + level + '] [' + domain + '] [' + corrId + '] ' + message;

            if (data !== null && data !== undefined) {
                try {
                    var json = JSON.stringify(data);
                    if (json && json !== '{}') entry += ' | ' + json;
                } catch (e) { entry += ' | [serialize_error]'; }
            }
            entry += '\n';

            var existing = localStorage.getItem(LOG_KEY) || '';

            // Rotation
            if ((existing.length + entry.length) > MAX_LOG_BYTES) {
                var cutPoint = existing.length - TRIM_TO_BYTES;
                if (cutPoint > 0) {
                    var nlPos = existing.indexOf('\n', cutPoint);
                    existing = (nlPos !== -1)
                        ? '[...log troncato...]\n' + existing.substring(nlPos + 1)
                        : '';
                }
            }

            localStorage.setItem(LOG_KEY, existing + entry);

            if (level === 'ERR') console.error('[ADA][' + domain + '] ' + message, data || '');
            else if (level === 'WARN') console.warn('[ADA][' + domain + '] ' + message, data || '');
        } catch (e) { /* localStorage full — drop silently */ }
    }

    // --- Public API ---

    function logErr(domain, msg, data) { _writeLog('ERR', domain, msg, data); }
    function logWarn(domain, msg, data) { _writeLog('WARN', domain, msg, data); }
    function logInfo(domain, msg, data) { _writeLog('INFO', domain, msg, data); }
    function logDbg(domain, msg, data) { _writeLog('DBG', domain, msg, data); }
    function logPerf(domain, msg, data) { _writeLog('PERF', domain, msg, data); }

    // --- Backward compat: replace global logError / logDebug ---

    global.logError = function (context, errorMessage) {
        logErr('CORE', context + ': ' + errorMessage, null);
    };
    global.logDebug = function (context, message) {
        var msg = (typeof message !== 'string') ? JSON.stringify(message) : message;
        logDbg('CORE', context + ': ' + msg, null);
    };

    global.ADALog = {
        err: logErr, warn: logWarn, info: logInfo, dbg: logDbg, perf: logPerf,
        beginCorrelation: beginCorrelation,
        endCorrelation: endCorrelation,
        getCorrelationId: getCorrelationId
    };

})(typeof window !== 'undefined' ? window : this);
