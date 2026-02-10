// backend/src/risk-scoring.service.js v1
// Insurance risk scoring engine

function serverLog(level, domain, message, data) {
  if (process.env.ADA_DEBUG_LOG !== "true") return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, domain, msg: message, data: data || undefined }));
}

// Breed risk data (simplified)
const HIGH_RISK_BREEDS = {
  dog: ["bulldog", "bulldog inglese", "cavalier king charles", "boxer", "dobermann", "rottweiler", "pastore tedesco", "golden retriever", "labrador"],
  cat: ["persiano", "maine coon", "ragdoll", "siamese", "bengala"],
};

/**
 * Age risk sub-score (0-20).
 * Very young (<1y) and old (>8y) pets are higher risk.
 */
function _ageRiskScore(pet, extraData) {
  let ageYears = null;
  const birthDate = pet?.birth_date || extraData?.birthdate;
  if (birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    ageYears = (now - birth) / (365.25 * 24 * 60 * 60 * 1000);
  }
  if (ageYears === null) return 10; // unknown = medium risk

  if (ageYears < 1) return 12;
  if (ageYears < 3) return 5;
  if (ageYears < 7) return 8;
  if (ageYears < 10) return 14;
  if (ageYears < 13) return 17;
  return 20; // very old
}

/**
 * Breed risk sub-score (0-20).
 */
function _breedRiskScore(pet, extraData) {
  const breed = (pet?.breed || extraData?.breed || "").toLowerCase();
  const species = (pet?.species || extraData?.species || "").toLowerCase();

  if (!breed || breed === "meticcio" || breed === "misto") return 8;

  const speciesKey = species.includes("gatto") || species === "cat" ? "cat" : "dog";
  const highRiskList = HIGH_RISK_BREEDS[speciesKey] || [];

  if (highRiskList.some(function (b) { return breed.includes(b); })) return 18;
  return 10;
}

/**
 * Clinical history risk sub-score (0-25).
 * Based on clinical tags.
 */
function _historyRiskScore(tags) {
  if (!tags || tags.length === 0) return 5;

  let score = 0;
  const clinicalTags = tags.filter(function (t) { return t.tag.startsWith("clinical:"); });

  score += Math.min(clinicalTags.length * 5, 20);

  // Specific high-risk conditions
  const highRisk = ["clinical:cardiac", "clinical:endocrine", "clinical:hepatic", "clinical:renal", "clinical:obesity"];
  for (const t of tags) {
    if (highRisk.includes(t.tag)) score += 3;
  }

  return Math.min(score, 25);
}

/**
 * Medications risk sub-score (0-15).
 */
function _medsRiskScore(tags) {
  // We approximate medication risk from clinical tags
  if (!tags || tags.length === 0) return 0;

  const clinicalCount = tags.filter(function (t) { return t.tag.startsWith("clinical:"); }).length;
  if (clinicalCount >= 3) return 15;
  if (clinicalCount >= 2) return 10;
  if (clinicalCount >= 1) return 5;
  return 0;
}

/**
 * Weight risk sub-score (0-20).
 */
function _weightRiskScore(pet, extraData) {
  const weight = extraData?.weightKg || null;
  if (!weight) return 10; // unknown

  const species = (pet?.species || extraData?.species || "").toLowerCase();
  const isDog = !species.includes("gatto") && species !== "cat";

  if (isDog) {
    if (weight < 5) return 8;
    if (weight < 15) return 6;
    if (weight < 30) return 10;
    if (weight < 45) return 14;
    return 18; // very large
  } else {
    // Cat
    if (weight < 3) return 8;
    if (weight < 6) return 5;
    if (weight < 8) return 12;
    return 16; // overweight cat
  }
}

/**
 * Compute risk score for a pet.
 * Returns { total_score, risk_class, breakdown, price_multiplier }
 */
async function computeRiskScore(pool, petId) {
  try {
    // Load pet
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

    // Calculate sub-scores
    const ageScore = _ageRiskScore(pet, extraData);
    const breedScore = _breedRiskScore(pet, extraData);
    const historyScore = _historyRiskScore(tags);
    const medsScore = _medsRiskScore(tags);
    const weightScore = _weightRiskScore(pet, extraData);

    const totalScore = Math.min(100, ageScore + breedScore + historyScore + medsScore + weightScore);

    // Risk class
    let riskClass = "low";
    if (totalScore >= 75) riskClass = "very_high";
    else if (totalScore >= 50) riskClass = "high";
    else if (totalScore >= 25) riskClass = "medium";

    // Price multiplier (1.0 = base price)
    let priceMultiplier = 1.0;
    if (riskClass === "medium") priceMultiplier = 1.3;
    else if (riskClass === "high") priceMultiplier = 1.7;
    else if (riskClass === "very_high") priceMultiplier = 2.2;

    const breakdown = {
      age: ageScore,
      breed: breedScore,
      history: historyScore,
      meds: medsScore,
      weight: weightScore,
    };

    // Save score
    const { rows } = await pool.query(
      `INSERT INTO insurance_risk_scores (pet_id, total_score, risk_class, breakdown, price_multiplier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [petId, totalScore, riskClass, JSON.stringify(breakdown), priceMultiplier]
    );

    serverLog("INFO", "RISK_SCORING", "score computed", { petId, totalScore, riskClass });

    return rows[0];
  } catch (e) {
    console.error("computeRiskScore error:", e);
    throw e;
  }
}

module.exports = {
  computeRiskScore,
  _ageRiskScore,
  _breedRiskScore,
  _historyRiskScore,
  _medsRiskScore,
  _weightRiskScore,
};
