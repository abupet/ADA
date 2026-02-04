// backend/src/documents.routes.js v1
// Document upload, metadata, download, AI read/explain (PR 8/9)
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getPool } = require("./db");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// MIME type validation via magic bytes
const MAGIC_BYTES = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46] }, // GIF
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WebP)
  { mime: "image/tiff", bytes: [0x49, 0x49, 0x2a, 0x00] }, // TIFF little-endian
  { mime: "image/tiff", bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF big-endian
];

const ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/tiff",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;
  for (const entry of MAGIC_BYTES) {
    const match = entry.bytes.every((b, i) => buffer[i] === b);
    if (match) return entry.mime;
  }
  return null;
}

function getStoragePath() {
  return process.env.DOCUMENT_STORAGE_PATH || path.resolve(__dirname, "../../uploads");
}

function ensureStorageDir() {
  const dir = getStoragePath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Documents router: upload, metadata, download, AI read/explain.
 * Requires multer upload middleware from server.js.
 */
function documentsRouter({ requireAuth, upload, getOpenAiKey, proxyOpenAiRequest }) {
  const router = express.Router();
  const pool = getPool();

  // POST /api/documents/upload - multipart upload
  router.post("/api/documents/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;

      if (!req.file) {
        return res.status(400).json({ error: "missing_file" });
      }

      // Validate file size
      if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "file_too_large", max_bytes: MAX_FILE_SIZE });
      }

      // Magic bytes MIME validation
      const detectedMime = detectMimeFromBuffer(req.file.buffer);
      if (!detectedMime || !ALLOWED_MIMES.includes(detectedMime)) {
        return res.status(400).json({
          error: "unsupported_file_type",
          detected: detectedMime,
          allowed: ALLOWED_MIMES,
        });
      }

      // Validate pet_id
      const pet_id = req.body.pet_id;
      if (!pet_id || !isValidUuid(pet_id)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      // Verify pet belongs to owner
      const petCheck = await pool.query(
        "SELECT pet_id FROM pets WHERE pet_id = $1 AND owner_user_id = $2",
        [pet_id, owner_user_id]
      );
      if (!petCheck.rows[0]) {
        return res.status(404).json({ error: "pet_not_found" });
      }

      // Generate document ID and hash
      const document_id = crypto.randomUUID();
      const hash_sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

      // Store file on disk
      const storageDir = ensureStorageDir();
      const safeName = path.basename(req.file.originalname || "file").replace(/[\/\\]/g, "");
      const storage_key = `${document_id}_${safeName}`;
      const filePath = path.join(storageDir, storage_key);
      fs.writeFileSync(filePath, req.file.buffer);

      // Insert DB record
      const { rows } = await pool.query(
        `INSERT INTO documents
          (document_id, pet_id, owner_user_id, original_filename, mime_type,
           size_bytes, storage_key, hash_sha256, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          document_id,
          pet_id,
          owner_user_id,
          req.file.originalname || "file",
          detectedMime,
          req.file.size,
          storage_key,
          hash_sha256,
          owner_user_id,
        ]
      );

      res.status(201).json(rows[0]);
    } catch (e) {
      console.error("POST /api/documents/upload error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/documents/:id - get document metadata
  router.get("/api/documents/:id", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      const { rows } = await pool.query(
        "SELECT * FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1",
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      res.json(rows[0]);
    } catch (e) {
      console.error("GET /api/documents/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/documents/:id/download - serve document binary
  router.get("/api/documents/:id/download", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      const { rows } = await pool.query(
        "SELECT storage_key, original_filename, mime_type FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1",
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      const doc = rows[0];
      const filePath = path.join(getStoragePath(), doc.storage_key);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "file_not_found" });
      }

      res.setHeader("Content-Type", doc.mime_type);
      const safeFilename = doc.original_filename.replace(/[^a-zA-Z0-9._-]/g, "");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (e) {
      console.error("GET /api/documents/:id/download error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/documents/:id/read - start AI read job (PR 9)
  router.post("/api/documents/:id/read", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      const { rows } = await pool.query(
        "SELECT * FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1",
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      const doc = rows[0];

      // Mark as processing
      await pool.query(
        "UPDATE documents SET ai_status = 'reading', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [id]
      );

      // Fire-and-forget AI read
      processDocumentRead(pool, doc, getOpenAiKey).catch((err) => {
        console.error("AI read job failed for document", id, err);
      });

      res.json({ status: "reading", document_id: id });
    } catch (e) {
      console.error("POST /api/documents/:id/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/documents/:id/explain - start AI explain job (PR 9)
  router.post("/api/documents/:id/explain", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      const { rows } = await pool.query(
        "SELECT * FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1",
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      const doc = rows[0];

      if (!doc.read_text) {
        return res.status(400).json({ error: "document_not_read", message: "Run /read first" });
      }

      // Mark as processing
      await pool.query(
        "UPDATE documents SET ai_status = 'explaining', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [id]
      );

      // Fire-and-forget AI explain
      processDocumentExplain(pool, doc, getOpenAiKey).catch((err) => {
        console.error("AI explain job failed for document", id, err);
      });

      res.json({ status: "explaining", document_id: id });
    } catch (e) {
      console.error("POST /api/documents/:id/explain error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/documents/:id/status - get AI job status
  router.get("/api/documents/:id/status", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      const { rows } = await pool.query(
        `SELECT document_id, ai_status, ai_error, ai_updated_at, read_text IS NOT NULL AS has_read_text,
                owner_explanation IS NOT NULL AS has_explanation
         FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      res.json(rows[0]);
    } catch (e) {
      console.error("GET /api/documents/:id/status error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

/**
 * Background AI read: extracts text from a document image/PDF via OpenAI vision.
 */
async function processDocumentRead(pool, doc, getOpenAiKey) {
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = 'openai_key_not_configured', ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id]
    );
    return;
  }

  try {
    const filePath = path.join(getStoragePath(), doc.storage_key);
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");
    const dataUri = `data:${doc.mime_type};base64,${base64}`;

    const payload = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a veterinary document reader. Extract all text content from this document. Return only the extracted text, preserving structure where possible.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Please read and extract all text from this veterinary document." },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      max_tokens: 4096,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const readText = data.choices?.[0]?.message?.content || "";

    await pool.query(
      "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, readText]
    );
  } catch (err) {
    console.error("processDocumentRead error", err);
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, String(err.message || err).slice(0, 1000)]
    );
  }
}

/**
 * Background AI explain: generates a pet-owner-friendly explanation of extracted text.
 */
async function processDocumentExplain(pool, doc, getOpenAiKey) {
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = 'openai_key_not_configured', ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id]
    );
    return;
  }

  try {
    const payload = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a veterinary assistant. Explain the following veterinary document content to a pet owner in clear, simple language. Highlight any important findings, diagnoses, medications, or follow-up actions.",
        },
        {
          role: "user",
          content: `Please explain this veterinary document to me as a pet owner:\n\n${doc.read_text}`,
        },
      ],
      max_tokens: 2048,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content || "";

    await pool.query(
      "UPDATE documents SET owner_explanation = $2, ai_status = 'complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, explanation]
    );
  } catch (err) {
    console.error("processDocumentExplain error", err);
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, String(err.message || err).slice(0, 1000)]
    );
  }
}

module.exports = { documentsRouter };
