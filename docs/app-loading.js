// app-loading.js v1.0

/**
 * InlineLoader - Reusable loading/progress indicator for ADA veterinary app.
 *
 * Features:
 *  - AbortController per instance for fetch cancellation
 *  - Elapsed-time copy thresholds with Italian UX messages
 *  - Hard timeout at 45 s (auto-abort)
 *  - Double-request prevention (same action cancels previous)
 *  - Navigation cleanup hook (InlineLoader.cleanupAll)
 *  - Manual retry with timer/state reset, focus preservation
 *  - Accessible: aria-live region, text always accompanies spinner
 *
 * Usage:
 *   var loader = new InlineLoader({
 *       containerId: 'my-container',
 *       onRetry: function (loader) { ... },
 *       onAbort: function (loader) { ... }
 *   });
 *   loader.start(function (signal) {
 *       return fetch('/api/data', { signal: signal });
 *   });
 */

(function (global) {
    'use strict';

    // ---------------------------------------------------------------------------
    // Registry - tracks every active loader so cleanupAll can reach them
    // ---------------------------------------------------------------------------
    var _activeLoaders = new Set();

    // ---------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------
    var THRESHOLDS = [
        { from: 0,  to: 5,  text: 'In attesa di risposta\u2026' },
        { from: 6,  to: 30, text: 'Elaborazione in corso\u2026 ({s}s)' },
        { from: 31, to: 89, text: 'La risposta sta impiegando pi\u00f9 del previsto\u2026 ({s}s)' }
    ];
    var TIMEOUT_TEXT  = 'Problema di comunicazione.';
    var HARD_TIMEOUT  = 120; // seconds (backend OpenAI timeout is 90s)
    var SHOW_RETRY_AFTER = 90; // seconds

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function _copyForElapsed(seconds) {
        for (var i = 0; i < THRESHOLDS.length; i++) {
            var t = THRESHOLDS[i];
            if (seconds >= t.from && seconds <= t.to) {
                return t.text.replace('{s}', String(seconds));
            }
        }
        // Beyond last threshold — show timeout text
        return TIMEOUT_TEXT;
    }

    function _createElement(tag, attrs, textContent) {
        var el = document.createElement(tag);
        if (attrs) {
            for (var key in attrs) {
                if (attrs.hasOwnProperty(key)) {
                    el.setAttribute(key, attrs[key]);
                }
            }
        }
        if (textContent !== undefined) {
            el.textContent = textContent;
        }
        return el;
    }

    // ---------------------------------------------------------------------------
    // CSS (injected once)
    // ---------------------------------------------------------------------------
    var _styleInjected = false;

    function _injectStyles() {
        if (_styleInjected) return;
        _styleInjected = true;

        var css = [
            '.il-wrapper { display:flex; flex-direction:column; align-items:center;',
            '  justify-content:center; gap:12px; padding:24px 16px; text-align:center; }',

            '.il-spinner { width:28px; height:28px; border:3px solid #e0e0e0;',
            '  border-top-color:#1976d2; border-radius:50%;',
            '  animation: il-spin 0.8s linear infinite; }',

            '@keyframes il-spin { to { transform:rotate(360deg); } }',

            '.il-text { font-size:14px; color:#555; line-height:1.5;',
            '  min-height:1.5em; transition:opacity 0.15s ease; }',

            '.il-text--error { color:#c62828; font-weight:600; }',

            '.il-retry-btn { display:inline-block; margin-top:4px; padding:8px 20px;',
            '  font-size:14px; font-weight:600; color:#fff; background:#1976d2;',
            '  border:none; border-radius:6px; cursor:pointer; transition:background 0.15s; }',

            '.il-retry-btn:hover { background:#1565c0; }',
            '.il-retry-btn:focus-visible { outline:2px solid #1976d2; outline-offset:2px; }',

            '.il-hidden { display:none !important; }'
        ].join('\n');

        var style = document.createElement('style');
        style.setAttribute('data-inline-loader', '1');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------------
    // InlineLoader class
    // ---------------------------------------------------------------------------

    /**
     * @constructor
     * @param {Object} options
     * @param {string}   options.containerId - id of an existing DOM element
     * @param {Function} [options.onRetry]   - called when user clicks Retry
     * @param {Function} [options.onAbort]   - called when request is aborted
     * @param {string}   [options.watchInputId] - if set, abort on input change in this element
     */
    function InlineLoader(options) {
        if (!options || !options.containerId) {
            throw new Error('InlineLoader: containerId is required');
        }

        this._containerId  = options.containerId;
        this._onRetry      = typeof options.onRetry === 'function' ? options.onRetry : null;
        this._onAbort      = typeof options.onAbort === 'function' ? options.onAbort : null;
        this._watchInputId = typeof options.watchInputId === 'string' ? options.watchInputId : null;

        // Internal state
        this._abortController    = null;
        this._tickInterval       = null;
        this._elapsed            = 0;
        this._running            = false;
        this._fetchFn            = null; // stored for retry
        this._destroyed          = false;
        this._inputChangeHandler = null;

        // DOM references (created lazily on first start)
        this._wrapper    = null;
        this._spinnerEl  = null;
        this._textEl     = null;
        this._retryBtn   = null;

        _injectStyles();
    }

    // ---- DOM bootstrap -------------------------------------------------------

    InlineLoader.prototype._ensureDOM = function () {
        if (this._wrapper) return;

        var container = document.getElementById(this._containerId);
        if (!container) {
            throw new Error('InlineLoader: container #' + this._containerId + ' not found');
        }

        // Wrapper - serves as the aria-live region
        this._wrapper = _createElement('div', {
            'class':     'il-wrapper il-hidden',
            'role':      'status',
            'aria-live': 'polite'
        });

        // Spinner
        this._spinnerEl = _createElement('div', { 'class': 'il-spinner', 'aria-hidden': 'true' });

        // Text
        this._textEl = _createElement('p', { 'class': 'il-text' });

        // Retry button
        this._retryBtn = _createElement('button', {
            'class': 'il-retry-btn il-hidden',
            'type':  'button'
        }, 'Riprova');

        var self = this;
        this._retryBtn.addEventListener('click', function () {
            self._handleRetry();
        });

        this._wrapper.appendChild(this._spinnerEl);
        this._wrapper.appendChild(this._textEl);
        this._wrapper.appendChild(this._retryBtn);
        container.appendChild(this._wrapper);
    };

    // ---- Public API ----------------------------------------------------------

    /**
     * Start the loader and execute the provided fetch function.
     *
     * @param {Function} fetchFn - receives an AbortSignal, must return a Promise.
     *   Example: function (signal) { return fetch(url, { signal: signal }); }
     */
    InlineLoader.prototype.start = function (fetchFn) {
        if (this._destroyed) return;
        if (typeof fetchFn !== 'function') {
            throw new Error('InlineLoader.start: fetchFn must be a function');
        }

        // Double-request guard: cancel any in-flight request
        if (this._running) {
            this._abort(true); // silent abort (no onAbort callback - this is replacement)
        }

        this._ensureDOM();
        this._fetchFn = fetchFn;
        this._reset();
        this._running = true;

        _activeLoaders.add(this);

        // Show UI
        this._wrapper.classList.remove('il-hidden');
        this._spinnerEl.classList.remove('il-hidden');
        this._retryBtn.classList.add('il-hidden');
        this._textEl.classList.remove('il-text--error');
        this._updateText();

        // Start tick
        var self = this;
        this._tickInterval = setInterval(function () {
            self._tick();
        }, 1000);

        // Create AbortController
        this._abortController = new AbortController();

        // Watch for input changes (abort operation if user modifies the source input)
        this._unwatchInput();
        if (this._watchInputId) {
            var watchEl = document.getElementById(this._watchInputId);
            if (watchEl) {
                this._inputChangeHandler = function () {
                    if (self._running) {
                        self._abort(false);
                        self.stop();
                    }
                };
                watchEl.addEventListener('input', this._inputChangeHandler);
            }
        }

        // Execute fetch
        var signal = this._abortController.signal;
        var promise;
        try {
            promise = fetchFn(signal);
        } catch (err) {
            this._handleError(err);
            return;
        }

        if (!promise || typeof promise.then !== 'function') {
            this._handleError(new Error('fetchFn must return a Promise'));
            return;
        }

        promise.then(
            function () {
                // Success - clean up silently
                self.stop();
            },
            function (err) {
                if (!self._running) return; // already stopped
                if (err && err.name === 'AbortError') return; // handled by _abort
                self._handleError(err);
            }
        );
    };

    /**
     * Remove the input-change listener if active.
     */
    InlineLoader.prototype._unwatchInput = function () {
        if (this._inputChangeHandler && this._watchInputId) {
            var watchEl = document.getElementById(this._watchInputId);
            if (watchEl) {
                watchEl.removeEventListener('input', this._inputChangeHandler);
            }
            this._inputChangeHandler = null;
        }
    };

    /**
     * Stop the loader gracefully (success path or external stop).
     */
    InlineLoader.prototype.stop = function () {
        if (!this._running && !this._wrapper) return;

        this._cancelTimers();
        this._abortSafe();
        this._unwatchInput();
        this._running = false;

        _activeLoaders.delete(this);

        if (this._wrapper) {
            this._wrapper.classList.add('il-hidden');
        }
    };

    /**
     * Destroy this loader instance entirely and remove DOM elements.
     */
    InlineLoader.prototype.destroy = function () {
        this.stop();
        this._unwatchInput();
        this._destroyed = true;
        this._fetchFn   = null;
        this._onRetry   = null;
        this._onAbort   = null;

        if (this._wrapper && this._wrapper.parentNode) {
            this._wrapper.parentNode.removeChild(this._wrapper);
        }
        this._wrapper   = null;
        this._spinnerEl = null;
        this._textEl    = null;
        this._retryBtn  = null;

        _activeLoaders.delete(this);
    };

    // ---- Static API ----------------------------------------------------------

    /**
     * Cancel and stop every active InlineLoader. Intended to be called on
     * page navigation (e.g. inside navigateToPage / showPage).
     */
    InlineLoader.cleanupAll = function () {
        _activeLoaders.forEach(function (loader) {
            loader.stop();
        });
    };

    // ---- Internal ------------------------------------------------------------

    InlineLoader.prototype._reset = function () {
        this._elapsed = 0;
        this._cancelTimers();
        this._abortSafe();
        this._abortController = null;
    };

    InlineLoader.prototype._cancelTimers = function () {
        if (this._tickInterval !== null) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    };

    /**
     * Safely call abort on the current AbortController if present.
     */
    InlineLoader.prototype._abortSafe = function () {
        if (this._abortController) {
            try {
                this._abortController.abort();
            } catch (_) { /* ignore */ }
        }
    };

    /**
     * Internal abort with optional callback suppression.
     * @param {boolean} [silent] - if true, skip the onAbort callback
     */
    InlineLoader.prototype._abort = function (silent) {
        this._cancelTimers();
        this._abortSafe();
        this._running = false;

        _activeLoaders.delete(this);

        if (!silent && this._onAbort) {
            try { this._onAbort(this); } catch (_) { /* swallow */ }
        }
    };

    InlineLoader.prototype._tick = function () {
        if (!this._running) return;

        this._elapsed += 1;

        // Hard timeout
        if (this._elapsed >= HARD_TIMEOUT) {
            this._abort(false);
            this._showError();
            return;
        }

        this._updateText();

        // Show retry button after threshold
        if (this._elapsed > SHOW_RETRY_AFTER && this._retryBtn) {
            this._retryBtn.classList.remove('il-hidden');
            this._spinnerEl.classList.add('il-hidden');
            this._textEl.classList.add('il-text--error');
        }
    };

    InlineLoader.prototype._updateText = function () {
        if (!this._textEl) return;
        this._textEl.textContent = _copyForElapsed(this._elapsed);
    };

    InlineLoader.prototype._showError = function () {
        if (!this._textEl || !this._retryBtn) return;

        this._textEl.textContent = TIMEOUT_TEXT;
        this._textEl.classList.add('il-text--error');
        this._spinnerEl.classList.add('il-hidden');
        this._retryBtn.classList.remove('il-hidden');
        this._retryBtn.focus();
    };

    InlineLoader.prototype._handleError = function (err) {
        // Treat any fetch error the same as a timeout from the user's perspective
        this._cancelTimers();
        this._abortSafe();
        this._running = false;

        _activeLoaders.delete(this);

        if (this._wrapper) {
            this._wrapper.classList.remove('il-hidden');
        }

        this._showError();

        if (this._onAbort) {
            try { this._onAbort(this); } catch (_) { /* swallow */ }
        }
    };

    InlineLoader.prototype._handleRetry = function () {
        if (this._destroyed) return;

        // Preserve focus target reference before DOM changes
        var retryBtnRef = this._retryBtn;

        // Notify consumer
        if (this._onRetry) {
            try { this._onRetry(this); } catch (_) { /* swallow */ }
        }

        // If the onRetry callback called start() with a new fetchFn, we are
        // already running again - nothing more to do.
        if (this._running) {
            // Restore focus to the area (spinner is showing now, focus wrapper)
            if (this._wrapper) {
                this._wrapper.focus();
            }
            return;
        }

        // Otherwise, re-run the original fetchFn if we still have it
        if (this._fetchFn) {
            this.start(this._fetchFn);
            // After restart the retry button is hidden; once it reappears
            // focus will be set via _showError. For now, move focus to the
            // live region so screen readers pick up the new status.
            if (this._wrapper) {
                this._wrapper.setAttribute('tabindex', '-1');
                this._wrapper.focus();
            }
        }
    };

    // ---------------------------------------------------------------------------
    // Navigation hook
    // ---------------------------------------------------------------------------
    // Monkey-patch navigateToPage if it exists so that active loaders are
    // automatically cleaned up on page transitions.
    //
    // We wait for DOMContentLoaded to ensure the app scripts have loaded.
    // ---------------------------------------------------------------------------

    function _hookNavigation() {
        // Hook navigateToPage
        if (typeof global.navigateToPage === 'function') {
            var _originalNavigateToPage = global.navigateToPage;
            global.navigateToPage = function () {
                InlineLoader.cleanupAll();
                return _originalNavigateToPage.apply(this, arguments);
            };
        }

        // Hook showPage (if it exists as a separate function)
        if (typeof global.showPage === 'function') {
            var _originalShowPage = global.showPage;
            global.showPage = function () {
                InlineLoader.cleanupAll();
                return _originalShowPage.apply(this, arguments);
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _hookNavigation);
    } else {
        // DOM already ready - defer slightly so other scripts can define their
        // globals before we attempt to wrap them.
        setTimeout(_hookNavigation, 0);
    }

    // ---------------------------------------------------------------------------
    // Expose
    // ---------------------------------------------------------------------------
    global.InlineLoader = InlineLoader;

})(typeof window !== 'undefined' ? window : this);
