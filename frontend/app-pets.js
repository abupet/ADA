// app-pets.js v7.0.0 — Online-only mode (no IndexedDB, no sync)

// ============================================
// STATE (in-memory, NO IndexedDB)
// ============================================

let petsCache = [];         // Array of pets loaded from server
let currentPetId = null;    // UUID of currently selected pet

// ============================================
// API HELPERS
// ============================================

// Fetch all pets from server and populate cache
async function fetchPetsFromServer() {
    try {
        if (!navigator.onLine) {
            if (typeof showToast === 'function') showToast('Sei offline: impossibile caricare i dati', 'error');
            return;
        }
        var resp = await fetchApi('/api/pets', { method: 'GET' });
        if (!resp || !resp.ok) {
            if (typeof showToast === 'function') showToast('Errore caricamento pets', 'error');
            return;
        }
        var data = await resp.json();
        var serverPets = Array.isArray(data.pets) ? data.pets : Array.isArray(data) ? data : [];
        petsCache = serverPets.map(function(p) { return _normalizePetForUI(p); });
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore di rete', 'error');
    }
}

// ============================================
// NORMALIZATION / CACHE HELPERS
// ============================================

// Normalize a pet from server format (SQL columns + extra_data JSONB) to UI format
function _normalizePetForUI(serverPet) {
    if (!serverPet) return serverPet;
    var p = Object.assign({}, serverPet);
    p.id = p.pet_id || p.id;

    // Parse extra_data JSONB (may be object or string)
    var extra = {};
    if (typeof p.extra_data === 'string') {
        try { extra = JSON.parse(p.extra_data || '{}'); } catch (_) { extra = {}; }
    } else {
        extra = p.extra_data || {};
    }

    // Build patient object from SQL columns + extra_data
    p.patient = {
        petName: p.name || '',
        petSpecies: p.species || '',
        petBreed: p.breed || '',
        petSex: p.sex || '',
        petBirthdate: p.birthdate ? String(p.birthdate).slice(0, 10) : '',
        petWeightKg: p.weight_kg ? String(p.weight_kg) : '',
        petMicrochip: extra.microchip || '',
        ownerName: extra.owner_name || '',
        ownerPhone: extra.owner_phone || '',
        visitDate: extra.visit_date || ''
    };

    p.lifestyle = extra.lifestyle || {};
    p.vitalsData = extra.vitals_data || [];
    p.medications = extra.medications || [];
    p.historyData = extra.history_data || [];
    p.photos = extra.photos || [];
    p.diary = p.notes || '';
    p.ownerDiary = extra.owner_diary || '';
    p.updatedAt = extra.updated_at || p.updated_at;

    return p;
}

// Update a pet in the in-memory cache
function _updatePetInCache(serverPet) {
    var normalized = _normalizePetForUI(serverPet);
    var idx = petsCache.findIndex(function(p) { return p.id === normalized.id || p.pet_id === normalized.pet_id; });
    if (idx >= 0) {
        petsCache[idx] = normalized;
    } else {
        petsCache.push(normalized);
    }
    return normalized;
}

// Remove a pet from the cache
function _removePetFromCache(petId) {
    petsCache = petsCache.filter(function(p) { return p.id !== petId && p.pet_id !== petId; });
}

// ============================================
// CACHE ACCESS (async for backward compat with callers that use await)
// ============================================

async function getAllPets() {
    return petsCache;
}

async function getPetById(id) {
    return petsCache.find(function(p) { return p.id === id || p.pet_id === id; }) || null;
}

