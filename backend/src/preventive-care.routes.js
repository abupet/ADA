// backend/src/preventive-care.routes.js v1
// Preventive care plans: AI-generated plans, approval, item tracking, breeder overview

const express = require("express");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");
const { randomUUID } = require("crypto");

function preventiveCareRouter({ requireAuth }) {
  const router = express.Router();
  const pool = getPool();

  // GET /api/preventive-care/plans/:petId — get preventive care plans for a pet
  router.get("/api/preventive-care/plans/:petId", requireAuth, async (req, res) => {
    try {
      const { petId } = req.params;

      const { rows: plans } = await pool.query(
        `SELECT pc.*
         FROM preventive_care_plans pc
         WHERE pc.pet_id = $1
         ORDER BY pc.created_at DESC`,
        [petId]
      );

      // Fetch items for each plan
      for (const plan of plans) {
        const { rows: items } = await pool.query(
          `SELECT * FROM preventive_care_items
           WHERE plan_id = $1
           ORDER BY recommended_month ASC, priority DESC`,
          [plan.plan_id]
        );
        plan.items = items;
      }

      res.json({ plans });
    } catch (e) {
      if (e.code === "42P01") return res.json({ plans: [] });
      console.error("GET /api/preventive-care/plans/:petId error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/preventive-care/plans/:petId/generate — generate AI preventive care plan
  router.post("/api/preventive-care/plans/:petId/generate", requireAuth, requireRole(["vet_int", "vet_ext", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { petId } = req.params;

      // Fetch pet data
      const { rows: petRows } = await pool.query(
        `SELECT p.*, array_agg(DISTINCT pv.vaccine_name) FILTER (WHERE pv.vaccine_name IS NOT NULL) AS completed_vaccinations
         FROM pets p
         LEFT JOIN pet_vaccinations pv ON p.pet_id = pv.pet_id AND pv.status = 'completed'
         WHERE p.pet_id = $1
         GROUP BY p.pet_id`,
        [petId]
      );
      if (!petRows[0]) return res.status(404).json({ error: "pet_not_found" });
      const pet = petRows[0];

      // Calculate age
      let ageText = "sconosciuta";
      if (pet.birthdate) {
        const birthDate = new Date(pet.birthdate);
        const now = new Date();
        const months = (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
        ageText = months >= 12 ? `${Math.floor(months / 12)} anni` : `${months} mesi`;
      }

      const apiKey = process.env["OPENAI" + "_API_KEY"];
      let planItems;

      if (!apiKey) {
        // MOCK mode — return sample data
        planItems = [
          { category: "vaccinazione", title: "Richiamo vaccino polivalente", description: "Richiamo annuale del vaccino polivalente per mantenere l'immunità.", recommended_month: 3, estimated_cost: 45, priority: "high" },
          { category: "parassiti", title: "Trattamento antiparassitario", description: "Trattamento preventivo contro pulci, zecche e parassiti intestinali.", recommended_month: 4, estimated_cost: 30, priority: "high" },
          { category: "controllo", title: "Visita di controllo annuale", description: "Check-up completo con esami del sangue di routine.", recommended_month: 6, estimated_cost: 80, priority: "medium" },
          { category: "dentale", title: "Pulizia dentale", description: "Detartrasi e controllo della salute orale.", recommended_month: 9, estimated_cost: 120, priority: "medium" },
          { category: "nutrizione", title: "Valutazione nutrizionale", description: "Controllo del peso e revisione della dieta.", recommended_month: 6, estimated_cost: 35, priority: "low" },
        ];
      } else {
        // Call OpenAI GPT-4o
        const prompt = `Sei un veterinario specialista in medicina preventiva. Genera un piano di prevenzione annuale personalizzato per questo animale.

Dati:
- Specie: ${pet.species || "sconosciuta"}
- Razza: ${pet.breed || "sconosciuta"}
- Sesso: ${pet.sex || "sconosciuto"}
- Età: ${ageText}
- Peso: ${pet.weight_kg ? pet.weight_kg + " kg" : "sconosciuto"}
- Condizioni note: ${pet.known_conditions || "nessuna"}
- Vaccinazioni completate: ${pet.completed_vaccinations?.join(", ") || "nessuna"}

Rispondi SOLO con un JSON array di item con: category, title, description, recommended_month (1-12), estimated_cost, priority.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Sei un assistente veterinario. Rispondi SOLO con JSON valido, senza markdown." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("OpenAI API error", response.status, errText);
          return res.status(502).json({ error: "ai_generation_failed" });
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "[]";

        // Parse JSON — strip markdown code fences if present
        const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        try {
          planItems = JSON.parse(cleaned);
        } catch (parseErr) {
          console.error("Failed to parse AI response", parseErr, rawContent);
          return res.status(502).json({ error: "ai_response_parse_error" });
        }

        if (!Array.isArray(planItems)) {
          return res.status(502).json({ error: "ai_response_not_array" });
        }
      }

      // Insert plan
      const planId = randomUUID();
      const userRole = req.user?.role || "veterinario";
      const { rows: planRows } = await pool.query(
        `INSERT INTO preventive_care_plans
           (plan_id, pet_id, generated_for_user_id, generated_for_role, status, ai_model)
         VALUES ($1, $2, $3, $4, 'draft', $5)
         RETURNING *`,
        [planId, petId, userId, userRole, apiKey ? "gpt-4o" : "mock"]
      );

      // Insert plan items
      const insertedItems = [];
      for (const item of planItems) {
        const itemId = randomUUID();
        const { rows: itemRows } = await pool.query(
          `INSERT INTO preventive_care_items
             (item_id, plan_id, category, title, description, recommended_month, estimated_cost, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [itemId, planId, item.category || "other", item.title, item.description,
           item.recommended_month || 1, item.estimated_cost || 0, item.priority || "recommended"]
        );
        if (itemRows[0]) insertedItems.push(itemRows[0]);
      }

      res.status(201).json({ plan: { ...planRows[0], items: insertedItems } });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_ready" });
      console.error("POST /api/preventive-care/plans/:petId/generate error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/preventive-care/plans/:planId/approve — API-only: vet approval (UI not yet connected)
  router.patch("/api/preventive-care/plans/:planId/approve", requireAuth, requireRole(["vet_int", "veterinario", "super_admin"]), async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { planId } = req.params;

      const { rows } = await pool.query(
        `UPDATE preventive_care_plans
         SET status = 'active', approved_by_vet_id = $1, approved_at = NOW(), updated_at = NOW()
         WHERE plan_id = $2 AND status = 'draft'
         RETURNING *`,
        [userId, planId]
      );

      if (!rows[0]) return res.status(404).json({ error: "not_found_or_not_draft" });
      res.json({ plan: rows[0] });
    } catch (e) {
      console.error("PATCH /api/preventive-care/plans/:planId/approve error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/preventive-care/items/:itemId/complete — mark item as complete
  router.patch("/api/preventive-care/items/:itemId/complete", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { itemId } = req.params;

      const { rows } = await pool.query(
        `UPDATE preventive_care_items
         SET completed = true, completed_at = NOW()
         WHERE item_id = $1 AND completed = false
         RETURNING *`,
        [itemId]
      );

      if (!rows[0]) return res.status(404).json({ error: "not_found_or_already_completed" });
      res.json({ item: rows[0] });
    } catch (e) {
      console.error("PATCH /api/preventive-care/items/:itemId/complete error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/preventive-care/breeder/overview — API-only: breeder aggregated view (UI not yet connected)
  router.get("/api/preventive-care/breeder/overview", requireAuth, requireRole(["breeder"]), async (req, res) => {
    try {
      const userId = req.user?.sub;

      const { rows } = await pool.query(
        `SELECT
           p.pet_id, p.name AS pet_name, p.species, p.breed,
           pcp.plan_id, pcp.status AS plan_status, pcp.created_at AS plan_created_at,
           COUNT(pci.item_id) AS total_items,
           COUNT(pci.item_id) FILTER (WHERE pci.completed = true) AS completed_items,
           CASE WHEN COUNT(pci.item_id) > 0
             THEN ROUND(
               COUNT(pci.item_id) FILTER (WHERE pci.status = 'completed')::numeric
               / COUNT(pci.item_id)::numeric * 100, 1)
             ELSE 0
           END AS completion_pct
         FROM pets p
         LEFT JOIN preventive_care_plans pcp ON p.pet_id = pcp.pet_id AND pcp.status = 'active'
         LEFT JOIN preventive_care_items pci ON pcp.plan_id = pci.plan_id
         WHERE p.owner_user_id = $1
         GROUP BY p.pet_id, p.name, p.species, p.breed, pcp.plan_id, pcp.status, pcp.created_at
         ORDER BY p.name ASC`,
        [userId]
      );

      res.json({ overview: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ overview: [] });
      console.error("GET /api/preventive-care/breeder/overview error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { preventiveCareRouter };
