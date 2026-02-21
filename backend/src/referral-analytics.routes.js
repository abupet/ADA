// backend/src/referral-analytics.routes.js v1
// Referral analytics: KPI summary, specialty breakdown, timeline, patients, CSV export

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

function referralAnalyticsRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/referral-analytics/summary — KPI summary for vet_ext
  router.get("/api/referral-analytics/summary", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           COUNT(*) AS total_referrals,
           COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
           COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
           COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
           COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
           COUNT(*) FILTER (WHERE status = 'report_ready') AS report_ready,
           COUNT(*) FILTER (WHERE status = 'closed') AS closed,
           COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)
             FILTER (WHERE closed_at IS NOT NULL) AS avg_hours_to_close,
           COUNT(*) FILTER (WHERE sla_accept_breached = true OR sla_report_breached = true) AS sla_breached,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(
               COUNT(*) FILTER (WHERE sla_accept_breached = true OR sla_report_breached = true)::numeric
               / COUNT(*)::numeric * 100, 2)
             ELSE 0
           END AS sla_breach_rate_pct
         FROM referrals
         WHERE referring_vet_id = $1`,
        [userId]
      );

      res.json({ summary: rows[0] });
    } catch (e) {
      if (e.code === "42P01") return res.json({ summary: {} });
      console.error("GET /api/referral-analytics/summary error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referral-analytics/by-specialty — breakdown by specialty
  router.get("/api/referral-analytics/by-specialty", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           specialty,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'closed') AS closed,
           COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
           AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)
             FILTER (WHERE closed_at IS NOT NULL) AS avg_hours_to_close
         FROM referrals
         WHERE referring_vet_id = $1
         GROUP BY specialty
         ORDER BY total DESC`,
        [userId]
      );

      res.json({ by_specialty: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ by_specialty: [] });
      console.error("GET /api/referral-analytics/by-specialty error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referral-analytics/timeline — monthly trend for last 12 months
  router.get("/api/referral-analytics/timeline", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'closed') AS closed,
           COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
         FROM referrals
         WHERE referring_vet_id = $1
           AND created_at >= NOW() - INTERVAL '12 months'
         GROUP BY date_trunc('month', created_at)
         ORDER BY date_trunc('month', created_at) ASC`,
        [userId]
      );

      res.json({ timeline: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ timeline: [] });
      console.error("GET /api/referral-analytics/timeline error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referral-analytics/patients — list of referred patients with status
  router.get("/api/referral-analytics/patients", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           r.referral_id, r.specialty, r.urgency, r.status, r.created_at,
           r.sla_accept_by, r.sla_report_by, r.closed_at,
           p.pet_id, p.name AS pet_name, p.species, p.breed,
           u_rec.display_name AS receiving_vet_name
         FROM referrals r
         JOIN pets p ON r.pet_id = p.pet_id
         LEFT JOIN users u_rec ON r.receiving_vet_id = u_rec.user_id
         WHERE r.referring_vet_id = $1
         ORDER BY r.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ patients: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ patients: [] });
      console.error("GET /api/referral-analytics/patients error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referral-analytics/export — CSV export of referrals
  router.get("/api/referral-analytics/export", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           r.referral_id, r.specialty, r.urgency, r.status,
           r.created_at, r.accepted_at, r.closed_at,
           r.sla_accept_by, r.sla_report_by,
           p.name AS pet_name, p.species, p.breed,
           u_rec.display_name AS receiving_vet_name
         FROM referrals r
         JOIN pets p ON r.pet_id = p.pet_id
         LEFT JOIN users u_rec ON r.receiving_vet_id = u_rec.user_id
         WHERE r.referring_vet_id = $1
         ORDER BY r.created_at DESC`,
        [userId]
      );

      // Build CSV
      const headers = [
        "referral_id", "specialty", "urgency", "status",
        "created_at", "accepted_at", "closed_at",
        "sla_accept_by", "sla_report_by",
        "pet_name", "species", "breed", "receiving_vet_name"
      ];
      const csvLines = [headers.join(",")];
      for (const row of rows) {
        const line = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          // Escape double quotes and wrap in quotes if contains comma or quote
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        });
        csvLines.push(line.join(","));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=referral-analytics.csv");
      res.send(csvLines.join("\n"));
    } catch (e) {
      if (e.code === "42P01") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=referral-analytics.csv");
        return res.send("");
      }
      console.error("GET /api/referral-analytics/export error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { referralAnalyticsRouter };
