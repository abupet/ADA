// backend/src/push.routes.js v1
// Web Push notification routes: VAPID key, subscribe, unsubscribe, preferences

const express = require("express");
const { getPool } = require("./db");

function pushRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/push/vapid-key — public VAPID key for browser subscription
  router.get("/api/push/vapid-key", (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY || "";
    if (!key) return res.status(503).json({ error: "vapid_not_configured" });
    res.json({ publicKey: key });
  });

  // POST /api/push/subscribe — save browser push subscription
  router.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { endpoint, keys } = req.body || {};
      if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
        return res.status(400).json({ error: "invalid_subscription" });
      }
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, endpoint) DO UPDATE SET
           p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key,
           user_agent = EXCLUDED.user_agent, last_used_at = NOW()`,
        [userId, endpoint, keys.p256dh, keys.auth, req.headers["user-agent"] || null]
      );
      res.json({ ok: true });
    } catch (e) {
      if (e.code === "42P01") return res.json({ ok: true });
      console.error("POST /api/push/subscribe error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // DELETE /api/push/unsubscribe — remove subscription
  router.delete("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: "endpoint_required" });
      await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
        [userId, endpoint]
      );
      res.json({ ok: true });
    } catch (e) {
      if (e.code === "42P01") return res.json({ ok: true });
      console.error("DELETE /api/push/unsubscribe error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/push/preferences — notification preferences
  router.get("/api/push/preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { rows } = await pool.query(
        "SELECT * FROM notification_preferences WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      if (!rows[0]) {
        return res.json({
          user_id: userId,
          push_new_message: true,
          push_incoming_call: true,
          push_conversation_closed: false,
          show_message_preview: true,
          quiet_hours_start: null,
          quiet_hours_end: null,
        });
      }
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ user_id: req.user.sub, push_new_message: true, push_incoming_call: true, push_conversation_closed: false, show_message_preview: true });
      }
      console.error("GET /api/push/preferences error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/push/preferences — update notification preferences
  router.patch("/api/push/preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const allowed = ["push_new_message", "push_incoming_call", "push_conversation_closed", "show_message_preview", "quiet_hours_start", "quiet_hours_end"];
      const sets = [];
      const vals = [];
      let pi = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          sets.push(key + " = $" + pi++);
          vals.push(req.body[key]);
        }
      }
      if (sets.length === 0) return res.status(400).json({ error: "no_valid_fields" });
      sets.push("updated_at = NOW()");
      vals.push(userId);
      // Upsert
      await pool.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($${pi})
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      const { rows } = await pool.query(
        "UPDATE notification_preferences SET " + sets.join(", ") + " WHERE user_id = $" + pi + " RETURNING *",
        vals
      );
      res.json(rows[0] || {});
    } catch (e) {
      if (e.code === "42P01") return res.json({});
      console.error("PATCH /api/push/preferences error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

/**
 * Send push notification to a user (all their subscriptions).
 * Requires web-push to be configured. Silently skips if not available.
 */
async function sendPushToUser(userId, payload, notificationType) {
  try {
    const webpush = require("web-push");
    const { getPool } = require("./db");
    const pool = getPool();

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:noreply@ada.app",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    // Check preferences
    let prefs = { push_new_message: true, push_incoming_call: true, show_message_preview: true, quiet_hours_start: null, quiet_hours_end: null };
    try {
      const prefResult = await pool.query(
        "SELECT * FROM notification_preferences WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      if (prefResult.rows[0]) prefs = prefResult.rows[0];
    } catch (_) {}

    var prefKey = notificationType || 'push_new_message';
    if (prefs[prefKey] === false) return;

    // Check quiet hours
    if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
      const now = new Date();
      const hhmm = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = (prefs.quiet_hours_start || "").split(":").map(Number);
      const [eh, em] = (prefs.quiet_hours_end || "").split(":").map(Number);
      const start = (sh || 0) * 60 + (sm || 0);
      const end = (eh || 0) * 60 + (em || 0);
      if (start < end ? (hhmm >= start && hhmm < end) : (hhmm >= start || hhmm < end)) return;
    }

    const { rows: subs } = await pool.query(
      "SELECT subscription_id, endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1",
      [userId]
    );

    const payloadStr = JSON.stringify(payload);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payloadStr
        );
        await pool.query("UPDATE push_subscriptions SET last_used_at = NOW() WHERE subscription_id = $1", [sub.subscription_id]);
      } catch (pushErr) {
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await pool.query("DELETE FROM push_subscriptions WHERE subscription_id = $1", [sub.subscription_id]);
        }
      }
    }
  } catch (_) {
    // web-push not installed or not configured — silently skip
  }
}

module.exports = { pushRouter, sendPushToUser };
