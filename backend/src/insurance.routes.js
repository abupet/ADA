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

  // GET /api/insurance/risk-score/:petId — compute or fetch latest risk score
  router.get("/api/insurance/risk-score/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

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
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

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

      // Base premium calculation (simplified)
      const basePremium = 15.0; // EUR/month
      const monthlyPremium = Math.round(basePremium * score.price_multiplier * 100) / 100;

      // Create policy in "quoted" status
      const policyId = "pol_" + randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO insurance_policies (policy_id, pet_id, owner_user_id, tenant_id, promo_item_id, status, monthly_premium, risk_score_id, coverage_data)
         VALUES ($1, $2, $3, $4, $5, 'quoted', $6, $7, $8)
         RETURNING *`,
        [policyId, petId, ownerUserId, tenantId, promoItemId, monthlyPremium, score.score_id, JSON.stringify({
          type: "base",
          annual_limit: 5000,
          deductible: 100,
          coverage_pct: 80,
        })]
      );

      res.status(201).json({ policy: rows[0], risk_score: score });
    } catch (e) {
      if (e.code === "42P01") return res.status(503).json({ error: "service_not_available" });
      console.error("POST /api/insurance/quote/:petId error", e);
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
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

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
