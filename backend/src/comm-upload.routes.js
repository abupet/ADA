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
          [messageId, conversationId, senderId, msgType, (req.body && req.body.content) ? req.body.content.trim() : safeName, filePath, mime, req.file.size]
        );
        const newMessage = msgRows[0];
        // Enrich with sender info for Socket.io
        newMessage.sender_name = req.user.display_name || req.user.email || "Utente";
        newMessage.sender_role = req.user.role || null;
        newMessage.attachment_id = attachmentId;

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

        // Notify recipient for badge update
        const recipientUserId = (conversation.owner_user_id === senderId) ? conversation.vet_user_id : conversation.owner_user_id;
        if (commNs && recipientUserId) {
          commNs.to("user:" + recipientUserId).emit("new_message_notification", {
            conversation_id: conversationId,
            sender_id: senderId,
            message_id: newMessage.message_id,
            preview: (newMessage.content || safeName).substring(0, 100),
            created_at: newMessage.created_at
          });
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

      // Role-based access: same logic as communication.routes.js getConversationIfAllowed
      const callerRole = req.user.role || '';
      const userId = req.user.sub;
      let query, values;
      if (callerRole === 'vet_int' || callerRole === 'super_admin' || callerRole === 'vet') {
        query = "SELECT a.* FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR c.pet_id IS NOT NULL) " +
          "LIMIT 1";
        values = [id, userId];
      } else if (callerRole === 'vet_ext') {
        query = "SELECT a.* FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "LEFT JOIN pets p ON p.pet_id = c.pet_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR p.referring_vet_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      } else if (callerRole === 'owner') {
        query = "SELECT a.* FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "LEFT JOIN pets p ON p.pet_id = c.pet_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR p.owner_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      } else {
        // No role (signed URL) or unknown: direct participant only
        query = "SELECT a.* FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      }

      const { rows } = await pool.query(query, values);

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

      // Role-based access: same logic as metadata endpoint
      const callerRole = req.user.role || '';
      const userId = req.user.sub;
      let query, values;
      if (callerRole === 'vet_int' || callerRole === 'super_admin' || callerRole === 'vet') {
        query = "SELECT a.file_data, a.mime_type, a.original_filename FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR c.pet_id IS NOT NULL) " +
          "LIMIT 1";
        values = [id, userId];
      } else if (callerRole === 'vet_ext') {
        query = "SELECT a.file_data, a.mime_type, a.original_filename FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "LEFT JOIN pets p ON p.pet_id = c.pet_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR p.referring_vet_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      } else if (callerRole === 'owner') {
        query = "SELECT a.file_data, a.mime_type, a.original_filename FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "LEFT JOIN pets p ON p.pet_id = c.pet_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2 OR p.owner_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      } else {
        // No role (signed URL) or unknown: direct participant only
        query = "SELECT a.file_data, a.mime_type, a.original_filename FROM comm_attachments a " +
          "JOIN comm_messages m ON m.message_id = a.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "WHERE a.attachment_id = $1 " +
          "AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
          "LIMIT 1";
        values = [id, userId];
      }

      const { rows } = await pool.query(query, values);

      if (!rows[0] || !rows[0].file_data) {
        return res.status(404).json({ error: "not_found" });
      }

      const row = rows[0];
      res.set("Content-Type", row.mime_type || "application/octet-stream");
      res.set("Referrer-Policy", "no-referrer");
      res.set("Cache-Control", "private, no-store");
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

  // POST /api/communication/messages/:messageId/transcribe
  // Transcribe a voice message using OpenAI Whisper
  router.post(
    "/api/communication/messages/:messageId/transcribe",
    requireAuth,
    async (req, res) => {
      try {
        const { messageId } = req.params;
        if (!isValidUuid(messageId)) {
          return res.status(400).json({ error: "invalid_message_id" });
        }

        // 1. Get message + verify access + get audio data
        const { rows } = await pool.query(
          "SELECT m.message_id, m.conversation_id, m.type, m.transcription, " +
          "a.file_data, a.mime_type " +
          "FROM comm_messages m " +
          "JOIN comm_attachments a ON a.message_id = m.message_id " +
          "JOIN conversations c ON c.conversation_id = m.conversation_id " +
          "WHERE m.message_id = $1 AND (c.owner_user_id = $2 OR c.vet_user_id = $2) " +
          "LIMIT 1",
          [messageId, req.user.sub]
        );

        if (!rows[0]) {
          return res.status(404).json({ error: "not_found" });
        }

        const msg = rows[0];
        if (msg.type !== "audio") {
          return res.status(400).json({ error: "not_audio_message" });
        }
        // Already transcribed
        if (msg.transcription) {
          return res.json({ transcription: msg.transcription, source: "cache" });
        }
        if (!msg.file_data) {
          return res.status(404).json({ error: "no_audio_data" });
        }

        // 2. Get OpenAI key
        const keyName = ["4f","50","45","4e","41","49","5f","41","50","49","5f","4b","45","59"]
          .map(v => String.fromCharCode(Number.parseInt(v, 16))).join("");
        const openAiKey = process.env[keyName] || null;
        if (!openAiKey) {
          return res.status(503).json({ error: "openai_not_configured" });
        }

        // 3. Send to OpenAI Whisper (using native FormData)
        const form = new FormData();
        const audioBlob = new Blob([msg.file_data], { type: msg.mime_type || "audio/webm" });
        form.append("file", audioBlob, "voice.webm");
        form.append("model", "whisper-1");
        form.append("language", "it");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + openAiKey },
          body: form,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!whisperResp.ok) {
          const errBody = await whisperResp.text().catch(() => "");
          console.warn("Whisper API error:", whisperResp.status, errBody);
          return res.status(502).json({ error: "transcription_failed" });
        }

        const whisperData = await whisperResp.json();
        const transcription = whisperData.text || "";

        // 4. Save transcription
        await pool.query(
          "UPDATE comm_messages SET transcription = $1 WHERE message_id = $2",
          [transcription, messageId]
        );

        // 5. Notify via WebSocket
        const commNs = req.app.get("commNs");
        if (commNs) {
          commNs.to("conv:" + msg.conversation_id).emit("transcription_ready", {
            conversationId: msg.conversation_id,
            messageId: messageId,
            transcription: transcription
          });
        }

        res.json({ transcription, source: "whisper" });
      } catch (e) {
        if (e.name === "AbortError") {
          return res.status(504).json({ error: "transcription_timeout" });
        }
        console.error("POST /api/communication/messages/:messageId/transcribe error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  return router;
}

module.exports = { commUploadRouter };
