// app-ai-petdesc.js v1.0 — AI Pet Description Generator

var _aiPetDescCache = {}; // { petId: { description, sourcesHash, generatedAt, sourcesUsed } }

// Collect ALL pet information visible to the owner
async function _collectPetDataForAI(petId) {
    var sources = {};

    // 1. Pet data (from cache or API)
    var pet = (typeof getPetById === 'function') ? getPetById(petId) : null;
    if (pet) {
        sources['dati_pet'] = {
            nome: pet.name, specie: pet.species, razza: pet.breed,
            sesso: pet.sex, data_nascita: pet.birthdate,
            peso_kg: pet.weight_kg, microchip: pet.microchip,
            sterilizzato: pet.neutered,
            stile_di_vita: pet.lifestyle || (pet.extra_data && pet.extra_data.lifestyle) || null
        };
    }

    // 2. Health archive — documents
    try {
        var docsResp = await fetchApi('/api/documents?pet_id=' + petId);
        if (docsResp && docsResp.ok) {
            var docsData = await docsResp.json();
            sources['documenti'] = (docsData.documents || []).map(function(d) {
                return { tipo: d.doc_type, nome: d.original_filename, ai_text: d.ai_extracted_text || null, data: d.created_at };
            });
        }
    } catch(e) {}

    // 3. Vital parameters
    try {
        var vitalsResp = await fetchApi('/api/pets/' + petId + '/vitals');
        if (vitalsResp && vitalsResp.ok) sources['parametri_vitali'] = await vitalsResp.json();
    } catch(e) {}

    // 4. Medications
    try {
        var medsResp = await fetchApi('/api/pets/' + petId + '/medications');
        if (medsResp && medsResp.ok) sources['farmaci'] = await medsResp.json();
    } catch(e) {}

    // 5. Pet conversations
    try {
        var convResp = await fetchApi('/api/communication/conversations?pet_id=' + petId);
        if (convResp && convResp.ok) {
            var convData = await convResp.json();
            sources['conversazioni'] = (convData.conversations || []).map(function(c) {
                return { tipo: c.type, oggetto: c.subject, data: c.created_at };
            });
        }
    } catch(e) {}

    return sources;
}

// Simple hash for change detection
function _computeSourcesHash(sources) {
    var str = JSON.stringify(sources);
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        var ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash = hash & hash; // Convert to 32bit integer
    }
    return str.length + '_' + Math.abs(hash);
}

// Generate AI pet description via backend
async function generateAiPetDescription(petId, force) {
    var sources = await _collectPetDataForAI(petId);
    var sourcesHash = _computeSourcesHash(sources);

    // Check if cached description is still valid
    if (!force && _aiPetDescCache[petId] && _aiPetDescCache[petId].sourcesHash === sourcesHash) {
        return _aiPetDescCache[petId];
    }

    // Call backend for generation
    var resp = await fetchApi('/api/pets/' + petId + '/ai-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: sources })
    });

    if (resp && resp.ok) {
        var result = await resp.json();
        _aiPetDescCache[petId] = {
            description: result.description,
            sourcesHash: sourcesHash,
            generatedAt: new Date().toISOString(),
            sourcesUsed: Object.keys(sources)
        };
        return _aiPetDescCache[petId];
    }

    return null;
}

// Update the UI — loads from DB cache first, then regenerates if needed
async function updateAiPetDescriptionUI() {
    var field = document.getElementById('aiPetDescriptionField');
    var status = document.getElementById('aiDescStatus');
    var sourcesDiv = document.getElementById('aiDescSources');
    if (!field) return;

    var petId = (typeof getCurrentPetId === 'function') ? getCurrentPetId() : null;
    if (!petId) {
        field.value = '';
        if (status) status.textContent = '';
        if (sourcesDiv) sourcesDiv.textContent = '';
        return;
    }

    // Check in-memory cache first
    if (_aiPetDescCache[petId] && _aiPetDescCache[petId].description) {
        field.value = _aiPetDescCache[petId].description;
        if (status) status.textContent = 'Generato il ' + new Date(_aiPetDescCache[petId].generatedAt).toLocaleString('it-IT');
        if (sourcesDiv) sourcesDiv.textContent = 'Fonti: ' + (_aiPetDescCache[petId].sourcesUsed || []).join(', ');
        return;
    }

    // Try loading from DB via pet data
    if (status) status.textContent = 'Caricamento...';
    try {
        var petResp = await fetchApi('/api/pets/' + petId);
        if (petResp && petResp.ok) {
            var petData = await petResp.json();
            if (petData.ai_description) {
                field.value = petData.ai_description;
                if (status) status.textContent = petData.ai_description_generated_at
                    ? 'Generato il ' + new Date(petData.ai_description_generated_at).toLocaleString('it-IT')
                    : 'Caricato dal database';
                if (sourcesDiv) sourcesDiv.textContent = '';
                // Populate in-memory cache
                _aiPetDescCache[petId] = {
                    description: petData.ai_description,
                    sourcesHash: petData.ai_description_sources_hash || '',
                    generatedAt: petData.ai_description_generated_at || new Date().toISOString(),
                    sourcesUsed: []
                };
                return;
            }
        }
    } catch(e) {}

    // No cached description — generate new
    if (status) status.textContent = 'Generazione in corso...';
    try {
        var result = await generateAiPetDescription(petId);
        if (result) {
            field.value = result.description;
            if (status) status.textContent = 'Generato il ' + new Date(result.generatedAt).toLocaleString('it-IT');
            if (sourcesDiv) {
                sourcesDiv.textContent = 'Fonti: ' + result.sourcesUsed.join(', ');
            }
        } else {
            field.value = 'Errore nella generazione della descrizione.';
            if (status) status.textContent = '';
        }
    } catch(e) {
        field.value = 'Errore: ' + e.message;
        if (status) status.textContent = '';
    }
}

function regenerateAiPetDescription() {
    var petId = (typeof getCurrentPetId === 'function') ? getCurrentPetId() : null;
    if (!petId) {
        if (typeof showToast === 'function') showToast('Seleziona un pet', 'warning');
        return;
    }
    var status = document.getElementById('aiDescStatus');
    if (status) status.textContent = 'Rigenerazione in corso...';
    generateAiPetDescription(petId, true).then(function() {
        updateAiPetDescriptionUI();
    });
}
