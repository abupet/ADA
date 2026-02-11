// backend/src/communication.routes.js v1
// Communication system REST API: AI settings, conversations, messages, unread counts
// Follows patterns from documents.routes.js and nutrition.routes.js

const express = require("express");
const crypto = require("crypto");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Communication router factory.
 * @param {{ requireAuth: Function }} opts
 * @returns {express.Router}
 */
function communicationRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // --- Helpers ---

  /**
   * Check if the current user is the owner or vet of a conversation.
   * Returns the conversation row if access is allowed, or null.
   */
  async function getConversationIfAllowed(conversationId, userId) {
    const { rows } = await pool.query(
      "SELECT * FROM conversations " +
      "WHERE conversation_id = $1 " +
      "AND (owner_user_id = $2 OR vet_user_id = $2) " +
      "LIMIT 1",
      [conversationId, userId]
    );
    return rows[0] || null;
  }

  // --- AI Settings ---

  // GET /api/communication/settings - read AI settings for current user
  router.get("/api/communication/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;

      // Auto-create row if it does not exist
      await pool.query(
        "INSERT INTO communication_settings (user_id) " +
        "VALUES ($1) " +
        "ON CONFLICT (user_id) DO NOTHING",
        [userId]
      );

      const { rows } = await pool.query(
        "SELECT user_id, chatbot_enabled, auto_transcription_enabled, created_at, updated_at " +
        "FROM communication_settings " +
        "WHERE user_id = $1 " +
        "LIMIT 1",
        [userId]
      );

      res.json(rows[0] || { user_id: userId, chatbot_enabled: true, auto_transcription_enabled: false });
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ user_id: req.user.sub, chatbot_enabled: true, auto_transcription_enabled: false });
      }
      console.error("GET /api/communication/settings error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/settings - update AI settings
  router.patch("/api/communication/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { chatbot_enabled, auto_transcription_enabled } = req.body;

      // Build SET clause dynamically for provided fields only
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (typeof chatbot_enabled === "boolean") {
        setClauses.push("chatbot_enabled = $" + paramIndex++);
        values.push(chatbot_enabled);
      }
      if (typeof auto_transcription_enabled === "boolean") {
        setClauses.push("auto_transcription_enabled = $" + paramIndex++);
        values.push(auto_transcription_enabled);
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "no_valid_fields" });
      }

      setClauses.push("updated_at = NOW()");
      values.push(userId);

      const { rows } = await pool.query(
        "UPDATE communication_settings " +
        "SET " + setClauses.join(", ") + " " +
        "WHERE user_id = $" + paramIndex + " " +
        "RETURNING *",
        values
      );

      if (!rows[0]) {
        return res.status(404).json({ error: "settings_not_found" });
      }

      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "settings_not_found" });
      }
      console.error("PATCH /api/communication/settings error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Users lookup (for recipient dropdown) ---

  // GET /api/communication/users?role=vet|owner — list users by role
  router.get("/api/communication/users", requireAuth, async (req, res) => {
    try {
      const roleParam = req.query.role;
      if (!roleParam || !["vet", "owner"].includes(roleParam)) {
        return res.status(400).json({ error: "invalid_role", message: "role must be vet or owner" });
      }
      const dbRole = roleParam; // 'vet' or 'owner' — matches base_role in DB directly
      const { rows } = await pool.query(
        "SELECT user_id, email, display_name FROM users WHERE base_role = $1 AND status = 'active' AND user_id != $2 ORDER BY display_name, email",
        [dbRole, req.user.sub]
      );
      res.json({ users: rows });
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ users: [] });
      }
      console.error("GET /api/communication/users error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Conversations ---

  // POST /api/communication/conversations - create a new conversation
  router.post("/api/communication/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { pet_id, vet_user_id, owner_override_id, subject } = req.body;

      if (!pet_id || !isValidUuid(pet_id)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      const conversationId = crypto.randomUUID();

      // If owner_override_id is set, current user is vet, recipient is owner
      // Otherwise, current user is owner, vet_user_id is the recipient
      let ownerUserId, vetUserId;
      if (owner_override_id && isValidUuid(owner_override_id)) {
        vetUserId = userId;
        ownerUserId = owner_override_id;
      } else {
        ownerUserId = userId;
        vetUserId = vet_user_id || null;
      }

      const { rows } = await pool.query(
        "INSERT INTO conversations " +
        "(conversation_id, pet_id, owner_user_id, vet_user_id, subject, status) " +
        "VALUES ($1, $2, $3, $4, $5, 'active') " +
        "RETURNING *",
        [conversationId, pet_id, ownerUserId, vetUserId, subject || null]
      );

      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(500).json({ error: "table_not_found" });
      }
      console.error("POST /api/communication/conversations error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/conversations - list conversations
  router.get("/api/communication/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { pet_id, status } = req.query;

      let query = "SELECT * FROM conversations " +
                  "WHERE (owner_user_id = $1 OR vet_user_id = $1)";
      const values = [userId];
      let paramIndex = 2;

      if (pet_id) {
        if (!isValidUuid(pet_id)) {
          return res.status(400).json({ error: "invalid_pet_id" });
        }
        query += " AND pet_id = $" + paramIndex++;
        values.push(pet_id);
      }

      if (status) {
        const allowedStatuses = ["active", "closed", "archived"];
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({ error: "invalid_status" });
        }
        query += " AND status = $" + paramIndex++;
        values.push(status);
      }

      query += " ORDER BY updated_at DESC";

      const { rows } = await pool.query(query, values);
      res.json({ conversations: rows });
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ conversations: [] });
      }
      console.error("GET /api/communication/conversations error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/conversations/:id - single conversation detail
  router.get("/api/communication/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_conversation_id" });
      }

      const conversation = await getConversationIfAllowed(id, req.user.sub);
      if (!conversation) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(conversation);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("GET /api/communication/conversations/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/conversations/:id - close or archive a conversation
  router.patch("/api/communication/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_conversation_id" });
      }

      const { status } = req.body;
      const allowedStatuses = ["closed", "archived"];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "invalid_status" });
      }

      // Verify access
      const conversation = await getConversationIfAllowed(id, req.user.sub);
      if (!conversation) {
        return res.status(404).json({ error: "not_found" });
      }

      const { rows } = await pool.query(
        "UPDATE conversations " +
        "SET status = $1, updated_at = NOW() " +
        "WHERE conversation_id = $2 " +
        "RETURNING *",
        [status, id]
      );

      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("PATCH /api/communication/conversations/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Messages ---

  // GET /api/communication/conversations/:id/messages - paginated messages (cursor-based)
  router.get("/api/communication/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_conversation_id" });
      }

      // Verify access
      const conversation = await getConversationIfAllowed(id, req.user.sub);
      if (!conversation) {
        return res.status(404).json({ error: "not_found" });
      }

      const before = req.query.before;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

      let query;
      let values;

      if (before && isValidUuid(before)) {
        // Cursor-based: get messages created before the given message
        query = "SELECT * FROM comm_messages " +
                "WHERE conversation_id = $1 " +
                "AND created_at < (" +
                "  SELECT created_at FROM comm_messages WHERE message_id = $2" +
                ") " +
                "ORDER BY created_at DESC " +
                "LIMIT $3";
        values = [id, before, limit];
      } else {
        // No cursor: get the most recent messages
        query = "SELECT * FROM comm_messages " +
                "WHERE conversation_id = $1 " +
                "ORDER BY created_at DESC " +
                "LIMIT $2";
        values = [id, limit];
      }

      const { rows } = await pool.query(query, values);

      // Reverse to return in chronological ASC order
      rows.reverse();

      res.json({ messages: rows });
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ messages: [] });
      }
      console.error("GET /api/communication/conversations/:id/messages error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/conversations/:id/messages - send a message
  router.post("/api/communication/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_conversation_id" });
      }

      // Verify access
      const conversation = await getConversationIfAllowed(id, req.user.sub);
      if (!conversation) {
        return res.status(404).json({ error: "not_found" });
      }

      const { content, type } = req.body;

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "content_required" });
      }
      if (content.length > 5000) {
        return res.status(400).json({ error: "content_too_long" });
      }

      const messageType = type || "text";
      const messageId = crypto.randomUUID();
      const senderId = req.user.sub;

      const { rows } = await pool.query(
        "INSERT INTO comm_messages " +
        "(message_id, conversation_id, sender_id, content, type) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        "RETURNING *",
        [messageId, id, senderId, content.trim(), messageType]
      );

      const newMessage = rows[0];

      // Update conversation updated_at
      await pool.query(
        "UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1",
        [id]
      );

      // Broadcast via Socket.io (commNs may be null in mock/test mode)
      const commNs = req.app.get("commNs");
      if (commNs) {
        commNs.to("conv:" + id).emit("new_message", newMessage);
      }

      res.status(201).json(newMessage);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(500).json({ error: "table_not_found" });
      }
      console.error("POST /api/communication/conversations/:id/messages error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/messages/:id/read - mark message as read
  router.patch("/api/communication/messages/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_message_id" });
      }

      const userId = req.user.sub;

      // Verify the user has access to the conversation containing this message
      const msgCheck = await pool.query(
        "SELECT m.message_id, m.conversation_id " +
        "FROM comm_messages m " +
        "JOIN conversations c ON c.conversation_id = m.conversation_id " +
        "WHERE m.message_id = $1 " +
        "AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
        "LIMIT 1",
        [id, userId]
      );

      if (!msgCheck.rows[0]) {
        return res.status(404).json({ error: "not_found" });
      }

      const { rows } = await pool.query(
        "UPDATE comm_messages " +
        "SET is_read = true, read_at = NOW() " +
        "WHERE message_id = $1 " +
        "RETURNING *",
        [id]
      );

      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("PATCH /api/communication/messages/:id/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Unread Count ---

  // GET /api/communication/unread-count - count unread messages across all conversations
  router.get("/api/communication/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;

      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS unread_count " +
        "FROM comm_messages m " +
        "JOIN conversations c ON c.conversation_id = m.conversation_id " +
        "WHERE (c.owner_user_id = $1 OR c.vet_user_id = $1) " +
        "AND m.sender_id != $1 " +
        "AND m.is_read = false",
        [userId]
      );

      res.json({ unread_count: rows[0]?.unread_count || 0 });
    } catch (e) {
      if (e.code === "42P01") {
        return res.json({ unread_count: 0 });
      }
      console.error("GET /api/communication/unread-count error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { communicationRouter };
