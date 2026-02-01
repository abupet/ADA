// pets-sync-bootstrap.js v1
// STEP 5 — Automatic push triggers (online + interval + startup)

(function initPetsSyncAutoPush() {
  function safePush() {
    try {
      if (window.ADA_PetsSync && typeof window.ADA_PetsSync.pushOutboxIfOnline === "function") {
        window.ADA_PetsSync.pushOutboxIfOnline();
      }
    } catch (e) {
      // silent
    }
  }

  try {
    window.addEventListener("online", () => {
      safePush();
    });
  } catch (e) {
    // silent
  }

  try {
    setInterval(() => {
      safePush();
    }, 60000);
  } catch (e) {
    // silent
  }

  try {
    if (typeof getAuthToken === "function" && getAuthToken()) {
      safePush();
    }
  } catch (e) {
    // silent
  }
})();
