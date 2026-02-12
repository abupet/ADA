-- sql/016_promo_image_cache.sql
-- Image cache BYTEA su promo_items per resilienza URL esterni

ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS image_cached BYTEA DEFAULT NULL;
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS image_cached_mime TEXT DEFAULT NULL;
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS image_cached_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS image_cached_hash TEXT DEFAULT NULL;

COMMENT ON COLUMN promo_items.image_cached IS
  'Copia BYTEA immagine prodotto. Servita da GET /api/promo-items/:id/image.';
COMMENT ON COLUMN promo_items.image_cached_mime IS
  'MIME type immagine cachata (image/jpeg, image/png, image/webp).';
