// backend/src/loyalty.routes.js v1
// Loyalty program: dashboard, fees, transactions, admin approval and level evaluation

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function loyaltyRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/loyalty/dashboard — current level, fees earned, balance, next level info
  router.get("/api/loyalty/dashboard", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT vp.*,
           pl.name AS level_name, pl.min_referrals_year, pl.fee_percentage, pl.benefits,
           pl_next.name AS next_level_name, pl_next.min_referrals_year AS next_level_min_referrals
         FROM vet_partnerships vp
         JOIN partnership_levels pl ON vp.current_level_id = pl.level_id
         LEFT JOIN partnership_levels pl_next ON pl_next.min_referrals_year = (
           SELECT MIN(min_referrals_year) FROM partnership_levels WHERE min_referrals_year > pl.min_referrals_year
         )
         WHERE vp.vet_ext_user_id = $1
         LIMIT 1`,
        [userId]
      );

      if (!rows[0]) return res.json({ dashboard: null });

      // Fetch summary totals
      const feeSummary = await pool.query(
        `SELECT
           COALESCE(SUM(amount), 0) AS total_earned,
           COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid,
           COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS balance_pending_payment,
           COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS balance_pending_approval
         FROM referral_fees
         WHERE vet_ext_user_id = $1`,
        [userId]
      );

      res.json({
        dashboard: {
          ...rows[0],
          fees: feeSummary.rows[0] || {},
        },
      });
    } catch (e) {
      if (e.code === "42P01") return res.json({ dashboard: null });
      console.error("GET /api/loyalty/dashboard error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/loyalty/fees — fee history for vet_ext
  router.get("/api/loyalty/fees", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT rf.*, r.specialty, r.pet_id, p.name AS pet_name
         FROM referral_fees rf
         LEFT JOIN referrals r ON rf.referral_id = r.referral_id
         LEFT JOIN pets p ON r.pet_id = p.pet_id
         WHERE rf.vet_ext_user_id = $1
         ORDER BY rf.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ fees: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ fees: [] });
      console.error("GET /api/loyalty/fees error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/loyalty/transactions — transaction history for vet_ext
  router.get("/api/loyalty/transactions", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT ft.*
         FROM fee_transactions ft
         WHERE ft.vet_ext_user_id = $1
         ORDER BY ft.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ transactions: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ transactions: [] });
      console.error("GET /api/loyalty/transactions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/loyalty/admin/fees/:feeId/approve — admin approve a fee
  router.patch("/api/loyalty/admin/fees/:feeId/approve", requireAuth, requireRole(["super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { feeId } = req.params;

      const { rows } = await pool.query(
        `UPDATE referral_fees
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE fee_id = $2 AND status = 'pending'
         RETURNING *`,
        [userId, feeId]
      );

      if (!rows[0]) return res.status(404).json({ error: "not_found_or_already_processed" });
      res.json({ fee: rows[0] });
    } catch (e) {
      console.error("PATCH /api/loyalty/admin/fees/:feeId/approve error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/loyalty/admin/fees/:feeId/pay — admin mark fee as paid
  router.patch("/api/loyalty/admin/fees/:feeId/pay", requireAuth, requireRole(["super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { feeId } = req.params;

      const { rows } = await pool.query(
        `UPDATE referral_fees
         SET status = 'paid', paid_by = $1, paid_at = NOW(), updated_at = NOW()
         WHERE fee_id = $2 AND status = 'approved'
         RETURNING *`,
        [userId, feeId]
      );

      if (!rows[0]) return res.status(404).json({ error: "not_found_or_not_approved" });

      // Create a transaction record
      await pool.query(
        `INSERT INTO fee_transactions
           (transaction_id, fee_id, vet_ext_user_id, amount, transaction_type, processed_by)
         VALUES ($1, $2, $3, $4, 'payment', $5)`,
        [randomUUID(), feeId, rows[0].vet_ext_user_id, rows[0].amount, userId]
      );

      res.json({ fee: rows[0] });
    } catch (e) {
      console.error("PATCH /api/loyalty/admin/fees/:feeId/pay error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/loyalty/admin/evaluate-levels — recalculate all vet_ext partnership levels
  router.post("/api/loyalty/admin/evaluate-levels", requireAuth, requireRole(["super_admin"]), async (req, res) => {
    try {
      // Get all partnership levels sorted by min_referrals descending
      const { rows: levels } = await pool.query(
        "SELECT * FROM partnership_levels ORDER BY min_referrals_year DESC"
      );

      if (levels.length === 0) return res.json({ evaluated: 0, updated: 0 });

      // Get all vet partnerships
      const { rows: partnerships } = await pool.query(
        "SELECT * FROM vet_partnerships"
      );

      let updated = 0;
      for (const vp of partnerships) {
        const referralsThisYear = vp.referrals_this_year || 0;

        // Find the highest level the vet qualifies for
        const newLevel = levels.find(l => referralsThisYear >= l.min_referrals_year);
        if (newLevel && newLevel.level_id !== vp.current_level_id) {
          await pool.query(
            `UPDATE vet_partnerships
             SET current_level_id = $1, updated_at = NOW()
             WHERE partnership_id = $2`,
            [newLevel.level_id, vp.partnership_id]
          );
          updated++;
        }
      }

      res.json({ evaluated: partnerships.length, updated });
    } catch (e) {
      if (e.code === "42P01") return res.json({ evaluated: 0, updated: 0 });
      console.error("POST /api/loyalty/admin/evaluate-levels error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { loyaltyRouter };