// Return currently selected pet id (from memory or localStorage)
function getCurrentPetId() {
    if (currentPetId !== null && currentPetId !== undefined) return currentPetId;
    var raw = localStorage.getItem('ada_current_pet_id');
    return raw || null;
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
// DROPDOWN MANAGEMENT
// ============================================


function getPetDisplayLabel(p) {
  if (!p) return "Seleziona un pet";
  var pid = p.pet_id || p.id || "";
  var name = (p.patient && p.patient.petName && p.patient.petName.trim()) || (p.name && p.name.trim()) || "";
  var species = (p.patient && p.patient.petSpecies && p.patient.petSpecies.trim()) || (p.species && (""+p.species).trim()) || "";
  if (name && species) return `${name} (${species})`;
  if (name) return name;
  if (species) return species;
  if (pid) return `Pet ${pid} (N/D)`;
  return "Seleziona un pet";
}

async function rebuildPetSelector(selectId) {
    if (selectId === undefined) selectId = null;
    var selector = document.getElementById('petSelector');
    if (!selector) return;

    var pets = await getAllPets();

    // Sort alphabetically by display label (case-insensitive, Italian locale)
    pets.sort(function(a, b) { return getPetDisplayLabel(a).localeCompare(getPetDisplayLabel(b), 'it', { sensitivity: 'base' }); });

    var html = '<option value="">-- Seleziona Pet --</option>';
    pets.forEach(function(pet) {
        var id = pet.id || pet.pet_id;
        var label = getPetDisplayLabel(pet);
        html += `<option value="${id}">${label}</option>`;
    });
    selector.innerHTML = html;

    // Preserve current selection unless explicitly cleared
    var desired = selectId;
    if (desired === null || desired === undefined) {
        desired = getCurrentPetId();
    }
    if (desired !== null && desired !== undefined) {
        selector.value = String(desired);
        // If the desired value is not present in options, keep placeholder
        if (selector.value !== String(desired)) selector.value = '';
    }

    updateSaveButtonState();
}

function updateSaveButtonState() {
    var editBtn = document.getElementById('btnEditPet');
    var deleteBtn = document.getElementById('btnDeletePet');
    var selector = document.getElementById('petSelector');
    var fieldsCard = document.getElementById('petFieldsCard');
    if (!selector) return;
    var noPet = (selector.value === '');
    if (editBtn) editBtn.disabled = noPet;
    if (deleteBtn) deleteBtn.disabled = noPet;
    if (fieldsCard) fieldsCard.style.display = noPet ? 'none' : '';

    // Make pet fields read-only (must use Edit button to modify)
    _setPetFieldsReadOnly(!noPet);
}

function _setPetFieldsReadOnly(readonly) {
    var inputIds = ['petName', 'petBreed', 'petBirthdate', 'petMicrochip', 'ownerPhone', 'visitDate'];
    var selectIds = ['petSpecies', 'petSex', 'petLifestyle', 'petActivityLevel', 'petDietType'];
    var textInputIds = ['petDietPreferences', 'petKnownConditions', 'petCurrentMeds', 'petBehaviorNotes', 'petLocation'];

    inputIds.concat(textInputIds).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.readOnly = readonly;
    });
    selectIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = readonly;
    });
    var hh = document.getElementById('petHousehold');
    if (hh) hh.disabled = readonly;
}

// ============================================
// HIDE OWNER/VET DROPDOWNS FOR OWNER ROLE
// ============================================

