/* risk-scoring.service.test.js
   Unit tests for insurance risk scoring service.
   Run: node tests/unit/risk-scoring.service.test.js
*/
const assert = require("assert");
const path = require("path");

const {
  computeRiskScore,
  _ageRiskScore,
  _breedRiskScore,
  _historyRiskScore,
  _medsRiskScore,
  _weightRiskScore,
} = require(path.join(__dirname, "../../backend/src/risk-scoring.service"));

assert.strictEqual(typeof computeRiskScore, "function", "computeRiskScore must be exported");
assert.strictEqual(typeof _ageRiskScore, "function", "_ageRiskScore must be exported");
assert.strictEqual(typeof _breedRiskScore, "function", "_breedRiskScore must be exported");
assert.strictEqual(typeof _historyRiskScore, "function", "_historyRiskScore must be exported");
assert.strictEqual(typeof _medsRiskScore, "function", "_medsRiskScore must be exported");
assert.strictEqual(typeof _weightRiskScore, "function", "_weightRiskScore must be exported");

// Helper: build a birthdate N years ago
function _birthdate(ageYears) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ageYears);
  return d.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// _ageRiskScore tests — signature: (pet, extraData)
// ─────────────────────────────────────────────────────────────────────────────

(function testAgeYoungPet() {
  const score = _ageRiskScore({}, { birthdate: _birthdate(2) });
  assert.ok(score >= 0 && score <= 20, "Age score should be 0-20, got " + score);
  assert.strictEqual(score, 5, "Young pet (2y) should have score 5");
  console.log("  PASS: _ageRiskScore 2yo = " + score);
})();

(function testAgeSeniorPet() {
  const score = _ageRiskScore({}, { birthdate: _birthdate(12) });
  assert.ok(score >= 0 && score <= 20, "Age score should be 0-20, got " + score);
  assert.strictEqual(score, 17, "Senior pet (12y) should have score 17");
  console.log("  PASS: _ageRiskScore 12yo = " + score);
})();

(function testAgeUnknown() {
  const score = _ageRiskScore({}, {});
  assert.strictEqual(score, 10, "Unknown age should return 10 (medium)");
  console.log("  PASS: _ageRiskScore unknown = " + score);
})();

(function testAgeVeryOld() {
  const score = _ageRiskScore({}, { birthdate: _birthdate(15) });
  assert.strictEqual(score, 20, "Very old pet (15y) should have max score 20");
  console.log("  PASS: _ageRiskScore 15yo = " + score);
})();

// ─────────────────────────────────────────────────────────────────────────────
// _breedRiskScore tests — signature: (pet, extraData)
// ─────────────────────────────────────────────────────────────────────────────

(function testBreedHighRisk() {
  const score = _breedRiskScore({ breed: "Bulldog Francese", species: "Cane" }, {});
  assert.ok(score >= 0 && score <= 20, "Breed score should be 0-20, got " + score);
  assert.strictEqual(score, 18, "Bulldog Francese = high risk breed = 18");
  console.log("  PASS: _breedRiskScore('Bulldog Francese') = " + score);
})();

(function testBreedNormalRisk() {
  const score = _breedRiskScore({ breed: "Barboncino", species: "Cane" }, {});
  assert.strictEqual(score, 10, "Non-high-risk breed should return 10");
  console.log("  PASS: _breedRiskScore('Barboncino') = " + score);
})();

(function testBreedMixed() {
  const score = _breedRiskScore({ breed: "Meticcio", species: "Cane" }, {});
  assert.strictEqual(score, 8, "Mixed breed (meticcio) should return 8");
  console.log("  PASS: _breedRiskScore('Meticcio') = " + score);
})();

// ─────────────────────────────────────────────────────────────────────────────
// _historyRiskScore tests — signature: (tags)
// ─────────────────────────────────────────────────────────────────────────────

(function testHistoryEmptyTags() {
  const score = _historyRiskScore([]);
  assert.strictEqual(score, 5, "Empty tags should give 5 (baseline risk)");
  console.log("  PASS: _historyRiskScore([]) = " + score);
})();

(function testHistoryNullTags() {
  const score = _historyRiskScore(null);
  assert.ok(score >= 0 && score <= 25, "Null tags should give valid score");
  console.log("  PASS: _historyRiskScore(null) = " + score);
})();

(function testHistoryWithClinicalTags() {
  const tags = [
    { tag: "clinical:joint_issues" },
    { tag: "clinical:skin_issues" },
    { tag: "species:dog" },
  ];
  const score = _historyRiskScore(tags);
  assert.ok(score >= 0 && score <= 25, "History score should be 0-25, got " + score);
  assert.ok(score > 0, "Clinical tags should increase risk");
  console.log("  PASS: _historyRiskScore 2 clinical tags = " + score);
})();

(function testHistoryHighRiskConditions() {
  const tags = [
    { tag: "clinical:cardiac" },
    { tag: "clinical:renal" },
    { tag: "clinical:obesity" },
  ];
  const score = _historyRiskScore(tags);
  assert.ok(score > 10, "High-risk conditions should score high, got " + score);
  console.log("  PASS: _historyRiskScore high-risk conditions = " + score);
})();

// ─────────────────────────────────────────────────────────────────────────────
// _medsRiskScore tests — signature: (tags)
// ─────────────────────────────────────────────────────────────────────────────

(function testMedsNoTags() {
  const score = _medsRiskScore([]);
  assert.strictEqual(score, 0, "No tags -> 0 meds risk");
  console.log("  PASS: _medsRiskScore([]) = " + score);
})();

(function testMedsOneClinical() {
  const score = _medsRiskScore([{ tag: "clinical:joint_issues" }]);
  assert.strictEqual(score, 5, "1 clinical tag -> score 5");
  console.log("  PASS: _medsRiskScore 1 clinical = " + score);
})();

(function testMedsManyClinical() {
  const score = _medsRiskScore([
    { tag: "clinical:a" }, { tag: "clinical:b" }, { tag: "clinical:c" },
  ]);
  assert.strictEqual(score, 15, "3+ clinical tags -> max score 15");
  console.log("  PASS: _medsRiskScore 3 clinical = " + score);
})();

// ─────────────────────────────────────────────────────────────────────────────
// _weightRiskScore tests — signature: (pet, extraData)
// ─────────────────────────────────────────────────────────────────────────────

(function testWeightDogMedium() {
  const score = _weightRiskScore({ species: "Cane" }, { weightKg: 25 });
  assert.ok(score >= 0 && score <= 20, "Weight score should be 0-20, got " + score);
  assert.strictEqual(score, 10, "25kg dog = medium weight range = 10");
  console.log("  PASS: _weightRiskScore(25kg, dog) = " + score);
})();

(function testWeightCatNormal() {
  const score = _weightRiskScore({ species: "Gatto" }, { weightKg: 4.5 });
  assert.strictEqual(score, 5, "4.5kg cat = normal range = 5");
  console.log("  PASS: _weightRiskScore(4.5kg, cat) = " + score);
})();

(function testWeightUnknown() {
  const score = _weightRiskScore({ species: "Cane" }, {});
  assert.strictEqual(score, 10, "Unknown weight -> 10 (medium)");
  console.log("  PASS: _weightRiskScore(unknown) = " + score);
})();

console.log("OK risk-scoring.service.test.js");
