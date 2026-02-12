// backend/src/pets.routes.js v2
const express = require("express");
const { getPool } = require("./db");
const { randomUUID } = require("crypto");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function petsRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // List pets — vet/super_admin see all, owner sees own
  router.get("/api/pets", requireAuth, async (req, res) => {
    try {
      const role = req.user?.role;
      if (role === "vet" || role === "super_admin") {
        const { rows } = await pool.query("SELECT * FROM pets ORDER BY updated_at DESC");
        return res.json({ pets: rows });
      }
      const owner_user_id = req.user?.sub;
      const { rows } = await pool.query(
        "SELECT * FROM pets WHERE owner_user_id = $1 ORDER BY updated_at DESC",
        [owner_user_id]
      );
      res.json({ pets: rows });
    } catch (e) {
      console.error("GET /api/pets error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Get single pet — vet/super_admin can access any, owner only own
  router.get("/api/pets/:pet_id", requireAuth, async (req, res) => {
    try {
      const { pet_id } = req.params;
      if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
      const role = req.user?.role;
      let rows;
      if (role === "vet" || role === "super_admin") {
        ({ rows } = await pool.query("SELECT * FROM pets WHERE pet_id = $1 LIMIT 1", [pet_id]));
      } else {
        const owner_user_id = req.user?.sub;
        ({ rows } = await pool.query("SELECT * FROM pets WHERE owner_user_id = $1 AND pet_id = $2 LIMIT 1", [owner_user_id, pet_id]));
      }
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      res.json(rows[0]);
    } catch (e) {
      console.error("GET /api/pets/:pet_id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Create pet
  router.post("/api/pets", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const pet_id = req.body.pet_id || randomUUID();
      const {
        name,
        species,
        breed = null,
        sex = null,
        birthdate = null,
        weight_kg = null,
        notes = null,
      } = req.body || {};

      if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
      if (!name || !species) return res.status(400).json({ error: "name_and_species_required" });

      // Rich data fields stored in extra_data JSONB column
      const richFields = ["vitals_data", "medications", "history_data", "lifestyle",
                          "photos", "photos_count", "owner_name", "owner_phone",
                          "microchip", "visit_date", "owner_diary"];
      const extraData = {};
      for (const k of richFields) {
        if (req.body[k] !== undefined) extraData[k] = req.body[k];
      }
      if (req.body.updated_at) extraData.updated_at = req.body.updated_at;
      const extraDataJson = Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null;

      const { rows } = await pool.query(
        `INSERT INTO pets
          (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, extra_data, version)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
         RETURNING *`,
        [pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, extraDataJson]
      );

      // change log
      await pool.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version)
         VALUES ($1,$2,'pet.upsert',$3,$4)`,
        [owner_user_id, pet_id, rows[0], rows[0].version]
      );

      res.status(201).json(rows[0]);
    } catch (e) {
      console.error("POST /api/pets error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Update pet (optimistic concurrency via base_version)
  router.patch("/api/pets/:pet_id", requireAuth, async (req, res) => {
    const owner_user_id = req.user?.sub;
    const { pet_id } = req.params;
    if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
    const { base_version, patch } = req.body || {};
    if (!patch || typeof patch !== "object") return res.status(400).json({ error: "patch_required" });

    let client;
    try {
      client = await pool.connect();
    } catch (e) {
      console.error("PATCH /api/pets pool.connect error", e);
      return res.status(500).json({ error: "server_error" });
    }
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        "SELECT * FROM pets WHERE owner_user_id = $1 AND pet_id = $2 FOR UPDATE",
        [owner_user_id, pet_id]
      );
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }
      const current = cur.rows[0];
      if (base_version != null && Number(base_version) !== Number(current.version)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "conflict", current_version: current.version, current });
      }

      // whitelist fields
      const allowed = ["name","species","breed","sex","birthdate","weight_kg","notes"];
      const next = { ...current };
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
      }

      // Rich data: merge into extra_data JSONB
      let extraData = current.extra_data || {};
      if (typeof extraData === 'string') try { extraData = JSON.parse(extraData); } catch (_) { extraData = {}; }
      const richFields = ["vitals_data", "medications", "history_data", "lifestyle",
                          "photos", "photos_count", "owner_name", "owner_phone",
                          "microchip", "visit_date", "owner_diary"];
      for (const k of richFields) {
        if (patch[k] !== undefined) extraData[k] = patch[k];
      }
      if (patch.updated_at) extraData.updated_at = patch.updated_at;

      const upd = await client.query(
        `UPDATE pets SET
          name=$3, species=$4, breed=$5, sex=$6, birthdate=$7, weight_kg=$8, notes=$9,
          extra_data=$10,
          version = version + 1,
          updated_at = NOW()
         WHERE owner_user_id=$1 AND pet_id=$2
         RETURNING *`,
        [owner_user_id, pet_id, next.name, next.species, next.breed, next.sex, next.birthdate, next.weight_kg, next.notes, JSON.stringify(extraData)]
      );

      await client.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version)
         VALUES ($1,$2,'pet.upsert',$3,$4)`,
        [owner_user_id, pet_id, upd.rows[0], upd.rows[0].version]
      );

      await client.query("COMMIT");
      return res.json(upd.rows[0]);
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_rb) { /* connection may be broken */ }
      console.error("PATCH /api/pets error", e);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  // Delete pet
  router.delete("/api/pets/:pet_id", requireAuth, async (req, res) => {
    const owner_user_id = req.user?.sub;
    const { pet_id } = req.params;
    if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });

    let client;
    try {
      client = await pool.connect();
    } catch (e) {
      console.error("DELETE /api/pets pool.connect error", e);
      return res.status(500).json({ error: "server_error" });
    }
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        "SELECT version FROM pets WHERE owner_user_id=$1 AND pet_id=$2 FOR UPDATE",
        [owner_user_id, pet_id]
      );
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }
      await client.query("DELETE FROM pets WHERE owner_user_id=$1 AND pet_id=$2", [owner_user_id, pet_id]);

      await client.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version)
         VALUES ($1,$2,'pet.delete',NULL,$3)`,
        [owner_user_id, pet_id, cur.rows[0].version]
      );

      await client.query("COMMIT");
      return res.status(204).send();
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_rb) { /* connection may be broken */ }
      console.error("DELETE /api/pets error", e);
      return res.status(500).json({ error: "server_error" });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { petsRouter };
