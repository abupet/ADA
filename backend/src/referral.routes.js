// backend/src/referral.routes.js v1
// B2B Phase 1: Enhanced referral workflow with status tracking and SLA

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

const VALID_SPECIALTIES = [
  "diagnostica_immagini", "chirurgia_ortopedia", "cardiologia",
  "endoscopia_gastro", "dermatologia", "neurologia",
  "oftalmologia", "oncologia", "medicina_interna"
];

function referralRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  async function computeSlaDeadlines(specialty, urgency) {
    const { rows } = await pool.query(
      "SELECT accept_hours, report_hours FROM referral_sla_config WHERE specialty = $1 AND urgency = $2 AND tenant_id IS NULL LIMIT 1",
      [specialty, urgency]
    );
    const cfg = rows[0] || { accept_hours: 48, report_hours: 120 };
    const now = Date.now();
    return {
      sla_accept_by: new Date(now + cfg.accept_hours * 3600000).toISOString(),
      sla_report_by: new Date(now + cfg.report_hours * 3600000).toISOString(),
    };
  }

  async function logStatus(referralId, fromStatus, toStatus, changedBy, notes) {
    await pool.query(
      "INSERT INTO referral_status_log (log_id, referral_id, from_status, to_status, changed_by, notes) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), referralId, fromStatus, toStatus, changedBy, notes || null]
    );
  }

  // POST /api/referrals — vet_ext crea referral
  router.post("/api/referrals", requireAuth, requireRole(["vet_ext", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { pet_id, specialty, urgency, referral_form, clinical_notes, conversation_id } = req.body;
      if (!pet_id || !specialty) return res.status(400).json({ error: "pet_id_and_specialty_required" });
      if (!VALID_SPECIALTIES.includes(specialty)) return res.status(400).json({ error: "invalid_specialty" });

      const validUrgency = ["entro_24h", "entro_1_settimana", "programmabile"].includes(urgency) ? urgency : "programmabile";
      const sla = await computeSlaDeadlines(specialty, validUrgency);
      const referralId = randomUUID();

      const { rows } = await pool.query(
        `INSERT INTO referrals (referral_id, conversation_id, pet_id, referring_vet_id, specialty, urgency, status, referral_form, clinical_notes, sla_accept_by, sla_report_by)
         VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7,$8,$9,$10) RETURNING *`,
        [referralId, conversation_id || null, pet_id, userId, specialty, validUrgency,
         referral_form ? JSON.stringify(referral_form) : "{}", clinical_notes || null,
         sla.sla_accept_by, sla.sla_report_by]
      );
      await logStatus(referralId, null, "submitted", userId, "Referral creato");
      res.status(201).json({ referral: rows[0] });
    } catch (e) {
      console.error("POST /api/referrals error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referrals — lista filtrata per ruolo
  router.get("/api/referrals", requireAuth, requireRole(["vet_ext", "vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const { status, specialty } = req.query;

      let query = `
        SELECT r.*, p.name AS pet_name, p.species, p.breed,
               u_ref.display_name AS referring_vet_name, u_rec.display_name AS receiving_vet_name
        FROM referrals r
        JOIN pets p ON r.pet_id = p.pet_id
        LEFT JOIN users u_ref ON r.referring_vet_id = u_ref.user_id
        LEFT JOIN users u_rec ON r.receiving_vet_id = u_rec.user_id WHERE 1=1`;
      const params = [];

      if (role === "vet_ext") { params.push(userId); query += ` AND r.referring_vet_id = $${params.length}`; }
      else if (role === "vet_int" || role === "vet") { params.push(userId); query += ` AND (r.receiving_vet_id = $${params.length} OR (r.receiving_vet_id IS NULL AND r.status = 'submitted'))`; }
      if (status) { params.push(status); query += ` AND r.status = $${params.length}`; }
      if (specialty) { params.push(specialty); query += ` AND r.specialty = $${params.length}`; }
      query += " ORDER BY r.created_at DESC LIMIT 200";

      const { rows } = await pool.query(query, params);
      // Live SLA breach check
      const now = new Date();
      for (const r of rows) {
        if (r.status === "submitted" && r.sla_accept_by && new Date(r.sla_accept_by) < now) r.sla_accept_breached = true;
        if (["in_progress", "report_pending"].includes(r.status) && r.sla_report_by && new Date(r.sla_report_by) < now) r.sla_report_breached = true;
      }
      res.json({ referrals: rows });
    } catch (e) {
      console.error("GET /api/referrals error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referrals/:referralId — dettaglio + status log
  router.get("/api/referrals/:referralId", requireAuth, requireRole(["vet_ext", "vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { referralId } = req.params;
      const { rows } = await pool.query(
        `SELECT r.*, p.name AS pet_name, p.species, p.breed, p.birthdate, p.weight_kg,
                u_ref.display_name AS referring_vet_name, u_rec.display_name AS receiving_vet_name
         FROM referrals r JOIN pets p ON r.pet_id = p.pet_id
         LEFT JOIN users u_ref ON r.referring_vet_id = u_ref.user_id
         LEFT JOIN users u_rec ON r.receiving_vet_id = u_rec.user_id WHERE r.referral_id = $1`, [referralId]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      const logRes = await pool.query(
        "SELECT l.*, u.display_name AS changed_by_name FROM referral_status_log l LEFT JOIN users u ON l.changed_by = u.user_id WHERE l.referral_id = $1 ORDER BY l.created_at ASC", [referralId]);
      res.json({ referral: rows[0], status_log: logRes.rows });
    } catch (e) {
      console.error("GET /api/referrals/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/referrals/:referralId/status — cambio stato (vet_int)
  router.patch("/api/referrals/:referralId/status", requireAuth, requireRole(["vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { referralId } = req.params;
      const { new_status, notes, appointment_date, report_document_id } = req.body;
      if (!new_status) return res.status(400).json({ error: "new_status_required" });

      const current = await pool.query("SELECT * FROM referrals WHERE referral_id = $1", [referralId]);
      if (!current.rows[0]) return res.status(404).json({ error: "not_found" });
      const ref = current.rows[0];

      const validTransitions = {
        submitted: ["accepted", "rejected"],
        accepted: ["scheduled", "in_progress", "cancelled"],
        scheduled: ["in_progress", "cancelled"],
        in_progress: ["report_pending", "report_ready"],
        report_pending: ["report_ready"],
        report_ready: ["closed"],
      };
      if (!validTransitions[ref.status]?.includes(new_status)) {
        return res.status(400).json({ error: "invalid_transition", from: ref.status, to: new_status, allowed: validTransitions[ref.status] || [] });
      }

      const sets = ["status = $2", "updated_at = NOW()"]; const vals = [referralId, new_status]; let idx = 3;
      if (new_status === "accepted") { sets.push(`receiving_vet_id = $${idx}`, "accepted_at = NOW()"); vals.push(userId); idx++; }
      if (new_status === "scheduled" && appointment_date) { sets.push(`appointment_date = $${idx}`, "scheduled_at = NOW()"); vals.push(appointment_date); idx++; }
      if (new_status === "report_ready") { sets.push("report_ready_at = NOW()"); if (report_document_id) { sets.push(`report_document_id = $${idx}`); vals.push(report_document_id); idx++; } }
      if (new_status === "in_progress") sets.push("completed_at = NOW()");
      if (new_status === "closed") sets.push("closed_at = NOW()");
      if (notes) { sets.push(`clinical_notes = COALESCE(clinical_notes, '') || E'\n' || $${idx}`); vals.push(notes); idx++; }

      const { rows } = await pool.query(`UPDATE referrals SET ${sets.join(", ")} WHERE referral_id = $1 RETURNING *`, vals);
      await logStatus(referralId, ref.status, new_status, userId, notes);
      res.json({ referral: rows[0] });
    } catch (e) {
      console.error("PATCH /api/referrals/:id/status error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/referrals/analytics/summary — per vet_ext
  router.get("/api/referrals/analytics/summary", requireAuth, requireRole(["vet_ext", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const filterVet = role === "vet_ext" ? userId : req.query.vet_id || null;

      let query = `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'closed') AS closed,
        COUNT(*) FILTER (WHERE status = 'submitted') AS pending,
        COUNT(*) FILTER (WHERE sla_accept_breached) AS sla_accept_breached,
        COUNT(*) FILTER (WHERE sla_report_breached) AS sla_report_breached,
        AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/3600) FILTER (WHERE accepted_at IS NOT NULL) AS avg_hours_to_accept,
        AVG(EXTRACT(EPOCH FROM (report_ready_at - created_at))/3600) FILTER (WHERE report_ready_at IS NOT NULL) AS avg_hours_to_report
        FROM referrals`;
      const params = [];
      if (filterVet) { params.push(filterVet); query += " WHERE referring_vet_id = $1"; }
      const { rows } = await pool.query(query, params);

      let specQuery = "SELECT specialty, COUNT(*) AS count, COUNT(*) FILTER (WHERE status = 'closed') AS closed FROM referrals";
      if (filterVet) specQuery += " WHERE referring_vet_id = $1";
      specQuery += " GROUP BY specialty ORDER BY count DESC";
      const specRes = await pool.query(specQuery, params);

      res.json({ summary: rows[0], by_specialty: specRes.rows });
    } catch (e) {
      console.error("GET /api/referrals/analytics error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { referralRouter };
