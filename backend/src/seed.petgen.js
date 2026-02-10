// backend/src/seed.petgen.js – Knowledge base & pet profile generator for ADA seed engine
// PR-14
"use strict";

const { randomUUID } = require("crypto");

// ---------------------------------------------------------------------------
// 1. BREED_PATHOLOGIES  (27 breeds: 10 dogs, 10 cats, 7 rabbits)
// ---------------------------------------------------------------------------

const BREED_PATHOLOGIES = {
  // ========================  DOGS  ========================
  "Labrador Retriever": {
    species: "dog",
    pathologies: [
      {
        name: "Displasia dell'anca",
        clinicalKeywords: ["displasia", "anca", "zoppia", "articolazione"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.1 mg/kg", frequency: "SID", duration: "cronico", instructions: "FANS. Somministrare con il pasto." },
          { name: "Condroitin solfato + Glucosamina", dosage: "secondo peso", frequency: "SID", duration: "cronico", instructions: "Condroprotettore orale." },
        ],
        vitalAnomalies: { weight: "tendency_high" },
        promoTags: ["clinical:joint_issues", "nutraceutical:joint_support"],
        soapContext: "Zoppia posteriore, difficoltà nell'alzarsi dopo il riposo, riluttanza al salto.",
        docTypes: ["rx", "emocromocitometrico", "radiografia"],
      },
      {
        name: "Obesità",
        clinicalKeywords: ["obesità", "sovrappeso", "BCS elevato"],
        typicalMeds: [
          { name: "Dirlotapide", dosage: "0.01 mL/kg", frequency: "SID", duration: "6 mesi", instructions: "Inibitore MTP. Somministrare prima del pasto principale." },
        ],
        vitalAnomalies: { weight: "high", bcs: "8-9/9" },
        promoTags: ["clinical:weight_management", "nutrition:diet_food"],
        soapContext: "Aumento ponderale progressivo, BCS 8/9, scarsa attività fisica.",
        docTypes: ["profilo_biochimico", "piano_nutrizionale"],
      },
      {
        name: "Otite esterna cronica",
        clinicalKeywords: ["otite", "orecchio", "prurito auricolare", "cerume"],
        typicalMeds: [
          { name: "Osurnia (florfenicolo/terbinafina/betametasone)", dosage: "1 tubo/orecchio", frequency: "una tantum", duration: "ripetere dopo 7gg", instructions: "Applicazione auricolare. Non pulire il condotto per 45gg." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ear_issues", "hygiene:ear_cleaning"],
        soapContext: "Scuotimento della testa, grattamento auricolare, essudato ceruminoso abbondante.",
        docTypes: ["rx", "citologia_auricolare"],
      },
      {
        name: "Dermatite atopica",
        clinicalKeywords: ["dermatite", "atopia", "prurito", "allergia cutanea"],
        typicalMeds: [
          { name: "Oclacitinib (Apoquel)", dosage: "0.4-0.6 mg/kg", frequency: "BID x14gg poi SID", duration: "cronico", instructions: "Inibitore JAK. Può essere somministrato con o senza cibo." },
          { name: "Lokivetmab (Cytopoint)", dosage: "1-2 mg/kg", frequency: "ogni 4-8 settimane", duration: "cronico", instructions: "Iniezione SC in clinica." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "hygiene:dermatological_shampoo"],
        soapContext: "Prurito generalizzato, eritema ascellare e inguinale, lichenificazione cronica.",
        docTypes: ["rx", "citologia_cutanea", "profilo_allergologico"],
      },
    ],
  },

  "Pastore Tedesco": {
    species: "dog",
    pathologies: [
      {
        name: "Displasia dell'anca",
        clinicalKeywords: ["displasia", "anca", "zoppia posteriore"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.1 mg/kg", frequency: "SID", duration: "cronico", instructions: "FANS. Somministrare con il pasto." },
          { name: "Tramadolo", dosage: "2-5 mg/kg", frequency: "BID-TID", duration: "fase acuta", instructions: "Oppioide debole. Monitorare sedazione." },
        ],
        vitalAnomalies: { weight: "tendency_high" },
        promoTags: ["clinical:joint_issues", "nutraceutical:joint_support"],
        soapContext: "Andatura ondeggiante del treno posteriore, bunny hopping, dolore alla manipolazione coxofemorale.",
        docTypes: ["rx", "radiografia", "emocromocitometrico"],
      },
      {
        name: "Mielopatia degenerativa",
        clinicalKeywords: ["mielopatia", "atassia", "paraparesi"],
        typicalMeds: [
          { name: "Vitamina E", dosage: "400 UI/die", frequency: "SID", duration: "cronico", instructions: "Antiossidante neuroprotettivo." },
          { name: "Fisioterapia", dosage: "N/A", frequency: "2-3x/settimana", duration: "cronico", instructions: "Idroterapia e esercizi propriocettivi." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "rehab:physiotherapy"],
        soapContext: "Atassia progressiva degli arti posteriori, propriocezione ridotta, trascinamento delle unghie.",
        docTypes: ["visita_neurologica", "risonanza_magnetica"],
      },
      {
        name: "Insufficienza pancreatica esocrina (EPI)",
        clinicalKeywords: ["EPI", "pancreas", "maldigestione", "diarrea cronica"],
        typicalMeds: [
          { name: "Enzimi pancreatici (Creon)", dosage: "1-2 cucchiaini/pasto", frequency: "ad ogni pasto", duration: "cronico", instructions: "Mescolare al cibo 15 minuti prima del pasto." },
          { name: "Cobalamina (B12)", dosage: "250-1000 µg", frequency: "settimanale x6, poi mensile", duration: "cronico", instructions: "Iniezione SC. Monitorare livelli sierici." },
        ],
        vitalAnomalies: { weight: "low" },
        promoTags: ["clinical:gi_issues", "nutrition:digestive_support"],
        soapContext: "Dimagrimento progressivo nonostante polifagia, feci voluminose e giallastre, coprofagia.",
        docTypes: ["rx", "profilo_biochimico", "TLI_sierico"],
      },
      {
        name: "Panosteite",
        clinicalKeywords: ["panosteite", "zoppia migrante", "dolore osseo"],
        typicalMeds: [
          { name: "Carprofene", dosage: "2.2 mg/kg", frequency: "BID", duration: "10-14 giorni", instructions: "FANS. Con il pasto. Non associare ad altri FANS." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:bone_issues", "nutrition:growth_support"],
        soapContext: "Zoppia intermittente migrante, dolore alla pressione diafisaria delle ossa lunghe, soggetto giovane.",
        docTypes: ["rx", "radiografia"],
      },
    ],
  },

  "Golden Retriever": {
    species: "dog",
    pathologies: [
      {
        name: "Displasia del gomito",
        clinicalKeywords: ["displasia", "gomito", "zoppia anteriore"],
        typicalMeds: [
          { name: "Firocoxib (Previcox)", dosage: "5 mg/kg", frequency: "SID", duration: "cronico", instructions: "FANS COX-2 selettivo. Con il pasto." },
          { name: "Omega-3 EPA/DHA", dosage: "50-75 mg/kg EPA+DHA", frequency: "SID", duration: "cronico", instructions: "Integratore antinfiammatorio. Olio di pesce." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "nutraceutical:omega3"],
        soapContext: "Zoppia anteriore dopo il riposo, rigidità mattutina, crepitio alla flessione del gomito.",
        docTypes: ["rx", "radiografia", "TC_articolare"],
      },
      {
        name: "Dermatite atopica",
        clinicalKeywords: ["dermatite", "atopia", "prurito", "allergia"],
        typicalMeds: [
          { name: "Oclacitinib (Apoquel)", dosage: "0.4-0.6 mg/kg", frequency: "BID x14gg poi SID", duration: "cronico", instructions: "Inibitore JAK." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "hygiene:dermatological_shampoo"],
        soapContext: "Prurito cronico, pododermatite, eritema interdigitale.",
        docTypes: ["rx", "citologia_cutanea", "profilo_allergologico"],
      },
      {
        name: "Emangiosarcoma splenico",
        clinicalKeywords: ["emangiosarcoma", "milza", "neoplasia", "emoaddome"],
        typicalMeds: [
          { name: "Doxorubicina", dosage: "30 mg/m²", frequency: "ogni 21gg", duration: "5 cicli", instructions: "Chemioterapico EV. Monitorare funzione cardiaca." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:oncology"],
        soapContext: "Debolezza acuta, mucose pallide, distensione addominale, massa splenica ecograficamente rilevata.",
        docTypes: ["rx", "ecografia_addominale", "emocromocitometrico", "istologico"],
      },
      {
        name: "Ipotiroidismo",
        clinicalKeywords: ["ipotiroidismo", "tiroide", "letargia", "alopecia"],
        typicalMeds: [
          { name: "Levotiroxina", dosage: "0.02 mg/kg", frequency: "BID", duration: "cronico", instructions: "Somministrare a stomaco vuoto. Controllo T4 dopo 4-6 settimane." },
        ],
        vitalAnomalies: { weight: "tendency_high", heart_rate: "tendency_low" },
        promoTags: ["clinical:endocrine"],
        soapContext: "Letargia, aumento ponderale, alopecia tronculare simmetrica, coda a coda di topo.",
        docTypes: ["rx", "profilo_tiroideo", "profilo_biochimico"],
      },
    ],
  },

  "Bulldog Francese": {
    species: "dog",
    pathologies: [
      {
        name: "Sindrome brachicefalica (BOAS)",
        clinicalKeywords: ["brachicefalo", "BOAS", "stridore", "dispnea"],
        typicalMeds: [
          { name: "Desametasone", dosage: "0.1-0.2 mg/kg", frequency: "dose singola", duration: "emergenza", instructions: "Corticosteroide EV/IM. Solo in crisi acuta." },
        ],
        vitalAnomalies: { respiratory_rate: "tendency_high", temperature: "tendency_high" },
        promoTags: ["clinical:respiratory", "surgical:boas_correction"],
        soapContext: "Stridore inspiratorio cronico, russamento, intolleranza al calore e all'esercizio, episodi sincopali.",
        docTypes: ["rx", "radiografia_toracica", "endoscopia_vie_aeree"],
      },
      {
        name: "Ernia discale (IVDD)",
        clinicalKeywords: ["ernia", "disco", "IVDD", "paraparesi"],
        typicalMeds: [
          { name: "Prednisolone", dosage: "0.5-1 mg/kg", frequency: "BID x3gg poi scalare", duration: "7-14 giorni", instructions: "Corticosteroide. Scalare gradualmente." },
          { name: "Gabapentin", dosage: "5-10 mg/kg", frequency: "BID-TID", duration: "2-4 settimane", instructions: "Analgesico neuropatico. Può causare sedazione." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "surgical:spinal"],
        soapContext: "Dolore cervicale o toracolombare, riluttanza al movimento, paresi degli arti posteriori.",
        docTypes: ["rx", "risonanza_magnetica", "visita_neurologica"],
      },
      {
        name: "Dermatite delle pliche cutanee",
        clinicalKeywords: ["dermatite", "pliche", "intertrigo", "piodermite"],
        typicalMeds: [
          { name: "Clorexidina shampoo 3%", dosage: "applicazione topica", frequency: "2-3x/settimana", duration: "2-4 settimane", instructions: "Lasciare in posa 10 minuti. Asciugare bene le pliche." },
          { name: "Cefalexina", dosage: "22 mg/kg", frequency: "BID", duration: "21 giorni", instructions: "Antibiotico cefalosporinico. Completare il ciclo." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "hygiene:antiseptic_wipes"],
        soapContext: "Eritema e macerazione delle pliche facciali e della coda, odore sgradevole, essudato purulento.",
        docTypes: ["rx", "citologia_cutanea"],
      },
    ],
  },

  "Beagle": {
    species: "dog",
    pathologies: [
      {
        name: "Epilessia idiopatica",
        clinicalKeywords: ["epilessia", "convulsioni", "crisi epilettica"],
        typicalMeds: [
          { name: "Fenobarbital", dosage: "2.5-5 mg/kg", frequency: "BID", duration: "cronico", instructions: "Anticonvulsivante. Monitorare livelli sierici ogni 6 mesi. Non sospendere bruscamente." },
          { name: "Levetiracetam (Keppra)", dosage: "20 mg/kg", frequency: "TID", duration: "cronico", instructions: "Anticonvulsivante aggiuntivo. Buon profilo di sicurezza epatica." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological"],
        soapContext: "Crisi convulsive tonico-cloniche generalizzate, fase postictale prolungata, frequenza crisi in aumento.",
        docTypes: ["rx", "profilo_biochimico", "fenobarbitalemia"],
      },
      {
        name: "Ipotiroidismo",
        clinicalKeywords: ["ipotiroidismo", "tiroide", "letargia"],
        typicalMeds: [
          { name: "Levotiroxina", dosage: "0.02 mg/kg", frequency: "BID", duration: "cronico", instructions: "A stomaco vuoto. Controllo T4 dopo 4-6 settimane." },
        ],
        vitalAnomalies: { weight: "tendency_high" },
        promoTags: ["clinical:endocrine"],
        soapContext: "Letargia, aumento ponderale, mantello opaco e rado.",
        docTypes: ["rx", "profilo_tiroideo"],
      },
      {
        name: "Glaucoma",
        clinicalKeywords: ["glaucoma", "occhio", "pressione intraoculare"],
        typicalMeds: [
          { name: "Dorzolamide/Timololo collirio", dosage: "1 goccia/occhio", frequency: "BID-TID", duration: "cronico", instructions: "Collirio antiglaucomatoso. Monitorare IOP regolarmente." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ophthalmology"],
        soapContext: "Buftalmo, dolore oculare, midriasi fissa, edema corneale diffuso.",
        docTypes: ["rx", "visita_oftalmologica", "tonometria"],
      },
    ],
  },

  "Setter Irlandese": {
    species: "dog",
    pathologies: [
      {
        name: "Dilatazione-torsione gastrica (GDV)",
        clinicalKeywords: ["GDV", "torsione gastrica", "dilatazione", "addome acuto"],
        typicalMeds: [
          { name: "Metoclopramide", dosage: "0.2-0.5 mg/kg", frequency: "TID-QID", duration: "3-5 giorni post-chirurgico", instructions: "Procinetico. Infusione continua EV in fase acuta." },
        ],
        vitalAnomalies: { heart_rate: "high", respiratory_rate: "high" },
        promoTags: ["clinical:gi_emergencies", "surgical:gastropexy"],
        soapContext: "Distensione addominale acuta, tentativi improduttivi di vomito, ipersalivazione, stato di shock.",
        docTypes: ["rx", "radiografia_addominale", "emocromocitometrico", "profilo_biochimico"],
      },
      {
        name: "Enteropatia glutine-sensibile",
        clinicalKeywords: ["enteropatia", "glutine", "malassorbimento", "diarrea"],
        typicalMeds: [
          { name: "Dieta priva di glutine", dosage: "N/A", frequency: "permanente", duration: "cronico", instructions: "Eliminare cereali contenenti glutine dalla dieta." },
          { name: "Metronidazolo", dosage: "10-15 mg/kg", frequency: "BID", duration: "14-21 giorni", instructions: "Antimicrobico e antinfiammatorio intestinale." },
        ],
        vitalAnomalies: { weight: "low" },
        promoTags: ["clinical:gi_issues", "nutrition:grain_free"],
        soapContext: "Diarrea cronica, dimagrimento, scarsa qualità del mantello, enteropatia proteino-disperdente.",
        docTypes: ["profilo_biochimico", "biopsia_intestinale", "ecografia_addominale"],
      },
      {
        name: "Osteosarcoma",
        clinicalKeywords: ["osteosarcoma", "neoplasia ossea", "tumore"],
        typicalMeds: [
          { name: "Carprofene", dosage: "2.2 mg/kg", frequency: "BID", duration: "palliativo", instructions: "FANS per controllo del dolore." },
          { name: "Tramadolo", dosage: "2-5 mg/kg", frequency: "BID-TID", duration: "palliativo", instructions: "Oppioide debole aggiuntivo." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:oncology", "clinical:pain_management"],
        soapContext: "Tumefazione ossea dolorosa a carico delle ossa lunghe, zoppia ingravescente, frattura patologica.",
        docTypes: ["rx", "radiografia", "citologia", "istologico"],
      },
    ],
  },

  "Jack Russell Terrier": {
    species: "dog",
    pathologies: [
      {
        name: "Lussazione rotulea",
        clinicalKeywords: ["lussazione", "rotula", "ginocchio", "skipping"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.1 mg/kg", frequency: "SID", duration: "fase acuta", instructions: "FANS. Con il pasto." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "surgical:orthopedic"],
        soapContext: "Zoppia intermittente dell'arto posteriore, skipping, ginocchio in valgismo.",
        docTypes: ["rx", "radiografia", "visita_ortopedica"],
      },
      {
        name: "Malattia di Legg-Calvé-Perthes",
        clinicalKeywords: ["Legg-Perthes", "necrosi testa femorale", "anca"],
        typicalMeds: [
          { name: "Firocoxib (Previcox)", dosage: "5 mg/kg", frequency: "SID", duration: "pre-chirurgico", instructions: "FANS per gestione del dolore." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "surgical:orthopedic"],
        soapContext: "Zoppia progressiva monolaterale dell'arto posteriore, atrofia muscolare della coscia, soggetto giovane.",
        docTypes: ["radiografia", "visita_ortopedica"],
      },
      {
        name: "Atassia cerebellare ereditaria",
        clinicalKeywords: ["atassia", "cerebellare", "tremori intenzionali"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "cronico", instructions: "Gestione ambientale. Non esiste terapia specifica." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "genetic:screening"],
        soapContext: "Ipermetria, tremori intenzionali, base d'appoggio allargata, esordio in età giovanile.",
        docTypes: ["visita_neurologica", "test_genetico"],
      },
    ],
  },

  "Border Collie": {
    species: "dog",
    pathologies: [
      {
        name: "Anomalia dell'occhio del Collie (CEA)",
        clinicalKeywords: ["CEA", "coloboma", "displasia retinica"],
        typicalMeds: [
          { name: "Monitoraggio oftalmologico", dosage: "N/A", frequency: "ogni 6-12 mesi", duration: "cronico", instructions: "Controlli regolari del fondo oculare." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ophthalmology", "genetic:screening"],
        soapContext: "Coloboma del disco ottico, displasia retinica focale, possibile distacco retinico.",
        docTypes: ["visita_oftalmologica", "test_genetico"],
      },
      {
        name: "Displasia dell'anca",
        clinicalKeywords: ["displasia", "anca", "zoppia"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.1 mg/kg", frequency: "SID", duration: "cronico", instructions: "FANS. Con il pasto." },
          { name: "Condroitin solfato + Glucosamina", dosage: "secondo peso", frequency: "SID", duration: "cronico", instructions: "Condroprotettore orale." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "nutraceutical:joint_support"],
        soapContext: "Zoppia posteriore, riluttanza all'esercizio intenso, crepitio coxofemorale.",
        docTypes: ["rx", "radiografia"],
      },
      {
        name: "Epilessia idiopatica",
        clinicalKeywords: ["epilessia", "convulsioni", "crisi"],
        typicalMeds: [
          { name: "Imepitoin (Pexion)", dosage: "10-30 mg/kg", frequency: "BID", duration: "cronico", instructions: "Anticonvulsivante. Iniziare a dose bassa e titolare." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological"],
        soapContext: "Crisi convulsive focali o generalizzate, MRI encefalo nella norma.",
        docTypes: ["rx", "risonanza_magnetica", "profilo_biochimico"],
      },
      {
        name: "Lipofuscinosi ceroide neuronale (NCL)",
        clinicalKeywords: ["NCL", "lipofuscinosi", "demenza", "neurodegenerazione"],
        typicalMeds: [
          { name: "Terapia palliativa", dosage: "N/A", frequency: "N/A", duration: "cronico", instructions: "Gestione sintomatica. Patologia progressiva e fatale." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "genetic:screening"],
        soapContext: "Alterazioni comportamentali progressive, disorientamento, deficit visivo, convulsioni.",
        docTypes: ["visita_neurologica", "test_genetico"],
      },
    ],
  },

  "Cocker Spaniel": {
    species: "dog",
    pathologies: [
      {
        name: "Otite esterna cronica",
        clinicalKeywords: ["otite", "orecchio", "cerume", "prurito"],
        typicalMeds: [
          { name: "Osurnia", dosage: "1 tubo/orecchio", frequency: "una tantum", duration: "ripetere dopo 7gg", instructions: "Gel auricolare. Non pulire per 45gg." },
          { name: "Cefalexina", dosage: "22 mg/kg", frequency: "BID", duration: "21 giorni", instructions: "In caso di otite media associata." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ear_issues", "hygiene:ear_cleaning"],
        soapContext: "Otite esterna cronica recidivante, stenosi del condotto, otorrea purulenta.",
        docTypes: ["rx", "citologia_auricolare", "TC_bolle_timpaniche"],
      },
      {
        name: "Cheratocongiuntivite secca (KCS)",
        clinicalKeywords: ["KCS", "occhio secco", "cheratocongiuntivite"],
        typicalMeds: [
          { name: "Ciclosporina collirio 0.2%", dosage: "1 goccia/occhio", frequency: "BID", duration: "cronico", instructions: "Immunomodulatore topico. Effetto pieno dopo 4-6 settimane." },
          { name: "Lacrime artificiali", dosage: "1-2 gocce/occhio", frequency: "QID", duration: "cronico", instructions: "Lubrificante. Applicare frequentemente." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ophthalmology"],
        soapContext: "Secrezione mucopurulenta oculare, opacità corneale, test di Schirmer ridotto.",
        docTypes: ["rx", "visita_oftalmologica", "test_di_Schirmer"],
      },
      {
        name: "Cardiomiopatia dilatativa (DCM)",
        clinicalKeywords: ["DCM", "cardiomiopatia", "insufficienza cardiaca"],
        typicalMeds: [
          { name: "Pimobendan (Vetmedin)", dosage: "0.25-0.3 mg/kg", frequency: "BID", duration: "cronico", instructions: "Inodilatatore. Somministrare 1 ora prima del pasto." },
          { name: "Furosemide", dosage: "1-4 mg/kg", frequency: "BID-TID", duration: "cronico", instructions: "Diuretico. Monitorare funzione renale ed elettroliti." },
        ],
        vitalAnomalies: { heart_rate: "high", respiratory_rate: "tendency_high" },
        promoTags: ["clinical:cardiology"],
        soapContext: "Tosse notturna, intolleranza all'esercizio, soffio cardiaco, cardiomegalia radiografica.",
        docTypes: ["rx", "ecocardiografia", "radiografia_toracica", "ECG"],
      },
    ],
  },

  "Bassotto": {
    species: "dog",
    pathologies: [
      {
        name: "Ernia discale (IVDD)",
        clinicalKeywords: ["ernia", "disco", "IVDD", "paraplegia"],
        typicalMeds: [
          { name: "Prednisolone", dosage: "0.5-1 mg/kg", frequency: "BID x3gg poi scalare", duration: "7-14 giorni", instructions: "Corticosteroide antinfiammatorio." },
          { name: "Gabapentin", dosage: "5-10 mg/kg", frequency: "BID-TID", duration: "2-4 settimane", instructions: "Analgesico neuropatico." },
          { name: "Riposo forzato in gabbia", dosage: "N/A", frequency: "continuo", duration: "4-6 settimane", instructions: "Riposo assoluto. Uscite solo al guinzaglio corto per bisogni." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "surgical:spinal", "rehab:physiotherapy"],
        soapContext: "Dolore toracolombare acuto, riluttanza al movimento, paraparesi/paraplegia con o senza nocicezione profonda.",
        docTypes: ["rx", "risonanza_magnetica", "visita_neurologica"],
      },
      {
        name: "Obesità",
        clinicalKeywords: ["obesità", "sovrappeso", "BCS"],
        typicalMeds: [
          { name: "Dieta ipocalorica", dosage: "calcolo fabbisogno calorico", frequency: "quotidiano", duration: "fino a peso target", instructions: "Riduzione del 15-20% delle calorie. Dieta specifica weight management." },
        ],
        vitalAnomalies: { weight: "high" },
        promoTags: ["clinical:weight_management", "nutrition:diet_food"],
        soapContext: "BCS 8/9, sovraccarico articolare, rischio aumentato di IVDD.",
        docTypes: ["piano_nutrizionale", "profilo_biochimico"],
      },
      {
        name: "Malattia valvolare mitralica (MMVD)",
        clinicalKeywords: ["valvola mitrale", "soffio", "insufficienza cardiaca"],
        typicalMeds: [
          { name: "Pimobendan (Vetmedin)", dosage: "0.25-0.3 mg/kg", frequency: "BID", duration: "cronico", instructions: "Inodilatatore. 1 ora prima del pasto." },
          { name: "Benazepril", dosage: "0.25-0.5 mg/kg", frequency: "SID", duration: "cronico", instructions: "ACE-inibitore. Monitorare creatinina." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology"],
        soapContext: "Soffio sistolico mitralico, tosse, dispnea, intolleranza all'esercizio.",
        docTypes: ["rx", "ecocardiografia", "radiografia_toracica"],
      },
    ],
  },

  // ========================  CATS  ========================
  "Europeo": {
    species: "cat",
    pathologies: [
      {
        name: "Malattia renale cronica (CKD)",
        clinicalKeywords: ["CKD", "insufficienza renale", "rene", "poliuria"],
        typicalMeds: [
          { name: "Benazepril (Fortekor)", dosage: "0.5-1 mg/kg", frequency: "SID", duration: "cronico", instructions: "ACE-inibitore. Riduce proteinuria." },
          { name: "Dieta renale", dosage: "N/A", frequency: "permanente", duration: "cronico", instructions: "Restrizione proteica e fosforica. Renal diet commerciale." },
          { name: "Fluidi sottocutanei", dosage: "75-150 mL", frequency: "ogni 1-3 giorni", duration: "cronico", instructions: "Soluzione di Ringer lattato SC. Proprietario addestrato." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:renal", "nutrition:renal_diet"],
        soapContext: "Poliuria/polidipsia, dimagrimento, vomito intermittente, azotemia, IRIS stage II-III.",
        docTypes: ["rx", "profilo_biochimico", "esame_urine", "ecografia_addominale"],
      },
      {
        name: "Ipertiroidismo",
        clinicalKeywords: ["ipertiroidismo", "tiroide", "dimagrimento", "tachicardia"],
        typicalMeds: [
          { name: "Metimazolo (Felimazole)", dosage: "2.5 mg", frequency: "BID", duration: "cronico", instructions: "Antitiroideo. Controllo T4 dopo 3 settimane. Monitorare emocromo." },
        ],
        vitalAnomalies: { weight: "low", heart_rate: "high" },
        promoTags: ["clinical:endocrine"],
        soapContext: "Dimagrimento nonostante polifagia, tachicardia, vomito, iperattività, nodulo tiroideo palpabile.",
        docTypes: ["rx", "profilo_tiroideo", "profilo_biochimico", "ecocardiografia"],
      },
      {
        name: "Cistite idiopatica felina (FIC)",
        clinicalKeywords: ["cistite", "FLUTD", "stranguria", "ematuria"],
        typicalMeds: [
          { name: "Maropitant (Cerenia)", dosage: "1 mg/kg", frequency: "SID", duration: "5 giorni", instructions: "Antiemetico e analgesico viscerale." },
          { name: "Cimicoxib", dosage: "2 mg/kg", frequency: "SID", duration: "5 giorni", instructions: "FANS. Solo se non ostruito." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:urinary", "nutrition:urinary_diet", "environment:stress_reduction"],
        soapContext: "Stranguria, pollachiuria, ematuria, vocalizzazione durante la minzione, periuria.",
        docTypes: ["rx", "esame_urine", "ecografia_addominale"],
      },
    ],
  },

  "Persiano": {
    species: "cat",
    pathologies: [
      {
        name: "Rene policistico (PKD)",
        clinicalKeywords: ["PKD", "rene policistico", "cisti renali"],
        typicalMeds: [
          { name: "Benazepril", dosage: "0.5-1 mg/kg", frequency: "SID", duration: "cronico", instructions: "ACE-inibitore nefroprotettivo." },
          { name: "Dieta renale", dosage: "N/A", frequency: "permanente", duration: "cronico", instructions: "Restrizione proteica e fosforica." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:renal", "genetic:screening", "nutrition:renal_diet"],
        soapContext: "Reni ingranditi e irregolari alla palpazione, multiple cisti ecografiche, azotemia progressiva.",
        docTypes: ["ecografia_addominale", "profilo_biochimico", "test_genetico"],
      },
      {
        name: "Sequestro corneale",
        clinicalKeywords: ["sequestro", "cornea", "placca bruna"],
        typicalMeds: [
          { name: "Tobramicina collirio", dosage: "1 goccia/occhio", frequency: "TID", duration: "pre/post-chirurgico", instructions: "Antibiotico topico." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ophthalmology", "surgical:corneal"],
        soapContext: "Placca bruna/nera corneale centrale, blefarospasmo, epifora cronica.",
        docTypes: ["rx", "visita_oftalmologica"],
      },
      {
        name: "Dermatite da Malassezia facciale",
        clinicalKeywords: ["Malassezia", "dermatite", "facciale", "pliche"],
        typicalMeds: [
          { name: "Itraconazolo", dosage: "5 mg/kg", frequency: "SID, settimane alternate", duration: "6-8 settimane", instructions: "Antimicotico. Somministrare con il pasto grasso." },
          { name: "Clorexidina/miconazolo shampoo", dosage: "topico", frequency: "2x/settimana", duration: "4 settimane", instructions: "Lavaggio delicato delle pliche facciali." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "hygiene:facial_cleaning"],
        soapContext: "Eritema e materiale brunastro nelle pliche facciali, prurito facciale, epifora cronica.",
        docTypes: ["rx", "citologia_cutanea"],
      },
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "ipertrofica", "soffio"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante. Monitorare frequenza cardiaca." },
          { name: "Clopidogrel", dosage: "18.75 mg/gatto", frequency: "SID", duration: "cronico", instructions: "Antiaggregante. Prevenzione tromboembolismo." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology"],
        soapContext: "Soffio sistolico dinamico, ritmo di galoppo, dispnea, rischio tromboembolismo aortico.",
        docTypes: ["ecocardiografia", "rx", "radiografia_toracica", "ECG"],
      },
    ],
  },

  "Siamese": {
    species: "cat",
    pathologies: [
      {
        name: "Amiloidosi epatica",
        clinicalKeywords: ["amiloidosi", "fegato", "epatopatia"],
        typicalMeds: [
          { name: "Colchicina", dosage: "0.025 mg/kg", frequency: "SID", duration: "cronico", instructions: "Inibitore deposizione amiloide. Monitorare funzione GI." },
          { name: "Acido ursodesossicolico (UDCA)", dosage: "10-15 mg/kg", frequency: "SID", duration: "cronico", instructions: "Epatoprotettore. Con il pasto." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:hepatic", "genetic:screening"],
        soapContext: "Epatomegalia, ittero, ascite, rottura epatica spontanea in casi gravi.",
        docTypes: ["profilo_biochimico", "ecografia_addominale", "biopsia_epatica"],
      },
      {
        name: "Asma felina",
        clinicalKeywords: ["asma", "bronchite", "tosse", "dispnea"],
        typicalMeds: [
          { name: "Fluticasone inalatorio (AeroKat)", dosage: "125 µg", frequency: "BID", duration: "cronico", instructions: "Corticosteroide inalatorio. Usare camera di inalazione felina." },
          { name: "Salbutamolo inalatorio", dosage: "100 µg", frequency: "al bisogno", duration: "emergenza", instructions: "Broncodilatatore rescue. Max 2-3 puff." },
        ],
        vitalAnomalies: { respiratory_rate: "tendency_high" },
        promoTags: ["clinical:respiratory", "environment:allergen_reduction"],
        soapContext: "Tosse cronica, dispnea espiratoria, wheezing, pattern bronchiale radiografico.",
        docTypes: ["rx", "radiografia_toracica", "lavaggio_broncoalveolare"],
      },
      {
        name: "Strabismo convergente congenito",
        clinicalKeywords: ["strabismo", "convergente", "esotropia"],
        typicalMeds: [
          { name: "Nessuna terapia necessaria", dosage: "N/A", frequency: "N/A", duration: "N/A", instructions: "Condizione ereditaria benigna. Non richiede trattamento." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:ophthalmology"],
        soapContext: "Strabismo convergente bilaterale, visione funzionalmente normale, reperto caratteristico di razza.",
        docTypes: ["visita_oftalmologica"],
      },
    ],
  },

  "Maine Coon": {
    species: "cat",
    pathologies: [
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "ipertrofica", "cuore"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante." },
          { name: "Clopidogrel", dosage: "18.75 mg/gatto", frequency: "SID", duration: "cronico", instructions: "Antiaggregante piastrinico. Prevenzione ATE." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology", "genetic:screening"],
        soapContext: "Soffio cardiaco, ritmo di galoppo, possibile tromboembolismo aortico, test MyBPC3 positivo.",
        docTypes: ["ecocardiografia", "rx", "test_genetico", "ECG"],
      },
      {
        name: "Displasia dell'anca",
        clinicalKeywords: ["displasia", "anca", "zoppia"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.05 mg/kg", frequency: "SID", duration: "cicli di 5gg", instructions: "FANS. Dose felina ridotta. Con il pasto. Monitorare funzione renale." },
        ],
        vitalAnomalies: { weight: "tendency_high" },
        promoTags: ["clinical:joint_issues"],
        soapContext: "Zoppia posteriore, riluttanza al salto, dolore alla manipolazione dell'anca.",
        docTypes: ["radiografia", "visita_ortopedica"],
      },
      {
        name: "Atrofia muscolare spinale (SMA)",
        clinicalKeywords: ["SMA", "atrofia muscolare", "debolezza"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "cronico", instructions: "Gestione ambientale. Facilitare accesso a risorse." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "genetic:screening"],
        soapContext: "Debolezza muscolare progressiva degli arti posteriori, tremori, andatura plantigrada.",
        docTypes: ["visita_neurologica", "test_genetico"],
      },
    ],
  },

  "British Shorthair": {
    species: "cat",
    pathologies: [
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "cuore"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante." },
          { name: "Clopidogrel", dosage: "18.75 mg/gatto", frequency: "SID", duration: "cronico", instructions: "Antiaggregante." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology"],
        soapContext: "Ritmo di galoppo, dispnea, effusione pleurica, rischio tromboembolia.",
        docTypes: ["ecocardiografia", "radiografia_toracica", "ECG"],
      },
      {
        name: "Obesità",
        clinicalKeywords: ["obesità", "sovrappeso", "BCS"],
        typicalMeds: [
          { name: "Dieta ipocalorica", dosage: "calcolo fabbisogno", frequency: "quotidiano", duration: "fino a peso target", instructions: "Dieta metabolic/weight management. Razionare le crocchette." },
        ],
        vitalAnomalies: { weight: "high" },
        promoTags: ["clinical:weight_management", "nutrition:diet_food"],
        soapContext: "BCS 8-9/9, scarsa attività, predisposizione al diabete mellito.",
        docTypes: ["profilo_biochimico", "piano_nutrizionale"],
      },
      {
        name: "Malattia del rene policistico (PKD)",
        clinicalKeywords: ["PKD", "cisti renali", "rene policistico"],
        typicalMeds: [
          { name: "Benazepril", dosage: "0.5-1 mg/kg", frequency: "SID", duration: "cronico", instructions: "ACE-inibitore nefroprotettivo." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:renal", "genetic:screening"],
        soapContext: "Nefromegalia bilaterale, cisti renali multiple all'ecografia.",
        docTypes: ["ecografia_addominale", "profilo_biochimico", "test_genetico"],
      },
    ],
  },

  "Ragdoll": {
    species: "cat",
    pathologies: [
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "cuore", "soffio"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante. Riduce ostruzione LVOT." },
          { name: "Clopidogrel", dosage: "18.75 mg/gatto", frequency: "SID", duration: "cronico", instructions: "Prevenzione tromboembolismo." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology", "genetic:screening"],
        soapContext: "SAM, ostruzione LVOT, rischio ATE, test MYBPC3-A31P.",
        docTypes: ["ecocardiografia", "test_genetico", "ECG"],
      },
      {
        name: "Calcoli vescicali (ossalato di calcio)",
        clinicalKeywords: ["urolitiasi", "calcoli", "ossalato", "FLUTD"],
        typicalMeds: [
          { name: "Dieta urinaria", dosage: "N/A", frequency: "permanente", duration: "cronico", instructions: "Dieta per prevenzione ossalato di calcio. Aumentare l'idratazione." },
          { name: "Citrato di potassio", dosage: "40-75 mg/kg", frequency: "BID", duration: "cronico", instructions: "Alcalinizzante urinario." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:urinary", "nutrition:urinary_diet"],
        soapContext: "Stranguria, ematuria, calcoli radiopachi in vescica, pH urinario acido.",
        docTypes: ["rx", "radiografia_addominale", "esame_urine", "ecografia_addominale"],
      },
      {
        name: "Criptorchidismo",
        clinicalKeywords: ["criptorchidismo", "testicolo ritenuto"],
        typicalMeds: [
          { name: "Orchiectomia bilaterale", dosage: "N/A", frequency: "una tantum", duration: "chirurgico", instructions: "Castrazione con rimozione testicolo ritenuto. Rischio neoplastico." },
        ],
        vitalAnomalies: {},
        promoTags: ["surgical:soft_tissue"],
        soapContext: "Testicolo non palpabile nello scroto, testicolo ritenuto in addome o canale inguinale.",
        docTypes: ["ecografia_addominale", "visita_chirurgica"],
      },
    ],
  },

  "Bengala": {
    species: "cat",
    pathologies: [
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "cuore"],
        typicalMeds: [
          { name: "Diltiazem", dosage: "1.5-2.5 mg/kg", frequency: "TID (o SR BID)", duration: "cronico", instructions: "Calcio-antagonista. Formulazione SR preferita." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology", "genetic:screening"],
        soapContext: "Ipertrofia settale asimmetrica, SAM, rischio tromboembolismo.",
        docTypes: ["ecocardiografia", "ECG"],
      },
      {
        name: "Lussazione rotulea",
        clinicalKeywords: ["lussazione", "rotula", "ginocchio"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.05 mg/kg", frequency: "SID", duration: "cicli brevi", instructions: "FANS dose felina. Fase acuta." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "surgical:orthopedic"],
        soapContext: "Zoppia intermittente posteriore, lussazione rotulea mediale grado II-III.",
        docTypes: ["radiografia", "visita_ortopedica"],
      },
      {
        name: "Neuropatia distale progressiva",
        clinicalKeywords: ["neuropatia", "atassia", "debolezza distale"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "cronico", instructions: "Gestione ambientale, fisioterapia leggera." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "genetic:screening"],
        soapContext: "Andatura plantigrada/palmitigrada, atassia progressiva, deficit propriocettivi.",
        docTypes: ["visita_neurologica", "elettromiografia"],
      },
    ],
  },

  "Sphynx": {
    species: "cat",
    pathologies: [
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "cuore"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology", "genetic:screening"],
        soapContext: "Ipertrofia ventricolare sinistra, possibile ostruzione outflow.",
        docTypes: ["ecocardiografia", "ECG"],
      },
      {
        name: "Dermatite sebacea (produzione eccessiva di sebo)",
        clinicalKeywords: ["sebo", "dermatite", "pelle grassa", "acne"],
        typicalMeds: [
          { name: "Bagni con shampoo delicato", dosage: "topico", frequency: "1-2x/settimana", duration: "cronico", instructions: "Shampoo idratante delicato. Asciugare completamente dopo il bagno." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "hygiene:skin_care"],
        soapContext: "Accumulo di sebo brunastro sulla pelle, comedoni, pieghe cutanee unte.",
        docTypes: ["citologia_cutanea"],
      },
      {
        name: "Orticaria pigmentosa (mastocitosi cutanea)",
        clinicalKeywords: ["orticaria", "mastocitosi", "lesioni cutanee"],
        typicalMeds: [
          { name: "Cetirizina", dosage: "5 mg/gatto", frequency: "SID", duration: "cronico", instructions: "Antistaminico H1. Controllo del prurito." },
          { name: "Famotidina", dosage: "0.5 mg/kg", frequency: "SID-BID", duration: "cronico", instructions: "Antistaminico H2. Protezione gastrica." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:skin_issues", "clinical:dermatology"],
        soapContext: "Papule e croste crostose disseminate, prurito variabile, degranulazione mastocitaria.",
        docTypes: ["rx", "citologia_cutanea", "biopsia_cutanea"],
      },
    ],
  },

  "Norvegese": {
    species: "cat",
    pathologies: [
      {
        name: "Glicogenosi di tipo IV (GSD IV)",
        clinicalKeywords: ["glicogenosi", "GSD IV", "ipoglicemia"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "N/A", instructions: "Patologia fatale ad esordio precoce. Screening genetico dei riproduttori." },
        ],
        vitalAnomalies: { temperature: "tendency_low" },
        promoTags: ["genetic:screening"],
        soapContext: "Morte neonatale o debolezza neuromuscolare progressiva nei gattini, ipertermia, contratture.",
        docTypes: ["test_genetico"],
      },
      {
        name: "Displasia dell'anca",
        clinicalKeywords: ["displasia", "anca", "zoppia"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.05 mg/kg", frequency: "SID", duration: "cicli brevi", instructions: "FANS dose felina." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues"],
        soapContext: "Zoppia, riluttanza al salto, dolore alla rotazione esterna dell'anca.",
        docTypes: ["radiografia", "visita_ortopedica"],
      },
      {
        name: "Cardiomiopatia ipertrofica (HCM)",
        clinicalKeywords: ["HCM", "cardiomiopatia", "cuore"],
        typicalMeds: [
          { name: "Atenololo", dosage: "6.25-12.5 mg/gatto", frequency: "SID-BID", duration: "cronico", instructions: "Beta-bloccante." },
        ],
        vitalAnomalies: { heart_rate: "tendency_high" },
        promoTags: ["clinical:cardiology"],
        soapContext: "Ipertrofia ventricolare, soffio cardiaco, rischio ATE.",
        docTypes: ["ecocardiografia", "ECG"],
      },
    ],
  },

  "Certosino": {
    species: "cat",
    pathologies: [
      {
        name: "Lussazione rotulea",
        clinicalKeywords: ["lussazione", "rotula", "ginocchio"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.05 mg/kg", frequency: "SID", duration: "cicli brevi", instructions: "FANS dose felina." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:joint_issues", "surgical:orthopedic"],
        soapContext: "Zoppia intermittente, lussazione rotulea mediale bilaterale.",
        docTypes: ["radiografia", "visita_ortopedica"],
      },
      {
        name: "Calcoli di struvite",
        clinicalKeywords: ["struvite", "calcoli", "FLUTD", "cristalluria"],
        typicalMeds: [
          { name: "Dieta di dissoluzione struvite", dosage: "N/A", frequency: "permanente (fase acuta)", duration: "2-4 mesi", instructions: "Dieta acidificante. Monitorare pH urinario." },
          { name: "Amoxicillina/acido clavulanico", dosage: "12.5-25 mg/kg", frequency: "BID", duration: "14-21 giorni", instructions: "Se infezione urinaria associata." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:urinary", "nutrition:urinary_diet"],
        soapContext: "Stranguria, pollachiuria, cristalli di struvite nel sedimento urinario.",
        docTypes: ["rx", "esame_urine", "radiografia_addominale", "ecografia_addominale"],
      },
      {
        name: "Obesità",
        clinicalKeywords: ["obesità", "sovrappeso"],
        typicalMeds: [
          { name: "Dieta ipocalorica", dosage: "calcolo fabbisogno", frequency: "quotidiano", duration: "fino a peso target", instructions: "Arricchimento ambientale per aumentare attività." },
        ],
        vitalAnomalies: { weight: "high" },
        promoTags: ["clinical:weight_management", "nutrition:diet_food"],
        soapContext: "BCS 8/9, gatto indoor sedentario, rischio diabete mellito.",
        docTypes: ["profilo_biochimico", "piano_nutrizionale"],
      },
    ],
  },

  // ========================  RABBITS  ========================
  "Ariete Nano": {
    species: "rabbit",
    pathologies: [
      {
        name: "Malocclusione dentale",
        clinicalKeywords: ["malocclusione", "denti", "molare", "ascesso"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.3-0.6 mg/kg", frequency: "SID-BID", duration: "5-7 giorni", instructions: "FANS. Somministrare PO con siringa." },
          { name: "Limatura dentale", dosage: "N/A", frequency: "ogni 4-8 settimane", duration: "cronico", instructions: "Correzione sotto sedazione. Monitorare crescita." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:dental", "nutrition:hay_based_diet"],
        soapContext: "Iporessia, scialorrea, lacrimazione (dacriocistite da compressione), dimagrimento.",
        docTypes: ["rx", "radiografia_cranio", "visita_odontoiatrica"],
      },
      {
        name: "Pasteurellosi",
        clinicalKeywords: ["Pasteurella", "rinite", "starnuti", "ascesso"],
        typicalMeds: [
          { name: "Enrofloxacina", dosage: "10-20 mg/kg", frequency: "SID-BID", duration: "14-28 giorni", instructions: "Fluorochinolone. PO o SC. Cicli prolungati." },
          { name: "Nebulizzazione con gentamicina", dosage: "50 mg in 10 mL NaCl", frequency: "BID", duration: "10-14 giorni", instructions: "Nebulizzazione 15 min. Per rinite." },
        ],
        vitalAnomalies: { temperature: "tendency_high" },
        promoTags: ["clinical:respiratory", "clinical:infectious"],
        soapContext: "Scolo nasale mucopurulento, starnuti, head tilt (otite media), ascessi sottocutanei.",
        docTypes: ["rx", "coltura_antibiogramma", "radiografia_cranio"],
      },
      {
        name: "Encefalitozoonosi (E. cuniculi)",
        clinicalKeywords: ["Encephalitozoon", "head tilt", "atassia", "paresi"],
        typicalMeds: [
          { name: "Fenbendazolo", dosage: "20 mg/kg", frequency: "SID", duration: "28 giorni", instructions: "Antiparassitario. PO con siringa." },
          { name: "Meloxicam", dosage: "0.3 mg/kg", frequency: "SID", duration: "7-14 giorni", instructions: "Antinfiammatorio di supporto." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "clinical:parasitic"],
        soapContext: "Head tilt acuto, nistagmo, atassia, rotolamento, possibile insufficienza renale.",
        docTypes: ["rx", "sierologia_E_cuniculi", "esame_urine"],
      },
    ],
  },

  "Testa di Leone": {
    species: "rabbit",
    pathologies: [
      {
        name: "Stasi gastrointestinale (GI stasis)",
        clinicalKeywords: ["stasi", "ileo", "anoressia", "timpanismo"],
        typicalMeds: [
          { name: "Metoclopramide", dosage: "0.5 mg/kg", frequency: "BID-TID", duration: "3-5 giorni", instructions: "Procinetico. Non usare se ostruzione sospetta." },
          { name: "Simeticone", dosage: "40-100 mg/coniglio", frequency: "TID", duration: "fino a risoluzione", instructions: "Antischiumogeno. Per meteorismo." },
          { name: "Alimentazione assistita (Critical Care)", dosage: "10-20 mL/kg", frequency: "QID", duration: "fino a ripresa alimentazione", instructions: "Con siringa. Fondamentale il supporto nutrizionale." },
        ],
        vitalAnomalies: { temperature: "tendency_low" },
        promoTags: ["clinical:gi_issues", "nutrition:fiber_support"],
        soapContext: "Anoressia acuta, feci assenti o piccole e secche, addome teso e dolente, ipotermia.",
        docTypes: ["rx", "radiografia_addominale"],
      },
      {
        name: "Malocclusione incisivi",
        clinicalKeywords: ["malocclusione", "incisivi", "denti"],
        typicalMeds: [
          { name: "Limatura/estrazione incisivi", dosage: "N/A", frequency: "periodica", duration: "cronico", instructions: "Correzione sotto sedazione. Valutare estrazione definitiva." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:dental"],
        soapContext: "Incisivi sovraccresciuti, impossibilità di alimentarsi normalmente.",
        docTypes: ["radiografia_cranio", "visita_odontoiatrica"],
      },
      {
        name: "Dermatite da Cheyletiella",
        clinicalKeywords: ["Cheyletiella", "forfora", "prurito", "acaro"],
        typicalMeds: [
          { name: "Selamectina (Stronghold)", dosage: "6-18 mg/kg", frequency: "ogni 2 settimane x3", duration: "6 settimane", instructions: "Spot-on. Trattare tutti i conigli conviventi." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:parasitic", "hygiene:antiparasitic"],
        soapContext: "Forfora abbondante (\"walking dandruff\"), prurito dorsale, alopecia.",
        docTypes: ["rx", "scotch_test", "raschiato_cutaneo"],
      },
    ],
  },

  "Rex": {
    species: "rabbit",
    pathologies: [
      {
        name: "Pododermatite ulcerativa (bumblefoot)",
        clinicalKeywords: ["pododermatite", "bumblefoot", "ulcera plantare"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.3-0.6 mg/kg", frequency: "SID", duration: "7-14 giorni", instructions: "FANS analgesico." },
          { name: "Cefalexina", dosage: "15-25 mg/kg", frequency: "BID", duration: "14-28 giorni", instructions: "Antibiotico. Se infezione secondaria." },
          { name: "Bendaggi imbottiti", dosage: "N/A", frequency: "cambio ogni 2-3 giorni", duration: "fino a guarigione", instructions: "Protezione plantare. Substrato morbido obbligatorio." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:dermatology", "housing:soft_bedding"],
        soapContext: "Ulcere plantari bilaterali, dolore alla deambulazione, riluttanza al movimento. Pelo plantare sottile tipico del Rex.",
        docTypes: ["rx", "citologia", "coltura_antibiogramma"],
      },
      {
        name: "Stasi gastrointestinale",
        clinicalKeywords: ["stasi", "ileo", "anoressia"],
        typicalMeds: [
          { name: "Metoclopramide", dosage: "0.5 mg/kg", frequency: "BID-TID", duration: "3-5 giorni", instructions: "Procinetico." },
          { name: "Alimentazione assistita", dosage: "10-20 mL/kg", frequency: "QID", duration: "fino a ripresa", instructions: "Critical Care con siringa." },
        ],
        vitalAnomalies: { temperature: "tendency_low" },
        promoTags: ["clinical:gi_issues", "nutrition:fiber_support"],
        soapContext: "Anoressia, feci ridotte/assenti, meteorismo.",
        docTypes: ["rx", "radiografia_addominale"],
      },
      {
        name: "Mixomatosi",
        clinicalKeywords: ["mixomatosi", "mixoma", "edema palpebrale"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "2-4 settimane", instructions: "Fluidoterapia, alimentazione assistita, antibiotici per infezioni secondarie." },
          { name: "Enrofloxacina", dosage: "10 mg/kg", frequency: "SID", duration: "14 giorni", instructions: "Prevenzione infezioni batteriche secondarie." },
        ],
        vitalAnomalies: { temperature: "high" },
        promoTags: ["clinical:infectious", "prevention:vaccination"],
        soapContext: "Edema palpebrale e genitale, mixomi cutanei, letargia, anoressia. Vaccinazione profilattica raccomandata.",
        docTypes: ["rx", "visita_clinica"],
      },
    ],
  },

  "Angora": {
    species: "rabbit",
    pathologies: [
      {
        name: "Tricobezoari (blocco da pelo)",
        clinicalKeywords: ["tricobezoario", "pelo", "ostruzione", "stasi"],
        typicalMeds: [
          { name: "Metoclopramide", dosage: "0.5 mg/kg", frequency: "BID-TID", duration: "3-5 giorni", instructions: "Procinetico. Non usare se ostruzione completa sospetta." },
          { name: "Alimentazione assistita", dosage: "10-20 mL/kg", frequency: "QID", duration: "fino a risoluzione", instructions: "Critical Care. Idratazione fondamentale." },
          { name: "Fluidoterapia SC", dosage: "50-100 mL/kg/die", frequency: "suddivisa in 2-3 somministrazioni", duration: "3-5 giorni", instructions: "NaCl 0.9% o Ringer lattato SC." },
        ],
        vitalAnomalies: { temperature: "tendency_low" },
        promoTags: ["clinical:gi_issues", "grooming:regular_brushing"],
        soapContext: "Anoressia, feci piccole collegate da pelo, distensione gastrica, disidratazione. Pelo lungo predisponente.",
        docTypes: ["rx", "radiografia_addominale"],
      },
      {
        name: "Dermatite da Cheyletiella",
        clinicalKeywords: ["Cheyletiella", "forfora", "ectoparassiti"],
        typicalMeds: [
          { name: "Selamectina", dosage: "6-18 mg/kg", frequency: "ogni 2 settimane x3", duration: "6 settimane", instructions: "Spot-on antiparassitario." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:parasitic", "grooming:regular_brushing"],
        soapContext: "Forfora abbondante, prurito, alopecia, difficoltà nella toelettatura del pelo lungo.",
        docTypes: ["rx", "scotch_test"],
      },
      {
        name: "Colpo di calore",
        clinicalKeywords: ["ipertermia", "colpo di calore", "dispnea"],
        typicalMeds: [
          { name: "Raffreddamento graduale", dosage: "N/A", frequency: "emergenza", duration: "fino a normotermia", instructions: "Panni umidi freschi (non ghiacciati), ventilazione, fluidoterapia EV." },
          { name: "Fluidoterapia EV", dosage: "10 mL/kg/h", frequency: "continua", duration: "fino a stabilizzazione", instructions: "Ringer lattato. Monitorare temperatura rettale ogni 10 min." },
        ],
        vitalAnomalies: { temperature: "high", respiratory_rate: "high", heart_rate: "high" },
        promoTags: ["clinical:emergency", "housing:temperature_control"],
        soapContext: "Dispnea grave, ipertermia >40.5°C, prostrazione, pelo lungo come fattore predisponente.",
        docTypes: ["profilo_biochimico", "emocromocitometrico"],
      },
    ],
  },

  "Olandese Nano": {
    species: "rabbit",
    pathologies: [
      {
        name: "Malocclusione dentale",
        clinicalKeywords: ["malocclusione", "denti", "molare"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.3-0.6 mg/kg", frequency: "SID", duration: "5-7 giorni", instructions: "FANS analgesico." },
          { name: "Limatura dentale", dosage: "N/A", frequency: "ogni 4-8 settimane", duration: "cronico", instructions: "Sotto sedazione." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:dental", "nutrition:hay_based_diet"],
        soapContext: "Iporessia, scialorrea, dimagrimento, brachignatismo tipico delle razze nane.",
        docTypes: ["rx", "radiografia_cranio", "visita_odontoiatrica"],
      },
      {
        name: "Encefalitozoonosi",
        clinicalKeywords: ["Encephalitozoon", "head tilt", "atassia"],
        typicalMeds: [
          { name: "Fenbendazolo", dosage: "20 mg/kg", frequency: "SID", duration: "28 giorni", instructions: "Antiparassitario PO." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:neurological", "clinical:parasitic"],
        soapContext: "Head tilt, nistagmo, rolling, deficit propriocettivi.",
        docTypes: ["rx", "sierologia_E_cuniculi"],
      },
      {
        name: "Obesità",
        clinicalKeywords: ["obesità", "sovrappeso"],
        typicalMeds: [
          { name: "Dieta ricca di fieno", dosage: "fieno illimitato", frequency: "quotidiano", duration: "cronico", instructions: "80% della dieta deve essere fieno. Limitare pellet e verdure zuccherine." },
        ],
        vitalAnomalies: { weight: "high" },
        promoTags: ["clinical:weight_management", "nutrition:hay_based_diet"],
        soapContext: "Depositi adiposi inguinali e sottoscapolari, impossibilità di ciecotrofia, pododermatite secondaria.",
        docTypes: ["piano_nutrizionale"],
      },
    ],
  },

  "Hotot": {
    species: "rabbit",
    pathologies: [
      {
        name: "Malocclusione dentale",
        clinicalKeywords: ["malocclusione", "denti", "crescita eccessiva"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.3-0.6 mg/kg", frequency: "SID", duration: "5-7 giorni", instructions: "FANS." },
          { name: "Limatura dentale", dosage: "N/A", frequency: "periodica", duration: "cronico", instructions: "Sotto sedazione. Dieta a base di fieno per usura naturale." },
        ],
        vitalAnomalies: { weight: "tendency_low" },
        promoTags: ["clinical:dental", "nutrition:hay_based_diet"],
        soapContext: "Iporessia, scialorrea, punte molari, ascesso mandibolare.",
        docTypes: ["rx", "radiografia_cranio"],
      },
      {
        name: "Enterite mucoide",
        clinicalKeywords: ["enterite", "diarrea", "muco", "disbiosi"],
        typicalMeds: [
          { name: "Metronidazolo", dosage: "20 mg/kg", frequency: "BID", duration: "7-10 giorni", instructions: "Antimicrobico intestinale." },
          { name: "Alimentazione assistita", dosage: "10-20 mL/kg", frequency: "QID", duration: "fino a risoluzione", instructions: "Critical Care. Fondamentale reidratazione." },
        ],
        vitalAnomalies: { temperature: "tendency_low" },
        promoTags: ["clinical:gi_issues", "nutrition:probiotic_support"],
        soapContext: "Diarrea mucosa, disidratazione, meteorismo, dieta povera di fibra come fattore scatenante.",
        docTypes: ["rx", "esame_feci", "radiografia_addominale"],
      },
      {
        name: "Pasteurellosi",
        clinicalKeywords: ["Pasteurella", "rinite", "ascesso"],
        typicalMeds: [
          { name: "Enrofloxacina", dosage: "10-20 mg/kg", frequency: "SID", duration: "14-28 giorni", instructions: "Fluorochinolone PO." },
        ],
        vitalAnomalies: { temperature: "tendency_high" },
        promoTags: ["clinical:respiratory", "clinical:infectious"],
        soapContext: "Scolo nasale purulento, starnuti cronici, ascessi sottocutanei.",
        docTypes: ["rx", "coltura_antibiogramma"],
      },
    ],
  },

  "Californiano": {
    species: "rabbit",
    pathologies: [
      {
        name: "Pododermatite ulcerativa",
        clinicalKeywords: ["pododermatite", "bumblefoot", "garretti"],
        typicalMeds: [
          { name: "Meloxicam", dosage: "0.3-0.6 mg/kg", frequency: "SID", duration: "7-14 giorni", instructions: "FANS." },
          { name: "Cefalexina", dosage: "15-25 mg/kg", frequency: "BID", duration: "14-28 giorni", instructions: "Antibiotico se infezione." },
        ],
        vitalAnomalies: {},
        promoTags: ["clinical:dermatology", "housing:soft_bedding"],
        soapContext: "Ulcere plantari, peso corporeo elevato come fattore predisponente.",
        docTypes: ["rx", "citologia", "coltura_antibiogramma"],
      },
      {
        name: "Coccidiosi",
        clinicalKeywords: ["coccidi", "Eimeria", "diarrea", "epatica"],
        typicalMeds: [
          { name: "Toltrazuril", dosage: "25 mg/kg", frequency: "SID", duration: "2 giorni, ripetere dopo 5gg", instructions: "Anticoccidico PO. Trattare tutti i conigli conviventi." },
          { name: "Fluidoterapia SC", dosage: "50-100 mL/kg/die", frequency: "BID", duration: "3-5 giorni", instructions: "Reidratazione di supporto." },
        ],
        vitalAnomalies: { weight: "tendency_low", temperature: "tendency_high" },
        promoTags: ["clinical:parasitic", "hygiene:cage_cleaning"],
        soapContext: "Diarrea profusa, dimagrimento, disidratazione, coccidi nelle feci. Forma epatica: epatomegalia.",
        docTypes: ["rx", "esame_feci", "profilo_biochimico"],
      },
      {
        name: "Mixomatosi",
        clinicalKeywords: ["mixomatosi", "mixoma", "edema"],
        typicalMeds: [
          { name: "Terapia di supporto", dosage: "N/A", frequency: "N/A", duration: "2-4 settimane", instructions: "Fluidoterapia, alimentazione assistita, antibiotici secondari." },
        ],
        vitalAnomalies: { temperature: "high" },
        promoTags: ["clinical:infectious", "prevention:vaccination"],
        soapContext: "Edema palpebrale, nasale, genitale; mixomi cutanei; anoressia; prognosi riservata.",
        docTypes: ["rx", "visita_clinica"],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. NAME LISTS
// ---------------------------------------------------------------------------

const DOG_NAMES = [
  "Luna", "Buddy", "Rocky", "Mia", "Rex", "Bella", "Leo", "Maya",
  "Zeus", "Kira", "Toby", "Lola", "Jack", "Nina", "Bruno", "Daisy",
  "Max", "Stella", "Oscar", "Lucky", "Argo", "Nala", "Biscotto",
  "Peggy", "Charlie", "Zara", "Pluto", "Laika", "Fido", "Birba",
  "Thor", "Sasha", "Brando", "Diva", "Pongo", "Maggie",
];

const CAT_NAMES = [
  "Micio", "Luna", "Felix", "Pallina", "Romeo", "Mina", "Whiskers",
  "Duchessa", "Simba", "Lilli", "Nerone", "Stella", "Oliver", "Bianca",
  "Tigre", "Minù", "Salem", "Cleopatra", "Figaro", "Chicca",
  "Leo", "Penelope", "Briciola", "Fufi", "Trilly", "Ginger",
  "Birba", "Artù", "Camilla", "Nuvola", "Pepe", "Zoe",
];

const RABBIT_NAMES = [
  "Fiocco", "Pallina", "Nuvola", "Cannella", "Biscotto", "Batuffolo",
  "Neve", "Caramella", "Pippo", "Lilli", "Puffetta", "Nocciola",
  "Briciola", "Zucchero", "Bambi", "Stellina", "Fragola", "Muffin",
  "Cotone", "Ciliegia", "Tappo", "Birba", "Fiocchetto", "Piumetta",
  "Camomilla", "Giotto", "Mirtillo", "Truffle", "Ariel", "Clover",
  "Dodo", "Ringo",
];

const OWNER_FIRST_NAMES = [
  "Marco", "Giulia", "Alessandro", "Francesca", "Luca", "Sara",
  "Andrea", "Valentina", "Matteo", "Chiara", "Davide", "Martina",
  "Lorenzo", "Anna", "Giuseppe", "Elena", "Simone", "Laura",
  "Federico", "Paola", "Stefano", "Roberta", "Nicola", "Silvia",
];

const OWNER_LAST_NAMES = [
  "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano",
  "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo",
  "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo",
  "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani",
];

// ---------------------------------------------------------------------------
// 3. UTILITY HELPERS
// ---------------------------------------------------------------------------

const ENVIRONMENTS = ["appartamento", "casa con giardino", "fattoria", "villetta"];
const HOUSEHOLDS = ["famiglia con bambini", "coppia", "singolo", "anziano", "famiglia numerosa"];
const ACTIVITY_LEVELS_DOG = ["basso", "moderato", "alto", "agonistico"];
const ACTIVITY_LEVELS_CAT = ["basso (indoor)", "moderato (indoor/outdoor)", "alto (outdoor)"];
const ACTIVITY_LEVELS_RABBIT = ["basso (gabbia)", "moderato (libero in casa)", "alto (giardino recintato)"];
const DIET_TYPES = ["commerciale secco", "commerciale umido", "misto secco/umido", "casalinga", "BARF"];
const DIET_TYPES_RABBIT = ["fieno + pellet", "fieno + verdure fresche", "misto completo"];
const LOCATIONS = [
  "Milano", "Roma", "Napoli", "Torino", "Firenze", "Bologna",
  "Palermo", "Genova", "Verona", "Padova", "Bari", "Catania",
  "Brescia", "Modena", "Parma", "Reggio Emilia", "Perugia", "Cagliari",
];

const VISIT_TYPES = [
  "prima_visita", "controllo", "vaccinazione", "emergenza",
  "follow_up", "chirurgia_pre", "dermatologica", "ortopedica",
  "cardiologica", "neurologica", "oftalmologica", "oncologica",
  "odontoiatrica", "esotico_routine",
];

const DOC_TYPES_ALL = [
  "rx", "emocromocitometrico", "profilo_biochimico", "esame_urine",
  "radiografia", "ecografia_addominale", "ecocardiografia",
  "citologia_cutanea", "citologia_auricolare", "istologico",
  "piano_nutrizionale", "certificato_vaccinale", "certificato_salute",
  "referto_visita",
];

/** Simple seeded-ish random – good enough for deterministic-ish seeds. */
function mulberry32(a) {
  return function () {
    /* eslint-disable no-param-reassign */
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-param-reassign */
  };
}

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function pickN(arr, n, rng) {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, n);
}
function randBetween(min, max, rng) { return +(min + rng() * (max - min)).toFixed(1); }

function generateMicrochip(rng) {
  let chip = "380"; // Italy prefix
  for (let i = 0; i < 12; i++) chip += Math.floor(rng() * 10);
  return chip;
}

function generatePhone(rng) {
  const prefixes = ["333", "338", "339", "347", "348", "349", "366", "388", "392", "393"];
  let phone = pick(prefixes, rng);
  for (let i = 0; i < 7; i++) phone += Math.floor(rng() * 10);
  return phone;
}

function randomDate(startYear, endYear, rng) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  const d = new Date(start + rng() * (end - start));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Weight ranges by species/breed (kg)
// ---------------------------------------------------------------------------
const WEIGHT_RANGES = {
  dog: {
    "Labrador Retriever": [25, 36], "Pastore Tedesco": [25, 40], "Golden Retriever": [25, 34],
    "Bulldog Francese": [8, 14], "Beagle": [9, 16], "Setter Irlandese": [25, 32],
    "Jack Russell Terrier": [5, 8], "Border Collie": [14, 22], "Cocker Spaniel": [12, 16],
    "Bassotto": [7, 14],
  },
  cat: {
    "Europeo": [3, 6], "Persiano": [3, 7], "Siamese": [3, 5], "Maine Coon": [5, 10],
    "British Shorthair": [4, 8], "Ragdoll": [4, 9], "Bengala": [3.5, 7],
    "Sphynx": [3, 5.5], "Norvegese": [4, 9], "Certosino": [3, 7],
  },
  rabbit: {
    "Ariete Nano": [1.2, 2], "Testa di Leone": [1, 1.8], "Rex": [2.5, 4.5],
    "Angora": [2, 4], "Olandese Nano": [0.8, 1.3], "Hotot": [1, 1.5],
    "Californiano": [3.5, 5],
  },
};

// ---------------------------------------------------------------------------
// Breed lists per species
// ---------------------------------------------------------------------------
const DOG_BREEDS = Object.keys(BREED_PATHOLOGIES).filter(b => BREED_PATHOLOGIES[b].species === "dog");
const CAT_BREEDS = Object.keys(BREED_PATHOLOGIES).filter(b => BREED_PATHOLOGIES[b].species === "cat");
const RABBIT_BREEDS = Object.keys(BREED_PATHOLOGIES).filter(b => BREED_PATHOLOGIES[b].species === "rabbit");

// ---------------------------------------------------------------------------
// Diary generation helpers
// ---------------------------------------------------------------------------
function buildVetDiary(pet, pathologies) {
  const lines = [];
  lines.push(`Paziente: ${pet.name}, ${pet.species === "dog" ? "cane" : pet.species === "cat" ? "gatto" : "coniglio"}, razza ${pet.breed}, ${pet.sex === "M" ? "maschio" : "femmina"}, ${pet.weightKg} kg.`);

  if (pathologies.length === 0) {
    lines.push("Soggetto clinicamente sano. Nessuna patologia in corso.");
    lines.push("Vaccinazioni in regola. Profilassi antiparassitaria regolare.");
    lines.push("Prossimo controllo consigliato tra 12 mesi.");
  } else {
    lines.push("Anamnesi patologica:");
    for (const p of pathologies) {
      lines.push(`- ${p.name}: ${p.soapContext}`);
      if (p.typicalMeds && p.typicalMeds.length > 0) {
        lines.push(`  Terapia in corso: ${p.typicalMeds.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join("; ")}.`);
      }
    }
    lines.push("Monitoraggio clinico regolare consigliato.");
  }
  return lines.join("\n");
}

function buildOwnerDiary(pet, pathologies) {
  const lines = [];
  const speciesIt = pet.species === "dog" ? "cane" : pet.species === "cat" ? "gatto" : "coniglio";
  lines.push(`Il mio ${speciesIt} ${pet.name} (${pet.breed}).`);

  if (pathologies.length === 0) {
    lines.push("Sta bene, nessun problema di salute noto.");
    lines.push("Controllo veterinario annuale regolare.");
  } else {
    for (const p of pathologies) {
      const simplified = {
        "Displasia dell'anca": "Ha problemi alle anche, a volte zoppica",
        "Obesità": "È un po' in sovrappeso, il veterinario ci ha dato una dieta",
        "Otite esterna cronica": "Ha spesso infezioni alle orecchie",
        "Dermatite atopica": "Si gratta molto, ha allergie alla pelle",
        "Malattia renale cronica (CKD)": "I reni non funzionano bene, deve bere molto",
        "Cardiomiopatia ipertrofica (HCM)": "Ha un problema al cuore, prende medicine tutti i giorni",
        "Malocclusione dentale": "Ha problemi ai denti, deve andare dal veterinario spesso per limarli",
        "Stasi gastrointestinale (GI stasis)": "A volte smette di mangiare e sta male alla pancia",
      };
      const ownerText = simplified[p.name] || `Ha un problema di salute: ${p.name.toLowerCase()}`;
      lines.push(`- ${ownerText}.`);
    }
    lines.push("Seguo le cure prescritte dal veterinario.");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. generatePetCohort(count, {dogPct, catPct, rabbitPct})
// ---------------------------------------------------------------------------

/**
 * Generate a cohort of realistic pet profiles.
 * @param {number} count - Total number of pets.
 * @param {object} [opts] - Species distribution (must sum to 1).
 * @param {number} [opts.dogPct=0.5]
 * @param {number} [opts.catPct=0.35]
 * @param {number} [opts.rabbitPct=0.15]
 * @returns {Array<object>} Array of pet profile objects.
 */
function generatePetCohort(count, opts = {}) {
  const { dogPct = 0.5, catPct = 0.35, rabbitPct = 0.15 } = opts;

  const nDogs = Math.round(count * dogPct);
  const nCats = Math.round(count * catPct);
  const nRabbits = Math.max(0, count - nDogs - nCats);

  const speciesSlots = [
    ...Array(nDogs).fill("dog"),
    ...Array(nCats).fill("cat"),
    ...Array(nRabbits).fill("rabbit"),
  ];

  // Ensure exactly count entries
  while (speciesSlots.length < count) speciesSlots.push("dog");
  while (speciesSlots.length > count) speciesSlots.pop();

  const rng = mulberry32(42); // deterministic seed

  // Shuffle species list
  for (let i = speciesSlots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [speciesSlots[i], speciesSlots[j]] = [speciesSlots[j], speciesSlots[i]];
  }

  const pets = [];

  for (let i = 0; i < count; i++) {
    const species = speciesSlots[i];
    const breed = species === "dog"
      ? pick(DOG_BREEDS, rng)
      : species === "cat"
        ? pick(CAT_BREEDS, rng)
        : pick(RABBIT_BREEDS, rng);

    const nameList = species === "dog" ? DOG_NAMES : species === "cat" ? CAT_NAMES : RABBIT_NAMES;
    const name = pick(nameList, rng);
    const sex = rng() > 0.5 ? "M" : "F";

    const [wMin, wMax] = (WEIGHT_RANGES[species] && WEIGHT_RANGES[species][breed]) || [3, 10];
    let weightKg = randBetween(wMin, wMax, rng);

    const birthdate = species === "rabbit"
      ? randomDate(2019, 2025, rng)
      : randomDate(2014, 2025, rng);

    const ownerFirst = pick(OWNER_FIRST_NAMES, rng);
    const ownerLast = pick(OWNER_LAST_NAMES, rng);
    const ownerName = `${ownerFirst} ${ownerLast}`;
    const ownerPhone = generatePhone(rng);
    const microchip = species !== "rabbit" ? generateMicrochip(rng) : null;

    // Pathology distribution: 20% healthy, 40% 1, 30% 2, 10% 3
    const roll = rng();
    let numPathologies;
    if (roll < 0.2) numPathologies = 0;
    else if (roll < 0.6) numPathologies = 1;
    else if (roll < 0.9) numPathologies = 2;
    else numPathologies = 3;

    const breedPathologies = BREED_PATHOLOGIES[breed] ? BREED_PATHOLOGIES[breed].pathologies : [];
    const selectedPathologies = pickN(breedPathologies, Math.min(numPathologies, breedPathologies.length), rng);

    // Adjust weight for weight anomalies
    for (const p of selectedPathologies) {
      if (p.vitalAnomalies && p.vitalAnomalies.weight === "high") {
        weightKg = +(weightKg * 1.25).toFixed(1);
      } else if (p.vitalAnomalies && p.vitalAnomalies.weight === "tendency_high") {
        weightKg = +(weightKg * 1.12).toFixed(1);
      } else if (p.vitalAnomalies && p.vitalAnomalies.weight === "low") {
        weightKg = +(weightKg * 0.78).toFixed(1);
      } else if (p.vitalAnomalies && p.vitalAnomalies.weight === "tendency_low") {
        weightKg = +(weightKg * 0.9).toFixed(1);
      }
    }

    // Derive medications from pathologies
    const medications = [];
    for (const p of selectedPathologies) {
      for (const m of p.typicalMeds) {
        if (m.name !== "N/A" && !m.name.startsWith("Terapia di supporto") && !m.name.startsWith("Nessuna") && !m.name.startsWith("Monitoraggio") && !m.name.startsWith("Limatura") && !m.name.startsWith("Orchiectomia") && !m.name.startsWith("Bagni") && !m.name.startsWith("Riposo") && !m.name.startsWith("Raffreddamento") && !m.name.startsWith("Fisioterapia") && !m.name.startsWith("Alimentazione assistita") && !m.name.startsWith("Bendaggi") && !m.name.startsWith("Dieta")) {
          medications.push({
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            instructions: m.instructions,
            forCondition: p.name,
          });
        }
      }
    }

    // Lifestyle
    const activityLevels = species === "dog" ? ACTIVITY_LEVELS_DOG
      : species === "cat" ? ACTIVITY_LEVELS_CAT : ACTIVITY_LEVELS_RABBIT;
    const dietTypes = species === "rabbit" ? DIET_TYPES_RABBIT : DIET_TYPES;

    const knownConditions = selectedPathologies.map(p => p.name);
    const behaviorNotes = [];
    if (species === "dog" && rng() > 0.6) behaviorNotes.push(pick(["ansioso durante i temporali", "reattivo verso altri cani", "tende a tirare al guinzaglio", "abbaia quando resta solo", "molto socievole"], rng));
    if (species === "cat" && rng() > 0.6) behaviorNotes.push(pick(["timido con gli estranei", "marca il territorio", "graffia i mobili", "molto vocale", "affettuoso e socievole"], rng));
    if (species === "rabbit" && rng() > 0.6) behaviorNotes.push(pick(["tende a rosicchiare i cavi", "fa binky quando è contento", "timido ma curioso", "scava molto", "si lascia manipolare facilmente"], rng));

    const outdoorAccessMap = {
      dog: 'outdoor con passeggiate',
      cat: rng() > 0.4 ? 'indoor/outdoor' : 'indoor only',
      rabbit: 'indoor con recinto',
    };
    const cohabitantsOptions = {
      dog: ['altro cane', 'gatto', 'coniglio'],
      cat: ['altro gatto', 'cane'],
      rabbit: ['altro coniglio', 'cavia'],
    };
    const cohabitants = [];
    if (rng() > 0.5) {
      const cnt = Math.floor(rng() * 3) + 1;
      const opts = cohabitantsOptions[species] || ['altro animale'];
      for (let ci = 0; ci < cnt; ci++) cohabitants.push(pick(opts, rng));
    }
    const daysAgo = Math.floor(rng() * 365);
    const lastVaccDate = new Date(); lastVaccDate.setDate(lastVaccDate.getDate() - daysAgo);

    const lifestyle = {
      environment: pick(ENVIRONMENTS, rng),
      household: pick(HOUSEHOLDS, rng),
      activityLevel: pick(activityLevels, rng),
      dietType: pick(dietTypes, rng),
      dietPreferences: [],
      knownConditions,
      currentMeds: medications.map(m => m.name),
      behaviorNotes,
      location: pick(LOCATIONS, rng),
      sterilized: rng() > 0.3,
      outdoorAccess: outdoorAccessMap[species] || 'indoor',
      cohabitants,
      feedingSchedule: pick(['2 pasti/giorno', '3 pasti/giorno', 'alimentazione libera', '2 pasti + snack'], rng),
      waterSource: pick(['ciotola', 'fontanella', 'ciotola + fontanella'], rng),
      lastVaccination: lastVaccDate.toISOString().split('T')[0],
      insuranceActive: rng() > 0.7,
    };

    // Add diet preferences for pathologies
    for (const p of selectedPathologies) {
      if (p.name.includes("renale") || p.name.includes("CKD") || p.name.includes("PKD")) {
        lifestyle.dietPreferences.push("dieta renale");
      }
      if (p.name.includes("Obesità") || p.name.includes("sovrappeso")) {
        lifestyle.dietPreferences.push("dieta ipocalorica");
      }
      if (p.name.includes("urinari") || p.name.includes("struvite") || p.name.includes("ossalato") || p.name.includes("FLUTD") || p.name.includes("cistite")) {
        lifestyle.dietPreferences.push("dieta urinaria");
      }
    }

    const petId = "seed-" + randomUUID().slice(0, 12);

    const pet = {
      petId,
      name,
      species,
      breed,
      sex,
      birthdate,
      weightKg,
      ownerName,
      ownerPhone,
      microchip,
      lifestyle,
      pathologies: selectedPathologies.map(p => ({
        name: p.name,
        clinicalKeywords: p.clinicalKeywords,
        vitalAnomalies: p.vitalAnomalies,
        promoTags: p.promoTags,
        soapContext: p.soapContext,
        docTypes: p.docTypes,
      })),
      medications,
      diary: "",
      ownerDiary: "",
    };

    pet.diary = buildVetDiary(pet, selectedPathologies);
    pet.ownerDiary = buildOwnerDiary(pet, selectedPathologies);

    pets.push(pet);
  }

  return pets;
}

// ---------------------------------------------------------------------------
// 5. SOAP AND DOCUMENT PROMPT TEMPLATES
// ---------------------------------------------------------------------------

/**
 * Build system + user prompts for SOAP generation via OpenAI.
 * @param {object} pet - Pet profile from generatePetCohort.
 * @param {string} visitType - One of VISIT_TYPES.
 * @param {number} visitNumber - Sequential visit number (1-based).
 * @returns {{ system: string, user: string }}
 */
function buildSoapPrompt(pet, visitType, visitNumber) {
  const speciesIt = pet.species === "dog" ? "cane" : pet.species === "cat" ? "gatto" : "coniglio";
  const sexIt = pet.sex === "M" ? "maschio" : "femmina";

  const pathologyContext = pet.pathologies.length > 0
    ? pet.pathologies.map(p => `- ${p.name}: ${p.soapContext}`).join("\n")
    : "Nessuna patologia nota.";

  const medsContext = pet.medications.length > 0
    ? pet.medications.map(m => `- ${m.name} ${m.dosage} ${m.frequency} (per ${m.forCondition})`).join("\n")
    : "Nessun farmaco in corso.";

  const visitTypeLabels = {
    prima_visita: "Prima visita",
    controllo: "Visita di controllo",
    vaccinazione: "Visita vaccinale",
    emergenza: "Visita d'emergenza",
    follow_up: "Follow-up",
    chirurgia_pre: "Visita pre-chirurgica",
    dermatologica: "Visita dermatologica",
    ortopedica: "Visita ortopedica",
    cardiologica: "Visita cardiologica",
    neurologica: "Visita neurologica",
    oftalmologica: "Visita oftalmologica",
    oncologica: "Visita oncologica",
    odontoiatrica: "Visita odontoiatrica",
    esotico_routine: "Visita di routine (esotico)",
  };

  const visitLabel = visitTypeLabels[visitType] || visitType;

  const system = `Sei un medico veterinario italiano esperto. Genera una nota clinica SOAP completa e realistica in italiano.

REGOLE:
- Scrivi in italiano medico veterinario professionale.
- La nota deve essere clinicamente accurata e coerente con la razza, specie, età e patologie del paziente.
- Formato SOAP:
  S (Soggettivo): Motivo della visita riportato dal proprietario, anamnesi recente.
  O (Oggettivo): Esame fisico, parametri vitali, reperti clinici oggettivi.
  A (Assessment): Diagnosi differenziali, valutazione clinica.
  P (Piano): Terapia prescritta, esami consigliati, follow-up, indicazioni al proprietario.
- Se è una visita di emergenza, il tono deve essere più urgente.
- Se è un follow-up (visita n.${visitNumber}), fai riferimento al decorso clinico.
- Ogni sezione deve avere 3-6 righe di contenuto realistico.
- NON inventare farmaci inesistenti. Usa solo farmaci veterinari reali.

FORMATO DI RISPOSTA:
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza markdown né testo aggiuntivo:
{"S": "testo soggettivo qui...", "O": "testo oggettivo qui...", "A": "testo assessment qui...", "P": "testo piano qui..."}`;

  const user = `Genera una nota SOAP per la seguente visita veterinaria:

PAZIENTE:
- Nome: ${pet.name}
- Specie: ${speciesIt}
- Razza: ${pet.breed}
- Sesso: ${sexIt}
- Data di nascita: ${pet.birthdate}
- Peso: ${pet.weightKg} kg
- Microchip: ${pet.microchip || "N/A"}

PROPRIETARIO: ${pet.ownerName}

TIPO DI VISITA: ${visitLabel} (visita n. ${visitNumber})

PATOLOGIE NOTE:
${pathologyContext}

TERAPIA IN CORSO:
${medsContext}

STILE DI VITA:
- Ambiente: ${pet.lifestyle.environment}
- Nucleo familiare: ${pet.lifestyle.household}
- Livello di attività: ${pet.lifestyle.activityLevel}
- Dieta: ${pet.lifestyle.dietType}
- Località: ${pet.lifestyle.location}
${pet.lifestyle.behaviorNotes.length > 0 ? "- Note comportamentali: " + pet.lifestyle.behaviorNotes.join(", ") : ""}

DIARIO CLINICO PRECEDENTE:
${pet.diary}

Genera la nota SOAP completa in italiano.`;

  return { system, user };
}

/**
 * Build system + user prompts for document generation via OpenAI.
 * @param {object} pet - Pet profile.
 * @param {string} docType - Document type (e.g., "rx", "emocromocitometrico").
 * @param {string} date - Date string (ISO format).
 * @returns {{ system: string, user: string }}
 */
function buildDocumentPrompt(pet, docType, date) {
  const speciesIt = pet.species === "dog" ? "cane" : pet.species === "cat" ? "gatto" : "coniglio";
  const sexIt = pet.sex === "M" ? "maschio" : "femmina";

  const docTypeLabels = {
    rx: "Ricetta veterinaria",
    emocromocitometrico: "Referto emocromocitometrico",
    profilo_biochimico: "Referto profilo biochimico",
    esame_urine: "Referto esame delle urine",
    radiografia: "Referto radiografico",
    radiografia_toracica: "Referto radiografico del torace",
    radiografia_addominale: "Referto radiografico dell'addome",
    radiografia_cranio: "Referto radiografico del cranio",
    ecografia_addominale: "Referto ecografico addominale",
    ecocardiografia: "Referto ecocardiografico",
    citologia_cutanea: "Referto citologico cutaneo",
    citologia_auricolare: "Referto citologico auricolare",
    citologia: "Referto citologico",
    istologico: "Referto istologico",
    piano_nutrizionale: "Piano nutrizionale",
    certificato_vaccinale: "Certificato vaccinale",
    certificato_salute: "Certificato di buona salute",
    referto_visita: "Referto di visita clinica",
    profilo_tiroideo: "Referto profilo tiroideo",
    profilo_allergologico: "Referto profilo allergologico",
    visita_oftalmologica: "Referto visita oftalmologica",
    visita_neurologica: "Referto visita neurologica",
    visita_ortopedica: "Referto visita ortopedica",
    visita_chirurgica: "Referto visita chirurgica",
    test_genetico: "Referto test genetico",
    TC_articolare: "Referto TC articolare",
    TC_bolle_timpaniche: "Referto TC bolle timpaniche",
    ECG: "Referto elettrocardiografico",
    risonanza_magnetica: "Referto risonanza magnetica",
    test_di_Schirmer: "Referto test di Schirmer",
    tonometria: "Referto tonometrico",
    fenobarbitalemia: "Referto fenobarbitalemia",
    TLI_sierico: "Referto TLI sierico",
    lavaggio_broncoalveolare: "Referto lavaggio broncoalveolare (BAL)",
    biopsia_intestinale: "Referto biopsia intestinale",
    biopsia_epatica: "Referto biopsia epatica",
    biopsia_cutanea: "Referto biopsia cutanea",
    coltura_antibiogramma: "Referto coltura e antibiogramma",
    sierologia_E_cuniculi: "Referto sierologia E. cuniculi",
    esame_feci: "Referto esame coprologico",
    scotch_test: "Referto scotch test cutaneo",
    raschiato_cutaneo: "Referto raschiato cutaneo",
    elettromiografia: "Referto elettromiografico",
  };

  const docLabel = docTypeLabels[docType] || docType;

  const pathologyContext = pet.pathologies.length > 0
    ? pet.pathologies.map(p => `- ${p.name}: ${p.soapContext}`).join("\n")
    : "Nessuna patologia nota.";

  const system = `Sei un medico veterinario italiano. Genera un documento clinico veterinario realistico e completo in italiano.

REGOLE:
- Il documento deve essere un "${docLabel}" formalmente corretto.
- Usa terminologia medica veterinaria italiana appropriata.
- Includi valori di riferimento dove applicabile (es. emocromo, biochimico).
- I valori devono essere coerenti con le patologie note del paziente.
- Il formato deve essere professionale, come da pratica clinica italiana.
- Data del documento: ${date}.
- Se è una ricetta (rx), includi: intestazione clinica, dati paziente, farmaci con posologia, firma.
- Se è un referto di laboratorio, includi valori numerici con range di riferimento.
- NON inventare nomi di farmaci o valori completamente irrealistici.`;

  const user = `Genera il seguente documento veterinario:

TIPO DOCUMENTO: ${docLabel}
DATA: ${date}

PAZIENTE:
- Nome: ${pet.name}
- Specie: ${speciesIt}
- Razza: ${pet.breed}
- Sesso: ${sexIt}
- Data di nascita: ${pet.birthdate}
- Peso: ${pet.weightKg} kg
- Microchip: ${pet.microchip || "N/A"}

PROPRIETARIO: ${pet.ownerName} - Tel: ${pet.ownerPhone}

PATOLOGIE NOTE:
${pathologyContext}

TERAPIA IN CORSO:
${pet.medications.length > 0
    ? pet.medications.map(m => `- ${m.name} ${m.dosage} ${m.frequency} (${m.forCondition})`).join("\n")
    : "Nessun farmaco in corso."}

Genera il documento "${docLabel}" completo in italiano.`;

  return { system, user };
}

/**
 * Return suitable visit types for a given pet based on its pathologies.
 * @param {object} pet - Pet profile.
 * @returns {string[]} Array of visit type strings.
 */
function getVisitTypesForPet(pet) {
  const types = new Set(["prima_visita", "controllo", "vaccinazione"]);

  if (pet.species === "rabbit") {
    types.add("esotico_routine");
  }

  if (!pet.pathologies || pet.pathologies.length === 0) {
    return Array.from(types);
  }

  // Always add follow_up if there are pathologies
  types.add("follow_up");

  for (const p of pet.pathologies) {
    const kw = (p.clinicalKeywords || []).join(" ").toLowerCase();
    const name = (p.name || "").toLowerCase();
    const tags = (p.promoTags || []).join(" ").toLowerCase();

    if (tags.includes("skin") || kw.includes("dermatite") || kw.includes("prurito")) {
      types.add("dermatologica");
    }
    if (tags.includes("joint") || kw.includes("displasia") || kw.includes("lussazione") || kw.includes("zoppia")) {
      types.add("ortopedica");
    }
    if (tags.includes("cardio") || kw.includes("cardiomiopatia") || kw.includes("cuore") || kw.includes("valvola")) {
      types.add("cardiologica");
    }
    if (tags.includes("neuro") || kw.includes("epilessia") || kw.includes("mielopatia") || kw.includes("atassia") || kw.includes("head tilt")) {
      types.add("neurologica");
    }
    if (tags.includes("ophthalm") || kw.includes("occhio") || kw.includes("glaucoma") || kw.includes("corneale")) {
      types.add("oftalmologica");
    }
    if (tags.includes("oncol") || kw.includes("neoplasia") || kw.includes("osteosarcoma") || kw.includes("emangiosarcoma")) {
      types.add("oncologica");
    }
    if (tags.includes("dental") || kw.includes("malocclusione") || kw.includes("denti")) {
      types.add("odontoiatrica");
    }
    if (tags.includes("surgical") || name.includes("ernia") || name.includes("gdv")) {
      types.add("chirurgia_pre");
    }
    if (tags.includes("emergency") || name.includes("gdv") || name.includes("colpo di calore")) {
      types.add("emergenza");
    }
  }

  return Array.from(types);
}

/**
 * Return suitable document types for a given pet based on its pathologies.
 * @param {object} pet - Pet profile.
 * @returns {string[]} Array of doc type strings.
 */
function getDocTypesForPet(pet) {
  const docs = new Set(["referto_visita", "certificato_salute"]);

  if (!pet.pathologies || pet.pathologies.length === 0) {
    docs.add("certificato_vaccinale");
    docs.add("emocromocitometrico");
    return Array.from(docs);
  }

  for (const p of pet.pathologies) {
    if (p.docTypes) {
      for (const d of p.docTypes) {
        docs.add(d);
      }
    }
  }

  // Always include basic labs if there are pathologies
  docs.add("emocromocitometrico");
  docs.add("profilo_biochimico");

  return Array.from(docs);
}

// ---------------------------------------------------------------------------
// 6. EXPORTS
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6b. PHOTO PLACEHOLDERS (deterministic SVG per species)
// ---------------------------------------------------------------------------

function getPhotoPlaceholder(species) {
    const file = {
        dog: 'placeholder-dog.svg',
        cat: 'placeholder-cat.svg',
        rabbit: 'placeholder-rabbit.svg',
    }[species] || 'placeholder-pet.svg';
    return '/api/seed-assets/' + file;
}

function generatePhotosForPet(pet, count) {
    const base = getPhotoPlaceholder(pet.species);
    const photos = [];
    for (let i = 0; i < count; i++) {
        photos.push({
            id: `photo-${pet._petId || pet.petId || 'x'}-${i}`,
            dataUrl: base,
            caption: `Foto ${i + 1} di ${pet.name}`,
            date: new Date().toISOString(),
        });
    }
    return photos;
}

module.exports = {
  generatePetCohort,
  buildSoapPrompt,
  buildDocumentPrompt,
  getVisitTypesForPet,
  getDocTypesForPet,
  BREED_PATHOLOGIES,
  generatePhotosForPet,
  getPhotoPlaceholder,
};
