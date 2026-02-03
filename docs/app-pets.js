// app-pets.js v6.16.5

// --- Pets Sync: pull response unwrapping (changes[] -> record[] + deletes) ---
function unwrapPetsPullResponse(data) {
    // returns { upserts: PetRecord[], deletes: string[], nextCursor?: string }
    const res = { upserts: [], deletes: [], nextCursor: "" };

    if (!data) return res;

    res.nextCursor = (data.next_cursor || data.cursor || data.last_cursor || "") + "";

    // Array direct: treat as pets
    if (Array.isArray(data)) {
        res.upserts = data;
        return res;
    }

    if (Array.isArray(data.pets)) {
        res.upserts = data.pets;
        return res;
    }
    if (Array.isArray(data.items)) {
        res.upserts = data.items;
        return res;
    }

    if (Array.isArray(data.changes)) {
        const changes = data.changes;
        for (const ch of changes) {
            if (!ch) continue;

            const tRaw = (ch.type == null ? "" : String(ch.type));
            const t = tRaw.trim();

            const rec = (ch.record && typeof ch.record === 'object')
                ? ch.record
                : (ch.patch && typeof ch.patch === 'object')
                    ? ch.patch
                    : null;

            const pid = ch.pet_id || (rec && rec.pet_id) || (rec && rec.id) || ch.id || null;

            // DELETE: explicit type OR missing record/patch with a pet id
            if (t === "pet.delete" || ((t === "" || t === "delete") && !rec && pid)) {
                if (pid) res.deletes.push(pid);
                continue;
            }

            // UPSERT: explicit type OR presence of record/patch
            if (t === "pet.upsert" || t === "pet.create" || t === "pet.update" || rec) {
                if (!rec) continue;
                if (!rec.pet_id && pid) rec.pet_id = pid;
                if (!rec.id) rec.id = rec.pet_id || pid;
                res.upserts.push(rec);
                continue;
            }
        }
        return res;
    }

    return res;
}
// --- /Pets Sync: pull response unwrapping ---

// app-pets.js v6.16.4
// ADA v6.16.2 - Multi-Pet Management System

// ============================================
// DATABASE
// ============================================

const PETS_DB_NAME = 'ADA_Pets';
const PETS_STORE_NAME = 'pets';
const OUTBOX_STORE_NAME = 'outbox';
const META_STORE_NAME = 'meta';
const ID_MAP_STORE_NAME = 'id_map';

// pull throttling / in-flight (used by auto triggers and forced manual sync)
let __petsPullLastAt = 0;
let __petsPullInFlight = false;
const __PETS_PULL_THROTTLE_MS = 30_000;


function generateTmpPetId() {
    let id = '';
    try {
        if (crypto && crypto.randomUUID) id = crypto.randomUUID();
    } catch (e) {}
    if (!id) {
        // Fallback: generate a valid UUID v4 format for server compatibility
        const hex = () => Math.floor(Math.random() * 16).toString(16);
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.floor(Math.random() * 16);
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    return 'tmp_' + id;
}

let petsDB = null;
let currentPetId = null;

function normalizePetId(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const value = String(raw).trim();
    if (!value) return null;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
}

// Return currently selected pet id (from memory or localStorage)
function getCurrentPetId() {
    if (currentPetId !== null && currentPetId !== undefined) return currentPetId;
    const raw = localStorage.getItem('ada_current_pet_id');
    return normalizePetId(raw);
}

async function resolveCurrentPetId() {
    const raw = getCurrentPetId();
    if (typeof raw === 'string') {
        const mapped = await getMappedServerId(raw);
        if (mapped && mapped !== raw) {
            currentPetId = mapped;
            try { localStorage.setItem('ada_current_pet_id', String(mapped)); } catch (e) {}
            return mapped;
        }
    }
    return raw;
}

async function initPetsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PETS_DB_NAME, 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            petsDB = request.result;
            resolve(petsDB);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PETS_STORE_NAME)) {
                db.createObjectStore(PETS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
                db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(META_STORE_NAME)) {
                db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(ID_MAP_STORE_NAME)) {
                db.createObjectStore(ID_MAP_STORE_NAME, { keyPath: 'tmp_id' });
            }
        };
    });
}

// Helper for STEP4 script (pets-sync-step4.js)
async function openPetsDB() {
  if (petsDB) return petsDB;
  return await initPetsDB();
}

