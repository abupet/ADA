/* pet-to-patch.test.js
   Node-only unit test for _petToPatch conversion logic.
   Extracts _petToPatch from pets-sync-step4.js and tests all branches.
*/
const assert = require("assert");
const path = require("path");
const fs = require("fs");

// Extract _petToPatch from the source file
// (it's not exported, so we eval the function definition)
const srcPath = path.join(__dirname, "../../docs/pets-sync-step4.js");
const src = fs.readFileSync(srcPath, "utf8");

// Extract just the _petToPatch function
const fnMatch = src.match(/function _petToPatch\(petLike\)\s*\{[\s\S]*?\n\}/);
if (!fnMatch) throw new Error("Could not extract _petToPatch from source");

// Create a standalone function
const _petToPatch = new Function("petLike", fnMatch[0].replace(/^function _petToPatch\(petLike\)\s*\{/, "").replace(/\}$/, ""));

// ─────────────────────────────────────────────────────────────────────────────
// Test: empty/null input
// ─────────────────────────────────────────────────────────────────────────────

(function testNullInput() {
  assert.deepStrictEqual(_petToPatch(null), {});
  assert.deepStrictEqual(_petToPatch(undefined), {});
  assert.deepStrictEqual(_petToPatch(false), {});
  assert.deepStrictEqual(_petToPatch(0), {});
  console.log("  PASS: null/undefined/false/0 -> empty patch");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: patch takes priority over record (the bug we fixed)
// ─────────────────────────────────────────────────────────────────────────────

(function testPatchPriorityOverRecord() {
  const input = {
    record: {
      patient: { petName: "OldName", petSpecies: "Cane" },
      vitalsData: [],
      medications: [],
    },
    patch: {
      patient: { petName: "NewName", petSpecies: "Gatto" },
      vitalsData: [{ weight: 10, temp: 38.5 }],
      medications: [{ name: "TestMed", dosage: "100mg" }],
    },
  };

  const result = _petToPatch(input);
  assert.strictEqual(result.name, "NewName", "patch.patient.petName should take priority");
  assert.strictEqual(result.species, "Gatto", "patch.patient.petSpecies should take priority");
  assert.strictEqual(result.vitals_data.length, 1, "patch.vitalsData should be used");
  assert.strictEqual(result.medications.length, 1, "patch.medications should be used");
  console.log("  PASS: patch takes priority over record (coalescing fix)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: full pet record with nested patient
// ─────────────────────────────────────────────────────────────────────────────

(function testFullPetWithPatient() {
  const pet = {
    patient: {
      petName: "Neve",
      petSpecies: "Cane",
      petBreed: "Labrador",
      petSex: "Femmina",
      petBirthdate: "2020-06-15",
      petWeight: "25.5",
      ownerName: "Mario Rossi",
      ownerPhone: "+39 123 456",
      petMicrochip: "900123456789012",
      visitDate: "2026-02-01",
    },
    diary: "Test vet notes",
    ownerDiary: "Test owner notes",
    vitalsData: [{ weight: 25.5, temp: 38.3, hr: 80, rr: 18, date: "2026-02-01" }],
    medications: [{ name: "Amoxicillina", dosage: "250mg", frequency: "BID" }],
    historyData: [{ date: "2026-02-01", soapData: { s: "Ok", o: "Normal", a: "Healthy", p: "None" } }],
    photos: ["data:image/png;base64,abc123"],
    lifestyle: { indoor: true, outdoor: false },
    updatedAt: "2026-02-01T12:00:00.000Z",
  };

  const result = _petToPatch(pet);

  // Patient fields
  assert.strictEqual(result.name, "Neve");
  assert.strictEqual(result.species, "Cane");
  assert.strictEqual(result.breed, "Labrador");
  assert.strictEqual(result.sex, "Femmina");
  assert.strictEqual(result.birthdate, "2020-06-15");
  assert.strictEqual(result.weight_kg, 25.5);
  assert.strictEqual(result.owner_name, "Mario Rossi");
  assert.strictEqual(result.owner_phone, "+39 123 456");
  assert.strictEqual(result.microchip, "900123456789012");
  assert.strictEqual(result.visit_date, "2026-02-01");

  // Rich data
  assert.strictEqual(result.notes, "Test vet notes");
  assert.strictEqual(result.owner_diary, "Test owner notes");
  assert.deepStrictEqual(result.vitals_data, pet.vitalsData);
  assert.deepStrictEqual(result.medications, pet.medications);
  assert.deepStrictEqual(result.history_data, pet.historyData);
  assert.deepStrictEqual(result.photos, pet.photos);
  assert.strictEqual(result.photos_count, 1);
  assert.deepStrictEqual(result.lifestyle, pet.lifestyle);
  assert.strictEqual(result.updated_at, "2026-02-01T12:00:00.000Z");

  console.log("  PASS: full pet with patient -> complete patch");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: {record: ...} wrapper (from outbox create op)
// ─────────────────────────────────────────────────────────────────────────────

(function testRecordWrapper() {
  const input = {
    record: {
      patient: { petName: "Luna", petSpecies: "Gatto" },
      vitalsData: [{ weight: 4.5 }],
    },
  };

  const result = _petToPatch(input);
  assert.strictEqual(result.name, "Luna");
  assert.strictEqual(result.species, "Gatto");
  assert.strictEqual(result.vitals_data.length, 1);
  console.log("  PASS: {record: ...} wrapper -> extracts data");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: {patch: ...} wrapper (from outbox update op)
// ─────────────────────────────────────────────────────────────────────────────

(function testPatchWrapper() {
  const input = {
    patch: {
      patient: { petName: "Rex", petSpecies: "Cane" },
      medications: [{ name: "Metacam", dosage: "0.5ml" }],
    },
  };

  const result = _petToPatch(input);
  assert.strictEqual(result.name, "Rex");
  assert.strictEqual(result.species, "Cane");
  assert.strictEqual(result.medications.length, 1);
  console.log("  PASS: {patch: ...} wrapper -> extracts data");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: weight parsing edge cases
// ─────────────────────────────────────────────────────────────────────────────

(function testWeightParsing() {
  // Comma decimal separator (Italian style)
  let result = _petToPatch({ patient: { petWeight: "12,5" } });
  assert.strictEqual(result.weight_kg, 12.5, "Comma should be converted to dot");

  // Numeric weight
  result = _petToPatch({ patient: { petWeight: 8.3 } });
  assert.strictEqual(result.weight_kg, 8.3, "Numeric weight should pass through");

  // petWeightKg takes precedence
  result = _petToPatch({ patient: { petWeightKg: 15, petWeight: 10 } });
  assert.strictEqual(result.weight_kg, 15, "petWeightKg should take precedence");

  // Empty string weight
  result = _petToPatch({ patient: { petWeight: "" } });
  assert.strictEqual(result.weight_kg, undefined, "Empty weight should not be included");

  // NaN weight
  result = _petToPatch({ patient: { petWeight: "abc" } });
  assert.strictEqual(result.weight_kg, undefined, "Non-numeric weight should not be included");

  console.log("  PASS: weight parsing edge cases");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: empty arrays are preserved (not omitted)
// ─────────────────────────────────────────────────────────────────────────────

(function testEmptyArrays() {
  const pet = {
    vitalsData: [],
    medications: [],
    historyData: [],
    photos: [],
  };

  const result = _petToPatch(pet);
  assert.deepStrictEqual(result.vitals_data, []);
  assert.deepStrictEqual(result.medications, []);
  assert.deepStrictEqual(result.history_data, []);
  assert.deepStrictEqual(result.photos, []);
  assert.strictEqual(result.photos_count, 0);
  console.log("  PASS: empty arrays are preserved");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: no patient object -> only rich data fields
// ─────────────────────────────────────────────────────────────────────────────

(function testNoPatient() {
  const pet = {
    diary: "Some notes",
    vitalsData: [{ weight: 5 }],
  };

  const result = _petToPatch(pet);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.species, undefined);
  assert.strictEqual(result.notes, "Some notes");
  assert.strictEqual(result.vitals_data.length, 1);
  console.log("  PASS: no patient -> only rich data fields");
})();

console.log("OK pet-to-patch.test.js");
