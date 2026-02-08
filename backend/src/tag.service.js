// backend/src/tag.service.js v2
// PR 2: Tag computation engine
// PR 17: normalizzazione specie + lifecycle in italiano

// --- Species normalizzazione ---
const SPECIES_MAP = {
  cane: 'dog', dog: 'dog', cani: 'dog',
  gatto: 'cat', cat: 'cat', gatti: 'cat',
  coniglio: 'rabbit', rabbit: 'rabbit',
  furetto: 'ferret', ferret: 'ferret',
  uccello: 'bird', bird: 'bird',
  rettile: 'reptile', reptile: 'reptile',
};

function normalizeSpecies(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return SPECIES_MAP[key] || null;
}

// --- Lifecycle label italiano ---
const LIFECYCLE_LABELS = {
  puppy: 'Cucciolo',
  adult: 'Adulto',
  senior: 'Senior',
};

function lifecycleLabelIt(tag) {
  // tag format: "lifecycle:puppy" -> "Cucciolo"
  const parts = String(tag).split(':');
  const stage = parts.length > 1 ? parts[1] : parts[0];
  return LIFECYCLE_LABELS[stage] || stage;
}

/**
 * computeTags(pool, petId, ownerUserId)
 *
 * Deterministic tag computation. NO AI, NO random.
 * Returns { tags: string[], errors: string[] }
 */
async function computeTags(pool, petId, ownerUserId) {
  const tags = [];
  const errors = [];

  try {
    // Fetch pet data
    const { rows } = await pool.query(
      "SELECT pet_id, species, breed, birthdate, weight_kg, extra_data FROM pets WHERE pet_id = $1 LIMIT 1",
      [petId]
    );

    if (!rows[0]) {
      return { tags: [], errors: ["pet_not_found"] };
    }

    const pet = rows[0];
    const speciesRaw = (pet.species || "").toLowerCase().trim();
    const speciesNorm = normalizeSpecies(speciesRaw);
    const weightKg = pet.weight_kg ? Number(pet.weight_kg) : null;
    const birthdate = pet.birthdate ? new Date(pet.birthdate) : null;

    // --- Species tags (low sensitivity) ---
    try {
      if (speciesNorm) {
        tags.push("species:" + speciesNorm);
      }
    } catch (e) {
      errors.push("species_tag_error: " + e.message);
    }

    // --- Size tags (low sensitivity, dogs only) ---
    try {
      if (speciesNorm === "dog" && weightKg !== null) {
        if (weightKg < 10) {
          tags.push("size:small");
        } else if (weightKg < 25) {
          tags.push("size:medium");
        } else {
          tags.push("size:large");
        }
      }
    } catch (e) {
      errors.push("size_tag_error: " + e.message);
    }

    // --- Lifecycle tags (low sensitivity) ---
    try {
      if (birthdate && !isNaN(birthdate.getTime())) {
        const now = new Date();
        const ageMs = now.getTime() - birthdate.getTime();
        const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

        if (ageYears < 1) {
          tags.push("lifecycle:puppy");
        } else {
          // Senior thresholds depend on species and size
          let seniorAge = 7; // default
          if (speciesNorm === "cat") {
            seniorAge = 10;
          } else if (speciesNorm === "dog") {
            if (weightKg !== null) {
              if (weightKg < 10) seniorAge = 10;
              else if (weightKg < 25) seniorAge = 8;
              else seniorAge = 6;
            }
          }

          if (ageYears >= seniorAge) {
            tags.push("lifecycle:senior");
          } else {
            tags.push("lifecycle:adult");
          }
        }
      }
    } catch (e) {
      errors.push("lifecycle_tag_error: " + e.message);
    }

    // --- Clinical tags (HIGH sensitivity) ---
    // Search keyword in SOAP records (changes table) and pet extra_data
    try {
      // Fetch tag dictionary for clinical tags with keywords
      const dictResult = await pool.query(
        "SELECT tag, derivation_rule FROM tag_dictionary WHERE category = 'clinical' AND sensitivity = 'high'"
      );

      if (dictResult.rows.length > 0) {
        // Gather clinical text from all available sources
        let clinicalText = "";

        // Source 1: pet_changes (contains SOAP data in record JSONB)
        try {
          const petChangesResult = await pool.query(
            `SELECT record FROM pet_changes
             WHERE pet_id = $1
             ORDER BY created_at DESC LIMIT 10`,
            [petId]
          );
          for (const row of petChangesResult.rows) {
            if (row.record) {
              clinicalText += " " + JSON.stringify(row.record);
            }
          }
        } catch (_e) {
          // skip
        }

        // Source 2: generic changes table (documents that might have clinical text)
        try {
          const changesResult = await pool.query(
            `SELECT record FROM changes
             WHERE entity_type = 'document' AND record->>'pet_id' = $1
             ORDER BY created_at DESC LIMIT 10`,
            [petId]
          );
          for (const row of changesResult.rows) {
            if (row.record) {
              clinicalText += " " + JSON.stringify(row.record);
            }
          }
        } catch (_e) {
          // skip
        }

        // Source 3: documents table (read_text, owner_explanation)
        try {
          const docsResult = await pool.query(
            `SELECT read_text, owner_explanation FROM documents
             WHERE pet_id = $1 AND (read_text IS NOT NULL OR owner_explanation IS NOT NULL)
             ORDER BY created_at DESC LIMIT 10`,
            [petId]
          );
          for (const row of docsResult.rows) {
            if (row.read_text) clinicalText += " " + row.read_text;
            if (row.owner_explanation) clinicalText += " " + row.owner_explanation;
          }
        } catch (_e) {
          // skip
        }

        // Check extra_data
        if (pet.extra_data) {
          clinicalText += " " + JSON.stringify(pet.extra_data);
        }

        const textLower = clinicalText.toLowerCase();

        for (const dictRow of dictResult.rows) {
          const rule = dictRow.derivation_rule || {};
          if (rule.type === "keyword" && Array.isArray(rule.keywords)) {
            const matched = rule.keywords.some((kw) =>
              textLower.includes(kw.toLowerCase())
            );
            if (matched) {
              tags.push(dictRow.tag);
            }
          }
        }
      }
    } catch (e) {
      errors.push("clinical_tag_error: " + e.message);
    }

    // --- UPSERT tags into pet_tags ---
    for (const tag of tags) {
      try {
        await pool.query(
          `INSERT INTO pet_tags (pet_id, tag, source, computed_at)
           VALUES ($1, $2, 'computed', NOW())
           ON CONFLICT (pet_id, tag) DO UPDATE SET
             source = 'computed',
             computed_at = NOW()`,
          [petId, tag]
        );
      } catch (e) {
        errors.push("upsert_tag_error: " + tag + " - " + e.message);
      }
    }
  } catch (e) {
    errors.push("compute_tags_fatal: " + e.message);
  }

  return { tags, errors };
}

module.exports = { computeTags, normalizeSpecies, lifecycleLabelIt, SPECIES_MAP, LIFECYCLE_LABELS };