function _applyOwnerVetDropdownRules() {
    var _jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';

    // Dati Pet page: ALWAYS read-only for everyone
    ['ownerName', 'ownerReferringVet'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = true;
    });

    if (_jwtRole === 'owner') {
        // Owner: cannot change assignment anywhere
        ['newOwnerName', 'newOwnerReferringVet',
         'editOwnerName', 'editOwnerReferringVet'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.disabled = true;
        });
    }

    if (_jwtRole === 'vet_ext') {
        // vet_ext: read-only everywhere, hide add/edit/delete buttons
        ['ownerName', 'ownerReferringVet',
         'editOwnerName', 'editOwnerReferringVet'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        var addBtn = document.getElementById('addPetBtn');
        var editBtn = document.getElementById('btnEditPet');
        var deleteBtn = document.getElementById('btnDeletePet');
        if (addBtn) addBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
}

// ============================================
// OWNER / VET_EXT DROPDOWN LOADERS (§6)
// ============================================

async function _loadOwnerAndVetDropdowns(ownerSelectId, vetSelectId, currentOwnerId, currentVetId) {
    // Load owners
    try {
        var resp = await fetchApi('/api/communication/owners', { method: 'GET' });
        if (resp && resp.ok) {
            var data = await resp.json();
            var ownerSel = document.getElementById(ownerSelectId);
            if (ownerSel) {
                var html = '<option value="">-- Seleziona proprietario --</option>';
                (data.users || []).forEach(function(u) {
                    var selected = (u.user_id === currentOwnerId) ? ' selected' : '';
                    var label = typeof formatUserNameWithRole === 'function' ? formatUserNameWithRole(u.display_name || u.email, u.base_role || u.role) : (u.display_name || u.email);
                    html += '<option value="' + u.user_id + '"' + selected + '>' + label + '</option>';
                });
                ownerSel.innerHTML = html;
                if (typeof makeFilterableSelect === 'function') makeFilterableSelect(ownerSelectId);
            }
        }
    } catch (e) { console.error('Load owners error', e); }
    // Load vet_ext
    try {
        var resp2 = await fetchApi('/api/communication/vet-exts', { method: 'GET' });
        if (resp2 && resp2.ok) {
            var data2 = await resp2.json();
            var vetSel = document.getElementById(vetSelectId);
            if (vetSel) {
                var html2 = '<option value="">— Nessuno —</option>';
                (data2.users || []).forEach(function(u) {
                    var selected = (u.user_id === currentVetId) ? ' selected' : '';
                    var label = typeof formatUserNameWithRole === 'function' ? formatUserNameWithRole(u.display_name || u.email, u.base_role || u.role) : (u.display_name || u.email);
                    html2 += '<option value="' + u.user_id + '"' + selected + '>' + label + '</option>';
                });
                vetSel.innerHTML = html2;
                if (typeof makeFilterableSelect === 'function') makeFilterableSelect(vetSelectId);
            }
        }
    } catch (e) { console.error('Load vet_exts error', e); }
}

// ============================================
// PAGE: DATI PET - SELECTOR CHANGE
// ============================================

async function onPetSelectorChange(selectElement) {
    var value = selectElement.value;

    if (value === '') {
        currentPetId = null;
        localStorage.removeItem('ada_current_pet_id');
        clearMainPetFields();
    } else {
        var pet = await getPetById(value);
        if (pet) {
            currentPetId = value;
            localStorage.setItem('ada_current_pet_id', value);
            loadPetIntoMainFields(pet);
            // Load owner/vet dropdowns with current pet's values
            _loadOwnerAndVetDropdowns('ownerName', 'ownerReferringVet', pet.owner_user_id, pet.referring_vet_user_id);
        }
    }

    // v7.1.0: Clear recording and report fields when switching pets
    try {
        if (typeof resetRecordingAndReport === 'function') resetRecordingAndReport({ silent: true });
    } catch (e) {}

    // Update header pet indicator across pages
    if (typeof updateSelectedPetHeaders === 'function') {
        await updateSelectedPetHeaders();
    }

    updateSaveButtonState();
}

// ============================================
// PAGE: DATI PET - SAVE CURRENT PET
// ============================================

async function saveCurrentPet() {
    // vet_ext cannot modify pets
    var _jr = typeof getJwtRole === 'function' ? getJwtRole() : '';
    if (_jr === 'vet_ext') {
        if (typeof showToast === 'function') showToast('Il veterinario esterno non può modificare pet', 'error');
        return;
    }
    var selector = document.getElementById('petSelector');
    if (!selector || selector.value === '') {
        alert('⚠️ Errore: Nessun pet selezionato.\n\nSeleziona un pet dalla lista prima di salvare.');
        return;
    }

    // Validate required fields
    var petName = document.getElementById('petName')?.value?.trim() || '';
    var petSpecies = document.getElementById('petSpecies')?.value || '';

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

    var petId = selector.value;
    var patient = getPatientData();
    var lifestyle = getLifestyleData();
    var isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;
    var diaryVal = document.getElementById('diaryText')?.value || '';

    // Read owner/vet dropdowns (§6)
    var ownerUserId = (document.getElementById('ownerName') || {}).value || null;
    var referringVetUserId = (document.getElementById('ownerReferringVet') || {}).value || null;
    // Owner role: force null so backend uses JWT sub
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';
    if (jwtRole === 'owner') { ownerUserId = null; }
    // DO NOT force referringVetUserId to null for owners

    var patch = {
        name: patient.petName,
        species: patient.petSpecies,
        breed: patient.petBreed || null,
        sex: patient.petSex || null,
        birthdate: patient.petBirthdate || null,
        weight_kg: patient.petWeightKg ? parseFloat(String(patient.petWeightKg).replace(',', '.')) : null,
        owner_name: patient.ownerName || null,
        owner_phone: patient.ownerPhone || null,
        microchip: patient.petMicrochip || null,
        visit_date: patient.visitDate || null,
        lifestyle: lifestyle,
        vitals_data: vitalsData,
        medications: medications,
        history_data: historyData,
        photos: photos,
        photos_count: photos.length,
        updated_at: new Date().toISOString(),
        owner_user_id: ownerUserId,
        referring_vet_user_id: referringVetUserId
    };
    if (isVet) { patch.notes = diaryVal; } else { patch.owner_diary = diaryVal; }

    try {
        var resp = await fetchApi('/api/pets/' + encodeURIComponent(petId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch: patch })
        });
        if (!resp || !resp.ok) {
            var err = {};
            try { err = await resp.json(); } catch (_) {}
            showToast('Errore salvataggio: ' + (err.error || resp?.status), 'error');
            return;
        }
        var updated = await resp.json();
        _updatePetInCache(updated);
        await rebuildPetSelector(petId);
        showToast('✅ Dati salvati!', 'success');
    } catch (e) {
        showToast('Errore di rete: impossibile salvare', 'error');
    }
}

