// backend/src/dashboard.routes.js v1
// PR 4: Dashboard reports and CSV wizard

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

function dashboardRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  const adminRoles = ["admin_brand", "super_admin"];

  // ==============================
  // DASHBOARD ANALYTICS
  // ==============================

  // GET /api/admin/:tenantId/dashboard
  router.get(
    "/api/admin/:tenantId/dashboard",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const period = req.query.period || "30d"; // 7d, 30d, 90d
        const intervalDays = { "7d": 7, "30d": 30, "90d": 90 }[period] || 30;

        // Aggregate event stats
        const stats = {};

        // Total impressions
        const impressionResult = await pool.query(
          `SELECT COUNT(*) as total FROM promo_events
           WHERE tenant_id = $1 AND event_type = 'impression'
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
          [tenantId, String(intervalDays)]
        );
        stats.impressions = parseInt(impressionResult.rows[0]?.total || 0);

        // Total clicks (cta_click + info_click)
        const clickResult = await pool.query(
          `SELECT COUNT(*) as total FROM promo_events
           WHERE tenant_id = $1 AND event_type IN ('cta_click', 'info_click')
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
          [tenantId, String(intervalDays)]
        );
        stats.clicks = parseInt(clickResult.rows[0]?.total || 0);

        // CTR
        stats.ctr =
          stats.impressions > 0
            ? Math.round((stats.clicks / stats.impressions) * 10000) / 100
            : 0;

        // Dismissals
        const dismissResult = await pool.query(
          `SELECT COUNT(*) as total FROM promo_events
           WHERE tenant_id = $1 AND event_type = 'dismissed'
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
          [tenantId, String(intervalDays)]
        );
        stats.dismissals = parseInt(dismissResult.rows[0]?.total || 0);

        // Active campaigns
        const campaignResult = await pool.query(
          `SELECT COUNT(*) as total FROM promo_campaigns
           WHERE tenant_id = $1 AND status = 'active'`,
          [tenantId]
        );
        stats.active_campaigns = parseInt(campaignResult.rows[0]?.total || 0);

        // Published items
        const itemResult = await pool.query(
          `SELECT COUNT(*) as total FROM promo_items
           WHERE tenant_id = $1 AND status = 'published'`,
          [tenantId]
        );
        stats.published_items = parseInt(itemResult.rows[0]?.total || 0);

        // Vet flags count
        const flagResult = await pool.query(
          `SELECT COUNT(*) as total FROM vet_flags vf
           JOIN promo_items pi ON vf.promo_item_id = pi.promo_item_id
           WHERE pi.tenant_id = $1 AND vf.status = 'active'`  ,
          [tenantId]
        );
        stats.active_vet_flags = parseInt(flagResult.rows[0]?.total || 0);

        // Top items by impressions
        const topItemsResult = await pool.query(
          `SELECT pe.promo_item_id, pi.name, pe.event_type, COUNT(*) as cnt
           FROM promo_events pe
           JOIN promo_items pi ON pe.promo_item_id = pi.promo_item_id
           WHERE pi.tenant_id = $1
           AND pe.created_at >= NOW() - ($2 || ' days')::INTERVAL
           GROUP BY pe.promo_item_id, pi.name, pe.event_type
           ORDER BY cnt DESC LIMIT 20`,
          [tenantId, String(intervalDays)]
        );

        // Pivot top items into impressions/clicks per item
        const itemMap = {};
        for (const row of topItemsResult.rows) {
          if (!itemMap[row.promo_item_id]) {
            itemMap[row.promo_item_id] = {
              promo_item_id: row.promo_item_id,
              name: row.name,
              impressions: 0,
              clicks: 0,
              dismissals: 0,
            };
          }
          if (row.event_type === "impression")
            itemMap[row.promo_item_id].impressions = parseInt(row.cnt);
          if (
            row.event_type === "cta_click" ||
            row.event_type === "info_click"
          )
            itemMap[row.promo_item_id].clicks += parseInt(row.cnt);
          if (row.event_type === "dismissed")
            itemMap[row.promo_item_id].dismissals = parseInt(row.cnt);
        }

        stats.top_items = Object.values(itemMap)
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 10);

        // Daily trends (last N days)
        const trendResult = await pool.query(
          `SELECT DATE(created_at) as day, event_type, COUNT(*) as cnt
           FROM promo_events
           WHERE tenant_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
           GROUP BY DATE(created_at), event_type
           ORDER BY day`,
          [tenantId, String(intervalDays)]
        );

        stats.daily_trends = trendResult.rows.map((r) => ({
          day: r.day,
          event_type: r.event_type,
          count: parseInt(r.cnt),
        }));

        // Budget status
        try {
          const budgetResult = await pool.query(
            "SELECT monthly_limit, current_usage, alert_threshold FROM tenant_budgets WHERE tenant_id = $1 LIMIT 1",
            [tenantId]
          );
          if (budgetResult.rows[0]) {
            stats.budget = budgetResult.rows[0];
          }
        } catch (_e) {
          // skip
        }

        res.json({ period, stats });
      } catch (e) {
        console.error("GET /api/admin/:tenantId/dashboard error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // CSV EXPORT
  // ==============================

  // GET /api/admin/:tenantId/export/events?format=csv&period=30d
  router.get(
    "/api/admin/:tenantId/export/events",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const period = req.query.period || "30d";
        const intervalDays = { "7d": 7, "30d": 30, "90d": 90 }[period] || 30;

        const { rows } = await pool.query(
          `SELECT pe.event_id, pe.owner_user_id, pe.pet_id, pe.promo_item_id,
                  pi.name as item_name, pe.event_type, pe.context, pe.created_at
           FROM promo_events pe
           LEFT JOIN promo_items pi ON pe.promo_item_id = pi.promo_item_id
           WHERE pe.tenant_id = $1
           AND pe.created_at >= NOW() - ($2 || ' days')::INTERVAL
           ORDER BY pe.created_at DESC
           LIMIT 10000`,
          [tenantId, String(intervalDays)]
        );

        // CSV format
        const headers = [
          "event_id",
          "owner_user_id",
          "pet_id",
          "promo_item_id",
          "item_name",
          "event_type",
          "context",
          "created_at",
        ];

        const csvLines = [headers.join(",")];
        for (const row of rows) {
          const line = headers
            .map((h) => {
              const val = row[h];
              if (val === null || val === undefined) return "";
              const str = String(val);
              // Escape CSV values
              if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return '"' + str.replace(/"/g, '""') + '"';
              }
              return str;
            })
            .join(",");
          csvLines.push(line);
        }

        const csv = csvLines.join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="promo_events_${tenantId}_${period}.csv"`
        );
        res.send(csv);
      } catch (e) {
        console.error("GET /api/admin/:tenantId/export/events error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // CSV IMPORT WIZARD
  // ==============================

  // POST /api/admin/:tenantId/import/promo-items
  // Accepts JSON body with { items: [ { name, category, species, ... }, ... ] }
  // (frontend parses CSV -> JSON before sending)
  router.post(
    "/api/admin/:tenantId/import/promo-items",
    requireAuth,
    requireRole(adminRoles),
    async (req, res) => {
      try {
        const { tenantId } = req.params;
        const { items, dry_run } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "items_array_required" });
        }

        if (items.length > 500) {
          return res
            .status(400)
            .json({ error: "max_500_items_per_import" });
        }

        const results = { imported: 0, skipped: 0, errors: [] };
        const { randomUUID } = require("crypto");

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const rowNum = i + 1;

          // Validate required fields
          if (!item.name || !item.category) {
            results.errors.push({
              row: rowNum,
              error: "missing_name_or_category",
            });
            results.skipped++;
            continue;
          }

          // Valid categories
          const validCategories = [
            "food_general",
            "food_clinical",
            "supplement",
            "antiparasitic",
            "accessory",
            "service",
          ];
          if (!validCategories.includes(item.category)) {
            results.errors.push({
              row: rowNum,
              error: "invalid_category: " + item.category,
              valid: validCategories,
            });
            results.skipped++;
            continue;
          }

          if (dry_run) {
            results.imported++;
            continue;
          }

          try {
            const itemId = "pi_" + randomUUID();
            const species = Array.isArray(item.species)
              ? item.species
              : item.species
                ? [item.species]
                : [];
            const lifecycleTarget = Array.isArray(item.lifecycle_target)
              ? item.lifecycle_target
              : item.lifecycle_target
                ? [item.lifecycle_target]
                : [];
            const tagsInclude = Array.isArray(item.tags_include)
              ? item.tags_include
              : item.tags_include
                ? item.tags_include.split(",").map((t) => t.trim())
                : [];
            const tagsExclude = Array.isArray(item.tags_exclude)
              ? item.tags_exclude
              : item.tags_exclude
                ? item.tags_exclude.split(",").map((t) => t.trim())
                : [];

            await pool.query(
              `INSERT INTO promo_items
                (promo_item_id, tenant_id, name, category, species, lifecycle_target,
                 description, image_url, product_url, tags_include, tags_exclude,
                 priority, status, version)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',1)`,
              [
                itemId,
                tenantId,
                item.name,
                item.category,
                species,
                lifecycleTarget,
                item.description || null,
                item.image_url || null,
                item.product_url || null,
                tagsInclude,
                tagsExclude,
                parseInt(item.priority) || 0,
              ]
            );

            // Version snapshot
            await pool.query(
              `INSERT INTO promo_item_versions (promo_item_id, version, snapshot, status, changed_by)
               VALUES ($1, 1, $2, 'draft', $3)`,
              [itemId, JSON.stringify({ name: item.name, category: item.category }), req.promoAuth?.userId]
            );

            results.imported++;
          } catch (insertErr) {
            results.errors.push({
              row: rowNum,
              error: insertErr.message,
            });
            results.skipped++;
          }
        }

        res.json(results);
      } catch (e) {
        console.error(
          "POST /api/admin/:tenantId/import/promo-items error",
          e
        );
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // SUPER ADMIN: TAG DICTIONARY MANAGEMENT
  // ==============================

  // GET /api/superadmin/tags
  router.get(
    "/api/superadmin/tags",
    requireAuth,
    requireRole(["super_admin"]),
    async (_req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM tag_dictionary ORDER BY category, tag"
        );
        res.json({ tags: rows });
      } catch (e) {
        console.error("GET /api/superadmin/tags error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // POST /api/superadmin/tags
  router.post(
    "/api/superadmin/tags",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const { tag, label, category, sensitivity, derivation_rule, description } =
          req.body || {};
        if (!tag || !label || !category) {
          return res.status(400).json({ error: "tag_label_category_required" });
        }

        const { rows } = await pool.query(
          `INSERT INTO tag_dictionary (tag, label, category, sensitivity, derivation_rule, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tag) DO UPDATE SET
             label = $2, category = $3, sensitivity = $4,
             derivation_rule = $5, description = $6, updated_at = NOW()
           RETURNING *`,
          [
            tag,
            label,
            category,
            sensitivity || "low",
            JSON.stringify(derivation_rule || {}),
            description || null,
          ]
        );

        // Version tracking
        await pool.query(
          `INSERT INTO tag_dictionary_versions (tag, action, snapshot, changed_by)
           VALUES ($1, 'updated', $2, $3)`,
          [tag, JSON.stringify(rows[0]), req.promoAuth?.userId]
        );

        res.json(rows[0]);
      } catch (e) {
        console.error("POST /api/superadmin/tags error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // SUPER ADMIN: GLOBAL POLICIES
  // ==============================

  // GET /api/superadmin/policies
  router.get(
    "/api/superadmin/policies",
    requireAuth,
    requireRole(["super_admin"]),
    async (_req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM global_policies ORDER BY policy_key"
        );
        res.json({ policies: rows });
      } catch (e) {
        console.error("GET /api/superadmin/policies error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // PUT /api/superadmin/policies/:key
  router.put(
    "/api/superadmin/policies/:key",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const { key } = req.params;
        const { value, description } = req.body || {};

        if (value === undefined) {
          return res.status(400).json({ error: "value_required" });
        }

        const { rows } = await pool.query(
          `INSERT INTO global_policies (policy_key, policy_value, description, updated_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (policy_key) DO UPDATE SET
             policy_value = $2, description = $3, updated_by = $4, updated_at = NOW()
           RETURNING *`,
          [
            key,
            JSON.stringify(value),
            description || null,
            req.promoAuth?.userId,
          ]
        );

        res.json(rows[0]);
      } catch (e) {
        console.error("PUT /api/superadmin/policies/:key error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // SUPER ADMIN: TENANTS MANAGEMENT
  // ==============================

  // GET /api/superadmin/tenants
  router.get(
    "/api/superadmin/tenants",
    requireAuth,
    requireRole(["super_admin"]),
    async (_req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM tenants ORDER BY created_at DESC"
        );
        res.json({ tenants: rows });
      } catch (e) {
        console.error("GET /api/superadmin/tenants error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // POST /api/superadmin/tenants
  router.post(
    "/api/superadmin/tenants",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const { name, slug, config: tenantConfig } = req.body || {};
        if (!name || !slug) {
          return res.status(400).json({ error: "name_and_slug_required" });
        }

        const { randomUUID } = require("crypto");
        const tenantId = "t_" + randomUUID();

        const { rows } = await pool.query(
          `INSERT INTO tenants (tenant_id, name, slug, config)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [tenantId, name, slug, JSON.stringify(tenantConfig || {})]
        );

        res.status(201).json(rows[0]);
      } catch (e) {
        if (e.code === "23505") {
          return res.status(409).json({ error: "slug_already_exists" });
        }
        console.error("POST /api/superadmin/tenants error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  // ==============================
  // SUPER ADMIN: AUDIT LOG
  // ==============================

  // GET /api/superadmin/audit
  router.get(
    "/api/superadmin/audit",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = parseInt(req.query.offset) || 0;
        const action = req.query.action || null;

        let query = "SELECT * FROM audit_log";
        const params = [];
        let idx = 1;

        if (action) {
          query += ` WHERE action LIKE $${idx}`;
          params.push(action + "%");
          idx++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
        params.push(limit, offset);

        const { rows } = await pool.query(query, params);
        res.json({ audit: rows, limit, offset });
      } catch (e) {
        console.error("GET /api/superadmin/audit error", e);
        res.status(500).json({ error: "server_error" });
      }
    }
  );

  return router;
}

module.exports = { dashboardRouter };
