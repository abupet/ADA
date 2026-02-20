// backend/src/nutrition.service.js v2
// Nutrition plan generation and management — deep data model integration

const { randomUUID } = require("crypto");

function serverLog(level, domain, message, data) {
  if (process.env.ADA_DEBUG_LOG !== "true") return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, domain, msg: message, data: data || undefined }));
}

/**
 * Build the OpenAI prompt for nutrition plan generation (v2 — enriched data).
 */
function buildNutritionPrompt(pet, enrichedData, tags, products) {
  var ed = enrichedData || {};

  var petInfo = [];
  if (pet) {
    if (pet.name) petInfo.push("Nome: " + pet.name);
    if (pet.species) petInfo.push("Specie: " + pet.species);
    if (pet.breed) petInfo.push("Razza: " + pet.breed);
    if (pet.sex) petInfo.push("Sesso: " + pet.sex);
    if (pet.birthdate) petInfo.push("Data nascita: " + pet.birthdate);
  }
  if (ed.ageMonths !== null && ed.ageMonths !== undefined) petInfo.push("Età: " + ed.ageMonths + " mesi (" + ed.lifecycle + ")");
  if (ed.isSterilized !== undefined) petInfo.push("Sterilizzato/castrato: " + (ed.isSterilized ? "sì" : "no"));
  if (ed.effectiveWeight) petInfo.push("Peso attuale: " + ed.effectiveWeight + " kg");
  if (ed.effectiveBCS) petInfo.push("BCS: " + ed.effectiveBCS + "/9");
  if (ed.effectiveIdealWeight) petInfo.push("Peso ideale target: " + ed.effectiveIdealWeight + " kg");
  if (ed.effectiveActivity) petInfo.push("Livello attività: " + ed.effectiveActivity);
  if (ed.effectiveDietType) petInfo.push("Tipo alimentazione preferita: " + ed.effectiveDietType);
  if (ed.effectiveAllergies && ed.effectiveAllergies.length > 0) petInfo.push("ALLERGIE ALIMENTARI: " + ed.effectiveAllergies.join(", "));
  if (ed.knownConditions) petInfo.push("Condizioni cliniche note: " + ed.knownConditions);
  if (ed.currentMeds) petInfo.push("Farmaci in corso: " + ed.currentMeds);
  if (ed.dietPreferences) petInfo.push("Preferenze alimentari: " + ed.dietPreferences);
  if (ed.environment) petInfo.push("Ambiente: " + ed.environment);
  if (ed.effectiveMeals) petInfo.push("Pasti al giorno richiesti: " + ed.effectiveMeals);
  if (ed.budget) petInfo.push("Budget: " + ed.budget);

  var tagList = (tags || []).map(function (t) { return t.tag + (t.value ? "=" + t.value : ""); }).join(", ");

  var productList = (products || []).map(function (p) {
    var desc = "- " + p.name + " (" + p.category + ")";
    if (p.description) desc += ": " + p.description;
    if (p.nutrition_data) {
      var nd = typeof p.nutrition_data === "string" ? JSON.parse(p.nutrition_data) : p.nutrition_data;
      if (nd.kcal_per_100g) desc += " [" + nd.kcal_per_100g + " kcal/100g]";
    }
    return desc;
  }).join("\n");

  var system = "Sei un veterinario nutrizionista esperto. Genera un piano nutrizionale personalizzato DETTAGLIATO per il pet descritto.\n\n" +
    "REGOLE:\n" +
    "1) Lingua: italiano.\n" +
    "2) CALCOLA il fabbisogno energetico usando:\n" +
    "   - RER = 70 × (peso_ideale_kg)^0.75\n" +
    "   - MER = RER × fattore_K (specifica quale fattore K usi e perché)\n" +
    "   - Fattori K di riferimento:\n" +
    "     Cucciolo <4 mesi: 3.0 (cane), 2.5 (gatto)\n" +
    "     Cucciolo 4-12 mesi: 2.0\n" +
    "     Adulto intero: 1.8 (cane), 1.4 (gatto)\n" +
    "     Adulto sterilizzato: 1.6 (cane), 1.2 (gatto)\n" +
    "     Senior: 1.4 (cane), 1.1 (gatto)\n" +
    "     Sovrappeso (dimagrimento): 1.0-1.2\n" +
    "     Attivo/sportivo: 2.0-5.0\n" +
    "3) Organizza il piano in PASTI con orari suggeriti, non in lista prodotti generica.\n" +
    "4) Per ogni pasto specifica: alimento, grammatura ESATTA, kcal apportate.\n" +
    "5) Il totale kcal dei pasti deve corrispondere al MER calcolato (tolleranza ±5%).\n" +
    "6) Se ci sono allergie, ESCLUDI TASSATIVAMENTE quegli ingredienti e segnalalo nelle restrictions.\n" +
    "7) Se ci sono condizioni cliniche, adatta macro e micro di conseguenza con spiegazione.\n" +
    "8) Suggerisci integratori solo se clinicamente motivati.\n" +
    "9) Includi un piano di transizione se il pet sta cambiando dieta.\n" +
    "10) Includi regole di monitoraggio e aggiustamento specifiche.\n" +
    "11) Usa prodotti dal catalogo se pertinenti, altrimenti suggerisci prodotti generici.\n" +
    "12) Se il BCS indica sovrappeso (>5/9), calcola sul peso IDEALE non su quello attuale.\n" +
    "13) Rispondi SOLO con JSON valido nel formato richiesto, SENZA markdown o backtick.";

  var user = "Dati completi del pet:\n" + petInfo.join("\n") + "\n\n" +
    "Tag clinici computati: " + (tagList || "nessuno") + "\n\n" +
    "Catalogo prodotti disponibili:\n" + (productList || "nessun prodotto nel catalogo — suggerisci prodotti generici") + "\n\n" +
    "Genera il piano nutrizionale in questo formato JSON ESATTO:\n" +
    "{\n" +
    "  \"daily_kcal\": <numero>,\n" +
    "  \"rer\": <numero>,\n" +
    "  \"mer\": <numero>,\n" +
    "  \"k_factor\": <numero>,\n" +
    "  \"k_factor_reason\": \"<spiegazione scelta fattore K>\",\n" +
    "  \"meals_per_day\": <numero>,\n" +
    "  \"meals\": [\n" +
    "    {\n" +
    "      \"label\": \"<nome pasto: Colazione/Pranzo/Cena/Snack>\",\n" +
    "      \"time_suggestion\": \"<HH:MM>\",\n" +
    "      \"percentage\": <% del fabbisogno>,\n" +
    "      \"kcal\": <numero>,\n" +
    "      \"items\": [\n" +
    "        {\n" +
    "          \"name\": \"<nome alimento>\",\n" +
    "          \"source\": \"<catalog|generic>\",\n" +
    "          \"grams\": <numero>,\n" +
    "          \"kcal\": <numero>,\n" +
    "          \"notes\": \"<note preparazione>\"\n" +
    "        }\n" +
    "      ]\n" +
    "    }\n" +
    "  ],\n" +
    "  \"macros_target\": {\n" +
    "    \"protein_pct\": <numero>,\n" +
    "    \"fat_pct\": <numero>,\n" +
    "    \"carb_pct\": <numero>,\n" +
    "    \"fiber_pct\": <numero>\n" +
    "  },\n" +
    "  \"supplements\": [\n" +
    "    { \"name\": \"<nome>\", \"dose\": \"<dose>\", \"reason\": \"<motivo clinico>\" }\n" +
    "  ],\n" +
    "  \"restrictions\": [\"<restrizione 1>\", \"<restrizione 2>\"],\n" +
    "  \"clinical_notes\": \"<note cliniche dettagliate>\",\n" +
    "  \"monitoring_plan\": {\n" +
    "    \"weigh_frequency_days\": <numero>,\n" +
    "    \"bcs_check_frequency_days\": <numero>,\n" +
    "    \"next_review_date\": \"<YYYY-MM-DD>\",\n" +
    "    \"adjustment_rules\": [\"<regola 1>\", \"<regola 2>\"]\n" +
    "  },\n" +
    "  \"transition_plan\": {\n" +
    "    \"days\": <numero>,\n" +
    "    \"schedule\": [\n" +
    "      { \"day\": \"<range>\", \"old_pct\": <numero>, \"new_pct\": <numero> }\n" +
    "    ]\n" +
    "  }\n" +
    "}";

  return { system, user };
}

