// backend/src/diagnostics.routes.js v1
// Diagnostics panels, results, and notifications API routes

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function diagnosticsRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/diagnostics/panels — list enabled panels with optional filters
  router.get("/api/diagnostics/panels", requireAuth, async (req, res) => {
    try {
      const { category, species } = req.query;
      let query = "SELECT * FROM diagnostic_panels WHERE enabled = true";
      const params = [];

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }
      if (species) {
        params.push(species);
        query += ` AND species = $${params.length}`;
      }

      query += " ORDER BY category, name";
      const { rows } = await pool.query(query, params);
      res.json({ panels: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ panels: [] });
      console.error("GET /api/diagnostics/panels error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/diagnostics/results — create a diagnostic result (order)
  router.post("/api/diagnostics/results", requireAuth, requireRole(["vet_int", "vet_ext", "vet", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { pet_id, panel_id, appointment_id, referral_id, notes } = req.body;
      if (!pet_id) return res.status(400).json({ error: "pet_id_required" });

      const resultId = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO diagnostic_results
           (result_id, pet_id, panel_id, appointment_id, referral_id, notes,
            result_status, ordered_by_user_id, ordered_by_role)
         VALUES ($1, $2, $3, $4, $5, $6, 'ordered', $7, $8)
         RETURNING *`,
        [resultId, pet_id, panel_id || null, appointment_id || null,
         referral_id || null, notes || null, userId, req.user.role]
      );

      res.status(201).json({ result: rows[0] });
    } catch (e) {
      console.error("POST /api/diagnostics/results error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/diagnostics/results/:resultId — update a diagnostic result
  router.patch("/api/diagnostics/results/:resultId", requireAuth, requireRole(["vet_int", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { resultId } = req.params;
      const { result_status, result_data, result_summary, ai_interpretation, out_of_range_flags, notes } = req.body;

      // Build dynamic SET clause
      const sets = ["updated_at = NOW()"];
      const vals = [resultId];
      let idx = 2;

      if (result_status !== undefined) { sets.push(`result_status = $${idx}`); vals.push(result_status); idx++; }
      if (result_data !== undefined) { sets.push(`result_data = $${idx}`); vals.push(JSON.stringify(result_data)); idx++; }
      if (result_summary !== undefined) { sets.push(`result_summary = $${idx}`); vals.push(result_summary); idx++; }
      if (ai_interpretation !== undefined) { sets.push(`ai_interpretation = $${idx}`); vals.push(ai_interpretation); idx++; }
      if (out_of_range_flags !== undefined) { sets.push(`out_of_range_flags = $${idx}`); vals.push(JSON.stringify(out_of_range_flags)); idx++; }
      if (notes !== undefined) { sets.push(`notes = $${idx}`); vals.push(notes); idx++; }

      // Status-specific timestamps
      if (result_status === "completed") {
        sets.push("completed_at = NOW()");
      }
      if (result_status === "reviewed") {
        sets.push(`reviewed_by_vet_id = $${idx}`); vals.push(userId); idx++;
        sets.push("reviewed_at = NOW()");
      }

      const { rows } = await pool.query(
        `UPDATE diagnostic_results SET ${sets.join(", ")} WHERE result_id = $1 RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      // Auto-create notifications
      const result = rows[0];
      if (result_status === "completed" && result.ordered_by_user_id) {
        await pool.query(
          `INSERT INTO diagnostic_notifications
             (notification_id, user_id, result_id, notification_type)
           VALUES ($1, $2, $3, 'result_ready')`,
          [randomUUID(), result.ordered_by_user_id, resultId]
        );
      }
      if (result_status === "reviewed" && result.ordered_by_user_id) {
        await pool.query(
          `INSERT INTO diagnostic_notifications
             (notification_id, user_id, result_id, notification_type)
           VALUES ($1, $2, $3, 'result_reviewed')`,
          [randomUUID(), result.ordered_by_user_id, resultId]
        );
      }

      res.json({ updated: true });
    } catch (e) {
      console.error("PATCH /api/diagnostics/results/:resultId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/diagnostics/results — list results with role-based filtering
  router.get("/api/diagnostics/results", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const { pet_id, status } = req.query;

      let query = `
        SELECT dr.*, dp.name AS panel_name, dp.category AS panel_category,
               p.name AS pet_name, p.species
        FROM diagnostic_results dr
        LEFT JOIN diagnostic_panels dp ON dr.panel_id = dp.panel_id
        JOIN pets p ON dr.pet_id = p.pet_id
        WHERE 1=1`;
      const params = [];

      // Role-based access
      if (role === "owner" || role === "breeder") {
        params.push(userId);
        query += ` AND p.owner_user_id = $${params.length}`;
      } else if (role === "vet_ext") {
        params.push(userId);
        query += ` AND dr.ordered_by_user_id = $${params.length}`;
      }
      // vet_int and super_admin see all results

      if (pet_id) {
        params.push(pet_id);
        query += ` AND dr.pet_id = $${params.length}`;
      }
      if (status) {
        params.push(status);
        query += ` AND dr.result_status = $${params.length}`;
      }

      query += " ORDER BY dr.created_at DESC LIMIT 100";
      const { rows } = await pool.query(query, params);
      res.json({ results: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ results: [] });
      console.error("GET /api/diagnostics/results error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/diagnostics/notifications — unread notifications for current user
  router.get("/api/diagnostics/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { rows } = await pool.query(
        `SELECT dn.*, dr.result_status, dr.panel_id, p.name AS pet_name, p.species
         FROM diagnostic_notifications dn
         JOIN diagnostic_results dr ON dn.result_id = dr.result_id
         JOIN pets p ON dr.pet_id = p.pet_id
         WHERE dn.user_id = $1 AND dn.read_at IS NULL
         ORDER BY dn.created_at DESC
         LIMIT 50`,
        [userId]
      );
      res.json({ notifications: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ notifications: [] });
      console.error("GET /api/diagnostics/notifications error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/diagnostics/notifications/read — mark notifications as read
  router.patch("/api/diagnostics/notifications/read", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { notification_ids } = req.body;
      if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
        return res.status(400).json({ error: "notification_ids_required" });
      }

      await pool.query(
        `UPDATE diagnostic_notifications
         SET read_at = NOW()
         WHERE notification_id = ANY($1) AND user_id = $2`,
        [notification_ids, userId]
      );

      res.json({ updated: true });
    } catch (e) {
      console.error("PATCH /api/diagnostics/notifications/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { diagnosticsRouter };
