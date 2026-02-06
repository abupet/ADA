// pets-sync-step4.js v7
/**
 * pets-sync-step4.js v7
 * STEP 4 — Push Outbox (pets) to backend /api/sync/pets/push
 *
 * Backend contract (see backend/src/pets.sync.routes.js):
 *   op = { op_id, type: 'pet.upsert'|'pet.delete', pet_id, base_version?, patch?, client_ts? }
 */

let inFlightPush = false;

// Retry helper with exponential backoff (max 3 retries: 1s, 2s, 4s)
async function _fetchWithRetry(url, options, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchApi(url, options);
      if (res && res.ok) return res;
      // Non-retryable HTTP errors (4xx)
      if (res && res.status >= 400 && res.status < 500) return res;
      lastError = new Error(`HTTP ${res?.status || 'unknown'}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

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
  if (!r) return {};
  const patient = r.patient;

  const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

  const patch = {};

  if (patient && typeof patient === "object") {
    // Basic patient fields
    if (isNonEmptyString(patient.petName)) patch.name = patient.petName.trim();
    if (isNonEmptyString(patient.petSpecies)) patch.species = patient.petSpecies.trim();
    if (isNonEmptyString(patient.petBreed)) patch.breed = patient.petBreed.trim();
    if (isNonEmptyString(patient.petSex)) patch.sex = patient.petSex.trim();
    if (isNonEmptyString(patient.ownerName)) patch.owner_name = patient.ownerName.trim();
    if (isNonEmptyString(patient.ownerPhone)) patch.owner_phone = patient.ownerPhone.trim();
    if (isNonEmptyString(patient.petMicrochip)) patch.microchip = patient.petMicrochip.trim();

    // birthdate
    const bd = patient.petBirthdate ?? patient.petBirthDate ?? patient.birthdate ?? r.birthdate;
    if (isNonEmptyString(bd)) patch.birthdate = bd.trim();

    // weight_kg
    const wRaw = patient.petWeightKg ?? patient.petWeight;
    if (typeof wRaw === "number" && Number.isFinite(wRaw)) {
      patch.weight_kg = wRaw;
    } else if (typeof wRaw === "string") {
      const s = wRaw.trim();
      if (s) {
        const n = parseFloat(s.replace(",", "."));
        if (!Number.isNaN(n) && Number.isFinite(n)) patch.weight_kg = n;
      }
    }

    // visit_date
    if (isNonEmptyString(patient.visitDate)) patch.visit_date = patient.visitDate.trim();
  }

  // Rich data fields — full pet data sync
  if (typeof r.diary === "string") patch.notes = r.diary;
  if (typeof r.ownerDiary === "string") patch.owner_diary = r.ownerDiary;
  if (r.lifestyle && typeof r.lifestyle === "object") patch.lifestyle = r.lifestyle;
  if (Array.isArray(r.vitalsData)) patch.vitals_data = r.vitalsData;
  if (Array.isArray(r.medications)) patch.medications = r.medications;
  if (Array.isArray(r.historyData)) patch.history_data = r.historyData;
  // Photos: sync full array (base64) + count
  if (Array.isArray(r.photos)) {
    patch.photos = r.photos;
    patch.photos_count = r.photos.length;
  }

  // Timestamp for last-write-wins
  if (r.updatedAt) patch.updated_at = r.updatedAt;

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

    // Use retry with exponential backoff for network resilience
    const res = await _fetchWithRetry("/api/sync/pets/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: localStorage.getItem("ada_device_id") || "debug",
        ops: mappedOps,
      }),
    });

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

// expose (merge, don't overwrite — pullPetsIfOnline is set by app-pets.js)
window.ADA_PetsSync = window.ADA_PetsSync || {};
window.ADA_PetsSync.pushOutboxIfOnline = pushOutboxIfOnline;
