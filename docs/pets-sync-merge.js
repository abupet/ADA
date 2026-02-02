/* pets-sync-merge.js v3
 * Shared helpers for Pets Sync:
 * - normalizePetFromServer: converts flat server payload to UI-friendly shape (patient.*)
 * - mergePetLocalWithRemote: non-destructive merge (treats undefined/null/"" as missing)
 */
(function () {
  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }
  function pickNonEmptyString() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (isNonEmptyString(v)) return v.trim();
    }
    return undefined;
  }
  function isMeaningfulValue(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  }

  function normalizePetFromServer(petLike) {
    // Accept: change wrapper, record, patch, or pet object
    var r0 = petLike && (petLike.record || petLike.patch || petLike);
    var r = r0 ? Object.assign({}, r0) : {};
    var patient0 = (r.patient && typeof r.patient === "object") ? Object.assign({}, r.patient) : {};
    var patient = Object.assign({}, patient0);

    // Primary identifiers
    var pid = r.pet_id || r.id || (petLike && (petLike.pet_id || petLike.id));
    if (pid) {
      r.pet_id = r.pet_id || pid;
      r.id = r.id || pid;
    }

    // Fill patient from flat only when missing/empty
    var petName = pickNonEmptyString(patient.petName, r.name, r.petName);
    if (petName) patient.petName = petName;

    var petSpecies = pickNonEmptyString(patient.petSpecies, r.species, r.petSpecies);
    if (petSpecies) patient.petSpecies = petSpecies;

    var petBreed = pickNonEmptyString(patient.petBreed, r.breed, r.petBreed);
    if (petBreed) patient.petBreed = petBreed;

    var petSex = pickNonEmptyString(patient.petSex, r.sex, r.petSex);
    if (petSex) patient.petSex = petSex;

    // Birthdate
    var bd = pickNonEmptyString(patient.petBirthdate, patient.petBirthDate, r.birthdate);
    if (bd) patient.petBirthdate = bd;

    // Weight (accept number or numeric string)
    var wRaw = (patient.petWeightKg !== undefined ? patient.petWeightKg : undefined);
    if (wRaw === undefined) wRaw = (patient.petWeight !== undefined ? patient.petWeight : undefined);
    if (wRaw === undefined) wRaw = (r.weight_kg !== undefined ? r.weight_kg : undefined);
    var wNum = null;

    if (typeof wRaw === "number" && isFinite(wRaw)) wNum = wRaw;
    else if (typeof wRaw === "string") {
      var s = wRaw.trim();
      if (s) {
        var n = parseFloat(s.replace(",", "."));
        if (!isNaN(n) && isFinite(n)) wNum = n;
      }
    }
    if (wNum !== null) {
      patient.petWeightKg = String(wNum.toFixed(2));
      patient.petWeight = String(wNum);
      r.weight_kg = wNum;
    }

    // Align flat from patient (only if flat missing/empty)
    if (!isNonEmptyString(r.name) && isNonEmptyString(patient.petName)) r.name = patient.petName.trim();
    if (!isNonEmptyString(r.species) && isNonEmptyString(patient.petSpecies)) r.species = patient.petSpecies.trim();
    if (!isNonEmptyString(r.breed) && isNonEmptyString(patient.petBreed)) r.breed = patient.petBreed.trim();
    if (!isNonEmptyString(r.sex) && isNonEmptyString(patient.petSex)) r.sex = patient.petSex.trim();
    if (!isNonEmptyString(r.birthdate) && isNonEmptyString(patient.petBirthdate)) r.birthdate = patient.petBirthdate.trim();

    r.patient = patient;
    return r;
  }

  function mergePetLocalWithRemote(localLike, remoteLike) {
    var local = localLike ? Object.assign({}, localLike) : {};
    var remote = remoteLike ? Object.assign({}, remoteLike) : {};

    var localPatient = (local.patient && typeof local.patient === "object") ? Object.assign({}, local.patient) : {};
    var remotePatient = (remote.patient && typeof remote.patient === "object") ? Object.assign({}, remote.patient) : {};

    function assignIfMeaningful(dst, key, val) {
      if (isMeaningfulValue(val)) dst[key] = val;
    }

    // Top-level
    assignIfMeaningful(local, "name", remote.name);
    assignIfMeaningful(local, "species", remote.species);
    assignIfMeaningful(local, "breed", remote.breed);
    assignIfMeaningful(local, "sex", remote.sex);
    assignIfMeaningful(local, "birthdate", remote.birthdate);
    if (remote.weight_kg !== undefined && remote.weight_kg !== null && remote.weight_kg !== "") {
      local.weight_kg = remote.weight_kg;
    }

    // Patient
    assignIfMeaningful(localPatient, "petName", remotePatient.petName);
    assignIfMeaningful(localPatient, "petSpecies", remotePatient.petSpecies);
    assignIfMeaningful(localPatient, "petBreed", remotePatient.petBreed);
    assignIfMeaningful(localPatient, "petSex", remotePatient.petSex);
    assignIfMeaningful(localPatient, "petBirthdate", remotePatient.petBirthdate);
    assignIfMeaningful(localPatient, "petWeightKg", remotePatient.petWeightKg);
    assignIfMeaningful(localPatient, "petWeight", remotePatient.petWeight);

    // Reconcile missing patient from top-level
    if (!isMeaningfulValue(localPatient.petName) && isMeaningfulValue(local.name)) localPatient.petName = String(local.name).trim();
    if (!isMeaningfulValue(localPatient.petSpecies) && isMeaningfulValue(local.species)) localPatient.petSpecies = String(local.species).trim();
    if (!isMeaningfulValue(localPatient.petBreed) && isMeaningfulValue(local.breed)) localPatient.petBreed = String(local.breed).trim();
    if (!isMeaningfulValue(localPatient.petSex) && isMeaningfulValue(local.sex)) localPatient.petSex = String(local.sex).trim();
    if (!isMeaningfulValue(localPatient.petBirthdate) && isMeaningfulValue(local.birthdate)) localPatient.petBirthdate = String(local.birthdate).trim();

    // And opposite: keep top-level non-empty if patient has data
    if (!isMeaningfulValue(local.name) && isMeaningfulValue(localPatient.petName)) local.name = String(localPatient.petName).trim();
    if (!isMeaningfulValue(local.species) && isMeaningfulValue(localPatient.petSpecies)) local.species = String(localPatient.petSpecies).trim();

    local.patient = localPatient;
    return local;
  }

  window.PetsSyncMerge = {
    normalizePetFromServer: normalizePetFromServer,
    mergePetLocalWithRemote: mergePetLocalWithRemote,
    isNonEmptyString: isNonEmptyString,
    isMeaningfulValue: isMeaningfulValue
  };
})();
