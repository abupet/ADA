/* nutrition.consent.test.js
   Unit tests for nutrition/insurance consent helpers.
   Run: node tests/unit/nutrition.consent.test.js
*/
const assert = require("assert");
const path = require("path");

const {
  isMarketingAllowed,
  isClinicalTagsAllowed,
  isNutritionAllowed,
  isInsuranceAllowed,
} = require(path.join(__dirname, "../../backend/src/consent.service"));

assert.strictEqual(typeof isNutritionAllowed, "function", "isNutritionAllowed must be exported");
assert.strictEqual(typeof isInsuranceAllowed, "function", "isInsuranceAllowed must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// isNutritionAllowed tests
// ─────────────────────────────────────────────────────────────────────────────

(function testNutritionGlobalOptedIn_NoTenant() {
  const consent = {
    marketing_global: "opted_in",
    nutrition_plan: "opted_in",
    nutrition_brand_consents: {},
  };
  assert.strictEqual(isNutritionAllowed(consent, null), true);
  console.log("  PASS: nutrition_plan opted_in, no tenant -> allowed");
})();

(function testNutritionGlobalOptedOut() {
  const consent = {
    marketing_global: "opted_in",
    nutrition_plan: "opted_out",
    nutrition_brand_consents: {},
  };
  assert.strictEqual(isNutritionAllowed(consent, null), false);
  assert.strictEqual(isNutritionAllowed(consent, "tenant-1"), false);
  console.log("  PASS: nutrition_plan opted_out -> blocked for any tenant");
})();

(function testNutritionBrandOptedOut() {
  const consent = {
    marketing_global: "opted_in",
    nutrition_plan: "opted_in",
    nutrition_brand_consents: { "tenant-1": "opted_out", "tenant-2": "opted_in" },
  };
  assert.strictEqual(isNutritionAllowed(consent, "tenant-1"), false, "opted_out brand should be blocked");
  assert.strictEqual(isNutritionAllowed(consent, "tenant-2"), true, "opted_in brand should be allowed");
  assert.strictEqual(isNutritionAllowed(consent, "tenant-3"), true, "unknown brand should default to allowed");
  console.log("  PASS: nutrition brand-level consent properly gates per tenant");
})();

(function testNutritionNotSet() {
  const consent = {
    marketing_global: "opted_in",
    nutrition_brand_consents: {},
  };
  assert.strictEqual(isNutritionAllowed(consent, null), false, "undefined nutrition_plan -> blocked");
  console.log("  PASS: nutrition_plan undefined -> blocked (prudent default)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// isInsuranceAllowed tests
// ─────────────────────────────────────────────────────────────────────────────

(function testInsuranceGlobalOptedIn_NoTenant() {
  const consent = {
    marketing_global: "opted_in",
    insurance_data_sharing: "opted_in",
    insurance_brand_consents: {},
  };
  assert.strictEqual(isInsuranceAllowed(consent, null), true);
  console.log("  PASS: insurance_data_sharing opted_in, no tenant -> allowed");
})();

(function testInsuranceGlobalOptedOut() {
  const consent = {
    marketing_global: "opted_in",
    insurance_data_sharing: "opted_out",
    insurance_brand_consents: {},
  };
  assert.strictEqual(isInsuranceAllowed(consent, null), false);
  assert.strictEqual(isInsuranceAllowed(consent, "tenant-1"), false);
  console.log("  PASS: insurance_data_sharing opted_out -> blocked for any tenant");
})();

(function testInsuranceBrandOptedOut() {
  const consent = {
    marketing_global: "opted_in",
    insurance_data_sharing: "opted_in",
    insurance_brand_consents: { "tenant-1": "opted_out", "tenant-2": "opted_in" },
  };
  assert.strictEqual(isInsuranceAllowed(consent, "tenant-1"), false);
  assert.strictEqual(isInsuranceAllowed(consent, "tenant-2"), true);
  assert.strictEqual(isInsuranceAllowed(consent, "tenant-3"), true);
  console.log("  PASS: insurance brand-level consent properly gates per tenant");
})();

(function testInsurancePending() {
  const consent = {
    marketing_global: "opted_in",
    insurance_data_sharing: "opted_in",
    insurance_brand_consents: { "tenant-x": "pending" },
  };
  assert.strictEqual(isInsuranceAllowed(consent, "tenant-x"), false, "pending insurance brand should be blocked");
  console.log("  PASS: pending insurance brand consent -> blocked");
})();

(function testInsuranceNotSet() {
  const consent = {
    marketing_global: "opted_in",
    insurance_brand_consents: {},
  };
  assert.strictEqual(isInsuranceAllowed(consent, null), false, "undefined insurance_data_sharing -> blocked");
  console.log("  PASS: insurance_data_sharing undefined -> blocked (prudent default)");
})();

console.log("OK nutrition.consent.test.js");
