// backend/src/promo.routes.js v2
// Promo / product recommendation engine (PR 10 + PR 3 rewrite)
const express = require("express");

// UUID v4 validation regex
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function _randomProductPlaceholder() {
  const index = String(Math.floor(Math.random() * 45) + 1).padStart(2, '0');
  return `/api/seed-assets/placeholder-prodotti/Prodotto_${index}.png`;
}

// Mock product catalog for deterministic recommendations (backward compat)
const PRODUCT_CATALOG = [
  {
    product_id: "prod_001",
    name: "Premium Dog Food - Adult",
    category: "food",
    species: "dog",
    description: "High-quality kibble for adult dogs with balanced nutrition.",
    price_eur: 29.99,
    image_url: null,
  },
  {
    product_id: "prod_002",
    name: "Premium Cat Food - Indoor",
    category: "food",
    species: "cat",
    description:
      "Specially formulated for indoor cats to maintain healthy weight.",
    price_eur: 24.99,
    image_url: null,
  },
  {
    product_id: "prod_003",
    name: "Flea & Tick Prevention - Dogs",
    category: "health",
    species: "dog",
    description: "Monthly topical flea and tick prevention for dogs.",
    price_eur: 34.99,
    image_url: null,
  },
  {
    product_id: "prod_004",
    name: "Flea & Tick Prevention - Cats",
    category: "health",
    species: "cat",
    description: "Monthly topical flea and tick prevention for cats.",
    price_eur: 29.99,
    image_url: null,
  },
  {
    product_id: "prod_005",
    name: "Joint Supplement",
    category: "supplement",
    species: "dog",
    description:
      "Glucosamine and chondroitin supplement for joint health.",
    price_eur: 19.99,
    image_url: null,
  },
  {
    product_id: "prod_006",
    name: "Dental Care Kit",
    category: "dental",
    species: "all",
    description:
      "Complete dental care kit with toothbrush and enzymatic toothpaste.",
    price_eur: 14.99,
    image_url: null,
  },
  {
    product_id: "prod_007",
    name: "Calming Supplement",
    category: "supplement",
    species: "all",
    description: "Natural calming supplement for anxious pets.",
    price_eur: 17.99,
    image_url: null,
  },
  {
    product_id: "prod_008",
    name: "Probiotic Digestive Support",
    category: "supplement",
    species: "all",
    description: "Daily probiotic for digestive health.",
    price_eur: 22.99,
    image_url: null,
  },
];

/**
 * Deterministic product selection based on pet_id (legacy mock mode).
 */
