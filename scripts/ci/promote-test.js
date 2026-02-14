/**
 * promote-test.js
 *
 * Adds @nightly tag to all @deep tests in a given test file.
 * Updates nightly-tracking.json to mark the test as promoted.
 *
 * Usage: node scripts/ci/promote-test.js deep.pet-lifecycle
 */

const fs = require("node:fs");
const path = require("node:path");

const testName = process.argv[2];
if (!testName) {
  console.error("Usage: node promote-test.js <test-name>");
  console.error("Example: node promote-test.js deep.chatbot-ai");
  process.exit(1);
}

const testFile = path.join(
  __dirname,
  `../../tests/e2e/${testName}.spec.ts`
);
const trackingFile = path.join(__dirname, "../../tests/nightly-tracking.json");

// Update test file: add @nightly next to @deep
if (!fs.existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

let content = fs.readFileSync(testFile, "utf-8");
const originalContent = content;

// Replace @deep with @deep @nightly (only where @nightly is not already present)
content = content.replace(/@deep(?!\s+@nightly)/g, "@deep @nightly");

if (content === originalContent) {
  console.log(`${testName}: already has @nightly on all tests, or no @deep found`);
} else {
  fs.writeFileSync(testFile, content);
  console.log(`${testName}: added @nightly tag`);
}

// Update tracking
try {
  const tracking = JSON.parse(fs.readFileSync(trackingFile, "utf-8"));
  if (tracking[testName]) {
    tracking[testName].promoted = true;
    fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2) + "\n");
    console.log(`${testName}: marked as promoted in tracking`);
  }
} catch (e) {
  console.error("Warning: could not update tracking file:", e.message);
}
