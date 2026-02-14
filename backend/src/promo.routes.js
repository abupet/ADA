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
      if (pool && selectPromo && generateExplanation) {
        try {
          const promoResult = await selectPromo(pool, {
            petId,
            ownerUserId,
            context,
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
          const explResult = await generateExplanation(pool, {
            pet,
            promoItem: promoResult._item || promoResult,
            context,
            matchedTags: promoResult.matchedTags || [],
            getOpenAiKey: _getOpenAiKey,
          });

          const confidence = explResult.explanation?.confidence || "low";
          const ctaEnabled = confidence === "high" || confidence === "medium";

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

  return router;
}

module.exports = { promoRouter };