/**
 * Generate a nutrition plan for a pet (v2 — with overrides from modal).
 */
async function generateNutritionPlan(pool, petId, ownerUserId, tenantId, getOpenAiKey, overrides) {
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
      `SELECT pi.name, pi.category, pi.description, pi.nutrition_data, t.name AS tenant_name
       FROM promo_items pi
       JOIN tenants t ON t.tenant_id = pi.tenant_id AND t.status = 'active'
       WHERE 'nutrition' = ANY(pi.service_type) AND pi.status = 'published'
       ORDER BY pi.category, pi.name`
    );
    const products = productsResult.rows;

    // --- Merge overrides from frontend modal ---
    var ov = overrides || {};

    // Override peso: usa il valore dal modal se fornito
    var effectiveWeight = ov.weight_kg || null;
    if (!effectiveWeight) {
      var vitals = (extraData.vitals_data || [])
        .filter(function (v) { return v.weight && v.weight > 0; })
        .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      if (vitals.length > 0) effectiveWeight = vitals[0].weight;
    }
    if (!effectiveWeight && pet) effectiveWeight = pet.weight_kg ? Number(pet.weight_kg) : null;

    // Override BCS
    var effectiveBCS = ov.bcs || null;
    if (!effectiveBCS) {
      var bcsVitals = (extraData.vitals_data || [])
        .filter(function (v) { return v.bcs && v.bcs > 0; })
        .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      if (bcsVitals.length > 0) effectiveBCS = bcsVitals[0].bcs;
    }

    // Override activity level
    var effectiveActivity = ov.activity_level || (extraData.lifestyle || {}).activityLevel || "";

    // Override diet type
    var effectiveDietType = ov.diet_type || (extraData.lifestyle || {}).dietType || "";

    // Override food allergies
    var effectiveAllergies = (ov.food_allergies && ov.food_allergies.length > 0)
      ? ov.food_allergies
      : (extraData.lifestyle || {}).foodAllergies || [];

    // Ideal weight
    var effectiveIdealWeight = ov.ideal_weight_kg || (extraData.lifestyle || {}).idealWeightKg || effectiveWeight;

    // Meals per day
    var effectiveMeals = ov.meals_per_day || (extraData.lifestyle || {}).mealsPerDay || null;

    // Budget (transient)
    var budget = ov.budget || null;

    // Sterilization detection
    var isSterilized = false;
    if (pet && pet.sex) {
      var sexLower = pet.sex.toLowerCase();
      isSterilized = sexLower.includes("castrat") || sexLower.includes("sterilizzat");
    }

    // Age computation
    var ageMonths = null;
    var lifecycle = "adult";
    if (pet && pet.birthdate) {
      var bd = new Date(pet.birthdate);
      if (!isNaN(bd.getTime())) {
        ageMonths = Math.round((Date.now() - bd.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        if (ageMonths < 12) lifecycle = "puppy";
        else if (ageMonths > 84) lifecycle = "senior";
      }
    }

    // Build enriched data for prompt
    var enrichedData = {
      ageMonths: ageMonths,
      lifecycle: lifecycle,
      isSterilized: isSterilized,
      effectiveWeight: effectiveWeight,
      effectiveBCS: effectiveBCS,
      effectiveIdealWeight: effectiveIdealWeight,
      effectiveActivity: effectiveActivity,
      effectiveDietType: effectiveDietType,
      effectiveAllergies: effectiveAllergies,
      effectiveMeals: effectiveMeals,
      knownConditions: (extraData.lifestyle || {}).knownConditions || "",
      currentMeds: (extraData.lifestyle || {}).currentMeds || "",
      dietPreferences: (extraData.lifestyle || {}).dietPreferences || "",
      environment: (extraData.lifestyle || {}).lifestyle || "",
      budget: budget
    };

    // Build prompt
    const { system, user } = buildNutritionPrompt(pet, enrichedData, tags, products);

    // Call OpenAI
    const openAiKey = getOpenAiKey ? getOpenAiKey() : null;
    let planData = { daily_kcal: 0, meals_per_day: 2, meals: [], products: [], clinical_notes: "", restrictions: [], supplements: [] };

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
            max_tokens: 4000,
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
      // Mock plan for testing (v2 — with meals structure)
      var weightForCalc = effectiveIdealWeight || effectiveWeight || 10;
      var rer = Math.round(70 * Math.pow(weightForCalc, 0.75));
      var kFactor = isSterilized ? 1.6 : 1.8;
      if (lifecycle === "puppy") kFactor = 2.0;
      else if (lifecycle === "senior") kFactor = isSterilized ? 1.2 : 1.4;
      var mer = Math.round(rer * kFactor);

      planData = {
        daily_kcal: mer,
        rer: rer,
        mer: mer,
        k_factor: kFactor,
        k_factor_reason: "Mock: " + lifecycle + (isSterilized ? " sterilizzato" : " intero"),
        meals_per_day: effectiveMeals || 2,
        meals: [
          {
            label: "Colazione",
            time_suggestion: "08:00",
            percentage: 50,
            kcal: Math.round(mer * 0.5),
            items: products.slice(0, 1).map(function (p) {
              return { name: p.name, source: "catalog", grams: Math.round(mer * 0.5 / 3.5), kcal: Math.round(mer * 0.5), notes: "" };
            }).concat(products.length === 0 ? [{ name: "Crocchette premium", source: "generic", grams: Math.round(mer * 0.5 / 3.5), kcal: Math.round(mer * 0.5), notes: "" }] : [])
          },
          {
            label: "Cena",
            time_suggestion: "19:00",
            percentage: 50,
            kcal: Math.round(mer * 0.5),
            items: products.slice(0, 1).map(function (p) {
              return { name: p.name, source: "catalog", grams: Math.round(mer * 0.5 / 3.5), kcal: Math.round(mer * 0.5), notes: "" };
            }).concat(products.length === 0 ? [{ name: "Crocchette premium", source: "generic", grams: Math.round(mer * 0.5 / 3.5), kcal: Math.round(mer * 0.5), notes: "" }] : [])
          }
        ],
        products: products.slice(0, 3).map(function (p) { return { name: p.name, daily_dose: "da calcolare", notes: "" }; }),
        macros_target: { protein_pct: 25, fat_pct: 15, carb_pct: 50, fiber_pct: 3 },
        clinical_notes: "Piano generato in modalità demo. Consultare il veterinario per validazione.",
        restrictions: effectiveAllergies.length > 0 ? effectiveAllergies.map(function (a) { return "Evitare " + a; }) : [],
        supplements: [],
        monitoring_plan: {
          weigh_frequency_days: 14,
          bcs_check_frequency_days: 30,
          next_review_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          adjustment_rules: ["Se variazione peso > 5% ricalcolare"]
        },
        transition_plan: {
          days: 7,
          schedule: [
            { day: "1-2", old_pct: 75, new_pct: 25 },
            { day: "3-4", old_pct: 50, new_pct: 50 },
            { day: "5-6", old_pct: 25, new_pct: 75 },
            { day: "7+", old_pct: 0, new_pct: 100 }
          ]
        }
      };
    }

    // Add input_snapshot to plan_data
    planData.input_snapshot = {
      species: pet ? pet.species : null,
      breed: pet ? pet.breed : null,
      sex: pet ? pet.sex : null,
      is_sterilized: isSterilized,
      age_months: ageMonths,
      lifecycle: lifecycle,
      weight_kg: effectiveWeight,
      bcs: effectiveBCS,
      ideal_weight_kg: effectiveIdealWeight,
      activity_level: effectiveActivity,
      diet_type: effectiveDietType,
      food_allergies: effectiveAllergies,
      known_conditions: (extraData.lifestyle || {}).knownConditions || null,
      current_meds: (extraData.lifestyle || {}).currentMeds || null,
      clinical_tags: tags.map(function (t) { return t.tag; }),
      budget: budget,
      generated_at: new Date().toISOString()
    };

    // Retrocompatibility fields
    planData.weight_used_kg = effectiveWeight;
    planData.bcs_used = effectiveBCS;
    planData.ideal_weight_kg = effectiveIdealWeight;

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
