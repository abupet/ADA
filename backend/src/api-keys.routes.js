// backend/src/api-keys.routes.js v1
// API key management: key generation, revocation, webhooks

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const crypto = require("crypto");

function apiKeysRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/developer/keys — list keys for current user
  router.get("/api/developer/keys", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT key_id, key_name, api_key_prefix, scopes, rate_limit_per_hour,
                last_used_at, request_count, status, expires_at, created_at
         FROM api_keys
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      res.json({ keys: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ keys: [] });
      console.error("GET /api/developer/keys error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/developer/keys — generate a new API key
  router.post("/api/developer/keys", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { key_name, scopes, expires_at } = req.body;

      if (!key_name) return res.status(400).json({ error: "key_name is required" });

      // Generate a secure API key
      const rawKey = crypto.randomBytes(32).toString("hex");
      const prefix = rawKey.substring(0, 8);
      const hash = crypto.createHash("sha256").update(rawKey).digest("hex");

      const { rows } = await pool.query(
        `INSERT INTO api_keys
           (user_id, key_name, api_key_hash, api_key_prefix, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING key_id, key_name, api_key_prefix, scopes, rate_limit_per_hour,
                   status, expires_at, created_at`,
        [
          userId, key_name, hash, prefix,
          JSON.stringify(scopes || ["referrals:read", "appointments:read", "results:read"]),
          expires_at || null,
        ]
      );

      // Return the raw key only once — it cannot be retrieved again
      res.status(201).json({
        key: rows[0],
        api_key: rawKey,
        warning: "Store this API key securely. It will not be shown again.",
      });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/developer/keys error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // DELETE /api/developer/keys/:keyId/revoke — revoke a key
  router.delete("/api/developer/keys/:keyId/revoke", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { keyId } = req.params;

      const { rows } = await pool.query(
        `UPDATE api_keys
         SET status = 'revoked'
         WHERE key_id = $1 AND user_id = $2 AND status = 'active'
         RETURNING key_id, key_name, api_key_prefix, status`,
        [keyId, userId]
      );

      if (!rows[0]) return res.status(404).json({ error: "key_not_found_or_already_revoked" });
      res.json({ key: rows[0] });
    } catch (e) {
      console.error("DELETE /api/developer/keys/:keyId/revoke error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/developer/webhooks — list webhooks
  router.get("/api/developer/webhooks", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT webhook_id, url, events, status, last_triggered_at,
                failure_count, created_at
         FROM api_webhooks
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      res.json({ webhooks: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ webhooks: [] });
      console.error("GET /api/developer/webhooks error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/developer/webhooks — register webhook
  router.post("/api/developer/webhooks", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { url, events } = req.body;

      if (!url) return res.status(400).json({ error: "url is required" });

      // Generate a signing secret for the webhook
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = crypto.createHash("sha256").update(secret).digest("hex");

      const { rows } = await pool.query(
        `INSERT INTO api_webhooks
           (user_id, url, events, secret_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING webhook_id, url, events, status, created_at`,
        [
          userId, url,
          JSON.stringify(events || ["referral.status_changed", "result.ready", "appointment.confirmed"]),
          secretHash,
        ]
      );

      // Return the signing secret only once
      res.status(201).json({
        webhook: rows[0],
        signing_secret: secret,
        warning: "Store this signing secret securely. It will not be shown again.",
      });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/developer/webhooks error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // DELETE /api/developer/webhooks/:webhookId — remove webhook
  router.delete("/api/developer/webhooks/:webhookId", requireAuth, requireRole(["vet_ext"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { webhookId } = req.params;

      const { rows } = await pool.query(
        `DELETE FROM api_webhooks
         WHERE webhook_id = $1 AND user_id = $2
         RETURNING webhook_id`,
        [webhookId, userId]
      );

      if (!rows[0]) return res.status(404).json({ error: "webhook_not_found" });
      res.json({ deleted: true, webhook_id: rows[0].webhook_id });
    } catch (e) {
      console.error("DELETE /api/developer/webhooks/:webhookId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { apiKeysRouter };
