// backend/src/consent.service.js v2
// PR 2: Consent management service
// v2: Multi-service consent (promo, nutrition, insurance)

/**
 * Consent hierarchy:
 *   marketing_global OFF -> everything disabled
 *   marketing_global ON + marketing_brand OFF for tenant X -> no promo from X
 *   clinical_tags OFF -> high-sensitivity tags excluded from matching
 *   nutrition_plan OFF -> nutrition plans not generated
 *   nutrition_brand OFF for tenant X -> no nutrition from X
 *   insurance_data_sharing OFF -> no insurance data shared
 *   insurance_brand OFF for tenant X -> no insurance from X
 *
 * Defaults for new owners: marketing_global=opted_in, clinical_tags=opted_out (prudent),
 *   nutrition_plan=opted_out, insurance_data_sharing=opted_out.
 */

/**
 * Get effective consent for an owner.
 * Returns { marketing_global, clinical_tags, nutrition_plan, nutrition_brand_consents,
 *           insurance_data_sharing, insurance_brand_consents, brand_consents }
 */
async function getEffectiveConsent(pool, ownerUserId) {
  const result = {
    marketing_global: "opted_in", // default
    clinical_tags: "opted_out", // default prudent
    nutrition_plan: "opted_out", // default prudent
    insurance_data_sharing: "opted_out", // default prudent
    brand_consents: {},
    nutrition_brand_consents: {},
    insurance_brand_consents: {},
  };

  try {
    const { rows } = await pool.query(
      "SELECT consent_type, scope, status FROM consents WHERE owner_user_id = $1",
      [ownerUserId]
    );

    for (const row of rows) {
      if (row.consent_type === "marketing_global" && row.scope === "global") {
        result.marketing_global = row.status;
      } else if (
        row.consent_type === "clinical_tags" &&
        row.scope === "global"
      ) {
        result.clinical_tags = row.status;
      } else if (row.consent_type === "nutrition_plan" && row.scope === "global") {
        result.nutrition_plan = row.status;
      } else if (row.consent_type === "insurance_data_sharing" && row.scope === "global") {
        result.insurance_data_sharing = row.status;
      } else if (row.consent_type === "marketing_brand") {
        result.brand_consents[row.scope] = row.status;
      } else if (row.consent_type === "nutrition_brand") {
        result.nutrition_brand_consents[row.scope] = row.status;
      } else if (row.consent_type === "insurance_brand") {
        result.insurance_brand_consents[row.scope] = row.status;
      }
    }
  } catch (e) {
    console.error("getEffectiveConsent error:", e.message);
  }

  return result;
}

/**
 * Update a consent status.
 * Returns the updated consent record.
 */
async function updateConsent(
  pool,
  ownerUserId,
  consentType,
  scope,
  newStatus,
  changedBy,
  ipAddress
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get old status for versioning (within transaction for consistency)
    let oldStatus = null;
    const { rows } = await client.query(
      "SELECT status FROM consents WHERE owner_user_id = $1 AND consent_type = $2 AND scope = $3 FOR UPDATE",
      [ownerUserId, consentType, scope]
    );
    if (rows[0]) oldStatus = rows[0].status;

    // Upsert consent
    await client.query(
      `INSERT INTO consents (owner_user_id, consent_type, scope, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (owner_user_id, consent_type, scope) DO UPDATE SET
         status = $4,
         updated_at = NOW()`,
      [ownerUserId, consentType, scope, newStatus]
    );

    // Audit trail
    await client.query(
      `INSERT INTO consent_versions (owner_user_id, consent_type, scope, old_status, new_status, changed_by, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ownerUserId, consentType, scope, oldStatus, newStatus, changedBy, ipAddress]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return { owner_user_id: ownerUserId, consent_type: consentType, scope, status: newStatus };
}

/**
 * Check if an owner has marketing consent for a specific tenant.
 */
function isMarketingAllowed(consent, tenantId) {
  if (consent.marketing_global !== "opted_in") return false;
  if (tenantId && consent.brand_consents[tenantId] === "opted_out") return false;
  if (tenantId && consent.brand_consents[tenantId] === "pending") return false;
  return true;
}

/**
 * Check if clinical (high-sensitivity) tags can be used in matching.
 */
function isClinicalTagsAllowed(consent) {
  return consent.clinical_tags === "opted_in";
}

/**
 * Get pending consents for an owner (new tenants requiring ack).
 */
async function getPendingConsents(pool, ownerUserId) {
  try {
    const { rows } = await pool.query(
      `SELECT consent_type, scope, status FROM consents
       WHERE owner_user_id = $1 AND status = 'pending'`,
      [ownerUserId]
    );
    return rows;
  } catch (e) {
    console.error("getPendingConsents error:", e.message);
    return [];
  }
}

/**
 * Check if nutrition service is allowed for a specific tenant.
 */
function isNutritionAllowed(consent, tenantId) {
  if (consent.nutrition_plan !== "opted_in") return false;
  if (tenantId && consent.nutrition_brand_consents[tenantId] === "opted_out") return false;
  if (tenantId && consent.nutrition_brand_consents[tenantId] === "pending") return false;
  return true;
}

/**
 * Check if insurance service is allowed for a specific tenant.
 */
function isInsuranceAllowed(consent, tenantId) {
  if (consent.insurance_data_sharing !== "opted_in") return false;
  if (tenantId && consent.insurance_brand_consents[tenantId] === "opted_out") return false;
  if (tenantId && consent.insurance_brand_consents[tenantId] === "pending") return false;
  return true;
}

module.exports = {
  getEffectiveConsent,
  updateConsent,
  isMarketingAllowed,
  isClinicalTagsAllowed,
  isNutritionAllowed,
  isInsuranceAllowed,
  getPendingConsents,
};
