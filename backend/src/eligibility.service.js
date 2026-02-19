// backend/src/eligibility.service.js v2
// PR 2: Promo eligibility / selection engine
// v2: Multi-service support (promo, nutrition, insurance)

// --- Debug logging helper (PR 13) ---
function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    console.log(JSON.stringify({ts: new Date().toISOString(), level, domain, corrId: (req && req.correlationId) || '--------', msg: message, data: data || undefined}));
}

function _randomProductPlaceholder() {
    const index = String(Math.floor(Math.random() * 45) + 1).padStart(2, '0');
    return `/api/seed-assets/placeholder-prodotti/Prodotto_${index}.png`;
}

const { computeTags, normalizeSpecies } = require("./tag.service");
const {
  getEffectiveConsent,
  isMarketingAllowed,
  isClinicalTagsAllowed,
} = require("./consent.service");

/**
 * Context rules: which categories are allowed and frequency caps.
 */
const CONTEXT_RULES = {
  post_visit: {
    categories: ["food_clinical", "supplement"],
    freq: { per_event: 1 },
    service_types: ["promo"],
  },
  post_vaccination: {
    categories: ["antiparasitic", "accessory"],
    freq: { per_event: 1 },
    service_types: ["promo"],
  },
  home_feed: {
    categories: ["food_general", "accessory", "service"],
    freq: { per_session: 2, per_week: 4 },
    service_types: ["promo"],
  },
  pet_profile: {
    categories: ["food_general", "accessory"],
    freq: { per_session: 1 },
    service_types: ["promo"],
  },
  faq_view: {
    categories: null, // any correlated
    freq: { per_session: 1 },
    service_types: ["promo"],
  },
  milestone: {
    categories: ["food_general", "service"],
    freq: { per_event: 1 },
    service_types: ["promo"],
  },
  nutrition_review: {
    categories: ["food_clinical", "food_general", "supplement"],
    freq: { per_session: 1 },
    service_types: ["nutrition"],
  },
  insurance_review: {
    categories: ["service"],
    freq: { per_session: 1 },
    service_types: ["insurance"],
  },
};

/**
 * Contexts that allow high-sensitivity tag matching.
 */
const HIGH_SENSITIVITY_CONTEXTS = ["post_visit", "post_vaccination"];

/**
 * selectPromo(pool, { petId, ownerUserId, context })
 *
 * Returns a promo item recommendation or null.
 *
 * Steps:
 * 1. Tags: read pet_tags. If empty -> computeTags first.
 * 2. Consent: marketing_global, brand-specific, clinical_tags.
 * 3. Candidates: query promo_items with filters.
 * 4. Tag matching with sensitivity + consent check.
 * 5. Frequency capping.
 * 6. Ranking: priority DESC -> match_score DESC -> updated_at DESC. LIMIT 1.
 * 7. Tie-break rotation: hash(petId + CURRENT_DATE) % count.
 */
