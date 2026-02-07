/* tag.service.test.js
   Unit tests for the tag computation engine.
   Run: node tests/unit/tag.service.test.js
*/
const assert = require("assert");
const path = require("path");

const { computeTags } = require(path.join(__dirname, "../../backend/src/tag.service"));

assert.strictEqual(typeof computeTags, "function", "computeTags must be exported");

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
// Test: pet not found
// ─────────────────────────────────────────────────────────────────────────────

(async function testPetNotFound() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "no-pet", "owner-1");
  assert.deepStrictEqual(result.tags, []);
  assert.ok(result.errors.includes("pet_not_found"), "Should report pet_not_found");
  console.log("  PASS: pet not found returns error");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: dog species tag
// ─────────────────────────────────────────────────────────────────────────────

(async function testDogSpecies() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p1", species: "Cane", breed: null, birthdate: null, weight_kg: null, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p1", "owner-1");
  assert.ok(result.tags.includes("species:dog"), "Should include species:dog for Cane");
  console.log("  PASS: Cane -> species:dog");
})();

(async function testCatSpecies() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p2", species: "gatto", breed: null, birthdate: null, weight_kg: null, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p2", "owner-1");
  assert.ok(result.tags.includes("species:cat"), "Should include species:cat for gatto");
  console.log("  PASS: gatto -> species:cat");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: size tags for dogs
// ─────────────────────────────────────────────────────────────────────────────

(async function testSmallDog() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p3", species: "dog", breed: null, birthdate: null, weight_kg: 5, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p3", "owner-1");
  assert.ok(result.tags.includes("size:small"), "<10kg dog should be small");
  console.log("  PASS: 5kg dog -> size:small");
})();

(async function testMediumDog() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p4", species: "cane", breed: null, birthdate: null, weight_kg: 15, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p4", "owner-1");
  assert.ok(result.tags.includes("size:medium"), "10-25kg dog should be medium");
  console.log("  PASS: 15kg dog -> size:medium");
})();

(async function testLargeDog() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p5", species: "Dog", breed: null, birthdate: null, weight_kg: 40, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p5", "owner-1");
  assert.ok(result.tags.includes("size:large"), ">=25kg dog should be large");
  console.log("  PASS: 40kg dog -> size:large");
})();

(async function testCatNoSize() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p6", species: "cat", breed: null, birthdate: null, weight_kg: 5, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p6", "owner-1");
  assert.ok(!result.tags.some(t => t.startsWith("size:")), "Cats should not have size tags");
  console.log("  PASS: cat with weight -> no size tag");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: lifecycle tags
// ─────────────────────────────────────────────────────────────────────────────

(async function testPuppy() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p7", species: "dog", breed: null, birthdate: sixMonthsAgo.toISOString(), weight_kg: null, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p7", "owner-1");
  assert.ok(result.tags.includes("lifecycle:puppy"), "<1 year old should be puppy");
  console.log("  PASS: 6 month old -> lifecycle:puppy");
})();

(async function testAdultDog() {
  const now = new Date();
  const threeYearsAgo = new Date(now.getTime() - 3 * 365.25 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p8", species: "dog", breed: null, birthdate: threeYearsAgo.toISOString(), weight_kg: 15, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p8", "owner-1");
  assert.ok(result.tags.includes("lifecycle:adult"), "3yr old medium dog should be adult");
  console.log("  PASS: 3 year old medium dog -> lifecycle:adult");
})();

(async function testSeniorLargeDog() {
  const now = new Date();
  const sevenYearsAgo = new Date(now.getTime() - 7 * 365.25 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p9", species: "cane", breed: null, birthdate: sevenYearsAgo.toISOString(), weight_kg: 30, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p9", "owner-1");
  assert.ok(result.tags.includes("lifecycle:senior"), "7yr old large dog (seniorAge=6) should be senior");
  console.log("  PASS: 7 year old large dog -> lifecycle:senior");
})();

(async function testSeniorCat() {
  const now = new Date();
  const elevenYearsAgo = new Date(now.getTime() - 11 * 365.25 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p10", species: "Gatto", breed: null, birthdate: elevenYearsAgo.toISOString(), weight_kg: 4, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p10", "owner-1");
  assert.ok(result.tags.includes("lifecycle:senior"), "11yr old cat (seniorAge=10) should be senior");
  console.log("  PASS: 11 year old cat -> lifecycle:senior");
})();

(async function testSmallDogSeniorAt10() {
  const now = new Date();
  const nineYearsAgo = new Date(now.getTime() - 9 * 365.25 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p11", species: "dog", breed: null, birthdate: nineYearsAgo.toISOString(), weight_kg: 5, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p11", "owner-1");
  assert.ok(result.tags.includes("lifecycle:adult"), "9yr old small dog (seniorAge=10) should still be adult");
  console.log("  PASS: 9 year old small dog -> lifecycle:adult (senior at 10)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: clinical tag keyword matching
// ─────────────────────────────────────────────────────────────────────────────

(async function testClinicalKeyword() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p12", species: "dog", breed: null, birthdate: null, weight_kg: null, extra_data: { notes: "diagnosed with renal failure" } }] } },
    { match: "FROM tag_dictionary", response: { rows: [
      { tag: "clinical:renal", derivation_rule: { type: "keyword", keywords: ["renal", "renale", "kidney", "rene"] } },
      { tag: "clinical:diabetes", derivation_rule: { type: "keyword", keywords: ["diabete", "diabetes", "insulin"] } },
    ] } },
    { match: "FROM pet_changes", response: { rows: [] } },
    { match: "entity_type = 'document'", response: { rows: [] } },
    { match: "FROM documents", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p12", "owner-1");
  assert.ok(result.tags.includes("clinical:renal"), "Should match clinical:renal from extra_data");
  assert.ok(!result.tags.includes("clinical:diabetes"), "Should not match clinical:diabetes");
  console.log("  PASS: clinical keyword matching from extra_data");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: error handling - query failure
// ─────────────────────────────────────────────────────────────────────────────

(async function testQueryFailure() {
  const pool = createMockPool([
    { match: "FROM pets WHERE", error: "connection refused" },
  ]);
  const result = await computeTags(pool, "p-err", "owner-1");
  assert.deepStrictEqual(result.tags, []);
  assert.ok(result.errors.length > 0, "Should have errors");
  console.log("  PASS: computeTags handles query failure gracefully");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: complete tag set for a dog
// ─────────────────────────────────────────────────────────────────────────────

(async function testCompleteTagSet() {
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365.25 * 24 * 60 * 60 * 1000);
  const pool = createMockPool([
    { match: "FROM pets WHERE", response: { rows: [{ pet_id: "p13", species: "Cane", breed: "Labrador", birthdate: twoYearsAgo.toISOString(), weight_kg: 30, extra_data: null }] } },
    { match: "FROM tag_dictionary", response: { rows: [] } },
    { match: "INSERT INTO pet_tags", response: { rows: [] } },
  ]);
  const result = await computeTags(pool, "p13", "owner-1");
  assert.ok(result.tags.includes("species:dog"), "Should have species:dog");
  assert.ok(result.tags.includes("size:large"), "30kg -> size:large");
  assert.ok(result.tags.includes("lifecycle:adult"), "2yr old -> lifecycle:adult");
  assert.strictEqual(result.tags.length, 3, "Should have exactly 3 tags");
  console.log("  PASS: complete tag set for 2yr old 30kg dog: species:dog, size:large, lifecycle:adult");
})();

setTimeout(() => {
  console.log("OK tag.service.test.js");
}, 100);
