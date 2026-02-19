// backend/src/insurance.routes.js v1
// Insurance API routes

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { computeRiskScore } = require("./risk-scoring.service");
const { randomUUID } = require("crypto");

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function insuranceRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/insurance/plans?petId=X&tenantId=Y — list eligible insurance plans with personalized pricing
  router.get("/api/insurance/plans", requireAuth, async (req, res) => {
    try {
      const petId = req.query.petId;
      const tenantId = req.query.tenantId;
      if (!petId || !isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });
      if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

      // 1. Compute or fetch recent risk score
      let riskScore;
      const recent = await pool.query(
        "SELECT * FROM insurance_risk_scores WHERE pet_id = $1 AND computed_at > NOW() - INTERVAL '7 days' ORDER BY computed_at DESC LIMIT 1",
        [petId]
      );
      if (recent.rows[0]) {
        riskScore = recent.rows[0];
      } else {
        riskScore = await computeRiskScore(pool, petId);
      }

      // 2. Fetch all published insurance promo_items for this tenant
      const { rows: plans } = await pool.query(
        `SELECT promo_item_id, name, description, extended_description,
                image_url, product_url, insurance_data, species, tags_include, tags_exclude, priority
         FROM promo_items
         WHERE tenant_id = $1 AND 'insurance' = ANY(service_type) AND status = 'published'
         ORDER BY priority DESC, name ASC`,
        [tenantId]
      );

      // 3. Load pet for species filtering
      const petResult = await pool.query("SELECT species FROM pets WHERE pet_id = $1 LIMIT 1", [petId]);
      const petSpecies = (petResult.rows[0]?.species || "").toLowerCase();
      const normalizedSpecies = petSpecies.includes("gatto") || petSpecies.includes("cat") ? "cat" : "dog";

      // 4. Filter by species and compute personalized premium
      const eligible = plans
        .filter(p => {
          const planSpecies = p.species || [];
          return planSpecies.length === 0 || planSpecies.includes(normalizedSpecies);
        })
        .map(p => {
          const insData = (typeof p.insurance_data === 'string') ? JSON.parse(p.insurance_data) : (p.insurance_data || {});
          const basePremium = Number(insData.base_premium_monthly) || 15;
          const personalizedPremium = Math.round(basePremium * (riskScore.price_multiplier || 1) * 100) / 100;
          return {
            promo_item_id: p.promo_item_id,
            name: p.name,
            description: p.description,
            extended_description: p.extended_description,
            image_url: p.image_url,
            product_url: p.product_url,
            insurance_data: insData,
            personalized_premium: personalizedPremium,
            base_premium: basePremium,
          };
        });

      res.json({
        plans: eligible,
        risk_score: {
          total_score: riskScore.total_score,
          risk_class: riskScore.risk_class,
          breakdown: riskScore.breakdown,
          price_multiplier: riskScore.price_multiplier,
        },
      });
    } catch (e) {
      if (e.code === "42P01") return res.json({ plans: [], risk_score: null });
      console.error("GET /api/insurance/plans error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/insurance/risk-score/:petId — compute or fetch latest risk score
  router.get("/api/insurance/risk-score/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!petId || !isValidUuid(petId)) return res.json({ score: null, cached: false });

      // Check for recent score (within 7 days)
      const recent = await pool.query(
        "SELECT * FROM insurance_risk_scores WHERE pet_id = $1 AND computed_at > NOW() - INTERVAL '7 days' ORDER BY computed_at DESC LIMIT 1",
        [petId]
      );

      if (recent.rows[0]) {
        return res.json({ score: recent.rows[0], cached: true });
      }

      // Compute new score
      const score = await computeRiskScore(pool, petId);
      res.json({ score, cached: false });
    } catch (e) {
      if (e.code === "42P01") return res.json({ score: null, cached: false });
      console.error("GET /api/insurance/risk-score/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/insurance/coverage/:petId — get active insurance policy
  router.get("/api/insurance/coverage/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!petId || !isValidUuid(petId)) return res.json({ policy: null });

      const { rows } = await pool.query(
        "SELECT * FROM insurance_policies WHERE pet_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [petId]
      );

      res.json({ policy: rows[0] || null });
    } catch (e) {
      if (e.code === "42P01") return res.json({ policy: null });
      console.error("GET /api/insurance/coverage/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/insurance/quote/:petId — request insurance quote (share data with insurer)
  router.post("/api/insurance/quote/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

      const ownerUserId = req.user?.sub;
      const tenantId = req.body?.tenant_id;
      const promoItemId = req.body?.promo_item_id || null;

      if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

      // Compute risk score
      const score = await computeRiskScore(pool, petId);

      // Load insurance plan data from selected promo_item
      let insData = null;
      if (promoItemId) {
        try {
          const itemResult = await pool.query(
            "SELECT insurance_data FROM promo_items WHERE promo_item_id = $1 AND 'insurance' = ANY(service_type)",
            [promoItemId]
          );
          const raw = itemResult.rows[0]?.insurance_data;
          if (raw && typeof raw === 'object') insData = raw;
        } catch (_e) { /* fallback */ }
      }

      // Base premium from plan or fallback
      const basePremium = (insData?.base_premium_monthly) ? Number(insData.base_premium_monthly) : 15.0;
      const monthlyPremium = Math.round(basePremium * score.price_multiplier * 100) / 100;

      // Create policy in "quoted" status with real plan data
      const policyId = "pol_" + randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO insurance_policies (policy_id, pet_id, owner_user_id, tenant_id, promo_item_id, status, monthly_premium, risk_score_id, coverage_data)
         VALUES ($1, $2, $3, $4, $5, 'quoted', $6, $7, $8)
         RETURNING *`,
        [policyId, petId, ownerUserId, tenantId, promoItemId, monthlyPremium, score.score_id, JSON.stringify({
          type: insData?.plan_tier || "base",
          provider: insData?.provider || "generic",
          plan_label_it: insData?.plan_label_it || "Base",
          annual_limit: insData?.annual_limit || 5000,
          deductible: insData?.deductible || 100,
          coverage_pct: insData?.coverage_pct || 80,
          prevention_budget: insData?.prevention_budget || 0,
          therapeutic_food_max_annual: insData?.therapeutic_food_max_annual || null,
          addons: insData?.addons || [],
        })]
      );

      res.status(201).json({ policy: rows[0], risk_score: score });
    } catch (e) {
      if (e.code === "42P01") return res.status(503).json({ error: "service_not_available" });
      console.error("POST /api/insurance/quote/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/insurance/policy/:policyId/activate — activate a quoted policy
  router.post("/api/insurance/policy/:policyId/activate", requireAuth, async (req, res) => {
    try {
      const { policyId } = req.params;
      const ownerUserId = req.user?.sub;

      const { rows } = await pool.query(
        `UPDATE insurance_policies
         SET status = 'active', start_date = CURRENT_DATE, end_date = CURRENT_DATE + INTERVAL '1 year', updated_at = NOW()
         WHERE policy_id = $1 AND owner_user_id = $2 AND status = 'quoted'
         RETURNING *`,
        [policyId, ownerUserId]
      );

      if (!rows[0]) return res.status(404).json({ error: "policy_not_found_or_not_quoted" });
      res.json({ policy: rows[0] });
    } catch (e) {
      console.error("POST /api/insurance/policy/:policyId/activate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/insurance/claim/:petId — generate claim from SOAP visit data
  router.post("/api/insurance/claim/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

      const { visit_data, amount } = req.body || {};

      // Find active policy
      const policyResult = await pool.query(
        "SELECT * FROM insurance_policies WHERE pet_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [petId]
      );

      if (!policyResult.rows[0]) {
        return res.status(404).json({ error: "no_active_policy" });
      }

      const policy = policyResult.rows[0];
      const claimId = "clm_" + randomUUID();

      const { rows } = await pool.query(
        `INSERT INTO insurance_claims (claim_id, policy_id, pet_id, visit_data, amount, status)
         VALUES ($1, $2, $3, $4, $5, 'draft')
         RETURNING *`,
        [claimId, policy.policy_id, petId, JSON.stringify(visit_data || {}), amount || 0]
      );

      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(503).json({ error: "service_not_available" });
      console.error("POST /api/insurance/claim/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/insurance/claims/:petId — list claims for a pet
  router.get("/api/insurance/claims/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!petId || !isValidUuid(petId)) return res.json({ claims: [] });

      const { rows } = await pool.query(
        "SELECT * FROM insurance_claims WHERE pet_id = $1 ORDER BY created_at DESC",
        [petId]
      );

      res.json({ claims: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ claims: [] });
      console.error("GET /api/insurance/claims/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { insuranceRouter };
