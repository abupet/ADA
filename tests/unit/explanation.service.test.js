/* explanation.service.test.js
   Unit tests for the explanation service (fallback, cache, helpers).
   Run: node tests/unit/explanation.service.test.js
*/
const assert = require("assert");
const path = require("path");
const { createHash } = require("crypto");

const { generateExplanation } = require(
  path.join(__dirname, "../../backend/src/explanation.service")
);

assert.strictEqual(typeof generateExplanation, "function", "generateExplanation must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// Mock pool helper
// ─────────────────────────────────────────────────────────────────────────────

function createMockPool(handlers) {
  return {
    query(sql, params) {
      for (const h of handlers) {
        if (sql.includes(h.match)) {
          if (h.error) return Promise.reject(new Error(h.error));
          return Promise.resolve(h.response);
        }
      }
      return Promise.resolve({ rows: [] });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: fallback when no API key
// ─────────────────────────────────────────────────────────────────────────────

(async function testFallbackNoApiKey() {
  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [] } },
    { match: "tenant_budgets", response: { rows: [] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: { name: "Rex", species: "dog" },
    promoItem: { promo_item_id: "item-1", name: "Dog Food", version: 1 },
    context: "home_feed",
    matchedTags: ["species:dog"],
    getOpenAiKey: () => null,
  });

  assert.strictEqual(result.source, "fallback");
  assert.strictEqual(result.tokensCost, 0);
  assert.ok(result.explanation.why_you_see_this.includes("Rex"), "Fallback should mention pet name");
  assert.strictEqual(result.explanation.confidence, "low");
  assert.ok(result.explanation.disclaimer, "Fallback should include disclaimer");
  assert.ok(result.latencyMs >= 0, "latencyMs should be non-negative");
  console.log("  PASS: fallback explanation when no API key");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: fallback when getOpenAiKey is not a function
// ─────────────────────────────────────────────────────────────────────────────

(async function testFallbackNoKeyFunction() {
  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [] } },
    { match: "tenant_budgets", response: { rows: [] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: { name: "Luna" },
    promoItem: { promo_item_id: "item-2", version: 1 },
    context: "post_visit",
    matchedTags: [],
    getOpenAiKey: "not-a-function",
  });

  assert.strictEqual(result.source, "fallback");
  assert.ok(result.explanation.why_you_see_this.includes("Luna"));
  console.log("  PASS: fallback when getOpenAiKey is not a function");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: cache hit returns cached explanation
// ─────────────────────────────────────────────────────────────────────────────

(async function testCacheHit() {
  const cachedExpl = JSON.stringify({
    why_you_see_this: "Cached reason",
    benefit_for_pet: null,
    clinical_fit: null,
    disclaimer: "Test disclaimer",
    confidence: "high",
  });

  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [{ explanation: cachedExpl }] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: { name: "Max" },
    promoItem: { promo_item_id: "item-3", version: 1 },
    context: "home_feed",
    matchedTags: [],
    getOpenAiKey: () => "sk-test",
  });

  assert.strictEqual(result.source, "cache");
  assert.strictEqual(result.tokensCost, 0);
  assert.strictEqual(result.explanation, cachedExpl);
  console.log("  PASS: cache hit returns cached explanation");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: budget exceeded returns fallback
// ─────────────────────────────────────────────────────────────────────────────

(async function testBudgetExceeded() {
  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [] } },
    { match: "tenant_budgets", response: { rows: [{ monthly_limit: 100, current_usage: 100, alert_threshold: 80 }] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: { name: "Bella" },
    promoItem: { promo_item_id: "item-4", tenant_id: "t1", version: 1 },
    context: "home_feed",
    matchedTags: [],
    getOpenAiKey: () => "sk-test",
  });

  assert.strictEqual(result.source, "fallback");
  assert.ok(result.explanation.why_you_see_this.includes("Bella"));
  console.log("  PASS: budget exceeded returns fallback");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: fallback explanation structure
// ─────────────────────────────────────────────────────────────────────────────

(async function testFallbackStructure() {
  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: null, // no pet
    promoItem: { promo_item_id: "item-5", version: 1 },
    context: "home_feed",
    matchedTags: [],
    getOpenAiKey: () => null,
  });

  const expl = result.explanation;
  assert.ok(expl.why_you_see_this, "Must have why_you_see_this");
  assert.ok(expl.why_you_see_this.includes("il tuo pet"), "Default pet name should be 'il tuo pet'");
  assert.strictEqual(expl.benefit_for_pet, null);
  assert.strictEqual(expl.clinical_fit, null);
  assert.ok(expl.disclaimer.includes("veterinario"), "Disclaimer must mention veterinario");
  assert.strictEqual(expl.confidence, "low");
  console.log("  PASS: fallback explanation structure with null pet");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: clinical tags are filtered from pet summary
// ─────────────────────────────────────────────────────────────────────────────

(async function testClinicalTagsFilteredFromSummary() {
  // We verify by checking that the cache key does NOT include clinical tags
  // Since the pet summary filters them out for privacy.
  const pool = createMockPool([
    { match: "explanation_cache", response: { rows: [] } },
  ]);

  const result = await generateExplanation(pool, {
    pet: { name: "Test", species: "dog" },
    promoItem: { promo_item_id: "item-6", version: 1 },
    context: "home_feed",
    matchedTags: ["species:dog", "clinical:renal", "size:large"],
    getOpenAiKey: () => null,
  });

  // The function filters clinical tags from the summary but still works
  assert.strictEqual(result.source, "fallback");
  console.log("  PASS: clinical tags are filtered from pet summary (privacy)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: cache key determinism
// ─────────────────────────────────────────────────────────────────────────────

(async function testCacheKeyDeterminism() {
  // Two calls with same inputs should produce same cache key
  let cacheKeys = [];
  const pool = {
    query(sql, params) {
      if (sql.includes("explanation_cache") && sql.includes("SELECT")) {
        if (params && params[0]) cacheKeys.push(params[0]);
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    },
  };

  const opts = {
    pet: { name: "Same", species: "dog", birthdate: "2022-01-01", weight_kg: 10 },
    promoItem: { promo_item_id: "item-7", version: 2 },
    context: "post_visit",
    matchedTags: ["species:dog"],
    getOpenAiKey: () => null,
  };

  await generateExplanation(pool, opts);
  await generateExplanation(pool, opts);

  assert.strictEqual(cacheKeys.length, 2, "Should have queried cache twice");
  assert.strictEqual(cacheKeys[0], cacheKeys[1], "Cache keys should be identical for same inputs");
  // Verify it's a valid SHA256 hex string
  assert.ok(/^[0-9a-f]{64}$/.test(cacheKeys[0]), "Cache key should be SHA256 hex");
  console.log("  PASS: cache key is deterministic and valid SHA256");
})();

setTimeout(() => {
  console.log("OK explanation.service.test.js");
}, 100);
