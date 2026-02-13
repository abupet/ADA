-- 017_service_type_array.sql
-- Convert service_type from TEXT to TEXT[] to allow multi-service products

-- 1. Add new array column
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{promo}';

-- 2. Migrate existing data: copy scalar → array
UPDATE promo_items SET service_types = ARRAY[service_type] WHERE service_type IS NOT NULL;

-- 3. Auto-assign nutrition to food/supplement products that are currently promo-only
UPDATE promo_items
SET service_types = service_types || '{nutrition}'::text[]
WHERE category IN ('food_clinical', 'food_general', 'supplement')
  AND NOT (service_types @> '{nutrition}')
  AND status = 'published';

-- 4. Drop old column and rename
ALTER TABLE promo_items DROP COLUMN IF EXISTS service_type;
ALTER TABLE promo_items RENAME COLUMN service_types TO service_type;

-- 5. Recreate index (GIN for array containment queries)
DROP INDEX IF EXISTS idx_promo_items_service_type;
CREATE INDEX idx_promo_items_service_type ON promo_items USING GIN (service_type);

-- 6. Same for promo_events (if it has service_type)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promo_events' AND column_name = 'service_type') THEN
    ALTER TABLE promo_events ADD COLUMN IF NOT EXISTS service_types_new TEXT[] DEFAULT '{promo}';
    UPDATE promo_events SET service_types_new = ARRAY[COALESCE(service_type, 'promo')];
    ALTER TABLE promo_events DROP COLUMN IF EXISTS service_type;
    ALTER TABLE promo_events RENAME COLUMN service_types_new TO service_type;
  END IF;
END $$;
