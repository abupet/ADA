// backend/src/education.routes.js v1
// Continuing education: courses, enrollments, ECM credits

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

function educationRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/education/courses — list published courses
  router.get("/api/education/courses", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.*, u.display_name AS instructor_name
         FROM education_courses c
         LEFT JOIN users u ON c.instructor_user_id = u.user_id
         WHERE c.status IN ('published', 'live')
         ORDER BY c.scheduled_at DESC NULLS LAST, c.created_at DESC`
      );

      res.json({ courses: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ courses: [] });
      console.error("GET /api/education/courses error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/education/courses — create course (admin only)
  router.post("/api/education/courses", requireAuth, requireRole(["super_admin"]), async (req, res) => {
    try {
      const {
        title, description, instructor_user_id, specialty,
        course_type, duration_minutes, ecm_credits,
        max_participants, scheduled_at, recording_url,
        materials_url, thumbnail_url, available_for, price,
      } = req.body;

      if (!title) return res.status(400).json({ error: "title is required" });

      const { rows } = await pool.query(
        `INSERT INTO education_courses
           (title, description, instructor_user_id, specialty,
            course_type, duration_minutes, ecm_credits,
            max_participants, scheduled_at, recording_url,
            materials_url, thumbnail_url, available_for, price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
         RETURNING *`,
        [
          title, description || null, instructor_user_id || null, specialty || null,
          course_type || "webinar", duration_minutes || null, ecm_credits || 0,
          max_participants || null, scheduled_at || null, recording_url || null,
          materials_url || null, thumbnail_url || null,
          JSON.stringify(available_for || ["vet_ext"]), price || 0,
        ]
      );

      res.status(201).json({ course: rows[0] });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/education/courses error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/education/courses/:courseId/enroll — enroll in a course
  router.post("/api/education/courses/:courseId/enroll", requireAuth, requireRole(["vet_ext", "vet_int", "veterinario"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { courseId } = req.params;

      // Verify course exists and is published
      const { rows: courseRows } = await pool.query(
        `SELECT * FROM education_courses WHERE course_id = $1 AND status IN ('published', 'live')`,
        [courseId]
      );
      if (!courseRows[0]) return res.status(404).json({ error: "course_not_found" });

      const course = courseRows[0];

      // Check max participants
      if (course.max_participants) {
        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*) AS cnt FROM education_enrollments
           WHERE course_id = $1 AND status NOT IN ('cancelled')`,
          [courseId]
        );
        if (parseInt(countRows[0].cnt) >= course.max_participants) {
          return res.status(409).json({ error: "course_full" });
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO education_enrollments (course_id, user_id, status)
         VALUES ($1, $2, 'enrolled')
         ON CONFLICT (course_id, user_id) DO UPDATE SET status = 'enrolled', created_at = NOW()
         RETURNING *`,
        [courseId, userId]
      );

      res.status(201).json({ enrollment: rows[0] });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/education/courses/:courseId/enroll error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/education/enrollments — my enrollments
  router.get("/api/education/enrollments", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT ee.*, ec.title, ec.course_type, ec.scheduled_at,
                ec.ecm_credits, ec.duration_minutes, ec.thumbnail_url
         FROM education_enrollments ee
         JOIN education_courses ec ON ee.course_id = ec.course_id
         WHERE ee.user_id = $1
         ORDER BY ee.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ enrollments: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ enrollments: [] });
      console.error("GET /api/education/enrollments error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/education/ecm/credits — my ECM credits
  router.get("/api/education/ecm/credits", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT ec.*, edu.title AS course_title
         FROM ecm_credits ec
         LEFT JOIN education_courses edu ON ec.course_id = edu.course_id
         WHERE ec.user_id = $1
         ORDER BY ec.year DESC, ec.created_at DESC
         LIMIT 200`,
        [userId]
      );

      res.json({ credits: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ credits: [] });
      console.error("GET /api/education/ecm/credits error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/education/ecm/summary — annual ECM summary
  router.get("/api/education/ecm/summary", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           year,
           COALESCE(SUM(credits), 0) AS total_credits,
           COUNT(*) AS courses_completed
         FROM ecm_credits
         WHERE user_id = $1
         GROUP BY year
         ORDER BY year DESC`,
        [userId]
      );

      res.json({ summary: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ summary: [] });
      console.error("GET /api/education/ecm/summary error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { educationRouter };
