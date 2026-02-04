// app-observability.js v1.0
// Lightweight frontend observability module for ADA veterinary app (PR 12)
// Captures errors, page view durations, API call metrics.
// Exposes window.ADAObservability

(function (global) {
    'use strict';

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    var MAX_BUFFER_SIZE = 100;
    var FLUSH_INTERVAL_MS = 30000; // 30 seconds
    var TELEMETRY_ENDPOINT = '/api/telemetry/events';

    // -------------------------------------------------------------------------
    // Event buffer
    // -------------------------------------------------------------------------

    var eventBuffer = [];

    function pushEvent(type, data) {
        var evt = {
            type: type,
            ts: new Date().toISOString(),
            data: data || {}
        };

        eventBuffer.push(evt);

        // Trim to max buffer size (drop oldest)
        if (eventBuffer.length > MAX_BUFFER_SIZE) {
            eventBuffer = eventBuffer.slice(eventBuffer.length - MAX_BUFFER_SIZE);
        }
    }

    // -------------------------------------------------------------------------
    // 1. Unhandled error capture
    // -------------------------------------------------------------------------

    var errorCount = 0;
    var recentErrors = [];

    global.addEventListener('error', function (event) {
        errorCount++;
        var info = {
            message: event.message || 'Unknown error',
            source: event.filename || '',
            line: event.lineno || 0,
            col: event.colno || 0
        };
        recentErrors.push(info);
        if (recentErrors.length > 20) {
            recentErrors = recentErrors.slice(recentErrors.length - 20);
        }
        pushEvent('error', info);
    });

    global.addEventListener('unhandledrejection', function (event) {
        errorCount++;
        var reason = '';
        try {
            reason = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown rejection';
        } catch (e) {
            reason = 'Unknown rejection';
        }
        var info = {
            message: reason,
            source: 'unhandledrejection'
        };
        recentErrors.push(info);
        if (recentErrors.length > 20) {
            recentErrors = recentErrors.slice(recentErrors.length - 20);
        }
        pushEvent('unhandled_rejection', info);
    });

    // -------------------------------------------------------------------------
    // 2. Page view duration tracking
    // -------------------------------------------------------------------------

    var pageViews = {};
    var currentPage = null;
    var currentPageStart = null;

    function startPageView(pageName) {
        // End previous page view if any
        if (currentPage && currentPageStart) {
            var duration = Date.now() - currentPageStart;
            if (!pageViews[currentPage]) {
                pageViews[currentPage] = { count: 0, totalMs: 0 };
            }
            pageViews[currentPage].count++;
            pageViews[currentPage].totalMs += duration;

            pushEvent('page_view_end', {
                page: currentPage,
                durationMs: duration
            });
        }

        currentPage = pageName || document.title || location.pathname;
        currentPageStart = Date.now();

        pushEvent('page_view_start', {
            page: currentPage
        });
    }

    // Track hash-based SPA navigation (ADA uses hash routing)
    global.addEventListener('hashchange', function () {
        var hash = location.hash.replace(/^#\/?/, '') || 'home';
        startPageView(hash);
    });

    // Initial page view
    var initialPage = location.hash.replace(/^#\/?/, '') || 'home';
    startPageView(initialPage);

    // -------------------------------------------------------------------------
    // 3. API call tracking (monkey-patch fetchApi)
    // -------------------------------------------------------------------------

    var apiMetrics = {
        totalCalls: 0,
        totalErrors: 0,
        byEndpoint: {}
    };

    function recordApiCall(endpoint, durationMs, success) {
        apiMetrics.totalCalls++;
        if (!success) apiMetrics.totalErrors++;

        if (!apiMetrics.byEndpoint[endpoint]) {
            apiMetrics.byEndpoint[endpoint] = {
                count: 0,
                errors: 0,
                totalMs: 0,
                minMs: Infinity,
                maxMs: 0
            };
        }

        var ep = apiMetrics.byEndpoint[endpoint];
        ep.count++;
        if (!success) ep.errors++;
        ep.totalMs += durationMs;
        if (durationMs < ep.minMs) ep.minMs = durationMs;
        if (durationMs > ep.maxMs) ep.maxMs = durationMs;

        pushEvent('api_call', {
            endpoint: endpoint,
            durationMs: durationMs,
            success: success
        });
    }

    // Monkey-patch fetchApi once it's available on the global scope
    function patchFetchApi() {
        if (typeof global.fetchApi !== 'function') return false;
        if (global.fetchApi.__obsPatched) return true;

        var originalFetchApi = global.fetchApi;

        global.fetchApi = function (path, options) {
            var start = Date.now();
            var endpoint = path || 'unknown';

            var result;
            try {
                result = originalFetchApi.apply(this, arguments);
            } catch (e) {
                recordApiCall(endpoint, Date.now() - start, false);
                throw e;
            }

            // fetchApi returns a promise
            if (result && typeof result.then === 'function') {
                return result.then(function (response) {
                    var duration = Date.now() - start;
                    var success = response && response.ok !== undefined ? response.ok : true;
                    recordApiCall(endpoint, duration, success);
                    return response;
                }).catch(function (err) {
                    recordApiCall(endpoint, Date.now() - start, false);
                    throw err;
                });
            }

            return result;
        };

        global.fetchApi.__obsPatched = true;
        return true;
    }

    // Try patching immediately, and also retry after a short delay
    // (fetchApi is defined in config.js which loads before this script)
    if (!patchFetchApi()) {
        setTimeout(patchFetchApi, 100);
    }

    // -------------------------------------------------------------------------
    // 4. Report generation
    // -------------------------------------------------------------------------

    function getObservabilityReport() {
        // Finalize current page view duration
        var currentPageDuration = null;
        if (currentPage && currentPageStart) {
            currentPageDuration = {
                page: currentPage,
                durationMs: Date.now() - currentPageStart,
                active: true
            };
        }

        // Compute averages for API endpoints
        var apiSummary = {};
        var endpoints = Object.keys(apiMetrics.byEndpoint);
        for (var i = 0; i < endpoints.length; i++) {
            var key = endpoints[i];
            var ep = apiMetrics.byEndpoint[key];
            apiSummary[key] = {
                count: ep.count,
                errors: ep.errors,
                avgMs: ep.count > 0 ? Math.round(ep.totalMs / ep.count) : 0,
                minMs: ep.minMs === Infinity ? 0 : ep.minMs,
                maxMs: ep.maxMs
            };
        }

        return {
            generatedAt: new Date().toISOString(),
            errors: {
                total: errorCount,
                recent: recentErrors.slice(-10)
            },
            pageViews: {
                current: currentPageDuration,
                summary: JSON.parse(JSON.stringify(pageViews))
            },
            api: {
                totalCalls: apiMetrics.totalCalls,
                totalErrors: apiMetrics.totalErrors,
                byEndpoint: apiSummary
            },
            bufferSize: eventBuffer.length
        };
    }

    // -------------------------------------------------------------------------
    // 5. Telemetry flush (fire-and-forget)
    // -------------------------------------------------------------------------

    function flushTelemetry() {
        if (eventBuffer.length === 0) return;

        var batch = eventBuffer.slice();
        eventBuffer = [];

        try {
            var url = (global.ADA_API_BASE_URL || '') + TELEMETRY_ENDPOINT;
            var token = '';
            if (typeof global.getAuthToken === 'function') {
                token = global.getAuthToken();
            }

            var headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            // Use native fetch (not fetchApi) to avoid recursion and metrics noise
            if (typeof global.fetch === 'function') {
                global.fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ events: batch })
                }).catch(function () {
                    // Fire-and-forget: silently ignore failures
                });
            }
        } catch (e) {
            // Fire-and-forget: never fail
        }
    }

    // Periodic flush
    setInterval(flushTelemetry, FLUSH_INTERVAL_MS);

    // Flush on page unload
    global.addEventListener('beforeunload', function () {
        // End current page view
        if (currentPage && currentPageStart) {
            var duration = Date.now() - currentPageStart;
            pushEvent('page_view_end', {
                page: currentPage,
                durationMs: duration
            });
        }
        flushTelemetry();
    });

    // -------------------------------------------------------------------------
    // 6. Public API
    // -------------------------------------------------------------------------

    global.ADAObservability = {
        getReport: getObservabilityReport,
        flush: flushTelemetry,
        pushEvent: pushEvent,
        startPageView: startPageView,
        getBuffer: function () { return eventBuffer.slice(); }
    };

})(typeof window !== 'undefined' ? window : this);