// ============================================
// PAGE: DATI PET - DELETE CURRENT PET
// ============================================

async function deleteCurrentPet() {
    var selector = document.getElementById('petSelector');
    if (!selector || selector.value === '') {
        alert('⚠️ Errore: Nessun pet selezionato da eliminare.');
        return;
    }

    var petId = selector.value;
    var pet = await getPetById(petId);
    var petName = (pet && pet.patient && pet.patient.petName) ? pet.patient.petName : (pet && pet.name) ? pet.name : 'questo pet';

    if (!confirm(`Eliminare "${petName}" e tutti i suoi dati?\n\nQuesta azione è irreversibile.`)) {
        return;
    }

    try {
        var resp = await fetchApi('/api/pets/' + encodeURIComponent(petId), { method: 'DELETE' });
        if (!resp || (resp.status !== 204 && !resp.ok)) {
            showToast('Errore eliminazione pet', 'error');
            return;
        }
        _removePetFromCache(petId);
        currentPetId = null;
        localStorage.removeItem('ada_current_pet_id');
        clearMainPetFields();
        await rebuildPetSelector('');
        showToast('Pet eliminato', 'success');
    } catch (e) {
        showToast('Errore di rete: impossibile eliminare', 'error');
    }
}

// ============================================
// PAGE: AGGIUNGI PET - OPEN/CLOSE
// ============================================

function openAddPetPage() {
    clearNewPetFields();
    navigateToPage('addpet');
    _loadOwnerAndVetDropdowns('newOwnerName', 'newOwnerReferringVet', null, null);
    _applyOwnerVetDropdownRules();
}

function cancelAddPet() {
    clearNewPetFields();
    navigateToPage('patient');
}

