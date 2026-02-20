-- 024_nutrition_nullable_tenant.sql
-- Allow nutrition_plans.tenant_id to be NULL (vet_int has no tenant in JWT)
ALTER TABLE nutrition_plans ALTER COLUMN tenant_id DROP NOT NULL;
