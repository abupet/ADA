// backend/src/promo.routes.js v1
// Promo / product recommendation engine (PR 10)
const express = require("express");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// Mock product catalog for deterministic recommendations
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
    description: "Specially formulated for indoor cats to maintain healthy weight.",
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
    description: "Glucosamine and chondroitin supplement for joint health.",
    price_eur: 19.99,
    image_url: null,
  },
  {
    product_id: "prod_006",
    name: "Dental Care Kit",
    category: "dental",
    species: "all",
    description: "Complete dental care kit with toothbrush and enzymatic toothpaste.",
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
 * Deterministic product selection based on pet_id.
 * Uses a simple hash of the pet_id to pick products consistently.
 */
function selectRecommendations(petId, species, count = 3) {
  // Simple deterministic hash from petId
  let hash = 0;
  for (let i = 0; i < petId.length; i++) {
    hash = ((hash << 5) - hash + petId.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  // Filter products by species
  const eligible = PRODUCT_CATALOG.filter(
    (p) => p.species === "all" || p.species === (species || "").toLowerCase()
  );

  if (eligible.length === 0) {
    // Fallback to all products
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

  // Fill up if we got duplicates
  if (results.length < count) {
    for (const p of eligible) {
      if (!results.find((r) => r.product_id === p.product_id)) {
        results.push(p);
      }
      if (results.length >= count) break;
    }
  }

  return results;
}

/**
 * Promo routes: product recommendations and event tracking.
 * Supports mock mode fallback when no DATABASE_URL is configured.
 */
function promoRouter({ requireAuth }) {
  const router = express.Router();
  const hasDatabaseUrl = !!process.env.DATABASE_URL;

  // In-memory event store for mock mode
  const mockEvents = [];

  let pool = null;
  if (hasDatabaseUrl) {
    try {
      const { getPool } = require("./db");
      pool = getPool();
    } catch (_e) {
      console.warn("promo.routes: could not initialize DB pool, running in mock mode");
    }
  }

  // GET /api/promo/recommendation?petId=X
  router.get("/api/promo/recommendation", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const petId = req.query.petId;

      if (!petId || !isValidUuid(petId)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      let species = null;

      // Try to look up pet species from DB
      if (pool) {
        try {
          const { rows } = await pool.query(
            "SELECT species FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1",
            [petId, owner_user_id]
          );
          if (rows[0]) {
            species = rows[0].species;
          }
        } catch (dbErr) {
          console.warn("promo recommendation DB lookup failed, using fallback", dbErr.message);
        }
      }

      const recommendations = selectRecommendations(petId, species);
      res.json({ pet_id: petId, recommendations });
    } catch (e) {
      console.error("GET /api/promo/recommendation error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/promo/recommendation - alternative with body
  router.post("/api/promo/recommendation", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { petId, species, count } = req.body || {};

      if (!petId || !isValidUuid(petId)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      let resolvedSpecies = species || null;

      // Try to look up pet species from DB if not provided
      if (!resolvedSpecies && pool) {
        try {
          const { rows } = await pool.query(
            "SELECT species FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1",
            [petId, owner_user_id]
          );
          if (rows[0]) {
            resolvedSpecies = rows[0].species;
          }
        } catch (dbErr) {
          console.warn("promo recommendation DB lookup failed, using fallback", dbErr.message);
        }
      }

      const recommendations = selectRecommendations(petId, resolvedSpecies, count || 3);
      res.json({ pet_id: petId, recommendations });
    } catch (e) {
      console.error("POST /api/promo/recommendation error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/promo/event - track promo events (impressions, clicks, etc.)
  router.post("/api/promo/event", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { event_type, product_id, pet_id, metadata } = req.body || {};

      if (!event_type) {
        return res.status(400).json({ error: "event_type_required" });
      }

      const event = {
        owner_user_id,
        event_type,
        product_id: product_id || null,
        pet_id: pet_id || null,
        metadata: metadata || null,
        created_at: new Date().toISOString(),
      };

      // Try to store in audit_log if DB is available
      if (pool) {
        try {
          await pool.query(
            `INSERT INTO audit_log (who, action, entity_id, entity_type, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              owner_user_id,
              `promo.${event_type}`,
              product_id || pet_id || null,
              product_id ? "product" : "promo",
              JSON.stringify(event),
            ]
          );
        } catch (dbErr) {
          console.warn("promo event DB insert failed, storing in memory", dbErr.message);
          mockEvents.push(event);
        }
      } else {
        // Mock mode: store in memory
        mockEvents.push(event);
      }

      res.status(201).json({ ok: true, event });
    } catch (e) {
      console.error("POST /api/promo/event error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { promoRouter };