function toggleNewPetLifestyleSection() {
    var section = document.getElementById('newPetLifestyleSection');
    if (section) section.classList.toggle('open');
}

// ============================================
// PAGE: AGGIUNGI PET - SAVE NEW PET
// ============================================

async function saveNewPet() {
    // vet_ext cannot create pets
    var _jr = typeof getJwtRole === 'function' ? getJwtRole() : '';
    if (_jr === 'vet_ext') {
        if (typeof showToast === 'function') showToast('Il veterinario esterno non può creare pet', 'error');
        return;
    }
    // Validate required fields
    var petName = document.getElementById('newPetName')?.value?.trim() || '';
    var petSpecies = document.getElementById('newPetSpecies')?.value || '';

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

    var patient = getNewPetPatientData();
    var lifestyle = getNewPetLifestyleData();

    // Read owner/vet dropdowns (§6)
    var ownerUserId = (document.getElementById('newOwnerName') || {}).value || null;
    var referringVetUserId = (document.getElementById('newOwnerReferringVet') || {}).value || null;
    // Owner role: force null so backend uses JWT sub
    var jwtRole = typeof getJwtRole === 'function' ? getJwtRole() : '';
    if (jwtRole === 'owner') { ownerUserId = null; }
    // DO NOT force referringVetUserId to null for owners

    var body = {
        name: patient.petName,
        species: patient.petSpecies,
        breed: patient.petBreed || null,
        sex: patient.petSex || null,
        birthdate: patient.petBirthdate || null,
        owner_name: patient.ownerName || null,
        owner_phone: patient.ownerPhone || null,
        microchip: patient.petMicrochip || null,
        visit_date: patient.visitDate || null,
        lifestyle: lifestyle,
        updated_at: new Date().toISOString(),
        owner_user_id: ownerUserId,
        referring_vet_user_id: referringVetUserId
    };

    try {
        var resp = await fetchApi('/api/pets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!resp || !resp.ok) {
            var err = {};
            try { err = await resp.json(); } catch (_) {}
            showToast('Errore creazione pet: ' + (err.error || resp?.status), 'error');
            return;
        }
        var newPet = await resp.json();
        var newId = newPet.pet_id;

        // Normalize and add to cache
        var normalized = _normalizePetForUI(newPet);
        petsCache.push(normalized);

        clearNewPetFields();
        navigateToPage('patient');
        await rebuildPetSelector(newId);
        currentPetId = newId;
        localStorage.setItem('ada_current_pet_id', newId);
        loadPetIntoMainFields(normalized);
        await updateSelectedPetHeaders();
        showToast('✅ Nuovo pet aggiunto!', 'success');
    } catch (e) {
        showToast('Errore di rete: impossibile creare pet', 'error');
    }
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
    var diaryEl = document.getElementById('diaryText');
    if (diaryEl) diaryEl.value = '';
    renderPhotos();
    renderHistory();
    try { if (typeof initVitalsChart === 'function' && !vitalsChart) initVitalsChart(); } catch (e) {}
    try { if (typeof updateVitalsChart === 'function') updateVitalsChart(); } catch (e) {}
    renderMedications();
    renderTips();
    updateHistoryBadge();
    // Clear vitals chart
    var chartContainer = document.getElementById('vitalsChart');
    if (chartContainer) chartContainer.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Nessun dato disponibile</p>';
}

