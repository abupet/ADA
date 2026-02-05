// backend/src/documents.routes.js v2
// Document upload, metadata, download, AI read/explain (PR 8/9)
// v2: fix document_id mismatch, synchronous read/explain, mock mode support
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
function documentsRouter({ requireAuth, upload, getOpenAiKey, proxyOpenAiRequest, isMockEnv }) {
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

      // Use client-provided document_id if valid UUID, otherwise generate
      const clientDocId = req.body.document_id;
      const document_id = (clientDocId && isValidUuid(clientDocId)) ? clientDocId : crypto.randomUUID();

      const hash_sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

      // Store file on disk
      const storageDir = ensureStorageDir();
      const safeName = path.basename(req.file.originalname || "file").replace(/[\/\\]/g, "");
      const storage_key = `${document_id}_${safeName}`;
      const filePath = path.join(storageDir, storage_key);
      fs.writeFileSync(filePath, req.file.buffer);

      // Insert DB record (ON CONFLICT to handle re-uploads of queued documents)
      const { rows } = await pool.query(
        `INSERT INTO documents
          (document_id, pet_id, owner_user_id, original_filename, mime_type,
           size_bytes, storage_key, hash_sha256, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (document_id) DO UPDATE SET
           storage_key = EXCLUDED.storage_key,
           hash_sha256 = EXCLUDED.hash_sha256,
           size_bytes = EXCLUDED.size_bytes
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

  // POST /api/documents/:id/read - synchronous AI read (waits for OpenAI result)
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

      // Synchronous AI read — waits for result before responding
      const result = await processDocumentRead(pool, doc, getOpenAiKey, isMockEnv);

      if (result.error) {
        return res.status(result.statusCode || 500).json({
          error: result.error,
          message: result.message,
        });
      }

      res.json({ status: "read_complete", document_id: id, read_text: result.text });
    } catch (e) {
      console.error("POST /api/documents/:id/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/documents/:id/explain - synchronous AI explain (waits for OpenAI result)
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

      // Synchronous AI explain — waits for result before responding
      const result = await processDocumentExplain(pool, doc, getOpenAiKey, isMockEnv);

      if (result.error) {
        return res.status(result.statusCode || 500).json({
          error: result.error,
          message: result.message,
        });
      }

      res.json({ status: "complete", document_id: id, owner_explanation: result.text });
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
 * Synchronous AI read: extracts text from a document image/PDF via OpenAI vision.
 * Returns { text } on success, { error, message, statusCode } on failure.
 */
async function processDocumentRead(pool, doc, getOpenAiKey, isMockEnv) {
  const oaKey = getOpenAiKey();

  if (!oaKey) {
    // MOCK mode: return mock read text
    if (isMockEnv) {
      const mockText = `[MOCK] Testo estratto dal documento "${doc.original_filename}".\n\nQuesto è un referto veterinario di esempio contenente informazioni cliniche sul paziente.`;
      await pool.query(
        "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, mockText]
      );
      return { text: mockText };
    }

    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = 'openai_key_not_configured', ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id]
    );
    return { error: "openai_key_not_configured", message: "OpenAI API key not configured", statusCode: 500 };
  }

  try {
    const filePath = path.join(getStoragePath(), doc.storage_key);
    if (!fs.existsSync(filePath)) {
      await pool.query(
        "UPDATE documents SET ai_status = 'error', ai_error = 'file_not_found', ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id]
      );
      return { error: "file_not_found", message: "Document file not found on disk", statusCode: 404 };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");

    // Build the content parts based on MIME type
    const contentParts = [
      { type: "text", text: "Please read and extract all text from this veterinary document. Return only the extracted text, preserving structure where possible." },
    ];

    if (doc.mime_type === "application/pdf") {
      // For PDFs: use the file content type (supported by GPT-4o)
      contentParts.push({
        type: "file",
        file: {
          filename: doc.original_filename || "document.pdf",
          file_data: `data:application/pdf;base64,${base64}`,
        },
      });
    } else {
      // For images: use image_url
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${doc.mime_type};base64,${base64}` },
      });
    }

    const payload = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a veterinary document reader. Extract all text content from this document. Return only the extracted text, preserving structure where possible.",
        },
        {
          role: "user",
          content: contentParts,
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
      const errMsg = `OpenAI API error ${response.status}: ${errText}`;
      console.error("processDocumentRead OpenAI error:", errMsg);

      // If the file content type isn't supported, retry with image_url for PDFs
      if (doc.mime_type === "application/pdf" && response.status === 400) {
        console.log("Retrying PDF as image_url fallback...");
        return await processDocumentReadFallback(pool, doc, oaKey, base64);
      }

      await pool.query(
        "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, errMsg.slice(0, 1000)]
      );
      return { error: "openai_error", message: errMsg, statusCode: 502 };
    }

    const data = await response.json();
    const readText = data.choices?.[0]?.message?.content || "";

    await pool.query(
      "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, readText]
    );

    return { text: readText };
  } catch (err) {
    console.error("processDocumentRead error", err);
    const errMsg = String(err.message || err).slice(0, 1000);
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, errMsg]
    );
    return { error: "read_failed", message: errMsg, statusCode: 500 };
  }
}

