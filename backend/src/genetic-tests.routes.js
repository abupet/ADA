// backend/src/genetic-tests.routes.js v1
// Genetic testing: catalog browsing, order management, results, breeding reports

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

function geneticTestsRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/genetic-tests/catalog — list catalog, filter by species/breed
  router.get("/api/genetic-tests/catalog", requireAuth, async (req, res) => {
    try {
      const { species, breed } = req.query;
      let query = `SELECT * FROM genetic_test_catalog WHERE enabled = true`;
      const params = [];

      if (species) {
        params.push(species);
        query += ` AND species = $${params.length}`;
      }

      if (breed) {
        params.push(breed);
        query += ` AND (applicable_breeds = '[]'::jsonb OR applicable_breeds @> to_jsonb($${params.length}::text))`;
      }

      query += ` ORDER BY name ASC`;

      const { rows } = await pool.query(query, params);
      res.json({ catalog: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ catalog: [] });
      console.error("GET /api/genetic-tests/catalog error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/genetic-tests/orders — list orders for current user
  router.get("/api/genetic-tests/orders", requireAuth, requireRole(["breeder", "vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT gto.*, gtc.name AS test_name, gtc.code AS test_code,
                p.name AS pet_name, p.species, p.breed
         FROM genetic_test_orders gto
         JOIN genetic_test_catalog gtc ON gto.test_id = gtc.test_id
         JOIN pets p ON gto.pet_id = p.pet_id
         WHERE gto.ordered_by_user_id = $1
         ORDER BY gto.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ orders: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ orders: [] });
      console.error("GET /api/genetic-tests/orders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/genetic-tests/orders — create order
  router.post("/api/genetic-tests/orders", requireAuth, requireRole(["breeder", "vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const userRole = req.user?.role || "owner";
      const { test_id, pet_id, notes } = req.body;

      if (!test_id || !pet_id) {
        return res.status(400).json({ error: "test_id and pet_id are required" });
      }

      // Verify test exists and is enabled
      const { rows: testRows } = await pool.query(
        `SELECT * FROM genetic_test_catalog WHERE test_id = $1 AND enabled = true`,
        [test_id]
      );
      if (!testRows[0]) return res.status(404).json({ error: "test_not_found" });

      const { rows } = await pool.query(
        `INSERT INTO genetic_test_orders
           (test_id, pet_id, ordered_by_user_id, ordered_by_role, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [test_id, pet_id, userId, userRole, notes || null]
      );

      res.status(201).json({ order: rows[0] });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/genetic-tests/orders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/genetic-tests/orders/:orderId — update status/result
  router.patch("/api/genetic-tests/orders/:orderId", requireAuth, requireRole(["vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status, result_value, result_detail, lab_reference, notes } = req.body;

      const setClauses = ["updated_at = NOW()"];
      const params = [];

      if (status) {
        params.push(status);
        setClauses.push(`status = $${params.length}`);
      }
      if (result_value !== undefined) {
        params.push(result_value);
        setClauses.push(`result_value = $${params.length}`);
      }
      if (result_detail !== undefined) {
        params.push(JSON.stringify(result_detail));
        setClauses.push(`result_detail = $${params.length}::jsonb`);
      }
      if (lab_reference !== undefined) {
        params.push(lab_reference);
        setClauses.push(`lab_reference = $${params.length}`);
      }
      if (notes !== undefined) {
        params.push(notes);
        setClauses.push(`notes = $${params.length}`);
      }

      // If marking completed, set result_date
      if (status === "completed") {
        setClauses.push(`result_date = NOW()`);
      }

      params.push(orderId);
      const { rows } = await pool.query(
        `UPDATE genetic_test_orders
         SET ${setClauses.join(", ")}
         WHERE order_id = $${params.length}
         RETURNING *`,
        params
      );

      if (!rows[0]) return res.status(404).json({ error: "order_not_found" });
      res.json({ order: rows[0] });
    } catch (e) {
      console.error("PATCH /api/genetic-tests/orders/:orderId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/genetic-tests/breeding-report/:breederId — aggregated genetic report for breeder
  router.get("/api/genetic-tests/breeding-report/:breederId", requireAuth, requireRole(["breeder"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           gtc.name AS test_name, gtc.code AS test_code,
           p.pet_id, p.name AS pet_name, p.breed, p.sex,
           gto.status, gto.result_value, gto.result_date
         FROM genetic_test_orders gto
         JOIN genetic_test_catalog gtc ON gto.test_id = gtc.test_id
         JOIN pets p ON gto.pet_id = p.pet_id
         WHERE gto.ordered_by_user_id = $1 AND gto.status = 'completed'
         ORDER BY gtc.code ASC, p.name ASC`,
        [userId]
      );

      // Aggregate by test
      const byTest = {};
      for (const row of rows) {
        if (!byTest[row.test_code]) {
          byTest[row.test_code] = { test_name: row.test_name, test_code: row.test_code, results: [] };
        }
        byTest[row.test_code].results.push({
          pet_id: row.pet_id,
          pet_name: row.pet_name,
          breed: row.breed,
          sex: row.sex,
          result_value: row.result_value,
          result_date: row.result_date,
        });
      }

      res.json({ report: Object.values(byTest), total_completed: rows.length });
    } catch (e) {
      if (e.code === "42P01") return res.json({ report: [], total_completed: 0 });
      console.error("GET /api/genetic-tests/breeding-report/:breederId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { geneticTestsRouter };
