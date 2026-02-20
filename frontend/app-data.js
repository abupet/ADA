// ADA v6.17.3 - Data Management Functions
// Note: saveData, savePatient and saveDiary are overridden in app-pets.js for multi-pet support

// ============================================
// HELPERS
// ============================================

function _computeAgeFromBirthdate(bd) {
    if (!bd) return '';
    try {
        var d = new Date(bd);
        if (isNaN(d.getTime())) return '';
        var now = new Date();
        var years = now.getFullYear() - d.getFullYear();
        var months = now.getMonth() - d.getMonth();
        if (months < 0 || (months === 0 && now.getDate() < d.getDate())) years--;
        if (years < 0) years = 0;
        if (years === 0) {
            var m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
            if (now.getDate() < d.getDate()) m--;
            if (m < 0) m = 0;
            return m + (m === 1 ? ' mese' : ' mesi');
        }
        return years + (years === 1 ? ' anno' : ' anni');
    } catch (_) { return ''; }
}

function _extractJsonObject(text) {
    const t = String(text || '');
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = t.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (e) { return null; }
}

function _extractJsonArray(text) {
    const t = String(text || '');
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = t.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (e) { return null; }
}

function _getMostRecentDiagnosisText() {
    try {
        const sorted = (typeof _getHistorySortedForUI === 'function')
            ? _getHistorySortedForUI()
            : (historyData || []).slice().sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
        const rec = sorted && sorted[0];
        return (rec?.soapData?.a || rec?.a || '').trim() || 'N/D';
    } catch (e) {
        return 'N/D';
    }
}


// ============================================
// PHOTOS
// ============================================

function addPhotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => { 
            photos.push(e.target.result); 
            renderPhotos(); 
            saveData(); 
        };
        reader.readAsDataURL(file);
    });
    event.target.value = '';
}

function capturePhoto() {
    const input = document.createElement('input');
    input.type = 'file'; 
    input.accept = 'image/*'; 
    input.capture = 'environment';
    input.onchange = addPhotos; 
    input.click();
}

function _photoSrc(photo) {
    if (!photo) return '';
    var src = typeof photo === 'string' ? photo : (photo.dataUrl || photo.url || '');
    // Relative API paths need the backend base URL (frontend may be on different host, e.g. GitHub Pages)
    if (src.startsWith('/api/') && typeof API_BASE_URL !== 'undefined') {
        src = API_BASE_URL + src;
    }
    return src;
}

function renderPhotos() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;

    if (photos.length === 0) {
        grid.innerHTML = '<p style="color:#888;text-align:center;padding:20px;grid-column:1/-1;">Nessuna foto</p>';
        return;
    }

    grid.innerHTML = photos.map((photo, i) => `
        <div class="photo-item">
            <img src="${_photoSrc(photo)}" alt="Foto ${i + 1}" onclick="openPhotoFullscreen(${i})">
            <button class="delete-btn" onclick="deletePhoto(${i})">×</button>
        </div>
    `).join('');
}

function openPhotoFullscreen(index) {
    const photo = photos[index];
    if (!photo) return;

    const overlay = document.createElement('div');
    overlay.id = 'photoOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.onclick = () => overlay.remove();

    const img = document.createElement('img');
    img.src = _photoSrc(photo);
    img.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:white;border:none;font-size:30px;width:50px;height:50px;border-radius:50%;cursor:pointer;';
    closeBtn.onclick = () => overlay.remove();
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

function deletePhoto(index) { 
    if (confirm('Eliminare questa foto?')) {
        photos.splice(index, 1); 
        renderPhotos(); 
        saveData();
        showToast('Foto eliminata', 'success');
    }
}

// ============================================
// PATIENT DATA
// ============================================

function getPatientData() {
    return {
        petName: document.getElementById('petName')?.value || '',
        petSpecies: document.getElementById('petSpecies')?.value || '',
        petBreed: document.getElementById('petBreed')?.value || '',
        petBirthdate: document.getElementById('petBirthdate')?.value || '',
        petSex: document.getElementById('petSex')?.value || '',
        petMicrochip: document.getElementById('petMicrochip')?.value || '',
        ownerName: document.getElementById('ownerName')?.value || '',
        ownerPhone: document.getElementById('ownerPhone')?.value || '',
        visitDate: document.getElementById('visitDate')?.value || ''
    };
}

function getLifestyleData() {
    const householdSelect = document.getElementById('petHousehold');
    const selectedHousehold = householdSelect ? Array.from(householdSelect.selectedOptions).map(opt => opt.value).join(', ') : '';
    
    return {
        lifestyle: document.getElementById('petLifestyle')?.value || '',
        household: selectedHousehold,
        activityLevel: document.getElementById('petActivityLevel')?.value || '',
        dietType: document.getElementById('petDietType')?.value || '',
        dietPreferences: document.getElementById('petDietPreferences')?.value || '',
        knownConditions: document.getElementById('petKnownConditions')?.value || '',
        currentMeds: document.getElementById('petCurrentMeds')?.value || '',
        behaviorNotes: document.getElementById('petBehaviorNotes')?.value || '',
        seasonContext: document.getElementById('petSeasonContext')?.value || '',
        location: document.getElementById('petLocation')?.value || '',
        idealWeightKg: parseFloat(document.getElementById('petIdealWeight')?.value) || null,
        mealsPerDay: parseInt(document.getElementById('petMealsPerDay')?.value) || null,
        foodAllergies: (document.getElementById('petFoodAllergies')?.value || '')
            .split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; })
    };
}

