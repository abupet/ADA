// pets.pull-merge.test.js v1
// Anti-regression test: pull merge must normalize flat payloads and must be non-destructive.

const assert = require('assert');
const { normalizePetFromServer, mergePetLocalWithRemote } = require('../../docs/pets-sync-merge.js');

function test_normalizeFlatIntoPatient() {
  // Based on real pull snippet provided by user
  const remoteFlat = {
    pet_id: '70920c7b-27e5-4eb0-ab99-0b44c92219fe',
    name: 'Alfa4',
    species: 'Altro',
    breed: 'Razza4',
    sex: 'Maschio',
    weight_kg: '4.00',
    version: 1,
    created_at: '2026-02-01T21:09:51.984Z',
    updated_at: '2026-02-01T21:09:51.984Z',
    owner_user_id: 'ada-user',
    notes: null,
    birthdate: null,
  };

  const localNested = {
    id: remoteFlat.pet_id,
    name: 'ALFA1',
    breed: 'RAZZA1',
    species: 'Cane',
    sex: 'Maschio',
    weight_kg: '1.00',
    patient: {
      pet_id: remoteFlat.pet_id,
      petName: 'ALFA1',
      petSpecies: 'Cane',
      petBreed: 'RAZZA1',
      petSex: 'Maschio',
      petWeightKg: '1.00',
    },
  };

  const normalized = normalizePetFromServer(remoteFlat);
  const merged = mergePetLocalWithRemote(localNested, normalized);

  assert.ok(merged.patient, 'patient must exist after merge');
  assert.strictEqual(merged.patient.petName, 'Alfa4');
  assert.strictEqual(merged.patient.petSpecies, 'Altro');
  assert.strictEqual(merged.patient.petBreed, 'Razza4');
  assert.strictEqual(merged.patient.petSex, 'Maschio');
  assert.strictEqual(merged.patient.petWeightKg, '4.00');

  // Alignment invariant
  assert.strictEqual(merged.name, 'Alfa4');
}

function test_nonDestructiveWhenRemoteMissing() {
  const localNested = {
    id: 'e95b5e09-0bf9-45c8-8e3b-3d96f96b1583',
    name: 'ALFA1',
    breed: 'RAZZA1',
    species: 'Cane',
    sex: 'Maschio',
    weight_kg: '1.00',
    patient: {
      pet_id: 'e95b5e09-0bf9-45c8-8e3b-3d96f96b1583',
      petName: 'ALFA1',
      petSpecies: 'Cane',
      petBreed: 'RAZZA1',
      petSex: 'Maschio',
      petWeightKg: '1.00',
    },
  };

  const remoteIncomplete = {
    pet_id: localNested.id,
    // missing / null values from backend must not clobber local
    name: undefined,
    species: null,
    breed: undefined,
    sex: undefined,
    weight_kg: undefined,
    version: 2,
    updated_at: '2026-02-01T22:00:00.000Z',
  };

  const normalized = normalizePetFromServer(remoteIncomplete);
  const merged = mergePetLocalWithRemote(localNested, normalized);

  assert.strictEqual(merged.patient.petName, 'ALFA1');
  assert.strictEqual(merged.patient.petSpecies, 'Cane');
  assert.strictEqual(merged.patient.petBreed, 'RAZZA1');
  assert.strictEqual(merged.patient.petSex, 'Maschio');
  assert.strictEqual(merged.patient.petWeightKg, '1.00');

  assert.strictEqual(merged.name, 'ALFA1');
  assert.strictEqual(merged.species, 'Cane');
  assert.strictEqual(merged.breed, 'RAZZA1');
  assert.strictEqual(merged.sex, 'Maschio');
  assert.strictEqual(merged.weight_kg, '1.00');
}

function test_fullRemoteUpdatesBothShapes() {
  const localNested = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'OldName',
    species: 'Cane',
    breed: 'Meticcio',
    sex: 'Maschio',
    weight_kg: '10.00',
    patient: {
      pet_id: '11111111-1111-1111-1111-111111111111',
      petName: 'OldName',
      petSpecies: 'Cane',
      petBreed: 'Meticcio',
      petSex: 'Maschio',
      petWeightKg: '10.00',
    },
  };

  const remoteComplete = {
    pet_id: localNested.id,
    name: 'NewName',
    species: 'Altro',
    breed: 'RazzaX',
    sex: 'Femmina',
    weight_kg: '12.50',
    version: 3,
    updated_at: '2026-02-01T23:00:00.000Z',
  };

  const normalized = normalizePetFromServer(remoteComplete);
  const merged = mergePetLocalWithRemote(localNested, normalized);

  assert.strictEqual(merged.name, 'NewName');
  assert.strictEqual(merged.species, 'Altro');
  assert.strictEqual(merged.breed, 'RazzaX');
  assert.strictEqual(merged.sex, 'Femmina');
  assert.strictEqual(merged.weight_kg, '12.50');

  assert.strictEqual(merged.patient.petName, 'NewName');
  assert.strictEqual(merged.patient.petSpecies, 'Altro');
  assert.strictEqual(merged.patient.petBreed, 'RazzaX');
  assert.strictEqual(merged.patient.petSex, 'Femmina');
  assert.strictEqual(merged.patient.petWeightKg, '12.50');
}

function run() {
  test_normalizeFlatIntoPatient();
  test_nonDestructiveWhenRemoteMissing();
  test_fullRemoteUpdatesBothShapes();
  console.log('OK pets.pull-merge.test.js');
}

run();
