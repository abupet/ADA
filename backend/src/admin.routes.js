// backend/src/admin.routes.js v1
// PR 2: Admin CRUD for promo catalog and campaigns

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

// Columns for list queries — excludes image_cached BYTEA to avoid loading blobs
const PROMO_COLS = `promo_item_id, tenant_id, name, category, species, lifecycle_target,
  description, extended_description, image_url, product_url, tags_include, tags_exclude,
  priority, status, version, service_type, nutrition_data, insurance_data,
  url_check_status, url_last_checked_at,
  image_cached_mime, image_cached_at, image_cached_hash,
  created_at, updated_at`;

function adminRouter({ requireAuth, upload }) {
  const router = express.Router();
  const pool = getPool();

  const adminRoles = ["admin_brand", "super_admin"];

  // ==============================
  // PROMO ITEMS CRUD
  // ==============================

  // List promo items for tenant
  router.get(
    "/api/admin/:tenantId/promo-items",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const status = req.query.status || null;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        let query =
          `SELECT ${PROMO_COLS} FROM promo_items WHERE tenant_id = $1`;
        const params = [tenantId];
        let paramIdx = 2;

        if (status) {
          query += ` AND status = $${paramIdx}`;
          params.push(status);
          paramIdx++;
        }

        const search = req.query.search || null;
        if (search) {
          query += ` AND (LOWER(name) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx})`;
          params.push('%' + search.toLowerCase() + '%');
          paramIdx++;
        }

        const serviceType = req.query.service_type || null;
        if (serviceType) {
          query += ` AND $${paramIdx} = ANY(service_type)`;
          params.push(serviceType);
          paramIdx++;
        }

        query += " ORDER BY updated_at DESC LIMIT $" + paramIdx + " OFFSET $" + (paramIdx + 1);
        params.push(limit, offset);

        const { rows } = await pool.query(query, params);

        // Count total
        let countQuery = "SELECT COUNT(*) FROM promo_items WHERE tenant_id = $1";
        const countParams = [tenantId];
        let countIdx = 2;
        if (status) {
          countQuery += ` AND status = $${countIdx}`;
          countParams.push(status);
          countIdx++;
        }
        if (search) {
          countQuery += ` AND (LOWER(name) LIKE $${countIdx} OR LOWER(description) LIKE $${countIdx})`;
          countParams.push('%' + search.toLowerCase() + '%');
          countIdx++;
        }
        if (serviceType) {
          countQuery += ` AND $${countIdx} = ANY(service_type)`;
          countParams.push(serviceType);
          countIdx++;
        }
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({ items: rows, total, page, limit });
      } catch (e) {
        console.error("GET /api/admin/:tenantId/promo-items error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Get single promo item
  router.get(
    "/api/admin/:tenantId/promo-items/:itemId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId, itemId } = req.params;
        const { rows } = await pool.query(
          `SELECT ${PROMO_COLS} FROM promo_items WHERE promo_item_id = $1 AND tenant_id = $2 LIMIT 1`,
          [itemId, tenantId]
        );
        if (!rows[0]) return res.status(404).json({ error: "not_found" });
        res.json(rows[0]);
      } catch (e) {
        console.error("GET /api/admin/:tenantId/promo-items/:itemId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Create promo item
  router.post(
    "/api/admin/:tenantId/promo-items",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const {
          name,
          category,
          species = [],
          lifecycle_target = [],
          description = null,
          extended_description = null,
          image_url = null,
          product_url = null,
          tags_include = [],
          tags_exclude = [],
          priority = 0,
          service_type = ['promo'],
          nutrition_data = null,
          insurance_data = null,
        } = req.body || {};

        const serviceTypeArr = Array.isArray(service_type) ? service_type : [service_type || 'promo'];

        if (!name || !category) {
          return res.status(400).json({ error: "name_and_category_required" });
        }

        const itemId = "pi_" + randomUUID();
        const { rows } = await pool.query(
          `INSERT INTO promo_items
            (promo_item_id, tenant_id, name, category, species, lifecycle_target,
             description, image_url, product_url, tags_include, tags_exclude, priority, status, version, extended_description,
             service_type, nutrition_data, insurance_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',1,$13,$14,$15,$16)
           RETURNING *`,
          [
            itemId, tenantId, name, category, species, lifecycle_target,
            description, image_url, product_url, tags_include, tags_exclude, priority,
            extended_description,
            serviceTypeArr,
            nutrition_data ? JSON.stringify(nutrition_data) : null,
            insurance_data ? JSON.stringify(insurance_data) : null,
          ]
        );

        // Version snapshot
        await pool.query(
          `INSERT INTO promo_item_versions (promo_item_id, version, snapshot, status, changed_by)
           VALUES ($1, 1, $2, 'draft', $3)`,
          [itemId, JSON.stringify(rows[0]), req.promoAuth?.userId]
        );

        // Audit
        await _auditLog(pool, req.promoAuth, "promo_item.create", itemId, "promo_item", { name, category });

        res.status(201).json(rows[0]);
      } catch (e) {
        console.error("POST /api/admin/:tenantId/promo-items error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Update promo item
  router.patch(
    "/api/admin/:tenantId/promo-items/:itemId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId, itemId } = req.params;
        const patch = req.body || {};

        const current = await pool.query(
          `SELECT ${PROMO_COLS} FROM promo_items WHERE promo_item_id = $1 AND tenant_id = $2 LIMIT 1`,
          [itemId, tenantId]
        );
        if (!current.rows[0]) return res.status(404).json({ error: "not_found" });

        const allowed = [
          "name", "category", "species", "lifecycle_target", "description",
          "image_url", "product_url", "tags_include", "tags_exclude", "priority",
          "extended_description", "service_type", "nutrition_data", "insurance_data",
        ];
        const sets = [];
        const params = [itemId, tenantId];
        let idx = 3;

        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            sets.push(`${key} = $${idx}`);
            if (key === 'service_type') {
              const val = patch[key];
              params.push(Array.isArray(val) ? val : [val || 'promo']);
            } else {
              params.push(patch[key]);
            }
            idx++;
          }
        }

        if (sets.length === 0) {
          return res.json(current.rows[0]);
        }

        sets.push(`version = version + 1`);
        sets.push(`updated_at = NOW()`);

        const { rows } = await pool.query(
          `UPDATE promo_items SET ${sets.join(", ")}
           WHERE promo_item_id = $1 AND tenant_id = $2
           RETURNING *`,
          params
        );

        // Version snapshot
        await pool.query(
          `INSERT INTO promo_item_versions (promo_item_id, version, snapshot, status, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [itemId, rows[0].version, JSON.stringify(rows[0]), rows[0].status, req.promoAuth?.userId]
        );

        await _auditLog(pool, req.promoAuth, "promo_item.update", itemId, "promo_item", {
          fields: Object.keys(patch).filter((k) => allowed.includes(k)),
        });

        res.json(rows[0]);
      } catch (e) {
        console.error("PATCH /api/admin/:tenantId/promo-items/:itemId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Transition promo item status (workflow)
  router.post(
    "/api/admin/:tenantId/promo-items/:itemId/transition",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId, itemId } = req.params;
        const { status: newStatus, reason } = req.body || {};

        const validTransitions = {
          draft: ["in_review"],
          in_review: ["published", "draft"],
          published: ["retired", "draft"],
          retired: ["draft"],
        };

        const current = await pool.query(
          `SELECT ${PROMO_COLS} FROM promo_items WHERE promo_item_id = $1 AND tenant_id = $2 LIMIT 1`,
          [itemId, tenantId]
        );
        if (!current.rows[0]) return res.status(404).json({ error: "not_found" });

        const currentStatus = current.rows[0].status;
        if (
          !validTransitions[currentStatus] ||
          !validTransitions[currentStatus].includes(newStatus)
        ) {
          return res.status(400).json({
            error: "invalid_transition",
            current_status: currentStatus,
            allowed: validTransitions[currentStatus] || [],
          });
        }

        const { rows } = await pool.query(
          `UPDATE promo_items SET status = $3, version = version + 1, updated_at = NOW()
           WHERE promo_item_id = $1 AND tenant_id = $2
           RETURNING *`,
          [itemId, tenantId, newStatus]
        );

        // Version snapshot
        await pool.query(
          `INSERT INTO promo_item_versions (promo_item_id, version, snapshot, status, changed_by, change_reason)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, rows[0].version, JSON.stringify(rows[0]), newStatus, req.promoAuth?.userId, reason || null]
        );

        await _auditLog(pool, req.promoAuth, "promo_item.transition", itemId, "promo_item", {
          from: currentStatus,
          to: newStatus,
          reason,
        });

        res.json(rows[0]);
      } catch (e) {
        console.error("POST /api/admin/:tenantId/promo-items/:itemId/transition error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Bulk publish draft items
  router.post(
    "/api/admin/:tenantId/promo-items/bulk-publish",
    requireAuth, requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { target_status = "published" } = req.body || {};
        if (!["in_review", "published"].includes(target_status))
          return res.status(400).json({ error: "invalid_target_status" });
        const { rows } = await pool.query(
          `UPDATE promo_items SET status = $2, version = version + 1, updated_at = NOW()
           WHERE tenant_id = $1 AND status = 'draft' RETURNING promo_item_id`,
          [tenantId, target_status]
        );
        await _auditLog(pool, req.promoAuth, "promo_items.bulk_publish", tenantId, "promo_items",
          { count: rows.length, target_status });
        res.json({ success: true, updated: rows.length, target_status });
      } catch (e) {
        console.error("POST bulk-publish error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // CAMPAIGNS CRUD
  // ==============================

  // List campaigns
  router.get(
    "/api/admin/:tenantId/campaigns",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { rows } = await pool.query(
          "SELECT * FROM promo_campaigns WHERE tenant_id = $1 ORDER BY updated_at DESC",
          [tenantId]
        );
        res.json({ campaigns: rows });
      } catch (e) {
        console.error("GET /api/admin/:tenantId/campaigns error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Create campaign
  router.post(
    "/api/admin/:tenantId/campaigns",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const {
          name,
          start_date = null,
          end_date = null,
          contexts = [],
          frequency_cap = {},
          utm_campaign = null,
          item_ids = [],
        } = req.body || {};

        if (!name) return res.status(400).json({ error: "name_required" });

        const campaignId = "camp_" + randomUUID();
        const { rows } = await pool.query(
          `INSERT INTO promo_campaigns
            (campaign_id, tenant_id, name, status, start_date, end_date, contexts, frequency_cap, utm_campaign)
           VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
           RETURNING *`,
          [campaignId, tenantId, name, start_date, end_date, contexts, JSON.stringify(frequency_cap), utm_campaign]
        );

        // Link items
        for (const itemId of item_ids) {
          await pool.query(
            "INSERT INTO campaign_items (campaign_id, promo_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [campaignId, itemId]
          );
        }

        await _auditLog(pool, req.promoAuth, "campaign.create", campaignId, "campaign", { name });

        res.status(201).json(rows[0]);
      } catch (e) {
        console.error("POST /api/admin/:tenantId/campaigns error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // Update campaign status
  router.patch(
    "/api/admin/:tenantId/campaigns/:campaignId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId, campaignId } = req.params;
        const patch = req.body || {};

        const allowed = ["name", "status", "start_date", "end_date", "contexts", "frequency_cap", "utm_campaign"];
        const sets = [];
        const params = [campaignId, tenantId];
        let idx = 3;

        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            if (key === "frequency_cap") {
              sets.push(`${key} = $${idx}`);
              params.push(JSON.stringify(patch[key]));
            } else {
              sets.push(`${key} = $${idx}`);
              params.push(patch[key]);
            }
            idx++;
          }
        }

        if (sets.length === 0) {
          const { rows } = await pool.query(
            "SELECT * FROM promo_campaigns WHERE campaign_id = $1 AND tenant_id = $2 LIMIT 1",
            [campaignId, tenantId]
          );
          return res.json(rows[0] || {});
        }

        sets.push("updated_at = NOW()");

        const { rows } = await pool.query(
          `UPDATE promo_campaigns SET ${sets.join(", ")}
           WHERE campaign_id = $1 AND tenant_id = $2
           RETURNING *`,
          params
        );

        if (!rows[0]) return res.status(404).json({ error: "not_found" });

        await _auditLog(pool, req.promoAuth, "campaign.update", campaignId, "campaign", {
          fields: Object.keys(patch).filter((k) => allowed.includes(k)),
        });

        res.json(rows[0]);
      } catch (e) {
        console.error("PATCH /api/admin/:tenantId/campaigns/:campaignId error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // CAMPAIGN <-> PROMO ITEM LINKS
  // ==============================

  // GET campaign linked items
  router.get(
    "/api/admin/:tenantId/campaigns/:campaignId/items",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { campaignId } = req.params;
        const { rows } = await pool.query(
          `SELECT pi.promo_item_id, pi.name, pi.category, pi.species, pi.status
           FROM campaign_items ci
           JOIN promo_items pi ON pi.promo_item_id = ci.promo_item_id
           WHERE ci.campaign_id = $1
           ORDER BY pi.name`,
          [campaignId]
        );
        res.json({ items: rows });
      } catch (e) {
        console.error("GET campaign items error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // POST link item to campaign
  router.post(
    "/api/admin/:tenantId/campaigns/:campaignId/items",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { campaignId } = req.params;
        const { promo_item_id } = req.body || {};
        if (!promo_item_id) return res.status(400).json({ error: "promo_item_id_required" });
        await pool.query(
          "INSERT INTO campaign_items (campaign_id, promo_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [campaignId, promo_item_id]
        );
        await _auditLog(pool, req.promoAuth, "campaign.link_item", campaignId, "campaign", { promo_item_id });
        res.json({ ok: true });
      } catch (e) {
        console.error("POST campaign link item error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // DELETE unlink item from campaign
  router.delete(
    "/api/admin/:tenantId/campaigns/:campaignId/items/:itemId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { campaignId, itemId } = req.params;
        await pool.query(
          "DELETE FROM campaign_items WHERE campaign_id = $1 AND promo_item_id = $2",
          [campaignId, itemId]
        );
        await _auditLog(pool, req.promoAuth, "campaign.unlink_item", campaignId, "campaign", { promo_item_id: itemId });
        res.json({ ok: true });
      } catch (e) {
        console.error("DELETE campaign unlink item error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // SUPERADMIN: TENANT DATA RESET
  // ==============================

  router.post(
    "/api/superadmin/tenants/:tenantId/reset",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const { tenantId } = req.params;

        // Verify tenant exists
        const tenantCheck = await client.query(
          "SELECT tenant_id FROM tenants WHERE tenant_id = $1 LIMIT 1",
          [tenantId]
        );
        if (!tenantCheck.rows[0]) {
          client.release();
          return res.status(404).json({ error: "tenant_not_found" });
        }

        await client.query("BEGIN");

        const deleted = {};

        // 1. promo_event_daily_stats
        const r1 = await client.query(
          "DELETE FROM promo_event_daily_stats WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.promo_event_daily_stats = r1.rowCount;

        // 2. promo_events
        const r2 = await client.query(
          "DELETE FROM promo_events WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.promo_events = r2.rowCount;

        // 3. campaign_items (via campaigns)
        const r3 = await client.query(
          "DELETE FROM campaign_items WHERE campaign_id IN (SELECT campaign_id FROM promo_campaigns WHERE tenant_id = $1)",
          [tenantId]
        );
        deleted.campaign_items = r3.rowCount;

        // 4. promo_campaigns
        const r4 = await client.query(
          "DELETE FROM promo_campaigns WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.promo_campaigns = r4.rowCount;

        // 5. brand_products_staging (via brand_ingest_jobs)
        const r5 = await client.query(
          "DELETE FROM brand_products_staging WHERE job_id IN (SELECT job_id FROM brand_ingest_jobs WHERE tenant_id = $1)",
          [tenantId]
        );
        deleted.brand_products_staging = r5.rowCount;

        // 6. brand_ingest_jobs
        const r6 = await client.query(
          "DELETE FROM brand_ingest_jobs WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.brand_ingest_jobs = r6.rowCount;

        // 7. promo_item_versions (via promo_items)
        const r7 = await client.query(
          "DELETE FROM promo_item_versions WHERE promo_item_id IN (SELECT promo_item_id FROM promo_items WHERE tenant_id = $1)",
          [tenantId]
        );
        deleted.promo_item_versions = r7.rowCount;

        // 8. promo_items
        const r8 = await client.query(
          "DELETE FROM promo_items WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.promo_items = r8.rowCount;

        // 9. tenant_budgets
        const r9 = await client.query(
          "DELETE FROM tenant_budgets WHERE tenant_id = $1",
          [tenantId]
        );
        deleted.tenant_budgets = r9.rowCount;

        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "tenant.reset", tenantId, "tenant", { deleted });

        res.json({ success: true, deleted });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("POST /api/superadmin/tenants/:tenantId/reset error", e);
        res.status(500).json({ error: "server_error", message: e.message });
      } finally {
        client.release();
      }
    }
  );

  // ==============================
  // ADMIN: DELETE PROMO EVENTS
  // ==============================

  router.delete(
    "/api/admin/promo-events",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const tenantId = req.query.tenant_id;
        if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

        await client.query("BEGIN");

        const r1 = await client.query(
          "DELETE FROM promo_event_daily_stats WHERE tenant_id = $1",
          [tenantId]
        );
        const r2 = await client.query(
          "DELETE FROM promo_events WHERE tenant_id = $1",
          [tenantId]
        );

        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "promo_events.delete_all", tenantId, "promo_events", {
          daily_stats: r1.rowCount, events: r2.rowCount
        });

        res.json({ success: true, deleted: { promo_event_daily_stats: r1.rowCount, promo_events: r2.rowCount } });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("DELETE /api/admin/promo-events error", e);
        res.status(500).json({ error: "server_error" });
      } finally {
        client.release();
      }
    }
  );

  // ==============================
  // ADMIN: DELETE CATALOG (ALL / SINGLE)
  // ==============================

  router.delete(
    "/api/admin/catalog/:itemId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const { itemId } = req.params;

        await client.query("BEGIN");
        await client.query("DELETE FROM campaign_items WHERE promo_item_id = $1", [itemId]);
        await client.query("DELETE FROM promo_item_versions WHERE promo_item_id = $1", [itemId]);
        const r = await client.query("DELETE FROM promo_items WHERE promo_item_id = $1", [itemId]);
        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "catalog_item.delete", itemId, "promo_item", {});

        res.json({ success: true, deleted: r.rowCount });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("DELETE /api/admin/catalog/:itemId error", e);
        res.status(500).json({ error: "server_error" });
      } finally {
        client.release();
      }
    }
  );

  router.delete(
    "/api/admin/catalog",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const tenantId = req.query.tenant_id;
        if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

        await client.query("BEGIN");
        await client.query(
          "DELETE FROM campaign_items WHERE promo_item_id IN (SELECT promo_item_id FROM promo_items WHERE tenant_id = $1)",
          [tenantId]
        );
        await client.query(
          "DELETE FROM promo_item_versions WHERE promo_item_id IN (SELECT promo_item_id FROM promo_items WHERE tenant_id = $1)",
          [tenantId]
        );
        const r = await client.query("DELETE FROM promo_items WHERE tenant_id = $1", [tenantId]);
        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "catalog.delete_all", tenantId, "promo_items", { count: r.rowCount });

        res.json({ success: true, deleted: r.rowCount });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("DELETE /api/admin/catalog error", e);
        res.status(500).json({ error: "server_error" });
      } finally {
        client.release();
      }
    }
  );

  // ==============================
  // ADMIN: DELETE CAMPAIGNS (ALL / SINGLE)
  // ==============================

  router.delete(
    "/api/admin/campaigns/:campaignId",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const { campaignId } = req.params;

        await client.query("BEGIN");
        await client.query("DELETE FROM campaign_items WHERE campaign_id = $1", [campaignId]);
        const r = await client.query("DELETE FROM promo_campaigns WHERE campaign_id = $1", [campaignId]);
        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "campaign.delete", campaignId, "campaign", {});

        res.json({ success: true, deleted: r.rowCount });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("DELETE /api/admin/campaigns/:campaignId error", e);
        res.status(500).json({ error: "server_error" });
      } finally {
        client.release();
      }
    }
  );

  router.delete(
    "/api/admin/campaigns",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      const client = await pool.connect();
      try {
        const tenantId = req.query.tenant_id;
        if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

        await client.query("BEGIN");
        await client.query(
          "DELETE FROM campaign_items WHERE campaign_id IN (SELECT campaign_id FROM promo_campaigns WHERE tenant_id = $1)",
          [tenantId]
        );
        const r = await client.query("DELETE FROM promo_campaigns WHERE tenant_id = $1", [tenantId]);
        await client.query("COMMIT");

        await _auditLog(pool, req.promoAuth, "campaigns.delete_all", tenantId, "campaigns", { count: r.rowCount });

        res.json({ success: true, deleted: r.rowCount });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("DELETE /api/admin/campaigns error", e);
        res.status(500).json({ error: "server_error" });
      } finally {
        client.release();
      }
    }
  );

  // ==============================
  // IMAGE CACHE ROUTES
  // ==============================

  // GET /api/promo-items/:itemId/image — Serve cached image or redirect to URL
  router.get("/api/promo-items/:itemId/image", async (req, res) => {
    try {
      const { itemId } = req.params;
      const { rows } = await pool.query(
        "SELECT image_cached, image_cached_mime, image_url FROM promo_items WHERE promo_item_id = $1 LIMIT 1",
        [itemId]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      const item = rows[0];
      if (item.image_cached && item.image_cached_mime) {
        res.set("Content-Type", item.image_cached_mime);
        res.set("Cache-Control", "public, max-age=86400");
        res.set("X-Image-Source", "db-cache");
        return res.send(item.image_cached);
      }
      if (item.image_url) {
        res.set("X-Image-Source", "redirect");
        return res.redirect(302, item.image_url);
      }
      res.status(404).json({ error: "no_image" });
    } catch (e) {
      console.error("GET /api/promo-items/:itemId/image error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/admin/:tenantId/promo-items/:itemId/image — Upload cached image
  router.post(
    "/api/admin/:tenantId/promo-items/:itemId/image",
    requireAuth, requireRole(adminRoles),
    upload.single("image"),
    async (req, res) => {
      try {
        const { tenantId, itemId } = req.params;
        const check = await pool.query(
          "SELECT promo_item_id FROM promo_items WHERE promo_item_id = $1 AND tenant_id = $2",
          [itemId, tenantId]
        );
        if (!check.rows[0]) return res.status(404).json({ error: "not_found" });
        if (!req.file) return res.status(400).json({ error: "missing_image" });

        const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!ALLOWED.includes(req.file.mimetype)) {
          return res.status(400).json({ error: "unsupported_type", allowed: ALLOWED });
        }
        if (req.file.size > 2 * 1024 * 1024) {
          return res.status(400).json({ error: "file_too_large", max_bytes: 2097152 });
        }

        const crypto = require("crypto");
        const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

        const { rows } = await pool.query(
          `UPDATE promo_items
           SET image_cached = $3, image_cached_mime = $4,
               image_cached_at = NOW(), image_cached_hash = $5, updated_at = NOW()
           WHERE promo_item_id = $1 AND tenant_id = $2
           RETURNING promo_item_id, image_cached_mime, image_cached_at, image_cached_hash`,
          [itemId, tenantId, req.file.buffer, req.file.mimetype, hash]
        );
        res.json({ status: "ok", image_url: `/api/promo-items/${itemId}/image`, ...rows[0] });
      } catch (e) {
        console.error("POST promo-items/:itemId/image error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // DELETE /api/admin/:tenantId/promo-items/:itemId/image
  router.delete(
    "/api/admin/:tenantId/promo-items/:itemId/image",
    requireAuth, requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId, itemId } = req.params;
        await pool.query(
          `UPDATE promo_items SET image_cached = NULL, image_cached_mime = NULL,
           image_cached_at = NULL, image_cached_hash = NULL, updated_at = NOW()
           WHERE promo_item_id = $1 AND tenant_id = $2`,
          [itemId, tenantId]
        );
        res.json({ status: "ok" });
      } catch (e) {
        console.error("DELETE promo-items/:itemId/image error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // POST /api/admin/:tenantId/promo-items/cache-images — Fetch & cache all external images
  router.post(
    "/api/admin/:tenantId/promo-items/cache-images",
    requireAuth, requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const force = req.body?.force === true;

        const condition = force
          ? "image_url IS NOT NULL AND image_url != ''"
          : "image_url IS NOT NULL AND image_url != '' AND image_cached IS NULL";

        const { rows: items } = await pool.query(
          `SELECT promo_item_id, image_url, image_cached_hash
           FROM promo_items WHERE tenant_id = $1 AND ${condition}`,
          [tenantId]
        );

        const crypto = require("crypto");
        const results = [];

        for (const item of items) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const resp = await fetch(item.image_url, {
              signal: controller.signal,
              headers: { "User-Agent": "ADA-ImageCache/1.0" },
            });
            clearTimeout(timeout);

            if (!resp.ok) {
              results.push({ id: item.promo_item_id, status: "error", code: resp.status });
              continue;
            }
            const ct = (resp.headers.get("content-type") || "").split(";")[0].trim();
            if (!ct.startsWith("image/")) {
              results.push({ id: item.promo_item_id, status: "not_image", contentType: ct });
              continue;
            }
            const buffer = Buffer.from(await resp.arrayBuffer());
            if (buffer.length > 5 * 1024 * 1024) {
              results.push({ id: item.promo_item_id, status: "too_large", size: buffer.length });
              continue;
            }
            const hash = crypto.createHash("sha256").update(buffer).digest("hex");
            if (!force && hash === item.image_cached_hash) {
              results.push({ id: item.promo_item_id, status: "unchanged" });
              continue;
            }

            await pool.query(
              `UPDATE promo_items SET image_cached = $2, image_cached_mime = $3,
               image_cached_at = NOW(), image_cached_hash = $4, updated_at = NOW()
               WHERE promo_item_id = $1`,
              [item.promo_item_id, buffer, ct, hash]
            );
            results.push({ id: item.promo_item_id, status: "cached", mime: ct, size: buffer.length });
          } catch (fetchErr) {
            results.push({
              id: item.promo_item_id,
              status: "fetch_error",
              error: fetchErr.name === "AbortError" ? "timeout" : fetchErr.message,
            });
          }
        }

        res.json({
          total: items.length,
          cached: results.filter(r => r.status === "cached").length,
          errors: results.filter(r => !["cached","unchanged"].includes(r.status)).length,
          results,
        });
      } catch (e) {
        console.error("POST cache-images error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  return router;
}

// Helper: audit log
async function _auditLog(pool, auth, action, entityId, entityType, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (who, action, entity_id, entity_type, outcome, details, tenant_id, user_role)
       VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)`,
      [
        auth?.userId || "system",
        action,
        entityId,
        entityType,
        JSON.stringify(details || {}),
        auth?.tenantId || null,
        auth?.role || null,
      ]
    );
  } catch (e) {
    console.warn("audit log write failed:", e.message);
  }
}

module.exports = { adminRouter };
