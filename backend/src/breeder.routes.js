// backend/src/breeder.routes.js v1
// B2B Phase 1: Breeder-specific routes (litters, programs, vaccinations, dashboard)

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function breederRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // ── Dashboard KPI ──

  router.get("/api/breeder/dashboard", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const [petsRes, littersRes, vaxDueRes, enrollRes] = await Promise.all([
        pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE puppy_status = 'available') AS available, COUNT(*) FILTER (WHERE puppy_status = 'sold') AS sold FROM pets WHERE owner_user_id = $1", [userId]),
        pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pregnant') AS pregnant, COUNT(*) FILTER (WHERE status = 'available') AS with_available FROM litters WHERE breeder_user_id = $1", [userId]),
        pool.query("SELECT COUNT(*) AS due_count FROM pet_vaccinations v JOIN pets p ON v.pet_id = p.pet_id WHERE p.owner_user_id = $1 AND v.next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'", [userId]),
        pool.query("SELECT COUNT(*) AS active_programs FROM breeding_program_enrollments WHERE breeder_user_id = $1 AND status IN ('enrolled', 'in_progress')", [userId]),
      ]);
      res.json({
        pets: petsRes.rows[0],
        litters: littersRes.rows[0],
        vaccinations_due_30d: parseInt(vaxDueRes.rows[0]?.due_count || "0"),
        active_program_enrollments: parseInt(enrollRes.rows[0]?.active_programs || "0"),
      });
    } catch (e) {
      console.error("GET /api/breeder/dashboard error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Litters ──

  router.get("/api/breeder/litters", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const statusFilter = req.query.status || null;
      let query = `
        SELECT l.*,
               mp.name AS mother_name, mp.breed AS mother_breed,
               fp.name AS father_name,
               (SELECT COUNT(*) FROM pets WHERE litter_id = l.litter_id) AS puppy_count,
               (SELECT COUNT(*) FROM pets WHERE litter_id = l.litter_id AND puppy_status = 'available') AS available_count,
               (SELECT COUNT(*) FROM pets WHERE litter_id = l.litter_id AND puppy_status = 'sold') AS sold_count
        FROM litters l
        LEFT JOIN pets mp ON l.mother_pet_id = mp.pet_id
        LEFT JOIN pets fp ON l.father_pet_id = fp.pet_id
        WHERE l.breeder_user_id = $1
      `;
      const params = [userId];
      if (statusFilter) { query += " AND l.status = $2"; params.push(statusFilter); }
      query += " ORDER BY l.created_at DESC";
      const { rows } = await pool.query(query, params);
      res.json({ litters: rows });
    } catch (e) {
      console.error("GET /api/breeder/litters error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/api/breeder/litters", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { mother_pet_id, father_pet_id, species, breed, mating_date, expected_birth_date, expected_puppies, notes } = req.body;
      if (!species) return res.status(400).json({ error: "species_required" });
      const litterId = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO litters (litter_id, breeder_user_id, mother_pet_id, father_pet_id, species, breed, mating_date, expected_birth_date, expected_puppies, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [litterId, userId, mother_pet_id || null, father_pet_id || null, species, breed || null, mating_date || null, expected_birth_date || null, expected_puppies || null, notes || null]
      );
      res.status(201).json({ litter: rows[0] });
    } catch (e) {
      console.error("POST /api/breeder/litters error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.patch("/api/breeder/litters/:litterId", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { litterId } = req.params;
      const allowed = ["status", "actual_birth_date", "actual_puppies", "expected_birth_date", "expected_puppies", "notes", "father_pet_id"];
      const sets = []; const vals = [litterId, userId]; let idx = 3;
      for (const key of allowed) {
        if (req.body[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(req.body[key]); idx++; }
      }
      if (!sets.length) return res.status(400).json({ error: "no_fields" });
      sets.push("updated_at = NOW()");
      const { rows } = await pool.query(`UPDATE litters SET ${sets.join(", ")} WHERE litter_id = $1 AND breeder_user_id = $2 RETURNING *`, vals);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      res.json({ litter: rows[0] });
    } catch (e) {
      console.error("PATCH /api/breeder/litters error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/api/breeder/litters/:litterId/puppies", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { litterId } = req.params;
      const { puppies } = req.body;
      const litterCheck = await pool.query("SELECT * FROM litters WHERE litter_id = $1 AND breeder_user_id = $2", [litterId, userId]);
      if (!litterCheck.rows[0]) return res.status(404).json({ error: "litter_not_found" });
      const litter = litterCheck.rows[0];
      if (!Array.isArray(puppies) || puppies.length === 0) return res.status(400).json({ error: "puppies_required" });

      const created = [];
      for (const p of puppies) {
        const petId = randomUUID();
        const { rows } = await pool.query(
          `INSERT INTO pets (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, litter_id, puppy_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'available') RETURNING *`,
          [petId, userId, p.name || `Cucciolo ${created.length + 1}`, litter.species, litter.breed, p.sex || null, litter.actual_birth_date || new Date().toISOString().slice(0, 10), p.weight_kg || null, p.notes || null, litterId]
        );
        created.push(rows[0]);
      }
      await pool.query(
        "UPDATE litters SET actual_puppies = $1, status = CASE WHEN status IN ('planned','pregnant') THEN 'born' ELSE status END, updated_at = NOW() WHERE litter_id = $2",
        [created.length, litterId]
      );
      res.status(201).json({ puppies: created });
    } catch (e) {
      console.error("POST /api/breeder/litters/:id/puppies error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.patch("/api/breeder/pets/:petId/sale", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { petId } = req.params;
      const { new_owner_user_id } = req.body;
      if (!new_owner_user_id) return res.status(400).json({ error: "new_owner_required" });
      const { rows } = await pool.query(
        `UPDATE pets SET puppy_status = 'sold', sold_to_owner_id = $1, sold_at = NOW(), owner_user_id = $1, updated_at = NOW()
         WHERE pet_id = $2 AND owner_user_id = $3 AND puppy_status = 'available' RETURNING *`,
        [new_owner_user_id, petId, userId]
      );
      if (!rows[0]) return res.status(404).json({ error: "pet_not_available" });
      res.json({ pet: rows[0] });
    } catch (e) {
      console.error("PATCH /api/breeder/pets/:id/sale error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Breeding Programs ──

  router.get("/api/breeder/programs", requireAuth, requireRole(["breeder", "vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { species, breed } = req.query;
      let query = "SELECT * FROM breeding_programs WHERE status = 'active'";
      const params = [];
      if (species) { params.push(species); query += ` AND species = $${params.length}`; }
      if (breed) { params.push(breed); query += ` AND (breed = $${params.length} OR breed IS NULL)`; }
      query += " ORDER BY name";
      const { rows } = await pool.query(query, params);
      res.json({ programs: rows });
    } catch (e) {
      console.error("GET /api/breeder/programs error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/api/breeder/programs/:programId/enroll", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { programId } = req.params;
      const { pet_ids } = req.body;
      if (!Array.isArray(pet_ids) || pet_ids.length === 0) return res.status(400).json({ error: "pet_ids_required" });
      const programCheck = await pool.query("SELECT * FROM breeding_programs WHERE program_id = $1 AND status = 'active'", [programId]);
      if (!programCheck.rows[0]) return res.status(404).json({ error: "program_not_found" });

      const enrollments = [];
      for (const petId of pet_ids) {
        try {
          const { rows } = await pool.query(
            `INSERT INTO breeding_program_enrollments (enrollment_id, program_id, pet_id, breeder_user_id, status, progress)
             VALUES ($1, $2, $3, $4, 'enrolled', '{"completed_exams": [], "next_due": null}')
             ON CONFLICT DO NOTHING RETURNING *`,
            [randomUUID(), programId, petId, userId]
          );
          if (rows[0]) enrollments.push(rows[0]);
        } catch (_) { /* skip */ }
      }
      res.status(201).json({ enrollments });
    } catch (e) {
      console.error("POST /api/breeder/programs/:id/enroll error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/api/breeder/enrollments", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { rows } = await pool.query(
        `SELECT e.*, bp.name AS program_name, bp.exams AS program_exams, p.name AS pet_name, p.breed AS pet_breed
         FROM breeding_program_enrollments e
         JOIN breeding_programs bp ON e.program_id = bp.program_id
         JOIN pets p ON e.pet_id = p.pet_id
         WHERE e.breeder_user_id = $1 ORDER BY e.enrolled_at DESC`,
        [userId]
      );
      res.json({ enrollments: rows });
    } catch (e) {
      console.error("GET /api/breeder/enrollments error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Vaccinations due ──

  router.get("/api/breeder/vaccinations/due", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const days = parseInt(req.query.days || "30", 10);
      const { rows } = await pool.query(
        `SELECT v.*, p.name AS pet_name, p.breed, p.species
         FROM pet_vaccinations v JOIN pets p ON v.pet_id = p.pet_id
         WHERE p.owner_user_id = $1 AND v.next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2 * INTERVAL '1 day'
         ORDER BY v.next_due_date ASC`,
        [userId, days]
      );
      res.json({ due_vaccinations: rows, days_ahead: days });
    } catch (e) {
      console.error("GET /api/breeder/vaccinations/due error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { breederRouter };
