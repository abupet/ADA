// backend/src/teleconsult.routes.js v1
// B2B Phase 2: Teleconsult sessions, notes, and specialist workflow

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function teleconsultRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // State machine: valid status transitions
  const VALID_TRANSITIONS = {
    requested: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled", "no_show"],
    in_progress: ["completed"],
  };

  // POST /api/teleconsult/request — vet_ext creates teleconsult request
  router.post("/api/teleconsult/request", requireAuth, requireRole(["vet_ext", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { pet_id, specialty, reason, clinical_context, preferred_date, referral_id } = req.body;
      if (!pet_id || !specialty) return res.status(400).json({ error: "pet_id_and_specialty_required" });

      // Verify pet exists
      const petRes = await pool.query("SELECT * FROM pets WHERE pet_id = $1", [pet_id]);
      if (!petRes.rows[0]) return res.status(404).json({ error: "pet_not_found" });
      const pet = petRes.rows[0];

      // Create conversation with type='teleconsult'
      const conversationId = randomUUID();
      const subject = `Teleconsulto ${specialty} — ${new Date().toLocaleDateString("it-IT")}`;
      await pool.query(
        "INSERT INTO conversations (conversation_id, pet_id, owner_user_id, vet_user_id, type, status, subject, recipient_type) VALUES ($1, $2, $3, $4, 'teleconsult', 'active', $5, 'human')",
        [conversationId, pet_id, pet.owner_user_id, userId, subject]
      );

      // Create teleconsult session
      const sessionId = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO teleconsult_sessions (session_id, conversation_id, referral_id, requesting_vet_id, specialty, reason, clinical_context, scheduled_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'requested') RETURNING *`,
        [sessionId, conversationId, referral_id || null, userId, specialty, reason || null,
         clinical_context ? JSON.stringify(clinical_context) : null,
         preferred_date || null]
      );

      res.status(201).json({ session: rows[0] });
    } catch (e) {
      console.error("POST /api/teleconsult/request error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/teleconsult/sessions — list sessions filtered by role
  router.get("/api/teleconsult/sessions", requireAuth, requireRole(["vet_ext", "vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const role = req.user?.role;
      const { status } = req.query;

      let query = `
        SELECT ts.*,
               u_req.display_name AS requesting_vet_name,
               u_spec.display_name AS specialist_vet_name,
               p.name AS pet_name, p.species, p.breed, p.pet_id
        FROM teleconsult_sessions ts
        LEFT JOIN conversations c ON ts.conversation_id = c.conversation_id
        LEFT JOIN pets p ON c.pet_id = p.pet_id
        LEFT JOIN users u_req ON ts.requesting_vet_id = u_req.user_id
        LEFT JOIN users u_spec ON ts.specialist_vet_id = u_spec.user_id
        WHERE 1=1`;
      const params = [];

      if (role === "vet_ext") {
        params.push(userId);
        query += ` AND ts.requesting_vet_id = $${params.length}`;
      } else if (role === "vet_int" || role === "vet") {
        params.push(userId);
        query += ` AND (ts.specialist_vet_id = $${params.length} OR (ts.specialist_vet_id IS NULL AND ts.status = 'requested'))`;
      }
      // super_admin: no filter, sees all

      if (status) {
        params.push(status);
        query += ` AND ts.status = $${params.length}`;
      }

      query += " ORDER BY ts.created_at DESC LIMIT 100";

      const { rows } = await pool.query(query, params);
      res.json({ sessions: rows });
    } catch (e) {
      console.error("GET /api/teleconsult/sessions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/teleconsult/sessions/:sessionId — update status (state machine)
  router.patch("/api/teleconsult/sessions/:sessionId", requireAuth, requireRole(["vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { sessionId } = req.params;
      const { status: newStatus, scheduled_at } = req.body;
      if (!newStatus) return res.status(400).json({ error: "status_required" });

      // Fetch current session
      const current = await pool.query("SELECT * FROM teleconsult_sessions WHERE session_id = $1", [sessionId]);
      if (!current.rows[0]) return res.status(404).json({ error: "not_found" });
      const session = current.rows[0];

      // Validate transition
      const allowed = VALID_TRANSITIONS[session.status];
      if (!allowed || !allowed.includes(newStatus)) {
        return res.status(400).json({ error: "invalid_transition", from: session.status, to: newStatus, allowed: allowed || [] });
      }

      const sets = ["status = $2", "updated_at = NOW()"];
      const vals = [sessionId, newStatus];
      let idx = 3;

      if (newStatus === "scheduled") {
        sets.push(`specialist_vet_id = $${idx}`);
        vals.push(userId);
        idx++;
        if (scheduled_at) {
          sets.push(`scheduled_at = $${idx}`);
          vals.push(scheduled_at);
          idx++;
        }
      }

      if (newStatus === "in_progress") {
        sets.push("started_at = NOW()");
      }

      if (newStatus === "completed") {
        sets.push("ended_at = NOW()");
        // Compute duration_minutes from started_at
        if (session.started_at) {
          const durationMs = Date.now() - new Date(session.started_at).getTime();
          const durationMin = Math.round(durationMs / 60000);
          sets.push(`duration_minutes = $${idx}`);
          vals.push(durationMin);
          idx++;
        }
      }

      const { rows } = await pool.query(
        `UPDATE teleconsult_sessions SET ${sets.join(", ")} WHERE session_id = $1 RETURNING *`,
        vals
      );

      res.json({ updated: true, session: rows[0] });
    } catch (e) {
      console.error("PATCH /api/teleconsult/sessions/:sessionId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/teleconsult/sessions/:sessionId/note — add note (AI or manual)
  router.post("/api/teleconsult/sessions/:sessionId/note", requireAuth, requireRole(["vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { content_json, content_text } = req.body;
      if (!content_text) return res.status(400).json({ error: "content_text_required" });

      // Verify session exists
      const sessionRes = await pool.query("SELECT * FROM teleconsult_sessions WHERE session_id = $1", [sessionId]);
      if (!sessionRes.rows[0]) return res.status(404).json({ error: "session_not_found" });

      const generatedBy = content_json ? "ai" : "manual";
      const noteId = randomUUID();

      const { rows } = await pool.query(
        `INSERT INTO teleconsult_notes (note_id, session_id, generated_by, content_json, content_text)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [noteId, sessionId, generatedBy, content_json ? JSON.stringify(content_json) : null, content_text]
      );

      // If AI-generated, flag the session
      if (generatedBy === "ai") {
        await pool.query(
          "UPDATE teleconsult_sessions SET ai_note_generated = true, updated_at = NOW() WHERE session_id = $1",
          [sessionId]
        );
      }

      res.status(201).json({ note: rows[0] });
    } catch (e) {
      console.error("POST /api/teleconsult/sessions/:sessionId/note error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/teleconsult/notes/:noteId/share — share note with requesting vet
  router.patch("/api/teleconsult/notes/:noteId/share", requireAuth, requireRole(["vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { noteId } = req.params;

      const { rows } = await pool.query(
        `UPDATE teleconsult_notes
         SET shared_with_requester = true, approved_by_specialist = true, shared_at = NOW(), approved_at = NOW()
         WHERE note_id = $1 RETURNING *`,
        [noteId]
      );

      if (!rows[0]) return res.status(404).json({ error: "note_not_found" });

      res.json({ note: rows[0] });
    } catch (e) {
      console.error("PATCH /api/teleconsult/notes/:noteId/share error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { teleconsultRouter };
