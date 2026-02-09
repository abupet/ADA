// backend/src/explanation.service.js v1
// PR 3: OpenAI explanation generation with caching and budget control

const { createHash } = require("crypto");

// --- Debug logging helper (PR 13) ---
function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    console.log(JSON.stringify({ts: new Date().toISOString(), level, domain, corrId: (req && req.correlationId) || '--------', msg: message, data: data || undefined}));
}

/**
 * generateExplanation(pool, { pet, promoItem, context, matchedTags, getOpenAiKey })
 *
 * Returns { explanation, source, tokensCost, latencyMs }
 *
 * Steps:
 * 1. Cache key: sha256(JSON(petSummary) + promoItem.promo_item_id + promoItem.version + context)
 * 2. Check explanation_cache -> hit non expired: return source='cache'
 * 3. Check tenant_budgets -> exceeded: return fallback source='fallback'
 * 4. Call OpenAI GPT-4o-mini with timeout 5s
 * 5. Parse + validate -> fallback if fails
 * 6. Save in cache (expires_at = now + 7 days)
 * 7. Increment tenant_budgets.current_usage
 */
async function generateExplanation(
  pool,
  { pet, promoItem, context, matchedTags, getOpenAiKey }
) {
  const startMs = Date.now();
  const petName = pet?.name || "il tuo pet";

  // Build pet summary (privacy-safe)
  const petSummary = {
    nome: pet?.name || null,
    specie: pet?.species || null,
    razza: pet?.breed || null,
    eta: _computeAge(pet?.birthdate),
    peso_kg: pet?.weight_kg || null,
    taglia: _computeSize(pet?.weight_kg, pet?.species),
    tags: (matchedTags || []).filter((t) => !t.startsWith("clinical:")),
  };

  const itemId = promoItem?.promo_item_id || promoItem?.promoItemId || "unknown";
  const itemVersion = promoItem?.version || 1;
  const tenantId = promoItem?.tenant_id || promoItem?.tenantId || null;

  // 1. Cache key
  const cacheInput = JSON.stringify(petSummary) + itemId + itemVersion + (context || "");
  const cacheKey = createHash("sha256").update(cacheInput).digest("hex");

  // 2. Check cache
  try {
    const cacheResult = await pool.query(
      "SELECT explanation FROM explanation_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1",
      [cacheKey]
    );
    if (cacheResult.rows[0]) {
      serverLog('INFO', 'EXPLAIN', 'cache hit', {cacheKey: cacheKey.slice(0, 12), latencyMs: Date.now() - startMs});
      return {
        explanation: cacheResult.rows[0].explanation,
        source: "cache",
        tokensCost: 0,
        latencyMs: Date.now() - startMs,
      };
    }
  } catch (_e) {
    // cache miss
  }

  // 3. Check budget
  if (tenantId) {
    try {
      const budgetResult = await pool.query(
        "SELECT monthly_limit, current_usage, alert_threshold FROM tenant_budgets WHERE tenant_id = $1 LIMIT 1",
        [tenantId]
      );
      if (budgetResult.rows[0]) {
        const b = budgetResult.rows[0];
        if (b.current_usage >= b.monthly_limit) {
          serverLog('INFO', 'EXPLAIN', 'budget exceeded', {tenantId, usage: b.current_usage, limit: b.monthly_limit});
          return {
            explanation: _fallbackExplanation(petName),
            source: "fallback",
            tokensCost: 0,
            latencyMs: Date.now() - startMs,
          };
        }
      }
    } catch (_e) {
      // skip budget check
    }
  }

  // 4. Call OpenAI
  const openAiKey = typeof getOpenAiKey === "function" ? getOpenAiKey() : null;
  if (!openAiKey) {
    return {
      explanation: _fallbackExplanation(petName),
      source: "fallback",
      tokensCost: 0,
      latencyMs: Date.now() - startMs,
    };
  }

  try {
    const systemPrompt = `Sei un assistente veterinario informativo. Rispondi SOLO in formato JSON valido.
Il tuo compito: spiegare al proprietario perché vede questo suggerimento di prodotto per il suo animale.
Sii professionale, empatico e conciso. Non dare consigli medici specifici.`;

    const userPrompt = `Pet: ${JSON.stringify(petSummary)}
Prodotto: ${promoItem?.name || "Prodotto"} (${promoItem?.category || "generico"})
Descrizione prodotto: ${promoItem?.extended_description || promoItem?.description || "N/A"}
Contesto: ${context || "generico"}

Rispondi con questo JSON:
{
  "why_you_see_this": "Breve spiegazione (max 2 frasi) del perché il proprietario vede questo suggerimento",
  "benefit_for_pet": "Beneficio specifico per questo animale (max 2 frasi) o null",
  "clinical_fit": "Correlazione clinica (max 1 frase) o null se non applicabile",
  "disclaimer": "Suggerimento informativo. Consulta il tuo veterinario prima di modificare la dieta o il regime di cura del tuo animale.",
  "confidence": "high|medium|low"
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        explanation: _fallbackExplanation(petName),
        source: "fallback",
        tokensCost: 0,
        latencyMs: Date.now() - startMs,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;

    // 5. Parse response
    let explanation;
    try {
      // Try to extract JSON from response
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        explanation = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
      } else {
        throw new Error("no JSON found");
      }

      // Validate required fields
      if (!explanation.why_you_see_this) {
        throw new Error("missing why_you_see_this");
      }
      if (!explanation.disclaimer) {
        explanation.disclaimer =
          "Suggerimento informativo. Consulta il tuo veterinario prima di modificare la dieta o il regime di cura del tuo animale.";
      }
      if (!["high", "medium", "low"].includes(explanation.confidence)) {
        explanation.confidence = "low";
      }
    } catch (_parseErr) {
      serverLog('ERR', 'EXPLAIN', 'parse fail', {itemId, error: _parseErr.message});
      explanation = _fallbackExplanation(petName);
      // Still save in cache to avoid repeated bad calls
    }

    // 6. Save in cache
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await pool.query(
        `INSERT INTO explanation_cache (cache_key, explanation, model, tokens_used, latency_ms, expires_at)
         VALUES ($1, $2, 'gpt-4o-mini', $3, $4, $5)
         ON CONFLICT (cache_key) DO UPDATE SET
           explanation = $2, tokens_used = $3, latency_ms = $4, expires_at = $5, created_at = NOW()`,
        [cacheKey, JSON.stringify(explanation), tokensUsed, Date.now() - startMs, expiresAt]
      );
    } catch (_e) {
      // cache write failed, non-critical
    }

    // 7. Increment budget
    if (tenantId) {
      try {
        await pool.query(
          `UPDATE tenant_budgets SET current_usage = current_usage + 1, updated_at = NOW()
           WHERE tenant_id = $1`,
          [tenantId]
        );
      } catch (_e) {
        // budget increment failed, non-critical
      }
    }

    serverLog('INFO', 'EXPLAIN', 'OpenAI done', {source: 'openai', latencyMs: Date.now() - startMs, tokensUsed, confidence: (explanation && explanation.confidence) || null});
    return {
      explanation,
      source: "openai",
      tokensCost: tokensUsed,
      latencyMs: Date.now() - startMs,
    };
  } catch (e) {
    // Timeout or network error
    serverLog('ERR', 'EXPLAIN', 'timeout', {error: e.message, isAbort: e.name === 'AbortError', latencyMs: Date.now() - startMs});
    return {
      explanation: _fallbackExplanation(petName),
      source: "fallback",
      tokensCost: 0,
      latencyMs: Date.now() - startMs,
    };
  }
}

function _fallbackExplanation(petName) {
  return {
    why_you_see_this: `Selezionato in base al profilo di ${petName}.`,
    benefit_for_pet: null,
    clinical_fit: null,
    disclaimer:
      "Suggerimento informativo. Consulta il tuo veterinario prima di modificare la dieta o il regime di cura del tuo animale.",
    confidence: "low",
  };
}

function _computeAge(birthdate) {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (isNaN(bd.getTime())) return null;
  const ageMs = Date.now() - bd.getTime();
  const years = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor(
    (ageMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000)
  );
  if (years < 1) return `${months} mesi`;
  if (months === 0) return `${years} anni`;
  return `${years} anni e ${months} mesi`;
}

function _computeSize(weightKg, species) {
  if (!weightKg) return null;
  const s = (species || "").toLowerCase();
  if (s !== "cane" && s !== "dog") return null;
  const w = Number(weightKg);
  if (w < 10) return "piccola";
  if (w < 25) return "media";
  return "grande";
}

module.exports = { generateExplanation };
