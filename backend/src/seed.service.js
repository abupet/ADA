// backend/src/seed.service.js v1
// PR 14: Seed engine orchestrator — generates realistic test data for the ADA veterinary app.

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  generatePetCohort,
  generateDemoCohort,
  buildSoapPrompt,
  buildDocumentPrompt,
  getVisitTypesForPet,
  getDocTypesForPet,
  generatePhotosForPet,
} = require('./seed.petgen');

// ---------------------------------------------------------------------------
// Job state
// ---------------------------------------------------------------------------

let currentJob = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _log(message) {
  if (!currentJob) return;
  const entry = `[${new Date().toISOString()}] ${message}`;
  currentJob.log.push(entry);
  // Cap log at 200 entries to avoid memory bloat
  if (currentJob.log.length > 200) {
    currentJob.log = currentJob.log.slice(-200);
  }
  console.log(`[seed] ${message}`);
}

function _updateProgress(phase, pct, item) {
  if (!currentJob) return;
  currentJob.phase = phase;
  currentJob.progressPct = Math.min(100, Math.max(0, Math.round(pct)));
  if (item !== undefined) {
    currentJob.currentItem = item;
  }
}

function _isCancelled() {
  return currentJob && currentJob.cancelled;
}

// ---------------------------------------------------------------------------
// OpenAI call helper with retry
// ---------------------------------------------------------------------------

