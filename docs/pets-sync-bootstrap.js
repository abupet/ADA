// pets-sync-bootstrap.js v2
// STEP 5/6 — Automatic sync triggers (push + pull):
// - online event: push then pull
// - interval: push (and optionally pull via other triggers)
// - startup + token detection ("login"): pull once when token becomes available
// - foreground/resume: pull (throttled)
//
// Notes:
// - Silent behavior: no throw, no noisy logs
// - Guards: single bootstrap, single interval, throttle/debounce, in-flight mutexes

(function initPetsSyncAuto() {
  try {
    if (window.__petsSyncBootstrapped) return;
    window.__petsSyncBootstrapped = true;
  } catch (e) {
    // if we can't set the guard, continue anyway
  }

  const PUSH_DEBOUNCE_MS = 10_000;
  const PULL_THROTTLE_MS = 30_000;
  const TOKEN_POLL_MS = 500;
  const TOKEN_POLL_MAX_MS = 30_000;

  let lastPushAt = 0;
  let lastPullAt = 0;
  let inFlightPull = false;

  function hasAuthToken() {
    try {
      if (typeof getAuthToken === "function") return !!getAuthToken();
    } catch (e) {}
    return false;
  }

  async function safePush() {
    try {
      const now = Date.now();
      if (now - lastPushAt < PUSH_DEBOUNCE_MS) return;
      lastPushAt = now;

      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pushOutboxIfOnline === "function") {
        await window.ADA_PetsSync.pushOutboxIfOnline();
      }
    } catch (e) {
      // silent
    }
  }

  async function safePull() {
    try {
      const now = Date.now();
      if (inFlightPull) return;
      if (now - lastPullAt < PULL_THROTTLE_MS) return;
      lastPullAt = now;

      // If token isn't available yet, skip (pull function also guards, but this avoids extra calls)
      if (!hasAuthToken()) return;

      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pullPetsIfOnline === "function") {
        inFlightPull = true;
        try {
          await window.ADA_PetsSync.pullPetsIfOnline();
        } finally {
          inFlightPull = false;
        }
      }
    } catch (e) {
      inFlightPull = false;
      // silent
    }
  }

  async function safePushThenPull() {
    // Push first so we don't pull stale server state, then pull to merge changes from other devices
    try {
      await safePush();
    } catch (e) {}
    try {
      await safePull();
    } catch (e) {}
  }

  // online event: push then pull
  try {
    window.addEventListener("online", () => {
      safePushThenPull();
    });
  } catch (e) {
    // silent
  }

  // foreground/resume: pull (throttled)
  try {
    document.addEventListener("visibilitychange", () => {
      try {
        if (document.visibilityState === "visible") {
          safePull();
        }
      } catch (e) {}
    });
  } catch (e) {
    // silent
  }

  // focus is a good additional signal; keep it throttled (safePull already throttles)
  try {
    window.addEventListener("focus", () => {
      safePull();
    });
  } catch (e) {
    // silent
  }

  // interval push (guarded to avoid duplicates)
  try {
    if (!window.__petsSyncIntervalId) {
      window.__petsSyncIntervalId = setInterval(() => {
        safePush();
      }, 60_000);
    }
  } catch (e) {
    // silent
  }

  // startup:
  // - if token already present: push then pull
  // - otherwise poll for token up to 30s; once present, pull once
  try {
    if (hasAuthToken()) {
      safePushThenPull();
    } else {
      const start = Date.now();
      const timer = setInterval(() => {
        try {
          if (hasAuthToken()) {
            clearInterval(timer);
            safePull();
            return;
          }
          if (Date.now() - start > TOKEN_POLL_MAX_MS) {
            clearInterval(timer);
          }
        } catch (e) {
          try { clearInterval(timer); } catch (_) {}
        }
      }, TOKEN_POLL_MS);
    }
  } catch (e) {
    // silent
  }
})();