function loadPetIntoMainFields(pet) {
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
    // v6.16.4: Tips are persisted per pet
    try { if (typeof restoreTipsDataForCurrentPet === 'function') restoreTipsDataForCurrentPet(); } catch(e) {}
    try { if (typeof updateTipsMeta === 'function') updateTipsMeta(); } catch(e) {}
    // v7.1.0: Load diary based on current role (vet vs owner)
    var diaryEl = document.getElementById('diaryText');
    if (diaryEl) {
        var isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;
        diaryEl.value = isVet ? (pet.diary || '') : (pet.ownerDiary || '');
    }
    renderPhotos();
    renderHistory();
    renderMedications();
    renderTips();
    updateHistoryBadge();
    // Ensure vitals UI always reflects the selected pet (including when empty)
    if (typeof updateVitalsChart === 'function') {
        updateVitalsChart();
    }
    // Load owner/vet dropdowns with current pet's values
    _loadOwnerAndVetDropdowns('ownerName', 'ownerReferringVet', pet.owner_user_id, pet.referring_vet_user_id);
    // Proprietario e Vet Esterno always read-only in Dati Pet
    var _ownerSel = document.getElementById('ownerName');
    var _vetSel = document.getElementById('ownerReferringVet');
    if (_ownerSel) _ownerSel.disabled = true;
    if (_vetSel) _vetSel.disabled = true;
    // Apply owner/vet_ext dropdown rules
    _applyOwnerVetDropdownRules();
}

// ============================================
// FIELD HELPERS - ADD PET PAGE
// ============================================

function clearNewPetFields() {
    var fields = ['newPetName', 'newPetSpecies', 'newPetBreed', 'newPetAge', 'newPetSex', 'newPetWeight', 'newPetMicrochip', 'newOwnerName', 'newOwnerReferringVet', 'newOwnerPhone', 'newVisitDate',
                    'newPetLifestyle', 'newPetActivityLevel', 'newPetDietType', 'newPetDietPreferences', 'newPetKnownConditions', 'newPetCurrentMeds', 'newPetBehaviorNotes', 'newPetSeasonContext', 'newPetLocation'];
    fields.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var householdSelect = document.getElementById('newPetHousehold');
    if (householdSelect) {
        Array.from(householdSelect.options).forEach(function(opt) { opt.selected = false; });
    }
    var section = document.getElementById('newPetLifestyleSection');
    if (section) section.classList.remove('open');
}

function getNewPetPatientData() {
    return {
        petName: document.getElementById('newPetName')?.value || '',
        petSpecies: document.getElementById('newPetSpecies')?.value || '',
        petBreed: document.getElementById('newPetBreed')?.value || '',
        petBirthdate: document.getElementById('newPetAge')?.value || '',
        petSex: document.getElementById('newPetSex')?.value || '',
        petMicrochip: document.getElementById('newPetMicrochip')?.value || '',
        ownerName: document.getElementById('newOwnerName')?.value || '',
        ownerPhone: document.getElementById('newOwnerPhone')?.value || '',
        visitDate: document.getElementById('newVisitDate')?.value || ''
    };
}

function getNewPetLifestyleData() {
    var householdSelect = document.getElementById('newPetHousehold');
    var selectedHousehold = householdSelect ? Array.from(householdSelect.selectedOptions).map(function(opt) { return opt.value; }).join(', ') : '';

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
    if (!currentPetId) return;

    var isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;
    var diaryVal = document.getElementById('diaryText')?.value || '';

    var patch = {
        vitals_data: vitalsData,
        history_data: historyData,
        medications: medications,
        photos: photos,
        photos_count: photos.length,
        updated_at: new Date().toISOString()
    };
    if (isVet) { patch.notes = diaryVal; } else { patch.owner_diary = diaryVal; }

    try {
        var resp = await fetchApi('/api/pets/' + encodeURIComponent(currentPetId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch: patch })
        });
        if (resp && resp.ok) {
            var updated = await resp.json();
            _updatePetInCache(updated);
        }
    } catch (e) {
        // silent — saveData is called frequently
    }
}

async function saveDiary() {
    if (!currentPetId) {
        alert('⚠️ Errore: Seleziona un pet prima di salvare il profilo sanitario.');
        return;
    }
    var diaryText = document.getElementById('diaryText')?.value || '';
    var isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;

    var patch = { updated_at: new Date().toISOString() };
    if (isVet) { patch.notes = diaryText; } else { patch.owner_diary = diaryText; }

    try {
        var resp = await fetchApi('/api/pets/' + encodeURIComponent(currentPetId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch: patch })
        });
        if (resp && resp.ok) {
            var updated = await resp.json();
            _updatePetInCache(updated);
            showToast('✅ Profilo sanitario salvato', 'success');
        } else {
            showToast('Errore salvataggio profilo', 'error');
        }
    } catch (e) {
        showToast('Errore di rete', 'error');
    }
}