async function callOpenAi(openAiKey, messages, options = {}) {
  const model = options.model || 'gpt-4o-mini';
  const temperature = options.temperature !== undefined ? options.temperature : 0.7;
  const maxTokens = options.maxTokens || 4096;
  const timeout = options.timeout || 30000;

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        const errText = await response.text().catch(() => '');
        lastError = new Error(`OpenAI ${response.status}: ${errText.slice(0, 300)}`);
        // Wait before retry
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenAI ${response.status}: ${errText.slice(0, 300)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return content;
    } catch (err) {
      lastError = err;
      if (attempt === 0 && (err.name === 'AbortError' || err.message?.includes('429') || err.message?.includes('500'))) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Species mapping: petgen uses English, frontend expects Italian
// ---------------------------------------------------------------------------

const SPECIES_IT = { dog: 'Cane', cat: 'Gatto', rabbit: 'Coniglio' };

// ---------------------------------------------------------------------------
// Wipe seeded data (FK-safe order)
// ---------------------------------------------------------------------------

async function wipeSeededData(pool, ownerUserId) {
  const results = {};

  // Collect seeded pet IDs before deletion (needed for pet.delete sync notifications)
  let seededPetIds = [];
  try {
    const { rows } = await pool.query(
      `SELECT pet_id, owner_user_id FROM pets WHERE notes LIKE '%[seed]%'`
    );
    seededPetIds = rows;
  } catch (_e) {
    // continue — worst case frontend won't get delete notifications
  }

  // Also delete seed document files from disk
  try {
    const { rows: docRows } = await pool.query(
      `SELECT storage_key FROM documents WHERE pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')`
    );
    const storageDir = process.env.DOCUMENT_STORAGE_PATH || path.resolve(__dirname, '../../uploads');
    for (const doc of docRows) {
      try {
        const fp = path.join(storageDir, doc.storage_key);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (_e) { /* best effort */ }
    }
  } catch (_e) { /* continue */ }

  // FK-safe ordering: children before parents (matches spec §6 Wipe SQL)
  const tables = [
    { name: 'promo_events', where: "metadata->>'seeded' = 'true'" },
    { name: 'vet_flags', where: "reason LIKE '%[seed]%'" },
    { name: 'campaign_items', where: "campaign_id IN (SELECT campaign_id FROM promo_campaigns WHERE utm_campaign LIKE 'seed_%')" },
    { name: 'promo_campaigns', where: "utm_campaign LIKE 'seed_%'" },
    { name: 'explanation_cache', where: "cache_key LIKE 'seed_%'" },
    { name: 'promo_items', where: "promo_item_id LIKE 'seed-%'" },
    { name: 'pet_tags', where: "pet_id IN (SELECT pet_id::text FROM pets WHERE notes LIKE '%[seed]%')" },
    { name: 'consents', where: "owner_user_id LIKE 'seed-%'" },
    { name: 'documents', where: "pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')" },
    { name: 'changes', where: "entity_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')" },
    { name: 'pet_changes', where: "pet_id IN (SELECT pet_id FROM pets WHERE notes LIKE '%[seed]%')" },
    { name: 'pets', where: "notes LIKE '%[seed]%'" },
    { name: 'tenant_budgets', where: "tenant_id = 'seed-tenant'" },
    { name: 'tenants', where: "tenant_id = 'seed-tenant'" },
  ];

  for (const t of tables) {
    try {
      const res = await pool.query(`DELETE FROM ${t.name} WHERE ${t.where}`);
      results[t.name] = { deleted: res.rowCount };
    } catch (e) {
      results[t.name] = { error: e.message };
    }
  }

  // Insert pet.delete records so the frontend pull sync removes pets from IndexedDB
  let deleteNotifications = 0;
  for (const pet of seededPetIds) {
    try {
      await pool.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version, device_id, op_id)
         VALUES ($1, $2, 'pet.delete', NULL, NULL, 'seed-engine', $3)`,
        [ownerUserId || pet.owner_user_id, pet.pet_id, randomUUID()]
      );
      deleteNotifications++;
    } catch (_e) { /* best effort */ }
  }
  results._delete_notifications = deleteNotifications;

  return results;
}

// ---------------------------------------------------------------------------
// Main seed job
// ---------------------------------------------------------------------------

function startSeedJob(pool, config, openAiKey) {
  if (currentJob && currentJob.status === 'running') {
    return { error: 'already_running' };
  }

  const jobId = 'seed_' + randomUUID();

  const jobConfig = {
    mode: config.mode || 'fresh',
    petCount: Math.max(1, Math.min(200, parseInt(config.petCount) || 10)),
    soapPerPet: Math.max(0, Math.min(10, parseInt(config.soapPerPet) || 3)),
    docsPerPet: Math.max(0, Math.min(10, parseInt(config.docsPerPet) || 2)),
    vitalsPerPet: Math.max(0, Math.min(30, parseInt(config.vitalsPerPet) || 8)),
    medsPerPet: Math.max(0, Math.min(10, parseInt(config.medsPerPet) || 3)),
    photosPerPet: Math.max(0, Math.min(10, parseInt(config.photosPerPet) || 2)),
    promoEventsPerPet: Math.max(0, Math.min(30, parseInt(config.promoEventsPerPet) || 5)),
    dogPct: parseInt(config.dogPct) || 60,
    catPct: parseInt(config.catPct) || 30,
    rabbitPct: parseInt(config.rabbitPct) || 10,
    ownerUserId: config.ownerUserId || 'ada-user',
  };

  currentJob = {
    jobId,
    status: 'running',
    config: jobConfig,
    phase: 0,
    phaseName: 'initializing',
    progressPct: 0,
    currentItem: null,
    log: [],
    cancelled: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };

  // Run async in background
  _runSeedJob(pool, jobConfig, openAiKey).catch((err) => {
    if (currentJob && currentJob.jobId === jobId) {
      currentJob.status = 'error';
      currentJob.error = err.message || String(err);
      currentJob.completedAt = new Date().toISOString();
      _log(`Fatal error: ${err.message}`);
    }
  });

  return { jobId };
}

async function _runSeedJob(pool, config, openAiKey) {
  const job = currentJob;
  const ownerUserId = config.ownerUserId;

  try {
    // =====================================================================
    // Phase 0 (0-2%): Wipe if fresh mode
    // =====================================================================
    job.phaseName = 'wipe';
    _updateProgress(0, 0, 'Checking mode');
    _log(`Starting seed job: mode=${config.mode}, petCount=${config.petCount}`);

    if (config.mode === 'fresh') {
      if (_isCancelled()) return _finishCancelled();
      _log('Fresh mode: wiping seeded data...');
      const wipeResult = await wipeSeededData(pool, ownerUserId);
      _log(`Wipe complete: ${JSON.stringify(wipeResult)}`);
    }
    _updateProgress(0, 2, 'Wipe complete');

    // =====================================================================
    // Phase 1 (2-5%): Ensure infrastructure
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'infrastructure';
    _updateProgress(1, 2, 'Setting up infrastructure');
    _log('Phase 1: Ensuring infrastructure...');

    // Tenant
    try {
      await pool.query(
        `INSERT INTO tenants (tenant_id, name, slug)
         VALUES ('seed-tenant', 'Seed Test Brand', 'seed-brand')
         ON CONFLICT (tenant_id) DO NOTHING`
      );
      _log('Tenant seed-tenant ensured');
    } catch (e) {
      _log(`Tenant insert warning: ${e.message}`);
    }

    // Consents
    const consentTypes = [
      { type: 'marketing_global', scope: 'global' },
      { type: 'clinical_tags', scope: 'global' },
      { type: 'marketing_brand', scope: 'seed-tenant' },
    ];
    for (const ct of consentTypes) {
      try {
        await pool.query(
          `INSERT INTO consents (owner_user_id, consent_type, scope, status)
           VALUES ($1, $2, $3, 'opted_in')
           ON CONFLICT (owner_user_id, consent_type, scope) DO UPDATE SET status = 'opted_in'`,
          [ownerUserId, ct.type, ct.scope]
        );
      } catch (e) {
        _log(`Consent ${ct.type} warning: ${e.message}`);
      }
    }
    _log('Consents ensured for ' + ownerUserId);

    // Budget
    try {
      await pool.query(
        `INSERT INTO tenant_budgets (tenant_id, monthly_limit)
         VALUES ('seed-tenant', 10000)
         ON CONFLICT (tenant_id) DO NOTHING`
      );
      _log('Budget ensured for seed-tenant');
    } catch (e) {
      _log(`Budget warning: ${e.message}`);
    }

    // Global policies
    try {
      await pool.query(
        `INSERT INTO global_policies (policy_key, policy_value, description)
         VALUES ('max_impressions_per_week', '28', 'Maximum impressions per pet per week')
         ON CONFLICT (policy_key) DO NOTHING`
      );
      _log('Global policies ensured');
    } catch (e) {
      _log(`Global policies warning: ${e.message}`);
    }

    _updateProgress(1, 5, 'Infrastructure ready');

    // =====================================================================
    // Phase 2 (5-8%): Generate pet profiles
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'generate_profiles';
    _updateProgress(2, 5, 'Generating pet profiles');
    _log(`Phase 2: Generating ${config.petCount} pet profiles...`);

    // Normalize percentages to fractions (UI sends 60/30/10, petgen expects 0.6/0.3/0.1)
    const rawDog = config.dogPct || 0;
    const rawCat = config.catPct || 0;
    const rawRabbit = config.rabbitPct || 0;
    const total = rawDog + rawCat + rawRabbit || 100;
    const pets = generatePetCohort(config.petCount, {
      dogPct: rawDog / total,
      catPct: rawCat / total,
      rabbitPct: rawRabbit / total,
    });

    _log(`Generated ${pets.length} pet profiles`);
    _updateProgress(2, 8, `${pets.length} profiles ready`);

    // =====================================================================
    // Phase 3 (8-15%): Insert pets into DB
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'insert_pets';
    _updateProgress(3, 8, 'Inserting pets');
    _log('Phase 3: Inserting pets into database...');

    const petIds = [];
    for (let i = 0; i < pets.length; i++) {
      if (_isCancelled()) return _finishCancelled();
      const pet = pets[i];
      const petId = randomUUID();
      pet._petId = petId;

      const notes = (pet.diary || '') + ' [seed]';

      try {
        const ins = await pool.query(
          `INSERT INTO pets (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
           RETURNING *`,
          [petId, ownerUserId, pet.name, SPECIES_IT[pet.species] || pet.species, pet.breed, pet.sex, pet.birthdate, pet.weightKg, notes]
        );
        petIds.push(petId);

        // Create pet_changes so pull sync sees the new pet
        try {
          await pool.query(
            `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version, device_id, op_id)
             VALUES ($1, $2, 'pet.upsert', $3, 1, 'seed-engine', $4)`,
            [ownerUserId, petId, JSON.stringify(ins.rows[0]), randomUUID()]
          );
        } catch (_e) {
          _log(`pet_changes insert warning for ${pet.name}: ${_e.message}`);
        }
      } catch (e) {
        _log(`Insert pet ${pet.name} error: ${e.message}`);
      }

      const pct = 8 + ((i + 1) / pets.length) * 7;
      _updateProgress(3, pct, `Inserted ${i + 1}/${pets.length}: ${pet.name}`);
    }
    _log(`Inserted ${petIds.length} pets`);

    // =====================================================================
    // Phase 4 (15-55%): Generate SOAP reports via OpenAI
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'generate_soap';
    _updateProgress(4, 15, 'Generating SOAP reports');
    _log('Phase 4: Generating SOAP reports...');

    const historyDataMap = {}; // petId -> []
    const totalSoaps = pets.length * config.soapPerPet;
    let soapsDone = 0;

    for (const pet of pets) {
      if (_isCancelled()) return _finishCancelled();
      if (!pet._petId || !petIds.includes(pet._petId)) continue;

      historyDataMap[pet._petId] = [];
      const visitTypes = getVisitTypesForPet(pet);

      for (let s = 0; s < config.soapPerPet; s++) {
        if (_isCancelled()) return _finishCancelled();

        const visitType = visitTypes[s % visitTypes.length];
        const visitDate = _randomPastDate(180);

        try {
          let soapData;
          if (openAiKey) {
            const prompt = buildSoapPrompt(pet, visitType, s);
            const messages = [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ];
            const raw = await callOpenAi(openAiKey, messages, {
              temperature: 0.7,
              timeout: 30000,
            });
            soapData = _parseSoapJson(raw);
          } else {
            // Mock SOAP when no OpenAI key
            soapData = {
              S: `[SEED-MOCK] ${pet.name}: il proprietario riferisce ${visitType}. Anamnesi nella norma.`,
              O: `[SEED-MOCK] Visita clinica: parametri vitali nella norma. Peso ${pet.weightKg} kg.`,
              A: `[SEED-MOCK] Assessment: ${visitType} - nessuna patologia urgente rilevata.`,
              P: `[SEED-MOCK] Piano: controllo tra 6 mesi. Alimentazione regolare.`,
            };
          }

          const historyEntry = {
            visit_type: visitType,
            visit_date: visitDate.toISOString().split('T')[0],
            createdAt: visitDate.toISOString(),
            soapData: {
              s: soapData.S || '',
              o: soapData.O || '',
              a: soapData.A || '',
              p: soapData.P || '',
            },
            s: soapData.S || '',
            o: soapData.O || '',
            a: soapData.A || '',
            p: soapData.P || '',
          };

          historyDataMap[pet._petId].push(historyEntry);
        } catch (e) {
          _log(`SOAP error for ${pet.name} (#${s + 1}): ${e.message}`);
        }

        soapsDone++;
        const pct = 15 + (soapsDone / Math.max(1, totalSoaps)) * 40;
        _updateProgress(4, pct, `SOAP ${soapsDone}/${totalSoaps}: ${pet.name}`);
      }
    }
    _log(`Generated ${soapsDone} SOAP reports`);

    // =====================================================================
    // Phase 5 (55-75%): Generate documents via OpenAI
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'generate_documents';
    _updateProgress(5, 55, 'Generating documents');
    _log('Phase 5: Generating documents...');

    const totalDocs = pets.length * config.docsPerPet;
    let docsDone = 0;

    // Load placeholder files once (PDF + PNG)
    const placeholderPdf = fs.readFileSync(path.resolve(__dirname, 'seed-assets/placeholder.pdf'));
    const placeholderPng = fs.readFileSync(path.resolve(__dirname, 'seed-assets/placeholder.png'));

    for (const pet of pets) {
      if (_isCancelled()) return _finishCancelled();
      if (!pet._petId || !petIds.includes(pet._petId)) continue;

      const docTypes = getDocTypesForPet(pet);

      for (let d = 0; d < config.docsPerPet; d++) {
        if (_isCancelled()) return _finishCancelled();

        const docType = docTypes[d % docTypes.length];
        const documentId = randomUUID();

        // Alternate between PDF and PNG placeholders
        const usePdf = d % 2 === 0;
        const fileBuffer = usePdf ? placeholderPdf : placeholderPng;
        const mimeType = usePdf ? 'application/pdf' : 'image/png';
        const ext = usePdf ? 'pdf' : 'png';
        const safeName = pet.name.toLowerCase().replace(/\s+/g, '_');
        const filename = `seed_${docType}_${safeName}.${ext}`;
        const storageKey = `${documentId}_${filename}`;

        try {
          // Write file to disk
          try {
            const storageDir = process.env.DOCUMENT_STORAGE_PATH || path.resolve(__dirname, '../../uploads');
            if (!fs.existsSync(storageDir)) {
              fs.mkdirSync(storageDir, { recursive: true });
            }
            fs.writeFileSync(path.join(storageDir, storageKey), fileBuffer);
          } catch (fsErr) {
            _log(`File write warning for ${pet.name}: ${fsErr.message}`);
          }

          // Insert DB record
          try {
            await pool.query(
              `INSERT INTO documents (document_id, pet_id, owner_user_id, original_filename, mime_type, size_bytes, storage_key, hash_sha256, ai_status, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $3)`,
              [
                documentId,
                pet._petId,
                ownerUserId,
                filename,
                mimeType,
                fileBuffer.length,
                storageKey,
                _simpleHash(fileBuffer.toString('base64')),
              ]
            );
          } catch (e) {
            _log(`Document insert error for ${pet.name}: ${e.message}`);
          }
        } catch (e) {
          _log(`Document generation error for ${pet.name} (#${d + 1}): ${e.message}`);
        }

        docsDone++;
        const pct = 55 + (docsDone / Math.max(1, totalDocs)) * 20;
        _updateProgress(5, pct, `Doc ${docsDone}/${totalDocs}: ${pet.name}`);
      }
    }
    _log(`Generated ${docsDone} documents`);

    // =====================================================================
    // Phase 6 (75-85%): Generate vitals, meds, photos, diary (no OpenAI)
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'generate_local_data';
    _updateProgress(6, 75, 'Generating vitals, meds, photos');
    _log('Phase 6: Generating vitals, meds, photos, diary...');

    const vitalsMap = {};   // petId -> []
    const medsMap = {};     // petId -> []
    const photosMap = {};   // petId -> []

    for (let i = 0; i < pets.length; i++) {
      if (_isCancelled()) return _finishCancelled();
      const pet = pets[i];
      if (!pet._petId || !petIds.includes(pet._petId)) continue;

      // --- Vitals ---
      const vitals = [];
      for (let v = 0; v < config.vitalsPerPet; v++) {
        const vitalDate = _randomPastDate(90);
        const baseTemp = pet.species === 'dog' ? 38.5 : pet.species === 'cat' ? 38.8 : 39.0;
        const baseHR = pet.species === 'dog' ? 90 : pet.species === 'cat' ? 150 : 200;
        const baseRR = pet.species === 'dog' ? 18 : pet.species === 'cat' ? 25 : 40;

        // Influence by pathologies
        const hasPathology = pet.pathologies && pet.pathologies.length > 0;
        const tempVariation = hasPathology ? (Math.random() * 1.5 - 0.3) : (Math.random() * 1.0 - 0.5);
        const hrVariation = hasPathology ? (Math.random() * 30 - 5) : (Math.random() * 20 - 10);
        const rrVariation = hasPathology ? (Math.random() * 10 - 2) : (Math.random() * 8 - 4);

        vitals.push({
          date: vitalDate.toISOString(),
          temp: +(baseTemp + tempVariation).toFixed(1),
          hr: Math.round(baseHR + hrVariation),
          rr: Math.round(baseRR + rrVariation),
          weight: +(pet.weightKg + (Math.random() * 2 - 1)).toFixed(1),
        });
      }
      vitals.sort((a, b) => new Date(a.date) - new Date(b.date));
      vitalsMap[pet._petId] = vitals;

      // --- Medications ---
      const meds = [];
      const pathologies = pet.pathologies || [];
      const typicalMeds = pet.typicalMeds || [];
      const medSources = typicalMeds.length > 0 ? typicalMeds : _defaultMedsForSpecies(pet.species);
      for (let m = 0; m < Math.min(config.medsPerPet, medSources.length); m++) {
        const med = medSources[m % medSources.length];
        const startDate = _randomPastDate(60);
        meds.push({
          name: typeof med === 'string' ? med : med.name || 'Unknown med',
          dosage: typeof med === 'object' && med.dosage ? med.dosage : '1 dose/day',
          start_date: startDate.toISOString().split('T')[0],
          end_date: new Date(startDate.getTime() + 14 * 86400000).toISOString().split('T')[0],
          notes: pathologies.length > 0 ? `Per ${pathologies[0]}` : 'Routine',
        });
      }
      medsMap[pet._petId] = meds;

      // --- Photos (deterministic placeholder SVGs per species) ---
      photosMap[pet._petId] = generatePhotosForPet(pet, config.photosPerPet);

      // --- Diary (combine anamnesis, pathologies, meds) ---
      const diaryParts = [];
      if (pet.anamnesis) diaryParts.push(`Anamnesi: ${pet.anamnesis}`);
      if (pathologies.length > 0) diaryParts.push(`Patologie note: ${pathologies.join(', ')}`);
      if (meds.length > 0) diaryParts.push(`Farmaci: ${meds.map((m) => m.name).join(', ')}`);
      pet.ownerDiary = diaryParts.join('\n') || `Diario di ${pet.name} - nessuna nota specifica.`;

      const pct = 75 + ((i + 1) / pets.length) * 10;
      _updateProgress(6, pct, `Local data ${i + 1}/${pets.length}: ${pet.name}`);
    }
    _log('Phase 6 complete: vitals, meds, photos generated');

    // =====================================================================
    // Phase 7 (85-90%): Compute pet_tags
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'compute_tags';
    _updateProgress(7, 85, 'Computing pet tags');
    _log('Phase 7: Computing pet tags...');

    let computeTags = null;
    try {
      computeTags = require('./tag.service').computeTags;
    } catch (_e) {
      _log('Warning: tag.service not available, skipping tag computation');
    }

    if (computeTags) {
      for (let i = 0; i < pets.length; i++) {
        if (_isCancelled()) return _finishCancelled();
        const pet = pets[i];
        if (!pet._petId || !petIds.includes(pet._petId)) continue;

        try {
          const result = await computeTags(pool, pet._petId, ownerUserId);
          if (result.errors && result.errors.length > 0) {
            _log(`Tags for ${pet.name}: ${result.tags.length} tags, ${result.errors.length} errors`);
          }
        } catch (e) {
          _log(`Tag compute warning for ${pet.name}: ${e.message}`);
        }

        const pct = 85 + ((i + 1) / pets.length) * 5;
        _updateProgress(7, pct, `Tags ${i + 1}/${pets.length}: ${pet.name}`);
      }
    }
    _log('Phase 7 complete: tags computed');

    // =====================================================================
    // Phase 8 (90-95%): Generate promo events
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'generate_promo_events';
    _updateProgress(8, 90, 'Generating promo events');
    _log('Phase 8: Generating promo events...');

    const eventTypes = [
      { type: 'impression', weight: 60 },
      { type: 'info_click', weight: 20 },
      { type: 'cta_click', weight: 10 },
      { type: 'dismissed', weight: 10 },
    ];

    const contexts = ['home_feed', 'pet_profile', 'post_visit', 'faq_view'];
    const totalEvents = pets.length * config.promoEventsPerPet;
    let eventsDone = 0;

    for (const pet of pets) {
      if (_isCancelled()) return _finishCancelled();
      if (!pet._petId || !petIds.includes(pet._petId)) continue;

      for (let e = 0; e < config.promoEventsPerPet; e++) {
        if (_isCancelled()) return _finishCancelled();

        // Weighted random event type selection
        const eventType = _weightedRandom(eventTypes);
        const context = contexts[Math.floor(Math.random() * contexts.length)];
        // Distribute over last 4 weeks
        const eventDate = new Date(Date.now() - Math.random() * 28 * 24 * 60 * 60 * 1000);

        try {
          await pool.query(
            `INSERT INTO promo_events (owner_user_id, pet_id, promo_item_id, event_type, context, tenant_id, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              ownerUserId,
              pet._petId,
              null,
              eventType,
              context,
              'seed-tenant',
              JSON.stringify({ seeded: 'true' }),
              eventDate.toISOString(),
            ]
          );
        } catch (e2) {
          _log(`Promo event insert warning: ${e2.message}`);
        }

        eventsDone++;
      }

      const pct = 90 + (eventsDone / Math.max(1, totalEvents)) * 5;
      _updateProgress(8, pct, `Events ${eventsDone}/${totalEvents}`);
    }
    _log(`Generated ${eventsDone} promo events`);

    // =====================================================================
    // Phase 9 (95-100%): Update extra_data JSONB
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();
    job.phaseName = 'update_extra_data';
    _updateProgress(9, 95, 'Updating extra_data');
    _log('Phase 9: Updating extra_data JSONB...');

    for (let i = 0; i < pets.length; i++) {
      if (_isCancelled()) return _finishCancelled();
      const pet = pets[i];
      if (!pet._petId || !petIds.includes(pet._petId)) continue;

      const vitalsArray = vitalsMap[pet._petId] || [];
      const medsArray = medsMap[pet._petId] || [];
      const historyArray = historyDataMap[pet._petId] || [];
      const photosArray = photosMap[pet._petId] || [];

      const lastVisitDate = historyArray.length > 0
        ? historyArray.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))[0].visit_date
        : null;

      const extraData = {
        vitals_data: vitalsArray,
        medications: medsArray,
        history_data: historyArray,
        lifestyle: pet.lifestyle,
        photos: photosArray,
        owner_diary: pet.ownerDiary,
        owner_name: pet.ownerName,
        owner_phone: pet.ownerPhone,
        microchip: pet.microchip,
        visit_date: lastVisitDate,
        sex: pet.sex,
        birthdate: pet.birthdate,
        species: pet.species,
        breed: pet.breed,
        weightKg: pet.weightKg,
      };

      try {
        const upd = await pool.query(
          `UPDATE pets SET extra_data = $1, version = version + 1, updated_at = NOW() WHERE pet_id = $2 RETURNING *`,
          [JSON.stringify(extraData), pet._petId]
        );

        // Create pet_changes with full data so pull sync gets complete pet info
        if (upd.rows[0]) {
          try {
            await pool.query(
              `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version, device_id, op_id)
               VALUES ($1, $2, 'pet.upsert', $3, $4, 'seed-engine', $5)`,
              [ownerUserId, pet._petId, JSON.stringify(upd.rows[0]), upd.rows[0].version, randomUUID()]
            );
          } catch (_e) {
            _log(`pet_changes update warning for ${pet.name}: ${_e.message}`);
          }
        }
      } catch (e) {
        _log(`Extra data update error for ${pet.name}: ${e.message}`);
      }

      const pct = 95 + ((i + 1) / pets.length) * 5;
      _updateProgress(9, pct, `Extra data ${i + 1}/${pets.length}: ${pet.name}`);
    }
    _log('Phase 9 complete: extra_data updated');

    // =====================================================================
    // Done
    // =====================================================================
    job.status = 'completed';
    job.progressPct = 100;
    job.phaseName = 'done';
    job.currentItem = null;
    job.completedAt = new Date().toISOString();
    _log(`Seed job completed successfully. ${petIds.length} pets, ${soapsDone} SOAPs, ${docsDone} docs, ${eventsDone} events.`);
  } catch (err) {
    job.status = 'error';
    job.error = err.message || String(err);
    job.completedAt = new Date().toISOString();
    _log(`Seed job failed: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Status / cancel
// ---------------------------------------------------------------------------

function getJobStatus() {
  if (!currentJob) return null;
  return {
    jobId: currentJob.jobId,
    status: currentJob.status,
    phase: currentJob.phase,
    phaseName: currentJob.phaseName,
    progressPct: currentJob.progressPct,
    currentItem: currentJob.currentItem,
    log: currentJob.log,
    config: currentJob.config,
    startedAt: currentJob.startedAt,
    completedAt: currentJob.completedAt,
    error: currentJob.error,
  };
}

function cancelJob() {
  if (currentJob && currentJob.status === 'running') {
    currentJob.cancelled = true;
    _log('Cancel requested by user');
  }
}

function _finishCancelled() {
  if (currentJob) {
    currentJob.status = 'cancelled';
    currentJob.completedAt = new Date().toISOString();
    _log('Seed job cancelled');
  }
}

// ---------------------------------------------------------------------------
// Demo Mode — startDemoJob + phases 10-12
// ---------------------------------------------------------------------------

function startDemoJob(pool, config, openAiKey) {
  if (currentJob && currentJob.status === 'running') {
    return { error: 'already_running' };
  }

  const jobId = 'demo_' + randomUUID();

  const jobConfig = {
    mode: 'demo',
    tenantId: config.tenantId || 'seed-tenant',
    ownerUserId: config.ownerUserId || 'ada-user',
    services: config.services || ['promo', 'nutrition', 'insurance'],
  };

  currentJob = {
    jobId,
    status: 'running',
    config: jobConfig,
    phase: 10,
    phaseName: 'demo_initializing',
    progressPct: 0,
    currentItem: null,
    log: [],
    cancelled: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };

  _runDemoJob(pool, jobConfig, openAiKey).catch((err) => {
    if (currentJob && currentJob.jobId === jobId) {
      currentJob.status = 'error';
      currentJob.error = err.message || String(err);
      currentJob.completedAt = new Date().toISOString();
      _log(`Fatal demo error: ${err.message}`);
    }
  });

  return { jobId };
}

async function _runDemoJob(pool, config, openAiKey) {
  const job = currentJob;
  const ownerUserId = config.ownerUserId;
  const tenantId = config.tenantId;
  const services = config.services || ['promo', 'nutrition', 'insurance'];

  try {
    // =====================================================================
    // Phase 10 (0-40%): Generate demo cohort + insert pets + promo impressions
    // =====================================================================
    job.phaseName = 'demo_setup';
    _updateProgress(10, 0, 'Setting up demo cohort');
    _log('Demo Phase 10: Generating demo cohort and promo impressions...');

    // Ensure tenant exists
    try {
      await pool.query(
        `INSERT INTO tenants (tenant_id, name, slug)
         VALUES ($1, 'Demo Tenant', 'demo-tenant')
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
    } catch (e) {
      _log(`Demo tenant warning: ${e.message}`);
    }

    // Ensure budget
    try {
      await pool.query(
        `INSERT INTO tenant_budgets (tenant_id, monthly_limit)
         VALUES ($1, 10000)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
    } catch (e) {
      _log(`Demo budget warning: ${e.message}`);
    }

    // Auto-set consents for demo owner (all service types)
    const demoConsents = [
      { type: 'marketing_global', scope: 'global' },
      { type: 'clinical_tags', scope: 'global' },
      { type: 'marketing_brand', scope: tenantId },
      { type: 'nutrition_plan', scope: 'global' },
      { type: 'nutrition_brand', scope: tenantId },
      { type: 'insurance_data_sharing', scope: 'global' },
      { type: 'insurance_brand', scope: tenantId },
    ];
    for (const ct of demoConsents) {
      try {
        await pool.query(
          `INSERT INTO consents (owner_user_id, consent_type, scope, status)
           VALUES ($1, $2, $3, 'opted_in')
           ON CONFLICT (owner_user_id, consent_type, scope) DO UPDATE SET status = 'opted_in'`,
          [ownerUserId, ct.type, ct.scope]
        );
      } catch (e) {
        _log(`Demo consent ${ct.type} warning: ${e.message}`);
      }
    }
    _log('Demo consents set for all service types');

    // Fetch tenant products for context
    let tenantProducts = [];
    try {
      const { rows } = await pool.query(
        "SELECT * FROM promo_items WHERE tenant_id = $1 AND status = 'published' LIMIT 50",
        [tenantId]
      );
      tenantProducts = rows;
    } catch (e) {
      _log(`Demo products fetch warning: ${e.message}`);
    }

    // Generate demo cohort (3 pets)
    const pets = generateDemoCohort(tenantProducts);
    _log(`Generated ${pets.length} demo pet profiles`);
    _updateProgress(10, 10, `${pets.length} demo profiles ready`);

    // Insert pets into DB
    const petIds = [];
    for (let i = 0; i < pets.length; i++) {
      if (_isCancelled()) return _finishCancelled();
      const pet = pets[i];
      const petId = randomUUID();
      pet._petId = petId;

      const notes = `Demo: ${pet._demoLabel || pet.name} [seed]`;

      try {
        const ins = await pool.query(
          `INSERT INTO pets (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
           RETURNING *`,
          [petId, ownerUserId, pet.name, SPECIES_IT[pet.species] || pet.species, pet.breed, pet.sex, pet.birthdate, pet.weightKg, notes]
        );
        petIds.push(petId);

        try {
          await pool.query(
            `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version, device_id, op_id)
             VALUES ($1, $2, 'pet.upsert', $3, 1, 'seed-engine', $4)`,
            [ownerUserId, petId, JSON.stringify(ins.rows[0]), randomUUID()]
          );
        } catch (_e) {
          _log(`Demo pet_changes warning for ${pet.name}: ${_e.message}`);
        }
      } catch (e) {
        _log(`Demo pet insert error for ${pet.name}: ${e.message}`);
      }

      _updateProgress(10, 10 + ((i + 1) / pets.length) * 10, `Inserted ${pet.name}`);
    }
    _log(`Inserted ${petIds.length} demo pets`);

    // Generate targeted promo impressions (if promo in services)
    if (services.includes('promo')) {
      const eventTypes = ['impression', 'info_click', 'cta_click'];
      const contexts = ['home_feed', 'pet_profile', 'post_visit'];
      let eventsDone = 0;

      for (const pet of pets) {
        if (_isCancelled()) return _finishCancelled();
        if (!pet._petId) continue;

        for (let e = 0; e < 5; e++) {
          const eventType = eventTypes[e % eventTypes.length];
          const context = contexts[e % contexts.length];
          const eventDate = new Date(Date.now() - Math.random() * 14 * 86400000);

          try {
            await pool.query(
              `INSERT INTO promo_events (owner_user_id, pet_id, promo_item_id, event_type, context, tenant_id, metadata, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [ownerUserId, pet._petId, null, eventType, context, tenantId,
               JSON.stringify({ seeded: 'true', demo: true }), eventDate.toISOString()]
            );
            eventsDone++;
          } catch (e2) {
            _log(`Demo promo event warning: ${e2.message}`);
          }
        }
      }
      _log(`Demo Phase 10: ${eventsDone} promo events generated`);
    }

    // Compute tags for demo pets
    let computeTags = null;
    try {
      computeTags = require('./tag.service').computeTags;
    } catch (_e) {
      _log('Warning: tag.service not available, skipping demo tags');
    }
    if (computeTags) {
      for (const pet of pets) {
        if (!pet._petId) continue;
        try {
          await computeTags(pool, pet._petId, ownerUserId);
        } catch (e) {
          _log(`Demo tag compute warning for ${pet.name}: ${e.message}`);
        }
      }
      _log('Demo tags computed');
    }

    _updateProgress(10, 40, 'Demo setup complete');

    // =====================================================================
    // Phase 11 (40-70%): Generate + auto-validate nutrition plans
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();

    if (services.includes('nutrition')) {
      job.phaseName = 'demo_nutrition';
      _updateProgress(11, 40, 'Generating nutrition plans');
      _log('Demo Phase 11: Generating nutrition plans...');

      let generateNutritionPlan = null;
      try {
        generateNutritionPlan = require('./nutrition.service').generateNutritionPlan;
      } catch (_e) {
        _log('Warning: nutrition.service not available, skipping nutrition plans');
      }

      if (generateNutritionPlan) {
        for (let i = 0; i < pets.length; i++) {
          if (_isCancelled()) return _finishCancelled();
          const pet = pets[i];
          if (!pet._petId) continue;

          try {
            const plan = await generateNutritionPlan(
              pool, pet._petId, ownerUserId, tenantId,
              () => openAiKey
            );

            // Auto-validate the plan (simulate vet approval)
            if (plan && plan.plan_id) {
              try {
                await pool.query(
                  `UPDATE nutrition_plans SET status = 'validated' WHERE plan_id = $1`,
                  [plan.plan_id]
                );
                _log(`Nutrition plan auto-validated for ${pet.name}`);
              } catch (ve) {
                _log(`Nutrition validation warning for ${pet.name}: ${ve.message}`);
              }
            }
          } catch (e) {
            _log(`Nutrition plan error for ${pet.name}: ${e.message}`);
          }

          const pct = 40 + ((i + 1) / pets.length) * 30;
          _updateProgress(11, pct, `Nutrition ${i + 1}/${pets.length}: ${pet.name}`);
        }
      }
      _log('Demo Phase 11 complete: nutrition plans generated');
    }
    _updateProgress(11, 70, 'Nutrition plans done');

    // =====================================================================
    // Phase 12 (70-100%): Generate insurance proposals with risk scores
    // =====================================================================
    if (_isCancelled()) return _finishCancelled();

    if (services.includes('insurance')) {
      job.phaseName = 'demo_insurance';
      _updateProgress(12, 70, 'Generating insurance proposals');
      _log('Demo Phase 12: Generating insurance risk scores and proposals...');

      let computeRiskScore = null;
      try {
        computeRiskScore = require('./risk-scoring.service').computeRiskScore;
      } catch (_e) {
        _log('Warning: risk-scoring.service not available, skipping insurance');
      }

      if (computeRiskScore) {
        for (let i = 0; i < pets.length; i++) {
          if (_isCancelled()) return _finishCancelled();
          const pet = pets[i];
          if (!pet._petId) continue;

          try {
            // Compute risk score
            const score = await computeRiskScore(pool, pet._petId);
            _log(`Risk score for ${pet.name}: ${score.total_score} (${score.risk_class})`);

            // Create an insurance policy proposal in "quoted" status
            const basePremium = 15.0;
            const monthlyPremium = Math.round(basePremium * (score.price_multiplier || 1) * 100) / 100;
            const policyId = 'pol_demo_' + randomUUID().slice(0, 8);

            await pool.query(
              `INSERT INTO insurance_policies (policy_id, pet_id, owner_user_id, tenant_id, promo_item_id, status, monthly_premium, risk_score_id, coverage_data)
               VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8)`,
              [
                policyId, pet._petId, ownerUserId, tenantId,
                pet._demoLabel === 'clinical_adult' ? 'active' : 'quoted',
                monthlyPremium,
                score.score_id || null,
                JSON.stringify({
                  type: 'base',
                  annual_limit: 5000,
                  deductible: 100,
                  coverage_pct: 80,
                }),
              ]
            );
            _log(`Insurance policy ${policyId} created for ${pet.name} (${pet._demoLabel === 'clinical_adult' ? 'active' : 'quoted'})`);
          } catch (e) {
            _log(`Insurance error for ${pet.name}: ${e.message}`);
          }

          const pct = 70 + ((i + 1) / pets.length) * 30;
          _updateProgress(12, pct, `Insurance ${i + 1}/${pets.length}: ${pet.name}`);
        }
      }
      _log('Demo Phase 12 complete: insurance proposals generated');
    }

    // =====================================================================
    // Done
    // =====================================================================
    job.status = 'completed';
    job.progressPct = 100;
    job.phaseName = 'done';
    job.currentItem = null;
    job.completedAt = new Date().toISOString();
    _log(`Demo job completed successfully. ${petIds.length} pets with services: ${services.join(', ')}.`);
  } catch (err) {
    job.status = 'error';
    job.error = err.message || String(err);
    job.completedAt = new Date().toISOString();
    _log(`Demo job failed: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function _randomPastDate(maxDaysAgo) {
  const now = Date.now();
  const offset = Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function _parseSoapJson(raw) {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(raw);
    return {
      S: parsed.S || parsed.s || '',
      O: parsed.O || parsed.o || '',
      A: parsed.A || parsed.a || '',
      P: parsed.P || parsed.p || '',
    };
  } catch (_e) {
    // Try extracting JSON from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return {
          S: parsed.S || parsed.s || '',
          O: parsed.O || parsed.o || '',
          A: parsed.A || parsed.a || '',
          P: parsed.P || parsed.p || '',
        };
      } catch (_e2) {
        // fall through
      }
    }

    // Fallback: extract sections from free-form text with headers like
    // "**S (Soggettivo):**", "S:", "## S", etc.
    return {
      S: _extractSoapSection(raw, 'S'),
      O: _extractSoapSection(raw, 'O'),
      A: _extractSoapSection(raw, 'A'),
      P: _extractSoapSection(raw, 'P'),
    };
  }
}

function _extractSoapSection(text, letter) {
  // Match section headers like: **S (Soggettivo):**, ## S, S:, "S":
  // Then capture everything until the next section header or end of text
  const nextLetters = { S: 'O', O: 'A', A: 'P', P: null };
  const next = nextLetters[letter];

  // Build pattern: match the letter as a section header followed by content
  const headerPattern = `(?:\\*\\*)?\\s*${letter}\\s*(?:\\([^)]*\\))?\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*`;
  let endPattern;
  if (next) {
    // Stop at the next SOAP section header
    endPattern = `(?=(?:\\*\\*)?\\s*${next}\\s*(?:\\([^)]*\\))?\\s*:?\\s*(?:\\*\\*)?|$)`;
  } else {
    endPattern = '$';
  }

  const regex = new RegExp(headerPattern + '([\\s\\S]*?)' + endPattern, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function _simpleHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

function _weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item.type;
  }
  return items[items.length - 1].type;
}

function _defaultMedsForSpecies(species) {
  const defaults = {
    dog: [
      { name: 'Frontline (fipronil)', dosage: '1 pipetta/mese' },
      { name: 'Milbemax (milbemicina)', dosage: '1 compressa/3 mesi' },
      { name: 'Rimadyl (carprofen)', dosage: '2 mg/kg/die' },
    ],
    cat: [
      { name: 'Broadline (fipronil+methoprene)', dosage: '1 pipetta/mese' },
      { name: 'Milbemax gatto', dosage: '1 compressa/3 mesi' },
      { name: 'Metacam (meloxicam)', dosage: '0.05 mg/kg/die' },
    ],
    rabbit: [
      { name: 'Panacur (fenbendazole)', dosage: '20 mg/kg per 5 giorni' },
      { name: 'Baytril (enrofloxacin)', dosage: '10 mg/kg/die' },
    ],
  };
  return defaults[species] || defaults.dog;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { startSeedJob, startDemoJob, getJobStatus, cancelJob, wipeSeededData };
