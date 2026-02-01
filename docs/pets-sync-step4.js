// pets-sync-step4.js v3
/**
 * pets-sync-step4.js v3
 * STEP 4 — Push Outbox (pets) to backend /api/sync/pets/push
 *
 * Backend contract (see backend/src/pets.sync.routes.js):
 *   op = { op_id, type: 'pet.upsert'|'pet.delete', pet_id, base_version?, patch?, client_ts? }
 */

function _petToPatch(petLike) {
  // petLike may be: full pet record, or {record}, or {patch}
  const r = petLike && (petLike.record || petLike.patch || petLike);
  const patient = r && r.patient;
  if (!patient) return {};

  const patch = {};

  if (typeof patient.petName === "string") patch.name = patient.petName;
  if (typeof patient.petSpecies === "string") patch.species = patient.petSpecies;
  if (typeof patient.petBreed === "string") patch.breed = patient.petBreed;
  if (typeof patient.petSex === "string") patch.sex = patient.petSex;

  // weight_kg: accept numbers or numeric strings
  const w = patient.petWeight;
  if (typeof w === "number" && Number.isFinite(w)) patch.weight_kg = w;
  if (typeof w === "string") {
    const n = parseFloat(w.replace(",", "."));
    if (!Number.isNaN(n) && Number.isFinite(n)) patch.weight_kg = n;
  }

  // notes: best-effort (diary is a free text)
  if (typeof r.diary === "string" && r.diary.trim()) patch.notes = r.diary.trim();

  // birthdate is not present in your UI record (you have petAge), so we omit it.
  return patch;
}

async function pushOutboxIfOnline() {
  if (!navigator.onLine) return;
  if (typeof getAuthToken !== "function" || !getAuthToken()) return;
  if (typeof openPetsDB !== "function") return;

  const db = await openPetsDB();
  const tx = db.transaction(["outbox"], "readwrite");
  const store = tx.objectStore("outbox");
  const ops = [];

  await new Promise((resolve) => {
    store.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return resolve();
      ops.push({ key: c.primaryKey, value: c.value });
      c.continue();
    };
  });

  if (!ops.length) return;

  const mappedOps = ops
    .map(({ key, value }) => {
      const o = value || {};
      const payload = o.payload || {};
      const pet_id = payload.id;
      if (!pet_id) return null;

      const op_id = `local-${key}`;
      const client_ts = o.created_at || new Date().toISOString();

      if (o.op_type === "delete") {
        return {
          op_id,
          type: "pet.delete",
          pet_id,
          base_version: payload.base_version ?? null,
          client_ts,
        };
      }

      if (o.op_type === "create" || o.op_type === "update") {
        const patch = _petToPatch(payload);
        return {
          op_id,
          type: "pet.upsert",
          pet_id,
          base_version: payload.base_version ?? null,
          patch,
          client_ts,
        };
      }

      return null;
    })
    .filter(Boolean);

  if (!mappedOps.length) return;

  let res;
  try {
    res = await fetchApi("/api/sync/pets/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: localStorage.getItem("ada_device_id") || "debug",
        ops: mappedOps,
      }),
    });
  } catch {
    return;
  }

  if (!res || !res.ok) return;

  let data;
  try {
    data = await res.json();
  } catch {
    return;
  }

  // Backend returns: { accepted: [op_id, ...], rejected: [{op_id,...}, ...] }
  if (Array.isArray(data.accepted)) {
    for (const acc of data.accepted) {
      const opid = typeof acc === "string" ? acc : acc && acc.op_id;
      if (typeof opid === "string" && opid.startsWith("local-")) {
        const n = parseInt(opid.slice("local-".length), 10);
        if (!Number.isNaN(n)) {
          try {
            store.delete(n);
          } catch {}
        }
      }
    }
  }

  if (tx.done) await tx.done;
}

// expose
window.ADA_PetsSync = { pushOutboxIfOnline };
