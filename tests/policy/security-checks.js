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
