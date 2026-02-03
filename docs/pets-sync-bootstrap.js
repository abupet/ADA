// pets-sync-bootstrap.js v2
// STEP 5/6 — Automatic sync triggers (push + pull)
// - online: push then pull
// - interval: push (guarded)
// - startup: if token present -> push then pull; else short token poll to detect "login" then pull once
// - foreground/resume: pull (throttled in app-pets)
//
// Notes: silent behavior, no noisy logs, single init.

(function initPetsSyncAuto() {
  try {
    if (window.__petsSyncBootstrapped) return;
    window.__petsSyncBootstrapped = true;
  } catch (e) {
    // continue anyway
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

  function safePush() {
    try {
      var now = Date.now();
      if (now - lastPushAt < PUSH_DEBOUNCE_MS) return;
      lastPushAt = now;

      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pushOutboxIfOnline === "function") {
        window.ADA_PetsSync.pushOutboxIfOnline();
      }
    } catch (e) {
      // silent
    }
  }

  function safePull(force) {
    try {
      if (!hasAuthToken()) return;
      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pullPetsIfOnline === "function") {
        window.ADA_PetsSync.pullPetsIfOnline({ force: !!force });
      }
    } catch (e) {
      // silent
    }
  }

  function safePushThenPull() {
    try { safePush(); } catch (e) {}
    // Pull after a short delay to let push begin (push has its own mutex)
    try { setTimeout(function(){ safePull(false); }, 250); } catch (e) {}
  }

  // online: push then pull
  try {
    window.addEventListener("online", function() {
      safePushThenPull();
    });
  } catch (e) {}

  // foreground/resume: pull (throttled in app-pets)
  try {
    document.addEventListener("visibilitychange", function() {
      try {
        if (document.visibilityState === "visible") safePull(false);
      } catch (e) {}
    });
  } catch (e) {}

  try {
    window.addEventListener("focus", function() {
      safePull(false);
    });
  } catch (e) {}

  // interval push (guarded)
  try {
    if (!window.__petsSyncIntervalId) {
      window.__petsSyncIntervalId = setInterval(function() {
        safePushThenPull();
      }, 60000);
    }
  } catch (e) {}

  // startup / login detection
  try {
    if (hasAuthToken()) {
      safePushThenPull();
    } else {
      var start = Date.now();
      var timer = setInterval(function() {
        try {
          if (hasAuthToken()) {
            clearInterval(timer);
            safePushThenPull();
            return;
          }
          if (Date.now() - start > TOKEN_POLL_MAX_MS) clearInterval(timer);
        } catch (e) {
          try { clearInterval(timer); } catch (_) {}
        }
      }, TOKEN_POLL_MS);
    }
  } catch (e) {}
})();
