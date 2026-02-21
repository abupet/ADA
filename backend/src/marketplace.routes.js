// backend/src/marketplace.routes.js v1
// Marketplace: products, orders, order items, subscriptions

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function marketplaceRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/marketplace/products — list enabled products
  router.get("/api/marketplace/products", requireAuth, async (req, res) => {
    try {
      const { category } = req.query;
      let query = `SELECT * FROM marketplace_products WHERE enabled = true`;
      const params = [];

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      query += ` ORDER BY name ASC`;

      const { rows } = await pool.query(query, params);
      res.json({ products: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ products: [] });
      console.error("GET /api/marketplace/products error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/marketplace/orders — create order
  router.post("/api/marketplace/orders", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const userRole = req.user?.role || "owner";
      const { items, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required" });
      }

      // Fetch product prices and validate
      const productIds = items.map(i => i.product_id);
      const { rows: products } = await pool.query(
        `SELECT * FROM marketplace_products WHERE product_id = ANY($1) AND enabled = true`,
        [productIds]
      );

      const productMap = {};
      for (const p of products) productMap[p.product_id] = p;

      // Validate all items have valid products
      for (const item of items) {
        if (!productMap[item.product_id]) {
          return res.status(400).json({ error: `product_not_found: ${item.product_id}` });
        }
      }

      // Calculate totals
      let totalAmount = 0;
      const orderItems = items.map(item => {
        const product = productMap[item.product_id];
        const qty = item.quantity || 1;
        // Use role-specific pricing if available
        let unitPrice = product.price;
        if (userRole === "breeder" && product.price_breeder) unitPrice = product.price_breeder;
        if (userRole === "vet_ext" && product.price_vet_ext) unitPrice = product.price_vet_ext;

        const itemTotal = parseFloat(unitPrice) * qty;
        totalAmount += itemTotal;

        return {
          product_id: item.product_id,
          quantity: qty,
          unit_price: unitPrice,
          total_price: itemTotal,
          pet_id: item.pet_id || null,
        };
      });

      // Create order
      const orderId = randomUUID();
      const { rows: orderRows } = await pool.query(
        `INSERT INTO marketplace_orders
           (order_id, user_id, user_role, status, total_amount, final_amount, notes)
         VALUES ($1, $2, $3, 'pending', $4, $4, $5)
         RETURNING *`,
        [orderId, userId, userRole, totalAmount, notes || null]
      );

      // Insert order items
      const insertedItems = [];
      for (const oi of orderItems) {
        const { rows: itemRows } = await pool.query(
          `INSERT INTO marketplace_order_items
             (order_id, product_id, quantity, unit_price, total_price, pet_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [orderId, oi.product_id, oi.quantity, oi.unit_price, oi.total_price, oi.pet_id]
        );
        if (itemRows[0]) insertedItems.push(itemRows[0]);
      }

      res.status(201).json({ order: { ...orderRows[0], items: insertedItems } });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/marketplace/orders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/marketplace/orders — my orders
  router.get("/api/marketplace/orders", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT * FROM marketplace_orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ orders: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ orders: [] });
      console.error("GET /api/marketplace/orders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/marketplace/orders/:orderId — order detail
  router.get("/api/marketplace/orders/:orderId", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { orderId } = req.params;

      const { rows: orderRows } = await pool.query(
        `SELECT * FROM marketplace_orders WHERE order_id = $1 AND user_id = $2`,
        [orderId, userId]
      );

      if (!orderRows[0]) return res.status(404).json({ error: "order_not_found" });

      const { rows: itemRows } = await pool.query(
        `SELECT moi.*, mp.name AS product_name, mp.category AS product_category
         FROM marketplace_order_items moi
         JOIN marketplace_products mp ON moi.product_id = mp.product_id
         WHERE moi.order_id = $1
         ORDER BY moi.created_at ASC`,
        [orderId]
      );

      res.json({ order: { ...orderRows[0], items: itemRows } });
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "order_not_found" });
      console.error("GET /api/marketplace/orders/:orderId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/marketplace/subscriptions — my subscriptions
  router.get("/api/marketplace/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT ms.*, mp.name AS product_name, mp.category AS product_category,
                mp.recurring_interval
         FROM marketplace_subscriptions ms
         JOIN marketplace_products mp ON ms.product_id = mp.product_id
         WHERE ms.user_id = $1
         ORDER BY ms.created_at DESC
         LIMIT 100`,
        [userId]
      );

      res.json({ subscriptions: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ subscriptions: [] });
      console.error("GET /api/marketplace/subscriptions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/marketplace/admin/orders — all orders (admin)
  router.get("/api/marketplace/admin/orders", requireAuth, requireRole(["super_admin"]), async (req, res) => {
    try {
      const { status } = req.query;
      let query = `SELECT mo.*, u.display_name AS user_display_name
                    FROM marketplace_orders mo
                    LEFT JOIN users u ON mo.user_id = u.user_id`;
      const params = [];

      if (status) {
        params.push(status);
        query += ` WHERE mo.status = $${params.length}`;
      }

      query += ` ORDER BY mo.created_at DESC LIMIT 500`;

      const { rows } = await pool.query(query, params);
      res.json({ orders: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ orders: [] });
      console.error("GET /api/marketplace/admin/orders error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { marketplaceRouter };
