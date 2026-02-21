// backend/src/documents.routes.js v2
// Document upload, metadata, download, AI read/explain (PR 8/9)
// v2: fix document_id mismatch, synchronous read/explain, mock mode support
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getPool } = require("./db");
const { enrichSystemPrompt } = require("./rag.service");

// --- Debug logging helper (PR 13) ---
function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    console.log(JSON.stringify({ts: new Date().toISOString(), level, domain, corrId: (req && req.correlationId) || '--------', msg: message, data: data || undefined}));
}

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
  // WebP handled separately below (RIFF header shared with WAV/AVI)
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
  // WebP: RIFF header (bytes 0-3) + "WEBP" at bytes 8-11
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return "image/webp";
  }
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

  // GET /api/documents - list documents for a pet (or all for the user)
  router.get("/api/documents", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const pet_id = req.query.pet_id || null;

      let rows;
      if (pet_id) {
        if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
        const result = await pool.query(
          `SELECT document_id, pet_id, original_filename, mime_type, size_bytes,
                  hash_sha256, ai_status, version, created_at
           FROM documents
           WHERE owner_user_id = $1 AND pet_id = $2
           ORDER BY created_at DESC`,
          [owner_user_id, pet_id]
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT document_id, pet_id, original_filename, mime_type, size_bytes,
                  hash_sha256, ai_status, version, created_at
           FROM documents
           WHERE owner_user_id = $1
           ORDER BY created_at DESC`,
          [owner_user_id]
        );
        rows = result.rows;
      }

      res.json({ documents: rows });
    } catch (e) {
      console.error("GET /api/documents error", e);
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
        `SELECT d.* FROM documents d
         LEFT JOIN pets p ON p.pet_id = d.pet_id
         WHERE d.document_id = $1
         AND (d.owner_user_id = $2 OR p.owner_user_id = $2 OR p.referring_vet_user_id = $2)
         LIMIT 1`,
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
        `SELECT d.storage_key, d.original_filename, d.mime_type FROM documents d
         LEFT JOIN pets p ON p.pet_id = d.pet_id
         WHERE d.document_id = $1
         AND (d.owner_user_id = $2 OR p.owner_user_id = $2 OR p.referring_vet_user_id = $2)
         LIMIT 1`,
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
        `SELECT d.* FROM documents d LEFT JOIN pets p ON p.pet_id = d.pet_id WHERE d.document_id = $1 AND (d.owner_user_id = $2 OR p.owner_user_id = $2 OR p.referring_vet_user_id = $2) LIMIT 1`,
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
        `SELECT d.* FROM documents d LEFT JOIN pets p ON p.pet_id = d.pet_id WHERE d.document_id = $1 AND (d.owner_user_id = $2 OR p.owner_user_id = $2 OR p.referring_vet_user_id = $2) LIMIT 1`,
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      const doc = rows[0];

      if (!doc.read_text) {
        // Auto-read the document first (v7.1.0: explain should work even if vet hasn't read it yet)
        console.log("POST /api/documents/:id/explain - auto-reading document first", id);
        await pool.query(
          "UPDATE documents SET ai_status = 'reading', ai_error = NULL, ai_updated_at = NOW() WHERE document_id = $1",
          [id]
        );
        const readResult = await processDocumentRead(pool, doc, getOpenAiKey, isMockEnv);
        if (readResult.error) {
          return res.status(readResult.statusCode || 500).json({
            error: readResult.error,
            message: readResult.message,
          });
        }
        // Refresh doc with the newly read text
        const refreshed = await pool.query(
          `SELECT d.* FROM documents d LEFT JOIN pets p ON p.pet_id = d.pet_id WHERE d.document_id = $1 AND (d.owner_user_id = $2 OR p.owner_user_id = $2 OR p.referring_vet_user_id = $2) LIMIT 1`,
          [id, owner_user_id]
        );
        if (!refreshed.rows[0]) return res.status(404).json({ error: "not_found" });
        Object.assign(doc, refreshed.rows[0]);
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

  // DELETE /api/documents/:id - delete a document
  router.delete("/api/documents/:id", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_document_id" });

      // Fetch storage_key before deleting so we can remove the file
      const { rows } = await pool.query(
        "SELECT storage_key FROM documents WHERE document_id = $1 AND owner_user_id = $2 LIMIT 1",
        [id, owner_user_id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      await pool.query(
        "DELETE FROM documents WHERE document_id = $1 AND owner_user_id = $2",
        [id, owner_user_id]
      );

      // Best-effort file cleanup
      try {
        const filePath = path.join(getStoragePath(), rows[0].storage_key);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_e) { /* non-critical */ }

      serverLog('INFO', 'DOC', 'document deleted', { documentId: id }, req);
      res.json({ deleted: true, document_id: id });
    } catch (e) {
      console.error("DELETE /api/documents/:id error", e);
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
 * Check if OpenAI optimizations are enabled (query global_policies).
 */
async function getDocumentAiModel(pool) {
  try {
    const { rows } = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'openai_optimizations'"
    );
    if (rows.length > 0 && rows[0].policy_value) {
      const val = typeof rows[0].policy_value === 'string'
        ? JSON.parse(rows[0].policy_value) : rows[0].policy_value;
      if (val.enabled) return 'gpt-4o-mini';
    }
  } catch (_e) { /* ignore, use default */ }
  return 'gpt-4o';
}

/**
 * Synchronous AI read: extracts text from a document image/PDF via OpenAI vision.
 * Returns { text } on success, { error, message, statusCode } on failure.
 */
async function processDocumentRead(pool, doc, getOpenAiKey, isMockEnv) {
  var _docStartMs = Date.now();
  serverLog('INFO', 'DOC', 'processDocumentRead start', {documentId: doc.document_id, mimeType: doc.mime_type});
  const oaKey = safeGetOpenAiKey(getOpenAiKey);

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
      { type: "text", text: "Leggi ed estrai tutto il testo da questo documento veterinario. Restituisci solo il testo estratto, preservando la struttura dove possibile." },
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

    const docModel = await getDocumentAiModel(pool);
    const payload = {
      model: docModel,
      messages: [
        {
          role: "system",
          content: "Sei un lettore di documenti veterinari. Estrai tutto il contenuto testuale da questo documento. Restituisci solo il testo estratto, preservando la struttura dove possibile.",
        },
        {
          role: "user",
          content: contentParts,
        },
      ],
      max_tokens: 4096,
    };

    console.log("processDocumentRead: calling OpenAI for doc", doc.document_id, "mime:", doc.mime_type, "model:", docModel);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
    console.log("processDocumentRead: OpenAI responded with status", response.status);

    if (!response.ok) {
      const errText = await response.text();
      const errMsg = `OpenAI API error ${response.status}: ${errText}`;
      console.error("processDocumentRead OpenAI error:", errMsg);

      // If the file content type isn't supported, retry with image_url for PDFs
      if (doc.mime_type === "application/pdf" && response.status === 400) {
        console.log("Retrying PDF as image_url fallback...");
        serverLog('INFO', 'DOC', 'PDF->image fallback', {documentId: doc.document_id, originalError: errMsg.slice(0, 100)});
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

    serverLog('INFO', 'DOC', 'processDocumentRead done', {documentId: doc.document_id, latencyMs: Date.now() - _docStartMs, status: 'success'});
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
          content: "Sei un lettore di documenti veterinari. Estrai tutto il contenuto testuale da questo documento. Restituisci solo il testo estratto, preservando la struttura dove possibile.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Leggi ed estrai tutto il testo da questo documento veterinario." },
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
      signal: AbortSignal.timeout(90_000),
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
  const oaKey = safeGetOpenAiKey(getOpenAiKey);

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
    const explainModel = await getDocumentAiModel(pool);
    // RAG: enrich explain prompt with veterinary knowledge
    let explainSystemContent = "Sei il team AbuPet. Spiega il contenuto del documento veterinario al proprietario dell'animale in modo chiaro, empatico e rassicurante. Parla a nome del 'team AbuPet': il team spiega e informa, ma NON visita, NON diagnostica, NON prescrive. Usa sempre la terza persona per il veterinario: 'il veterinario ha notato che…', 'durante la visita è emerso che…'. NON usare 'abbiamo riscontrato', 'abbiamo notato', 'la nostra diagnosi'. Usa espressioni come 'è consigliabile…', 'il veterinario consiglia…'. Evidenzia risultati importanti, diagnosi, farmaci e azioni da seguire. Evita termini tecnici complessi (o spiegali brevemente). Chiudi con: 'Il team AbuPet'.";
    explainSystemContent = await enrichSystemPrompt(pool, getOpenAiKey, explainSystemContent, (doc.read_text || '').substring(0, 500), { sourceService: 'document_explain' });
    const payload = {
      model: explainModel,
      messages: [
        {
          role: "system",
          content: explainSystemContent,
        },
        {
          role: "user",
          content: `Spiega questo documento veterinario al proprietario dell'animale:\n\n${doc.read_text}`,
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
      signal: AbortSignal.timeout(90_000),
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

/**
 * Defensive getter for OpenAI key.
 * Prevents hard failures when router wiring changes and getOpenAiKey is missing.
 */
function safeGetOpenAiKey(getOpenAiKey) {
  try {
    if (typeof getOpenAiKey !== "function") return null;
    return getOpenAiKey();
  } catch (err) {
    console.error("safeGetOpenAiKey error", err);
    return null;
  }
}

module.exports = { documentsRouter };
