// backend/src/seed-insurance.js
// Load Santevet insurance plans into promo_items
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

async function seedInsurancePlans(pool, tenantId) {
  const filePath = path.join(__dirname, 'seed-assets', 'santevet-insurance-seed.json');
  const plans = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  let loaded = 0;
  for (const plan of plans) {
    const tierSuffix = plan.insurance_data?.plan_tier || 'unknown';
    const speciesSuffix = (plan.species?.length === 1) ? '_' + plan.species[0] : '';
    const itemId = `ins_santevet_${tierSuffix}${speciesSuffix}_${randomUUID().slice(0, 4)}`;

    try {
      await pool.query(
        `INSERT INTO promo_items
          (promo_item_id, tenant_id, name, category, species, lifecycle_target,
           description, extended_description, image_url, product_url,
           tags_include, tags_exclude, priority, status, service_type, insurance_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published','{insurance}',$14)
         ON CONFLICT (promo_item_id) DO UPDATE SET
           name = EXCLUDED.name, insurance_data = EXCLUDED.insurance_data,
           description = EXCLUDED.description, extended_description = EXCLUDED.extended_description,
           updated_at = NOW()`,
        [
          itemId, tenantId, plan.name, plan.category,
          plan.species || [], plan.lifecycle_target || [],
          plan.description || null, plan.extended_description || null,
          plan.image_url || null, plan.product_url || null,
          plan.tags_include || [], plan.tags_exclude || [],
          plan.priority || 0, JSON.stringify(plan.insurance_data),
        ]
      );
      loaded++;
      console.log(`[seed-insurance] ${plan.name} (${itemId})`);
    } catch (err) {
      console.error(`[seed-insurance] ${plan.name}:`, err.message);
    }
  }

  console.log(`[seed-insurance] Done: ${loaded}/${plans.length} for tenant ${tenantId}`);
  return { loaded, total: plans.length };
}

module.exports = { seedInsurancePlans };
