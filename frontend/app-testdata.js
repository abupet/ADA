// ============================================
// TEST DATA GENERATION (debug mode only)
// ============================================
// Visible only when "Debug attivo (per i test)" is ON.

(function () {
    'use strict';

    // ── Test button IDs ──
    var TEST_BUTTON_IDS = [
        'btnTestAddPet', 'btnTestSoap', 'btnTestVitals', 'btnTestMeds', 'btnTestPhotos'
    ];

    // ── Show/hide test buttons based on debug flag ──
    function updateTestButtonVisibility() {
        var visible = (typeof debugLogEnabled !== 'undefined' && debugLogEnabled);
        TEST_BUTTON_IDS.forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn) btn.style.display = visible ? '' : 'none';
        });
        // Seed Engine visibility is now handled by the TEST & DEMO sidebar section in applyRoleUI
    }

    // Hook into toggleDebugLog to update buttons
    var _origToggleDebugLog = window.toggleDebugLog;
    window.toggleDebugLog = function (enabled) {
        if (typeof _origToggleDebugLog === 'function') _origToggleDebugLog(enabled);
        updateTestButtonVisibility();
    };

    // Also run on page navigations
    var _origNavigateToPage = window.navigateToPage;
    if (typeof _origNavigateToPage === 'function') {
        window.navigateToPage = function () {
            _origNavigateToPage.apply(this, arguments);
            setTimeout(updateTestButtonVisibility, 50);
        };
    }

    // Initial setup after DOM ready
    setTimeout(updateTestButtonVisibility, 500);

    // ── Helpers ──
    function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function _rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function _randFloat(min, max, dec) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec || 1)); }
    function _pastDate(daysAgo) {
        var d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d;
    }
    function _isoDate(d) { return d.toISOString().slice(0, 10); }
    function _isoDateTime(d) { return d.toISOString().slice(0, 16); }
    function _setVal(id, val) {
        var el = document.getElementById(id);
        if (el && !el.value) el.value = val;
    }

    // ── Dog names / Cat names / Rabbit names ──
    var dogNames = ['Luna', 'Rocky', 'Bella', 'Max', 'Nala', 'Zeus', 'Kira', 'Thor', 'Maya', 'Leo', 'Laika', 'Argo', 'Stella', 'Oscar', 'Mia'];
    var catNames = ['Micio', 'Pallina', 'Felix', 'Birba', 'Nuvola', 'Romeo', 'Ginger', 'Whiskers', 'Salem', 'Tigre', 'Minou', 'Nerina', 'Briciola', 'Simba', 'Luna'];
    var rabbitNames = ['Fiocco', 'Batuffolo', 'Neve', 'Luppolo', 'Cipria', 'Puffetta', 'Bambi', 'Cannella', 'Peloso', 'Toffee'];

    var dogBreeds = ['Labrador Retriever', 'Pastore Tedesco', 'Golden Retriever', 'Bulldog Francese', 'Beagle', 'Setter Irlandese', 'Jack Russell Terrier', 'Border Collie', 'Cocker Spaniel', 'Bassotto'];
    var catBreeds = ['Europeo', 'Persiano', 'Siamese', 'Maine Coon', 'British Shorthair', 'Ragdoll', 'Bengala', 'Sphynx', 'Norvegese', 'Certosino'];
    var rabbitBreeds = ['Ariete Nano', 'Testa di Leone', 'Rex', 'Angora', 'Olandese Nano', 'Hotot', 'Californiano'];

    var ownerNames = ['Marco Rossi', 'Giulia Bianchi', 'Luca Verdi', 'Anna Ferrari', 'Paolo Esposito', 'Chiara Romano', 'Davide Colombo', 'Sara Ricci', 'Roberto Moretti', 'Elena Conti'];
    var ownerPhones = ['339 1234567', '338 7654321', '347 1122334', '340 9988776', '333 5566778', '328 4433221', '349 6677889', '335 2211443', '342 8899001', '330 1122556'];
    var sexOptions = ['Maschio', 'Maschio castrato', 'Femmina', 'Femmina sterilizzata'];

    // ── SOAP test data ──
    var soapSubjective = [
        'Il proprietario riferisce che il paziente presenta vomito intermittente da 3 giorni, con riduzione dell\'appetito. Feci di consistenza normale. Beve regolarmente.',
        'Viene portato per un controllo annuale. Il proprietario non riferisce problemi particolari. Appetito e vivacità nella norma.',
        'Il proprietario segnala che il cane zoppica dalla zampa posteriore sinistra da circa una settimana, peggiorato dopo una corsa al parco.',
        'Prurito intenso da circa 10 giorni, si gratta soprattutto dietro le orecchie e sul ventre. Nessun cambio di alimentazione recente.'
    ];
    var soapObjective = [
        'Esame obiettivo: Stato generale buono, vigile e reattivo. T 38.6°C, FC 110 bpm, FR 24 atti/min. Mucose rosee, TRC < 2s. Palpazione addominale: lieve tensione epigastrica. Linfonodi nella norma.',
        'Peso 12.5 kg (stabile). T 38.4°C, FC 100 bpm. Mucose rosee. Auscultazione cardiopolmonare nella norma. Dentatura con lieve tartaro su PM3-PM4 superiori.',
        'Deambulazione con zoppia di III grado arto posteriore sinistro. Dolore alla manipolazione del ginocchio sinistro. Test del cassetto dubbio. Massa muscolare simmetrica.',
        'Eritema diffuso regione ventrale e padiglioni auricolari. Lesioni da grattamento. Otoscopia: cerume brunastro bilaterale, membrane timpaniche integre.'
    ];
    var soapAssessment = [
        'Gastroenterite acuta, probabilmente di origine alimentare. Da escludere corpo estraneo mediante monitoraggio clinico.',
        'Paziente in buona salute generale. Tartaro dentale di grado I-II. Consigliata pulizia dentale programmata.',
        'Sospetta lesione del legamento crociato anteriore sinistro. Indicata diagnostica per immagini (Rx + eventuale ecografia articolare).',
        'Dermatite allergica (possibile DAP o allergia alimentare). Otite esterna bilaterale batterica/lieviti.'
    ];
    var soapPlan = [
        'Dieta blanda (riso + pollo bollito) per 5 giorni. Metoclopramide 0.3 mg/kg BID per 3 giorni. Controllo tra 5 giorni se i sintomi persistono.',
        'Vaccinazione antirabbica somministrata. Richiamo polivalente tra 6 mesi. Detartrasi consigliata entro 3 mesi. Prossimo controllo tra 1 anno.',
        'Rx ginocchio sinistro LL e CC. FANS: Meloxicam 0.1 mg/kg SID per 10 giorni. Riposo assoluto. Rivalutazione con esito radiografico.',
        'Trattamento antiparassitario con Fluralaner. Otomax 2gtt BID per 14 giorni. Dieta ipoallergenica per 8 settimane. Controllo tra 14 giorni.'
    ];

    // ── Medication test data ──
    var testMedications = [
        { name: 'Amoxicillina-Ac. Clavulanico', dosage: '12.5 mg/kg', frequency: 'BID', duration: '10 giorni', instructions: 'Somministrare con il cibo. Completare il ciclo.' },
        { name: 'Meloxicam', dosage: '0.1 mg/kg', frequency: 'SID', duration: '7 giorni', instructions: 'Antinfiammatorio. Somministrare dopo il pasto.' },
        { name: 'Metoclopramide', dosage: '0.3 mg/kg', frequency: 'BID', duration: '5 giorni', instructions: 'Antiemetico. 30 minuti prima del pasto.' },
        { name: 'Prednisolone', dosage: '0.5 mg/kg', frequency: 'SID', duration: '14 giorni poi scalare', instructions: 'Corticosteroide. Non sospendere bruscamente.' },
        { name: 'Omeprazolo', dosage: '1 mg/kg', frequency: 'SID', duration: '10 giorni', instructions: 'Gastroprotettore. A stomaco vuoto al mattino.' },
        { name: 'Cefalessina', dosage: '20 mg/kg', frequency: 'BID', duration: '14 giorni', instructions: 'Antibiotico. Con il cibo per ridurre effetti GI.' },
        { name: 'Gabapentin', dosage: '5 mg/kg', frequency: 'BID', duration: '21 giorni', instructions: 'Analgesico neuropatico. Può causare sedazione.' },
        { name: 'Fluralaner (Bravecto)', dosage: '25-56 mg/kg', frequency: 'Dose singola', duration: '12 settimane', instructions: 'Antiparassitario. Con il pasto principale.' },
        { name: 'Maropitant (Cerenia)', dosage: '2 mg/kg', frequency: 'SID', duration: '5 giorni', instructions: 'Antiemetico. SC o PO. A digiuno.' },
        { name: 'Tramadolo', dosage: '2 mg/kg', frequency: 'TID', duration: '7 giorni', instructions: 'Analgesico oppioide. Può causare sonnolenza.' },
        { name: 'Enrofloxacina', dosage: '5 mg/kg', frequency: 'SID', duration: '10 giorni', instructions: 'Fluorochinolone. Non usare in soggetti in accrescimento.' },
        { name: 'Metronidazolo', dosage: '15 mg/kg', frequency: 'BID', duration: '7 giorni', instructions: 'Antiprotozoario/antibatterico. Con il cibo.' }
    ];

    // ── Pet photo URLs by species ──
    // Uses free image placeholder services for realistic pet images
    var _photoCache = {};

    function _generatePhotoDataUrl(species, index) {
        // Generate a deterministic SVG placeholder per species (matches backend seed.petgen.js)
        var colors = {
            'Cane': ['#4A90D9', '#2C5F9E'],
            'Gatto': ['#D9864A', '#9E5F2C'],
            'Coniglio': ['#6DC94A', '#3E8F2C'],
            'Altro': ['#D94A8F', '#9E2C5F']
        };
        var pair = colors[species] || colors['Altro'];
        var icons = { 'Cane': '\uD83D\uDC36', 'Gatto': '\uD83D\uDC31', 'Coniglio': '\uD83D\uDC30', 'Altro': '\uD83D\uDC3E' };
        var icon = icons[species] || icons['Altro'];
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="' + pair[0] + '"/>' +
            '<stop offset="100%" stop-color="' + pair[1] + '"/>' +
            '</linearGradient></defs>' +
            '<rect width="400" height="400" fill="url(#g)" rx="20"/>' +
            '<text x="200" y="180" font-size="120" text-anchor="middle">' + icon + '</text>' +
            '<text x="200" y="300" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">' + species + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }

    function _getPhotosForSpecies(species, count) {
        var key = species || 'Altro';
        if (!_photoCache[key]) {
            _photoCache[key] = [];
            for (var i = 0; i < 20; i++) {
                _photoCache[key].push(_generatePhotoDataUrl(key, i));
            }
        }
        // Pick random subset
        var pool = _photoCache[key].slice();
        var result = [];
        for (var j = 0; j < count && pool.length > 0; j++) {
            var idx = Math.floor(Math.random() * pool.length);
            result.push(pool.splice(idx, 1)[0]);
        }
        return result;
    }

    // ── Lifestyle test data ──
    var locations = ['Milano', 'Roma', 'Napoli', 'Torino', 'Bologna', 'Firenze', 'Padova', 'Verona', 'Brescia', 'Bari'];

    var dietPreferencesByCane = ['Preferisce pollo e riso, evita pesce', 'Mangia volentieri crocchette grain-free', 'Ama le carote come snack, evita latticini', 'Ghiotto di carne bovina, tollera bene il salmone'];
    var dietPreferencesByGatto = ['Preferisce tonno e pollo, rifiuta manzo', 'Ama il paté umido, crocchette solo se appetitizzate', 'Preferisce pesce bianco, evita fegato', 'Mangia volentieri pollo crudo, gradisce erba gatta'];
    var dietPreferencesByConiglio = ['Fieno di erba medica, verdure fresche quotidiane', 'Fieno timothy, gradisce basilico e prezzemolo', 'Predilige radicchio e finocchio, evita cavoli', 'Fieno misto, pellet in quantità limitata'];

    var knownConditionsByCane = ['Lieve artrosi arto posteriore dx', 'Allergia al pollo (DAP sospetta)', 'Epilessia idiopatica controllata', 'Soffio cardiaco grado II/VI', '', 'Otiti ricorrenti bilaterali'];
    var knownConditionsByGatto = ['IRC stadio II IRIS', 'Ipertiroidismo compensato', 'FIV positivo, asintomatico', 'Cistite idiopatica ricorrente', '', 'Gengivostomatite cronica'];
    var knownConditionsByConiglio = ['Malocclusione dentale lieve', 'Encephalitozoon cuniculi pregresso', '', 'Stasi gastrointestinale ricorrente', ''];

    var currentMedsByCane = ['Meloxicam 0.1 mg/kg SID', '', 'Fenobarbital 2.5 mg/kg BID', 'Benazepril 0.25 mg/kg SID', ''];
    var currentMedsByGatto = ['Benazepril + dieta renale', 'Metimazolo 2.5 mg BID', '', 'Cystease plus 1 cp/die', ''];
    var currentMedsByConiglio = ['', 'Metacam 0.3 mg/kg SID al bisogno', '', ''];

    var behaviorNotesByCane = ['Reattivo verso altri cani maschi, ottimo con le persone', 'Timido con gli estranei, ansia da separazione lieve', 'Molto socievole, tende a tirare al guinzaglio', '', 'Paura di tuoni e fuochi d\'artificio'];
    var behaviorNotesByGatto = ['Molto territoriale, non tollera altri gatti', 'Affettuoso ma diffidente con gli estranei', 'Tende a nascondersi durante le visite', '', 'Aggressività da gioco, morde le mani'];
    var behaviorNotesByConiglio = ['Docile, si lascia manipolare facilmente', 'Timido, tende a nascondersi se spaventato', '', 'Molto attivo di sera, scava nelle coperte'];

    function _setSelectVal(id, val) {
        var el = document.getElementById(id);
        if (el && !el.value) el.value = val;
    }
    function _setMultiSelectRandom(id, options, minPick, maxPick) {
        var el = document.getElementById(id);
        if (!el) return;
        var count = _rand(minPick, maxPick);
        var pool = options.slice();
        for (var i = 0; i < count && pool.length > 0; i++) {
            var idx = Math.floor(Math.random() * pool.length);
            var opt = pool.splice(idx, 1)[0];
            for (var j = 0; j < el.options.length; j++) {
                if (el.options[j].value === opt) el.options[j].selected = true;
            }
        }
    }

    // ── TEST: Fill Add Pet ──
    window.testFillAddPet = function () {
        var species = _pick(['Cane', 'Gatto', 'Coniglio']);
        var names, breeds;
        if (species === 'Cane') { names = dogNames; breeds = dogBreeds; }
        else if (species === 'Gatto') { names = catNames; breeds = catBreeds; }
        else { names = rabbitNames; breeds = rabbitBreeds; }

        var ownerIdx = _rand(0, ownerNames.length - 1);
        var birthDate = _isoDate(_pastDate(_rand(180, 5000)));

        _setVal('newPetName', _pick(names));
        var specSel = document.getElementById('newPetSpecies');
        if (specSel && !specSel.value) specSel.value = species;
        _setVal('newPetBreed', _pick(breeds));
        _setVal('newPetAge', birthDate);
        var sexSel = document.getElementById('newPetSex');
        if (sexSel && !sexSel.value) sexSel.value = _pick(sexOptions);
        _setVal('newPetMicrochip', '380' + String(_rand(100000000000, 999999999999)));
        // Select random owner from dropdown (§9.2)
        var ownerSel = document.getElementById('newOwnerName');
        if (ownerSel && ownerSel.options.length > 1) {
            var randomOwnerIdx = 1 + Math.floor(Math.random() * (ownerSel.options.length - 1));
            ownerSel.selectedIndex = randomOwnerIdx;
        } else {
            _setVal('newOwnerName', ownerNames[ownerIdx]);
        }
        // Select random vet_ext from dropdown (70% chance)
        var vetSel = document.getElementById('newOwnerReferringVet');
        if (vetSel && vetSel.options.length > 1 && Math.random() > 0.3) {
            var randomVetIdx = 1 + Math.floor(Math.random() * (vetSel.options.length - 1));
            vetSel.selectedIndex = randomVetIdx;
        }
        _setVal('newOwnerPhone', ownerPhones[ownerIdx]);
        _setVal('newVisitDate', _isoDate(new Date()));

        // ── Stile di Vita ──
        _setSelectVal('newPetLifestyle', _pick(['indoor', 'outdoor', 'misto']));
        var householdOpts = ['bambini', 'anziani', 'altri_cani', 'altri_gatti', 'altri_animali'];
        _setMultiSelectRandom('newPetHousehold', householdOpts, 0, 3);
        _setSelectVal('newPetActivityLevel', _pick(['basso', 'medio', 'alto']));
        _setSelectVal('newPetDietType', _pick(['secco', 'umido', 'barf', 'misto', 'casalingo']));

        var dietPrefs, conditions, meds, behavior;
        if (species === 'Gatto') {
            dietPrefs = dietPreferencesByGatto; conditions = knownConditionsByGatto;
            meds = currentMedsByGatto; behavior = behaviorNotesByGatto;
        } else if (species === 'Coniglio') {
            dietPrefs = dietPreferencesByConiglio; conditions = knownConditionsByConiglio;
            meds = currentMedsByConiglio; behavior = behaviorNotesByConiglio;
        } else {
            dietPrefs = dietPreferencesByCane; conditions = knownConditionsByCane;
            meds = currentMedsByCane; behavior = behaviorNotesByCane;
        }
        _setVal('newPetDietPreferences', _pick(dietPrefs));
        _setVal('newPetKnownConditions', _pick(conditions));
        _setVal('newPetCurrentMeds', _pick(meds));
        _setVal('newPetBehaviorNotes', _pick(behavior));
        _setVal('newPetLocation', _pick(locations));

        // Open lifestyle section so user sees the filled fields
        var lifeSec = document.getElementById('newPetLifestyleSection');
        if (lifeSec) lifeSec.style.display = '';

        if (typeof showToast === 'function') showToast('Dati test inseriti (incluso stile di vita)', 'success');
    };

    // ── TEST: Fill SOAP ──
    window.testFillSoap = function () {
        var idx = _rand(0, soapSubjective.length - 1);
        _setVal('soap-s', soapSubjective[idx]);
        _setVal('soap-o', soapObjective[idx]);
        _setVal('soap-a', soapAssessment[idx]);
        _setVal('soap-p', soapPlan[idx]);
        _setVal('soap-internal-notes', 'Nota interna di test: proprietario collaborativo, paziente tranquillo durante la visita.');

        // Set Titolo if empty
        var tplSel = document.getElementById('templateSelector');
        if (tplSel && !tplSel.value.trim()) {
            tplSel.value = 'Visita Generale';
            if (typeof onTemplateSelectorInput === 'function') onTemplateSelectorInput('Visita Generale');
        }

        try { if (typeof applyHideEmptyVisibility === 'function') applyHideEmptyVisibility(); } catch (e) {}
        if (typeof showToast === 'function') showToast('Dati SOAP test inseriti', 'success');
    };

    // ── TEST: Fill Vitals (10 records) ──
    window.testFillVitals = function () {
        if (typeof vitalsData === 'undefined') {
            if (typeof showToast === 'function') showToast('vitalsData non disponibile', 'error');
            return;
        }

        // Species-aware ranges
        var species = '';
        try { species = (typeof getPatientData === 'function' ? getPatientData().petSpecies : '') || ''; } catch (e) {}
        var weightRange, tempRange, hrRange, rrRange;

        if (species === 'Gatto') {
            weightRange = [3.0, 6.5]; tempRange = [38.0, 39.2]; hrRange = [140, 220]; rrRange = [20, 40];
        } else if (species === 'Coniglio') {
            weightRange = [1.5, 4.0]; tempRange = [38.5, 40.0]; hrRange = [180, 300]; rrRange = [30, 60];
        } else {
            // Default: Cane
            weightRange = [8.0, 35.0]; tempRange = [37.8, 39.2]; hrRange = [70, 140]; rrRange = [15, 35];
        }

        var baseWeight = _randFloat(weightRange[0], weightRange[1], 1);

        for (var i = 0; i < 10; i++) {
            var daysAgo = (10 - i) * _rand(5, 15);
            var d = _pastDate(daysAgo);
            d.setHours(_rand(8, 18), _rand(0, 59));
            vitalsData.push({
                date: d.toISOString(),
                weight: parseFloat((baseWeight + _randFloat(-0.5, 0.5, 1)).toFixed(1)),
                temp: _randFloat(tempRange[0], tempRange[1], 1),
                hr: _rand(hrRange[0], hrRange[1]),
                rr: _rand(rrRange[0], rrRange[1])
            });
        }

        if (typeof saveData === 'function') saveData();
        if (typeof updateVitalsChart === 'function') updateVitalsChart();
        if (typeof showToast === 'function') showToast('10 parametri vitali test registrati', 'success');
    };

    // ── TEST: Fill Medications (10 records) ──
    window.testFillMedications = function () {
        if (typeof medications === 'undefined') {
            if (typeof showToast === 'function') showToast('medications non disponibile', 'error');
            return;
        }

        // Pick 10 unique from pool
        var pool = testMedications.slice();
        var count = Math.min(10, pool.length);
        for (var i = 0; i < count; i++) {
            var idx = Math.floor(Math.random() * pool.length);
            var med = pool.splice(idx, 1)[0];
            medications.push({
                name: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                duration: med.duration,
                instructions: med.instructions
            });
        }

        if (typeof saveData === 'function') saveData();
        if (typeof renderMedications === 'function') renderMedications();
        if (typeof showToast === 'function') showToast('10 farmaci test aggiunti', 'success');
    };

    // ── TEST: Fill Photos (2-4 photos matching species) ──
    window.testFillPhotos = function () {
        if (typeof photos === 'undefined') {
            if (typeof showToast === 'function') showToast('photos non disponibile', 'error');
            return;
        }

        var species = '';
        try { species = (typeof getPatientData === 'function' ? getPatientData().petSpecies : '') || 'Altro'; } catch (e) { species = 'Altro'; }

        var count = _rand(2, 4);
        var newPhotos = _getPhotosForSpecies(species, count);
        newPhotos.forEach(function (p) { photos.push(p); });

        if (typeof renderPhotos === 'function') renderPhotos();
        if (typeof saveData === 'function') saveData();
        if (typeof showToast === 'function') showToast(count + ' foto test aggiunte (' + species + ')', 'success');
    };

})();
