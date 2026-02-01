// pets-sync-step4.js v6
/**
 * pets-sync-step4.js v6
 * STEP 4 — Push Outbox (pets) to backend /api/sync/pets/push
 *
 * Backend contract (see backend/src/pets.sync.routes.js):
 *   op = { op_id, type: 'pet.upsert'|'pet.delete', pet_id, base_version?, patch?, client_ts? }
 */

let inFlightPush = false;

function _normalizeUuid(id) {
  if (!id || typeof id !== "string") return id;
  if (id.startsWith("tmp_")) {
    const u = id.slice(4);
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(u)) return u;
  }
  return id;
}


function _uuidv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}





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

  if (r.birthdate) patch.birthdate = r.birthdate;
  if (r.patient && r.patient.petBirthdate) patch.birthdate = r.patient.petBirthdate;

  // Weight aliases
  if (!patch.weight_kg && r.patient) patch.weight_kg = r.patient.petWeightKg || r.patient.petWeight;

  return patch;
}

async function pushOutboxIfOnline() {
  if (!navigator.onLine) return;
  if (typeof getAuthToken !== "function" || !getAuthToken()) return;
  if (inFlightPush) return;
  if (typeof openPetsDB !== "function") return;

  inFlightPush = true;
  try {
    const db = await openPetsDB();

    // 1) Read outbox in a short-lived *readonly* transaction (IDB tx becomes inactive across awaits)
    const ops = [];
    await new Promise((resolve) => {
      const txRead = db.transaction(["outbox"], "readonly");
      const storeRead = txRead.objectStore("outbox");
      storeRead.openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        ops.push({ key: c.primaryKey, value: c.value });
        c.continue();
      };
    });

    if (!ops.length) return;

    const opIdToLocalKey = new Map();
    const opIdToLocalOp = new Map();

    const needsUuid = ops.filter(({ value }) => !value || !value.op_uuid);
    if (needsUuid.length) {
      await new Promise((resolve) => {
        const txWrite = db.transaction(["outbox"], "readwrite");
        const storeWrite = txWrite.objectStore("outbox");
        for (const item of needsUuid) {
          const current = item.value || {};
          const op_uuid = current.op_uuid || _uuidv4();
          const updated = { ...current, op_uuid };
          try { storeWrite.put(updated); } catch {}
          item.value = updated;
        }
        txWrite.oncomplete = () => resolve();
        txWrite.onabort = () => resolve();
      });
    }

    const mappedOps = ops
      .map(({ key, value }) => {
        const o = value || {};
        const payload = o.payload || {};
        const pet_id = _normalizeUuid(payload.id);
        if (!pet_id) return null;

        const op_id = o.op_uuid;
        if (!op_id) return null;
        opIdToLocalKey.set(op_id, key);
        opIdToLocalOp.set(op_id, o);
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
    if (Array.isArray(data.accepted) && data.accepted.length) {
      // 2) Delete accepted ops in a fresh *readwrite* transaction
      await new Promise((resolve) => {
        const txWrite = db.transaction(["outbox"], "readwrite");
        const storeWrite = txWrite.objectStore("outbox");

        for (const acc of data.accepted) {
          const opid = typeof acc === "string" ? acc : acc && acc.op_id;
          const localKey = typeof opid === "string" ? opIdToLocalKey.get(opid) : undefined;
          if (localKey !== undefined && localKey !== null) {
            try { storeWrite.delete(localKey); } catch {}
          }
        }

        txWrite.oncomplete = () => resolve();
        txWrite.onabort = () => resolve();
      });

      if (typeof persistIdMapping === "function" && typeof migratePetId === "function") {
        for (const acc of data.accepted) {
          const opid = typeof acc === "string" ? acc : acc && acc.op_id;
          if (!opid) continue;
          const localOp = opIdToLocalOp.get(opid);
          const localPetId = localOp && (localOp.pet_local_id || (localOp.payload && localOp.payload.id));
          if (typeof localPetId === "string" && localPetId.startsWith("tmp_")) {
            const serverId = _normalizeUuid(localOp && localOp.payload && localOp.payload.id);
            if (serverId && serverId !== localPetId) {
              try { await persistIdMapping(localPetId, serverId); } catch {}
              try { await migratePetId(localPetId, serverId); } catch {}
            }
          }
        }
      }
    }
  } finally {
    inFlightPush = false;
  }
}

// expose
window.ADA_PetsSync = { pushOutboxIfOnline };
