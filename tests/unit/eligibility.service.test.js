/* eligibility.service.test.js
   Unit tests for the promo eligibility/selection engine.
   Run: node tests/unit/eligibility.service.test.js
*/
const assert = require("assert");
const path = require("path");

const { selectPromo, CONTEXT_RULES } = require(
  path.join(__dirname, "../../backend/src/eligibility.service")
);

assert.strictEqual(typeof selectPromo, "function", "selectPromo must be exported");
assert.ok(CONTEXT_RULES, "CONTEXT_RULES must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT_RULES structure validation
// ─────────────────────────────────────────────────────────────────────────────

(function testContextRulesKeys() {
  const expectedContexts = [
    "post_visit", "post_vaccination", "home_feed",
    "pet_profile", "faq_view", "milestone",
  ];
  for (const ctx of expectedContexts) {
    assert.ok(CONTEXT_RULES[ctx], "Missing context rule: " + ctx);
    assert.ok(CONTEXT_RULES[ctx].freq, "Missing freq for context: " + ctx);
  }
  console.log("  PASS: all expected context rules present");
})();

(function testPostVisitCategories() {
  assert.deepStrictEqual(
    CONTEXT_RULES.post_visit.categories,
    ["food_clinical", "supplement"],
    "post_visit should allow food_clinical and supplement"
  );
  assert.deepStrictEqual(CONTEXT_RULES.post_visit.freq, { per_event: 1 });
  console.log("  PASS: post_visit categories and freq correct");
})();

(function testHomeFeedCategories() {
  assert.deepStrictEqual(
    CONTEXT_RULES.home_feed.categories,
    ["food_general", "accessory", "service"]
  );
  assert.deepStrictEqual(CONTEXT_RULES.home_feed.freq, { per_session: 2, per_week: 4 });
  console.log("  PASS: home_feed categories and freq correct");
})();

(function testFaqViewAnyCategoryConcept() {
  assert.strictEqual(CONTEXT_RULES.faq_view.categories, null, "faq_view allows any category");
  console.log("  PASS: faq_view categories is null (any allowed)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Mock pool for selectPromo integration tests
// ─────────────────────────────────────────────────────────────────────────────

function createMockPool(queryResponses) {
  let callIndex = 0;
  return {
    query(sql, params) {
      const response = queryResponses[callIndex] || { rows: [] };
      callIndex++;
      if (response.error) return Promise.reject(new Error(response.error));
      return Promise.resolve(response);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: marketing globally off -> null
// ─────────────────────────────────────────────────────────────────────────────

(async function testMarketingOff() {
  const pool = createMockPool([
    // 1. pet_tags query
    { rows: [{ tag: "species:dog", value: null, confidence: null }] },
    // 2. pets species query
    { rows: [{ species: "cane" }] },
    // 3. consent query (marketing_global opted_out)
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_out" }] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-1",
    ownerUserId: "owner-1",
    context: "home_feed",
  });

  assert.strictEqual(result, null, "Should return null when marketing is off");
  console.log("  PASS: selectPromo returns null when marketing_global opted_out");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: no candidates -> null
// ─────────────────────────────────────────────────────────────────────────────

(async function testNoCandidates() {
  const pool = createMockPool([
    // 1. pet_tags
    { rows: [{ tag: "species:dog", value: null, confidence: null }] },
    // 2. pets species
    { rows: [{ species: "dog" }] },
    // 3. consents (all opted_in)
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 4. promo_items candidates
    { rows: [] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-2",
    ownerUserId: "owner-2",
    context: "home_feed",
  });

  assert.strictEqual(result, null, "Should return null when no candidates");
  console.log("  PASS: selectPromo returns null when no candidates");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: successful selection with single candidate
// ─────────────────────────────────────────────────────────────────────────────

(async function testSuccessfulSelection() {
  const mockItem = {
    promo_item_id: "item-1",
    tenant_id: "t1",
    name: "Test Product",
    category: "food_general",
    species: ["dog", "all"],
    image_url: "https://example.com/img.jpg",
    description: "A test product",
    product_url: "https://example.com/product",
    tags_include: ["species:dog"],
    tags_exclude: [],
    priority: 10,
    status: "published",
    updated_at: "2026-01-01T00:00:00Z",
    campaign_id: "c1",
    frequency_cap: null,
    utm_campaign: "test-campaign",
    contexts: null,
  };

  const pool = createMockPool([
    // 1. pet_tags
    { rows: [{ tag: "species:dog", value: null, confidence: null }] },
    // 2. pets species
    { rows: [{ species: "cane" }] },
    // 3. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 4. candidates
    { rows: [mockItem] },
    // 5. vet_flags check (no flags)
    { rows: [] },
    // 6. frequency capping - per_session
    { rows: [{ cnt: "0" }] },
    // 7. frequency capping - per_week
    { rows: [{ cnt: "0" }] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-3",
    ownerUserId: "owner-3",
    context: "home_feed",
  });

  assert.ok(result, "Should return a recommendation");
  assert.strictEqual(result.promoItemId, "item-1");
  assert.strictEqual(result.tenantId, "t1");
  assert.strictEqual(result.name, "Test Product");
  assert.strictEqual(result.context, "home_feed");
  assert.strictEqual(result.source, "eligibility");
  assert.ok(result.ctaUrl.includes("utm_source=ada"), "CTR URL should include UTM params");
  assert.ok(result.ctaUrl.includes("utm_campaign=test-campaign"), "CTR URL should include campaign");
  assert.ok(Array.isArray(result.matchedTags), "matchedTags should be an array");
  assert.ok(result.matchedTags.includes("species:dog"), "matchedTags should include species:dog");
  console.log("  PASS: selectPromo returns correct recommendation shape");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: species filter excludes wrong species
// ─────────────────────────────────────────────────────────────────────────────

(async function testSpeciesFilter() {
  const catOnlyItem = {
    promo_item_id: "item-cat",
    tenant_id: "t1",
    name: "Cat Food",
    category: "food_general",
    species: ["cat"],
    tags_include: [],
    tags_exclude: [],
    priority: 10,
    status: "published",
    updated_at: "2026-01-01T00:00:00Z",
    campaign_id: null,
    frequency_cap: null,
    utm_campaign: null,
    contexts: null,
  };

  const pool = createMockPool([
    // 1. pet_tags
    { rows: [{ tag: "species:dog", value: null, confidence: null }] },
    // 2. pets species -> dog
    { rows: [{ species: "dog" }] },
    // 3. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 4. candidates - only cat item
    { rows: [catOnlyItem] },
  ]);

  const result = await selectPromo(pool, {
    petId: "dog-pet",
    ownerUserId: "owner-4",
    context: "home_feed",
  });

  assert.strictEqual(result, null, "Dog should not see cat-only products");
  console.log("  PASS: species filter excludes wrong species");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: category filter for context
// ─────────────────────────────────────────────────────────────────────────────

(async function testCategoryFilter() {
  const supplementItem = {
    promo_item_id: "item-supp",
    tenant_id: "t1",
    name: "Supplement",
    category: "supplement", // not in home_feed categories [food_general, accessory, service]
    species: ["all"],
    tags_include: [],
    tags_exclude: [],
    priority: 10,
    status: "published",
    updated_at: "2026-01-01T00:00:00Z",
    campaign_id: null,
    frequency_cap: null,
    utm_campaign: null,
    contexts: null,
  };

  const pool = createMockPool([
    // 1. pet_tags
    { rows: [] },
    // 2. computeTags called (pet query) - return no pet -> skip
    { rows: [] },
    // 3. pets species
    { rows: [{ species: "dog" }] },
    // 4. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 5. candidates - supplement item
    { rows: [supplementItem] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-5",
    ownerUserId: "owner-5",
    context: "home_feed", // supplement not in home_feed categories
  });

  assert.strictEqual(result, null, "Supplement should be filtered out in home_feed context");
  console.log("  PASS: category filter excludes items not in context categories");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: tags_exclude filters out matching items
// ─────────────────────────────────────────────────────────────────────────────

(async function testTagsExclude() {
  const itemWithExclude = {
    promo_item_id: "item-excl",
    tenant_id: "t1",
    name: "No Allergy Product",
    category: "food_general",
    species: ["all"],
    tags_include: [],
    tags_exclude: ["clinical:allergy"],
    priority: 10,
    status: "published",
    updated_at: "2026-01-01T00:00:00Z",
    campaign_id: null,
    frequency_cap: null,
    utm_campaign: null,
    contexts: null,
  };

  const pool = createMockPool([
    // 1. pet_tags - pet has clinical:allergy
    { rows: [{ tag: "clinical:allergy", value: null, confidence: null }] },
    // 2. pets species
    { rows: [{ species: "dog" }] },
    // 3. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 4. candidates
    { rows: [itemWithExclude] },
    // 5. vet_flags
    { rows: [] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-6",
    ownerUserId: "owner-6",
    context: "home_feed",
  });

  assert.strictEqual(result, null, "Item with tags_exclude matching pet tags should be excluded");
  console.log("  PASS: tags_exclude correctly filters out matching items");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: default context when none provided
// ─────────────────────────────────────────────────────────────────────────────

(async function testDefaultContext() {
  const pool = createMockPool([
    // 1. pet_tags
    { rows: [] },
    // 2. computeTags pet query
    { rows: [] },
    // 3. pets species
    { rows: [{ species: "dog" }] },
    // 4. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 5. candidates
    { rows: [] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-7",
    ownerUserId: "owner-7",
    // no context specified
  });

  assert.strictEqual(result, null); // no candidates, but code should not crash
  console.log("  PASS: selectPromo handles missing context gracefully (defaults to home_feed)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: UTM params with existing query string
// ─────────────────────────────────────────────────────────────────────────────

(async function testUtmWithExistingQuery() {
  const itemWithQuery = {
    promo_item_id: "item-q",
    tenant_id: "t1",
    name: "Product",
    category: "food_general",
    species: ["all"],
    tags_include: [],
    tags_exclude: [],
    priority: 10,
    status: "published",
    product_url: "https://example.com/product?ref=ada",
    updated_at: "2026-01-01T00:00:00Z",
    campaign_id: null,
    frequency_cap: null,
    utm_campaign: null,
    contexts: null,
  };

  const pool = createMockPool([
    // 1. pet_tags
    { rows: [{ tag: "species:dog", value: null, confidence: null }] },
    // 2. pets species
    { rows: [{ species: "dog" }] },
    // 3. consents
    { rows: [{ consent_type: "marketing_global", scope: "global", status: "opted_in" }] },
    // 4. candidates
    { rows: [itemWithQuery] },
    // 5. vet_flags
    { rows: [] },
    // 6-7. frequency capping
    { rows: [{ cnt: "0" }] },
    { rows: [{ cnt: "0" }] },
  ]);

  const result = await selectPromo(pool, {
    petId: "pet-8",
    ownerUserId: "owner-8",
    context: "home_feed",
  });

  assert.ok(result, "Should return recommendation");
  assert.ok(result.ctaUrl.includes("?ref=ada&"), "Should append with & when URL has existing query");
  console.log("  PASS: UTM params appended with & when product_url has existing query string");
})();

// ─────────────────────────────────────────────────────────────────────────────
// selectPromo: handles pool.query errors gracefully
// ─────────────────────────────────────────────────────────────────────────────

(async function testQueryError() {
  const pool = {
    query() { return Promise.reject(new Error("connection lost")); },
  };

  const result = await selectPromo(pool, {
    petId: "pet-err",
    ownerUserId: "owner-err",
    context: "home_feed",
  });

  assert.strictEqual(result, null, "Should return null on fatal error");
  console.log("  PASS: selectPromo handles query errors gracefully -> null");
})();

// Wait for all async tests to complete
setTimeout(() => {
  console.log("OK eligibility.service.test.js");
}, 100);
