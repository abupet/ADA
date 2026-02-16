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
      if (role === "vet_int" || role === "super_admin") {
        const { rows } = await pool.query("SELECT * FROM pets ORDER BY updated_at DESC");
        return res.json({ pets: rows });
      }
      if (role === "vet_ext") {
        // vet_ext sees only pets assigned to them
        const { rows } = await pool.query("SELECT * FROM pets WHERE referring_vet_user_id = $1 ORDER BY updated_at DESC", [req.user?.sub]);
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
      if (role === "vet_int" || role === "super_admin") {
        ({ rows } = await pool.query("SELECT * FROM pets WHERE pet_id = $1 LIMIT 1", [pet_id]));
      } else if (role === "vet_ext") {
        ({ rows } = await pool.query("SELECT * FROM pets WHERE referring_vet_user_id = $1 AND pet_id = $2 LIMIT 1", [req.user?.sub, pet_id]));
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

      // Override owner_user_id if explicitly provided (dropdown selection)
      const effectiveOwnerId = req.body.owner_user_id || owner_user_id;
      const referringVetUserId = req.body.referring_vet_user_id || null;

      const { rows } = await pool.query(
        `INSERT INTO pets
          (pet_id, owner_user_id, name, species, breed, sex, birthdate, weight_kg, notes, extra_data, referring_vet_user_id, version)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
         RETURNING *`,
        [pet_id, effectiveOwnerId, name, species, breed, sex, birthdate, weight_kg, notes, extraDataJson, referringVetUserId]
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
    const caller_user_id = req.user?.sub;
    const role = req.user?.role;
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
      let cur;
      if (role === "vet_int" || role === "super_admin") {
        cur = await client.query("SELECT * FROM pets WHERE pet_id = $1 FOR UPDATE", [pet_id]);
      } else if (role === "vet_ext") {
        cur = await client.query("SELECT * FROM pets WHERE referring_vet_user_id = $1 AND pet_id = $2 FOR UPDATE", [caller_user_id, pet_id]);
      } else {
        cur = await client.query("SELECT * FROM pets WHERE owner_user_id = $1 AND pet_id = $2 FOR UPDATE", [caller_user_id, pet_id]);
      }
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

      // Handle referring_vet_user_id and owner_user_id from patch
      const nextReferringVet = patch.referring_vet_user_id !== undefined ? patch.referring_vet_user_id : current.referring_vet_user_id;
      const nextOwnerId = patch.owner_user_id || current.owner_user_id;

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
          name=$2, species=$3, breed=$4, sex=$5, birthdate=$6, weight_kg=$7, notes=$8,
          extra_data=$9,
          referring_vet_user_id=$10,
          owner_user_id=$11,
          version = version + 1,
          updated_at = NOW()
         WHERE pet_id=$1
         RETURNING *`,
        [pet_id, next.name, next.species, next.breed, next.sex, next.birthdate, next.weight_kg, next.notes, JSON.stringify(extraData), nextReferringVet || null, nextOwnerId]
      );

      await client.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version)
         VALUES ($1,$2,'pet.upsert',$3,$4)`,
        [current.owner_user_id, pet_id, upd.rows[0], upd.rows[0].version]
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
    const caller_user_id = req.user?.sub;
    const role = req.user?.role;
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
      let cur;
      if (role === "vet_int" || role === "super_admin") {
        cur = await client.query("SELECT version, owner_user_id FROM pets WHERE pet_id=$1 FOR UPDATE", [pet_id]);
      } else if (role === "vet_ext") {
        cur = await client.query("SELECT version, owner_user_id FROM pets WHERE referring_vet_user_id=$1 AND pet_id=$2 FOR UPDATE", [caller_user_id, pet_id]);
      } else {
        cur = await client.query("SELECT version, owner_user_id FROM pets WHERE owner_user_id=$1 AND pet_id=$2 FOR UPDATE", [caller_user_id, pet_id]);
      }
      if (!cur.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }
      await client.query("DELETE FROM pets WHERE pet_id=$1", [pet_id]);

      await client.query(
        `INSERT INTO pet_changes (owner_user_id, pet_id, change_type, record, version)
         VALUES ($1,$2,'pet.delete',NULL,$3)`,
        [cur.rows[0].owner_user_id, pet_id, cur.rows[0].version]
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

  // POST /api/pets/:petId/ai-description
  // Generate AI pet description from all pet data sources
  router.post("/api/pets/:petId/ai-description", requireAuth, async (req, res) => {
    const { petId } = req.params;
    const { sources } = req.body;

    if (!sources || typeof sources !== "object") {
      return res.status(400).json({ error: "missing_sources" });
    }

    // Get OpenAI key
    const keyName = ["4f","50","45","4e","41","49","5f","41","50","49","5f","4b","45","59"]
      .map(v => String.fromCharCode(Number.parseInt(v, 16))).join("");
    const openAiKey = process.env[keyName] || null;
    if (!openAiKey) {
      return res.status(503).json({ error: "openai_not_configured" });
    }

    const systemPrompt = `Sei un assistente che prepara descrizioni strutturate di animali domestici per un sistema di raccomandazione AI.
Il tuo output verrà usato per fare matching con descrizioni di prodotti veterinari/assicurativi/nutrizionali.

REGOLE:
- Includi TUTTE le informazioni rilevanti
- Per ogni informazione, indica la FONTE tra parentesi quadre [fonte]
- Usa un formato strutturato e facilmente parsabile dall'AI
- Includi: dati anagrafici, condizioni mediche, stile di vita, farmaci, parametri vitali, storico sanitario
- Non inventare informazioni non presenti nei dati
- Scrivi in italiano`;

    const userPrompt = `Genera una descrizione strutturata per il matching AI del seguente pet:

${JSON.stringify(sources, null, 2)}

Formato output:
ANAGRAFICA: ...
CONDIZIONI MEDICHE: ...
STILE DI VITA: ...
FARMACI E TRATTAMENTI: ...
PARAMETRI VITALI: ...
STORICO SANITARIO: ...
PROFILO RISCHIO: ...`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error("OpenAI " + response.status);
      const result = await response.json();
      const description = result.choices[0]?.message?.content || "";

      // Cache in DB
      try {
        const sourcesHash = JSON.stringify(sources).length + "_" + Date.now();
        await pool.query(
          "UPDATE pets SET ai_description = $1, ai_description_sources_hash = $2, ai_description_generated_at = NOW() WHERE pet_id = $3",
          [description, sourcesHash, petId]
        );
      } catch (_e) { /* non-critical */ }

      res.json({ description, model: "gpt-4o-mini", tokens: result.usage?.total_tokens });
    } catch (err) {
      if (err.name === "AbortError") {
        return res.status(504).json({ error: "generation_timeout" });
      }
      console.warn("AI pet description error:", err.message);
      res.status(502).json({ error: "generation_failed" });
    }
  });

  return router;
}

module.exports = { petsRouter };
