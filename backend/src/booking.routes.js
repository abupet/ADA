// backend/src/booking.routes.js v1
// B2B Phase 1: Online booking system

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function bookingRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/booking/services — catalogo (filtrato per ruolo)
  router.get("/api/booking/services", requireAuth, async (req, res) => {
    try {
      const role = req.user?.role || "owner";
      const { category, specialty } = req.query;
      let query = "SELECT * FROM bookable_services WHERE status = 'active'";
      const params = [];
      if (category) { params.push(category); query += ` AND category = $${params.length}`; }
      if (specialty) { params.push(specialty); query += ` AND specialty = $${params.length}`; }
      query += " ORDER BY category, name";
      const { rows } = await pool.query(query, params);

      const effectiveRole = (role === "vet_int" || role === "vet") ? "vet_ext" : role;
      const filtered = rows.filter(s => {
        const af = Array.isArray(s.available_for) ? s.available_for : (typeof s.available_for === "string" ? JSON.parse(s.available_for) : ["owner"]);
        return af.includes(effectiveRole) || role === "super_admin";
      });
      for (const s of filtered) { s.display_price = (role === "breeder" && s.price_breeder != null) ? s.price_breeder : s.price; }
      res.json({ services: filtered });
    } catch (e) {
      console.error("GET /api/booking/services error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/booking/slots
  router.get("/api/booking/slots", requireAuth, async (req, res) => {
    try {
      const { service_id, date_from, date_to } = req.query;
      if (!service_id) return res.status(400).json({ error: "service_id_required" });
      const from = date_from || new Date().toISOString().slice(0, 10);
      const to = date_to || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { rows } = await pool.query(
        `SELECT s.*, u.display_name AS vet_name FROM availability_slots s
         LEFT JOIN users u ON s.vet_user_id = u.user_id
         WHERE s.service_id = $1 AND s.slot_date BETWEEN $2 AND $3 AND s.status = 'available'
         ORDER BY s.slot_date, s.start_time`, [service_id, from, to]);
      res.json({ slots: rows });
    } catch (e) {
      console.error("GET /api/booking/slots error", e);
      res.status(500).json({ error: "server_error" });
    }
  });
  // POST /api/booking/appointments — prenota
  router.post("/api/booking/appointments", requireAuth, requireRole(["owner", "breeder", "vet_ext", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub; const role = req.user?.role || "owner";
      const { slot_id, service_id, pet_id, notes, referral_id } = req.body;
      if (!service_id || !pet_id) return res.status(400).json({ error: "service_id_and_pet_id_required" });

      const svcRes = await pool.query("SELECT * FROM bookable_services WHERE service_id = $1 AND status = 'active'", [service_id]);
      if (!svcRes.rows[0]) return res.status(404).json({ error: "service_not_found" });
      const svc = svcRes.rows[0];
      if (svc.requires_referral && !referral_id && role !== "super_admin") return res.status(400).json({ error: "referral_required" });

      const petRes = await pool.query("SELECT * FROM pets WHERE pet_id = $1", [pet_id]);
      if (!petRes.rows[0]) return res.status(404).json({ error: "pet_not_found" });

      let appointmentDate, appointmentTime, vetUserId;
      if (slot_id) {
        const slotRes = await pool.query("SELECT * FROM availability_slots WHERE slot_id = $1 AND status = 'available' FOR UPDATE", [slot_id]);
        if (!slotRes.rows[0]) return res.status(400).json({ error: "slot_not_available" });
        const slot = slotRes.rows[0];
        appointmentDate = slot.slot_date; appointmentTime = slot.start_time; vetUserId = slot.vet_user_id;
        await pool.query(
          "UPDATE availability_slots SET current_bookings = current_bookings + 1, status = CASE WHEN current_bookings + 1 >= max_bookings THEN 'full' ELSE 'available' END WHERE slot_id = $1", [slot_id]);
      } else {
        appointmentDate = req.body.appointment_date; appointmentTime = req.body.appointment_time;
        if (!appointmentDate || !appointmentTime) return res.status(400).json({ error: "slot_id_or_date_time_required" });
      }

      const price = (role === "breeder" && svc.price_breeder != null) ? svc.price_breeder : svc.price;
      const apptId = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO appointments (appointment_id, slot_id, service_id, pet_id, booked_by, booked_by_role, owner_user_id, vet_user_id, referral_id, appointment_date, appointment_time, duration_minutes, price, notes, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [apptId, slot_id || null, service_id, pet_id, userId, role, petRes.rows[0].owner_user_id, vetUserId || null, referral_id || null, appointmentDate, appointmentTime, svc.duration_minutes, price, notes || null, svc.tenant_id || null]);

      if (referral_id) {
        await pool.query("UPDATE referrals SET status = 'scheduled', scheduled_at = NOW(), appointment_date = $1, updated_at = NOW() WHERE referral_id = $2 AND status IN ('submitted','accepted')",
          [appointmentDate + "T" + appointmentTime, referral_id]).catch(() => {});
      }
      res.status(201).json({ appointment: rows[0] });
    } catch (e) {
      console.error("POST /api/booking/appointments error", e);
      res.status(500).json({ error: "server_error" });
    }
  });
  // GET /api/booking/appointments — lista
  router.get("/api/booking/appointments", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub; const role = req.user?.role || "owner";
      const { status } = req.query;
      let query = `SELECT a.*, bs.name AS service_name, bs.category, p.name AS pet_name, p.species, p.breed,
        u_vet.display_name AS vet_name FROM appointments a
        JOIN bookable_services bs ON a.service_id = bs.service_id JOIN pets p ON a.pet_id = p.pet_id
        LEFT JOIN users u_vet ON a.vet_user_id = u_vet.user_id WHERE 1=1`;
      const params = [];
      if (role === "vet_int" || role === "vet") { params.push(userId); query += ` AND a.vet_user_id = $${params.length}`; }
      else if (role !== "super_admin") { params.push(userId); query += ` AND a.booked_by = $${params.length}`; }
      if (status) { params.push(status); query += ` AND a.status = $${params.length}`; }
      query += " ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 100";
      const { rows } = await pool.query(query, params);
      res.json({ appointments: rows });
    } catch (e) {
      console.error("GET /api/booking/appointments error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH cancel
  router.patch("/api/booking/appointments/:appointmentId/cancel", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { appointmentId } = req.params;
      const { rows } = await pool.query(
        "UPDATE appointments SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW() WHERE appointment_id = $2 AND booked_by = $3 AND status IN ('pending','confirmed') RETURNING *",
        [req.body.reason || null, appointmentId, userId]);
      if (!rows[0]) return res.status(404).json({ error: "not_found_or_not_cancellable" });
      if (rows[0].slot_id) {
        await pool.query("UPDATE availability_slots SET current_bookings = GREATEST(current_bookings - 1, 0), status = 'available' WHERE slot_id = $1", [rows[0].slot_id]).catch(() => {});
      }
      res.json({ appointment: rows[0] });
    } catch (e) {
      console.error("PATCH cancel error", e);
      res.status(500).json({ error: "server_error" });
    }
  });
  // POST /api/booking/bulk — breeder bulk booking
  router.post("/api/booking/bulk", requireAuth, requireRole(["breeder", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { service_id, pet_ids, appointment_date, appointment_time, notes } = req.body;
      if (!service_id || !Array.isArray(pet_ids) || !pet_ids.length) return res.status(400).json({ error: "service_id_and_pet_ids_required" });

      const svcRes = await pool.query("SELECT * FROM bookable_services WHERE service_id = $1 AND status = 'active'", [service_id]);
      if (!svcRes.rows[0]) return res.status(404).json({ error: "service_not_found" });
      const svc = svcRes.rows[0];
      const price = svc.price_breeder || svc.price;
      const bulkId = randomUUID(); const apptIds = []; const created = [];

      for (const petId of pet_ids) {
        const apptId = randomUUID(); apptIds.push(apptId);
        try {
          const { rows } = await pool.query(
            `INSERT INTO appointments (appointment_id, service_id, pet_id, booked_by, booked_by_role, owner_user_id, appointment_date, appointment_time, duration_minutes, price, notes, tenant_id, status)
             VALUES ($1,$2,$3,$4,'breeder',$4,$5,$6,$7,$8,$9,$10,'confirmed') RETURNING *`,
            [apptId, service_id, petId, userId, appointment_date, appointment_time, svc.duration_minutes, price, notes || null, svc.tenant_id || null]);
          if (rows[0]) created.push(rows[0]);
        } catch (e) { console.error("Bulk fail for pet", petId, e.message); }
      }

      const totalPrice = created.length * parseFloat(price || 0);
      await pool.query(
        "INSERT INTO bulk_bookings (bulk_id, breeder_user_id, service_id, pet_ids, appointment_ids, status, total_pets, total_price) VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7)",
        [bulkId, userId, service_id, JSON.stringify(pet_ids), JSON.stringify(apptIds), created.length, totalPrice]);
      res.status(201).json({ bulk_id: bulkId, appointments: created, total_price: totalPrice });
    } catch (e) {
      console.error("POST /api/booking/bulk error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/booking/admin/slots — vet_int crea slot
  router.post("/api/booking/admin/slots", requireAuth, requireRole(["vet_int", "vet", "super_admin"]), async (req, res) => {
    try {
      const { service_id, slot_date, start_time, end_time, max_bookings, vet_user_id } = req.body;
      if (!service_id || !slot_date || !start_time || !end_time) return res.status(400).json({ error: "missing_fields" });
      const { rows } = await pool.query(
        `INSERT INTO availability_slots (slot_id, service_id, vet_user_id, slot_date, start_time, end_time, max_bookings, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [randomUUID(), service_id, vet_user_id || req.user?.sub, slot_date, start_time, end_time, max_bookings || 1, req.user?.tenantId || null]);
      res.status(201).json({ slot: rows[0] });
    } catch (e) {
      console.error("POST /api/booking/admin/slots error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { bookingRouter };