// v7.1.0: Load the correct diary text based on current role
async function loadDiaryForCurrentRole() {
    var diaryEl = document.getElementById('diaryText');
    if (!diaryEl) return;
    var isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;
    if (currentPetId) {
        var pet = await getPetById(currentPetId);
        if (pet) {
            diaryEl.value = isVet ? (pet.diary || '') : (pet.ownerDiary || '');
            return;
        }
    }
    diaryEl.value = '';
}

// Keep savePatient for compatibility but redirect to saveCurrentPet
async function savePatient() {
    await saveCurrentPet();
}

// ============================================
// INITIALIZATION
// ============================================

async function initMultiPetSystem() {
    // Load all pets from server
    await fetchPetsFromServer();
    await rebuildPetSelector();

    // Restore last selected pet
    var lastPetId = localStorage.getItem('ada_current_pet_id');
    if (lastPetId) {
        var pet = await getPetById(lastPetId);
        if (pet) {
            currentPetId = lastPetId;
            loadPetIntoMainFields(pet);
            var selector = document.getElementById('petSelector');
            if (selector) selector.value = lastPetId;
        }
    }

    await updateSelectedPetHeaders();
    updateSaveButtonState();
    _applyOwnerVetDropdownRules();
}

// ============================================
// REFRESH FROM SERVER
// ============================================

async function refreshPetsFromServer(showFeedback) {
    var feedback = showFeedback !== false;
    try {
        if (!navigator.onLine) {
            if (feedback && typeof showToast === 'function') showToast('Sei offline: impossibile ricaricare i dati', 'error');
            return;
        }
        await fetchPetsFromServer();
        var selectedId = getCurrentPetId();
        await rebuildPetSelector(selectedId);
        if (selectedId) {
            var pet = await getPetById(selectedId);
            if (pet) loadPetIntoMainFields(pet);
        }
        await updateSelectedPetHeaders();
        if (feedback && typeof showToast === 'function') showToast('✅ Dati ricaricati dal server', 'success');
    } catch (e) {
        if (feedback && typeof showToast === 'function') showToast('Errore ricaricamento', 'error');
    }
}

// ============================================
// SELECTED PET HEADER
// ============================================

async function updateSelectedPetHeaders() {
    var els = document.querySelectorAll('[data-selected-pet-header]');
    if (!els || els.length === 0) return;

    var pet = null;
    var petId = getCurrentPetId();
    if (petId) {
        try {
            pet = await getPetById(petId);
        } catch (e) {
            pet = null;
        }
    }

    els.forEach(function(el) {
        if (!pet || !pet.patient) {
            el.textContent = '🐾 Seleziona un pet';
            el.classList.remove('selected-pet-header--visible');
            return;
        }

        var name = (pet.patient.petName || 'Paziente').toString().trim();
        var species = (pet.patient.petSpecies || '').toString().trim();
        var parts = [name];
        if (species) parts.push(species);
        el.textContent = '🐾 ' + parts.join(' • ');
        el.classList.add('selected-pet-header--visible');
    });
}

// ============================================
// COMPATIBILITY SHIM (app-seed.js uses these; removed in PR 4)
// ============================================
try {
    window.ADA_PetsSync = window.ADA_PetsSync || {};
    window.ADA_PetsSync.pullPetsIfOnline = function() { return refreshPetsFromServer(false); };
    window.ADA_PetsSync.refreshPetsFromServer = refreshPetsFromServer;
    window.ADA_PetsSync.pushOutboxIfOnline = function() { return Promise.resolve(); };
} catch (e) {
    // silent
}
