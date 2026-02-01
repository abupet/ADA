// pets-sync-bootstrap.js v3
// Automatic sync triggers (push + pull) with safe guards.
// - online event: push then pull (auto pull is throttled inside pullPetsIfOnline)
// - interval: push (debounced)
// - startup + token detection ("login"): pull once when token becomes available
// - foreground/resume: pull (throttled)
//
// Notes:
// - Silent behavior: no throw, no noisy logs
// - Guards: single bootstrap, single interval, debounce push

(function initPetsSyncAuto() {
  try {
    if (window.__petsSyncBootstrapped) return;
    window.__petsSyncBootstrapped = true;
  } catch (e) {}

  const PUSH_DEBOUNCE_MS = 10_000;
  const TOKEN_POLL_MS = 500;
  const TOKEN_POLL_MAX_MS = 30_000;

  let lastPushAt = 0;

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
    } catch (e) {}
  }

  async function safePullAuto() {
    try {
      if (!hasAuthToken()) return;
      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pullPetsIfOnline === "function") {
        await window.ADA_PetsSync.pullPetsIfOnline({ force: false });
      }
    } catch (e) {}
  }

  async function safePushThenPull() {
    try { await safePush(); } catch (e) {}
    try { await safePullAuto(); } catch (e) {}
  }

  // online event: push then pull
  try {
    window.addEventListener("online", () => {
      safePushThenPull();
    });
  } catch (e) {}

  // foreground/resume: pull (auto throttled inside app-pets)
  try {
    document.addEventListener("visibilitychange", () => {
      try {
        if (document.visibilityState === "visible") safePullAuto();
      } catch (e) {}
    });
  } catch (e) {}

  try {
    window.addEventListener("focus", () => {
      safePullAuto();
    });
  } catch (e) {}

  // interval push (guarded to avoid duplicates)
  try {
    if (!window.__petsSyncIntervalId) {
      window.__petsSyncIntervalId = setInterval(() => {
        safePush();
      }, 60_000);
    }
  } catch (e) {}

  // startup: if token already present -> push then pull
  // otherwise poll for token up to 30s; once present, pull once
  try {
    if (hasAuthToken()) {
      safePushThenPull();
    } else {
      const start = Date.now();
      const timer = setInterval(() => {
        try {
          if (hasAuthToken()) {
            clearInterval(timer);
            safePullAuto();
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
