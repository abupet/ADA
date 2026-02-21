-- sql/035_genetic_tests.sql
-- B2B Phase 4: Genetic testing catalog, orders, results

CREATE TABLE IF NOT EXISTS genetic_test_catalog (
    test_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    species TEXT NOT NULL DEFAULT 'dog',
    applicable_breeds JSONB DEFAULT '[]',
    description TEXT,
    what_it_detects TEXT,
    sample_type TEXT DEFAULT 'buccal_swab'
        CHECK (sample_type IN ('buccal_swab', 'blood', 'tissue')),
    turnaround_days INTEGER DEFAULT 14,
    price NUMERIC(8,2) NOT NULL DEFAULT 0,
    price_breeder NUMERIC(8,2),
    lab_partner TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genetic_catalog_species ON genetic_test_catalog(species, enabled);

INSERT INTO genetic_test_catalog (name, code, species, applicable_breeds, description, what_it_detects, price, price_breeder) VALUES
    ('Displasia Anca (HD)', 'HD', 'dog', '["Labrador Retriever","Golden Retriever","Pastore Tedesco","Rottweiler","Bulldog"]'::jsonb, 'Screening radiografico per displasia dell''anca', 'Gradi di displasia (A-E)', 150.00, 120.00),
    ('Displasia Gomito (ED)', 'ED', 'dog', '["Labrador Retriever","Golden Retriever","Rottweiler","Bovaro del Bernese"]'::jsonb, 'Screening radiografico per displasia del gomito', 'Gradi 0-3', 150.00, 120.00),
    ('Atrofia Retinica Progressiva (PRA)', 'PRA', 'dog', '["Labrador Retriever","Cocker Spaniel","Barboncino"]'::jsonb, 'Test DNA per PRA', 'Clear/Carrier/Affected', 85.00, 65.00),
    ('MDR1', 'MDR1', 'dog', '["Collie","Pastore Australiano","Shetland","Border Collie"]'::jsonb, 'Sensibilit farmacologica MDR1', 'Normal/Mutant (+/+ +/- -/-)', 75.00, 55.00),
    ('von Willebrand Tipo 1', 'VWD1', 'dog', '["Dobermann","Pastore Tedesco","Barboncino","Shetland"]'::jsonb, 'Malattia di von Willebrand tipo 1', 'Clear/Carrier/Affected', 80.00, 60.00),
    ('Mielopatia Degenerativa (DM)', 'DM', 'dog', '["Pastore Tedesco","Corgi","Boxer"]'::jsonb, 'Test DNA per DM', 'Clear/Carrier/At Risk', 80.00, 60.00),
    ('PKD (Rene Policistico)', 'PKD', 'cat', '["Persiano","Exotic Shorthair","British Shorthair"]'::jsonb, 'Test DNA per PKD', 'Negative/Positive', 70.00, 50.00),
    ('HCM (Cardiomiopatia Ipertrofica)', 'HCM', 'cat', '["Maine Coon","Ragdoll","British Shorthair"]'::jsonb, 'Test DNA per HCM', 'Negative/Heterozygous/Homozygous', 75.00, 55.00)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS genetic_test_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES genetic_test_catalog(test_id),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    ordered_by_user_id TEXT NOT NULL,
    ordered_by_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ordered'
        CHECK (status IN ('ordered', 'sample_sent', 'processing', 'completed', 'cancelled')),
    result_value TEXT,
    result_detail JSONB DEFAULT '{}',
    result_date TIMESTAMPTZ,
    lab_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genetic_orders_pet ON genetic_test_orders(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genetic_orders_user ON genetic_test_orders(ordered_by_user_id, status);
