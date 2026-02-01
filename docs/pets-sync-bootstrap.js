// pets-sync-bootstrap.js v4
// Automatic sync triggers (push + pull) with safe guards.
//
// Triggers:
// - online event: push then pull
// - interval: push (debounced)
// - startup: if token present -> push then pull; else poll token up to 30s then pull once
// - foreground/resume: pull (throttled)
//
// Notes:
// - silent behavior: never throw, no noisy logs
// - guards: single bootstrap, single interval

(function initPetsSyncAuto() {
  try {
    if (window.__petsSyncBootstrapped) return;
    window.__petsSyncBootstrapped = true;
  } catch (e) {
    // continue even if guard can't be set
  }

  var PUSH_DEBOUNCE_MS = 10000;
  var TOKEN_POLL_MS = 500;
  var TOKEN_POLL_MAX_MS = 30000;

  var lastPushAt = 0;

  function hasAuthToken() {
    try {
      if (typeof getAuthToken === "function") return !!getAuthToken();
    } catch (e) {}
    return false;
  }

  function nowMs() {
    try { return Date.now(); } catch (e) { return 0; }
  }

  function safeCall(fn) {
    try {
      if (typeof fn === "function") return fn();
    } catch (e) {}
  }

  function safeCallAsync(fn) {
    try {
      if (typeof fn === "function") return Promise.resolve(fn());
    } catch (e) {}
    return Promise.resolve();
  }

  function safePush() {
    var now = nowMs();
    if (now && now - lastPushAt < PUSH_DEBOUNCE_MS) return Promise.resolve();
    lastPushAt = now;

    if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pushOutboxIfOnline === "function") {
      return safeCallAsync(window.ADA_PetsSync.pushOutboxIfOnline);
    }
    return Promise.resolve();
  }

  function safePullThrottled() {
    if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pullPetsIfOnline === "function") {
      // pullPetsIfOnline handles its own throttling/inFlight; we pass force:false explicitly
      return safeCallAsync(function () { return window.ADA_PetsSync.pullPetsIfOnline({ force: false }); });
    }
    return Promise.resolve();
  }

  function safePushThenPull() {
    return safePush()
      .catch(function () {})
      .then(function () { return safePullThrottled(); })
      .catch(function () {});
  }

  // online event: push then pull
  try {
    window.addEventListener("online", function () {
      safePushThenPull();
    });
  } catch (e) {}

  // foreground/resume: pull (throttled)
  try {
    document.addEventListener("visibilitychange", function () {
      try {
        if (document.visibilityState === "visible") safePullThrottled();
      } catch (e) {}
    });
  } catch (e) {}

  try {
    window.addEventListener("focus", function () {
      safePullThrottled();
    });
  } catch (e) {}

  // interval push (guarded)
  try {
    if (!window.__petsSyncIntervalId) {
      window.__petsSyncIntervalId = setInterval(function () {
        safePush();
      }, 60000);
    }
  } catch (e) {}

  // startup:
  // - if token already present: push then pull
  // - otherwise poll token up to 30s; once present, pull once
  try {
    if (hasAuthToken()) {
      safePushThenPull();
    } else {
      var start = nowMs();
      var timer = setInterval(function () {
        try {
          if (hasAuthToken()) {
            try { clearInterval(timer); } catch (e) {}
            safePullThrottled();
            return;
          }
          if (nowMs() - start > TOKEN_POLL_MAX_MS) {
            try { clearInterval(timer); } catch (e) {}
          }
        } catch (e) {
          try { clearInterval(timer); } catch (e2) {}
        }
      }, TOKEN_POLL_MS);
    }
  } catch (e) {}
})();
