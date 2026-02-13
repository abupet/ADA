// backend/src/comm-upload.routes.js v1
// Communication attachment upload routes

function commUploadRouter({ requireAuth, upload }) {
  // upload is multer instance from server.js
  const router = require("express").Router();
  const { getPool } = require("./db");
  const crypto = require("crypto");
  const path = require("path");

  const pool = getPool();

  const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  function isValidUuid(v) { return typeof v === "string" && UUID_REGEX.test(v); }

  // MIME type validation
  const ALLOWED_MIME_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav",
    "video/mp4", "video/webm"
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

  /**
   * Derive the message type from a MIME type string.
   */
  function messageTypeFromMime(mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "file";
  }

  // POST /api/communication/conversations/:id/messages/upload
  // Upload a file attachment as a message
  router.post(
    "/api/communication/conversations/:id/messages/upload",
    requireAuth,
    upload.single("file"),
    async (req, res) => {
      try {
        const conversationId = req.params.id;
        if (!isValidUuid(conversationId)) {
          return res.status(400).json({ error: "invalid_conversation_id" });
        }

        // 1. Verify user has access to conversation
        const conversation = await getConversationIfAllowed(conversationId, req.user.sub);
        if (!conversation) {
          return res.status(404).json({ error: "not_found" });
        }

        // 2. Validate file presence, type and size
        if (!req.file) {
          return res.status(400).json({ error: "missing_file" });
        }
        if (req.file.size > MAX_FILE_SIZE) {
          return res.status(400).json({ error: "file_too_large", max_bytes: MAX_FILE_SIZE });
        }
        const mime = req.file.mimetype;
        if (!ALLOWED_MIME_TYPES.includes(mime)) {
          return res.status(400).json({
            error: "unsupported_file_type",
            detected: mime,
            allowed: ALLOWED_MIME_TYPES,
          });
        }

        const senderId = req.user.sub;
        const messageId = crypto.randomUUID();
        const attachmentId = crypto.randomUUID();
        const msgType = messageTypeFromMime(mime);

        // Compute SHA-256 checksum
        const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

        // Build stored file reference path
        const safeName = path.basename(req.file.originalname || "file").replace(/[/\\]/g, "");
        const storedFilename = `${attachmentId}_${safeName}`;
        const filePath = `/uploads/comm/${conversationId}/${storedFilename}`;

        // 3. Insert message into comm_messages
        const { rows: msgRows } = await pool.query(
          "INSERT INTO comm_messages " +
          "(message_id, conversation_id, sender_id, type, content, media_url, media_type, media_size_bytes) " +
          "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
          "RETURNING *",
          [messageId, conversationId, senderId, msgType, safeName, filePath, mime, req.file.size]
        );
        const newMessage = msgRows[0];

        // 4. Insert attachment detail into comm_attachments (with file_data BYTEA)
        const isImage = mime.startsWith("image/");
        const { rows: attRows } = await pool.query(
          "INSERT INTO comm_attachments " +
          "(attachment_id, message_id, original_filename, stored_filename, file_path, " +
          "mime_type, size_bytes, checksum_sha256, is_image, thumbnail_path, file_data) " +
          "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
          "RETURNING attachment_id, message_id, original_filename, stored_filename, file_path, " +
          "mime_type, size_bytes, checksum_sha256, is_image, thumbnail_path, created_at",
          [
            attachmentId, messageId, req.file.originalname || "file",
            storedFilename, filePath, mime, req.file.size,
            checksum, isImage, null, req.file.buffer
          ]
        );

        // Update conversation updated_at
        await pool.query(
          "UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1",
          [conversationId]
        );

        // 5. Broadcast via Socket.io
        const commNs = req.app.get("commNs");
        if (commNs) {
          commNs.to("conv:" + conversationId).emit("new_message", newMessage);
        }

        res.status(201).json({ message: newMessage, attachment: attRows[0] });
      } catch (e) {
        if (e.code === "42P01") {
          return res.status(500).json({ error: "table_not_found" });
        }
        console.error("POST /api/communication/conversations/:id/messages/upload error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // GET /api/communication/attachments/:id
  // Return attachment metadata (NOT the file itself - files served separately)
  router.get("/api/communication/attachments/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_attachment_id" });
      }

      // Join with comm_messages and conversations to verify access
      const { rows } = await pool.query(
        "SELECT a.* FROM comm_attachments a " +
        "JOIN comm_messages m ON m.message_id = a.message_id " +
        "JOIN conversations c ON c.conversation_id = m.conversation_id " +
        "WHERE a.attachment_id = $1 " +
        "AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
        "LIMIT 1",
        [id, req.user.sub]
      );

      if (!rows[0]) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("GET /api/communication/attachments/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/attachments/:id/download
  // Download the actual file binary (access-checked)
  router.get("/api/communication/attachments/:id/download", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) {
        return res.status(400).json({ error: "invalid_attachment_id" });
      }

      const { rows } = await pool.query(
        "SELECT a.file_data, a.mime_type, a.original_filename FROM comm_attachments a " +
        "JOIN comm_messages m ON m.message_id = a.message_id " +
        "JOIN conversations c ON c.conversation_id = m.conversation_id " +
        "WHERE a.attachment_id = $1 " +
        "AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
        "LIMIT 1",
        [id, req.user.sub]
      );

      if (!rows[0] || !rows[0].file_data) {
        return res.status(404).json({ error: "not_found" });
      }

      const row = rows[0];
      res.set("Content-Type", row.mime_type || "application/octet-stream");
      const safeName = (row.original_filename || "file").replace(/["\r\n]/g, "");
      res.set("Content-Disposition", 'inline; filename="' + safeName + '"');
      res.send(row.file_data);
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("GET /api/communication/attachments/:id/download error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { commUploadRouter };
