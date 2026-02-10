/* eligibility.service-type.test.js
   Unit tests for service_type filtering in the eligibility engine.
   Run: node tests/unit/eligibility.service-type.test.js
*/
const assert = require("assert");
const path = require("path");

const { CONTEXT_RULES } = require(
  path.join(__dirname, "../../backend/src/eligibility.service")
);

// ─────────────────────────────────────────────────────────────────────────────
// Verify new contexts exist
// ─────────────────────────────────────────────────────────────────────────────

(function testNutritionReviewContext() {
  assert.ok(CONTEXT_RULES.nutrition_review, "nutrition_review context should exist");
  assert.ok(CONTEXT_RULES.nutrition_review.freq, "nutrition_review should have freq");
  assert.ok(
    CONTEXT_RULES.nutrition_review.service_types &&
    CONTEXT_RULES.nutrition_review.service_types.includes("nutrition"),
    "nutrition_review should include 'nutrition' in service_types"
  );
  console.log("  PASS: nutrition_review context present with correct service_types");
})();

(function testInsuranceReviewContext() {
  assert.ok(CONTEXT_RULES.insurance_review, "insurance_review context should exist");
  assert.ok(CONTEXT_RULES.insurance_review.freq, "insurance_review should have freq");
  assert.ok(
    CONTEXT_RULES.insurance_review.service_types &&
    CONTEXT_RULES.insurance_review.service_types.includes("insurance"),
    "insurance_review should include 'insurance' in service_types"
  );
  console.log("  PASS: insurance_review context present with correct service_types");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Verify existing contexts have service_types field
// ─────────────────────────────────────────────────────────────────────────────

(function testAllContextsHaveServiceTypes() {
  const allContexts = Object.keys(CONTEXT_RULES);
  for (const ctx of allContexts) {
    const rule = CONTEXT_RULES[ctx];
    assert.ok(
      Array.isArray(rule.service_types),
      "Context '" + ctx + "' should have service_types array"
    );
    assert.ok(rule.service_types.length > 0, "Context '" + ctx + "' service_types should not be empty");
  }
  console.log("  PASS: all " + allContexts.length + " contexts have service_types arrays");
})();

(function testExistingContextsIncludePromo() {
  const promoContexts = ["post_visit", "post_vaccination", "home_feed", "pet_profile", "faq_view", "milestone"];
  for (const ctx of promoContexts) {
    if (!CONTEXT_RULES[ctx]) continue;
    assert.ok(
      CONTEXT_RULES[ctx].service_types.includes("promo"),
      "Context '" + ctx + "' should include 'promo' in service_types"
    );
  }
  console.log("  PASS: existing promo contexts include 'promo' in service_types");
})();

console.log("OK eligibility.service-type.test.js");