async function selectPromo(pool, { petId, ownerUserId, context, serviceType, force }) {
  try {
    const ctx = context || "home_feed";
    const rules = CONTEXT_RULES[ctx] || CONTEXT_RULES.home_feed;
    const effectiveServiceType = serviceType || (rules.service_types ? rules.service_types[0] : "promo");

    // 0. Try AI recommendation matches (top 5 from bulk analysis)
    if (!force) {
      try {
        const matchesResult = await pool.query(
          "SELECT ai_recommendation_matches FROM pets WHERE pet_id = $1 LIMIT 1",
          [petId]
        );
        const aiMatches = matchesResult.rows[0]?.ai_recommendation_matches;
        if (aiMatches && Array.isArray(aiMatches) && aiMatches.length > 0) {
          // Get consent
          const aiConsent = await getEffectiveConsent(pool, ownerUserId);
          if (isMarketingAllowed(aiConsent, null)) {
            // Filter matches through consent, vet flags, and freq cap
            const validMatches = [];
            for (const match of aiMatches) {
              if (!match.promo_item_id) continue;

              // Check vet flags
              try {
                const flagRes = await pool.query(
                  "SELECT 1 FROM vet_flags WHERE pet_id = $1 AND promo_item_id = $2 AND status = 'active' LIMIT 1",
                  [petId, match.promo_item_id]
                );
                if (flagRes.rows.length > 0) continue;
              } catch (_e) { /* skip */ }

              // Check freq cap (per_session: today's impressions for this item)
              const freqCap = rules.freq || {};
              let capped = false;
              try {
                if (freqCap.per_session) {
                  const sessionRes = await pool.query(
                    `SELECT COUNT(*) as cnt FROM promo_events
                     WHERE owner_user_id = $1 AND pet_id = $2 AND promo_item_id = $3
                     AND event_type = 'impression' AND created_at >= CURRENT_DATE`,
                    [ownerUserId, petId, match.promo_item_id]
                  );
                  if (Number(sessionRes.rows[0].cnt) >= freqCap.per_session) capped = true;
                }
                if (!capped && freqCap.per_week) {
                  const weekRes = await pool.query(
                    `SELECT COUNT(*) as cnt FROM promo_events
                     WHERE owner_user_id = $1 AND pet_id = $2
                     AND event_type = 'impression'
                     AND created_at >= NOW() - INTERVAL '7 days'`,
                    [ownerUserId, petId]
                  );
                  if (Number(weekRes.rows[0].cnt) >= freqCap.per_week) capped = true;
                }
              } catch (_e) { /* don't cap on error */ }
              if (capped) continue;

              // Check brand consent
              try {
                const itemRes = await pool.query(
                  "SELECT tenant_id, name, category, image_url, product_url, service_type, description FROM promo_items WHERE promo_item_id = $1 AND status = 'published' LIMIT 1",
                  [match.promo_item_id]
                );
                if (!itemRes.rows[0]) continue;
                const item = itemRes.rows[0];
                if (!isMarketingAllowed(aiConsent, item.tenant_id)) continue;

                // Check service_type filter
                if (effectiveServiceType && item.service_type &&
                    Array.isArray(item.service_type) && item.service_type.length > 0 &&
                    !item.service_type.includes(effectiveServiceType)) continue;

                validMatches.push({ ...match, _dbItem: item });
              } catch (_e) { continue; }
            }

            if (validMatches.length > 0) {
              // Deterministic selection: hash(petId + date) instead of random
              const dateStr = new Date().toISOString().split("T")[0];
              const hashInput = petId + dateStr;
              let hash = 0;
              for (let i = 0; i < hashInput.length; i++) {
                hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
              }
              const chosen = validMatches[Math.abs(hash) % validMatches.length];
              const dbItem = chosen._dbItem;

              const utmParams = new URLSearchParams({
                utm_source: "ada",
                utm_medium: "promo",
                utm_campaign: "ai_recommendation",
                utm_content: chosen.promo_item_id,
              }).toString();

              const ctaUrl = dbItem.product_url
                ? dbItem.product_url + (dbItem.product_url.includes("?") ? "&" : "?") + utmParams
                : null;

              serverLog('INFO', 'ELIGIBILITY', 'selectPromo from ai_recommendation_matches', { petId, matchCount: validMatches.length, selectedItemId: chosen.promo_item_id });

              return {
                promoItemId: chosen.promo_item_id,
                tenantId: dbItem.tenant_id,
                name: dbItem.name,
                category: dbItem.category,
                imageUrl: dbItem.image_url || _randomProductPlaceholder(),
                description: dbItem.description,
                ctaUrl,
                context: ctx,
                source: "ai_recommendation",
                matchedTags: chosen.key_matches || [],
                _item: dbItem,
              };
            } else if (aiMatches.length > 0) {
              // All cached AI matches are phantom — clear stale data asynchronously
              serverLog('WARN', 'ELIGIBILITY', 'all AI matches phantom, clearing stale cache', { petId, matchCount: aiMatches.length });
              pool.query(
                "UPDATE pets SET ai_recommendation_matches = NULL, ai_recommendation_matches_generated_at = NULL WHERE pet_id = $1",
                [petId]
              ).catch(() => {});
            }
          }
        }
      } catch (_aiErr) {
        // Fallback to standard algorithm on any error
        serverLog('WARN', 'ELIGIBILITY', 'ai_recommendation_matches lookup failed, falling back', { petId, error: _aiErr.message });
      }
    }

    // 1. Get or compute tags
    let petTags = [];
    try {
      const tagsResult = await pool.query(
        "SELECT tag, value, confidence FROM pet_tags WHERE pet_id = $1",
        [petId]
      );
      petTags = tagsResult.rows;

      if (petTags.length === 0) {
        const computed = await computeTags(pool, petId, ownerUserId);
        if (computed.tags.length > 0) {
          const tagsResult2 = await pool.query(
            "SELECT tag, value, confidence FROM pet_tags WHERE pet_id = $1",
            [petId]
          );
          petTags = tagsResult2.rows;
        }
      }
    } catch (e) {
      console.warn("selectPromo: tag lookup error:", e.message);
    }

    const petTagNames = petTags.map((t) => t.tag);

    // Get pet species + lifecycle for filtering
    let petSpecies = null;
    let petLifecycle = null;
    try {
      const petResult = await pool.query(
        "SELECT species FROM pets WHERE pet_id = $1 LIMIT 1",
        [petId]
      );
      if (petResult.rows[0]) {
        petSpecies = normalizeSpecies(petResult.rows[0].species);
      }
    } catch (_e) {
      // skip
    }

    // Derive lifecycle from pet_tags (computed earlier)
    try {
      const lcResult = await pool.query(
        "SELECT tag FROM pet_tags WHERE pet_id = $1 AND tag LIKE 'lifecycle:%' ORDER BY computed_at DESC LIMIT 1",
        [petId]
      );
      if (lcResult.rows[0]) {
        petLifecycle = lcResult.rows[0].tag.replace('lifecycle:', '');
      }
    } catch (_e) {
      // skip
    }

    // 2. Consent (skip when force=true for debug forceMultiService)
    let consent = null;
    if (!force) {
      consent = await getEffectiveConsent(pool, ownerUserId);
      if (!isMarketingAllowed(consent, null)) {
        return null; // marketing globally off
      }
    }

    const clinicalAllowed = consent ? isClinicalTagsAllowed(consent) : false;
    const highSensitivityOk =
      clinicalAllowed && HIGH_SENSITIVITY_CONTEXTS.includes(ctx);

    // 3. Fetch candidate promo_items
    let candidates = [];
    try {
      // Use a subquery to prefer campaign rows matching the current context.
      // DISTINCT ON picks the first row per item; ORDER BY puts context-matching
      // campaigns first (via the bool sort), then NULLs (no campaign), then others.
      const itemsResult = await pool.query(
        `SELECT DISTINCT ON (pi.promo_item_id)
           pi.promo_item_id, pi.tenant_id, pi.name, pi.category, pi.species, pi.lifecycle_target,
           pi.description, pi.extended_description, pi.image_url, pi.product_url,
           pi.tags_include, pi.tags_exclude, pi.priority, pi.status, pi.service_type,
           pi.nutrition_data, pi.insurance_data, pi.updated_at,
           pc.campaign_id, pc.frequency_cap, pc.utm_campaign, pc.contexts
         FROM promo_items pi
         LEFT JOIN campaign_items ci ON ci.promo_item_id = pi.promo_item_id
         LEFT JOIN promo_campaigns pc ON pc.campaign_id = ci.campaign_id
           AND pc.status = 'active'
           AND (pc.start_date IS NULL OR pc.start_date <= CURRENT_DATE)
           AND (pc.end_date IS NULL OR pc.end_date >= CURRENT_DATE)
         WHERE pi.status = 'published'
           AND ($2::text IS NULL OR $2 = ANY(pi.service_type))
         ORDER BY pi.promo_item_id,
                  (pc.contexts IS NOT NULL AND $1 = ANY(pc.contexts)) DESC NULLS LAST,
                  pi.priority DESC`,
        [ctx, effectiveServiceType]
      );
      candidates = itemsResult.rows;
    } catch (e) {
      console.warn("selectPromo: candidates query error:", e.message);
      return null;
    }

    if (candidates.length === 0) return null;

    // 4. Filter candidates
    const filtered = [];
    for (const item of candidates) {
      // Brand consent check (skip when force=true)
      if (!force && !isMarketingAllowed(consent, item.tenant_id)) continue;

      // Species filter (skip when force=true)
      if (
        !force &&
        petSpecies &&
        item.species &&
        item.species.length > 0 &&
        !item.species.includes("all") &&
        !item.species.includes(petSpecies)
      ) {
        continue;
      }

      // Lifecycle filter (skip when force=true)
      if (
        !force &&
        petLifecycle &&
        item.lifecycle_target &&
        Array.isArray(item.lifecycle_target) &&
        item.lifecycle_target.length > 0 &&
        !item.lifecycle_target.includes("all") &&
        !item.lifecycle_target.includes(petLifecycle)
      ) {
        continue;
      }

      // Context/category filter (skip when force=true)
      if (!force && rules.categories) {
        if (!rules.categories.includes(item.category)) continue;
      }

      // Campaign context filter
      if (
        item.contexts &&
        item.contexts.length > 0 &&
        !item.contexts.includes(ctx)
      ) {
        continue;
      }

      // Vet flag check (skip when force=true)
      if (!force) {
        try {
          const flagResult = await pool.query(
            "SELECT 1 FROM vet_flags WHERE pet_id = $1 AND promo_item_id = $2 AND status = 'active' LIMIT 1",
            [petId, item.promo_item_id]
          );
          if (flagResult.rows.length > 0) continue;
        } catch (_e) {
          // skip
        }
      }

      // Tags exclude check (AND NOT)
      if (item.tags_exclude && item.tags_exclude.length > 0) {
        const excluded = item.tags_exclude.some((t) =>
          petTagNames.includes(t)
        );
        if (excluded) continue;
      }

      // Skip products without any description (aligned with AI analysis filter in _runAnalysisForPet)
      if (!item.description && !item.extended_description) continue;

      // Tag sensitivity check: high-sensitivity tags in include only if allowed
      if (item.tags_include && item.tags_include.length > 0) {
        // Filter out high-sensitivity tags if not allowed
        const effectiveInclude = item.tags_include.filter((t) => {
          if (t.startsWith("clinical:") && !highSensitivityOk) return false;
          return true;
        });
        // Calculate match score (OR match)
        const matchScore = effectiveInclude.filter((t) =>
          petTagNames.includes(t)
        ).length;
        item._matchScore = matchScore;
      } else {
        item._matchScore = 0;
      }

      filtered.push(item);
    }

    if (filtered.length === 0) return null;

    // 5. Frequency capping (skip entirely when force=true)
    let afterCapping;
    if (force) {
      afterCapping = filtered;
    } else {
      afterCapping = [];
      for (const item of filtered) {
        const freqCap = item.frequency_cap || rules.freq || {};
        let capped = false;

        try {
          // Check per_session (today's impressions)
          if (freqCap.per_session) {
            const sessionResult = await pool.query(
              `SELECT COUNT(*) as cnt FROM promo_events
               WHERE owner_user_id = $1 AND pet_id = $2 AND context = $3
               AND event_type = 'impression' AND created_at >= CURRENT_DATE`,
              [ownerUserId, petId, ctx]
            );
            if (Number(sessionResult.rows[0].cnt) >= freqCap.per_session) {
              capped = true;
            }
          }

          // Check per_week
          if (!capped && freqCap.per_week) {
            const weekResult = await pool.query(
              `SELECT COUNT(*) as cnt FROM promo_events
               WHERE owner_user_id = $1 AND pet_id = $2
               AND event_type = 'impression'
               AND created_at >= NOW() - INTERVAL '7 days'`,
              [ownerUserId, petId]
            );
            if (Number(weekResult.rows[0].cnt) >= freqCap.per_week) {
              capped = true;
            }
          }

          // Check per_event (only 1 per unique event)
          if (!capped && freqCap.per_event) {
            const eventResult = await pool.query(
              `SELECT COUNT(*) as cnt FROM promo_events
               WHERE owner_user_id = $1 AND pet_id = $2 AND promo_item_id = $3
               AND context = $4 AND event_type = 'impression'
               AND created_at >= CURRENT_DATE`,
              [ownerUserId, petId, item.promo_item_id, ctx]
            );
            if (Number(eventResult.rows[0].cnt) >= freqCap.per_event) {
              capped = true;
            }
          }
        } catch (_e) {
          // On error, don't cap (graceful degradation)
        }

        if (!capped) afterCapping.push(item);
      }
    }

    if (afterCapping.length === 0) return null;

    // 6. Ranking: priority DESC -> match_score DESC -> updated_at DESC
    afterCapping.sort((a, b) => {
      const pA = a.priority || 0;
      const pB = b.priority || 0;
      if (pB !== pA) return pB - pA;

      const mA = a._matchScore || 0;
      const mB = b._matchScore || 0;
      if (mB !== mA) return mB - mA;

      const dA = new Date(a.updated_at || 0).getTime();
      const dB = new Date(b.updated_at || 0).getTime();
      return dB - dA;
    });

    // 7. Tie-break rotation: hash(petId + CURRENT_DATE) % count of top-priority items
    const topPriority = afterCapping[0].priority || 0;
    const topScore = afterCapping[0]._matchScore || 0;
    const topTier = afterCapping.filter(
      (i) => (i.priority || 0) === topPriority && (i._matchScore || 0) === topScore
    );

    let selectedIndex = 0;
    if (topTier.length > 1) {
      const dateStr = new Date().toISOString().split("T")[0];
      const hashInput = petId + dateStr;
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
      }
      selectedIndex = Math.abs(hash) % topTier.length;
    }

    const selected = topTier[selectedIndex];

    // Build UTM params
    const utmParams = new URLSearchParams({
      utm_source: "ada",
      utm_medium: "promo",
      utm_campaign: selected.utm_campaign || selected.campaign_id || "default",
      utm_content: selected.promo_item_id,
    }).toString();

    const ctaUrl = selected.product_url
      ? selected.product_url +
        (selected.product_url.includes("?") ? "&" : "?") +
        utmParams
      : null;

    serverLog('INFO', 'ELIGIBILITY', 'after selectPromo', {petId, candidatesFound: afterCapping.length, selectedItemId: selected.promo_item_id, matchScore: selected._matchScore});

    return {
      promoItemId: selected.promo_item_id,
      tenantId: selected.tenant_id,
      name: selected.name,
      category: selected.category,
      imageUrl: selected.image_url || _randomProductPlaceholder(),
      description: selected.description,
      ctaUrl,
      context: ctx,
      source: "eligibility",
      matchedTags: petTagNames.filter(
        (t) => selected.tags_include && selected.tags_include.includes(t)
      ),
      _item: selected, // internal, for explanation engine
    };
  } catch (e) {
    console.error("selectPromo fatal error:", e);
    return null;
  }
}

module.exports = { selectPromo, CONTEXT_RULES };