function isUuidString(value) {
    return typeof value === 'string'
        && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

async function getMappedServerId(tmpOrId) {
    if (!tmpOrId) return tmpOrId;
    const id = String(tmpOrId);
    if (!id.startsWith('tmp_')) return id;
    if (!petsDB) await initPetsDB();
    const mapped = await new Promise((resolve) => {
        const tx = petsDB.transaction(ID_MAP_STORE_NAME, 'readonly');
        const store = tx.objectStore(ID_MAP_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? req.result.server_id : null);
        req.onerror = () => resolve(null);
    });
    if (mapped) return mapped;
    const candidate = id.slice(4);
    return isUuidString(candidate) ? candidate : id;
}

async function persistIdMapping(tmp_id, server_id) {
    if (!tmp_id || !server_id) return false;
    if (!petsDB) await initPetsDB();
    return new Promise((resolve) => {
        const tx = petsDB.transaction(ID_MAP_STORE_NAME, 'readwrite');
        const store = tx.objectStore(ID_MAP_STORE_NAME);
        try {
            store.put({
                tmp_id,
                server_id,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            resolve(false);
            return;
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
    });
}

async function migratePetId(tmp_id, server_id) {
    if (!tmp_id || !server_id || tmp_id === server_id) return false;
    if (!petsDB) await initPetsDB();
    return new Promise((resolve) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PETS_STORE_NAME);
        let tmpRecord = null;
        let serverRecord = null;
        let pending = 2;

        const finalize = () => {
            pending -= 1;
            if (pending > 0) return;
            if (tmpRecord) {
                if (!serverRecord) {
                    try { store.put({ ...tmpRecord, id: server_id }); } catch (e) {}
                }
                try { store.delete(tmp_id); } catch (e) {}
            } else {
                try { store.delete(tmp_id); } catch (e) {}
            }
        };

        const tmpReq = store.get(tmp_id);
        tmpReq.onsuccess = () => {
            tmpRecord = tmpReq.result || null;
            finalize();
        };
        tmpReq.onerror = () => finalize();

        const serverReq = store.get(server_id);
        serverReq.onsuccess = () => {
            serverRecord = serverReq.result || null;
            finalize();
        };
        serverReq.onerror = () => finalize();

        tx.oncomplete = () => {
            try {
                const current = localStorage.getItem('ada_current_pet_id');
                if (current === String(tmp_id)) {
                    localStorage.setItem('ada_current_pet_id', String(server_id));
                }
            } catch (e) {}
            if (currentPetId === tmp_id) {
                currentPetId = server_id;
            }
            resolve(true);
        };
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
    });
}

async function getAllPets() {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readonly');
        const store = tx.objectStore(PETS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function getPetById(id) {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readonly');
        const store = tx.objectStore(PETS_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        try { tx.oncomplete = () => { backupPetsToLocalStorage(); }; } catch (e) {}
        request.onerror = () => reject(request.error);
    });
}

async function savePetToDB(pet) {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PETS_STORE_NAME);
        let request;
        if (pet.id === null || pet.id === undefined) {
            const petToSave = { ...pet };
            delete petToSave.id;
            request = store.add(petToSave);
        } else {
            request = store.put(pet);
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deletePetFromDB(id) {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PETS_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function deletePetById(rawId) {
    // Used for remote deletes (pull). Must not enqueue outbox.
    if (rawId === null || rawId === undefined) return;
    let id = normalizePetId(rawId);
    if (id === null || id === undefined || id === '') return;

    try {
        if (typeof id === 'string') {
            const mapped = await getMappedServerId(id);
            if (mapped) id = mapped;
        }
    } catch (e) {}

    try { await deletePetFromDB(id); } catch (e) {}

    // If the deleted pet is currently selected, clear selection and fields
    try {
        const cur = await resolveCurrentPetId();
        if (cur != null && String(cur) === String(id)) {
            currentPetId = null;
            try { localStorage.removeItem('ada_current_pet_id'); } catch (e) {}
            try { clearMainPetFields(); } catch (e) {}
        }
    } catch (e) {}

    // Refresh UI if selector exists
    try {
        const selectedId = await resolveCurrentPetId();
        await rebuildPetSelector(selectedId ?? null);
        const selector = document.getElementById('petSelector');
        if (selector && selectedId) selector.value = String(selectedId);
    } catch (e) {}

    try { if (typeof updateSelectedPetHeaders === 'function') await updateSelectedPetHeaders(); } catch (e) {}
}

function hasMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

function filterMeaningfulFields(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const filtered = {};
    for (const [key, value] of Object.entries(obj)) {
        if (hasMeaningfulValue(value)) filtered[key] = value;
    }
    return filtered;
}

function normalizePetFromBackend(record, existing) {
    const safeRecord = record && typeof record === 'object' ? record : {};
    const safeExisting = existing && typeof existing === 'object' ? existing : {};
    const id = safeRecord.pet_id || safeRecord.id || safeExisting.id || null;

    const existingPatient = safeExisting.patient && typeof safeExisting.patient === 'object' ? safeExisting.patient : {};
    const incomingPatient = safeRecord.patient && typeof safeRecord.patient === 'object' ? safeRecord.patient : {};

    const fallbackName = existingPatient.petName || '';
    const fallbackSpecies = existingPatient.petSpecies || '';
    const normalizedName = hasMeaningfulValue(safeRecord.name) ? safeRecord.name : fallbackName;
    const normalizedSpecies = hasMeaningfulValue(safeRecord.species) ? safeRecord.species : fallbackSpecies;

    return {
        ...safeRecord,
        id,
        name: normalizedName,
        species: normalizedSpecies,
        patient: {
            ...existingPatient,
            ...incomingPatient,
            petName: hasMeaningfulValue(normalizedName) ? normalizedName : '',
            petSpecies: hasMeaningfulValue(normalizedSpecies) ? normalizedSpecies : ''
        }
    };
}

function mergePetsForPull(existing, incoming) {
    const safeExisting = existing && typeof existing === 'object' ? existing : {};
    const safeIncoming = incoming && typeof incoming === 'object' ? incoming : {};
    const merged = {
        ...safeExisting,
        ...filterMeaningfulFields(safeIncoming)
    };

    const existingPatient = safeExisting.patient && typeof safeExisting.patient === 'object' ? safeExisting.patient : {};
    const incomingPatient = filterMeaningfulFields(safeIncoming.patient || {});
    const mergedPatient = { ...existingPatient, ...incomingPatient };
    const normalizedName = safeIncoming.patient && safeIncoming.patient.petName !== undefined
        ? safeIncoming.patient.petName
        : existingPatient.petName;
    const normalizedSpecies = safeIncoming.patient && safeIncoming.patient.petSpecies !== undefined
        ? safeIncoming.patient.petSpecies
        : existingPatient.petSpecies;
    mergedPatient.petName = hasMeaningfulValue(normalizedName) ? normalizedName : (existingPatient.petName || '');
    mergedPatient.petSpecies = hasMeaningfulValue(normalizedSpecies) ? normalizedSpecies : (existingPatient.petSpecies || '');
    if (mergedPatient.petName === undefined) mergedPatient.petName = '';
    if (mergedPatient.petSpecies === undefined) mergedPatient.petSpecies = '';
    merged.patient = mergedPatient;
    return merged;
}

// ============================================
// META / OUTBOX (offline-first scaffolding)
// ============================================

async function metaGet(key) {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(META_STORE_NAME, 'readonly');
        const store = tx.objectStore(META_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
    });
}

async function metaSet(key, value) {
    if (!petsDB) await initPetsDB();
    return new Promise((resolve, reject) => {
        const tx = petsDB.transaction(META_STORE_NAME, 'readwrite');
        const store = tx.objectStore(META_STORE_NAME);
        const req = store.put({ key, value });
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

async function getOrCreateDeviceId() {
    // Stored in meta; fallback to localStorage for robustness
    const META_KEY = 'device_id';
    let existing = null;
    try { existing = await metaGet(META_KEY); } catch (e) {}
    if (existing) return existing;
    try {
        const ls = localStorage.getItem('ada_device_id');
        if (ls) {
            try { await metaSet(META_KEY, ls); } catch (e) {}
            return ls;
        }
    } catch (e) {}

    let id = '';
    try {
        if (crypto && crypto.randomUUID) id = crypto.randomUUID();
    } catch (e) {}
    if (!id) id = 'dev_' + Math.random().toString(16).slice(2) + '_' + Date.now();
    try { await metaSet(META_KEY, id); } catch (e) {}
    try { localStorage.setItem('ada_device_id', id); } catch (e) {}
    return id;
}

async function getLastPetsCursor() {
    try { return (await metaGet('pets_last_cursor')) || ''; } catch (e) { return ''; }
}

async function setLastPetsCursor(cursor) {
    try { await metaSet('pets_last_cursor', cursor || ''); } catch (e) {}
}

// NOTE: Outbox is not used in Step 1–2 yet, but store exists for Step 3.
async function enqueueOutbox(op_type, payload) {
    // STEP 3: Outbox write with coalescing (no network). Silent failures (no console.error).
    if (!petsDB) await initPetsDB();

    const petId = payload && payload.id;
    let opUuid = '';
    try {
        if (crypto && crypto.randomUUID) opUuid = crypto.randomUUID();
    } catch (e) {}
    if (!opUuid) opUuid = 'op_' + Math.random().toString(16).slice(2) + '_' + Date.now();

    return new Promise((resolve) => {
        const tx = petsDB.transaction(OUTBOX_STORE_NAME, 'readwrite');
        const store = tx.objectStore(OUTBOX_STORE_NAME);

        const existing = [];

        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) {
                // Apply coalescing rules
                try {
                    for (const item of existing) {
                        const prev = item.value.op_type;

                        if (prev === 'create' && op_type === 'update') {
                            // create + update => keep create, merge payload
                            store.put({
                                ...item.value,
                                payload: { ...item.value.payload, ...payload },
                                op_uuid: item.value.op_uuid || opUuid,
                                pet_local_id: item.value.pet_local_id || petId
                            });
                            return;
                        }
                        if (prev === 'update' && op_type === 'update') {
                            // update + update => keep last update
                            store.put({
                                ...item.value,
                                payload,
                                op_uuid: item.value.op_uuid || opUuid,
                                pet_local_id: item.value.pet_local_id || petId
                            });
                            return;
                        }
                        if (prev === 'create' && op_type === 'delete') {
                            // create + delete => remove both
                            store.delete(item.key);
                            return;
                        }
                        if (prev === 'update' && op_type === 'delete') {
                            // update + delete => keep delete
                            store.put({
                                ...item.value,
                                op_type: 'delete',
                                payload,
                                op_uuid: item.value.op_uuid || opUuid,
                                pet_local_id: item.value.pet_local_id || petId
                            });
                            return;
                        }
                    }

                    // Default: add new outbox record
                    store.add({
                        op_type,
                        payload,
                        created_at: new Date().toISOString(),
                        op_uuid: opUuid,
                        pet_local_id: petId
                    });
                } catch (e2) {
                    // silent
                }
                return;
            }

            try {
                const v = cursor.value;
                if (v && v.payload && v.payload.id === petId) {
                    existing.push({ key: cursor.primaryKey, value: v });
                }
            } catch (e3) {
                // silent
            }
            cursor.continue();
        };
        cursorReq.onerror = () => {
            // fallback: try to add without coalescing
            try {
                store.add({
                    op_type,
                    payload,
                    created_at: new Date().toISOString(),
                    op_uuid: opUuid,
                    pet_local_id: petId
                });
            } catch (e) {}
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
    });
}

// ============================================
// STEP 2 — PULL (safe, non-blocking)
// ============================================

async function applyRemotePets(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    // Upsert into pets store; support soft-delete
    if (!petsDB) await initPetsDB();
    const normalizedItems = [];
    for (const item of items) {
        if (!item) continue;
        let entry = item;
        let id = item.id;
        let isDelete = item.deleted === true || item.is_deleted === true;

        if (item.type === 'pet.delete' || item.type === 'pet.upsert') {
            id = item.pet_id;
            if (item.type === 'pet.delete') {
                isDelete = true;
            } else {
                entry = item.record && typeof item.record === 'object'
                    ? { ...item.record, id: item.pet_id ?? item.record.id }
                    : { id: item.pet_id };
            }
        } else if ((id === undefined || id === null) && item.pet_id != null) {
            id = item.pet_id;
            if (item.record && typeof item.record === 'object') {
                entry = { ...item.record, id };
            }
        }

        if (id === undefined || id === null) continue;
        normalizedItems.push({ id, entry, isDelete });
    }

    if (normalizedItems.length === 0) return;

    try {
        const localPets = await getAllPets();
        const tmpIds = new Set(
            localPets
                .map(pet => pet && pet.id)
                .filter(id => typeof id === 'string' && id.startsWith('tmp_'))
        );
        for (const item of normalizedItems) {
            const id = item.id;
            if (typeof id === 'string' && isUuidString(id)) {
                const tmpId = `tmp_${id}`;
                if (tmpIds.has(tmpId)) {
                    await persistIdMapping(tmpId, id);
                    await migratePetId(tmpId, id);
                }
            }
        }
    } catch (e) {}

    const mergedItems = [];
    for (const item of normalizedItems) {
        if (item.isDelete) {
            mergedItems.push(item);
            continue;
        }
        const existing = await getPetById(item.id);
        const incoming = normalizePetFromBackend(item.entry, existing);
        const merged = mergePetsForPull(existing, incoming);
        mergedItems.push({ ...item, entry: merged });
    }

    await new Promise((resolve, reject) => {
        const tx = petsDB.transaction(PETS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PETS_STORE_NAME);
        for (const item of mergedItems) {
            if (item.isDelete) {
                store.delete(item.id);
            } else {
                store.put({ ...item.entry, id: item.id });
            }
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('applyRemotePets failed'));
    });
}

async function pullPetsIfOnline(options) {
    const force = !!(options && options.force);

    // Early exit checks (before setting in-flight flag)
    if (__petsPullInFlight) return;
    const now = Date.now();
    if (!force && now - __petsPullLastAt < __PETS_PULL_THROTTLE_MS) return;

    // Check auth before setting flag (prevents smoke-test flakiness)
    try {
        if (typeof getAuthToken === 'function') {
            const t = getAuthToken();
            if (!t) return;
        }
    } catch (e) { return; }

    if (!navigator.onLine) return;
    if (typeof fetchApi !== 'function') return;

    // Set flag and use try/finally to guarantee reset
    __petsPullLastAt = now;
    __petsPullInFlight = true;

    try {
        const device_id = await getOrCreateDeviceId();
        const cursor = await getLastPetsCursor();

        // Be tolerant to backend response shapes
        const qs = new URLSearchParams();
        if (cursor) qs.set('since', cursor);
        qs.set('device_id', device_id);

        const qsString = qs.toString();
        const primaryUrl = qsString ? `/api/sync/pets/pull?${qsString}` : '/api/sync/pets/pull';
        const fallbackUrl = qsString ? `/api/pets?${qsString}` : '/api/pets';

        let resp = null;
        try {
            resp = await fetchApi(primaryUrl, { method: 'GET' });
        } catch (e) {
            resp = null;
        }
        if (!resp || !resp.ok) {
            try {
                resp = await fetchApi(fallbackUrl, { method: 'GET' });
            } catch (e) {
                return; // silent
            }
            if (!resp || !resp.ok) return;
        }

        let data = null;
        try { data = await resp.json(); } catch (e) { return; }

        const items =
            Array.isArray(data) ? data :
            Array.isArray(data?.pets) ? data.pets :
            Array.isArray(data?.items) ? data.items :
            Array.isArray(data?.changes) ? data.changes :
            [];

        const pulled = unwrapPetsPullResponse(data);
        if (pulled.deletes && pulled.deletes.length) { for (const delId of pulled.deletes) { try { await deletePetById(delId); } catch(e) {} } }

        // Only update cursor after successful apply to avoid data loss on partial failure
        try {
            await applyRemotePets(pulled.upserts);
            const nextCursor = data?.next_cursor || data?.cursor || data?.last_cursor || '';
            if (nextCursor) await setLastPetsCursor(nextCursor);
        } catch (applyError) {
            console.warn('pullPetsIfOnline: applyRemotePets failed, cursor not updated', applyError);
        }

        // Keep UI selection stable after remote merge/migration (prevents "Seleziona Pet" from blanking)
        try {
            const selectedId = await resolveCurrentPetId();
            const selector = document.getElementById('petSelector');
            if (selector) {
                await rebuildPetSelector(selectedId ?? null);
                if (selectedId) selector.value = String(selectedId);
            }
            if (typeof updateSelectedPetHeaders === 'function') {
                await updateSelectedPetHeaders();
            }
        } catch (e) {}
    } finally {
        __petsPullInFlight = false;
    }
}

async function refreshPetsFromServer() {
    try { await pullPetsIfOnline({ force: true }); } catch (e) {}
    const selectedId = await resolveCurrentPetId();
    try { await rebuildPetSelector(selectedId); } catch (e) {}
    try { await updateSelectedPetHeaders(); } catch (e) {}
}

// ============================================
// PET DATA STRUCTURE
// ============================================

function createEmptyPet() {
    return {
        id: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        patient: { petName: '', petSpecies: '', petBreed: '', petAge: '', petSex: '', petWeight: '', petMicrochip: '', ownerName: '', ownerPhone: '', visitDate: '' },
        lifestyle: { lifestyle: '', household: '', activityLevel: '', dietType: '', dietPreferences: '', knownConditions: '', currentMeds: '', behaviorNotes: '', seasonContext: '', location: '' },
        photos: [],
        vitalsData: [],
        historyData: [],
        medications: [],
        appointments: [],
        diary: ''
    };
}


// ============================================
// BACKUP / RESTORE (LocalStorage fallback)
// ============================================

const PETS_BACKUP_KEY = 'ada_pets_backup_v1';

async function backupPetsToLocalStorage() {
    try {
        const pets = await getAllPets();
        localStorage.setItem(PETS_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), pets }));
    } catch (e) {
        // non-fatal
    }
}

async function restorePetsFromLocalStorageIfNeeded() {
    try {
        const existing = await getAllPets();
        if (Array.isArray(existing) && existing.length) return false;

        const raw = localStorage.getItem(PETS_BACKUP_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        const pets = Array.isArray(parsed?.pets) ? parsed.pets : [];
        if (!pets.length) return false;

        for (const p of pets) {
            try { await savePetToDB(p); } catch (e) {}
        }
        return true;
    } catch (e) {
        return false;
    }
}

// ============================================
// DROPDOWN MANAGEMENT
// ============================================


function getPetDisplayLabel(p) {
  if (!p) return "Seleziona un pet";
  const pid = p.pet_id || p.id || "";
  const name = (p.patient && p.patient.petName && p.patient.petName.trim()) || (p.name && p.name.trim()) || "";
  const species = (p.patient && p.patient.petSpecies && p.patient.petSpecies.trim()) || (p.species && (""+p.species).trim()) || "";
  if (name && species) return `${name} (${species})`;
  if (name) return name;
  if (species) return species;
  if (pid) return `Pet ${pid} (N/D)`;
  return "Seleziona un pet";
}

async function rebuildPetSelector(selectId = null) {
    const selector = document.getElementById('petSelector');
    if (!selector) return;
    
    const pets = await getAllPets();

    // Sort alphabetically by display label (case-insensitive, Italian locale)
    pets.sort((a, b) => getPetDisplayLabel(a).localeCompare(getPetDisplayLabel(b), 'it', { sensitivity: 'base' }));

    let html = '<option value="">-- Seleziona Pet --</option>';
    pets.forEach(pet => {
        const label = getPetDisplayLabel(pet);
        html += `<option value="${pet.id}">${label}</option>`;
    });
    selector.innerHTML = html;
    
    // Preserve current selection unless explicitly cleared
    let desired = selectId;
    if (desired === null || desired === undefined) {
        try { desired = await resolveCurrentPetId(); } catch (e) { desired = null; }
    }
    if (desired !== null && desired !== undefined) {
        selector.value = String(desired);
        // If the desired value is not present in options, keep placeholder
        if (selector.value !== String(desired)) selector.value = '';
    }
    
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const saveBtn = document.getElementById('btnSavePet');
    const selector = document.getElementById('petSelector');
    if (!saveBtn || !selector) return;
    saveBtn.disabled = (selector.value === '');
}

// ============================================
// PAGE: DATI PET - SELECTOR CHANGE
// ============================================

async function onPetSelectorChange(selectElement) {
    const value = selectElement.value;
    
    // FIRST: Save current pet data before switching
    if (currentPetId !== null && currentPetId !== undefined) {
        await saveCurrentPetDataSilent();
    }
    
    if (value === '') {
        // Nothing selected - clear fields
        currentPetId = null;
        localStorage.removeItem('ada_current_pet_id');
        clearMainPetFields();
    } else {
        // Pet selected - load it
        const petId = normalizePetId(value);
        const pet = await getPetById(petId);
        if (pet) {
            currentPetId = petId;
            localStorage.setItem('ada_current_pet_id', String(petId));
            loadPetIntoMainFields(pet);
        }
    }

    // Update header pet indicator across pages
    if (typeof updateSelectedPetHeaders === 'function') {
        await updateSelectedPetHeaders();
    }

    updateSaveButtonState();
}

// Save current pet data without showing toast (used when switching pets)
async function saveCurrentPetDataSilent() {
    if (!currentPetId) return;
    
    const pet = await getPetById(currentPetId);
    if (pet) {
        pet.updatedAt = new Date().toISOString();
        pet.patient = getPatientData();
        pet.lifestyle = getLifestyleData();
        pet.photos = photos;
        pet.vitalsData = vitalsData;
        pet.historyData = historyData;
        pet.medications = medications;
        pet.appointments = appointments;
        pet.diary = document.getElementById('diaryText')?.value || '';
        await savePetToDB(pet);
    }
}

// ============================================
// PAGE: DATI PET - SAVE CURRENT PET
// ============================================

async function saveCurrentPet() {
    const selector = document.getElementById('petSelector');
    if (!selector || selector.value === '') {
        alert('⚠️ Errore: Nessun pet selezionato.\n\nSeleziona un pet dalla lista prima di salvare.');
        return;
    }
    
    // Validate required fields
    const petName = document.getElementById('petName')?.value?.trim() || '';
    const petSpecies = document.getElementById('petSpecies')?.value || '';
    
    if (!petName) {
        alert('⚠️ Errore: Il Nome del pet è obbligatorio!');
        document.getElementById('petName')?.focus();
        return;
    }
    if (!petSpecies) {
        alert('⚠️ Errore: La Specie del pet è obbligatoria!');
        document.getElementById('petSpecies')?.focus();
        return;
    }
    
    const petId = normalizePetId(selector.value);
    const pet = await getPetById(petId);
    
    if (pet) {
        pet.updatedAt = new Date().toISOString();
        pet.patient = getPatientData();
        pet.lifestyle = getLifestyleData();
        pet.photos = photos;
        pet.vitalsData = vitalsData;
        pet.historyData = historyData;
        pet.medications = medications;
        pet.appointments = appointments;
        pet.diary = document.getElementById('diaryText')?.value || '';
        
        await savePetToDB(pet);
    await enqueueOutbox('update', { id: normalizePetId(selector.value), patch: pet, base_version: pet.version ?? null });
    await rebuildPetSelector(petId);
        
        showToast('✅ Dati salvati!', 'success');
    }
}

// ============================================
// PAGE: DATI PET - DELETE CURRENT PET
// ============================================

async function deleteCurrentPet() {
    const selector = document.getElementById('petSelector');
    if (!selector || selector.value === '') {
        alert('⚠️ Errore: Nessun pet selezionato da eliminare.');
        return;
    }
    
    const petId = normalizePetId(selector.value);
    const pet = await getPetById(petId);
    const petName = pet?.patient?.petName || 'questo pet';
    
    if (!confirm(`Eliminare "${petName}" e tutti i suoi dati?\n\nQuesta azione è irreversibile.`)) {
        return;
    }
    
    const petVersion = pet?.version ?? null;
    await deletePetFromDB(petId);
    await enqueueOutbox('delete', { id: petId, base_version: petVersion });
        currentPetId = null;
    localStorage.removeItem('ada_current_pet_id');
    clearMainPetFields();
    await rebuildPetSelector('');
    
    showToast('✅ Pet eliminato', 'success');
}

// ============================================
// PAGE: AGGIUNGI PET - OPEN/CLOSE
// ============================================

function openAddPetPage() {
    clearNewPetFields();
    navigateToPage('addpet');
}

function cancelAddPet() {
    clearNewPetFields();
    navigateToPage('patient');
}

function toggleNewPetLifestyleSection() {
    const section = document.getElementById('newPetLifestyleSection');
    if (section) section.classList.toggle('open');
}

// ============================================
// PAGE: AGGIUNGI PET - SAVE NEW PET
// ============================================

async function saveNewPet() {
    // Validate required fields
    const petName = document.getElementById('newPetName')?.value?.trim() || '';
    const petSpecies = document.getElementById('newPetSpecies')?.value || '';
    
    if (!petName) {
        alert('⚠️ Errore: Il Nome del pet è obbligatorio!');
        document.getElementById('newPetName')?.focus();
        return;
    }
    if (!petSpecies) {
        alert('⚠️ Errore: La Specie del pet è obbligatoria!');
        document.getElementById('newPetSpecies')?.focus();
        return;
    }
    
    // Create new pet
    const newPet = createEmptyPet();
    // Offline-first create: assign temporary id
    newPet.id = generateTmpPetId();
    newPet.updatedAt = new Date().toISOString();
    newPet.base_version = null;
    newPet.patient = getNewPetPatientData();
    newPet.lifestyle = getNewPetLifestyleData();
    
    const newId = await savePetToDB(newPet);
    await enqueueOutbox('create', { id: newId, record: newPet });
    // Clear the add pet form
    clearNewPetFields();
    
    // Go to Dati Pet page
    navigateToPage('patient');
    
    // Rebuild selector with new pet selected
    await rebuildPetSelector(newId);
    
    // Load the new pet into main fields
    currentPetId = newId;
    localStorage.setItem('ada_current_pet_id', String(newId));
    const savedPet = await getPetById(newId);
    loadPetIntoMainFields(savedPet);
    
    try { if (typeof updateSelectedPetHeaders === 'function') await updateSelectedPetHeaders(); } catch(e) {}

    showToast('✅ Nuovo pet aggiunto!', 'success');
}

// ============================================
// FIELD HELPERS - MAIN PET PAGE
// ============================================

function clearMainPetFields() {
    setPatientData({});
    setLifestyleData({});
    photos = [];
    vitalsData = [];
    historyData = [];
    medications = [];
    appointments = [];
    tipsData = [];
    const diaryEl = document.getElementById('diaryText');
    if (diaryEl) diaryEl.value = '';
    renderPhotos();
    renderHistory();
    try { if (typeof initVitalsChart === 'function' && !vitalsChart) initVitalsChart(); } catch (e) {}
    try { if (typeof updateVitalsChart === 'function') updateVitalsChart(); } catch (e) {}
    renderMedications();
    renderAppointments();
    renderTips();
    updateHistoryBadge();
    // Clear vitals chart
    const chartContainer = document.getElementById('vitalsChart');
    if (chartContainer) chartContainer.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Nessun dato disponibile</p>';
}

function loadPetIntoMainFields(pet) {
  const _p = (pet && pet.patient) ? pet.patient : {};
  const _pick = (a, b) => (typeof a === 'string' && a.trim()) ? a : (typeof b === 'string' && b.trim()) ? b : (b ?? '');
    setPatientData(pet.patient || {});
    setLifestyleData(pet.lifestyle || {});
    photos = pet.photos || [];
    vitalsData = pet.vitalsData || [];
    historyData = pet.historyData || [];

    // Ensure Archivio schema is normalized (id-based)
    try { if (typeof _historySchemaMigrated !== 'undefined') _historySchemaMigrated = false; } catch (e) {}
    try { if (typeof migrateLegacyHistoryDataIfNeeded === 'function') migrateLegacyHistoryDataIfNeeded(); } catch (e) {}
    medications = pet.medications || [];
    appointments = pet.appointments || [];
    // v6.16.4: Tips sono persistiti per pet (lista mostrata)
    try { if (typeof restoreTipsDataForCurrentPet === 'function') restoreTipsDataForCurrentPet(); } catch(e) {}
    try { if (typeof updateTipsMeta === 'function') updateTipsMeta(); } catch(e) {}
    const diaryEl = document.getElementById('diaryText');
    if (diaryEl) diaryEl.value = pet.diary || '';
    renderPhotos();
    renderHistory();
    renderMedications();
    renderAppointments();
    renderTips();
    updateHistoryBadge();
    // Ensure vitals UI always reflects the selected pet (including when empty)
    if (typeof updateVitalsChart === 'function') {
        updateVitalsChart();
    }
}

// ============================================
// FIELD HELPERS - ADD PET PAGE
// ============================================

function clearNewPetFields() {
    const fields = ['newPetName', 'newPetSpecies', 'newPetBreed', 'newPetAge', 'newPetSex', 'newPetWeight', 'newPetMicrochip', 'newOwnerName', 'newOwnerPhone', 'newVisitDate',
                    'newPetLifestyle', 'newPetActivityLevel', 'newPetDietType', 'newPetDietPreferences', 'newPetKnownConditions', 'newPetCurrentMeds', 'newPetBehaviorNotes', 'newPetSeasonContext', 'newPetLocation'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const householdSelect = document.getElementById('newPetHousehold');
    if (householdSelect) {
        Array.from(householdSelect.options).forEach(opt => opt.selected = false);
    }
    const section = document.getElementById('newPetLifestyleSection');
    if (section) section.classList.remove('open');
}

function getNewPetPatientData() {
    return {
        petName: document.getElementById('newPetName')?.value || '',
        petSpecies: document.getElementById('newPetSpecies')?.value || '',
        petBreed: document.getElementById('newPetBreed')?.value || '',
        petAge: document.getElementById('newPetAge')?.value || '',
        petSex: document.getElementById('newPetSex')?.value || '',
        petWeight: document.getElementById('newPetWeight')?.value || '',
        petMicrochip: document.getElementById('newPetMicrochip')?.value || '',
        ownerName: document.getElementById('newOwnerName')?.value || '',
        ownerPhone: document.getElementById('newOwnerPhone')?.value || '',
        visitDate: document.getElementById('newVisitDate')?.value || ''
    };
}

function getNewPetLifestyleData() {
    const householdSelect = document.getElementById('newPetHousehold');
    const selectedHousehold = householdSelect ? Array.from(householdSelect.selectedOptions).map(opt => opt.value).join(', ') : '';
    
    return {
        lifestyle: document.getElementById('newPetLifestyle')?.value || '',
        household: selectedHousehold,
        activityLevel: document.getElementById('newPetActivityLevel')?.value || '',
        dietType: document.getElementById('newPetDietType')?.value || '',
        dietPreferences: document.getElementById('newPetDietPreferences')?.value || '',
        knownConditions: document.getElementById('newPetKnownConditions')?.value || '',
        currentMeds: document.getElementById('newPetCurrentMeds')?.value || '',
        behaviorNotes: document.getElementById('newPetBehaviorNotes')?.value || '',
        seasonContext: document.getElementById('newPetSeasonContext')?.value || '',
        location: document.getElementById('newPetLocation')?.value || ''
    };
}

// ============================================
// OVERRIDES FOR DATA SAVING
// ============================================

async function saveData() {
    localStorage.setItem('ada_photos', JSON.stringify(photos));
    localStorage.setItem('ada_vitals', JSON.stringify(vitalsData));
    localStorage.setItem('ada_history', JSON.stringify(historyData));
    localStorage.setItem('ada_medications', JSON.stringify(medications));
    localStorage.setItem('ada_appointments', JSON.stringify(appointments));
    
    if (currentPetId) {
        const pet = await getPetById(currentPetId);
        if (pet) {
            pet.updatedAt = new Date().toISOString();
            pet.photos = photos;
            pet.vitalsData = vitalsData;
            pet.historyData = historyData;
            pet.medications = medications;
            pet.appointments = appointments;
            pet.diary = document.getElementById('diaryText')?.value || '';
            await savePetToDB(pet);
        }
    }
}

async function saveDiary() {
    const diaryText = document.getElementById('diaryText')?.value || '';
    localStorage.setItem('ada_diary', diaryText);
    
    if (currentPetId) {
        const pet = await getPetById(currentPetId);
        if (pet) {
            pet.diary = diaryText;
            pet.updatedAt = new Date().toISOString();
            await savePetToDB(pet);
            showToast('✅ Profilo sanitario salvato', 'success');
        }
    } else {
        alert('⚠️ Errore: Seleziona un pet prima di salvare il profilo sanitario.');
    }
}

// Keep savePatient for compatibility but redirect to saveCurrentPet
async function savePatient() {
    await saveCurrentPet();
}

// ============================================
// INITIALIZATION
// ============================================

async function initMultiPetSystem() {
    await initPetsDB();
    // Restore from LocalStorage backup if IndexedDB is empty (robustness on some browsers)
    try { await restorePetsFromLocalStorageIfNeeded(); } catch (e) {}
    
    // Migration from old system
    const pets = await getAllPets();
    if (pets.length === 0) {
        const existingPatient = localStorage.getItem('ada_patient');
        if (existingPatient) {
            const parsed = JSON.parse(existingPatient);
            if (parsed.petName) {
                const migratePet = createEmptyPet();
                migratePet.patient = parsed;
                migratePet.lifestyle = JSON.parse(localStorage.getItem('ada_lifestyle') || '{}');
                migratePet.photos = JSON.parse(localStorage.getItem('ada_photos') || '[]');
                migratePet.vitalsData = JSON.parse(localStorage.getItem('ada_vitals') || '[]');
                migratePet.historyData = JSON.parse(localStorage.getItem('ada_history') || '[]');
                migratePet.medications = JSON.parse(localStorage.getItem('ada_medications') || '[]');
                migratePet.appointments = JSON.parse(localStorage.getItem('ada_appointments') || '[]');
                migratePet.diary = localStorage.getItem('ada_diary') || '';
                const newId = await savePetToDB(migratePet);
                currentPetId = newId;
                localStorage.setItem('ada_current_pet_id', String(newId));
            }
        }
    }
    
    await rebuildPetSelector();
    
    // Step 2: non-blocking pull (updates local DB when online)
    try { pullPetsIfOnline({ force: true }); } catch (e) {}
    // Restore last selected pet
    const lastPetId = localStorage.getItem('ada_current_pet_id');
    if (lastPetId) {
        const normalizedLastPetId = normalizePetId(lastPetId);
        let resolvedLastPetId = normalizedLastPetId;
        if (typeof normalizedLastPetId === 'string') {
            resolvedLastPetId = await getMappedServerId(normalizedLastPetId);
            if (resolvedLastPetId && resolvedLastPetId !== normalizedLastPetId) {
                try { localStorage.setItem('ada_current_pet_id', String(resolvedLastPetId)); } catch (e) {}
            }
        }
        const pet = await getPetById(resolvedLastPetId);
        if (pet) {
            currentPetId = resolvedLastPetId;
            loadPetIntoMainFields(pet);
            await updateSelectedPetHeaders();
            const selector = document.getElementById('petSelector');
            if (selector) selector.value = String(resolvedLastPetId);
        }
    }

    await updateSelectedPetHeaders();

    updateSaveButtonState();
}


// ============================================
// SELECTED PET HEADER
// ============================================

async function updateSelectedPetHeaders() {
    const els = document.querySelectorAll('[data-selected-pet-header]');
    if (!els || els.length === 0) return;

    let pet = null;
    const petId = await resolveCurrentPetId();
    if (petId) {
        try {
            pet = await getPetById(petId);
        } catch (e) {
            pet = null;
        }
    }

    els.forEach(el => {
        if (!pet || !pet.patient) {
            el.textContent = '🐾 Seleziona un pet';
            el.classList.remove('selected-pet-header--visible');
            return;
        }

        const name = (pet.patient.petName || 'Paziente').toString().trim();
        const species = (pet.patient.petSpecies || '').toString().trim();
        const parts = [name];
        if (species) parts.push(species);
        el.textContent = '🐾 ' + parts.join(' • ');
        el.classList.add('selected-pet-header--visible');
    });
}
// Expose pets sync helpers (used by bootstrap). Keep silent.
try {
    window.ADA_PetsSync = window.ADA_PetsSync || {};
    if (typeof window.ADA_PetsSync.pullPetsIfOnline !== 'function') {
        window.ADA_PetsSync.pullPetsIfOnline = pullPetsIfOnline;
    }
    if (typeof window.ADA_PetsSync.refreshPetsFromServer !== 'function') {
        window.ADA_PetsSync.refreshPetsFromServer = refreshPetsFromServer;
    }
} catch (e) {
    // silent
}
