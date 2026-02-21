// backend/src/transcription.routes.js v1
// Post-call transcription API: save recordings, trigger transcription, list recordings
const express = require("express");
const crypto = require("crypto");
const { getPool } = require("./db");

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isUuid(v) { return typeof v === "string" && UUID_RE.test(v); }

const MOCK_TX = {
  text: "Buongiorno, il mio cane ha avuto episodi di vomito nelle ultime 24 ore. Ha mangiato erba durante la passeggiata ieri. Non ha febbre e beve normalmente.",
  segments: [
    { start: 0, end: 5.2, text: "Buongiorno, il mio cane ha avuto episodi di vomito nelle ultime 24 ore." },
    { start: 5.5, end: 9.8, text: "Ha mangiato erba durante la passeggiata ieri." },
    { start: 10.1, end: 14.0, text: "Non ha febbre e beve normalmente." }
  ]
};

function transcriptionRouter({ requireAuth, getOpenAiKey, isMockEnv }) {
  const router = express.Router();
  const pool = getPool();

  async function hasAccess(convId, userId) {
    const { rows } = await pool.query(
      "SELECT 1 FROM conversations WHERE conversation_id = $1 AND (owner_user_id = $2 OR vet_user_id = $2) LIMIT 1",
      [convId, userId]);
    return rows.length > 0;
  }

  // POST /api/communication/recordings/:conversationId — save recording metadata
  router.post("/api/communication/recordings/:conversationId", requireAuth, async (req, res) => {
    try {
      const { conversationId } = req.params;
      if (!isUuid(conversationId)) return res.status(400).json({ error: "invalid_conversation_id" });
      if (!(await hasAccess(conversationId, req.user.sub))) return res.status(403).json({ error: "access_denied" });
      const { recording_url, recording_type, duration_seconds, file_size_bytes } = req.body;
      if (!recording_url || typeof recording_url !== "string") return res.status(400).json({ error: "recording_url_required" });
      const id = crypto.randomUUID();
      const { rows } = await pool.query(
        "INSERT INTO call_recordings (recording_id, conversation_id, recording_url, recording_type, duration_seconds, file_size_bytes, transcription_status) " +
        "VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *",
        [id, conversationId, recording_url, recording_type || "audio", duration_seconds || 0, file_size_bytes || 0]);
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_found" });
      console.warn("POST recordings error", e.message);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/transcribe/:recordingId — start transcription
  router.post("/api/communication/transcribe/:recordingId", requireAuth, async (req, res) => {
    try {
      const { recordingId } = req.params;
      if (!isUuid(recordingId)) return res.status(400).json({ error: "invalid_recording_id" });
      const recQ = await pool.query(
        "SELECT r.recording_id, r.conversation_id, r.recording_url, r.transcription_status " +
        "FROM call_recordings r JOIN conversations c ON c.conversation_id = r.conversation_id " +
        "WHERE r.recording_id = $1 AND (c.owner_user_id = $2 OR c.vet_user_id = $2) LIMIT 1",
        [recordingId, req.user.sub]);
      if (!recQ.rows[0]) return res.status(404).json({ error: "not_found" });
      const rec = recQ.rows[0];
      if (rec.transcription_status === "completed") return res.json({ status: "already_completed" });
      let txText, txSegs;
      if (isMockEnv) {
        await pool.query("UPDATE call_recordings SET transcription_status = 'processing' WHERE recording_id = $1", [recordingId]);
        txText = MOCK_TX.text;
        txSegs = JSON.stringify(MOCK_TX.segments);
      } else {
        const apiKey = getOpenAiKey();
        if (!apiKey) {
          await pool.query("UPDATE call_recordings SET transcription_status = 'failed' WHERE recording_id = $1", [recordingId]);
          return res.status(500).json({ error: "openai_key_not_configured" });
        }
        await pool.query("UPDATE call_recordings SET transcription_status = 'processing' WHERE recording_id = $1", [recordingId]);
        try {
          // Download audio file from URL
          const audioResp = await fetch(rec.recording_url);
          if (!audioResp.ok) throw new Error("Audio download failed: " + audioResp.status);
          const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
          // Determine filename from URL or fallback
          const urlPath = new URL(rec.recording_url).pathname;
          const fileName = urlPath.split("/").pop() || "audio.webm";
          // Build multipart/form-data
          const formData = new FormData();
          formData.append("file", new Blob([audioBuffer]), fileName);
          formData.append("model", "whisper-1");
          formData.append("response_format", "verbose_json");
          formData.append("language", "it");
          const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey },
            body: formData
          });
          if (!r.ok) throw new Error("OpenAI " + r.status);
          const result = await r.json();
          txText = result.text || "";
          txSegs = JSON.stringify(result.segments || []);
        } catch (aiErr) {
          await pool.query("UPDATE call_recordings SET transcription_status = 'failed' WHERE recording_id = $1", [recordingId]);
          console.warn("Transcription OpenAI error", aiErr.message);
          return res.status(502).json({ error: "transcription_failed" });
        }
      }
      const { rows } = await pool.query(
        "UPDATE call_recordings SET transcription_status = 'completed', transcription_text = $1, transcription_segments = $2 WHERE recording_id = $3 RETURNING *",
        [txText, txSegs, recordingId]);
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_found" });
      console.warn("POST transcribe error", e.message);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/recordings/:conversationId — list recordings
  router.get("/api/communication/recordings/:conversationId", requireAuth, async (req, res) => {
    try {
      const { conversationId } = req.params;
      if (!isUuid(conversationId)) return res.status(400).json({ error: "invalid_conversation_id" });
      if (!(await hasAccess(conversationId, req.user.sub))) return res.status(403).json({ error: "access_denied" });
      const { rows } = await pool.query(
        "SELECT * FROM call_recordings WHERE conversation_id = $1 ORDER BY created_at DESC", [conversationId]);
      res.json({ recordings: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ recordings: [] });
      console.warn("GET recordings error", e.message);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { transcriptionRouter };
