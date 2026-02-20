// backend/src/nutrition.routes.js v1
// Nutrition plan API routes

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const {
  generateNutritionPlan,
  getActivePlan,
  getPendingPlan,
} = require("./nutrition.service");

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function nutritionRouter({ requireAuth, getOpenAiKey }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/nutrition/products[?tenantId=X] — list nutrition products (cross-tenant if no tenantId)
  router.get("/api/nutrition/products", requireAuth, async (req, res) => {
    try {
      const tenantId = req.query.tenantId || null;

      let query, params;
      if (tenantId) {
        query = `SELECT pi.promo_item_id, pi.name, pi.category, pi.description, pi.tenant_id, t.name AS tenant_name
                 FROM promo_items pi
                 JOIN tenants t ON t.tenant_id = pi.tenant_id
                 WHERE pi.tenant_id = $1 AND 'nutrition' = ANY(pi.service_type) AND pi.status = 'published'
                 ORDER BY pi.category, pi.name`;
        params = [tenantId];
      } else {
        query = `SELECT pi.promo_item_id, pi.name, pi.category, pi.description, pi.tenant_id, t.name AS tenant_name
                 FROM promo_items pi
                 JOIN tenants t ON t.tenant_id = pi.tenant_id AND t.status = 'active'
                 WHERE 'nutrition' = ANY(pi.service_type) AND pi.status = 'published'
                 ORDER BY pi.category, pi.name`;
        params = [];
      }
      const { rows } = await pool.query(query, params);
      res.json({ products: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ products: [] });
      console.error("GET /api/nutrition/products error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/nutrition/plan/:petId — active validated plan
  router.get("/api/nutrition/plan/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!petId || !isValidUuid(petId)) return res.json({ plan: null });

      const plan = await getActivePlan(pool, petId);
      if (!plan) return res.json({ plan: null });

      res.json({ plan });
    } catch (e) {
      // Table may not exist yet (migration not applied)
      if (e.code === "42P01") return res.json({ plan: null });
      console.error("GET /api/nutrition/plan/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/nutrition/plan/:petId/pending — pending plan (for vet validation)
  router.get("/api/nutrition/plan/:petId/pending", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!petId || !isValidUuid(petId)) return res.json({ plan: null });

      const plan = await getPendingPlan(pool, petId);
      if (!plan) return res.json({ plan: null });

      res.json({ plan });
    } catch (e) {
      if (e.code === "42P01") return res.json({ plan: null });
      console.error("GET /api/nutrition/plan/:petId/pending error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/nutrition/plan/:petId/generate — generate new plan
  router.post("/api/nutrition/plan/:petId/generate", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;
      if (!isValidUuid(petId)) return res.status(400).json({ error: "invalid_pet_id" });

      const ownerUserId = req.user?.sub;
      const tenantId = req.body?.tenant_id || req.query.tenant_id;
      if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

      const result = await generateNutritionPlan(pool, petId, ownerUserId, tenantId, getOpenAiKey);
      res.status(201).json(result);
    } catch (e) {
      console.error("POST /api/nutrition/plan/:petId/generate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/nutrition/plan/:planId/validate — vet validates plan
  router.post(
    "/api/nutrition/plan/:planId/validate",
    requireAuth,
    requireRole(["vet_int", "super_admin"]),
    async (req, res) => {
      try {
        const { planId } = req.params;
        const vetUserId = req.user?.sub;

        const { rows } = await pool.query(
          `UPDATE nutrition_plans SET status = 'validated', validated_by = $2, validated_at = NOW(), updated_at = NOW()
           WHERE plan_id = $1 AND status = 'pending'
           RETURNING *`,
          [planId, vetUserId]
        );

        if (!rows[0]) return res.status(404).json({ error: "plan_not_found_or_not_pending" });
        res.json(rows[0]);
      } catch (e) {
        console.error("POST /api/nutrition/plan/:planId/validate error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // POST /api/nutrition/plan/:planId/reject — vet rejects plan
  router.post(
    "/api/nutrition/plan/:planId/reject",
    requireAuth,
    requireRole(["vet_int", "super_admin"]),
    async (req, res) => {
      try {
        const { planId } = req.params;
        const vetUserId = req.user?.sub;
        const reason = req.body?.reason || null;

        const { rows } = await pool.query(
          `UPDATE nutrition_plans SET status = 'rejected', validated_by = $2, validated_at = NOW(), updated_at = NOW()
           WHERE plan_id = $1 AND status = 'pending'
           RETURNING *`,
          [planId, vetUserId]
        );

        if (!rows[0]) return res.status(404).json({ error: "plan_not_found_or_not_pending" });
        res.json(rows[0]);
      } catch (e) {
        console.error("POST /api/nutrition/plan/:planId/reject error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // PATCH /api/nutrition/plan/:planId — vet modifies plan data
  router.patch(
    "/api/nutrition/plan/:planId",
    requireAuth,
    requireRole(["vet_int", "super_admin"]),
    async (req, res) => {
      try {
        const { planId } = req.params;
        const { plan_data } = req.body || {};

        if (!plan_data) return res.status(400).json({ error: "plan_data_required" });

        const { rows } = await pool.query(
          `UPDATE nutrition_plans SET plan_data = $2, version = version + 1, updated_at = NOW()
           WHERE plan_id = $1
           RETURNING *`,
          [planId, JSON.stringify(plan_data)]
        );

        if (!rows[0]) return res.status(404).json({ error: "plan_not_found" });
        res.json(rows[0]);
      } catch (e) {
        console.error("PATCH /api/nutrition/plan/:planId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  return router;
}

module.exports = { nutritionRouter };
