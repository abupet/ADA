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

  // ── Phase 2: Litter Milestones ──

  router.get("/api/breeder/litters/:litterId/milestones", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { litterId } = req.params;
      const litterCheck = await pool.query("SELECT * FROM litters WHERE litter_id = $1 AND breeder_user_id = $2", [litterId, userId]);
      if (!litterCheck.rows[0]) return res.status(404).json({ error: "litter_not_found" });
      const { rows } = await pool.query(
        "SELECT * FROM litter_milestones WHERE litter_id = $1 ORDER BY due_date ASC, created_at ASC",
        [litterId]
      );
      res.json({ milestones: rows });
    } catch (e) {
      console.error("GET /api/breeder/litters/:id/milestones error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.patch("/api/breeder/milestones/:milestoneId", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { milestoneId } = req.params;
      const { status, completed_date, notes } = req.body;
      const check = await pool.query(
        "SELECT m.* FROM litter_milestones m JOIN litters l ON m.litter_id = l.litter_id WHERE m.milestone_id = $1 AND l.breeder_user_id = $2",
        [milestoneId, userId]
      );
      if (!check.rows[0]) return res.status(404).json({ error: "not_found" });
      const sets = []; const vals = [milestoneId]; let idx = 2;
      if (status) { sets.push(`status = $${idx}`); vals.push(status); idx++; }
      if (completed_date) { sets.push(`completed_date = $${idx}`); vals.push(completed_date); idx++; }
      if (notes !== undefined) { sets.push(`notes = $${idx}`); vals.push(notes); idx++; }
      if (!sets.length) return res.status(400).json({ error: "no_fields" });
      sets.push("updated_at = NOW()");
      const { rows } = await pool.query(`UPDATE litter_milestones SET ${sets.join(", ")} WHERE milestone_id = $1 RETURNING *`, vals);
      res.json({ milestone: rows[0] });
    } catch (e) {
      console.error("PATCH /api/breeder/milestones/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/api/breeder/litters/:litterId/generate-milestones", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { litterId } = req.params;
      const litterCheck = await pool.query("SELECT * FROM litters WHERE litter_id = $1 AND breeder_user_id = $2", [litterId, userId]);
      if (!litterCheck.rows[0]) return res.status(404).json({ error: "litter_not_found" });
      const litter = litterCheck.rows[0];
      const birthDate = litter.actual_birth_date || litter.expected_birth_date;
      if (!birthDate) return res.status(400).json({ error: "birth_date_required" });

      const { rows: templates } = await pool.query(
        "SELECT * FROM milestone_templates WHERE species = $1 AND status = 'active' ORDER BY day_offset ASC",
        [litter.species || 'dog']
      );
      if (!templates.length) return res.status(404).json({ error: "no_templates" });

      const created = [];
      for (const t of templates) {
        const dueDate = new Date(birthDate);
        dueDate.setDate(dueDate.getDate() + t.day_offset);
        const { rows } = await pool.query(
          `INSERT INTO litter_milestones (litter_id, template_id, title, description, category, due_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT DO NOTHING RETURNING *`,
          [litterId, t.template_id, t.title, t.description, t.category, dueDate.toISOString().slice(0, 10)]
        );
        if (rows[0]) created.push(rows[0]);
      }
      res.status(201).json({ milestones: created, count: created.length });
    } catch (e) {
      console.error("POST /api/breeder/litters/:id/generate-milestones error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Phase 2: Puppy Weights ──

  router.get("/api/breeder/pets/:petId/weights", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { petId } = req.params;
      const petCheck = await pool.query("SELECT * FROM pets WHERE pet_id = $1 AND owner_user_id = $2", [petId, userId]);
      if (!petCheck.rows[0]) return res.status(404).json({ error: "pet_not_found" });
      const { rows } = await pool.query(
        "SELECT * FROM puppy_weights WHERE pet_id = $1 ORDER BY measured_at DESC",
        [petId]
      );
      res.json({ weights: rows });
    } catch (e) {
      console.error("GET /api/breeder/pets/:id/weights error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/api/breeder/pets/:petId/weights", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { petId } = req.params;
      const { weight_grams, measured_at, notes } = req.body;
      if (!weight_grams || weight_grams <= 0) return res.status(400).json({ error: "weight_required" });
      const petCheck = await pool.query("SELECT * FROM pets WHERE pet_id = $1 AND owner_user_id = $2", [petId, userId]);
      if (!petCheck.rows[0]) return res.status(404).json({ error: "pet_not_found" });
      const { rows } = await pool.query(
        `INSERT INTO puppy_weights (pet_id, weight_grams, measured_at, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [petId, weight_grams, measured_at || new Date().toISOString(), notes || null, userId]
      );
      res.status(201).json({ weight: rows[0] });
    } catch (e) {
      console.error("POST /api/breeder/pets/:id/weights error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Phase 2: Health Passports ──

  router.post("/api/breeder/pets/:petId/passport/generate", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { petId } = req.params;
      const petCheck = await pool.query(
        `SELECT p.*, l.breed AS litter_breed, l.species AS litter_species
         FROM pets p LEFT JOIN litters l ON p.litter_id = l.litter_id
         WHERE p.pet_id = $1 AND p.owner_user_id = $2`,
        [petId, userId]
      );
      if (!petCheck.rows[0]) return res.status(404).json({ error: "pet_not_found" });
      const pet = petCheck.rows[0];

      // Gather passport data
      const [vaxRes, weightRes, docsRes] = await Promise.all([
        pool.query("SELECT * FROM pet_vaccinations WHERE pet_id = $1 ORDER BY administered_date", [petId]),
        pool.query("SELECT * FROM puppy_weights WHERE pet_id = $1 ORDER BY measured_at", [petId]).catch(() => ({ rows: [] })),
        pool.query("SELECT document_id, title, document_type, created_at FROM documents WHERE pet_id = $1 ORDER BY created_at", [petId]).catch(() => ({ rows: [] })),
      ]);

      const passportData = {
        pet: { name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birthdate: pet.birthdate, microchip: pet.microchip_id || null },
        vaccinations: vaxRes.rows,
        weights: weightRes.rows,
        documents: docsRes.rows,
        generated_at: new Date().toISOString(),
      };

      const qrToken = randomUUID();
      const existing = await pool.query("SELECT passport_id FROM health_passports WHERE pet_id = $1 AND status IN ('draft','active')", [petId]);
      let passport;
      if (existing.rows[0]) {
        const { rows } = await pool.query(
          "UPDATE health_passports SET passport_data = $1, qr_code_token = $2, status = 'active', updated_at = NOW() WHERE passport_id = $3 RETURNING *",
          [JSON.stringify(passportData), qrToken, existing.rows[0].passport_id]
        );
        passport = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO health_passports (pet_id, breeder_user_id, qr_code_token, passport_data, status)
           VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
          [petId, userId, qrToken, JSON.stringify(passportData)]
        );
        passport = rows[0];
      }
      res.status(201).json({ passport });
    } catch (e) {
      console.error("POST /api/breeder/pets/:id/passport/generate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/api/breeder/pets/:petId/passport", requireAuth, requireRole(["breeder", "owner", "vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { petId } = req.params;
      const { rows } = await pool.query(
        "SELECT * FROM health_passports WHERE pet_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
        [petId]
      );
      if (!rows[0]) return res.status(404).json({ error: "passport_not_found" });
      res.json({ passport: rows[0] });
    } catch (e) {
      console.error("GET /api/breeder/pets/:id/passport error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/breeder/programs/auto-schedule — schedule exams for pets that reached target age
  router.post('/api/breeder/programs/auto-schedule', requireAuth, requireRole(['breeder']), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { rows: enrollments } = await pool.query(
        `SELECT bpe.enrollment_id, bpe.pet_id, bpe.program_id, bpe.progress,
                bp.exams, bp.name AS program_name,
                p.birthdate AS birth_date, p.name AS pet_name
         FROM breeding_program_enrollments bpe
         JOIN breeding_programs bp ON bp.program_id = bpe.program_id
         JOIN pets p ON p.pet_id = bpe.pet_id
         WHERE bpe.breeder_user_id = $1 AND bpe.status IN ('enrolled', 'in_progress')`,
        [userId]
      );

      let scheduled = 0;
      for (const enrollment of enrollments) {
        if (!enrollment.birth_date || !enrollment.exams) continue;
        const birthDate = new Date(enrollment.birth_date);
        const now = new Date();
        const ageMonths = Math.floor((now - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
        const progress = enrollment.progress || {};
        const exams = typeof enrollment.exams === 'string' ? JSON.parse(enrollment.exams) : enrollment.exams;
        for (const exam of exams) {
          if (progress[exam.name]) continue;
          if (exam.min_age_months && ageMonths >= exam.min_age_months) {
            progress[exam.name] = { status: 'due', since: now.toISOString() };
            scheduled++;
          }
        }
        await pool.query(
          'UPDATE breeding_program_enrollments SET progress = $1, updated_at = NOW() WHERE enrollment_id = $2',
          [JSON.stringify(progress), enrollment.enrollment_id]
        );
      }
      res.json({ evaluated: enrollments.length, newly_due: scheduled });
    } catch (err) {
      if (err.code === '42P01') return res.json({ evaluated: 0, newly_due: 0 });
      console.error('POST auto-schedule error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

module.exports = { breederRouter };
