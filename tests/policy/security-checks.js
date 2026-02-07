// security-checks.js v1.0
// Security audit script for ADA veterinary app (PR 11 - Hardening)
// Run: node tests/policy/security-checks.js
// Exit code 0 = pass, 1 = fail

(function () {
  "use strict";

  const fs = require("fs");
  const path = require("path");

  const docsDir = path.resolve(__dirname, "../../docs");
  let failures = 0;
  let warnings = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getFrontendFiles() {
    const out = [];
    if (!fs.existsSync(docsDir)) return out;
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(path.join(docsDir, entry.name));
      }
    }
    return out;
  }

  function fail(check, message) {
    console.error("FAIL [" + check + "] " + message);
    failures++;
  }

  function warn(check, message) {
    console.warn("WARN [" + check + "] " + message);
    warnings++;
  }

  function pass(check, message) {
    console.log("PASS [" + check + "] " + message);
  }

  // ---------------------------------------------------------------------------
  // SEC-01  No hardcoded API keys in frontend files
  // ---------------------------------------------------------------------------

  (function checkNoHardcodedKeys() {
    const CHECK = "SEC-01";
    const files = getFrontendFiles();
    const keyPatterns = [
      { rx: /sk-[A-Za-z0-9]{20,}/, label: "OpenAI-style secret key (sk-...)" },
      { rx: /api_key\s*[:=]\s*["'][^"']{8,}["']/, label: "api_key assignment" },
      { rx: /secret\s*[:=]\s*["'][^"']{8,}["']/, label: "secret assignment" },
      { rx: /apikey\s*[:=]\s*["'][^"']{8,}["']/i, label: "apikey assignment" },
    ];
    // Exclude this file itself
    const selfPath = path.resolve(__filename);
    let found = false;

    for (const f of files) {
      if (path.resolve(f) === selfPath) continue;
      const content = fs.readFileSync(f, "utf8");
      for (const pat of keyPatterns) {
        if (pat.rx.test(content)) {
          fail(CHECK, pat.label + " found in " + path.basename(f));
          found = true;
        }
      }
    }

    if (!found) {
      pass(CHECK, "No hardcoded API keys in frontend files");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-02  No eval() usage in frontend files
  // ---------------------------------------------------------------------------

  (function checkNoEval() {
    const CHECK = "SEC-02";
    const files = getFrontendFiles();
    // Match eval( but not .addEventListener("eval or similar string occurrences
    const evalRx = /\beval\s*\(/;
    let found = false;

    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip lines that are clearly comments
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        if (evalRx.test(line)) {
          fail(CHECK, "eval() usage at " + path.basename(f) + ":" + (i + 1));
          found = true;
        }
      }
    }

    if (!found) {
      pass(CHECK, "No eval() usage in frontend files");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-03  innerHTML usage warning (user-controlled data risk)
  // ---------------------------------------------------------------------------

  (function checkInnerHTML() {
    const CHECK = "SEC-03";
    const files = getFrontendFiles();
    const innerHTMLRx = /\.innerHTML\s*[=+]/;
    let found = false;

    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        if (innerHTMLRx.test(line)) {
          warn(CHECK, "innerHTML assignment at " + path.basename(f) + ":" + (i + 1) + " — verify no user-controlled data");
          found = true;
        }
      }
    }

    if (!found) {
      pass(CHECK, "No innerHTML assignments found");
    } else {
      pass(CHECK, "innerHTML usage found (warnings only, not blocking)");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-04  CORS origin is not '*' in production
  // ---------------------------------------------------------------------------

  (function checkCORSOrigin() {
    const CHECK = "SEC-04";
    const serverPath = path.resolve(__dirname, "../../backend/src/server.js");

    if (!fs.existsSync(serverPath)) {
      pass(CHECK, "server.js not found (skipped)");
      return;
    }

    const content = fs.readFileSync(serverPath, "utf8");
    // Check for origin: '*' or origin: "*"
    const wildcardRx = /origin\s*:\s*["']\*["']/;
    // Also check for cors({ origin: '*' }) or cors('*')
    const corsWildcardRx = /cors\(\s*["']\*["']\s*\)/;
    const corsOptionWildcard = /cors\(\s*\{\s*origin\s*:\s*["']\*["']/;

    if (wildcardRx.test(content) || corsWildcardRx.test(content) || corsOptionWildcard.test(content)) {
      fail(CHECK, "CORS origin is set to '*' — must not use wildcard in production");
    } else {
      pass(CHECK, "CORS origin is not wildcard '*'");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-05  JWT_SECRET env variable exists (runtime check)
  // ---------------------------------------------------------------------------

  (function checkJWTSecret() {
    const CHECK = "SEC-05";

    // Load .env file if it exists to simulate runtime
    const envPath = path.resolve(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      const lines = envContent.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }

    if (process.env.JWT_SECRET) {
      pass(CHECK, "JWT_SECRET environment variable is set");
    } else if (process.env.CI === "true" || process.env.MODE === "MOCK") {
      pass(CHECK, "JWT_SECRET not set but running in CI/MOCK mode (acceptable)");
    } else {
      fail(CHECK, "JWT_SECRET environment variable is not set");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-06  All /api routes (except health) go through requireAuth
  // ---------------------------------------------------------------------------

  (function checkRequireAuth() {
    const CHECK = "SEC-06";
    const serverPath = path.resolve(__dirname, "../../backend/src/server.js");

    if (!fs.existsSync(serverPath)) {
      pass(CHECK, "server.js not found (skipped)");
      return;
    }

    const content = fs.readFileSync(serverPath, "utf8");

    // Verify that there's a global requireJwt middleware on /api
    const hasGlobalApiAuth = /app\.use\(\s*["']\/api["']\s*,\s*requireJwt\s*\)/.test(content);
    if (!hasGlobalApiAuth) {
      fail(CHECK, "No global app.use(\"/api\", requireJwt) found — all /api routes must be protected");
      return;
    }

    // Check that /auth/login is NOT under /api (it should be at /auth/login)
    const loginRoute = content.match(/app\.(post|get)\(\s*["'](\/[^"']+)["'].*login/g) || [];
    for (const route of loginRoute) {
      const pathMatch = route.match(/["'](\/[^"']+)["']/);
      if (pathMatch && pathMatch[1].startsWith("/api/")) {
        fail(CHECK, "Login endpoint is under /api/ — it should be outside /api to avoid auth middleware conflict");
        return;
      }
    }

    // Check that /api/health is defined BEFORE the global middleware (acceptable pattern)
    const healthPos = content.indexOf("/api/health");
    const globalAuthPos = content.indexOf('app.use("/api", requireJwt)') !== -1
      ? content.indexOf('app.use("/api", requireJwt)')
      : content.indexOf("app.use('/api', requireJwt)");

    if (healthPos > -1 && globalAuthPos > -1 && healthPos > globalAuthPos) {
      warn(CHECK, "/api/health is defined after global auth middleware — it will require auth");
    }

    pass(CHECK, "Global /api auth middleware present, login outside /api");
  })();

  // ---------------------------------------------------------------------------
  // SEC-07  Admin routes use requireRole (RBAC enforcement)
  // ---------------------------------------------------------------------------

  (function checkAdminRoutesRBAC() {
    const CHECK = "SEC-07";
    const adminRoutesPath = path.resolve(__dirname, "../../backend/src/admin.routes.js");
    const dashboardRoutesPath = path.resolve(__dirname, "../../backend/src/dashboard.routes.js");

    var checkedFiles = 0;

    [adminRoutesPath, dashboardRoutesPath].forEach(function (filePath) {
      if (!fs.existsSync(filePath)) return;
      checkedFiles++;

      var content = fs.readFileSync(filePath, "utf8");
      var fileName = path.basename(filePath);

      // Check that requireRole is imported/used
      if (!content.includes("requireRole")) {
        fail(CHECK, fileName + " does not use requireRole — admin routes must have RBAC");
        return;
      }

      // Check that all router.get/post/put/patch/delete include requireRole
      var routeRx = /router\.(get|post|put|patch|delete)\s*\(\s*["'][^"']+["']/g;
      var match;
      while ((match = routeRx.exec(content)) !== null) {
        // Get the full route definition line area (next 200 chars)
        var routeArea = content.slice(match.index, Math.min(content.length, match.index + 300));
        var routePath = match[0].match(/["']([^"']+)["']/);
        var pathStr = routePath ? routePath[1] : "unknown";

        // Every admin route must have requireRole in its middleware chain
        if (!routeArea.includes("requireRole")) {
          fail(CHECK, fileName + ": route " + pathStr + " missing requireRole");
        }
      }
    });

    if (checkedFiles === 0) {
      pass(CHECK, "Admin/dashboard route files not found (skipped)");
    } else if (failures === 0 || !secretHits.length) {
      pass(CHECK, "Admin routes use requireRole RBAC enforcement");
    }
  })();

  // ---------------------------------------------------------------------------
  // SEC-08  Consent endpoints validate input types and statuses
  // ---------------------------------------------------------------------------

  (function checkConsentValidation() {
    const CHECK = "SEC-08";
    const promoRoutesPath = path.resolve(__dirname, "../../backend/src/promo.routes.js");

    if (!fs.existsSync(promoRoutesPath)) {
      pass(CHECK, "promo.routes.js not found (skipped)");
      return;
    }

    var content = fs.readFileSync(promoRoutesPath, "utf8");

    // Check that PUT /api/promo/consent validates consent_type
    var hasValidTypes = content.includes("validTypes") || content.includes("valid_types");
    var hasValidStatuses = content.includes("validStatuses") || content.includes("valid_statuses");

    if (!hasValidTypes) {
      fail(CHECK, "promo.routes.js: consent endpoint missing consent_type validation");
    }
    if (!hasValidStatuses) {
      fail(CHECK, "promo.routes.js: consent endpoint missing status validation");
    }

    // Check that POST /api/promo/consent/ack also validates
    var ackSection = content.indexOf("/api/promo/consent/ack");
    if (ackSection > -1) {
      var ackArea = content.slice(ackSection, Math.min(content.length, ackSection + 800));
      if (!ackArea.includes("validTypes") && !ackArea.includes("valid_types")) {
        fail(CHECK, "promo.routes.js: consent/ack endpoint missing consent_type validation");
      }
    }

    if (hasValidTypes && hasValidStatuses) {
      pass(CHECK, "Consent endpoints validate input types and statuses");
    }
  })();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log("");
  if (failures > 0) {
    console.error("Security checks: " + failures + " failure(s), " + warnings + " warning(s)");
    process.exit(1);
  } else {
    console.log("Security checks passed (" + warnings + " warning(s))");
    process.exit(0);
  }
})();
