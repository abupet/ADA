
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function pickNonEmptyString(...vals) {
  for (const v of vals) {
    if (isNonEmptyString(v)) return v.trim();
  }
  return undefined;
}

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

  function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function pickNonEmptyString(...vals) {
  for (const v of vals) {
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
  const r0 = petLike && (petLike.record || petLike.patch || petLike);
  const r = r0 ? { ...r0 } : {};
  const patient0 = r.patient && typeof r.patient === "object" ? { ...r.patient } : {};
  const patient = { ...patient0 };

  // Primary identifiers
  const pid = r.pet_id || r.id || petLike?.pet_id || petLike?.id;
  if (pid) {
    r.pet_id = r.pet_id || pid;
    r.id = r.id || pid;
  }

  // Fill patient fields from flat fields whenever patient values are missing/empty
  const petName = pickNonEmptyString(patient.petName, r.name, r.petName);
  if (petName) patient.petName = petName;

  const petSpecies = pickNonEmptyString(patient.petSpecies, r.species, r.petSpecies);
  if (petSpecies) patient.petSpecies = petSpecies;

  const petBreed = pickNonEmptyString(patient.petBreed, r.breed, r.petBreed);
  if (petBreed) patient.petBreed = petBreed;

  const petSex = pickNonEmptyString(patient.petSex, r.sex, r.petSex);
  if (petSex) patient.petSex = petSex;

  // Birthdate: only set if non-empty
  const bd = pickNonEmptyString(patient.petBirthdate, patient.petBirthDate, r.birthdate);
  if (bd) patient.petBirthdate = bd;

  // Weight: accept numeric or numeric string; only set if meaningful
  const wRaw = patient.petWeightKg ?? patient.petWeight ?? r.weight_kg ?? r.weightKg;
  let wNum = null;
  if (typeof wRaw === "number" && Number.isFinite(wRaw)) wNum = wRaw;
  else if (typeof wRaw === "string") {
    const s = wRaw.trim();
    if (s) {
      const n = parseFloat(s.replace(",", "."));
      if (!Number.isNaN(n) && Number.isFinite(n)) wNum = n;
    }
  }
  if (wNum !== null) {
    // Keep both for UI compatibility
    patient.petWeightKg = String(wNum.toFixed(2));
    patient.petWeight = String(wNum);
    r.weight_kg = wNum; // server-friendly
  }

  // Align flat fields from patient (if flat missing/empty)
  if (!isNonEmptyString(r.name) && isNonEmptyString(patient.petName)) r.name = patient.petName.trim();
  if (!isNonEmptyString(r.species) && isNonEmptyString(patient.petSpecies)) r.species = patient.petSpecies.trim();
  if (!isNonEmptyString(r.breed) && isNonEmptyString(patient.petBreed)) r.breed = patient.petBreed.trim();
  if (!isNonEmptyString(r.sex) && isNonEmptyString(patient.petSex)) r.sex = patient.petSex.trim();
  if (!isNonEmptyString(r.birthdate) && isNonEmptyString(patient.petBirthdate)) r.birthdate = patient.petBirthdate.trim();

  r.patient = patient;
  return r;
})();