function setPatientData(data) {
    const fields = ['petName', 'petSpecies', 'petBreed', 'petBirthdate', 'petSex', 'petMicrochip', 'ownerName', 'ownerPhone', 'visitDate'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = (data && data[f]) || '';
    });
}

function setLifestyleData(data) {
    const mapping = {
        'lifestyle': 'petLifestyle',
        'activityLevel': 'petActivityLevel',
        'dietType': 'petDietType',
        'dietPreferences': 'petDietPreferences',
        'knownConditions': 'petKnownConditions',
        'currentMeds': 'petCurrentMeds',
        'behaviorNotes': 'petBehaviorNotes',
        'seasonContext': 'petSeasonContext',
        'location': 'petLocation'
    };
    
    // Always set values, even if empty (to clear fields when switching pets)
    Object.keys(mapping).forEach(key => {
        const el = document.getElementById(mapping[key]);
        if (el) el.value = (data && data[key]) || '';
    });
    
    // Handle household multi-select
    const householdSelect = document.getElementById('petHousehold');
    if (householdSelect) {
        const values = (data && data.household) ? data.household.split(', ') : [];
        Array.from(householdSelect.options).forEach(opt => opt.selected = values.includes(opt.value));
    }

    // New nutrition fields
    var idealWEl = document.getElementById('petIdealWeight');
    if (idealWEl) idealWEl.value = (data && data.idealWeightKg) || '';
    var mealsEl = document.getElementById('petMealsPerDay');
    if (mealsEl) mealsEl.value = (data && data.mealsPerDay) || '';
    var allergiesEl = document.getElementById('petFoodAllergies');
    if (allergiesEl) allergiesEl.value = (data && Array.isArray(data.foodAllergies)) ? data.foodAllergies.join(', ') : '';

    checkAndExpandLifestyle();
}

function checkAndExpandLifestyle() {
    const data = getLifestyleData();
    const hasData = data.lifestyle || data.household || data.activityLevel || data.dietType || 
                    data.dietPreferences || data.knownConditions || data.currentMeds || 
                    data.behaviorNotes || data.seasonContext || data.location;
    
    if (hasData) {
        const section = document.getElementById('lifestyleSection');
        if (section && !section.classList.contains('open')) section.classList.add('open');
    }
}

function savePatient() {
    localStorage.setItem('ada_patient', JSON.stringify(getPatientData()));
    localStorage.setItem('ada_lifestyle', JSON.stringify(getLifestyleData()));
    showToast('Dati paziente salvati', 'success');
}

// ============================================
// DATA PERSISTENCE
// ============================================

// saveData() is defined in app-pets.js to save to IndexedDB

function loadData() {
    photos = JSON.parse(localStorage.getItem('ada_photos') || '[]');
    vitalsData = JSON.parse(localStorage.getItem('ada_vitals') || '[]');
    historyData = JSON.parse(localStorage.getItem('ada_history') || '[]');
    medications = JSON.parse(localStorage.getItem('ada_medications') || '[]');
    // appointments removed in v7 — kept for backward compat if stored
    try { appointments = JSON.parse(localStorage.getItem('ada_appointments') || '[]'); } catch(e) {}
    
    setPatientData(JSON.parse(localStorage.getItem('ada_patient') || '{}'));
    setLifestyleData(JSON.parse(localStorage.getItem('ada_lifestyle') || '{}'));
    
    const diary = localStorage.getItem('ada_diary');
    if (diary) {
        const diaryEl = document.getElementById('diaryText');
        if (diaryEl) diaryEl.value = diary;
    }
    
    loadApiUsage();
    renderPhotos();
}