/**
 * Fallback for PDFs: try sending as image_url (some OpenAI API versions accept this).
 */
async function processDocumentReadFallback(pool, doc, oaKey, base64) {
  try {
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
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
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
      const errMsg = `OpenAI fallback error ${response.status}: ${errText}`;
      await pool.query(
        "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, errMsg.slice(0, 1000)]
      );
      return { error: "openai_error", message: errMsg, statusCode: 502 };
    }

    const data = await response.json();
    const readText = data.choices?.[0]?.message?.content || "";

    await pool.query(
      "UPDATE documents SET read_text = $2, ai_status = 'read_complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, readText]
    );

    return { text: readText };
  } catch (err) {
    const errMsg = String(err.message || err).slice(0, 1000);
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, errMsg]
    );
    return { error: "read_failed", message: errMsg, statusCode: 500 };
  }
}

/**
 * Synchronous AI explain: generates a pet-owner-friendly explanation of extracted text.
 * Returns { text } on success, { error, message, statusCode } on failure.
 */
async function processDocumentExplain(pool, doc, getOpenAiKey, isMockEnv) {
  const oaKey = getOpenAiKey();

  if (!oaKey) {
    // MOCK mode: return mock explanation
    if (isMockEnv) {
      const mockText = `[MOCK] Spiegazione semplificata del documento "${doc.original_filename}".\n\nIl documento contiene informazioni sulla salute del tuo animale. Non sono state riscontrate criticità urgenti.`;
      await pool.query(
        "UPDATE documents SET owner_explanation = $2, ai_status = 'complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, mockText]
      );
      return { text: mockText };
    }

    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = 'openai_key_not_configured', ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id]
    );
    return { error: "openai_key_not_configured", message: "OpenAI API key not configured", statusCode: 500 };
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
      const errMsg = `OpenAI API error ${response.status}: ${errText}`;
      await pool.query(
        "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
        [doc.document_id, errMsg.slice(0, 1000)]
      );
      return { error: "openai_error", message: errMsg, statusCode: 502 };
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content || "";

    await pool.query(
      "UPDATE documents SET owner_explanation = $2, ai_status = 'complete', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, explanation]
    );

    return { text: explanation };
  } catch (err) {
    console.error("processDocumentExplain error", err);
    const errMsg = String(err.message || err).slice(0, 1000);
    await pool.query(
      "UPDATE documents SET ai_status = 'error', ai_error = $2, ai_updated_at = NOW() WHERE document_id = $1",
      [doc.document_id, errMsg]
    );
    return { error: "explain_failed", message: errMsg, statusCode: 500 };
  }
}

module.exports = { documentsRouter };
