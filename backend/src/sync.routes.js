// backend/src/sync.routes.js v1
// Generic multi-entity sync engine (PR 7)
const express = require("express");
const { getPool } = require("./db");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// Supported entity types and their allowed change types
const SUPPORTED_ENTITIES = {
  pet: ["upsert", "delete"],
  document: ["upsert", "delete"],
};

/**
 * Generic offline-first sync:
 * - push: client sends ops from outbox (multi-entity)
 * - pull: client asks for changes since cursor (multi-entity)
 *
 * Uses changes.change_id as cursor (from 003_generic_changes.sql).
 */
function syncRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // PULL changes since cursor (multi-entity)
  router.get("/api/sync/pull", requireAuth, async (req, res) => {
    try {
      const owner_user_id = req.user?.sub;
      const since = Number(req.query.since || 0);
      const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 500);

      const { rows } = await pool.query(
        `SELECT change_id, entity_type, entity_id, change_type, record, version
         FROM changes
         WHERE owner_user_id = $1 AND change_id > $2
         ORDER BY change_id ASC
         LIMIT $3`,
        [owner_user_id, since, limit]
      );

      const next_cursor = rows.length ? rows[rows.length - 1].change_id : since;
      const has_more = rows.length === limit;

      const changes = rows.map((r) => ({
        change_id: r.change_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        change_type: r.change_type,
        record: r.record,
        version: r.version,
      }));

      res.json({ next_cursor, has_more, changes });
    } catch (e) {
      console.error("GET /api/sync/pull error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PUSH ops (multi-entity)
  router.post("/api/sync/push", requireAuth, async (req, res) => {
    const owner_user_id = req.user?.sub;
    const device_id = String(req.body.device_id || "unknown");
    const ops = Array.isArray(req.body.ops) ? req.body.ops : [];

    const accepted = [];
    const rejected = [];

    for (const op of ops) {
      const { op_id, entity_type, entity_id, change_type, record, base_version, client_ts } = op || {};

      // --- Validate required fields ---
      if (!op_id || !entity_type || !entity_id || !change_type) {
        rejected.push({ op_id: op_id || null, reason: "invalid_op" });
        continue;
      }

      if (!isValidUuid(op_id)) {
        rejected.push({ op_id, reason: "invalid_op_id" });
        continue;
      }

      if (!isValidUuid(entity_id)) {
        rejected.push({ op_id, reason: "invalid_entity_id" });
        continue;
      }

      // Validate entity_type
      const allowedTypes = SUPPORTED_ENTITIES[entity_type];
      if (!allowedTypes) {
        rejected.push({ op_id, reason: "unsupported_entity_type" });
        continue;
      }

      if (!allowedTypes.includes(change_type)) {
        rejected.push({ op_id, reason: "unsupported_change_type" });
        continue;
      }

      let client;
      try {
        client = await pool.connect();
      } catch (connErr) {
        console.error("sync push pool.connect error", connErr);
        rejected.push({ op_id, reason: "server_error" });
        continue;
      }
      try {
        await client.query("BEGIN");

        // --- Idempotency check: if op_id already processed, accept silently ---
        const dup = await client.query(
          "SELECT change_id FROM changes WHERE op_id = $1 LIMIT 1",
          [op_id]
        );
        if (dup.rows.length > 0) {
          await client.query("COMMIT");
          accepted.push(op_id);
          continue;
        }

        // --- Conflict check (last-write-wins) ---
        if (base_version != null) {
          const latest = await client.query(
            `SELECT version FROM changes
             WHERE owner_user_id = $1 AND entity_type = $2 AND entity_id = $3
             ORDER BY change_id DESC LIMIT 1`,
            [owner_user_id, entity_type, entity_id]
          );
          if (latest.rows.length > 0) {
            const serverVersion = Number(latest.rows[0].version);
            if (Number(base_version) < serverVersion) {
              // Last-write-wins: accept the change but bump version
              // Log the conflict but proceed
              console.log(
                `sync conflict: entity=${entity_type}/${entity_id} base=${base_version} server=${serverVersion} — last-write-wins`
              );
            }
          }
        }

        // Determine the next version
        const versionResult = await client.query(
          `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM changes
           WHERE owner_user_id = $1 AND entity_type = $2 AND entity_id = $3`,
          [owner_user_id, entity_type, entity_id]
        );
        const nextVersion = versionResult.rows[0].next_version;

        // Insert the change record
        await client.query(
          `INSERT INTO changes
            (owner_user_id, entity_type, entity_id, change_type, record, version, client_ts, device_id, op_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            owner_user_id,
            entity_type,
            entity_id,
            change_type,
            record ? JSON.stringify(record) : null,
            nextVersion,
            client_ts || null,
            device_id,
            op_id,
          ]
        );

        await client.query("COMMIT");
        accepted.push(op_id);
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch (_rb) { /* connection may be broken */ }
        console.error("sync push op error", e);
        rejected.push({ op_id: op_id || null, reason: "server_error" });
      } finally {
        client.release();
      }
    }

    res.json({ accepted, rejected });
  });

  return router;
}

module.exports = { syncRouter };