// ============================================
// CLINICAL PROFILE
// ============================================

async function generateDiary() {
    showProgress(true);
    const patient = getPatientData();
    // Fallback: if ownerName empty in DOM, read from pet object in memory (fix for seed pets)
    if (!patient.ownerName) {
        try {
            const petId = (typeof getCurrentPetId === 'function') ? getCurrentPetId() : null;
            if (petId && typeof getPetById === 'function') {
                const pet = await getPetById(petId);
                if (pet?.patient?.ownerName) patient.ownerName = pet.patient.ownerName;
            }
        } catch (_) {}
    }
    const lifestyle = getLifestyleData();
    const vetName = (typeof getVetName === 'function') ? getVetName() : '';
    const generatedDate = new Date().toLocaleDateString('it-IT');
    const isVet = (typeof getActiveRole === 'function') && getActiveRole() === ROLE_VETERINARIO;

    const historyText = (historyData || []).map(h => {
        const d = new Date(h.createdAt || h.date || Date.now()).toLocaleDateString('it-IT');
        const tk = h.templateKey || h.template || 'generale';
        const titleRef = (typeof templateTitles !== 'undefined' && templateTitles[tk]) ? templateTitles[tk] : 'Visita';
        const a = ((h.soapData && h.soapData.a) ? h.soapData.a : (h.a || '')).toString();
        const p = ((h.soapData && h.soapData.p) ? h.soapData.p : (h.p || '')).toString();
        const aSnippet = a.substring(0, 200) || 'N/D';
        const pSnippet = p.substring(0, 100);
        return `[${d}] ${titleRef}: Analisi: ${aSnippet}` + (pSnippet ? ` | Piano: ${pSnippet}` : '');
    }).join('\n') || 'Nessuno';
    const vitalsText = vitalsData.map(v => `${new Date(v.date).toLocaleDateString('it-IT')}: Peso ${v.weight}kg, T ${v.temp}°C`).join('\n') || 'Nessuno';
    const medsText = medications.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join('\n') || 'Nessuno';

    const patientInfo = `PAZIENTE: ${patient.petName || 'N/D'}, ${patient.petSpecies || 'N/D'}, ${patient.petBreed || 'N/D'}, ${_computeAgeFromBirthdate(patient.petBirthdate) || 'N/D'}
PROPRIETARIO: ${patient.ownerName || 'N/D'}
STILE DI VITA: Ambiente ${lifestyle.lifestyle || 'N/D'}, Attività ${lifestyle.activityLevel || 'N/D'}
CONDIZIONI NOTE: ${lifestyle.knownConditions || 'Nessuna'}

PARAMETRI VITALI: ${vitalsText}
FARMACI: ${medsText}
STORICO REFERTI: ${historyText}`;

    let prompt;
    if (isVet) {
        prompt = `Genera un profilo sanitario per questo paziente veterinario.

${patientInfo}

ISTRUZIONI:
Scrivi un profilo sanitario professionale e sintetico.
Per OGNI informazione clinica rilevante (diagnosi, trattamenti, parametri vitali anomali), indica un riferimento numerico tra parentesi quadre (es. [1], [2]).
Se più informazioni provengono dalla stessa fonte (stesso tipo referto e stessa data), usano lo stesso numero.
A fine documento, dopo una riga "---", scrivi la sezione "Fonti:" con la legenda:
[N]: <tipo referto>, Data: <gg/mm/aaaa>
Se un dato proviene dai Parametri Vitali, indica [N]: Parametri Vitali, Data: <data>.
Se un dato proviene dai Farmaci attivi, indica [N]: Farmaci in corso.
Se inserisci una firma, usa il nome veterinario "${vetName || '[Nome del Veterinario]'}" e la data "${generatedDate}".`;
    } else {
        prompt = `Genera un profilo sanitario semplice e chiaro per il proprietario di un animale.

${patientInfo}

ISTRUZIONI:
Scrivi un profilo sanitario comprensibile per il proprietario. Usa un linguaggio semplice e rassicurante.
Il tono deve essere impersonale, come se a scrivere fosse "il team AbuPet".
Spiega in modo chiaro: stato di salute generale, eventuali condizioni in corso, farmaci e cosa deve fare il proprietario.
Evita termini tecnici complessi (o spiegali brevemente tra parentesi).
Chiudi con: "Il team AbuPet".`;
    }

    try {
        const diaryModel = getAiModelForTask('diary_generate', 'gpt-4o');
        const diaryParams = getAiParamsForTask('diary_generate');
        const response = await fetchApi('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: diaryModel, messages: [{ role: 'user', content: prompt }], temperature: diaryParams.temperature ?? 0.5 })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
        let content = data.choices[0].message.content;
        if (content) {
            if (vetName) {
                content = content.replace(/\[Nome del Veterinario\]/gi, vetName);
            }
            content = content.replace(/\[Data\]/gi, generatedDate);
        }
        document.getElementById('diaryText').value = content;
        // Auto-save: prevent loss if user navigates away before manual save
        try { if (typeof saveDiary === 'function') saveDiary(); } catch (_e) {}
        trackChatUsage(diaryModel, data.usage);
        saveApiUsage();
        updateCostDisplay();
        showToast('Profilo sanitario generato', 'success');
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
    }
    showProgress(false);
}

function saveDiary() {
    localStorage.setItem('ada_diary', document.getElementById('diaryText').value);
    showToast('Profilo sanitario salvato', 'success');
}

function exportDiaryTXT() {
    downloadFile(document.getElementById('diaryText').value, 'profilo_sanitario.txt', 'text/plain');
}

function exportDiaryPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const patient = getPatientData();

    // Header
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, 210, 35, 'F');

    // Logo (AniCura) — come nel Referto
    try {
        if (typeof addAnicuraLogoToPdf === 'function') {
            addAnicuraLogoToPdf(doc, 10, 9, 35, 22);
        }
    } catch (e) {}

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('Profilo sanitario', 120, 18, { align: 'center' });

    // Content
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    let y = 44;

    const metaParts = [];
    if (patient?.petName) metaParts.push(`Paziente: ${patient.petName}`);
    metaParts.push(`Data: ${new Date().toLocaleDateString('it-IT')}`);
    if (metaParts.length) {
        doc.text(metaParts.join(' | '), 15, y);
        y += 10;
    }

    const diaryText = (document.getElementById('diaryText')?.value || '').toString();
    const lines = doc.splitTextToSize(diaryText, 180);
    for (const line of lines) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, 15, y);
        y += 5;
    }

    doc.save('profilo_sanitario_' + (patient?.petName || 'paziente') + '.pdf');
    showToast('PDF esportato', 'success');
}

