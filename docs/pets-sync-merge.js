// pets-sync-merge.js v1
// Shared (browser + node) utilities for Pets Sync pull normalization + non-destructive merge.
// - Browser: exposes window.PetsSyncMerge
// - Node:    module.exports = { normalizePetFromServer, mergePetLocalWithRemote }

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PetsSyncMerge = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function isDefined(v) {
    return v !== undefined && v !== null;
  }

  function ensureObj(o) {
    return o && typeof o === 'object' ? o : {};
  }

  function normalizePetFromServer(remoteRecord) {
    const r = ensureObj(remoteRecord);
    const id = r.id || r.pet_id;

    const patient = ensureObj(r.patient);

    const flatName = r.name;
    const flatSpecies = r.species;
    const flatBreed = r.breed;
    const flatSex = r.sex;
    const flatWeightKg = r.weight_kg;

    const nestedName = patient.petName;
    const nestedSpecies = patient.petSpecies;
    const nestedBreed = patient.petBreed;
    const nestedSex = patient.petSex;
    const nestedWeightKg = patient.petWeightKg;

    const normalizedPatient = {
      ...patient,
      pet_id: patient.pet_id || r.pet_id || r.id || id,
      petName: isDefined(nestedName) ? nestedName : (isDefined(flatName) ? flatName : ''),
      petSpecies: isDefined(nestedSpecies) ? nestedSpecies : (isDefined(flatSpecies) ? flatSpecies : ''),
      petBreed: isDefined(nestedBreed) ? nestedBreed : (isDefined(flatBreed) ? flatBreed : ''),
      petSex: isDefined(nestedSex) ? nestedSex : (isDefined(flatSex) ? flatSex : ''),
      petWeightKg: isDefined(nestedWeightKg) ? nestedWeightKg : (isDefined(flatWeightKg) ? flatWeightKg : ''),
    };

    const normalized = {
      ...r,
      id,
      patient: normalizedPatient,
    };

    // Align top-level <-> patient.*
    if (!isDefined(normalized.name) && isDefined(normalizedPatient.petName)) {
      normalized.name = normalizedPatient.petName;
    } else if (isDefined(normalized.name) && (!isDefined(normalizedPatient.petName) || normalizedPatient.petName === '')) {
      normalized.patient.petName = normalized.name;
    }

    if (!isDefined(normalized.species) && isDefined(normalizedPatient.petSpecies)) normalized.species = normalizedPatient.petSpecies;
    if (!isDefined(normalized.breed) && isDefined(normalizedPatient.petBreed)) normalized.breed = normalizedPatient.petBreed;
    if (!isDefined(normalized.sex) && isDefined(normalizedPatient.petSex)) normalized.sex = normalizedPatient.petSex;
    if (!isDefined(normalized.weight_kg) && isDefined(normalizedPatient.petWeightKg)) normalized.weight_kg = normalizedPatient.petWeightKg;

    return normalized;
  }

  function assignIfDefined(target, key, value) {
    if (isDefined(value)) target[key] = value;
  }

  function mergePatientNonDestructive(localPatient, remotePatient) {
    const l = ensureObj(localPatient);
    const r = ensureObj(remotePatient);
    const out = { ...l };

    assignIfDefined(out, 'pet_id', r.pet_id);
    assignIfDefined(out, 'ownerName', r.ownerName);
    assignIfDefined(out, 'ownerPhone', r.ownerPhone);
    assignIfDefined(out, 'petAge', r.petAge);
    assignIfDefined(out, 'petMicrochip', r.petMicrochip);
    assignIfDefined(out, 'visitDate', r.visitDate);

    assignIfDefined(out, 'petName', r.petName);
    assignIfDefined(out, 'petSpecies', r.petSpecies);
    assignIfDefined(out, 'petBreed', r.petBreed);
    assignIfDefined(out, 'petSex', r.petSex);
    assignIfDefined(out, 'petWeightKg', r.petWeightKg);
    assignIfDefined(out, 'petWeight', r.petWeight);

    return out;
  }

  function mergePetLocalWithRemote(localPet, remotePetNormalized) {
    const local = ensureObj(localPet);
    const remote = ensureObj(remotePetNormalized);
    const out = { ...local };

    if (!isDefined(out.id) && isDefined(remote.id)) out.id = remote.id;
    if (!isDefined(out.id) && isDefined(remote.pet_id)) out.id = remote.pet_id;

    assignIfDefined(out, 'name', remote.name);
    assignIfDefined(out, 'species', remote.species);
    assignIfDefined(out, 'breed', remote.breed);
    assignIfDefined(out, 'sex', remote.sex);
    assignIfDefined(out, 'weight_kg', remote.weight_kg);

    assignIfDefined(out, 'version', remote.version);
    assignIfDefined(out, 'base_version', remote.base_version);
    assignIfDefined(out, 'updated_at', remote.updated_at);
    assignIfDefined(out, 'created_at', remote.created_at);
    assignIfDefined(out, 'updatedAt', remote.updatedAt);
    assignIfDefined(out, 'createdAt', remote.createdAt);

    out.patient = mergePatientNonDestructive(local.patient, remote.patient);

    // Final alignment name <-> patient.petName
    if (isDefined(out.patient?.petName) && out.patient.petName !== '' && (!isDefined(out.name) || out.name === '')) {
      out.name = out.patient.petName;
    } else if (isDefined(out.name) && out.name !== '' && (!isDefined(out.patient?.petName) || out.patient.petName === '')) {
      out.patient.petName = out.name;
    } else if (isDefined(out.name) && isDefined(out.patient?.petName) && out.name !== out.patient.petName) {
      out.patient.petName = out.name;
    }

    return out;
  }

  return {
    normalizePetFromServer,
    mergePetLocalWithRemote,
  };
});
