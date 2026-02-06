// backend/src/consent.service.js v1
// PR 2: Consent management service

/**
 * Consent hierarchy:
 *   marketing_global OFF -> everything disabled
 *   marketing_global ON + marketing_brand OFF for tenant X -> no promo from X
 *   clinical_tags OFF -> high-sensitivity tags excluded from matching
 *
 * Defaults for new owners: marketing_global=opted_in, clinical_tags=opted_out (prudent).
 */

/**
 * Get effective consent for an owner.
 * Returns { marketing_global, clinical_tags, brand_consents: { [tenantId]: status } }
 */
async function getEffectiveConsent(pool, ownerUserId) {
  const result = {
    marketing_global: "opted_in", // default
    clinical_tags: "opted_out", // default prudent
    brand_consents: {},
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
      } else if (row.consent_type === "marketing_brand") {
        result.brand_consents[row.scope] = row.status;
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

module.exports = {
  getEffectiveConsent,
  updateConsent,
  isMarketingAllowed,
  isClinicalTagsAllowed,
  getPendingConsents,
};
