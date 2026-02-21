-- 025_vet_knowledge_base.sql
-- Veterinary Knowledge Base with pgvector for RAG

-- Step 1: Enable pgvector extension (Neon.tech supporta pgvector nativamente)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Tabella libri/documenti caricati
CREATE TABLE IF NOT EXISTS vet_knowledge_books (
    book_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author TEXT,
    isbn TEXT,
    edition TEXT,
    publisher TEXT,
    year_published INTEGER,
    language TEXT DEFAULT 'it',
    category TEXT DEFAULT 'general',
    description TEXT,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT,
    total_pages INTEGER,
    total_chunks INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'pending',
    processing_error TEXT,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    uploaded_by UUID,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Tabella chunk con embedding vettoriale
CREATE TABLE IF NOT EXISTS vet_knowledge_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES vet_knowledge_books(book_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chapter_title TEXT,
    section_title TEXT,
    page_start INTEGER,
    page_end INTEGER,
    chunk_text TEXT NOT NULL,
    chunk_tokens INTEGER,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Indici per performance
CREATE INDEX IF NOT EXISTS idx_chunks_book_id ON vet_knowledge_chunks(book_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON vet_knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON vet_knowledge_chunks USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_books_category ON vet_knowledge_books(category);
CREATE INDEX IF NOT EXISTS idx_books_enabled ON vet_knowledge_books(enabled);
CREATE INDEX IF NOT EXISTS idx_books_status ON vet_knowledge_books(processing_status);

-- Step 5: Tabella log query RAG (per analytics e ottimizzazione)
CREATE TABLE IF NOT EXISTS vet_knowledge_query_log (
    query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    query_embedding vector(1536),
    source_service TEXT NOT NULL,
    chunks_returned INTEGER,
    top_chunk_similarity REAL,
    avg_chunk_similarity REAL,
    latency_ms INTEGER,
    pet_id UUID,
    tenant_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_log_source ON vet_knowledge_query_log(source_service);
CREATE INDEX IF NOT EXISTS idx_query_log_created ON vet_knowledge_query_log(created_at);

-- Step 6: Tabella categorie personalizzate
CREATE TABLE IF NOT EXISTS vet_knowledge_categories (
    category_key TEXT PRIMARY KEY,
    label_it TEXT NOT NULL,
    label_en TEXT,
    icon TEXT DEFAULT '📚',
    sort_order INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed categorie
INSERT INTO vet_knowledge_categories (category_key, label_it, label_en, icon, sort_order) VALUES
    ('general', 'Medicina Generale', 'General Medicine', '📚', 10),
    ('nutrition', 'Nutrizione', 'Nutrition', '🥗', 20),
    ('surgery', 'Chirurgia', 'Surgery', '🔪', 30),
    ('dermatology', 'Dermatologia', 'Dermatology', '🧴', 40),
    ('cardiology', 'Cardiologia', 'Cardiology', '❤️', 50),
    ('oncology', 'Oncologia', 'Oncology', '🔬', 60),
    ('neurology', 'Neurologia', 'Neurology', '🧠', 70),
    ('orthopedics', 'Ortopedia', 'Orthopedics', '🦴', 80),
    ('internal_medicine', 'Medicina Interna', 'Internal Medicine', '🩺', 90),
    ('emergency', 'Emergenza e Terapia Intensiva', 'Emergency & Critical Care', '🚨', 100),
    ('pharmacology', 'Farmacologia', 'Pharmacology', '💊', 110),
    ('radiology', 'Diagnostica per Immagini', 'Radiology', '📡', 120),
    ('pathology', 'Patologia', 'Pathology', '🧫', 130),
    ('reproduction', 'Riproduzione', 'Reproduction', '🐣', 140),
    ('exotic', 'Animali Esotici', 'Exotic Animals', '🦎', 150),
    ('behavioral', 'Comportamento', 'Behavioral', '🧩', 160),
    ('ophthalmology', 'Oftalmologia', 'Ophthalmology', '👁️', 170),
    ('dentistry', 'Odontoiatria', 'Dentistry', '🦷', 180)
ON CONFLICT (category_key) DO NOTHING;
