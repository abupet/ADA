/**
 * update-tracking.js
 *
 * Run after weekly-full tests to:
 * 1. Update tests/nightly-tracking.json with pass/fail results
 * 2. Identify promotion candidates (4+ consecutive passes)
 * 3. Output candidates to /tmp/promotion-candidates.json
 *
 * Usage: node scripts/ci/update-tracking.js <branch>
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const TRACKING_FILE = path.join(__dirname, "../../tests/nightly-tracking.json");
const PROMOTION_THRESHOLD = 4; // consecutive passes needed
const MAX_HISTORY = 8;

// Read current tracking
let tracking;
try {
  tracking = JSON.parse(fs.readFileSync(TRACKING_FILE, "utf-8"));
} catch (e) {
  console.error("Could not read tracking file:", e.message);
  process.exit(1);
}

// Parse Playwright results to determine pass/fail per test file
function getTestResults() {
  const results = {};
  try {
    // Run playwright with --list to get test files, then check report
    const reportPath = path.join(__dirname, "../../playwright-report/report.json");
    if (!fs.existsSync(reportPath)) {
      console.log("No report.json found — skipping tracking update");
      return results;
    }

    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

    const walk = (suite, filePath) => {
      const fp = suite.file || filePath;
      for (const spec of suite.specs || []) {
        // Only track @deep tests
        if (!spec.title.includes("@deep")) continue;

        // Extract test file base name (e.g., "deep.chatbot-ai")
        const match = fp?.match(/\/(deep\.[^.]+)\.spec/);
        if (!match) continue;
        const testName = match[1];

        for (const t of spec.tests || []) {
          const status = t.results?.[t.results.length - 1]?.status;
          if (!results[testName]) results[testName] = [];
          results[testName].push(status === "passed" ? "pass" : "fail");
        }
      }
      for (const child of suite.suites || []) {
        walk(child, fp);
      }
    };

    for (const suite of report.suites || []) {
      walk(suite);
    }
  } catch (e) {
    console.error("Error parsing report:", e.message);
  }
  return results;
}

const testResults = getTestResults();

// Update tracking
const candidates = [];

for (const [testName, data] of Object.entries(tracking)) {
  if (testName.startsWith("_")) continue; // skip _comment
  if (data.promoted) continue;

  const fileResults = testResults[testName];
  if (fileResults) {
    // All tests in the file passed?
    const allPassed = fileResults.every((r) => r === "pass");
    data.results.push(allPassed ? "pass" : "fail");

    // Trim to max history
    if (data.results.length > MAX_HISTORY) {
      data.results = data.results.slice(-MAX_HISTORY);
    }
  }

  // Check if eligible for promotion
  const recent = data.results.slice(-PROMOTION_THRESHOLD);
  if (
    recent.length >= PROMOTION_THRESHOLD &&
    recent.every((r) => r === "pass")
  ) {
    candidates.push({
      testName,
      streak: recent.length,
      totalRuns: data.results.length,
    });
  }
}

// Save updated tracking
fs.writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2) + "\n");

// Save candidates
fs.writeFileSync(
  "/tmp/promotion-candidates.json",
  JSON.stringify(candidates, null, 2)
);

console.log(`\nTracking updated. ${candidates.length} promotion candidate(s):`);
for (const c of candidates) {
  console.log(`  ✨ ${c.testName} — ${c.streak} consecutive passes`);
}
