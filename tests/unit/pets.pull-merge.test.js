/* pets.pull-merge.test.js v2
   Node-only unit test (no Jest/Vitest) for PetsSyncMerge.
*/
const assert = require('assert');
const path = require('path');

// Load module in a JSDOM-less environment: it attaches to global window.
// We simulate window.
global.window = global.window || {};
require(path.join(__dirname, '../../docs/pets-sync-merge.js'));

const { normalizePetFromServer, mergePetLocalWithRemote } = global.window.PetsSyncMerge;

function clone(x) { return JSON.parse(JSON.stringify(x)); }

(function testFlatToNested() {
  const remoteFlat = {
    pet_id: "70920c7b-27e5-4eb0-ab99-0b44c92219fe",
    name: "Alfa4",
    species: "Altro",
    breed: "Razza4",
    sex: "Maschio",
    weight_kg: "4.00",
    version: 1,
    created_at: "2026-02-01T21:09:51.984Z",
    updated_at: "2026-02-01T21:09:51.984Z",
    owner_user_id: "ada-user",
    notes: null,
    birthdate: "2024-02-01"
  };

  const localNested = {
    id: remoteFlat.pet_id,
    name: "ALFA1",
    species: "Cane",
    breed: "RAZZA1",
    sex: "Maschio",
    weight_kg: "1.00",
    patient: {
      pet_id: remoteFlat.pet_id,
      petName: "ALFA1",
      petSpecies: "Cane",
      petBreed: "RAZZA1",
      petSex: "Maschio",
      petWeight: "1.00",
      petBirthdate: "2023-01-01"
    }
  };

  const norm = normalizePetFromServer(clone(remoteFlat));
  const merged = mergePetLocalWithRemote(clone(localNested), norm);

  assert.strictEqual(merged.patient.petName, "Alfa4");
  assert.strictEqual(merged.patient.petSpecies, "Altro");
  assert.strictEqual(merged.patient.petBreed, "Razza4");
  assert.strictEqual(merged.patient.petSex, "Maschio");
  assert.strictEqual(merged.patient.petWeight, "4.00");
  assert.strictEqual(merged.patient.petWeightKg, "4.00");
  assert.strictEqual(merged.name, "Alfa4");
  assert.strictEqual(merged.birthdate, "2024-02-01");
  assert.strictEqual(merged.patient.petBirthdate, "2024-02-01");
})();

(function testNonDestructive() {
  const local = {
    id: "e95b5e09-0bf9-45c8-8e3b-3d96f96b1583",
    name: "ALFA1",
    species: "Cane",
    breed: "RAZZA1",
    sex: "Maschio",
    weight_kg: "1.00",
    birthdate: "2023-01-01",
    patient: {
      pet_id: "e95b5e09-0bf9-45c8-8e3b-3d96f96b1583",
      petName: "ALFA1",
      petSpecies: "Cane",
      petBreed: "RAZZA1",
      petSex: "Maschio",
      petWeight: "1.00",
      petBirthdate: "2023-01-01"
    }
  };

  const remoteIncomplete = {
    pet_id: local.id,
    name: undefined,
    species: null,
    breed: undefined,
    sex: undefined,
    weight_kg: undefined,
    birthdate: undefined,
    version: 2,
    updated_at: "2026-02-01T22:00:00.000Z",
  };

  const merged = mergePetLocalWithRemote(clone(local), normalizePetFromServer(clone(remoteIncomplete)));

  assert.strictEqual(merged.patient.petName, "ALFA1");
  assert.strictEqual(merged.patient.petSpecies, "Cane");
  assert.strictEqual(merged.patient.petBreed, "RAZZA1");
  assert.strictEqual(merged.patient.petSex, "Maschio");
  assert.strictEqual(merged.patient.petWeight, "1.00");
  assert.strictEqual(merged.patient.petBirthdate, "2023-01-01");
  assert.strictEqual(merged.name, "ALFA1");
  assert.strictEqual(merged.birthdate, "2023-01-01");
})();

(function testCompleteUpdate() {
  const local = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "OldName",
    species: "Cane",
    breed: "Meticcio",
    sex: "Maschio",
    weight_kg: "10.00",
    birthdate: "2020-01-01",
    patient: {
      pet_id: "11111111-1111-1111-1111-111111111111",
      petName: "OldName",
      petSpecies: "Cane",
      petBreed: "Meticcio",
      petSex: "Maschio",
      petWeight: "10.00",
      petBirthdate: "2020-01-01"
    }
  };

  const remote = {
    pet_id: local.id,
    name: "NewName",
    species: "Altro",
    breed: "RazzaX",
    sex: "Femmina",
    weight_kg: "12.50",
    birthdate: "2019-12-31",
    version: 3,
    updated_at: "2026-02-01T23:00:00.000Z",
  };

  const merged = mergePetLocalWithRemote(clone(local), normalizePetFromServer(clone(remote)));

  assert.strictEqual(merged.name, "NewName");
  assert.strictEqual(merged.patient.petName, "NewName");
  assert.strictEqual(merged.weight_kg, "12.50");
  assert.strictEqual(merged.patient.petWeight, "12.50");
  assert.strictEqual(merged.birthdate, "2019-12-31");
  assert.strictEqual(merged.patient.petBirthdate, "2019-12-31");
})();

console.log("OK pets.pull-merge.test.js");
