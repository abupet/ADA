-- 010_extended_desc_url_check.sql
-- Adds extended_description, URL validation tracking, and new clinical tags

-- 1. Extended description for AI matching
ALTER TABLE promo_items
  ADD COLUMN IF NOT EXISTS extended_description TEXT DEFAULT NULL;

COMMENT ON COLUMN promo_items.extended_description IS
  'Descrizione dettagliata del prodotto (max ~2000 char). Usata dal motore AI (explanation.service.js) per generare spiegazioni personalizzate. Non visibile al cliente finale.';

-- 2. URL validation tracking
ALTER TABLE promo_items
  ADD COLUMN IF NOT EXISTS url_check_status JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS url_last_checked_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN promo_items.url_check_status IS
  'Risultato ultima verifica URL. Formato: {"image_url_status":"ok|error_404|timeout|unreachable|missing","product_url_status":"..."}';

-- 3. New clinical tags
INSERT INTO tag_dictionary (tag, label, category, sensitivity, description) VALUES
  ('clinical:cardiac', 'Problemi cardiaci', 'clinical', 'high', 'Cardiac/heart issues'),
  ('clinical:endocrine', 'Problemi endocrini', 'clinical', 'high', 'Endocrine/metabolic issues (diabetes, thyroid)'),
  ('clinical:hepatic', 'Problemi epatici', 'clinical', 'high', 'Hepatic/liver issues')
ON CONFLICT (tag) DO NOTHING;
