// backend/src/shared-records.routes.js v1
// B2B Phase: Shared health records — consent management & document sharing

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.resolve(__dirname, "../../uploads/shared-records");

// Ensure upload directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer disk storage with crypto-based filenames
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + crypto.randomBytes(8).toString("hex") + ext;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB

function sharedRecordsRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // ── 1. POST /api/shared-records/consent — Grant consent (owner) ──

  router.post(
    "/api/shared-records/consent",
    requireAuth,
    requireRole(["owner", "super_admin"]),
    async (req, res) => {
      try {
        const ownerUserId = req.user?.sub;
        const { pet_id, granted_to_user_id, granted_to_role, scope } = req.body;

        if (!pet_id || !granted_to_user_id) {
          return res.status(400).json({ error: "pet_id_and_granted_to_user_id_required" });
        }

        const { rows } = await pool.query(
          `INSERT INTO shared_record_consents
             (pet_id, owner_user_id, granted_to_user_id, granted_to_role, scope, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           ON CONFLICT (pet_id, owner_user_id, granted_to_user_id) WHERE status = 'active'
           DO UPDATE SET
             granted_to_role = EXCLUDED.granted_to_role,
             scope = EXCLUDED.scope,
             updated_at = NOW()
           RETURNING *`,
          [pet_id, ownerUserId, granted_to_user_id, granted_to_role || null, scope || null]
        );

        res.status(201).json({ consent: rows[0] });
      } catch (e) {
        console.error("POST /api/shared-records/consent error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ── 2. DELETE /api/shared-records/consent/:consentId — Revoke consent (auth) ──

  router.delete(
    "/api/shared-records/consent/:consentId",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.user?.sub;
        const { consentId } = req.params;

        const { rows } = await pool.query(
          `UPDATE shared_record_consents
           SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
           WHERE consent_id = $1
             AND (owner_user_id = $2 OR granted_to_user_id = $2)
             AND status = 'active'
           RETURNING *`,
          [consentId, userId]
        );

        if (!rows[0]) {
          return res.status(404).json({ error: "not_found" });
        }

        res.json({ revoked: true });
      } catch (e) {
        console.error("DELETE /api/shared-records/consent/:consentId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ── 3. GET /api/shared-records/consent/:petId — List consents (auth) ──

  router.get(
    "/api/shared-records/consent/:petId",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.user?.sub;
        const { petId } = req.params;
        const userRole = req.user?.role || req.headers["x-ada-role"] || "owner";

        let query;
        let params;

        if (userRole === "owner") {
          // Owner sees all consents for their pet
          query = `SELECT * FROM shared_record_consents
                   WHERE pet_id = $1 AND owner_user_id = $2
                   ORDER BY created_at DESC`;
          params = [petId, userId];
        } else {
          // Vet sees only active consents granted to them
          query = `SELECT * FROM shared_record_consents
                   WHERE pet_id = $1 AND granted_to_user_id = $2 AND status = 'active'
                   ORDER BY created_at DESC`;
          params = [petId, userId];
        }

        const { rows } = await pool.query(query, params);
        res.json({ consents: rows });
      } catch (e) {
        console.error("GET /api/shared-records/consent/:petId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ── 4. POST /api/shared-records/documents — Upload shared document (vet_int/vet_ext) ──

  router.post(
    "/api/shared-records/documents",
    requireAuth,
    requireRole(["vet_int", "vet_ext", "vet", "super_admin"]),
    upload.single("file"),
    async (req, res) => {
      try {
        const uploadedBy = req.user?.sub;
        const { pet_id, referral_id, document_type, title, description } = req.body;

        if (!pet_id) {
          return res.status(400).json({ error: "pet_id_required" });
        }
        if (!req.file) {
          return res.status(400).json({ error: "missing_file" });
        }

        // Parse tags from JSON string
        let tags = null;
        if (req.body.tags) {
          try {
            tags = JSON.parse(req.body.tags);
          } catch (_) {
            return res.status(400).json({ error: "invalid_tags_json" });
          }
        }

        const documentId = crypto.randomUUID();
        const storedFilename = req.file.filename;
        const originalFilename = req.file.originalname || "file";
        const mimeType = req.file.mimetype;
        const sizeBytes = req.file.size;

        const { rows } = await pool.query(
          `INSERT INTO shared_record_documents
             (document_id, pet_id, referral_id, uploaded_by_user_id, document_type,
              title, description, tags, original_filename, stored_filename,
              mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            documentId,
            pet_id,
            referral_id || null,
            uploadedBy,
            document_type || null,
            title || originalFilename,
            description || null,
            tags ? JSON.stringify(tags) : null,
            originalFilename,
            storedFilename,
            mimeType,
            sizeBytes,
          ]
        );

        res.status(201).json({ document: rows[0] });
      } catch (e) {
        console.error("POST /api/shared-records/documents error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ── 5. GET /api/shared-records/documents/:petId — List shared documents (auth) ──

  router.get(
    "/api/shared-records/documents/:petId",
    requireAuth,
    async (req, res) => {
      try {
        const { petId } = req.params;
        const { referral_id } = req.query;

        let query = `SELECT * FROM shared_record_documents WHERE pet_id = $1`;
        const params = [petId];

        if (referral_id) {
          params.push(referral_id);
          query += ` AND referral_id = $${params.length}`;
        }

        query += " ORDER BY created_at DESC";

        const { rows } = await pool.query(query, params);
        res.json({ documents: rows });
      } catch (e) {
        console.error("GET /api/shared-records/documents/:petId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ── 6. GET /api/shared-records/documents/download/:docId — Download document (auth) ──

  router.get(
    "/api/shared-records/documents/download/:docId",
    requireAuth,
    async (req, res) => {
      try {
        const { docId } = req.params;

        const { rows } = await pool.query(
          `SELECT stored_filename, original_filename, mime_type
           FROM shared_record_documents
           WHERE document_id = $1
           LIMIT 1`,
          [docId]
        );

        if (!rows[0]) {
          return res.status(404).json({ error: "not_found" });
        }

        const doc = rows[0];
        const filePath = path.resolve(UPLOAD_DIR, doc.stored_filename);

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "file_not_found" });
        }

        const safeFilename = (doc.original_filename || "file").replace(/[^a-zA-Z0-9._-]/g, "");
        res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (e) {
        console.error("GET /api/shared-records/documents/download/:docId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  return router;
}

module.exports = { sharedRecordsRouter };