// ============================================
// Q&A
// ============================================

let qnaRecorder = null;
let qnaChunks = [];
let isRecordingQuestion = false;

async function runQnaModerationCheck(text, kind) {
    const content = (text || '').toString().trim();
    if (!content) return false;
    const response = await fetchApi('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'omni-moderation-latest', input: content })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Moderazione ${kind} fallita (HTTP ${response.status}): ${errText.substring(0, 120)}`);
    }
    const data = await response.json();
    const flagged = data?.results?.[0]?.flagged;
    if (flagged) {
        showToast(`Contenuto non consentito nella ${kind}.`, 'error');
        return false;
    }
    return true;
}

function toggleQuestionRecording() {
    if (isRecordingQuestion) {
        completeQuestionRecording();
    } else {
        startQuestionRecording();
    }
}

async function startQuestionRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        qnaRecorder = new MediaRecorder(stream);
        qnaChunks = [];
        qnaRecorder.ondataavailable = e => qnaChunks.push(e.data);
        qnaRecorder.start();
        isRecordingQuestion = true;
        document.getElementById('btnAskQuestion').innerHTML = '✅ Completa';
        document.getElementById('btnAskQuestion').classList.add('btn-success');
        document.getElementById('btnAskQuestion').classList.remove('btn-primary');
        showToast('🔴 Parla ora...', 'success');
    } catch (e) {
        showToast('Errore microfono', 'error');
    }
}

