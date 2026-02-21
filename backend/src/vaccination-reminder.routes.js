// backend/src/vaccination-reminder.routes.js v1
// Vaccination calendar, reminders, and compliance API routes

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function vaccinationReminderRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/vaccinations/calendar — upcoming vaccinations for user's pets
  router.get("/api/vaccinations/calendar", requireAuth, requireRole(["breeder", "owner", "proprietario"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const days = parseInt(req.query.days, 10) || 30;

      const { rows } = await pool.query(
        `SELECT pv.*, p.name AS pet_name, p.species, p.breed
         FROM pet_vaccinations pv
         JOIN pets p ON pv.pet_id = p.pet_id
         WHERE p.owner_user_id = $1
           AND pv.next_due_date BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $2
         ORDER BY pv.next_due_date ASC`,
        [userId, days]
      );
      res.json({ vaccinations: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ vaccinations: [] });
      console.error("GET /api/vaccinations/calendar error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/vaccinations/reminders — unsent reminders for the user
  router.get("/api/vaccinations/reminders", requireAuth, requireRole(["breeder", "owner", "proprietario"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT vr.*, p.name AS pet_name, p.species
         FROM vaccination_reminders vr
         JOIN pets p ON vr.pet_id = p.pet_id
         WHERE vr.owner_user_id = $1 AND vr.sent = false
         ORDER BY vr.reminder_date ASC`,
        [userId]
      );
      res.json({ reminders: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ reminders: [] });
      console.error("GET /api/vaccinations/reminders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/vaccinations/reminders/generate — generate reminders for upcoming vaccinations
  router.post("/api/vaccinations/reminders/generate", requireAuth, requireRole(["vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const { rows: vaccinations } = await pool.query(
        `SELECT pv.*, p.owner_user_id, p.name AS pet_name
         FROM pet_vaccinations pv
         JOIN pets p ON pv.pet_id = p.pet_id
         WHERE pv.next_due_date > NOW()`
      );

      let created = 0;
      for (const vacc of vaccinations) {
        const nextDue = new Date(vacc.next_due_date);

        // 7-day reminder
        const sevenDaysBefore = new Date(nextDue.getTime() - 7 * 24 * 60 * 60 * 1000);
        const { rowCount: exists7 } = await pool.query(
          `SELECT 1 FROM vaccination_reminders
           WHERE vaccination_id = $1 AND reminder_type = '7_days_before' LIMIT 1`,
          [vacc.vaccination_id]
        );
        if (exists7 === 0) {
          await pool.query(
            `INSERT INTO vaccination_reminders
               (reminder_id, vaccination_id, pet_id, owner_user_id, reminder_type, reminder_date, sent)
             VALUES ($1, $2, $3, $4, '7_days_before', $5, false)`,
            [randomUUID(), vacc.vaccination_id, vacc.pet_id, vacc.owner_user_id, sevenDaysBefore.toISOString()]
          );
          created++;
        }

        // 1-day reminder
        const oneDayBefore = new Date(nextDue.getTime() - 1 * 24 * 60 * 60 * 1000);
        const { rowCount: exists1 } = await pool.query(
          `SELECT 1 FROM vaccination_reminders
           WHERE vaccination_id = $1 AND reminder_type = '1_day_before' LIMIT 1`,
          [vacc.vaccination_id]
        );
        if (exists1 === 0) {
          await pool.query(
            `INSERT INTO vaccination_reminders
               (reminder_id, vaccination_id, pet_id, owner_user_id, reminder_type, reminder_date, sent)
             VALUES ($1, $2, $3, $4, '1_day_before', $5, false)`,
            [randomUUID(), vacc.vaccination_id, vacc.pet_id, vacc.owner_user_id, oneDayBefore.toISOString()]
          );
          created++;
        }
      }

      res.json({ generated: created, vaccinations_processed: vaccinations.length });
    } catch (e) {
      if (e.code === "42P01") return res.json({ generated: 0, vaccinations_processed: 0 });
      console.error("POST /api/vaccinations/reminders/generate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/vaccinations/compliance/:breederId — compliance reports for a breeder
  router.get("/api/vaccinations/compliance/:breederId", requireAuth, requireRole(["breeder", "vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const { breederId } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM vaccination_compliance_reports
         WHERE breeder_user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [breederId]
      );
      res.json({ reports: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ reports: [] });
      console.error("GET /api/vaccinations/compliance/:breederId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/vaccinations/compliance/generate — generate compliance report for current period
  router.post("/api/vaccinations/compliance/generate", requireAuth, requireRole(["breeder"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      // Count total pets and vaccinated pets for the breeder
      const { rows: stats } = await pool.query(
        `SELECT
           COUNT(DISTINCT p.pet_id) AS total_pets,
           COUNT(DISTINCT CASE WHEN pv.next_due_date > NOW() THEN p.pet_id END) AS vaccinated_pets
         FROM pets p
         LEFT JOIN pet_vaccinations pv ON p.pet_id = pv.pet_id
         WHERE p.owner_user_id = $1`,
        [userId]
      );

      const totalPets = parseInt(stats[0]?.total_pets || 0, 10);
      const vaccinatedPets = parseInt(stats[0]?.vaccinated_pets || 0, 10);
      const complianceRate = totalPets > 0 ? Math.round((vaccinatedPets / totalPets) * 100) : 0;

      const reportId = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO vaccination_compliance_reports
           (report_id, breeder_user_id, period_start, period_end, total_pets, vaccinated_pets, compliance_rate)
         VALUES ($1, $2, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day', $3, $4, $5)
         RETURNING *`,
        [reportId, userId, totalPets, vaccinatedPets, complianceRate]
      );

      res.status(201).json({ report: rows[0] });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/vaccinations/compliance/generate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { vaccinationReminderRouter };