function selectRecommendations(petId, species, count = 3) {
  let hash = 0;
  for (let i = 0; i < petId.length; i++) {
    hash = ((hash << 5) - hash + petId.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const eligible = PRODUCT_CATALOG.filter(
    (p) => p.species === "all" || p.species === (species || "").toLowerCase()
  );

  if (eligible.length === 0) {
    return PRODUCT_CATALOG.slice(0, count);
  }

  const results = [];
  for (let i = 0; i < Math.min(count, eligible.length); i++) {
    const idx = (hash + i) % eligible.length;
    const product = eligible[idx];
    if (!results.find((r) => r.product_id === product.product_id)) {
      results.push(product);
    }
  }

  if (results.length < count) {
    for (const p of eligible) {
      if (!results.find((r) => r.product_id === p.product_id)) {
        results.push(p);
      }
      if (results.length >= count) break;
    }
  }

  return results.map((p) => ({
    ...p,
    image_url: p.image_url || _randomProductPlaceholder(),
  }));
}

/**
 * Promo routes: recommendations, events, consent, vet flags.
 */
function promoRouter({ requireAuth }) {
  const router = express.Router();
  const hasDatabaseUrl = !!process.env.DATABASE_URL;

  // In-memory event store for mock mode (capped at 1000)
  const mockEvents = [];
  const MOCK_EVENTS_MAX = 1000;
  function _addMockEvent(evt) {
    mockEvents.push(evt);
    if (mockEvents.length > MOCK_EVENTS_MAX) {
      mockEvents.splice(0, mockEvents.length - MOCK_EVENTS_MAX);
    }
  }

  let pool = null;
  if (hasDatabaseUrl) {
    try {
      const { getPool } = require("./db");
      pool = getPool();
    } catch (_e) {
      console.warn(
        "promo.routes: could not initialize DB pool, running in mock mode"
      );
    }
  }

  // Lazy-load services (only when pool is available)
  let selectPromo = null;
  let generateExplanation = null;
  let getEffectiveConsent = null;
  let updateConsent = null;
  let getPendingConsents = null;
  let requireRole = null;

  if (pool) {
    try {
      selectPromo = require("./eligibility.service").selectPromo;
      generateExplanation = require("./explanation.service").generateExplanation;
      const consentSvc = require("./consent.service");
      getEffectiveConsent = consentSvc.getEffectiveConsent;
      updateConsent = consentSvc.updateConsent;
      getPendingConsents = consentSvc.getPendingConsents;
      requireRole = require("./rbac.middleware").requireRole;
    } catch (_e) {
      console.warn("promo.routes: could not load promo services");
    }
  }

  // Helper: get OpenAI key
  function _getOpenAiKey() {
    const keyName = [
      "4f", "50", "45", "4e", "41", "49", "5f", "41", "50", "49", "5f", "4b", "45", "59",
    ]
      .map((v) => String.fromCharCode(Number.parseInt(v, 16)))
      .join("");
    return process.env[keyName] || null;
  }

  // =======================================================
  // Helper: collect pet data sources from DB (server-side equivalent of frontend _collectPetDataForAI)
  // =======================================================
  async function _collectPetSourcesFromDB(dbPool, petId) {
    const sources = {};

    // 1. Pet data + extra_data JSONB
    try {
      const petRes = await dbPool.query(
        "SELECT name, species, breed, sex, birthdate, weight_kg, neutered, lifestyle, extra_data FROM pets WHERE pet_id = $1 LIMIT 1",
        [petId]
      );
      if (petRes.rows[0]) {
        const p = petRes.rows[0];
        const extra = p.extra_data || {};
        sources.dati_pet = {
          nome: p.name || null,
          specie: p.species || null,
          razza: p.breed || null,
          sesso: p.sex || null,
          data_nascita: p.birthdate || null,
          peso_kg: p.weight_kg || null,
          sterilizzato: p.neutered || null,
          stile_di_vita: p.lifestyle || null,
          microchip: extra.microchip || null,
        };
        // Extra sources from extra_data JSONB
        if (extra.vitals_data) {
          sources.parametri_vitali = extra.vitals_data;
        }
        if (extra.medications) {
          sources.farmaci = extra.medications;
        }
        if (extra.history_data) {
          sources.storico_sanitario = extra.history_data;
        }
      }
    } catch (_e) {}

    // 2. Documents
    try {
      const docsRes = await dbPool.query(
        "SELECT doc_type, original_filename, ai_extracted_text, created_at FROM documents WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 20",
        [petId]
      );
      if (docsRes.rows.length > 0) {
        sources.documenti = docsRes.rows.map(d => ({
          tipo: d.doc_type, nome: d.original_filename,
          ai_text: d.ai_extracted_text || null, data: d.created_at,
        }));
      }
    } catch (_e) {}

    // 3. Conversations
    try {
      const convRes = await dbPool.query(
        "SELECT type, subject, created_at FROM conversations WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 20",
        [petId]
      );
      if (convRes.rows.length > 0) {
        sources.conversazioni = convRes.rows.map(c => ({
          tipo: c.type, oggetto: c.subject, data: c.created_at,
        }));
      }
    } catch (_e) {}

    return sources;
  }

  // =======================================================
  // Helper: run analysis for a single pet (extracted from analyze-match-all)
  // =======================================================
  async function _runAnalysisForPet(dbPool, petId, openAiKey) {
    // 1. Get pet data + ai_description
    let pet = null;
    let petAiDesc = null;
    try {
      const petResult = await dbPool.query(
        "SELECT pet_id, name, species, breed, birthdate, weight_kg, ai_description FROM pets WHERE pet_id = $1 LIMIT 1",
        [petId]
      );
      if (petResult.rows[0]) {
        pet = petResult.rows[0];
        petAiDesc = pet.ai_description;
      }
    } catch (e) {
      console.error("_runAnalysisForPet: pet query error", e.message);
    }

    if (!petAiDesc) {
      return { error: "pet_ai_description_missing", petName: pet ? pet.name : null };
    }

    // 2. Get pet tags for pre-filtering
    let petTags = [];
    try {
      const tagsResult = await dbPool.query(
        "SELECT tag, value, confidence FROM pet_tags WHERE pet_id = $1",
        [petId]
      );
      petTags = tagsResult.rows;
    } catch (_e) {}

    const petTagNames = petTags.map(t => t.tag);

    // 3. Species + lifecycle
    const { normalizeSpecies } = require("./tag.service");
    const petSpecies = pet.species ? normalizeSpecies(pet.species) : null;

    let petLifecycle = null;
    try {
      const lcResult = await dbPool.query(
        "SELECT tag FROM pet_tags WHERE pet_id = $1 AND tag LIKE 'lifecycle:%' ORDER BY computed_at DESC LIMIT 1",
        [petId]
      );
      if (lcResult.rows[0]) {
        petLifecycle = lcResult.rows[0].tag.replace('lifecycle:', '');
      }
    } catch (_e) {}

    // 4. Fetch ALL published promo items
    let allItems = [];
    try {
      const itemsResult = await dbPool.query(
        `SELECT promo_item_id, tenant_id, name, category, species, lifecycle_target,
                description, extended_description, image_url, product_url,
                tags_include, tags_exclude, priority, service_type
         FROM promo_items
         WHERE status = 'published'`
      );
      allItems = itemsResult.rows;
    } catch (e) {
      console.error("_runAnalysisForPet: items query error", e.message);
      return { error: "db_error", petName: pet.name };
    }

    // 5. Pre-filter candidates
    const candidates = [];
    for (const item of allItems) {
      if (
        petSpecies && item.species &&
        Array.isArray(item.species) && item.species.length > 0 &&
        !item.species.includes("all") &&
        !item.species.includes(petSpecies)
      ) continue;

      if (
        petLifecycle && item.lifecycle_target &&
        Array.isArray(item.lifecycle_target) && item.lifecycle_target.length > 0 &&
        !item.lifecycle_target.includes("all") &&
        !item.lifecycle_target.includes(petLifecycle)
      ) continue;

      if (item.tags_exclude && item.tags_exclude.length > 0) {
        const excluded = item.tags_exclude.some(t => petTagNames.includes(t));
        if (excluded) continue;
      }

      if (!item.extended_description && !item.description) continue;

      candidates.push(item);
    }

    if (candidates.length === 0) {
      return { petId, petName: pet.name, matches: [], fromCache: false, candidatesCount: 0 };
    }

    // 6. Check cache
    const { createHash } = require("crypto");
    const candidateIds = candidates.map(c => c.promo_item_id).sort().join(",");
    const cacheInput = petAiDesc + "|" + candidateIds;
    const cacheKey = "aml_" + createHash("sha256").update(cacheInput).digest("hex");

    try {
      const cacheResult = await dbPool.query(
        "SELECT explanation FROM explanation_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1",
        [cacheKey]
      );
      if (cacheResult.rows[0]) {
        const cached = cacheResult.rows[0].explanation;
        return {
          petId, petName: pet.name,
          matches: cached.matches || [],
          fromCache: true, candidatesCount: candidates.length
        };
      }
    } catch (_e) {}

    // 7. Build candidate list for prompt (max 30)
    const topCandidates = candidates.slice(0, 30);
    const candidateList = topCandidates.map((item, idx) => {
      const desc = item.extended_description || item.description || "N/A";
      return `${idx + 1}. [ID:${item.promo_item_id}] "${item.name}" — ${desc}`;
    }).join("\n");

    // 8. Call OpenAI
    const systemPrompt = `Sei un esperto veterinario e consulente per prodotti per animali domestici.
Analizza la descrizione di un pet e confrontala con i prodotti candidati.
Per ogni prodotto, valuta quanto è adatto a QUESTO SPECIFICO pet.
Seleziona i TOP 5 prodotti più adatti e spiega PERCHÉ sono adatti a questo pet.
La spiegazione deve essere utile per il proprietario del pet: usa un linguaggio chiaro e amichevole.
Rispondi SOLO con JSON valido, senza markdown o testo aggiuntivo.`;

    const userPrompt = `DESCRIZIONE PET:
${petAiDesc}

PRODOTTI CANDIDATI (${topCandidates.length} su ${candidates.length} pre-filtrati):
${candidateList}

Rispondi con questo JSON:
{
  "matches": [
    {
      "promo_item_id": "...",
      "product_name": "Nome prodotto",
      "score": 92,
      "reasoning": "Spiegazione dettagliata di perché questo prodotto è adatto a questo pet (2-3 frasi)",
      "key_matches": ["aspetto1", "aspetto2", "aspetto3"],
      "relevance": "high"
    }
  ]
}

REGOLE:
- Ritorna esattamente i TOP 5 prodotti più adatti (o meno se non ce ne sono 5 adatti)
- score: 0-100 (100 = perfettamente adatto)
- relevance: "high" (score>=70), "medium" (score 40-69), "low" (score<40)
- key_matches: lista di 2-4 aspetti specifici che corrispondono
- reasoning: spiega al proprietario PERCHÉ questo prodotto fa bene al SUO pet specifico
- Ordina per score discendente`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const startMs = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      console.error(`[_runAnalysisForPet] OpenAI error: ${response.status}`);
      return { error: "openai_error", petName: pet.name };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;

    // 9. Parse response
    let parsed = { matches: [] };
    try {
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
      }
    } catch (parseErr) {
      console.warn("[_runAnalysisForPet] JSON parse error:", parseErr.message);
    }

    // Enrich matches with image_url and product_url
    if (parsed.matches && Array.isArray(parsed.matches)) {
      parsed.matches = parsed.matches.map(m => {
        const dbItem = candidates.find(c => c.promo_item_id === m.promo_item_id);
        return {
          ...m,
          image_url: dbItem?.image_url || null,
          product_url: dbItem?.product_url || null,
          category: dbItem?.category || null
        };
      });
    }

    // 10. Save to cache (TTL 24h)
    try {
      await dbPool.query(
        `INSERT INTO explanation_cache (cache_key, explanation, model, tokens_used, latency_ms, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
         ON CONFLICT (cache_key) DO UPDATE SET explanation = $2, tokens_used = $4, latency_ms = $5, expires_at = NOW() + INTERVAL '24 hours'`,
        [cacheKey, JSON.stringify(parsed), "gpt-4o-mini", tokensUsed, latencyMs]
      );
    } catch (cacheErr) {
      console.warn("[_runAnalysisForPet] cache write error:", cacheErr.message);
    }

    return {
      petId, petName: pet.name,
      matches: parsed.matches || [],
      fromCache: false, candidatesCount: candidates.length,
      latencyMs, tokensUsed
    };
  }

  // =======================================================
  // GET /api/promo/recommendation?petId=X&context=home_feed
  // =======================================================
  router.get("/api/promo/recommendation", requireAuth, async (req, res) => {
    try {
      const ownerUserId = req.user?.sub;
      const petId = req.query.petId;
      const context = req.query.context || "home_feed";

      if (!petId || !isValidUuid(petId)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      // --- Full pipeline (when DB + services available) ---
      const force = req.query.force === '1';
      if (pool && selectPromo && generateExplanation) {
        try {
          const promoResult = await selectPromo(pool, {
            petId,
            ownerUserId,
            context,
            force,
          });

          if (!promoResult) {
            return res.json({ pet_id: petId, recommendation: null });
          }

          // Fetch pet data for explanation
          let pet = null;
          try {
            const petResult = await pool.query(
              "SELECT * FROM pets WHERE pet_id = $1 LIMIT 1",
              [petId]
            );
            pet = petResult.rows[0] || null;
          } catch (_e) {
            // skip
          }

          // Generate explanation
          const _item = promoResult._item || promoResult;
          const explResult = await generateExplanation(pool, {
            pet,
            promoItem: _item,
            context,
            matchedTags: promoResult.matchedTags || [],
            getOpenAiKey: _getOpenAiKey,
            serviceType: Array.isArray(_item.service_type) ? _item.service_type[0] : (_item.service_type || null),
          });

          const confidence = explResult.explanation?.confidence || "low";
          const ctaEnabled = confidence === "high" || confidence === "medium";

          // Use effective service type from context rules, not the item's raw service_type array
          const effectiveServiceType = Array.isArray(_item.service_type) && _item.service_type.includes("promo") && context !== "insurance_review" && context !== "nutrition_review"
            ? "promo"
            : (Array.isArray(_item.service_type) ? _item.service_type[0] : (_item.service_type || "promo"));

          const recommendation = {
            promoItemId: promoResult.promoItemId,
            tenantId: promoResult.tenantId,
            name: promoResult.name,
            category: promoResult.category,
            imageUrl: promoResult.imageUrl,
            explanation: explResult.explanation,
            ctaEnabled,
            ctaLabel: ctaEnabled ? "Acquista" : "Scopri di più",
            ctaUrl: promoResult.ctaUrl,
            context,
            source: explResult.source,
            serviceType: effectiveServiceType,
          };

          return res.json({ pet_id: petId, recommendation });
        } catch (pipelineErr) {
          console.warn(
            "promo recommendation pipeline error, falling back to mock:",
            pipelineErr.message
          );
          // Fall through to mock mode
        }
      }

      // --- Mock/fallback mode ---
      let species = null;
      if (pool) {
        try {
          const { rows } = await pool.query(
            "SELECT species FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1",
            [petId, ownerUserId]
          );
          if (rows[0]) species = rows[0].species;
        } catch (_dbErr) {
          // skip
        }
      }

      const recommendations = selectRecommendations(petId, species);
      res.json({ pet_id: petId, recommendations });
    } catch (e) {
      console.error("GET /api/promo/recommendation error", e);
      // NFR-001: never fail visibly
      res.json({ pet_id: req.query.petId || null, recommendation: null });
    }
  });

  // POST /api/promo/recommendation - alternative with body (backward compat)
  router.post("/api/promo/recommendation", requireAuth, async (req, res) => {
    try {
      const ownerUserId = req.user?.sub;
      const { petId, species, count } = req.body || {};

      if (!petId || !isValidUuid(petId)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      let resolvedSpecies = species || null;
      if (!resolvedSpecies && pool) {
        try {
          const { rows } = await pool.query(
            "SELECT species FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1",
            [petId, ownerUserId]
          );
          if (rows[0]) resolvedSpecies = rows[0].species;
        } catch (_dbErr) {
          // skip
        }
      }

      const recommendations = selectRecommendations(
        petId,
        resolvedSpecies,
        count || 3
      );
      res.json({ pet_id: petId, recommendations });
    } catch (e) {
      console.error("POST /api/promo/recommendation error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // EVENT TRACKING
  // =======================================================

  // POST /api/promo/event - single event (backward compat)
  router.post("/api/promo/event", requireAuth, async (req, res) => {
    try {
      const ownerUserId = req.user?.sub;
      const { event_type, product_id, pet_id, metadata } = req.body || {};

      if (!event_type) {
        return res.status(400).json({ error: "event_type_required" });
      }

      const event = {
        owner_user_id: ownerUserId,
        event_type,
        product_id: product_id || null,
        pet_id: pet_id || null,
        metadata: metadata || null,
        created_at: new Date().toISOString(),
      };

      if (pool) {
        try {
          // Try promo_events table first (new)
          await pool.query(
            `INSERT INTO promo_events (owner_user_id, pet_id, promo_item_id, event_type, context, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              ownerUserId,
              pet_id || null,
              product_id || null,
              event_type,
              metadata?.context || null,
              JSON.stringify(metadata || {}),
            ]
          );
        } catch (_insertErr) {
          // Fallback to audit_log (old table)
          try {
            await pool.query(
              `INSERT INTO audit_log (who, action, entity_id, entity_type, details)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                ownerUserId,
                `promo.${event_type}`,
                product_id || pet_id || null,
                product_id ? "product" : "promo",
                JSON.stringify(event),
              ]
            );
          } catch (_dbErr) {
            _addMockEvent(event);
          }
        }
      } else {
        mockEvents.push(event);
      }

      res.status(201).json({ ok: true, event });
    } catch (e) {
      console.error("POST /api/promo/event error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/promo/events - batch events (new)
  router.post("/api/promo/events", requireAuth, async (req, res) => {
    try {
      const ownerUserId = req.user?.sub;
      const events = req.body?.events;

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: "events_array_required" });
      }

      let inserted = 0;
      for (const evt of events.slice(0, 50)) {
        // max 50 per batch
        if (!evt.event_type) continue;
        try {
          if (pool) {
            await pool.query(
              `INSERT INTO promo_events (owner_user_id, pet_id, promo_item_id, event_type, context, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                ownerUserId,
                evt.pet_id || null,
                evt.product_id || null,
                evt.event_type,
                evt.context || null,
                JSON.stringify(evt.metadata || {}),
              ]
            );
          } else {
            _addMockEvent({ ...evt, owner_user_id: ownerUserId });
          }
          inserted++;
        } catch (_e) {
          // skip individual event errors
        }
      }

      res.status(201).json({ ok: true, inserted });
    } catch (e) {
      console.error("POST /api/promo/events error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // VET FLAGS
  // =======================================================

  // POST /api/promo/vet-flag
  router.post("/api/promo/vet-flag", requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "database_required" });
    if (requireRole) {
      // Inline role check for vet
      const user = req.user;
      const isVet =
        (user?.sub === "ada-user" && req.headers["x-ada-role"] === "vet_int") ||
        user?.role === "vet_int";
      if (!isVet) return res.status(403).json({ error: "forbidden_vet_only" });
    }

    try {
      const { pet_id, promo_item_id, reason } = req.body || {};
      if (!pet_id || !promo_item_id) {
        return res
          .status(400)
          .json({ error: "pet_id_and_promo_item_id_required" });
      }

      const vetUserId = req.user?.sub || "ada-user";
      const { rows } = await pool.query(
        `INSERT INTO vet_flags (pet_id, promo_item_id, vet_user_id, reason, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (pet_id, promo_item_id) WHERE status = 'active' DO NOTHING
         RETURNING *`,
        [pet_id, promo_item_id, vetUserId, reason || null]
      );

      if (rows[0]) {
        res.status(201).json(rows[0]);
      } else {
        res.json({ message: "flag_already_exists" });
      }
    } catch (e) {
      console.error("POST /api/promo/vet-flag error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // DELETE /api/promo/vet-flag/:flagId
  router.delete("/api/promo/vet-flag/:flagId", requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "database_required" });
    if (requireRole) {
      const user = req.user;
      const isVet =
        (user?.sub === "ada-user" && req.headers["x-ada-role"] === "vet_int") ||
        user?.role === "vet_int";
      if (!isVet) return res.status(403).json({ error: "forbidden_vet_only" });
    }

    try {
      const { flagId } = req.params;
      const vetUserId = req.user?.sub || "ada-user";
      const { rows } = await pool.query(
        `UPDATE vet_flags SET status = 'resolved', resolved_by = $2, resolved_at = NOW()
         WHERE flag_id = $1 AND status = 'active'
         RETURNING *`,
        [flagId, vetUserId]
      );

      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      res.json(rows[0]);
    } catch (e) {
      console.error("DELETE /api/promo/vet-flag/:flagId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // GET /api/promo/items/:id — single promo item details
  // =======================================================
  router.get("/api/promo/items/:id", requireAuth, async (req, res) => {
    try {
      const itemId = req.params.id;
      if (!itemId || !isValidUuid(itemId)) return res.status(400).json({ error: "invalid_item_id" });
      if (!pool) return res.status(503).json({ error: "db_not_available" });
      const { rows } = await pool.query(
        "SELECT promo_item_id, name, description, extended_description, service_type, brand_id FROM promo_items WHERE promo_item_id = $1 LIMIT 1",
        [itemId]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      res.json(rows[0]);
    } catch (e) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // CONSENT
  // =======================================================

  // GET /api/promo/consent
  router.get("/api/promo/consent", requireAuth, async (req, res) => {
    if (!pool || !getEffectiveConsent) {
      return res.json({
        marketing_global: "opted_in",
        clinical_tags: "opted_out",
        brand_consents: {},
      });
    }

    try {
      const ownerUserId = req.user?.sub;
      const consent = await getEffectiveConsent(pool, ownerUserId);
      res.json(consent);
    } catch (e) {
      console.error("GET /api/promo/consent error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PUT /api/promo/consent
  router.put("/api/promo/consent", requireAuth, async (req, res) => {
    if (!pool || !updateConsent) {
      return res.status(503).json({ error: "database_required" });
    }

    try {
      const ownerUserId = req.user?.sub;
      const { consent_type, scope, status: newStatus } = req.body || {};

      if (!consent_type || !newStatus) {
        return res
          .status(400)
          .json({ error: "consent_type_and_status_required" });
      }

      const validTypes = [
        "marketing_global",
        "marketing_brand",
        "clinical_tags",
        "nutrition_plan",
        "nutrition_brand",
        "insurance_data_sharing",
        "insurance_brand",
      ];
      if (!validTypes.includes(consent_type)) {
        return res.status(400).json({ error: "invalid_consent_type" });
      }

      const validStatuses = ["opted_in", "opted_out"];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ error: "invalid_status" });
      }

      const result = await updateConsent(
        pool,
        ownerUserId,
        consent_type,
        scope || "global",
        newStatus,
        ownerUserId,
        req.ip
      );
      res.json(result);
    } catch (e) {
      console.error("PUT /api/promo/consent error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/promo/consent/pending
  router.get("/api/promo/consent/pending", requireAuth, async (req, res) => {
    if (!pool || !getPendingConsents) {
      return res.json({ pending: [] });
    }

    try {
      const ownerUserId = req.user?.sub;
      const pending = await getPendingConsents(pool, ownerUserId);
      res.json({ pending });
    } catch (e) {
      console.error("GET /api/promo/consent/pending error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/promo/consent/ack
  router.post("/api/promo/consent/ack", requireAuth, async (req, res) => {
    if (!pool || !updateConsent) {
      return res.status(503).json({ error: "database_required" });
    }

    try {
      const ownerUserId = req.user?.sub;
      const { consent_type, scope, status: newStatus } = req.body || {};

      if (!consent_type || !newStatus) {
        return res
          .status(400)
          .json({ error: "consent_type_and_status_required" });
      }

      const validTypes = [
        "marketing_global", "marketing_brand", "clinical_tags",
        "nutrition_plan", "nutrition_brand", "insurance_data_sharing", "insurance_brand",
      ];
      if (!validTypes.includes(consent_type)) {
        return res.status(400).json({ error: "invalid_consent_type" });
      }

      const validStatuses = ["opted_in", "opted_out"];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ error: "invalid_status" });
      }

      const result = await updateConsent(
        pool,
        ownerUserId,
        consent_type,
        scope || "global",
        newStatus,
        ownerUserId,
        req.ip
      );
      res.json(result);
    } catch (e) {
      console.error("POST /api/promo/consent/ack error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // GET /api/promo/consent/services
  // Returns service_types with their active tenants (from published promo_items)
  // =======================================================
  router.get("/api/promo/consent/services", requireAuth, async (req, res) => {
    if (!pool) {
      return res.json({ services: [] });
    }

    try {
      // Get tenants with published items (with their service_types)
      const { rows: publishedRows } = await pool.query(
        `SELECT DISTINCT unnest(pi.service_type) AS service_type, pi.tenant_id, t.name AS tenant_name
         FROM promo_items pi
         JOIN tenants t ON t.tenant_id = pi.tenant_id
         WHERE pi.status = 'published'
         ORDER BY service_type, tenant_name`
      );

      // Also get ALL active tenants (even without published items)
      const { rows: allTenants } = await pool.query(
        `SELECT tenant_id, name AS tenant_name FROM tenants WHERE status = 'active' ORDER BY name`
      );

      // Group by service_type
      const serviceMap = {};
      for (const row of publishedRows) {
        if (!serviceMap[row.service_type]) {
          serviceMap[row.service_type] = { service_type: row.service_type, tenants: [] };
        }
        const existing = serviceMap[row.service_type].tenants.find(t => t.tenant_id === row.tenant_id);
        if (!existing) {
          serviceMap[row.service_type].tenants.push({
            tenant_id: row.tenant_id,
            name: row.tenant_name,
          });
        }
      }

      // Ensure all active tenants appear in default service types
      const defaultTypes = ['promo', 'nutrition', 'insurance'];
      for (const dtype of defaultTypes) {
        if (!serviceMap[dtype]) {
          serviceMap[dtype] = { service_type: dtype, tenants: [] };
        }
        for (const tenant of allTenants) {
          const exists = serviceMap[dtype].tenants.find(t => t.tenant_id === tenant.tenant_id);
          if (!exists) {
            serviceMap[dtype].tenants.push({
              tenant_id: tenant.tenant_id,
              name: tenant.tenant_name,
            });
          }
        }
      }

      res.json({ services: Object.values(serviceMap) });
    } catch (e) {
      console.error("GET /api/promo/consent/services error", e);
      res.json({ services: [] });
    }
  });

  // =======================================================
  // POST /api/promo/ai-match
  // AI-powered matching between pet description and product descriptions
  // =======================================================
  router.post("/api/promo/ai-match", requireAuth, async (req, res) => {
    try {
      const { petId, petDescription, candidateItems } = req.body;
      if (!petDescription || !candidateItems || !Array.isArray(candidateItems) || candidateItems.length === 0) {
        return res.status(400).json({ error: "missing_data" });
      }

      const openAiKey = _getOpenAiKey();
      if (!openAiKey) {
        return res.status(503).json({ error: "openai_not_configured" });
      }

      const candidateList = candidateItems.map(function(item, idx) {
        return (idx + 1) + ". [ID: " + item.promo_item_id + "] " + (item.extended_description || item.name || "N/A");
      }).join("\n");

      const systemPrompt = `Sei un sistema di ranking per raccomandazioni di prodotti veterinari/assicurativi/nutrizionali.
Devi valutare quanto ogni prodotto candidato è adatto a un pet specifico.
Rispondi SOLO con JSON valido.`;

      const userPrompt = `Descrizione pet:\n${petDescription}\n\nProdotti candidati:\n${candidateList}\n\nPer ogni prodotto, assegna uno score da 0 a 100 e una breve motivazione.
Rispondi con questo JSON:
{ "matches": [{ "promo_item_id": "...", "score": 85, "reasoning": "..." }] }
Ordina per score discendente.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1000
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: "openai_error" });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      // Parse JSON response
      try {
        const jsonStart = content.indexOf("{");
        const jsonEnd = content.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
          return res.json(parsed);
        }
      } catch (_) {}

      res.json({ matches: [] });
    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "timeout" });
      }
      console.error("POST /api/promo/ai-match error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // POST /api/promo/analyze-match-all
  // AI-powered analysis: pet vs ALL eligible products (pre-filtered)
  // =======================================================
  router.post("/api/promo/analyze-match-all", requireAuth, async (req, res) => {
    try {
      const { petId } = req.body;

      if (!petId || !isValidUuid(petId)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      const openAiKey = _getOpenAiKey();
      if (!openAiKey) {
        return res.status(503).json({ error: "openai_not_configured" });
      }

      if (!pool) {
        return res.status(503).json({ error: "db_not_available" });
      }

      const result = await _runAnalysisForPet(pool, petId, openAiKey);

      if (result.error === "pet_ai_description_missing") {
        return res.status(400).json({ error: "pet_ai_description_missing", message: "Generare prima la descrizione AI del pet" });
      }
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }

      console.log(`[analyze-match-all] done pet=${petId} candidates=${result.candidatesCount} top=${result.matches?.length || 0} cached=${result.fromCache}`);
      return res.json(result);

    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "timeout" });
      }
      console.error("POST /api/promo/analyze-match-all error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // =======================================================
  // POST /api/promo/analyze-match
  // Analyze match between pet description and product description (debug)
  // =======================================================
  router.post("/api/promo/analyze-match", requireAuth, async (req, res) => {
    try {
      const { petDescription, productDescription } = req.body;
      if (!petDescription || !productDescription) {
        return res.status(400).json({ error: "missing_data" });
      }

      const openAiKey = _getOpenAiKey();
      if (!openAiKey) {
        return res.status(503).json({ error: "openai_not_configured" });
      }

      const systemPrompt = `Analizza le corrispondenze tra la descrizione di un pet e la descrizione di un prodotto/servizio.
Identifica le corrispondenze (aspetti in comune) e ordinale per rilevanza.
IMPORTANTE: Trova SEMPRE almeno una corrispondenza, anche generica. Ad esempio: corrispondenza per specie dell'animale, fascia d'età, taglia, o categoria generica del prodotto.
Se non ci sono corrispondenze specifiche, elenca quelle generiche disponibili.
NON mostrare informazioni senza corrispondenza.
Rispondi SOLO con JSON valido.`;

      const userPrompt = `Descrizione pet:\n${petDescription}\n\nDescrizione prodotto:\n${productDescription}\n\nRispondi con questo JSON:
{ "matches": [{ "aspect": "Nome aspetto", "pet_detail": "Dettaglio dal pet", "product_detail": "Dettaglio dal prodotto", "relevance": "high|medium|low" }] }
Ordina per rilevanza decrescente. Massimo 10 corrispondenze.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1000
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: "openai_error" });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      try {
        const jsonStart = content.indexOf("{");
        const jsonEnd = content.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
          return res.json(parsed);
        }
      } catch (_) {}

      res.json({ matches: [] });
    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "timeout" });
      }
      console.error("POST /api/promo/analyze-match error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Content-based hash for sources (matches frontend _computeSourcesHash)
  function _computeSourcesHash(sources) {
    const str = JSON.stringify(sources);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return str.length + '_' + Math.abs(hash);
  }

  // Structured AI description prompt (same as POST /api/pets/:petId/ai-description)
  function _getStructuredDescPrompts(sources) {
    const systemPrompt = `Sei un assistente che prepara descrizioni strutturate di animali domestici per un sistema di raccomandazione AI.
Il tuo output verrà usato per fare matching con descrizioni di prodotti veterinari/assicurativi/nutrizionali.

REGOLE:
- Includi TUTTE le informazioni rilevanti
- Usa un formato strutturato e facilmente parsabile dall'AI
- Includi: dati anagrafici, condizioni mediche, stile di vita, farmaci, parametri vitali, storico sanitario
- Non inventare informazioni non presenti nei dati
- Se un campo è null o mancante, NON menzionarlo e NON chiedere ulteriori informazioni
- Scrivi in italiano

FONTI: Per ogni informazione, indica la fonte specifica tra parentesi quadre:
- [Dati Pet] per dati anagrafici (nome, specie, razza, sesso, peso, microchip, ecc.)
- [Documento: <nome_file>] per informazioni da documenti sanitari caricati
- [Farmaci] per farmaci e trattamenti in corso
- [Parametri Vitali] per misurazioni (FC, FR, temperatura, peso)
- [Storico Sanitario] per visite e diagnosi passate
- [Conversazioni] per informazioni da conversazioni
NON usare mai [fonte] generico.`;

    const userPrompt = `Genera una descrizione strutturata per il matching AI del seguente pet:

${JSON.stringify(sources, null, 2)}

Formato output:
ANAGRAFICA: ...
CONDIZIONI MEDICHE: ...
STILE DI VITA: ...
FARMACI E TRATTAMENTI: ...
PARAMETRI VITALI: ...
STORICO SANITARIO: ...
PROFILO RISCHIO: ...`;

    return { systemPrompt, userPrompt };
  }

  // =======================================================
  // POST /api/admin/:tenant_id/bulk-ai-analysis
  // Bulk AI analysis for all pets (super_admin / admin_brand only)
  // SSE stream: sends progress/pet_done/done events for real-time feedback
  // Body: { mode: "changed" | "all" } — "changed" skips pets whose sources hash hasn't changed
  // =======================================================
  router.post("/api/admin/:tenant_id/bulk-ai-analysis", requireAuth, async (req, res) => {
    // Role check: super_admin or admin_brand only
    const userRole = req.user?.role || req.headers["x-ada-role"];
    if (userRole !== "super_admin" && userRole !== "admin_brand") {
      return res.status(403).json({ error: "forbidden_admin_only" });
    }

    if (!pool) {
      return res.status(503).json({ error: "db_not_available" });
    }

    const openAiKey = _getOpenAiKey();
    if (!openAiKey) {
      return res.status(503).json({ error: "openai_not_configured" });
    }

    // Support both new "mode" and legacy "force" param
    const body = req.body || {};
    const mode = body.mode || (body.force === true ? "all" : "changed");

    // Extend request timeout to 10 minutes
    req.setTimeout(600000);
    if (res.socket) res.socket.setTimeout(600000);

    // Get all pets before switching to SSE
    let allPets = [];
    try {
      const petsResult = await pool.query(
        "SELECT pet_id, name, species, breed, ai_description, ai_description_sources_hash FROM pets ORDER BY name"
      );
      allPets = petsResult.rows;
    } catch (e) {
      return res.status(500).json({ error: "db_error", message: e.message });
    }

    // Switch to SSE stream
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    function sendEvent(data) {
      res.write("data: " + JSON.stringify(data) + "\n\n");
    }

    const results = {
      total: allPets.length,
      descriptionsGenerated: 0,
      descriptionsSkipped: 0,
      analysesRun: 0,
      analysesCached: 0,
      errors: [],
    };

    sendEvent({ type: "start", total: allPets.length });

    // Process each pet serially to avoid OpenAI rate limits
    for (let i = 0; i < allPets.length; i++) {
      const pet = allPets[i];
      sendEvent({ type: "progress", current: i + 1, total: allPets.length, petName: pet.name });

      let descGenerated = false;
      let analysisRun = false;
      let cached = false;
      let skipped = false;
      let petError = null;

      try {
        // Step A: Collect sources and compute hash
        const sources = await _collectPetSourcesFromDB(pool, pet.pet_id);
        if (!sources.dati_pet) sources.dati_pet = {};
        if (!sources.dati_pet.nome && pet.name) sources.dati_pet.nome = pet.name;
        if (!sources.dati_pet.specie && pet.species) sources.dati_pet.specie = pet.species;
        if (!sources.dati_pet.razza && pet.breed) sources.dati_pet.razza = pet.breed;

        const newHash = _computeSourcesHash(sources);

        // Step B: Check if we need to regenerate
        const hashUnchanged = pet.ai_description_sources_hash === newHash && pet.ai_description;
        if (mode === "changed" && hashUnchanged) {
          // Sources unchanged — skip
          skipped = true;
          results.descriptionsSkipped++;
        } else {
          // Generate structured AI description (same prompt as individual endpoint)
          try {
            const { systemPrompt, userPrompt } = _getStructuredDescPrompts(sources);

            const descController = new AbortController();
            const descTimeout = setTimeout(() => descController.abort(), 25000);

            const descResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 2000
              }),
              signal: descController.signal
            });

            clearTimeout(descTimeout);

            if (descResponse.ok) {
              const descData = await descResponse.json();
              const description = descData.choices?.[0]?.message?.content || "";
              if (description && description.length >= 30) {
                const oldDesc = pet.ai_description;
                await pool.query(
                  "UPDATE pets SET ai_description = $1, ai_description_sources_hash = $2, ai_description_generated_at = NOW() WHERE pet_id = $3",
                  [description, newHash, pet.pet_id]
                );
                results.descriptionsGenerated++;
                descGenerated = true;

                // Step C: If description changed, run analysis and save matches
                const descriptionChanged = description !== oldDesc;
                if (descriptionChanged) {
                  try {
                    const analysisResult = await _runAnalysisForPet(pool, pet.pet_id, openAiKey);
                    if (analysisResult.error) {
                      results.errors.push({ petId: pet.pet_id, petName: pet.name, phase: "analysis", error: analysisResult.error });
                      petError = analysisResult.error;
                    } else {
                      results.analysesRun++;
                      analysisRun = true;
                      if (analysisResult.fromCache) {
                        results.analysesCached++;
                        cached = true;
                      }
                      // Save top 5 matches to pet row
                      if (analysisResult.matches && analysisResult.matches.length > 0) {
                        try {
                          await pool.query(
                            "UPDATE pets SET ai_recommendation_matches = $1 WHERE pet_id = $2",
                            [JSON.stringify(analysisResult.matches), pet.pet_id]
                          );
                        } catch (_saveErr) {
                          console.warn("[bulk-ai] save matches error:", _saveErr.message);
                        }
                      }
                    }
                  } catch (analysisErr) {
                    results.errors.push({ petId: pet.pet_id, petName: pet.name, phase: "analysis", error: analysisErr.message });
                    petError = analysisErr.message;
                  }
                }
              }
            } else {
              const errStatus = descResponse.status;
              results.errors.push({ petId: pet.pet_id, petName: pet.name, phase: "description", error: "OpenAI HTTP " + errStatus });
              petError = "openai_http_" + errStatus;
            }
          } catch (descErr) {
            results.errors.push({ petId: pet.pet_id, petName: pet.name, phase: "description", error: descErr.message });
            petError = descErr.message;
          }
        }

      } catch (petErr) {
        results.errors.push({ petId: pet.pet_id, petName: pet.name, phase: "general", error: petErr.message });
        petError = petErr.message;
      }

      sendEvent({
        type: "pet_done",
        current: i + 1,
        total: allPets.length,
        petName: pet.name,
        descGenerated,
        analysisRun,
        cached,
        skipped,
        error: petError,
      });

      // Small delay between pets to avoid overwhelming APIs
      if (i < allPets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[bulk-ai-analysis] done: total=${results.total} descs=${results.descriptionsGenerated} skipped=${results.descriptionsSkipped} analyses=${results.analysesRun} cached=${results.analysesCached} errors=${results.errors.length}`);
    sendEvent({ type: "done", ...results });
    res.end();
  });

  return router;
}

module.exports = { promoRouter };
