-- 011_tips_sources_cache.sql
-- Tips & Tricks: Source pre-processing, caching & validation

CREATE TABLE IF NOT EXISTS tips_sources (
    source_id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    url               TEXT NOT NULL UNIQUE,
    domain            TEXT NOT NULL,
    display_name      TEXT,
    title             TEXT,
    summary_it        TEXT,
    key_topics        TEXT[] DEFAULT '{}',
    content_text      TEXT,
    content_hash      TEXT,
    language          TEXT DEFAULT 'en',
    http_status       INTEGER,
    is_available      BOOLEAN NOT NULL DEFAULT true,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    crawl_frequency   TEXT NOT NULL DEFAULT 'monthly',
    last_crawled_at   TIMESTAMPTZ,
    last_validated_at TIMESTAMPTZ,
    content_changed_at TIMESTAMPTZ,
    crawl_error       TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tips_sources_domain ON tips_sources(domain);
CREATE INDEX IF NOT EXISTS idx_tips_sources_active ON tips_sources(is_active, is_available);

CREATE TABLE IF NOT EXISTS tips_sources_crawl_log (
    log_id            SERIAL PRIMARY KEY,
    source_id         TEXT NOT NULL REFERENCES tips_sources(source_id) ON DELETE CASCADE,
    crawl_type        TEXT NOT NULL DEFAULT 'scheduled',
    http_status       INTEGER,
    content_hash      TEXT,
    content_changed   BOOLEAN DEFAULT false,
    summary_regenerated BOOLEAN DEFAULT false,
    error             TEXT,
    duration_ms       INTEGER,
    triggered_by      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tips_crawl_log_source ON tips_sources_crawl_log(source_id, created_at DESC);

-- Seed existing 16 sources
INSERT INTO tips_sources (url, domain, display_name, is_active, crawl_frequency) VALUES
    ('https://www.avma.org',          'avma.org',        'AVMA',          true, 'monthly'),
    ('https://www.aaha.org',          'aaha.org',        'AAHA',          true, 'monthly'),
    ('https://www.aspca.org',         'aspca.org',       'ASPCA',         true, 'monthly'),
    ('https://www.rspca.org.uk',      'rspca.org.uk',    'RSPCA',         true, 'monthly'),
    ('https://www.akc.org',           'akc.org',         'AKC',           true, 'monthly'),
    ('https://icatcare.org',          'icatcare.org',    'iCatCare',      true, 'monthly'),
    ('https://www.vet.cornell.edu',   'vet.cornell.edu', 'Cornell Vet',   true, 'monthly'),
    ('https://www.anicura.it',        'anicura.it',      'AniCura IT',    true, 'monthly'),
    ('https://www.enpa.org',          'enpa.org',        'ENPA',          true, 'monthly'),
    ('https://www.purina.it',         'purina.it',       'Purina IT',     true, 'monthly'),
    ('https://www.royalcanin.com/it', 'royalcanin.com',  'Royal Canin IT',true, 'monthly'),
    ('https://www.bluvet.it',         'bluvet.it',       'BluVet',        true, 'monthly'),
    ('https://www.fecava.org',        'fecava.org',      'FECAVA',        true, 'monthly'),
    ('https://www.enci.it',           'enci.it',         'ENCI',          true, 'monthly'),
    ('https://www.anmvi.it',          'anmvi.it',        'ANMVI',         true, 'monthly'),
    ('https://www.petmd.com',         'petmd.com',       'PetMD',         true, 'monthly')
ON CONFLICT (url) DO NOTHING;
