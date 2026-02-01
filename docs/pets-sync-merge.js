/* pets-sync-merge.js v1
   Normalizzazione record pet dal pull + merge non distruttivo.
   Espone window.PetsSyncMerge.{ normalizePetFromServer, mergePetLocalWithRemote, computeAgeFromBirthdate }
*/
(function () {
  function isDefined(v) { return v !== undefined && v !== null; }

  function computeAgeFromBirthdate(birthdateIso) {
    if (!birthdateIso) return "";
    const d = new Date(birthdateIso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    const days = now.getDate() - d.getDate();
    if (days < 0) months -= 1;
    if (months < 0) { years -= 1; months += 12; }
    if (years < 0) return "";
    if (years === 0 && months === 0) return "meno di 1 mese";
    if (years === 0) return months === 1 ? "1 mese" : `${months} mesi`;
    if (months === 0) return years === 1 ? "1 anno" : `${years} anni`;
    const y = years === 1 ? "1 anno" : `${years} anni`;
    const m = months === 1 ? "1 mese" : `${months} mesi`;
    return `${y} ${m}`;
  }

  function normalizePetFromServer(remote) {
    if (!remote || typeof remote !== "object") return remote;
    const r = { ...remote };
    const pid = r.pet_id || r.id;
    const patient = { ...(r.patient || {}) };

    // Map flat -> nested (do not overwrite nested with undefined/null)
    if (isDefined(r.name) && !isDefined(patient.petName)) patient.petName = r.name;
    if (isDefined(r.species) && !isDefined(patient.petSpecies)) patient.petSpecies = r.species;
    if (isDefined(r.breed) && !isDefined(patient.petBreed)) patient.petBreed = r.breed;
    if (isDefined(r.sex) && !isDefined(patient.petSex)) patient.petSex = r.sex;

    // Weight: keep BOTH aliases aligned
    const flatW = r.weight_kg;
    const nestedWkg = patient.petWeightKg;
    const nestedW = patient.petWeight;
    const w = isDefined(flatW) ? flatW : (isDefined(nestedWkg) ? nestedWkg : nestedW);
    if (isDefined(w)) {
      patient.petWeightKg = w;
      patient.petWeight = w;
      r.weight_kg = w;
    }

    // Birthdate (source of truth). Allow both flat birthdate or nested petBirthdate.
    const bd = isDefined(r.birthdate) ? r.birthdate : patient.petBirthdate;
    if (isDefined(bd)) {
      r.birthdate = bd;
      patient.petBirthdate = bd;
      // Optional derived field for prompts/UI compatibility
      if (!isDefined(patient.petAge)) patient.petAge = computeAgeFromBirthdate(bd);
    }

    if (pid && !isDefined(patient.pet_id)) patient.pet_id = pid;

    r.patient = patient;

    // Align name <-> patient.petName bidirectionally
    if (!isDefined(r.name) && isDefined(patient.petName)) r.name = patient.petName;
    if (!isDefined(patient.petName) && isDefined(r.name)) r.patient.petName = r.name;

    // Ensure id alias
    if (!isDefined(r.id) && isDefined(pid)) r.id = pid;

    return r;
  }

  function mergePetLocalWithRemote(local, remoteNorm) {
    if (!local) return remoteNorm;
    if (!remoteNorm) return local;

    const merged = { ...local };

    // Merge top-level fields non-destructively: prefer remote only if defined
    const fields = ["name", "species", "breed", "sex", "weight_kg", "birthdate", "version", "updated_at", "created_at", "owner_user_id", "notes"];
    for (const f of fields) {
      const rv = remoteNorm[f];
      if (isDefined(rv)) merged[f] = rv;
    }

    // patient nested merge
    merged.patient = { ...(local.patient || {}) };
    const rp = (remoteNorm.patient || {});
    const pFields = ["petName", "petSpecies", "petBreed", "petSex", "petWeight", "petWeightKg", "petMicrochip", "petBirthdate", "petAge", "ownerName", "ownerPhone", "visitDate", "pet_id"];
    for (const f of pFields) {
      const rv = rp[f];
      if (isDefined(rv)) merged.patient[f] = rv;
    }

    // Align name
    if (isDefined(merged.patient.petName)) merged.name = merged.patient.petName;
    else if (isDefined(merged.name)) merged.patient.petName = merged.name;

    // Align weight aliases
    const w = isDefined(merged.weight_kg) ? merged.weight_kg : (isDefined(merged.patient.petWeightKg) ? merged.patient.petWeightKg : merged.patient.petWeight);
    if (isDefined(w)) {
      merged.weight_kg = w;
      merged.patient.petWeightKg = w;
      merged.patient.petWeight = w;
    }

    // Align birthdate & derived age
    const bd = isDefined(merged.birthdate) ? merged.birthdate : merged.patient.petBirthdate;
    if (isDefined(bd)) {
      merged.birthdate = bd;
      merged.patient.petBirthdate = bd;
      merged.patient.petAge = computeAgeFromBirthdate(bd); // keep derived age fresh
    }

    // Id aliases
    merged.id = merged.id || merged.pet_id || remoteNorm.id || remoteNorm.pet_id;
    merged.pet_id = merged.pet_id || merged.id;

    return merged;
  }

  window.PetsSyncMerge = { normalizePetFromServer, mergePetLocalWithRemote, computeAgeFromBirthdate };
})();
