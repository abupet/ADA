// backend/src/nutrition.service.js v1
// Nutrition plan generation and management

const { randomUUID } = require("crypto");

function serverLog(level, domain, message, data) {
  if (process.env.ADA_DEBUG_LOG !== "true") return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, domain, msg: message, data: data || undefined }));
}

/**
 * Build the OpenAI prompt for nutrition plan generation.
 */
function buildNutritionPrompt(pet, extraData, tags, products) {
  const petInfo = [];
  if (pet) {
    if (pet.name) petInfo.push("Nome: " + pet.name);
    if (pet.species) petInfo.push("Specie: " + pet.species);
    if (pet.breed) petInfo.push("Razza: " + pet.breed);
    if (pet.sex) petInfo.push("Sesso: " + pet.sex);
    if (pet.birth_date) petInfo.push("Data nascita: " + pet.birth_date);
  }
  if (extraData) {
    if (extraData.weightKg) petInfo.push("Peso: " + extraData.weightKg + " kg");
    if (extraData.sterilized !== undefined) petInfo.push("Sterilizzato: " + (extraData.sterilized ? "sì" : "no"));
    if (extraData.diet) petInfo.push("Dieta attuale: " + extraData.diet);
    if (extraData.activityLevel) petInfo.push("Livello attività: " + extraData.activityLevel);
  }

  const tagList = (tags || []).map(function (t) { return t.tag + (t.value ? "=" + t.value : ""); }).join(", ");

  const productList = (products || []).map(function (p) {
    return "- " + p.name + " (" + p.category + ")" + (p.description ? ": " + p.description : "");
  }).join("\n");

  const system = `Sei un nutrizionista veterinario esperto. Genera un piano nutrizionale personalizzato per il pet descritto.

REGOLE:
1) Lingua: italiano.
2) Calcola il fabbisogno calorico giornaliero in base a peso, età, specie, razza e livello di attività.
3) Suggerisci prodotti specifici dal catalogo disponibile se pertinenti.
4) Includi dosi giornaliere, frequenza pasti e note cliniche.
5) Se il pet ha condizioni cliniche (tag clinical:*), adatta il piano di conseguenza.
6) Rispondi SOLO con JSON valido nel formato richiesto.`;

  const user = `Dati pet:
${petInfo.join("\n")}

Tag clinici: ${tagList || "nessuno"}

Prodotti disponibili:
${productList || "nessun prodotto disponibile"}

Genera un piano nutrizionale in questo formato JSON:
{
  "daily_kcal": <numero>,
  "meals_per_day": <numero>,
  "products": [
    { "name": "<nome>", "daily_dose": "<dose>", "notes": "<note>" }
  ],
  "clinical_notes": "<note cliniche>",
  "restrictions": ["<restrizioni>"],
  "supplements": [
    { "name": "<nome>", "dose": "<dose>", "reason": "<motivo>" }
  ]
}`;

  return { system, user };
}

/**
 * Generate a nutrition plan for a pet.
 */
async function generateNutritionPlan(pool, petId, ownerUserId, tenantId, getOpenAiKey) {
  const planId = "np_" + randomUUID();

  try {
    // Load pet data
    const petResult = await pool.query("SELECT * FROM pets WHERE pet_id = $1 LIMIT 1", [petId]);
    const pet = petResult.rows[0] || null;

    // Load extra_data
    let extraData = {};
    if (pet && pet.extra_data) {
      extraData = typeof pet.extra_data === "string" ? JSON.parse(pet.extra_data) : pet.extra_data;
    }

    // Load tags
    const tagsResult = await pool.query("SELECT tag, value, confidence FROM pet_tags WHERE pet_id = $1", [petId]);
    const tags = tagsResult.rows;

    // Load nutrition products from ALL active tenants (cross-tenant)
    const productsResult = await pool.query(
      `SELECT pi.name, pi.category, pi.description, t.name AS tenant_name
       FROM promo_items pi
       JOIN tenants t ON t.tenant_id = pi.tenant_id AND t.status = 'active'
       WHERE 'nutrition' = ANY(pi.service_type) AND pi.status = 'published'
       ORDER BY pi.category, pi.name`
    );
    const products = productsResult.rows;

    // Build prompt
    const { system, user } = buildNutritionPrompt(pet, extraData, tags, products);

    // Call OpenAI
    const openAiKey = getOpenAiKey ? getOpenAiKey() : null;
    let planData = { daily_kcal: 0, meals_per_day: 2, products: [], clinical_notes: "", restrictions: [], supplements: [] };

    if (openAiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + openAiKey },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          try {
            planData = JSON.parse(content);
          } catch (_parseErr) {
            // Try to extract JSON from markdown code block
            const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/);
            if (jsonMatch) planData = JSON.parse(jsonMatch[1]);
          }
        }
      } catch (aiErr) {
        serverLog("WARN", "NUTRITION", "OpenAI call failed", { error: aiErr.message });
      }
    } else {
      // Mock plan for testing
      planData = {
        daily_kcal: pet && extraData.weightKg ? Math.round(extraData.weightKg * 30 + 70) : 500,
        meals_per_day: 2,
        products: products.slice(0, 3).map(function (p) { return { name: p.name, daily_dose: "da calcolare", notes: "" }; }),
        clinical_notes: "Piano generato in modalità demo. Consultare il veterinario per validazione.",
        restrictions: [],
        supplements: [],
      };
    }

    // Save plan
    await pool.query(
      `INSERT INTO nutrition_plans (plan_id, pet_id, owner_user_id, tenant_id, plan_data, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [planId, petId, ownerUserId, tenantId, JSON.stringify(planData)]
    );

    serverLog("INFO", "NUTRITION", "plan generated", { planId, petId });

    return { plan_id: planId, pet_id: petId, plan_data: planData, status: "pending" };
  } catch (e) {
    console.error("generateNutritionPlan error:", e);
    throw e;
  }
}

/**
 * Get the active (validated) plan for a pet.
 */
async function getActivePlan(pool, petId) {
  const { rows } = await pool.query(
    "SELECT * FROM nutrition_plans WHERE pet_id = $1 AND status = 'validated' ORDER BY validated_at DESC LIMIT 1",
    [petId]
  );
  return rows[0] || null;
}

/**
 * Get the pending plan for a pet (awaiting vet validation).
 */
async function getPendingPlan(pool, petId) {
  const { rows } = await pool.query(
    "SELECT * FROM nutrition_plans WHERE pet_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [petId]
  );
  return rows[0] || null;
}

module.exports = {
  generateNutritionPlan,
  buildNutritionPrompt,
  getActivePlan,
  getPendingPlan,
};
