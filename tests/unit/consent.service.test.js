/* consent.service.test.js
   Unit tests for consent service (isMarketingAllowed, isClinicalTagsAllowed).
   Run: node tests/unit/consent.service.test.js
*/
const assert = require("assert");
const path = require("path");

const {
  isMarketingAllowed,
  isClinicalTagsAllowed,
} = require(path.join(__dirname, "../../backend/src/consent.service"));

assert.strictEqual(typeof isMarketingAllowed, "function", "isMarketingAllowed must be exported");
assert.strictEqual(typeof isClinicalTagsAllowed, "function", "isClinicalTagsAllowed must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// isMarketingAllowed tests
// ─────────────────────────────────────────────────────────────────────────────

(function testMarketingGlobalOptedIn_NoTenant() {
  const consent = { marketing_global: "opted_in", clinical_tags: "opted_out", brand_consents: {} };
  assert.strictEqual(isMarketingAllowed(consent, null), true);
  console.log("  PASS: marketing_global opted_in, no tenant -> allowed");
})();

(function testMarketingGlobalOptedOut() {
  const consent = { marketing_global: "opted_out", clinical_tags: "opted_out", brand_consents: {} };
  assert.strictEqual(isMarketingAllowed(consent, null), false);
  assert.strictEqual(isMarketingAllowed(consent, "tenant-1"), false);
  console.log("  PASS: marketing_global opted_out -> blocked for any tenant");
})();

(function testBrandOptedOut() {
  const consent = {
    marketing_global: "opted_in",
    clinical_tags: "opted_out",
    brand_consents: { "tenant-1": "opted_out", "tenant-2": "opted_in" },
  };
  assert.strictEqual(isMarketingAllowed(consent, "tenant-1"), false, "opted_out brand should be blocked");
  assert.strictEqual(isMarketingAllowed(consent, "tenant-2"), true, "opted_in brand should be allowed");
  assert.strictEqual(isMarketingAllowed(consent, "tenant-3"), true, "unknown brand should default to allowed");
  console.log("  PASS: brand-level consent properly gates per tenant");
})();

(function testBrandPending() {
  const consent = {
    marketing_global: "opted_in",
    clinical_tags: "opted_out",
    brand_consents: { "tenant-x": "pending" },
  };
  assert.strictEqual(isMarketingAllowed(consent, "tenant-x"), false, "pending brand should be blocked");
  console.log("  PASS: pending brand consent -> blocked");
})();

(function testGlobalNull_TenantPassed() {
  const consent = {
    marketing_global: "opted_in",
    clinical_tags: "opted_out",
    brand_consents: {},
  };
  assert.strictEqual(isMarketingAllowed(consent, "any-tenant"), true, "no brand override -> allowed");
  console.log("  PASS: no brand override for tenant -> allowed");
})();

// ─────────────────────────────────────────────────────────────────────────────
// isClinicalTagsAllowed tests
// ─────────────────────────────────────────────────────────────────────────────

(function testClinicalOptedIn() {
  const consent = { marketing_global: "opted_in", clinical_tags: "opted_in", brand_consents: {} };
  assert.strictEqual(isClinicalTagsAllowed(consent), true);
  console.log("  PASS: clinical_tags opted_in -> allowed");
})();

(function testClinicalOptedOut() {
  const consent = { marketing_global: "opted_in", clinical_tags: "opted_out", brand_consents: {} };
  assert.strictEqual(isClinicalTagsAllowed(consent), false);
  console.log("  PASS: clinical_tags opted_out -> blocked");
})();

(function testClinicalNotSet() {
  const consent = { marketing_global: "opted_in", brand_consents: {} };
  assert.strictEqual(isClinicalTagsAllowed(consent), false, "undefined clinical_tags -> blocked (prudent default)");
  console.log("  PASS: clinical_tags undefined -> blocked");
})();

(function testClinicalRandomValue() {
  const consent = { marketing_global: "opted_in", clinical_tags: "maybe", brand_consents: {} };
  assert.strictEqual(isClinicalTagsAllowed(consent), false, "invalid value -> blocked");
  console.log("  PASS: clinical_tags invalid value -> blocked");
})();

console.log("OK consent.service.test.js");