async function completeQuestionRecording() {
    if (!qnaRecorder || qnaRecorder.state !== 'recording') return;
    
    isRecordingQuestion = false;
    document.getElementById('btnAskQuestion').innerHTML = '🎤 Chiedi';
    document.getElementById('btnAskQuestion').classList.remove('btn-success');
    document.getElementById('btnAskQuestion').classList.add('btn-primary');
    
    showProgress(true);
    
    qnaRecorder.onstop = async () => {
        const audioBlob = new Blob(qnaChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'question.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'it');
        
        try {
            const response = await fetchApi('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
            document.getElementById('qnaQuestion').value = data.text || '';
            apiUsage.whisper_minutes += 0.3;
            saveApiUsage();
            updateCostDisplay();
            if (data.text) await generateQnAAnswer();
        } catch (e) {
            showToast('Errore trascrizione', 'error');
        }
        showProgress(false);
    };
    
    qnaRecorder.stop();
    qnaRecorder.stream.getTracks().forEach(track => track.stop());
}

async function generateQnAAnswer() {
    const question = document.getElementById('qnaQuestion').value;
    if (!question) { showToast('Inserisci una domanda', 'error'); return; }

    try {
        const okQuestion = await runQnaModerationCheck(question, 'domanda');
        if (!okQuestion) return;
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
        return;
    }
    
    showProgress(true);
    const patient = getPatientData();
    const lifestyle = getLifestyleData();
    
    const prompt = `Sei un assistente veterinario. Rispondi SOLO a domande su pet e animali in generale.

PET: ${patient.petName || 'N/D'}, ${patient.petSpecies || 'N/D'}, ${patient.petBreed || 'N/D'}, Età: ${_computeAgeFromBirthdate(patient.petBirthdate) || 'N/D'}
AMBIENTE: ${lifestyle.lifestyle || 'N/D'}, CONDIZIONI: ${lifestyle.knownConditions || 'Nessuna'}
FARMACI: ${medications.map(m => m.name).join(', ') || 'Nessuno'}
ULTIMA DIAGNOSI: ${_getMostRecentDiagnosisText()}

DOMANDA: "${question}"

Se NON correlata ad animali/pet: "Mi dispiace, posso rispondere solo a domande su animali e pet."
Altrimenti rispondi in modo chiaro e rassicurante.`;

    try {
        const qnaModel = getAiModelForTask('qna_answer', 'gpt-4o');
        const qnaParams = getAiParamsForTask('qna_answer');
        const response = await fetchApi('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: qnaModel, messages: [{ role: 'user', content: prompt }], temperature: qnaParams.temperature ?? 0.5 })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Risposta non valida dal modello');
        }
        const okAnswer = await runQnaModerationCheck(content, 'risposta');
        if (!okAnswer) {
            document.getElementById('qnaAnswer').value = 'Mi dispiace, non posso rispondere a questa domanda.';
            showProgress(false);
            return;
        }
        document.getElementById('qnaAnswer').value = content;
        trackChatUsage(qnaModel, data.usage);
        saveApiUsage();
        updateCostDisplay();
        showToast('Risposta generata', 'success');
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
    }
    showProgress(false);
}

async function generateQnAFaq() {
    showProgress(true);
    const patient = getPatientData();
    const lifestyle = getLifestyleData();
    
    const prompt = `Genera 5 domande utili per un proprietario di ${patient.petSpecies || 'animale'} ${patient.petBreed || ''}.
Condizioni note: ${lifestyle.knownConditions || 'Nessuna'}
Diagnosi recente: ${_getMostRecentDiagnosisText()}

Rispondi in JSON: {"faq": [{"question": "...", "answer": "..."}]}`;

    try {
        const faqModel = getAiModelForTask('qna_faq', 'gpt-4o');
        const faqParams = getAiParamsForTask('qna_faq');
        const response = await fetchApi('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: faqModel, messages: [{ role: 'user', content: prompt }], temperature: faqParams.temperature ?? 0.6 })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Risposta non valida dal modello');
        }
        const result = _extractJsonObject(content);
        if (result) {
            const list = document.getElementById('qnaFaqList');
            if (list) {
                list.innerHTML = '';
                (result.faq || []).forEach(item => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'faq-item';
                    wrapper.addEventListener('click', () => wrapper.classList.toggle('open'));

                    const question = document.createElement('div');
                    question.className = 'faq-question';
                    question.textContent = item?.question || '';

                    const answer = document.createElement('div');
                    answer.className = 'faq-answer';
                    answer.textContent = item?.answer || '';

                    wrapper.appendChild(question);
                    wrapper.appendChild(answer);
                    list.appendChild(wrapper);
                });
            }
        }
        trackChatUsage(faqModel, data.usage);
        saveApiUsage();
        updateCostDisplay();
        showToast('Domande generate', 'success');
    } catch (e) {
        showToast('Errore: ' + e.message, 'error');
    }
    showProgress(false);
}
